# Repo standup orchestrator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the repo-standup orchestrator: a push guard, Bitbucket branch restrictions at fork time, and a Pell skill that runs a client build from the fork to the handoff, plus the framework half it needs (the `scoreboard` command, test results written to files, a seed login per persona, and the new pack files).

**Architecture:** Two branches named `orchestrator`. The Pell_Skills branch holds the push guard (Node, with tests), the `repo-standup` skill and its references, and the `handoff-writer` agent. The framework branch adds the deterministic half: `scoreboard` reads the pack and the test results, computes each requirement's state, the queue's movable units and every numeric stop and alert condition, and writes `scoreboard.md` and the cost tables. Two trials prove the whole run.

**Tech Stack:** .NET 10, xUnit v3 with Shouldly, YamlDotNet; React 19, Vitest, Playwright; Node 22's built-in test runner; Claude Code plugin Markdown and a `PreToolUse` hook.

**Spec:** `docs/specs/2026-11-15-repo-standup-design.md` in this repo (approved by Brandon on 2026-11-15). Read it before any task. Design intake's spec and skill (branch `design-intake`) define the pack formats this plan reads.

## Before any task

- **Building waits until design intake's trial 1 passes** (Brandon). Then confirm with Brandon before starting.
- Pell_Skills: the worktree `pell-skills-orchestrator`, branch `orchestrator`. Once `design-intake` has merged into `main`, rebase `orchestrator` onto `main` first, since the skill calls design intake. Fold in anything the design intake session reported that trial 1 changed in the interface (the spec's "Interface with design intake").
- Framework: after design intake's framework half has merged into `react`, create a worktree from the framework checkout without changing that checkout, for example `git worktree add -b orchestrator ../pell-orchestrator react`.

## Global Constraints

- Never use Brandon's main checkouts, never touch the framework's `master`, and never push or merge: those are Brandon's.
- No client name anywhere in the framework or Pell_Skills: code, docs, tests, fixtures, examples or commit messages. Trial B's results stay outside both repos.
- No ruling or ledger IDs in code comments; `LedgerIdCommentTests` fails on them.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Framework code follows its `CLAUDE.md`:
  - warnings are errors, `this.` everywhere, file-scoped namespaces, `.cs` files UTF-8 with BOM
  - new classes `sealed`
  - xUnit v3 with Shouldly and hand-written fakes
  - package versions only in `Directory.Packages.props`
  - every check in "Standard commands" passes before a task's commit
- Pell_Skills follows its `CLAUDE.md`: plain-text output, no emoji or glyphs; `claude plugin validate ./plugins/pell` passes; housekeeping in the same change.
- Exact values from the spec:
  - Requirement IDs: `REQ-<SOW item>.<n>`, and `REQ-0.<n>`.
  - Unit IDs: `U-<n>`.
  - Tags:
    - Playwright: `{ tag: ['@REQ-14.3'] }`
    - xUnit: `[Trait("Req", "REQ-14.3")]`
    - Vitest: `@REQ-14.3` in the test name
  - Thresholds: blocked share over 30%, 3 parks in a row, `failed-env` on 2 units in a row, a batch every 10 merged units, a unit parked twice, 3 failed attempts per try, an integration-gap audit every 5 merged units, a unit over 3 times the median.
  - The guard's canary remote: `repo-standup-guard-check`.
  - Run-log outcome words: `merged`, `attempt-failed`, `failed-env`, `parked`, `phase`, `notified`, `stopped`, `queue`.
  - The fork's commit messages:
    - `Unit U-<n> starts`
    - `Unit U-<n>: <title>`
    - `Repo standup: the engineer's edits`

## Review Focus

1. **A requirement tagged in two kinds** (a Playwright scenario and an xUnit test) where one passes and the other fails: not Verified. Pinned in Task 6.
2. **A `@REQ` tag on `test.describe`**, with `test.fail()` in only one of its tests: that one test is expected-to-fail, the others count as passed. Pinned in Task 5.
3. **An xUnit theory with a `Req` trait and several data rows**, one of which fails: the requirement isn't Verified. Pinned in Task 5.
4. **A run log that mixes design intake's date-only lines, `unknown` tokens, and repo-standup's timed lines**: all parsed, and unknown tokens are reported as unknown, never as zero. Pinned in Tasks 4 and 9.
5. **A push with a quoted Windows path**, `git -C "C:\Users\a b\fork" push origin main`: parsed, and allowed only when that folder's `origin` is the client repo. Pinned in Task 1.

---

# Part B1: The push guard and the platform check (Pell_Skills, branch `orchestrator`)

These two run first: the spec's first task is proving the platform, and that needs the guard.

### Task 1: The push guard

**Files:**
- Create: `plugins/pell/skills/repo-standup/hooks/guard.mjs`
- Create: `plugins/pell/skills/repo-standup/hooks/settings.local.json`
- Test: `tests/repo-standup/guard.test.mjs`

**Interfaces:**
- Produces `export function decide(toolName, command, repo)`, which returns `{ allow: boolean, reason?: string }`.
  - `toolName` is `'Bash'` or `'PowerShell'`.
  - `repo` is `{ originUrlFor(dir): string | null, clientRepo: string | null }`. `clientRepo` is `client.yaml`'s `repository.bitbucket`, such as `pellsoftware/acme`.
  - Every `reason` starts with `repo-standup guard: `. The canary's reason is `repo-standup guard: canary`, which Task 13's guard check looks for.
- Produces the hook entry point. When run as a script, it reads the hook's stdin JSON (`tool_name`, `tool_input.command`, `cwd`).
  - It resolves `origin` with `git -C <dir> remote get-url origin`, only when the command holds `push`.
  - It reads `repository.bitbucket` from `client.yaml` at the repository root, with a line read, not a YAML package.
  - On a deny it prints `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"<reason>"}}`. On anything else it prints nothing and exits 0, so the normal permission flow continues.
- Produces `settings.local.json`: a `hooks.PreToolUse` entry with matcher `Bash|PowerShell` and command `node .claude/repo-standup/guard.mjs`. Task 13's setup copies both files into the fork.

- [ ] **Step 1: Write the failing tests** in `guard.test.mjs` with `node:test` and `node:assert/strict`. Use a fake `repo` whose `originUrlFor` returns from a map. Each test asserts `allow` and, for a deny, that `reason` starts with `repo-standup guard: `.
  - Allowed when origin is `git@ssh.bitbucket.org:pellsoftware/acme.git` and `clientRepo` is `pellsoftware/acme`:
    - `git push`
    - `git push origin`
    - `git push origin main`
    - `git push -u origin main`
  - Allowed: the same with origin `git@bitbucket.org:pellsoftware/acme.git`, `https://bitbucket.org/pellsoftware/acme.git` and `https://someone@bitbucket.org/pellsoftware/acme`.
  - Denied:
    - `git push --force origin main`, `git push -f`, `git push --force-with-lease origin main`, `git push origin +main`
    - `git push origin staging`, `git push origin main:staging`, `git push --delete origin main`, `git push --mirror`, `git push --all`, `git push --tags`
    - `git push upstream main`
  - Denied when origin is `git@ssh.bitbucket.org:pellsoftware/pell_web_app_framework.git`, even if `clientRepo` names it.
  - Denied: `cd x && git push -f`, `echo a; git push --force origin main`, `git -c a=b push -f origin main`, and PowerShell `& git push --force origin main`.
  - `git -C "C:\Users\a b\fork" push origin main`: allowed when `originUrlFor("C:\\Users\\a b\\fork")` is the client repo, and denied when it is another repository.
  - Denied, as unparseable: `git push $(echo --force)` and `eval "git push -f"`.
  - Canary: `git push --force --dry-run repo-standup-guard-check main` is denied with reason `repo-standup guard: canary`.
  - Allowed (not a git push): `git status`, `npm run push-notes`, `git log --grep push`.
  - Entry point: piping a deny case's JSON to `node guard.mjs` prints the deny object; piping `{"tool_name":"Bash","tool_input":{"command":"git status"},"cwd":"."}` prints nothing.
- [ ] **Step 2: Run them and see them fail.** `node --test tests/repo-standup/`. Expected: FAIL, `guard.mjs` doesn't exist.
- [ ] **Step 3: Implement `decide` and the entry point** in `guard.mjs`. Use only Node's standard library.
  - Split on `&&`, `||`, `;`, `|` and newlines outside quotes.
  - Strip a leading `&` (PowerShell's call operator).
  - Find `git`, skip its global options (`-C <dir>`, `-c <k=v>`, `--git-dir=<d>`), and look for `push` as the subcommand.
  - A segment that holds `push` but has `$(`, backticks or `eval` is unparseable: deny.
- [ ] **Step 4: Run the tests and see them pass.** `node --test tests/repo-standup/`. Expected: PASS.
- [ ] **Step 5: Commit** `Add the repo-standup push guard`.

**Amended 2026-11-16, after two security reviews.** The spec's "Hardening after two security reviews" list governs, and it overrides the steps above where they differ:
- **Allowed and denied tests that flip:**
  - `git push`, `git push origin` and `HEAD:main` are now denied.
  - `npm run push-notes` is now denied.
- **Tests to add,** each denied unless it says otherwise:
  - `git -c remote.origin.pushurl=<framework url> push origin main`, `git -c alias.x="push --force" x`, and a config alias (`git x`)
  - `bash -c "git push -f"`, `sh -c …`, `pwsh -c …`, `powershell -Command …`, `cmd /c …`, `env git push origin main`, `xargs git push -f`, `node -e …`
  - `git push --receive-pack=x origin main`, `--exec=x`, `--no-verify`, `--repo=x`, and abbreviations `--forc`, `--del`, `--mir`
  - `git p\ush -f`, `git "pu"sh -f`, and PowerShell ``git pu`sh -f``
  - `cd ../other && git push origin main`, `GIT_DIR=x git push origin main`, `$env:GIT_DIR='x'; git push origin main`
  - origin whose `--push --all` URLs include one that isn't the client repo
  - `remote.origin.push` or `remote.origin.mirror` set
  - still allowed: `git log --grep push`, `git stash push`, `git commit -m "push the fix"`, and the quoted Windows `-C` path
- **`decide`'s `repo` gains** `pushUrlsFor(dir): string[]` (from `git remote get-url --push --all origin`) and `pushConfigFor(dir): { push: string[], mirror: boolean }`, in place of `originUrlFor`.
- **The hook command** in `settings.local.json` becomes `node "$CLAUDE_PROJECT_DIR/.claude/repo-standup/guard.mjs"`. Any internal error while judging a command that names push prints a deny.
- **The pre-push layer:**
  - Create `plugins/pell/skills/repo-standup/hooks/pre-push.mjs` and `plugins/pell/skills/repo-standup/hooks/pre-push`, an `sh` shim that runs `exec node "$(git rev-parse --show-toplevel)/.claude/repo-standup/pre-push.mjs" "$@"`.
  - It exports `decidePush(url, lines, { clientRepo, isAncestor })`, where `lines` are git's stdin lines (`<local ref> <local sha> <remote ref> <remote sha>`).
  - It refuses with exit 1:
    - a URL that isn't the client repo
    - any remote ref but `refs/heads/main`
    - a delete (all-zero local sha)
    - a remote sha that isn't an ancestor of the local sha, or isn't present locally
  - Test it in `tests/repo-standup/pre-push.test.mjs` with unit cases. Add one integration case: a temp repo whose `.git/hooks/pre-push` is the shim, with a local bare remote, refuses the push because its URL isn't the client repo.
- **Run the tests with the glob,** `node --test tests/repo-standup/*.test.mjs`. A folder argument fails on Node 22.23.

### Task 2: Prove the platform (with Brandon)

A check, not code. Its results set the token accounting (Task 12) and the notification fallback (Task 13).

- [ ] **Step 1: Make a scratch fork.**
  - From a framework worktree at `react`, run the fork tool into an empty folder that has had `git init`, such as `Repo-Standup-Skill/repo-standup-platform-check`, with `--repo pellsoftware/platform-check`.
  - Commit the fork. Add no remote.
  - Install the guard as Task 13's setup will: `guard.mjs`, `shell-words.mjs`, `protected-paths.mjs`, `pre-push.mjs` and `client-repo` into `.claude/repo-standup/`, `settings.local.json` into `.claude/`, and the `pre-push` shim into `.git/hooks/`. Add `.claude/repo-standup/` and `.claude/settings.local.json` to `.git/info/exclude`.
- [ ] **Step 2: Ask Brandon** to open a Claude Code session in that folder with auto mode on, and Remote Control connected.
- [ ] **Step 3: In that session, check and record:**
  1. `git push --force --dry-run repo-standup-guard-check main` is denied with the canary reason, both through the Bash tool and through the PowerShell tool.
  2. A `PushNotification` sent while Brandon is away from the terminal reaches his phone. Brandon confirms.
  3. A trivial subagent's result shows its token count, and in which field.
  4. Whether the session can read its own usage, and how.
- [ ] **Step 4: Write the results** to `project-3-platform-check.md` in the shared notes folder, outside both repos. If item 2 fails, ask Brandon what the fallback is before Task 13. If item 4 fails, Task 12's run-log lines carry `workers only`.
- [ ] **Step 5: Delete the scratch folder.** No commit in either repo.

**Result (2026-11-16, with Brandon).**
1. The guard: the canary is denied in Bash and in PowerShell, and the normal commands run.
2. The push notification: the tool exists, but returned "mobile push is disabled in /config", because Brandon has it off. His call: assume it works.
3. A worker's tokens arrive as `subagent_tokens` in its completion notice's `<usage>` block.
4. The session reads its own usage with `mcp__ccd_session_mgmt__get_usage`, a desktop-app tool loaded through ToolSearch.

Also: a foreground `sleep` is blocked. The full results are in the shared notes folder's `project-3-platform-check.md`.

# Part A: Framework (`pell_web_app_framework`, branch `orchestrator`)

### Task 3: Test results to files

**Files:**
- Modify: `PellFramework.React/playwright.config.ts` (`reporter`)
- Modify: `PellFramework.React/vitest.config.ts` (`reporters`, `outputFile`)
- Modify: `PellFramework.Tests/PellFramework.Tests.csproj` and `PellFramework.IntegrationTests/PellFramework.IntegrationTests.csproj`, or `Directory.Build.props` scoped to those two
- Modify: `.gitignore` (add `TestResults/`)

**Interfaces:**
- Produces four fixed paths, which Task 5 reads. Each is rewritten by every run of its suite:

  |File|Written by|
  |-|-|
  |`PellFramework.React/test-results/e2e.json`|`npm run test:e2e`|
  |`PellFramework.React/test-results/vitest.json`|`npm test`|
  |`TestResults/unit.trx`|the unit tests|
  |`TestResults/integration.trx`|the integration tests|

- [ ] **Step 1: Playwright.** Set `reporter: [['html'], ['json', { outputFile: 'test-results/e2e.json' }]]`. The output folder stays `test-results/playwright`, so the JSON survives Playwright's emptying of it.
- [ ] **Step 2: Vitest.** Set `reporters: ['default', 'json']` and `outputFile: { json: 'test-results/vitest.json' }`.
- [ ] **Step 3: TRX.** Set the `VSTestLogger` and `VSTestResultsDirectory` MSBuild properties, so the Standard commands write the TRX files unchanged: `trx;LogFileName=unit.trx`, and `integration.trx`, into `$(MSBuildThisFileDirectory)../TestResults`. If `dotnet test` with `xunit.v3.mtp-off` ignores them, add `--logger` and `--results-directory` to the two Standard commands rows instead, and say so in the task report.
- [ ] **Step 4: Verify.** Run each of the four Standard commands. Expected: each file exists and was written by that run, and `git status` shows no new tracked file.
- [ ] **Step 5: Commit** `Write the test suites' results to files`.

### Task 4: Reading the pack

**Files:**
- Create: `tools/PellFramework.Scaffolder/Scoreboard/PackFiles.cs` (records and `PackReader`)
- Create: `tools/PellFramework.Scaffolder/Scoreboard/MarkdownTable.cs`, unless design intake's framework half already has a pipe-table reader: reuse it
- Test: `tools/PellFramework.Scaffolder.Tests/Scoreboard/PackReaderTests.cs`, fixtures in `tools/PellFramework.Scaffolder.Tests/Scoreboard/Fixtures/`

**Interfaces:**
- Produces `PackReader.Read(string repoRoot) : PackFiles`. It reads `docs/project/` and `client.yaml`.
- `PackFiles` holds:
  - `Requirements`, `Questions`, `Units`, `Reviews`, `RunLog`, `Modules` (`client.yaml`'s `modules`)
  - `Diagnostics : IReadOnlyList<PackDiagnostic>`, where `PackDiagnostic(string File, int Line, string Message)` uses a `/`-separated path relative to the repository root
- The records:
  - `Requirement(string Id, string Text, string Source, string VerifiedBy, string Scope, IReadOnlyList<string> DependsOn)`, with `bool InScope => Scope == "in"`
  - `Question(string Id, int Number, string Risk, IReadOnlyList<string> Blocks, string? Answer, string Text)`. An empty Answer line is `null`.
  - `Unit(string Id, string Kind, string Title, IReadOnlyList<string> Requirements, IReadOnlyList<string> DependsOn, string Risk, string State, int Attempts, int Parks)`
  - `Review(string RequirementId, DateOnly Date, string Unit, string Reviewer, string Verdict, string Evidence)`
  - `RunLogLine(DateTime At, bool HasTime, string Source, string Phase, string? Unit, double? Minutes, long? Tokens, string? Outcome, string Note, IReadOnlyDictionary<string, long> TokensByModel)`
    - `Source` is `design-intake` or `repo-standup`.
    - `Tokens` is `null` for `unknown`.
    - `TokensByModel` comes from the note's `opus <n>, sonnet <n>`.
- An integration's access question is the `Q-<n>` in the `Depends on` of the `integration` unit that also lists that `INT-<n>`. Task 6 uses this.

- [ ] **Step 1: Write the failing tests:**
  - `Reads_requirements_with_the_exact_header`: a fixture `requirements.md` in design intake's seven columns gives each field. `Depends on` splits on commas.
  - `Reports_a_requirements_table_with_another_header`: one diagnostic, naming the file and the header's line.
  - `Reads_questions_and_their_answers`: `Q-3` with `Blocks: REQ-2.1, REQ-2.2` and an empty Answer gives `Answer == null`. `Q-4` with an answer keeps its text.
  - `Reads_the_queue`: the spec's `queue.md` header, two rows, and `Attempts` and `Parks` as numbers.
  - `Reads_both_run_log_shapes`:
    - `- 2026-11-20 | design-intake 3 generate | 41 min | unknown tokens | 6 entities` gives `HasTime == false`, `Tokens == null` and `Outcome == null`.
    - `- 2026-11-21 14:05 | repo-standup workflows U-7 | 38 min | 212000 tokens | merged: opus 150000, sonnet 62000` gives the unit, the outcome and both models.
  - `Indented_lines_belong_to_the_line_above`: a design intake stage 7 line followed by two indented `  - ` lines gives one `RunLogLine` whose `Note` holds both, and no diagnostic.
  - `Reads_modules_from_client_yaml`: `modules: []` gives none.
  - `Missing_pack_files_are_empty_not_errors`: only `requirements.md` present gives empty lists and no diagnostic.
- [ ] **Step 2: Run them and see them fail.** `dotnet test tools/PellFramework.Scaffolder.Tests -c Release --filter "FullyQualifiedName~Scoreboard"`.
- [ ] **Step 3: Implement** `PackReader`, the records and the table reader.
- [ ] **Step 4: Run them and see them pass,** then the whole scaffolder suite.
- [ ] **Step 5: Commit** `Read the project pack for the scoreboard`.

### Task 5: Reading the test results

**Files:**
- Create: `tools/PellFramework.Scaffolder/Scoreboard/TestResults.cs` (`TestResult`, `TestOutcome`, `ResultSet`, `ResultReader`)
- Create: `tools/PellFramework.Scaffolder/Scoreboard/PlaywrightResults.cs`, `VitestResults.cs`, `TrxResults.cs`
- Test: `tools/PellFramework.Scaffolder.Tests/Scoreboard/ResultReaderTests.cs`, with small result files in `Fixtures/`

**Interfaces:**
- Consumes Task 3's four paths. The React folder is the one the scaffolder's settings name, as `generate` uses.
- Produces:
  - `enum TestOutcome { Passed, Failed, ExpectedToFail, Skipped }`
  - `TestResult(string Kind, string Name, IReadOnlyList<string> RequirementIds, TestOutcome Outcome)`. `Kind` is `acceptance` (a Playwright test under `e2e/acceptance/`), `e2e` (other Playwright), `integration` (`integration.trx`) or `unit` (`unit.trx` and Vitest).
  - `ResultReader.Read(string repoRoot, IProcessRunner runner) : ResultSet`, holding `Tests`, `Files : IReadOnlyList<(string Path, DateTime WrittenAt)>`, `HeadCommitAt : DateTime` (from `git log -1 --format=%cI`, through `runner`) and `Diagnostics`. A missing results file is noted in `Files` as absent, not an error.
- Outcomes:
  - Playwright: a test with a `fail` annotation is `ExpectedToFail`. Otherwise status `expected` is `Passed`, `skipped` is `Skipped`, and `unexpected` and `flaky` are `Failed`.
  - Vitest: `passed` is `Passed`; `skipped`, `pending` and `todo` are `Skipped`; `failed` is `Failed`.
- Tags:
  - Playwright: from each spec's `tags`, including those inherited from a `describe`.
  - Vitest: every `@REQ-\d+\.\d+` in the full name.
  - xUnit: TRX doesn't reliably carry traits. Read each test method's `[Trait("Req", "REQ-…")]` attributes from the test projects' `.cs` files, and join them to TRX results by `<namespace>.<class>.<method>`. A theory's rows each join by that prefix.

- [ ] **Step 1: Write the failing tests:**
  - `Playwright_tag_on_describe_counts_for_each_test`: a fixture with `describe` tagged `@REQ-2.1` and two tests, one with a `fail` annotation, gives one `ExpectedToFail` and one `Passed`, both with `REQ-2.1`.
  - `Playwright_acceptance_kind_comes_from_the_folder`: a test in `e2e/acceptance/jobs.spec.ts` is `acceptance`, and one in `e2e/auth.spec.ts` is `e2e`.
  - `Playwright_flaky_is_failed`.
  - `Vitest_tags_come_from_the_name`: `JobForm > saves a job @REQ-3.2 @REQ-3.4` carries both IDs.
  - `Trx_joins_traits_from_source`: a fixture `.cs` with `[Fact, Trait("Req", "REQ-5.1")]` on `JobRules.Rejects_a_past_date`, and a TRX result `Acme.Tests.JobRules.Rejects_a_past_date` `Passed`, gives `REQ-5.1`, `Passed`.
  - `Trx_theory_rows_each_count`: a theory with three rows, one `Failed`, gives three results, one `Failed`, each with the requirement.
  - `Ids_are_returned_as_written`: a tag `@REQ-99.1` comes back as `REQ-99.1`. Unknown IDs are Task 8's diagnostic, where the requirements are known.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement** the readers. Use `System.Text.Json` and `System.Xml.Linq`, with no new packages.
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Prove it on a real run.** In a scratch copy of the framework, add `[Trait("Req", "REQ-1.1")]` to one unit test and one integration test, run both Standard commands, and call `ResultReader.Read` from a test or the command. Expected: both results carry `REQ-1.1` with their real outcome. Note in the task report how the join behaved. Don't commit the scratch tags.
- [ ] **Step 6: Commit** `Read the test suites' results for the scoreboard`.

### Task 6: Requirement states and the queue

**Files:**
- Create: `tools/PellFramework.Scaffolder/Scoreboard/RequirementStates.cs`
- Test: `tools/PellFramework.Scaffolder.Tests/Scoreboard/RequirementStatesTests.cs`

**Interfaces:**
- Consumes `PackFiles` (Task 4) and `ResultSet` (Task 5).
- Produces:
  - `enum RequirementState { Verified, BuiltUnverified, NotBuilt, Parked, BlockedOnClient, BlockedOnAccess, OutOfScope }`. These print as `Verified`, `Built-unverified`, `Not built`, `Parked`, `Blocked-on-client`, `Blocked-on-access`, `Out-of-scope`.
  - `RequirementStates.Compute(PackFiles pack, ResultSet results) : StateSet`, holding:
    - `States : IReadOnlyDictionary<string, RequirementState>`
    - `OwnerOf : IReadOnlyDictionary<string, string?>` (the open unit)
    - `Unowned : IReadOnlyList<string>`
    - `Movable : IReadOnlyList<string>`, unit IDs in `queue.md` row order
    - `Diagnostics`
- Rules, checked in the spec's order:
  - Out-of-scope.
  - Verified:
    - At least one test whose `Kind` matches "Verified by" carries the requirement's tag. `acceptance` matches `acceptance`, `integration` matches `integration`, and `unit` matches `unit`.
    - Every tagged test, of any kind, is `Passed`.
    - A `review` requirement instead needs its latest `reviews.md` verdict to be `pass`.
  - Blocked-on-access: it depends on an `INT-<n>` whose access question is unanswered, or on a module name not in `Modules`. A module name is any `Depends on` entry that isn't `Q-`, `INT-` or `U-`.
  - Blocked-on-client: an unanswered question's `Blocks` lists it.
  - Parked: its open owner is `parked`.
  - Built-unverified: its last owning unit is `merged`.
  - Not built: everything else.
- Ownership:
  - Open units are `queued`, `in progress` and `parked`.
  - A requirement in two open units is a diagnostic.
  - A requirement that is Not built, Built-unverified or Parked, and has no open unit, is `Unowned`. This applies only once `queue.md` holds a unit.
- Movable: `queued`, or `parked` with `Parks < 2` and every `Q-` it depends on answered. Every `U-` it depends on must be `merged`, and none of its requirements Blocked-on-client or Blocked-on-access.

- [ ] **Step 1: Write the failing tests**, one per rule. Build `PackFiles` and `ResultSet` in code.
  - `Out_of_scope_wins`.
  - `Verified_needs_a_test_of_its_kind`: an `acceptance` requirement with only a passing xUnit test is Built-unverified once its unit merged.
  - `A_failing_tag_of_another_kind_stops_verified`: a passing acceptance scenario and a failing xUnit test with the same tag give not Verified.
  - `Expected_to_fail_is_not_verified`.
  - `Review_takes_the_latest_verdict`: `fail`, then `pass`, gives Verified. `pass`, then `fail`, gives not Verified.
  - `Access_question_blocks_integration_requirements`: `INT-1`'s unit depends on `INT-1, Q-7`. With `Q-7` unanswered, requirements depending on `INT-1` are Blocked-on-access, not Blocked-on-client.
  - `Missing_module_blocks_on_access`: a dependency on `Azure` with `modules: []`.
  - `Unanswered_blocking_question_blocks_on_client`, and `A_question_that_doesnt_list_it_doesnt_block`.
  - `Parked_owner_gives_parked`.
  - `Two_open_units_is_a_diagnostic`.
  - `A_requirement_needing_work_with_no_open_unit_is_unowned`, and `Unowned_is_empty_before_the_queue_exists`.
  - `Movable_respects_unit_dependencies_and_row_order`.
  - `A_parked_unit_moves_again_once_answered_and_parked_once`, and `A_unit_parked_twice_never_moves`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement `Compute`.**
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Commit** `Compute requirement states and movable units`.

### Task 7: Stop, alert and batch signals

**Files:**
- Create: `tools/PellFramework.Scaffolder/Scoreboard/RunSignals.cs`
- Test: `tools/PellFramework.Scaffolder.Tests/Scoreboard/RunSignalsTests.cs`

**Interfaces:**
- Consumes `PackFiles`, `StateSet`.
- Produces `RunSignals.Compute(PackFiles pack, StateSet states) : Signals`. `Signals` holds:
  - `BlockedPercent : int` and `Remaining : int`, where remaining means in scope and not Verified
  - `ParksInARow : int` and `EnvFailuresInARow : int`
  - `ParkedTwice : IReadOnlyList<string>`
  - `MergedSinceNotified : int` and `QuestionsSinceNotified : int`
  - `Stop : string`: `none`, `nothing-movable`, `parks-in-a-row` or `env-broken`
  - `Alerts : IReadOnlyList<string>`: `blocked-over-30`, and `parked-twice U-<n>`
  - `BatchDue : bool`
- Named constants with a doc comment each: `BlockedAlertPercent = 30`, `ParksInARowStop = 3`, `EnvFailuresInARowStop = 2`, `MergedPerBatch = 10`, `ParksBeforeAlert = 2`.
- Rules:
  - **Parks in a row**: trailing `parked` outcomes among `merged` and `parked` lines.
  - **Env failures in a row**: distinct units among the trailing `failed-env` lines, before any other unit outcome.
  - **Since the last notification**: `merged` lines after the last `notified` line, and questions numbered above the `through Q-<n>` in that line's note.
  - **Alerts** are dropped when the last `notified` line's `alerts:` already names them.
  - **Stop** precedence: env-broken, then parks-in-a-row, then nothing-movable. Nothing-movable means no movable unit and none `in progress`.
  - **Batch due**: `MergedSinceNotified >= 10` and `QuestionsSinceNotified > 0`.

- [ ] **Step 1: Write the failing tests**, one per rule and threshold edge:
  - `Thirty_percent_doesnt_alert_thirty_one_does`.
  - `Three_parks_in_a_row_stop_and_a_merge_resets_the_count`.
  - `Two_env_failures_on_one_unit_dont_stop_two_units_do`.
  - `Counts_since_the_last_notified_line`: note `through Q-12; alerts: none`, then Q-13 and Q-14 added, gives 2.
  - `An_alert_already_sent_isnt_repeated`.
  - `Batch_due_needs_ten_merges_and_a_new_question`.
  - `Stop_precedence`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Commit** `Compute the run's stop, alert and batch signals`.

### Task 8: The `scoreboard` command

**Files:**
- Create: `tools/PellFramework.Scaffolder/Commands/ScoreboardCommand.cs`
- Create: `tools/PellFramework.Scaffolder/Scoreboard/ScoreboardWriter.cs`
- Modify: `tools/PellFramework.Scaffolder/Commands/CommandLine.cs` (the switch, `Usage`, and the class summary)
- Modify: `CLAUDE.md` (Standard commands and the Generators commands table: a `scoreboard` row)
- Test: `tools/PellFramework.Scaffolder.Tests/Commands/ScoreboardCommandTests.cs`

**Interfaces:**
- Consumes Tasks 4 to 7, and `CommandContext`, `ExitCode`.
- Produces `public static int ScoreboardCommand.Run(IReadOnlyList<string> args, CommandContext context)`, with args `[--json] [--cost --rates <file>]`.
  - It writes `docs/project/scoreboard.md` whole. The header holds the counts per state, each results file's write time (or `absent`), and `HEAD`'s commit. Then one row per requirement:

    ```
    |ID|Requirement|State|Tests|Unit|Depends on|
    |-|-|-|-|-|-|
    ```

    `Tests` reads like `acceptance 2/2, unit 1/1`. When any results file was written before `HEAD`'s commit time, the line `Results are older than the last commit; run the checks, then scoreboard.` goes first.
  - It prints the spec's text block to `context.Out`. With `--json` it prints one JSON object instead, which Task 12's skill reads:

    ```
    {"movable":["U-3"],"next":"U-3","unowned":[],"states":{"Verified":4,"Built-unverified":0,"Not built":9,"Parked":0,"Blocked-on-client":1,"Blocked-on-access":0,"Out-of-scope":3},"blockedPercent":7,"remaining":14,"parksInARow":0,"envFailuresInARow":0,"parkedTwice":[],"sinceNotified":{"merged":2,"questions":1},"stop":"none","alerts":[],"batchDue":false,"stale":false}
    ```

  - Exit 1 prints each diagnostic as `<file>:<line>: <message>` to `context.Error`. The diagnostics come from Tasks 4 to 6, plus a tag naming a requirement `requirements.md` lacks, and a unit naming a requirement it lacks. Otherwise exit 0, even when the run should stop.
  - `Usage` line: "Writes docs/project/scoreboard.md from the pack and the test results, and prints the next unit and the run's stop and alert signals".

- [ ] **Step 1: Write the failing tests**, using `TestRepository` and `CommandLine.Run` as `ReadyThemesTests` does:
  - `Writes_the_scoreboard_and_prints_the_signals`: a fixture pack and results give the expected `scoreboard.md` rows, and the printed `Next: U-2`.
  - `Json_has_the_documented_keys`: parse the output and assert every key above.
  - `Unknown_tag_exits_1_naming_the_file`.
  - `Stale_results_put_the_warning_first`: the fake runner's `HEAD` time is after the results files' write time.
  - `Writes_nothing_but_the_scoreboard`: the other files are unchanged.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement** the command, the writer, the switch, `Usage` and the CLAUDE.md rows.
- [ ] **Step 4: Run them and see them pass,** then the scaffolder suite and `RecipeCommandsTests`.
- [ ] **Step 5: Commit** `Add the scaffolder's scoreboard command`.

### Task 9: `scoreboard --cost`

**Files:**
- Create: `tools/PellFramework.Scaffolder/Scoreboard/CostReport.cs`
- Modify: `tools/PellFramework.Scaffolder/Commands/ScoreboardCommand.cs`
- Test: `tools/PellFramework.Scaffolder.Tests/Scoreboard/CostReportTests.cs`

**Interfaces:**
- Consumes `PackFiles.RunLog`, `StateSet`, the count of `specs/entities/*.yaml`, and `git log --format=%cI%x09%s` through `IProcessRunner`.
- Consumes the rates file: `{"checked":"yyyy-MM-dd","usdPerMillionTokens":{"opus":<number>,"sonnet":<number>}}`, written by Task 12.
- Produces the tables of `docs/project/cost-report.md`, between the markers `<!-- scoreboard:cost -->` and `<!-- /scoreboard:cost -->`. Text outside them is kept, because the handoff writer's prose lives there. The tables:
  - **By phase:** minutes, tokens, and the number of lines with unknown tokens.
  - **By unit:** minutes, tokens, attempts and outcome.
  - **Median unit tokens,** and the units over 3 times it.
  - **Tokens per Verified requirement:** every known token in the run, divided by the Verified count.
  - **Foundation tokens per entity:** design intake stage 3's tokens over the entity count, beside `162,043` (the framework's measured cost of one generated entity).
  - **Prototype tokens and minutes per screen:** design intake stage 7's line over the screens it moved to `prototype`, beside trial 1's 318,000 tokens and 38 agent minutes a screen.
  - **A note above the tables:** worker tokens come from completion notices and track a long agent's context, so they understate billing. The dollar row is a floor.
  - **Checkpoint waits:**
    - checkpoint 1, from `Design intake stage 2: extract` to `Design intake stage 3: generate starts`
    - checkpoint 2, from `Design intake stage 5: directions` to `Design intake stage 6: lock starts`
  - **Estimated dollars** per phase, from each line's tokens by model, with lines that have no model split priced at `opus`. The row is headed "Estimate at list prices checked <date>".

- [ ] **Step 1: Write the failing tests:**
  - `Unknown_tokens_are_counted_apart_never_as_zero`: a phase with one `unknown` line and one `1000` line shows `1000` and `1 unknown`.
  - `Over_three_times_the_median_is_flagged`.
  - `Checkpoint_waits_come_from_commit_times`: the fake runner gives the two commits 3 hours apart, and the table shows `3.0 h`.
  - `Keeps_text_outside_the_markers`.
  - `Missing_rates_file_omits_the_dollar_column`, without failing.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Commit** `Add the scoreboard's cost tables`.

### Task 10: A seed login per persona

**Files:**
- Modify: `PellFramework.API/Configuration/SampleData/SampleDataOptions.cs` (`SampleUserPassword`)
- Modify: `PellFramework.API/Configuration/SampleData/SampleDataSeeder.cs`
- Modify: `PellFramework.API/appsettings.Development.json` (`Seed:SampleUserPassword`)
- Modify: `README.md` (first sign-in: the sample logins)
- Test: `PellFramework.IntegrationTests/Data/SampleDataSeederTests.cs`

**Interfaces:**
- Produces, when the environment is Development, `Seed:SampleData` is true and `Seed:SampleUserPassword` is set: one active user per role, named `<role in kebab case>@sample.test`, with that role and that password. It runs after the roles are seeded and skips a user that exists. Task 14's handoff writer lists these logins.
- The password is a Development-only value that passes the Identity password rules, as `Seed:E2EUserPassword` does for the E2E host. Whether the seeder shares code with design intake's E2E persona users is the implementer's call.

- [ ] **Step 1: Write the failing tests:**
  - `Seeds_one_user_per_role_in_development`: every role in `default-roles.json` gets an active user `<kebab>@sample.test` holding that role, who can sign in with the password.
  - `Seeds_no_users_outside_development`.
  - `Seeds_no_users_without_a_password`.
  - `Second_run_adds_nothing`.
- [ ] **Step 2: Run them and see them fail.** `dotnet test PellFramework.IntegrationTests -c Release --filter "FullyQualifiedName~SampleDataSeederTests"`.
- [ ] **Step 3: Implement,** and add the README lines.
- [ ] **Step 4: Run them and see them pass,** then the unit and integration suites.
- [ ] **Step 5: Commit** `Seed a sample login per role in Development`.

### Task 11: Pack skeleton, tag forms and branch checks

**Files:**
- Create in `tools/PellFramework.Fork/ProjectPack/`: `queue.md`, `known-gaps.md`, `reviews.md`, `cost-report.md`, `demo/README.md`. Each holds a title and one line in the skeleton's voice (what goes in it, who writes it, who reads it). `cost-report.md` also holds the empty `<!-- scoreboard:cost -->` markers.
- Modify: `tools/PellFramework.Fork/ProjectPack.cs` (the file list), `tools/PellFramework.Fork/ProjectPack/README.md` (the table)
- Modify: `CLAUDE.md` (Tests: the xUnit and Vitest tag forms beside Playwright's), `PellFramework.React/e2e/acceptance/README.md` (the scoreboard reads the tags)
- Test: `tools/PellFramework.Fork.Tests/ProjectPackTests.cs`

**Interfaces:**
- Produces the files Task 12's formats fill, at `docs/project/<name>` in every new fork.

- [ ] **Step 1: Write the failing test.** Add the five paths to `ProjectPackTests`' expected list.
- [ ] **Step 2: Run it and see it fail.** `dotnet test tools/PellFramework.Fork.Tests -c Release`.
- [ ] **Step 3: Add the files, the list entries, the README rows and the CLAUDE.md lines.**
- [ ] **Step 4: Run the fork tests and `tools/fork-build-test.sh`.** Expected: PASS.
- [ ] **Step 5: Commit** `Add the orchestrator's pack files and tag forms`.
- [ ] **Step 6: Branch checks before handing over.**
  - Every Standard command passes.
  - `npm run screens` passes with every theme, once.
  - `tools/fork-build-test.sh` and `tools/sample-build-test.sh` pass.
  - `scoreboard` runs in the framework itself with an empty pack: exit 0, and nothing movable.

  Record the counts in the task report. Merging is Brandon's.

# Part B2: The skill (Pell_Skills, branch `orchestrator`)

Every file below is a prompt. Each task ends with `claude plugin validate ./plugins/pell` and a reviewer reading it against the spec section it names. The housekeeping is in Task 15, so the version is bumped once.

### Task 12: Formats and rates

**Files:**
- Create: `plugins/pell/skills/repo-standup/references/formats.md`
- Create: `plugins/pell/skills/repo-standup/rates.json`

**Interfaces:**
- Consumes the shapes Task 4's reader parses, and Task 2's results on token accounting. A unit's tokens are two figures added together:
  - every `subagent_tokens` from the completion notices of the workers it dispatched
  - the conductor's own share: the difference in `mcp__ccd_session_mgmt__get_usage` between the unit's start and its end

  When that tool isn't loadable, the line's note says `workers only`.
- Produces the formats every later task and the scoreboard rely on:
  - **`status.md`**, with the spec's lines in order.
  - **`queue.md`**, with the header `|Unit|Kind|Title|Requirements|Depends on|Risk|State|Attempts|Parks|`, the kinds, risks and states. An `integration` unit's `Depends on` lists its `INT-<n>` and its access `Q-<n>`.
  - **`known-gaps.md`** and **`reviews.md`**.
  - **The run-log line**, with the outcome words, the note's `opus <n>, sonnet <n>` and `workers only`, and the `notified` line's note `through Q-<n>; alerts: <list or none>`.
  - **The notification wordings**, under 200 characters:
    - the batch: `<n> questions added; the riskiest: Q-<n>, <question>`
    - each alert
    - each stop: `Run stopped: <reason>. <counts>. See docs/project/handoff.md`
    - the wait at the guard check
  - **The commit messages** in Global Constraints.
- `rates.json` holds `checked` (the build date) and blended `usdPerMillionTokens` for `opus` and `sonnet`. Each is `(3 × input + 1 × output) / 4` at the list prices on the build date, looked up with the `claude-api` skill.

- [ ] **Step 1: Write `formats.md`,** each format with one example in the minimal table separator.
- [ ] **Step 2: Check it against the scoreboard.** In a scratch fork made from the framework's `orchestrator` branch, write `requirements.md`, `queue.md`, `reviews.md` and `run-log.md` from the examples alone. Run `scoreboard --json`. Expected: exit 0, and the states the examples imply.
- [ ] **Step 3: Write `rates.json`.**
- [ ] **Step 4: Commit** `Add repo-standup's formats and rates`.

### Task 13: The loop reference and the skill

**Files:**
- Create: `plugins/pell/skills/repo-standup/references/loop.md`
- Create: `plugins/pell/skills/repo-standup/SKILL.md`

**Interfaces:**
- Consumes:
  - the guard (Task 1)
  - `scoreboard --json` (Task 8)
  - `formats.md` (Task 12)
  - design intake's outcome lines and its `from repo-standup` argument
  - `/pell:init-client-repo`
- Produces the skill `repo-standup`. Its description: "Use when starting or continuing a repo-standup run that builds a client project from the Pell Web App Framework end to end, such as /pell:repo-standup, \"start repo standup\" or \"continue the build\"."

**`loop.md` holds** the spec's "The work loop" and "Review by risk" as procedure:
- **Building the queue:** the kinds, their order, ownership, and splitting a workflow over about 8 requirements.
  - A screen-inventory row that stage 7 left `planned` joins its workflow's unit. That unit builds the screen by stage 7's procedure before filling its endpoints, and always gets the design steward's review.
- **No outcome line from design intake:** read its signal table and act on it.
- **One unit:** steps 1 to 9, with the done check, the failed-attempt rule and the park procedure. On a retry, the implementer's brief carries the last failure.
- **The implementer brief:** what it carries, as the spec lists it, plus the ratchet rule and the tag forms.
- **The risk path list,** with `<Code>` from `client.yaml`:
  - `<Code>.Domain/Authorization/**` except `*.g.cs`
  - `<Code>.Domain/Identity/**`
  - `<Code>.API/Configuration/default-roles.json`
  - `<Code>.API/Controllers/{Auth,Invitations,Me,Permissions,Roles,Users}Controller.cs`
  - `<Code>.API/{Services,Models}/{Auth,Roles,Users}/**`
  - `<Code>.API/Integrations/**`, where integration clients go
  - added lines in non-test C# matching `.Remove(`, `.RemoveRange(`, `ExecuteDelete` or `[HttpDelete`
- **The ratchet flag:** any changed line under `e2e/acceptance/` other than a removed `test.fail();`.
- **The environmental-failure patterns:**
  - "error occurred while establishing a connection to SQL Server"
  - "SQL Server process failed to start"
  - `EADDRINUSE`
  - "Failed to bind to address"
  - "No .NET SDKs were found"
  - "is not recognized as an internal or external command"
  - `ENOSPC`
  - "There is not enough space on the disk"
- **The review table,** the model per role (as the Agent tool's `model`), the finding rules, and the integration-gap audit every 5 merged units and at each phase end.
- **The diff handoff:** `git diff --output=<git_dir>/pell-repo-standup.diff main...unit/U-<n>`, passed as `diff_path`.
- **Hardening:** the scans and their commands, the performance smoke test, and findings of medium or above becoming `fix` units.

**`SKILL.md` holds**, kept short, the spec's sections as rules:
- what the skill is
- setup, once per fork:
  - copy `hooks/guard.mjs`, `hooks/shell-words.mjs`, `hooks/protected-paths.mjs` and `hooks/pre-push.mjs` into `.claude/repo-standup/`, and `hooks/settings.local.json` into `.claude/`
  - write `client.yaml`'s `repository.bitbucket` to `.claude/repo-standup/client-repo`, the only place both guard layers read the allowed repo from; with no such file every push is denied. The copies must be made before the guard is live, since it denies writes to these paths.
  - copy `hooks/pre-push` into `.git/hooks/pre-push`; when `core.hooksPath` is set, stop and tell the engineer, since git would skip that hook
  - add `.claude/repo-standup/` and `.claude/settings.local.json` to `.git/info/exclude`
  - ask for the stop date
  - write `status.md`
- the guard check
- the notification check, from Task 2:
  - At setup, and again at any session start where the last notification wasn't sent, the skill sends one test `PushNotification`.
  - If the tool reports mobile push disabled, it tells the engineer to turn on mobile push in Claude Code's config and connect Remote Control. The run carries on, with notifications going to chat and the run log until then.
- never a foreground `sleep`: any wait uses a background command or Monitor
- where the run stands (the spec's table)
- phases 2 to 5 through design intake
- where the engineer answers: fetch and fast-forward at each unit boundary, and rebase on a rejected push
- the stop, alert and batch rules, read from `scoreboard --json`, plus the stop date and design intake's `stopped:` line
- phase 8 written to `status.md` as `Staging: skipped, no Azure module`
- the commit and push rules
- the exception to the read-only default
- never wait on the client
- the references

- [ ] **Step 1: Write `loop.md`.**
- [ ] **Step 2: Write `SKILL.md`.**
- [ ] **Step 3: Verify.**
  - `claude plugin validate ./plugins/pell` passes.
  - `grep -n "design-intake: " plugins/pell/skills/repo-standup/SKILL.md` shows all four outcome forms.
  - `grep -rn "\-\-force" plugins/pell/skills/repo-standup/` shows no instruction to force.
- [ ] **Step 4: Review.** A fresh reviewer reads both files against the spec's "Starting and resuming a run", "The phases", "The work loop" and "Stops, alerts and question batches". Fix its findings.
- [ ] **Step 5: Commit** `Add the repo-standup skill and its loop`.

### Task 14: The handoff writer and the handoff reference

**Files:**
- Create: `plugins/pell/agents/handoff-writer.md`
- Create: `plugins/pell/skills/repo-standup/references/handoff.md`

**Interfaces:**
- Consumes the pack, `scoreboard.md`, `cost-report.md`'s tables (Task 9), `default-roles.json`, `appsettings.Development.json`'s sample password and `personas.md`.
- Produces:
  - `handoff.md`, one page, in the spec's order
  - `demo/<persona>.md` for each persona with a Verified workflow
  - the prose around `cost-report.md`'s markers
  - its trailing `{"files": [...], "questions": [...], "summary": "..."}`

**The agent** has frontmatter `name: handoff-writer`, a description, and `model: sonnet`, with a one-paragraph rationale at the top of its body under the mechanical-agent exception. It computes no number; every count comes from `scoreboard.md` or the cost tables.

**`handoff.md` (the reference) holds** the package's reading order, the one-page template, the demo-script template (login, steps in the glossary's words, what to say at each), and the final sequence:
1. every check with every theme
2. `scoreboard --cost --rates <skill>/rates.json`
3. the handoff writer
4. commit, push, and the stop notification

- [ ] **Step 1: Write both files.**
- [ ] **Step 2: Verify.** `claude plugin validate ./plugins/pell` passes.
- [ ] **Step 3: Commit** `Add the handoff writer`.

### Task 18: Branch restrictions at fork time

Brandon approved this on 2026-11-16. It runs before Task 15, so Task 15's single version bump covers it. It doesn't depend on the framework half, so it can be done before Tasks 4 to 14 if Brandon wants it sooner. In that case it carries its own minor bump and README line.

**Files:**
- Modify: `plugins/pell/commands/init-client-repo.md`:
  - Step 4: the create-repo prompt names the restrictions
  - Step 6: the plan names them when the repo already existed
  - Step 11: set them after the push succeeds
  - Step 12: report them
  - the failure table
  - the operator notes

**Interfaces:**
- Consumes the Bitbucket v2 operation that creates a branch restriction, on `plugin:atlassian:atlassian`. Find its exact name with `discover` while authoring, and record it in the command and in architecture spec §4.4. Under the repo's convention, the command calls it directly with `executeWrite` and no `cloudId`, and runs `discover` and retries only on `Unknown operation` or `Failed to fetch cloud ID`.
- Produces four restrictions on the client repo:
  - `kind: force` on pattern `main`
  - `kind: delete` on pattern `main`
  - `kind: force` on pattern `staging`
  - `kind: delete` on pattern `staging`

  No other kinds, so normal pushes stay allowed.

- [ ] **Step 1: Find the operation.** Run `discover` for creating a Bitbucket branch restriction, and note its name and input parameter names. If none exists, Step 2 writes only the manual path, and the task report says so.
- [ ] **Step 2: Edit the command.**
  - Step 4's create prompt becomes: `Create the private repository <ws>/<slug> on Bitbucket, and block force pushes and deletion on its main and staging branches? (y/n)`.
  - When the repo already existed, Step 6's plan gets a line: `Then: block force pushes and deletion on main and staging in <ws>/<slug>.`
  - Step 11 sets the four restrictions after the push succeeds. Restrictions that already exist with the same kind and pattern count as set.
  - Step 12's report gets a line, `Branch rules  main, staging: no force push, no deletion`, or `not set (<reason>); set them in Repository settings, Branch restrictions`.
  - The failure table gets a row: a missing operation, or a failed call, degrades and never aborts. It prints the manual settings and says the restrictions weren't set.
- [ ] **Step 3: Verify.**
  - `claude plugin validate ./plugins/pell` passes.
  - The command reads end to end with no step that sets restrictions without a yes.
- [ ] **Step 4: Prove it once with Brandon.** Run the command against a scratch Bitbucket repo he names. Check in Bitbucket that the four restrictions exist. Check that a normal push to `main` works and `git push --force origin main` is refused by the server. He deletes the scratch repo afterwards.
- [ ] **Step 5: Commit** `Block force pushes and deletion on a new client repo's main and staging`.

### Task 15: Housekeeping

**Files:**
- Modify: `plugins/pell/.claude-plugin/plugin.json` (minor bump from whatever `main` holds)
- Modify: `plugins/pell/README.md`, `README.md` (the skill and agent lists, and a `/pell:repo-standup` section)
- Modify: `docs/specs/2026-05-27-pell-skills-architecture.md`:
  - §12, built
  - the test-runner pattern: `tests/` at the root, Node's built-in runner, outside the shipped plugin
- Modify: `CLAUDE.md`:
  - the exception for `repo-standup`, beside design intake's: it writes, commits and pushes in its fork without `(y/n)`
  - `handoff-writer` added to the mechanical-agent and producer exceptions
  - a line on `node --test "tests/**/*.test.mjs"`

- [ ] **Step 1: Make the edits.**
- [ ] **Step 2: Verify.**
  - `claude plugin validate ./plugins/pell` passes.
  - `node --test "tests/**/*.test.mjs"` passes.
  - `grep -rn "repo-standup" README.md plugins/pell/README.md docs/specs/2026-05-27-pell-skills-architecture.md CLAUDE.md` shows each place.
- [ ] **Step 3: Commit** `Document repo-standup and bump the plugin`.

# Part C: Trials (with Brandon)

Both fork fresh from the framework's `orchestrator` branch, with the plugin loaded from the Pell_Skills `orchestrator` worktree. Brandon answers both checkpoints in each, about 25 minutes per trial.

### Task 16: Trial A, the fictional SOW

- [ ] **Step 1:** Brandon starts `/pell:repo-standup` in a session with auto mode on.
  - It runs `/pell:init-client-repo` from the framework's `orchestrator` branch, into a scratch folder.
  - He gives design intake's trial SOW.
  - The fork's `origin` is removed, or isn't a client repo, so nothing is pushed.
- [ ] **Step 2:** Run to the end. Brandon answers both checkpoints and resumes each time with the same prompt, in a new session in the fork.
- [ ] **Step 3: Check the pass conditions:**
  - every requirement is in exactly one state
  - every check passes on `main`, every theme included
  - the package's files match `formats.md` and `handoff.md`
  - `cost-report.md` holds numbers
  - an engineer who didn't watch starts the app and signs in as each persona from `handoff.md` alone
- [ ] **Step 4: Record** what failed and what was fixed, in a notes file outside both repos. A fix to the skill or framework is a commit on its `orchestrator` branch, with its checks.

### Task 17: Trial B, a real SOW

- [ ] **Step 1:** Same as Task 16, with design intake's trial 2 SOW, in a scratch fork that is never pushed.
- [ ] **Step 2: Record** in a notes file outside both repos: tokens per Verified requirement, wall time, parks, alerts and the checkpoint waits. It names the client, so nothing goes into either repo.
- [ ] **Step 3:** Report both trials to Brandon. Merging the two branches is his call.
