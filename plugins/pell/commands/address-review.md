---
description: Pull the inline + general comments off one of your Bitbucket PRs and triage each — apply mechanical fixes to your working tree or reply on the thread. Never commits, never pushes, never resolves threads.
argument-hint: <PR url | repo#number | bare PR number> [unresolved | since last push | from <name>]
---

You are running **`/pell:address-review`** — the receiving end of review. `three-pass-review` posts comments; this pulls them back so the PR author can triage and respond. Orchestrate, decide on side effects, never commit.

The user passed: `$ARGUMENTS`

## Step 1 — Resolve the PR and context source

Parse `$ARGUMENTS`:
- Full Bitbucket URL — extract workspace, repo, prId
- `<repo>#<n>` — workspace defaults to `pellsoftware`
- Bare number — resolve repo from `git remote get-url origin`. If origin isn't Bitbucket, ask the user for a full URL

**Context source** (governs *fix-application* reads only — comment fetching always uses the Bitbucket MCP):
- Default `local` — assume a local checkout; read surrounding code with `Read`/`Grep`/`Glob` against `<repo_root>` (`git rev-parse --show-toplevel`)
- If `$ARGUMENTS` contains `use bitbucket`, `use mcp`, `use remote`, `fetch via bitbucket`, `not LFS`, or `not local` → `bitbucket`: read via `mcp__atlassian-bitbucket__bitbucketRepoContent` (action `files.get`) against the PR's source branch

**Scope filters** (default is **all comments**; these narrow client-side, and compose):
- `unresolved` / `open only` → hide resolved threads
- `since last push` → only comments newer than the last push to the source branch
- `since <ISO-date>` → only comments newer than that date
- `from <name>` / `by <name>` → only comments whose author display name contains `<name>` (case-insensitive)

**`--dry-run`** → render Steps 1–3 only (the grouped list), then stop. No triage, no side effects.

## Step 2 — Fetch PR metadata and comments

Call **in parallel**:
- `mcp__atlassian-bitbucket__bitbucketPullRequest` `action=get` — capture title, source branch, destination branch, `comment_count`
- `mcp__atlassian-bitbucket__bitbucketPullRequest` `action=comments` with `pagelen=100`

If `comment_count` (or the first comments page) indicates more than one page, paginate (`page=2,3,…`) until a page returns fewer than `pagelen` results.

If there are no comments: print `No comments on PR #<prId>.` and stop.

## Step 3 — Group, filter, render

1. **Drop** comments with `deleted: true` and `pending: true` (the latter are your own unpublished review drafts, not feedback).
2. **Normalize** each remaining comment:
   - `id` — integer
   - author — `user.display_name` (the field is `user`, **not** `author`)
   - `path` — `inline.path` (inline comments only; general comments have no `inline`)
   - `line` — `inline.to` (new side) if present, else `inline.from` (old side)
   - `body` — `content.raw`
   - `parentId` — `parent.id` if present (this comment is a reply)
   - `resolved` — true when a `resolution` object is present and non-null; missing/null ⇒ unresolved
   - `created_on` / `updated_on`
3. **Apply the Step 1 scope filters** client-side. If `unresolved` was requested but no comment carries usable resolution data, fall back to all-open and print: `(could not determine resolved state — showing all open comments)`.
4. **Assemble threads** — nest replies (`parentId` set) under their root comment so each renders with its context.
5. **Bucket** — inline threads grouped by `path` then ordered by `line`; general (no `path`) threads in their own section.
6. **Render** a numbered triage list (one index per actionable thread root):

```
## Review on PR #<prId> — <title>
**Branch:** `<source>` → `<destination>`   ·   **Comments:** <N> (<X> inline, <Y> general)
**Scope:** <all | filter description>

### `src/path/File.cs`
**[1]** L42 · @<author>  [resolved]
> comment body…
  - @<replier>: prior reply body…          (existing replies shown for context)

**[2]** L88 · @<author>
> comment body…

### General
**[3]** @<author>
> PR-level comment body…
```

Show `[resolved]` when the thread is resolved. Show `[outdated]` only if you can determine the anchor no longer maps to current code; otherwise omit it.

If `--dry-run`, stop here.

## Step 4 — Per-comment triage (gated)

Prompt:

> How do you want to handle these? Reply with per-comment actions — e.g. `1 fix, 2 reply, 3 skip` — or a bulk verb (`all fix`, `all reply`, `all skip`). Anything you don't list defaults to **skip**.

Parse into a `{comment# → action}` map (`fix` / `reply` / `skip`); unlisted ⇒ `skip`. If the user says `no` / `cancel`, exit cleanly.

## Step 5 — Act (gated)

Process the map in list order.

### Applying a `fix`

Reuse the `/pell:local-review` discipline:

1. **Re-locate the target by content**, not by the comment's stored line — the line may have shifted, and `[outdated]` comments are expected to have moved. Read the file (or fetch via `bitbucketRepoContent` in `bitbucket` mode) and find the code by content
2. Apply with `Edit` (or `MultiEdit` for several fixes in one file)
3. **Only concrete, mechanical changes.** If the comment is a question, a discussion, or a non-mechanical ask ("consider rethinking this abstraction"), do **not** edit — skip it with a note and surface it as a reply candidate instead. Never guess
4. **Never weaken or delete a test or assertion** to satisfy a comment — no exceptions, even when the comment explicitly asks for it. A reviewer who thinks a test is wrong is starting a discussion, not requesting a mechanical fix; reply, don't edit. For *other* weakening (loosening a type, suppressing a warning), only do it when the comment explicitly and unambiguously asks for exactly that
5. **General comments** (no anchor) may still request a change; attempt a fix only when the target is unambiguous, else skip with a note

After all fixes:
- Run a test/lint command derivable from the project (`package.json` scripts, `Makefile`, `dotnet test`, `pytest`). **If you can't identify one, skip — do not guess**
- Show `git diff --stat`

### Posting a `reply`

1. Draft the reply text. If this comment was also `fix`ed, default the draft to `Addressed — <one-line summary of the edit>`; otherwise use the user's inline text from Step 4 or ask what to say
2. **Show the draft and confirm before posting**
3. Post via `mcp__atlassian-bitbucket__bitbucketPullRequest` `action=comment`, `prId`, `workspaceId`, `repoId`, `parentCommentId=<thread root id>`, `content=<reply>`. Run sequentially (rate limits)

**A reply does not resolve the thread** — the Bitbucket MCP has no resolve action, so resolving stays a manual step in the Bitbucket UI. Say so; don't imply a reply closes the thread.

### Final report

```
Applied <F> fixes to the working tree. Skipped <S> (reasons: …). Posted <R> replies. Failed <K> (reasons: …).
<git diff --stat output, if any fixes applied>

Threads are NOT resolved — resolve them in Bitbucket once you've confirmed each fix.
Nothing was committed or pushed; review `git diff` and run /pell:finish-work when ready.
```

If the user picks `skip`/`no` for everything, exit cleanly.

## Operator notes

- **Never** post a reply or apply a fix without explicit confirmation
- **Never** commit or push — working-tree edits only; pushing is `/pell:finish-work`'s job
- **Never** weaken or delete tests/assertions to satisfy a comment
- Authorship is **not** enforced — the command assumes it's your PR but can't verify it (no Bitbucket current-user identity); it operates on whatever PR you pass
- If `action=comments` returns malformed/partial entries, still list them (under General if the anchor is missing) rather than dropping them silently
- Comment fetching always uses the Bitbucket MCP; `context_source` only governs fix-application reads
