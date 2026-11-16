# Repo standup orchestrator: Design Spec

Status: approved design (Brandon, 2026-11-15). Tasks 1 to 3 were built on 2026-11-16. Design intake's trial 1 passed on 2026-11-16, and its findings are folded in below. The rest of the build waits for design intake's framework half to merge, and for Brandon's go.
Date: 2026-11-15
Related: the repo-standup plans (`03-orchestrator.md` and the plans README's decisions 7 to 16, kept outside this repo); design intake's spec, `docs/specs/2026-11-09-design-intake-design.md`, and its skill on branch `design-intake`; the Pell Web App Framework's `CLAUDE.md` (Standard commands, Generators) and `docs/measures/entity-cost.md`; `/pell:init-client-repo`.

Marks: **(Brandon)** is a decision Brandon made, **(decision N)** one from the plans README, **(agreed with design intake)** one settled with the design intake session, and **(Claude's call)** one made while writing this spec, for Brandon to check.

## Why

Repo-standup forks the Pell Web App Framework for a new client and has agents build the project from the client's Scope of Work. Design intake turns the SOW into requirements, a domain model, generated entities, a client theme, a prototype on contract-first stubs and acceptance tests that fail until the feature exists. The orchestrator is what runs all of it end to end: it calls the fork command and design intake, then builds the business logic one unit at a time until every requirement is in a final state, and hands the result to the Pell engineer who will own the project.

The first experiment shows what to avoid. A simulated seven-team org spent its budget on coordination; after 398 commits only Wave 0 and part of Wave 1 were done. It hit its spend limit, restarted, and lost its context, because agent transcripts don't carry over. The orchestrator has one conductor, no managers and no proposal documents, keeps every piece of state in files in the fork, and computes "done" from test results instead of taking an agent's word for it.

**Who reads it (decision 7).** The first person to open the repo after a run is the Pell engineer who will own the project, who may not have run intake. The client sees nothing until that engineer has reviewed it.

## What it is

A Pell skill, `repo-standup`, in `plugins/pell/skills/repo-standup/`. The engineer opens a Claude Code session with auto mode on and types `/pell:repo-standup`. Each time, it works out where the run stands from the files and carries on until it has to stop. Every later session takes the same prompt.

```
 1. Fork          /pell:init-client-repo                     engineer gives its yeses
 2. Intake        design intake stages 1-2                   ◆ checkpoint 1: the intake sheet
 3. Foundation    design intake stage 3
 4. Design        design intake stages 4-6                   ◆ checkpoint 2: the direction pick
 5. Prototype     design intake stages 7-8
 6. Workflows     the work loop, one unit at a time          questions batched, never waited on
 7. Hardening     scans, then fix units through the same loop
 8. Staging       skipped until the Azure module exists
 9. Handoff       the handoff package                        the engineer's final review
```

It has a small framework half: the `scoreboard` command, test results written to files, a seed login per persona, and the new pack files.

## Decisions

|Decision|Who|
|-|-|
|No scheduler. A run starts and resumes from one prompt in a Claude Code session with auto mode on. There are no shift timers or unit caps.|Brandon|
|One unit at a time: implement, checks, review, merge, then the next. The checks share one database and port, and nothing waits unreviewed.|Brandon|
|Three failed attempts park a unit. A parked unit gets one more try once its question is answered; a second park raises an alert.|Brandon|
|The scoreboard is a scaffolder command in the framework, not a script in the skill.|Brandon|
|The scoreboard command also does the queue's arithmetic: which units can move, the next one, and every numeric stop and alert condition. The skill does the judgment work.|Brandon (approach B)|
|Seven requirement states: Verified, Built-unverified, Not built, Parked, Blocked-on-client, Blocked-on-access, Out-of-scope.|Brandon|
|Tags: Playwright `{ tag: ['@REQ-14.3'] }`, xUnit `[Trait("Req", "REQ-14.3")]`, Vitest `@REQ-14.3` in the test name.|Brandon|
|Review scales with risk (generated, standard, high), plus a test check on every unit that verifies a requirement and a ratchet check on acceptance scenarios.|Brandon|
|Stop and alert thresholds, the question batches, and an optional stop date.|Brandon|
|The handoff package's contents, including a seed login per persona and the cost report.|Brandon|
|An integration waits for its sandbox access; nothing is built on a guess about an outside API.|Brandon|
|A push guard hook enforces decision 10 under auto mode.|Claude's call, accepted by Brandon|
|`/pell:init-client-repo` sets Bitbucket branch restrictions (no force push, no deletion) on the client repo at fork time.|Brandon|
|Design intake runs phases 2 to 5 unchanged, one stage per call, and ends each call with a fixed outcome line.|agreed with design intake|
|The client repo is created only on the engineer's yes inside the fork command; pushes go to the client repo's `main` only, never forced; no Jira.|decision 10|
|Questions go only into `open-questions.md`, with a push notification per batch.|decision 11|
|No token cap; tokens are still logged per unit.|decision 9|

## Goals

1. **From approved intake to handoff, the engineer only answers.** After the fork, the engineer's work is the two checkpoints, answering questions in the file when they choose, and typing the prompt again when a session ends.
2. **Done is computed.** Every requirement is in exactly one state, and a command derives it from test results and files. No model writes the scoreboard.
3. **Resumable anywhere.** Any session, at any point, picks up from the fork's files alone. An interrupted unit starts over; nothing else is lost.
4. **`main` stays green.** A unit merges only after every check passes on its branch, and it's the only unit in flight.
5. **Cost is measured.** Tokens and minutes per unit and per phase, so the next estimate starts from data.
6. **The owning engineer can pick it up cold.** From `handoff.md` alone they can start the app, sign in as each persona and know what to do first.

## Non-goals

- Starting runs on a schedule or without a person typing the prompt.
- Running units in parallel. That would need a database and port per worktree; it can come later.
- Jira tickets (decision 10), cloud environments (decision 8), or anything the client reads (decision 12).
- The staging deploy, until Phase 5's Azure module exists.
- Changing how design intake does its stages.
- SOWs that live in Jira or Confluence (design intake's non-goal too).

## Anti-goals (it fails even if it works)

- A green scoreboard built on tests that don't prove their requirement, or an acceptance scenario weakened to pass.
- Coordination paperwork: managers, per-phase architects, proposal documents.
- A run that waits on the client, or shows the client anything.
- A push to anything but the client repo's `main`, or a forced push.
- State that lives only in a transcript.
- Tokens burned on a stuck unit or a broken environment.
- A client's name anywhere in the framework or Pell_Skills.

## Constraints

- A developer machine (decision 8): .NET 10, Node 22, SQL Server (LocalDB or the engineer's own), and Bitbucket access. The checks share the integration tests' database and port 7143, so they run one at a time.
- Windows for now: the framework's screenshot baselines exist only on Windows until CI runs. Other systems are untested, not refused **(Claude's call)**.
- Outward actions (decision 10): pushing to the client repo's `main` is a standing yes. Nothing else outward happens mid-run.
- Fetching (decision 16) happens only inside design intake's brand capture.
- All paths relative. The framework's rules apply to everything the run writes in the fork: generators first, generated files never edited, tokens only, the design lint, and no ruling or ledger IDs in code comments.
- Pell_Skills' conventions: agents end with JSON, except the documented exceptions; plain text output; housekeeping in the same change.

## Approaches

|Approach|Trade-off|
|-|-|
|A. The skill runs the loop; `scoreboard` only reports states.|Fewest parts. The model counts parks, blocked shares and batches over days, so the thresholds become judgment calls.|
|**B. The skill runs the loop; `scoreboard` also does the queue arithmetic.** (picked)|The numbers come from tested code and give the same answer every time. A little more scaffolder code.|
|C. A separate driver program on the Claude Agent SDK.|Fully deterministic, exact costs. Needs API billing, its own codebase and tests, and isn't a prompt to a session. Ruled out.|

Brandon picked B: the thresholds are numbers, and numbers belong in tested code. Everything that needs judgment (building the queue, setting risk, dispatching workers and reviewers, writing each unit's state) stays in the skill.

## Starting and resuming a run

**The first session** can start anywhere, such as the engineer's repos folder.

1. If the session isn't in a fork (no `client.yaml` and `docs/project/` at the repository root), the skill runs `/pell:init-client-repo`, which asks its own yeses (the repo, the plan). Then it works in the new fork's folder.
2. **Setup, once per fork** **(Claude's call)**:
   - copy the push guard to `.claude/repo-standup/guard.mjs`
   - write `.claude/settings.local.json` with a `PreToolUse` hook on `Bash` that runs it
   - add both paths to `.git/info/exclude`, so they never reach the client repo
   - ask the engineer for an optional stop date, and write `status.md`
3. It calls design intake, whose stage 1 asks for the documents and the client's URL, and carries on through stage 2 to checkpoint 1.
4. It tells the engineer to open the next session in the fork's folder, since a session loads the guard only from the folder it starts in.

**Every session after that** opens in the fork, with auto mode on, and types `/pell:repo-standup`.

**The guard check.** Every session starts by proving the guard is loaded **(Claude's call)**. It runs a canary the guard must refuse: a forced dry-run push to a remote named `repo-standup-guard-check`, which doesn't exist. With the guard loaded, the call is denied with the guard's message. Without it, git fails with "does not appear to be a git repository", and nothing touches the network. If the canary isn't denied, the skill stops and tells the engineer to open a new session in the fork's folder. Until checkpoint 1 nothing pushes (design intake's rule, and the fork command's push has its own yes), so the first session needs no guard.

**Auto mode** is the engineer's switch. The skill doesn't depend on it, but without it the engineer is asked about each tool call.

**Where the run stands** is read in this order:

|When|Next|
|-|-|
|No fork|Phase 1|
|The guard check fails|Stop: open a new session in the fork|
|`status.md` holds no `Phase:` line|Setup|
|Design intake isn't done (its signal table)|Call design intake with `from repo-standup`; phases 2 to 5|
|`queue.md` holds no unit|Build the queue; phase 6|
|The scoreboard names a movable unit|The work loop|
|No movable unit, and hardening hasn't run, or units merged since it last ran|Phase 7, scoped to what changed since the last hardening when it ran before|
|Nothing movable, and hardening has seen every merged unit|Phase 9|

A run is never closed. `State: done` only means nothing could move when it stopped. The next session re-runs the scoreboard, and if an answered question or an engineer's edit has made a unit movable, the loop resumes and the handoff is rewritten when it stops again.

**Where the engineer answers (Claude's call).** Either in the fork's working tree on the run's machine, or anywhere else (Bitbucket's web editor from a phone, another clone) and pushed to `main`. At each unit boundary, on a clean `main`:
1. `git fetch origin`, and fast-forward to `origin/main` when it's ahead.
2. Commit any uncommitted edits under `docs/project/` as `Repo standup: the engineer's edits`. An uncommitted file elsewhere was written by no unit: stop and tell the engineer.

If a push at merge is rejected because the engineer pushed during the unit:
- fetch, and rebase the run's unpushed commits onto `origin/main`
- run the checks again when the incoming commits touch anything outside `docs/project/`
- push

A rebase conflict stops the run with `main diverged`.

**Keeping the conductor's context small.** The session is the conductor. It re-reads `status.md` at the start of each unit instead of relying on memory, reads only the pack slices a unit needs, and gives workers paths, not contents. Compaction or a new session loses nothing.

## The phases

|Phase|Done by|Human|Ends when|
|-|-|-|-|
|1. Fork|`/pell:init-client-repo`|The engineer starts it and gives its yeses|The fork is pushed|
|2. Intake|design intake stages 1 and 2|Checkpoint 1: the intake sheet, with the mandatory domain-model review (decision 14)|The sheet says `Status: approved`|
|3. Foundation|design intake stage 3|None|Entities generated, Order removed, first push|
|4. Design|design intake stages 4 to 6|Checkpoint 2: the direction pick (decision 12)|The client theme is locked|
|5. Prototype and acceptance|design intake stages 7 and 8|Optional: the engineer may show the client by screen share; the run doesn't wait|Design intake reports `done`|
|6. Workflows|the work loop|Batched questions only|No workflow, link, rule, integration or review unit can move|
|7. Hardening|scans, then fix units through the work loop|None|Its fix units are merged or parked|
|8. Staging|skipped|Per-run yes at fork time, once the module exists|Logged as skipped|
|9. Handoff|`handoff-writer` and the `scoreboard --cost` tables|The engineer's final review|The package is committed and pushed|

**Phases 2 to 5.** The skill calls design intake once per stage, passing `from repo-standup`, and reads the outcome line that ends every call **(agreed with design intake)**:

- `design-intake: ran stage <n> <name>`: record the phase, then call it again
- `design-intake: waiting on <path>`: write `State: waiting on <path>` in `status.md`, commit, and end the turn. Design intake has already sent the checkpoint notification. Stages 2 and 5 end with this line, not `ran stage`, after committing and logging their work, so the phase comes from the path: `intake-sheet.md` is intake, and `design/directions/README.md` is design.
- `design-intake: done`: go to phase 6
- `design-intake: stopped: <reason>`: stop with that reason
- **no outcome line**, which trial 1 saw at stage 5 before the pick: read design intake's signal table and act on what it says, the same as for a `waiting on` line when it shows a checkpoint **(Claude's call, after trial 1)**

It never runs design intake's stages itself and never dispatches their agents. Stages 7 and 8 run their own per-row units, with the same park rule.

**Phase 7, Hardening (Claude's call on the set):**

- `repo-security-reviewer` over the hand-written files (generated files excluded)
- the dependency scans, `dotnet list package --vulnerable --include-transitive` and `npm audit --omit=dev`
- `npm run screens` (every theme, which is now only the client's), with axe
- `conductor-design-steward` over the whole contact sheet, against the brief and `conventions.md`
- a performance smoke test: the app on sample data scaled up through `sampleCount`, timing each list endpoint and each page's first load, and flagging anything over one second. The mechanism is the builder's.

Each finding of medium severity or more becomes a `fix` unit with its risk. Lower findings go to `known-gaps.md`.

**Phase 8** writes `Staging: skipped, no Azure module` to `status.md` and a run-log line. A later change adds the deploy once Phase 5 exists.

## The work loop

### The queue

`queue.md` is built at the start of phase 6 by the conductor, from `requirements.md`, `workflows.md`, `integrations.md` and the screen inventory.

**Ownership (Claude's call).**
- Every in-scope requirement that still needs work (Not built, Built-unverified or Parked) belongs to exactly one open unit: `queued`, `in progress` or `parked`.
- A merged unit keeps its requirements for the record.
- A `fix` unit names the requirements it changes, even ones a merged unit already verified.
- The scoreboard command fails on a requirement in two open units.
- It prints any requirement that needs work and has no open unit as `Unowned`, and the conductor queues a `fix` unit for it.

|Kind|One unit per|Risk at start|
|-|-|-|
|`link`|row of the screen inventory's links table not yet in a spec: a spec edit and `generate`|generated|
|`workflow`|workflow (`WF-<n>`), or a group of its steps when it has more than about 8 in-scope requirements. It replaces the `NotBuiltException` stubs its screens call, writes the business rules, removes the `test.fail()` marks of the scenarios it makes pass, and writes tagged integration and unit tests for the requirements proven below the UI.|standard, or high|
|`rule`|entity, for in-scope requirements in no workflow|standard, or high|
|`integration`|integration (`INT-<n>`). Its first dependency is an open question asking for sandbox access, kept in user secrets, never the repo. Its `Blocks` line lists every requirement that depends on the integration, so the unit and those requirements wait, Blocked-on-access, until the engineer answers. Nothing is built against an API the run can't call **(Brandon)**.|high|
|`review`|batch of requirements whose "Verified by" is `review`: the design steward judges, and the conductor writes `reviews.md`|standard|
|`fix`|hardening finding, integration-gap finding, answer that differs from its guess, or engineer correction|from the finding|

**Order:** dependencies first; then `fix` units; then links; then the workflow the intake sheet names as the one that must be excellent; then the units that verify the most requirements **(Claude's call)**.

**Screens stage 7 didn't build (after trial 1).** The engineer may stop stage 7 early for cost; trial 1 prototyped one workflow of seven. Design intake's run log then records the rows left `planned`, and those rows go to the build. Each belongs to its workflow's unit. That unit first builds the screen as stage 7 would: the contract-first stub, the page, its fixtures, story and test, and its grants. Then it fills the endpoints. Such a unit always gets the design steward's review **(Claude's call)**.

**Guess, log, continue.** A unit whose requirement depends on an unanswered question goes ahead on the question's guess, unless the question's `Blocks` line lists the requirement.

**Answers and edits.** At each unit boundary the conductor reads `open-questions.md` for answers it hasn't applied. An answer that matches its guess gets a `decisions.md` line, `answer to Q-<n> applied`. One that differs also gets a `fix` unit naming the requirements it changes. An engineer's edit to the pack is handled the same way.

### One unit

1. **Next.** Run `scoreboard`. It names the next movable unit, or a stop.
2. **Start.** Mark the unit `in progress` with its attempt in `queue.md`, update `status.md`, and commit on `main` as `Unit U-<n> starts`.
3. **Branch.** `git switch -C unit/U-<n> main` in the fork's own checkout. No worktrees **(Claude's call)**: one unit at a time, as design intake does. An interrupted attempt is dropped by the `-C` and starts over; it doesn't count as a failure.
4. **Implement.** `conductor-implementer`, on the model its risk names. Its brief:
   - the unit's requirements and their sources
   - the stubs, scenarios and tests the unit owns
   - the rules: generators first, the fork's `CLAUDE.md`, the tag forms, the expected-failure ratchet, never weaken an assertion
   - the branch, the expected tip and `client.yaml` as its sentinel file
   - on a retry, the last attempt's failure output
5. **The checks.** The conductor runs them itself after the implementer reports, one at a time: every command in the fork's Standard commands, with screenshots in the active theme. A claim of passing is not a pass.
   **The done check (Claude's call).** Run `scoreboard` on the branch. Each of the unit's requirements must come out Verified, or Blocked-on-client by a question this unit raised whose `Blocks` line lists it. A requirement left Not built or Built-unverified fails the attempt, as failing checks do. So a unit can't merge while its scenarios still carry `test.fail()`, or with no tagged test.
6. **Raise the risk.** Match the branch's `git diff --name-only main` against the path list in the skill's references:
   - `Permissions.All`
   - `default-roles.json`
   - sign-in, users and roles
   - integration clients
   - deletes

   Any match makes the unit high. Then check every changed line under `e2e/acceptance/`: anything but a removed `test.fail();` flags the unit for the ratchet check.
7. **Review**, by the table below. Reviewers get the diff as `diff_path`, under the repo's diff handoff convention: `git diff --output=<git_dir>/pell-repo-standup.diff main...unit/U-<n>`, never pasted. They also get the requirements and the checkout.
8. **Fix.** A blocker or major finding goes back to the implementer on the same branch (no `-C`, the branch tip as the expected tip). Then the checks run again. A fresh reviewer sees the fix when the finding was a blocker or the fix was substantive.
9. **Merge.**
   - `git switch main`, `git merge --ff-only unit/U-<n>`, `git branch -d unit/U-<n>`.
   - Mark the unit `merged`, run `scoreboard`, and append the run-log line.
   - Commit as `Unit U-<n>: <title>`, and push `main`.

**A failed attempt** is one whose checks or done check still fail after the implementer hands back, or whose blocker or major finding is still unfixed after its fix round. The conductor appends an `attempt-failed` line and starts the next attempt with a fresh implementer.

**An environmental failure** is one whose output names the database connection, a held port, a missing SDK or tool, or the disk. The patterns are in the skill's references. It is logged as `failed-env` and isn't an attempt.

**Park.** On the third failed attempt:
- the branch is renamed `parked/U-<n>` and kept locally
- `known-gaps.md` gets what was tried and which check failed
- an open question is added, with its best guess
- the unit is marked `parked`, and its `Parks` count goes up
- units that depend on it can't move

A parked unit is movable again once the questions it depends on are answered and it has parked fewer than twice. A second park raises an alert.

**Every 5 merged units and at each phase end**, `conductor-integration-gap-auditor` checks the merged whole. Its findings become `fix` units.

### Review by risk

|Risk|Review|
|-|-|
|generated (only spec edits and `generate`)|No model reads the generated output. The conductor reads the spec diff; the checks do the rest.|
|standard (hand-written)|One `conductor-correctness-reviewer`, mid tier|
|high|Two `conductor-correctness-reviewer`s with the same prompt, strongest and mid tier, plus `security-reviewer`|

On top of the table:
- **Every unit that verifies a requirement** (adds a tagged test, or removes a `test.fail()` mark) gets `test-reviewer`, asked one thing: does each such test prove its requirement as written?
- **A ratchet flag** gets `test-reviewer` comparing the scenario's old and new assertions against the requirement. A weakened assertion blocks the merge.
- **A unit that changes the UI** gets `conductor-design-steward` in its screenshot mode, on the unit's captures.

What findings do:
- Blocker and major findings block the merge.
- Minor findings are fixed in the same round if cheap, otherwise listed in `known-gaps.md`.
- A high or critical security finding blocks the merge and raises an alert.

### Models

|Work|Model|
|-|-|
|The conductor|the session's model, the strongest|
|Implementing generated and standard units, standard review, the test and ratchet checks|`sonnet`|
|Implementing high units; the strongest reviewer of a high pair; the design steward; hardening's security review|`opus`|
|The handoff writer|`sonnet`, pinned|
|The scoreboard, the checks, `generate`, the scans|none (commands)|

The tier is passed as the Agent tool's `model`. The agents' own frontmatter stays `inherit`.

## Stops, alerts and question batches

The scoreboard command computes every condition marked (command). The conductor judges the rest.

**Stops**, which write `State: stopped: <reason>` in `status.md`, commit, push, notify, and end the turn:

|Condition|Then|
|-|-|
|Nothing movable (command), after hardening|Phase 9, then `State: done`|
|`failed-env` on 2 units in a row (command)|Stop before it parks everything; the notification names the failing check|
|3 parks in a row (command)|Stop: something systemic is wrong|
|The stop date has passed|Finish the current unit, write the handoff, stop|
|A design intake `stopped:` line|Stop with its reason|
|The usage limit|Nothing special: state is committed at each unit boundary, and an interrupted unit starts over on resume|

**Alerts**, which send a notification and carry on:
- a high or critical security finding (the merge is already blocked)
- a unit parked twice (command)
- more than 30% of the remaining in-scope requirements are Blocked-on-client or Blocked-on-access (command). "Remaining" means in scope and not Verified.

**Question batches.** In place of decision 11's "end of shift", one notification goes out when questions were added since the last one:
- at each phase end
- every 10 merged units (command)
- whenever the run stops

It gives the count and the riskiest question. Design intake sends only its two checkpoint notifications when called with `from repo-standup` **(agreed with design intake)**.

**Notifications** use Claude Code's `PushNotification`, under 200 characters, one line. Each sent notification appends a `notified` run-log line naming the highest question number it covers, which is how the command knows what's new. Where the tool is missing or doesn't send, the message goes in chat and in that line's note.

## State files

All under `docs/project/`. The formats are in the skill's `references/formats.md`. Phase 4's skeleton gains the new ones (see Framework changes).

**`status.md`**, read first by every session, kept short:

```
# Status

- Phase: <fork | intake | foundation | design | prototype | workflows | hardening | staging | handoff>
- State: running | waiting on <path> | stopped: <reason> | done
- Unit: U-<n>, attempt <a>, branch unit/U-<n> | none
- Stop date: <yyyy-MM-dd> | none
- Staging: skipped, no Azure module
- Updated: <yyyy-MM-dd HH:mm>
- Next: U-<n>, U-<n>, U-<n>
- Scoreboard: <the command's one-line counts>
```

**`queue.md`**, one table:

```
|Unit|Kind|Title|Requirements|Depends on|Risk|State|Attempts|Parks|
|-|-|-|-|-|-|-|-|-|
```

- Unit is `U-<n>`, never reused.
- Kind is from the queue table above.
- Depends on lists `U-<n>`, `Q-<n>`, `INT-<n>` and framework module names.
- Risk is `generated`, `standard` or `high`.
- State is `queued`, `in progress`, `merged`, `parked` or `dropped` (its requirements went out of scope).

**`known-gaps.md`**: one section per parked unit (what was tried, per attempt, and which check failed), then the minor findings left unfixed, then anything hardening logged below medium. Each entry names its unit and requirements.

**`reviews.md`**: the verdicts for `review` requirements.

```
|Requirement|Date|Unit|Reviewer|Verdict|Evidence|
|-|-|-|-|-|-|
```

Verdict is `pass` or `fail`. Evidence names the captures.

**`run-log.md`**: design intake's line shape, with the time added to the date and a fixed outcome word **(Claude's call)**.

```
- <yyyy-MM-dd HH:mm> | repo-standup <phase> <U-<n> or -> | <minutes> min | <tokens> tokens | <outcome>: <note>
```

- Outcome is one of `merged`, `attempt-failed`, `failed-env`, `parked`, `phase`, `notified`, `stopped`, `queue`.
- The note ends with the tokens by model (`opus <n>, sonnet <n>`).
- When the conductor's own tokens are unknown, the note says `workers only`.
- The command reads both line shapes.

**`decisions.md`** and **`open-questions.md`** use design intake's formats unchanged. The orchestrator appends, never rewrites.

## The scoreboard command

A scaffolder command, in the framework:

```
dotnet run --project tools/<Code>.Scaffolder -c Release -- scoreboard [--cost --rates <file>]
```

**Reads:**
- `requirements.md`, `open-questions.md`, `integrations.md`, `queue.md`, `reviews.md` and `run-log.md`
- `client.yaml` for modules
- the result files the checks write (see Framework changes)

**Writes** `scoreboard.md` whole: a header with the counts per state, the time each results file was written, and the commit at `HEAD`. Then one row per requirement: its ID, its requirement cut to one line, its state, the tests that carry its tag by kind (passed of total), its unit, and its `Depends on`. With `--cost`, it also writes `cost-report.md`'s tables.

**States**, each requirement in exactly one, checked in this order:

|State|When|
|-|-|
|Out-of-scope|Scope says `out:`|
|Verified|At least one test of its "Verified by" kind carries its tag, and every test carrying its tag passed, with none expected-to-fail or skipped. A `review` requirement instead needs its latest `reviews.md` verdict to be `pass`.|
|Blocked-on-access|It depends on an `INT-<n>` whose access question is unanswered, or on a framework module `client.yaml` doesn't list|
|Blocked-on-client|An unanswered question's `Blocks` line lists it|
|Parked|Its unit is `parked`|
|Built-unverified|Its unit is `merged`, but its tests are missing, failing or of the wrong kind|
|Not built|Anything else in scope|

**Movable**: a unit that is `queued`, or `parked` with fewer than 2 parks and every question it depends on answered. Its unit dependencies must be merged, and none of its requirements Blocked-on-client or Blocked-on-access.

**Prints** a block the skill reads, and `--json` gives the same as JSON:

```
Movable: <n> (next U-<n>)
Unowned: REQ-<n>.<n>, ... | none
States: <n> Verified, <n> Built-unverified, <n> Not built, <n> Parked, <n> Blocked-on-client, <n> Blocked-on-access, <n> Out-of-scope
Blocked share: <n>% of <n> remaining
In a row: <n> parks, <n> env failures
Parked twice: U-<n>, ... | none
Since the last notification: <n> merged, <n> questions
Stop: none | nothing-movable | parks-in-a-row | env-broken
Alerts: none | blocked-over-30 | parked-twice
Batch due: yes | no
```

The thresholds (30%, 3, 2, 10) are named constants, documented beside the command.

**Exit 1**, naming the file and line, on:
- a malformed table
- a tag naming a requirement that doesn't exist
- a requirement in two open units
- a unit naming a requirement that doesn't exist

Otherwise exit 0. Results written before `HEAD`'s commit time put a stale warning at the top of `scoreboard.md`.

**`--cost`** writes:
- tokens and minutes by phase and per unit
- the median, and every unit over 3 times it
- tokens per Verified requirement
- foundation's tokens per generated entity, beside the 162k benchmark
- prototype tokens and minutes per screen, from design intake's stage 7 line divided by the screens it prototyped, beside trial 1's figures (about 318k tokens and 38 agent minutes a screen)
- each checkpoint's waited time, from the commit times of the stage that ended at it and the next stage's start
- a dollar estimate per row from `--rates`, a small JSON file of blended list prices per model that the skill ships and dates, labeled as an estimate

A worker's tokens come from its completion notice. Trial 1 found that for a long-running agent this count tracks its context, so it understates what was billed. The report says so above its tables. Its figures are for comparing units, phases and runs, and the dollar row is a floor, not a price.

## Tags

|Kind|Form|
|-|-|
|Playwright|`{ tag: ['@REQ-14.3'] }`, on a test or a `describe` (design intake's form)|
|xUnit|`[Trait("Req", "REQ-14.3")]`, one attribute per requirement|
|Vitest|`@REQ-14.3` in the test name, once per requirement|

The ID is `REQ-<SOW item>.<n>`, and `REQ-0.<n>` is valid. Design intake's tag check covers `e2e/acceptance/` only, with the regex `@REQ-\d+\.\d+`. The scoreboard command reads all three kinds and fails on an unknown ID.

## The push guard

A Node script, `hooks/guard.mjs` in the skill, copied into the fork at setup. Run as a `PreToolUse` hook on both `Bash` and `PowerShell` (a Windows session has both, and either can run git), it reads the tool call from stdin and denies the call when it finds a `git push` that breaks decision 10. A hook's deny holds in every permission mode, auto included, while a deny rule's text match misses forms like `git -C . push`.

- It splits compound commands in both shells' syntax (`&&`, `||`, `;`, `|`, subshells, PowerShell's `&` call operator) and finds `push` as git's subcommand behind any global options (`-C`, `-c`, `--git-dir`).
- It allows `git push`, `git push origin`, `git push origin main` and `git push -u origin main`, only when `origin`'s URL names `client.yaml`'s `repository.bitbucket` (both SSH host forms and https).
- It denies:
  - `-f`, `--force`, `--force-with-lease`, a `+` refspec
  - `--delete`, `--mirror`, `--all`, `--tags`
  - any refspec but `main`
  - any remote but `origin`
  - any push whose remote names the framework's repository
- It fails closed: a command that names `push` and that it can't parse is denied.
- It recognizes the canary remote `repo-standup-guard-check` and denies it with a message the guard check looks for.

**Hardening after two security reviews (2026-11-16, Claude's call).** The command-text layer above failed open on several things: config overrides, aliases, wrappers, abbreviated options, shell escapes, a `cd` before the push, and push URLs. It now recognizes one push shape and denies anything else that might push. Where this list and the rules above differ, this list wins.
- **The only allowed pushes** are `git push origin main`, `git push -u origin main` and `git push origin main:main`, with `-C <dir>` the only git global option. Bare `git push`, `git push origin` and `HEAD:main` are denied.
- **The push must be the only segment of its command.** Nothing may set the directory or environment before it: no `cd`, `pushd`, `Set-Location`, `VAR=`, `env` or `$env:` anywhere in the command.
- **Push options come from an allowlist:** `-u`, `--set-upstream`, `-q`, `--quiet`, `-v`, `--verbose`, `--porcelain`, `--progress`, `--no-progress`. Anything else is denied, abbreviations included.
- **Detection runs on normalized text,** with quotes, backslashes, backticks and `^` removed:
  - A segment whose normalized text names `push` must be the allowed shape, or git with a plain builtin subcommand other than push, as in `git log --grep push`.
  - Any other program naming push is denied: shells, `env`, `xargs`, interpreters, `npm`, `eval`.
  - Every git segment's raw subcommand must be a plain `[a-z0-9-]+` builtin, which blocks aliases and escaped names.
- **The remote:**
  - Every URL from `git remote get-url --push --all origin` must name the client repo.
  - A push is denied when `remote.origin.push` or `remote.origin.mirror` is set.
- **The hook command is absolute,** `node "$CLAUDE_PROJECT_DIR/.claude/repo-standup/guard.mjs"`. An internal error while judging a command that names push denies it. A guard that fails to start at all is caught by the session's canary check.
- **A second layer, a git `pre-push` hook,** goes into the fork's `.git/hooks/` at setup. Git hands it the URL it really pushes to and each ref. It refuses:
  - a URL that isn't the client repo
  - any ref but `refs/heads/main`
  - a delete
  - anything that isn't a fast-forward, or that it can't check because the remote commit isn't present locally

  It catches pushes from scripts and aliases that the command-text layer can't see. What's left is a script that passes `--no-verify` or changes `core.hooksPath`, and auto mode's judgment is the last layer for that.

**What the local layers can and can't do (2026-11-16, Claude's call, after an adversarial review).** A guard that reads command text can't fully parse two shells. A command built to hide a push, through variables, `gcm`, a pipe into `sh`, or a builtin that runs other commands, can still be written. So the local layers are aimed at an agent's mistakes and plausible workarounds, not at an adversary:
- **The command-text layer:**
  - It parses quoting, escapes, `#` comments, process substitution and both shells' line breaks (`\r` included) the way the shells do.
  - It denies dynamic execution wherever it appears: a variable or expression in command position, `& $x`, `& (…)`, `iex`, and a pipe into `sh`, `bash` or `pwsh`.
  - It denies any command naming `--no-verify` or `core.hooksPath`.
  - It denies git global options other than `-C` on every subcommand, and git options that run commands: `rebase -x`, `submodule foreach`, `bisect run`, `filter-branch`, `difftool -x`, `--upload-pack`, `--receive-pack`.
  - It denies `git config` writes to `core.hooksPath`, `core.sshCommand`, `alias.*`, `remote.*`, `url.*`, `push.*` and `include*`.
  - It denies a push from a repo with submodules.
  - It always judges the command, with no shortcut on its literal text.
  - It denies stdin that doesn't parse, after stripping a byte-order mark.
- **Tamper protection:**
  - The guard also hooks Edit, Write and NotebookEdit, and denies writes under `.git/`, `.claude/repo-standup/` and `.claude/settings.local.json`. It denies shell commands that name those paths too.
  - Setup pins the client repo into `.claude/repo-standup/client-repo`, and both layers read it from there, never from `client.yaml`, which the agent can edit.
- **The pre-push hook** is checked out with LF line endings and trims its arguments, so a CRLF checkout can't break it.
- **The only complete enforcement is on Bitbucket:** branch restrictions that prevent rewriting history and deletion.

**Bitbucket branch restrictions at fork time (Brandon, 2026-11-16).**
- `/pell:init-client-repo` sets two restrictions on the client repo: no rewriting history (force pushes) and no deletion. It covers both `main` and `staging`, the two branches it pushes. Covering `staging` too is Claude's call: it becomes the deploy branch, and a forced push there is just as damaging.
- Normal pushes stay allowed, so the run isn't blocked.
- It sets them right after its first push succeeds, so they never get in the way of that push.
- **Which yes covers it:**
  - When the command created the repo, the create-repo yes covers the restrictions.
  - When the repo already existed, the plan the engineer approves names the restrictions, and that yes covers them.
- When the Atlassian connector has no branch-restriction operation, or the call fails, the command doesn't abort. It prints the exact settings to make by hand (Repository settings, Branch restrictions) and reports them as not set.
- The framework repository's own branch protections aren't part of this.

Its tests are Node's built-in test runner, `tests/repo-standup/guard.test.mjs` at the repository root, outside the shipped plugin **(Claude's call)**: a first runnable test in this repo, so the architecture spec records the pattern.

## The handoff package

Written in phase 9, and again whenever a resumed run stops. All under `docs/project/`, in reading order:

1. **`handoff.md`, one page:**
   - why the run stopped
   - the scoreboard counts
   - the three riskiest guesses (the highest-risk unanswered questions)
   - what to do first
   - the one command that starts the app, and the persona logins
2. **A seed login per persona** (framework change below), listed in `handoff.md`.
3. **`scoreboard.md`**, regenerated after the final checks.
4. **`open-questions.md`**, ready to send. `handoff.md` lists the unanswered ones, riskiest first.
5. **`known-gaps.md`:** parked units, unfixed minor findings, hardening's low findings, and any links not yet built.
6. **`demo/<persona>.md`:** for each persona, a script over their Verified workflows: the login, the steps, and what to say at each, in the glossary's words. It's for the engineer to rehearse, never the client.
7. **`decisions.md`**, as it stands.
8. **`cost-report.md`**: the `scoreboard --cost` tables, then the handoff writer's short reading of them and an estimate for the next run of a similar SOW.

Before writing, the conductor runs every check with every theme (`npm run screens`), then `scoreboard --cost`. The handoff is done when every requirement is in exactly one state, every check passes on `main`, and `handoff.md` is written (decision 7). Then it commits, pushes and sends the stop notification.

## Agents

All in `plugins/pell/agents/`.

**handoff-writer** (new). It writes `handoff.md`, the demo scripts and `cost-report.md`'s prose from files that already exist, and computes nothing; the tables come from the command. It pins `model: sonnet` under the mechanical-agent exception, with the rationale at the top of its body. It ends with the producer shape, `{"files": [...], "questions": [...], "summary": "..."}`.

**Reused unchanged:**
- `conductor-implementer`
- `conductor-correctness-reviewer`
- `conductor-integration-gap-auditor`
- `conductor-design-steward` (with its screenshot mode from design intake)
- `security-reviewer`
- `test-reviewer`
- `repo-security-reviewer`

`sow-builder` isn't used, since SOWs in Jira are a non-goal. `coordinate-agents` is the pattern the loop follows, not a skill the run invokes.

## The skill

`plugins/pell/skills/repo-standup/`:
- `SKILL.md`:
  - when it triggers ("/pell:repo-standup", "start repo standup", "continue the build")
  - the guard check and where-the-run-stands table
  - the phases, the loop in brief, the stop, alert and batch rules
  - the commit and push rules
  - that it never waits on the client
- `references/loop.md`:
  - building the queue and its order
  - the unit procedure
  - the implementer brief
  - the risk path list and the environmental-failure patterns
  - the review table
  - the park procedure
- `references/formats.md`: `status.md`, `queue.md`, `known-gaps.md`, `reviews.md`, the run-log line and the notification wordings
- `references/handoff.md`: the package and the demo-script template
- `hooks/guard.mjs` and `hooks/settings.local.json`, the hook entry the setup writes
- `rates.json`: blended list prices per model, with the date they were checked

**An exception to the read-only default**, like design intake's: the skill writes, commits and pushes inside the fork it runs in without `(y/n)`, because the invocation is the yes and decision 10 is a standing yes for the push. Its only other side effects go through `/pell:init-client-repo`'s own gates. The exception goes into the repo's `CLAUDE.md` and architecture spec in the same change.

**Housekeeping:**
- a minor version bump
- both READMEs
- architecture spec §12
- `CLAUDE.md`'s exceptions: repo-standup; handoff-writer under the mechanical and producer exceptions; the test-runner pattern
- `claude plugin validate ./plugins/pell`

## Framework changes

On a framework branch `orchestrator`, cut from `react` after design intake's framework half merges, since the scoreboard reads its acceptance folder and pack formats **(Claude's call)**. Each change lands with its tests and docs, and the framework's own checks and `fork-build-test.sh` pass.

1. **`scoreboard`**, as above, with tests over fixture packs and result files for every state, every stop and alert condition, every exit-1 case, and `--cost`.
2. **Results to files.** The checks write machine-readable results to a fixed, git-ignored folder:
   - Playwright's JSON reporter beside its HTML one
   - Vitest's JSON reporter
   - TRX for the unit and integration tests

   How the command pairs an xUnit test's `Req` traits with its outcome is the builder's: TRX may not carry traits, and a source scan joined to TRX by test name is the fallback. It must be proven against a real run.
3. **A seed login per persona.** With `Seed:SampleData` on, in Development only, the seeder also creates one active user per role in `default-roles.json`, with a Development-only password from `appsettings.Development.json`, as the E2E host seeds its user. Design intake's `signInWithRole` users and these may share code; that's the builder's call.
4. **Pack skeleton.** The fork tool's project pack gains `queue.md`, `known-gaps.md`, `reviews.md`, `cost-report.md` and `demo/README.md`, each a title and its one line, and the pack README lists them.
5. **`CLAUDE.md`.** The tag forms in Tests, and `scoreboard` in Standard commands and Generators.

## Interface with design intake

Agreed with the design intake session on 2026-11-15:

- One stage per call, with `from repo-standup` in the args. The orchestrator never runs stages 1 to 8 or their agents itself.
- Stages 7 and 8 stay inside design intake, with the three-failure park rule. Its line "Once the orchestrator exists, these units go through its work loop instead" is dropped.
- Every call ends with one outcome line: `ran stage <n> <name>`, `waiting on <path>`, `done` or `stopped: <reason>`, each after `design-intake: `.
- The orchestrator reads `requirements.md`, `open-questions.md`, `workflows.md`, `personas.md`, `integrations.md`, the screen inventory and its links table in design intake's formats. An engineer-added requirement cites `intake-sheet.md:<line>`.
- Called with `from repo-standup`, design intake sends only its checkpoint notifications.
- The same push rule: never before stage 3 passes; only when `origin` is the client repo; never forced. A push skipped for the wrong `origin` is noted and the run carries on.

Design intake's session reports anything its trial 1 changes before this spec is final.

## Changes to other plans

These live outside this repo; their owners edit them.

- **`03-orchestrator.md`:**
  - the phase order above
  - sessions started by prompt in place of shifts
  - seven states
  - the scoreboard as a framework command that also does the queue arithmetic
  - the new pack files
  - the review, stop and handoff details above
- **The plans README, principle 4:** seven states, with Not built and Parked added.
- **Design intake:** nothing beyond the agreed interface, which its session is making.

## Order of work

- The build waits until design intake's trial 1 passes **(Brandon)**.
- The Pell_Skills branch `orchestrator` holds this spec and its plan now. It's rebased onto `main` once `design-intake` merges, since the skill calls it.
- The framework branch is cut from `react` after design intake's framework half merges.
- **First task: prove the platform** in a scratch fork, before anything else is built. Check four things:
  - the guard hook denies a forced push, and the canary, in an auto-mode session
  - `PushNotification` from an auto-mode session reaches the engineer's phone through Remote Control
  - a finished worker reports its tokens to the conductor
  - whether the conductor can read its own session's usage

  The results set the token accounting and the notification fallback.

## Testing and trials

**Framework:** the command's tests above, the seeder's integration test (one user per role, Development only, none outside it), the skeleton's tests in the fork tool, and the result files written by a real run of each suite.

**Plugin:** the guard's tests (every allowed and denied form above, the canary, and a command it can't parse), and `claude plugin validate`.

Design intake's trial forks were cut before this framework half, and a fork doesn't take framework updates. So both trials fork fresh from the framework's `orchestrator` branch and run all nine phases through `/pell:repo-standup`, which also tests the calls into design intake **(Claude's call)**. The engineer answers both checkpoints again, about 25 minutes per trial.

**Trial A, the fictional SOW.** Design intake's trial SOW, in a fork whose `origin` isn't a client repo, so nothing is pushed. It passes when:
- every requirement is in exactly one state
- every check passes on `main`, every theme included
- the package's files match their formats
- the cost report holds numbers
- an engineer who didn't watch the run starts the app and signs in as each persona from `handoff.md` alone

**Trial B, a real SOW.** The SOW of design intake's trial 2, in a scratch fork that is never pushed. Record tokens per Verified requirement, wall time, parks and alerts in a local notes file outside both repos, since it names the client.

## Exit

- The framework branch and the Pell_Skills branch are merged by Brandon.
- Trial A passes. Trial B has run, with its measures recorded.

## Left to the builder

- How the scoreboard pairs xUnit traits with outcomes, where the result files go, and how it detects stale results.
- The guard's parser, within the rules above.
- How the conductor reads its own usage, if it can.
- The performance smoke test's mechanism.
- The seed password's setting name, and whether the seed shares code with design intake's E2E users.
- The exact rule for splitting a large workflow into units.
- How much of the loop's procedure lives in `SKILL.md` versus `references/loop.md`.
