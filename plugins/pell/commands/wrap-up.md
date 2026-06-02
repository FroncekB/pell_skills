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

## Step 2 — Stage A: Dispatch `/pell:local-review`

Skip this entire stage when any of `skip review` / `already reviewed` / `no review` was in `$ARGUMENTS`.

Otherwise, print: `Running /pell:local-review...`

Then invoke `/pell:local-review <forwarded args>` via the Skill tool.

**Failure handling:**

- If `local-review` reports "No changes to review." → treat Stage A as complete; proceed to Stage B (which will also see a clean tree and skip).
- If `local-review` exits non-zero (rare; usually means a reviewer-agent crash that local-review couldn't gracefully degrade) → surface the error and exit. Do NOT proceed to Stage B or C. The user's working tree is unchanged.
- If `local-review` applies fixes and the user declines further review-action prompts, that's normal flow — Stage A completes when local-review returns control.

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

On success, print: `Committed working-tree changes: "<resolved message>"`

## Step 4 — Stage C: Dispatch `/pell:finish-work`

Always runs unless an earlier stage exited.

Print: `Running /pell:finish-work...`

Then invoke `/pell:finish-work <forwarded args>` via the Skill tool. (`<forwarded args>` is `$ARGUMENTS` with all wrap-up-owned flags from Step 1 stripped out — same value used for Stage A.)

**Failure handling:**

- `finish-work` has its own gates and exits cleanly on user cancellation (e.g. `n` at the PR-create prompt). When that happens, `wrap-up` does NOT retry — exit silently. The user can re-run when ready.
- `finish-work` non-zero exit on a hard error (push failure, Bitbucket MCP unreachable, etc.) → `wrap-up` also exits, surfacing finish-work's error. No rollback of the Stage B commit — the user can amend, reset, or re-run wrap-up.

`wrap-up` exits after dispatching Stage C. finish-work's Step 8 report is the final "all done" signal.

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
- After Stage B commits: `Committed working-tree changes: "<message>"`
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
