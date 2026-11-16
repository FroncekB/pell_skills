// PreToolUse hook: deny any `git push` that is not "push only to the client
// repo's main, never forced". It recognizes one push shape and denies anything
// else that might push. Node standard library only.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const PREFIX = 'repo-standup guard: ';
export const FRAMEWORK_REPO = 'pellsoftware/pell_web_app_framework';
const CANARY = 'repo-standup-guard-check';
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

// Programs that run another command line from a string or from their arguments.
const WRAPPER = /(^|[\s\\/])(env|xargs|bash|sh|zsh|ksh|dash|cmd|pwsh|powershell|node|python3?|ruby|perl|sudo|time|nohup|command|exec|eval|iex|invoke-expression|start|start-process|call|nice|timeout|watch|source)(\.exe)?(\s|$)/i;

// Quotes, backslashes, backticks and ^ vanish before a program sees its arguments.
const normalize = (text) => text.replace(/["'\\`^]/g, '');
const namesPush = (text) => /\bpush\b/i.test(normalize(text));

// Split on && || ; | & and newlines outside quotes. `&` right after `>` or `<`
// is a redirection (2>&1), not a separator.
function splitSegments(command) {
  const segments = [];
  let current = '';
  let quote = null;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (quote) {
      if (ch === quote) quote = null;
      current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (ch === '\n' || ch === ';' || ch === '|' || (ch === '&' && !/[<>]/.test(command[i - 1] ?? ''))) {
      segments.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  segments.push(current);
  return segments
    .map((s) => s.trim().replace(/^[({\s]+/, '').replace(/[)}\s]+$/, ''))
    .filter(Boolean);
}

// Split a segment into words on whitespace outside quotes. Quotes stay in the words.
function rawTokens(segment) {
  const tokens = [];
  let current = '';
  let quote = null;
  for (const ch of segment) {
    if (quote) {
      if (ch === quote) quote = null;
      current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (/\s/.test(ch)) {
      if (current) tokens.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

const unquote = (token) => token.replace(/["']/g, '');
const isGit = (word) => /^git(\.exe)?$/i.test(word.split(/[\\/]/).pop());

// Index of git's subcommand behind its global options, or -1.
function subcommandIndex(tokens) {
  let i = 1;
  while (i < tokens.length && tokens[i].startsWith('-')) {
    i += ['-C', '-c', '--namespace', '--exec-path', '--git-dir', '--work-tree'].includes(tokens[i]) ? 2 : 1;
  }
  return i < tokens.length ? i : -1;
}

// Judge one segment. Returns { allow: false, reason }, { push } for a push
// segment's raw tokens and subcommand index, or null for a harmless segment.
function judgeSegment(segment) {
  const tokens = rawTokens(segment);
  if (tokens.length === 0) return null;
  if (/[$%]/.test(tokens[0])) return deny('the command word is expanded');
  const pushNamed = namesPush(segment);

  if (!isGit(unquote(tokens[0]))) {
    if (pushNamed) return deny('a program other than git names push');
    if (/\bgit(\.exe)?\b/i.test(normalize(segment)) && (WRAPPER.test(normalize(segment)) || /^[A-Za-z_]\w*=/.test(tokens[0]))) {
      return deny('a wrapper runs git');
    }
    return null;
  }

  const at = subcommandIndex(tokens);
  if (at === -1) return pushNamed ? deny('git names push without a subcommand') : null;
  const sub = tokens[at];
  if (!/^[a-z0-9-]+$/.test(sub) || !BUILTINS.has(sub)) return deny(`git subcommand "${sub}" is not a plain builtin`);
  if (sub !== 'push') {
    if (pushNamed && /\$\(|`/.test(segment)) return deny('command substitution next to push');
    return null;
  }
  return { push: { tokens, at } };
}

// Check a push segment's shape. Returns { dir } or { deny }.
function checkPushShape({ tokens, at }) {
  const before = tokens.slice(1, at);
  let dir = '.';
  if (before.length === 2 && before[0] === '-C') {
    dir = unquote(before[1]);
    if (!dir || dir.startsWith('-') || /[$%{}*?[\]~`]/.test(dir)) return { deny: deny('the -C folder is not a literal path') };
  } else if (before.length !== 0) {
    return { deny: deny('git global options other than -C are not allowed with push') };
  }

  const options = [];
  const positionals = [];
  for (const arg of tokens.slice(at + 1)) {
    if (arg === '2>&1') continue;
    if (!/^[A-Za-z0-9:_-]+$/.test(arg)) return { deny: deny(`push argument "${arg}" is not plain text`) };
    (arg.startsWith('-') ? options : positionals).push(arg);
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

export function decide(toolName, command, repo) {
  const text = String(command ?? '');
  if (text.includes(CANARY) && namesPush(text)) return deny('canary');

  const segments = splitSegments(text);
  for (const segment of segments) {
    const verdict = judgeSegment(segment);
    if (!verdict) continue;
    if (verdict.allow === false) return verdict;

    const shape = checkPushShape(verdict.push);
    if (shape.deny) return shape.deny;
    if (segments.length !== 1) return deny('a push must be the only command, with no cd, env or other command around it');

    const client = repo.clientRepo ? repo.clientRepo.toLowerCase() : null;
    if (!client) return deny('no client.yaml repository.bitbucket');
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
  }
  return { allow: true };
}

function runGit(cwd, args) {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  if (r.error) throw r.error;
  return { status: r.status, lines: r.stdout.split(/\r?\n/).filter(Boolean) };
}

// Reads repository.bitbucket from client.yaml with a line read, not a YAML parser.
export function readClientRepo(projectDir) {
  let text;
  try {
    text = readFileSync(path.join(projectDir, 'client.yaml'), 'utf8');
  } catch {
    return null;
  }
  let inRepository = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^repository:\s*(#.*)?$/.test(line)) inRepository = true;
    else if (/^\S/.test(line)) inRepository = false;
    else if (inRepository) {
      const m = /^\s+bitbucket:\s*(.*)$/.exec(line);
      if (m) return m[1].replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '') || null;
    }
  }
  return null;
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

function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return;
  }
  const command = input?.tool_input?.command;
  if (typeof command !== 'string' || !/\b(git|push)\b/i.test(normalize(command))) return;
  try {
    const cwd = path.resolve(input.cwd || '.');
    const resolve = (dir) => path.resolve(cwd, dir || '.');
    const repo = {
      get clientRepo() {
        const top = process.env.CLAUDE_PROJECT_DIR || runGit(cwd, ['rev-parse', '--show-toplevel']).lines[0];
        return top ? readClientRepo(top) : null;
      },
      pushUrlsFor(dir) {
        const r = runGit(resolve(dir), ['remote', 'get-url', '--push', '--all', 'origin']);
        if (r.status !== 0) throw new Error('git remote get-url failed');
        return r.lines;
      },
      pushConfigFor(dir) {
        const where = resolve(dir);
        const push = runGit(where, ['config', '--get-all', 'remote.origin.push']);
        if (push.status !== 0 && push.status !== 1) throw new Error('git config failed');
        const mirror = runGit(where, ['config', '--type=bool', '--get-all', 'remote.origin.mirror']);
        if (mirror.status !== 0 && mirror.status !== 1) throw new Error('git config failed');
        return { push: push.lines, mirror: mirror.lines.includes('true') };
      },
    };
    const result = decide(input.tool_name, command, repo);
    if (!result.allow) denyOutput(result.reason);
  } catch (error) {
    if (namesPush(command)) denyOutput(`${PREFIX}internal error while judging a push (${error.message})`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
