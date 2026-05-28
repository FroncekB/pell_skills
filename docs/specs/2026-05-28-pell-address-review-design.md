# `/pell:address-review` — Design Spec

**Status:** approved
**Author:** Brandon Froncek + Claude
**Date:** 2026-05-28
**Parent spec:** [`2026-05-27-pell-skills-architecture.md`](2026-05-27-pell-skills-architecture.md)
**Roadmap:** Phase 3 of [`2026-05-28-pell-toolkit-improvements-plan.md`](2026-05-28-pell-toolkit-improvements-plan.md)

## Purpose

`/pell:address-review <PR>` is the receiving end of code review. `/pell:three-pass-review` *posts* inline comments onto a Bitbucket PR; nothing pulls them back so the author can triage and respond. This command closes that loop: fetch the comments on your PR, group them, and walk each one through apply-a-fix / reply / skip — all gated, never auto-committing.

It is a **standalone command**, not a composer stage. A future "iterate on review feedback" composer could sequence `address-review → wrap-up`, but that is out of scope (YAGNI) until the standalone command proves out.

It reuses `/pell:local-review`'s fix-application machinery verbatim (re-locate by content, `Edit`, only concrete/mechanical changes, never guess, never auto-commit). The novel surface is comment fetching, grouping, and the reply path.

## 1. Invocation

```
/pell:address-review <PR url | repo#number | bare PR number> [freeform context]
```

Examples:

```
/pell:address-review 1042
/pell:address-review rrs-web#1042
/pell:address-review https://bitbucket.org/pellsoftware/rrs-web/pull-requests/1042
/pell:address-review 1042 unresolved
/pell:address-review 1042 since last push
/pell:address-review 1042 from Dana
/pell:address-review 1042 use bitbucket
/pell:address-review 1042 --dry-run
```

## 2. Architecture & flow

A single-PR, mostly-interactive command with five steps:

```
1. Resolve PR + context source       (same parsing as three-pass-review)
2. Fetch comments                    (action=comments, paginate all pages)
3. Group + filter + render           (default: ALL comments, grouped by file→line)
4. Per-comment triage                (numbered list; user drives fix/reply/skip)  ← gated
5. Act                               (apply fixes to working tree; post replies)  ← gated
```

The command stops at the **working tree** after Step 5 — it never commits and never pushes. Pushing the fix commit is `/pell:finish-work`'s job. This mirrors `local-review`.

## 3. Argument grammar

Freeform-first per Pell convention. Pieces extracted independently.

### 3.1 PR identifier (required)

Same resolution as `three-pass-review` §Step 1:
- Full Bitbucket URL → extract workspace, repo, prId.
- `<repo>#<n>` → workspace defaults to `pellsoftware`.
- Bare number → resolve repo from `git remote get-url origin`. If origin isn't Bitbucket, ask the user for a full URL.

### 3.2 Context source (for fix-application reads)

- Default `local` — assume a local checkout; use `Read`/`Grep`/`Glob` against `<repo_root>`.
- `use bitbucket`, `use mcp`, `use remote`, `fetch via bitbucket`, `not LFS`, `not local` → `bitbucket`: read surrounding code via `mcp__atlassian-bitbucket__bitbucketRepoContent` against the PR's source branch.

Note: this only affects *fix-application* reads. Comment *fetching* is always via the Bitbucket MCP regardless.

### 3.3 Scope filters (client-side — the API has no `q` for comments)

Default scope is **all comments** (resolved + unresolved, inline + general). Freeform phrases narrow it:

| Phrases | Effect |
|-|-|
| `unresolved`, `open only`, `unresolved only` | Hide threads marked resolved. Requires the `resolved` field (see §9); degrades to "all open" with a printed note if the field is absent. |
| `since last push`, `since my last push` | Keep comments with `created_on`/`updated_on` newer than the last push to the source branch (`git log -1 --format=%cI <source-branch>@{push}`, fallback to the branch tip commit date). |
| `since <ISO-date>` | Keep comments newer than the given date. |
| `from <name>`, `by <name>` | Keep comments whose author display name or username contains `<name>` (case-insensitive). |

Filters compose (e.g. `unresolved from Dana`). All filtering is client-side over the full fetched set.

### 3.4 `--dry-run`

Render Steps 1–3 only (the grouped comment list), then exit before the Step 4 triage prompt. No side effects offered. Useful for "just show me what's outstanding."

### 3.5 Unrecognized text

Passes through as informational context; no control-flow impact.

## 4. Step 1 — Resolve PR + context source

Parse per §3.1–3.2. Capture `workspace`, `repo`, `prId`, `context_source`, and `repo_root` (`git rev-parse --show-toplevel`). Determine the PR's source branch via `action=get` (also needed for the `since last push` filter and for `bitbucket` context reads).

## 5. Step 2 — Fetch comments

Call `mcp__atlassian-bitbucket__bitbucketPullRequest` with `action=comments`, `prId`, `workspaceId`, `repoId`, `pagelen=100`. Paginate (`page=2,3,…`) until a page returns fewer than `pagelen` results — comment threads on active PRs routinely exceed one page.

If the PR has no comments: print `No comments on PR #<prId>.` and stop.

## 6. Step 3 — Group, filter, render

1. **Drop** comments with `deleted: true` (tombstoned) and `pending: true` (the user's own unpublished review drafts — not real feedback yet).
2. **Normalize** each remaining comment to: `id`, `user.display_name` (the author — note the field is `user`, not `author`), `path` = `inline.path` (inline only), `line` = `inline.to` (new side) ?? `inline.from` (old side) (inline only), `body` = `content.raw`, `parentId` = `parent.id` (reply linkage), `resolved` = `resolution != null`, `created_on`/`updated_on`.
4. **Apply §3.3 filters** client-side.
5. **Assemble threads** — group replies (`parentId` set) under their root comment so each thread renders as a unit with context.
6. **Bucket**:
   - **Inline** threads grouped by `path`, then ordered by `line`.
   - **General** (no `path`) threads in their own section.
7. **Render** a numbered triage list:

```
## Review on PR #<prId> — <title>
**Branch:** `<source>` → `<destination>`   ·   **Comments:** <N> (<X> inline, <Y> general)
**Scope:** <all | filter description>

### `src/path/File.cs`
**[1]** L42 · @dana  [resolved]
> Original comment body…
  ↳ @you: prior reply body…            (existing thread replies shown for context)

**[2]** L88 · @sam  [outdated]
> Comment body…

### General
**[3]** @dana
> PR-level comment body…
```

Markers: `[resolved]` when the thread is resolved, `[outdated]` when the anchor no longer maps to current code (the line moved). Both are display-only flags; see §8 for how `[outdated]` affects fixing.

If `--dry-run`, stop here.

## 7. Step 4 — Per-comment triage (gated)

Prompt:

> How do you want to handle these? Reply with per-comment actions — e.g. `1 fix, 2 reply, 3 skip` — or a bulk verb (`all fix`, `all reply`, `all skip`). Anything you don't list defaults to **skip**.

Parse the response into a `{comment# → action}` map. Actions: `fix`, `reply`, `skip`. Unlisted comments → `skip`. If the user just says "no"/"cancel", exit cleanly.

## 8. Step 5 — Act (gated)

Process the triage map in list order.

### 8.1 `fix`

Interpret the reviewer's request and apply it as a working-tree edit — the same discipline as `local-review`'s "Applying a fix":

1. **Re-locate the target by content**, not by the comment's stored line number (the line may have shifted; `[outdated]` comments are expected to have moved). Read the file (or fetch via `bitbucketRepoContent` in `bitbucket` mode) and find the code by content.
2. Apply with `Edit` (or `MultiEdit` for several fixes in one file).
3. **Only concrete, mechanical changes.** If the comment is a question, a discussion, or a non-mechanical ask ("consider rethinking this abstraction"), do **not** edit — skip it with a note and surface it as a reply candidate instead.
4. **Never weaken or delete a test or assertion** to satisfy a comment — no exceptions, even when explicitly asked (a reviewer who thinks a test is wrong is starting a discussion; reply, don't edit). For *other* weakening (loosening a type, suppressing a warning), only when the comment explicitly and unambiguously asks for exactly that.
5. **General comments** (no anchor) may still request a code change; attempt a best-effort fix only when the target is unambiguous, else skip with a note.

After all fixes:
- Run a test/lint command derivable from the project (`package.json` scripts, `Makefile`, `dotnet test`, `pytest`). If none is identifiable, skip — do not guess.
- Show `git diff --stat`.

### 8.2 `reply`

1. Draft reply text. If the same comment was also `fix`ed, default the draft to `Addressed — <one-line summary of the edit>`. Otherwise ask the user what to say (or accept their inline text from Step 4).
2. **Show the draft and confirm before posting.**
3. Post via `mcp__atlassian-bitbucket__bitbucketPullRequest` `action=comment`, `prId`, `workspaceId`, `repoId`, `parentCommentId=<thread root id>`, `content=<reply>`. Run sequentially (rate limits).

**There is no resolve/unresolve action in the Bitbucket MCP** (§9). A reply does *not* resolve the thread — actually marking it resolved is a manual step in the Bitbucket UI. The command states this so the user isn't misled into thinking a reply closes the thread.

### 8.3 `skip`

Nothing.

### 8.4 Final report

```
Applied <F> fixes to the working tree. Skipped <S> (reasons: …). Posted <R> replies. Failed <K> (reasons: …).
<git diff --stat output, if any fixes applied>

Threads are NOT resolved — resolve them in Bitbucket once you've confirmed each fix.
Nothing was committed or pushed; review `git diff` and use /pell:finish-work when ready.
```

## 9. MCP capability findings

Confirmed from the `bitbucketPullRequest` tool schema (no live call needed):
- `action=comments` lists comments; pagination via `page`/`pagelen`; **no `q` filter** → all scope-narrowing is client-side (§3.3).
- `action=comment` + `parentCommentId` replies on a thread.
- The action enum is `create/get/list/merge/approve/request-changes/comment/comments/diff` — **no resolve/unresolve action**. "Addressed" can only be a reply; resolving is manual UI (§8.2).

**Live verification done (Task 3.2 — real `action=comments` call against `pellsoftware/atlasviewapp` PR #1, 2026-05-28).** That PR's sole comment is *general* (no inline anchor, no replies, unresolved), so the inline/parent/resolution shapes below come from the documented Bitbucket Cloud v2.0 API and are flagged to reconcile on first real encounter; the rest is confirmed live.

**Confirmed live (per-comment fields):**
- `id` — integer.
- `user` — the author lives under **`user`** (`{display_name, nickname, uuid, account_id}`), **not** `author`. (`author` is the PR-level field from `action=get`.)
- `content.raw` — comment body (markdown); `content.html` also present.
- `created_on` / `updated_on` — ISO 8601.
- `deleted` (bool) and `pending` (bool) — present on every comment. **Drop `deleted:true`** (tombstoned) and **`pending:true`** (the user's own unpublished review drafts) per §6.
- `links.html.href` — web link to the comment (inline ones carry a `#comment-<id>` diff anchor).

**From the documented API (not observable on PR #1 — reconcile on first encounter):**
- Inline anchor — `inline: { path, from, to }`. `to` = new-side line, `from` = old-side line; one is null depending on side. Absent entirely on general comments.
- Reply linkage — `parent: { id }` on replies; absent on root comments.
- Resolution — `resolution` is `null`/absent when open, an object (`{user, created_on}`) when resolved. On PR #1's open comment the key was **absent**, so treat *missing or null* `resolution` as unresolved.

**Confirmed:** resolved/author/date filtering is all client-side (the `comments` action takes only `page`/`pagelen`).

**Contingency if the documented fields differ in practice:**
- No usable `resolution` → the `unresolved` filter (§3.3) degrades to "all open" with a printed note; the default (all comments) is unaffected.
- `[outdated]` is derived (the anchor no longer maps to current code), not a field — omit the marker if it can't be determined; the re-locate-by-content fix discipline (§8.1) already handles moved anchors safely.
- No parent linkage → render every comment flat (no thread nesting); replies target the comment's own `id`.

## 10. Operator notes

- **Never** post a reply or apply a fix without explicit confirmation.
- **Never** commit or push — working-tree edits only.
- **Never** weaken or delete tests/assertions to satisfy a comment (§8.1).
- Authorship is **not** enforced. The command assumes it's your PR but cannot verify (the Bitbucket current-user identity gap tracked in Phase 4). It operates on whatever PR you pass.
- If `action=comments` returns malformed/partial entries, still list them (under General if the anchor is missing) rather than dropping them silently.
- Comment fetching always uses the Bitbucket MCP; `context_source` only governs fix-application reads.

## 11. Out of scope

- **Resolving threads** — no MCP action exists; manual in Bitbucket.
- **Committing / pushing** — `/pell:finish-work`.
- **Generating new findings** — that's `three-pass-review`/`local-review`; this command only responds to existing human comments.
- **Multi-PR batches** — one PR per invocation.
- **A review-feedback composer** — deferred until the standalone command proves out.
- **Jira side effects** — none; this command touches Bitbucket + the working tree only.
