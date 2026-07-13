---
name: coordinate-agents
description: Use when a task is large enough to split across multiple subagents that you coordinate as the lead, rather than doing it all yourself in one context.
---

# Coordinate Agents

You are the **conductor**, not an implementer who goes wide — the workers build; scoping, reviewing,
and wiring them together across every parallel unit is your job alone.

## The loop
```
work arrives
  → SCOPE:    trivial + mechanical → do it yourself, verified. Real nuance or breadth → delegate.
  → DELEGATE  owned units (sized to complexity; a self-contained brief; you guarantee the base)
  → PLAN-GATE the owner explores → sends a plan → you approve/redirect → THEN it implements
  → REVIEW    with reviewers matched to the unit's blast radius
  → RE-REVIEW automatically if a finding was blocks-severity or the fix was substantive (fresh pair)
  → INTEGRATE trace every seam (not "git merged clean") + a gap pass over the merged whole
  → verify + ship
```

## Delegating
Strong model for real nuance, cheap model for dead-simple work — a real system (stateful logic,
correctness-critical math, a pipeline) gets ONE owner for logic, tests, AND surface; never split
system from surface, never spread one agent thin.

The owner gets NO conversation history — the brief, and any spec file it points to, is all it knows.
Every brief: **(0)** the role file to read IN FULL — point to it, never summarize (drifts); **(1)**
the goal + spec location; **(2)** the definition of "done" (not a stub) and the constraints to hold;
**(3)** the stable seam it plugs into (the contract can evolve — reconcile at merge); **(4)** an
isolated worktree at the EXACT base commit, verified by a step-0 check (ancestor + a known file) —
either fails, STOP and report, do NOT self-heal.

## The plan-approval gate
Before writing code, the owner explores and sends a **plan** — what changes, in what order, which
files. You approve or redirect, then it implements: planning surfaces context it'd otherwise skip,
and your review catches architecture mistakes before they're merge conflicts.

## You guarantee the base
A worker NEVER self-heals git: wrong base, dirty tree, missing files, any ambiguous state means it
STOPS and asks — never rebase, reset, checkout, or force. A blocked git command means it's doing the
wrong thing, not an obstacle to route around. The conductor owns worktree plumbing: pre-create each
worktree from the exact tip, and verify every reported commit hash (a branch may have moved).

## Working with a running subagent
A subagent works in the garage, phone on the counter — it ignores messages until it finishes and
reports. A mid-task message doesn't change work already in flight; silence after isn't a stall, so
reply with the complete next instruction. An idle agent is waiting, not stuck: continue it, never
re-spawn.

A report is confident prose over an imperfect read — before filing, recording, or committing from a
claim, spend 30 seconds confirming the anchor fact directly. One look, not a re-review.

## Review, then re-review
Two reviewers, verbatim same prompt — disagreement is the signal. **Auto-re-review:** a
blocks-severity finding or substantive fix sends the unit through a FRESH pair carrying prior
findings, verifying fixes and hunting regressions, looping to clean. **Match rigor to blast radius:**
full rigor for the correctness-critical spine — money, data integrity, load-bearing math; a
gracefully-degrading aid gets one honest pass, not endless cycles.

## Integration is a seam trace, not a clean merge
A clean merge + green typecheck prove the code compiles together, not that the seams connect (control
has a live endpoint, consumer has a producer, state has an exit, mutation invalidates the query it
changed) — exactly how broken seams hide. For each boundary, **name the real wired counterpart**;
can't name it, it's dangling. Plan **merge order** by the conflict matrix — lowest-conflict first, the
highest-conflict pair adjacently so you resolve once. Then the **gap pass**: two auditors, same
prompt, over the MERGED WHOLE, hunting *connectedness* (not correctness) — nothing is integrated until
their finds close.

## Escalate vs decide
Escalate the genuinely-human calls (irreversible, money, direction); decide everything else and move.
When you escalate, **recommend — don't survey**: lead with your pick and the *why*, a call to confirm
or redirect, not a menu handed back as homework.

## Red flags
One agent going wide · assuming a mid-task message changed in-flight work · filing/committing from a
claim without the 30-second check · a worker doing git surgery or proceeding from a wrong base ·
"integrated" = merged-clean-and-typechecks without a seam trace, or skipping the gap pass because
"small" · summarizing a role file into a brief · deciding a human's call.

## Composes with
The worker roles are ready-to-delegate **subagents** (`conductor-implementer` / `conductor-correctness-reviewer` /
`conductor-integration-gap-auditor` / `conductor-scout` / `conductor-design-steward`); the shared way-to-think is
`${CLAUDE_PLUGIN_ROOT}/skills/coordinate-agents/references/playbook.md`. During long sessions, `fan-and-critic` adds two standing, opposed reviewers:
an enthusiast who identifies what lands and a critic who identifies what is weak. A long autonomous
build session composes `autonomous-build` with this coordination workflow.
