---
name: frontend-router
description: Use at the START of any user-facing UI work in a Pell repo — building React components, pages, layouts, design systems, styling, Tailwind/CSS, marketing pages, dashboards, forms, or any task whose deliverable is something a human will look at in a browser.
---

# Pell Frontend Router

You're about to do user-facing UI work in a Pell repo. Pell's house style is that visual work should go through the `frontend-design` plugin — it generates distinctive, production-grade interfaces that avoid generic AI aesthetics, which matches how Pell wants UIs to feel.

**Announce at start:** "Frontend work detected — checking whether `/frontend-design:frontend-design` is available."

## Step 1 — Decide whether this skill actually applies

Skip this skill (and proceed normally) when the work is:

- Bug fixes inside existing UI code where the visual design is not changing
- Pure data-layer work that happens to live in a frontend repo (API hooks, state stores, utility functions, types)
- Tests for existing components
- Renaming, refactoring, or moving files without changing visual output
- Small tweaks (one-line copy fixes, color value swaps, prop renames)

Apply this skill when the work is:

- A new component, page, or screen that doesn't exist yet
- A redesign or substantial visual overhaul of existing UI
- A new design system, layout primitives, or stylistic direction
- Marketing pages, landing pages, dashboards, or any "hero" surface
- Anything where the user said "make it look like…", "design a…", or "build a UI for…"

If skipping, say so in one short sentence and continue with the original task.

## Step 2 — Check whether `frontend-design` is available

Look in your available skills list for `frontend-design:frontend-design`.

**If it's available:**

Tell the user:

> Pell routes UI work through the `frontend-design` plugin for distinctive, production-grade output. I'll use `/frontend-design:frontend-design` for this work unless you'd rather I build it directly.

Then invoke the `frontend-design:frontend-design` skill via the Skill tool and follow its guidance. Do not duplicate its workflow — let it own the design loop.

**If it's NOT available:**

Tell the user (notify, don't block — never force an external plugin install):

> Heads up: this UI work would benefit from the `frontend-design` plugin, which isn't installed. You can install it with:
>
> `/plugin install frontend-design@claude-plugins-official`
>
> Want to install it before continuing, or should I build the UI directly without it?

Possible continuations:

- **Install and continue** — wait for the user to run the install and `/reload-plugins`, then invoke `frontend-design:frontend-design`
- **Skip and continue** — build the UI directly. Note in your response that you proceeded without `frontend-design` so the user can revisit later
- **Cancel** — drop the task

## Step 3 — Proceed

Once routed (or after the user opts to skip), continue with the original task. This skill is a router, not a workflow — its job ends after the decision is made.

## Operator notes

- This skill fires on description match. The trigger conditions are deliberately broad — false positives are cheap (one extra question), false negatives are expensive (Pell UI built without the house style)
- Never force-install. Never block. The user always has the option to proceed without `frontend-design`
- If the user has previously said "skip frontend-router" or similar in the current session, don't re-prompt
