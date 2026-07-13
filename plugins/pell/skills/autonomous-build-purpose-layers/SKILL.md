---
name: autonomous-build-purpose-layers
description: Use when building or extending a product in an autonomous multi-hour session with an ambiguous "go big / next level / use the time well" mandate, and you could build either shallow-horizontal (more features of the same kind) or deep-vertical (each commit deepens the product's reach into a new semantic layer of purpose).
---

# Autonomous Build — Purpose Layers

## Overview

Each commit renders another **semantic layer** of the product's purpose — not another polish pass on the last one. The product's meaning deepens. After N commits, you have N distinct reasons the product exists, not N things that do the same thing slightly better.

Analogy: progressive JPEG. A low-resolution version loads first, then successive passes refine the image. You do the same with **purpose**: ship a working low-res version of the whole product, then render another layer of meaning on top of it with each commit.

## When to Use

- User grants a long autonomous window ("4 hours", "next level", "take it further")
- You have a working product and must decide what to build next
- Data or schema can support MORE features than what the UI shows today
- You notice yourself polishing the same view twice in a row

## When NOT to Use

- One-off bugfix or tight feature spec — build what was asked, not more
- User has given a tight plan — execute it, don't expand
- The product's first layer isn't working yet — finish breadth before depth

## Core Pattern

1. **Name the arc.** Before building more, enumerate the product's semantic progression. For a code-review tool the arc might be: *does this pattern occur?* → *how confident is the detector?* → *does it matter for this codebase?* → *can you see why it flagged this?* → *what should the developer do about it?* Every good product has an arc like this.

2. **Each commit advances the arc.** Not polishes the previous view. Concretely: next commit either reaches further along the arc (new question answered) or reaches a NEW axis (e.g., a security lens, a cost lens, a search lens) that the prior layers didn't touch.

3. **Build for schema capacity, not visible data.** If data is sparse, READ THE MODEL DEFINITIONS (Pydantic / proto / SQL DDL) to discover what CAN exist. Build features that light up as data fills in. Don't hide features because today's corpus doesn't populate them.

4. **Commit prose ties feature to arc.** Every commit message explains which layer of meaning this adds and to whom it matters. See `autonomous-build-commit-essays`.

5. **Batch size = 1 feature.** Never bundle two semantic layers into one commit — the layering history becomes the product's design doc.

## Quick Reference

| Symptom | Instead do |
|--------|------------|
| "Let me polish this view" | Ship it as-is. Build the next layer. |
| "The data doesn't have that yet" | Read the model. Build for what CAN exist. |
| "I'll do the big one after the small polish" | Reverse. Depth first, polish in follow-up. |
| "One big commit with everything" | One commit per semantic layer. |
| "This feature is like a competitor's X" | Skip parity. Only build if it adds a NEW axis. |

## Red Flags — STOP and reconsider

- Two commits in a row refining the same view
- You've built 5 features that all answer the same question
- Unable to articulate WHICH NEW QUESTION this feature answers
- Every competitor has feature X and you're adding it for parity
- Commit message reads "improve X" / "polish Y" / "add X.2"

## Common Mistakes

- **Parity-driven building**: copying a competitor's UI instead of a reason-to-exist. Kills differentiation.
- **Schema-blind building**: gating features on current data density. Features that would light up at 5× data never get built.
- **Batched commits**: one giant PR with 8 features obscures which arc-position each one occupies.
- **Polish-before-purpose**: iterating UI fidelity on layer 1 while layers 2-5 don't exist yet.

## Real-World Impact

A multi-hour session on a data-exploration dashboard produced a dozen distinct views this way — summary stats through full-dataset export — each answering a new question instead of polishing the last, with later layers only possible because earlier ones had already extended the data model.
