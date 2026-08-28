# `/pell:scope` — Design Spec

**Status:** approved
**Author:** Brandon Froncek + Claude
**Date:** 2026-08-28
**Parent spec:** [`2026-05-27-pell-skills-architecture.md`](2026-05-27-pell-skills-architecture.md)

## Purpose

`/pell:scope` answers two questions a developer (or a Claude session) should ask before picking up a ticket: *where does this ticket fit in the whole project?* and *does it have enough information to start?*

Today the toolkit reads tickets one at a time. `related` walks one ticket's links; `precheck` looks for duplicates; `from-ticket` fetches the ticket and starts designing. None of them builds a project-level picture, so a session picking up `RRS-1020` has no idea that it is one of nine deliverables in the checkout-redesign epic, that a sibling ticket already covers half of it, or that the epic's Confluence scope statement excludes what the ticket asks for.

`scope` fixes that in two parts:

1. **A synthesized Statement of Work.** A `sow-builder` agent walks every issue in the Jira project, folds in any linked Confluence scope documents, and produces a per-epic scope statement with deliverables, dependencies, and status. The result is cached in the target repo at `docs/pell/sow-<PROJECT>.md` so every developer and every session shares one picture.
2. **A readiness check.** Given a ticket, the command places it in the SOW and runs a Definition-of-Ready rubric against it — description, acceptance criteria, epic placement, unlinked dependencies, sibling overlap, open questions — and renders findings with severities and a verdict.

When a ticket is under-specified, the command offers (gated) to post a comment on the ticket phrased as numbered questions to the reporter. `from-ticket` runs the check automatically so any session that starts from a ticket gets the project context for free.

It is **read-only against Jira and Confluence**. The only writes are the SOW cache file and the optional comment, each `(y/n)`-gated.

## 1. Invocation

```
/pell:scope [JIRA-KEY | PROJECT-KEY] [modifiers]
```

Two argument shapes select two modes:

| Argument | Regex | Mode |
|-|-|-|
| `RRS-1020` | `\b[A-Z][A-Z0-9]+-\d+\b` | **Ticket mode** — build/load SOW, place the ticket, run the rubric, offer the comment |
| `RRS` | `\b[A-Z][A-Z0-9]+\b` (no `-\d+`) | **Project mode** — build/load SOW, render the project summary. No ticket, no comment |
| *(none)* | | Auto-detect the ticket key from `git branch --show-current` (Pell branches are `<KEY>-<description>`). If that fails, exit with a usage message |

Freeform modifiers, case-insensitive, stripped before key detection:

| Modifier | Effect |
|-|-|
| `refresh` | Rebuild the SOW even if a fresh cache exists |
| `deep` | Lift the 10-page (1000-issue) traversal cap in `sow-builder` |
| `skip comment` | Never offer the Jira comment (used by `from-ticket`) |
| `sow <url>` | Pin a Confluence page as an authoritative scope source; persisted in the cache frontmatter |
| `--dry-run` | Render everything; skip the cache write and the comment |
| `--verbose` | Show the per-page traversal progress and every discovered Confluence source |

Examples:

```
/pell:scope RRS-1020
/pell:scope RRS-1020 skip comment
/pell:scope RRS refresh
/pell:scope RRS sow https://pell.atlassian.net/wiki/spaces/RRS/pages/123/SOW
/pell:scope                       # from branch RRS-1020-fix-cart
```

An explicit key in `$ARGUMENTS` always wins over the branch-detected key.

## 2. Architecture & flow

```
/pell:scope <KEY>
  ├─ 1. parse args → mode, project, ticket, modifiers
  ├─ 2. resolve cloudId (pell-config.json:jira.cloud_id, else getAccessibleAtlassianResources)
  ├─ 3. load docs/pell/sow-<PROJECT>.md
  │      ├─ missing | refresh | >14 days old  → dispatch sow-builder → (y/n) write cache
  │      └─ present                            → JQL drift count; print drift line
  ├─ 4. [ticket mode] fetch the ticket live
  ├─ 5. [ticket mode] place the ticket in the SOW
  ├─ 6. [ticket mode] readiness rubric → findings + verdict
  ├─ 7. render
  └─ 8. [ticket mode] if blocker/major and not `skip comment` → show comment → (y/n) post
```

The expensive part — walking the whole project — is isolated in the `sow-builder` agent so the orchestrator's context holds only the finished document. Everything else is inline in the command; `from-ticket` composes by invoking `/pell:scope` (architecture spec §4.2), so the readiness logic does not need to be its own agent.

## 3. Argument parsing

1. Strip modifiers from `$ARGUMENTS` (Section 1 table). Capture the `sow <url>` value if present.
2. Search the remainder for an issue key. If found, `mode = ticket`, `ticket_key = <match>`, `project_key = <prefix before the dash>`.
3. Otherwise search for a bare project key. If found, `mode = project`, `project_key = <match>`.
4. Otherwise run `git branch --show-current` and match the issue-key regex. If found, `mode = ticket` as in step 2. If the command fails (not a repo, detached HEAD) or nothing matches, exit with: "I need a ticket or project key. Try `/pell:scope RRS-1020`, `/pell:scope RRS`, or run this from a branch named like `RRS-1020-...`."

## 4. Resolve `cloudId`

Read `~/.claude/pell-config.json` (treat missing as `{}`). If `jira.cloud_id` is set, use it. Otherwise call `mcp__plugin_atlassian_atlassian__getAccessibleAtlassianResources`, use the first result's `id`, and write it back atomically to `pell-config.json:jira.cloud_id`. Identical to every other Jira command in the plugin.

## 5. SOW cache lifecycle

**Location:** `docs/pell/sow-<PROJECT>.md` relative to `git rev-parse --show-toplevel`. Keyed by Jira project because one repo can span several projects. If not in a git repo, fall back to the current working directory and say so.

**Load:** read the file if it exists; parse `generated_at`, `sow_sources`, `project_name`, and `truncated` from its YAML frontmatter. `project_name` falls back to the project key when absent.

**Rebuild triggers** (any one):
- file missing
- `refresh` modifier
- `generated_at` older than 14 days
- frontmatter unparseable (treat as missing; mention it)
- a `sow <url>` pin whose URL is not already in the cached `sow_sources` (a pinned URL must never be silently dropped)

**Rebuild:** dispatch `sow-builder` (Section 9) with `cloudId`, `project_key`, `sow_sources` (cached plus any newly pinned URL), and `deep` if set. On return, show the stats line (`<n> issues, <e> epics, <u> unparented, <s> scope docs`) and prompt:

> Write the synthesized SOW to `docs/pell/sow-RRS.md`? (y/n)

On `y`, write the file (create `docs/pell/` if needed). On `n` or `--dry-run`, keep the document in memory for this run only and note that it was not saved. The command never commits; the developer commits the file with their normal workflow.

**Fresh cache — drift line:** when the cache is used as-is, run one cheap JQL to report how stale it is:

- `mcp__plugin_atlassian_atlassian__searchJiraIssuesUsingJql` with `cloudId`, `jql: project = "<PROJECT>" AND updated >= "<generated_at as yyyy-MM-dd>"`, `fields: ["key"]`, `maxResults: 100`. Day precision is deliberate: `generated_at` is UTC and JQL reads date literals in the user's Jira time zone, so this over-counts changes made earlier on the generation day rather than missing changes across that offset. The drift line is a signal, not a ledger.
- Render: `SOW cache is 3 days old; 12 tickets changed since. Say "refresh" to rebuild.` If the result fills a page, say `100+ tickets changed`. If the call fails, render `SOW cache is 3 days old; drift check failed: <error>.` and continue.

Incremental patching of the synthesized document is deliberately not attempted — re-synthesizing one epic's scope statement from a partial delta is unreliable from a prompt. Full rebuilds are cheap enough at the 14-day cadence, and the drift line lets the developer decide.

## 6. Fetch the ticket (ticket mode)

Always fetched live, even when the SOW is cached, so the assessed ticket is current.

`mcp__plugin_atlassian_atlassian__getJiraIssue` with:
- `cloudId`
- `issueIdOrKey`: `ticket_key`
- `fields`: `["summary", "description", "status", "issuetype", "priority", "assignee", "reporter", "labels", "components", "parent", "subtasks", "issuelinks", "created", "updated"]`
- `responseContentFormat`: `"markdown"`

On 404 exit with: "`<ticket_key>` doesn't exist in Jira (or you don't have access)."

Then `mcp__plugin_atlassian_atlassian__getJiraIssueRemoteIssueLinks` with `cloudId` and `issueIdOrKey`. Empty or 404 is fine. Each returned link's title and url is captured as `ticket_links` and rendered on the `Ticket links:` line (Section 11).

## 7. Placement (ticket mode)

Locate the ticket in the SOW:

1. **Parented to an epic.** If `parent` is set and that key is a `### <KEY> —` epic heading in the SOW, the ticket's *home epic* is that epic. Pull the epic's scope statement, its deliverables list (siblings), its done/total count, and its dependencies. `placement = assessed`.
2. **Parented to a story.** If `parent` appears as a deliverable under some epic, that epic is the home epic and the story is the immediate parent. No extra Jira call is needed. `placement = assessed`.
3. **Parent outside the cache.** `parent` is set but its key appears nowhere in the SOW — neither an epic heading nor a deliverable line → `placement = unassessed`, `placement_note = Parent <KEY> is not in the SOW cache — it may be newer than the cache. Say "refresh" to rebuild.` The ticket is not treated as unparented: a cache older than the ticket is a cache problem, not a ticket defect.
4. **Project has no epics.** The SOW has no `### ` headings under `## Epics` → `placement = unassessed`, `placement_note = Project has no epics; placement not assessed.` Checked before outcome 5 — with no epics there is nothing to compare an unparented ticket against.
5. **Unparented.** No `parent`, epics present → compare the ticket's summary + description against every epic's scope statement. If exactly one epic is a clear fit, report it as a *suggested* home epic (severity `major`, Section 8). If none fit, the ticket falls outside every scope statement (severity `blocker`). `placement = assessed`.
6. **Ticket is itself an epic.** Skip placement; treat its own SOW section as the context. `placement` stays unset and the Placement rubric rows do not apply.

Also collect from the SOW's cross-epic dependency section any edge that touches this ticket or its home epic.

## 8. Readiness rubric (ticket mode)

Severity vocabulary mirrors correctness: `blocker / major / minor / nit`. Every finding names the evidence (quote the description fragment, or state what is absent) and one concrete question the reporter could answer to resolve it.

The two Placement rows apply only when placement was assessed (Section 7 outcomes 1, 2, 5). When placement is unassessed, skip them — a stale cache or an epic-less project is not a defect in the ticket.

| Check | Condition | Severity |
|-|-|-|
| Description | absent, or only restates the summary | blocker |
| Placement | no parent and fits no scope statement | blocker |
| Placement | no parent but one epic clearly fits | major |
| Acceptance criteria | no testable criteria — no Given/When/Then, no checklist, no "done when" | major |
| Unlinked dependency | description names a feature, system, or ticket that exists as its own Jira issue in the SOW, with no `issuelinks` entry to it | major |
| Blocked | an `is blocked by` link whose target is neither Done nor In Progress | major |
| Sibling overlap | a sibling in the home epic has a summary that covers the same deliverable; confirm by fetching that sibling live (`getJiraIssue`, fields `summary, description, status`) before reporting | major |
| Open questions | description contains `TBD`, `TODO`, `?` on its own line, "need to confirm", "not sure", or similar | major |
| Out-of-scope conflict | description asks for something a scope statement explicitly excludes | major |
| Size | description enumerates several unrelated deliverables that would each be a story | minor |
| Affected area | no component, no label, and no file/module/repo named in the description | minor |
| Stale | not updated in 90+ days while its epic is In Progress | nit |

**Verdict:**
- `Not ready` — any blocker
- `Ready with questions` — no blocker, one or more major
- `Ready` — nothing above minor

Minor and nit findings are always rendered but never change the verdict or trigger the comment offer.

## 9. `sow-builder` agent

**File:** `plugins/pell/agents/sow-builder.md`. Frontmatter `name: sow-builder`, `model: inherit`, no `tools:` line (inherits MCP tools).

**Input (in the dispatching prompt):** `cloudId`, `project_key`, `sow_sources` (list of Confluence URLs, possibly empty), `deep` flag, `verbose` flag.

**Traversal:**

1. `mcp__plugin_atlassian_atlassian__searchJiraIssuesUsingJql` with `jql: project = "<PROJECT>" ORDER BY issuetype ASC, created ASC`, `fields: ["summary", "description", "status", "issuetype", "priority", "parent", "issuelinks", "labels", "components", "resolution", "updated"]`, `maxResults: 100`, following `nextPageToken` until exhausted or 10 pages (unless `deep`). If capped, record `truncated: true` and the count fetched. If a page after the first fails, stop walking, set `truncated: true`, add `walk stopped at page <n>: <error>` to the Stats section, and synthesize from what was fetched.
2. Group issues: epics; children by `parent`; unparented non-epics; issues whose `resolution` or status category or labels indicate dropped work (`Won't Do`, `Cancelled`, `wontfix`, `deferred`, `out-of-scope`).
3. **Scope-doc discovery.** Union of:
   - `sow_sources` passed in
   - `mcp__plugin_atlassian_atlassian__getJiraIssueRemoteIssueLinks` on each epic; keep links whose URL is a Confluence page
   - `mcp__plugin_atlassian_atlassian__search` with `query: "<project name> statement of work OR scope OR SOW"`, keeping only Confluence results in the project's space or whose title mentions the project
4. Fetch each discovered page via `mcp__plugin_atlassian_atlassian__getConfluencePage` with `cloudId`, `pageId`, `contentFormat: "markdown"` (verified 2026-08-28). The tool takes no URL: `pageId` is the numeric segment after `/pages/` in a standard Confluence URL, or the code after `/wiki/x/` in a tiny link. A URL that fits neither shape is an unresolvable source — degrade it as a fetch failure rather than guess. Record each page's title, URL, and a 3–6 sentence summary of its scope/exclusions.
5. **Synthesize** per epic: a 2–3 sentence scope statement from the epic description plus any scope-doc passage that names the epic; the deliverables list with status; epic-level dependencies from `issuelinks`; a "gaps noted" line when the epic has no description or its children's summaries contradict the scope statement.

**Output (trailing JSON):**

```json
{
  "sow_markdown": "<full document, Section 10 shape>",
  "sources": [{"title": "...", "url": "...", "discovered_via": "remote-link | search | pinned"}],
  "stats": {"issues": 0, "epics": 0, "unparented": 0, "dropped": 0, "scope_docs": 0, "truncated": false},
  "summary": "one line"
}
```

Any MCP failure inside the agent degrades that section (`_Scope-doc fetch failed: <error>_`) rather than aborting; the agent returns a document whenever the first JQL page succeeds. A first-page failure returns the failure JSON described in the output contract.

## 10. SOW document shape

```markdown
---
project: RRS
project_name: Retail Rewards System
generated_at: 2026-08-28T15:04:00Z
generated_by: /pell:scope
issues: 214
truncated: false
sow_sources:
  - https://pell.atlassian.net/wiki/spaces/RRS/pages/123/Statement-of-Work
---
# Retail Rewards System (RRS) — Statement of Work (synthesized)

> Working picture assembled from Jira and 1 Confluence page. Not a contract. Rebuild with `/pell:scope RRS refresh`.

## Purpose
<2–4 sentences: what the project delivers and for whom, from the project description and scope docs>

## Scope statements (authoritative sources)
- [Statement of Work](https://...) — <3–6 sentence summary; explicit exclusions called out>

## Epics
### RRS-900 — Checkout redesign [In Progress] 4/9 done
Scope: <2–3 sentences>
Deliverables:
- RRS-1020 — Fix cart total rounding [To Do]
- RRS-1021 — Coupon stacking rules [Done]
Dependencies: is blocked by RRS-850 (Payment gateway v2) [In Progress]
Gaps noted: <or omit the line>

### RRS-901 — ...

## Unparented work
- RRS-1040 — Export loyalty report [To Do]
_None._ when empty

## Cross-epic dependencies
- RRS-900 is blocked by RRS-850 (Payments) — RRS-850 [In Progress]
_None._ when empty

## Out of scope / deferred
- RRS-777 — SMS receipts [Won't Do]
- Per SOW: "mobile app changes are excluded from this engagement"
_None._ when empty

## Stats
214 issues · 12 epics · 3 unparented · 5 dropped · 1 scope doc
```

Every section is always present; empty sections render `_None._`. No emoji or glyphs.

## 11. Render

**Ticket mode:**

```
## RRS-1020 — Fix cart total rounding

**Status:** To Do  ·  **Type:** Story  ·  **Priority:** High
**Assignee:** unassigned  ·  **Reporter:** J. Smith

### Where it fits
Epic: RRS-900 — Checkout redesign [In Progress] 4/9 done
Scope: <epic scope statement>
Siblings: 2 To Do · 3 In Progress · 4 Done
Dependencies: RRS-900 is blocked by RRS-850 (Payments) [In Progress]
Scope docs: [Statement of Work](...)
Ticket links: [PR 412 cart rounding](...)

### Readiness
Verdict: Ready with questions

#### Blockers
_None._

#### Major
- No acceptance criteria. The description says what to change but not how to verify it.
  Question: what totals should the cart show for the three rounding cases in the SOW's pricing table?
- Unlinked dependency: the description references "the new tax service" (RRS-955, In Progress) with no issue link.
  Question: does this ticket wait on RRS-955, or should it work against the current tax service?

#### Minor
- No component set.

#### Nits
_None._

SOW cache is 3 days old; 12 tickets changed since. Say "refresh" to rebuild.
```

The `Epic:` line has four alternative forms when there is no home epic: `Unparented — suggested epic: <KEY> — <summary>`, `Unparented — fits no scope statement`, `This ticket is an epic`, and `<placement_note>` when placement is unassessed (Section 7 outcomes 3 and 4). `Ticket links:` renders the remote links captured in Section 6 and is omitted when there are none.

**Project mode:**

```
## Retail Rewards System (RRS) — scope summary

| Epic | Status | Done | Gaps |
|-|-|-|-|
| RRS-900 Checkout redesign | In Progress | 4/9 | — |
| RRS-901 Loyalty tiers | To Do | 0/6 | no description |

Unparented: 3  ·  Dropped: 5  ·  Cross-epic deps: 2  ·  Scope docs: 1
Full document: docs/pell/sow-RRS.md
SOW cache is 3 days old; 12 tickets changed since. Say "refresh" to rebuild.
```

## 12. Side effects

| Write | When | Gate |
|-|-|-|
| `docs/pell/sow-<PROJECT>.md` | on rebuild | `Write the synthesized SOW to <path>? (y/n)` |
| Jira comment on the ticket | ticket mode, verdict is `Not ready` or `Ready with questions`, `skip comment` not set | show the full comment text, then `Post this comment on <KEY>? (y/n)` |
| `git commit` of `docs/pell/sow-<PROJECT>.md` | `from-ticket` Step 2.5 only — `/pell:scope` just saved the cache and `start-work` is about to run | prompt names the file and the current branch; `(y/n)` |

`/pell:scope` itself still never commits: it saves the cache and tells the developer to commit it with their normal workflow. The commit row belongs to `from-ticket`, which needs a clean tree for `/pell:start-work`.

**Comment text.** Questions to the reporter, one per blocker/major finding, in the order rendered. No severities, no verdict, no lecture:

```
Scope check before starting work on this ticket — a few questions:

1. What totals should the cart show for the three rounding cases in the SOW's pricing table?
2. Does this ticket wait on RRS-955 (new tax service), or should it work against the current one?

Posted from /pell:scope.
```

Post via `mcp__plugin_atlassian_atlassian__addCommentToJiraIssue` with `cloudId`, `issueIdOrKey`, `contentFormat: "markdown"`, `commentBody`. (`contentFormat` verified present, enum `markdown | adf`; without it the server default is unstated and the numbered list may not render.) Render `Commented.` or `Comment failed: <error>`. Never transition, edit fields, or link issues. `--dry-run` suppresses both writes and says so.

## 13. `from-ticket` integration

Add a step to `plugins/pell/commands/from-ticket.md` between its ticket fetch (Step 2) and existing-artifact detection (Step 3):

- Unless the user said `skip scope`, invoke `/pell:scope <KEY> skip comment`, passing through `--verbose` if set. The comment is suppressed here because `from-ticket` is about to start design work; the developer can run `/pell:scope <KEY>` directly if they want to post questions.
- If the verdict is `Not ready`: "This ticket has <n> blocker gap(s) — see above. Continue into design anyway? (y/n)". On `n`, exit with a pointer to run `/pell:scope <KEY>` to post the questions.
- If the verdict is `Ready with questions`, continue without prompting; the findings are already on screen and feed the brainstorming step's context.
- Carry the "Where it fits" block and the findings into the brainstorming seed (from-ticket Step 5) under a `## Project context` heading so the design session inherits the epic scope statement.
- The step is skipped on `skip scope` / `no scope check`, and also on `plan only` / `skip brainstorm` / `skip design` — a resume-from-spec run has no design conversation to feed and must not be asked "Continue into design anyway?".
- **Cache commit gate.** `/pell:scope` may have just written `docs/pell/sow-<PROJECT>.md`, and `/pell:start-work`'s pre-flight refuses a dirty tree. Unless Step 4 is already being skipped, Step 2.5 ends by running `git status --porcelain` on that one path. If it lists the file, prompt to commit exactly that file on the current branch `(y/n)`; on `y`, `git add` the one path and commit it as `docs(pell): add synthesized SOW for <PROJECT>`; on `n`, treat `skip start-work` as set and tell the user to commit or stash it themselves. If the porcelain output lists other files as well, commit nothing and treat `skip start-work` as set — `start-work` would refuse either way. This is the only commit `from-ticket` ever makes.
- `from-ticket`'s frontmatter `description` names the readiness check, so the composed sequence (fetch → scope → start-work → design) is visible in the command list.

`start-work` is not hooked. `from-ticket` dispatches `start-work`, so hooking both would run the check twice, and `start-work` should stay a fast branch-creation command.

## 14. Operator notes

- Never mutate Jira, Confluence, or Bitbucket except the gated comment. Never commit the cache file.
- The bare-project-key regex will match ordinary capitalized words in freeform text (`SOW`, `TODO`). Strip the Section 1 modifiers before matching, and only fall through to the project-key regex when no issue key was found.
- `searchJiraIssuesUsingJql` returns no total in its default issues mode (a `searchResultMode: "count"` exists but v1 does not use it); the traversal cap is expressed in pages, not issues, and the drift line reports `100+` when a page fills. Report the fetched count and `truncated` honestly.
- The Rovo `search` tool takes no `cloudId` — it derives the site from the access token.
- Confluence tool is `getConfluencePage` (`cloudId`, `pageId`, optional `contentFormat`); verified against the live schema 2026-08-28. `searchConfluenceUsingCql` and `getPagesInConfluenceSpace` also exist and are candidates for a more precise scope-doc discovery pass in a later version.
- Drift JQL uses day precision because `generated_at` is UTC and JQL date literals are read in the user's Jira time zone; the count may include same-day changes made before generation.
- The Atlassian MCP sometimes omits `reporter` even when requested; use the `or "unknown"` fallback.
- When the epic count is large (30+), the project-mode table is still rendered in full — truncation hides the epics the developer is looking for.
- If the ticket's project differs from the cached SOW's project (e.g. branch says `RRS-1020` but the user passed `FIEL-33`), the explicit argument wins and the FIEL cache is used or built.

## 15. Delivery checklist

- `plugins/pell/commands/scope.md` — new command (Sections 1–8, 11–12)
- `plugins/pell/agents/sow-builder.md` — new agent (Sections 9–10)
- `plugins/pell/commands/from-ticket.md` — new step per Section 13; add `skip scope` to its argument parsing and frontmatter `argument-hint`
- `plugins/pell/.claude-plugin/plugin.json` — bump minor (`0.13.0` → `0.14.0`): new command + new agent
- `README.md` (root, canonical command reference) — add `/pell:scope`
- `docs/specs/2026-05-27-pell-skills-architecture.md` §12 — add `scope` and `sow-builder` to the built list
- `claude plugin validate ./plugins/pell`, then `/plugin marketplace update pell-skills` + `/reload-plugins`
- Before writing `sow-builder`: authenticate the `plugin:atlassian:atlassian` server and verify the Confluence page tool and `searchJiraIssuesUsingJql` paging parameters via ToolSearch

## 16. Out of scope (v1)

- Incremental SOW refresh (patching only changed epics).
- Writing the SOW back to Confluence or attaching it to the Jira project.
- Estimating or re-estimating tickets.
- Transitioning tickets to a "Needs Info" status — the comment is the only feedback channel. Revisit if teams adopt such a status.
- Multi-project SOWs (a repo whose work spans several Jira projects gets one cache file per project, not a merged view).
- Hooking `start-work`, `my-tickets`, or `triage`. Those can offer `/pell:scope` as a hand-off later if it proves useful.
- A `pell-config.json` section. The cache frontmatter holds every persistent value this command needs; add config only if a real per-user preference emerges.
