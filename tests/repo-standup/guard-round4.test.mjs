// Fix round 4: the cheap residuals. Commands quoted in the findings file are
// verbatim; the rest are built from each item's rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeRepo, allowed, denied, runEntry, decision } from './helpers.mjs';

const PS = 'PowerShell';
const here = process.cwd().replace(/\\/g, '/');

test('1: nested -c code is the first non-option word after the cluster holding c', () => {
  denied("bash -c -x 'echo x > .git/config'");
  denied("bash -c -x 'echo {} > .claude/settings.local.json'");
  denied("bash -c -- 'git -c core.sshCommand=x fetch'");
  denied("bash -c '$0 $1' git push");
  denied("bash -c 'echo hi' extra");
  denied("sh -xc 'echo hi' x y");
  denied('bash -c');
  denied('bash -c -x');
  allowed("bash -c -x 'echo hi'");
  allowed("bash -x -c 'git status'");
  allowed('bash -c "git status" 2>&1');
});

test('1: after the inner code passes, the wrapper and whole-text path checks still run', () => {
  denied("bash -c 'cat \"a .git/config\"'");
  denied("bash -c 'echo \"x .claude/settings.local.json\"'");
  denied("bash --rcfile git.rc -c 'echo hi'");
  allowed("bash -c 'cat docs/readme.md src/.gitignore'");
});

test('2: a bare first argument to powershell or pwsh is the command', () => {
  for (const tool of [PS, 'Bash']) {
    denied('powershell "Set-Content .claude\\settings.local.json x"', fakeRepo(), tool);
    denied('powershell "Remove-Item -Recurse .claude"', fakeRepo(), tool);
    denied('pwsh -NoProfile "Remove-Item -Recurse .claude"', fakeRepo(), tool);
    denied('pwsh -ExecutionPolicy Bypass "Remove-Item -Recurse .claude"', fakeRepo(), tool);
    denied('pwsh -NoProfile -Command', fakeRepo(), tool);
  }
  allowed('powershell "Get-Date"', fakeRepo(), PS);
  allowed('pwsh -NoProfile "git status"', fakeRepo(), PS);
  allowed('pwsh -NoProfile -File build.ps1 -Configuration Release', fakeRepo(), PS);
});

test('3: wrapper words before an interpreter or a command are skipped before judging', () => {
  for (const cmd of [
    "env bash -c 'echo x > .git/config'",
    "env -i FOO=1 bash -c 'rm -rf .claude'",
    "nohup bash -c 'echo {} > .claude/settings.local.json'",
    "timeout 5 bash -c 'echo x > .git/config'",
    'timeout -s KILL 5 rm -rf .claude',
    'nice -n 5 rm -rf .claude',
    'nice -5 rm -rf .claude',
    'sudo rm -rf .claude',
    'sudo -u root mv .git x',
    'command rm -rf .claude',
    'exec rm -rf .claude',
    'exec -a x rm -rf .claude',
    'xargs -0 rm -rf .claude',
    'xargs -n 1 rm -rf .claude',
    'nohup ln -s .git x',
    'sudo env nohup bash -c "rm -rf .claude"',
    'env FOO=1 git status',
    'env -S "rm -rf .claude"',
  ]) denied(cmd);
  denied('nohup pwsh -Command "Remove-Item .claude -Recurse"', fakeRepo(), PS);
  allowed('nohup npm run dev');
  allowed('timeout 60 npm test');
  allowed('env FOO=1 npm test');
  allowed('nice -n 10 npm run build');
  allowed('git ls-files | xargs grep foo');
});

test('4: a glob or variable after or inside a .git or .claude component is denied', () => {
  denied('cat .claude/*/guard.mjs');
  denied('cat .git/hoo*');
  denied('rm -rf .claude/*');
  denied('Remove-Item .claude\\* -Recurse', fakeRepo(), PS);
  denied("Get-Content '.claude/settings*'", fakeRepo(), PS);
  denied('cat .claude/$x');
  allowed('git add .github/*');
  allowed('git add .eslintrc*');
  allowed('ls .claude/commands');
});

test('5: the settings files and the guard folder match by component, after a cd', () => {
  denied('cd src && cat ../.claude/settings.json');
  denied('cd src && echo {} > ../.claude/settings.local.json');
  denied('cd src; Set-Content ..\\.claude\\settings.local.json x', fakeRepo(), PS);
  denied('cd src && cat ../.claude/repo-standup/guard.mjs');
  denied('src/../../x/.claude/settings.json', fakeRepo(), 'Write');
  allowed('cd src && cat ../.claude/commands/x.md');
  allowed('.claude/commands/x.md', fakeRepo(), 'Write');
});

test('6: shell forms of the home git config are denied', () => {
  denied('cat $HOME/.gitconfig');
  denied('cat ${HOME}/.gitconfig');
  denied('cat ~/.gitconfig');
  denied('echo x >> "$HOME/.config/git/config"');
  denied('echo x >> $XDG_CONFIG_HOME/git/config');
  denied('Get-Content $env:USERPROFILE\\.gitconfig', fakeRepo(), PS);
  denied('Add-Content "$env:USERPROFILE\\.gitconfig" x', fakeRepo(), PS);
  denied('type %USERPROFILE%\\.gitconfig', fakeRepo(), PS);
  allowed('cat .gitconfig');
});

test('7: long options are compared to the command-running options at any prefix length', () => {
  denied('git rebase --ex "git push --force origin HEAD:staging" HEAD~1');
  denied('git rebase --e "x" HEAD~1');
  denied('git rebase --exe "x" HEAD~1');
  denied('git fetch --up=x origin');
  denied('git fetch --rec=x origin');
  denied('git grep --op foo');
  denied('git clone --co core.sshCommand=x a b');
  allowed('git add -- *.ts');
  allowed('git rebase --empty=drop main');
  allowed('git fetch --recurse-submodules=no origin');
  allowed('git log --reverse');
});

test('8: source, destination, target and paths are checked; other fields are not', () => {
  for (const [tool, input] of [
    ['mcp__filesystem__move_file', { source: '.git/config', destination: 'x' }],
    ['mcp__filesystem__move_file', { source: 'x', destination: '.claude/settings.json' }],
    ['mcp__filesystem__read_multiple_files', { paths: ['src/a.ts', '.git/config'] }],
    ['SomeNewTool', { target: '.claude/repo-standup/guard.mjs' }],
  ]) {
    assert.equal(decision(runEntry({ tool_name: tool, tool_input: input, cwd: '.' })), 'deny', tool);
  }
  for (const [tool, input] of [
    ['mcp__filesystem__move_file', { source: 'a.txt', destination: 'b.txt' }],
    ['mcp__filesystem__read_multiple_files', { paths: ['src/a.ts', 'src/b.ts'] }],
    ['Agent', { prompt: 'Read .git/pell-repo-standup.diff, not .git/config', description: 'review' }],
  ]) {
    assert.equal(runEntry({ tool_name: tool, tool_input: input, cwd: '.' }).stdout, '', tool);
  }
});

test('9: the diff handoff accepts the Git Bash drive form', { skip: process.platform !== 'win32' }, () => {
  const gitBash = `/${here[0].toLowerCase()}${here.slice(2)}`;
  allowed(`git diff --output=${gitBash}/.git/pell-repo-standup.diff main...unit/U-3`);
  allowed(`${gitBash}/.git/pell-repo-standup.diff`, fakeRepo(), 'Read');
  denied(`git diff --output=${gitBash}/.git/config main...unit/U-3`);
});

test('9: a quoted heredoc body is literal text, but still counts for push and --no-verify', () => {
  allowed("git commit -m \"$(cat <<'EOF'\nFix the job's status\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nEOF\n)\"");
  allowed("git commit -F - <<'EOF'\nIt's done (finally)\nEOF");
  allowed("git commit -F - <<\"EOF\"\nIt's done\nEOF");
  allowed("cat <<'EOF' > notes.txt\nIt's (not) a $(command) or `this`\nEOF");
  allowed("git commit -F - <<-'EOF'\n\tIt's done\n\tEOF");
  denied("git commit -m \"$(cat <<'EOF'\nDon't push yet\nEOF\n)\"");
  denied("git commit -F - <<'EOF'\nIt's done --no-verify\nEOF");
  denied("cat <<'EOF'\nIt's done\nEOF\ngit push origin main");
  denied("cat <<'EOF'\nIt's done\nEOF\ngit -c a=b status");
  denied('cat <<EOF\n$(git -c a=b status)\nEOF');
  denied("bash <<'EOF'\nrm -rf .claude\nEOF");
  denied("sh <<< 'rm -rf .claude'");
  denied("bash <(echo 'rm -rf .claude')");
  denied("python - <<'EOF'\nimport subprocess\nEOF");
  denied("git commit -F - <<'EOF'\nIt's done\n");
});

test('extras: a redirect inside a word and a PowerShell -Param:value name a path', () => {
  denied('echo x>.git/config');
  denied("echo '{}'>.claude/settings.local.json");
  denied('Set-Content -Path:.claude/settings.json x', fakeRepo(), PS);
  allowed('git log --format="%h -> %s"');
});

test('the normal-work cases stay allowed', () => {
  for (const cmd of [
    'git push origin main',
    'git add -A',
    'git commit -m "Fix the jobs page"',
    'git switch -C unit/U-3 main',
    'git merge --ff-only unit/U-3',
    'git diff --output=.git/pell-repo-standup.diff main...unit/U-3',
  ]) allowed(cmd);
  allowed("$env:UPDATE_OPENAPI = '1'; dotnet test", fakeRepo(), PS);
  allowed('src/app/jobs/JobsPage.tsx', fakeRepo(), 'Edit');
});
