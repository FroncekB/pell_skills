# `/pell:groom` — Design Spec

**Status:** approved
**Author:** Brandon Froncek + Claude
**Date:** 2026-09-23
**Parent spec:** [`2026-05-27-pell-skills-architecture.md`](2026-05-27-pell-skills-architecture.md)

## Purpose

`/pell:groom` walks a set of Jira tickets, reads the code each one would touch, and flags the places where *the code makes the ticket harder than it reads*: a second entry point the ticket never mentions, a validation rule it contradicts, a report or integration it silently ripples into, another ticket in the same batch that rewrites the same method a different way. It also reads each ticket as a technical architect (could existing code be extended instead of building something new?) and as a business analyst (which business case — roles, notifications, audit, refunds, existing customers — did the ticket never consider?). It drafts one comment per ticket — plain-language questions for the reporter, suggested approaches for the team, then code notes for whoever picks it up — and posts the ones the user selects.

It complements `/pell:scope` rather than overlapping it. Scope reads a ticket against the **project** (SOW placement, acceptance criteria, sibling overlap from ticket text). Groom reads a batch of tickets against the **code**. The groom rubric deliberately omits every check scope already makes, and the report footer points there.

It is **read-only against Jira and the repo**. The only Jira writes are comments and `relates to` links between collided tickets, both offered after the full report renders and made only where the user picks. Every comment carries a line saying Claude generated it.

## 1. Invocation

```
/pell:groom [EPIC-KEY | KEY... | PROJECT-KEY [sprint | next sprint] | jql "<query>"] [modifiers]
```

| Input | Mode | Ticket query |
|-|-|-|
| `RRS-500` whose type is Epic | **epic** | `parent = RRS-500 AND statusCategory != Done` |
| `RRS-12 RRS-14 RRS-20` | **key list** | `key in (RRS-12, RRS-14, RRS-20)` — any Epic in the list is expanded to its open children |
| `RRS sprint` | **sprint** | `project = RRS AND sprint in openSprints() AND statusCategory != Done` |
| `RRS next sprint` | **sprint** | `project = RRS AND sprint in futureSprints() AND statusCategory != Done` — when the results span more than one sprint, list them and ask which |
| `RRS` | **backlog** | `project = RRS AND statusCategory = "To Do"` |
| `jql "<query>"` | **JQL** | the query verbatim |
| *(none)* | **menu** | show the four-option menu below |

A single key that is not an Epic runs as a one-item key list. A key list that names an Epic and one of its children yields that child once (Section 5). Epic, sprint, and backlog modes append `AND issuetype not in subTaskIssueTypes()` and, outside epic mode, `AND issuetype != Epic` — sub-tasks are covered by their parent's audit and epics are too broad to audit against code. Every mode except JQL orders by `Rank ASC`.

**Menu.** Project key from `docs/pell/context.md` when it records exactly one `## Jira — <KEY>` section (the same rule `/pell:precheck` uses), else the project prefix of the branch key (`git branch --show-current`; empty on a detached HEAD, which is no match), else ask.

```
Groom which tickets in RRS?
1. An epic's open children
2. The active sprint or the next sprint
3. A JQL query or a list of keys
4. The backlog (To Do, by rank)
```

Options 1–3 ask one follow-up (the epic key; active or next; the query or keys).

**Modifiers**, case-insensitive, stripped after the `jql "..."` capture and before key detection:

| Modifier | Effect |
|-|-|
| `all` | Lift the 25-ticket cap |
| `skip collisions` | Pass no neighbors to auditors; omit the Collisions section |
| `--dry-run` | Run everything; render drafts; never offer to post or link |
| `--verbose` | Print the merged code map and each agent's raw summary (every mapper and every auditor) |
| `--reset` | Nothing to reset beyond the shared `jira.cloud_id`; print `Nothing to reset for /pell:groom.` and continue |

Examples:

```
/pell:groom RRS-500
/pell:groom RRS next sprint
/pell:groom RRS all --dry-run
/pell:groom jql "project = RRS AND labels = checkout AND status = 'Ready for Dev'"
/pell:groom RRS-12 RRS-20 skip collisions
```

## 2. Architecture and flow

```
/pell:groom <args>
  ├─ 1. git checkout required (checked before any prompt or Jira call); parse args → mode, project, keys, modifiers
  ├─ 2. resolve cloudId; load repo context (docs/pell/context.md)
  ├─ 3. pre-flight: note branch (or detached), HEAD, dirty tree
  ├─ 4. resolve the ticket set (JQL, view: "full", 26 per page unless `all`) → de-dup, cap at 25 unless `all`
  ├─ 5. cluster tickets (≤8 per cluster) — inline and cheap, so the gate can state the agent count
  ├─ 6. cost gate (skipped at ≤5 tickets) → (y/n)
  ├─ 7. dispatch ticket-code-mapper per cluster, ≤4 in parallel → merge maps
  ├─ 8. build the file→tickets index → collision candidates (unless `skip collisions`)
  ├─ 9. dispatch ticket-code-auditor per ticket, ≤6 in parallel
  ├─ 10. pair collisions, compute verdicts, compose drafts
  ├─ 11. render the report
  ├─ 12. unless --dry-run: "Post to which? (all / 1,4,7 / none)" → post selected
  └─ 13. unless --dry-run: "Link which? (all / 1,2 / none)" → link selected collision pairs as Relates
```

Chosen over two alternatives during brainstorming (see Section 15): a per-ticket agent with no shared map, and a fully inline loop. The shared map is what makes cross-ticket collisions cheap — the ticket→area index already says which tickets meet in the code — and it saves each auditor from re-locating code its neighbors already located.

Both expensive phases run in agents, so the orchestrator's context holds ticket fields, the merged map, and the auditors' JSON — never raw code reads or comment threads.

## 3. Argument parsing

Before any parsing, the git checkout check runs (Section 5), so a run outside a checkout exits before the menu, any prompt, or any Jira call. Then work through `$ARGUMENTS` in this order, stripping each recognized piece before the next step sees the text:

1. `jql "<query>"` — capture the quoted string (single or double quotes) first, and strip it before anything else runs: a JQL string contains keys, and words such as `all` or `sprint`, that would otherwise match. `jql "summary ~ 'all'"` does not set `all`. A JQL capture ends mode resolution.
2. Modifiers from Section 1, from what is left.
3. `next sprint` → `mode = sprint`, `sprint_target = next`; else `sprint` → `sprint_target = active`.
4. Every match of `\b[A-Z][A-Z0-9]+-\d+\b` → `keys`.
5. Otherwise first match of `\b[A-Z][A-Z0-9]+\b` → `project_key`.
6. Sprint mode with no project key resolves the project the same way as the menu. No keys, no project, no JQL, no sprint → menu.

Keys win over a bare project token. Mode for `keys`: fetch them (Section 5); one Epic alone → epic mode; otherwise key-list mode with Epics expanded.

## 4. Resolve `cloudId` and load repo context

Identical to `/pell:scope` Steps 2–3: `docs/pell/context.md` `cloudId` if present, else `pell-config.json:jira.cloud_id`, else `getAccessibleAtlassianResources` and write it back atomically. The command body inserts the canonical repo-context block from `CLAUDE.md` ("Repo context convention") verbatim, immediately after its `pell-config.json` read, making groom the tenth consumer.

## 5. Pre-flight and ticket set

**Pre-flight.** `git rev-parse --show-toplevel` → `repo_root`. On failure exit: `/pell:groom reads the code — run it from a checkout of the target repo.` This check runs first, at the top of argument parsing, before the menu, any prompt, or any Jira call; the rest of pre-flight runs after repo context loads. Record `branch = git branch --show-current` and `head = git rev-parse --short HEAD`. When `branch` is empty (a detached HEAD), use `detached` as the branch name everywhere it appears (cost gate, report header, agent dispatch, the draft's disclaimer) and print `Checkout is detached at <head> — findings reflect that commit.` Otherwise, when `branch` is not `develop`, `main`, or `master`, print `Checkout is on <branch>, not develop — findings reflect that branch.` When `git status --porcelain` is non-empty, print `Working tree has uncommitted changes — they are included in the read.`

**Fetch.** `searchJiraIssuesUsingJql` with `cloudId`, the mode's JQL, `view: "full"`, `responseContentFormat: "markdown"`, and `fields: ["summary", "description", "status", "issuetype", "priority", "labels", "components", "parent", "issuelinks"]`. `view: "full"` is required — the default `compact` view drops `parent`, `issuetype`, and `issuelinks` even when listed (see scope spec status note). Page size bounds the orchestrator's context by the cap, not the set size: unless `all`, `maxResults: 26` — one past the cap, enough to know whether more than 25 exist — and one page is normally the whole fetch (a short page with `isLast` false is followed until more than 25 have accumulated or `isLast`); with `all`, `maxResults: 100`, paging with `nextPageToken` until `isLast`. Each ticket's `issuelinks` is reduced to `[{type, key}]` — the link type name and the linked issue's key. Epic expansion in key-list mode runs one epic-mode fetch per Epic and folds its children into the result in place of the Epic.

**Next sprint.** Run the `futureSprints()` query with `maxResults: 50` and `view: "evidence"` so the Sprint field is mapped. Keep only Sprint entries whose `state` is `"future"` — the field also lists closed and active sprints a ticket passed through — and group by sprint name; if more than one, list them in start-date order and ask which, then filter to it. No future sprint is treated as zero tickets.

**Ticket set and cap.** The fetched tickets, in query order with Epics expanded, are de-duplicated by key, keeping the first occurrence — a key list naming an Epic and one of its children yields that child once. The 25 cap and the found count apply to that combined, de-duplicated set: keep the first 25 unless `all`. The found count is exact when every fetch reached `isLast`; otherwise it renders as `more than 25`. Zero results → exit `No open tickets in <set description>.`; in sprint mode append ` (<PROJECT> may not use sprints — try the backlog or an epic.)` — Kanban projects such as RRS carry no Sprint data. A Jira error → exit with it.

**Comments are not fetched here.** On the `plugin:atlassian:atlassian` server `getJiraIssue` reports a comment count, not the comments; the thread is read by each auditor (Section 8) so a batch of long threads never lands in the orchestrator's context.

## 6. Cost gate

Printed after clustering (7.1) and before any agent is dispatched. Prompted only when the set has more than 5 tickets; at 5 or fewer, the first three lines print and the run continues. The found count is exact or `more than 25` (Section 5). In JQL mode the cap note reads `(capped at 25 in query order; ...)`, since the query sets its own order.

```
Found more than 25 tickets in the RRS backlog (capped at 25 by rank; say "all" for every one).
Grooming maps the code in ~4 clusters, then audits each ticket: ~4 mapping + 25 audit agents.
Checkout: develop @ a1b2c3d.
Proceed? (y/n)
```

The gate runs under `--dry-run` too: `--dry-run` suppresses writes, never spend, matching `/pell:scope`'s SOW-build gate. On `n` exit with `Not run.`

## 7. Code map

### 7.1 Clustering (inline)

Group tickets into clusters of at most 8, by the first signal that applies: same `parent` epic; then a shared component or label; then the orchestrator's own read of summary and description for what remains. A group larger than 8 splits by the next signal, then by rank. Epic mode usually yields one or two clusters.

### 7.2 `ticket-code-mapper` agent

New file `plugins/pell/agents/ticket-code-mapper.md`. Frontmatter `name`, `description`, `model: inherit`; no `tools:` line. Read-only: it never writes files and never calls Jira.

**Input** (labeled lines in the dispatch prompt):

```
repo_root: <path>
branch: <branch> @ <head>
tickets: <JSON array of {key, summary, description, components, labels}>
```

**Procedure.** For each ticket, pull out the nouns that name code — entities, screens, routes, statuses, jobs, integrations — and locate them with Grep and Glob. Follow each hit to its entry points (controllers, pages, handlers, scheduled jobs) and inward to services, validators, and data access. Find consumers by searching for the key symbols' callers. Group what it finds into **areas**, one per flow or component, shared across the cluster's tickets. Stay at map depth: record pointers with `file:line`, do not judge the tickets.

**Output** — trailing JSON:

```json
{
  "areas": [{
    "id": "checkout-submit",
    "name": "Checkout submit",
    "entry_points": ["Controllers/CheckoutController.cs:88 POST /checkout", "Jobs/RetryOrderJob.cs:40"],
    "files": ["Services/OrderService.cs", "Validators/OrderValidator.cs"],
    "state": ["OrderStatus: Draft -> Submitted -> Paid | Failed"],
    "rules": ["Validators/OrderValidator.cs:31 max 50 line items", "Services/OrderService.cs:52 flag: EnableGuestCheckout"],
    "consumers": ["Reports/DailySales.cs", "Integrations/Netsuite/OrderExport.cs"],
    "data": ["Orders", "OrderLines"],
    "tickets": ["RRS-12", "RRS-20"]
  }],
  "unmapped": [{"key": "RRS-31", "reason": "no existing code found; reads as greenfield"}],
  "summary": "one or two sentences"
}
```

Paths are relative to `repo_root`. `unmapped.reason` states which it believes: genuinely new feature, or too vague to locate.

**Deliberate exception to the agent JSON convention.** The mapper returns a map, not findings, so it does not use `{"findings": [...], "summary": "..."}`. `sow-builder` and `repo-mapper` return custom shapes for the same reason. Do not "correct" it.

### 7.3 Merge and collision candidates (inline)

Concatenate every cluster's `areas` and `unmapped`. Area ids are namespaced by cluster (`c2/checkout-submit`) so two mappers' ids never collide.

Build `file_index: file → set(tickets)` from every area's `files` plus the file part of each `entry_points` and `rules` entry. A file is **broad** when the run has at least 6 tickets and the file maps to more than half of them (a DbContext, a base controller); broad files stay in the index but do not create candidates on their own.

**Collision candidates** — unordered ticket pairs that share an area id or a non-broad file. For each ticket, keep at most 5 neighbors, those sharing the most files first. `skip collisions` → no candidates.

## 8. Per-ticket audit

### 8.1 `ticket-code-auditor` agent

New file `plugins/pell/agents/ticket-code-auditor.md`. Frontmatter `name`, `description` (which says "Read-only."), `model: inherit`; no `tools:` line (it needs the Atlassian MCP to read the comment thread). Read-only, stated as a rule in the body: never post or edit comments, create links, transition or edit tickets, or write files.

**Input:**

```
cloudId: <cloudId>
repo_root: <path>
branch: <branch> @ <head>
ticket: <JSON — key, summary, description, type, status, labels, components, parent {key, summary}, issuelinks [{type, key}]>
map_slice: <JSON array of the full area objects this ticket appears in; [] if none>
unmapped_reason: <mapper's reason, or none>
neighbors: <JSON array of {key, summary, description truncated to about 500 characters, shared: [area ids and files]}; [] under skip collisions>
```

`issuelinks` carries only each link's type name and the linked issue key, and each neighbor's description is cut to about 500 characters, so a dispatch payload stays bounded however long the batch's descriptions run.

**Step 1 — read the thread.** Fetch every comment on the ticket, every page. The comment tool differs by connection shape (map-repo spec §5.0): on `plugin:atlassian:atlassian` it is `listJiraIssueComments` via `discover` then `executeRead({name, cloudId, inputs})`, with `cloudId` top-level; on the classic connection it is the `comment` field of `getJiraIssue`. The agent prompt names both and uses whichever the session exposes. A failed thread read is not fatal: continue, and set `"thread_read": false` in the output so the orchestrator can say so.

**Step 2 — audit.** Start from the map slice, then read the code itself. Apply the rubric:

| Category | Looks for |
|-|-|
| `requirement-gap` | The code has a case the ticket skips: another entry point to the same flow, a role or permission check, existing records that need a backfill, a failure path, a feature flag, per-tenant or per-site config, a status value |
| `code-conflict` | The ticket asks for behavior existing code contradicts: a validation, a constant, a business rule elsewhere, an enum it does not account for |
| `blast-radius` | A consumer the change ripples into: report, export, integration, job, public API, shared component, a state transition other flows depend on |
| `collision` | Against `neighbors`: contradictory requirements, an ordering dependency, the same method rewritten two ways |
| `approach` | A better way to build it in this codebase, read as a technical architect: an existing module, service, or component that already does part of what the ticket asks and could be extended instead of building something new; a pattern the codebase already uses that the ticket's implied design would diverge from; a simpler path with less blast radius |
| `business-gap` | A business requirement the ticket does not address, whether or not the code shows it, read as a business analyst: who may do this (roles, approvals), who is told (notifications), what is recorded (audit trail, history), reporting and exports, existing customers or records, reversal paths (cancel, refund, undo), dates and time zones, money and rounding, compliance or retention |

When `map_slice` is empty the auditor locates the code itself — the fallback when a mapper failed. When `unmapped_reason` says greenfield, report one greenfield `requirement-gap` finding at `minor`, in addition to any other findings, noting no existing code was found; look for adjacent code the new feature will have to integrate with, and look for existing code that already does part of what the ticket asks — the strongest source of `approach` findings.

**Out of rubric:** description quality, acceptance criteria, epic placement, sibling overlap from ticket text. Those are `/pell:scope`. A `business-gap` is not a missing-acceptance-criteria finding: scope asks whether criteria exist; groom asks which business case the ticket never considered.

**Grounding rule.** Every finding cites code the auditor read in this run — `file:line` in `evidence`. The map is a pointer, not evidence. A suspicion it could not ground in code is not a finding. Two exceptions:
- The greenfield finding; its evidence is the searches that came back empty.
- `business-gap`, whose evidence may instead be a quoted fragment of the ticket or a related ticket that the missing requirement follows from — for example `ticket: "Customers can cancel an order" — says nothing about refunds`. A business gap needs that anchor in this ticket or this code; a generic checklist item with no anchor is not a finding.

An `approach` finding always cites the existing code it proposes extending or reusing.

**Severity** (correctness scale):

| Severity | Meaning |
|-|-|
| `blocker` | Cannot be built as written without a decision |
| `major` | Likely rework or a shipped bug if nobody answers it |
| `minor` | The developer should know; resolvable without the reporter |
| `nit` | FYI |

`approach` findings are never `blocker`: `major` when the ticket as written would duplicate a capability the codebase already has, otherwise `minor`. `business-gap` uses the full scale.

**Thread status.** For each finding: `new`, `asked` (raised on the thread, unanswered), or `answered` (raised and resolved on the thread). Report every finding regardless — the orchestrator decides what reaches the comment. A prior groom comment ends with `Posted from /pell:groom.`; every finding it carried — whether it went out as a question, a suggested approach, or a code note — is `asked` unless a later comment answers it (then `answered`). This is what keeps a re-run from re-drafting a posted suggestion or code note, not only a posted question.

**Overlaps already posted.** The auditor also returns `thread_overlaps`: an object mapping ticket keys to `"asked"` or `"answered"`, built from the `Overlaps with <KEY>:` lines in prior groom comments on this ticket's thread (`answered` when a later comment resolves the overlap), `{}` when none. A collision finding the auditor reports against a key in `thread_overlaps` takes that entry's status. The orchestrator reads it for collisions this ticket's own auditor did not flag (Section 9).

### 8.2 Output

```json
{
  "findings": [{
    "category": "code-conflict",
    "severity": "blocker",
    "title": "Ticket asks for 100 line items; validator caps at 50",
    "evidence": ["Validators/OrderValidator.cs:31 MaxLineItems = 50", "Integrations/Netsuite/OrderExport.cs:12 same cap"],
    "question": "Should the 50-item limit rise for everyone, or only this customer? The NetSuite export enforces the same cap.",
    "code_note": "Cap duplicated in OrderValidator.cs:31 and OrderExport.cs:12; NetSuite may reject >50 server-side.",
    "suggestion": null,
    "related_tickets": [],
    "thread_status": "new"
  }],
  "touched": ["Validators/OrderValidator.cs", "Integrations/Netsuite/OrderExport.cs"],
  "thread_read": true,
  "thread_overlaps": {"RRS-20": "asked"},
  "summary": "one or two sentences"
}
```

`category` is one of `requirement-gap`, `code-conflict`, `blast-radius`, `collision`, `approach`, `business-gap`. Each `thread_overlaps` value is `asked` or `answered`.

Field rules:
- `evidence` — each entry is `file:line` plus what that line shows; for a `business-gap`, an entry may instead be a quoted ticket or related-ticket fragment. The greenfield finding lists the searches that came back empty.
- `question` — plain language, no file paths, answerable by the reporter. Required for `blocker` and `major`, and for `business-gap` at every severity. Optional for `approach`.
- `suggestion` — plain language, may name components but no file paths, written for the team rather than the reporter (for example "Extend the existing order notification service rather than building a new notifications module"). Required for `approach`; `null` otherwise.
- `code_note` — may cite paths. Required at every severity, except a `business-gap` with no code touchpoint, where it is `""`.
- `related_tickets` — required for `collision`.
- For a `collision`, `question` and `code_note` name both tickets by key and never say "this ticket" or "the other ticket" — the same text is posted on both tickets.
- `thread_overlaps` — built from `Overlaps with <KEY>:` lines in prior groom comments (Section 8.1, Thread status); `{}` when none.

## 9. Collision pairs, verdicts, drafts (inline)

**Not assessed.** A ticket whose auditor failed has no findings, no collision items, and no draft; its table counts render `—` and its report section is its heading and verdict line only. A partner's collision with it still appears in the Collisions section and in the partner's draft.

**Collision pairs.** Under `skip collisions`, `collision_pairs` is empty and no collision items are built. Otherwise, every `collision` finding from every auditor yields one `(owner, related)` pair per key in its `related_tickets` (`owner` = the ticket whose auditor produced it); a `related` key not in the ticket set, or equal to the owner, is dropped. `collision_pairs` holds one entry per unordered pair. Its **reference finding** is the highest-severity collision finding that produced the pair, from either side (tie: the longer `code_note`); both tickets show that finding's severity, title, evidence, question, and code note. Each side's **collision status** comes from its own auditor's collision finding naming the other ticket; else, when its auditor did not flag the other, from its own auditor's `thread_overlaps[<other key>]`; else `new`. There is no evidence-matching merge: a mutual collision and a one-sided one resolve the same way.

Each pair renders once under Collisions, appears in both tickets' "Collides with" cells, and becomes a **collision item** on each assessed ticket — the reference finding, the other ticket's key, and this ticket's own collision status as its `thread_status`.

**Findings for rendering.** Per ticket: its own auditor findings minus raw `collision` findings, plus its collision items. This one list drives the verdict, the table counts, the severity sections, the "Already on the thread" count, and the draft, so a collision only the partner's auditor flagged still counts for this ticket everywhere a finding would.

**Open findings** = `thread_status` of `new` or `asked`. `answered` findings are counted, not rendered in full.

**Verdict** per ticket, from open findings, in `/pell:scope`'s wording: `Not ready` if any blocker; `Ready with questions` if any major; else `Ready`. An auditor failure → `Not assessed`.

**Draft comment** per ticket, built from `new` findings for rendering only:

```
Pre-work code check on this ticket. A few questions before it starts:

Questions
1. <question from each new blocker, then each new major, then each new minor business-gap>

Suggested approach
- <suggestion from each new approach finding>

Code notes (for whoever picks this up)
- <non-empty code_note from each new blocker, major, and minor>
- Overlaps with <KEY>: <collision code_note>

Generated by Claude (AI) from a read of the code on <branch> @ <head>. Verify before acting.
Posted from /pell:groom.
```

Questions take only non-null questions (an `approach` finding's question is optional). A collision item bullets as `Overlaps with <KEY>: <code_note>`, `<KEY>` being the other ticket; the prefix stays exact because a re-run's auditors read it to build `thread_overlaps`.

The disclaimer line appears on every draft, directly above the marker. `Posted from /pell:groom.` stays the last line — auditors match it to recognize prior groom comments on a re-run.

Omit any section that would be empty. When the Questions section is omitted, open with `Pre-work code check on this ticket. Notes for whoever picks it up:` instead. Omit the draft entirely when all three sections would be empty. Nits never reach the comment, in any category. No severities, no verdict in the comment.

## 10. Render

Table rows sorted by verdict (`Not ready`, `Ready with questions`, `Not assessed`, `Ready`), then query order; the `#` column numbers follow this order and are reused by the posting prompt.

```
## Groom — RRS backlog (25 of more than 25) — develop @ a1b2c3d
<pre-flight lines, when any>

| # | Ticket | Verdict | Blk | Maj | Min | Nit | Collides with |
|-|-|-|-|-|-|-|-|
| 1 | RRS-12 Raise line-item cap | Not ready | 1 | 2 | 0 | 1 | RRS-20 |
| 2 | RRS-14 Guest checkout email | Ready | 0 | 0 | 1 | 0 | — |

### Collisions
- RRS-12 x RRS-20 [blocker] — both rewrite OrderService.Submit; RRS-12 assumes synchronous submit, RRS-20 moves it to a queue.
_None._ when empty; omitted under `skip collisions`

### Unmapped
- RRS-31 — no existing code found; reads as greenfield.
(omitted when empty)

### 1. RRS-12 — Raise line-item cap
Verdict: Not ready  ·  Areas: Checkout submit, NetSuite export
#### Blockers
- <title>. <evidence>.
  Question: <question>
  Suggestion: <suggestion>
_None._ when empty
#### Major
#### Minor
#### Nits
Already on the thread: <n> (<a> answered, <b> asked, not repeated).   (omit when 0)
Thread not read — questions may repeat earlier comments.                (only when thread_read = false)

Draft comment:
<draft, or "Nothing to post.">

---
Description and acceptance-criteria readiness: /pell:scope <KEY>. Start one: /pell:from-ticket <KEY>.
<Not assessed: rerun with /pell:groom <keys> when any auditor failed>
```

Counts in the table are open findings; a `Not assessed` row shows `—` in each count column, and its section is the heading and verdict line only. A finding's `Question:` line prints when it has a question; its `Suggestion:` line prints for `approach` findings. `--verbose` also prints the merged map, each mapper's summary, and each auditor's summary. Plain text only; no emoji or glyphs. Never truncate the table.

## 11. Posting

Skipped under `--dry-run` (print `--dry-run: comments not offered.`) and when no ticket has a draft (print `No comments to post.`).

```
Draft comments for 9 of 25 tickets: 1 RRS-12, 3 RRS-15, 4 RRS-20, 7 RRS-26, ...
Post to which? (all / 1,4,7 / none)
```

Accept `all`, `none`/`n`, or a comma- or space-separated list of `#` numbers; re-prompt once on anything else, then treat as `none`. Numbers without a draft are ignored with one line naming them. Echo before writing: `Posting 3 comments: RRS-12, RRS-20, RRS-26.`

Post one at a time. The comment tool differs by connection shape: `addOrEditJiraIssueComment` on `plugin:atlassian:atlassian` (omit `commentId` to add), `addCommentToJiraIssue` on the classic connection; both take `cloudId`, `issueIdOrKey`, `commentBody`, `contentFormat: "markdown"` — markdown is used on both (the classic tool accepts `markdown` or `adf`; the plugin tool `markdown` or `html`). The command body names both. Print `<KEY>: Commented.` or `<KEY>: Failed: <error>` and continue past failures. `none` prints `Not posted.`

### 11.1 Linking collided tickets

Runs after the comment step, whether or not any comment was posted. **Candidate pairs** are `collision_pairs` from Section 9 — every collision, whether one auditor or both flagged it, one entry per unordered pair. A pair is **already linked** when either ticket's `issuelinks` (fetched in Section 5) names the other, in any link type; those are skipped with one line: `Already linked, skipped: RRS-12 / RRS-20.`

Skipped silently when there are no candidate pairs, and under `--dry-run` (print `--dry-run: links not offered.`).

```
Link collided tickets as "relates to"?
1 RRS-12 relates to RRS-20
2 RRS-15 relates to RRS-26
Link which? (all / 1,2 / none)
```

Input handling matches Section 11. Echo before writing: `Linking 2 pairs: RRS-12 relates to RRS-20, RRS-15 relates to RRS-26.`

The link type is always `Relates`, which is symmetric, so `inwardIssue` is the pair's first key and `outwardIssue` the second. `Blocks` is never proposed: auditors do not reliably state which ticket must land first, so an ordering dependency stays in the comment text. The link tool differs by connection shape: `createJiraIssueLink` on `plugin:atlassian:atlassian`, via `executeWrite({name, cloudId, inputs: {linkType: "Relates", inwardIssue, outwardIssue}})` with `cloudId` top-level; `createIssueLink` on the classic connection, with `cloudId`, `type: "Relates"`, `inwardIssue`, `outwardIssue`. The parameter is `linkType` on one and `type` on the other. The command body names both. Never pass the tools' optional `comment`. Print `<A> relates to <B>: Linked.` or `<A> relates to <B>: Failed: <error>` and continue past failures. `none` prints `Not linked.`

## 12. Side effects

| Write | When | Gate |
|-|-|-|
| Jira comment per selected ticket | after the full report, not `--dry-run` | `Post to which? (all / 1,4,7 / none)` plus the echo line |
| `Relates` link per selected collision pair | after the comment step, not `--dry-run`, pair not already linked | `Link which? (all / 1,2 / none)` plus the echo line |
| `jira.cloud_id` in `~/.claude/pell-config.json` | only when neither `context.md` nor the cache already holds a cloud id | none — shared config, cached the same way `/pell:scope` does (Section 4) |

Nothing else. No transitions, field edits, other link types, other file writes, or commits.

## 13. Failure behavior

| Condition | Behavior |
|-|-|
| Not a git repo | exit before the menu, any prompt, or any Jira call (Section 5) |
| Jira search error / zero tickets | exit with the error / `No open tickets in <set>.` |
| Mapper fails or returns unparseable JSON | print `Mapping failed for <keys>: <error> — auditors will locate code themselves.`; those tickets get `map_slice: []` |
| Auditor fails or returns unparseable JSON | ticket verdict `Not assessed: <error>`; no draft, no severity sections, table counts `—`; footer suggests a rerun |
| Thread read fails inside an auditor | `thread_read: false`; report line warns questions may repeat |
| A comment post fails | `<KEY>: Failed: <error>`; continue |
| A link fails (including linking disabled site-wide, or no `Relates` type) | `<A> relates to <B>: Failed: <error>`; continue |
| Sprint mode returns zero tickets | `No open tickets in <set>. (<PROJECT> may not use sprints — try the backlog or an epic.)` |
| User answers `n` at the cost gate | exit `Not run.` |

## 14. Operator notes

- Read-only except the selected comments and the selected `Relates` links — the only Jira writes. The one file write is caching `jira.cloud_id` in `~/.claude/pell-config.json` (shared config, same as `/pell:scope`). Never commit, never write any other file.
- Comment-read, comment-post, and link tools differ between Atlassian connection shapes, and so do their parameter names (`linkType` on the plugin's `createJiraIssueLink`, `type` on the classic `createIssueLink`). Name both per role, as map-repo §5.0 does for its collection operations.
- Comment bodies containing @mentions come back as HTML (`appliedContentFormat: "html"`) even when markdown is requested; auditors read either format.
- Capture the `jql "..."` string first, then strip modifiers, both before key detection — `TODO`, `SOW`, keys, and modifier words inside JQL would otherwise match.
- Every JQL call passes `view: "full"` (or `"evidence"` for the next-sprint grouping). The default `compact` view silently drops `parent`, `issuetype`, and `issuelinks`.
- Dispatch each phase's agents in a single message per batch so they run concurrently: ≤4 mappers, ≤6 auditors.
- Say what is happening before each phase (`Mapping 4 clusters...`, `Auditing 25 tickets...`); do not sit silent through a long run.
- Both agents start at `model: inherit`. Per `CLAUDE.md`'s mechanical-agent exception, reconsider pinning `ticket-code-mapper` to Sonnet only after spot-checking real runs; the auditor makes judgment calls and stays `inherit`.

## 15. Resolved decisions

| Decision | Choice | Why |
|-|-|-|
| Surface | Command, not auto-invoked skill | It posts to Jira; it must never fire on a description match |
| Ticket sets | All four modes plus a menu | Epic, sprint, JQL/keys, and backlog each match a real grooming moment |
| Comment audience | Both, split sections | Reporter answers the questions; the developer reads the code notes |
| Posting gate | Report first, then pick | The user sees every draft before anything touches Jira |
| Rubric | Requirement gaps, code conflicts, blast radius, collisions | All four selected; scope's text checks excluded to keep the commands distinct |
| Architecture | Shared code map, then per-ticket audit (approach C) | Over per-ticket agents without a map (A) and an inline loop (B, context exhausts past ~5 tickets). The map makes collisions cheap and avoids re-locating shared code |
| Code source | Local checkout only | Matches the reviewer default; a Bitbucket source is deferred |
| Name | `groom` | Backlog grooming is the moment it serves |
| Linking (added mid-build) | Offer `Relates` links for collision pairs, gated, after comments | Makes collisions visible on the Jira board, not only in comment text; `Blocks` needs a direction auditors cannot reliably give |
| Architect and business lenses (added mid-build) | New `approach` and `business-gap` categories; a `Suggested approach` comment section | The team wanted "extend x, y, z instead of a new module" suggestions and missed business requirements, not only code-evidenced gaps. `business-gap` may ground in quoted ticket text, so it relaxes the code-only grounding rule for that one category and always carries a question |
| AI disclaimer (added mid-build) | One line above the marker on every comment | Readers should know the comment is machine-generated and verify it; the marker stays last so re-run detection is unchanged |

## 16. Delivery checklist

- Verify live via ToolSearch before writing the agents: `listJiraIssueComments` input shape and paging on `plugin:atlassian:atlassian`; the classic `getJiraIssue` `comment` field; `addOrEditJiraIssueComment` parameters; the Sprint field name under `view: "evidence"`; the issue-link tools (`createJiraIssueLink` via `executeWrite` on the plugin server, `createIssueLink` on the classic connection) and that the site has a `Relates` link type
- `plugins/pell/commands/groom.md` — new command (Sections 1–6, 7.1, 7.3, 9–13, including 11.1)
- `plugins/pell/agents/ticket-code-mapper.md` — new agent (Section 7.2)
- `plugins/pell/agents/ticket-code-auditor.md` — new agent (Section 8), including the `approach` and `business-gap` categories and the `suggestion` field
- `plugins/pell/.claude-plugin/plugin.json` — minor bump to `0.20.0` (main is `0.18.0`; `0.19.0` is taken by the in-flight `four-pass-review` branch)
- `plugins/pell/README.md` — command list and agent list
- `README.md` — commands table and count, `### /pell:groom` section, sub-agent list
- `docs/specs/2026-05-27-pell-skills-architecture.md` §12 — add `groom`, `ticket-code-mapper`, `ticket-code-auditor` to Built
- `CLAUDE.md` "Repo context convention" — nine consumer commands become ten; add `groom` to the list
- `claude plugin validate ./plugins/pell`, then `/plugin marketplace update pell-skills` + `/reload-plugins`
- Live validation on a real Pell project: `--dry-run` on a 3–5 ticket epic; spot-check cited `file:line` references against the code; exercise each of the four modes once; post one comment, rerun, confirm its questions, suggestions, and code notes come back as `asked` and are not re-drafted; rerun a one-sided collision after posting both drafts and confirm neither draft repeats the overlap; confirm the posted comment carries the AI disclaimer line; link one collision pair on sandbox tickets and confirm a rerun skips it as already linked

## 17. Out of scope (v1)

- A Bitbucket code source (`use bitbucket`) for grooming without a checkout.
- Caching the code map to disk for reuse across runs.
- Saving the report to a file.
- Link types other than `Relates` (for example `Blocks` for an ordering dependency).
- Transitioning tickets or setting a "Needs Info" status.
- Auditing sub-tasks individually, and auditing epics against code.
- Running `/pell:scope`'s text rubric inside groom.
