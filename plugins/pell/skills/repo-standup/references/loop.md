# Repo standup: the work loop

How phases 6 and 7 run, one unit at a time. `SKILL.md` holds the rules every phase shares: where the run stands, where the engineer answers, the commit and push rules with the commands the guard denies, and the stops, alerts and question batches. `formats.md`, beside this file, holds the shape of every file the run writes and the wording of every message. This file doesn't repeat them.

## Terms

- `<Code>` is `client.yaml`'s `name.code`, and `<skill>` is `${CLAUDE_PLUGIN_ROOT}/skills/repo-standup`. Commands run from the repository root, npm commands in `<Code>.React/`. Pack paths are under `docs/project/`.
- **Design intake's references.** The formats of `requirements.md`, `open-questions.md`, `decisions.md`, `workflows.md` and `integrations.md` are in `${CLAUDE_PLUGIN_ROOT}/skills/design-intake/references/formats.md`. Its stage procedures and terms are in `stages.md` beside it.
- **The checks** are the fork's `CLAUDE.md` "Standard commands" that check, run by the conductor one at a time, in this order, each passing: the build, the unit tests, the integration tests, `npm run lint && npm run typecheck && npm test`, `npm run check:api`, `npm run screens -- --active`, `npm run test:e2e`, and `generate --check`. They share the integration tests' database and port 7143, so two never run at once. Run the React chain with the Bash tool; PowerShell 5.1 has no `&&`, so there it is `npm run lint; if ($?) { npm run typecheck }; if ($?) { npm test }`. A check that can outlast the tool's timeout runs in the background, and the conductor waits for its completion notice. A worker's claim that the checks pass is not a pass.
- **Flakes, Baselines and Formatting** follow the rules of those names in design intake's `stages.md`, "Terms used below".
- **The scoreboard** is:
  ```
  dotnet run --project tools/<Code>.Scaffolder -c Release -- scoreboard --json
  ```
  It prints one JSON object with the keys `movable`, `next`, `unowned`, `states`, `blockedPercent`, `remaining`, `parksInARow`, `envFailuresInARow`, `parkedTwice`, `sinceNotified` (`merged`, `questions`), `stop`, `alerts`, `batchDue` and `stale`. It also rewrites `docs/project/scoreboard.md` whole, one row per requirement with its state.
  - It reads the results files the checks write. Before every run, every check runs in full first, unless they last ran in full in this session and only files under `docs/project/` have changed since. So a session's first scoreboard run always follows a full run of the checks. A filtered run (`--filter`, `-g`, a single file) leaves partial results, so after one the check runs in full again before the scoreboard.
  - `stale: true` means a commit came after the checks ran. That is expected when the commit touched only `docs/project/`, as bookkeeping does. Otherwise run the checks again.
  - On `main`, the rewritten `scoreboard.md` goes into the next commit. On a unit branch, read it, then `git restore docs/project/scoreboard.md`.
  - Exit 1 prints `<file>:<line>: <message>`. On a line the run wrote, fix it and run again; on a unit branch it counts as a failing check. On a line the engineer wrote, stop with `scoreboard: <message>`.
- **Leaving a unit branch.** Restore `scoreboard.md`, commit anything else left uncommitted as `Unit U-<n>: <title>, left over`, then `git switch main`. The next `git switch -C` drops the branch's commits.
- **A run-log line's figures.** A unit's line covers one attempt, from its start commit. A `queue` or `phase` line covers only the work it reports, so no token is counted twice.
  - Workers: the sum of `subagent_tokens` from the `<usage>` block of each completion notice, under the model each ran on.
  - The conductor: the difference in `mcp__ccd_session_mgmt__get_usage` between the work's start and the line, under the session's model. When that tool couldn't be loaded, the note says `workers only`.
  - Minutes, for a unit's line, from `git log -1 --format=%cI --grep="^Unit U-<n> starts$"` to the line.

## Building the queue

At the start of phase 6 the conductor writes `queue.md` from `requirements.md`, `workflows.md`, `integrations.md`, both tables of `design/screen-inventory.md`, the intake sheet's Part 8, and stage 3's corrections in `decisions.md`. Run the checks and the scoreboard first: a requirement already Verified, such as one whose scenario passed at stage 8, needs no unit.

**Ownership.**
- Every in-scope requirement that isn't Verified belongs to exactly one open unit: `queued`, `in progress` or `parked`. A merged unit keeps its requirements for the record.
- A requirement whose Verified by is `review` belongs to a `review` unit.
- A requirement two workflows list belongs to the first, in `workflows.md`'s order.
- A requirement that depends on an integration (its Depends on names `INT-<n>`, or that integration's Requirements line lists it) belongs to the integration's unit, never to a workflow's, so no workflow waits on access.
- A `fix` unit names the requirements it changes, even ones a merged unit already verified.
- The scoreboard exits 1 on a requirement in two open units. It lists a requirement that needs work and has no open unit in `unowned`: queue a `fix` unit for it.

|Kind|One unit per|Risk at start|
|-|-|-|
|`link`|row of the inventory's links table that a spec could declare but doesn't (`hand-built: not declared at stage 3`): a spec edit and `generate`|generated|
|`workflow`|workflow (`WF-<n>`), or a group of its steps (below). It replaces the `NotBuiltException` stubs its screens call, writes the business rules, removes the `test.fail` marks of the scenarios it makes pass, and writes tagged integration and unit tests for the requirements proven below the UI.|standard, or high|
|`rule`|entity, for its in-scope requirements in no workflow|standard, or high|
|`integration`|integration (`INT-<n>`). Its Depends on lists `INT-<n>` and its access question.|high|
|`review`|batch of requirements whose Verified by is `review`|standard|
|`fix`|hardening finding, integration-gap finding, answer that differs from its guess, engineer's correction, or unowned requirement|from the finding|

A workflow or rule unit starts high when its requirements plainly reach the risk paths (below). A link the generator can't write (`hand-built: <why>`, such as one on a child row or to the user) joins the unit of the workflow whose screen shows it, or the rule unit of its entity.

**Splitting a workflow.** A workflow with more than 8 in-scope requirements that need work is split by its steps. Give each requirement the first step it serves. Cut the steps, in order, into consecutive groups holding at most 8 requirements, never splitting a step. Each group is a unit titled `WF-<n>: <name>, steps <a> to <b>`, which depends on the group before it. One step that holds more than 8 stays one unit.

**Screens stage 7 left planned.** When the engineer stopped stage 7 early, design intake's run log names the rows it left `planned`, and the inventory still says so. Each such screen joins its workflow's unit (the inventory's Workflow column; for `none`, the rule unit of the entity it shows). That unit first builds the screen as stage 7 would, by steps 1 to 5 of "Stage 7: Prototype" in design intake's `stages.md`: the contract-first stub, the page, its fixtures, story and test, and its grants. Then it fills the endpoints. Such a unit always gets the design steward's review.

**Integrations.** Nothing is built against an API the run can't call. When no open question asks for an integration's sandbox access, append one in design intake's format: it asks the engineer to put the sandbox credentials in the API's user secrets (`dotnet user-secrets set <key> <value> --project <Code>.API`) and to answer with the key names, never the values. Its guess is that the integration waits. Its Blocks lists every requirement that depends on the integration. The unit and those requirements wait, Blocked-on-access, until it is answered.

**Order.** The rows' order is the queue's order, and `next` is the first movable row: dependencies first; then `fix` units; then links; then the workflow the intake sheet's Part 8 names as the one that must be excellent; then the units that verify the most requirements. A unit added later goes where this order puts it.

Number units from `U-1`; an ID is never reused. Commit as `Repo standup: the queue`, with a `queue` line, such as `built, 14 units`.

## At each unit boundary

Before each unit, and after the last:

1. Re-read `status.md`.
2. Commit the engineer's edits, then fetch and rebase onto `origin/main` (`SKILL.md`, "Where the engineer answers").
3. **Answers and edits.** Read `open-questions.md` for answers that have no `answer to Q-<n> applied` line in `decisions.md` yet. Give each that line, in design intake's format, with the phase as its stage and `decided by: engineer`. An answer that differs from its guess also gets a `fix` unit naming the requirements it changes. An engineer's edit to the pack is handled the same way: a changed requirement gets a `fix` unit, and one moved out of scope leaves its unit, which becomes `dropped` when it holds no other. Commit as `Repo standup: the queue` when the queue changed.
4. **The scoreboard.** Queue a `fix` unit for each `unowned` requirement. Act on `stop`, `alerts` and `batchDue` (`SKILL.md`).
5. **The integration-gap audit** (below), when the `merged` lines number a multiple of 5 and no `queue: audit` line follows the last of them.
6. **The stop date** (`SKILL.md`).
7. The next unit is `next`. With none, phase 6 or the hardening pass's fix work has ended (`SKILL.md`, "Where the run stands").

## One unit

1. **Next.** The scoreboard's `next`. When `Phase:` is `staging` or `handoff`, as after a resume, set it to `workflows` (`SKILL.md`, "The Phase line"). When every one of the unit's requirements is already Verified in `scoreboard.md`, it is built already: mark it `merged`, append its line, `merged: already verified; opus 0, sonnet 0`, with 0 minutes and 0 tokens, and commit as `Unit U-<n>: <title>`. It gets no branch and no implementer, and the next unit follows.
2. **Start.** In `queue.md`, mark the unit `in progress` and add one to its Attempts. In `status.md`, write its Unit line, Next and Scoreboard. Commit on `main` as `Unit U-<n> starts`. Note `get_usage` as the attempt's start.
3. **Branch.** Run `git rev-parse main` for the expected tip, and use the hash it prints, written out. Then `git switch -C unit/U-<n> main`, in the fork's own checkout. No worktrees: one unit at a time.
4. **Implement.** Dispatch `conductor-implementer` with the brief below, on the model the unit's risk names (Review). A `review` unit has no implementer here: go to step 5.
5. **The checks**, then **the done check**: the scoreboard on the branch. Each of the unit's requirements, in `scoreboard.md`'s rows, must be Verified, or Blocked-on-client by a question this unit added whose Blocks line lists it. A requirement left Not built or Built-unverified fails the attempt as a failing check does, so a unit can't merge while its scenarios carry `test.fail`, or with no tagged test. A check whose failing output matches an environmental pattern (below) is a `failed-env`, not a failed attempt.
6. **Raise the risk** (below). A match sets the unit's Risk to `high` in `queue.md`.
7. **Review**, by the table below. First check the diff isn't empty and write it to the one file the guard allows:
   ```
   git diff --stat main...unit/U-<n>
   git diff --output=.git/pell-repo-standup.diff main...unit/U-<n>
   ```
   Give each reviewer `diff_path` as that file's absolute path (`git rev-parse --show-toplevel`, then `/.git/pell-repo-standup.diff`), the unit's requirement rows, and the checkout: the repository root, on the unit's branch. Never paste the diff. Dispatch a unit's reviewers in one message.
8. **Fix.** Each blocker or major finding goes back to the implementer on the same branch: no `-C`, and the branch's tip (`git rev-parse HEAD`) as the expected tip. Then the checks and the done check again. A fresh reviewer in the same role sees the fix when the finding was a blocker or the fix was substantive. One fix round per attempt. A cheap minor finding rides in the same round; any other goes to `known-gaps.md`.
9. **Merge.**
   - `git switch main`, `git merge --ff-only unit/U-<n>`, `git branch -d unit/U-<n>`.
   - Mark the unit `merged`. Run the scoreboard, and write `status.md`'s Unit as `none` and its Next and Scoreboard from it. Append the `merged` line.
   - Commit as `Unit U-<n>: <title>`, and push `main`.

**A `review` unit.** Its checks write the captures. Dispatch `conductor-design-steward` in its screenshot mode with the captures each requirement names, and write one `reviews.md` row per requirement with the steward's verdict and the captures as evidence. Commit them on the branch as `Unit U-<n>: <title>, reviews`, then the done check. The steward's judgment is the unit's review. A `fail` goes to the implementer as a major finding (step 8), its fix's diff is reviewed by the table below, and the steward judges again.

**A failed attempt** is one whose checks or done check still fail after the implementer hands back, or whose blocker or major finding is still unfixed after its fix round. Leave the branch, append an `attempt-failed` line naming the attempt and what failed, and commit as `Repo standup: U-<n> attempt failed`. Keep the failure output, cut to what shows the cause, for the next brief. When this is the try's third failed attempt, park the unit. Otherwise the next attempt starts at step 2, with a fresh implementer. A try's failed attempts are the unit's `attempt-failed` lines since its last `parked` line.

**An environmental failure** names the database connection, a held port, a missing SDK or tool, or the disk. It isn't an attempt. Leave the branch, take one off the unit's Attempts, mark it `queued`, append a `failed-env` line naming the check, and commit as `Repo standup: the queue`. When this is the second `failed-env` line, on any unit, since the last `merged`, `parked` or `attempt-failed` line, stop the run with `failed-env twice in a row, <the check>`. Otherwise the next unit is the first in `movable` other than this one, or this one when it is the only one. The patterns, matched in the failing output:
- `error occurred while establishing a connection to SQL Server`
- `SQL Server process failed to start`
- `EADDRINUSE`
- `Failed to bind to address`
- `No .NET SDKs were found`
- `is not recognized as an internal or external command`
- `ENOSPC`
- `There is not enough space on the disk`

**Park**, on the try's third failed attempt:
1. Leave the branch, then `git branch -m unit/U-<n> parked/U-<n>`, or `parked/U-<n>-2` on a second park. It stays local, never pushed.
2. Add the unit's section to `known-gaps.md`: what each attempt tried and which check failed.
3. Append an open question in design intake's format: what the unit needs to pass, with its best guess, the failing check in If wrong, and `Blocks: none`, so its requirements show as Parked. Add its `Q-<n>` to the unit's Depends on.
4. Mark the unit `parked` and add one to its Parks. Add a `decisions.md` line naming the unit, `decided by: repo-standup`.
5. Append the `parked` line and commit as `Repo standup: U-<n> parked`.

A parked unit moves again once the questions it depends on are answered, if it has parked fewer than twice; the scoreboard decides. Its next try starts from `main`, and its brief names the parked branch and the answer. Units that depend on it can't move meanwhile.

**An interrupted attempt**, left by a session that ended mid-unit, starts over and doesn't count as a failure. If `HEAD` is on its branch, leave the branch. Commit `Unit U-<n> starts` again (`--allow-empty`), so the attempt's minutes count from now, note `get_usage` afresh, and go to step 3 with the same attempt number. `HEAD` on `perf/smoke` means a hardening pass was interrupted: commit what's left there as `Performance smoke test`, `git switch main`, and run the pass again.

## The implementer's brief

Give paths, not contents.

- **The unit:** its ID, kind and title; its requirement rows and their sources (`sources/<file>.md:<line>`); the questions in their Depends on, with their guesses.
- **What it owns:** the stubs its screens call (the inventory's API column), the acceptance scenarios tagged with its requirements, and the test each requirement needs by its Verified by: `acceptance`, a Playwright scenario under `<Code>.React/e2e/acceptance/`; `integration`, a test in `<Code>.IntegrationTests`; `unit`, a test in `<Code>.Tests` or Vitest. A planned screen adds stage 7's procedure. A `fix` unit adds its finding or answer, an `integration` unit the user-secret keys from the answer.
- **The rules:**
  - Generators first. The fork's `CLAUDE.md` applies to everything it writes: generated files never edited, tokens only, the design lint, no ruling or ledger IDs in comments, relative paths.
  - **The tags**, one per requirement: Playwright `{ tag: ['@REQ-14.3'] }` on a test or a `describe`; xUnit `[Trait("Req", "REQ-14.3")]`; Vitest `@REQ-14.3` in the test name. Never alias `test`, compute a title or pass a named callback in `e2e/acceptance/`, since the tag check wouldn't see the scenario.
  - **The ratchet.** `test.fail` marks a scenario whose feature isn't built; once the feature works, Playwright fails the run with "expected to fail but passed". The unit that makes a scenario pass removes its mark in the same change, turning `test.fail(` into `test(`. Never add a mark, never weaken an assertion to make a scenario pass, and change nothing else under `e2e/acceptance/` without saying why in the report: any other change there is reviewed against the requirement.
  - **Guess, log, continue.** A requirement whose question is unanswered is built on the question's guess, unless the question's Blocks lists it. A new unknown becomes an open question with its guess, appended in design intake's format and numbered after the highest; its Blocks lists a requirement only when no guess lets it be built. Each decision made on the engineer's behalf gets a `decisions.md` line, `decided by: conductor-implementer`.
  - Baselines and Formatting, as design intake's `stages.md` "Terms used below" says.
  - The commands the guard denies, listed in `<skill>/SKILL.md` under "Commits and pushes". Never push, never merge.
  - Secrets live in user secrets, never in the repo or in output.
- **The branch** `unit/U-<n>`, its worktree (the repository root), the expected tip as a literal hash, and `client.yaml` as its sentinel file.
- **Its commit subject:** `Unit U-<n>: <title>, work`, or `Unit U-<n>: <title>, fix` in a fix round.
- **Its checks:** the build and the tests covering what it touched. The conductor runs the full checks after it reports.
- **On a retry:** the last attempt's failure output. After a park, the parked branch, to read what was tried, and the answer.
- **In a fix round:** each finding, with its `file:line` and the fix direction.

## Raising the risk

Any match below makes the unit high. Match the paths against `git diff --name-only main...unit/U-<n>`:
- `<Code>.Domain/Authorization/**`, except `*.g.cs`
- `<Code>.Domain/Identity/**`
- `<Code>.API/Configuration/default-roles.json`
- `<Code>.API/Controllers/{Auth,Invitations,Me,Permissions,Roles,Users}Controller.cs`
- `<Code>.API/{Services,Models}/{Auth,Roles,Users}/**`
- `<Code>.API/Integrations/**`, where integration clients go

Match the deletes against the diff's content, `git diff main...unit/U-<n> -- "*.cs"`: an added line (one starting with `+`) in a file outside the test projects that contains `.Remove(`, `.RemoveRange(`, `ExecuteDelete` or `[HttpDelete`.

**The ratchet flag.** Read `git diff main...unit/U-<n> -- <Code>.React/e2e/acceptance/`. Any changed line flags the unit for the ratchet check, except a mark's removal: a removed `test.fail();` line, or a removed line whose added twin is the same text with `test.fail(` turned into `test(`.

## Review

|Risk|Review|
|-|-|
|generated (only spec edits and `generate`)|No model reads the generated output. The conductor reads the spec diff (`git diff main...unit/U-<n> -- specs/`), and the checks do the rest.|
|standard|One `conductor-correctness-reviewer`, `sonnet`|
|high|Two `conductor-correctness-reviewer`s with the same prompt, one `opus` and one `sonnet`, plus `security-reviewer`, `opus`|

On top of the table, at every risk:
- **A unit that verifies a requirement** (it adds a tagged test or removes a mark) gets `test-reviewer`, `sonnet`, asked one thing: does each such test prove its requirement as written?
- **A ratchet flag** gets `test-reviewer`, `sonnet`, comparing each changed scenario's old and new assertions against its requirement. A weakened assertion blocks the merge.
- **A unit that changes the UI** (its diff touches `<Code>.React/src/` outside tests and stories, or a baseline under `<Code>.React/screens/__baselines__/`), and every unit that builds a planned screen, gets `conductor-design-steward`, `opus`, in its screenshot mode. A generated unit gets none: its pages come from the templates.

**What each gets**, besides `diff_path`, the requirements and the checkout:
- `conductor-correctness-reviewer`: the base, `main`. Both of a pair get the same prompt.
- `security-reviewer` and `test-reviewer`: `mode: local`, `context_source: local`, the repository root.
- `conductor-design-steward`: as design intake's `stages.md` "Working with agents" says: the checks' run in `<Code>.React/screens-output/` with its commit and time; the unit's captures, being the routes whose baselines the diff adds or changes, in every mode, plus the home and one generated list of the same page group; `design/brief.md`, `glossary.md` and `design/conventions.md`. Dispatch it before any later harness run, which would empty the folder.

**What findings do:**

|Agent|Blocks the merge|Minor|
|-|-|-|
|`conductor-correctness-reviewer`|`blocks`, `major`|`minor`|
|`security-reviewer`|`critical`, `high`, `medium`|`low`, `nit`|
|`test-reviewer`|`major`|`minor`, `nit`|
|`conductor-design-steward`|a finding that flags the unit: `blocks`, or one that fails a litmus question|`notable`, `minor`|

A high or critical security finding also raises the security alert, once per finding (`SKILL.md`).

**Models**, passed as the Agent tool's `model`. The agents' own frontmatter stays `inherit`.

|Work|Model|
|-|-|
|The conductor|the session's model|
|Implementing generated and standard units; standard review; the test and ratchet checks|`sonnet`|
|Implementing high units; the stronger of a high pair; the per-unit security review; the design steward; the integration-gap audit; hardening's security review|`opus`|
|The handoff writer|`sonnet`, pinned|
|The scoreboard, the checks, `generate`, the scans|none: commands|

## The integration-gap audit

Every 5 merged units, and as the first scan of each hardening pass, so it also runs at the end of phases 6 and 7. Dispatch one `conductor-integration-gap-auditor`, `opus`, on `main`, with the checkout, the base, and the requirements the units merged since the base verify. The base is the last `Repo standup: audit` commit (`git log -1 --format=%H --grep="^Repo standup: audit$"`), or, for the first audit, the oldest `Repo standup: the queue` commit: the first line of `git log --reverse --format=%H --grep="^Repo standup: the queue$"`. Don't take the oldest commit to touch `queue.md`, which is the fork's skeleton.

Each `blocks-workflow` or `misleading` finding becomes a `fix` unit, high when its files match the risk paths and standard otherwise. A `cosmetic` one goes to `known-gaps.md`'s minor findings. Append a `queue` line, `audit, <n> fix units`, and commit as `Repo standup: audit`.

## Hardening

Phase 7 runs a pass when nothing is movable and there has been no pass, or `merged` lines follow the last `queue: hardening pass` line. A pass starts by setting `Phase: hardening` when it isn't already (`SKILL.md`, "The Phase line"). After the first, a pass is scoped to what changed since the last `Repo standup: hardening` commit (`git log -1 --format=%H --grep="^Repo standup: hardening$"`, then `git diff --name-only <that hash> main`): security reads only the changed hand-written files; the dependency scans run when a `*.csproj`, `Directory.Packages.props` or `package-lock.json` changed; screens and design run when anything under `<Code>.React/` changed; the performance test runs when any code outside the tests changed.

1. **The integration-gap audit** (above), over what changed since the last audit.
2. **Security.** `repo-security-reviewer`, `opus`, over the hand-written files from `git ls-files`, leaving out generated files (`*.g.cs`, `*.generated.ts`, `*.generated.tsx`, `<Code>.React/src/components/ui/`), migrations, `docs/`, baselines and images. Chunks of about 25 files, dispatched in one message, each with `mode: repo`, `repo_root`, `chunk_index`, `chunk_total`, `focus` and `files`, as `/pell:repo-security-review` dispatches them.
3. **Dependencies.** `dotnet list <Code>.Web.sln package --vulnerable --include-transitive`, and `npm audit --omit=dev`.
4. **Screens.** `npm run screens`, every theme, which is now only the client's, with axe.
5. **Design.** `conductor-design-steward`, `opus`, in its screenshot mode over the whole contact sheet from step 4's run, against `design/brief.md` and `design/conventions.md`.
6. **Performance smoke test**, below.

Each finding of medium severity or more becomes a `fix` unit, high for a security finding, generated for one a spec edit alone fixes, and standard otherwise. Medium or more means a security finding of `medium` and up, a moderate or worse advisory, a failing axe or layout gate, a design finding that flags, and a timing over one second. Lower findings go to `known-gaps.md`, under "Logged by hardening". Append a `queue` line, `hardening pass, <n> fix units`, which marks the pass, and commit as `Repo standup: hardening`. The fix units run through the loop above, with `Phase:` still `hardening`.

**The performance smoke test.** It runs on a throwaway branch, `perf/smoke`, never merged or pushed. The conductor runs `git switch -C perf/smoke main`, then dispatches `conductor-implementer`, `sonnet`, to measure, not to build, with the branch, the expected tip and the sentinel as for a unit, and these steps:
1. Set every spec's `sampleCount` in `specs/entities/` to 1000, or to a volume a requirement states when that is higher. Run `generate`, then the build.
2. Start the API in Development, in the background, on a database of its own, `<Code>_Perf`, so the engineer's database is untouched: `ConnectionStrings__Default` set for that process alone from the API's user secret with its database changed, never printed. The sample seeder fills each empty table.
3. Signed in as the seeded administrator, time each list endpoint's first page three times, and each list page's and the home's first load in a browser, with a throwaway Playwright script on the branch. Report the median of each.
4. Stop the API, and commit what it wrote as `Performance smoke test`.

Then the conductor runs `git switch main`; the next pass's `-C` resets the branch. Each median over one second is a finding, naming the endpoint or page and its time. The `queue` line's note names `<Code>_Perf`, for the engineer to drop.
