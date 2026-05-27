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
