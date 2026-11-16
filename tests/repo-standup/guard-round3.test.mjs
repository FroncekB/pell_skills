// Fix round 3: the diff handoff, canonical protected paths, nested code, lexer
// gaps by shell, and the last bypasses the re-reviews found. Each command is
// verbatim from the findings file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, symlinkSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathContext } from '../../plugins/pell/skills/repo-standup/hooks/protected-paths.mjs';
import { SETTINGS, fakeRepo, allowed, denied, runEntry, decision } from './helpers.mjs';

const BACKTICK = '\u0060';
const PS = 'PowerShell';
const here = process.cwd().replace(/\\/g, '/');
const caseInsensitive = process.platform === 'win32' || process.platform === 'darwin';

// A repo whose paths resolve against a temp project, so path tests control the folders.
function projectRepo() {
  const projectDir = mkdtempSync(path.join(os.tmpdir(), 'guard-proj-'));
  mkdirSync(path.join(projectDir, '.git'));
  mkdirSync(path.join(projectDir, '.claude', 'repo-standup'), { recursive: true });
  return { projectDir, repo: { ...fakeRepo(), pathContext: () => pathContext({ cwd: projectDir, projectDir }) } };
}

test('the diff handoff is allowed, in relative and absolute forms', () => {
  allowed('git diff --output=.git/pell-repo-standup.diff main...unit/U-3');
  allowed(`git diff --output=${here}/.git/pell-repo-standup.diff main...unit/U-3`);
  allowed(`git diff --output="${here}/.git/pell-repo-standup.diff" main...unit/U-3`, fakeRepo(), PS);
  allowed('git diff --stat main...unit/U-3');
  allowed('git diff --output=.git/pell-review.diff origin/main...abc123');
  allowed('.git/pell-repo-standup.diff', fakeRepo(), 'Read');
});

test('nothing else under .git is reachable through the diff handoff', () => {
  denied('git diff --output=.git/config main...unit/U-3');
  denied('git diff --output=.git/hooks/pre-push main...unit/U-3');
  denied('git diff --output=.git/pell-x/../hooks/pre-push main');
  denied('git diff --output=.git/pell-x.txt main');
  denied('git diff --output=.git/pell-x/y.diff main');
});

test('bundled short options are checked letter by letter', () => {
  denied('git rebase -qx "git push --force origin HEAD:staging" HEAD~1');
  denied('git clone -c core.sshCommand=x a b');
  denied('git clone --config core.sshCommand=x a b');
  denied('git clone --conf=core.sshCommand=x a b');
  denied('git init -c core.x=y');
  denied('git submodule add -c core.x=y a b');
  denied('git clone -qu x a b');
  allowed('git rebase -q --onto a b');
  allowed('git rebase -i HEAD~3');
  allowed('git clone -q a b');
});

test('protected paths are canonical: case, trailing dots, streams, .. and junctions', (t) => {
  const { projectDir, repo } = projectRepo();
  for (const tool of ['Write', 'Edit', 'NotebookEdit', 'MultiEdit']) {
    denied(path.join(projectDir, '.git', 'hooks', 'pre-push'), repo, tool);
    denied(path.join(projectDir, 'src', '..', '.git', 'config'), repo, tool);
    denied('.git/config', repo, tool);
    denied(path.join(projectDir, '.claude', 'repo-standup', 'guard.mjs'), repo, tool);
    allowed(path.join(projectDir, 'src', 'app', 'jobs', 'JobsPage.tsx'), repo, tool);
  }
  if (caseInsensitive) {
    denied(`${projectDir}/.GIT/hooks/pre-push`, repo, 'Write');
    denied(`${projectDir}/.Claude/Repo-Standup/guard.mjs`, repo, 'Write');
    denied(`C:/proj/.GIT/hooks/pre-push`, repo, 'Write');
  }
  if (process.platform === 'win32') {
    denied(`${projectDir}/.git./config`, repo, 'Write');
    denied(`${projectDir}/.git /config`, repo, 'Write');
    denied(`${projectDir}/.git::$INDEX_ALLOCATION/config`, repo, 'Write');
  }
  try {
    symlinkSync(path.join(projectDir, '.git'), path.join(projectDir, 'linked'), 'junction');
  } catch (error) {
    t.skip(`cannot create a junction here: ${error.message}`);
    return;
  }
  denied(path.join(projectDir, 'linked', 'hooks', 'pre-push'), repo, 'Write');
  denied('cat linked/config', repo);
});

test('the settings files and git config are protected, for any tool', () => {
  const home = os.homedir();
  for (const p of [
    '.claude/settings.json',
    '.claude/settings.local.json',
    path.join(home, '.claude', 'settings.json'),
    path.join(home, '.claude', 'settings.local.json'),
    path.join(home, '.gitconfig'),
    path.join(home, '.config', 'git', 'config'),
    '~/.gitconfig',
    '~/.claude/settings.json',
  ]) {
    for (const tool of ['Write', 'Edit', 'MultiEdit', 'SomeNewTool']) denied(p, fakeRepo(), tool);
  }
  allowed('src/app/jobs/JobsPage.tsx', fakeRepo(), 'Edit');
  allowed('.claude/commands/x.md', fakeRepo(), 'Write');
  allowed('docs/.gitignore', fakeRepo(), 'Write');
});

test('the entry point checks any tool that carries a path, and the matcher is *', () => {
  const settings = JSON.parse(readFileSync(SETTINGS, 'utf8'));
  assert.equal(settings.hooks.PreToolUse[0].matcher, '*');
  for (const [tool, input] of [
    ['MultiEdit', { file_path: '.git/config' }],
    ['SomeNewTool', { file_path: '.claude/repo-standup/guard.mjs' }],
    ['SomeNewTool', { path: '.git/hooks/pre-push' }],
    ['Read', { file_path: '.claude/settings.local.json' }],
    ['NotebookEdit', { notebook_path: '.git/config' }],
  ]) {
    assert.equal(decision(runEntry({ tool_name: tool, tool_input: input, cwd: '.' })), 'deny', tool);
  }
  for (const [tool, input] of [
    ['Read', { file_path: 'src/app/jobs/JobsPage.tsx' }],
    ['Edit', { file_path: 'src/app/jobs/JobsPage.tsx' }],
    ['Glob', { pattern: '**/*.ts' }],
    ['SomeNewTool', {}],
  ]) {
    assert.equal(runEntry({ tool_name: tool, tool_input: input, cwd: '.' }).stdout, '', tool);
  }
});

test('the hook command fails closed when the guard is missing or crashes', () => {
  const settings = JSON.parse(readFileSync(SETTINGS, 'utf8'));
  assert.equal(
    settings.hooks.PreToolUse[0].hooks[0].command,
    'node "$CLAUDE_PROJECT_DIR/.claude/repo-standup/guard.mjs" || exit 2',
  );
});

test('deleting, moving or entering the .claude folder or .git is denied', () => {
  for (const cmd of [
    'rm -rf .claude',
    'cd .claude && rm -r repo-standup',
    'rm -r .git',
    'rmdir .claude',
    'mv .claude old-claude',
    'mv .git old-git',
    'rm -rf .',
    'git clean -fdx',
    'git clean -n',
  ]) denied(cmd);
  for (const cmd of [
    'Remove-Item .claude -Recurse',
    'Remove-Item -Path .git -Recurse -Force',
    'Move-Item .claude x',
    'Rename-Item .git x',
    'ren .claude x',
    'del .claude',
    'erase .claude',
    'rd /s .claude',
    'Set-Location .claude',
    'cd .claude',
    'pushd .claude',
  ]) denied(cmd, fakeRepo(), PS);
  allowed('rm -rf dist');
  allowed('rm -rf node_modules');
  allowed('cd src && ls');
});

test('creating links is denied', () => {
  denied('ln -s .git x');
  denied('ln x y');
  denied('mklink /j x .git', fakeRepo(), PS);
  denied('New-Item -ItemType SymbolicLink -Path x -Target .git', fakeRepo(), PS);
  denied('New-Item -ItemType Junction -Path x -Target y', fakeRepo(), PS);
  denied('New-Item -ItemType HardLink -Path x -Target y', fakeRepo(), PS);
  denied('ni -ItemType Junction -Path x -Target y', fakeRepo(), PS);
  denied('cmd /c mklink /j x y', fakeRepo(), PS);
  allowed('New-Item -ItemType Directory -Path x', fakeRepo(), PS);
});

test('nested code strings are judged as their own commands', () => {
  denied("bash -c 'G=gi U=u; ${G}t p${U}sh --no-ve${X}rify -f origin HEAD:main'");
  denied('bash -c "rm -rf .claude"');
  denied('sh -c "git -c core.pager=x log"');
  denied('bash -lc "git x"');
  denied('/bin/bash -c "git config core.hooksPath x"');
  denied('pwsh -Command "Remove-Item .claude -Recurse"', fakeRepo(), PS);
  denied('powershell -c "& $x"', fakeRepo(), PS);
  denied('cmd /c rd /s .claude', fakeRepo(), PS);
  denied('pwsh -EncodedCommand ZwBpAHQA', fakeRepo(), PS);
  denied('powershell -enc ZwBpAHQA', fakeRepo(), PS);
  denied('powershell -e ZwBpAHQA', fakeRepo(), PS);
  denied('pwsh -EncodedCommand "git status"', fakeRepo(), PS);
  allowed('bash -c "echo hi"');
  allowed('bash -c "git status"');
  allowed('sh -c "ls -la"');
  allowed('pwsh -Command "git status"', fakeRepo(), PS);
  allowed('powershell -NoProfile -Command "Get-Date"', fakeRepo(), PS);
  allowed('cmd /c dir', fakeRepo(), PS);
});

test('node, python, perl and ruby code that names git, push or process spawning is denied', () => {
  denied("node -e \"require('child_process').execSync('x')\"");
  denied('node -p "process.binding(\'spawn_sync\')" git');
  denied('node -e "spawn(1)"');
  denied('python -c "import subprocess"');
  denied('python3 -c "import os; os.system(\'x\')"');
  denied("perl -e 'system(\"x\")'");
  denied("ruby -e 'exec \"x\"'");
  denied('node -e "git"');
  allowed('node -e "console.log(1)"');
  allowed('python -c "print(1)"');
  allowed('node script.js');
});

test('Bash ANSI-C quoting is denied in a command naming git or push', () => {
  denied("git log $'\\'' ; git push --force origin main");
  denied("git $'push' -f origin main");
  allowed("echo $'a\\tb'");
});

test('PowerShell here-strings and smart quotes are quoted text', () => {
  allowed("git commit -m @'\nfix; git push -f\n'@", fakeRepo(), PS);
  allowed('git commit -m @"\nfix; git push -f\n"@', fakeRepo(), PS);
  allowed('git commit -m \u201Cfix; git push -f\u201D', fakeRepo(), PS);
  allowed('git commit -m \u2018fix; git push -f\u2019', fakeRepo(), PS);
  denied('git log \u201Cx\u201D ; git push --force origin main', fakeRepo(), PS);
  denied('git log \u2018x\u2019 ; git push --force origin main', fakeRepo(), PS);
  denied("git log @'\nx\n'@\ngit push --force origin main", fakeRepo(), PS);
  denied('git commit -m @"\n$(git push -f)\n"@', fakeRepo(), PS);
});

test('the escape character follows the shell: a backslash is literal in PowerShell', () => {
  denied('git log \\; git push -f origin main', fakeRepo(), PS);
  allowed('git log \\; git push origin main', fakeRepo({ urls: [] }), 'Bash');
  allowed('git -C "C:\\Users\\a b\\fork" log', fakeRepo(), PS);
  allowed('git push origin main', fakeRepo(), PS);
  denied('git push origin main `\ngit push -f', fakeRepo(), PS);
});

test('Bash backticks hold a nested command; PowerShell backticks escape', () => {
  allowed('git commit -m "fix `x` path"');
  denied('git commit -m "`git push -f`"');
  denied('echo `git push -f`');
  denied(`git pu${BACKTICK}sh -f`, fakeRepo(), PS);
  allowed(`git commit -m "fix ${BACKTICK}x${BACKTICK} path"`, fakeRepo(), PS);
});

test('keyword prefixes are stripped before judging', () => {
  denied('! git -c core.sshCommand=x fetch');
  denied('then git config include.path x');
  denied('do git push -f');
  denied('else git config core.hooksPath x');
  denied('time git -c a=b status');
  denied('if git -c a=b status');
  denied('while git -c a=b status');
  denied('until git -c a=b status');
  allowed('! git status');
  allowed('time git status');
  allowed('if git status');
});

test('a glob or variable that could name a protected folder is denied', () => {
  denied('cat .gi?/config');
  denied('rm .cl*');
  denied('cat .g*/config');
  denied('cat $d/.git/config');
  denied('cat ${d}/.claude/settings.json');
  denied('ls .*');
  allowed('git add .github/*');
  allowed('git add .eslintrc*');
  allowed('git add -- *.ts');
  allowed('cat .gitignore');
});

test('redirections and git config get/set', () => {
  allowed('git push origin main *>$null', fakeRepo(), PS);
  allowed('git push origin main 2>$null', fakeRepo(), PS);
  allowed('git config get user.name');
  allowed('git config list');
  allowed('git config set user.name x');
  allowed('git config set --global user.email a@b.c');
  denied('git config set core.hooksPath x');
  denied('git config set alias.x y');
  denied('git config set remote.origin.pushurl x');
  denied('git config unset core.pager');
  denied('git config edit');
  denied('git config rename-section a b');
});

test('the allowed cases the run depends on stay allowed', () => {
  for (const cmd of [
    'git push origin main',
    'git log --grep push',
    'git stash push',
    'git commit -m "push the fix"',
    'git add -A',
    'git switch -C unit/U-3 main',
    'git merge --ff-only unit/U-3',
    'git -C "C:\\Users\\a b\\fork" push origin main',
  ]) allowed(cmd);
  allowed("$env:UPDATE_OPENAPI = '1'; dotnet test", fakeRepo(), PS);
  allowed("$env:UPDATE_OPENAPI='1'", fakeRepo(), PS);
  allowed('$env:UPDATE_OPENAPI = "true"', fakeRepo(), PS);
  allowed('git -C "C:\\Users\\a b\\fork" push origin main', fakeRepo(), PS);
  allowed('src/app/jobs/JobsPage.tsx', fakeRepo(), 'Edit');
});
