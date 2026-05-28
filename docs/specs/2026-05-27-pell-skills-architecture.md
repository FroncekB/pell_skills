# Pell Skills — Architecture Spec

**Status:** implemented — conventions stable; see §12 for build status. Remaining gaps tracked in [`2026-05-28-pell-toolkit-improvements-plan.md`](2026-05-28-pell-toolkit-improvements-plan.md).
**Author:** Brandon Froncek + Claude
**Date:** 2026-05-27

## Purpose

Establish the conventions shared across every Pell Software plugin so that individual plugin specs (Bucket 1 Jira ops, Bucket 2 house style, Bucket 3 feature composers) can focus on what's unique to them rather than re-debating common questions.

## 1. Plugin organization

**Decision: one giant plugin called `pell` that contains every Pell workflow.**

A single plugin under `plugins/pell/` houses all commands, skills, and agents. One install command, full kit. Tradeoffs:

- ✅ One install, full toolkit (`/plugin install pell@pell-skills`)
- ✅ All Pell workflows version together — easy to keep coherent
- ✅ No cross-plugin dependency dance — every internal reference is in-process
- ✅ Single namespace `/pell:*` is clean and discoverable
- ❌ Users can't easily install just a subset
- ❌ Plugin is large — but Claude Code only loads skill/command bodies on invoke, so cost is low at idle

## 2. Naming convention

**Decision: invocation is `/pell:<command>` — no command-name doubling.**

The plugin is named `pell`; each command file inside `commands/` is named after the action it performs. Examples:

| Command file | Invocation |
|-|-|
| `commands/start-work.md` | `/pell:start-work RRS-1020` |
| `commands/triage.md` | `/pell:triage` |
| `commands/finish-work.md` | `/pell:finish-work RRS-1020` |
| `commands/correctness-review.md` | `/pell:correctness-review <PR-or-local>` |
| `commands/quality-review.md` | `/pell:quality-review <PR-or-local>` |
| `commands/security-review.md` | `/pell:security-review <PR-or-local>` |
| `commands/three-pass-review.md` | `/pell:three-pass-review <PR>` |
| `commands/local-review.md` | `/pell:local-review` |
| `commands/from-ticket.md` | `/pell:from-ticket RRS-1020` |
| `commands/wrap-up.md` | `/pell:wrap-up` |

Skills (auto-invoked) live in `skills/<name>/SKILL.md`. Agents (composable) live in `agents/<name>.md`.

## 3. Existing plugin migration

The current `three-pass-review` and `local-review` plugins get **merged into `pell`** rather than renamed independently. Concretely:

1. Their command bodies move to `plugins/pell/commands/three-pass-review.md` and `commands/local-review.md`
2. Their agents move to `plugins/pell/agents/` (deduplicated — one unified version per dimension)
3. The standalone `plugins/three-pass-review/` and `plugins/local-review/` directories are deleted
4. The marketplace.json entries collapse into a single entry for `pell`

## 4. Internal references (formerly "cross-plugin dependencies")

Since everything lives in one plugin, references between commands/skills/agents are internal — no install-time dependency dance. Three patterns:

### 4.1 Dispatching an internal agent

A command can dispatch a sibling agent:

```
Agent(subagent_type="pell:correctness-reviewer", ...)
```

The `pell:` prefix is automatic because the agent lives in the same plugin.

### 4.2 Invoking another internal command

A command's body can instruct: "Now invoke `/pell:start-work` to handle the Jira side." Same plugin namespace, no install check needed.

### 4.3 External plugin dependencies (superpowers, frontend-design, etc.)

Some Pell skills will lean on third-party plugins:
- `pell:frontend-router` nudges Claude toward `/frontend-design:frontend-design`
- `pell:from-ticket` invokes `/superpowers:brainstorming` and `/superpowers:writing-plans`

**Policy: notify, don't block.** When a Pell command would invoke a missing external plugin, it tells the user and offers options — never halts or forces install:

> Heads up: this step works best with `<external-plugin>`, which isn't installed. You can install it with `/plugin install <external-plugin>@<their-marketplace>` for the full experience, or I can proceed without that step.

Possible continuations after the notice:
1. **Skip that step** and continue with the rest of the workflow (the default for non-critical companions)
2. **Substitute inline** — e.g. if `superpowers:brainstorming` isn't available, run a lightweight inline brainstorm directly
3. **Stop here if the user prefers** — they may want to install first and rerun

We do NOT use formal `plugin.json` dependency declarations. The notify-don't-block pattern keeps users in control.

## 5. Shared configuration

Several skills need to persist user-specific preferences (which Jira transition means "start work" for project RRS, which default branch base to use, etc.).

**Decision: a single shared file at `~/.claude/pell-config.json`.**

Schema sketch (refine as skills are built):

```json
{
  "version": 1,
  "jira": {
    "cloud_id": "dfe5fa82-885e-4fff-a83f-633a4db40961",
    "transitions": {
      "RRS": { "start": "In Progress", "done": "Done", "in_review": "In Review" },
      "FIEL": { "start": "Doing", "done": "Closed" }
    }
  },
  "bitbucket": {
    "workspace": "pellsoftware",
    "default_base_branch": "develop"
  }
}
```

> Note: branch names are flat (`<KEY>-<description>`, no GitFlow prefix) — confirmed during `/pell:start-work` design. See [`2026-05-27-pell-start-work-design.md`](2026-05-27-pell-start-work-design.md) §5.

### Conventions for using the file

- **Reads:** any skill can read the file freely
- **Writes:** a skill writes only the section it owns. Writes are atomic (read → modify → write back)
- **Missing values:** prompt the user, save the answer, proceed
- **`--reset` flag:** every skill that uses cached config should accept `--reset` in its arguments to re-prompt
- **No secrets:** API tokens stay in the MCP config; this file holds only preferences and identifiers

## 6. Slash command argument conventions

All Pell commands accept freeform context in `$ARGUMENTS`. Pattern:

```markdown
The user passed: `$ARGUMENTS`

Extract structured pieces (ticket key, paths, etc.) from the arguments.
The remaining text is freeform context — interpret it naturally and let it
override defaults. Examples:
- "skip the spec read" → omit that step
- "use main as base" → override the default base branch
- "this is urgent" → use hotfix conventions

When user instructions conflict with defaults, the user wins.
```

No rigid flag parsing. Engineers should be able to type what they mean.

## 7. Output and side-effect conventions

| Action | Default | Confirmation |
|-|-|-|
| Reading data (Jira, Bitbucket, files) | always allowed | none |
| Rendering a report | always | none |
| Writing to `~/.claude/pell-config.json` | yes after first prompt | one-time per project |
| Modifying local files | only via skill that explicitly says so (`pell-local-review`) | per-finding or batch confirmation |
| Posting Bitbucket comments | offered, never automatic | y/n prompt |
| Jira transitions / assignments | offered, never automatic | y/n prompt |
| Creating branches / worktrees | offered, never automatic | y/n prompt |
| Committing or pushing | never (out of scope for these skills) | n/a |

Default: skills are **read-only unless explicitly told otherwise.** Side effects are gated on user confirmation, and the prompt names exactly what will change.

## 8. Reviewer composition pattern

**Decision: reviewers are independent primitives; composites orchestrate them. No reviewer logic duplicated inside composites.**

Each review dimension is a sibling in the one `pell` plugin, exposed as both a user-facing slash command **and** a composable sub-agent (per §1, everything lives in `pell` — there are no separate per-dimension plugins):

| Dimension | Slash command (user-invokable) | Agent (`subagent_type`) |
|-|-|-|
| Correctness | `/pell:correctness-review` | `correctness-reviewer` |
| Quality | `/pell:quality-review` | `quality-reviewer` |
| Security | `/pell:security-review` | `security-reviewer` |

Composites (`/pell:three-pass-review`, `/pell:local-review`) do NOT reimplement review logic. They dispatch the agents above as parallel sub-agents and act on the aggregated findings. The same pattern extends to the repo-wide audits (`repo-quality-reviewer`, `repo-security-reviewer`).

### Reviewer responsibilities (uniform contract)

Every reviewer:

1. **Accepts mixed input scope** — a Bitbucket PR identifier, a local `git diff` invocation, a file path, or inline diff content. Auto-detects from `$ARGUMENTS`. If ambiguous, asks.
2. **Discovers context from the local filesystem by default** — see §8.1 below.
3. **Surfaces everything** — including low-confidence observations and stylistic nits. Each finding gets a `severity` so the consumer can filter. **Do not pre-filter.** The consumer (human user or orchestrating composite) decides what's actionable.
4. **Outputs structured findings only** — a JSON array of `{severity, file, line, finding, fix}` plus a one-line `summary`. Does not decide what to do with them.
5. **Has no side effects** — never modifies files, never posts comments, never transitions tickets. Purely a reporter.

### 8.1 Context source: local filesystem by default, Bitbucket on request

**Default assumption: the user is running the command from a local checkout of the same repo being reviewed.** Reviewers use `Read`, `Grep`, `Glob`, `Bash` to discover `CLAUDE.md`, convention files, and surrounding code from the working directory.

**Override:** if `$ARGUMENTS` contains freeform context like:
- `use bitbucket` / `use mcp` / `fetch via bitbucket` / `use remote`
- `not LFS` / `not local` (in context of context-fetch)

…the command sets `context_source: bitbucket` in the agent's dispatching prompt. The agent then fetches surrounding files via `mcp__atlassian-bitbucket__bitbucketRepoContent(workspaceId, repoId, ref=<source branch>)` instead of the local filesystem.

The diff itself is still resolved per scope (PR-mode diffs come from Bitbucket regardless; local-mode diffs come from `git diff`). The override only affects how *surrounding* context is fetched.

**Future expansion** (not built for v1):
- Auto-detect whether the local checkout matches the PR's source branch and fall back to Bitbucket if it doesn't
- Detect when the user isn't in the right repo and offer to switch to Bitbucket mode automatically

### Severity scale (uniform across reviewers)

| Severity | Meaning | Composite default action |
|-|-|-|
| `blocker` / `critical` | Will fail in production; exploitable; loses data | Always surface; recommend posting/fixing |
| `major` / `high` | Wrong under realistic conditions | Surface by default |
| `minor` / `medium` | Edge cases, real but unlikely-to-hit issues | Surface; orchestrator may collapse if many |
| `nit` | Style, preference, minor improvements with no real cost to leaving | Surface in a collapsed/separate section; default off for posting |

Reviewers must use the appropriate severity word for their dimension (e.g. security uses `critical/high/medium`, quality uses `major/minor/nit`, correctness uses `blocker/major/minor/nit`).

### Composite responsibilities

Composites are thin orchestrators that:

1. Resolve the input scope (PR or local) and gather any context the reviewers can't (Jira ticket, GitFlow base branch, etc.)
2. Dispatch the three reviewer agents in parallel with shared context
3. Aggregate findings into a unified report, **grouped by severity** — render nits in a collapsed/separate section so they don't drown the signal
4. Decide on **side effects** based on the composite's purpose:
   - `pell-three-pass-review` (PR context) → ask the user which severity threshold to post (e.g. "post blockers + major only? all? selected?"). Never post nits by default
   - `pell-local-review` (local context) → same selection model for fixes
5. Gate every side effect on user confirmation

### Why this matters

- **Reuse:** one reviewer prompt, many consumers
- **Composability:** future workflows (e.g. `pell-feature:wrap-up`) can pick which reviewers to run
- **Direct user access:** a user who just wants a quick security pass can run `/pell:security-review` without invoking the full three-pass machinery
- **Cleaner mental model:** reviewers report, orchestrators act

## 9. Repo layout

```
pell_skills/
├── .claude-plugin/marketplace.json          # lists `pell` (the main plugin)
├── docs/specs/                              # design docs (this file lives here)
├── README.md                                # canonical command reference
└── plugins/
    └── pell/                                # ONE plugin containing everything
        ├── .claude-plugin/plugin.json
        ├── README.md                        # thin index → defers to root README
        ├── hooks/hooks.json                 # UserPromptSubmit: surfaces scratchpad clicks
        ├── commands/
        │   # Reviewer primitives (single-dimension, read-only)
        │   ├── correctness-review.md
        │   ├── quality-review.md
        │   ├── security-review.md
        │   # Review composites
        │   ├── three-pass-review.md         # PR + Jira context → optional inline comments
        │   ├── local-review.md              # working tree → optional in-place fixes
        │   # Repo-wide audits
        │   ├── repo-review.md
        │   ├── repo-security-review.md
        │   # Bucket 1: Jira ops
        │   ├── my-tickets.md
        │   ├── triage.md
        │   ├── related.md
        │   ├── start-work.md
        │   ├── finish-work.md
        │   # Bucket 3: composers
        │   ├── from-ticket.md
        │   ├── wrap-up.md
        │   # Visual
        │   └── visualize.md
        ├── skills/
        │   # Bucket 2: house-style guidance (auto-invoked)
        │   ├── frontend-router/SKILL.md     # nudges toward /frontend-design
        │   └── visual-scratchpad/           # SKILL.md + server.py + viewer.html + tests
        │   # claude-md-init/ — planned, not yet built (see improvements plan §5)
        └── agents/
            # Diff-based reviewer agents (composable primitives)
            ├── correctness-reviewer.md
            ├── quality-reviewer.md
            ├── security-reviewer.md
            # Repo-based reviewer agents
            ├── repo-quality-reviewer.md
            └── repo-security-reviewer.md
```

### Optional companion: `pell-everything` meta-plugin

A second plugin in the marketplace can declare dependencies on third-party companions (`superpowers`, `frontend-design`) so installing `pell-everything` pulls in the full recommended environment. This is for "I want the whole Pell experience in one command" users. Build only after `pell` itself is stable.

## 10. Build order

1. **This architecture doc** — get sign-off on conventions
2. **Bootstrap the `pell` plugin and migrate existing work:**
   - Create `plugins/pell/` with empty subfolders
   - Move existing `three-pass-review` and `local-review` command bodies to `plugins/pell/commands/three-pass-review.md` and `plugins/pell/commands/local-review.md`
   - Unify the six existing reviewer agents into three: `plugins/pell/agents/{correctness,quality,security}-reviewer.md` (each handles both PR-mode Jira context and local-mode CLAUDE.md discovery)
   - Create the three reviewer-primitive commands: `commands/correctness-review.md`, `commands/quality-review.md`, `commands/security-review.md`
   - Rewrite the two composite commands to dispatch the unified agents
   - Update `marketplace.json` to list only `pell`
   - Delete the old `plugins/three-pass-review/` and `plugins/local-review/` directories
3. **Bucket 2: `pell:frontend-router` skill** — simplest new addition (one auto-invoked skill, no MCP, no config). Validates the skill-as-router pattern.
4. **Bucket 1: `pell:start-work` command** — most substantial new addition (exercises adaptive Jira transitions, shared config, freeform context). Validates the full MCP + config + Jira pattern.
5. **Bucket 1: `pell:related`, `pell:triage`, `pell:finish-work`** — replicate patterns from `start-work`.
6. **Bucket 2: `pell:claude-md-init`** — once Pell's house style is captured in writing.
7. **Bucket 3: `pell:from-ticket`, `pell:wrap-up`** — pure composers, easy once the others exist.
8. **Optional: `pell-everything` meta-plugin** — if installs across the team prove painful.

Each bucket gets its own follow-up spec under `docs/specs/`.

## 11. Resolved decisions log

All previously-open questions are now resolved:

- ✅ **Plugin organization** — one giant `pell` plugin (§1)
- ✅ **Naming** — `/pell:<command>`, no doubling (§2)
- ✅ **External dependency policy** — notify users, never force installs (§4.3)
- ✅ **WSL config path** — `~/.claude/pell-config.json` resolves to `/home/bnfroncek/.claude/pell-config.json` under WSL; consistent with existing Claude config. No workaround needed (§5)
- ✅ **Structured flags** — supported but supplementary. Reserved: `--reset` (clear cached config), `--dry-run` (preview side effects without applying), `--verbose`. Freeform `$ARGUMENTS` remains primary input (§6)
- ✅ **Reviewer output filtering** — reviewers surface everything including nits, with severity. Consumer triages (§8)
- ✅ **Direct-invoke output mode** — pretty markdown when invoked via slash command, raw JSON when dispatched via `Agent` tool. Reviewer detects mode and adapts (§8)
- ✅ **Meta-plugin** — `pell-everything` to be added after `pell` is stable (§9)

## 12. Implementation status

The conventions above are stable and the bulk of the roadmap shipped:

- **Built:** all three review primitives + both composites; both repo-wide audits (`repo-review`, `repo-security-review`) with their `repo-*-reviewer` agents; Jira ops (`my-tickets`, `triage`, `related`, `start-work`, `finish-work`); composers (`from-ticket`, `wrap-up`); the `frontend-router` skill; and the `visual-scratchpad` skill + `/pell:visualize` command (a surface not anticipated in the original build order).
- **Not yet built:** `claude-md-init` (§10.6) and the optional `pell-everything` meta-plugin (§9).
- **Remaining gaps + the next wave of work** (doc reconciliation, a test-coverage review dimension, `address-review`, `review-queue`, and second-tier composers) are tracked in [`2026-05-28-pell-toolkit-improvements-plan.md`](2026-05-28-pell-toolkit-improvements-plan.md).
