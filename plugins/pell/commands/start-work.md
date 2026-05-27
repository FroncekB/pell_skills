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
