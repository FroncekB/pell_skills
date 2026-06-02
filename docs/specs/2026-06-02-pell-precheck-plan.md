# `/pell:precheck` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/pell:precheck` — a read-only-by-default slash command that checks whether a Jira ticket (or a proposed idea) is already filed, in progress, or shipped, across four signals, with gated duplicate-link/comment on the existing-key path.

**Architecture:** A single self-contained command prompt at `plugins/pell/commands/precheck.md`, following the inline-orchestration pattern of `related.md`/`triage.md`. No sub-agent. It parses freeform args, resolves `cloudId` from `pell-config.json`, gathers four signals (Jira via Rovo `search` + JQL, repo via Grep, in-flight via Bitbucket + `git branch`, merged via `git log`), synthesizes a verdict, renders a report, and offers gated writes only when run against an existing key.

**Tech Stack:** Markdown command prompt (Claude Code plugin). MCP tools: `plugin:atlassian:atlassian` (Jira: `search`, `searchJiraIssuesUsingJql`, `getJiraIssue`, `getAccessibleAtlassianResources`, `getIssueLinkTypes`, `createIssueLink`, `addCommentToJiraIssue`), `atlassian-bitbucket` (`bitbucketPullRequest`). Local tools: `Read`/`Grep`/`Glob`/`Bash` (git).

**Source of truth:** [`2026-06-02-pell-precheck-design.md`](2026-06-02-pell-precheck-design.md). Every section number referenced below (§3–§10) points there.

**Verification model (read this):** This deliverable is a declarative prompt, not executable code — there is no unit-test harness in this repo. The verification gate at each task is, in order: (1) `claude plugin validate ./plugins/pell` must pass; (2) a re-read of the written section against the cited spec section for coverage/consistency. Functional verification is **manual invocation** (Task 6), since behavior depends on live MCP responses. Do not invent a pytest/jest suite — none exists and the repo's CLAUDE.md defines validation as `claude plugin validate` + reload + invoke.

---

## File Structure

- **Create:** `plugins/pell/commands/precheck.md` — the entire command. One file, one responsibility (the precheck workflow). Target < 150 lines per repo style.
- **Modify:** `plugins/pell/README.md` — add one row to the command index (the Prereqs note for superpowers/frontend-design already landed in a prior commit; no further README prereq edit needed).
- **Modify:** `README.md` (marketplace root) — add `/pell:precheck` to the command reference if the root README enumerates commands (verify in Task 5; only edit if a command list exists there).

The command file is built up section-by-section (Tasks 1–4) so each task produces a coherent, individually-reviewable slice. The file is only validated as a whole once the frontmatter + body exist (Task 1 creates a structurally-valid file; later tasks append and re-validate).

---

## Task 1: Scaffold the command — frontmatter, arg parsing, cloudId, query/project resolution (§3–§5)

**Files:**
- Create: `plugins/pell/commands/precheck.md`
- Reference (copy patterns, do not modify): `plugins/pell/commands/related.md` (cloudId resolution Step 2; Bitbucket remote parsing Step 5), `plugins/pell/commands/triage.md` (cloudId write-back; arg-parsing regex style)

- [ ] **Step 1: Read the two reference commands for verbatim patterns**

Run: read `plugins/pell/commands/related.md` and `plugins/pell/commands/triage.md`.
Purpose: copy the exact `cloudId` resolution wording (`related.md` Step 2) and the Bitbucket remote-parsing wording (`related.md` Step 5) so `precheck` matches conventions rather than inventing new phrasing.

- [ ] **Step 2: Create `precheck.md` with frontmatter + intro + Steps 1–5**

Create `plugins/pell/commands/precheck.md` with exactly this content:

````markdown
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

- **If `self_key`:** call `mcp__plugin_atlassian_atlassian__getJiraIssue` with `cloudId`, `issueIdOrKey: self_key`, `fields: ["summary", "description", "project"]`, `responseContentFormat: "markdown"`. On 404 exit with: "`<self_key>` doesn't exist in Jira (or you don't have access)." Set `query_text` to the summary + description.
- **If free text:** `query_text` is the parsed free text from Step 1.

**Target project** (scopes the Jira search unless `workspace` was passed): the `self_key`'s project prefix; else the key prefix from `git branch --show-current`; else `pell-config.json:jira.default_project` if set. If none resolves and `workspace` was not passed, run the Jira pass unscoped and note this in the report.
````

- [ ] **Step 3: Validate**

Run: `claude plugin validate ./plugins/pell`
Expected: PASS (frontmatter is well-formed; `description` and `argument-hint` present).

- [ ] **Step 4: Self-check against spec §3–§5**

Re-read the file. Confirm: empty-args exit message present; `open only` documented as off-by-default; target-project fallback chain matches §5 exactly (self_key → branch → config → unscoped).

- [ ] **Step 5: Commit**

```bash
git add plugins/pell/commands/precheck.md
git commit -m "feat(precheck): scaffold command — args, cloudId, query resolution

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Signal gathering (§6a–§6d)

**Files:**
- Modify: `plugins/pell/commands/precheck.md` (append Step 6)

- [ ] **Step 1: Append the four-signal gathering section**

Append to `precheck.md`:

````markdown
## Step 6 — Gather signals

Each signal is gathered independently. Any failure degrades to a `_<signal> failed: <error>_` (or `_unavailable_`) line in that section of the report — it never aborts the command. Skip any signal the user suppressed in Step 1.

### 6a — Jira: similar tickets

Two passes, merged and deduped, with `self_key` removed:

- **Semantic (primary):** call `mcp__plugin_atlassian_atlassian__search` with `query` set to the distinctive terms from `query_text` (drop stopwords; keep domain nouns, feature names, symbols). This is Rovo search — prefer it for content discovery. Keep only **Jira issues** (discard Confluence pages). When a target project resolved and `workspace` was not passed, keep only issues in that project.
- **Precision (scoping/recency):** call `mcp__plugin_atlassian_atlassian__searchJiraIssuesUsingJql` with:
  - `cloudId`
  - `jql`: `<project clause> AND (summary ~ "<terms>" OR text ~ "<terms>") ORDER BY created DESC` — where `<project clause>` is `project = "<KEY>"` when scoped, omitted when `workspace`. Append ` AND statusCategory != Done` only if `open only` was set. (When `workspace` drops the project clause, drop the leading `AND` so the JQL stays valid.)
  - `fields`: `["summary", "status", "issuetype", "created"]`
  - `maxResults`: 30

Merge both result sets by key, drop `self_key`, keep the union. When `open only` was set, also drop any Done issues returned by the Rovo pass (it has no status filter of its own), so the toggle applies uniformly.

### 6b — Repo: existing implementation

Skip if `skip repo` was set or `git rev-parse --show-toplevel` fails. Extract feature keywords from `query_text` (routes, function/symbol names, domain nouns). Use `Grep`/`Glob` to locate candidates, then `Read` the top hits to judge whether the functionality already exists. Record `file:line symbol` for each genuine hit. A keyword appearing in an unrelated context is not evidence — use judgment.

### 6c — In-flight: open PRs and branches

Skip if `skip bitbucket` was set. Parse `git remote get-url origin` for a Bitbucket `<workspace>/<repo>` (expect `git@bitbucket.org:<workspace>/<repo>.git` or the https form). If origin isn't Bitbucket, note the detected host and skip the PR query. Otherwise call `mcp__atlassian-bitbucket__bitbucketPullRequest` with:
- `action`: `list`
- `workspaceId`: `<workspace>`
- `repoId`: `<repo>`
- `q`: `title ~ "<terms>" OR source.branch.name ~ "<terms>"`
- `state`: `OPEN`
- `pagelen`: 20

Separately run `git branch -a` and keep branches whose names match the terms. If the Bitbucket MCP is absent or errors, render `_Bitbucket unavailable_` and continue (notify-don't-force).

### 6d — Merged: recent git history

Skip if `skip git` was set or not in a repo. Run `git log --oneline --grep="<term>" -i` (one or a few representative terms; cap to ~15 lines) to find already-merged work. Record `<short-sha> <subject> (<relative date>)`.
````

- [ ] **Step 2: Validate**

Run: `claude plugin validate ./plugins/pell`
Expected: PASS.

- [ ] **Step 3: Self-check against spec §6**

Confirm: the `workspace`-drops-leading-`AND` JQL caveat is present (prevents malformed JQL); Rovo results filtered to Jira-only; `open only` Done-drop applied to both passes; every signal has an explicit skip condition and a degrade-don't-abort line.

- [ ] **Step 4: Commit**

```bash
git add plugins/pell/commands/precheck.md
git commit -m "feat(precheck): add four-signal gathering (jira, repo, in-flight, merged)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Synthesis and render (§7)

**Files:**
- Modify: `plugins/pell/commands/precheck.md` (append Step 7)

- [ ] **Step 1: Append the synthesis + render section**

Append to `precheck.md`:

````markdown
## Step 7 — Synthesize and render

Classify each Jira candidate as `likely-dupe`, `related`, or `unrelated` (drop `unrelated`) with a one-line rationale. Set the overall verdict:

- **LIKELY DUPLICATE** — a `likely-dupe` Jira ticket exists, or repo evidence shows the feature already exists.
- **POSSIBLY ADDRESSED** — only `related` tickets, partial repo hits, or overlapping in-flight work.
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

Render `_None found._` / `_No matching implementation found._` / `_None._` under any section with no hits. When a signal was skipped by the user, render `_Skipped (<reason>)._` instead. When the Jira pass ran unscoped, add under the Jira section: `_Searched all projects — no target project resolved._`
````

- [ ] **Step 2: Validate**

Run: `claude plugin validate ./plugins/pell`
Expected: PASS.

- [ ] **Step 3: Self-check against spec §7**

Confirm: three verdict values match the spec verbatim; the report skeleton has all four sections in spec order (Jira, repo, in-flight, merged); empty/skipped/unscoped placeholder lines are specified.

- [ ] **Step 4: Commit**

```bash
git add plugins/pell/commands/precheck.md
git commit -m "feat(precheck): add verdict synthesis and report rendering

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Gated side effects + operator notes (§8–§9)

**Files:**
- Modify: `plugins/pell/commands/precheck.md` (append Steps 8–9)

- [ ] **Step 1: Append the side-effects and operator-notes sections**

Append to `precheck.md`:

````markdown
## Step 8 — Side effects (existing-key path only)

Offer this **only** when `self_key` is present and there is at least one `likely-dupe` Jira match. If `self_key` is absent (free-text path), end after Step 7 — there is nothing to write to.

For each `likely-dupe` match, in order:

- **Link:** prompt `Link <self_key> as a duplicate of <match_key>? (y/n)`. On `y`: call `mcp__plugin_atlassian_atlassian__getIssueLinkTypes` with `cloudId` to resolve the Duplicate link type's exact name and direction, then `mcp__plugin_atlassian_atlassian__createIssueLink` with `cloudId`, `type` = that name, and `inwardIssue`/`outwardIssue` mapped so that `self_key` *duplicates* the older `match_key`. Print `Linked ✓`. On `n`, skip to the comment prompt.
- **Comment:** prompt `Comment on <self_key> noting the suspected duplicate / existing implementation? (y/n)`. On `y`: call `mcp__plugin_atlassian_atlassian__addCommentToJiraIssue` with `cloudId`, `issueIdOrKey: self_key`, `contentFormat: "markdown"`, and a `commentBody` listing the matched tickets / PRs / implementation with links. Print `Commented ✓`.

Each write is independent and individually gated. There is no pre-authorization shortcut in v1.

## Step 9 — Operator notes

- **Read-only by default.** The only writes are the Step 8 link/comment, each `(y/n)`-gated. **Never** resolve, close, transition, or edit ticket fields — duplicate handling is a human decision; `precheck` only flags and, on consent, links/comments.
- Always exclude `self_key` from its own match set.
- Repo, git, and Bitbucket signals skip gracefully outside a git repo or when origin isn't Bitbucket.
- Rovo `search` returns Confluence content too — filter to Jira issues only.
- Keyword extraction quality drives recall — pick distinctive terms over generic ones.
- No workspace-wide Bitbucket scan; the in-flight signal is scoped to the current repo's origin.
````

- [ ] **Step 2: Validate + line count**

Run: `claude plugin validate ./plugins/pell`
Expected: PASS.
Run: `wc -l plugins/pell/commands/precheck.md`
Expected: under ~150 lines (repo style guideline). If over, it's acceptable for a command this rich, but note it.

- [ ] **Step 3: Self-check against spec §8–§9**

Confirm: Step 8 is explicitly gated on `self_key` present AND ≥1 `likely-dupe`; link direction is "self_key duplicates older match_key"; `getIssueLinkTypes` is called before `createIssueLink` (no hardcoded type name); the "never resolve/close/transition/edit" prohibition is present verbatim.

- [ ] **Step 4: Commit**

```bash
git add plugins/pell/commands/precheck.md
git commit -m "feat(precheck): add gated duplicate-link/comment and operator notes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: README integration

**Files:**
- Modify: `plugins/pell/README.md`
- Modify (conditional): `README.md` (marketplace root)

- [ ] **Step 1: Add the command to the plugin README index**

In `plugins/pell/README.md`, under the **Jira ops** table (the `### Jira ops` section), add this row after the `/pell:related` row:

```
| `/pell:precheck [KEY | idea]` | Check if work is already filed / built / in-flight — similar tickets, repo impl, open PRs, merged commits. Gated link/comment. Read-only by default. |
```

- [ ] **Step 2: Check the root README for a command list**

Run: `grep -n "pell:related\|pell:triage" README.md`
- If matches exist, add a parallel `/pell:precheck` entry in the same table/format.
- If no command enumeration exists in the root README, skip — do not invent a section.

- [ ] **Step 3: Validate**

Run: `claude plugin validate ./plugins/pell`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add plugins/pell/README.md README.md
git commit -m "docs(precheck): add /pell:precheck to command index

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Manual functional verification

No automated harness exists for prompt behavior; this is the real functional test. Requires the Atlassian MCPs connected (see README prereqs).

- [ ] **Step 1: Reload the plugin**

```
/plugin marketplace update pell-skills
/reload-plugins
```

- [ ] **Step 2: Existing-key path (read-only assertion)**

Run `/pell:precheck <a real key with a known sibling>` against a project that has duplicates.
Expected: a report with the four sections and a verdict; the link/comment prompts appear **only** if a `likely-dupe` was found; answering `n` to both performs zero Jira writes.

- [ ] **Step 3: Free-text path (no-write assertion)**

Run `/pell:precheck add CSV export to admin dashboard`.
Expected: a report renders; **no** link/comment prompt appears (free-text path has no write target).

- [ ] **Step 4: Degradation assertions**

Run `/pell:precheck <key> skip bitbucket skip git` from outside a git repo.
Expected: Jira section still populates; in-flight/merged sections show `_Skipped (…)_`; the command does not abort.

- [ ] **Step 5: Side-effect assertion (only if a real likely-dupe is available)**

On the existing-key path with a genuine duplicate, answer `y` to the link prompt.
Expected: `getIssueLinkTypes` is consulted, a Duplicate link is created in the correct direction, `Linked ✓` prints. Verify the link in the Jira UI, then remove it if it was a test.

- [ ] **Step 6: Final consistency pass**

Re-read `precheck.md` end-to-end against the spec. Confirm no placeholders, MCP tool names exactly match the verified schemas, and severity/verdict vocabulary is consistent throughout.

---

## Self-Review (plan author)

**Spec coverage:**
- §1 Invocation → Task 1 Step 2 (frontmatter + intro). ✓
- §3 Arg parsing → Task 1. ✓
- §4 cloudId → Task 1. ✓
- §5 Query/project resolution → Task 1. ✓
- §6a–d Signals → Task 2. ✓
- §7 Synthesis/render → Task 3. ✓
- §8 Side effects → Task 4. ✓
- §9 Operator notes → Task 4. ✓
- §10 Out of scope → nothing to build (correctly absent). ✓
- README integration (architecture spec convention) → Task 5. ✓
- Functional verification → Task 6. ✓

**Placeholder scan:** Command-file content is provided verbatim in every task; no "TBD"/"add error handling"/"similar to". The only intentional `<…>` are runtime substitution slots inside the prompt (e.g. `<self_key>`, `<terms>`), which is correct for a prompt template.

**Type/name consistency:** MCP tool names match the schemas verified during design (`search`, `searchJiraIssuesUsingJql`, `getJiraIssue`, `getAccessibleAtlassianResources`, `getIssueLinkTypes`, `createIssueLink`, `addCommentToJiraIssue`, `bitbucketPullRequest`). Variable names (`self_key`, `query_text`, target project) are used consistently across all tasks. Verdict vocabulary (`LIKELY DUPLICATE`/`POSSIBLY ADDRESSED`/`APPEARS NOVEL`) and match tags (`likely-dupe`/`related`/`unrelated`) are identical in spec and plan.
