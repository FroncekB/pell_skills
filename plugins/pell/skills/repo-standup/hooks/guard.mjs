// PreToolUse hook: deny any `git push` that is not "push only to the client
// repo's main, never forced". It recognizes one push shape and denies anything
// else that might push. It is aimed at an agent's mistakes and plausible
// workarounds, not at an adversary: the only complete enforcement is Bitbucket's
// branch restrictions. Node standard library only.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  containsProtected, insideClaudeDir, isProtected, mixesGlobWithDotFolder, namesHomeGitConfig, namesProtectedPath,
  pathContext,
} from './protected-paths.mjs';
import {
  commandName, nestedCode, parseShell, stripPsAssignment, stripRedirections, stripWrappers,
} from './shell-words.mjs';

export const PREFIX = 'repo-standup guard: ';
export const FRAMEWORK_REPO = 'pellsoftware/pell_web_app_framework';
const CANARY = 'repo-standup-guard-check';
const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);
// Tool input fields holding a path; `paths` holds an array of them. No other field
// is read: agent prompts name .git/pell-repo-standup.diff on purpose.
const PATH_FIELDS = ['file_path', 'path', 'notebook_path', 'source', 'destination', 'target'];
const deny = (why) => ({ allow: false, reason: PREFIX + why });

// git subcommands that run no alias. Anything else may be an alias for push.
// `clean` is left out on purpose: it deletes the ignored guard files.
const BUILTINS = new Set([
  'add', 'am', 'apply', 'archive', 'bisect', 'blame', 'branch', 'bundle', 'cat-file', 'check-ignore',
  'checkout', 'cherry-pick', 'clone', 'commit', 'commit-tree', 'config', 'describe', 'diff',
  'diff-tree', 'fetch', 'for-each-ref', 'format-patch', 'fsck', 'gc', 'grep', 'hash-object', 'help',
  'init', 'log', 'ls-files', 'ls-remote', 'ls-tree', 'maintenance', 'merge', 'merge-base', 'mv',
  'name-rev', 'notes', 'pull', 'push', 'read-tree', 'rebase', 'reflog', 'remote', 'reset', 'restore',
  'rev-list', 'rev-parse', 'revert', 'rm', 'shortlog', 'show', 'show-ref', 'sparse-checkout', 'stash',
  'status', 'submodule', 'switch', 'symbolic-ref', 'tag', 'update-ref', 'version', 'worktree',
  'write-tree',
]);

const PUSH_OPTIONS = new Set([
  '-u', '--set-upstream', '-q', '--quiet', '-v', '--verbose', '--porcelain', '--progress', '--no-progress',
]);

// Long options that run a program or set config, for every subcommand and per
// subcommand. git accepts an unambiguous prefix of any length, so any prefix matches.
const RUNNER_OPTIONS = ['--upload-pack', '--receive-pack', '--exec'];
const SUB_RUNNER_OPTIONS = { grep: ['--open-files-in-pager'], clone: ['--config'], init: ['--config'], submodule: ['--config'] };
// Short option letters, per subcommand, that run a program or set config.
const RUNNER_LETTERS = { rebase: 'x', clone: 'uc', 'ls-remote': 'u', grep: 'O', init: 'c', submodule: 'c' };

// git config keys that may be written. Every other write is denied.
const SAFE_CONFIG_KEYS =
  /^(user\.(name|email)|core\.(autocrlf|longpaths|eol|filemode|ignorecase)|pull\.(rebase|ff)|init\.defaultbranch|fetch\.prune|commit\.gpgsign|rerere\.enabled|merge\.ff)$/;
const CONFIG_READ_FLAGS = new Set([
  '--get', '--get-all', '--get-regexp', '--get-urlmatch', '-l', '--list', '--get-color', '--get-colorbool',
  '--show-origin', '--show-scope', '--name-only', '-h', '--help',
]);
const CONFIG_WRITE_FLAGS = new Set(['--add', '--unset', '--unset-all', '--replace-all']);

// Programs that run another command line from a string or from their arguments.
const WRAPPER = /(^|[\s\\/])(env|xargs|bash|sh|zsh|ksh|dash|cmd|pwsh|powershell|node|python3?|ruby|perl|sudo|time|nohup|command|exec|eval|iex|invoke-expression|start|start-process|call|nice|timeout|watch|source)(\.exe)?(\s|$)/i;
const INTERPRETERS = new Set(['sh', 'bash', 'zsh', 'ksh', 'dash', 'pwsh', 'powershell', 'cmd', 'iex', 'invoke-expression']);
const ALWAYS_DENIED_COMMANDS = new Set(['iex', 'invoke-expression', 'eval']);
const CODE_FLAGS = {
  node: ['-e', '-p', '--eval', '--print'], nodejs: ['-e', '-p', '--eval', '--print'],
  python: ['-c'], python3: ['-c'], perl: ['-e', '-E'], ruby: ['-e'],
};
const SPAWNING_CODE = /git|push|child_process|spawn|exec|subprocess|system/i;

// Words that precede a command without being one.
const KEYWORDS = new Set(['!', 'then', 'do', 'else', 'elif', 'elseif', 'time', 'if', 'while', 'until']);
// PowerShell if/elseif conditions that only test the last command's success.
const SUCCESS_CONDITION = /^(-not )?\$\?$|^\$lastexitcode -(eq|ne) 0$/i;
// A command line naming the .git or .claude folder, for xargs deletes.
const NAMES_DOT_FOLDER = /(^|[^\w.-])\.(git|claude)(?![\w.-])/i;
const DELETE_VERBS = new Set([
  'rm', 'rmdir', 'del', 'erase', 'rd', 'remove-item', 'ri', 'unlink',
  'mv', 'move', 'move-item', 'mi', 'ren', 'rename', 'rename-item', 'rni',
]);
const CD_VERBS = new Set(['cd', 'chdir', 'pushd', 'push-location', 'set-location', 'sl']);
const LINK_VERBS = new Set(['ln', 'mklink']);

// Quotes, backslashes, backticks and ^ vanish before a program sees its arguments.
const normalize = (text) => text.replace(/["'\\`^]/g, '');
const namesPush = (text) => /\bpush\b/i.test(normalize(text));
const namesGit = (text) => /\bgit(\.exe)?\b/i.test(normalize(text));
const stripKeywords = (words) => {
  let at = 0;
  while (at < words.length && KEYWORDS.has(words[at].raw)) at += 1;
  return words.slice(at);
};

// Paths a word may name: itself, what follows `=` (--output=PATH) or an option's
// `:` (-Path:PATH), and what follows a redirection operator, at the start or inside.
function pathCandidates(word) {
  const v = word.value;
  const eq = v.indexOf('=');
  const option = v.startsWith('-') && eq > -1;
  const redirected = v.replace(/^[0-9*]*>>?/, '').replace(/^</, '');
  const colon = v.startsWith('-') ? v.indexOf(':') : -1;
  const found = [
    option ? '' : v, eq > -1 ? v.slice(eq + 1) : '', option && redirected === v ? '' : redirected,
    colon > -1 ? v.slice(colon + 1) : '', /[<>]/.test(v) ? v.split(/[<>]/).pop() : '',
  ];
  return [...new Set(found)].filter((s) => s && /[\\/.~]/.test(s));
}

// Segment-level path rules: protected paths, globs, deletes, cd and links.
// `line` is the whole command line.
function checkPaths(seg, ctx, line) {
  const words = seg.words;
  for (const w of words) {
    if (mixesGlobWithDotFolder(w.raw)) return deny('a glob or variable could name a protected folder');
    if (namesHomeGitConfig(w.raw)) return deny('the home git config is a protected path');
    for (const p of pathCandidates(w)) {
      if (isProtected(p, ctx)) return deny(`${p} is a protected path (.git, the guard's files, or a settings file)`);
    }
  }
  const plain = stripKeywords(stripRedirections(words));
  const unwrapped = stripWrappers((stripPsAssignment(plain) ?? plain).filter((w) => !/^[A-Za-z_]\w*=/.test(w.raw)));
  const command = unwrapped.words;
  if (command.length === 0) return null;
  const name = commandName(command[0].value);
  const args = command.slice(1).flatMap(pathCandidates);
  if (DELETE_VERBS.has(name) && args.some((p) => containsProtected(p, ctx))) {
    return deny('deleting or moving a folder that holds a protected path is not allowed');
  }
  if (DELETE_VERBS.has(name) && unwrapped.wrappers.includes('xargs') && NAMES_DOT_FOLDER.test(line)) {
    return deny('xargs runs a delete or move on a line that names .git or .claude');
  }
  if (CD_VERBS.has(name) && args.some((p) => insideClaudeDir(p, ctx))) return deny('entering the .claude folder is not allowed');
  if (LINK_VERBS.has(name)) return deny('creating links is not allowed');
  if ((name === 'new-item' || name === 'ni') && /symboliclink|junction|hardlink/i.test(command.map((w) => w.raw).join(' '))) {
    return deny('creating links is not allowed');
  }
  return null;
}

// The checks for a git subcommand other than push.
function checkRunners(sub, args) {
  const values = args.map((a) => a.value);
  const runners = [...RUNNER_OPTIONS, ...(SUB_RUNNER_OPTIONS[sub] ?? [])];
  for (const v of values) {
    const name = v.split('=')[0];
    if (v.startsWith('--') && name.length > 2 && runners.some((o) => o.startsWith(name))) {
      return deny(`git ${sub} option ${name} runs a program or sets config`);
    }
    const letters = /^-([A-Za-z]+)/.exec(v)?.[1] ?? '';
    if (!v.startsWith('--') && [...letters].some((l) => (RUNNER_LETTERS[sub] ?? '').includes(l))) {
      return deny(`git ${sub} -${letters} runs a program or sets config`);
    }
  }
  if (sub === 'submodule' && values.includes('foreach')) return deny('git submodule foreach runs a command');
  if (sub === 'bisect' && values.includes('run')) return deny('git bisect run runs a command');
  if (sub === 'config') return checkConfig(values);
  return null;
}

function checkConfig(values) {
  const writeCheck = (key) =>
    key && SAFE_CONFIG_KEYS.test(key.toLowerCase()) ? null : deny(`git config may not write ${key ?? 'that key'}`);
  // The newer subcommand syntax: git config get|list|set|unset|edit|...
  const [first] = values;
  if (first === 'get' || first === 'list') return null;
  if (first === 'set' || first === 'unset') return writeCheck(values.slice(1).find((v) => !v.startsWith('-')));
  if (['edit', 'rename-section', 'remove-section'].includes(first)) return deny('this git config form is not allowed');

  if (values.some((v) => ['-e', '--edit', '-f', '--blob', '--rename-section', '--remove-section'].includes(v) || v.startsWith('--file'))) {
    return deny('this git config form is not allowed');
  }
  if (values.some((v) => CONFIG_READ_FLAGS.has(v))) return null;
  const keys = values.filter((v) => !v.startsWith('-'));
  const writes = keys.length > 1 || values.some((v) => CONFIG_WRITE_FLAGS.has(v));
  return writes ? writeCheck(keys[0]) : null;
}

// Judge one segment. Returns { allow: false, reason }, { push } for a push
// segment, or null for a harmless one.
function judgeSegment(seg, env) {
  if (seg.dynamicCall) return deny('dynamic execution: & followed by a variable or expression');
  let words = stripKeywords(stripRedirections(seg.words));
  if (words.length === 0) return null;
  const text = words.map((w) => w.raw).join(' ');
  if (seg.condition && SUCCESS_CONDITION.test(text)) return null;
  // A heredoc body is stdin, not words, but it still counts as naming push.
  const heredocs = seg.words.map((w) => w.heredoc ?? '').join('\n');
  const pushNamed = namesPush(text) || namesPush(heredocs);
  const gitNamed = namesGit(text);
  const stdinCode = seg.piped || seg.words.some((w) => /^[0-9]*</.test(w.raw));

  let assigns = 0;
  while (assigns < words.length && /^[A-Za-z_]\w*=/.test(words[assigns].raw)) assigns += 1;
  if (assigns > 0) {
    if (assigns === words.length) return null;
    if (pushNamed || gitNamed) return deny('an environment assignment before a command that names git or push');
    words = words.slice(assigns);
  }

  // PowerShell assignment: judge what follows the `=` as the command.
  const assigned = stripPsAssignment(words);
  if (assigned) return assigned.length > 0 ? judgeSegment({ words: assigned, piped: seg.piped, dynamicCall: false }, env) : null;

  const unwrapped = stripWrappers(words);
  if (unwrapped.problem) return deny(unwrapped.problem);
  if (unwrapped.wrapped) {
    if (unwrapped.words.length === 0) return null;
    if (gitNamed) return deny('a wrapper runs git');
    words = unwrapped.words;
  }
  if (/[$%]/.test(words[0].raw)) return deny('the command word is a variable or expression');
  const name = commandName(words[0].value);
  if (ALWAYS_DENIED_COMMANDS.has(name)) return deny(`${name} evaluates text as code`);
  if (stdinCode && INTERPRETERS.has(name)) return deny('a pipe, redirect or substitution into an interpreter runs text as code');

  if (name !== 'git') {
    const nested = nestedCode(name, words, env.tool);
    if (nested?.deny) return deny(nested.deny);
    if (pushNamed) return deny('a program other than git names push');
    if (nested) {
      const inner = decide(nested.tool, nested.code, env.repo);
      if (!inner.allow) return inner;
      if (namesProtectedPath(nested.code, env.ctx)) return deny('the code string names a protected path');
      if (namesGit(nested.outer.map((w) => w.raw).join(' '))) return deny('a wrapper runs git');
      return null;
    }
    const codeFlag = CODE_FLAGS[name]?.some((f) => words.some((w) => w.raw === f));
    if ((codeFlag || (CODE_FLAGS[name] && stdinCode)) && SPAWNING_CODE.test(`${normalize(text)}\n${heredocs}`)) {
      return deny(`${name} code that names git, push or process spawning is not allowed`);
    }
    if (gitNamed && WRAPPER.test(normalize(text))) return deny('a wrapper runs git');
    return null;
  }

  let at = 1;
  const dirs = [];
  while (at < words.length && words[at].raw.startsWith('-')) {
    if (words[at].raw === '-C' && words[at + 1]) {
      dirs.push(words[at + 1]);
      at += 2;
    } else if (at === words.length - 1 && ['--version', '--help'].includes(words[at].raw)) {
      return null;
    } else {
      return deny(`git global option ${words[at].raw} is not allowed`);
    }
  }
  if (at >= words.length) return pushNamed ? deny('git names push without a subcommand') : null;

  const sub = words[at];
  if (!/^[a-z0-9-]+$/.test(sub.raw) || !BUILTINS.has(sub.raw)) return deny(`git subcommand "${sub.raw}" is not a plain builtin`);
  if (sub.raw !== 'push') return checkRunners(sub.raw, words.slice(at + 1));
  return { push: { words, at, dirs } };
}

// Check a push segment's shape. Returns { dir } or { deny }.
function checkPushShape({ words, at, dirs }) {
  if (dirs.length > 1) return { deny: deny('git push with several -C options cannot be checked') };
  let dir = '.';
  if (dirs.length === 1) {
    const d = dirs[0];
    const quoted = /^["']/.test(d.raw);
    if (!d.value || d.value.startsWith('-') || /[$%{}*?[\]~`]/.test(d.value) || (!quoted && /\\/.test(d.raw))) {
      return { deny: deny('the -C folder is not a literal path') };
    }
    dir = d.value;
  }
  const options = [];
  const positionals = [];
  for (const arg of words.slice(at + 1)) {
    if (!/^[A-Za-z0-9:_-]+$/.test(arg.raw)) return { deny: deny(`push argument "${arg.raw}" is not plain text`) };
    (arg.raw.startsWith('-') ? options : positionals).push(arg.raw);
  }
  const badOption = options.find((o) => !PUSH_OPTIONS.has(o));
  if (badOption) return { deny: deny(`push option ${badOption} is not allowed`) };
  const [remote, refspec, ...rest] = positionals;
  if (remote !== 'origin' || !['main', 'main:main'].includes(refspec) || rest.length > 0) {
    return { deny: deny('only "git push origin main" is allowed') };
  }
  return { dir };
}

export function repoFromUrl(url) {
  const m =
    /^git@(?:ssh\.)?bitbucket\.org:(.+?)(?:\.git)?\/?$/i.exec(url) ||
    /^https?:\/\/(?:[^@/]+@)?bitbucket\.org\/(.+?)(?:\.git)?\/?$/i.exec(url);
  return m ? m[1].toLowerCase() : null;
}

// `command` is the shell command line for Bash and PowerShell, and a file path
// for any other tool (Edit, Write, NotebookEdit, MultiEdit, a tool not yet invented).
export function decide(toolName, command, repo) {
  const ctx = repo.pathContext ? repo.pathContext() : pathContext();
  if (!SHELL_TOOLS.has(toolName)) {
    return isProtected(String(command ?? ''), ctx)
      ? deny('this path (.git, the guard\'s files, or a settings file) is protected')
      : { allow: true };
  }

  const powershell = toolName === 'PowerShell';
  const text = powershell
    ? String(command ?? '').replace(/[\u201C\u201D\u201E\u201F]/g, '"').replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    : String(command ?? '');
  const flat = normalize(text);
  if (text.includes(CANARY) && namesPush(text)) return deny('canary');
  if (/--no-verify|core\.hookspath/i.test(flat)) return deny('--no-verify and core.hooksPath are not allowed');

  const { segments, problems, fatal } = parseShell(text, powershell ? 'powershell' : 'bash');
  if (fatal.length > 0) return deny(`cannot judge the command (${fatal[0]})`);
  if (problems.length > 0 && /\b(git|push)\b/i.test(flat)) {
    return deny(`cannot classify the command (${problems[0]}), and it names git or push`);
  }

  const env = { tool: toolName, repo, ctx };
  for (const segment of segments) {
    const pathVerdict = checkPaths(segment, ctx, text);
    if (pathVerdict) return pathVerdict;
    const verdict = judgeSegment(segment, env);
    if (!verdict) continue;
    if (verdict.allow === false) return verdict;

    const shape = checkPushShape(verdict.push);
    if (shape.deny) return shape.deny;
    if (segments.length !== 1) return deny('a push must be the only command, with no cd, env or other command around it');

    const client = repo.clientRepo ? repo.clientRepo.toLowerCase() : null;
    if (!client) return deny('no pinned client repo in .claude/repo-standup/client-repo');
    const urls = repo.pushUrlsFor(shape.dir);
    if (urls.length === 0) return deny('origin has no push URL');
    for (const url of urls) {
      const name = repoFromUrl(url);
      if (name === FRAMEWORK_REPO) return deny('origin is the framework repo');
      if (name !== client) return deny(`a push URL of origin is not the client repo (${client})`);
    }
    const config = repo.pushConfigFor(shape.dir);
    if (config.push.length > 0) return deny('remote.origin.push is set');
    if (config.mirror) return deny('remote.origin.mirror is set');
    if (config.submodules) return deny('the repo has submodules, which a push could recurse into');
  }
  return { allow: true };
}

function runGit(cwd, args) {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  if (r.error) throw r.error;
  return { status: r.status, lines: r.stdout.split(/\r?\n/).filter(Boolean) };
}

// The client repo as setup pinned it, from .claude/repo-standup/client-repo.
// Never from client.yaml, which the agent can edit.
export function readClientRepo(projectDir) {
  try {
    const line = readFileSync(path.join(projectDir, '.claude', 'repo-standup', 'client-repo'), 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find(Boolean);
    return line || null;
  } catch {
    return null;
  }
}

// True when this module is the script being run, even through a junction or symlink.
export function runsDirectly(metaUrl) {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(metaUrl)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

function denyOutput(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  );
}

// Builds the real repo lookups. Each throws when git cannot answer, which the
// caller turns into a deny.
function realRepo(cwd) {
  const at = (dir) => path.resolve(cwd, dir || '.');
  const config = (where, key, extra = []) => {
    const r = runGit(where, ['config', ...extra, '--get-all', key]);
    if (r.status !== 0 && r.status !== 1) throw new Error('git config failed');
    return r.lines;
  };
  const projectDir = () => process.env.CLAUDE_PROJECT_DIR || runGit(cwd, ['rev-parse', '--show-toplevel']).lines[0];
  return {
    pathContext() {
      let gitDir = null;
      try {
        gitDir = runGit(cwd, ['rev-parse', '--absolute-git-dir']).lines[0] ?? null;
      } catch {
        // No git dir to exempt; the project's .git is still protected.
      }
      return pathContext({ cwd, projectDir: projectDir() || cwd, gitDir });
    },
    get clientRepo() {
      const top = projectDir();
      return top ? readClientRepo(top) : null;
    },
    pushUrlsFor(dir) {
      const r = runGit(at(dir), ['remote', 'get-url', '--push', '--all', 'origin']);
      if (r.status !== 0) throw new Error('git remote get-url failed');
      return r.lines;
    },
    pushConfigFor(dir) {
      const where = at(dir);
      const top = runGit(where, ['rev-parse', '--show-toplevel']).lines[0];
      const recursing = ['push.recurseSubmodules', 'submodule.recurse']
        .flatMap((key) => config(where, key))
        .some((v) => !['false', 'no', 'check', 'off', '0'].includes(v.toLowerCase()));
      return {
        push: config(where, 'remote.origin.push'),
        mirror: config(where, 'remote.origin.mirror', ['--type=bool']).includes('true'),
        submodules: recursing || Boolean(top && existsSync(path.join(top, '.gitmodules'))),
      };
    },
  };
}

function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    denyOutput(`${PREFIX}the hook input did not parse`);
    return;
  }
  const tool = input?.tool_name;
  const toolInput = input?.tool_input && typeof input.tool_input === 'object' ? input.tool_input : {};
  const shell = SHELL_TOOLS.has(tool);
  const targets = shell
    ? [toolInput.command]
    : [...PATH_FIELDS.map((f) => toolInput[f]), ...[toolInput.paths ?? []].flat()].filter((v) => typeof v === 'string');
  if (!shell && targets.length === 0) return;
  if (shell && typeof targets[0] !== 'string') {
    denyOutput(`${PREFIX}the tool call has no command to judge`);
    return;
  }
  try {
    const repo = realRepo(path.resolve(input.cwd || '.'));
    for (const target of targets) {
      const result = decide(tool, target, repo);
      if (!result.allow) {
        denyOutput(result.reason);
        return;
      }
    }
  } catch (error) {
    if (!shell || /\b(git|push)\b/i.test(normalize(targets[0]))) {
      denyOutput(`${PREFIX}internal error while judging the call (${error.message})`);
    }
  }
}

if (runsDirectly(import.meta.url)) main();
