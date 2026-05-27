# `/pell:start-work` — Design

> **Status:** approved, ready for implementation plan
> **Bucket:** 1 (Jira ops)
> **Parent spec:** [`2026-05-27-pell-skills-architecture.md`](2026-05-27-pell-skills-architecture.md)

## 1. Purpose

Take a Jira key and put the engineer in a properly-named local branch, ready to start coding. Jira side-effects (assignment, status transition) are strictly opt-in and asked one at a time — the command never silently mutates Jira.

Reduces "I'm picking up RRS-1020" from a multi-step manual ritual (read ticket → pick branch name → checkout → assign → transition) to one slash command with explicit per-action consent.

## 2. Invocation shape

```
/pell:start-work <KEY> [freeform context]
```

Examples:

```
/pell:start-work RRS-1020
/pell:start-work RRS-1020 call it Fixing-cart-bug
/pell:start-work RRS-1020 assign to me
/pell:start-work RRS-1020 yeah move it to in-progress
/pell:start-work RRS-1020 assign to me and move to in-progress
/pell:start-work RRS-1020 --reset                  # re-prompt cached transition for this project
```

**Bare invocation (no key)** returns an error pointing the user to the upcoming `/pell:my-tickets` command:

> I need a Jira key, e.g. `/pell:start-work RRS-1020`. (Listing your assigned tickets will live in `/pell:my-tickets` once that's built.)

## 3. Happy-path flow

### Step 1 — Parse arguments

Extract from `$ARGUMENTS`:

- **Jira key** — first match for `[A-Z][A-Z0-9]+-\d+`. Required.
- **Inline branch description override** — phrases like `call it <slug>`, `name it <slug>`, `branch <slug>`. Capture the slug verbatim (preserve TitleCase-with-hyphens if the user typed it that way).
- **Inline Jira pre-authorizations** — `assign to me`, `assign me`, `move it to <status>`, `transition to <status>`, `move to <status>`. Capture each independently.
- **Inline Jira declines** — `don't touch jira`, `skip jira`, `no jira changes`. Suppresses the per-action prompts in Step 5.
- **Reserved flag** — `--reset` clears the cached transition for this project before Step 5.

Everything else is informational context the orchestrator can use for tone (e.g. "this is urgent" → say so in confirmations) but doesn't drive control flow.

### Step 2 — Fetch the ticket

Resolve `cloudId`:

- If `pell-config.json:jira.cloud_id` is set, use it
- Otherwise call `mcp__plugin_atlassian_atlassian__getAccessibleAtlassianResources`, write the first result's `id` to config, and use it

Call `mcp__plugin_atlassian_atlassian__getJiraIssue` with:

- `cloudId: <resolved>`
- `issueIdOrKey: <KEY>`
- `responseContentFormat: "markdown"`

Capture: `summary`, `issuetype.name`, `status.name`, `assignee` (displayName + accountId), `description` (markdown).

If the call fails with "not found" → exit with: "Couldn't find `<KEY>`. Check the key and your Jira MCP connection."

### Step 3 — Pre-flight checks

Run the three blocking checks first (abort on failure), then surface any non-blocking warnings:

**Blocking — abort on first failure:**

1. **In a git repo?** `git rev-parse --show-toplevel` — if it fails: "I need to be in a git checkout to create a branch. `cd` to the target repo and re-run."

2. **Working tree clean?** `git status --porcelain` — if non-empty: "You have uncommitted changes. Stash, commit, or reset, then re-run." Don't auto-stash.

3. **Branch already exists for this key?** `git branch --list "<KEY>-*"` — if any match:
   > A branch for `<KEY>` already exists: `<existing-branch>`. Switch to it instead of creating a new one? (y/n)
   - `y` → `git checkout <existing-branch>`, skip to Step 5
   - `n` → continue to Step 4 (will create another branch — user takes responsibility)

**Non-blocking — surface and continue:**

- If `assignee` is set and != current user: "Heads up: this ticket is assigned to `<displayName>`."
- If `status` is already a known "start" status for this project (per cached config): "Ticket is already in `<status>`."

Current user identity for the assignee check comes from `mcp__plugin_atlassian_atlassian__atlassianUserInfo`. Cache the result for this session (don't write to config — identity isn't a preference).

### Step 4 — Confirm and create the branch

**Derive the suggested description:**

1. Take `summary` from the Jira ticket
2. Strip any leading `[KEY]` prefix Jira sometimes embeds in summaries
3. Replace whitespace and punctuation runs with `-`
4. Truncate to the first 5 hyphen-separated tokens (40-char soft cap as a secondary guard)
5. Preserve the summary's original casing — Pell convention is sentence-case-with-hyphens (e.g. `Fixing-broken-item`), not lowercase-kebab-case
6. Trim trailing hyphens

Branch name: `<KEY>-<description>` (flat, no GitFlow prefix — confirmed by user 2026-05-27 during design).

Worked example: summary `"Cart fails to update item quantity"` → tokens `Cart`, `fails`, `to`, `update`, `item` → branch `RRS-1020-Cart-fails-to-update-item`.

**Confirm:**

If `call it <slug>` was pre-authorized inline → use that slug, skip the prompt, proceed.

Otherwise:

> Ticket: `<KEY> — <summary>` (status: `<status>`, type: `<issuetype>`)
>
> Suggested branch: `<KEY>-<derived-description>`
>
> Press Enter to accept, type a different description (e.g. `Fixing-cart`), or `n` to cancel.

On accept, run `git checkout -b <branch>` from the current branch. The user controls the base by where they invoke from — we don't switch to `develop` or `main` first.

On a `git checkout` failure (exotic git error), surface the git error and stop. Leave Jira alone.

### Step 5 — Jira side-effects (opt-in, asked one at a time)

**If the user typed `don't touch jira` (or similar decline) in $ARGUMENTS, skip this entire step.**

Otherwise, run the two checks below in order. Each is independent — answering `n` to one does not skip the other.

#### 5a. Assignment

Skip if assignee.accountId == current user (already yours).

If the user pre-authorized `assign to me` inline → assign without prompting.

Otherwise:

> Want me to assign `<KEY>` to you?

On `y`, call `mcp__plugin_atlassian_atlassian__editJiraIssue` with `assignee=<current-user-accountId>`. On failure, surface the error and continue (don't roll back the branch).

#### 5b. Transition

**Discover the "start" transition for this project:**

- Look up `pell-config.json:jira.transitions[<projectKey>].start`
  - `projectKey` is the prefix of the ticket key (e.g. `RRS` for `RRS-1020`)
- If `--reset` was passed, clear the cached value first
- If not cached:
  1. Call `mcp__plugin_atlassian_atlassian__getTransitionsForJiraIssue` with the ticket key
  2. Filter out transitions that look like end states (case-insensitive match against `done`, `closed`, `resolved`, `won't do`, `cancelled`) — these are never "start" candidates
  3. If only one remaining transition → use it, ask the user to confirm caching: "Use `<name>` as the 'start work' transition for `<projectKey>` going forward? (y/n)"
  4. If multiple → render numbered list, ask: "Which of these means 'start work' for `<projectKey>`?" — write the selection to config

If the user pre-authorized `move it to <status>` inline, match `<status>` (case-insensitive) against the available transition names. If exactly one matches, use it without re-prompting and cache it. If none or multiple match, fall back to the prompt above.

If the ticket is already in the cached "start" status, skip 5b entirely (no need to transition).

Otherwise:

> Want me to move `<KEY>` to `<startStatusName>`?

On `y`, call `mcp__plugin_atlassian_atlassian__transitionJiraIssue`. On failure, surface the error and continue.

### Step 6 — Report

Print a final summary:

```
✓ On branch `RRS-1020-Cart-fails-to-update-item` (created from <base-branch>)
✓ Assigned RRS-1020 to you
✓ Moved RRS-1020 to "In Progress"

Ticket: RRS-1020 — Cart fails to update item quantity
Type: Bug   Status: In Progress

Description:
<short excerpt of ticket description, first ~5 lines>

You're ready to start.
```

Skipped Jira actions get a single line like `- Skipped Jira assignment (you said "don't touch jira")` for transparency.

## 4. Side-effect matrix

| Action | When |
|-|-|
| Read Jira ticket / transitions | always |
| Read git state (`status`, `branch`, `rev-parse`) | always |
| Write `pell-config.json:jira.cloud_id` | first time, transparently |
| Write `pell-config.json:jira.transitions[KEY].start` | after user picks a transition |
| `git checkout -b <branch>` | user confirms branch name OR pre-authorized inline |
| `git checkout <existing-branch>` | user says `y` to the existing-branch prompt |
| Jira assignment | per-action `y` OR `assign to me` inline |
| Jira transition | per-action `y` OR `move it to <status>` inline |
| Commit, push, open PR, post comments, stash | **never** — out of scope |

Read-only against Jira until explicitly authorized. No batched "do everything?" mega-prompt — each Jira action is its own decision.

## 5. Config-file changes

### Additions to `pell-config.json`

- `jira.cloud_id` (string) — written transparently on first use, since it's an identifier not a preference
- `jira.transitions[<projectKey>].start` (string) — the transition name (not ID) that means "start work" for this project

### Removals from the original architecture sketch

The `gitflow` section in the architecture spec's schema sketch (§5) included `feature_prefix`, `bugfix_prefix`, `hotfix_prefix`. Branch names confirmed flat (`<KEY>-<description>`, no prefix), so this section becomes vestigial. Two options:

- **Drop it now.** Cleaner. If `/pell:finish-work` or a future release/PR command needs flow conventions, we'll add a focused section then.
- **Keep it dormant.** Reserved but unused.

**Decision: drop it.** YAGNI. Add it back when a command actually consumes it.

The architecture spec's §5 schema sketch will be updated to match in a follow-up edit.

## 6. Error paths

| Condition | Response |
|-|-|
| `$ARGUMENTS` has no Jira key | "I need a Jira key, e.g. `/pell:start-work RRS-1020`. (Listing your assigned tickets will live in `/pell:my-tickets` once that's built.)" |
| Ticket not found | "Couldn't find `<KEY>`. Check the key and your Jira MCP connection." |
| Atlassian MCP not connected | "Jira MCP isn't connected — see the README prerequisites." |
| Not in a git repo | "I need to be in a git checkout to create a branch. `cd` to the target repo and re-run." |
| Dirty working tree | "You have uncommitted changes. Stash, commit, or reset, then re-run." |
| Existing branch for this key | Offer to switch (`y/n`); never delete the existing one |
| `git checkout -b` fails | Surface git's error verbatim, exit, leave Jira alone |
| Jira `editJiraIssue` / `transitionJiraIssue` fails | Surface error, continue with the remaining steps (don't undo the branch) |

## 7. Forward-looking notes (out of scope here, deliberate)

- **`/pell:my-tickets`** — bare invocation of `start-work` deliberately doesn't list tickets. That capability belongs in a dedicated command that queries `searchJiraIssuesUsingJql` with `assignee = currentUser() AND status in (...)` and prints a numbered selection. Add to Bucket 1 build order.
- **Base-branch selection** — we don't prompt for or switch the base branch. The user controls it by where they invoke. If we later want `start-work` to base off `develop` or `main` by convention, add a `--from <branch>` flag or freeform `from develop` arg. Don't pre-build it.
- **Worktree fallback** — if engineers start asking for worktree support (e.g. to preserve a WIP branch), add `--worktree` as an explicit override. Don't add it preemptively.
- **Multi-key invocations** (`/pell:start-work RRS-1020 RRS-1021`) — not supported. One ticket per invocation.
- **Auto-stash on dirty tree** — explicitly rejected. Engineers should make the decision; surprise stashes are how work gets lost.

## 8. Implementation surface

Single command file:

- `plugins/pell/commands/start-work.md`

No new agents needed. No new skills needed. Reads from and writes to:

- `mcp__plugin_atlassian_atlassian__*` (Jira)
- `~/.claude/pell-config.json` (cloud_id + project transitions)
- Local git via Bash

Estimated body length: ~120-140 lines. Comfortably under the 150-line guideline in `CLAUDE.md`.

## 9. Open follow-ups (separate work items)

- Update `2026-05-27-pell-skills-architecture.md` §5 schema sketch: drop the `gitflow` section, add `jira.cloud_id` and clarify `jira.transitions[KEY].start` semantics.
- Add `/pell:my-tickets` to the build order (Bucket 1, between `start-work` and `triage`).
- After `start-work` lands, `/pell:finish-work`, `/pell:related`, and `/pell:triage` should mirror its patterns (config-cached transitions, named per-action prompts, freeform pre-authorization, opt-in side effects).
