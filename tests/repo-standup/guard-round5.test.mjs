// Fix round 5: PowerShell success chaining, and the last cheap residuals.
// Commands quoted in the findings file are verbatim; the rest are built from
// each item's rule.
import { test } from 'node:test';
import { fakeRepo, allowed, denied } from './helpers.mjs';

const PS = 'PowerShell';

test('1: PowerShell if ($?) chaining is allowed, and its statements are judged', () => {
  allowed('npm run lint; if ($?) { npm test }', fakeRepo(), PS);
  allowed('dotnet build X.sln -c Release; if ($?) { dotnet test X.Tests -c Release }', fakeRepo(), PS);
  denied('npm test; if ($?) { git push --force origin main }', fakeRepo(), PS);
  denied('if ($?) { Remove-Item -Recurse .claude }', fakeRepo(), PS);
});

test('1: the elseif and else forms, the other success conditions, and compact spacing', () => {
  allowed('npm run lint; if (-not $?) { exit 1 }', fakeRepo(), PS);
  allowed(
    'npm run build; if ($LASTEXITCODE -eq 0) { npm test } elseif ($LASTEXITCODE -ne 0) { npm run report } else { npm run clean }',
    fakeRepo(),
    PS,
  );
  allowed('npm run lint; if($?){npm test}', fakeRepo(), PS);
  allowed('pwsh -Command "npm run lint; if ($?) { npm test }"', fakeRepo(), PS);
  denied('if($?){Remove-Item -Recurse .claude}', fakeRepo(), PS);
  denied('npm test; if ($?) { npm run x } else { git -c a=b log }', fakeRepo(), PS);
});

test('1: any other condition is still an expression', () => {
  denied('if ($x -eq 1) { git status }', fakeRepo(), PS);
  denied('if ($LASTEXITCODE -eq 1) { git status }', fakeRepo(), PS);
  denied('$LASTEXITCODE -eq 0; git status', fakeRepo(), PS);
});

test('2: a heredoc delimiter with $ or another unusual character is denied', () => {
  denied("cat <<$'EOF'\nx\nEOF\nrm -rf .claude");
  denied('cat <<$"EOF"\nx\nEOF\nrm -rf .claude');
  denied("cat <<'E.O.F'\nx\nE.O.F\nnpm test");
  denied('cat <<"$x"\nbody\n$x');
  allowed("cat <<'END_OF-MSG2'\nIt's done\nEND_OF-MSG2");
  allowed('cat <<\\EOF\nIt\'s done\nEOF');
});

test('3: << inside (( )) or $(( )) is arithmetic, not a heredoc', () => {
  denied('(( y = 1 << 2 ))\nrm -rf .claude');
  denied('echo $(( 1 << 2 ))\nrm -rf .claude');
  denied('x=$((1<<2))\nrm -rf .claude');
  allowed('(( y = 1 << 2 ))');
  allowed('echo $(( 1 << 2 ))\nnpm test');
  denied('echo $(( $(rm -rf .claude) + 1 ))');
});

test('4: a PowerShell assignment in front of a delete is stripped before the path rules', () => {
  denied('$null = Remove-Item .claude -Recurse -Force', fakeRepo(), PS);
  denied('$x = Remove-Item .claude -Recurse', fakeRepo(), PS);
  denied('$a = $b = Remove-Item .claude -Recurse', fakeRepo(), PS);
  denied('$x=Remove-Item .claude -Recurse', fakeRepo(), PS);
  allowed('$x = Remove-Item dist -Recurse', fakeRepo(), PS);
  allowed('$null = New-Item -ItemType Directory -Path out', fakeRepo(), PS);
});

test('5: xargs running a delete on a line that names .git or .claude is denied', () => {
  denied('echo .claude | xargs rm -rf');
  denied('echo .git | xargs -0 rmdir');
  denied('ls -d .claude | xargs mv -t old');
  allowed('find . -name "*.tmp" | xargs rm');
  allowed('git ls-files -z -- "*.log" | xargs -0 rm -f');
  allowed('ls .claude/commands | xargs cat');
});
