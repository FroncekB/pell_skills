---
description: Check whether a ticket is already filed, in progress, or shipped — searches similar Jira tickets, repo implementation, in-flight PRs/branches, and recently-merged commits, then renders a verdict. Read-only by default; offers a gated duplicate-link/comment only when run against an existing ticket key.
argument-hint: "[JIRA-KEY | free-text idea] [workspace | open only | skip repo | skip bitbucket | skip git]"
---

You are running **`/pell:precheck`**. Decide whether a piece of work is worth doing by checking if it already exists — as a Jira ticket, as code in the repo, as an in-flight PR/branch, or as a recently-merged commit. Read-only against Jira and Bitbucket by default; the only writes are an optional duplicate-link and comment, each `(y/n)`-gated, and only on the existing-key path.

The user passed: `$ARGUMENTS`

## Step 1 — Parse arguments

From `$ARGUMENTS`:

- **Ticket key** — first match of `\b[A-Z][A-Z0-9]+-\d+\b`. If present, capture as `self_key`: it seeds the query text (Step 3), is excluded from its own match set, and is the write target for Step 8.
- **Free text** — if no key is found, the entire argument string is `query_text` (a ticket the user is about to file). There is no write target, so Step 8 is skipped.
- **Scope modifiers** (case-insensitive; strip from the free text before it becomes `query_text`):
  - `workspace` / `all projects` → widen the Jira search beyond the target project.
  - `open only` → exclude Done tickets from Jira matches. **Off by default** — a Done/merged duplicate is the strongest "already implemented" signal.
  - `skip repo` / `skip bitbucket` / `skip git` → suppress that signal in Step 6.

If `$ARGUMENTS` is empty, exit with: "I need a ticket key or a description of the work. Try `/pell:precheck RRS-1041` or `/pell:precheck add CSV export`."

## Step 2 — Resolve `cloudId`

Read `~/.claude/pell-config.json` (treat missing as `{}`).

- If `jira.cloud_id` is set, use it.
- Otherwise call `mcp__plugin_atlassian_atlassian__getAccessibleAtlassianResources`, use the first result's `id`, and write it back atomically to `pell-config.json:jira.cloud_id`.

## Step 3 — Resolve query text and target project

- **If `self_key`:** call `mcp__plugin_atlassian_atlassian__getJiraIssue` with:
  - `cloudId`: from Step 2
  - `issueIdOrKey`: `self_key`
  - `fields`: `["summary", "description", "project"]`
  - `responseContentFormat`: `"markdown"`

  On 404 exit with: "`<self_key>` doesn't exist in Jira (or you don't have access)." Set `query_text` to the summary + description.
- **If free text:** `query_text` is the parsed free text from Step 1.

**Target project** (scopes the Jira search unless `workspace` was passed): the `self_key`'s project prefix; else the key prefix from `git branch --show-current` (if that command fails or returns empty — detached HEAD or not a repo — treat it as no match and continue); else `pell-config.json:jira.default_project` if set. If none resolves and `workspace` was not passed, run the Jira pass unscoped and note this in the report.
