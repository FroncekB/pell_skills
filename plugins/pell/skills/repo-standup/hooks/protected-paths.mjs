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
    if (comps.some((comp, i) => comp === '.claude' && comps[i + 1] === 'repo-standup')) return true;
    if (roots(ctx).some((r) => inside(c, r))) return true;
  }
  return false;
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

// True for a word whose glob or variable could expand to a protected folder name,
// as in `.gi?`, `.cl*` or `$d/.git`.
export function mixesGlobWithDotFolder(raw) {
  let dynamicBefore = false;
  for (const comp of String(raw).split(/[\\/]/)) {
    const dynamic = /[*?[\]$%{}]/.test(comp);
    if (dynamicBefore && ['.git', '.claude'].includes(comp.toLowerCase())) return true;
    if (dynamic && comp.startsWith('.') && comp.length > 1) {
      try {
        const pattern = new RegExp(
          `^${comp.replace(/[.+^|\\()]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.').replace(/\$|%|\{|\}/g, '.*')}$`,
          'i',
        );
        if (['.git', '.claude'].some((name) => pattern.test(name))) return true;
      } catch {
        return true;
      }
    }
    dynamicBefore ||= dynamic;
  }
  return false;
}
