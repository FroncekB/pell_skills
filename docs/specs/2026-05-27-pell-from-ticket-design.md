# `/pell:from-ticket` — Design Spec

**Status:** approved
**Author:** Brandon Froncek + Claude
**Date:** 2026-05-27
**Parent spec:** [`2026-05-27-pell-skills-architecture.md`](2026-05-27-pell-skills-architecture.md)

## Purpose

`/pell:from-ticket <KEY>` is a Bucket 3 composer. It takes a Jira ticket and walks the user from "I have a ticket" to "I have a branch, a design spec, and an implementation plan" in one command, by sequencing three pieces of existing machinery:

1. `/pell:start-work` — branch creation + optional Jira side-effects
2. `superpowers:brainstorming` — design conversation, writes a spec
3. `superpowers:writing-plans` — turns the spec into a task-by-task implementation plan

`from-ticket` itself does no design work; it's a thin orchestrator that fetches ticket context, detects existing artifacts, and dispatches each stage with the right inputs. When `superpowers` isn't installed, `from-ticket` substitutes a lightweight inline brainstorm that produces a starter spec — the user still leaves the command with a useful artifact.

## 1. Invocation

```
/pell:from-ticket <JIRA-KEY> [freeform context]
```

Examples:

```
/pell:from-ticket RRS-1020
/pell:from-ticket RRS-1020 assign to me, move it to In Progress
/pell:from-ticket RRS-1020 skip start-work, design only
/pell:from-ticket RRS-1020 plan only
/pell:from-ticket RRS-1020 --reset
```

## 2. Architecture & flow

`from-ticket` is a sequential composer with five stages:

```
1. Parse arguments
2. Fetch ticket + related (parallel MCP burst)
3. Detect existing artifacts (specs/plans for <KEY>) → branch on what's already there
4. Dispatch /pell:start-work <KEY> <forwarded args>   ← skipped on certain flags / resume cases
5. Hand off to superpowers:brainstorming with synthesized seed
   ↳ brainstorming chains into writing-plans per its own checklist
   ↳ if superpowers is missing → inline substitute (mini-brainstorm + starter spec)
```

`from-ticket` exits cleanly after Stage 5's handoff. Brainstorming owns the design conversation and the spec→plan transition; writing-plans renders the final "Plan saved to …" — that's the user's "all done" signal. No synthesis report from `from-ticket` itself; the individual stages report their own outcomes.

## 3. Argument grammar

Freeform-first per Pell convention. Pieces are extracted independently — any combination is valid.

### 3.1 Required

- **Jira key** — first match for `[A-Z][A-Z0-9]+-\d+`. If none, exit: `"I need a Jira key, e.g. /pell:from-ticket RRS-1020."`

### 3.2 Skip flags (case-insensitive)

| Phrases | Effect |
|-|-|
| `skip start-work`, `branch ready`, `already on branch` | Skip Stage 4 |
| `design only`, `skip plan`, `no plan` | After Stage 5, instruct brainstorming not to chain into writing-plans |
| `plan only`, `skip brainstorm`, `skip design` | Skip Stage 5's brainstorming; dispatch writing-plans directly. Requires an existing spec for `<KEY>`; otherwise error: `"plan only requires an existing spec for <KEY>."` |

### 3.3 Pre-auths forwarded verbatim to `/pell:start-work`

Recognized at parse time but **not** reinterpreted — the raw matched substrings are appended to the Stage 4 invocation so `start-work` parses them in its own grammar:

- `assign to me`, `assign me`
- `move it to <status>`, `transition to <status>`, `move to <status>`
- `don't touch jira`, `skip jira`, `no jira changes`
- `call it <slug>`, `name it <slug>`, `branch <slug>`

### 3.4 `--reset`

Clears artifacts for this ticket key. Deletes any existing `docs/superpowers/specs/<KEY>-*.md` and `docs/superpowers/plans/<KEY>-*.md` files after one consolidated confirmation prompt: `"Remove N existing artifacts for <KEY>? (y/n)"`.

Does NOT forward to `start-work`'s `--reset` (that one clears cached Jira transitions; different concern).

### 3.5 Conflict rules

- `skip start-work` + `plan only` is valid (resume-from-spec workflow).
- `design only` + `plan only` is an error: `"Pick one — design only or plan only, not both."`
- Unrecognized text passes through as informational context (no control-flow impact at the `from-ticket` layer; brainstorming sees it as additional seed context).

## 4. Stage 2 — Ticket + related fetch

### 4.1 Resolve `cloudId`

Read `~/.claude/pell-config.json` (treat missing as `{}`). If `jira.cloud_id` is set, use it; otherwise call `mcp__plugin_atlassian_atlassian__getAccessibleAtlassianResources`, use the first result's `id`, write back atomically. Same pattern as `start-work` and `related`.

### 4.2 Parallel fetch

Two MCP calls in parallel:

**Ticket** — `mcp__plugin_atlassian_atlassian__getJiraIssue` with:
- `cloudId`
- `issueIdOrKey`: `<KEY>`
- `fields`: `["summary", "description", "status", "issuetype", "priority", "assignee", "reporter", "labels", "issuelinks", "subtasks", "parent"]`
- `responseContentFormat`: `"markdown"`

**Remote links** — `mcp__plugin_atlassian_atlassian__getJiraIssueRemoteIssueLinks` with `cloudId` and `issueIdOrKey: <KEY>`.

### 4.3 Failure handling

| Failure | Behavior |
|-|-|
| Ticket fetch 404 | Exit: `"<KEY> doesn't exist in Jira (or you don't have access)."` |
| Ticket fetch MCP unreachable | Exit: `"Jira MCP isn't responding — see the README prerequisites."` |
| Remote-links 404 or empty | Continue silently; render `(no external links)` in the seed |
| Remote-links other failure | Continue; render `(remote links unavailable — <error>)` in the seed |

### 4.4 Captured fields (used by Stage 3, 5, and the inline substitute)

- `summary`, `description` (full markdown — no truncation)
- `status.name`, `issuetype.name`, `priority.name`, `labels`
- `assignee.displayName` (default `"unassigned"`), `reporter.displayName` (default `"unknown"` — Atlassian MCP sometimes omits this even when requested)
- `parent` (key + summary + status), `subtasks` (key + summary + status list), `issuelinks` (relationship + key + summary + status list)
- Remote links (title + url + application.name)

## 5. Stage 3 — Existing-artifact detection

Glob for prior artifacts before dispatching any stage:

```bash
ls docs/superpowers/specs/<KEY>-*.md 2>/dev/null
ls docs/superpowers/plans/<KEY>-*.md 2>/dev/null
```

If `docs/superpowers/` doesn't exist, treat as "no artifacts found."

### 5.1 Branching matrix

| Specs found | Plans found | Behavior |
|-|-|-|
| 0 | 0 | Fresh run — proceed through all stages normally |
| ≥1 | 0 | Prompt: `"Design spec exists for <KEY>: <path>. Pick one: (1) resume — skip brainstorming, dispatch writing-plans against this spec; (2) rewrite — --reset and start fresh; (3) cancel."` |
| 0 | ≥1 | Prompt: `"Plan file exists for <KEY> without a matching spec: <path>. Pick one: (1) open the plan in your editor and proceed manually; (2) rewrite — --reset and start fresh; (3) cancel."` Don't auto-dispatch — anomalous state, surface to the user. |
| ≥1 | ≥1 | Prompt: `"Both spec and plan exist for <KEY>: spec: <spec path>, plan: <plan path>. Pick one: (1) open both — work is done; (2) rewrite — --reset and start fresh; (3) cancel."` |

### 5.2 Multiple files in either category

List all paths, then ask the user which to use via numbered prompt. Don't pick the newest automatically — multiple files usually indicates a prior abort needing cleanup attention.

### 5.3 Skip-flag interactions

- `plan only` + spec found → silently resume (the explicit intent of plan-only).
- `plan only` + no spec found → error per §3.2.
- `design only` + spec found → ignore the existing spec, run brainstorming fresh. Brainstorming writes its own new spec file with a different timestamp suffix; the old file is untouched.

### 5.4 `--reset` short-circuit

Detection still runs but only to enumerate which files will be deleted. One consolidated confirmation, then delete, then proceed as Fresh.

### 5.5 Resume implies "skip start-work"

When the user picks option (1) for any non-fresh state, treat it as if `skip start-work` was also passed. The assumption is they're already on a branch (because they've worked on this ticket before).

If a user picked resume but isn't actually on a `<KEY>-*` branch, they can re-invoke `/pell:from-ticket <KEY>` without resuming to get the branch created. We don't try to detect-and-warn here — the cost of a wrong assumption is one extra invocation, and the alternative is dispatching `start-work` on every resume (which would prompt with an "already exists" question the user just told us to skip).

## 6. Stage 4 — `/pell:start-work` dispatch

Skip when:
- Any of `skip start-work` / `branch ready` / `already on branch` was in `$ARGUMENTS`
- Resume case from §5.5

Otherwise, invoke `/pell:start-work <KEY> <forwarded args>` where `<forwarded args>` is the concatenation of all matched pre-auth substrings from §3.3.

If `start-work` exits non-zero (cancellation, git error, etc.) → `from-ticket` also exits. No partial state — the design phase is meaningless without a working branch.

## 7. Stage 5 — `superpowers:brainstorming` handoff

### 7.1 Presence check

Attempt to invoke the `superpowers:brainstorming` skill. If the invocation errors with "skill not found" or equivalent, fall through to §8 (inline substitute). Test the specific skill we're about to invoke, not the bundle — if `brainstorming` is missing but `writing-plans` is present (or vice versa), only the missing one falls back.

### 7.2 Seed for brainstorming

```
Design implementation of <KEY>: <summary>

Ticket context:
- Status: <status>  ·  Type: <issuetype>  ·  Priority: <priority>
- Assignee: <assignee>  ·  Reporter: <reporter>
- Labels: <labels or "none">

Description:
<full description markdown>

Connections:
- Parent: <key — summary> [<status>]                     ← omit if absent
- Subtasks:
  - <key — summary> [<status>]
  - ...                                                  ← omit section if no subtasks
- Linked issues:
  - <relationship> <key> — <summary> [<status>]
  - ...                                                  ← omit section if no links
- External links:
  - [<title>](<url>) — <application.name>
  - ...                                                  ← omit section if no remote links

Save the design spec to docs/superpowers/specs/<KEY>-YYYY-MM-DD-<topic>-design.md (topic slug chosen during brainstorming).

When invoking writing-plans, instruct it to save the plan to docs/superpowers/plans/<KEY>-YYYY-MM-DD-<feature>.md.

<any unrecognized freeform text from $ARGUMENTS>
```

### 7.3 `design only` modification

Append to the seed: `Do not chain into writing-plans after the design is approved. Stop after the user approves the written spec.`

### 7.4 Plan-only path (resume from §5)

Skip brainstorming entirely. Dispatch `superpowers:writing-plans` directly with args:

```
Plan implementation based on the existing spec at <spec path>.
Save the plan to docs/superpowers/plans/<KEY>-YYYY-MM-DD-<feature>.md.
```

## 8. Inline substitute (superpowers missing)

When the `superpowers:brainstorming` skill isn't available, `from-ticket` runs a stripped-down brainstorm inline. No skill dispatch, no implementation plan — just enough to leave the user with a useful starter spec.

### 8.1 Notice

Print before starting:

> Heads up: `superpowers` isn't installed, so I'll run a lightweight design pass inline. For the full brainstorm → plan workflow, install superpowers with `/plugin install superpowers@claude-plugins-official` and re-run.

### 8.2 Inline pass — three steps

1. **Print the seed** — render the same ticket+related context block from §7.2 directly to the user so they can see what we're working with.

2. **Ask 3 questions, one at a time, using `AskUserQuestion`:**
   - "What's the smallest version of this that delivers value?" — multiple choice with 3-4 scope options synthesized from the ticket description, plus an "Other" path.
   - "What's the biggest risk or unknown?" — free-text via "Other", or 3 ticket-derived suggestions.
   - "Any constraints I should know about?" — free-text, or "No additional constraints."

3. **Write a starter spec** to `docs/superpowers/specs/<KEY>-YYYY-MM-DD-design.md` with the structure below, then exit.

### 8.3 Starter spec structure

```markdown
# <KEY> — <summary>

**Status:** Starter spec (generated by /pell:from-ticket inline substitute)
**Date:** YYYY-MM-DD

## Context
<ticket summary, status, type, priority, assignee, reporter>

## Description
<full markdown description from Jira>

## Connections
<parent/subtasks/issuelinks/remote-links rendered as in §7.2>

## Scope (user-stated)
<answer to Q1>

## Risks & unknowns
<answer to Q2>

## Constraints
<answer to Q3>

## Next steps
- [ ] Refine this spec or run `/pell:from-ticket <KEY> plan only` after installing superpowers
- [ ] Run `superpowers:writing-plans` (or your preferred planner) to break this into tasks
```

### 8.4 Final report after inline write

```
✓ Branch created (start-work output above)
✓ Starter spec saved to docs/superpowers/specs/<KEY>-YYYY-MM-DD-design.md
  ↳ Install superpowers for the full brainstorm + plan workflow.
```

The inline path is reserved exclusively for the missing-plugin case. Other failure modes (Stage 5 dispatch errors, filesystem errors) surface verbatim — they're not what the inline substitute is for.

## 9. Error handling summary

| Stage | Failure | Behavior |
|-|-|-|
| Parse args | Missing key or conflicting flags | Exit with named error before any MCP call |
| Ticket fetch | 404 | Exit: `"<KEY> doesn't exist in Jira (or you don't have access)."` |
| Ticket fetch | MCP unreachable | Exit: `"Jira MCP isn't responding — see the README prerequisites."` |
| Remote-links fetch | Any failure | Continue; render `(no external links)` or `(remote links unavailable — <error>)` in the seed |
| Artifact detection | `docs/superpowers/` missing | Treat as no artifacts; proceed |
| `--reset` deletion | Filesystem error on any file | Exit with verbatim error before dispatching any stage |
| Stage 4 (`start-work`) | Non-zero exit | `from-ticket` exits too; no partial state |
| Stage 5 (brainstorming) | Skill not found | Fall through to §8 inline substitute |
| Stage 5 (brainstorming) | Other dispatch error | Surface verbatim; do NOT run inline substitute |
| Inline substitute write | Filesystem error | Print error + leave the user on the branch start-work created |

**No rollback ever.** If `start-work` creates a branch and brainstorming subsequently errors, the branch stays. The user's working tree is the source of truth; `from-ticket` doesn't undo work.

## 10. `from-ticket`'s own output

`from-ticket` prints two lines and then exits — each dispatched stage owns the rest:

1. After parsing + fetch: `Loaded <KEY> — <summary> (status: <status>, type: <type>).`
2. Before dispatching Stage 5: `Handing off to <superpowers:brainstorming | inline substitute>...`

That's it. `start-work` prints its Step 6 report; brainstorming prints its checklist progression; writing-plans prints "Plan saved to …" at the end.

## 11. Operator notes

- **Never** mutate Jira from `from-ticket` directly. All Jira side-effects route through `/pell:start-work`'s gates.
- **Never** commit, push, or open a PR. Out of scope.
- **Never** auto-pick artifacts. When multiple specs or plans exist for a key, always ask the user which to use.
- The seed sent to brainstorming is a one-shot context dump. If brainstorming asks for follow-up details, the user can re-run `/pell:related <KEY>` for that.
- If `superpowers:writing-plans` exists but `superpowers:brainstorming` doesn't (or vice versa), treat the missing one independently. The plan-only resume case dispatches `writing-plans` directly; if it's missing there, exit with: `"plan only requires superpowers:writing-plans, which isn't installed."`

## 12. Out of scope

The following are explicitly NOT part of `/pell:from-ticket`:

- Implementation execution (use `superpowers:executing-plans` or `superpowers:subagent-driven-development` separately once the plan exists).
- Multi-ticket batches (one key at a time).
- Comment-thread synthesis from Jira (per design decision in brainstorming — too noisy).
- Auto-cleanup of stale plans/specs (handled by `--reset` only, not background sweeping).
- Branch base override (`from-ticket` doesn't second-guess `start-work`'s base-branch behavior).
