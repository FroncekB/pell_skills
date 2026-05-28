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
