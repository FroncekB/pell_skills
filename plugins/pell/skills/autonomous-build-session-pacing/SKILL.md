---
name: autonomous-build-session-pacing
description: Use when the user grants an autonomous multi-hour budget ("4 hours", "keep going until I stop you", "you have 2.6h left"), or when the user asks you to check in on the clock, or when working quiet stretches with no per-change user feedback.
---

# Autonomous Build — Session Pacing

## Overview

Operating cleanly in a long autonomous session is mostly mechanical: keep a heartbeat so the harness doesn't stall; commit often with real messages; push often; typecheck is the truth, not screenshots; triage when the user declares a remaining budget. Getting the mechanics right frees all your attention for product decisions.

## When to Use

- User grants a long autonomous window
- User stops answering per-change — you're the driver
- User explicitly states remaining time ("2.6h left", "+120 minutes")
- Iteration loop getting slow (screenshots, build, etc.)

## When NOT to Use

- Short interactive sessions — normal pacing
- Tight spec with live user feedback — answer questions, don't self-pace

## Core Mechanics

### 1. Pacemaker heartbeat

Kick off a 10-min background `sleep 600; echo "pacemaker: continue"` when you start. When it expires (you'll get a completion notification), restart it.

```bash
# start
sleep 600; echo "pacemaker: continue"   # run_in_background: true
```

Keeps the session alive over quiet stretches and gives you a natural cadence check every ~10 min.

### 2. Time-check cadence

When the user says "note time every N min" — use `date '+%H:%M:%S'` at each natural break (commit, view switch, between features). Cheap, clear, leaves a trail in your output the user can audit.

### 3. Budget triage

When the user declares remaining time:
- Enumerate candidate features
- Rank by impact/effort, bounded by remaining time
- Commit to a short-list out loud
- Work the list. Re-triage if scope changes.

Example: "2.6h left → ship inline validation on the form (20m) + heatmap coloring on the matrix view (20m) + full-report export (40m) + saved-view comparison (30m). Polish at end only if time remains."

### 4. Commit + push per feature

One coherent feature = one commit = one push. Never batch. If you've made 3 coherent changes without committing, commit each one separately (via `git add -p` if needed).

Push after every commit. A session with 30 unpushed commits is a session at risk of loss.

### 5. Typecheck before commit, every time

```bash
npm run check      # or `cargo check`, `tsc`, `mypy`, `pyright`, `uv run ...`
```

Typecheck/lint/compile is **ground truth** during fast build cycles. If it passes, the structural correctness is verified — you don't need to visually confirm every commit.

### 6. Drop visual verification when feedback loop is slow

Signal: user says "screenshot iteration is a bit slow for right now" / "playwright is burning tokens" / general impatience. Response: stop running automated screenshots. Trust types + human review.

## Quick Reference

| Situation | Do |
|-----------|-----|
| Session start with long budget | Start pacemaker + note initial time |
| Pacemaker expires | Restart it in the background |
| User declares remaining time | Triage + announce short-list |
| Finished a coherent feature | Typecheck → commit (essay message) → push → next |
| Build loop feels slow | Drop screenshots; trust types |
| Time note requested | `date '+%H:%M:%S'` at each natural break |
| User interrupts with new mandate | Re-triage; don't just tack on |

## Red Flags — STOP and correct

- 30+ min with no commit
- 5+ commits with no push
- You're running screenshots when build feedback is already slow
- You haven't noted time in an hour after the user asked you to
- Pacemaker expired 15 min ago, no restart
- User said "2 hours left" and you haven't announced a feature short-list

## Common Mistakes

- **Giant end-of-session commit**: loses the layering history; pushes risk of breaking the tree.
- **Running pacemaker foreground**: blocks your work. ALWAYS `run_in_background: true`.
- **Visual verification for every small change**: when the iteration loop is slow, you're burning the user's time.
- **Ignoring declared budget**: user says "2 hours left" and you build as if infinite. Disrespects the explicit constraint.
- **Polling for pacemaker completion**: don't. The harness notifies you when it expires. Just do real work until then.

## Real-World Impact

A 6-hour session run this way shipped ~30 commits — each typechecked, committed, and pushed individually — with the pacemaker restarted every 10 minutes and a feature short-list announced the moment the user declared remaining time.
