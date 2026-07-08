---
description: Coordinate a major product build or large system evolution end-to-end. Keeps judgment and continuity in the main session while dispatching subagents to research, implement, and review; persists the design to disk so a fresh session can resume.
argument-hint: "<what you're building> [JIRA-KEY] [--resume | --dry-run | --reset | --verbose] [freeform]"
---

You are running **`/pell:coordinate`**. Take the *coordinator* stance and drive a
major product build or large system evolution through six phases. You hold
judgment, continuity, and authorship of the plan; subagents extend your reach by
doing research, implementation, and review. Persist intent to disk as you go so a
fresh session can resume without losing the thread.

This is a long composite orchestrator like `/pell:from-ticket` and
`/pell:finish-work` — its length is sequential phases, not bloat. It runs the
work through your own subagents and inline dialogue; `superpowers` and sibling
pell tools are **offered, never required** (notify, don't block — architecture
spec §4).

**Use this for major efforts only.** Multi-track builds and large system
evolution where continuity across a long (or resumed) session is the hard part.
For a single ticket or a bounded change, stop and point the user at
`/pell:from-ticket` instead — this command is overkill there.

The user passed: `$ARGUMENTS`

## Step 1 — Parse arguments

Extract from `$ARGUMENTS` (all matches independent; freeform-first):

- **Build description** — the leading freeform text; the effort's working title.
  If nothing describes what's being built, ask for it in one line before going on.
- **Jira key** (optional) — first match for `[A-Z][A-Z0-9]+-\d+`. Seed context
  only; never mutated.
- **`--resume`** — recover an in-flight effort from its persisted docs (Phase 0).
- **`--dry-run`** — print the full phase plan (what each phase would dispatch and
  which gates would fire) and stop. No subagents, no writes, no branches.
- **`--reset`** — clear this effort's persisted docs after confirmation.
- **`--verbose`** — surface each subagent's raw findings, not just your synthesis.
- Any other text is informational context; thread it into Phase 1's framing.

If `--dry-run` is set, walk Phases 0-6 below in description only — name the
subagents, gates, and writes each would perform — then stop without side effects.

## Step 2 — Phase 0: Frame the effort

**Set the stance.** Open with one short preamble to the user: you keep judgment
and continuity in this session; subagents do the research, implementation, and
review; planning is front-loaded before any code is written.

**Confirm the persistence directory.** Default to
`docs/specs/<YYYY-MM-DD>-<effort-slug>/` (slug from the build description). Read
`~/.claude/pell-config.json` (treat missing as `{}`); if `coordinate.specs_dir`
is set, use that as the docs root instead of `docs/specs/`. If the user names a
different root in freeform, use it and atomically write it back to
`coordinate.specs_dir`. Name the directory you'll create and get `(y/n)` before
creating it. The effort keeps three living docs there:

- `design.md` — authored architecture and detailed design (Phase 3).
- `decisions.md` — a running decision log you append to as calls are made.
- `tracks.md` — the execution breakdown and per-track status (Phase 5).

**`--resume` path.** Glob the effort directory. If the three docs (or any) exist,
read them, print a one-paragraph "here's where we left off" recap synthesized
from `decisions.md` and `tracks.md` status, and jump to the earliest incomplete
phase. If more than one effort directory matches, list them and ask which — never
auto-pick. If nothing is found, say so and offer to start fresh.

**`--reset` path.** List the effort's existing docs and ask once:
`Remove N persisted docs for this effort? (y/n)`. On `y`, delete and start fresh;
on `n`, exit cleanly.

**Optional Jira seed.** If a Jira key was passed, fetch it read-only for context
using the same fetch `/pell:from-ticket` Step 2 performs. If the Atlassian MCP is
unavailable, say so and ask the user to summarize the ticket instead. Never
transition or comment on the issue — this command does not mutate Jira.

## Step 3 — Phase 1: Explore & frame

Iterative conversation to clarify the idea, constraints, and quality bar.

- Drive it inline with `AskUserQuestion` — one focused question at a time, or a
  small batch when the questions are independent. Cover: the smallest valuable
  version, the hardest unknowns, hard constraints, and the quality bar that
  defines "done well."
- Notify once: "For a deeper structured brainstorm, `superpowers:brainstorming`
  is available." If the user opts in and it's installed, hand framing to it and
  resume at Phase 2 with its output; otherwise continue inline.
- Append the framing outcome (scope, unknowns, constraints, quality bar) to
  `decisions.md`.

## Step 4 — Phase 2: Research & compare

Parallel research before commitment, so key choices are evidence-led.

- Name the 2-5 decision points that need evidence — library or pattern
  trade-offs, prior art already in the repo, integration constraints.
- Gate: `Dispatch N research subagents (one per decision point) in parallel? (y/n)`.
  Then dispatch them in a single message via the Agent tool — `Explore` for
  repo and prior-art sweeps, `general-purpose` for open-ended comparison. Each
  returns findings plus a recommendation; do not pre-narrow their scope.
- Synthesize the returns into a trade-off summary, choose a direction, and record
  it with rationale in `decisions.md`. Under `--verbose`, print the raw findings
  too; otherwise print your synthesis only.

## Step 5 — Phase 3: Plan the system

You author the design — one author for coherence. **Do not delegate authorship;**
delegating it is what loses continuity across a long effort.

- Write `design.md`: outline, architecture, component boundaries, data flow,
  error handling, and testing approach — scaled to the effort's size.
- Notify once: "`superpowers:writing-plans` can turn this into a task-level plan."
  If the user opts in and it's installed, dispatch it against `design.md`;
  otherwise you write the track breakdown yourself in Phase 5.
- Gate before writing: `Write design.md to <path>? (y/n)`. Then write and print
  the path.

## Step 6 — Phase 4: Stress-test the plan

Adversarial review of the design docs — not code — before any implementation.

- Gate: `Dispatch review subagents against the design? (y/n)`. Then dispatch in
  parallel via the Agent tool:
  - `pell:correctness-reviewer` — logic gaps, broken invariants, missing error
    handling in the design.
  - `pell:quality-reviewer` — coherence, unclear boundaries, premature abstraction.
  - one `general-purpose` skeptic, prompted to **refute** the plan: find gaps,
    contradictions, edge cases, and weak assumptions.
- Triage the findings. Revise `design.md`, and log in `decisions.md` what changed
  and what you consciously accepted (with why). Loop this phase until the plan
  holds.

## Step 7 — Phase 5: Execute in parallel

- Break the plan into epics/issues and split them into sequential vs parallel
  tracks. Write the breakdown to `tracks.md` with a status field per track.
- Gate, naming the tracks and how many subagents will run:
  `Dispatch implementation: M sequential + N parallel tracks? (y/n)`.
- Dispatch implementation subagents per track via the Agent tool. Parallel tracks
  that mutate files run with **worktree isolation** (`isolation: "worktree"`) to
  avoid conflicts; sequential tracks run in order, each starting only after the
  prior lands.
- Notify once: "`superpowers:dispatching-parallel-agents` and
  `subagent-driven-development` structure this if installed." Direct the work,
  keep continuity, and update per-track status in `tracks.md` as each lands.

## Step 8 — Phase 6: Review, refine, repeat

- Review outputs against the plan. Route local uncommitted changes through
  `/pell:local-review`; route a raised Bitbucket PR through
  `/pell:three-pass-review`. If pell review isn't wanted, notify that
  `superpowers:requesting-code-review` is the fallback.
- Direct fixes and close design gaps. When a gap reveals a design change, update
  `design.md` and `decisions.md` — the docs stay the source of truth, not the chat.
- Loop back to the phase the finding implicates: a design gap returns to Phase 3,
  a wrong track split to Phase 5. Repeat until the effort meets the quality bar
  set in Phase 1.

## Context budgeting

Front-load: Phases 1-4 are where the first ~100k-300k of a long session belongs.
Spend the remaining context running and steering execution (Phases 5-6). Persist
intent to `design.md` / `decisions.md` / `tracks.md` continuously, not just at the
end — a fresh coordinator session should recover via `--resume` by reading the
docs, never by replaying the chat.

## Operator notes

- Read the current branch with `git branch --show-current`.
- Pell branch shape is `<KEY>-<description>`; a Jira key matches `[A-Z][A-Z0-9]+-\d+`.
- Output is plain text — no emoji or glyphs. Use text markers (`Dispatched.`,
  `Revised.`, `[track 2: done]`, `_None._`).
- Every side effect (directory creation, file write, subagent fleet, review run,
  branch) is gated on a `(y/n)` that names exactly what will happen.
- Never auto-pick among multiple persisted efforts — list and ask.
- No rollback: if a subagent errors mid-phase, surface the error verbatim and
  leave the working tree as-is. You decide the next step.
- Notify, never force: no phase halts because `superpowers` or a sibling command
  is absent — fall through to the inline path.

## Out of scope

- Single-ticket or bounded changes — use `/pell:from-ticket`.
- Jira mutation, branch cleanup, PR creation/merge — those live in
  `/pell:start-work`, `/pell:finish-work`, and `/pell:wrap-up`.
- Running CI or deployments.
- Background or scheduled coordination — this is an interactive, in-session driver.
