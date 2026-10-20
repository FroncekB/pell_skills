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

**Context source** (where the diff and surrounding code come from):
- PR mode default: `git` — Step 2 fetches the PR's branches into the user's local clone of the target repo, and the reviewer reads the PR's code at its head commit with `git show`/`git grep`, so whichever branch is checked out doesn't matter
- Local mode: `local` — the working tree at the repo root
- If `$ARGUMENTS` contains phrases like `use bitbucket`, `use mcp`, `use remote`, `fetch via bitbucket`, `not LFS`, or `not local` → use `bitbucket` (PR mode)

Honor any other freeform context.

## Step 2 — Gather inputs

**PR mode:** run `getBitbucketRepoPullRequest` on `plugin:atlassian:atlassian`. It is not a primary tool: call it directly with `executeRead({name: "getBitbucketRepoPullRequest", inputs: {workspaceId, repoId, prId}, responseFields})`, with `responseFields` beside `inputs`, never inside it, and no `cloudId` (Bitbucket operations ignore it). If a Bitbucket call fails with `Unknown operation` or `Failed to fetch cloud ID`, the name has changed: run `discover` once for it and retry with the name it returns.
- `responseFields: ["title", "description", "state", "author.display_name", "source.branch.name", "source.commit.hash", "destination.branch.name"]` (the default view leaves out `description` and `source.commit.hash`)

Then build the diff from the local clone, unless the context source is `bitbucket`. Run from `git rev-parse --show-toplevel`:
1. `git remote get-url origin` must name `<workspace>/<repo>` (case-insensitive). Then `git fetch origin <source> <destination>`, which updates remote-tracking refs only; local branches and the working tree are untouched
2. `git rev-parse origin/<source>` must start with the PR's `source.commit.hash`. A mismatch means the PR comes from a fork or the branch moved. Keep the full SHA as `<source_sha>`
3. `git diff --stat origin/<destination>...<source_sha>` (three dots: against the merge base, as Bitbucket does). If it's empty, tell the user "No changes to review." and stop
4. `git diff --output=<git_dir>/pell-quality-review.diff origin/<destination>...<source_sha>`, where `<git_dir>` is the output of `git rev-parse --absolute-git-dir`. That file is `diff_path`; don't read it yourself

If there's no clone or any of steps 1–4 fails, print `Couldn't diff locally (<reason>). Using Bitbucket.` and switch the context source to `bitbucket`. With context source `bitbucket`, don't fetch the diff here: the reviewer fetches it with `getBitbucketRepoPullRequestDiff` itself.

Quality review does not need Jira context — skip the Jira lookup.

**Local mode:** pick the `git diff` arguments:
- `--staged` → `--cached`
- `--uncommitted` → none
- `--range <a>..<b>` → `<a>..<b>`
- path → `HEAD -- <path>`
- default → `HEAD`

Run `git diff --stat <args>`. If it's empty, tell the user "No changes to review." and stop. Then run `git diff --output=<git_dir>/pell-quality-review.diff <args>`, where `<git_dir>` is the output of `git rev-parse --absolute-git-dir`. That file is `diff_path`; don't read it yourself. It sits inside `.git`, so it is never committed, and the next run overwrites it.

## Step 3 — Dispatch the quality reviewer

Make a single `Agent` call:
- `subagent_type="quality-reviewer"`
- Prompt: include
  - `mode: pr` or `mode: local`
  - `context_source: git` (PR mode default), `bitbucket` (PR mode override or fallback), or `local` (local mode)
  - `diff_path: <path>` (`git` and `local`). With `context_source: bitbucket` there is none: the reviewer fetches the diff itself. Never paste the diff into the prompt
  - `repo_root: <path>` (from `git rev-parse --show-toplevel` — always provide it)
  - `ref: <source_sha>` (PR mode with `context_source: git`)
  - `workspace`, `repo`, `branch`, `pr_id` (PR mode — agent uses these when `context_source: bitbucket`)

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
