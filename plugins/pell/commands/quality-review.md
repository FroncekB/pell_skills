---
description: Review a code change for code quality only (readability, naming, duplication, convention adherence). Works on a Bitbucket PR or local changes. Returns a markdown report with all findings including nits.
argument-hint: [<PR url | repo#number | bare PR number> | (no args = local diff)]
---

You are running **`/pell:quality-review`**. Execute the steps below.

The user passed: `$ARGUMENTS`

## Step 1 — Resolve scope and context source

Parse `$ARGUMENTS`:

**Scope:**
- Contains `bitbucket.org`, looks like `<repo>#<n>`, or is a bare number → **PR mode**
- Empty or contains `local`, `--staged`, `--uncommitted`, or `--range` → **Local mode**
- A file path → treat as local mode restricted to that path

For PR mode, parse `workspaceId` (default `pellsoftware`), `repoId`, `prId`. If bare number, resolve repo from `git remote get-url origin`.

**Context source** (where surrounding code comes from):
- Default: `local` — assume the user's working directory is a checkout of the target repo
- If `$ARGUMENTS` contains phrases like `use bitbucket`, `use mcp`, `use remote`, `fetch via bitbucket`, `not LFS`, or `not local` → use `bitbucket`

## Step 2 — Gather inputs

**PR mode:** in parallel, call:
- `mcp__atlassian-bitbucket__bitbucketPullRequest` with `action=get`
- `mcp__atlassian-bitbucket__bitbucketPullRequest` with `action=diff`

Quality review does not need Jira context — skip the Jira lookup.

**Local mode:** run the appropriate `git diff`:
- `--staged` → `git diff --cached`
- `--uncommitted` → `git diff`
- `--range <a>..<b>` → `git diff <a>..<b>`
- path → `git diff HEAD -- <path>`
- default → `git diff HEAD`

If the diff is empty, tell the user "No changes to review." and stop.

## Step 3 — Dispatch the quality reviewer

Make a single `Agent` call:
- `subagent_type="quality-reviewer"`
- Prompt: include
  - `mode: pr` or `mode: local`
  - `context_source: local` (default) or `bitbucket` (if override)
  - The full diff
  - `repo_root: <path>` (always include; agent uses when `context_source: local`)
  - `workspace`, `repo`, `branch` (PR mode — agent uses when `context_source: bitbucket`)

The agent will discover CLAUDE.md and convention files on its own. Don't pre-read them.

Wait for the response. Extract the trailing JSON object.

## Step 4 — Render the markdown report

Parse the agent's JSON. Render:

```
## Quality Review — <PR title and #N, or "local: <scope description>">

**Files:** <count>

### Major
- `file:line` — finding. **Fix:** …
(or "_None._")

### Minor
- `file:line` — finding. **Fix:** …

### Nits
- `file:line` — finding. **Fix:** …

**Summary:** <one-line take from agent>
```

Render `_None._` for empty sections rather than dropping them.

## Step 5 — Hand off

End the response. Do NOT offer to apply fixes or post comments — this command is read-only. The user decides what to do.

If the agent returned malformed JSON, render its raw output under a "Reviewer output" section with a note that parsing failed.
