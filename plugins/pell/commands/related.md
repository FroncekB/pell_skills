---
description: Show everything connected to a Jira ticket — linked issues (blocks, relates to, duplicates), parent/subtasks, external links (PRs, docs), and Bitbucket PRs referencing the key. Auto-detects the key from the current branch when run with no arguments. Read-only.
argument-hint: "[JIRA-KEY] [freeform context]"
---

You are running **`/pell:related`**. Gather and render the connection graph for one Jira ticket. Read-only — no Jira writes, no Bitbucket writes.

The user passed: `$ARGUMENTS`

## Step 1 — Resolve the Jira key

From `$ARGUMENTS`, look for a ticket key (regex `\b[A-Z][A-Z0-9]+-\d+\b`). If found, use it.

Otherwise, try to auto-detect from the current branch: run `git branch --show-current` and match the same regex against the result. Pell branches are `<KEY>-<number>-<description>`, so the key prefix is the first match.

If still no key, exit with: "I need a ticket key. Try `/pell:related RRS-1020`, or run this from a branch named like `RRS-1020-...`."

Capture as `ticket_key`. Treat the remaining freeform text as context for the eventual rendering (e.g. "skip bitbucket" suppresses the PR section, "open only" filters Bitbucket PRs to `state=OPEN`).

## Step 2 — Resolve `cloudId`

Read `~/.claude/pell-config.json` (treat missing as `{}`).

- If `jira.cloud_id` is set, use it.
- Otherwise call `mcp__plugin_atlassian_atlassian__getAccessibleAtlassianResources`, use the first result's `id`, write it back atomically.

## Step 3 — Fetch the ticket

Call `mcp__plugin_atlassian_atlassian__getJiraIssue` with:
- `cloudId`: from Step 2
- `issueIdOrKey`: `ticket_key`
- `fields`: `["summary", "status", "issuetype", "priority", "assignee", "reporter", "issuelinks", "subtasks", "parent", "labels"]`
- `responseContentFormat`: `"markdown"`

If the call returns 404 → exit with: "`<ticket_key>` doesn't exist in Jira (or you don't have access)."

## Step 4 — Fetch remote links

Call `mcp__plugin_atlassian_atlassian__getJiraIssueRemoteIssueLinks` with:
- `cloudId`: from Step 2
- `issueIdOrKey`: `ticket_key`

A 404 or empty response is fine — just means no external links attached. Continue.

## Step 5 — Fetch Bitbucket PRs (optional)

Skip this step if the user said `skip bitbucket` in Step 1, or if `git rev-parse --show-toplevel` fails (not in a repo).

Parse `git remote get-url origin` — expect `git@bitbucket.org:<workspace>/<repo>.git` or `https://bitbucket.org/<workspace>/<repo>.git`. If parsing fails (not a Bitbucket remote), skip this step silently — but **capture the detected host** (e.g. `github.com`, `gitlab.com`, or the raw URL) so the final report can name it. Note in the final report under "Bitbucket PRs" that the origin isn't Bitbucket and which host was detected.

Call `mcp__atlassian-bitbucket__bitbucketPullRequest` with:
- `action`: `list`
- `workspaceId`: `<workspace>`
- `repoId`: `<repo>`
- `q`: `title ~ "<ticket_key>" OR source.branch.name ~ "<ticket_key>"` (BBQL contains-match)
- `state`: `OPEN` if the user said `open only`, otherwise omit (returns all states the API surfaces by default)
- `pagelen`: 20

If the MCP returns an error, render the PR section with `_Bitbucket query failed: <error>_` instead of failing the whole command. Other sections are still useful.

## Step 6 — Render

```
## <ticket_key> — <summary>

**Status:** <status.name>  ·  **Type:** <issuetype.name>  ·  **Priority:** <priority.name or —>
**Assignee:** <assignee.displayName or "unassigned">  ·  **Reporter:** <reporter.displayName or "unknown">
**Labels:** <comma-joined labels>     ← omit this entire line when labels is empty/missing

### Parent / Subtasks
- Parent: <parent.key> — <parent.fields.summary> [<parent.fields.status.name>]
- Subtasks:
  - <subtask.key> — <subtask.fields.summary> [<subtask.fields.status.name>]
  - ...
```

Omit the **Parent / Subtasks** section entirely if both `parent` and `subtasks` are absent/empty. Otherwise render only the lines that have content (e.g. skip the "Parent:" line if no parent).

```
### Linked Issues
- **blocks** <KEY> — <summary> [<status>]
- **is blocked by** <KEY> — <summary> [<status>]
- **relates to** <KEY> — <summary> [<status>]
- ...
```

Iterate `issuelinks`. For each entry:
- If `outwardIssue` is present, use `type.outward` as the relationship label and `outwardIssue` as the target.
- If `inwardIssue` is present, use `type.inward` as the relationship label and `inwardIssue` as the target.

If the list is empty, render: `### Linked Issues\n_None._`

```
### External Links
- [<title>](<url>) — <application.name or "—">
- ...
```

From `getJiraIssueRemoteIssueLinks` response. Each entry has `object.title`, `object.url`, `application.name`. If empty, render: `### External Links\n_None._`

```
### Bitbucket PRs
- #<id> **<title>** — <state>  ·  `<source.branch.name>` → `<destination.branch.name>`  ·  <author.display_name>
  <links.html.href>
- ...
```

From Step 5's response. If skipped, render: `### Bitbucket PRs\n_Skipped (not in a git repo, or `skip bitbucket` was set)._`

If origin isn't Bitbucket: `_Origin is <detected-host> — Bitbucket PR query skipped._` (e.g. `_Origin is github.com — Bitbucket PR query skipped._`)

If 0 results: `_No PRs reference <ticket_key> in this repo._`

End with:

```
**Summary:** <one short line synthesizing the connection density — e.g. "3 open blockers, 1 PR in review, no remote docs.">
```

## Step 7 — Exit

End the response. Do NOT offer to act on any linked issue or PR. This command is read-only. If the user wants to act, they can pipe a key into `/pell:start-work` or open the PR URL.

## Operator notes

- **Never** mutate Jira or Bitbucket from this command. Reads only.
- The `q` BBQL filter uses `~` for contains-match — important for finding PRs whose title has the key embedded (e.g. `"[RRS-1020] Fix checkout"`).
- If the user passes both an explicit key and is on a branch with a different key, the explicit arg wins. Don't second-guess.
- For tickets with very large `issuelinks` arrays (>30 links), render all of them — truncation hides important context. The list is still scannable.
- If `getJiraIssue` succeeds but `responseContentFormat: "markdown"` isn't honored by this MCP build, the response should still have the structured fields we need. Don't fall back; just parse the structured response.
- The Atlassian MCP sometimes omits `reporter` from the response even when requested in `fields` (observed against real tickets). Always use the `or "unknown"` fallback rather than assuming it's present.
