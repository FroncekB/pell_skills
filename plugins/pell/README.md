# pell

Pell Software's Claude Code toolkit. One plugin, many skills. Install once, get the whole kit.

> **Full command reference lives in the [marketplace root README](../../README.md).** This file is a thin index so it doesn't drift — usage examples, behavior, and setup are documented once, at the root.

## Commands

### Review primitives (single-dimension, read-only)

| Command | What it does |
|-|-|
| `/pell:correctness-review [<PR-or-local>]` | Logic errors, broken invariants, missing error handling, regressions. |
| `/pell:quality-review [<PR-or-local>]` | Readability, naming, duplication, convention adherence. |
| `/pell:security-review [<PR-or-local>]` | Injection, authn/authz, secrets, OWASP top-10. |
| `/pell:test-review [<PR-or-local>]` | Test adequacy — untested behavior, tests that can't fail, missing edge/error coverage. |

### Review composites (multi-dimension, optional side effects)

| Command | What it does |
|-|-|
| `/pell:three-pass-review <PR>` | All reviewers in parallel against a Bitbucket PR with Jira context; offers inline PR comments. |
| `/pell:local-review` | All reviewers against local uncommitted changes; offers in-place fixes. |

Both composites can add a test-coverage pass — pass `with tests` to enable it (off by default).

The receiving end of review:

| Command | What it does |
|-|-|
| `/pell:address-review <PR>` | Pull review comments back off your PR and triage each — apply mechanical fix in-place / reply on the thread / skip. Never commits, pushes, or resolves threads. |

Finding PRs to review:

| Command | What it does |
|-|-|
| `/pell:review-queue [repo …]` | List open PRs where you're a requested reviewer (one repo or the whole workspace), then chain into a review on the one you pick. Read-only. |

### Repo-wide audits (read-only)

| Command | What it does |
|-|-|
| `/pell:repo-review` | Whole-repo quality audit — duplication, dead code, convention drift, oversized files. |
| `/pell:repo-security-review` | Whole-repo security audit — sensitive-data scan + code-vuln review. |

### Jira ops

| Command | What it does |
|-|-|
| `/pell:my-tickets` | List open Jira tickets assigned to you; chain into start-work. |
| `/pell:triage <KEY>` | List unclaimed tickets in a project; claim / start / view per ticket. |
| `/pell:related [KEY]` | Show a ticket's connection graph (links, subtasks, PRs). Read-only. |
| `/pell:precheck [KEY \| idea]` | Check if work is already filed / built / in-flight — similar tickets, repo impl, open PRs, merged commits. Gated link/comment. Read-only by default. |
| `/pell:start-work <KEY>` | Fetch a ticket, create a branch, optionally assign / transition. |
| `/pell:finish-work` | Open a Bitbucket PR; optionally transition Jira + comment the PR link. |

### Workflow composers

| Command | What it does |
|-|-|
| `/pell:from-ticket <KEY>` | Ticket → branch → brainstorm → plan (via superpowers, with inline fallback). |
| `/pell:wrap-up` | local-review → commit gate → finish-work. |

### Visual

| Command | What it does |
|-|-|
| `/pell:visualize [concept]` | Live browser scratchpad Claude can draw to; bidirectional click events. |

## Auto-invoked skills (description-matched)

- `frontend-router` — routes UI work to `frontend-design` (notify-don't-force).
- `visual-scratchpad` — fires when a rendered view beats terminal prose; arms the scratchpad.

## Agents (composable building blocks)

Diff-based reviewers (dispatched by the composites, reusable by any future command):

- `correctness-reviewer` · `quality-reviewer` · `security-reviewer` · `test-reviewer`

Repo-based reviewers (dispatched by the repo audits):

- `repo-quality-reviewer` · `repo-security-reviewer`

All return structured JSON: `{findings: [{severity, file, line, finding, fix}], summary}`.

## Severity scales

Each dimension uses its own scale; reviewers surface everything (no pre-filtering) and the consumer triages.

| Dimension | Severities |
|-|-|
| Correctness | `blocker` / `major` / `minor` / `nit` |
| Quality | `major` / `minor` / `nit` |
| Security | `critical` / `high` / `medium` / `low` / `nit` |
| Test coverage | `major` / `minor` / `nit` |

## Prerequisites

**MCP servers:**

- **Bitbucket MCP** (`atlassian-bitbucket`, API-token auth) — any PR-mode review, `three-pass-review`, `finish-work`, `related`.
- **Jira MCP** (`plugin:atlassian:atlassian`, OAuth) — all Jira-ops commands and Jira context in `three-pass-review`.

See the [marketplace root README](../../README.md) for the dual-connection setup.

**Optional plugin dependencies** (notify-don't-force — the command/skill skips or substitutes inline when absent):

- **superpowers** — `/pell:from-ticket` dispatches `superpowers:brainstorming` → `writing-plans` for the design/plan stage. Without it, from-ticket runs a lightweight inline design pass instead.
- **frontend-design** — `frontend-router` routes UI work to it. Without it, the skill notifies and steps aside.
