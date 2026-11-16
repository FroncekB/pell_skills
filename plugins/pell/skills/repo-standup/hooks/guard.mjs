// PreToolUse hook: deny any `git push` that is not "push only to the client
// repo's main, never forced". Node standard library only.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PREFIX = 'repo-standup guard: ';
const CANARY = 'repo-standup-guard-check';
const deny = (why) => ({ allow: false, reason: PREFIX + why });

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

// Split one segment into words; quotes group but are removed, backslashes stay literal.
function tokenize(segment) {
  const tokens = [];
  let current = '';
  let quote = null;
  let started = false;
  for (const ch of segment) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
    } else if (/\s/.test(ch)) {
      if (started) tokens.push(current);
      current = '';
      started = false;
    } else {
      current += ch;
      started = true;
    }
  }
  if (started) tokens.push(current);
  return tokens;
}

const isGit = (token) => /^(.*[\\/])?git(\.exe)?$/i.test(token);

// Returns { dir, args } for a segment whose git subcommand is push, or
// { error } when it cannot be checked, or null when it is not a git push.
function parseGitPush(tokens) {
  const start = tokens.findIndex(isGit);
  if (start === -1) return null;
  let i = start + 1;
  const dirs = [];
  let unverifiable = false;
  while (i < tokens.length && tokens[i].startsWith('-')) {
    const t = tokens[i];
    if (t === '-C') {
      dirs.push(tokens[i + 1] ?? '');
      i += 2;
    } else if (t === '-c' || t === '--namespace' || t === '--exec-path') {
      i += 2;
    } else if (t === '--git-dir' || t === '--work-tree') {
      unverifiable = true;
      i += 2;
    } else {
      if (t.startsWith('--git-dir=') || t.startsWith('--work-tree=')) unverifiable = true;
      i += 1;
    }
  }
  if (tokens[i] !== 'push') return null;
  if (unverifiable) return { error: 'git push with --git-dir or --work-tree cannot be checked' };
  if (dirs.length > 1) return { error: 'git push with several -C options cannot be checked' };
  return { dir: dirs[0] ?? '.', args: stripRedirections(tokens.slice(i + 1)) };
}

// Drop shell redirections (2>&1, > file) so they are not read as refspecs.
function stripRedirections(args) {
  const kept = [];
  for (let i = 0; i < args.length; i++) {
    if (!/^[0-9]*[<>]/.test(args[i])) kept.push(args[i]);
    else if (/^[0-9]*(>>?|<)$/.test(args[i])) i += 1;
  }
  return kept;
}

const FRAMEWORK_REPO = 'pellsoftware/pell_web_app_framework';

const VALUE_FLAGS = new Set(['--repo', '-o', '--push-option', '--receive-pack', '--exec']);

function checkPushArgs(args) {
  const positionals = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') {
      positionals.push(...args.slice(i + 1));
      break;
    }
    if (a.startsWith('--')) {
      const name = a.split('=')[0];
      if (name === '--force' || name.startsWith('--force-')) return 'forced push';
      if (['--delete', '--mirror', '--all', '--tags', '--prune'].includes(name)) return `${name} is not allowed`;
      if (name === '--repo') return '--repo is not allowed';
      if (VALUE_FLAGS.has(name) && !a.includes('=')) i += 1;
    } else if (a.startsWith('-') && a.length > 1) {
      if (/^-[a-zA-Z]*f/.test(a)) return 'forced push';
      if (/^-[a-zA-Z]*d/.test(a)) return 'delete is not allowed';
      if (a === '-o') i += 1;
    } else {
      positionals.push(a);
    }
  }
  const [remote = 'origin', ...refspecs] = positionals;
  if (remote !== 'origin') return `remote "${remote}" is not origin`;
  for (const ref of refspecs) {
    if (ref.startsWith('+')) return 'forced refspec';
    if (!['main', 'main:main', 'HEAD:main'].includes(ref)) return `refspec "${ref}" is not main`;
  }
  return null;
}

function repoFromUrl(url) {
  const m =
    /^git@(?:ssh\.)?bitbucket\.org:(.+?)(?:\.git)?\/?$/i.exec(url) ||
    /^https?:\/\/(?:[^@/]+@)?bitbucket\.org\/(.+?)(?:\.git)?\/?$/i.exec(url);
  return m ? m[1].toLowerCase() : null;
}

export function decide(toolName, command, repo) {
  const text = String(command ?? '');
  if (text.includes(CANARY) && /\bpush\b/.test(text)) return deny('canary');

  for (const segment of splitSegments(text)) {
    if (!/\bpush\b/.test(segment)) continue;
    if (/\$\(|`|\beval\b/.test(segment)) return deny('unparseable command that contains push');
    const parsed = parseGitPush(tokenize(segment));
    if (!parsed) continue;
    if (parsed.error) return deny(parsed.error);
    const why = checkPushArgs(parsed.args);
    if (why) return deny(why);
    const origin = repoFromUrl(repo.originUrlFor(parsed.dir) ?? '');
    const client = repo.clientRepo ? repo.clientRepo.toLowerCase() : null;
    if (origin === FRAMEWORK_REPO) return deny('origin is the framework repo');
    if (!origin || !client || origin !== client) {
      return deny(`origin is not the client repo (${client ?? 'no client.yaml repository.bitbucket'})`);
    }
  }
  return { allow: true };
}

function git(cwd, args) {
  try {
    return execFileSync('git', ['-C', cwd, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

// Reads repository.bitbucket from client.yaml with a line read, not a YAML parser.
function readClientRepo(projectDir) {
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

function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return;
  }
  const command = input?.tool_input?.command;
  if (typeof command !== 'string' || !/\bpush\b/.test(command)) return;
  const cwd = path.resolve(input.cwd || '.');
  const projectDir = process.env.CLAUDE_PROJECT_DIR || git(cwd, ['rev-parse', '--show-toplevel']);
  const repo = {
    clientRepo: projectDir ? readClientRepo(projectDir) : null,
    originUrlFor: (dir) => git(path.resolve(cwd, dir || '.'), ['remote', 'get-url', 'origin']),
  };
  const result = decide(input.tool_name, command, repo);
  if (!result.allow) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: result.reason,
        },
      }),
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
