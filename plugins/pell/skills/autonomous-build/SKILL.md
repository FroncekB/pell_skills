---
name: autonomous-build
description: Use ONLY when the user explicitly names this skill — e.g., "use autonomous-build", "kick off with autonomous-build", or an equivalent explicit request. Do NOT auto-fire on generic "build me X" / "new project" / "take it further" phrasings; those go through the normal flow.
---

# Autonomous Build — Entrypoint

## Overview

This is the **front door** to long autonomous product-building sessions. Before writing code, it forces a short engagement on **what we're actually building, for whom, and toward what arc of purpose**. If greenfield, it scaffolds a private repo. Then it activates the rest of the `autonomous-build-*` family for the build phase.

The session's quality is set in the first 3 minutes. This skill makes sure those 3 minutes happen.

## When to Use

- User says "build me X" / "start a new project" / "let's make Y" / "take this to the next level" / "use the time well" / "go big"
- User grants an autonomous window (hours) with loose specs
- You're about to scaffold new tooling that will live across multiple sessions

## When NOT to Use

- Tight bugfix / single-file edit — don't over-scope
- User has already given a precise spec — execute it, don't re-engage
- Mid-session continuation of existing work — use the sub-skills directly

## Workflow

### 1. Engage — don't just execute

Before any code, surface the defaults out loud and ask 2–3 high-leverage questions. Don't batch every question; pick the ones whose answer actually changes what you'd build. And whenever you surface a decision — here, or an escalation later in the build — **recommend, don't survey**: lead with your pick and the *why*, a call to confirm or redirect, not a menu of open questions.

**The pins that matter most:**

| Pin | Why |
|-----|-----|
| **Audience** | Investor / internal team / end user / developer — changes everything downstream |
| **Arc** | The ordered sequence of questions the product should answer (e.g. what happened → why → what to do about it). Name at least 3 layers |
| **Budget** | Hours, tokens, complexity ceiling — drives `autonomous-build-session-pacing` triage |
| **Repo** | Brand-new? Extending existing? Private or public? Default: **private** |
| **Success signal** | Demo? Launch? Investor pitch? Audit-pass? Sets the jealousy-ranking audience |

If the user already said some of these, don't re-ask — just confirm out loud and move on. The goal isn't a form to fill, it's locking in the arc fast.

**REQUIRED SUB-SKILL (if creative scope is genuinely ambiguous):** Use superpowers:brainstorming before writing code. Don't skip this for large greenfield.

### 2. Scaffold (greenfield only)

**If no repo exists yet:** invoke a project-scaffolding skill/command if you have one (e.g. `new-project`), or set up the toolchain and repo by hand. Either way, override the default: **make the repo private** unless the user explicitly asked for public.

```bash
# When you reach the repo-creation step, use:
gh repo create <name> --private --source=. --remote=origin --push
```

State this out loud: "Creating as a private repo — say if you want it public."

If extending an existing repo, skip scaffolding entirely. Confirm the repo's already a git directory and the dev toolchain works, and move to step 3.

### 3. Announce the plan

One short message naming:
- The product arc (3+ named purpose layers)
- The first commit's layer + what it will unlock
- The pacemaker, the commit/push cadence you'll follow, and how you'll triage if the budget shifts

This sets expectations for the long session ahead and activates the sub-skills implicitly.

### 4. Build — sub-skills active

During the autonomous phase, these are all load-bearing:

| When | Sub-skill |
|------|-----------|
| Deciding the next feature | `autonomous-build-purpose-layers` — advance the arc, don't polish |
| Ranking a backlog / filing issues | `autonomous-build-jealousy-ranking` — tool vs toy, red-team, kill-and-replace |
| Mechanics (heartbeat, commits, budget) | `autonomous-build-session-pacing` — pacemaker, time-checks, typecheck-before-commit, push-every-feature |
| Every commit message | `autonomous-build-commit-essays` — WHY + audience + arc-position |

You don't have to re-read the sub-skills each commit — the pattern should be in your hands by commit 3. But if you notice drift (polishing instead of advancing, one-line commit subjects, no pushes in an hour), re-invoke the relevant sub-skill.

## Engagement Template

If you have no context at all, the opening message is roughly:

> Before I start: who's the audience for this — [specific personas]? And if you can name 3-5 questions the product should answer in order (the arc), I'll pin that and use it to drive every commit. One more: private repo OK as default? I'll scaffold a private repo/toolchain if this is greenfield.

Adjust to what the user already said. **Never** open with "I'll start by creating the directory structure." That's step 2, not step 1.

## Quick Reference

| Situation | Do |
|-----------|-----|
| "build me X" with no other context | Engage (audience + arc + budget + repo + success) → scaffold private → announce plan → build |
| User already named the arc | Confirm + skip ahead to scaffolding |
| Existing repo, "take it further" | Skip scaffolding, engage on which arc layer to advance, then build |
| Greenfield but no explicit private/public | Default private, state it out loud |
| User wants public | Obey; drop `--private` from `gh repo create` |
| Budget declared ("3 hours") | Triage short-list immediately (see session-pacing) |

## Red Flags — stop and re-engage

- Writing code before the arc is named
- Creating a public repo when the user didn't specify
- Scaffolding before you understand the audience
- Skipping the scaffold step when the project is genuinely greenfield
- "I'll just start and we'll figure it out" — no, pin the arc first

## Common Mistakes

- **Jumping to scaffolding**: fastest path to an unaimed product. Engage first.
- **Over-engaging**: 10 questions = interview, not kickoff. 2-3 high-leverage pins.
- **Skipping privacy default**: public-by-default is the wrong default for most work; user can always opt in to public.
- **Forgetting to announce the plan**: if you don't say it out loud, the user can't course-correct; the sub-skills lose their grounding.
- **Treating sub-skills as checkboxes**: they're a system. Purpose-layers picks the feature; jealousy-ranking tells you whether it's worth shipping; pacing handles the mechanics; commit-essays captures the WHY.

## Real-World Impact

Sessions that skip this front door tend to pin the arc by improvisation an hour or more in — after real work has already happened with no commit traceable to a purpose. Engaging first is what prevents that.
