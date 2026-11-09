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
3. The working tree must be clean, apart from the engineer's edits under `docs/project/`. Commit those first, as `Design intake: the engineer's edits`. If anything else is uncommitted, stop and tell the engineer.

## Find the next stage

Read the signals from the top. The first that holds decides. Paths are under `docs/project/`.

|When|Next|
|-|-|
|`sources/README.md` lists no source|Ask for the inputs; stage 1|
|`requirements.md` holds no requirement|Stage 2|
|`intake-sheet.md` says `Status: draft`|Wait: remind the engineer, run nothing|
|The sheet says `Status: approved`, but the specs aren't generated: `dotnet run --project tools/<Code>.Scaffolder -c Release -- generate --check` fails|Stage 3|
|`design/brief.md` is only its skeleton line|Stage 4|
|No direction file in `design/directions/`|Stage 5|
|`design/directions/README.md` says `Status: waiting for your pick`|Wait: remind the engineer, run nothing|
|It says `Status: picked`, and `client.yaml`'s `theme` is still a demo theme (`pell`, `ledger`, `institutional`, `field`) or a `direction-*` theme|Stage 6|
|A `design/screen-inventory.md` row is hand-built and not yet prototyped|Stage 7|
|An in-scope `acceptance` requirement in `requirements.md` has no tagged scenario in `<Code>.React/e2e/acceptance/`|Stage 8|
|None of these|Report that intake is done|

A stage is done only when its `run-log.md` line is there. If the table points past a stage whose line is missing, that stage stopped part way: finish it first.

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

- **Commit.** A stage commits its work on the run's branch (`main` in a fork) with the message `Design intake stage <n>: <name>`, such as `Design intake stage 2: extract`.
- **Log.** Before that commit, append the stage's line to `docs/project/run-log.md`, and one line to `docs/project/decisions.md` for each decision made on the engineer's behalf, both as `formats.md` says. The run-log line holds the stage's minutes and tokens (`unknown` when the session doesn't report them). It is what marks the stage done.
- **Push.** Never push before stage 3 passes every check, so the client repo never holds specs without their generated code. From then on, push the run's branch after each stage's commit with `git push origin main`. First check that `origin` is the repository `client.yaml`'s `repository.bitbucket` names. Never `--force`, never another branch or remote. Intake does nothing else outward.
- **Never wait on the client**, and never show the client anything. The only waits are the two checkpoints, which wait on the engineer.
- **Questions** go only into `docs/project/open-questions.md`, in `formats.md`'s format, each with the guess the build uses until it is answered. The run carries on with the guess.
- **Notify.** At each checkpoint, and at the end of any stage that added questions, send the engineer one push notification through Claude Code's push notification tool, worded as the stage's "Sends" says. It reaches the engineer's own devices, so it isn't an outward action. Where the session has no such tool, put the message in chat and in the stage's `run-log.md` note.
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
