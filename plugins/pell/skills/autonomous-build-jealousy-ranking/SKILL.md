---
name: autonomous-build-jealousy-ranking
description: Use when ranking a feature backlog under a "next level / take it further / mad jelly" mandate, when writing a product roadmap for someone who wants differentiation (investors, launch partners, review threads), or when asked to file GitHub issues for a list of candidate features.
---

# Autonomous Build — Jealousy Ranking

## Overview

Rank features by **who'd be mad jealous**, not by effort. Every candidate gets red-teamed and tagged as either a `tool` (the "wait, you can do THAT?" reaction an investor or academic gives — differentiation / productization / methodological depth) or a `toy` (the "screenshot-worthy demo / fun to explore" reaction). Weak candidates get killed and replaced with stronger ones before filing.

## When to Use

- User asks "what else should we build?" under a time/attention budget
- Filing GitHub issues for a backlog
- Writing a roadmap section for a pitch / PR / README
- Deciding between N candidate features with equal-ish LOE

## When NOT to Use

- You already have a tight spec — just execute it
- You're building a pure bugfix — no ranking needed
- Early-stage scaffolding — ship the skeleton before ranking extensions

## Core Pattern

1. **Brainstorm wide.** Enumerate 20-50 candidates. Include wild ones. Include infrastructure. Include polish. Don't prefilter.

2. **Tag each as `tool` or `toy` (or both).**
   - `tool` = **investor-bait**: differentiation, methodological depth, productization, ecosystem integration, regulatory alignment, audit/rigor capabilities
   - `toy` = **demo-worthy**: screenshot-friendly, fun to explore, visually arresting, Twitter-thread material, makes the app feel alive
   - Some features are both; that's fine — both tags.

3. **Red-team each.** For every candidate, ask:
   - Is the data actually there for a good demo *today*? (If not — either skip or mark as needing infra first)
   - Does it genuinely differentiate, or is it parity with a competitor?
   - Would someone actually *pay for this* (tool) or *reshare a screenshot of it* (toy)?
   - Imagine the most skeptical critic in that audience. Does this survive?

4. **Kill and replace.** Candidates that fail red-team get dropped. For each kill, write a REPLACEMENT — don't just shrink the list. Targets: at least N tool candidates + M toy candidates survive (for a mid-size backlog: N=15, M=5).

5. **File with explicit labels.** Tag every issue with `tool` / `toy` / `investor-bait` / `infra` / `ecosystem` so the backlog's audience is legible at a glance.

## Quick Reference

| Signal | Tag it as |
|--------|-----------|
| Regulatory body would care | tool + investor-bait |
| PR tweet-thread material | toy |
| Unlocks other features via data | infra |
| Integration with sibling product | ecosystem |
| Both impressive and screenshot-friendly | tool + toy |

## Red Flags — reconsider the candidate

- "This is cool because it's novel" — novel ≠ jealous. Jealousy requires audience.
- "Every competitor has this" — parity is not differentiation; skip or tag as table-stakes.
- "Sample data is too thin for this" — either build infra first, or kill.
- "I'll file it and see" — file means commit; red-team before filing.
- Can't name the specific audience that'd be jealous — kill.

## Common Mistakes

- **Effort-based ranking**: "This is easy, let's do it first." Easy + low-differentiation = wasted commit slot.
- **Feature-count ranking**: filing 40 issues without distinguishing commercial value from ergonomic polish.
- **Universal labeling**: tagging everything `tool` — dilutes the signal. Be honest about which ones are polish.
- **No kill list**: keeping every idea out of emotional attachment. Red-teaming means some candidates die.

## Real-World Impact

A backlog filed this way typically skews heavily `tool` over `toy` once the red-team pass runs, with each casualty replaced by a stronger candidate — e.g. a low-value "manual retry button" swapped for a "full audit trail showing why the system acted."
