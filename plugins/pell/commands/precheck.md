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

## Step 6 — Gather signals

Each signal is gathered independently. Any failure degrades to a `_<signal> failed: <error>_` (or `_unavailable_`) line in that section of the report — it never aborts the command. Skip any signal the user suppressed in Step 1.

### 6a — Jira: similar tickets

Two passes, merged and deduped, with `self_key` removed:

- **Semantic (primary):** call `mcp__plugin_atlassian_atlassian__search` with `query` set to the distinctive terms from `query_text` (drop stopwords; keep domain nouns, feature names, symbols). This is Rovo search — prefer it for content discovery. Keep only **Jira issues** (discard Confluence pages). When a target project resolved and `workspace` was not passed, keep only issues in that project. (Rovo `search` derives `cloudId` from your access token — it takes no `cloudId` parameter.)
- **Precision (scoping/recency):** call `mcp__plugin_atlassian_atlassian__searchJiraIssuesUsingJql` with:
  - `cloudId`
  - `jql`: build the WHERE clause by joining the parts that apply with ` AND ` (omit any that don't), then append ` ORDER BY created DESC`:
    - `project = "<KEY>"` — only when scoped (omit when `workspace`)
    - `(summary ~ "<terms>" OR text ~ "<terms>")` — always
    - `statusCategory != Done` — only when `open only` was set
    Composing this way keeps the JQL valid for every flag combination — e.g. `workspace` + `open only` yields `statusCategory != Done AND (summary ~ "<terms>" OR text ~ "<terms>") ORDER BY created DESC`.
  - `fields`: `["summary", "status", "issuetype", "created"]`
  - `maxResults`: 30

Merge both result sets by key, drop `self_key`, keep the union. When `open only` was set, also drop any Done issues returned by the Rovo pass (it has no status filter of its own), so the toggle applies uniformly.

### 6b — Repo: existing implementation

Skip if `skip repo` was set or `git rev-parse --show-toplevel` fails. Extract feature keywords from `query_text` (routes, function/symbol names, domain nouns). Use `Grep`/`Glob` to locate candidates, then `Read` the top hits to judge whether the functionality already exists. Record `file:line symbol` for each genuine hit. A keyword appearing in an unrelated context is not evidence — use judgment.

### 6c — In-flight: open PRs and branches

Skip if `skip bitbucket` was set or `git rev-parse --show-toplevel` fails (not in a repo). Parse `git remote get-url origin` for a Bitbucket `<workspace>/<repo>` (expect `git@bitbucket.org:<workspace>/<repo>.git` or the https form). If origin isn't Bitbucket, note the detected host and skip the PR query. Otherwise call `mcp__atlassian-bitbucket__bitbucketPullRequest` with:
- `action`: `list`
- `workspaceId`: `<workspace>`
- `repoId`: `<repo>`
- `q`: `title ~ "<terms>" OR source.branch.name ~ "<terms>"`
- `state`: `OPEN`
- `pagelen`: 20

Separately run `git branch -a` and keep branches whose names match the terms. If the Bitbucket MCP is absent or errors, render `_Bitbucket unavailable_` and continue (notify-don't-force).

### 6d — Merged: recent git history

Skip if `skip git` was set or not in a repo. Run `git log --oneline --grep="<term>" -i` (one or a few representative terms; cap to ~15 lines) to find already-merged work. Record `<short-sha> <subject> (<relative date>)`.
