// Fix round 2: every bypass the reviews found, verbatim, plus the allowed cases
// each ruling keeps. See docs/specs/2026-11-15-repo-standup-design.md, "What the
// local layers can and can't do".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  CLIENT_ORIGIN, GUARD, HOOKS_DIR,
  fakeRepo, allowed, denied, runEntry, git, makeClientDir, pushIn, decision,
} from './helpers.mjs';

const FW = 'git@bitbucket.org:pellsoftware/pell_web_app_framework.git';
const BACKTICK = '\u0060';

test('comments, escaped quotes, process substitution and a bare CR cannot hide a push', () => {
  const push = `git push --no-verify --force ${FW} HEAD:main`;
  for (const tool of ['Bash', 'PowerShell']) denied(`git log # "\n${push}`, fakeRepo(), tool);
  denied(`git log "\\"" ; ${push} ; echo "\\""`);
  denied(`git log <(${push})`);
  denied('git log --grep x\rgit push --no-verify --force origin HEAD:staging', fakeRepo(), 'PowerShell');
  denied('git log --grep x\rgit push origin HEAD:staging', fakeRepo(), 'PowerShell');
});

test('a comment is not code and does not count as naming push', () => {
  allowed('git log # push is only a comment');
  denied('git log # fine\ngit push -f');
});

test('builtins and options that run other commands are denied', () => {
  for (const cmd of [
    `git rebase --no-ff -x "git push --no-verify --force ${FW} HEAD:main" HEAD~1`,
    'git rebase -x "git push -f" HEAD~1',
    'git rebase --exec="git push -f" HEAD~1',
    'git rebase --exe "git push -f" HEAD~1',
    `git fetch --upload-pack="git push --no-verify -f ${FW} HEAD:main; git-upload-pack" .`,
    'git fetch --upl="x" .',
    'git clone --receive-pack=x a b',
    'git clone -u x a b',
    'git ls-remote --upload-pack=x origin',
    `git -c core.sshCommand="GIT_SSH_COMMAND=ssh git push --no-verify --force ${FW} HEAD:main #" fetch origin`,
    'git -c core.pager=x log',
    'git -c diff.external=x diff',
    'git --no-pager log',
    'git --git-dir=x log',
    'git submodule foreach "git push -f"',
    'git bisect run ./test.sh',
    'git grep -O"git push" x',
    'git filter-branch --tree-filter x',
    'git difftool -x x',
  ]) denied(cmd);
});

test('git global options other than -C are denied on every subcommand', () => {
  denied('git -c a=b status');
  denied('git --paginate log');
  allowed('git -C "C:\\Users\\a b\\fork" log');
  allowed('git --version');
});

test('dynamic execution is denied wherever it appears', () => {
  denied('G=gi U=u; ${G}t p${U}sh --no-verify -f origin HEAD:staging');
  denied('$g="gi"+"t"; & $g ("pu"+"sh") --no-verify -f origin HEAD:staging', fakeRepo(), 'PowerShell');
  denied('& $x', fakeRepo(), 'PowerShell');
  denied("& (gcm git) ('pu'+'sh') --no-verify -f origin HEAD:staging", fakeRepo(), 'PowerShell');
  denied('& { Get-Date }', fakeRepo(), 'PowerShell');
  denied('iex $cmd', fakeRepo(), 'PowerShell');
  denied('Invoke-Expression $cmd', fakeRepo(), 'PowerShell');
  denied('eval $cmd');
  denied('$x ls');
  denied('${x}t status');
  denied('echo git Xush --no-verify -f origin HEAD:staging | tr X p | sh');
  for (const sink of ['sh', 'bash', 'zsh', 'pwsh', 'powershell', 'cmd', 'iex', '/bin/bash', 'pwsh.exe']) {
    denied(`cat script.txt | ${sink}`, fakeRepo(), 'PowerShell');
  }
});

test('literal call operators and plain variable assignments stay allowed', () => {
  allowed('& "C:\\Windows\\System32\\whoami.exe"', fakeRepo(), 'PowerShell');
  allowed('$x = 1', fakeRepo(), 'PowerShell');
  allowed("$name = 'a b'", fakeRepo(), 'PowerShell');
  allowed('$out = git status', fakeRepo(), 'PowerShell');
  denied('$out = git push -f', fakeRepo(), 'PowerShell');
  allowed('echo hello | cat');
});

test('escaped or quoted git still faces the builtins-only rule', () => {
  denied('gi\\t x');
  denied(`g${BACKTICK}it x`, fakeRepo(), 'PowerShell');
  denied('"gi"t x');
  allowed('gi\\t status');
});

test('--no-verify and core.hooksPath are denied wherever they appear', () => {
  denied('git commit --no-verify -m x');
  denied('git commit --no-ver""ify -m x');
  denied('echo core.hooksPath');
  denied('git config core.hooksPath /x');
  denied('git push --no-verify origin main');
});

test('git config writes are denied, reads and benign writes are allowed', () => {
  for (const cmd of [
    'git config core.hooksPath x',
    'git config alias.x "push --force"',
    'git config remote.origin.pushurl x',
    'git config remote.origin.url x',
    'git config url.x.insteadOf y',
    'git config push.default matching',
    'git config include.path x',
    'git config includeIf.gitdir:x.path y',
    'git config core.sshCommand x',
    'git config --global core.hooksPath x',
    'git config --global alias.x y',
    'git config diff.external x',
    'git config core.pager x',
    'git config --add remote.origin.push x',
    'git config --unset remote.origin.pushurl',
    'git config --remove-section remote.origin',
    'git config -e',
    'git config --file x core.pager y',
  ]) denied(cmd);
  for (const cmd of [
    'git config user.name x',
    'git config --global user.email a@b.c',
    'git config --get remote.origin.url',
    'git config --list',
    'git config -l',
    'git config remote.origin.url',
    'git config --get-regexp alias',
  ]) allowed(cmd);
});

test('a push from a repo with submodules is denied', () => {
  denied('git push origin main', fakeRepo({ submodules: true }));
});

test('edits under .git, .claude/repo-standup and settings.local.json are denied', () => {
  for (const tool of ['Edit', 'Write', 'NotebookEdit']) {
    for (const p of [
      '.git/hooks/pre-push',
      'C:\\proj\\.git\\config',
      '/home/u/proj/.git/config',
      '.claude/repo-standup/guard.mjs',
      '.claude/repo-standup/client-repo',
      'C:\\proj\\.claude\\repo-standup\\pre-push.mjs',
      '.claude/settings.local.json',
      '.git',
    ]) denied(p, fakeRepo(), tool);
    for (const p of ['src/app.js', '.gitignore', '.github/workflows/x.yml', 'docs/.claude-notes.md']) {
      allowed(p, fakeRepo(), tool);
    }
  }
});

test('shell commands naming the protected paths are denied', () => {
  denied('echo x > .git/hooks/pre-push');
  denied('rm .claude/repo-standup/guard.mjs');
  denied('Set-Content .claude\\settings.local.json x', fakeRepo(), 'PowerShell');
  denied('cat .claude/repo-standup/client-repo');
  denied('cd .git');
  allowed('git remote add origin git@bitbucket.org:pellsoftware/acme.git');
  allowed('cat .gitignore');
});

test('redirections after the allowed push shape are allowed', () => {
  allowed('git push origin main 2>$null', fakeRepo(), 'PowerShell');
  allowed('git push origin main 2>&1');
  allowed('git push origin main > out.txt');
  allowed('git push origin main 2> err.txt');
  denied('git push origin staging 2>&1');
});

test('accepted over-blocking: a heredoc commit message naming push, and git lfs', () => {
  denied('git commit -m "$(cat <<\'EOF\'\nfix the push path\nEOF\n)"');
  denied('git lfs pull');
});

test('the allowed cases from earlier rounds stay allowed', () => {
  allowed('git push origin main');
  allowed('git -C "C:\\Users\\a b\\fork" push origin main', fakeRepo({ urls: [CLIENT_ORIGIN] }));
  allowed('git log --grep push');
  allowed('git stash push');
  allowed('git commit -m "push the fix"');
});

test('the entry point always judges the command', () => {
  const ps = '$g="gi"+"t"; & $g ("pu"+"sh") --no-verify -f origin HEAD:staging';
  assert.equal(decision(runEntry({ tool_name: 'PowerShell', tool_input: { command: ps }, cwd: '.' })), 'deny');
  const sh = 'G=gi U=u; ${G}t p${U}sh --no-verify -f origin HEAD:staging';
  assert.equal(decision(runEntry({ tool_name: 'Bash', tool_input: { command: sh }, cwd: '.' })), 'deny');
  assert.equal(runEntry({ tool_name: 'Bash', tool_input: { command: 'npm test' }, cwd: '.' }).stdout, '');
});

test('the entry point judges Edit, Write and NotebookEdit calls', () => {
  const write = runEntry({ tool_name: 'Write', tool_input: { file_path: '.git/hooks/pre-push', content: 'x' }, cwd: '.' });
  assert.equal(decision(write), 'deny');
  const nb = runEntry({ tool_name: 'NotebookEdit', tool_input: { notebook_path: '.claude/settings.local.json' }, cwd: '.' });
  assert.equal(decision(nb), 'deny');
  assert.equal(runEntry({ tool_name: 'Edit', tool_input: { file_path: 'src/a.js' }, cwd: '.' }).stdout, '');
});

test('stdin with a byte-order mark parses; stdin that does not parse is denied', () => {
  const forced = { tool_name: 'Bash', tool_input: { command: 'git push --force origin main' }, cwd: '.' };
  const status = { tool_name: 'Bash', tool_input: { command: 'git status' }, cwd: '.' };
  const run = (input) => spawnSync('node', [GUARD], { input, encoding: 'utf8' });
  assert.equal(decision(run('\uFEFF' + JSON.stringify(forced))), 'deny');
  assert.equal(run('\uFEFF' + JSON.stringify(status)).stdout, '');
  const bad = run('not json {');
  assert.equal(bad.status, 0);
  assert.equal(decision(bad), 'deny');
});

test('the entry gate compares real paths, so a junction cannot skip the guard', (t) => {
  const link = path.join(mkdtempSync(path.join(tmpdir(), 'guard-link-')), 'linked');
  try {
    symlinkSync(HOOKS_DIR, link, 'junction');
  } catch (error) {
    t.skip(`cannot create a junction here: ${error.message}`);
    return;
  }
  const out = spawnSync('node', [path.join(link, 'guard.mjs')], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git push --force origin main' }, cwd: '.' }),
    encoding: 'utf8',
  });
  assert.equal(decision(out), 'deny');
});

test('the client repo comes from the pinned file, never client.yaml', () => {
  const dir = makeClientDir();
  writeFileSync(path.join(dir, 'client.yaml'), 'repository:\n  bitbucket: other/thing\n');
  assert.equal(pushIn(dir).stdout, '');
  const unpinned = mkdtempSync(path.join(tmpdir(), 'guard-unpinned-'));
  git(unpinned, 'init', '-q');
  git(unpinned, 'remote', 'add', 'origin', 'git@bitbucket.org:pellsoftware/acme.git');
  writeFileSync(path.join(unpinned, 'client.yaml'), 'repository:\n  bitbucket: pellsoftware/acme\n');
  assert.equal(decision(pushIn(unpinned)), 'deny');
});

test('the entry point denies a push from a repo with submodules', () => {
  const dir = makeClientDir();
  writeFileSync(path.join(dir, '.gitmodules'), '');
  assert.equal(decision(pushIn(dir)), 'deny');
  const recurse = makeClientDir();
  git(recurse, 'config', 'push.recurseSubmodules', 'on-demand');
  assert.equal(decision(pushIn(recurse)), 'deny');
  const fine = makeClientDir();
  git(fine, 'config', 'submodule.recurse', 'false');
  assert.equal(pushIn(fine).stdout, '');
});
