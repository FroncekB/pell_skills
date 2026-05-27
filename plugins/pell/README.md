# pell

Pell Software's Claude Code toolkit. One plugin, many skills. Install once, get the whole kit.

## Commands

### Review primitives (single-dimension, read-only)

| Command | What it does |
|-|-|
| `/pell:correctness-review [<PR-or-local>]` | Reviews one change for correctness issues only. Returns markdown report with all findings (including nits). |
| `/pell:quality-review [<PR-or-local>]` | Reviews one change for code quality and convention adherence. Returns markdown report. |
| `/pell:security-review [<PR-or-local>]` | Reviews one change for security issues. Returns markdown report. |

Primitives accept either a Bitbucket PR identifier or no argument (defaults to local `git diff HEAD`). They never modify anything.

### Review composites (multi-dimension, with optional side effects)

| Command | What it does |
|-|-|
| `/pell:three-pass-review <PR>` | Dispatches all three reviewers in parallel against a Bitbucket PR with linked Jira context. Aggregates findings. Offers to post inline PR comments at a severity threshold of your choice. |
| `/pell:local-review` | Dispatches all three reviewers against local uncommitted changes. Aggregates findings. Offers to apply suggested fixes in-place at a severity threshold of your choice. |

Both composites gate every side effect on user confirmation. Local fixes never commit; PR comments are never auto-posted.

## Agents (composable building blocks)

Each reviewer is also available as a sub-agent for other skills to dispatch:

- `pell:correctness-reviewer`
- `pell:quality-reviewer`
- `pell:security-reviewer`

These return structured JSON findings — used internally by the composites, but reusable by any future skill that wants a focused review pass.

## Severity scales

Each dimension uses its own scale, all surfaced by every reviewer (no pre-filtering):

| Dimension | Severities |
|-|-|
| Correctness | `blocker` / `major` / `minor` / `nit` |
| Quality | `major` / `minor` / `nit` |
| Security | `critical` / `high` / `medium` / `low` / `nit` |

Consumers (you, or an orchestrating composite) decide what to act on.

## Prerequisites

- **Bitbucket MCP** (`atlassian-bitbucket`, API-token auth) — required for any PR-mode review or for `/pell:three-pass-review`
- **Jira MCP** (`plugin:atlassian:atlassian`, OAuth) — required for Jira ticket context in `/pell:three-pass-review`

See the marketplace root README for setup.

## Files

```
pell/
├── commands/
│   ├── correctness-review.md
│   ├── quality-review.md
│   ├── security-review.md
│   ├── three-pass-review.md
│   └── local-review.md
├── agents/
│   ├── correctness-reviewer.md
│   ├── quality-reviewer.md
│   └── security-reviewer.md
└── README.md
```

Future additions (per the architecture spec at `docs/specs/`):
- Jira ops: `start-work`, `triage`, `related`, `finish-work`
- House style: `frontend-router`, `claude-md-init`
- Workflow composers: `from-ticket`, `wrap-up`
