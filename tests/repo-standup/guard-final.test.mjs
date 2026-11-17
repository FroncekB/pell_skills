// The final review's fixes: a command from any tool is judged as a shell command,
// a PowerShell pipeline delete, and the temp folders the tests make. Commands
// quoted in the findings file are verbatim; the rest are built from each item's rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fakeRepo, allowed, denied, runEntry, decision, makeClientDir } from './helpers.mjs';

const PS = 'PowerShell';
const COMMAND_TOOLS = ['Monitor', 'mcp__terminal__run_in_terminal'];
const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const entry = (tool, toolInput, cwd = '.', env = {}) => runEntry({ tool_name: tool, tool_input: toolInput, cwd }, env);

test('2: a command from Monitor or an MCP terminal is judged as a Bash command', () => {
  for (const tool of COMMAND_TOOLS) {
    for (const command of [
      'git push --no-verify --force origin HEAD:refs/heads/x',
      'rm -rf .claude/repo-standup',
      'git push --force origin main',
      'git -c core.pager=x log',
      "bash -c 'rm -rf .claude'",
    ]) {
      assert.equal(decision(entry(tool, { command, description: 'x' })), 'deny', `${tool}: ${command}`);
    }
    for (const command of ['npm test', 'git status', 'git log --grep push']) {
      assert.equal(entry(tool, { command }).stdout, '', `${tool}: ${command}`);
    }
  }
});

test('2: a push runs only from the Bash or PowerShell tool', () => {
  const dir = makeClientDir();
  const env = { CLAUDE_PROJECT_DIR: dir };
  assert.equal(entry('Bash', { command: 'git push origin main' }, dir, env).stdout, '');
  for (const tool of COMMAND_TOOLS) {
    assert.equal(decision(entry(tool, { command: 'git push origin main' }, dir, env)), 'deny', tool);
  }
});

test('2: a tool with a command still has its path fields checked', () => {
  assert.equal(decision(entry('SomeNewTool', { command: 'npm test', file_path: '.git/config' })), 'deny');
  assert.equal(decision(entry('Monitor', { command: 'npm test', path: '.claude/settings.local.json' })), 'deny');
  assert.equal(entry('SomeNewTool', { command: 'npm test', path: 'src/app' }).stdout, '');
  assert.equal(entry('SomeNewTool', { command: 42 }).stdout, '');
  assert.equal(decision(entry('Bash', { command: 42 })), 'deny');
});

test('2: a PowerShell pipeline delete on a line that names .claude or .git is denied', () => {
  denied('Get-ChildItem .claude | Remove-Item -Recurse', fakeRepo(), PS);
  denied("'.claude' | Remove-Item -Recurse", fakeRepo(), PS);
  denied('Get-ChildItem -Path .git -Recurse | Remove-Item -Force', fakeRepo(), PS);
  denied('ls .claude | rm -Recurse', fakeRepo(), PS);
  denied('Get-Item .claude | Move-Item -Destination old', fakeRepo(), PS);
  denied('pwsh -Command "Get-ChildItem .claude | Remove-Item -Recurse"', fakeRepo(), 'Bash');
  assert.equal(decision(entry(PS, { command: "'.claude' | Remove-Item -Recurse" })), 'deny');
  allowed('Get-ChildItem dist | Remove-Item -Recurse', fakeRepo(), PS);
  allowed('Get-ChildItem *.log | Remove-Item', fakeRepo(), PS);
  allowed('Get-ChildItem .claude/commands | Select-Object Name', fakeRepo(), PS);
  allowed('Get-ChildItem .gitignore | Select-Object Length', fakeRepo(), PS);
});

test('2: the run\'s normal commands stay allowed', () => {
  for (const cmd of [
    'git push origin main',
    'git add -A',
    'git commit -m "Unit U-3: Approve an order" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"',
    'git switch -C unit/U-3 main',
    'git merge --ff-only unit/U-3',
    'git diff --output=.git/pell-repo-standup.diff main...unit/U-3',
  ]) {
    allowed(cmd);
    allowed(cmd, fakeRepo(), PS);
  }
  allowed("$env:UPDATE_OPENAPI = '1'; dotnet test", fakeRepo(), PS);
  allowed('npm run lint; if ($?) { npm run typecheck }; if ($?) { npm test }', fakeRepo(), PS);
  allowed('src/app/jobs/JobsPage.tsx', fakeRepo(), 'Edit');
  assert.equal(entry('Edit', { file_path: 'src/app/jobs/JobsPage.tsx', old_string: 'a', new_string: 'b' }).stdout, '');
});

test('9: the folders the helpers make are removed when the test file ends', () => {
  const helpers = pathToFileURL(path.join(TESTS_DIR, 'helpers.mjs')).href;
  const code = [
    "import { test } from 'node:test';",
    `import { makeClientDir, tempDir } from ${JSON.stringify(helpers)};`,
    "test('t', () => { console.log('MADE ' + JSON.stringify([makeClientDir(), tempDir('guard-cleanup-')])); });",
  ].join('\n');
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const made = JSON.parse(/MADE (.*)/.exec(r.stdout)[1]);
  assert.equal(made.length, 2);
  for (const dir of made) assert.equal(existsSync(dir), false, `left behind: ${dir}`);
});

test('9: test files make temp folders only through the helpers', () => {
  const self = path.basename(fileURLToPath(import.meta.url));
  for (const file of readdirSync(TESTS_DIR).filter((f) => f.endsWith('.test.mjs') && f !== self)) {
    assert.doesNotMatch(readFileSync(path.join(TESTS_DIR, file), 'utf8'), /mkdtemp/, file);
  }
});
