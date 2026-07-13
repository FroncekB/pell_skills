---
name: fan-and-critic
description: Use when working a long autonomous build or design session with little per-change user feedback, and you want grounded outside eyes on each change without the user having to review everything themselves.
---

# Fan and Critic

## Overview

Run two **standing reviewer teammates** for the whole session: one harsh **critic**, one enthusiast **fan**. Feed each change to both. They record their takes separately; you read them on your cadence and weigh both with a grain of salt. Act on what they agree on. Where they split, decide for yourself what to fix and what to protect.

Two opposed framings de-bias the lead. A single reviewer anchors the build to one mood. Fan plus critic exposes both the strongest objection and the part worth preserving before the next change.

## When to Use

- A long autonomous build or design session where the user has stepped back from reviewing every change.
- You repeatedly produce reviewable artifacts: UI screenshots, generated copy, schemas, or plans.
- You want outside eyes without flooding the user or your own context with review prose.

## When NOT to Use

- A short interactive session where the user is actively reviewing each change.
- Pure mechanical work such as renames or dependency bumps.

## Setup — two standing reviewers

Spawn both reviewers at the first reviewable artifact as **named background teammates** so you can re-message them throughout the session. Use a strong model for both. Give each four things:

1. **Role** — critic finds what is weak; fan finds what genuinely lands. Both must be specific. Generic nitpicks and vacuous praise are equally useless.
2. **Project calibration** — the brand voice, design rules, and anti-references. Without this, both roles drift into generic advice.
3. **Paths** — the artifact directory and a separate feedback file for each reviewer.
4. **Output contract**
   - Append substantive feedback to the reviewer's own file, timestamped with one header per batch.
   - Reply to the lead in one short line only, such as `logged 5 notes to feedback_fan.md`.
   - Never paste the full review into the reply. The files keep the main thread and the user un-spammed.

## The Loop

1. Make a change or inspect an existing surface. Capture the reviewable artifact.
2. Send **both** reviewers the new path, what changed, and what to focus on.
3. They append to their separate files and reply in one line. Keep building; do not block on them.
4. At a natural feature or layer boundary, read both files.
5. Record the convergences you will act on and the splits you are setting aside or resolving yourself.

## Weighing the Takes

- **Convergence is signal.** Both identify the same strength or weakness: treat it as high confidence.
- **Divergence is the lead's call.** Critic says cut it while fan says protect it: inspect the artifact and decide which reading serves the project's actual bar.
- **Both roles are biased on purpose.** The critic over-finds problems; the fan over-praises. Neither drives the build.
- **Filter for utility.** Out-of-scope observations and notes without a concrete consequence do not become work.
- **Keep an audit trail.** Tell the user which convergences changed the work and which splits you deliberately set aside.

## Quick Reference

| Situation | Do |
|---|---|
| First reviewable artifact | Spawn a calibrated critic and fan as standing reviewers |
| Made or explored a change | Send both the artifact path, change summary, and focus |
| Reviewer reply is verbose | Re-enforce the one-line reply; substance belongs in its file |
| Finished a feature or layer | Read both files and act on convergence |
| Critic and fan disagree | Decide yourself; record what you protected or changed |
| Advice becomes generic | Re-feed the project's design rules and anti-references |

## Reviewer Prompt Skeleton

```text
You are my standing HARSH critic for <project> during a long build session.
I will send new artifact paths as I build.

Calibrate to: <brand voice, hard design rules, anti-references>.
Artifacts: <path>

Output contract:
1. Append all substance to <critic file>, timestamped, under one batch header.
   Write 3–6 specific points with concrete consequences and fixes, ranked P0–P3
   and tied to the applicable project rule or principle.
2. Reply to me in one short line only: "logged N notes to <file>".

First task: review <artifact>, write the first batch, reply one line, then wait.
```

Mirror it for the fan: find what genuinely lands and why, plus one concrete “double down here” per feature. Keep the same one-line reply and separate-file contract.

## Common Mistakes

- **Treating fan as fan-out** — fan means an enthusiast, opposed to the critic. It is not parallel task decomposition.
- **No calibration** — both roles return generic advice instead of judging against the project's bar.
- **Verbose replies** — feedback floods the active thread instead of accumulating in the two files.
- **One reviewer rather than two** — the build inherits that reviewer's mood; the opposed pair is the mechanism.
- **Acting on every note** — you thrash. Weight convergence, inspect divergence, and decide.
- **Reading reactively or blocking** — the reviewers advise; they do not drive. Read on your cadence.
- **Letting the critic set the emotional tone** — the fan exists to identify value that a fix must preserve.

## TDD Gap

This skill was extracted post-hoc from a live autonomous-build session and has not yet completed the
RED-phase `writing-skills` protocol. Before treating it as battle-tested, compare agents with and
without this skill on a long UI build where the user has stepped away; the baseline should expose
single-reviewer anchoring, missing outside review, or review prose flooding the active context.
