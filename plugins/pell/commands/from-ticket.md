---
description: Compose ticket-to-implementation in one command. Fetches a Jira ticket, dispatches /pell:start-work to create a branch, then hands off to superpowers:brainstorming → writing-plans for the design and plan. When superpowers isn't installed, runs a lightweight inline substitute that produces a starter spec.
argument-hint: "<JIRA-KEY> [skip start-work | design only | plan only | start-work pre-auths | --reset] [freeform]"
---

You are running **`/pell:from-ticket`**. Sequence three pieces of existing machinery — `/pell:start-work`, `superpowers:brainstorming`, `superpowers:writing-plans` — into one ticket-to-plan workflow. `from-ticket` itself does no design work; it parses args, gathers context, detects existing artifacts, and dispatches each stage with the right inputs.

The user passed: `$ARGUMENTS`

## Step 1 — Parse arguments

Extract from `$ARGUMENTS` (all matches independent; freeform-first):

- **Jira key** (required) — first match for `[A-Z][A-Z0-9]+-\d+`. If none, exit with: "I need a Jira key, e.g. `/pell:from-ticket RRS-1020`."
- **Skip flags** (case-insensitive):
  - `skip start-work` / `branch ready` / `already on branch` → skip Stage 4
  - `design only` / `skip plan` / `no plan` → after Stage 5, instruct brainstorming not to chain into writing-plans
  - `plan only` / `skip brainstorm` / `skip design` → skip brainstorming; dispatch writing-plans directly. Requires an existing spec for `<KEY>`; otherwise error: "plan only requires an existing spec for `<KEY>`."
- **Pre-auths forwarded verbatim to `/pell:start-work`** (do NOT reinterpret; capture the matched substrings to append to the start-work invocation):
  - `assign to me`, `assign me`
  - `move it to <status>`, `transition to <status>`, `move to <status>`
  - `don't touch jira`, `skip jira`, `no jira changes`
  - `call it <slug>`, `name it <slug>`, `branch <slug>`
- **`--reset` flag** — clears artifacts for this ticket key (handled in Step 3).

**Conflict rules:**
- `skip start-work` + `plan only` is valid (resume-from-spec workflow).
- `design only` + `plan only` is an error: "Pick one — design only or plan only, not both."
- Unrecognized text passes through as informational context. It does NOT affect control flow at the from-ticket layer; brainstorming sees it as additional seed context.

Extract `projectKey` from the Jira key (everything before the `-`).
