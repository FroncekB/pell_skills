# `/pell:from-ticket` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Bucket 3 composer command at `plugins/pell/commands/from-ticket.md` that walks the user from a Jira key to a branch + design spec + implementation plan via three dispatches (`/pell:start-work`, `superpowers:brainstorming`, `superpowers:writing-plans`), with a notify-don't-block inline substitute when superpowers is missing.

**Architecture:** One command file. Prose, not code — the file is a prompt that Claude executes. Each task drafts one section of the file in order, gated on `claude plugin validate ./plugins/pell` after every change. No tests in the unit-test sense; the validation gate catches manifest errors, and a final manual smoke test exercises the live command against a real ticket.

**Tech Stack:** Markdown command files, Atlassian MCP (Jira), Bash for filesystem checks. No new dependencies.

---

## File Structure

```
plugins/pell/commands/from-ticket.md   # new — main deliverable
plugins/pell/.claude-plugin/plugin.json # modify — version 0.7.3 → 0.8.0
README.md                               # modify — add /pell:from-ticket entry
docs/specs/2026-05-27-pell-from-ticket-design.md  # already exists (this plan's source)
```

All command-body sections live in the single `from-ticket.md` file. The plan adds them incrementally — one section per task — and commits after each so the file is always in a valid state.

---

## Task Conventions

Each implementation task follows the same shape:

1. **Apply the edit** — Write or Edit the file with the exact prompt content shown.
2. **Validate** — run `claude plugin validate ./plugins/pell` (must exit 0).
3. **Commit** — one logical commit per task with a `feat(from-ticket): ...` message.

The validation gate is the substitute for a unit test: it catches manifest-breaking changes (frontmatter errors, missing required fields). The actual prompt content can only be verified by smoke-testing the live command, which is Task 10.

If a `claude plugin validate` fails mid-task: revert the edit, fix the underlying issue (usually frontmatter), re-apply, and re-validate before committing.

---

## Task 1: Scaffold the file with frontmatter, intro, and Step 1 (parse arguments)

**Files:**
- Create: `plugins/pell/commands/from-ticket.md`

- [ ] **Step 1: Create the file with this content**

````markdown
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
````

- [ ] **Step 2: Validate**

Run: `claude plugin validate ./plugins/pell`
Expected: exit 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add plugins/pell/commands/from-ticket.md
git commit -m "feat(from-ticket): scaffold command with frontmatter and arg parsing"
```

---

## Task 2: Step 2 — Fetch ticket + related (parallel MCP burst)

**Files:**
- Modify: `plugins/pell/commands/from-ticket.md` (append)

- [ ] **Step 1: Append this content to the end of the file**

````markdown

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
````

- [ ] **Step 2: Validate**

Run: `claude plugin validate ./plugins/pell`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add plugins/pell/commands/from-ticket.md
git commit -m "feat(from-ticket): add Step 2 — ticket + related fetch"
```

---

## Task 3: Step 3 — Existing-artifact detection

**Files:**
- Modify: `plugins/pell/commands/from-ticket.md` (append)

- [ ] **Step 1: Append this content**

````markdown

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
````

- [ ] **Step 2: Validate**

Run: `claude plugin validate ./plugins/pell`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add plugins/pell/commands/from-ticket.md
git commit -m "feat(from-ticket): add Step 3 — existing-artifact detection and resume"
```

---

## Task 4: Step 4 — Dispatch /pell:start-work

**Files:**
- Modify: `plugins/pell/commands/from-ticket.md` (append)

- [ ] **Step 1: Append this content**

````markdown

## Step 4 — Dispatch `/pell:start-work`

Skip this entire step when:
- Any of `skip start-work` / `branch ready` / `already on branch` was in `$ARGUMENTS`
- The user picked option (1) for any non-fresh state in Step 3

Otherwise, invoke `/pell:start-work <KEY> <forwarded args>` where `<forwarded args>` is the concatenation of all pre-auth substrings captured in Step 1 (assign/transition/skip-jira/branch-name phrases).

If `/pell:start-work` exits non-zero (cancellation, git error, etc.), `from-ticket` exits too. No partial state — the design phase is meaningless without a working branch.
````

- [ ] **Step 2: Validate**

Run: `claude plugin validate ./plugins/pell`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add plugins/pell/commands/from-ticket.md
git commit -m "feat(from-ticket): add Step 4 — start-work dispatch"
```

---

## Task 5: Step 5 — Hand off to superpowers:brainstorming (with design-only and plan-only variants)

**Files:**
- Modify: `plugins/pell/commands/from-ticket.md` (append)

- [ ] **Step 1: Append this content**

````markdown

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
````

- [ ] **Step 2: Validate**

Run: `claude plugin validate ./plugins/pell`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add plugins/pell/commands/from-ticket.md
git commit -m "feat(from-ticket): add Step 5 — brainstorming handoff (with plan-only and design-only variants)"
```

---

## Task 6: Step 6 — Inline substitute when superpowers is missing

**Files:**
- Modify: `plugins/pell/commands/from-ticket.md` (append)

- [ ] **Step 1: Append this content**

````markdown

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
✓ Branch created (start-work output above)
✓ Starter spec saved to docs/superpowers/specs/<KEY>-YYYY-MM-DD-design.md
  ↳ Install superpowers for the full brainstorm + plan workflow.
```

If the filesystem write fails, print the error verbatim and leave the user on the branch start-work created. Do not retry.
````

- [ ] **Step 2: Validate**

Run: `claude plugin validate ./plugins/pell`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add plugins/pell/commands/from-ticket.md
git commit -m "feat(from-ticket): add Step 6 — inline substitute when superpowers missing"
```

---

## Task 7: Operator notes and out-of-scope section

**Files:**
- Modify: `plugins/pell/commands/from-ticket.md` (append)

- [ ] **Step 1: Append this content**

````markdown

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
````

- [ ] **Step 2: Validate**

Run: `claude plugin validate ./plugins/pell`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add plugins/pell/commands/from-ticket.md
git commit -m "feat(from-ticket): add operator notes and out-of-scope"
```

---

## Task 8: Add /pell:from-ticket entry to README.md

**Files:**
- Modify: `README.md` — insert a new section for `/pell:from-ticket` next to the other Jira-ops commands (after `/pell:start-work` and before `/pell:finish-work`)

- [ ] **Step 1: Read the README to find the right insertion point**

Run: `grep -n "pell:start-work\|pell:finish-work" README.md`

Identify the line range for the `/pell:start-work` section. The new section goes immediately after it.

- [ ] **Step 2: Edit the README**

Use the Edit tool to insert this section after the `/pell:start-work` section (find the last line of that section and append the new section below it):

````markdown
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
````

- [ ] **Step 3: Validate**

Run: `claude plugin validate ./plugins/pell`
Expected: exit 0 (README isn't validated by the plugin tool, but this catches accidental damage to nearby plugin files).

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(readme): add /pell:from-ticket section"
```

---

## Task 9: Bump plugin version to 0.8.0

**Files:**
- Modify: `plugins/pell/.claude-plugin/plugin.json` — change `"version": "0.7.3"` to `"version": "0.8.0"`

- [ ] **Step 1: Edit the version field**

Use Edit on `plugins/pell/.claude-plugin/plugin.json`:
- `old_string`: `"version": "0.7.3"`
- `new_string`: `"version": "0.8.0"`

- [ ] **Step 2: Validate**

Run: `claude plugin validate ./plugins/pell`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add plugins/pell/.claude-plugin/plugin.json
git commit -m "chore(pell): bump version to 0.8.0 — adds /pell:from-ticket"
```

This is a minor version bump because `/pell:from-ticket` is a new user-facing command. Patches (0.7.x) were used for fixes to existing commands.

---

## Task 10: Manual smoke test against a real ticket

**Files:** none modified — this is interactive verification.

- [ ] **Step 1: Reload the plugin in Claude Code**

Run inside Claude Code:
```
/plugin marketplace update pell-skills
/reload-plugins
```

- [ ] **Step 2: Verify `/pell:from-ticket` appears in the command list**

Run: `/help` and look for `pell:from-ticket` in the available commands. If absent, the marketplace update didn't pick up the new file — repeat Step 1.

- [ ] **Step 3: Smoke test the happy path (no superpowers dependency)**

Run: `/pell:from-ticket <real key> design only, skip start-work`

(Use `design only, skip start-work` to exercise the parse logic and the brainstorming dispatch without creating a branch or generating a plan — the lightest-weight smoke test.)

Expected:
- Command parses without errors
- Ticket loads (prints `Loaded <KEY> — <summary> (status: ..., type: ...).`)
- Existing-artifact detection runs (Fresh case)
- Stage 4 is skipped (the `skip start-work` flag)
- Stage 5 dispatches `superpowers:brainstorming` with the synthesized seed

If brainstorming launches and asks its first clarifying question, the dispatch is working.

- [ ] **Step 4: Smoke test the inline-substitute path**

If superpowers is currently installed, this step requires temporarily uninstalling it (or running on a machine where it isn't installed). If that's not practical, document the inline-substitute path as untested for now and capture the gap in `MEMORY.md` for future verification.

If superpowers can be temporarily uninstalled:
1. `/plugin uninstall superpowers@claude-plugins-official`
2. `/pell:from-ticket <real key> skip start-work`
3. Verify the notice prints, the 3 questions run, and the starter spec file is written.
4. Re-install: `/plugin install superpowers@claude-plugins-official`

- [ ] **Step 5: Smoke-test summary commit**

After both smoke tests complete (or the inline-substitute is documented as untested), bundle any prompt-text fixes surfaced during testing into a single follow-up patch commit:

```bash
# Only if smoke testing surfaced issues:
git add plugins/pell/commands/from-ticket.md
git commit -m "fix(from-ticket): <describe each fix from smoke test>"
```

If no fixes needed, no commit. The task is complete.

- [ ] **Step 6: Final push to main**

Per repo convention, `from-ticket` ships on `main`. Push only after explicit user authorization naming `main`:

```bash
git push origin main
```

Expected: commits from Tasks 1-9 (plus any from Step 5) are pushed cleanly.

---

## Self-Review Checklist

- [x] **Spec coverage:** Every section of the spec (§1–§12) maps to at least one task. §3 → T1; §4 → T2; §5 → T3; §6 → T4; §7 → T5; §8 → T6; §9 → T2/T3/T4/T5/T6 inline; §10 → T2/T5; §11 → T7; §12 → T7.
- [x] **No placeholders:** All prompt content is shown in full per task; no "TODO" or "similar to Task N" references.
- [x] **Type consistency:** All file paths use the same shape (`docs/superpowers/specs/<KEY>-YYYY-MM-DD-...`); all MCP tool names match the verified-via-ToolSearch schemas from prior work (`mcp__plugin_atlassian_atlassian__getJiraIssue` etc.).
- [x] **Validation gate** is consistent across all tasks (`claude plugin validate ./plugins/pell`, exit 0).
- [x] **Commit boundaries** produce a coherent git history; each task commit could be reviewed independently.
