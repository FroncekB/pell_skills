import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { decide } from '../../plugins/pell/skills/repo-standup/hooks/guard.mjs';

const GUARD = fileURLToPath(
  new URL('../../plugins/pell/skills/repo-standup/hooks/guard.mjs', import.meta.url),
);
const PREFIX = 'repo-standup guard: ';
const CLIENT = 'pellsoftware/acme';
const CLIENT_ORIGIN = 'git@ssh.bitbucket.org:pellsoftware/acme.git';

function fakeRepo(origin = CLIENT_ORIGIN, overrides = {}, clientRepo = CLIENT) {
  return {
    clientRepo,
    originUrlFor: (dir) => (dir in overrides ? overrides[dir] : origin),
  };
}

function allowed(command, repo = fakeRepo(), tool = 'Bash') {
  const result = decide(tool, command, repo);
  assert.equal(result.allow, true, `expected allow: ${command} (${result.reason})`);
}

function denied(command, repo = fakeRepo(), tool = 'Bash', reason) {
  const result = decide(tool, command, repo);
  assert.equal(result.allow, false, `expected deny: ${command}`);
  assert.ok(result.reason.startsWith(PREFIX), `bad reason prefix: ${result.reason}`);
  if (reason) assert.equal(result.reason, reason);
}

const ORIGINS = [
  'git@ssh.bitbucket.org:pellsoftware/acme.git',
  'git@bitbucket.org:pellsoftware/acme.git',
  'https://bitbucket.org/pellsoftware/acme.git',
  'https://someone@bitbucket.org/pellsoftware/acme',
];

test('allows pushes to the client repo main', () => {
  for (const origin of ORIGINS) {
    for (const cmd of ['git push', 'git push origin', 'git push origin main', 'git push -u origin main']) {
      allowed(cmd, fakeRepo(origin));
    }
  }
});

test('allows main refspec spellings and redirections', () => {
  allowed('git push origin HEAD:main');
  allowed('git push origin main 2>&1');
});

test('denies forced pushes', () => {
  for (const cmd of [
    'git push --force origin main',
    'git push -f',
    'git push --force-with-lease origin main',
    'git push origin +main',
  ]) denied(cmd);
});

test('denies other branches, deletes, and bulk pushes', () => {
  for (const cmd of [
    'git push origin staging',
    'git push origin main:staging',
    'git push --delete origin main',
    'git push --mirror',
    'git push --all',
    'git push --tags',
  ]) denied(cmd);
});

test('denies a remote other than origin', () => {
  denied('git push upstream main');
});

test('denies when origin is the framework repo or not the client repo', () => {
  const framework = 'git@ssh.bitbucket.org:pellsoftware/pell_web_app_framework.git';
  denied('git push origin main', fakeRepo(framework, {}, 'pellsoftware/pell_web_app_framework'));
  denied('git push origin main', fakeRepo(framework));
  denied('git push origin main', fakeRepo(CLIENT_ORIGIN, {}, null));
  denied('git push origin main', fakeRepo(null));
});

test('finds git push inside compound commands and PowerShell calls', () => {
  denied('cd x && git push -f');
  denied('echo a; git push --force origin main');
  denied('git -c a=b push -f origin main');
  denied('& git push --force origin main', fakeRepo(), 'PowerShell');
  denied('(git push -f)');
});

test('resolves origin from the -C folder', () => {
  const dir = 'C:\Users\a b\fork';
  const cmd = 'git -C "C:\Users\a b\fork" push origin main';
  allowed(cmd, fakeRepo('git@bitbucket.org:other/thing.git', { [dir]: CLIENT_ORIGIN }));
  denied(cmd, fakeRepo(CLIENT_ORIGIN, { [dir]: 'git@bitbucket.org:other/thing.git' }));
});

test('denies pushes it cannot parse', () => {
  denied('git push $(echo --force)');
  denied('eval "git push -f"');
  denied('git push `echo -f`');
});

test('denies --git-dir and --work-tree pushes, whose origin cannot be checked', () => {
  denied('git --git-dir=x push origin main');
});

test('the canary is denied first, with its own reason', () => {
  denied('git push --force --dry-run repo-standup-guard-check main', fakeRepo(), 'Bash', 'repo-standup guard: canary');
});

test('allows commands that are not a git push', () => {
  for (const cmd of ['git status', 'npm run push-notes', 'git log --grep push']) allowed(cmd);
});

function runEntry(payload, env = {}) {
  return spawnSync('node', [GUARD], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

test('entry point prints the deny object for a denied push', () => {
  const out = runEntry({ tool_name: 'Bash', tool_input: { command: 'git push --force origin main' }, cwd: '.' });
  assert.equal(out.status, 0);
  const parsed = JSON.parse(out.stdout);
  assert.equal(parsed.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(parsed.hookSpecificOutput.permissionDecision, 'deny');
  assert.ok(parsed.hookSpecificOutput.permissionDecisionReason.startsWith(PREFIX));
});

test('entry point prints nothing for a command that is not a push', () => {
  const out = runEntry({ tool_name: 'Bash', tool_input: { command: 'git status' }, cwd: '.' });
  assert.equal(out.status, 0);
  assert.equal(out.stdout, '');
});
