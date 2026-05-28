---
description: Review a code change for test adequacy only (untested behavior, tests that can't fail, missing edge/error coverage, flaky patterns). Works on a Bitbucket PR or local changes. Returns a markdown report with all findings.
argument-hint: [<PR url | repo#number | bare PR number> | (no args = local diff)]
---

You are running **`/pell:test-review`**. Execute the steps below.

The user passed: `$ARGUMENTS`

## Step 1 — Resolve scope and context source

Parse `$ARGUMENTS`:

**Scope:**
- Contains `bitbucket.org`, looks like `<repo>#<n>`, or is a bare number → **PR mode**
- Empty or contains `local`, `--staged`, `--uncommitted`, or `--range` → **Local mode**
- A file path → treat as local mode restricted to that path

For PR mode, parse out `workspaceId` (default `pellsoftware`), `repoId`, `prId`. If the input is a bare number, resolve repo from `git remote get-url origin`.

**Context source** (where surrounding code comes from):
- Default: `local` — assume the user's working directory is a checkout of the target repo
- If `$ARGUMENTS` contains phrases like `use bitbucket`, `use mcp`, `use remote`, `fetch via bitbucket`, `not LFS`, or `not local` → use `bitbucket`

Honor any other freeform context (e.g. `skip jira`).

## Step 2 — Gather inputs

**PR mode:** in parallel, call:
- `mcp__atlassian-bitbucket__bitbucketPullRequest` with `action=get`
- `mcp__atlassian-bitbucket__bitbucketPullRequest` with `action=diff`

Then look for a Jira key (regex `[A-Z][A-Z0-9]+-\d+`) in PR title, source branch (including GitFlow `feature/KEY-N-*`, `bugfix/KEY-N-*`, `hotfix/KEY-N-*` patterns), and description. If found, fetch the ticket via `mcp__plugin_atlassian_atlassian__getJiraIssue` with `responseContentFormat="markdown"` — the acceptance criteria help judge which behaviors *should* be tested. If not found, proceed without Jira context (don't prompt — this is the primitive, not the composite).

**Local mode:** run the appropriate `git diff`:
- `--staged` → `git diff --cached`
- `--uncommitted` → `git diff`
- `--range <a>..<b>` → `git diff <a>..<b>`
- path → `git diff HEAD -- <path>`
- default → `git diff HEAD`

If the diff is empty, tell the user "No changes to review." and stop.

## Step 3 — Dispatch the test reviewer

Make a single `Agent` call:
- `subagent_type="test-reviewer"`
- Prompt: include
  - `mode: pr` or `mode: local`
  - `context_source: local` (default) or `bitbucket` (if user requested override)
  - The full diff
  - `repo_root: <path>` (from `git rev-parse --show-toplevel` — always provide it; the agent uses it when `context_source: local`)
  - `workspace`, `repo`, `branch` (PR mode — agent uses these when `context_source: bitbucket`)
  - Jira context as a fenced markdown block (PR mode, if found)

Wait for its response. Extract the trailing JSON object.

## Step 4 — Render the markdown report

Parse the agent's JSON. Render:

```
## Test Coverage Review — <PR title and #N, or "local: <scope description>">

**Jira:** <KEY> (<status>) — <summary>  (or omit if no Jira)
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

If any severity section is empty, render `_None._` rather than dropping it. (There is no blocker tier for test adequacy — a missing test isn't a production blocker.)

## Step 5 — Hand off

End the response. Do NOT offer to write the tests or post comments — this command is read-only. The user (or a composite command that invoked this) decides what to do.

If the agent returned malformed JSON, render its raw output under a "Reviewer output" section with a note that parsing failed.
