# `/pell:groom` — Design Spec

**Status:** approved
**Author:** Brandon Froncek + Claude
**Date:** 2026-09-23
**Parent spec:** [`2026-05-27-pell-skills-architecture.md`](2026-05-27-pell-skills-architecture.md)

## Purpose

`/pell:groom` walks a set of Jira tickets, reads the code each one would touch, and flags the places where *the code makes the ticket harder than it reads*: a second entry point the ticket never mentions, a validation rule it contradicts, a report or integration it silently ripples into, another ticket in the same batch that rewrites the same method a different way. It drafts one comment per ticket — plain-language questions for the reporter, then code notes for whoever picks it up — and posts the ones the user selects.

It complements `/pell:scope` rather than overlapping it. Scope reads a ticket against the **project** (SOW placement, acceptance criteria, sibling overlap from ticket text). Groom reads a batch of tickets against the **code**. The groom rubric deliberately omits every check scope already makes, and the report footer points there.

It is **read-only against Jira and the repo**. The only write is Jira comments, posted after the full report renders and only to the tickets the user picks.

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

A single key that is not an Epic runs as a one-item key list. Epic, sprint, and backlog modes append `AND issuetype not in subTaskIssueTypes()` and, outside epic mode, `AND issuetype != Epic` — sub-tasks are covered by their parent's audit and epics are too broad to audit against code. Every mode except JQL orders by `Rank ASC`.

**Menu.** Project key from `docs/pell/context.md`, else the project prefix of the branch key (`git branch --show-current`), else ask.

```
Groom which tickets in RRS?
1. An epic's open children
2. The active sprint or the next sprint
3. A JQL query or a list of keys
4. The backlog (To Do, by rank)
```

Options 1–3 ask one follow-up (the epic key; active or next; the query or keys).

**Modifiers**, case-insensitive, stripped before key detection:

| Modifier | Effect |
|-|-|
| `all` | Lift the 25-ticket cap |
| `skip collisions` | Pass no neighbors to auditors; omit the Collisions section |
| `--dry-run` | Run everything; render drafts; never offer to post |
| `--verbose` | Print the merged code map and each agent's raw summary |
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
  ├─ 1. parse args → mode, project, keys, modifiers
  ├─ 2. resolve cloudId; load repo context (docs/pell/context.md)
  ├─ 3. pre-flight: git checkout required; note branch, HEAD, dirty tree
  ├─ 4. resolve the ticket set (JQL, view: "full", paged) → cap at 25 unless `all`
  ├─ 5. cluster tickets (≤8 per cluster) — inline and cheap, so the gate can state the agent count
  ├─ 6. cost gate (skipped at ≤5 tickets) → (y/n)
  ├─ 7. dispatch ticket-code-mapper per cluster, ≤4 in parallel → merge maps
  ├─ 8. build the file→tickets index → collision candidates (unless `skip collisions`)
  ├─ 9. dispatch ticket-code-auditor per ticket, ≤6 in parallel
  ├─ 10. merge collisions, compute verdicts, compose drafts
  ├─ 11. render the report
  └─ 12. unless --dry-run: "Post to which? (all / 1,4,7 / none)" → post selected
```

Chosen over two alternatives during brainstorming (see Section 15): a per-ticket agent with no shared map, and a fully inline loop. The shared map is what makes cross-ticket collisions cheap — the ticket→area index already says which tickets meet in the code — and it saves each auditor from re-locating code its neighbors already located.

Both expensive phases run in agents, so the orchestrator's context holds ticket fields, the merged map, and the auditors' JSON — never raw code reads or comment threads.

## 3. Argument parsing

Work through `$ARGUMENTS` in this order, stripping each recognized piece before the next step sees the text:

1. Modifiers from Section 1.
2. `jql "<query>"` — capture the quoted string (single or double quotes). Strip it before key detection; a JQL string contains keys that would otherwise match.
3. `next sprint` → `mode = sprint`, `sprint_target = next`; else `sprint` → `sprint_target = active`.
4. Every match of `\b[A-Z][A-Z0-9]+-\d+\b` → `keys`.
5. Otherwise first match of `\b[A-Z][A-Z0-9]+\b` → `project_key`.
6. Sprint mode with no project key resolves the project the same way as the menu. No keys, no project, no JQL, no sprint → menu.

Keys win over a bare project token. Mode for `keys`: fetch them (Section 5); one Epic alone → epic mode; otherwise key-list mode with Epics expanded.

## 4. Resolve `cloudId` and load repo context

Identical to `/pell:scope` Steps 2–3: `docs/pell/context.md` `cloudId` if present, else `pell-config.json:jira.cloud_id`, else `getAccessibleAtlassianResources` and write it back atomically. The command body inserts the canonical repo-context block from `CLAUDE.md` ("Repo context convention") verbatim, immediately after its `pell-config.json` read, making groom the tenth consumer.

## 5. Pre-flight and ticket set

**Pre-flight.** `git rev-parse --show-toplevel` → `repo_root`. On failure exit: `/pell:groom reads the code — run it from a checkout of the target repo.` Record `branch = git branch --show-current` and `head = git rev-parse --short HEAD`. When `branch` is not `develop`, `main`, or `master`, print `Checkout is on <branch>, not develop — findings reflect that branch.` When `git status --porcelain` is non-empty, print `Working tree has uncommitted changes — they are included in the read.`

**Fetch.** `searchJiraIssuesUsingJql` with `cloudId`, the mode's JQL, `maxResults: 100`, `view: "full"`, `responseContentFormat: "markdown"`, and `fields: ["summary", "description", "status", "issuetype", "priority", "labels", "components", "parent", "issuelinks"]`. `view: "full"` is required — the default `compact` view drops `parent`, `issuetype`, and `issuelinks` even when listed (see scope spec status note). Page with `nextPageToken` until `isLast`, stopping once the cap is reached. Epic expansion in key-list mode runs one epic-mode query per Epic.

**Next sprint.** Run the `futureSprints()` query with `view: "evidence"` so the Sprint field is mapped. Group by sprint name; if more than one, list them in start-date order and ask which, then filter to it.

**Cap.** Keep the first 25 in query order unless `all`. Zero results → exit `No open tickets in <set description>.` A Jira error → exit with it.

**Comments are not fetched here.** On the `plugin:atlassian:atlassian` server `getJiraIssue` reports a comment count, not the comments; the thread is read by each auditor (Section 8) so a batch of long threads never lands in the orchestrator's context.

## 6. Cost gate

Printed after clustering (7.1) and before any agent is dispatched. Prompted only when the set has more than 5 tickets; at 5 or fewer, the plan line prints and the run continues.

```
Found 38 tickets in the RRS backlog (capped at 25 by rank; say "all" for every one).
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
    "rules": ["Validators/OrderValidator.cs:31 max 50 line items", "flag: EnableGuestCheckout"],
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

New file `plugins/pell/agents/ticket-code-auditor.md`. Frontmatter `name`, `description`, `model: inherit`; no `tools:` line (it needs the Atlassian MCP to read the comment thread). Read-only.

**Input:**

```
cloudId: <cloudId>
repo_root: <path>
branch: <branch> @ <head>
ticket: <JSON — key, summary, description, type, status, labels, components, parent {key, summary}, issuelinks>
map_slice: <JSON array of the full area objects this ticket appears in; [] if none>
unmapped_reason: <mapper's reason, or none>
neighbors: <JSON array of {key, summary, description, shared: [area ids and files]}; [] under skip collisions>
```

**Step 1 — read the thread.** Fetch every comment on the ticket, every page. The comment tool differs by connection shape (map-repo spec §5.0): on `plugin:atlassian:atlassian` it is `listJiraIssueComments` via `discover` then `executeRead({name, cloudId, inputs})`, with `cloudId` top-level; on the classic connection it is the `comment` field of `getJiraIssue`. The agent prompt names both and uses whichever the session exposes. A failed thread read is not fatal: continue, and set `"thread_read": false` in the output so the orchestrator can say so.

**Step 2 — audit.** Start from the map slice, then read the code itself. Apply the rubric:

| Category | Looks for |
|-|-|
| `requirement-gap` | The code has a case the ticket skips: another entry point to the same flow, a role or permission check, existing records that need a backfill, a failure path, a feature flag, per-tenant or per-site config, a status value |
| `code-conflict` | The ticket asks for behavior existing code contradicts: a validation, a constant, a business rule elsewhere, an enum it does not account for |
| `blast-radius` | A consumer the change ripples into: report, export, integration, job, public API, shared component, a state transition other flows depend on |
| `collision` | Against `neighbors`: contradictory requirements, an ordering dependency, the same method rewritten two ways |

When `map_slice` is empty the auditor locates the code itself — the fallback when a mapper failed. When `unmapped_reason` says greenfield, report one `requirement-gap` finding at `minor` noting no existing code was found, and look for adjacent code the new feature will have to integrate with.

**Out of rubric:** description quality, acceptance criteria, epic placement, sibling overlap from ticket text. Those are `/pell:scope`.

**Grounding rule.** Every finding cites code the auditor read in this run — `file:line` in `evidence`. The map is a pointer, not evidence. A suspicion it could not ground in code is not a finding. The greenfield finding is the one exception; its evidence is the searches that came back empty.

**Severity** (correctness scale):

| Severity | Meaning |
|-|-|
| `blocker` | Cannot be built as written without a decision |
| `major` | Likely rework or a shipped bug if nobody answers it |
| `minor` | The developer should know; resolvable without the reporter |
| `nit` | FYI |

**Thread status.** For each finding: `new`, `asked` (raised on the thread, unanswered), or `answered` (raised and resolved on the thread). Report every finding regardless — the orchestrator decides what reaches the comment. A prior groom comment ends with `Posted from /pell:groom.`; treat its questions as `asked` unless a later comment answers them.

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
    "related_tickets": [],
    "thread_status": "new"
  }],
  "touched": ["Validators/OrderValidator.cs", "Integrations/Netsuite/OrderExport.cs"],
  "thread_read": true,
  "summary": "one or two sentences"
}
```

`question` is required for `blocker` and `major`, plain language, no file paths, answerable by the reporter. `code_note` is required at every severity and may cite paths. `related_tickets` is required for `collision`.

## 9. Merge, verdicts, drafts (inline)

**Collision dedup.** Two `collision` findings are the same when their `related_tickets` point at each other and their `evidence` shares a file. Keep the higher severity and the longer `code_note`; the finding appears under both tickets, each naming the other.

**Open findings** = `thread_status` of `new` or `asked`. `answered` findings are counted, not rendered in full.

**Verdict** per ticket, from open findings, in `/pell:scope`'s wording: `Not ready` if any blocker; `Ready with questions` if any major; else `Ready`. An auditor failure → `Not assessed`.

**Draft comment** per ticket, built from `new` findings only:

```
Pre-work code check on this ticket. A few questions before it starts:

Questions
1. <question from each new blocker, then each new major>

Code notes (for whoever picks this up)
- <code_note from each new blocker, major, and minor>
- Overlaps with <KEY>: <collision code_note>

Posted from /pell:groom.
```

Omit the Questions section when there are no new blocker/major findings, and open with `Pre-work code check on this ticket. Notes for whoever picks it up:` instead. Omit the draft entirely when both sections would be empty. Nits never reach the comment. No severities, no verdict in the comment.

## 10. Render

Table rows sorted by verdict (`Not ready`, `Ready with questions`, `Not assessed`, `Ready`), then query order; the `#` column numbers follow this order and are reused by the posting prompt.

```
## Groom — RRS backlog (25 of 38) — develop @ a1b2c3d
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

Counts in the table are open findings. Plain text only; no emoji or glyphs. Never truncate the table.

## 11. Posting

Skipped under `--dry-run` (print `--dry-run: comments not offered.`) and when no ticket has a draft (print `No comments to post.`).

```
Draft comments for 9 of 25 tickets: 1 RRS-12, 3 RRS-15, 4 RRS-20, 7 RRS-26, ...
Post to which? (all / 1,4,7 / none)
```

Accept `all`, `none`/`n`, or a comma- or space-separated list of `#` numbers; re-prompt once on anything else, then treat as `none`. Numbers without a draft are ignored with one line naming them. Echo before writing: `Posting 3 comments: RRS-12, RRS-20, RRS-26.`

Post one at a time. The comment tool differs by connection shape: `addOrEditJiraIssueComment` on `plugin:atlassian:atlassian` (omit `commentId` to add), `addCommentToJiraIssue` on the classic connection; both take `cloudId`, `issueIdOrKey`, `commentBody`, `contentFormat: "markdown"`. The command body names both. Print `<KEY>: Commented.` or `<KEY>: Failed: <error>` and continue past failures. `none` prints `Not posted.`

## 12. Side effects

| Write | When | Gate |
|-|-|-|
| Jira comment per selected ticket | after the full report, not `--dry-run` | `Post to which? (all / 1,4,7 / none)` plus the echo line |

Nothing else. No transitions, field edits, issue links (including between collided tickets), file writes, or commits.

## 13. Failure behavior

| Condition | Behavior |
|-|-|
| Not a git repo | exit (Section 5) |
| Jira search error / zero tickets | exit with the error / `No open tickets in <set>.` |
| Mapper fails or returns unparseable JSON | print `Mapping failed for <keys>: <error> — auditors will locate code themselves.`; those tickets get `map_slice: []` |
| Auditor fails or returns unparseable JSON | ticket verdict `Not assessed: <error>`; no draft; footer suggests a rerun |
| Thread read fails inside an auditor | `thread_read: false`; report line warns questions may repeat |
| A comment post fails | `<KEY>: Failed: <error>`; continue |
| User answers `n` at the cost gate | exit `Not run.` |

## 14. Operator notes

- Read-only except the selected comments. Never commit, never write files.
- Strip modifiers and the `jql "..."` string before key detection — `TODO`, `SOW`, and keys inside JQL would otherwise match.
- Every JQL call passes `view: "full"` (or `"evidence"` for the next-sprint grouping). The default `compact` view silently drops `parent`, `issuetype`, and `issuelinks`.
- Comments and the comment-post tool differ between Atlassian connection shapes; name both per role, as map-repo §5.0 does for its collection operations.
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

## 16. Delivery checklist

- Verify live via ToolSearch before writing the agents: `listJiraIssueComments` input shape and paging on `plugin:atlassian:atlassian`; the classic `getJiraIssue` `comment` field; `addOrEditJiraIssueComment` parameters; the Sprint field name under `view: "evidence"`
- `plugins/pell/commands/groom.md` — new command (Sections 1–6, 7.1, 7.3, 9–13)
- `plugins/pell/agents/ticket-code-mapper.md` — new agent (Section 7.2)
- `plugins/pell/agents/ticket-code-auditor.md` — new agent (Section 8)
- `plugins/pell/.claude-plugin/plugin.json` — minor bump to `0.20.0` (main is `0.18.0`; `0.19.0` is taken by the in-flight `four-pass-review` branch)
- `plugins/pell/README.md` — command list and agent list
- `README.md` — commands table and count, `### /pell:groom` section, sub-agent list
- `docs/specs/2026-05-27-pell-skills-architecture.md` §12 — add `groom`, `ticket-code-mapper`, `ticket-code-auditor` to Built
- `CLAUDE.md` "Repo context convention" — nine consumer commands become ten; add `groom` to the list
- `claude plugin validate ./plugins/pell`, then `/plugin marketplace update pell-skills` + `/reload-plugins`
- Live validation on a real Pell project: `--dry-run` on a 3–5 ticket epic; spot-check cited `file:line` references against the code; exercise each of the four modes once; post one comment, rerun, confirm its questions come back as `asked` and are not re-drafted

## 17. Out of scope (v1)

- A Bitbucket code source (`use bitbucket`) for grooming without a checkout.
- Caching the code map to disk for reuse across runs.
- Saving the report to a file.
- Linking collided tickets in Jira (`relates to`); the comments cross-reference instead.
- Transitioning tickets or setting a "Needs Info" status.
- Auditing sub-tasks individually, and auditing epics against code.
- Running `/pell:scope`'s text rubric inside groom.
