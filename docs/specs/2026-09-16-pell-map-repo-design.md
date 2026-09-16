# `/pell:map-repo` — Design Spec

Status: approved design, not yet implemented
Date: 2026-09-16
Related: [`2026-08-28-pell-scope-design.md`](2026-08-28-pell-scope-design.md), [`2026-05-27-pell-skills-architecture.md`](2026-05-27-pell-skills-architecture.md)

## Purpose

Every Claude session that touches a Pell repo re-derives the same facts: which Jira
project this repo belongs to, what the transitions are actually called, which
Confluence space holds the architecture doc, where the requirements live in Drive,
what the Bitbucket slug is. That rediscovery costs tokens and latency on every
session, and it silently gets things wrong — exact transition casing especially.

`/pell:map-repo` walks those systems once, writes the coordinates to a committed
`docs/pell/context.md`, and points every future session at it from the repo's own
`CLAUDE.md`.

The file holds **coordinates, not content**. It says where the sources of truth
live; it is never itself a source of truth. Synthesized Jira *content* stays in
`docs/pell/sow-<PROJECT>.md`, which `context.md` points at and never restates.

The command is also the **eager build site for that SOW** (Section 8). `/pell:scope`
currently builds it lazily, mid-task, which makes a small readiness question pay for
a full project crawl. Setup is where that cost belongs. `/pell:scope` keeps its lazy
build as a fallback, and keeps sole ownership of the staleness clock.

**Read-only against Jira, Confluence, Drive, and Bitbucket.** Every write is local
and independently `(y/n)`-gated: `docs/pell/context.md`, one
`docs/pell/sow-<KEY>.md` per discovered project, and a pointer block in the repo's
`CLAUDE.md`. The command never commits.

## 1. Invocation

```
/pell:map-repo [refresh | verify | with sow | skip sow | <PROJECT-KEY> | <url>
                | --dry-run | --verbose | --reset]
```

| Argument | Effect |
|-|-|
| (none) | Build if `context.md` is missing; otherwise print a summary with its age and offer to refresh |
| `refresh` | Full rebuild even when a current file exists |
| `verify` | Cheap drift re-check only (Section 11); no full walk |
| `with sow` | Build the SOW for every discovered project without the per-project prompt |
| `skip sow` | Suppress the SOW offer entirely |
| `<PROJECT-KEY>` | Seed a Jira project key the walk could not infer, or add a second one |
| `<url>` | Seed a Confluence space/page or Drive folder the walk could not find |
| `--dry-run` | Render everything; write nothing |
| `--verbose` | Show the agent's per-source findings and confidence reasoning |
| `--reset` | No cached config of its own. Print `Nothing to reset for /pell:map-repo.` and continue |

Arguments are freeform-first per architecture spec Section 6: parse `$ARGUMENTS` as
natural language, strip recognized modifiers, treat the remainder as seeds.

## 2. Architecture and flow

```
/pell:map-repo
  |
  +- 1. parse arguments
  +- 2. git rev-parse --show-toplevel        (fails -> exit; this command is repo-scoped)
  +- 3. load <root>/docs/pell/context.md
  |       exists, no flag  -> summary + age, offer refresh -> (declined) exit
  |       verify           -> Section 11
  |       missing|refresh  -> continue
  +- 4. dispatch repo-mapper agent           (the expensive walk, isolated context)
  +- 5. render findings; interview gaps and low-confidence fields one at a time
  +- 6. (y/n) write docs/pell/context.md          <- cheap artifact lands first
  +- 7. per project key: (y/n) build SOW -> sow-builder -> docs/pell/sow-<KEY>.md
  |                                                 patch the SOW line in context.md
  +- 8. (y/n) add or replace the pointer block in CLAUDE.md
  +- 9. render summary; remind the developer to commit every file written
```

The command/agent split mirrors `/pell:scope` -> `sow-builder`: the orchestrating
command stays short and holds every prompt, while the multi-call MCP walk runs in a
subagent whose raw tool output never enters the developer's session.

## 3. Argument parsing

Work through `$ARGUMENTS` in this order, stripping each recognized token:

1. `refresh`, `verify`, `with sow`, `skip sow`, `--dry-run`, `--verbose`, `--reset`
   (case-insensitive). `refresh` and `verify` are mutually exclusive; if both appear,
   `refresh` wins and the command says so. `with sow` and `skip sow` are likewise
   exclusive; if both appear, `skip sow` wins — the conservative reading, since it is
   the one that cannot cost three unwanted minutes.
2. Any `https://` token -> `seed_urls[]`.
3. Any remaining match of `\b[A-Z][A-Z0-9]+\b` that is not a recognized modifier ->
   `seed_project_keys[]`.
4. Remaining prose is context for the agent prompt, not a directive.

## 4. Locate and load

`repo_root` = `git rev-parse --show-toplevel`. If the command fails, exit with:

> Not in a git repository. `/pell:map-repo` maps a repo's coordinates, so run it from inside one.

`context_path` = `<repo_root>/docs/pell/context.md`.

If the file exists, parse its YAML frontmatter for `schema`, `generated_at`, and
`repo`.

- Frontmatter missing or unparseable -> print `context.md has no readable frontmatter — rebuilding.` and treat as missing.
- `schema` greater than the schema this build writes -> print `context.md is schema <n>; this build writes schema 1 — rebuilding.` and treat as missing.
- Otherwise, with no `refresh` or `verify` flag, print the summary (Section 14) with
  `generated_at` rendered as an age, then prompt:

  > `context.md` was mapped `<n>` days ago. Rebuild it? (y/n)

  On `n`, exit without changes.

There is deliberately **no expiry threshold**. Coordinates do not rot on a fixed
clock the way a synthesized SOW does, and no single cheap query detects drift across
four systems. Staleness is handled by surfacing the age on every read and by the
explicit `verify` mode, not by a timer that cries wolf.

## 5. `repo-mapper` agent

`plugins/pell/agents/repo-mapper.md`. Standard pell agent shape: `model: inherit`,
no `tools:` line (inherits the orchestrator's surface, including MCP), emits a
trailing JSON object.

**Prompt inputs**, as labeled lines:

```
repo_root: <absolute path>
seed_project_keys: [<keys or empty>]
seed_urls: [<urls or empty>]
known_cloud_id: <id from pell-config.json, or empty>
verbose: <true|false>
```

**Walk**, each step skipped gracefully when its source is unavailable:

| Source | Method | Yields |
|-|-|-|
| Bitbucket | `git remote -v` | workspace, repo slug |
| Repo | read `bitbucket-pipelines.yml` / `.github/workflows/` | CI system |
| Repo | `git symbolic-ref refs/remotes/origin/HEAD` | default base branch |
| Jira keys | `git log --oneline -200` + `git branch -a`, issue-key regex | project keys ranked by frequency |
| Atlassian | `getAccessibleAtlassianResources` — primary (skipped when `known_cloud_id` set) | cloudId, site URL |
| Jira | project issue-type metadata; visible-projects list — **indirect**, see 5.0 | project name, issue types, components |
| Jira | transitions-for-issue on sampled issues — **indirect** (Section 5.1) | exact transition names |
| Jira | `searchJiraIssuesUsingJql` — primary. `project = <K> AND issuetype = Epic AND status != Done` | active epics |
| Confluence | remote-issue-links across ~20 recent issues — **indirect** | candidate page ids, ranked by inbound link count |
| Confluence | Confluence spaces list — **indirect**, name-similarity filtered on project name | space key and id |
| Drive | the Drive file-search tool, on project name and key | candidate folder ids |
| Repo | glob `docs/pell/sow-*.md` | existing SOW paths and build dates |

### 5.0 Tool naming across Atlassian connection shapes

Verified live during implementation (Task 1 of the plan). Two differently-shaped
Atlassian MCP connections exist in the wild, and a prompt that hardcodes one
shape's names fails **silently** on the other.

This repo standardizes on `plugin:atlassian:atlassian`, and every existing pell
command stays inside that server's **primary** tool set. Three of this walk's calls
are primary there and are named directly: `getAccessibleAtlassianResources`,
`searchJiraIssuesUsingJql`, and — only when fetching a candidate page's summary for
the `covers` column — `getConfluenceContent`.

The walk deliberately never fetches a single issue by key. Transition sampling
(5.1) and the remote-link scan reach their issues through JQL, so `getJiraIssue`
has no step here despite being primary; other pell commands use it, this one does
not.

The five collection operations are **not** primary on that server. They are reached
via `discover({query})` to get an operation name, then
`executeRead({name, cloudId, inputs})` — and the operation names differ, `list*`
rather than `get*`:

| Role | `plugin:atlassian:atlassian` via discover/executeRead | Classic connection, direct |
|-|-|-|
| Visible projects | `listJiraProjects` | `getVisibleJiraProjects` |
| Project issue-type metadata | `listJiraProjectIssueTypesMetadata` | `getJiraProjectIssueTypesMetadata` |
| Transitions for an issue | `listJiraIssueTransitions` | `getTransitionsForJiraIssue` |
| Remote issue links | `listJiraIssueRemoteIssueLinks` | `getJiraIssueRemoteIssueLinks` |
| Confluence spaces | `listConfluenceSpaces` | `getConfluenceSpaces` |

**The agent prompt must name both**, per role, and use whichever the session
exposes. Naming only one is the silent-runtime-failure class this walk exists to
avoid — the same trap as hardcoding the Drive server's install-specific id.

`cloudId` is a **top-level** argument on every execute-family call, a sibling of
`name` and `inputs`, never nested inside `inputs`.

### 5.1 Transition sampling and its known limitation

The transitions the API returns for an issue depend on that issue's **current
status** and the caller's **permissions**. No single issue reveals the whole
workflow.

The agent samples up to four issues chosen to sit in **distinct statuses** (one JQL
per distinct status value, `maxResults: 1`), unions the returned transition names,
and reports which named roles (`start`, `in_review`, `done`) it could confirm.

Any role it could not observe is emitted in `low_confidence`, and the written file
marks it explicitly rather than guessing. `in_review: unverified` is a correct and
useful statement; a fabricated transition name is neither.

### 5.2 Confidence channels

The agent returns three distinct channels, and the distinction is the point:

- `coordinates` — **proven**. The API returned it directly.
- `low_confidence` — **inferred**. Ranked, heuristic, or partial. Must be confirmed
  by the developer before it is written.
- `gaps` — **absent**. Could not be determined at all, with a concrete question.

Inference must never harden into a committed file that future sessions trust.
Anything the agent reasoned its way to gets a human confirm.

### 5.3 Output contract

```json
{
  "coordinates": {
    "repository": { "workspace": "...", "slug": "...", "base_branch": "...", "ci": "..." },
    "atlassian":  { "site": "...", "cloud_id": "..." },
    "jira":       [ { "key": "RRS", "name": "...", "issue_types": [], "statuses": [],
                      "transitions": { "start": "...", "in_review": null, "done": "..." },
                      "components": [], "active_epics": [], "sow_path": "..." } ],
    "confluence": { "space_key": "...", "space_id": "...",
                    "pages": [ { "title": "...", "id": "...", "covers": "..." } ] },
    "drive":      [ { "label": "requirements", "folder_id": "...", "name": "..." } ]
  },
  "low_confidence": [ { "field": "confluence.pages", "value": [],
                        "why": "inferred from 3 inbound links; confirm" } ],
  "gaps":           [ { "field": "drive.qa_plans", "why": "no folder matched 'RRS'",
                        "ask": "Paste the Drive folder URL for QA test plans, or say skip." } ],
  "summary": "one-line outcome"
}
```

## 6. Gap interview

Render the proven findings first so the developer sees what was free. Then walk
`low_confidence` and `gaps` **one item at a time**, in that order.

- Each `low_confidence` item shows the inferred value and the reasoning, and asks for
  confirm / correct / drop.
- Each `gap` asks its `ask` string verbatim. `skip` is always a valid answer and
  leaves the field recorded under `## Gaps`.

Never batch these into a single wall of prompts. A developer who is asked six
questions at once confirms all six without reading them, which defeats the
confidence split entirely.

Under `--dry-run`, run the interview but write nothing.

## 7. `context.md` document shape

One file per repo, at `<repo_root>/docs/pell/context.md`, beside the SOW cache.
Frontmatter carries `schema`, `generated_at`, `generated_by`, and `repo`. Body
sections, in order:

| Section | Holds |
|-|-|
| preamble | the coordinates-not-content warning |
| `## Repository` | workspace, slug, base branch, branch shape, CI |
| `## Atlassian site` | site URL, cloudId |
| `## Jira — <KEY>` | issue types, workflow, exact transition names, components, active epics, SOW path. Repeated per project |
| `## Confluence` | space key and id, table of canonical pages with ids |
| `## Google Drive` | labelled folder ids |
| `## Gaps` | everything unknown, with how to resolve it |

Worked example:

    ---
    schema: 1
    generated_at: 2026-09-16T14:22:00Z
    generated_by: /pell:map-repo
    repo: pellsoftware/rrs-web
    ---

    # Repo context — rrs-web

    Coordinates only. Nothing here is a source of truth — it tells you where the
    sources of truth live. Fetch live before relying on any content.

    ## Repository
    - Bitbucket workspace: `pellsoftware`
    - Repo slug: `rrs-web`
    - Default base branch: `develop`
    - Branch shape: `<KEY>-<description>` (e.g. `RRS-1020-fix-cart`)
    - CI: Bitbucket Pipelines (`bitbucket-pipelines.yml`)

    ## Atlassian site
    - Site: `pellsoftware.atlassian.net`
    - cloudId: `dfe5fa82-885e-4fff-a83f-633a4db40961`

    ## Jira — RRS (Retail Rewards System)
    - Issue types: Epic, Story, Bug, Task, Sub-task
    - Workflow: To Do -> In Progress -> In Progress QA -> Done
    - Transition names, exactly as the API returns them:
      - start: `In Progress`
      - in_review: `IN PROGRESS QA`
      - done: `Done`
    - Components: cart, checkout, reporting
    - Active epics: RRS-900 (Checkout redesign), RRS-1100 (Reporting v2)
    - Synthesized SOW: `docs/pell/sow-RRS.md` (built 2026-08-30)

    ## Confluence
    - Space: `RRSDEV` (RRS Development), id `98304`
    - Canonical pages:

    | Page | id | Covers |
    |-|-|-|
    | RRS Architecture Overview | 131073 | service boundaries, data flow |
    | API Contracts v2 | 131090 | request/response shapes |
    | Environments and Runbooks | 131145 | deploy, rollback, on-call |

    ## Google Drive
    - Requirements: `1a2B3c...` (RRS / Requirements)
    - Design: `1d4E5f...` (RRS / Design)

    ## Gaps
    - No Drive folder found for QA test plans. Re-run `/pell:map-repo refresh` once one exists.
    - `in_review` transition unverified — no sampled issue sat in a status that offered it.

**Shape decisions:**

- **The preamble is load-bearing.** Agents reading this file will be tempted to treat
  it as current truth. That paragraph is what stops a consumer from reasoning off a
  six-month-old epic list.
- **Multi-project by repeated section.** A repo spanning RRS and FIEL gets two
  `## Jira — <KEY>` blocks in one file. Repo-level facts are singular; only tracker
  sections repeat. Deliberately unlike the SOW's per-project file: coordinates are
  small, and splitting them would force agents to guess which file to open.
- **`## Gaps` is a first-class section.** An agent must read "no QA folder identified"
  rather than infer from silence that none exists. It also tells a re-run what to
  re-ask.
- **Links to the SOW, never restates it.** The coordinate/content boundary between
  this command and `/pell:scope`.

## 8. SOW build

`/pell:map-repo` is the **eager** build site for the synthesized Statement of Work
that `/pell:scope` defines. Same `sow-builder` agent, same `docs/pell/sow-<KEY>.md`
output, same frontmatter — only the trigger moves.

**Why here.** `/pell:scope` builds lazily, mid-task: a developer asks a small
question about one ticket and instead pays for a ten-page issue crawl plus a
Confluence traversal. Setup is where a one-time cost belongs. `/pell:map-repo` also
has better inputs for the build — Section 5 has already produced the project keys
ranked by commit frequency, where `/pell:scope` must infer a single key from a branch
or an argument.

**Ownership split.** The SOW now has two build sites and one format owner:

| Concern | Owner |
|-|-|
| Document format and frontmatter | `sow-builder` agent — unchanged |
| Eager build at setup, per discovered project | `/pell:map-repo`, this section |
| Lazy build when a ticket is assessed and no cache exists | `/pell:scope` Step 4 — unchanged |
| The 14-day staleness rule and the drift query | `/pell:scope` alone — one clock, one owner |

`/pell:scope` **keeps** its lazy path. Requiring every developer to have run
`/pell:map-repo` first would make `/pell:scope` fail outright on a fresh clone, which
is worse than a slow first run.

**Flow**, after the `context.md` write (Section 9) and before the pointer offer. For
each discovered Jira project key, in frequency rank:

1. If `docs/pell/sow-<KEY>.md` exists and is under 14 days old, print
   `SOW for <KEY> is current (built <date>) — skipping.` and continue.
2. Otherwise prompt, naming the cost:

   > Build the Statement of Work for `<KEY>`? This walks every issue in the project
   > plus any linked Confluence scope docs — typically 1-3 minutes. (y/n)

3. On `y`, dispatch `sow-builder` exactly as [`2026-08-28-pell-scope-design.md`](2026-08-28-pell-scope-design.md)
   Section 9 specifies — not as a section of *this* spec — with
   `cloudId`, `project_key`, `sow_sources` (any Confluence pages this walk already
   identified as scope docs — a genuine saving over the lazy path, which starts with
   an empty list), and `deep: false`.
4. On success, write `docs/pell/sow-<KEY>.md`, then patch the `Synthesized SOW:` line
   for that project in the `context.md` just written. Single-line edit, the same
   scoped-rewrite mechanism Section 11 uses.
5. On `n` or on failure, leave the line as
   `Synthesized SOW: none — run /pell:scope <KEY>` and record it under `## Gaps`.

**One prompt per project.** A repo whose second Jira key appears in four commits must
not silently cost a second full crawl.

**Modifiers**: `with sow` builds every discovered project without the per-project
prompt; `skip sow` suppresses the offer entirely. `--dry-run` suppresses the build.

**`context.md` is written before any SOW build.** A declined, failed, or slow SOW
never costs the developer the coordinates. The cheap, high-value artifact lands
first — and the coordinates are what the `CLAUDE.md` pointer promises.

## 9. Side effects

| Write | When | Gate |
|-|-|-|
| `docs/pell/context.md` | after the interview | `Write repo coordinates to docs/pell/context.md? (y/n)` |
| `docs/pell/sow-<KEY>.md` | per discovered project, after the above | own `(y/n)` per project, naming the cost, Section 8 |
| `docs/pell/context.md` SOW line | after a successful SOW build | none — covered by the SOW gate just answered |
| `docs/pell/context.md` `## Gaps` line | after a declined or failed SOW build | none — covered by the SOW gate just answered |
| `<repo_root>/CLAUDE.md` pointer block | after the SOW pass | separate `(y/n)`, Section 10 |
| `<repo_root>/CLAUDE.md` created | only when absent and the pointer was accepted | further `(y/n)` |
| `docs/pell/context.md` scoped rewrite | `verify` mode only, when drift was found | own `(y/n)`, Section 11 |

The last row is on the `verify` path, which is exclusive with every row above it:
a run either builds or verifies, never both. The two ungated `context.md` rows are
follow-on edits to a file the developer has already consented to in this run, made
as a direct consequence of the SOW answer they just gave — a second prompt for
"and now record that you said no" is noise, not consent.

The gates are **never bundled**. `CLAUDE.md` especially is a file this command does
not own, and consent to write a cache file under `docs/pell/` is not consent to edit
the repo's instruction file. The SOW gates are separate from the `context.md` gate
for a different reason: they are the only expensive ones, and a developer who wants
coordinates in ten seconds must be able to decline a three-minute crawl without
losing the rest.

`--dry-run` suppresses all three. The command never runs `git add` or `git commit` —
it prints the paths and tells the developer to commit them with their normal
workflow, matching `/pell:scope`.

## 10. `CLAUDE.md` pointer

Canonical block, inserted verbatim (shown indented here; written flush-left):

    <!-- pell:context-pointer -->
    ## Repo context

    Project coordinates — Jira keys and exact transition names, Confluence space and
    canonical page ids, Drive folder ids, Bitbucket slug — are mapped in
    `docs/pell/context.md`. Read it before any Jira, Confluence, or Drive lookup for
    this repo. It holds pointers, not content: fetch live before relying on anything
    it names.

**Idempotency.** Locate `<!-- pell:context-pointer -->`. If present, replace from the
marker through the end of the block — that is, up to the next `## ` heading
**after** the block's own `## Repo context` heading, or EOF if none follows. If
absent, append the block at the end of the file. Re-running never stacks duplicates.

The "after its own heading" qualifier is load-bearing. `## Repo context` is the very
next line after the marker, so a naive "replace up to the next `## `" replaces the
marker alone and leaves the stale body sitting under a duplicated heading — which is
precisely the failure acceptance case 5 exists to catch.

Show the exact text and the target path before prompting. If `CLAUDE.md` does not
exist, offer to create a minimal file containing only the pointer block, gated
separately.

This is the delivery mechanism that makes the whole feature work: `CLAUDE.md` is
auto-loaded into every session in that repo, so the coordinates reach **every** agent
— pell plugin installed or not, slash command or plain chat — at zero runtime cost.

## 11. `verify` mode

Re-checks only what is cheap and falsifiable. No full walk, no agent dispatch.

| Check | Method |
|-|-|
| Bitbucket slug, base branch | `git remote -v`, `git symbolic-ref refs/remotes/origin/HEAD` |
| Transition names | `getTransitionsForJiraIssue` on one issue per recorded project |
| Confluence page ids | `getConfluencePage` by id — resolves or 404s |
| Drive folder ids | `get_file_metadata` by id — resolves or 404s |
| SOW freshness | stat `docs/pell/sow-<KEY>.md`, read its `generated_at` |

The SOW row reports only — `verify` never rebuilds a SOW, because that is the
expensive operation this whole design moved out of the mid-task path. A stale SOW
renders as `sow-RRS.md is 31 days old. Run /pell:map-repo refresh, or "refresh" inside /pell:scope.`

Render drift as a list of `field: recorded -> actual` lines, then offer a gated
rewrite of **only the changed lines**, preserving everything else including `## Gaps`
and any hand-edits. Bump `generated_at` on write.

If nothing drifted, print `No drift. context.md verified against 4 sources.` and exit
without writing.

`verify` is the reason no expiry timer is needed: it is cheap enough to run casually.

## 12. Consumption contract

All nine commands that currently read `~/.claude/pell-config.json` gain a
`context.md` read in the same change.

**Resolution order** for any coordinate:

| Order | Source | Scope |
|-|-|-|
| 1 | explicit `$ARGUMENTS` | invocation |
| 2 | `docs/pell/context.md` | repo |
| 3 | `~/.claude/pell-config.json` | user/machine |
| 4 | live MCP discovery | — |
| 5 | prompt the developer | — |

Placing `context.md` **above** `pell-config.json` fixes a latent bug: `jira.cloud_id`
is machine-global, so a developer working across two Atlassian sites gets the wrong
one on the second repo. A repo-scoped value must win over a machine-global one.

The two files do not otherwise collide, because they answer different questions:

- `pell-config.json:jira.transitions[RRS].start` — *the developer's preference for
  which transition to use.*
- `context.md` Jira section — *the project's actual transition names and exact
  casing.*

Config picks; context.md supplies the menu and the spelling.

**Three invariants for consumers:**

1. **Consumers never write `context.md`.** Only `/pell:map-repo` writes it.
2. **Consumers never validate it.** No consumer pays validation latency. On a
   contradiction discovered incidentally, use live truth and print one line:
   `context.md is out of date on <field>. Run /pell:map-repo verify.`
3. **A bad `context.md` can never break a consumer.** Missing, unparseable, or
   unknown-`schema:` -> fall through to today's exact behavior plus one note. This
   invariant is what makes wiring nine commands at once safe.

**Canonical boilerplate.** Plugin markdown has no include mechanism, so each command
restates the read block inline. This is the same problem the "Context source
convention (reviewer agents)" section already solves: canonical wording lives in the
repo's `CLAUDE.md` as a maintainer reference, shipped bodies restate it, and the two
are kept in sync. A new `## Repo context convention` section in `CLAUDE.md` holds the
exact block, giving a schema change one place to edit and a grep target to verify
against.

## 13. Failure behavior

Two failure classes, and the distinction is the rule: a **per-source** failure
degrades to a `## Gaps` entry and the walk continues; a **total** failure, where
the walk produced nothing to interview or write, exits. Everything in the table
below except the first two rows is per-source.

| Condition | Behavior |
|-|-|
| Not a git repo | Exit. Total: the command is repo-scoped by definition. |
| `repo-mapper` returns absent or empty `coordinates` | Exit with `Could not map this repo: <summary>.` Total: there is nothing to interview about and writing an empty `context.md` would be worse than writing none. Mirrors `/pell:scope`'s `Could not build the SOW: <summary>.` |
| No git remote | Ask for workspace/slug, or skip the Repository section |
| No issue keys in 200 commits | Ask for the project key outright |
| Atlassian MCP absent or unauthed | Skip Jira and Confluence, record in `## Gaps`, continue |
| Drive MCP absent | Skip Drive, record in `## Gaps`, continue |
| Bitbucket MCP absent | Not needed — the repo section comes from local git |
| Jira project key resolves to nothing | Record in `## Gaps`, continue with other keys |
| SOW build fails or returns empty | `context.md` is already written and stays intact; record the failure in `## Gaps`; continue to the next project |
| Unknown `schema:` in existing file | Print `rebuilding`, treat as missing |

MCP handling follows architecture spec Section 4: notify, never force. A developer
without the Drive connector still gets a useful Jira, Confluence, and Bitbucket map.

## 14. Render

Build, after a successful write:

```
Mapped rrs-web.

Repository   pellsoftware/rrs-web · base develop · Bitbucket Pipelines
Atlassian    pellsoftware.atlassian.net
Jira         RRS (Retail Rewards System) — 5 issue types, 3 components, 2 active epics
             transitions: start "In Progress" · done "Done" · in_review unverified
Confluence   RRSDEV — 3 canonical pages
Drive        2 folders (requirements, design)
Gaps         2 — see the file

Wrote docs/pell/context.md
Wrote docs/pell/sow-RRS.md (127 issues · 2 epics · 1 scope doc)
Added the pointer block to CLAUDE.md

Commit all three with your normal workflow.
```

Summary-only, when a current file exists and the rebuild was declined: the same body,
headed `context.md — mapped 12 days ago.` and followed by
`Say "refresh" to rebuild, or "verify" to check it for drift.`

## 15. Operator notes

- **Privacy posture.** cloudId, space ids, page ids, and Drive folder ids are
  identifiers, not credentials — none of them grants access. The file does map
  internal structure into a committed artifact, so this design **assumes private
  repositories**. Stated here so the assumption is reviewable rather than implicit.
- **No secrets, ever.** Per architecture spec Section 5, tokens stay in MCP config.
  The agent must never write an API token, cookie, or auth header into `context.md`.
- **Hand-edits are respected.** `verify` rewrites only drifted lines. A developer who
  curates the canonical page list keeps that curation across verifies. A full
  `refresh` does overwrite, and says so before the gate.
- **Relationship to `/pell:scope`.** Coordinates vs content. `context.md` names
  `sow-RRS.md`; it never restates a scope statement, epic body, or deliverable.

## 16. Delivery checklist

1. `plugins/pell/commands/map-repo.md` — new
2. `plugins/pell/agents/repo-mapper.md` — new
3. Read block added to the nine commands with a config step: `finish-work`,
   `from-ticket`, `my-tickets`, `precheck`, `related`, `review-queue`, `scope`,
   `start-work`, `triage`
4. `plugins/pell/commands/scope.md` — Step 3's rebuild path gains one line pointing at
   `/pell:map-repo` as the eager alternative. Its lazy build, its 14-day rule, and its
   drift query are otherwise **unchanged**
5. `CLAUDE.md` — new `## Repo context convention` section with the canonical block
6. `plugins/pell/.claude-plugin/plugin.json` — 0.16.0 -> 0.17.0 (new command + agent)
7. `claude plugin validate ./plugins/pell`
8. `/plugin marketplace update pell-skills` + `/reload-plugins`

**Acceptance matrix** (manual; these are prompts, not code):

| # | Scenario | Expected |
|-|-|-|
| 1 | Fresh repo, no `context.md` | Full walk, gap interview, both gates offered |
| 2 | Repo with a current file | Summary + age, refresh offer, clean exit on `n` |
| 3 | `verify` after corrupting a page id | Drift reported; scoped rewrite offered |
| 4 | Repo with no `CLAUDE.md` | Minimal-file creation offered, separately gated |
| 5 | Run twice in a row | Pointer block replaced, not duplicated |
| 6 | Hand-corrupted `context.md` | All nine consumers fall back cleanly, one nudge line |
| 7 | Drive MCP disconnected | Jira/Confluence/repo sections still written; Drive in `## Gaps` |
| 8 | Repo spanning two Jira projects | Two `## Jira —` sections, one file; two separate SOW prompts |
| 9 | Decline the SOW prompt | `context.md` still written; SOW line reads `none — run /pell:scope <KEY>` |
| 10 | SOW build fails mid-walk | `context.md` intact, failure recorded in `## Gaps`, command exits cleanly |
| 11 | Existing SOW under 14 days old | Skipped with a note, not rebuilt |
| 12 | `/pell:scope` on a repo never mapped | Lazy build still works exactly as today |

## 17. Out of scope (v1)

- **An auto-invoked skill.** The `CLAUDE.md` pointer is the delivery mechanism. A
  `skills/repo-context/` would be redundant instruction surface competing for
  attention. Add only if the pointer measurably fails.
- **Distilled content summaries.** Rejected during brainstorming: summaries are the
  part that rots, and for Jira they duplicate `sow-<PROJECT>.md`.
- **Mirroring Confluence or Drive content into the repo.** Rots within days and
  creates a shadow source of truth.
- **Auto-commit.** Matches `/pell:scope`: the command writes, the developer commits.
- **A `pell-config.json` section.** The frontmatter holds every persistent value this
  command needs.
- **Cross-repo or org-level maps.** One file, one repo.
- **Non-Atlassian trackers** (GitHub Issues, Linear). The walk is Atlassian-shaped in
  v1.

## 18. Resolved decisions

| Decision | Choice | Rationale |
|-|-|-|
| File contents | Coordinates only | Near-zero rot; no overlap with the SOW |
| Delivery | `CLAUDE.md` pointer + explicit command reads | Reaches every agent, not just pell commands |
| Discovery | Auto-discover, then interview gaps | Fewest prompts, best file; Drive is undiscoverable without input |
| Machinery | Command + `repo-mapper` agent | Mirrors `/pell:scope` -> `sow-builder`; keeps the walk out of session context |
| Consumer wiring | All nine commands in one change | Chosen over phasing; mitigated by the three consumer invariants in Section 12 |
| Command name | `/pell:map-repo` | `/pell:setup` reads ambiguously as "set up the plugin" |
| Staleness | No expiry; `verify` mode | Coordinates do not rot on a clock; no cheap cross-system drift query exists |
| SOW trigger | Eager here, lazy in `/pell:scope` as fallback | A one-time crawl belongs at setup, not mid-task; but `/pell:scope` must still work on a fresh clone |
| SOW clock | Owned by `/pell:scope` alone | Two build sites are fine; two staleness rules would drift against each other |
