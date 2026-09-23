---
description: Walk a set of Jira tickets (an epic's open children, a sprint, a JQL query or key list, or the backlog), map the code they touch, and flag requirement gaps, code conflicts, blast radius, and cross-ticket collisions. Renders every draft comment first, then posts only to the tickets you pick and offers relates-to links between collided tickets. Read-only until then.
argument-hint: "[EPIC-KEY | KEY... | PROJECT-KEY [sprint | next sprint] | jql \"<query>\"] [all | skip collisions | --dry-run | --verbose]"
---

You are running **`/pell:groom`**. Walk a set of Jira tickets, read the code each one would touch, and flag where the code makes the ticket harder than it reads — a second entry point the ticket never mentions, a validation rule it contradicts, a report or integration it silently ripples into, another ticket in the same batch that rewrites the same method a different way. Draft one comment per ticket — plain-language questions for the reporter, then code notes for whoever picks it up — and post only the ones selected. Read-only against Jira and the repo: the only writes are Jira comments to the tickets selected and `Relates` links between the collision pairs selected, both offered after the full report renders; `--dry-run` suppresses both offers.

The user passed: `$ARGUMENTS`

## Step 1 — Parse arguments

Work through `$ARGUMENTS` in this order. Strip each recognized piece before the next step sees the text — a JQL string or a modifier word can otherwise match the key or project regex below.

**Modifiers** (case-insensitive; strip as found):

| Modifier | Effect |
|-|-|
| `all` | `all = true` — lift the 25-ticket cap |
| `skip collisions` | `skip_collisions = true` — pass no neighbors to auditors; omit the Collisions section |
| `--dry-run` | `dry_run = true` — run everything, render every draft, never offer to post or link |
| `--verbose` | `verbose = true` — print the merged code map and each agent's raw summary |
| `--reset` | Nothing to reset beyond the shared `jira.cloud_id`. Print `Nothing to reset for /pell:groom.` and continue |

**Mode, from what is left:**

1. `jql "<query>"` (single or double quotes) → `mode = jql`, `jql = <captured text>`. Strip the whole token before the checks below — a JQL string contains keys that would otherwise match.
2. Otherwise `next sprint` → `mode = sprint`, `sprint_target = next`; otherwise `sprint` → `mode = sprint`, `sprint_target = active`.
3. Otherwise every match of `\b[A-Z][A-Z0-9]+-\d+\b` → `keys` (a list). One or more matches → `mode = keys` for now; Step 5 fetches them and resolves this to `epic` (a lone Epic) or `key_list` (expanding any Epics among several).
4. Otherwise the first match of `\b[A-Z][A-Z0-9]+\b` → `project_key`, `mode = backlog`.
5. Otherwise → `mode = menu`.

Keys win over a bare project token — check them first. Sprint mode with no `project_key` left in the text resolves the project the same way as the menu, below. No keys, no project key, no JQL, no sprint word → the menu.

**Resolving a project key without one in the text** (sprint mode and the menu): `docs/pell/context.md`'s `project_key` or default project, else the project prefix of the branch key (`git branch --show-current`, matched against `\b[A-Z][A-Z0-9]+-\d+\b`), else ask. Step 3 loads `docs/pell/context.md` formally for the rest of the run; reading it here too, if it's needed this early, is fine.

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

Run `git rev-parse --show-toplevel` → `repo_root`. On failure, exit: `/pell:groom reads the code — run it from a checkout of the target repo.`

Record `branch = git branch --show-current` and `head = git rev-parse --short HEAD`. When `branch` is not `develop`, `main`, or `master`, print `Checkout is on <branch>, not develop — findings reflect that branch.` When `git status --porcelain` is non-empty, print `Working tree has uncommitted changes — they are included in the read.`

Collect whatever prints into `preflight_lines` for the report header.

## Step 5 — Resolve the ticket set

**Mode → JQL.**

| Mode | JQL |
|-|-|
| `epic` | `parent = <keys[0]> AND statusCategory != Done AND issuetype not in subTaskIssueTypes() ORDER BY Rank ASC` |
| `keys` (key list) | `key in (<keys, comma-separated>)` |
| `sprint` (active) | `project = <project_key> AND sprint in openSprints() AND statusCategory != Done AND issuetype not in subTaskIssueTypes() AND issuetype != Epic ORDER BY Rank ASC` |
| `sprint` (next) | `project = <project_key> AND sprint = "<sprint name>" AND statusCategory != Done AND issuetype not in subTaskIssueTypes() AND issuetype != Epic ORDER BY Rank ASC` |
| `backlog` | `project = <project_key> AND statusCategory = "To Do" AND issuetype not in subTaskIssueTypes() AND issuetype != Epic ORDER BY Rank ASC` |
| `jql` | `<jql>` verbatim — no exclusions added, no `ORDER BY` added |

`set_description`, used below and in the cost gate: `epic` → `<keys[0]>'s open children`; `key_list` → `the tickets you listed`; `sprint` active → `the active sprint`; `sprint` next → `the next sprint (<sprint name>)`; `backlog` → `the <project_key> backlog`; `jql` → `your JQL query`.

**Fetch.** `searchJiraIssuesUsingJql` with `cloudId`, the mode's JQL, `maxResults: 100`, `view: "full"`, `responseContentFormat: "markdown"`, `fields: ["summary", "description", "status", "issuetype", "priority", "labels", "components", "parent", "issuelinks"]`. `view: "full"` is required — the default `compact` view drops `parent`, `issuetype`, and `issuelinks` even when listed. Page with `nextPageToken` until `isLast`; unless `all`, stop requesting further pages once more than 25 tickets have accumulated. `total_found` = the number of tickets accumulated when paging stops. `tickets` = the first 25 of them in query order, unless `all` (then all of them), each reduced to `{key, summary, description, type: issuetype.name, status: status.name, priority: priority.name or null, labels, components, parent, issuelinks}`.

**Keys path** (`mode` starts as `keys`). Run the Fetch above with JQL `key in (<keys>)`.
- Exactly one key, and its `type = "Epic"` → discard this result; `mode = epic`; rerun the Fetch with the `epic` JQL above, using that key as `<keys[0]>`.
- Otherwise → `mode = key_list`. For each returned ticket whose `type = "Epic"`, run one more Fetch with the `epic` JQL for that key and fold its tickets into the set in place of the Epic itself — an Epic is never graded, only its children are.

**Next sprint** (`sprint_target = next`). Before the Fetch above, run one grouping query: `searchJiraIssuesUsingJql` with `cloudId`, `jql: "project = <project_key> AND sprint in futureSprints() AND statusCategory != Done AND issuetype not in subTaskIssueTypes() AND issuetype != Epic ORDER BY Rank ASC"`, `maxResults: 100`, `view: "evidence"`. Read each result's `fields.customFields.Sprint.value[]` (`.name`, `.state`, `.startDate`) and group by sprint name.
- One sprint → use its name.
- More than one → list them in start-date order and ask:
  ```
  <project_key> has more than one upcoming sprint:
  1. <name> (starts <startDate>)
  2. <name> (starts <startDate>)
  Which one? (number)
  ```
Then run the Fetch above with that sprint's name in the `sprint` mode (next) JQL.

**Cap.** Zero tickets → exit `No open tickets in <set_description>.`; in sprint mode append ` (<project_key> may not use sprints — try the backlog or an epic.)`. A Jira error → exit with it: `Jira search failed: <error>.`

Comments are not fetched here — each auditor reads its own thread later, so a batch of long threads never lands in this context.

## Step 6 — Cluster

Group `tickets` into clusters of at most 8, by the first signal that applies: same `parent` epic; then a shared `component` or `label`; then your own read of `summary` and `description` for what remains. A group larger than 8 splits by the next signal, then by rank (query order). Epic mode usually yields one or two clusters. `clusters` = the resulting list of lists of ticket keys.

## Step 7 — Cost gate

Prompted only when `tickets` has more than 5 entries; at 5 or fewer, print the plan lines below and continue without asking. Runs under `--dry-run` too — `--dry-run` suppresses writes, never spend.

```
Found <total_found> tickets in <set_description><cap note>.
Grooming maps the code in ~<len(clusters)> clusters, then audits each ticket: ~<len(clusters)> mapping + <len(tickets)> audit agents.
Checkout: <branch> @ <head>.
Proceed? (y/n)
```

`<cap note>` = ` (capped at 25 by rank; say "all" for every one)` when `tickets` was capped (`total_found > len(tickets)`); omit it (and the parenthesis) otherwise.

On `n`, exit: `Not run.`
