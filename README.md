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
| `atlassian-bitbucket` | API token (Basic auth) | Any PR-mode review (`/pell:correctness-review`, `/pell:quality-review`, `/pell:security-review` against a PR), `/pell:three-pass-review`, future Bitbucket-aware commands |
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

### `/pell:three-pass-review <PR>`

Composite — runs all three reviewers in parallel against a Bitbucket PR with linked Jira context. Aggregates findings into a unified report. Offers to post each finding as an inline comment on the PR.

**Usage:**

```
/pell:three-pass-review vrs_default#42
/pell:three-pass-review https://bitbucket.org/pellsoftware/vrs_default/pull-requests/42
/pell:three-pass-review 42                                       # if cwd is the target repo's checkout
/pell:three-pass-review 42 skip jira                             # don't prompt for Jira if no key found
/pell:three-pass-review 42 use bitbucket                         # fetch surrounding context via MCP instead of local FS
```

**Behavior:**

1. Resolves the PR identifier
2. Fetches PR data + diff from Bitbucket (in parallel)
3. Searches PR title, source branch (GitFlow-aware), and description for a Jira key. Prompts the user if none found
4. Fetches the linked Jira ticket
5. Detects WIP/draft PRs and asks for confirmation before proceeding
6. Dispatches all three reviewer agents in parallel
7. Renders a unified report grouped by dimension and severity
8. Asks which severity threshold (if any) to post as inline comments: `blockers-only`, `major+`, `minor+` (default), `all`, `select`, or `no`

**Output:** markdown report + optional Bitbucket inline comments.

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

### `/pell:local-review`

Composite — runs all three reviewers against local uncommitted changes. Each reviewer reads `CLAUDE.md` and convention files to ground findings in the repo's actual style. Offers to apply suggested fixes in-place.

**Usage:**

```
/pell:local-review                          # all uncommitted (staged + unstaged) — the default
/pell:local-review --staged                 # staged only
/pell:local-review --uncommitted            # unstaged only
/pell:local-review --range main..HEAD       # changes between two refs
/pell:local-review src/components/          # restrict to a path
/pell:local-review focus on the new auth module
```

**Behavior:**

1. Resolves the diff scope from `$ARGUMENTS`
2. Dispatches all three reviewer agents in parallel (each discovers CLAUDE.md and conventions on its own)
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

This is the foundation of Bucket 3 (workflow composers) — future commands like `pell:wrap-up` will dispatch these without re-implementing review logic.

---

## Coming soon

Per the roadmap in [`docs/specs/2026-05-27-pell-skills-architecture.md`](docs/specs/2026-05-27-pell-skills-architecture.md):

- **Jira workflow ops:** `triage`, `related`, `finish-work` — adaptive to per-project Jira transition workflows
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
