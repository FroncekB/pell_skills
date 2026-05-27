---
description: "Whole-repo security audit — walks the codebase, dispatches repo-security-reviewer agents in parallel, aggregates findings. Two passes per file: regex scan for sensitive data (SSNs, credit cards, API keys, JWTs, private keys), then code-level vulnerability review (XSS, SQLi, path traversal, crypto misuse, PII logging). Read-only. Findings include literal matched values per the design decision."
argument-hint: "[path scope] [--quick | --full] [freeform context]"
---

You are running **`/pell:repo-security-review`**. Walk the repo, dispatch security reviewers in parallel, aggregate, render. Read-only — never modify files.

**Output policy:** This command renders the literal matched value for sensitive-data findings (per the design decision). Treat the output as sensitive — don't paste it into chat logs or PR comments without consideration. The user chose this trade-off knowingly during the design.

The user passed: `$ARGUMENTS`

## Step 1 — Parse arguments

From `$ARGUMENTS`:

- **Path scope** (optional) — any token that resolves to a real directory or file path under the repo root. Restricts the file list to that prefix.
- **Mode flag** — `--quick` (default, ~50 files), `--full` (no cap), `--standard` (~250 files).
- **Freeform context** — everything else. Passed through to each agent as `focus`. Examples: "this handles healthcare data", "include fixtures", "this is .NET 8".

Default mode is `--quick`.

## Step 2 — Locate the repo root

Run `git rev-parse --show-toplevel`. If it fails, exit with: "I need to be in a git checkout to scan the repo. `cd` into the project and re-run."

Capture as `repo_root`.

## Step 3 — Build the file list

Same algorithm as `/pell:repo-review`:

**Quick mode:** `git log --pretty=format: --name-only -200 | sort -u | head -100`, filter, cap at 50.

**Standard mode:** `git log --pretty=format: --name-only -500 | sort -u | head -500`, filter, cap at 250.

**Full mode:** `git ls-files`, filter, no cap.

**Apply path scope** if parsed in Step 1.

**Deny-list** — drop any path matching:

- `node_modules/`, `bower_components/`, `vendor/`, top-level `packages/`
- `bin/`, `obj/`, `dist/`, `build/`, `out/`, `coverage/`, `.next/`, `.nuxt/`, `.svelte-kit/`
- `.git/`, `.vs/`, `.idea/`, `.vscode/`
- Files: `*.min.js`, `*.min.css`, `*.map`, `*.lock`, `*-lock.json`, `*.Designer.cs`, `*.designer.cs`, `*.g.cs`, `*.generated.cs`, `*.svg`, `*.png`, `*.jpg`, `*.gif`, `*.ico`, `*.woff*`, `*.ttf`, `*.eot`, `*.pdf`, `*.zip`, `*.gz`

**Security-specific INCLUSIONS** (unlike repo-quality, security review wants to look at config + secrets-adjacent files):

- Keep `.env.example`, `.env.template`, `appsettings*.json`, `web.config`, `*.config.js` — they're often where embedded credentials hide
- Keep `tests/fixtures/`, `seeds/`, `__fixtures__/` — fake-looking PII patterns sometimes turn out to be real data. The agent's judgment-pass handles the test/prod distinction

If the resulting list is empty, exit with: "No files matched after filtering. Try `--full` or remove the path scope."

## Step 4 — Chunk and dispatch

Same chunking strategy as `/pell:repo-review`: group by extension, target ~25 files per agent, dispatch up to N parallel agents based on mode.

**Dispatch** — in a **single assistant message**, make N parallel `Agent` tool calls with `subagent_type="repo-security-reviewer"`. Each gets:

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

While agents are running, print: `Scanning <total> files across <N> parallel security agents — this may take a moment...`

## Step 5 — Aggregate findings

Parse each agent's trailing JSON: `{"findings":[...],"summary":"..."}`.

**Dedup across chunks:**

- Normalize the `(finding, fix)` pair (lowercase, strip whitespace, collapse internal whitespace)
- Hash the normalized pair as the dedup key
- Group findings with the same key, merge `also_in` lists into a unified `locations` list, keep the highest severity if they differ

For sensitive-data findings (Pass 1) where the literal matched value is included, **do NOT redact during dedup or rendering** — the user chose unredacted output during design. But group identical literal-value findings across files (e.g. same fake-looking SSN appearing in 3 fixtures → one finding with 3 locations).

## Step 6 — Render the report

```
## Repo Security Review

**Scope:** <path scope or "whole repo">
**Mode:** <quick | standard | full>
**Files scanned:** <N>   **Agents:** <M>   **Findings (after dedup):** <K>

⚠ This report contains literal sensitive values for any Pass-1 findings. Handle accordingly.

### Critical
- `file:line` — finding (with exploit path or literal value). **Fix:** ...

### High
- ...

### Medium
- ...

### Low
- ...

### Nits
- ...

**Summary:** <one-line synthesis from the union of agent summaries, or "No security issues found.">
```

Render `_None._` for empty severity sections.

## Step 7 — Hand off

End the response. Do NOT offer to fix or commit. The user reviews and acts.

If any agent returned malformed JSON, render its raw output under a "Reviewer output" subsection with a parse-failure note.

## Operator notes

- **Never** modify files
- **Never** post findings to Bitbucket, Jira, or anywhere else without explicit user direction — this command is local-only
- If `--full` against a >5000-file repo, ask first: "Full security scan of N files — this will dispatch ~12 parallel agents and may take several minutes. Proceed? (y/n)"
- The PII warning header in Step 6 is required for every invocation — even if no Pass-1 hits surfaced, the user should know the report's output policy
- The user's `$ARGUMENTS` always wins over defaults
