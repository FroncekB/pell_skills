---
name: design-intake
description: Use when starting or continuing design intake in a client fork made from the Pell Web App Framework, such as "start intake for this fork", "the intake sheet is approved", "I picked direction B", "continue intake", or a call from the repo-standup orchestrator. Runs the next stage that isn't blocked (sources, extract, generate, brief, directions, lock, prototype, acceptance) and stops, waiting only for the engineer at the intake sheet and the directions pick.
---

# Design intake

Turns a client's Scope of Work into what the build needs: numbered requirements, the client's words, personas, generated entities and roles, a client theme, a prototype on contract-first stubs, and tagged acceptance tests. Everything it writes is internal. Its reader is the Pell engineer who owns the project, never the client.

Each run does the next stage that isn't blocked, then stops. An engineer runs it by hand, or the orchestrator calls it unattended. A run picks up from the files in the fork alone, never from a transcript.

## Before a stage

1. Confirm this is a client fork: `client.yaml` at the repository root, and `docs/project/`. If either is missing, stop and say the skill runs only in a fork made by the framework's fork tool.
2. Read `client.yaml` for `name.code` (`<Code>`) and `name.lower` (`<lower>`). Read the fork's `CLAUDE.md`, whose rules apply to everything intake writes.
3. If `HEAD` is on an `intake-<stage name>` branch, a unit stopped part way: run `git switch main`. Uncommitted files come along.
4. Find the stage in progress. Take the newest start commit (`git log -1 --format=%s --grep=" starts$"`). When there is none, no stage has started: go to the table below. If its stage has no line in `docs/project/run-log.md` yet, that stage stopped part way. Every uncommitted file is its work: finish that stage, whatever the table below says.
5. Otherwise, uncommitted edits under `docs/project/`, `specs/entities/` and `<Code>.API/Configuration/default-roles.json` are the engineer's edits, committed as the commit rule below says. Any other uncommitted file was written by no stage: stop and tell the engineer.

## Find the next stage

Read the signals from the top. The first that holds decides. Paths are under `docs/project/`.

|When|Next|
|-|-|
|`sources/README.md` lists no source|Stage 1, with the inputs the invocation's arguments name, or asked for|
|`requirements.md` holds no requirement|Stage 2|
|`intake-sheet.md` says `Status: draft`|Wait: remind the engineer, run nothing|
|The sheet says `Status: approved`, and `run-log.md` has no stage 3 line|Stage 3|
|`design/brief.md` is only its skeleton line|Stage 4|
|No direction file in `design/directions/`|Stage 5|
|`design/directions/README.md` says `Status: waiting for your pick`, or says `Status: picked` while its Pick line is still `Pick: (not yet chosen)`|Wait: remind the engineer, run nothing|
|It says `Status: picked`, and `client.yaml`'s `theme` is still a demo theme (`pell`, `ledger`, `institutional`, `field`) or a `direction-*` theme|Stage 6|
|A `design/screen-inventory.md` row is hand-built and `planned`, and `run-log.md` has no stage 7 line|Stage 7|
|An in-scope `acceptance` requirement in `requirements.md` has no tagged scenario in `<Code>.React/e2e/acceptance/`, and `run-log.md` has no stage 8 line|Stage 8|
|None of these|Report that intake is done|

A stage is done only when its `run-log.md` line is there. One that started without finishing comes first (Before a stage, step 4). Stages 7 and 8 can finish with units parked (`stages.md`, "Working with agents"), which is why their rows also ask for the line.

## How a call ends

Every call, whoever made it, ends with exactly one of these lines, the last thing it says:

- `design-intake: ran stage <n> <name>`, after a stage's commit, such as `design-intake: ran stage 3 generate`
- `design-intake: waiting on <path>`, at a checkpoint, naming the file the engineer edits: `docs/project/intake-sheet.md` or `docs/project/design/directions/README.md`. Stages 2 and 5 end at a checkpoint, so they end with this line, not `ran`.
- `design-intake: done`, when none of the signals holds
- `design-intake: stopped: <reason>`, for anything else that ends the call: not a fork, a file no stage wrote, inputs no one gave, a stage that can't pass

## The stages

Each procedure is under its heading in `stages.md`. Read that file's "Terms used below" and "Working with agents" first.

|Stage|Done by|`stages.md` heading|
|-|-|-|
|1 Sources|the skill itself|`## Stage 1: Sources`|
|2 Extract|`intake-analyst`|`## Stage 2: Extract`|
|Checkpoint 1|the engineer|`## Checkpoint 1`|
|3 Generate|`intake-analyst`, the skill, `conductor-implementer`|`## Stage 3: Generate`|
|4 Brief|`design-director`|`## Stage 4: Brief`|
|5 Directions|`design-director`, `conductor-design-steward`|`## Stage 5: Directions`|
|Checkpoint 2|the engineer|`## Checkpoint 2`|
|6 Lock|`design-director`|`## Stage 6: Lock`|
|7 Prototype|`conductor-implementer`, `conductor-design-steward`|`## Stage 7: Prototype`|
|8 Acceptance|`conductor-implementer`|`## Stage 8: Acceptance`|

## Rules for every stage

- **Commit.** A stage works on the run's branch (`main` in a fork). It starts with an empty commit, `git commit --allow-empty -m "Design intake stage <n>: <name> starts"`, so a later run can tell it is in progress. It ends by committing its work as `Design intake stage <n>: <name>`, such as `Design intake stage 2: extract`. A run that only waits commits nothing. A run that starts a stage, as when it resumes past a checkpoint, first commits the engineer's edits (Before a stage, step 5) together, as `Design intake: the engineer's edits`.
- **Log.** Before that commit, append the stage's line to the end of `docs/project/run-log.md`, as `formats.md` says. It is what marks the stage done. Its minutes run from the stage's start commit (`git log -1 --format=%cI <start commit>`) to the line, every dispatch, review, rerun and fix included. Its tokens are the sum of the `subagent_tokens` in the completion notices of the agents the stage dispatched, plus the skill's own share where the session reports its usage. Write `unknown` only when neither is available.
- **Decisions.** Each decision made on the engineer's behalf gets one line in `docs/project/decisions.md`, as `formats.md` says. A decision is a choice that neither the sources nor the engineer made, and that a later reader could ask about: a guess applied, a substitute, a step skipped or done another way. A refused fetch isn't one; it goes in the run-log note. Each agent writes the lines for its own decisions. The skill writes the lines for the decisions it makes itself, in stage 1, stage 3's steps 2, 3 and 5, and a parked unit, as `decided by: design-intake`. Before the commit, check that every decision the stage reported has its line.
- **Push.** Never push before stage 3 passes every check, so the client repo never holds specs without their generated code. From then on, push the run's branch after each stage's commit with `git push origin main`. Before the `run-log.md` line, check that `origin` is the repository `client.yaml`'s `repository.bitbucket` names. When `origin` is missing or names another repository, skip the push, say so in the line's note, and carry on. Never `--force`, never another branch or remote. Intake does nothing else outward.
- **Never wait on the client**, and never show the client anything. The only waits are the two checkpoints, which wait on the engineer, and a file no stage wrote (Before a stage, step 5).
- **Questions** go only into `docs/project/open-questions.md`, in `formats.md`'s format, each with the guess the build uses until it is answered. The run carries on with the guess.
- **Notify.** At each checkpoint, and at the end of any stage that added questions, send the engineer one push notification with Claude Code's `PushNotification` tool, worded as the stage's "Sends" says, with each count agreeing with its noun (`1 question`, `2 questions`). It reaches the engineer's own devices, so it isn't an outward action. Where the session has no `PushNotification` tool, put the message in chat and in the stage's `run-log.md` note. When the invocation's arguments contain `from repo-standup`, send only the two checkpoint notifications: the orchestrator's shift reports the questions.
- **Tell the engineer in chat** what the stage did and what comes next, when they are present.
- **The framework's rules** apply to everything intake writes in the fork: tokens only, the design lint, generated files never edited, no ruling or ledger IDs in code comments, and relative paths.

## An exception to the read-only default

Pell commands gate each side effect on a `(y/n)`. This skill writes and commits throughout the fork it runs in without asking, because the orchestrator runs it unattended: the invocation itself is the yes. Its writes stay inside that fork, and it pushes only under the push rule above.

## References

Give each agent the paths its stage names.

- `${CLAUDE_PLUGIN_ROOT}/skills/design-intake/references/stages.md`: each stage's commands, the files it writes, what passing means and what it sends.
- `${CLAUDE_PLUGIN_ROOT}/skills/design-intake/references/formats.md`: the pack's file formats, and the `decisions.md` and `run-log.md` lines.
- `${CLAUDE_PLUGIN_ROOT}/skills/design-intake/references/intake-sheet.md`: checkpoint 1's template and rules.
- `${CLAUDE_PLUGIN_ROOT}/skills/design-intake/references/directions.md`: the directions README, the per-direction file, the theme folder rules and the captures.
