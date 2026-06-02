---
description: Compose ticket-to-implementation in one command. Fetches a Jira ticket, dispatches /pell:start-work to create a branch, then hands off to superpowers:brainstorming → writing-plans for the design and plan. When superpowers isn't installed, runs a lightweight inline substitute that produces a starter spec.
argument-hint: "<JIRA-KEY> [skip start-work | design only | plan only | start-work pre-auths | --reset] [freeform]"
---

You are running **`/pell:from-ticket`**. Sequence three pieces of existing machinery — `/pell:start-work`, `superpowers:brainstorming`, `superpowers:writing-plans` — into one ticket-to-plan workflow. `from-ticket` itself does no design work; it parses args, gathers context, detects existing artifacts, and dispatches each stage with the right inputs.

The user passed: `$ARGUMENTS`

## Step 1 — Parse arguments

Extract from `$ARGUMENTS` (all matches independent; freeform-first):

- **Jira key** (required) — first match for `[A-Z][A-Z0-9]+-\d+`. If none, exit with: "I need a Jira key, e.g. `/pell:from-ticket RRS-1020`."
- **Skip flags** (case-insensitive):
  - `skip start-work` / `branch ready` / `already on branch` → skip Stage 4
  - `design only` / `skip plan` / `no plan` → after Stage 5, instruct brainstorming not to chain into writing-plans
  - `plan only` / `skip brainstorm` / `skip design` → skip brainstorming; dispatch writing-plans directly. Requires an existing spec for `<KEY>`; otherwise error: "plan only requires an existing spec for `<KEY>`."
- **Pre-auths forwarded verbatim to `/pell:start-work`** (do NOT reinterpret; capture the matched substrings to append to the start-work invocation):
  - `assign to me`, `assign me`
  - `move it to <status>`, `transition to <status>`, `move to <status>`
  - `don't touch jira`, `skip jira`, `no jira changes`
  - `call it <slug>`, `name it <slug>`, `branch <slug>`
- **`--reset` flag** — clears artifacts for this ticket key (handled in Step 3).

**Conflict rules:**
- `skip start-work` + `plan only` is valid (resume-from-spec workflow).
- `design only` + `plan only` is an error: "Pick one — design only or plan only, not both."
- Unrecognized text passes through as informational context. It does NOT affect control flow at the from-ticket layer; brainstorming sees it as additional seed context.

Extract `projectKey` from the Jira key (everything before the `-`).

## Step 2 — Fetch ticket + related

**Resolve `cloudId`:**

Read `~/.claude/pell-config.json` (treat missing as `{}`).
- If `jira.cloud_id` is set, use it.
- Otherwise call `mcp__plugin_atlassian_atlassian__getAccessibleAtlassianResources`, use the first result's `id`, atomically write it back to `pell-config.json:jira.cloud_id`.

**Run the two MCP calls in parallel:**

1. `mcp__plugin_atlassian_atlassian__getJiraIssue` with:
   - `cloudId`
   - `issueIdOrKey`: `<KEY>`
   - `fields`: `["summary", "description", "status", "issuetype", "priority", "assignee", "reporter", "labels", "issuelinks", "subtasks", "parent"]`
   - `responseContentFormat`: `"markdown"`

2. `mcp__plugin_atlassian_atlassian__getJiraIssueRemoteIssueLinks` with `cloudId` and `issueIdOrKey: <KEY>`.

**Failure handling:**
- Ticket 404 → exit: "`<KEY>` doesn't exist in Jira (or you don't have access)."
- Ticket MCP unreachable → exit: "Jira MCP isn't responding — see the README prerequisites."
- Remote-links 404 or empty → continue silently; render `(no external links)` in the seed.
- Remote-links other failure → continue; render `(remote links unavailable — <error>)` in the seed.

**Capture for later stages:**
- `summary`, `description` (full markdown, no truncation)
- `status.name`, `issuetype.name`, `priority.name`, `labels`
- `assignee.displayName` (default `"unassigned"`), `reporter.displayName` (default `"unknown"` — Atlassian MCP sometimes omits this even when requested)
- `parent` (key + summary + status), `subtasks` (key + summary + status list), `issuelinks` (relationship + key + summary + status list)
- Remote links (title + url + application.name)

After the fetch, print one line: `Loaded <KEY> — <summary> (status: <status>, type: <type>).`

## Step 3 — Existing-artifact detection

Glob for prior artifacts in the working directory:

```bash
ls docs/superpowers/specs/<KEY>-*.md 2>/dev/null
ls docs/superpowers/plans/<KEY>-*.md 2>/dev/null
```

If `docs/superpowers/` doesn't exist, treat as "no artifacts found."

**If `--reset` was passed:** enumerate all matched files, then ask once:

> Remove N existing artifacts for `<KEY>`?
> - `<path1>`
> - `<path2>`
> (y/n)

On `y`, delete all listed files and proceed as Fresh below. On `n`, exit cleanly.

**Otherwise, branch on what was found:**

| Specs | Plans | Behavior |
|-|-|-|
| 0 | 0 | Fresh — proceed through all stages normally |
| ≥1 | 0 | Prompt: "Design spec exists for `<KEY>`: `<path>`. Pick one: (1) resume — skip brainstorming, dispatch writing-plans against this spec; (2) rewrite — `--reset` and start fresh; (3) cancel." |
| 0 | ≥1 | Prompt: "Plan file exists for `<KEY>` without a matching spec: `<path>`. Pick one: (1) open the plan in your editor and proceed manually; (2) rewrite — `--reset` and start fresh; (3) cancel." Don't auto-dispatch — anomalous state. |
| ≥1 | ≥1 | Prompt: "Both spec and plan exist for `<KEY>`:\n  spec: `<spec path>`\n  plan: `<plan path>`\nPick one: (1) open both — work is done; (2) rewrite — `--reset` and start fresh; (3) cancel." |

**Multiple files in either category:** list all paths, then ask the user which to use via numbered prompt. Don't pick the newest automatically — multiple files usually indicates a prior abort needing cleanup attention.

**Skip-flag interactions:**
- `plan only` + spec found → silently resume (this is exactly what plan-only means).
- `plan only` + no spec found → error per Step 1.
- `design only` + spec found → ignore the existing spec, run brainstorming fresh. Brainstorming writes a new spec file with a different timestamp suffix.

**Resume implies "skip start-work":** when the user picks option (1) for any non-fresh state, treat it as if `skip start-work` was also passed. The assumption is they're already on a `<KEY>-*` branch. If they aren't, they can re-invoke `/pell:from-ticket <KEY>` without resuming to get the branch created.

**Rewrite option (2):** sets the `--reset` flag inline and re-enters Step 3 from the top.

## Step 4 — Dispatch `/pell:start-work`

Skip this entire step when:
- Any of `skip start-work` / `branch ready` / `already on branch` was in `$ARGUMENTS`
- The user picked option (1) for any non-fresh state in Step 3

Otherwise, invoke `/pell:start-work <KEY> <forwarded args>` where `<forwarded args>` is the concatenation of all pre-auth substrings captured in Step 1 (assign/transition/skip-jira/branch-name phrases).

If `/pell:start-work` exits non-zero (cancellation, git error, etc.), `from-ticket` exits too. No partial state — the design phase is meaningless without a working branch.

## Step 5 — Hand off to `superpowers:brainstorming`

**Presence check:** attempt to invoke the `superpowers:brainstorming` skill via the Skill tool. If the call errors with "skill not found" or equivalent, fall through to Step 6 (inline substitute). Test the specific skill being invoked — if `brainstorming` is missing but `writing-plans` is present (or vice versa), only the missing one falls back.

**Plan-only path (resume from Step 3):**

If the user chose option (1) in a spec-found case, skip brainstorming entirely. Dispatch `superpowers:writing-plans` directly via the Skill tool with these args:

```
Plan implementation based on the existing spec at <spec path>.
Save the plan to docs/superpowers/plans/<KEY>-YYYY-MM-DD-<feature>.md.
```

If `superpowers:writing-plans` is also missing, exit with: "plan only requires `superpowers:writing-plans`, which isn't installed."

**Normal path — invoke brainstorming with this seed:**

Print one line first: `Handing off to superpowers:brainstorming...`

Then invoke `superpowers:brainstorming` via the Skill tool with these args:

```
Design implementation of <KEY>: <summary>

Ticket context:
- Status: <status>  ·  Type: <issuetype>  ·  Priority: <priority>
- Assignee: <assignee>  ·  Reporter: <reporter>
- Labels: <labels or "none">

Description:
<full description markdown>

Connections:
- Parent: <key — summary> [<status>]                     (omit if absent)
- Subtasks:
  - <key — summary> [<status>]
  - ...                                                  (omit section if no subtasks)
- Linked issues:
  - <relationship> <key> — <summary> [<status>]
  - ...                                                  (omit section if no links)
- External links:
  - [<title>](<url>) — <application.name>
  - ...                                                  (omit section if no remote links)

Save the design spec to docs/superpowers/specs/<KEY>-YYYY-MM-DD-<topic>-design.md (topic slug chosen during brainstorming).

When invoking writing-plans, instruct it to save the plan to docs/superpowers/plans/<KEY>-YYYY-MM-DD-<feature>.md.

<any unrecognized freeform text from $ARGUMENTS>
```

**`design only` modification:**

Append to the seed: `Do not chain into writing-plans after the design is approved. Stop after the user approves the written spec.`

After dispatching brainstorming, `from-ticket` is done. Brainstorming owns the design conversation and auto-chains into writing-plans per its own checklist.

## Step 6 — Inline substitute (superpowers missing)

This step runs **only** when Step 5's presence check failed. Other failure modes (dispatch errors, filesystem errors) surface verbatim and do NOT trigger the inline substitute.

**Print the notice:**

> Heads up: `superpowers` isn't installed, so I'll run a lightweight design pass inline. For the full brainstorm → plan workflow, install superpowers with `/plugin install superpowers@claude-plugins-official` and re-run.

**Inline pass — three sub-steps:**

1. **Print the seed** — render the same ticket+related context block from Step 5's seed directly to the user so they can see what we're working with.

2. **Ask 3 questions, one at a time, using `AskUserQuestion`:**
   - Q1: "What's the smallest version of this that delivers value?" — multiple choice with 3-4 scope options synthesized from the ticket description, plus an "Other" path.
   - Q2: "What's the biggest risk or unknown?" — free-text via "Other", or 3 ticket-derived suggestions.
   - Q3: "Any constraints I should know about?" — free-text, or "No additional constraints."

3. **Write a starter spec** to `docs/superpowers/specs/<KEY>-YYYY-MM-DD-design.md` with this structure:

```markdown
# <KEY> — <summary>

**Status:** Starter spec (generated by /pell:from-ticket inline substitute)
**Date:** YYYY-MM-DD

## Context
<ticket summary, status, type, priority, assignee, reporter>

## Description
<full markdown description from Jira>

## Connections
<parent/subtasks/issuelinks/remote-links rendered as in Step 5's seed>

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

**Final report after the write:**

```
Branch created (start-work output above)
Starter spec saved to docs/superpowers/specs/<KEY>-YYYY-MM-DD-design.md
  Note: install superpowers for the full brainstorm + plan workflow.
```

If the filesystem write fails, print the error verbatim and leave the user on the branch start-work created. Do not retry.

## Operator notes

- **Never** mutate Jira from this command directly. All Jira side-effects route through `/pell:start-work`'s gates.
- **Never** commit, push, or open a PR. Out of scope.
- **Never** auto-pick artifacts. When multiple specs or plans exist for a key, always ask the user which to use.
- **No rollback ever.** If `start-work` creates a branch and brainstorming subsequently errors, the branch stays. The user's working tree is the source of truth; `from-ticket` doesn't undo work.
- The seed sent to brainstorming is a one-shot context dump. If brainstorming asks for follow-up details mid-conversation, the user can re-run `/pell:related <KEY>` separately for that.
- The inline substitute is reserved for the missing-plugin case. Other dispatch errors (e.g. brainstorming throws mid-run) surface verbatim — they're not what the substitute is for.
- If `superpowers:writing-plans` exists but `superpowers:brainstorming` doesn't (or vice versa), treat them independently. The plan-only resume case in Step 5 needs only `writing-plans`; the normal path needs `brainstorming`.

## Out of scope

The following are explicitly NOT part of `/pell:from-ticket`:

- Implementation execution (use `superpowers:executing-plans` or `superpowers:subagent-driven-development` separately once the plan exists).
- Multi-ticket batches (one key at a time).
- Comment-thread synthesis from Jira (too noisy per design decision).
- Auto-cleanup of stale plans/specs (handled by `--reset` only, not background sweeping).
- Branch base override (defers to `/pell:start-work`'s own behavior).
