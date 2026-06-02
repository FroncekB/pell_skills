---
description: Whole-repo code-quality audit — walks the codebase, dispatches repo-quality-reviewer agents in parallel, aggregates findings. Looks for duplicated logic, dead code, convention drift, oversized files, tight coupling, ignored warnings. Read-only.
argument-hint: "[path scope] [--quick | --full] [freeform context]"
---

You are running **`/pell:repo-review`**. Walk the repo, dispatch reviewer agents in parallel, aggregate, render. Read-only — never modify files.

The user passed: `$ARGUMENTS`

## Step 1 — Parse arguments

From `$ARGUMENTS`:

- **Path scope** (optional) — any token that resolves to a real directory or file path under the repo root. If present, restrict the file list to that prefix.
- **Mode flag** — `--quick` (default, ~50 files), `--full` (no cap), `--standard` (~250 files, intermediate). If multiple are passed, the last one wins.
- **Freeform context** — everything else. Pass through to each agent as `focus`. Examples: "focus on auth", "skip tests", "this is .NET 8".

Default mode is `--quick` — a fast scan of recent files, with `--standard` and `--full` available for broader coverage.

## Step 2 — Locate the repo root

Run `git rev-parse --show-toplevel`. If it fails, exit with: "I need to be in a git checkout to scan the repo. `cd` into the project and re-run."

Capture the output as `repo_root`.

## Step 3 — Build the file list

The default ordering is recency-weighted so the most-touched code gets scanned first.

**Quick mode** (`--quick`, default):
```bash
cd <repo_root> && git log --pretty=format: --name-only -200 | sort -u | head -100
```
Then filter against the deny-list below and cap at 50 files.

**Standard mode** (`--standard`):
```bash
cd <repo_root> && git log --pretty=format: --name-only -500 | sort -u | head -500
```
Filter, cap at 250.

**Full mode** (`--full`):
```bash
cd <repo_root> && git ls-files
```
Filter, no cap.

**Apply the path scope filter** if one was parsed in Step 1 — keep only files starting with that prefix.

**Deny-list** — drop any path matching:

- `node_modules/`, `bower_components/`, `vendor/`, `packages/` (top-level only — keep nested `packages/<name>/src/`)
- `bin/`, `obj/`, `dist/`, `build/`, `out/`, `coverage/`, `.next/`, `.nuxt/`, `.svelte-kit/`
- `.git/`, `.vs/`, `.idea/`, `.vscode/` (config dirs only — never their contents)
- Files matching: `*.min.js`, `*.min.css`, `*.map`, `*.lock`, `*-lock.json`, `*.Designer.cs`, `*.designer.cs`, `*.g.cs`, `*.generated.cs`, `*.svg`, `*.png`, `*.jpg`, `*.gif`, `*.ico`, `*.woff*`, `*.ttf`, `*.eot`, `*.pdf`, `*.zip`, `*.gz`

If the resulting list is empty, exit with: "No files matched after filtering. Try `--full` or remove the path scope."

## Step 4 — Chunk by language and dispatch

**Group files by extension.** Common groupings:
- `.cs` → C#
- `.ts`, `.tsx` → TypeScript
- `.js`, `.jsx`, `.mjs` → JavaScript
- `.py` → Python
- `.go` → Go
- `.rb` → Ruby
- everything else → "other" (single bucket)

**Target chunk size:** ~25 files per agent.

**Chunk count by mode:**
- `--quick` (≤50 files): 2 agents, ~25 files each
- `--standard` (≤250 files): up to 10 agents, ~25 files each
- `--full` (no cap): up to 12 agents, file count divided evenly; if more than 300 files would land in one agent's chunk, warn the user about scan duration before proceeding

**Dispatch** — in a **single assistant message**, make N parallel `Agent` tool calls with `subagent_type="repo-quality-reviewer"`. Each gets:

```
mode: repo
repo_root: <repo_root>
chunk_index: <i>
chunk_total: <N>
focus: <freeform context from Step 1, or "" if none>
files:
<path/to/file1.ext>
<path/to/file2.ext>
...
```

While agents are running, print one line: `Scanning <total> files across <N> parallel reviewer agents — this may take a moment...`

## Step 5 — Aggregate findings

Each agent returns a single trailing JSON object: `{"findings":[...],"summary":"..."}`. Parse all of them.

**Dedup across chunks:**

- Normalize each finding's `(finding, fix)` pair: lowercase, strip leading/trailing whitespace, collapse internal whitespace
- Hash the normalized pair as the dedup key
- Group findings with the same key. For each group:
  - Keep the most-detailed `finding` and `fix` text (longest non-truncated version)
  - Merge `also_in` lists into a unified `locations` list including the primary `file:line` of each grouped finding
  - Keep the highest severity if they differ (which they shouldn't, but defend against agents disagreeing)

If a finding has fewer than 2 locations after dedup, it stays as `file:line` only.

## Step 6 — Render the report

```
## Repo Quality Review

**Scope:** <path scope or "whole repo">
**Mode:** <quick | standard | full>
**Files scanned:** <N>   **Agents:** <M>   **Findings (after dedup):** <K>

### Major
- `file:line` — finding. **Fix:** ...
- `file:line` (+3 more locations: `a:1`, `b:2`, `c:3`) — finding observed across 4 files. **Fix:** ...

### Minor
- ...

### Nits
- ...

**Summary:** <one-line synthesis from the union of agent summaries, or "No quality issues found.">
```

Render `_None._` for empty severity sections rather than dropping them.

## Step 7 — Hand off

End the response. Do NOT offer to apply fixes — this command is read-only and ranges across the entire repo. The user can use `/pell:local-review` if they want fix-application against a targeted diff.

If any agent returned malformed JSON, render its raw output under a "Reviewer output" subsection at the end with a note that parsing failed for that chunk.

## Operator notes

- **Never** modify files. This command is strictly read-only
- If the user passes `--full` against a >5000-file repo, ask before proceeding: "Full scan of N files — this will dispatch ~12 parallel agents and may take several minutes. Proceed? (y/n)"
- For very small repos (<10 files matching after filter), skip parallel dispatch and use a single agent
- The user's `$ARGUMENTS` always wins over defaults
