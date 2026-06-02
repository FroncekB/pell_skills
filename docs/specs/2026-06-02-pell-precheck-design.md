# `/pell:precheck` — Design Spec

**Status:** approved
**Author:** Brandon Froncek + Claude
**Date:** 2026-06-02
**Parent spec:** [`2026-05-27-pell-skills-architecture.md`](2026-05-27-pell-skills-architecture.md)

## Purpose

`/pell:precheck` answers one question before you commit effort to a ticket: *has someone already filed this, started it, or already shipped it?* On large projects, the same work gets filed two or three times because nobody checks first. `precheck` checks four sources — overlapping Jira tickets, existing repo implementation, in-flight PRs/branches, and recently-merged commits — and renders a verdict.

It is **read-only by default**. When run against an existing ticket key, it can optionally link a confirmed duplicate and/or post a comment — each write individually `(y/n)`-gated. It never resolves, closes, transitions, or edits fields.

It accepts either an existing ticket key (grooming an existing backlog item) or free text (a ticket you're about to file) — covering both post-creation and pre-creation checks.

## 1. Invocation

```
/pell:precheck [JIRA-KEY | free-text idea] [scope modifiers]
```

Examples:

```
/pell:precheck RRS-1041                       # check an existing ticket against everything
/pell:precheck add CSV export to admin        # check a proposed idea before filing it
/pell:precheck RRS-1041 workspace             # widen Jira search beyond the ticket's project
/pell:precheck add CSV export skip bitbucket  # drop the in-flight-PR signal
/pell:precheck RRS-1041 open only             # exclude Done tickets from Jira matches
```

## 2. Architecture & flow

```
1. Parse args              (ticket key OR free text; scope modifiers)
2. Resolve cloudId         (pell-config.json read-or-fetch-and-cache)
3. Resolve query text      (key → getJiraIssue summary+description; else free text)
4. Gather signals          (Jira / repo / in-flight / merged — each degrades independently)
5. Synthesize verdict      (classify each Jira match; overall LIKELY DUPLICATE / POSSIBLY ADDRESSED / APPEARS NOVEL)
6. Render report           (read-only)
7. Offer side effects      (existing-key path only — link and/or comment, each gated)
```

This mirrors `related.md` and `triage.md`: inline single-command orchestration, no sub-agent. The "is this a match" judgment is reasoning, not heavy logic, so it lives in the command body. (If a second caller — e.g. `from-ticket` doing pre-creation dedup — later wants this, the matching logic factors cleanly into a `duplicate-detective` agent. Not built now: YAGNI.)

## 3. Argument parsing

From `$ARGUMENTS`:

- **Ticket key** — first match of `\b[A-Z][A-Z0-9]+-\d+\b`. If present, this is `self_key`: it seeds the query text (via fetch), is excluded from its own match set, and is the **write target** for link/comment.
- **Free text** — if no key, the entire argument string is the `query_text` (a proposed ticket). There is no write target, so side effects (Step 7) are not offered — the report is the deliverable.
- **Scope modifiers** (case-insensitive, stripped from free text before it becomes `query_text`):
  - `workspace` / `all projects` → widen the Jira search beyond the target project.
  - `open only` → exclude Done tickets. **Off by default** — a Done/merged duplicate is the strongest "already implemented" signal, so Done tickets are included unless the user opts out.
  - `skip repo` / `skip bitbucket` / `skip git` → suppress that signal.

If `$ARGUMENTS` is empty, exit with: "I need a ticket key or a description of the work. Try `/pell:precheck RRS-1041` or `/pell:precheck add CSV export`."

## 4. Resolve `cloudId`

Read `~/.claude/pell-config.json` (treat missing as `{}`).

- If `jira.cloud_id` is set, use it.
- Otherwise call `mcp__plugin_atlassian_atlassian__getAccessibleAtlassianResources`, use the first result's `id`, and write it back atomically to `pell-config.json:jira.cloud_id`.

## 5. Resolve query text and target project

- **If `self_key`:** call `mcp__plugin_atlassian_atlassian__getJiraIssue` with `cloudId`, `issueIdOrKey: self_key`, `fields: ["summary", "description", "project"]`, `responseContentFormat: "markdown"`. 404 → exit with "`<self_key>` doesn't exist in Jira (or you don't have access)." The `query_text` is the summary + description.
- **If free text:** `query_text` is the parsed free text.

**Target project** (for scoping the Jira search unless `workspace`): the `self_key`'s project prefix, else the key prefix from `git branch --show-current`, else `pell-config.json:jira.default_project` if set. If none resolves and `workspace` was not passed, run the Jira pass unscoped and note this in the report.

## 6. Gather signals

Each signal is gathered independently. Any failure degrades to a `_<signal> failed: <error>_` (or `_unavailable_`) line in that section — it never aborts the command. Skip any signal the user suppressed in Step 3.

### 6a. Jira — similar tickets

Two passes, results merged and deduped, with `self_key` removed:

- **Semantic (primary):** `mcp__plugin_atlassian_atlassian__search` with `query` = the distinctive terms extracted from `query_text` (drop stopwords; keep domain nouns, feature names, symbols). This is Rovo search — the MCP guidance is to prefer it for content discovery. Filter results to **Jira issues** (discard Confluence pages). When a target project resolved and `workspace` was not passed, keep only issues in that project.
- **Precision (scoping/recency):** `mcp__plugin_atlassian_atlassian__searchJiraIssuesUsingJql` with:
  - `cloudId`
  - `jql`: `<project clause> AND (summary ~ "<terms>" OR text ~ "<terms>") ORDER BY created DESC`, where `<project clause>` is `project = "<KEY>"` when scoped, omitted when `workspace`. Append ` AND statusCategory != Done` only if `open only` was set.
  - `fields`: `["summary", "status", "issuetype", "created"]`
  - `maxResults`: 30

Merge both result sets by key, drop `self_key`, keep the union. When `open only` was set, also drop any Done issues that came back from the Rovo pass (which has no status filter of its own), so the toggle applies uniformly across both passes.

### 6b. Repo — existing implementation

Skip if `skip repo` or `git rev-parse --show-toplevel` fails. Extract feature keywords from `query_text` (routes, function/symbol names, domain nouns). Use `Grep`/`Glob` to locate candidates; read the top hits to judge whether the functionality already exists. Record `file:line symbol` for each genuine hit. Use judgment — a keyword appearing in an unrelated context is not evidence.

### 6c. In-flight — open PRs and branches

Skip if `skip bitbucket`. Parse `git remote get-url origin` for a Bitbucket `<workspace>/<repo>` (same parsing as `related.md`; if origin isn't Bitbucket, note the detected host and skip the PR query). Call `mcp__atlassian-bitbucket__bitbucketPullRequest` with `action: list`, `workspaceId`, `repoId`, `q: 'title ~ "<terms>" OR source.branch.name ~ "<terms>"'`, `state: OPEN`, `pagelen: 20`. Separately, run `git branch -a` and keep branches whose names match the terms. If Bitbucket MCP is absent, render `_Bitbucket unavailable_` and continue (notify-don't-force).

### 6d. Merged — recent git history

Skip if `skip git` or not in a repo. Run `git log --oneline --grep="<term>" -i` (one or a few representative terms; cap output) to find already-merged work. Record `<short-sha> <subject> (<relative date>)`.

## 7. Synthesize and render

Classify each Jira candidate as `likely-dupe`, `related`, or `unrelated` (drop `unrelated` from the report) with a one-line rationale. Overall verdict:

- **LIKELY DUPLICATE** — a `likely-dupe` Jira ticket, or repo evidence the feature already exists.
- **POSSIBLY ADDRESSED** — only `related` tickets, partial repo hits, or in-flight work that overlaps.
- **APPEARS NOVEL** — nothing material across all signals.

Render (text tags, no emoji — consistent with `related`/`triage`):

```
## Precheck — RRS-1041   (or: proposed — "add CSV export")

**Verdict:** LIKELY DUPLICATE
<one-line synthesis>

### Similar Jira tickets
- [likely-dupe] RRS-1012 — Add CSV export to admin dashboard [Done]  ·  near-identical summary, same component
- [related]    RRS-880  — Admin data export overhaul [In Progress]  ·  overlapping area, broader scope
_None found._

### Repo implementation
- src/export/csv.ts:42  exportToCsv()  — feature appears implemented
_No matching implementation found._

### In-flight work
- PR #210  Add CSV export  OPEN  feat/csv-export · A. Dev
- branch  RRS-880-export  (remote)
_None._

### Recently merged
- abc1234  feat: add CSV export  (3w ago)
_None._
```

When the Jira pass ran unscoped (no project resolved), add under the Jira section: `_Searched all projects — no target project resolved._`

## 8. Side effects (existing-key path only)

Offered only when `self_key` is present (free text has no write target) and there is at least one `likely-dupe` Jira match. For each such match, in order:

- **Link:** prompt `Link <self_key> as a duplicate of <match_key>? (y/n)`. On `y`: call `mcp__plugin_atlassian_atlassian__getIssueLinkTypes` to resolve the Duplicate link type's name and direction, then `mcp__plugin_atlassian_atlassian__createIssueLink` so that `self_key` *duplicates* the older `match_key` (map to `inwardIssue`/`outwardIssue` per the resolved direction). Print `Linked ✓`.
- **Comment:** prompt `Comment on <self_key> noting the suspected duplicate / existing implementation? (y/n)`. On `y`: call `mcp__plugin_atlassian_atlassian__addCommentToJiraIssue` with `contentFormat: "markdown"` and a body listing the matched tickets / PRs / implementation with links. Print `Commented ✓`.

Each write is independent and individually gated. No pre-authorization shortcut in v1.

## 9. Operator notes

- **Read-only by default.** The only writes are the Step 8 link/comment, each `(y/n)`-gated. **Never** resolve, close, transition, or edit ticket fields — duplicate *handling* is a human decision; `precheck` only flags and, on consent, links/comments.
- Always exclude `self_key` from its own match set.
- Repo, git, and Bitbucket signals skip gracefully outside a git repo or when the remote isn't Bitbucket.
- Rovo `search` returns Confluence content too — filter to Jira issues only.
- Keyword extraction quality drives recall; lean on judgment to pick distinctive terms over generic ones.
- No workspace-wide Bitbucket scan — the in-flight signal is scoped to the current repo's origin.

## 10. Out of scope (v1)

- A `duplicate-detective` sub-agent / reuse from `from-ticket` or `triage` (revisit when a second caller exists).
- Confluence/doc duplicate detection.
- Auto-resolving or auto-transitioning detected duplicates.
- Pre-authorization flags for the link/comment writes.
