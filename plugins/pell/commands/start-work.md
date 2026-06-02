---
description: Fetch a Jira ticket, create a properly-named local branch, and (only on explicit consent) assign or transition the ticket. Read-only against Jira by default — side-effects are opt-in per action or pre-authorized inline ("assign to me", "move it to in-progress").
argument-hint: <JIRA-KEY> [freeform context]
---

You are running **`/pell:start-work`**. Execute the steps below in order. Default behavior is read-only against Jira; side-effects fire only when the user pre-authorizes inline or answers `y` to a named per-action prompt.

The user passed: `$ARGUMENTS`

## Step 1 — Parse arguments

Extract from `$ARGUMENTS`:

- **Jira key** (required) — first match for `[A-Z][A-Z0-9]+-\d+`. If none, exit with: "I need a Jira key, e.g. `/pell:start-work RRS-1020`. (Listing your assigned tickets will live in `/pell:my-tickets` once that's built.)"
- **Branch description override** — phrases like `call it <slug>`, `name it <slug>`, `branch <slug>`. Capture the slug verbatim — preserve the casing and hyphenation the user typed.
- **Jira pre-authorizations** (each independent) — `assign to me` / `assign me` / `move it to <status>` / `transition to <status>` / `move to <status>`.
- **Jira decline** — `don't touch jira` / `skip jira` / `no jira changes`. Suppresses both side-effect prompts in Step 5.
- **`--reset` flag** — clears the cached "start" transition for this project before Step 5b.

The rest of `$ARGUMENTS` is informational context (e.g. "this is urgent") — let it color tone but don't let it drive control flow.

Extract `projectKey` from the Jira key (everything before the `-`).

## Step 2 — Fetch the Jira ticket

**Resolve `cloudId`:**

Read `~/.claude/pell-config.json` (use the Read tool; if the file doesn't exist, treat it as empty config `{}`).

- If `jira.cloud_id` is set in the config, use it
- Otherwise, call `mcp__plugin_atlassian_atlassian__getAccessibleAtlassianResources`. Use the first result's `id` as `cloudId`. Then atomically write it back:
  1. Re-read the config (or use the empty `{}` if it didn't exist)
  2. Set `jira.cloud_id = <cloudId>`
  3. Write the merged JSON back to `~/.claude/pell-config.json`

`cloud_id` is an identifier, not a preference — caching it on first use is transparent, no prompt needed.

**Fetch the ticket:**

Call `mcp__plugin_atlassian_atlassian__getJiraIssue` with:
- `cloudId`: the resolved value above
- `issueIdOrKey`: the parsed `<KEY>`
- `responseContentFormat`: `"markdown"`

Capture these fields for later steps:
- `summary` (string)
- `issuetype.name` (string)
- `status.name` (string)
- `assignee.displayName` and `assignee.accountId` (may be null if unassigned)
- `description` (markdown — keep the first ~5 lines for the Step 6 summary)

If the call fails with "not found" or 404 → exit with: "Couldn't find `<KEY>`. Check the key and your Jira MCP connection."

If the MCP call fails for any other reason (connection, auth) → exit with: "Jira MCP isn't responding — see the README prerequisites and try `/mcp` to verify the connection."

## Step 3 — Pre-flight checks

Run the three blocking checks first; abort on first failure. Then surface the two non-blocking warnings.

**Blocking:**

1. **In a git repo?** Run `git rev-parse --show-toplevel`. If the command fails (non-zero exit), exit with: "I need to be in a git checkout to create a branch. `cd` to the target repo and re-run."

2. **Working tree clean?** Run `git status --porcelain`. If the output is non-empty, exit with: "You have uncommitted changes. Stash, commit, or reset, then re-run." Do NOT auto-stash.

3. **Branch already exists for this key?** Run `git branch --list "<KEY>-*"`. If any branches match, ask:

   > A branch for `<KEY>` already exists: `<existing-branch>`. Switch to it instead of creating a new one? (y/n)

   - `y` → run `git checkout <existing-branch>`, then skip to Step 5
   - `n` → continue to Step 4 (the user accepts that they'll have two branches for this ticket)

**Resolve current user identity (for warnings + Step 5a):**

Call `mcp__plugin_atlassian_atlassian__atlassianUserInfo`. Capture `accountId` and `displayName`. Hold this in session memory — do NOT write it to `pell-config.json`. Identity is not a preference and the file may be shared across projects.

**Non-blocking warnings — surface and continue:**

- If `assignee.accountId` is set and != current user's `accountId`, print: "Heads up: this ticket is assigned to `<assignee.displayName>`."
- If `pell-config.json:jira.transitions[<projectKey>].start` is set AND `status.name` matches it (case-insensitive), print: "Ticket is already in `<status.name>`."

## Step 4 — Confirm and create the branch

**Derive the suggested description from the ticket summary:**

1. Start with `summary` from Step 2
2. Strip any leading `[<KEY>]` prefix Jira sometimes embeds (regex: `^\[?<KEY>\]?\s*[:\-]?\s*`)
3. Replace whitespace and punctuation runs with `-`
4. Split on `-`, take the first 5 tokens, rejoin with `-`. Also apply a 40-char soft cap: if the joined result exceeds 40 chars, drop tokens from the end until it fits (keep at least 2 tokens)
5. Preserve the summary's original casing — Pell convention is sentence-case-with-hyphens (e.g. `Fixing-broken-item`), not lowercase-kebab-case
6. Trim leading/trailing hyphens

Worked example: `"Cart fails to update item quantity"` → tokens `Cart`, `fails`, `to`, `update`, `item` → `Cart-fails-to-update-item` → final branch `<KEY>-Cart-fails-to-update-item`.

**Confirm the branch name:**

If the user pre-authorized a branch description inline (`call it <slug>`, `name it <slug>`, `branch <slug>`), use that slug verbatim as the description; skip the prompt.

Otherwise, print:

> Ticket: `<KEY> — <summary>` (status: `<status.name>`, type: `<issuetype.name>`)
>
> Suggested branch: `<KEY>-<derived-description>`
>
> Press Enter to accept, type a different description (e.g. `Fixing-cart`), or `n` to cancel.

- Empty response → accept the suggestion
- Any non-`n` text → use that as the description verbatim (don't re-derive)
- `n` → exit cleanly: "Cancelled. No branch created, no Jira changes made."

**Create the branch:**

Run `git checkout -b <KEY>-<description>`. The base is wherever the user is now — don't switch to `develop` or `main` first.

If `git checkout -b` fails (e.g. invalid branch name, branch already exists despite the Step 3 check having said otherwise), surface the git error verbatim and exit. Do NOT proceed to Step 5 — branch creation is the gating prerequisite for the Jira side-effects.

## Step 5 — Jira side-effects (opt-in, one at a time)

If the user typed `don't touch jira`, `skip jira`, or `no jira changes` in `$ARGUMENTS`, skip this entire step. Do NOT prompt for either action.

Otherwise, run 5a and 5b in order. Each is independent — `n` on 5a does not skip 5b.

### Step 5a — Assignment

Skip this sub-step entirely if `assignee.accountId` (from Step 2) equals the current user's `accountId` (from Step 3). The ticket is already yours.

If the user pre-authorized inline (`assign to me`, `assign me`) → call the assign MCP directly without prompting.

Otherwise, ask:

> Want me to assign `<KEY>` to you?

On `y`, call `mcp__plugin_atlassian_atlassian__editJiraIssue` with:
- `cloudId`: from Step 2
- `issueIdOrKey`: `<KEY>`
- `fields`: `{"assignee": {"accountId": "<current user accountId>"}}`

On failure, print a single line: "Failed to assign — `<error message>`." and continue to Step 5b. Do NOT roll back the branch.

On `n`, continue to Step 5b silently.

### Step 5b — Status transition

**Discover the "start" transition for this project:**

If `$ARGUMENTS` contained `--reset`, clear `pell-config.json:jira.transitions[<projectKey>].start` (read config, delete the key, write back) before continuing.

Look up `pell-config.json:jira.transitions[<projectKey>].start`:

- **Cached and the ticket's current `status.name` matches it (case-insensitive)** → skip Step 5b entirely. Nothing to do; the ticket is already in the start status. Print one line: "Ticket already in `<status.name>` — skipping transition."

- **Cached but the ticket is NOT in that status** → use the cached transition name. Skip discovery.

- **Not cached** → run discovery:
  1. Call `mcp__plugin_atlassian_atlassian__getTransitionsForJiraIssue` with `cloudId` and `issueIdOrKey: <KEY>`. Capture the list of `{id, name}` objects from the response
  2. Filter out names that match (case-insensitive) any of: `done`, `closed`, `resolved`, `won't do`, `wont do`, `cancelled`, `canceled`, `rejected`. These are never "start" candidates
  3. If 0 candidates remain → exit with: "No 'start' transitions available for `<KEY>`. Available transitions: `<comma-separated list of all names from the unfiltered response>`. Pass one explicitly with `move it to <name>` to bypass discovery."
  4. If exactly 1 candidate remains → use it. Ask:
     > Use `<name>` as the 'start work' transition for `<projectKey>` going forward? (y/n)

     On `y`, write the selection to config (`jira.transitions.<projectKey>.start = "<name>"`, atomic read-modify-write). On `n`, use the transition for this invocation but do NOT cache.
  5. If 2+ candidates remain → render a numbered list and ask:
     > Which of these means 'start work' for `<projectKey>`?
     > 1. `<name1>`
     > 2. `<name2>`
     > ...

     User picks a number. Write the selection to config (always cache here — multi-option means the user made a deliberate choice).

**If the user pre-authorized `move it to <status>` (or `move to <status>` / `transition to <status>`) inline:**

Resolve the target by matching `<status>` (case-insensitive) against the candidate names from discovery (or against the cached selection if cached):

- Exactly one match → use it as the chosen transition, skip the per-action prompt below. Cache the match if not already cached.
- Zero or multiple matches → fall back to the discovery flow above.

**Apply the transition:**

If the user pre-authorized inline, run the transition without prompting. Otherwise ask:

> Want me to move `<KEY>` to `<chosen transition name>`?

On `y`, call `mcp__plugin_atlassian_atlassian__transitionJiraIssue` with:
- `cloudId`: from Step 2
- `issueIdOrKey`: `<KEY>`
- `transition`: the `{id}` object from the candidate (you must pass the ID, not the name)

On failure, print a single line: "Failed to transition — `<error message>`." and continue to Step 6. Do NOT roll back the branch or the assignment.

On `n`, continue to Step 6 silently.

## Step 6 — Report

Print this report. Replace bracketed placeholders with the actual values; omit lines that don't apply (e.g. skip the "Assigned" line if assignment was skipped or declined).

```
On branch `<new branch>` (created from `<base branch from `git rev-parse --abbrev-ref HEAD@{1}` if available, else "current branch">`)
Assigned <KEY> to you
Moved <KEY> to "<new status>"

Ticket: <KEY> — <summary>
Type: <issuetype.name>   Status: <new status, or original if no transition happened>

Description:
<first ~5 lines of description, truncated with "…" if longer>

You're ready to start.
```

If the user declined any Jira action, add a single transparency line for each skip:

```
- Skipped Jira assignment (you answered no)
- Skipped Jira transition (you said "don't touch jira")
```

Use the second phrasing only if `don't touch jira` was the trigger; otherwise say "(you answered no)".

## Operator notes

- **Never** push, commit, post comments, open PRs, or stash. None of those are in scope for this command
- **Never** mutate Jira without explicit consent — either pre-authorization in `$ARGUMENTS` or a `y` answer to a named per-action prompt
- If any non-fatal step fails (Jira assignment, Jira transition, summary truncation), continue with the next step. The branch is the load-bearing deliverable; Jira changes are convenience
- The user's `$ARGUMENTS` always wins over defaults. If they typed something this command doesn't explicitly handle, interpret it naturally
