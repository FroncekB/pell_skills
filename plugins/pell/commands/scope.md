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

- If `docs/pell/context.md` names a `cloudId` under its Atlassian site section (Step 3 loads it; repo-scoped, so it wins here), use it.
- Otherwise, if `jira.cloud_id` is set, use it.
- Otherwise call `mcp__plugin_atlassian_atlassian__getAccessibleAtlassianResources`, use the first result's `id`, write it back atomically to `pell-config.json:jira.cloud_id`.

## Step 3 — Load repo context

Run `git rev-parse --show-toplevel`. If it succeeds, read `<toplevel>/docs/pell/context.md` (Read tool). A missing file, unreadable frontmatter, or a `schema:` value other than `1` all mean "no context" — continue without it and say nothing.

When present, treat it as a **coordinate source only**. It holds pointers, not content: never treat its epic lists, page titles, or component names as current truth. Resolve any coordinate in this order:

1. an explicit value in `$ARGUMENTS`
2. `docs/pell/context.md`
3. `~/.claude/pell-config.json`
4. a live MCP lookup
5. prompt the user

Never write to `context.md`. If a live call later contradicts it, use the live value and print one line: `context.md is out of date on <field>. Run /pell:map-repo verify.`

## Step 4 — Load or build the SOW cache

**Locate.** Run `git rev-parse --show-toplevel`. `sow_path = <toplevel>/docs/pell/sow-<project_key>.md`. If the command fails (not a git repo), use `./docs/pell/sow-<project_key>.md` and print `Not in a git repo — using ./docs/pell/ for the SOW cache.`

**Load.** If `sow_path` exists, read it and parse the YAML frontmatter for `generated_at`, `sow_sources`, `project_name`, and `truncated`. If `project_name` is absent, fall back to `project_key`. If the frontmatter is missing or unparseable, print `SOW cache at <sow_path> has no readable frontmatter — rebuilding.` and treat the file as missing.

**Decide.** Rebuild when any of: the file is missing; `refresh` is set; `generated_at` is more than 14 days before now; `pinned_sow_url` is set and is not already listed in the cached `sow_sources` — a pinned URL must never be silently dropped. Otherwise use the cache.

**Rebuild path.**

If the SOW is missing entirely, mention once: `Tip: /pell:map-repo builds this at setup time, so a readiness check never has to wait for it.` Then continue with the build — never block on it.

1. Print `Building the SOW for <project_key> — walking every issue in the project (up to 10 pages of 100<; cap lifted by "deep" when set>).`
2. Dispatch the `sow-builder` agent via the Agent tool with `subagent_type="sow-builder"` and a prompt containing these labeled lines:
   ```
   cloudId: <cloudId>
   project_key: <project_key>
   sow_sources: [<cached sow_sources, plus pinned_sow_url if set, comma-separated URLs; or empty list>]
   deep: <true|false>
   verbose: <true|false>
   ```
3. Parse the trailing JSON. If `sow_markdown` is empty, exit with `Could not build the SOW: <summary>.` Set `project_name = stats.project_name`.
4. Print the stats line: `<stats.issues> issues · <stats.epics> epics · <stats.unparented> unparented · <stats.scope_docs> scope doc(s)<; truncated at 10 pages — rerun with "deep" for the full project, when stats.truncated>`.
5. Unless `dry_run`: prompt `Write the synthesized SOW to <sow_path>? (y/n)`. On `y`, create `docs/pell/` if needed and write `sow_markdown` to `sow_path`; print `Saved <sow_path>. Commit it with your normal workflow.` On `n`, print `Not saved — using the document for this run only.` When `dry_run`, print `--dry-run: SOW not written.`
6. `sow_doc = sow_markdown`; `drift_line = ""` (a fresh build has no drift).

**Cached path.**
1. `sow_doc` = file contents.
2. Run one drift query: `mcp__plugin_atlassian_atlassian__searchJiraIssuesUsingJql` with `cloudId`, `jql`: `project = "<project_key>" AND updated >= "<generated_at formatted yyyy-MM-dd>"`, `fields: ["key"]`, `maxResults: 100`. Day precision is deliberate: `generated_at` is UTC and JQL reads date literals in the user's Jira time zone, so this over-counts changes made earlier on the generation day rather than missing changes across that offset. The drift line is a signal, not a ledger.
3. `drift_line` = `SOW cache is <n> day(s) old; <count> ticket(s) changed since. Say "refresh" to rebuild.` Use `100+` for the count when the response has a `nextPageToken` or returns 100 results. If the query fails: `SOW cache is <n> day(s) old; drift check failed: <error>.` Never abort over drift.

If `mode = project`, skip to Step 8.

## Step 5 — Fetch the ticket (ticket mode)

Always fetch live, even when the SOW came from cache, so the assessed ticket is current.

Call `mcp__plugin_atlassian_atlassian__getJiraIssue` with:
- `cloudId`
- `issueIdOrKey`: `ticket_key`
- `fields`: `["summary", "description", "status", "issuetype", "priority", "assignee", "reporter", "labels", "components", "parent", "subtasks", "issuelinks", "created", "updated"]`
- `responseContentFormat`: `"markdown"`

On 404 exit with: "`<ticket_key>` doesn't exist in Jira (or you don't have access)."

Then call `mcp__plugin_atlassian_atlassian__getJiraIssueRemoteIssueLinks` with `cloudId` and `issueIdOrKey: ticket_key`. A 404 or empty response is fine. Capture each returned link's title and url as `ticket_links` for Step 8.

Use `assignee.displayName or "unassigned"` and `reporter.displayName or "unknown"` — the MCP sometimes omits `reporter`.

## Step 6 — Place the ticket in the SOW

Work from `sow_doc`:

1. **Parented to an epic.** `parent.key` matches a `### <KEY> —` heading under `## Epics` → that epic is the `home_epic`. Capture its scope statement, deliverables list (the siblings), `<done>/<total>` count, and Dependencies line. `placement = assessed`.
2. **Parented to a story.** `parent.key` appears as a deliverable under some epic → that epic is `home_epic`; record the story as `immediate_parent`. `placement = assessed`.
3. **Parent outside the cache.** `parent` is set but its key appears nowhere in `sow_doc` — neither a `### <KEY> —` epic heading nor a deliverable line → `placement = unassessed`, `placement_note = Parent <KEY> is not in the SOW cache — it may be newer than the cache. Say "refresh" to rebuild.`
4. **Project has no epics.** `sow_doc` has no `### ` headings under `## Epics` → `placement = unassessed`, `placement_note = Project has no epics; placement not assessed.` Check this before case 5 — with no epics there is nothing to compare an unparented ticket against.
5. **Unparented.** No `parent`, epics present → compare the ticket's summary + description against every epic's scope statement. Exactly one clear fit → `suggested_epic = <KEY>` (a `major` finding in Step 7). No fit → the ticket falls outside every scope statement (a `blocker` finding). `placement = assessed`.
6. **The ticket is an epic.** Skip placement; its own section is the context. `placement` stays unset and the Placement rubric rows do not apply.

Also collect every line under `## Cross-epic dependencies` that names `ticket_key` or `home_epic`.

## Step 7 — Readiness rubric

Apply every check. Each finding states the evidence (quote the fragment, or name what is absent) and one concrete question the reporter could answer to resolve it. Severity is `blocker / major / minor / nit`.

The two Placement rows apply only when placement was assessed (Step 6 outcomes 1, 2, 5). When placement is unassessed, skip them — a stale cache or an epic-less project is not a defect in the ticket.

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

## Step 8 — Render

**Ticket mode:**

```
## <ticket_key> — <summary>

**Status:** <status.name>  ·  **Type:** <issuetype.name>  ·  **Priority:** <priority.name or —>
**Assignee:** <assignee>  ·  **Reporter:** <reporter>

### Where it fits
Epic: <home_epic KEY — summary> [<status>] <done>/<total> done        (or: "Unparented — suggested epic: <KEY> — <summary>" / "Unparented — fits no scope statement" / "This ticket is an epic" / "<placement_note>" when placement is unassessed)
Parent story: <immediate_parent KEY — summary> [<status>]              (omit when none)
Scope: <home_epic scope statement>                                     (omit when placement is unassessed or the ticket is an epic)
Siblings: <n> To Do · <n> In Progress · <n> Done                       (omit when unparented, unassessed, or the ticket is an epic)
Dependencies: <cross-epic lines touching this ticket or its epic, or _None._>
Scope docs: [<title>](<url>) · ...                                     (from the SOW's Scope statements section, or _None._)
Ticket links: [<title>](<url>) · ...                                       (from ticket_links; omit when none)

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

## Step 9 — Offer the comment (ticket mode)

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

## Step 10 — Exit

End the response. Do not transition the ticket, edit fields, link issues, or commit the cache file. If the user wants to act, they can run `/pell:from-ticket <ticket_key>` or `/pell:start-work <ticket_key>`.

## Operator notes

- **Read-only** except the two gated writes (cache file, comment). Never commit. Never mutate Jira beyond the comment.
- Strip modifiers before matching keys — `SOW` and `TODO` in freeform text would otherwise match the bare-project regex.
- `searchJiraIssuesUsingJql` returns no total count; the drift line reports `100+` when a page fills rather than guessing.
- When the branch key and an explicit argument disagree, the explicit argument wins and its project's cache is used or built.
- The rubric's "unlinked dependency" and "sibling overlap" checks depend on the SOW being reasonably current; when `drift_line` reports many changes, say so next to those findings.
- Large projects: the first build can take a while. Say what is happening before dispatching `sow-builder`; do not sit silent.
