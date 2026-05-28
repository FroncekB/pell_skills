# `/pell:wrap-up` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Bucket 3 composer command at `plugins/pell/commands/wrap-up.md` that chains `/pell:local-review` → commit gate → `/pell:finish-work` to close out a branch in one invocation.

**Architecture:** One command file. Prose, not code — the file is a prompt Claude executes. Each task drafts one section of the file in order, gated on `claude plugin validate ./plugins/pell` after every change. The commit gate is the only piece of orchestration wrap-up does itself; everything else is dispatch.

**Tech Stack:** Markdown command files, Bash (`git`), the existing `/pell:local-review` and `/pell:finish-work` commands. No new MCP dependencies.

---

## File Structure

```
plugins/pell/commands/wrap-up.md          # new — main deliverable
plugins/pell/.claude-plugin/plugin.json   # modify — version 0.8.0 → 0.9.0
README.md                                  # modify — add /pell:wrap-up entry
docs/specs/2026-05-27-pell-wrap-up-design.md  # already exists (this plan's source)
```

---

## Task Conventions

Each implementation task:
1. **Apply the edit** — Write or Edit the file with the exact prompt content shown.
2. **Validate** — `claude plugin validate ./plugins/pell` must exit 0.
3. **Commit** — one logical commit per task.

If validation fails mid-task: revert, fix the underlying issue (usually frontmatter), re-apply, re-validate, then commit.

---

## Task 1: Scaffold the file with frontmatter, intro, and argument grammar

**Files:**
- Create: `plugins/pell/commands/wrap-up.md`

- [ ] **Step 1: Create the file with this content**

````markdown
---
description: Close out a branch in one command — runs /pell:local-review on the working tree, offers to commit any fixes, then dispatches /pell:finish-work to push, open the PR, and transition Jira. Read-only against Jira by default; all side-effects gated.
argument-hint: "[skip review | apply minor+ | into <branch> | title: ... | push it | move it to ... | auto-commit | commit message: ... | --reset] [freeform]"
---

You are running **`/pell:wrap-up`**. Sequence two existing commands — `/pell:local-review` and `/pell:finish-work` — with a commit gate in between. `wrap-up` itself does no review work and never mutates Jira directly; it's a thin orchestrator that parses arguments, handles the commit gate, and dispatches the underlying commands.

The user passed: `$ARGUMENTS`

## Step 1 — Parse arguments

`wrap-up` owns four flags. Strip these from `$ARGUMENTS` before forwarding to the dispatched stages; everything else is passed through verbatim.

**wrap-up's own flags (case-insensitive):**

| Flag | Effect |
|-|-|
| `skip review` / `already reviewed` / `no review` | Skip Stage A |
| `auto-commit` / `commit fixes automatically` | Skip the y/n commit gate in Stage B |
| `commit message: "<text>"` or `commit message: <text>` | Use `<text>` as the commit message in Stage B (default is `apply review fixes`) |
| `add all` / `include untracked` | Use `git add -A` in Stage B instead of `git add -u` |

**Everything else is forwarded** to both `/pell:local-review` (Stage A) and `/pell:finish-work` (Stage C). Each dispatched stage parses what it understands (e.g. local-review consumes `apply minor+`, finish-work consumes `move it to <status>`) and ignores the rest. wrap-up never re-interprets these.

Capture `<forwarded args>` = `$ARGUMENTS` with the wrap-up-owned flags from the table above stripped out. The same `<forwarded args>` is passed to both Stage A and Stage C.
````

- [ ] **Step 2: Validate**

Run: `claude plugin validate ./plugins/pell`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add plugins/pell/commands/wrap-up.md
git commit -m "feat(wrap-up): scaffold command with frontmatter and arg parsing"
```

---

## Task 2: Stage A — Dispatch /pell:local-review

**Files:**
- Modify: `plugins/pell/commands/wrap-up.md` (append)

- [ ] **Step 1: Append this content to the end of the file**

````markdown

## Step 2 — Stage A: Dispatch `/pell:local-review`

Skip this entire stage when any of `skip review` / `already reviewed` / `no review` was in `$ARGUMENTS`.

Otherwise, print: `Running /pell:local-review...`

Then invoke `/pell:local-review <forwarded args>` via the Skill tool.

**Failure handling:**

- If `local-review` reports "No changes to review." → treat Stage A as complete; proceed to Stage B (which will also see a clean tree and skip).
- If `local-review` exits non-zero (rare; usually means a reviewer-agent crash that local-review couldn't gracefully degrade) → surface the error and exit. Do NOT proceed to Stage B or C. The user's working tree is unchanged.
- If `local-review` applies fixes and the user declines further review-action prompts, that's normal flow — Stage A completes when local-review returns control.
````

- [ ] **Step 2: Validate**

Run: `claude plugin validate ./plugins/pell`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add plugins/pell/commands/wrap-up.md
git commit -m "feat(wrap-up): add Stage A — local-review dispatch"
```

---

## Task 3: Stage B — Commit gate

**Files:**
- Modify: `plugins/pell/commands/wrap-up.md` (append)

- [ ] **Step 1: Append this content**

````markdown

## Step 3 — Stage B: Commit gate

This is the only piece of orchestration `wrap-up` does itself.

### 3.1 Detect dirty tree

Run `git status --porcelain`. If the output is empty → skip the rest of Stage B and proceed to Stage C.

### 3.2 Show what's pending

Print the result of `git status --short` so the user can see what's about to be committed (or what they're declining).

### 3.3 Resolve the commit message

- If `commit message: <text>` was in `$ARGUMENTS` → use `<text>` verbatim
- Otherwise, default to `apply review fixes`

### 3.4 Decide on commit action

- **If `auto-commit` was in `$ARGUMENTS`:** commit directly without prompting (skip to 3.6).
- **Otherwise:** prompt y/n (3.5).

### 3.5 y/n prompt (when not auto-committing)

Print exactly:

```
Working tree has uncommitted changes (shown above).
Commit them before opening the PR?
  Default message: "<resolved message from 3.3>"
  (y to commit with default, message: "<new text>" to override, n to exit)
```

- `y` (or empty/Enter) → commit with the resolved message
- `message: "<new text>"` → use `<new text>` as the commit message and commit
- `n` → exit cleanly with: `Working tree must be clean before /pell:finish-work — commit or stash, then re-run.`

### 3.6 Stage the commit

- If `add all` / `include untracked` was in `$ARGUMENTS` → run `git add -A`
- Otherwise → run `git add -u` (only tracked modifications)

### 3.7 Detect empty staging

Run `git diff --cached --quiet`. If it returns exit 0 (no staged changes — typically because the dirty tree was only untracked files and `add -u` skipped them), exit with:

> Nothing staged for commit — the dirty tree contains only untracked files. Pass `add all` to include them, or stash/commit manually. Re-run when the tree is clean.

### 3.8 Commit

Run `git commit -m "<resolved message>"`. On failure, surface the git error verbatim and exit. Do NOT proceed to Stage C — the PR would be opened from the wrong tip.

On success, print: `✓ Committed working-tree changes: "<resolved message>"`
````

- [ ] **Step 2: Validate**

Run: `claude plugin validate ./plugins/pell`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add plugins/pell/commands/wrap-up.md
git commit -m "feat(wrap-up): add Stage B — commit gate"
```

---

## Task 4: Stage C — Dispatch /pell:finish-work

**Files:**
- Modify: `plugins/pell/commands/wrap-up.md` (append)

- [ ] **Step 1: Append this content**

````markdown

## Step 4 — Stage C: Dispatch `/pell:finish-work`

Always runs unless an earlier stage exited.

Print: `Running /pell:finish-work...`

Then invoke `/pell:finish-work <forwarded args>` via the Skill tool. (`<forwarded args>` is `$ARGUMENTS` with all wrap-up-owned flags from Step 1 stripped out — same value used for Stage A.)

**Failure handling:**

- `finish-work` has its own gates and exits cleanly on user cancellation (e.g. `n` at the PR-create prompt). When that happens, `wrap-up` does NOT retry — exit silently. The user can re-run when ready.
- `finish-work` non-zero exit on a hard error (push failure, Bitbucket MCP unreachable, etc.) → `wrap-up` also exits, surfacing finish-work's error. No rollback of the Stage B commit — the user can amend, reset, or re-run wrap-up.

`wrap-up` exits after dispatching Stage C. finish-work's Step 8 report is the final "all done" signal.
````

- [ ] **Step 2: Validate**

Run: `claude plugin validate ./plugins/pell`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add plugins/pell/commands/wrap-up.md
git commit -m "feat(wrap-up): add Stage C — finish-work dispatch"
```

---

## Task 5: Error handling summary + wrap-up output + operator notes + out of scope

**Files:**
- Modify: `plugins/pell/commands/wrap-up.md` (append)

- [ ] **Step 1: Append this content**

````markdown

## Step 5 — Error handling summary

| Stage | Failure | Behavior |
|-|-|-|
| Parse args | Conflicting/unrecognized control flags | Pass through to stages; do NOT block |
| Stage A | local-review reports "No changes to review." | Continue to Stage B |
| Stage A | local-review crash or non-zero exit | Surface error; exit; no Stage B or C |
| Stage B | `git status --porcelain` empty | Skip silently |
| Stage B | User declines y/n | Exit with named reason; no Stage C |
| Stage B | Only-untracked-files case | Exit with named reason; no Stage C |
| Stage B | `git commit` non-zero | Surface git error verbatim; exit; no Stage C |
| Stage C | finish-work clean cancellation | Exit silently; commit from Stage B stays |
| Stage C | finish-work hard error | Surface error; exit; commit from Stage B stays |

**No rollback ever.** If Stage B commits and Stage C fails, the commit stays. The user can amend, reset, or re-run wrap-up as needed.

## Step 6 — wrap-up's own output

`wrap-up` prints these lines and nothing else; each dispatched stage owns its own output:

- Before Stage A: `Running /pell:local-review...` (omit when `skip review`)
- Before Stage B (only when the tree is dirty): `Working tree has uncommitted changes:` followed by `git status --short` output
- After Stage B commits: `✓ Committed working-tree changes: "<message>"`
- Before Stage C: `Running /pell:finish-work...`

No final synthesis report. finish-work's Step 8 is the last word.

## Operator notes

- **Never** commit without explicit consent (either y/n gate OR `auto-commit` pre-auth).
- **Never** rollback Stage B's commit on Stage C failure. The user's working tree is the source of truth.
- **Never** add a third dimension to wrap-up (e.g. post-merge cleanup, branch deletion). Those belong in a separate composer if ever built.
- **Never** modify Jira from `wrap-up` directly. All Jira side-effects route through `/pell:finish-work`'s gates.
- The user's `$ARGUMENTS` always wins over defaults. If they typed something neither wrap-up nor the dispatched stages explicitly handle, it's treated as informational context.

## Out of scope

The following are explicitly NOT part of `/pell:wrap-up`:

- **Post-merge actions** — closing the Jira ticket to "Done", deleting the local branch, removing worktrees. A separate command is the right place if those become routine. For now: manual.
- **Merging the PR** — out of scope for any Pell composer.
- **Auto-amending the Stage B commit if Stage C fails** — too much hidden state. The user can amend manually.
- **Re-running Stage A after Stage B's commit** — if the user wants to review the fix commit, they invoke local-review again. wrap-up runs the pipeline once per invocation.
- **Reviewing diff against the PR base** — local-review's default scope is `git diff HEAD`. Reviewing against `develop`/`main` requires passing `--range <a>..<b>` in `$ARGUMENTS` (which wrap-up forwards verbatim).
````

- [ ] **Step 2: Validate**

Run: `claude plugin validate ./plugins/pell`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add plugins/pell/commands/wrap-up.md
git commit -m "feat(wrap-up): add error handling, output, operator notes, out-of-scope"
```

---

## Task 6: Add /pell:wrap-up entry to README

**Files:**
- Modify: `README.md` — insert a new section between `/pell:finish-work` and `/pell:start-work` (since wrap-up is the new end-of-work composer)

- [ ] **Step 1: Read the README to confirm insertion point**

Run: `grep -n "^### \`/pell:" README.md`

Confirm that `/pell:finish-work` exists and identify the line where its section ends (the next `### ` heading marks the boundary).

- [ ] **Step 2: Edit the README**

Find the last line of the `/pell:finish-work` section (typically the "**Side-effects:**" paragraph). Use the Edit tool to insert this new section between finish-work's last line and the next heading:

````markdown
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
````

- [ ] **Step 3: Validate**

Run: `claude plugin validate ./plugins/pell`
Expected: exit 0 (README isn't validated, but this catches accidental plugin damage).

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(readme): add /pell:wrap-up section"
```

---

## Task 7: Bump plugin version to 0.9.0

**Files:**
- Modify: `plugins/pell/.claude-plugin/plugin.json` — change `"version": "0.8.0"` to `"version": "0.9.0"`

- [ ] **Step 1: Edit the version field**

Use Edit on `plugins/pell/.claude-plugin/plugin.json`:
- `old_string`: `"version": "0.8.0"`
- `new_string`: `"version": "0.9.0"`

- [ ] **Step 2: Validate**

Run: `claude plugin validate ./plugins/pell`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add plugins/pell/.claude-plugin/plugin.json
git commit -m "chore(pell): bump version to 0.9.0 — adds /pell:wrap-up"
```

Minor bump because `/pell:wrap-up` is a new user-facing command.

---

## Task 8: Manual smoke test

**Files:** none modified — interactive verification.

- [ ] **Step 1: Reload the plugin in Claude Code**

Run inside the Claude Code session:
```
/plugin marketplace update pell-skills
/reload-plugins
```

- [ ] **Step 2: Verify `/pell:wrap-up` appears in the command list**

Run `/help` and confirm `pell:wrap-up` is listed. If not, repeat Step 1.

- [ ] **Step 3: Clean-tree smoke test (lightest case)**

On a branch with a clean working tree and no review changes to make:

Run: `/pell:wrap-up skip review`

Expected sequence:
- Argument parsing strips `skip review` from `$ARGUMENTS`
- Stage A skipped (no `Running /pell:local-review...` message)
- Stage B: `git status --porcelain` empty → skip silently
- Stage C dispatches `/pell:finish-work` with no forwarded args
- finish-work proceeds through its normal flow (push gate, PR-create prompt, etc.)

At the PR-create prompt, you can `n` to cancel — wrap-up will exit cleanly.

- [ ] **Step 4: Dirty-tree smoke test (full path)**

On a branch with at least one tracked modification (intentional or via `local-review`'s fixes):

Run: `/pell:wrap-up apply minor+`

Expected sequence:
- Stage A: `local-review` runs, applies minor+ fixes, returns
- Stage B: dirty tree detected, `git status --short` shown, y/n prompt fires
- Answer `y` → commit lands with message `apply review fixes`
- Stage C: `finish-work` runs

If at any point you cancel (e.g. `n` at the PR-create gate), wrap-up exits cleanly and the Stage B commit stays.

- [ ] **Step 5: Bundle any prompt-text fixes**

If smoke testing surfaced issues, bundle them into a single follow-up commit:

```bash
# Only if needed:
git add plugins/pell/commands/wrap-up.md
git commit -m "fix(wrap-up): <describe each fix from smoke test>"
```

If no fixes needed, no commit. The task is complete.

- [ ] **Step 6: Push to main (only on explicit user authorization naming main)**

```bash
git push origin main
```

---

## Self-Review Checklist

- [x] **Spec coverage:** Every section of the spec maps to at least one task. §1-§2 → T1 (intro + parse), §3 → T1 (arg grammar), §4 → T2 (Stage A), §5 → T3 (Stage B), §6 → T4 (Stage C), §7-§10 → T5 (error handling/output/operator notes/out-of-scope).
- [x] **No placeholders:** All prompt content is shown in full per task; no "TODO" or "similar to Task N" references.
- [x] **Type consistency:** Flag names match throughout (`skip review`, `auto-commit`, `commit message:`, `add all`); section references inside the command file use the file's own section numbering (Step 1-6); the same `<forwarded args>` value is referenced consistently between T2 and T4.
- [x] **Validation gate** is consistent across all tasks (`claude plugin validate ./plugins/pell`, exit 0).
- [x] **Commit boundaries** produce a coherent git history; each task commit could be reviewed independently.
