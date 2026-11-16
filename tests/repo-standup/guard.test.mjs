import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  PREFIX, CLIENT_ORIGIN, FRAMEWORK_ORIGIN, SETTINGS,
  fakeRepo, allowed, denied, runEntry, git, makeClientDir, pushIn,
} from './helpers.mjs';

const ORIGINS = [
  'git@ssh.bitbucket.org:pellsoftware/acme.git',
  'git@bitbucket.org:pellsoftware/acme.git',
  'https://bitbucket.org/pellsoftware/acme.git',
  'https://someone@bitbucket.org/pellsoftware/acme',
];

test('allows only the three push shapes, for every origin URL form', () => {
  for (const url of ORIGINS) {
    for (const cmd of [
      'git push origin main',
      'git push -u origin main',
      'git push origin main:main',
      'git push --set-upstream origin main',
      'git push -q origin main',
      'git push --verbose origin main',
      'git push --porcelain --no-progress origin main',
      'git push origin main 2>&1',
    ]) {
      allowed(cmd, fakeRepo({ urls: [url] }));
    }
  }
});

test('denies bare pushes and other refspecs the old guard allowed', () => {
  for (const cmd of ['git push', 'git push origin', 'git push origin HEAD:main', 'git push -u origin']) denied(cmd);
});

test('denies forced pushes', () => {
  for (const cmd of [
    'git push --force origin main',
    'git push -f',
    'git push --force-with-lease origin main',
    'git push origin +main',
  ]) denied(cmd);
});

test('denies other branches, deletes, bulk pushes and other remotes', () => {
  for (const cmd of [
    'git push origin staging',
    'git push origin main:staging',
    'git push --delete origin main',
    'git push --mirror',
    'git push --all',
    'git push --tags',
    'git push upstream main',
  ]) denied(cmd);
});

test('denies push options outside the allowlist, abbreviations included', () => {
  for (const cmd of [
    'git push --receive-pack=x origin main',
    'git push --exec=x origin main',
    'git push --no-verify origin main',
    'git push --repo=x origin main',
    'git push --forc origin main',
    'git push --del origin main',
    'git push --mir',
    'git push -o x origin main',
    'git push --dry-run origin main',
  ]) denied(cmd);
});

test('denies git global options other than -C', () => {
  denied('git -c remote.origin.pushurl=git@bitbucket.org:pellsoftware/pell_web_app_framework.git push origin main');
  denied('git -c a=b push -f origin main');
  denied('git --namespace=x push origin main');
  denied('git --exec-path=x push origin main');
  denied('git --git-dir=x push origin main');
  denied('git --work-tree=x push origin main');
  denied('git -C a -C b push origin main');
});

test('denies aliases, config aliases and non-builtin subcommands', () => {
  denied('git -c alias.x="push --force" x');
  denied('git x');
  denied('git ps');
});

test('denies wrappers and interpreters that name push', () => {
  for (const [cmd, tool] of [
    ['bash -c "git push -f"', 'Bash'],
    ['sh -c "git push -f"', 'Bash'],
    ["sh -c 'git push -f'", 'Bash'],
    ['pwsh -c "git push -f"', 'PowerShell'],
    ['powershell -Command "git push -f"', 'PowerShell'],
    ['cmd /c git push -f', 'PowerShell'],
    ['env git push origin main', 'Bash'],
    ['xargs git push -f', 'Bash'],
    ['node -e "require(\'child_process\').execSync(\'git push -f\')"', 'Bash'],
    ['npm run push-notes', 'Bash'],
    ['eval "git push -f"', 'Bash'],
    ['echo push', 'Bash'],
  ]) denied(cmd, fakeRepo(), tool);
});

test('denies nested interpreters and string evaluators that name push', () => {
  const cases = [
    ['bash -c "git push origin main"', 'Bash'],
    ['/bin/bash -c "git push origin main"', 'Bash'],
    ['sh -c "git push origin main"', 'Bash'],
    ['/usr/bin/sh -c "git push origin main"', 'Bash'],
    ['zsh -c "git push origin main"', 'Bash'],
    ['ksh -c "git push origin main"', 'Bash'],
    ['dash -c "git push origin main"', 'Bash'],
    ['cmd /c git push origin main', 'PowerShell'],
    ['cmd.exe /k git push origin main', 'PowerShell'],
    ['C:\\Windows\\System32\\cmd.exe /c git push origin main', 'PowerShell'],
    ['pwsh -c "git push origin main"', 'PowerShell'],
    ['pwsh -Command "git push origin main"', 'PowerShell'],
    ['powershell -Command "git push origin main"', 'PowerShell'],
    ['C:\\Program Files\\PowerShell\\7\\pwsh.exe -Command "git push origin main"', 'PowerShell'],
    ['C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe -EncodedCommand git push', 'PowerShell'],
    ['iex "git push origin main"', 'PowerShell'],
    ['Invoke-Expression "git push origin main"', 'PowerShell'],
    ['source push.sh', 'Bash'],
    ['. ./push.sh', 'Bash'],
    ['eval "git push origin main"', 'Bash'],
  ];
  for (const [cmd, tool] of cases) denied(cmd, fakeRepo(), tool);
});

test('denies expansion characters in a push segment, the -C value included', () => {
  for (const cmd of [
    'git -C $HOME push origin main',
    'git -C ${DIR} push origin main',
    'git -C ~/fork push origin main',
    'git -C ../f* push origin main',
    'git -C ../f? push origin main',
    'git -C [a]b push origin main',
    'git -C %CD% push origin main',
    'git -C "$HOME/fork" push origin main',
    'git push origin ma*',
    'git push origin m?in',
    'git push origin ma[i]n',
    'git push origin ~main',
    'git push origin {main,x}',
    'git push -u* origin main',
    'git push origin $BRANCH',
    'git push origin %BRANCH%',
  ]) denied(cmd);
});

test('denies wrappers around a non-push git alias', () => {
  denied('env git x');
  denied('bash -c "git x"');
  denied('xargs git x');
});

test('denies shell escapes that reach git as push', () => {
  denied('git p\\ush -f');
  denied('git "pu"sh -f');
  denied("git 'pu'sh origin main");
  denied('git pu`sh -f', fakeRepo(), 'PowerShell');
  denied('git pu^sh -f', fakeRepo(), 'PowerShell');
  denied('git $(echo push) -f');
  denied('git push $(echo --force)');
  denied('git push `echo -f`');
});

test('denies a push that follows anything else in the command', () => {
  denied('cd ../other && git push origin main');
  denied('cd x && git push -f');
  denied('echo a; git push --force origin main');
  denied('git status && git push origin main');
  denied('git push origin main && git status');
  denied('git push origin main | cat');
  denied('(git push -f)');
  denied('git push origin main\ngit push -f');
});

test('denies environment and directory context', () => {
  denied('GIT_DIR=x git push origin main');
  denied("$env:GIT_DIR='x'; git push origin main", fakeRepo(), 'PowerShell');
  denied('env GIT_DIR=x git push origin main');
  denied('pushd ../other; git push origin main', fakeRepo(), 'PowerShell');
  denied('Set-Location ../other; git push origin main', fakeRepo(), 'PowerShell');
  denied('$p = "git"; & $p push origin main', fakeRepo(), 'PowerShell');
  denied('& git push --force origin main', fakeRepo(), 'PowerShell');
});

test('denies when any push URL is not the client repo', () => {
  denied('git push origin main', fakeRepo({ urls: [FRAMEWORK_ORIGIN] }));
  denied('git push origin main', fakeRepo({ urls: [FRAMEWORK_ORIGIN], clientRepo: 'pellsoftware/pell_web_app_framework' }));
  denied('git push origin main', fakeRepo({ urls: [CLIENT_ORIGIN, 'git@bitbucket.org:other/thing.git'] }));
  denied('git push origin main', fakeRepo({ urls: [] }));
  denied('git push origin main', fakeRepo({ clientRepo: null }));
});

test('denies when remote.origin.push or remote.origin.mirror is set', () => {
  denied('git push origin main', fakeRepo({ push: ['refs/heads/*:refs/heads/*'] }));
  denied('git push origin main', fakeRepo({ mirror: true }));
});

test('resolves URLs from the -C folder', () => {
  const dir = 'C:\\Users\\a b\\fork';
  const cmd = 'git -C "C:\\Users\\a b\\fork" push origin main';
  allowed(cmd, fakeRepo({ urls: ['git@bitbucket.org:other/thing.git'], overrides: { [dir]: [CLIENT_ORIGIN] } }));
  denied(cmd, fakeRepo({ urls: [CLIENT_ORIGIN], overrides: { [dir]: ['git@bitbucket.org:other/thing.git'] } }));
});

test('the canary is denied first, with its own reason', () => {
  denied('git push --force --dry-run repo-standup-guard-check main', fakeRepo(), 'Bash', 'repo-standup guard: canary');
});

test('allows commands that are not a push', () => {
  for (const cmd of [
    'git status',
    'git log --grep push',
    'git stash push',
    'git commit -m "push the fix"',
    'git -C "C:\\Users\\a b\\fork" status',
    'npm test',
    'ls -la',
  ]) allowed(cmd);
});

test('the hook command uses the absolute project path', () => {
  const settings = JSON.parse(readFileSync(SETTINGS, 'utf8'));
  const entry = settings.hooks.PreToolUse[0];
  assert.equal(entry.matcher, 'Bash|PowerShell|Edit|Write|NotebookEdit');
  assert.equal(entry.hooks[0].command, 'node "$CLAUDE_PROJECT_DIR/.claude/repo-standup/guard.mjs"');
});

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

test('entry point allows a plain push to the client repo', () => {
  const out = pushIn(makeClientDir());
  assert.equal(out.status, 0);
  assert.equal(out.stdout, '');
});

test('entry point denies when a pushurl points elsewhere', () => {
  const dir = makeClientDir();
  git(dir, 'config', 'remote.origin.pushurl', 'git@bitbucket.org:pellsoftware/pell_web_app_framework.git');
  assert.equal(JSON.parse(pushIn(dir).stdout).hookSpecificOutput.permissionDecision, 'deny');
});

test('entry point denies when remote.origin.push or mirror is configured', () => {
  const pushDir = makeClientDir();
  git(pushDir, 'config', 'remote.origin.push', 'refs/heads/*:refs/heads/*');
  assert.equal(JSON.parse(pushIn(pushDir).stdout).hookSpecificOutput.permissionDecision, 'deny');
  const mirrorDir = makeClientDir();
  git(mirrorDir, 'config', 'remote.origin.mirror', 'true');
  assert.equal(JSON.parse(pushIn(mirrorDir).stdout).hookSpecificOutput.permissionDecision, 'deny');
});

test('entry point denies when the repo cannot be inspected', () => {
  const dir = makeClientDir();
  const out = runEntry(
    { tool_name: 'Bash', tool_input: { command: 'git push origin main' }, cwd: path.join(dir, 'does-not-exist') },
    { CLAUDE_PROJECT_DIR: dir },
  );
  assert.equal(JSON.parse(out.stdout).hookSpecificOutput.permissionDecision, 'deny');
});
