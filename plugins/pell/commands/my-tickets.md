---
description: List Jira tickets assigned to you that aren't done yet. Optional freeform filters (project key, status). After rendering, offers to chain into /pell:start-work for any ticket you pick.
argument-hint: "[project key] [status filter] [freeform context]"
---

You are running **`/pell:my-tickets`**. List the user's open Jira work and optionally hand off to `/pell:start-work`.

The user passed: `$ARGUMENTS`

## Step 1 — Parse arguments

From `$ARGUMENTS`, extract:

- **Project key filter** (optional) — a bare uppercase token of 2+ chars (regex `\b[A-Z][A-Z0-9]+\b`) that is **not** followed by `-\d+` (which would make it a full ticket key). Examples: `RRS`, `FIEL`. If found, becomes `AND project = "<KEY>"` in the JQL.
- **Status filter** (optional) — any remaining freeform text after stripping the project key. Examples: `in progress`, `blocked`, `to do`, `in review`. If non-empty after trimming, becomes `AND status = "<status>"` in the JQL (Jira matches case-insensitively).
- **Reserved flag:** `--reset` is not used by this command — it has no cached preferences. If passed, ignore it silently.

If `$ARGUMENTS` is empty, no filters apply.

## Step 2 — Resolve `cloudId`

Read `~/.claude/pell-config.json` (use the Read tool; if the file doesn't exist, treat it as `{}`).

- If `jira.cloud_id` is set, use it.
- Otherwise, call `mcp__plugin_atlassian_atlassian__getAccessibleAtlassianResources`. Use the first result's `id` as `cloudId`, then write it back to `pell-config.json:jira.cloud_id` (atomic read-modify-write).

## Step 3 — Build and run the JQL query

Base JQL: `assignee = currentUser() AND statusCategory != Done`

Append filters from Step 1:

- If a project key was parsed: ` AND project = "<KEY>"`
- If a status filter was parsed: ` AND status = "<status>"`

Append: ` ORDER BY updated DESC`

Call `mcp__plugin_atlassian_atlassian__searchJiraIssuesUsingJql` with:

- `cloudId`: from Step 2
- `jql`: the assembled string
- `fields`: `["summary", "status", "issuetype", "priority", "updated"]`
- `maxResults`: 25

If the call fails with a JQL syntax error → exit with: "Jira rejected that filter — `<error message>`. Try again without the status filter, or use a simpler one (`in progress`, `to do`, `blocked`)."

If the MCP isn't connected → exit with: "Jira MCP isn't connected — see the README prerequisites."

## Step 4 — Render the list

If the response has 0 issues:

> No open tickets assigned to you (filter: `<the JQL>`).

Stop here.

Otherwise, group issues by `status.name` and render. Sort groups in this preference order (any other statuses come after, alphabetically): `In Progress`, `In Review`, `To Do`, `Open`, `Backlog`, `Blocked`.

Within each group, preserve the order from the API (already `updated DESC`).

Number issues globally (continuous across groups):

```
## In Progress
1. RRS-1020 [Bug · Med] Cart fails to update item quantity  (updated 2d ago)
2. FIEL-44  [Story · High] Onboarding redesign step 2  (updated 5h ago)

## To Do
3. RRS-1023 [Task · Low] Bump dependencies for Q3  (updated 1w ago)
```

Format rules:
- `<KEY>` left-padded so the keys in the group align visually
- `[<issuetype.name> · <priority.name short>]` — abbreviate priority to `Crit`, `High`, `Med`, `Low`, `Lowest` (or `—` if no priority)
- Summary truncated to 80 chars with `…` if longer
- `(updated <relative time>)` — e.g. `5h ago`, `2d ago`, `1w ago`, `3mo ago` (use the largest unit that gives an integer ≥ 1)

Below the list, print the result count:

```
Showing N tickets matching: <description of filters, or "all open assigned to you">.
```

## Step 5 — Offer to chain into start-work

After the list, ask:

> Start work on one of these? Enter a number, or `n` to skip.

- **A number that maps to a listed ticket** → invoke `/pell:start-work <KEY>` for that ticket. Pass through any remaining freeform context the user may have included originally (e.g. if they typed `/pell:my-tickets RRS assign to me`, when they pick a number that pre-authorization carries through). Hand off to start-work's normal flow — the user still confirms the branch name and any per-action Jira prompts there.
- **`n` (or empty/Enter)** → exit cleanly. No side effects.
- **An out-of-range number** → "That's not on the list — pick `1` through `<N>`, or `n` to skip." Re-prompt once. After a second miss, exit cleanly.

## Operator notes

- **Never** mutate Jira from this command directly — assignment and transitions are start-work's job. This command is read-only against Jira except for the transparent `cloud_id` cache write.
- If the user invokes this from outside a git repo, the listing still works — they just can't immediately start work. That's fine; don't pre-check git state here.
- If a ticket the user picks already has a branch locally for that key, start-work's pre-flight will catch it and offer to switch. Don't duplicate that logic here.
