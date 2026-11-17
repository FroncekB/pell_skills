import { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide } from '../../plugins/pell/skills/repo-standup/hooks/guard.mjs';

// Every temp folder a test makes, removed when its test file ends. rmSync removes
// a junction inside one without following it.
const made = [];
after(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
});

export function tempDir(prefix) {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  made.push(dir);
  return dir;
}

export const HOOKS_DIR = fileURLToPath(new URL('../../plugins/pell/skills/repo-standup/hooks/', import.meta.url));
export const GUARD = path.join(HOOKS_DIR, 'guard.mjs');
export const SETTINGS = path.join(HOOKS_DIR, 'settings.local.json');
export const PREFIX = 'repo-standup guard: ';
export const CLIENT = 'pellsoftware/acme';
export const CLIENT_ORIGIN = 'git@ssh.bitbucket.org:pellsoftware/acme.git';
export const FRAMEWORK_ORIGIN = 'git@ssh.bitbucket.org:pellsoftware/pell_web_app_framework.git';

// A fake repo. `urls` are what `git remote get-url --push --all origin` prints;
// `overrides` maps a -C folder to its own list.
export function fakeRepo({
  urls = [CLIENT_ORIGIN],
  overrides = {},
  clientRepo = CLIENT,
  push = [],
  mirror = false,
  submodules = false,
} = {}) {
  return {
    clientRepo,
    pushUrlsFor: (dir) => (dir in overrides ? overrides[dir] : urls),
    pushConfigFor: () => ({ push, mirror, submodules }),
  };
}

export function allowed(command, repo = fakeRepo(), tool = 'Bash') {
  const result = decide(tool, command, repo);
  assert.equal(result.allow, true, `expected allow: ${command} (${result.reason})`);
}

export function denied(command, repo = fakeRepo(), tool = 'Bash', reason) {
  const result = decide(tool, command, repo);
  assert.equal(result.allow, false, `expected deny: ${command}`);
  assert.ok(result.reason.startsWith(PREFIX), `bad reason prefix: ${result.reason}`);
  if (reason) assert.equal(result.reason, reason);
}

export function runEntry(payload, env = {}) {
  return spawnSync('node', [GUARD], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

export function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
}

// A temp git repo with origin set and the client repo pinned, as setup leaves a fork.
export function makeClientDir(origin = 'git@bitbucket.org:pellsoftware/acme.git') {
  const dir = tempDir('guard-entry-');
  git(dir, 'init', '-q');
  git(dir, 'remote', 'add', 'origin', origin);
  mkdirSync(path.join(dir, '.claude', 'repo-standup'), { recursive: true });
  writeFileSync(path.join(dir, '.claude', 'repo-standup', 'client-repo'), 'pellsoftware/acme\n');
  return dir;
}

export function pushIn(dir, command = 'git push origin main') {
  return runEntry({ tool_name: 'Bash', tool_input: { command }, cwd: dir }, { CLAUDE_PROJECT_DIR: dir });
}

export const decision = (out) => JSON.parse(out.stdout).hookSpecificOutput.permissionDecision;
