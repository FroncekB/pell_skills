---
description: List unassigned Jira tickets in a project so you can sort through the queue. Groups by priority, then per ticket prompts whether to claim it (assign to you), start work on it, or skip. Read-only unless you say yes per ticket.
argument-hint: "<project key> [freeform context: 'all', 'high', 'today', etc.]"
---

You are running **`/pell:triage`**. Surface the unclaimed-ticket pool for a project and let the user act on one ticket at a time. Read-only against Jira unless the user explicitly opts in per ticket.

The user passed: `$ARGUMENTS`

## Step 1 — Parse arguments

From `$ARGUMENTS`:

- **Project key** (required) — first bare uppercase token of 2+ chars (regex `\b[A-Z][A-Z0-9]+\b`) that is **not** followed by `-\d+`. Examples: `RRS`, `FIEL`.
- **Freeform context** — remaining text after stripping the project key. Recognized phrases (case-insensitive):
  - `all` or `include assigned` → drop the `assignee is EMPTY` filter (show *all* not-done tickets)
  - `high` or `high priority` → add `AND priority in ("Highest", "High")`
  - `today` → add `AND created >= -1d`
  - `this week` → add `AND created >= -7d`
  - `mine to claim` or `assign to me` → pre-authorize the per-ticket assign prompt (skip the y/n, just do it when the user picks a number)
  - Anything unrecognized → passed through to the eventual `/pell:start-work` hand-off

If no project key is found, exit with: "I need a project key (e.g. `RRS`, `FIEL`). Try `/pell:triage RRS`."

## Step 2 — Resolve `cloudId`

Read `~/.claude/pell-config.json` (Read tool; treat missing as `{}`).

- If `jira.cloud_id` is set, use it.
- Otherwise call `mcp__plugin_atlassian_atlassian__getAccessibleAtlassianResources`, use the first result's `id`, and write it back atomically to `pell-config.json:jira.cloud_id`.

## Step 3 — Build and run the JQL query

Base JQL: `project = "<KEY>" AND statusCategory != Done`

Add: ` AND assignee is EMPTY` unless `all`/`include assigned` was parsed in Step 1.

Append any priority/recency filters from Step 1.

Append: ` ORDER BY priority DESC, created DESC`

Call `mcp__plugin_atlassian_atlassian__searchJiraIssuesUsingJql` with:

- `cloudId`: from Step 2
- `jql`: assembled string
- `fields`: `["summary", "status", "issuetype", "priority", "created", "assignee"]`
- `maxResults`: 30

If the call fails with a JQL syntax error → exit with: "Jira rejected that filter — `<error>`. Try `/pell:triage <KEY>` with no extra filters."

If the MCP isn't connected → exit with: "Jira MCP isn't connected — see the README prerequisites."

## Step 4 — Render the pool

If 0 issues:

> No unclaimed tickets in `<KEY>` matching the filter. Pool is clear.

Stop here.

Otherwise group by `priority.name`. Render in this order: `Blocker`, `Highest`, `High`, `Medium`, `Low`, `Lowest` — then any custom priorities (e.g. `Urgent`, `Trivial`) alphabetically — then no-priority. Within each group, preserve API order (already priority DESC, created DESC). The no-priority section header is `## (no priority)` rather than a bare dash — projects without priority configured (common) otherwise render an unhelpful `## —`.

Number tickets globally (continuous across groups):

```
## Highest
1. RRS-1041 [Bug] Customer cannot complete checkout on Safari  (3d ago)
2. RRS-1039 [Incident] Webhook retries spiking since deploy  (6h ago)

## High
3. RRS-1037 [Story] Add CSV export to admin dashboard  (1w ago)

## (no priority)
4. RRS-485 [Task] Add a New BilledOutsideRM Email  (3y ago)
```

Format rules:
- Keys left-padded so they align within a group
- `[<issuetype.name>]` only — no priority (it's the section header)
- Summary truncated to 80 chars with `…`
- `(<relative created>)` — use the largest unit that gives an integer ≥ 1: `5h ago`, `2d ago`, `1w ago`, `3mo ago`, `4y ago`
- If `all` was set, append `· assigned to <displayName>` for tickets where `assignee` is non-null

Below the list, render exactly one of:

- `Showing N unclaimed tickets in <KEY>.` — when the response has `isLast: true` (full pool fits in N)
- `Showing N unclaimed tickets in <KEY>. More pages available — narrow with \`high\`, \`today\`, or \`this week\` to filter.` — when `isLast: false`

The `searchJiraIssuesUsingJql` MCP doesn't return a total count, only `isLast`/`nextPageToken`. Don't promise a total you can't deliver.

## Step 5 — Per-ticket action prompt

Ask:

> Pick a ticket number to act on, or `n` to exit.

When the user picks a number that maps to a listed ticket, present the action menu:

```
RRS-1041 — Customer cannot complete checkout on Safari
What do you want to do?
  c = claim (assign to you)
  s = start work (claim + /pell:start-work)
  d = design (claim + /pell:from-ticket — branch + brainstorm + plan)
  v = view (no action, just print full description)
  n = next (return to the list)
  q = quit
```

Behavior per choice:

- **`c` (claim)** — confirm unless `assign to me` was pre-authorized in Step 1:
  > Assign RRS-1041 to you? (y/n)

  On `y`: call `mcp__plugin_atlassian_atlassian__atlassianUserInfo` to get your `accountId`, then `mcp__plugin_atlassian_atlassian__editJiraIssue` with `cloudId`, `issueIdOrKey: "RRS-1041"`, `fields: { assignee: { accountId: "<your-id>" } }`. Print `Assigned ✓`. Return to the list.

  Cache nothing — assignment is per-ticket.

- **`s` (start work)** — first claim (same as `c`, with the same y/n gate unless pre-authorized), then invoke `/pell:start-work RRS-1041` with any leftover freeform context from Step 1 appended. Start-work handles its own prompts (branch, transition).

- **`d` (design)** — first claim (same as `c`, with the same y/n gate unless pre-authorized), then invoke `/pell:from-ticket RRS-1041` with any leftover freeform context from Step 1 appended. from-ticket creates the branch via start-work and then runs the brainstorm → plan workflow (notify-don't-force if superpowers is absent).

- **`v` (view)** — call `mcp__plugin_atlassian_atlassian__getJiraIssue` with `cloudId`, `issueIdOrKey: "RRS-1041"`, `fields: ["summary", "description", "status", "issuetype", "priority", "reporter", "created", "labels"]`, `responseContentFormat: "markdown"`. Print: summary, status, type, reporter, labels, description (truncated to 1500 chars if longer with `…[truncated]`). Then return to the action menu for the same ticket.

- **`n` (next)** — return to Step 5 list prompt (don't re-render the list — keep numbering).

- **`q` (quit)** — exit cleanly. No farewell, no summary.

**Out-of-range number** at the list prompt: "That's not on the list — pick `1` through `<N>`, or `n`." Re-prompt once. After a second miss, exit.

## Operator notes

- **Read-only by default.** Every Jira write (assignment) is gated on a y/n unless the user pre-authorized in Step 1.
- **Never** transition tickets from this command. Transitions are `/pell:start-work`'s job (via the `s` or `d` choice — `d` routes through start-work inside from-ticket) or `/pell:finish-work`'s job.
- **Never** modify priority, labels, or any other field. Triage here means *claim or skip* — re-prioritization is a Jira-UI activity.
- If the user picks `s` for a ticket and `/pell:start-work` already has cached transitions for the project, start-work's normal flow applies — don't re-prompt for transition discovery here.
- If the user invokes from outside a git repo, `c` and `v` still work; `s` will fail in start-work's pre-flight (which is fine).
