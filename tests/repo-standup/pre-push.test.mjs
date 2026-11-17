import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, copyFileSync, readFileSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempDir } from './helpers.mjs';
import { decidePush } from '../../plugins/pell/skills/repo-standup/hooks/pre-push.mjs';

const HOOKS = fileURLToPath(new URL('../../plugins/pell/skills/repo-standup/hooks/', import.meta.url));
const PREFIX = 'repo-standup guard: ';
const CLIENT = 'pellsoftware/acme';
const URL_OK = 'git@ssh.bitbucket.org:pellsoftware/acme.git';
const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const ZERO = '0'.repeat(40);

const ctx = (over = {}) => ({ clientRepo: CLIENT, isAncestor: () => true, ...over });
const line = (local = A, remote = B, ref = 'refs/heads/main') => `refs/heads/main ${local} ${ref} ${remote}`;

function ok(url, lines, c = ctx()) {
  const r = decidePush(url, lines, c);
  assert.equal(r.allow, true, r.reason);
}

function refused(url, lines, c = ctx()) {
  const r = decidePush(url, lines, c);
  assert.equal(r.allow, false);
  assert.ok(r.reason.startsWith(PREFIX), r.reason);
}

test('allows a fast-forward of main on the client repo', () => {
  ok(URL_OK, [line()]);
  ok('https://someone@bitbucket.org/pellsoftware/acme', [line()]);
});

test('allows creating main on an empty remote', () => {
  ok(URL_OK, [line(A, ZERO)], ctx({ isAncestor: () => false }));
});

test('refuses a URL that is not the client repo', () => {
  refused('git@bitbucket.org:other/thing.git', [line()]);
  refused('git@ssh.bitbucket.org:pellsoftware/pell_web_app_framework.git', [line()], ctx({ clientRepo: 'pellsoftware/pell_web_app_framework' }));
  refused('/tmp/local-bare.git', [line()]);
  refused(URL_OK, [line()], ctx({ clientRepo: null }));
});

test('refuses any remote ref but refs/heads/main', () => {
  refused(URL_OK, [line(A, B, 'refs/heads/staging')]);
  refused(URL_OK, [line(A, B, 'refs/tags/v1')]);
  refused(URL_OK, [line(), line(A, B, 'refs/heads/other')]);
});

test('refuses a delete', () => {
  refused(URL_OK, [line(ZERO, B)]);
});

test('refuses a push that is not a fast-forward', () => {
  refused(URL_OK, [line()], ctx({ isAncestor: () => false }));
});

test('refuses a push it cannot check', () => {
  refused(URL_OK, [line()], ctx({ isAncestor: () => null }));
});

test('refuses a malformed line', () => {
  refused(URL_OK, ['nonsense']);
});

test('the pre-push shim runs the fork copy of pre-push.mjs', () => {
  const shim = readFileSync(path.join(HOOKS, 'pre-push'), 'utf8');
  assert.match(shim, /^#!\/bin\/sh\n/);
  assert.match(shim, /exec node "\$\(git rev-parse --show-toplevel\)\/\.claude\/repo-standup\/pre-push\.mjs" "\$@"/);
});

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return r;
}

test('integration: the installed hook refuses a push whose URL is not the client repo', () => {
  const root = tempDir('pre-push-it-');
  const remote = path.join(root, 'remote.git');
  const work = path.join(root, 'work');
  mkdirSync(work);
  assert.equal(git(root, 'init', '-q', '--bare', remote).status, 0);
  assert.equal(git(work, 'init', '-q', '-b', 'main').status, 0);
  git(work, 'config', 'user.email', 't@example.test');
  git(work, 'config', 'user.name', 't');
  git(work, 'config', 'commit.gpgsign', 'false');
  const fork = path.join(work, '.claude', 'repo-standup');
  mkdirSync(fork, { recursive: true });
  writeFileSync(path.join(fork, 'client-repo'), 'pellsoftware/acme\n');
  copyFileSync(path.join(HOOKS, 'shell-words.mjs'), path.join(fork, 'shell-words.mjs'));
  copyFileSync(path.join(HOOKS, 'protected-paths.mjs'), path.join(fork, 'protected-paths.mjs'));
  copyFileSync(path.join(HOOKS, 'guard.mjs'), path.join(fork, 'guard.mjs'));
  copyFileSync(path.join(HOOKS, 'pre-push.mjs'), path.join(fork, 'pre-push.mjs'));
  const hook = path.join(work, '.git', 'hooks', 'pre-push');
  writeFileSync(hook, readFileSync(path.join(HOOKS, 'pre-push'), 'utf8').replace(/\r\n/g, '\n'));
  chmodSync(hook, 0o755);
  git(work, 'remote', 'add', 'origin', remote);
  git(work, 'add', '-A');
  assert.equal(git(work, 'commit', '-q', '-m', 'init').status, 0);
  const push = git(work, 'push', 'origin', 'main');
  assert.notEqual(push.status, 0, 'the push should be refused');
  assert.match(push.stderr, /repo-standup guard: the push URL is not the client repo/);
  assert.equal(git(root, '--git-dir', remote, 'rev-parse', '--verify', '-q', 'refs/heads/main').status, 1);
});

test('the hook trims CR from its URL argument and stdin lines (a CRLF checkout)', () => {
  const dir = tempDir('pre-push-cr-');
  assert.equal(git(dir, 'init', '-q').status, 0);
  mkdirSync(path.join(dir, '.claude', 'repo-standup'), { recursive: true });
  writeFileSync(path.join(dir, '.claude', 'repo-standup', 'client-repo'), 'pellsoftware/acme\n');
  const r = spawnSync(
    'node',
    [path.join(HOOKS, 'pre-push.mjs'), 'origin', 'git@bitbucket.org:pellsoftware/acme.git\r'],
    { cwd: dir, encoding: 'utf8', input: `refs/heads/main ${A} refs/heads/main ${ZERO}\r\n` },
  );
  assert.equal(r.status, 0, r.stderr);
});

test('the pre-push shim is pinned to LF endings in .gitattributes', () => {
  const attributes = readFileSync(fileURLToPath(new URL('../../.gitattributes', import.meta.url)), 'utf8');
  assert.match(attributes, /^plugins\/pell\/skills\/repo-standup\/hooks\/pre-push text eol=lf$/m);
});
