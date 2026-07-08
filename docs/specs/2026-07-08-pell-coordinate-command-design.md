# /pell:coordinate — Coordinator-Led Delivery

**Status:** Approved and implemented (`plugins/pell/commands/coordinate.md`)
**Date:** 2026-07-08
**Source:** Translation of the "Coordinator-Led AI Delivery" infographic into a Pell command.

## Purpose

Put the main Claude session into the *coordinator* stance and drive a major
product build or large system evolution through six phases. The coordinator
keeps judgment, continuity, and authorship of the plan; subagents extend reach
by doing research, implementation, and review. Intent is persisted to disk so a
fresh session can resume without losing the thread.

This is a long composite orchestrator in the mold of `from-ticket`,
`finish-work`, and `wrap-up` — its length is sequential phases, not bloat.

## Deliverable

A single command file: `plugins/pell/commands/coordinate.md` → `/pell:coordinate`.

No new agents or skills. The command dispatches existing agent types
(`Explore`, `general-purpose`, `Plan`, and the `pell:*-reviewer` agents) and
notifies about existing skills/commands (`superpowers:brainstorming`,
`superpowers:writing-plans`, `superpowers:dispatching-parallel-agents`,
`/pell:three-pass-review`, `/pell:local-review`) without depending on them.

### Frontmatter

```yaml
---
description: Coordinate a major product build or large system evolution end-to-end. Keeps judgment and continuity in the main session while dispatching subagents to research, implement, and review; persists the design to disk so a fresh session can resume.
argument-hint: "<what you're building> [JIRA-KEY] [--resume | --dry-run | --reset | --verbose] [freeform]"
---
```

## Scope

`/pell:coordinate` is for *major* efforts — multi-track builds and large system
evolution where continuity across a long session (or across sessions) is the
hard part. It is explicitly overkill for a single ticket or a bounded change;
the body says so and points such work at `/pell:from-ticket`.

A `JIRA-KEY` is optional seed context only. This command never mutates Jira —
all Jira side effects stay in `/pell:start-work` and `/pell:finish-work`.

## Arguments

Freeform-first. Extract from `$ARGUMENTS` (all matches independent):

- **Build description** — the leading freeform text; the effort's working title.
  If absent, ask for it in one line before proceeding.
- **Jira key** (optional) — first match for `[A-Z][A-Z0-9]+-\d+`. Seed context
  only; fetched read-only if present (reuse the `from-ticket` fetch shape).
- **`--resume`** — recover an in-flight effort from its persisted design docs
  instead of starting fresh (see Phase 0).
- **`--dry-run`** — print the full phase plan (what would be dispatched, which
  gates would fire) and stop. No subagents, no writes, no branches.
- **`--reset`** — clear this effort's persisted design docs after confirmation.
- **`--verbose`** — surface each subagent's raw findings, not just the
  coordinator's synthesis.
- Unrecognized text is informational context, threaded into Phase 1's seed.

## Persistence

Each effort gets a design directory under the repo's spec convention:
`docs/specs/<YYYY-MM-DD>-<effort-slug>/` containing at least:

- `design.md` — the authored architecture and detailed design (Phase 3 output).
- `decisions.md` — a running decision log the coordinator appends to as calls
  are made ("Capture decisions as they happen").
- `tracks.md` — the execution breakdown into sequential vs parallel tracks
  (Phase 5), with per-track status the coordinator updates.

The path is confirmed with the user in Phase 0 (re-promptable). If the target
repo uses a different docs root, the user overrides in freeform; the chosen path
is cached to `~/.claude/pell-config.json` under a `coordinate.specs_dir` key and
re-promptable via `--reset`.

## The six phases

Each is a numbered step in the command body. Every phase that has a side effect
(branch, write, subagent fleet, review run) is gated on a `(y/n)` that names
exactly what will happen. `--dry-run` short-circuits all of them.

### Phase 0 — Frame the effort

- Parse arguments. Establish the coordinator stance in one short preamble to the
  user: you (the main session) hold judgment and continuity; subagents extend
  reach; planning is front-loaded.
- Confirm the persistence directory (above).
- **`--resume` path:** glob the design dir; if `design.md`/`decisions.md`/
  `tracks.md` exist, read them, print a one-paragraph "here's where we left off"
  recap synthesized from `decisions.md` + `tracks.md` status, and jump to the
  earliest incomplete phase. If nothing is found, say so and offer to start fresh.

### Phase 1 — Explore & frame

Iterative conversation to clarify the idea, constraints, and quality bar.

- Drive it inline with `AskUserQuestion` (one focused question at a time, or a
  small batch when independent): the smallest valuable version, the hardest
  unknowns, the constraints, the quality bar.
- Notify (never force): "For a deeper structured brainstorm, `superpowers:brainstorming`
  is available." If the user opts in and it's installed, hand the framing to it
  and resume at Phase 2 with its output; otherwise continue inline.
- Append the framing outcome to `decisions.md`.

### Phase 2 — Research & compare

Parallel research before commitment on the key choices surfaced in Phase 1.

- Coordinator names the 2-5 decision points that need evidence (library/pattern/
  architecture trade-offs, prior art in the repo, integration constraints).
- Gate, then dispatch one research subagent per decision point **in parallel**
  (`Explore` for repo/prior-art sweeps, `general-purpose` for open-ended
  comparison). Each returns findings + a recommendation; the coordinator does
  not pre-narrow.
- Coordinator synthesizes into a trade-off summary and records the chosen
  direction (with rationale) in `decisions.md`. `--verbose` prints raw subagent
  findings.

### Phase 3 — Plan the system

The coordinator authors the design docs — one author for coherence. This work is
NOT delegated; delegating authorship is what loses continuity.

- Write `design.md`: outline, architecture, component boundaries, data flow,
  error handling, testing approach — scaled to the effort.
- Notify: "`superpowers:writing-plans` can turn this into a task-level plan."
  If opted-in and installed, dispatch it against `design.md`; otherwise the
  coordinator writes the track breakdown itself in Phase 5.
- Gate before writing files; then write and print the paths.

### Phase 4 — Stress-test the plan

Adversarial review of the design docs (not code) before any implementation.

- Gate, then dispatch review subagents against `design.md` looking for gaps,
  contradictions, edge cases, and weak assumptions. Reuse the pell reviewer
  agents where they fit (`pell:correctness-reviewer` for logic/invariant gaps in
  the design, `pell:quality-reviewer` for coherence), plus a general skeptic
  prompted to refute the plan.
- Coordinator triages findings, revises `design.md`, and logs what changed and
  what was consciously accepted in `decisions.md`. Loop until the plan holds.

### Phase 5 — Execute in parallel

- Coordinator breaks the plan into epics/issues and splits them into sequential
  vs parallel tracks, written to `tracks.md`.
- Gate, naming the tracks and how many subagents will run. Then dispatch
  implementation subagents per track. Parallel tracks that mutate files run with
  **worktree isolation** (Agent tool `isolation: "worktree"`) to avoid conflicts;
  sequential tracks run in order.
- Notify: "`superpowers:dispatching-parallel-agents` / `subagent-driven-development`
  structure this if installed." Coordinator directs, holds continuity, and
  updates per-track status in `tracks.md` as work lands.

### Phase 6 — Review, refine, repeat

- Outputs are reviewed against the plan. Route local changes through
  `/pell:local-review`; route a raised PR through `/pell:three-pass-review`.
  `superpowers:requesting-code-review` is the notify-fallback if pell review
  isn't wanted.
- Coordinator directs fixes and closes design gaps, updating `design.md`/
  `decisions.md` when a gap reveals a design change.
- Loop back to the appropriate earlier phase as needed (a design gap → Phase 3;
  a wrong track split → Phase 5). Repeat until the effort meets the quality bar.

## Context budgeting (woven into the body, from the infographic)

- Front-load: phases 1-4 are where the first ~100k-300k of a long session goes.
- Use the remaining context to run and steer execution (phases 5-6).
- Persist intent to disk continuously, not just at the end — so a fresh
  coordinator session recovers via `--resume` by reading the docs, not the chat.

## Notify-never-force policy

Per architecture spec §4 and repo convention §6: every external tool
(`superpowers:*`) and even sibling pell commands are *offered*, never required.
If a tool is absent or declined, the command continues with the inline path
described in each phase. No phase halts on a missing plugin.

## Non-obvious decisions

1. **Deliverable is a command, not an auto-invoked skill.** The user chose
   explicit-invocation-only; an auto-invoked skill fires on its own by
   definition, so a command is the correct artifact.
2. **Self-contained, but tool-aware.** More self-contained than `from-ticket`
   (which hands off wholesale) — the command drives its own subagents and
   inline dialogue, and only notifies about superpowers/pell tools as optional
   accelerants.
3. **Coordinator authors Phase 3; subagents never do.** Authorship of the design
   is the one thing not delegated — that is the infographic's "one author for
   coherence."
4. **Not a Jira workflow.** Jira key is read-only seed; mutation stays in
   `start-work`/`finish-work`.

## Operator notes (for the command body)

- Read the branch with `git branch --show-current`.
- Pell branch shape is `<KEY>-<description>`; a Jira key matches `[A-Z][A-Z0-9]+-\d+`.
- Output is plain text — no emoji or glyphs. Use text markers (`Dispatched.`,
  `Revised.`, `[track 2: done]`, `_None._`).
- Never auto-pick among multiple persisted efforts — list and ask.
- No rollback: if a subagent errors mid-phase, surface it verbatim and leave the
  working tree as-is. The coordinator decides next steps.

## Out of scope

- Single-ticket or bounded changes — point at `/pell:from-ticket`.
- Jira mutation, branch cleanup, PR creation/merge — those live in
  `start-work`/`finish-work`/`wrap-up`.
- Running CI/deploys.
- Background/scheduled coordination — this is an interactive, in-session driver.
