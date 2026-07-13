---
name: autonomous-build-commit-essays
description: Use when writing commit messages during greenfield product-building sessions, multi-commit feature series, or any session that will produce more than 5 commits. Also use when the commit history is itself serving as the product's design narrative (e.g., an investor will read `git log`, or the session is being captured as a skill).
---

# Autonomous Build — Commit Essays

## Overview

Every commit message is a short essay explaining **why this feature matters** and **what product semantics it adds** — not just what code changed. Strung together, these messages become the product's design narrative. Someone scrolling `git log` learns WHY the product is the way it is, not just WHAT changed.

## When to Use

- Greenfield product session (>5 commits expected)
- Building a differentiation story someone will read later
- Autonomous session where `git log` is the audit trail
- Pair with `autonomous-build-purpose-layers` — each layer's commit explains its arc-position

## When NOT to Use

- Mechanical refactors (rename, format, dep bump) — one-line subject suffices
- Merge commits — default is fine
- Sessions with a single big commit — write a PR description instead

## Core Pattern

Every non-trivial commit gets:

1. **Subject line** (`<type>(<scope>): <imperative feature name>`)
   - `feat(alerts): anomaly-aware thresholds — dynamic bands beat static cutoffs`
2. **Body paragraph 1** — why this matters / what handoff it enables
   - Ground in the product's arc / audience ("this is the handoff between X and Y", "users hit this every single day", "the number stakeholders argue about")
3. **Body bullets** — key details worth preserving
   - Gotchas, provenance, cross-references to commits or issues, trade-offs
4. **(Optional) closing line** — a one-sentence business/product framing
   - "This is the 'set it up once, every future run inherits it' feature that makes the whole layering strategy pay off."
5. **Co-authorship** — if agent-authored, say so

## Example

```
feat(alerts): anomaly-aware alert thresholds

Static thresholds miss slow drift and over-fire on seasonal spikes.
Given a metric's rolling baseline (mean, stddev over a trailing
window W) and a sensitivity level (low / medium / high), compute a
dynamic threshold band and only fire once the metric has breached it
for N consecutive samples.

Outputs:
  - dynamic threshold band (upper/lower, per sensitivity level)
  - current value vs. band position
  - consecutive-breach counter
  - recommendation: no-action / watch / page

Closes the "is this actually broken or just noisy" question every
on-call engineer asks at 3am: not just "did it cross a number" but
"has it stayed wrong long enough to matter."

Co-Authored-By: Claude <noreply@anthropic.com>
```

## Quick Reference

| Commit kind | Minimum body |
|-------------|--------------|
| New view / semantic layer | 1 paragraph WHY + bullet substance + closing framing |
| Feature extension | 1 paragraph on what this enables that wasn't possible |
| Infrastructure | 1 paragraph + which downstream commits this unblocks |
| Bug fix | 1 line subject enough; essay optional |
| Refactor / format / dep | 1 line subject |

## Red Flags — rewrite the message

- Subject only, no body, for a new feature
- Body = literal description of the diff ("added X function to Y file")
- No audience named (who cares about this? who will notice?)
- No connection to a product arc / purpose layer
- Message could apply to 10 different features (too generic)

## Common Mistakes

- **Diff summarization**: "feat: add threshold panel" — reader learns what was added, not why it matters.
- **Version-bump style**: "chore: update X to 1.2.3" — fine for deps, not for features.
- **Passive voice tense**: "The threshold panel was added..." — use imperative ("add threshold panel").
- **Orphan commits**: commits disconnected from any named arc. Every feature commit should ground in a purpose layer.
- **Writing later**: ALWAYS write the message as part of the commit, with the work fresh. Retroactive messages lose the "why".

## Real-World Impact

In a 30+ commit session written this way, `git log` alone told the product's story well enough that new agents, reviewers, and investors could onboard from it in 10 minutes — the history doubled as the pitch deck.
