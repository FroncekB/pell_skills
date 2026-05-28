# Pell Skills

**A Claude Code toolkit built around how Pell Software actually ships code.**

This is an internal marketplace for skills, commands, and agents that codify the workflows Pell engineers use every day — reviewing pull requests, working tickets through GitFlow, keeping code consistent with our conventions. Install once, get the whole kit.

## Why this exists

Three goals drive everything in this repo:

1. **Repeatability.** The same workflow should produce the same shape of work, whether it's done by a senior engineer, a new hire, or Claude itself. Skills encode the workflow so the steps don't get skipped.
2. **Reuse.** Reviewers, agents, and orchestration patterns are shared building blocks. Adding a new workflow rarely means writing new analysis logic — it usually means composing existing pieces in a new order.
3. **Tools that match how Pell works.** Bitbucket-aware PR review, Jira-aware ticket flows, GitFlow-aware branch parsing, .NET-aware convention discovery. Generic tools cover 80%; this kit covers the last 20% that matters day-to-day.

---

## Install

```
/plugin marketplace add FroncekB/pell_skills
/plugin install pell@pell-skills
/reload-plugins
```

That's it for the toolkit itself. Some commands need additional MCP servers configured — see the next section.

---

## Prerequisites

Most commands need at least one of these two Atlassian MCP servers connected to your Claude Code session.

| Server | Auth | Required for |
|-|-|-|
| `atlassian-bitbucket` | API token (Basic auth) | Any PR-mode review (`/pell:correctness-review`, `/pell:quality-review`, `/pell:security-review` against a PR), `/pell:three-pass-review`, `/pell:address-review`, future Bitbucket-aware commands |
| `plugin:atlassian:atlassian` | OAuth | Jira ticket context in `/pell:three-pass-review`, future Jira-ops commands |

### Setting up the Atlassian MCPs

The Atlassian Rovo MCP server exposes different tools depending on the auth method, and Claude Code dedups MCP server connections by URL. This means you need **two parallel connections** to the same backing server, at distinct endpoints. Here's the full setup:

**1. Install the Atlassian OAuth plugin** (for Jira/Confluence):

```
/plugin install atlassian@claude-plugins-official
```

It auto-prompts for OAuth on first use. Sign in with your Pell Atlassian account.

**2. Create a scoped Bitbucket API token** at `id.atlassian.com/manage-profile/security/api-tokens`. Required scopes:

- `read:user:bitbucket`
- `read:workspace:bitbucket`
- `read:repository:bitbucket`
- `read:pullrequest:bitbucket`
- `write:pullrequest:bitbucket` (only if you want comment posting)

**3. Base64-encode your credentials:**

```bash
echo -n "your.email@pellsoftware.com:YOUR_API_TOKEN" | base64
```

**4. Register the Bitbucket connection at the `authv2` endpoint** (this is the key step — using a distinct URL from the OAuth connection so they don't dedup):

```bash
claude mcp add-json atlassian-bitbucket '{
  "type": "http",
  "url": "https://mcp.atlassian.com/v1/mcp/authv2",
  "headers": {
    "Authorization": "Basic <YOUR_BASE64_STRING>"
  }
}'
```

**5. Restart Claude Code** so both MCPs come up.

**6. Verify both are connected** with `/mcp` — you should see `atlassian-bitbucket: ✓ Connected` and the Atlassian plugin's tools available.

If something fails, see the troubleshooting note in `docs/specs/2026-05-27-pell-skills-architecture.md` §5 or check that the API token has all the scopes listed above.

---

## Commands reference

### `/pell:correctness-review`

Single-dimension review for correctness only. Surfaces logic errors, off-by-one bugs, broken invariants, missing error handling at real boundaries, race conditions, regressions, and CLAUDE.md violations.

**Usage:**

```
/pell:correctness-review                                         # reviews `git diff HEAD`
/pell:correctness-review --staged                                # reviews staged changes only
/pell:correctness-review src/api/handlers/                       # reviews changes under a path
/pell:correctness-review vrs_default#42                          # reviews Bitbucket PR
/pell:correctness-review https://bitbucket.org/.../pull-requests/42
/pell:correctness-review 42 use bitbucket                        # PR mode with remote context fetch
```

**Output:** markdown report grouped by severity (`blocker` / `major` / `minor` / `nit`). Read-only — never modifies anything.

### `/pell:quality-review`

Single-dimension review for code quality. Looks at readability, naming, duplication, dead code, premature abstraction, and especially adherence to repo conventions (CLAUDE.md, `.editorconfig`, `.csharpierrc`, surrounding code patterns).

**Usage:** same shape as `/pell:correctness-review`.

**Output:** markdown report grouped by severity (`major` / `minor` / `nit`). Read-only.

### `/pell:security-review`

Single-dimension review for security. Looks for injection (SQL, command, XSS, template), authn/authz gaps, secret leakage, unsafe deserialization, missing input validation at trust boundaries, crypto misuse, CSRF/CORS misconfig, OWASP top-10 patterns, and PII handling.

**Usage:** same shape as `/pell:correctness-review`.

**Output:** markdown report grouped by severity (`critical` / `high` / `medium` / `low` / `nit`). Read-only.

### `/pell:test-review`

Single-dimension review for test adequacy. Judges the *tests*, not the production code: untested new behavior, tests that can't fail (assertion-free, tautological, or asserting only on mocks — the mock/prod-divergence trap), happy-path-only coverage, wrong-layer tests, and flaky patterns. Does not demand tests for behavior-free changes (renames, formatting, config).

**Usage:** same shape as `/pell:correctness-review`.

**Output:** markdown report grouped by severity (`major` / `minor` / `nit` — no blocker tier; a missing test isn't a production blocker). Read-only.

### `/pell:three-pass-review <PR>`

Composite — runs the correctness, quality, and security reviewers in parallel against a Bitbucket PR with linked Jira context (add `with tests` for a fourth test-coverage pass). Aggregates findings into a unified report. Offers to post each finding as an inline comment on the PR.

**Usage:**

```
/pell:three-pass-review vrs_default#42
/pell:three-pass-review https://bitbucket.org/pellsoftware/vrs_default/pull-requests/42
/pell:three-pass-review 42                                       # if cwd is the target repo's checkout
/pell:three-pass-review 42 skip jira                             # don't prompt for Jira if no key found
/pell:three-pass-review 42 with tests                            # add the optional test-coverage pass
/pell:three-pass-review 42 use bitbucket                         # fetch surrounding context via MCP instead of local FS
```

**Behavior:**

1. Resolves the PR identifier
2. Fetches PR data + diff from Bitbucket (in parallel)
3. Searches PR title, source branch (GitFlow-aware), and description for a Jira key. Prompts the user if none found
4. Fetches the linked Jira ticket
5. Detects WIP/draft PRs and asks for confirmation before proceeding
6. Dispatches the reviewer agents in parallel — correctness, quality, security, and (opt-in via `with tests`) test-coverage
7. Renders a unified report grouped by dimension and severity
8. Asks which severity threshold (if any) to post as inline comments: `blockers-only`, `major+`, `minor+` (default), `all`, `select`, or `no`

**Output:** markdown report + optional Bitbucket inline comments.

### `/pell:address-review <PR>`

The receiving end of `/pell:three-pass-review`. Pulls the review comments back off one of your Bitbucket PRs so you can triage and respond to each. Lists inline + general comments grouped by file, then walks each through apply-a-fix / reply / skip — reusing `/pell:local-review`'s fix-application discipline. Never commits, never pushes, never resolves threads.

**Usage:**

```
/pell:address-review 1042
/pell:address-review vrs_default#1042
/pell:address-review https://bitbucket.org/pellsoftware/vrs_default/pull-requests/1042
/pell:address-review 1042 unresolved             # only open threads
/pell:address-review 1042 since last push        # only comments newer than your last push
/pell:address-review 1042 from Dana              # only a given reviewer's comments
/pell:address-review 1042 --dry-run              # just list the comments, no triage
/pell:address-review 1042 use bitbucket          # fetch surrounding code via MCP for fixes
```

**Behavior:**

1. Resolves the PR identifier + context source
2. Fetches PR metadata + all comment pages from Bitbucket
3. Drops deleted/draft comments; groups the rest by file (inline) plus a General bucket. Default scope is **all comments**, narrowable client-side (`unresolved`, `since last push`, `from <name>`)
4. Per-comment triage — you drive `fix` / `reply` / `skip` (or a bulk verb like `all fix`)
5. Applies only concrete, mechanical fixes to the working tree (never weakens tests, never guesses); drafts thread replies for confirmation before posting

**Output:** grouped comment list + optional working-tree edits + optional inline replies. A reply does **not** resolve the thread — the Bitbucket API has no resolve action, so that stays a manual UI step.

**Side-effects:** fixes touch the working tree only (never commits/pushes — that's `/pell:finish-work`); replies post only on per-comment confirmation. Authorship isn't enforced (no Bitbucket current-user identity).

### `/pell:my-tickets`

List the open Jira tickets assigned to you. Optional freeform filters by project key or status. After rendering, offers to chain straight into `/pell:start-work` for any ticket you pick.

**Usage:**

```
/pell:my-tickets                                # all open assigned to you
/pell:my-tickets RRS                            # filter to project RRS
/pell:my-tickets in progress                    # filter by status
/pell:my-tickets blocked
/pell:my-tickets RRS in progress                # combine project + status
```

**Output:** numbered list grouped by status (In Progress → In Review → To Do → others), each line showing key, type, priority, summary, and relative updated time. Reply with a number to start work on that ticket — invokes `/pell:start-work <KEY>` directly. Reply `n` to skip.

**Side-effects:** read-only against Jira (no transitions, no assignments). The transparent `cloud_id` cache write to `pell-config.json` is the only file change.

### `/pell:triage <KEY>`

List the **unclaimed** Jira tickets in a project (the work nobody owns yet), grouped by priority. Per-ticket prompt to claim it (assign to you), start work on it, view its full description, or skip. Read-only unless you say `y` per ticket — sister of `/pell:my-tickets`, but for the team pool instead of your queue.

**Usage:**

```
/pell:triage RRS                                # unclaimed RRS tickets, grouped by priority
/pell:triage RRS high                           # filter to High/Highest priority
/pell:triage RRS today                          # only tickets created in last 24h
/pell:triage RRS all                            # include already-assigned (the full backlog)
/pell:triage RRS assign to me                   # pre-authorize the claim prompt
```

**Per-ticket actions:** `c` = claim, `s` = claim + start-work, `v` = view full description, `n` = next, `q` = quit. Claiming requires `y` confirmation unless `assign to me` was pre-authorized.

**Side-effects:** assignment writes only on per-ticket `y`. Never transitions or modifies any other field.

### `/pell:repo-review`

Whole-repo code-quality audit. Walks the codebase, dispatches `repo-quality-reviewer` sub-agents in parallel, and aggregates findings into one report. Looks for duplicated logic, dead code, convention drift, oversized files, tight coupling, and ignored warnings. Read-only — never modifies files.

**Usage:**

```
/pell:repo-review                                     # quick scan (~50 recent files)
/pell:repo-review --standard                          # broader scan (~250 files)
/pell:repo-review --full                              # walk the entire repo
/pell:repo-review src/api                             # restrict to a path
/pell:repo-review focus on the auth module            # freeform context biases agents
/pell:repo-review --full skip tests
```

**Behavior:**

1. Walks the repo (recency-weighted from `git log` in quick/standard, full `git ls-files` for `--full`), applies a deny-list for generated/vendor paths
2. Chunks files by language and dispatches up to ~12 parallel `repo-quality-reviewer` agents
3. Aggregates findings, dedupes by `(finding, fix)` text across chunks (so a pattern repeated in N files renders once with all locations)
4. Renders a markdown report grouped by severity (`major` / `minor` / `nit`)

**Side-effects:** none — read-only by design.

### `/pell:repo-security-review`

Whole-repo security audit. Same orchestration shape as `/pell:repo-review` but dispatches `repo-security-reviewer` agents. Each agent runs two passes per file: a regex scan for sensitive data (SSNs, credit cards, API keys, JWTs, private keys, driver's license patterns) followed by code-level vulnerability review (XSS, SQLi, path traversal, hardcoded credentials, crypto misuse, PII logging).

**Usage:** same shape as `/pell:repo-review` (path scope, `--quick`/`--standard`/`--full`, freeform).

**Output policy:** findings include the **literal matched value** for sensitive-data hits (you chose this trade-off during design). Treat the output as sensitive — don't paste it into chat or PR comments without consideration.

**Side-effects:** none — read-only.

### `/pell:finish-work`

Close out a branch by opening a Bitbucket PR and (only on explicit consent) transitioning the linked Jira ticket and adding a PR-link comment. Read-only against Jira by default; PR creation is always confirmed even when other actions are pre-authorized.

**Usage:**

```
/pell:finish-work                                          # uses current branch, infers Jira key
/pell:finish-work RRS-1020                                 # explicit key (rare — usually inferred)
/pell:finish-work into develop                             # override base branch
/pell:finish-work title: "Fix cart quantity update"        # override PR title
/pell:finish-work push it and move to in review            # pre-authorize push + transition
/pell:finish-work don't touch jira                         # PR only, no Jira side-effects
/pell:finish-work skip the comment                         # PR + transition, no Jira comment
/pell:finish-work --reset                                  # re-prompt cached "in_review" transition
```

**Behavior:**

1. Parses args + inline pre-authorizations from `$ARGUMENTS`
2. Resolves the Jira key from `$ARGUMENTS` or the current branch name (`<KEY>-*` shape from `/pell:start-work`)
3. Fetches the ticket + resolves the base branch (`git symbolic-ref refs/remotes/origin/HEAD` → config → ask)
4. Pre-flight: offers to push if the branch has unpushed commits or no upstream; detects an already-open PR for the source branch and offers to skip create
5. Creates the PR via Bitbucket MCP after a confirmation that names the title, source, and target — **always** confirmed, even with pre-auth
6. Optionally transitions the ticket to the project's "in review" status (discovered + cached on first use per project, like `/pell:start-work`)
7. Optionally adds a comment to the ticket with the PR URL

**Side-effects:** PR creation always confirmed; push, Jira transition, and comment are opt-in (per-action `y` or inline pre-auth). Never merges, approves, or closes anything.

### `/pell:wrap-up [freeform context]`

Closes out a branch in one command: runs `/pell:local-review` on the working tree, offers to commit any review fixes (or pre-existing uncommitted work), then dispatches `/pell:finish-work` to push, open the PR, and transition Jira. Thin orchestrator — all side-effect prompts come from the dispatched stages, except the commit gate which `/pell:wrap-up` owns.

```
/pell:wrap-up
/pell:wrap-up apply minor+                              # auto-apply review fixes at minor+ severity
/pell:wrap-up skip review, push it                     # already reviewed; push + open PR
/pell:wrap-up apply major+, into develop, comment with PR link
/pell:wrap-up auto-commit, commit message: "fix per review"
```

**Side effects:** all delegated to the dispatched stages, with one exception: the commit gate between review and finish-work is gated on a y/n prompt (or pre-auth via `auto-commit`). `wrap-up` itself never mutates Jira, pushes, opens PRs, or modifies the working tree beyond the staged commit.

**Skip flags:** `skip review` / `already reviewed` / `no review` skips Stage A.

### `/pell:start-work <KEY>`

Fetch a Jira ticket, create a properly-named local branch (`<KEY>-<sentence-case-description>`), and optionally assign / transition the ticket. Read-only against Jira by default — side-effects only fire when you pre-authorize inline or answer `y` to a named per-action prompt.

**Usage:**

```
/pell:start-work RRS-1020
/pell:start-work RRS-1020 call it Fixing-cart-bug          # override the derived description
/pell:start-work RRS-1020 assign to me                     # pre-authorize assignment
/pell:start-work RRS-1020 yeah move it to in-progress      # pre-authorize transition
/pell:start-work RRS-1020 assign to me and move to in-progress
/pell:start-work RRS-1020 don't touch jira                 # branch only, no Jira side-effects
/pell:start-work RRS-1020 --reset                          # re-prompt cached transition for this project
```

**Behavior:**

1. Parses `<KEY>` and any inline pre-authorizations from `$ARGUMENTS`
2. Fetches the ticket via the Atlassian Jira MCP (cloud_id cached transparently on first use)
3. Pre-flight: aborts if not in a git repo or the working tree is dirty; offers to switch to an existing branch for the same key
4. Derives a sentence-case-with-hyphens description from the Jira summary; asks you to accept, override, or cancel
5. `git checkout -b <KEY>-<description>` from your current branch (no base switching)
6. Optionally assigns and transitions the ticket — each as its own `y/n` prompt with the specific status name, or pre-authorized inline
7. Reports what changed

**Side-effects:** branch creation requires confirmation; Jira changes are strictly opt-in. Never commits, pushes, or opens a PR.

### `/pell:from-ticket <JIRA-KEY> [freeform context]`

Composes the full pre-implementation workflow in one command: fetches the Jira ticket and its connections, creates a branch via `/pell:start-work`, then hands off to `superpowers:brainstorming` → `superpowers:writing-plans` for the design spec and implementation plan.

```
/pell:from-ticket RRS-1020
/pell:from-ticket RRS-1020 assign to me, move it to In Progress
/pell:from-ticket RRS-1020 skip start-work, design only
/pell:from-ticket RRS-1020 plan only         # resume from existing spec
/pell:from-ticket RRS-1020 --reset           # delete artifacts and start over
```

**Side effects:** delegated to the dispatched stages. `from-ticket` itself does not mutate Jira, commit, push, or open PRs. `--reset` deletes prior `docs/superpowers/specs/<KEY>-*.md` and `plans/<KEY>-*.md` files after one consolidated confirmation.

**When `superpowers` is missing:** falls back to a lightweight inline substitute (3 questions, writes a starter spec) so the user still leaves the command with a useful artifact. Install `superpowers@claude-plugins-official` for the full design + plan workflow.

### `/pell:visualize [concept | no-watch | watch | stop-watch | stop | clear]`

Opens a live browser "second screen" Claude can draw to. A zero-dependency local server (Python stdlib, `127.0.0.1` only) serves a page that live-renders a file Claude writes to — diagrams, SVG, tables, before/after comparisons — over Server-Sent Events.

```
/pell:visualize                        # start server, print URL, begin watching
/pell:visualize "auth flow"            # start server and render a fragment for that concept
/pell:visualize no-watch               # open/draw without arming the click watcher
/pell:visualize watch                  # re-arm the watcher (only needed after stop-watch)
/pell:visualize stop-watch             # stop the watcher, keep the server
/pell:visualize stop                   # shut down server
/pell:visualize clear                  # blank the pad
```

**Bidirectional, live by default:** pages can call `pellSend(payload)` (e.g. on a button click) to POST events to an inbox. Watch mode is on by default — a zero-token shell watcher (`tail -F` via the Monitor tool, one per session) makes Claude react to clicks in near-real-time; pass `no-watch` to opt out. Either way a bundled `UserPromptSubmit` hook surfaces clicks to Claude on its next turn, so nothing is lost. Claude can render clickable options and read your choice back without a text prompt.

**Auto-invoked:** the `visual-scratchpad` skill fires proactively when Claude is about to explain something inherently visual (architecture diagrams, data flows, comparison tables), and also arms watch mode by default. Requires `python3`; degrades gracefully to a terminal explanation if absent.

**Side effects:** starts a local process on `127.0.0.1`. `stop` kills it. No network exposure; no files written outside the repo's scratch path.

### `/pell:related [KEY]`

Show the connection graph for a Jira ticket — linked issues (blocks, is blocked by, relates to, duplicates), parent/subtasks, external links (PR URLs, docs), and any Bitbucket PRs in the current repo whose title or branch references the key. Auto-detects the key from the current branch if you don't pass one. Strictly read-only.

**Usage:**

```
/pell:related RRS-1020                          # explicit key
/pell:related                                   # auto-detect from current branch
/pell:related RRS-1020 skip bitbucket           # Jira-only context
/pell:related RRS-1020 open only                # filter Bitbucket PRs to OPEN state
```

**Output:** sectioned report — ticket header, parent/subtasks, linked issues (with their statuses), external links, Bitbucket PRs, and a one-line connection-density summary. Useful before starting work, or as quick context when reviewing a PR.

**Side-effects:** none. No writes, no transitions, no comments.

### `/pell:local-review`

Composite — runs the correctness, quality, and security reviewers against local uncommitted changes (add `with tests` for a fourth test-coverage pass). Each reviewer reads `CLAUDE.md` and convention files to ground findings in the repo's actual style. Offers to apply suggested fixes in-place.

**Usage:**

```
/pell:local-review                          # all uncommitted (staged + unstaged) — the default
/pell:local-review --staged                 # staged only
/pell:local-review --uncommitted            # unstaged only
/pell:local-review --range main..HEAD       # changes between two refs
/pell:local-review src/components/          # restrict to a path
/pell:local-review with tests               # add the optional test-coverage pass
/pell:local-review focus on the new auth module
```

**Behavior:**

1. Resolves the diff scope from `$ARGUMENTS`
2. Dispatches the reviewer agents in parallel — correctness, quality, security, and (opt-in via `with tests`) test-coverage — each discovers CLAUDE.md and conventions on its own
3. Renders a unified report grouped by dimension and severity
4. Asks which severity threshold to apply as fixes: same selection menu as `/pell:three-pass-review`

**Output:** markdown report + optional in-place file edits. Never commits.

---

## Auto-invoked skills

These are description-matched — Claude invokes them automatically when the task fits, no slash command needed.

### `frontend-router`

Fires at the start of UI/frontend work (new components, pages, redesigns, marketing surfaces). Routes the work to `/frontend-design:frontend-design` if the plugin is installed, otherwise notifies the user it would help and asks whether to install or proceed without it. Notify-don't-force per the architecture spec.

To install the recommended companion:

```
/plugin install frontend-design@claude-plugins-official
```

The skill is deliberately quiet about pure bug fixes, refactors, tests, and non-visual frontend work — it only triggers when the deliverable is something a human will look at.

---

## Composable building blocks (sub-agents)

The three reviewers are also exposed as composable agents — any current or future command in the `pell` plugin can dispatch them:

| Agent | `subagent_type` | Returns |
|-|-|-|
| Correctness reviewer | `correctness-reviewer` | JSON: `{findings: [{severity, file, line, finding, fix}], summary}` |
| Quality reviewer | `quality-reviewer` | Same shape |
| Security reviewer | `security-reviewer` | Same shape |
| Test-coverage reviewer | `test-reviewer` | Same shape |
| Repo quality reviewer | `repo-quality-reviewer` | Same shape, with optional `also_in` for cross-file findings within a chunk |
| Repo security reviewer | `repo-security-reviewer` | Same shape |

This is the foundation of Bucket 3 (workflow composers) — future commands like `pell:wrap-up` will dispatch these without re-implementing review logic.

---

## Coming soon

Per the roadmap in [`docs/specs/2026-05-27-pell-skills-architecture.md`](docs/specs/2026-05-27-pell-skills-architecture.md):

- **Jira workflow ops:** `triage`, `related` — adaptive to per-project Jira transition workflows
- **House-style guidance:** `claude-md-init` (scaffold a project-specific CLAUDE.md from a Pell template)
- **Workflow composers:** `from-ticket` (Jira → branch → brainstorm → plan → TDD), `wrap-up` (review → open PR → comment → close ticket)

---

## Design principles

The full architecture spec lives at [`docs/specs/2026-05-27-pell-skills-architecture.md`](docs/specs/2026-05-27-pell-skills-architecture.md). Highlights:

- **Skills as building blocks.** Single-dimension reviewers are independent commands AND composable agents. Composites are thin orchestrators on top
- **Reviewers surface everything.** No pre-filtering. Findings come with severity; the consumer (a human, or an orchestrating composite) decides what's actionable
- **Read-only by default.** Every side effect — modifying files, posting comments, transitioning tickets, creating branches — is gated on a `(y/n)` prompt that names exactly what will change
- **Freeform context wins.** `$ARGUMENTS` is parsed as natural language. `/pell:three-pass-review 42 use bitbucket not LFS` works because the command reads intent, not flags
- **Notify, don't force, for external dependencies.** When a Pell skill wants to invoke `superpowers:brainstorming` or `frontend-design:frontend-design` and they're not installed, the user is told — never forced
- **Local FS by default for context.** Reviewers assume you're working in a checkout of the target repo. The `use bitbucket` override flips to remote fetch when needed

---

## Contributing

**When to build a skill:** if you find yourself using the same workaround twice, hand-rolling a bespoke tool for a problem someone else might hit, or walking through the same manual workflow on every ticket — that's a skill waiting to be written. Skills are how Pell engineers' tribal knowledge becomes shared leverage. If it would have saved you five minutes the second time, it'll save the team hours over a quarter.

See [`CLAUDE.md`](CLAUDE.md) for conventions when adding a new command, agent, or skill. The TL;DR:

1. **Everything goes into `plugins/pell/`** — don't add new plugin directories or new marketplace entries
2. **Mirror an existing command** when adding one. If you find yourself inventing a new pattern, update the spec first
3. **Validate before pushing:** `claude plugin validate ./plugins/pell`
4. **Test the reload loop:** `/plugin marketplace update pell-skills && /reload-plugins`, then invoke the new command and observe

Open a PR. The team uses these tools daily, so feedback is fast.

---

## Repo layout

```
pell_skills/
├── .claude-plugin/marketplace.json     # lists `pell` only
├── CLAUDE.md                            # instructions for any Claude session in this repo
├── docs/specs/                          # architectural specs
└── plugins/pell/                        # the one plugin
    ├── commands/                        # slash commands
    ├── agents/                          # composable sub-agents
    └── skills/                          # auto-invoked skills (description-matched)
```
