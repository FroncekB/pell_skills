// Which paths the agent may not touch, judged on canonical paths: resolved against
// the project directory and the working directory, with Windows tricks (case,
// trailing dots and spaces, :streams) removed and the deepest existing ancestor
// realpathed, so a junction or symlink cannot hide a target. Node standard
// library only.
import { realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function pathContext(over = {}) {
  const cwd = over.cwd ?? process.cwd();
  const windows = over.windows ?? process.platform === 'win32';
  return {
    cwd,
    projectDir: over.projectDir ?? cwd,
    home: over.home ?? os.homedir(),
    gitDir: over.gitDir ?? null,
    windows,
    caseInsensitive: over.caseInsensitive ?? (windows || process.platform === 'darwin'),
  };
}

function cleanComponent(component, ctx) {
  return ctx.windows ? component.replace(/:.*$/, '').replace(/[. ]+$/, '') : component;
}

// A canonical, forward-slash, lowercase-where-case-insensitive absolute path.
export function canonical(p, base, ctx) {
  let s = String(p).replace(/^\\\\\?\\/, '');
  if (s === '~' || /^~[\\/]/.test(s)) s = path.join(ctx.home, s.slice(1));
  // Git Bash names a drive as /c/...
  if (ctx.windows) s = s.replace(/^\/([A-Za-z])(\/|$)/, '$1:/');
  const parts = path.resolve(base, s).split(/[\\/]/);
  const root = parts.shift();
  const head = parts.map((c) => cleanComponent(c, ctx)).filter(Boolean);
  const tail = [];
  let real = null;
  for (;;) {
    try {
      real = realpathSync.native(`${root}/${head.join('/')}`);
      break;
    } catch {
      if (head.length === 0) break;
      tail.unshift(head.pop());
    }
  }
  let out = `${real ?? root}${tail.length ? `/${tail.join('/')}` : ''}`.replace(/\\/g, '/').replace(/\/+/g, '/');
  if (out.length > 1) out = out.replace(/\/$/, '');
  return ctx.caseInsensitive ? out.toLowerCase() : out;
}

const inside = (c, root) => c === root || c.startsWith(`${root}/`);

// The protected locations, canonical. Cached on the context.
function roots(ctx) {
  if (ctx.roots) return ctx.roots;
  const at = (p) => canonical(p, ctx.projectDir, ctx);
  const home = (...parts) => at(path.join(ctx.home, ...parts));
  ctx.roots = [
    at('.git'),
    at('.claude/repo-standup'),
    at('.claude/settings.local.json'),
    at('.claude/settings.json'),
    home('.claude', 'settings.json'),
    home('.claude', 'settings.local.json'),
    home('.gitconfig'),
    home('.config', 'git', 'config'),
  ];
  if (ctx.gitDir) ctx.roots.push(at(ctx.gitDir));
  return ctx.roots;
}

// The run's diff handoff: <git dir>/pell-*.diff, one level deep.
function isPellDiff(c, ctx) {
  const gitDirs = [canonical('.git', ctx.projectDir, ctx), ...(ctx.gitDir ? [canonical(ctx.gitDir, ctx.projectDir, ctx)] : [])];
  return gitDirs.some((g) => {
    const rest = c.startsWith(`${g}/`) ? c.slice(g.length + 1) : null;
    return rest !== null && /^pell-[^/]+\.diff$/.test(rest);
  });
}

function candidates(p, ctx) {
  return [...new Set([ctx.cwd, ctx.projectDir])].map((base) => canonical(p, base, ctx));
}

// True when writing, reading or naming `p` is not allowed.
export function isProtected(p, ctx) {
  for (const c of candidates(p, ctx)) {
    if (isPellDiff(c, ctx)) continue;
    const comps = c.split('/');
    if (comps.includes('.git')) return true;
    if (comps.some((comp, i) => comp === '.claude' && CLAUDE_PROTECTED.has(comps[i + 1]))) return true;
    if (roots(ctx).some((r) => inside(c, r))) return true;
  }
  return false;
}

// Matched by component anywhere in a path, so a relative path after a `cd` is caught.
const CLAUDE_PROTECTED = new Set(['repo-standup', 'settings.json', 'settings.local.json']);

// True when any path-like fragment of free text is protected: the whole-text
// scan for a nested code string, whatever words its shell would split it into.
export function namesProtectedPath(text, ctx) {
  return String(text)
    .split(/[\s"'`;&|<>()=,]+/)
    .filter((f) => /[\\/.~]/.test(f))
    .some((f) => isProtected(f, ctx) || mixesGlobWithDotFolder(f) || namesHomeGitConfig(f));
}

// True when `p` is a protected location or a folder holding one (so deleting or
// moving it would take a protected location with it).
export function containsProtected(p, ctx) {
  return candidates(p, ctx).some((c) => roots(ctx).some((r) => inside(r, c)));
}

// True when `p` is the .claude folder (project or home) or inside it.
export function insideClaudeDir(p, ctx) {
  const dirs = [canonical('.claude', ctx.projectDir, ctx), canonical(path.join(ctx.home, '.claude'), ctx.projectDir, ctx)];
  return candidates(p, ctx).some((c) => dirs.some((d) => inside(c, d)));
}

const DOT_FOLDERS = ['.git', '.claude'];

// True for a word whose glob or variable could expand to a protected folder name,
// as in `.gi?`, `.cl*` or `$d/.git`, or to a path inside one, as in `.claude/*/x`.
// Quotes are ignored: PowerShell cmdlets expand wildcards in quoted paths.
export function mixesGlobWithDotFolder(raw) {
  let dynamicBefore = false;
  let folderBefore = false;
  for (const comp of String(raw).replace(/["']/g, '').split(/[\\/]/)) {
    const dynamic = /[*?[\]$%{}]/.test(comp);
    const folder = DOT_FOLDERS.includes(comp.toLowerCase());
    if ((dynamicBefore && folder) || (folderBefore && dynamic)) return true;
    dynamicBefore ||= dynamic;
    folderBefore ||= folder;
    if (dynamic && comp.startsWith('.') && comp.length > 1) {
      try {
        const pattern = new RegExp(
          `^${comp.replace(/[.+^|\\()]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.').replace(/\$|%|\{|\}/g, '.*')}$`,
          'i',
        );
        if (DOT_FOLDERS.some((name) => pattern.test(name))) return true;
      } catch {
        return true;
      }
    }
  }
  return false;
}

// True for a word that names the home git config through a variable or ~, as in
// `$HOME/.gitconfig`, `$env:USERPROFILE\.gitconfig` or `$XDG_CONFIG_HOME/git/config`.
export function namesHomeGitConfig(raw) {
  const s = String(raw).replace(/["']/g, '');
  if (!/[$%~]/.test(s)) return false;
  const comps = s.toLowerCase().split(/[\\/]/);
  return comps.includes('.gitconfig') ||
    comps.some((c, i) => i > 0 && c === 'git' && comps[i + 1] === 'config' && (comps[i - 1] === '.config' || /[$%]/.test(comps[i - 1])));
}
