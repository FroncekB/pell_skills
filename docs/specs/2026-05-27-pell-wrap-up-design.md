# `/pell:wrap-up` — Design Spec

**Status:** approved
**Author:** Brandon Froncek + Claude
**Date:** 2026-05-27
**Parent spec:** [`2026-05-27-pell-skills-architecture.md`](2026-05-27-pell-skills-architecture.md)

## Purpose

`/pell:wrap-up` is a Bucket 3 composer. It closes out work-in-progress in one command by sequencing the three existing pieces that make up the typical end-of-branch workflow:

1. `/pell:local-review` — three-pass review of the working tree (correctness + quality + security), optionally applies suggested fixes
2. A **commit gate** — bridges local-review (which leaves fixes in the working tree) and finish-work (which needs a clean tree to push)
3. `/pell:finish-work` — push, open PR, transition Jira to "in review", comment with PR link

`wrap-up` itself does no review work and never mutates Jira directly; it's a thin orchestrator that parses arguments, decides which stages to skip, handles the commit gate, and dispatches the underlying commands. All side-effect prompts come from the dispatched stages (or, for the commit gate, from `wrap-up` itself).

## 1. Invocation

```
/pell:wrap-up [freeform context]
```

Examples:

```
/pell:wrap-up
/pell:wrap-up apply minor+
/pell:wrap-up skip review, push it
/pell:wrap-up apply major+, into develop, comment with PR link
/pell:wrap-up auto-commit, commit message: "fix cart validation per review"
/pell:wrap-up don't touch jira, title: "Cart fix"
```

There's no required positional argument — `wrap-up` infers everything from the current branch / repo / config and the freeform context.

## 2. Architecture & flow

`wrap-up` is a sequential composer with three stages:

```
1. Parse arguments
2. Stage A — Dispatch /pell:local-review <forwarded args>     (skip on "skip review" / "already reviewed" / "no review")
3. Stage B — Commit gate
   - Run `git status --porcelain`. If empty → skip silently.
   - If non-empty → show `git status --short`, then either prompt or auto-commit (see §5).
   - On commit failure or user decline → exit cleanly with a named reason.
4. Stage C — Dispatch /pell:finish-work <forwarded args>
```

`wrap-up` exits after dispatching Stage C. finish-work's Step 8 report is the final "all done" signal — no synthesis layer on top.

No missing-dependency handling: `local-review`, `finish-work`, and the reviewer agents are all internal to the pell plugin. If any are missing, the plugin install is broken and the Skill tool's own error is sufficient.

## 3. Argument grammar

Freeform-first per Pell convention. `wrap-up` extracts only the flags it owns; everything else is passed through verbatim to both dispatched stages (each stage parses what it understands and ignores the rest).

### 3.1 wrap-up's own flags (case-insensitive)

These are stripped from `$ARGUMENTS` before forwarding:

| Flag | Effect |
|-|-|
| `skip review` / `already reviewed` / `no review` | Skip Stage A |
| `auto-commit` / `commit fixes automatically` | Skip the y/n commit gate in Stage B |
| `commit message: "<text>"` / `commit message: <text>` | Use `<text>` as the commit message in Stage B (default is `apply review fixes`) |
| `add all` / `include untracked` | Use `git add -A` in Stage B instead of `git add -u` |

### 3.2 Pre-auths forwarded to the dispatched stages

Everything else — including all `/pell:local-review` and `/pell:finish-work` pre-auth phrases — is passed through. The dispatched stage recognizes and acts on what's relevant to it; the other stage sees the same text as inert context and ignores it.

Examples of forwarded phrases (non-exhaustive):

- `apply minor+`, `apply blockers-only`, `no fixes` → consumed by `local-review`
- `--staged`, `--uncommitted`, `--range <a>..<b>`, file/path tokens → consumed by `local-review`
- `into <branch>`, `title: "<text>"`, `push it` → consumed by `finish-work`
- `move it to <status>`, `comment with PR link`, `don't touch jira`, `skip the comment` → consumed by `finish-work`
- `--reset` → consumed by `finish-work` (clears the `in_review` transition cache)
- Any other freeform text → seen by both stages as informational context

`wrap-up` itself never re-interprets these or makes side-effect decisions based on them.

## 4. Stage A — Dispatch `/pell:local-review`

Skip when any of `skip review` / `already reviewed` / `no review` was in `$ARGUMENTS`.

Otherwise, invoke `/pell:local-review <forwarded args>` where `<forwarded args>` is `$ARGUMENTS` with all wrap-up-owned flags from §3.1 stripped out.

**Failure handling:**

- If local-review reports "No changes to review." → that's fine, treat Stage A as complete; proceed to Stage B (which will also see a clean tree and skip).
- If local-review exits non-zero (rare; usually means a reviewer-agent crash that local-review couldn't gracefully degrade) → surface the error and exit. Do NOT proceed to Stage C. The user's working tree is unchanged; they can re-run wrap-up after addressing the cause.
- If local-review applies fixes and the user declines further review-action prompts, that's normal flow — Stage A completes when local-review returns control.

## 5. Stage B — Commit gate

This is the only piece of orchestration `wrap-up` does itself.

### 5.1 Detect dirty tree

Run `git status --porcelain`. If the output is empty → skip the rest of Stage B and proceed to Stage C.

### 5.2 Show what's pending

Print the result of `git status --short` so the user can see what's about to be committed (or what they're declining).

### 5.3 Decide on commit message

The message is selected before any commit happens:

- If `commit message: <text>` was in `$ARGUMENTS` → use `<text>` verbatim
- Otherwise, the default is `apply review fixes`

### 5.4 Decide on commit action

- **If `auto-commit` was in `$ARGUMENTS`:** commit directly without prompting (skip §5.5).
- **Otherwise:** prompt y/n.

### 5.5 y/n prompt (when not auto-committing)

```
Working tree has uncommitted changes (shown above).
Commit them before opening the PR?
  Default message: "<resolved message from §5.3>"
  (y to commit with default, message: "<new text>" to override, n to exit)
```

- `y` (or empty/Enter) → commit with the resolved message
- `message: "<new text>"` → use `<new text>` as the message and commit
- `n` → exit cleanly with: `"Working tree must be clean before /pell:finish-work — commit or stash, then re-run."`

### 5.6 Stage the commit

- If `add all` / `include untracked` was in `$ARGUMENTS` → `git add -A`
- Otherwise → `git add -u` (only tracked modifications)

### 5.7 Detect empty staging

After staging, check `git diff --cached --quiet`. If it returns 0 (no staged changes — typically because the dirty tree was only untracked files and `add -u` skipped them), exit with:

> Nothing staged for commit — the dirty tree contains only untracked files. Pass `add all` to include them, or stash/commit manually. Re-run when the tree is clean.

### 5.8 Commit

Run `git commit -m "<resolved message>"`. On failure, surface the git error verbatim and exit. Do NOT proceed to Stage C — the PR would be opened from the wrong tip.

On success, print: `✓ Committed working-tree changes: "<resolved message>"`

## 6. Stage C — Dispatch `/pell:finish-work`

Always runs (unless an earlier stage exited). Invoke `/pell:finish-work <forwarded args>` where `<forwarded args>` is `$ARGUMENTS` with all wrap-up-owned flags from §3.1 stripped out.

**Failure handling:**

- finish-work has its own gates and exits cleanly on user cancellation (e.g. user says `n` to PR creation). When that happens, wrap-up does NOT retry — exit silently. The user can re-run when ready.
- finish-work non-zero exit on a hard error (e.g. push failure, Bitbucket MCP unreachable) → wrap-up also exits, surfacing finish-work's error. No rollback of the Stage B commit.

## 7. Error handling & ordering summary

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

## 8. wrap-up's own output

`wrap-up` prints these lines and nothing else; each dispatched stage owns its own output.

- Before Stage A: `Running /pell:local-review...` (omit when `skip review`)
- Before Stage B (only when tree is dirty): `Working tree has uncommitted changes:` followed by `git status --short` output
- After Stage B commits: `✓ Committed working-tree changes: "<message>"`
- Before Stage C: `Running /pell:finish-work...`

No final summary report. finish-work's Step 8 is the last word.

## 9. Operator notes

- **Never** commit without explicit consent (either y/n gate OR `auto-commit` pre-auth).
- **Never** rollback Stage B's commit on Stage C failure. The user's working tree is the source of truth.
- **Never** add a third dimension to wrap-up (e.g. post-merge cleanup, branch deletion). Those belong in a separate composer if ever built.
- **Never** modify Jira from wrap-up directly. All Jira side-effects route through `/pell:finish-work`'s gates.
- The user's `$ARGUMENTS` always wins over defaults. If they typed something neither wrap-up nor the dispatched stages explicitly handle, it's treated as informational context.
- For repos with branch protection on the default branch: `wrap-up` does not require any special handling. finish-work's pre-flight will refuse to open a PR with source = base, and `git push` will fail on protected branches the user shouldn't push to. Pell branches are always `<KEY>-<description>`, so this is an edge-only concern.

## 10. Out of scope

The following are explicitly NOT part of `/pell:wrap-up`:

- **Post-merge actions** — closing the Jira ticket to "Done", deleting the local branch, removing worktrees. A separate `/pell:after-merge` (or extending `/pell:finish-work`) is the right place if those become routine. For now: manual.
- **Merging the PR** — that's a reviewer + human-judgment decision; out of scope for any Pell composer.
- **Auto-amending the Stage B commit if Stage C fails** — too much hidden state. The user can amend manually.
- **Re-running Stage A after Stage B's commit** — if the user wants to review the fix commit, they invoke local-review again. wrap-up runs the pipeline once per invocation.
- **Reviewing diff against the PR base** — local-review's default scope is `git diff HEAD`. Reviewing against `develop`/`main` is local-review's `--range` mode and is opt-in by passing `--range <a>..<b>` in `$ARGUMENTS` (forwarded per §3.2).
