# `/pell:scope` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/pell:scope` — a command that builds and caches a synthesized Statement of Work for a Jira project, places a ticket inside it, runs a Definition-of-Ready rubric, and offers a gated "questions for the reporter" comment — plus the `sow-builder` agent that does the project walk and a hook so `/pell:from-ticket` runs the check automatically.

**Architecture:** One command (`plugins/pell/commands/scope.md`) orchestrates inline: arg parsing, `cloudId`, cache lifecycle, live ticket fetch, placement, rubric, render, gated comment. One agent (`plugins/pell/agents/sow-builder.md`) does the expensive paged JQL walk + Confluence scope-doc discovery and returns the finished SOW document as JSON. `from-ticket` composes by invoking `/pell:scope <KEY> skip comment` after its ticket fetch. The cache lives in the *target* repo at `docs/pell/sow-<PROJECT>.md`.

**Tech Stack:** Markdown command + agent prompts (Claude Code plugin). MCP tools on `plugin:atlassian:atlassian`: `getAccessibleAtlassianResources`, `getJiraIssue`, `getJiraIssueRemoteIssueLinks`, `searchJiraIssuesUsingJql`, `search`, `addCommentToJiraIssue`, and the Confluence page-fetch tool (name verified in Task 1). Local: `Read`/`Write`/`Bash` (git).

**Spec:** [`2026-08-28-pell-scope-design.md`](2026-08-28-pell-scope-design.md). Every `§N` below points there.

**Verification model (read this):** These deliverables are declarative prompts, not executable code — there is no unit-test harness in this repo. The gate at each task is, in order: (1) `claude plugin validate ./plugins/pell` passes; (2) a re-read of the written section against the cited spec section. Functional verification is **manual invocation** (Task 7) because behavior depends on live MCP responses. Do not invent a pytest/jest suite.

**Authoring discipline (required):** Before writing or editing any file under `plugins/pell/` in Tasks 2–5, invoke `superpowers:writing-skills` via the Skill tool (notify-don't-force if it isn't installed) and follow its structure guidance. This is a standing repo rule for command/agent/skill authoring.

## Global Constraints

- Output is plain text — no emoji or glyphs. Status lines use text markers (`Commented.`, `Comment failed:`, `_None._`).
- Read the current branch with `git branch --show-current`, never `git rev-parse --abbrev-ref HEAD`.
- Issue-key regex is `\b[A-Z][A-Z0-9]+-\d+\b`; `KEY` means the full issue key (e.g. `RRS-1020`).
- Severity vocabulary for readiness: `blocker / major / minor / nit` (§8).
- Every side effect is `(y/n)`-gated and the prompt names exactly what will change (§12). The only writes are the cache file and the Jira comment. `--dry-run` suppresses both.
- Reserved flags `--reset`, `--dry-run`, `--verbose` are accepted; `--reset` is a no-op here (no cached config beyond `cloud_id`) and should be documented as such.
- Agent frontmatter: `name`, `description`, `model: inherit`; no `tools:` line; trailing JSON output.
- Cache path: `docs/pell/sow-<PROJECT>.md` relative to `git rev-parse --show-toplevel`.
- Staleness threshold: 14 days. Traversal cap: 10 pages of 100 (`deep` lifts it).
- Bump `plugins/pell/.claude-plugin/plugin.json` from `0.12.0` to `0.14.0` (minor: new command + new agent) in the same change set. `0.13.0` is skipped deliberately: the `conductor-port` branch already uses it and a `0.13.0` build is already in the local plugin cache, which is keyed by version — reusing the number would mean the reload never rebuilds.
- Never commit, push, transition, edit fields, or link issues from these prompts.

---

## File Structure

- **Create:** `plugins/pell/agents/sow-builder.md` — the project walker. Input: `cloudId`, `project_key`, `sow_sources`, `deep`, `verbose`. Output: trailing JSON with `sow_markdown`, `sources`, `stats`, `summary`. One responsibility: turn a Jira project (+ Confluence scope docs) into the SOW document.
- **Create:** `plugins/pell/commands/scope.md` — the command. Steps 1–8 mirror spec §3–§8, §11–§12. Target ~150 lines; it is a single-purpose command whose length is sequential steps, and the render templates account for much of it.
- **Modify:** `plugins/pell/commands/from-ticket.md` — new Step 2.5 (§13), `skip scope` in Step 1 and `argument-hint`, `## Project context` block in the Step 5 seed.
- **Modify:** `plugins/pell/.claude-plugin/plugin.json` — version bump.
- **Modify:** `plugins/pell/README.md`, `README.md` — command index rows, agent list, per-command section.
- **Modify:** `docs/specs/2026-05-27-pell-skills-architecture.md` §12 — built list.

Task order: agent first (Task 2) so the command (Tasks 3–4) dispatches an interface that already exists; `from-ticket` hook (Task 5) after the command it invokes; docs + version (Task 6); manual verification (Task 7).

---

## Task 1: Verify every MCP schema the two prompts will name

**Files:**
- None written. This task produces verified parameter names that Tasks 2–4 copy verbatim.

**Interfaces:**
- Produces: the exact Confluence page-fetch tool name and its parameters, recorded in the scratchpad file `mcp-schemas.md` for the later tasks to copy.

- [ ] **Step 1: Authenticate the OAuth Atlassian MCP if needed**

Run `ToolSearch` with query `+atlassian`. If the only `mcp__plugin_atlassian_atlassian__*` (or `mcp__atlassian__*`) entry is `authenticate`, call it, hand the user the URL, and complete the flow with `complete_authentication`. Do not proceed until Jira tools appear in `ToolSearch` results.

- [ ] **Step 2: Load the Jira tool schemas**

Run `ToolSearch` with query `select:mcp__plugin_atlassian_atlassian__searchJiraIssuesUsingJql,mcp__plugin_atlassian_atlassian__getJiraIssue,mcp__plugin_atlassian_atlassian__getJiraIssueRemoteIssueLinks,mcp__plugin_atlassian_atlassian__search,mcp__plugin_atlassian_atlassian__addCommentToJiraIssue,mcp__plugin_atlassian_atlassian__getAccessibleAtlassianResources`.

If the server prefix differs (e.g. `mcp__atlassian__`), use whatever prefix `ToolSearch` shows and note it — the shipped prompts must use the prefix that the installed plugin exposes, which for this repo has always been `mcp__plugin_atlassian_atlassian__`. Confirm, for each tool:

- `searchJiraIssuesUsingJql`: parameter names for JQL string, field list, page size (expected `cloudId`, `jql`, `fields`, `maxResults`, `nextPageToken`), and the maximum page size (expected 100).
- `getJiraIssue`: `cloudId`, `issueIdOrKey`, `fields`, `responseContentFormat`.
- `getJiraIssueRemoteIssueLinks`: `cloudId`, `issueIdOrKey`.
- `search`: the query parameter name (expected `query`) and confirm it takes no `cloudId`.
- `addCommentToJiraIssue`: `cloudId`, `issueIdOrKey`, `commentBody`, and whether a `contentFormat` parameter exists (`precheck.md` passes `contentFormat: "markdown"`; if the schema has it, the comment step in Task 4 must pass it too).

- [ ] **Step 3: Find and load the Confluence page tool**

Run `ToolSearch` with query `+confluence page` (max_results 10). Identify the tool that fetches one page's body by ID or URL (expected name shape `mcp__plugin_atlassian_atlassian__getConfluencePage`). Record its exact name, required parameters (expected `cloudId`, `pageId`), and any body-format parameter. Also note whether a URL-accepting variant exists; if only `pageId` is accepted, the agent must extract the numeric page ID from `/pages/<id>/` in each Confluence URL.

- [ ] **Step 4: Write the verified shapes to the scratchpad**

Write `<scratchpad>/mcp-schemas.md` with one block per tool: exact name, required params, optional params used, page-size max, and the Confluence ID-extraction rule if needed. Tasks 2–4 reference this file; they must not extrapolate names from memory.

- [ ] **Step 5: Reconcile the spec if anything differs**

If any verified name differs from what `2026-08-28-pell-scope-design.md` §5, §6, §9, or §12 states, edit the spec to match reality (spec is the source of truth and must not lie) and note the correction in the commit message of Task 2.

---

## Task 2: `sow-builder` agent (§9–§10)

**Files:**
- Create: `plugins/pell/agents/sow-builder.md`
- Reference (copy patterns, do not modify): `plugins/pell/agents/correctness-reviewer.md` (frontmatter shape, "Inputs you will receive" section, trailing-JSON output rule)

**Interfaces:**
- Consumes: verified tool names from Task 1's `mcp-schemas.md`.
- Produces: an agent dispatched via `subagent_type="sow-builder"` whose prompt contains the labeled lines `cloudId: <uuid>`, `project_key: <KEY>`, `sow_sources: [<urls>]`, `deep: true|false`, `verbose: true|false`, and which returns on its last line exactly: `{"sow_markdown": "<string>", "sources": [{"title","url","discovered_via"}], "stats": {"issues","epics","unparented","dropped","scope_docs","truncated","project_name"}, "summary": "<string>"}`. Task 3 parses `stats` for its status line and writes `sow_markdown` to disk.

- [ ] **Step 1: Invoke `superpowers:writing-skills`**

Call the Skill tool with `superpowers:writing-skills`. If it isn't installed, print one line saying so and continue. Read `plugins/pell/agents/correctness-reviewer.md` lines 1–20 and the last 15 lines for the frontmatter and output-format wording.

- [ ] **Step 2: Create the agent file**

Create `plugins/pell/agents/sow-builder.md` with exactly this content, substituting the Confluence tool name and parameters recorded in Task 1 where the text says `<CONFLUENCE_PAGE_TOOL>` / `<CONFLUENCE_PAGE_PARAMS>`:

````markdown
---
name: sow-builder
description: Walks every issue in a Jira project plus any linked Confluence scope documents and synthesizes a per-epic Statement of Work (scope statements, deliverables, dependencies, gaps) as a markdown document. Dispatched by /pell:scope when the SOW cache is missing or stale; reusable by any command that needs a project-level picture.
model: inherit
---

You are a project scoper. You do **one thing**: turn a Jira project — and any Confluence scope documents attached to it — into a synthesized Statement of Work document. You do not assess individual tickets; the orchestrator does that with the document you return.

## Inputs you will receive in the dispatching prompt

- **`cloudId`** (required) — Atlassian cloud ID for every Jira call.
- **`project_key`** (required) — e.g. `RRS`.
- **`sow_sources`** — list of Confluence page URLs already known to be authoritative scope statements. May be empty.
- **`deep`** — `true` lifts the 10-page traversal cap. Default `false`.
- **`verbose`** — `true` means print one line per fetched page and per discovered scope doc before the final JSON. Default `false`.

If a piece is missing, treat it as its default and proceed.

## Step 1 — Walk the project

Call `mcp__plugin_atlassian_atlassian__searchJiraIssuesUsingJql` with:
- `cloudId`
- `jql`: `project = "<project_key>" ORDER BY issuetype ASC, created ASC`
- `fields`: `["summary", "description", "status", "issuetype", "priority", "parent", "issuelinks", "labels", "components", "resolution", "updated", "project"]`
- `maxResults`: 100

Follow `nextPageToken` until the response has none. Stop after 10 pages unless `deep` is `true`; when you stop early, set `truncated: true` in the stats and say so in the document's Stats section. Record `project_name` from the first issue's `project.name`.

If the very first call fails, return the failure JSON described under Output format — do not fabricate a document.

## Step 2 — Group

- **Epics:** `issuetype.name` is `Epic`.
- **Children:** every non-epic whose `parent.key` is an epic. A subtask whose parent is a story belongs to that story's epic; record the story as its immediate parent.
- **Unparented:** non-epics with no `parent`.
- **Dropped:** issues whose `resolution.name` is `Won't Do`, `Cancelled`, `Duplicate`, or whose labels include `wontfix`, `deferred`, or `out-of-scope`. Dropped issues stay listed under their epic but are excluded from done/total counts and repeated in the Out-of-scope section.
- **Done:** `status.statusCategory.key == "done"` (fall back to `status.name` in `Done`, `Closed`, `Resolved`, `Released` when the category is absent).

## Step 3 — Discover scope documents

Build the source set as the union of:

1. Every URL in `sow_sources` (`discovered_via: "pinned"`).
2. For each epic, call `mcp__plugin_atlassian_atlassian__getJiraIssueRemoteIssueLinks` with `cloudId` and `issueIdOrKey: <epic key>`. Keep entries whose `object.url` contains `/wiki/` (`discovered_via: "remote-link"`). A 404 or empty response means no links; continue.
3. Call `mcp__plugin_atlassian_atlassian__search` with `query`: `<project_name> statement of work OR scope OR SOW`. This tool takes no `cloudId`. Keep only Confluence results whose title or space mentions `<project_name>` or `<project_key>` (`discovered_via: "search"`). Discard Jira issues from the result set.

Dedupe by URL. If the set is empty, the SOW has no authoritative sources — say so in the document; that is a legitimate, common state.

## Step 4 — Fetch scope documents

For each URL, call `<CONFLUENCE_PAGE_TOOL>` with `<CONFLUENCE_PAGE_PARAMS>`. Summarize each page in 3–6 sentences, always including: what the document says is in scope, what it explicitly excludes, and any epic or feature names it uses. If a fetch fails, keep the entry in `sources` and render `_Fetch failed: <error>_` as its summary. Never abort the whole run over one page.

## Step 5 — Synthesize

For each epic write:
- **Scope:** 2–3 sentences from the epic description plus any scope-doc passage that names the epic. If the epic has no description and no scope-doc passage, write `Scope: (no description on the epic; inferred from children) <one sentence>` and add `Gaps noted: epic has no description.`
- **Deliverables:** every child as `- <KEY> — <summary> [<status>]`, subtasks indented one level under their story.
- **Dependencies:** epic-level `issuelinks` and any child link whose target lies outside this epic, as `<relationship> <KEY> (<summary>) [<status>]`.
- **Gaps noted:** one line, or omit the line. Note when children's summaries contradict the scope statement, when a scope doc excludes something a child asks for, or when the epic has no children.

Then assemble the document exactly in this shape. Every section is present; empty lists render `_None._`. No emoji or glyphs.

```markdown
---
project: <project_key>
project_name: <project_name>
generated_at: <ISO-8601 UTC, e.g. 2026-08-28T15:04:00Z>
generated_by: /pell:scope
issues: <count fetched>
truncated: <true|false>
sow_sources:
  - <url>
---
# <project_name> (<project_key>) — Statement of Work (synthesized)

> Working picture assembled from Jira and <n> Confluence page(s). Not a contract. Rebuild with `/pell:scope <project_key> refresh`.

## Purpose
<2–4 sentences: what the project delivers and for whom, from the scope docs and the epics taken together>

## Scope statements (authoritative sources)
- [<title>](<url>) — <3–6 sentence summary; explicit exclusions called out>

## Epics
### <EPIC-KEY> — <summary> [<status>] <done>/<total> done
Scope: <2–3 sentences>
Deliverables:
- <KEY> — <summary> [<status>]
Dependencies: <list or _None._>
Gaps noted: <line, or omit>

## Unparented work
- <KEY> — <summary> [<status>]

## Cross-epic dependencies
- <EPIC-A> <relationship> <EPIC-B or KEY> (<summary>) — [<status>]

## Out of scope / deferred
- <KEY> — <summary> [<resolution or status>]
- Per <scope doc title>: "<quoted exclusion>"

## Stats
<issues> issues · <epics> epics · <unparented> unparented · <dropped> dropped · <scope_docs> scope doc(s)<; truncated at 10 pages when applicable>
```

Order epics by status (In Progress, To Do, Done) then key. Do not truncate any list — a developer looking for their epic needs to find it.

## Output format

Return **only** a single JSON object on the last line of your response (after any `verbose` progress lines). The orchestrator parses this:

```json
{"sow_markdown":"<the full document above as one string>","sources":[{"title":"...","url":"...","discovered_via":"pinned|remote-link|search"}],"stats":{"issues":0,"epics":0,"unparented":0,"dropped":0,"scope_docs":0,"truncated":false,"project_name":"..."},"summary":"<one line, e.g. 214 issues across 12 epics, 3 unparented, 1 scope doc>"}
```

If the first JQL call fails, return `{"sow_markdown":"","sources":[],"stats":{"issues":0,"epics":0,"unparented":0,"dropped":0,"scope_docs":0,"truncated":false,"project_name":""},"summary":"Project walk failed: <error>"}`.

Never write files. Never mutate Jira or Confluence.
````

- [ ] **Step 3: Validate**

Run: `claude plugin validate ./plugins/pell`
Expected: PASS.

- [ ] **Step 4: Self-check against spec §9–§10**

Confirm: the JQL, `fields`, and `maxResults` match §9 step 1 and Task 1's verified schema; the three discovery sources (pinned, remote-link, search) are all present; the document shape has every §10 section including frontmatter keys `project, project_name, generated_at, generated_by, issues, truncated, sow_sources`; the trailing-JSON contract has `sow_markdown, sources, stats, summary`; there is no `tools:` line in the frontmatter; the Confluence tool name is the one Task 1 verified, not a guess.

- [ ] **Step 5: Commit**

```bash
git add plugins/pell/agents/sow-builder.md
git commit -m "feat(scope): add sow-builder agent that synthesizes a project SOW from Jira + Confluence

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: `/pell:scope` — frontmatter, arg parsing, cloudId, cache lifecycle (§1–§5)

**Files:**
- Create: `plugins/pell/commands/scope.md`
- Reference (copy patterns, do not modify): `plugins/pell/commands/related.md` (Step 1 branch auto-detect wording, Step 2 cloudId wording), `plugins/pell/commands/precheck.md` (Step 1 modifier-stripping style)

**Interfaces:**
- Consumes: `sow-builder` dispatch contract from Task 2 (labeled input lines; JSON with `sow_markdown`, `stats`).
- Produces: the variables later steps use — `mode` (`ticket|project`), `ticket_key`, `project_key`, `modifiers` (`refresh, deep, skip_comment, pinned_sow_url, dry_run, verbose`), `cloudId`, `sow_path`, `sow_doc` (the markdown, from disk or fresh), `sow_frontmatter` (`generated_at`, `sow_sources`), `drift_line`.

- [ ] **Step 1: Invoke `superpowers:writing-skills`; read the reference commands**

Call the Skill tool with `superpowers:writing-skills` (notify-don't-force). Read `plugins/pell/commands/related.md` Steps 1–2 for the exact branch-detect and cloudId wording.

- [ ] **Step 2: Create `scope.md` with frontmatter + intro + Steps 1–3**

Create `plugins/pell/commands/scope.md` with exactly this content:

````markdown
---
description: Place a Jira ticket in the whole project — builds and caches a synthesized Statement of Work from the project's epics and linked Confluence scope docs, then runs a Definition-of-Ready check on the ticket (description, acceptance criteria, epic fit, unlinked dependencies, sibling overlap). Offers a gated comment listing questions for the reporter. Run with a bare project key to see the project picture.
argument-hint: "[JIRA-KEY | PROJECT-KEY] [refresh | deep | skip comment | sow <confluence-url> | --dry-run | --verbose]"
---

You are running **`/pell:scope`**. Answer two questions about a ticket before anyone starts it: *where does it fit in the whole project?* and *does it have enough information to start?* Read-only against Jira and Confluence. The only writes are the SOW cache file in the repo and an optional Jira comment — each `(y/n)`-gated, both suppressed by `--dry-run`.

The user passed: `$ARGUMENTS`

## Step 1 — Parse arguments

Work through `$ARGUMENTS` in this order. Strip each recognized modifier as you capture it so the key search below sees only what is left.

**Modifiers** (case-insensitive):
- `refresh` → `refresh = true` (rebuild the SOW even if a fresh cache exists)
- `deep` → `deep = true` (lift the 10-page traversal cap)
- `skip comment` → `skip_comment = true`
- `sow <url>` → `pinned_sow_url = <url>` (capture the whole URL token; strip both words)
- `--dry-run` → `dry_run = true`
- `--verbose` → `verbose = true`
- `--reset` → accepted for convention; there is no cached config to clear beyond `jira.cloud_id`, which every Jira command shares. Print `Nothing to reset for /pell:scope.` and continue.

**Mode and keys**, from the remaining text:
1. First match of `\b[A-Z][A-Z0-9]+-\d+\b` → `mode = ticket`, `ticket_key = <match>`, `project_key = <text before the dash>`.
2. Otherwise first match of `\b[A-Z][A-Z0-9]+\b` → `mode = project`, `project_key = <match>`.
3. Otherwise run `git branch --show-current` and match the issue-key regex against it (Pell branches are `<KEY>-<description>`, e.g. `RRS-1020-fix-cart`). On a match, `mode = ticket` as in 1. If the command fails (not a repo, detached HEAD) or nothing matches, exit with: "I need a ticket or project key. Try `/pell:scope RRS-1020`, `/pell:scope RRS`, or run this from a branch named like `RRS-1020-...`."

An explicit key in `$ARGUMENTS` always wins over the branch-detected key.

## Step 2 — Resolve `cloudId`

Read `~/.claude/pell-config.json` (treat missing as `{}`).

- If `jira.cloud_id` is set, use it.
- Otherwise call `mcp__plugin_atlassian_atlassian__getAccessibleAtlassianResources`, use the first result's `id`, write it back atomically to `pell-config.json:jira.cloud_id`.

## Step 3 — Load or build the SOW cache

**Locate.** Run `git rev-parse --show-toplevel`. `sow_path = <toplevel>/docs/pell/sow-<project_key>.md`. If the command fails (not a git repo), use `./docs/pell/sow-<project_key>.md` and print `Not in a git repo — using ./docs/pell/ for the SOW cache.`

**Load.** If `sow_path` exists, read it and parse the YAML frontmatter for `generated_at` and `sow_sources`. If the frontmatter is missing or unparseable, print `SOW cache at <sow_path> has no readable frontmatter — rebuilding.` and treat the file as missing.

**Decide.** Rebuild when any of: the file is missing; `refresh` is set; `generated_at` is more than 14 days before now. Otherwise use the cache.

**Rebuild path.**
1. Print `Building the SOW for <project_key> — walking every issue in the project (up to 10 pages of 100<; cap lifted by "deep" when set>).`
2. Dispatch the `sow-builder` agent via the Agent tool with `subagent_type="sow-builder"` and a prompt containing these labeled lines:
   ```
   cloudId: <cloudId>
   project_key: <project_key>
   sow_sources: [<cached sow_sources, plus pinned_sow_url if set, comma-separated URLs; or empty list>]
   deep: <true|false>
   verbose: <true|false>
   ```
3. Parse the trailing JSON. If `sow_markdown` is empty, exit with `Could not build the SOW: <summary>.`
4. Print the stats line: `<stats.issues> issues · <stats.epics> epics · <stats.unparented> unparented · <stats.scope_docs> scope doc(s)<; truncated at 10 pages — rerun with "deep" for the full project, when stats.truncated>`.
5. Unless `dry_run`: prompt `Write the synthesized SOW to <sow_path>? (y/n)`. On `y`, create `docs/pell/` if needed and write `sow_markdown` to `sow_path`; print `Saved <sow_path>. Commit it with your normal workflow.` On `n`, print `Not saved — using the document for this run only.` When `dry_run`, print `--dry-run: SOW not written.`
6. `sow_doc = sow_markdown`; `drift_line = ""` (a fresh build has no drift).

**Cached path.**
1. `sow_doc` = file contents.
2. Run one drift query: `mcp__plugin_atlassian_atlassian__searchJiraIssuesUsingJql` with `cloudId`, `jql`: `project = "<project_key>" AND updated >= "<generated_at formatted yyyy-MM-dd HH:mm>"`, `fields: ["key"]`, `maxResults: 100`.
3. `drift_line` = `SOW cache is <n> day(s) old; <count> ticket(s) changed since. Say "refresh" to rebuild.` Use `100+` for the count when the response has a `nextPageToken` or returns 100 results. If the query fails: `SOW cache is <n> day(s) old; drift check failed: <error>.` Never abort over drift.

If `mode = project`, skip to Step 7.
````

- [ ] **Step 3: Validate**

Run: `claude plugin validate ./plugins/pell`
Expected: PASS (frontmatter + body are structurally complete even though Steps 4–8 are not yet appended).

- [ ] **Step 4: Self-check against spec §1–§5**

Confirm: modifiers are stripped before key matching (§14 note); the bare-project regex is only tried after the issue regex fails; the three rebuild triggers plus the unparseable-frontmatter case are all present; the cache write is `(y/n)`-gated and `--dry-run` suppresses it; the drift JQL date format is `yyyy-MM-dd HH:mm`; the dispatch prompt's labeled lines match Task 2's input names exactly (`cloudId`, `project_key`, `sow_sources`, `deep`, `verbose`); the command never commits.

- [ ] **Step 5: Commit**

```bash
git add plugins/pell/commands/scope.md
git commit -m "feat(scope): scaffold /pell:scope — args, cloudId, SOW cache lifecycle

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: `/pell:scope` — ticket fetch, placement, rubric, render, gated comment (§6–§8, §11–§12)

**Files:**
- Modify: `plugins/pell/commands/scope.md` (append Steps 4–9)

**Interfaces:**
- Consumes: `mode`, `ticket_key`, `project_key`, `cloudId`, `sow_doc`, `sow_path`, `drift_line`, `skip_comment`, `dry_run` from Task 3.
- Produces: the rendered report; the verdict string `Ready | Ready with questions | Not ready`, which Task 5's `from-ticket` hook reads from the `Verdict:` line.

- [ ] **Step 1: Append Steps 4–6 (fetch, placement, rubric)**

Append to `plugins/pell/commands/scope.md`. If Task 1 found that `addCommentToJiraIssue` has a `contentFormat` parameter, keep the `contentFormat: "markdown"` line in Step 8 below; otherwise delete that line.

````markdown
## Step 4 — Fetch the ticket (ticket mode)

Always fetch live, even when the SOW came from cache, so the assessed ticket is current.

Call `mcp__plugin_atlassian_atlassian__getJiraIssue` with:
- `cloudId`
- `issueIdOrKey`: `ticket_key`
- `fields`: `["summary", "description", "status", "issuetype", "priority", "assignee", "reporter", "labels", "components", "parent", "subtasks", "issuelinks", "created", "updated"]`
- `responseContentFormat`: `"markdown"`

On 404 exit with: "`<ticket_key>` doesn't exist in Jira (or you don't have access)."

Then call `mcp__plugin_atlassian_atlassian__getJiraIssueRemoteIssueLinks` with `cloudId` and `issueIdOrKey: ticket_key`. A 404 or empty response is fine.

Use `assignee.displayName or "unassigned"` and `reporter.displayName or "unknown"` — the MCP sometimes omits `reporter`.

## Step 5 — Place the ticket in the SOW

Work from `sow_doc`:

1. **Parented to an epic.** `parent.key` matches a `### <KEY> —` heading under `## Epics` → that epic is the `home_epic`. Capture its scope statement, deliverables list (the siblings), `<done>/<total>` count, and Dependencies line.
2. **Parented to a story.** `parent.key` appears as a deliverable under some epic → that epic is `home_epic`; record the story as `immediate_parent`. If the story is not in the SOW (created after the cache), treat the ticket as unparented and say `Parent <KEY> is not in the SOW cache — it may be newer than the cache.`
3. **Unparented.** Compare the ticket's summary + description against every epic's scope statement. Exactly one clear fit → `suggested_epic = <KEY>` (a `major` finding in Step 6). No fit → the ticket falls outside every scope statement (a `blocker` finding).
4. **The ticket is an epic.** Skip placement; its own section is the context.

Also collect every line under `## Cross-epic dependencies` that names `ticket_key` or `home_epic`.

## Step 6 — Readiness rubric

Apply every check. Each finding states the evidence (quote the fragment, or name what is absent) and one concrete question the reporter could answer to resolve it. Severity is `blocker / major / minor / nit`.

| Check | Condition | Severity |
|-|-|-|
| Description | absent, or only restates the summary | blocker |
| Placement | no parent and no `suggested_epic` | blocker |
| Placement | no parent but a `suggested_epic` exists | major |
| Acceptance criteria | no testable criteria — no Given/When/Then, no checklist, no "done when" / "acceptance" heading | major |
| Unlinked dependency | the description names a feature, system, or ticket that appears as its own issue in the SOW, and `issuelinks` has no entry to it | major |
| Blocked | an `is blocked by` link whose target status is neither Done nor In Progress | major |
| Sibling overlap | a sibling's summary in `home_epic` covers the same deliverable; before reporting, fetch that sibling with `getJiraIssue` (`fields: ["summary", "description", "status"]`) and confirm the descriptions overlap | major |
| Open questions | description contains `TBD`, `TODO`, a `?` on its own line, "need to confirm", "not sure", or similar | major |
| Out-of-scope conflict | description asks for something a scope statement explicitly excludes | major |
| Size | description enumerates several unrelated deliverables that would each be a story | minor |
| Affected area | no component, no label, and no file, module, or repo named in the description | minor |
| Stale | `updated` more than 90 days ago while `home_epic` is In Progress | nit |

**Verdict:** `Not ready` if any blocker; else `Ready with questions` if any major; else `Ready`. Minor and nit findings render but never change the verdict or trigger the comment offer.
````

- [ ] **Step 2: Append Steps 7–9 (render, comment, exit)**

Append to `plugins/pell/commands/scope.md`:

````markdown
## Step 7 — Render

**Ticket mode:**

```
## <ticket_key> — <summary>

**Status:** <status.name>  ·  **Type:** <issuetype.name>  ·  **Priority:** <priority.name or —>
**Assignee:** <assignee>  ·  **Reporter:** <reporter>

### Where it fits
Epic: <home_epic KEY — summary> [<status>] <done>/<total> done        (or: "Unparented — suggested epic: <KEY> — <summary>" / "Unparented — fits no scope statement" / "This ticket is an epic")
Parent story: <immediate_parent KEY — summary> [<status>]              (omit when none)
Scope: <home_epic scope statement>
Siblings: <n> To Do · <n> In Progress · <n> Done                       (omit when unparented)
Dependencies: <cross-epic lines touching this ticket or its epic, or _None._>
Scope docs: [<title>](<url>) · ...                                     (from the SOW's Scope statements section, or _None._)

### Readiness
Verdict: <Ready | Ready with questions | Not ready>

#### Blockers
- <finding>. <evidence>.
  Question: <question for the reporter>
_None._ when empty

#### Major
(same shape)

#### Minor
(same shape; no Question line required)

#### Nits
(same shape; no Question line required)

<drift_line, when non-empty>
```

**Project mode:**

```
## <project_name> (<project_key>) — scope summary

| Epic | Status | Done | Gaps |
|-|-|-|-|
| <KEY> <summary> | <status> | <done>/<total> | <Gaps noted text, or —> |

Unparented: <n>  ·  Dropped: <n>  ·  Cross-epic deps: <n>  ·  Scope docs: <n>
Full document: <sow_path>
<drift_line, when non-empty>
```

Render every epic — never truncate the table. Plain text only; no emoji or glyphs.

## Step 8 — Offer the comment (ticket mode)

Skip this step when `mode = project`, when `skip_comment` is set, when `dry_run` is set (print `--dry-run: comment not offered.`), or when the verdict is `Ready`.

Compose the comment from the blocker and major findings, in the order rendered, as numbered questions. No severities, no verdict, no lecture:

```
Scope check before starting work on this ticket — a few questions:

1. <question from finding 1>
2. <question from finding 2>

Posted from /pell:scope.
```

Show the full comment text, then prompt: `Post this comment on <ticket_key>? (y/n)`.

On `y`: call `mcp__plugin_atlassian_atlassian__addCommentToJiraIssue` with `cloudId`, `issueIdOrKey: ticket_key`, `contentFormat: "markdown"`, `commentBody: <the text above>`. Print `Commented.` or `Comment failed: <error>`.

On `n`: print `Not posted.`

## Step 9 — Exit

End the response. Do not transition the ticket, edit fields, link issues, or commit the cache file. If the user wants to act, they can run `/pell:from-ticket <ticket_key>` or `/pell:start-work <ticket_key>`.

## Operator notes

- **Read-only** except the two gated writes (cache file, comment). Never commit. Never mutate Jira beyond the comment.
- Strip modifiers before matching keys — `SOW` and `TODO` in freeform text would otherwise match the bare-project regex.
- `searchJiraIssuesUsingJql` returns no total count; the drift line reports `100+` when a page fills rather than guessing.
- When the branch key and an explicit argument disagree, the explicit argument wins and its project's cache is used or built.
- The rubric's "unlinked dependency" and "sibling overlap" checks depend on the SOW being reasonably current; when `drift_line` reports many changes, say so next to those findings.
- Large projects: the first build can take a while. Say what is happening before dispatching `sow-builder`; do not sit silent.
````

- [ ] **Step 3: Validate + line count**

Run: `claude plugin validate ./plugins/pell`
Expected: PASS.
Run: `wc -l plugins/pell/commands/scope.md`
Expected: roughly 150–190 lines. The render templates and the rubric table account for the length; this is sequential single-purpose content, not duplicated logic. Do not extract a sub-agent to hit a number.

- [ ] **Step 4: Self-check against spec §6–§8, §11–§12**

Confirm: `getJiraIssue` fields match §6 exactly; the four placement cases (epic parent, story parent, unparented, is-epic) are all present; all twelve rubric rows are present with the §8 severities; the verdict rule is blocker → `Not ready`, major → `Ready with questions`; the sibling-overlap row confirms via a live fetch; the comment is offered only for `Ready with questions` / `Not ready` and not under `skip comment` or `--dry-run`; the comment text has no severities or verdict; the exit step forbids transitions/edits/links/commits; no emoji anywhere.

- [ ] **Step 5: Commit**

```bash
git add plugins/pell/commands/scope.md
git commit -m "feat(scope): add ticket placement, readiness rubric, render, and gated comment

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: Hook `/pell:scope` into `/pell:from-ticket` (§13)

**Files:**
- Modify: `plugins/pell/commands/from-ticket.md` — frontmatter `argument-hint` (line 3), Step 1 skip flags (lines 12–17), new Step 2.5 inserted before `## Step 3 — Existing-artifact detection` (line 66), Step 5 seed block (lines 137–165)

**Interfaces:**
- Consumes: `/pell:scope <KEY> skip comment [--verbose]` from Tasks 3–4; reads the `Verdict:` line and the `### Where it fits` / `### Readiness` blocks from its output.
- Produces: a `## Project context` block in the brainstorming seed.

- [ ] **Step 1: Invoke `superpowers:writing-skills`; read the current file**

Call the Skill tool with `superpowers:writing-skills` (notify-don't-force). Read `plugins/pell/commands/from-ticket.md` in full (about 250 lines) so the edits below anchor on exact current text.

- [ ] **Step 2: Add `skip scope` to the frontmatter and Step 1**

Edit line 3 — replace:

```
argument-hint: "<JIRA-KEY> [skip start-work | design only | plan only | start-work pre-auths | --reset] [freeform]"
```

with:

```
argument-hint: "<JIRA-KEY> [skip start-work | skip scope | design only | plan only | start-work pre-auths | --reset] [freeform]"
```

In Step 1's **Skip flags** list, insert after the `skip start-work` bullet:

```
  - `skip scope` / `no scope check` → skip Step 2.5 (the `/pell:scope` readiness check)
```

- [ ] **Step 3: Insert Step 2.5**

Insert this block immediately before the line `## Step 3 — Existing-artifact detection`:

````markdown
## Step 2.5 — Readiness check via `/pell:scope`

Skip this step when `skip scope` / `no scope check` was in `$ARGUMENTS`.

Print one line: `Checking where <KEY> fits in the project...`

Invoke `/pell:scope <KEY> skip comment` (append `--verbose` if the user passed it). The comment is suppressed here because `from-ticket` is about to start design work; the developer can run `/pell:scope <KEY>` on its own to post questions to the reporter. `scope` may prompt `(y/n)` to write its SOW cache — that prompt is its own and passes through.

Read the `Verdict:` line from its output:

- `Not ready` → prompt: "This ticket has <n> blocker gap(s) — see above. Continue into design anyway? (y/n)". On `n`, exit with: "Stopping. Run `/pell:scope <KEY>` to post the questions on the ticket, then re-run `/pell:from-ticket <KEY>` once it's answered." On `y`, continue.
- `Ready with questions` → continue without prompting; the findings are on screen and feed the brainstorming seed.
- `Ready` → continue.

Capture the `### Where it fits` and `### Readiness` blocks verbatim as `project_context` for Step 5's seed. If `/pell:scope` itself fails (MCP error, no cache and the build failed), print `Scope check unavailable: <error> — continuing without project context.`, set `project_context` to that line, and continue. The readiness check never blocks `from-ticket` on its own errors.
````

- [ ] **Step 4: Add the `## Project context` block to the Step 5 seed**

In Step 5's seed (the fenced block beginning `Design implementation of <KEY>: <summary>`), insert this after the `External links:` sub-list (the last bullet group under `Connections:`) and before the line `Save the design spec to docs/superpowers/specs/...`:

```
Project context (from /pell:scope; omit this section when Step 2.5 was skipped):
<project_context — the "Where it fits" and "Readiness" blocks verbatim>
```

Also add to Step 6's inline-substitute starter spec, after the `## Connections` section:

```
## Project context
<project_context, or "(scope check skipped)">
```

- [ ] **Step 5: Add an operator note**

In `## Operator notes`, append:

```
- The Step 2.5 readiness check is advisory. Only a `Not ready` verdict prompts; everything else flows into the brainstorming seed. `skip scope` bypasses it entirely.
```

- [ ] **Step 6: Validate**

Run: `claude plugin validate ./plugins/pell`
Expected: PASS.

- [ ] **Step 7: Self-check against spec §13**

Confirm: the hook runs after the ticket fetch and before existing-artifact detection; `skip comment` is always passed; only `Not ready` prompts; `Ready with questions` continues silently; the project context reaches both the brainstorming seed and the inline-substitute spec; `start-work` was not modified.

- [ ] **Step 8: Commit**

```bash
git add plugins/pell/commands/from-ticket.md
git commit -m "feat(from-ticket): run /pell:scope readiness check before design

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 6: Version bump, READMEs, architecture spec status

**Files:**
- Modify: `plugins/pell/.claude-plugin/plugin.json` (line 3)
- Modify: `plugins/pell/README.md` (Jira ops table ~line 52; Agents section ~line 75)
- Modify: `README.md` (command count line 88; Starting-work row line 93; new `### /pell:scope` section before `### /pell:start-work <KEY>`; `from-ticket` section — anchor on heading text, not line numbers)
- Modify: `docs/specs/2026-05-27-pell-skills-architecture.md` (§12 line 324)

- [ ] **Step 1: Bump the version**

In `plugins/pell/.claude-plugin/plugin.json` change `"version": "0.12.0"` to `"version": "0.14.0"`. Without this the installed cache never rebuilds and nobody sees the new command.

- [ ] **Step 2: Plugin README**

In `plugins/pell/README.md`, in the `### Jira ops` table, insert after the `/pell:precheck` row:

```
| `/pell:scope [KEY \| PROJECT]` | Place a ticket in a synthesized project SOW (cached at `docs/pell/sow-<PROJECT>.md`) and run a Definition-of-Ready check. Gated "questions for the reporter" comment. Read-only by default. |
```

In `## Agents (composable building blocks)`, after the repo-based reviewers bullet, add:

```
Project scoper (dispatched by `/pell:scope` when the SOW cache is missing or stale):

- `sow-builder` — returns `{sow_markdown, sources, stats, summary}` rather than findings; it produces a document, not a review.
```

- [ ] **Step 3: Root README — count and index**

Line 88: change `Twenty commands.` to `Twenty-one commands.`

Line 93 (Starting work row): insert `[`scope`](#pellscope-key--project-key)` between the `precheck` and `start-work` entries so the row reads:

```
| **Starting work** | [`my-tickets`](#pellmy-tickets) · [`triage`](#pelltriage-key) · [`related`](#pellrelated-key) · [`precheck`](#pellprecheck-key--idea) · [`scope`](#pellscope-key--project-key) · [`start-work`](#pellstart-work-key) · [`from-ticket`](#pellfrom-ticket-jira-key-freeform-context) |
```

- [ ] **Step 4: Root README — per-command section**

Insert immediately before `### \`/pell:start-work <KEY>\``:

````markdown
### `/pell:scope [KEY | PROJECT-KEY]`

Before anyone starts a ticket, see where it fits in the whole project and whether it has enough information to begin. `scope` builds a synthesized **Statement of Work** for the Jira project — every epic's scope statement, deliverables, dependencies, and gaps, folding in any Confluence scope documents it finds — and caches it in the repo at `docs/pell/sow-<PROJECT>.md` so every developer and every Claude session shares one picture. Given a ticket, it places the ticket in that picture and runs a Definition-of-Ready rubric: description, acceptance criteria, epic fit, unlinked dependencies, sibling overlap, open questions. Verdict is **Ready / Ready with questions / Not ready**.

**Usage:**

```
/pell:scope RRS-1020                          # place the ticket, run the readiness check
/pell:scope RRS-1020 skip comment             # never offer the Jira comment
/pell:scope RRS                               # project picture only — epic table, gaps, drift
/pell:scope RRS refresh                       # rebuild the SOW cache now
/pell:scope RRS sow https://.../wiki/...      # pin a Confluence page as an authoritative scope source
/pell:scope RRS-1020 --dry-run                # no cache write, no comment offer
/pell:scope                                   # ticket key from the current branch
```

**Output:** "Where it fits" (home epic, scope statement, sibling status counts, cross-epic dependencies, scope docs), then findings by severity (`blocker / major / minor / nit`) and a verdict. A drift line reports how many tickets changed since the cache was built; the cache rebuilds automatically after 14 days.

**Side-effects:** writing the SOW cache file (`(y/n)`-gated; never committed for you) and, when the verdict isn't `Ready`, a comment on the ticket phrased as numbered questions to the reporter (`(y/n)`-gated, full text shown first). Never transitions, edits fields, or links issues. `/pell:from-ticket` runs this check automatically with the comment suppressed; pass `skip scope` to bypass.

````

- [ ] **Step 5: Root README — from-ticket section**

In `### \`/pell:from-ticket <JIRA-KEY> [freeform context]\``, change the first paragraph's clause `fetches the Jira ticket and its connections, creates a branch via `/pell:start-work`` to `fetches the Jira ticket and its connections, runs the `/pell:scope` readiness check, creates a branch via `/pell:start-work``. Add `/pell:from-ticket RRS-1020 skip scope       # bypass the readiness check` to its usage block.

- [ ] **Step 6: Architecture spec §12**

In `docs/specs/2026-05-27-pell-skills-architecture.md` line 324, change `Jira ops (`my-tickets`, `triage`, `related`, `precheck`, `start-work`, `finish-work`)` to `Jira ops (`my-tickets`, `triage`, `related`, `precheck`, `scope` + its `sow-builder` agent, `start-work`, `finish-work`)`.

- [ ] **Step 7: Validate**

Run: `claude plugin validate ./plugins/pell`
Expected: PASS.
Run: `grep -c "pell:scope" README.md plugins/pell/README.md`
Expected: both non-zero.

- [ ] **Step 8: Commit**

```bash
git add plugins/pell/.claude-plugin/plugin.json plugins/pell/README.md README.md docs/specs/2026-05-27-pell-skills-architecture.md
git commit -m "chore(pell): bump to 0.14.0 and document /pell:scope + sow-builder

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 7: Manual functional verification

No automated harness exists for prompt behavior; this is the real functional test. Requires both Atlassian MCPs connected and a Jira project with at least one epic that has children.

- [ ] **Step 1: Reload the plugin**

In Claude Code: `/plugin marketplace update pell-skills` then `/reload-plugins`. Confirm `/pell:scope` appears in the command list.

- [ ] **Step 2: Project mode, fresh build**

Run `/pell:scope <PROJECT>` in a repo that has no `docs/pell/sow-<PROJECT>.md`.
Expected: the "Building the SOW" line, `sow-builder` runs, a stats line, the `(y/n)` write prompt naming the exact path. Answer `y`. Expected: file exists, frontmatter has `generated_at` and `sow_sources`, every §10 section is present, the project-mode table lists every epic.

- [ ] **Step 3: Project mode, cached**

Run `/pell:scope <PROJECT>` again.
Expected: no build, a drift line of the form `SOW cache is 0 day(s) old; N ticket(s) changed since.`

- [ ] **Step 4: Ticket mode — well-specified ticket**

Pick a ticket with a description, acceptance criteria, and an epic parent. Run `/pell:scope <KEY>`.
Expected: "Where it fits" names the right epic and sibling counts; verdict `Ready` (or only minor/nit findings); no comment offered.

- [ ] **Step 5: Ticket mode — thin ticket**

Pick (or create in a sandbox project) a ticket with a one-line description and no epic. Run `/pell:scope <KEY>`.
Expected: blocker findings for description and placement; verdict `Not ready`; the full comment text is shown as numbered questions; the `(y/n)` prompt names the ticket key. Answer `n`. Expected: `Not posted.` and no Jira change. Run again with `--dry-run`. Expected: `--dry-run: comment not offered.`

- [ ] **Step 6: Ticket mode — `skip comment` and branch detection**

Check out a branch named `<KEY>-anything`, run `/pell:scope skip comment` with no key. Expected: the key comes from the branch; no comment offer regardless of verdict.

- [ ] **Step 7: `refresh`, `deep`, pinned `sow <url>`**

Run `/pell:scope <PROJECT> refresh sow <a Confluence URL>`. Expected: rebuild, the URL appears in the cache frontmatter `sow_sources` and in the Scope statements section. Run `/pell:scope <PROJECT> refresh deep` on a project with more than 1000 issues if one exists; otherwise confirm the stats line omits the "truncated" clause.

- [ ] **Step 8: `from-ticket` hook**

Run `/pell:from-ticket <thin KEY>`. Expected: `Checking where <KEY> fits in the project...`, the scope report, then the `Continue into design anyway? (y/n)` prompt. Answer `n`; expected exit message pointing to `/pell:scope <KEY>`. Run `/pell:from-ticket <KEY> skip scope`; expected: no scope output, straight to existing-artifact detection.

- [ ] **Step 9: Record results**

Note any deviation from expected in a short list. Fix prompt wording inline where the deviation is a prompt bug; re-run the affected step; commit with `fix(scope): ...`. If a deviation traces back to an MCP schema mismatch, that is a Task 1 miss — fix the prompt and re-verify the schema before committing.

---

## Self-review notes

- **Spec coverage:** §1–§3 → Task 3 Step 2 (Step 1 of the command); §4 → Task 3 (Step 2); §5 → Task 3 (Step 3); §6 → Task 4 (Step 4); §7 → Task 4 (Step 5); §8 → Task 4 (Step 6); §9–§10 → Task 2; §11 → Task 4 (Step 7); §12 → Task 3 cache gate + Task 4 (Step 8); §13 → Task 5; §14 operator notes → Task 4 Step 2 and Task 2; §15 delivery checklist → Tasks 1 (schema verification), 6 (version, READMEs, arch spec), 7 (validate + reload); §16 out-of-scope items have no tasks by design.
- **Placeholders:** the only bracketed substitutions are `<CONFLUENCE_PAGE_TOOL>` / `<CONFLUENCE_PAGE_PARAMS>` in Task 2, which Task 1 resolves before Task 2 runs — the plan says so explicitly rather than guessing a tool name the design session could not verify.
- **Interface consistency:** the agent's input labels (`cloudId`, `project_key`, `sow_sources`, `deep`, `verbose`) match the command's dispatch prompt in Task 3; the agent's JSON keys (`sow_markdown`, `sources`, `stats.{issues,epics,unparented,dropped,scope_docs,truncated,project_name}`, `summary`) match what Task 3 reads; the `Verdict:` line format in Task 4 matches what Task 5 parses; `skip comment` is the same token in Task 3's parser and Task 5's invocation.
- **Convention adherence:** plan saved under `docs/specs/` per repo convention; commits use conventional-commit scopes; validation is `claude plugin validate` + reload + invoke; `writing-skills` is invoked before each authoring task per the repo's standing rule.
