// PreToolUse hook: deny any `git push` that is not "push only to the client
// repo's main, never forced". It recognizes one push shape and denies anything
// else that might push. It is aimed at an agent's mistakes and plausible
// workarounds, not at an adversary: the only complete enforcement is Bitbucket's
// branch restrictions. Node standard library only.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseShell, stripRedirections } from './shell-words.mjs';

export const PREFIX = 'repo-standup guard: ';
export const FRAMEWORK_REPO = 'pellsoftware/pell_web_app_framework';
const CANARY = 'repo-standup-guard-check';
const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit']);
const deny = (why) => ({ allow: false, reason: PREFIX + why });

// git subcommands that run no alias. Anything else may be an alias for push.
const BUILTINS = new Set([
  'add', 'am', 'apply', 'archive', 'bisect', 'blame', 'branch', 'bundle', 'cat-file', 'check-ignore',
  'checkout', 'cherry-pick', 'clean', 'clone', 'commit', 'commit-tree', 'config', 'describe', 'diff',
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

// Long options that run a program; git accepts any unambiguous prefix of them.
const RUNNER_OPTIONS = ['--upload-pack', '--receive-pack', '--exec'];

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

// Quotes, backslashes, backticks and ^ vanish before a program sees its arguments.
const normalize = (text) => text.replace(/["'\\`^]/g, '');
const namesPush = (text) => /\bpush\b/i.test(normalize(text));
const namesGit = (text) => /\bgit(\.exe)?\b/i.test(normalize(text));
const commandName = (value) => value.split(/[\\/]/).pop().toLowerCase().replace(/\.exe$/, '');
const plain = (word) => word.raw === word.value;

// Paths the agent may never write: git's own files, the guard, and its settings.
const PROTECTED_PATH = /(^|[\s/"'=:(])\.(git|claude\/repo-standup|claude\/settings\.local\.json)(\/|$|[\s"');&|])/i;
const protectedPath = (text) => {
  const slashed = text.replace(/\\/g, '/');
  return PROTECTED_PATH.test(slashed) || PROTECTED_PATH.test(slashed.replace(/["'`^]/g, ''));
};

function decideEdit(filePath) {
  const p = String(filePath ?? '').replace(/\\/g, '/');
  if (/(^|\/)\.git(\/|$)/.test(p) || /(^|\/)\.claude\/repo-standup(\/|$)/.test(p) || /(^|\/)\.claude\/settings\.local\.json$/.test(p)) {
    return deny('writes under .git/, .claude/repo-standup/ and .claude/settings.local.json are not allowed');
  }
  return { allow: true };
}

// The checks for a git subcommand other than push.
function checkRunners(sub, args) {
  const values = args.map((a) => a.value);
  for (const v of values) {
    const name = v.split('=')[0];
    if (v.startsWith('--') && name.length >= 5 && RUNNER_OPTIONS.some((o) => o.startsWith(name))) {
      return deny(`git option ${name} runs a program`);
    }
    if (sub === 'rebase' && /^-x/.test(v)) return deny('git rebase -x runs a command');
    if ((sub === 'clone' || sub === 'ls-remote') && /^-u/.test(v)) return deny(`git ${sub} -u runs a program`);
    if (sub === 'grep' && (/^-O/.test(v) || (v.startsWith('--') && name.length >= 6 && '--open-files-in-pager'.startsWith(name)))) {
      return deny('git grep -O runs a program');
    }
  }
  if (sub === 'submodule' && values.includes('foreach')) return deny('git submodule foreach runs a command');
  if (sub === 'bisect' && values.includes('run')) return deny('git bisect run runs a command');
  if (sub === 'config') return checkConfig(values);
  return null;
}

function checkConfig(values) {
  if (values.some((v) => ['-e', '--edit', '-f', '--blob', '--rename-section', '--remove-section'].includes(v) || v.startsWith('--file'))) {
    return deny('this git config form is not allowed');
  }
  if (values.some((v) => CONFIG_READ_FLAGS.has(v))) return null;
  const keys = values.filter((v) => !v.startsWith('-'));
  const writes = keys.length > 1 || values.some((v) => CONFIG_WRITE_FLAGS.has(v));
  if (!writes) return null;
  if (!keys[0] || !SAFE_CONFIG_KEYS.test(keys[0].toLowerCase())) return deny(`git config may not write ${keys[0] ?? 'that key'}`);
  return null;
}

// Judge one segment. Returns { allow: false, reason }, { push } for a push
// segment, or null for a harmless one.
function judgeSegment(seg) {
  if (seg.dynamicCall) return deny('dynamic execution: & followed by a variable or expression');
  let words = stripRedirections(seg.words);
  if (words.length === 0) return null;
  const text = words.map((w) => w.raw).join(' ');
  const pushNamed = namesPush(text);
  const gitNamed = namesGit(text);

  let assigns = 0;
  while (assigns < words.length && /^[A-Za-z_]\w*=/.test(words[assigns].raw)) assigns += 1;
  if (assigns > 0) {
    if (assigns === words.length) return null;
    if (pushNamed || gitNamed) return deny('an environment assignment before a command that names git or push');
    words = words.slice(assigns);
  }

  // PowerShell assignment: judge what follows the `=` as the command.
  const first = words[0].raw;
  const inline = /^\$[\w:{}.]+(?:\+|-)?=(.*)$/s.exec(first);
  if (inline || (/^\$[\w:{}.]+$/.test(first) && /^(\+|-)?=$/.test(words[1]?.raw ?? ''))) {
    const rest = words.slice(inline ? 1 : 2);
    if (inline && inline[1]) rest.unshift({ raw: inline[1], value: inline[1] });
    return rest.length > 0 ? judgeSegment({ words: rest, piped: seg.piped, dynamicCall: false }) : null;
  }

  if (/[$%]/.test(first)) return deny('the command word is a variable or expression');
  const name = commandName(words[0].value);
  if (ALWAYS_DENIED_COMMANDS.has(name)) return deny(`${name} evaluates text as code`);
  if (seg.piped && INTERPRETERS.has(name)) return deny('a pipe into an interpreter runs text as code');

  if (name !== 'git') {
    if (pushNamed) return deny('a program other than git names push');
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

// `command` is the shell command line, or the file path for Edit, Write and NotebookEdit.
export function decide(toolName, command, repo) {
  if (EDIT_TOOLS.has(toolName)) return decideEdit(command);

  const text = String(command ?? '');
  const flat = normalize(text);
  if (text.includes(CANARY) && namesPush(text)) return deny('canary');
  if (/--no-verify|core\.hookspath/i.test(flat)) return deny('--no-verify and core.hooksPath are not allowed');
  if (protectedPath(text)) return deny('commands may not name .git/, .claude/repo-standup/ or .claude/settings.local.json');

  const { segments, problems } = parseShell(text);
  if (problems.length > 0 && /\b(git|push)\b/i.test(flat)) {
    return deny(`cannot classify the command (${problems[0]}), and it names git or push`);
  }

  for (const segment of segments) {
    const verdict = judgeSegment(segment);
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
  return {
    get clientRepo() {
      const top = process.env.CLAUDE_PROJECT_DIR || runGit(cwd, ['rev-parse', '--show-toplevel']).lines[0];
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
  const toolInput = input?.tool_input ?? {};
  const target = EDIT_TOOLS.has(tool) ? (toolInput.file_path ?? toolInput.notebook_path ?? toolInput.path) : toolInput.command;
  if (tool !== 'Bash' && tool !== 'PowerShell' && !EDIT_TOOLS.has(tool)) return;
  if (typeof target !== 'string') {
    denyOutput(`${PREFIX}the tool call has no ${EDIT_TOOLS.has(tool) ? 'file path' : 'command'} to judge`);
    return;
  }
  try {
    const result = decide(tool, target, realRepo(path.resolve(input.cwd || '.')));
    if (!result.allow) denyOutput(result.reason);
  } catch (error) {
    if (EDIT_TOOLS.has(tool) || /\b(git|push)\b/i.test(normalize(target))) {
      denyOutput(`${PREFIX}internal error while judging the command (${error.message})`);
    }
  }
}

if (runsDirectly(import.meta.url)) main();
