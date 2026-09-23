---
description: Walk a set of Jira tickets (an epic's open children, a sprint, a JQL query or key list, or the backlog), map the code they touch, and review each as a technical architect and business analyst — requirement gaps, code conflicts, blast radius, cross-ticket collisions, better approaches, and missed business requirements. Renders every draft comment first, then posts only to the tickets you pick and offers relates-to links between collided tickets. Read-only until then.
argument-hint: "[EPIC-KEY | KEY... | PROJECT-KEY [sprint | next sprint] | jql \"<query>\"] [all | skip collisions | --dry-run | --verbose]"
---

You are running **`/pell:groom`**. Walk a set of Jira tickets, read the code each one would touch, and flag where the code makes the ticket harder than it reads — a second entry point the ticket never mentions, a validation rule it contradicts, a report or integration it silently ripples into, another ticket in the same batch that rewrites the same method a different way. It also reads each ticket as a technical architect and a business analyst, surfacing better approaches the codebase already supports and business requirements the ticket never considered. Draft one comment per ticket — plain-language questions for the reporter, suggested approaches for the team, then code notes for whoever picks it up — and post only the ones selected. Read-only against Jira and the repo: the only Jira writes are comments to the tickets selected and `Relates` links between the collision pairs selected, both offered after the full report renders; `--dry-run` suppresses both offers.

The user passed: `$ARGUMENTS`

## Step 1 — Parse arguments

**Checkout first.** Before parsing anything — before the menu, any prompt, or any Jira call — run `git rev-parse --show-toplevel`. On failure, exit: `/pell:groom reads the code — run it from a checkout of the target repo.` On success, keep the path as `repo_root`.

Work through `$ARGUMENTS` in this order. Strip each recognized piece before the next step sees the text — a JQL string or a modifier word can otherwise match the key or project regex below.

**JQL, before anything else.** `jql "<query>"` (single or double quotes) → `mode = jql`, `jql = <captured text>`. Strip the whole token before modifiers are read, so a word inside the query is never taken for a modifier, a sprint keyword, or a key — `jql "summary ~ 'all'"` does not set `all`.

**Modifiers** (case-insensitive; strip as found in what is left):

| Modifier | Effect |
|-|-|
| `all` | `all = true` — lift the 25-ticket cap |
| `skip collisions` | `skip_collisions = true` — pass no neighbors to auditors; omit the Collisions section |
| `--dry-run` | `dry_run = true` — run everything, render every draft, never offer to post or link |
| `--verbose` | `verbose = true` — print the merged code map and each agent's raw summary |
| `--reset` | Nothing to reset beyond the shared `jira.cloud_id`. Print `Nothing to reset for /pell:groom.` and continue |

**Mode, from what is left** (skip when `mode = jql` — mode resolution is done):

1. `next sprint` → `mode = sprint`, `sprint_target = next`; otherwise `sprint` → `mode = sprint`, `sprint_target = active`. Strip the matched phrase either way, then keep going — the sprint keyword only fixes `sprint_target`; it does not consume the project key, so `RRS next sprint` must still yield `project_key = RRS` in the next step, not fall through to the branch/context default.
2. Every match of `\b[A-Z][A-Z0-9]+-\d+\b` in what's left → `keys` (a list).
3. Otherwise, only when step 2 found no keys, the first match of `\b[A-Z][A-Z0-9]+\b` → `project_key`.
4. When `mode` is still unset (step 1 found no sprint keyword): `keys` non-empty → `mode = keys` for now — Step 5 fetches them and resolves this to `epic` (a lone Epic) or `key_list` (expanding any Epics among several); otherwise `project_key` set → `mode = backlog`; otherwise → `mode = menu`.

Keys win over a bare project token — step 3 only runs when step 2 found none. Sprint mode (`mode` already set by step 1) uses whatever `project_key` step 3 found in the remaining text; when step 3 found none, resolve the project the same way as the menu, below. No keys, no project key, no JQL, no sprint word → the menu.

**Resolving a project key without one in the text** (sprint mode and the menu): the project key from `docs/pell/context.md` when it records exactly one `## Jira — <KEY>` section; otherwise the project prefix of the branch key (`git branch --show-current`, matched against `\b[A-Z][A-Z0-9]+-\d+\b` — an empty result, on a detached HEAD, is no match); otherwise ask. Step 3 loads `docs/pell/context.md` formally for the rest of the run; reading it here too, under the same missing-or-unreadable rules, is fine.

**Menu** (`mode = menu`): resolve `project_key` as above, then print:

```
Groom which tickets in <project_key>?
1. An epic's open children
2. The active sprint or the next sprint
3. A JQL query or a list of keys
4. The backlog (To Do, by rank)
```

Options 1–3 ask one follow-up and feed its answer back through the parsing above:
1. "Which epic?" → the answer's key becomes `keys = [<key>]`, `mode = keys`.
2. "Active sprint, or next?" → `mode = sprint`, `sprint_target = active` or `next`.
3. "A JQL query, or a list of keys?" → a quoted string becomes `jql` (`mode = jql`); keys become `keys` (`mode = keys`).

Option 4 needs no follow-up: `mode = backlog` (already resolved via `project_key`).

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

## Step 4 — Pre-flight

`repo_root` comes from Step 1's checkout check, which has already exited when this is not a git checkout.

Record `branch = git branch --show-current` and `head = git rev-parse --short HEAD`. When `branch` is empty (a detached HEAD), set `branch = detached` — it reads that way in the cost gate, the report header, the agents' `branch:` line, and each draft's disclaimer — and print `Checkout is detached at <head> — findings reflect that commit.` Otherwise, when `branch` is not `develop`, `main`, or `master`, print `Checkout is on <branch>, not develop — findings reflect that branch.` When `git status --porcelain` is non-empty, print `Working tree has uncommitted changes — they are included in the read.`

Collect whatever prints into `preflight_lines` for the report header.

## Step 5 — Resolve the ticket set

**Mode → JQL.**

| Mode | JQL |
|-|-|
| `epic` | `parent = <keys[0]> AND statusCategory != Done AND issuetype not in subTaskIssueTypes() ORDER BY Rank ASC` |
| `keys` (key list) | `key in (<keys, comma-separated>) ORDER BY Rank ASC` |
| `sprint` (active) | `project = <project_key> AND sprint in openSprints() AND statusCategory != Done AND issuetype not in subTaskIssueTypes() AND issuetype != Epic ORDER BY Rank ASC` |
| `sprint` (next) | `project = <project_key> AND sprint = "<sprint name>" AND statusCategory != Done AND issuetype not in subTaskIssueTypes() AND issuetype != Epic ORDER BY Rank ASC` |
| `backlog` | `project = <project_key> AND statusCategory = "To Do" AND issuetype not in subTaskIssueTypes() AND issuetype != Epic ORDER BY Rank ASC` |
| `jql` | `<jql>` verbatim — no exclusions added, no `ORDER BY` added |

`set_description`, used below and in the cost gate: `epic` → `<keys[0]>'s open children`; `key_list` → `the tickets you listed`; `sprint` active → `the active sprint`; `sprint` next → `the next sprint (<sprint name>)`; `backlog` → `the <project_key> backlog`; `jql` → `your JQL query`.

**Fetch.** `searchJiraIssuesUsingJql` with `cloudId`, the mode's JQL, `view: "full"`, `responseContentFormat: "markdown"`, `fields: ["summary", "description", "status", "issuetype", "priority", "labels", "components", "parent", "issuelinks"]`, and a page size set by `all`:
- Unless `all`: `maxResults: 26` — one past the cap, enough to know whether more than 25 exist. One page is normally the whole Fetch; only if a page comes back with `isLast` false and 25 or fewer tickets accumulated, request the next page (`nextPageToken`) until more than 25 have accumulated or `isLast`.
- With `all`: `maxResults: 100`, paging with `nextPageToken` until `isLast`.

`view: "full"` is required — the default `compact` view drops `parent`, `issuetype`, and `issuelinks` even when listed. A Fetch is **complete** when its last page had `isLast` true. Reduce each ticket to `{key, summary, description, type: issuetype.name, status: status.name, priority: priority.name or null, labels, components, parent, issuelinks}`, with `issuelinks` reduced to `[{type, key}]` — the link type's `name` and the linked issue's key (from `inwardIssue` or `outwardIssue`, whichever the link carries).

**Keys path** (`mode` starts as `keys`). Run the Fetch above with JQL `key in (<keys>) ORDER BY Rank ASC`.
- Exactly one key, and its `type = "Epic"` → discard this result; `mode = epic`; rerun the Fetch with the `epic` JQL above, using that key as `<keys[0]>`.
- Otherwise → `mode = key_list`. For each returned ticket whose `type = "Epic"`, run one more Fetch with the `epic` JQL for that key and fold its tickets into the result in place of the Epic itself — an Epic is never graded, only its children are.

**Next sprint** (`sprint_target = next`). Before the Fetch above, run one grouping query: `searchJiraIssuesUsingJql` with `cloudId`, `jql: "project = <project_key> AND sprint in futureSprints() AND statusCategory != Done AND issuetype not in subTaskIssueTypes() AND issuetype != Epic ORDER BY Rank ASC"`, `maxResults: 50`, `view: "evidence"`. Read each result's `fields.customFields.Sprint.value[]` (`.name`, `.state`, `.startDate`), keep only the entries whose `state` is `"future"` — the field also lists closed and active sprints a ticket passed through — and group by sprint name.
- None → treat as zero tickets (below), with `set_description` = `the next sprint`.
- One sprint → use its name.
- More than one → list them in start-date order and ask:
  ```
  <project_key> has more than one upcoming sprint:
  1. <name> (starts <startDate>)
  2. <name> (starts <startDate>)
  Which one? (number)
  ```
Then run the Fetch above with that sprint's name in the `sprint` mode (next) JQL.

**Ticket set.** `found` = the tickets the Fetches returned, in query order — a lone Epic's discarded result excluded, and for `key_list` each Epic replaced in place by its children — de-duplicated by key, keeping the first occurrence — an Epic listed beside one of its own children yields that child once. `tickets` = the first 25 of `found`, unless `all` (then all of it). `total_found` = `len(found)` when every Fetch that fed it was complete; otherwise the literal text `more than 25`. `capped` = `all` is not set and `found` holds more than 25 tickets.

**Empty or failed.** Zero tickets in `found` → exit `No open tickets in <set_description>.`; in sprint mode append ` (<project_key> may not use sprints — try the backlog or an epic.)`. A Jira error → exit with it: `Jira search failed: <error>.`

Comments are not fetched here — each auditor reads its own thread later, so a batch of long threads never lands in this context.

## Step 6 — Cluster

Group `tickets` into clusters of at most 8, by the first signal that applies: same `parent` epic; then a shared `component` or `label`; then your own read of `summary` and `description` for what remains. A group larger than 8 splits by the next signal, then by rank (query order). Epic mode usually yields one or two clusters. `clusters` = the resulting list of lists of ticket keys.

## Step 7 — Cost gate

Prompted only when `tickets` has more than 5 entries; at 5 or fewer, print the first three lines below and continue without asking. Runs under `--dry-run` too — `--dry-run` suppresses writes, never spend.

```
Found <total_found> tickets in <set_description><cap note>.
Grooming maps the code in ~<len(clusters)> clusters, then audits each ticket: ~<len(clusters)> mapping + <len(tickets)> audit agents.
Checkout: <branch> @ <head>.
Proceed? (y/n)
```

`<total_found>` prints as Step 5 set it — a count, or `more than 25`. `<cap note>` = ` (capped at 25 by rank; say "all" for every one)` when `capped` (Step 5) — in `jql` mode ` (capped at 25 in query order; say "all" for every one)`, since the query sets its own order; omit it (and the parenthesis) otherwise. A capped backlog reads `Found more than 25 tickets in the RRS backlog (capped at 25 by rank; say "all" for every one).`

On `n`, exit: `Not run.`

## Step 8 — Map the code

Print `Mapping <n> cluster(s)...` (`n = len(clusters)`).

For each cluster, build its dispatch `tickets` array as `{key, summary, description, components, labels}` from that cluster's entries in `tickets`. Jira returns `components` as objects (`{name, id, ...}`); for this payload only, reduce `components` and `labels` to plain arrays of their name strings — the mapper never needs the ids.

Dispatch one `ticket-code-mapper` agent per cluster via the Agent tool (`subagent_type="ticket-code-mapper"`), all agents for a batch of up to 4 clusters in a single message so they run concurrently; a fifth cluster and beyond wait for the next batch. Dispatch prompt, labeled lines:

```
repo_root: <repo_root>
branch: <branch> @ <head>
tickets: <JSON array of {key, summary, description, components, labels} for this cluster>
```

Parse the trailing JSON from each agent's response. On failure or unparseable JSON, print `Mapping failed for <keys>: <error> — auditors will locate code themselves.` (`<keys>` = that cluster's ticket keys, comma-separated) and treat the cluster's result as `{areas: [], unmapped: []}` — its tickets carry an empty map slice into Step 10 and each auditor locates the code itself.

When `verbose`, print each mapper's `summary`.

## Step 9 — Merge the map and find collision candidates

Concatenate every cluster's `areas` and `unmapped` from Step 8 into one merged map. Namespace each area's `id` by its cluster (`c<n>/<id>`, `n` = the cluster's 1-based position in `clusters`) so two mappers' ids never collide.

Build `file_index: file → set(tickets)` from every area's `files` plus the file part of each `entry_points` and `rules` entry. A file is **broad** when the run has at least 6 tickets and the file maps to more than half of them (a DbContext, a base controller); broad files stay in the index but do not create candidates on their own.

**Collision candidates** — unordered ticket pairs that share an area id or a non-broad file. For each ticket, keep at most 5 neighbors, those sharing the most files first. `skip_collisions` → no candidates.

When `verbose`, print the merged map.

## Step 10 — Audit each ticket

Print `Auditing <n> ticket(s)...` (`n = len(tickets)`).

Dispatch one `ticket-code-auditor` agent per ticket via the Agent tool (`subagent_type="ticket-code-auditor"`), all agents for a batch of up to 6 tickets in a single message so they run concurrently. Dispatch prompt, labeled lines:

```
cloudId: <cloudId>
repo_root: <repo_root>
branch: <branch> @ <head>
ticket: <JSON — key, summary, description, type, status, labels, components, parent {key, summary}, issuelinks [{type, key}]>
map_slice: <JSON array of the full area objects (from Step 9's merged map) that list this ticket; [] if none>
unmapped_reason: <this ticket's reason from the merged unmapped list, or none>
neighbors: <JSON array of {key, summary, description truncated to about 500 characters, shared: [area ids and files]} for this ticket's collision candidates; [] under skip_collisions>
```

`ticket` is this ticket's own entry from `tickets` (Step 5's shape, `issuelinks` already reduced to `[{type, key}]`) — unlike Step 8's mapper payload, `components` and `labels` pass through as Jira returned them. Each neighbor's `description` is cut to about its first 500 characters so the payload stays bounded however long the neighbors' descriptions run.

Parse the trailing JSON from each agent's response: `findings`, `thread_read`, `thread_overlaps` (an object of ticket key → `asked` or `answered`; treat missing as `{}`), and `summary`. On failure or unparseable JSON, that ticket's verdict is `Not assessed: <error>` — it still gets a table row and a `#`, but no findings, no severity sections, and no draft (Steps 11–12).

When `verbose`, print each auditor's `summary`.

## Step 11 — Merge findings, verdicts, drafts

A ticket whose auditor failed (Step 10) is **not assessed**: it has no findings for rendering, no collision items, no severity counts, and no draft, and every per-ticket computation below skips it. A partner's collision with it still counts on the partner's side.

**Collision pairs.** Under `skip_collisions`, `collision_pairs` is empty and no collision items are built; skip to Findings for rendering. Otherwise, from every `collision` finding of every auditor, take one `(owner, related)` pair per key in its `related_tickets` — `owner` = the ticket whose auditor produced the finding. Drop any `related` key that is not in `tickets` or that equals `owner`. `collision_pairs` = one entry per unordered pair (`{A, B}` and `{B, A}` are the same entry), recording:
- both keys;
- a **reference finding** — among every collision finding that produced this pair, from either side, the one with the highest severity; on a tie, the one with the longer `code_note`. Its `severity`, `title`, `evidence`, `question`, and `code_note` are what both tickets show for this collision;
- each side's own **collision status**: the `thread_status` of that side's own auditor's collision finding naming the other ticket (when several do: `new` if any is `new`, else `asked` if any is `asked`, else `answered`); else, when that side's auditor did not flag the other, its `thread_overlaps[<other key>]` from Step 10; else `new`.

`collision_pairs` feeds Step 12's Collisions section and `Collides with` column, and Step 14 uses it unchanged.

**Collision items.** For each assessed ticket, one item per `collision_pairs` entry that involves it, carrying the pair's reference finding's `severity`, `title`, `evidence`, `question`, and `code_note` (category stays `collision`), the *other* ticket's key from the pair, and this ticket's own collision status from that pair as its `thread_status`.

**Findings for rendering.** Per assessed ticket: its own auditor findings, excluding raw `collision` findings, plus its collision items (just above). Every per-ticket computation from here on — open findings, the verdict, the table's severity counts, the severity subsections, the "Already on the thread" count, and the draft — uses this one list, never the raw auditor findings. A collision only the partner's auditor flagged reaches this ticket only through its collision item, and it reaches it everywhere a finding would.

**Open findings** = entries in a ticket's findings for rendering whose `thread_status` is `new` or `asked`. `answered` entries are counted, not rendered in full.

**Verdict** per assessed ticket, from its open findings, in `/pell:scope`'s wording: `Not ready` if any is `blocker`; else `Ready with questions` if any is `major`; else `Ready`. A not-assessed ticket keeps `Not assessed: <error>` instead.

**Draft comment** per assessed ticket, built from its `new` findings for rendering (never `asked` or `answered` — those already had their turn):

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

Section contents (drawn from findings for rendering, above, so a collision item behaves exactly like any other finding at its severity):
- **Questions** — the non-null `question` from every new `blocker` and `major` finding (any category, including collision items), then the non-null `question` from every new `minor` `business-gap` finding, in that order, numbered. A finding with a null `question` (an `approach` finding may have none) adds nothing here.
- **Suggested approach** — the `suggestion` from every new `approach` finding, one bullet each.
- **Code notes** — one bullet per non-empty `code_note` among new `blocker`, `major`, and `minor` findings; a collision item among them bullets as `Overlaps with <KEY>: <code_note>` instead of the plain form, where `<KEY>` is the other ticket carried on that collision item — never this ticket's own key. Keep the `Overlaps with <KEY>:` prefix exact: on a re-run, auditors read it to recognize an overlap already posted.

The disclaimer line (`Generated by Claude (AI) from a read of the code on <branch> @ <head>. Verify before acting.`) appears on every draft, directly above the marker. `Posted from /pell:groom.` stays the very last line — auditors match it to recognize prior groom comments on a re-run.

Omit any section that would be empty. When the Questions section is omitted, open with `Pre-work code check on this ticket. Notes for whoever picks it up:` instead of the two-sentence opening above. Omit the draft entirely when all three sections would be empty — no disclaimer, no marker, nothing to post. Nits never reach the comment, in any category, and neither do `answered` or `asked` findings. No severities and no verdict appear in the comment.

## Step 12 — Render

Sort tickets by verdict — `Not ready`, `Ready with questions`, `Not assessed`, `Ready`, in that order — then by query order within each verdict. The `#` column numbers this order; `rows` = the resulting list, one entry per ticket as `{#, key, verdict, draft}` (`draft` = the ticket's draft text, or none) — carried into Step 13 for the posting prompt.

```
## Groom — <set_description> (<len(tickets)> of <total_found>) — <branch> @ <head>
<preflight_lines, when any>

| # | Ticket | Verdict | Blk | Maj | Min | Nit | Collides with |
|-|-|-|-|-|-|-|-|
| 1 | RRS-12 Raise line-item cap | Not ready | 1 | 2 | 0 | 1 | RRS-20 |
| 2 | RRS-14 Guest checkout email | Ready | 0 | 0 | 1 | 0 | — |

### Collisions
- RRS-12 x RRS-20 [blocker] — both rewrite OrderService.Submit; RRS-12 assumes synchronous submit, RRS-20 moves it to a queue.
_None._ when empty; omitted under skip_collisions

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

Detail per section:
- **Header.** `<set_description>` and `<total_found>` come from Step 5 (`<total_found>` is a count or `more than 25`), `<branch> @ <head>` and `<preflight_lines>` from Step 4.
- **Table.** One row per `rows` entry, in that order. `Blk`/`Maj`/`Min`/`Nit` are open-finding counts (Step 11, from findings for rendering — so a collision only the partner's auditor flagged still counts here) for that ticket, by severity, regardless of category. A `Not assessed` row shows `—` in all four count columns. `Collides with` lists every other ticket key paired with this one in `collision_pairs`, comma-separated, or `—` when none.
- **Collisions.** One line per entry in `collision_pairs`: `<A> x <B> [<severity>] — <code_note>` using the pair's reference finding. `_None._` when `collision_pairs` is empty; the whole section is omitted under `skip_collisions` instead.
- **Unmapped.** One line per entry in the merged `unmapped` list (Step 9): `<key> — <reason>`. Omit the whole section when that list is empty.
- **Per-ticket sections**, one per `rows` entry, in table order, headed `### <#>. <key> — <summary>`. Next line: `Verdict: <verdict>  ·  Areas: <names of the areas in this ticket's map_slice (Step 10), comma-separated>` — drop the `· Areas: ...` clause when the ticket has no mapped areas. A `Not assessed` ticket's section is that heading and its `Verdict: Not assessed: <error>` line only — no severity subsections, thread lines, or draft.
- **Severity subsections** (`#### Blockers`, `#### Major`, `#### Minor`, `#### Nits`) list this ticket's *open* findings for rendering (Step 11) of that severity, in the order they appear in that list — a collision item renders here too, at its reference finding's severity. Each bullet: `<title>. <evidence, joined by "; ">.`; when `question` is set, an indented `Question: <question>` line follows; for an `approach` finding, an indented `Suggestion: <suggestion>` line follows that. `_None._` when a subsection is empty.
- **Thread lines.** `n` = this ticket's findings for rendering with `thread_status` of `answered` or `asked`; `a` = the `answered` count, `b` = the `asked` count. Print `Already on the thread: <n> (<a> answered, <b> asked, not repeated).` unless `n` is 0. Print `Thread not read — questions may repeat earlier comments.` when this ticket's auditor returned `thread_read: false`.
- **Draft comment.** The Step 11 draft, or `Nothing to post.` when there is none.
- **Footer**, printed once at the very end, after every ticket section: `---` then `Description and acceptance-criteria readiness: /pell:scope <KEY>. Start one: /pell:from-ticket <KEY>.` (literal `<KEY>` — a generic pointer, not a specific ticket). When any ticket's verdict is `Not assessed`, append a line: `Not assessed: rerun with /pell:groom <keys>` where `<keys>` lists those tickets' keys, space-separated.

Plain text only — no emoji or glyphs. Never truncate the table, regardless of ticket count.

## Step 13 — Offer to post

Skip under `dry_run`: print `--dry-run: comments not offered.` Skip when no entry in `rows` has a draft: print `No comments to post.`

List every row with a draft, in table order, then prompt:

```
Draft comments for <n> of <total> tickets: <#> <KEY>, <#> <KEY>, ...
Post to which? (all / 1,4,7 / none)
```

`<n>` = the count of `rows` entries with a draft; `<total>` = `len(rows)`.

Accept `all`; `none` or `n`; a comma- or space-separated list of `#` numbers. Anything else → re-prompt once; if the retry is also none of these, treat it as `none`. A number naming a row with no draft is ignored; print one line for it: `<#> has no draft, skipped.`

Echo before any write: `Posting <n> comments: <KEY>, <KEY>.`

Post one at a time. The comment tool differs by connection shape — name both, by role: `addOrEditJiraIssueComment` on `plugin:atlassian:atlassian` (omit `commentId` to add a new comment); `addCommentToJiraIssue` on the classic connection. Both take `cloudId`, `issueIdOrKey`, `commentBody`, `contentFormat: "markdown"` — markdown is used on both (the classic tool accepts `markdown` or `adf`; the plugin tool `markdown` or `html`). `commentBody` is the ticket's draft (Step 11) exactly as rendered — it already carries the AI disclaimer line and the marker line; do not add or strip lines before posting.

Print `<KEY>: Commented.` or `<KEY>: Failed: <error>` per ticket, continuing past failures. `none` → print `Not posted.`

## Step 14 — Offer to link collided tickets

Runs after Step 13, whether or not any comment was posted. Candidate pairs = `collision_pairs` (Step 11) — every collision, whether one auditor or both flagged it, one entry per unordered pair.

Skip a pair already linked — either ticket's `issuelinks` (Step 5) names the other, in any link type — with one line: `Already linked, skipped: <A> / <B>.` Skip silently, no prompt, when no candidate pairs remain after that filter. Under `dry_run`, print `--dry-run: links not offered.` instead of filtering or prompting.

List each remaining pair, one numbered line, then prompt:

```
Link collided tickets as "relates to"?
1 <A> relates to <B>
2 <A> relates to <B>
Link which? (all / 1,2 / none)
```

Input handling matches Step 13: `all`; `none`/`n`; a comma- or space-separated list of `#` numbers; anything else → re-prompt once, then treat as `none`.

Echo before any write: `Linking <n> pairs: <A> relates to <B>, <A> relates to <B>.`

Link one pair at a time, type `Relates`, `inwardIssue` = the pair's first key, `outwardIssue` = the second — `Relates` is symmetric, so the order carries no meaning. The link tool differs by connection shape — name both, by role: `createJiraIssueLink` on `plugin:atlassian:atlassian`, called via `executeWrite({name: "createJiraIssueLink", cloudId, inputs: {linkType: "Relates", inwardIssue, outwardIssue}})` — `cloudId` is a top-level argument to `executeWrite`, not nested in `inputs`; `createIssueLink` on the classic connection, with `cloudId`, `type: "Relates"`, `inwardIssue`, `outwardIssue`. The link-type parameter's name differs between the two: `linkType` on the plugin tool, `type` on the classic tool. Never pass either tool's optional `comment`. Never propose `Blocks` or any other link type — auditors do not reliably state which ticket must land first, so an ordering dependency stays in the comment text, not a link.

Print `<A> relates to <B>: Linked.` or `<A> relates to <B>: Failed: <error>` per pair, continuing past failures. `none` → print `Not linked.`

## Step 15 — Exit

End the response here. Do not transition any ticket, edit any field, create any link other than the `Relates` pairs selected in Step 14, or commit. The one file write is Step 2 caching `jira.cloud_id` in `~/.claude/pell-config.json` (shared config, the same cache `/pell:scope` writes); write no other file.

## Operator notes

- Read-only except the selected comments (Step 13) and the selected `Relates` links (Step 14) — the only Jira writes. The one file write is Step 2 caching `jira.cloud_id` in `~/.claude/pell-config.json` (shared config, same as `/pell:scope`). No transitions, field edits, other link types, other file writes, or commits.
- Comment-read, comment-post, and link tools differ between Atlassian connection shapes, and so do their parameter names (`linkType` on the plugin's `createJiraIssueLink`, `type` on the classic `createIssueLink`). Name both per role.
- Comment bodies containing @mentions come back as HTML (`appliedContentFormat: "html"`) even when markdown is requested; auditors read either format.
- Capture the `jql "..."` string first, then strip modifiers, both before key detection — `TODO`, `SOW`, keys, and modifier words inside JQL would otherwise match.
- Every JQL call passes `view: "full"` (or `"evidence"` for the next-sprint grouping). The default `compact` view silently drops `parent`, `issuetype`, and `issuelinks`.
- Dispatch each phase's agents in a single message per batch so they run concurrently: up to 4 mappers, up to 6 auditors.
- Say what is happening before each phase (`Mapping 4 clusters...`, `Auditing 25 tickets...`); do not sit silent through a long run.
