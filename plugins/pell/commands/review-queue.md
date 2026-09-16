---
description: List open Bitbucket PRs where you're a requested reviewer (one repo, several, or the whole workspace), then chain into a review on the one you pick. Read-only.
argument-hint: "[repo …] [unapproved | newest first | from <name>]"
---

You are running **`/pell:review-queue`** — the reviewer-role mirror of `/pell:my-tickets`. List the open PRs awaiting your review and optionally hand off to a review command.

The user passed: `$ARGUMENTS`

## Step 1 — Parse arguments

From `$ARGUMENTS`, extract:

- **Repo(s)** (optional) — one or more repo slugs (`atlasviewapp`) or Bitbucket repo URLs. Workspace defaults to `pellsoftware`; a URL or `workspace <slug>` overrides it. If none are given, scan the whole workspace (Step 3).
- **Filters** (optional freeform):
  - `unapproved` / `needs review` / `not approved` → drop PRs you've already approved (opt-in; costs a per-PR `get`, Step 4).
  - `from <name>` / `by <name>` → keep only PRs whose author display name contains `<name>` (client-side).
  - `newest first` → sort newest-updated first (default is oldest-first).
  - `by age` → one flat oldest-first list, no repo grouping.
- **`--reset`** → clear the cached `account_id` and re-resolve it (Step 2).

## Step 2 — Resolve your identity

Read `~/.claude/pell-config.json` (treat missing as `{}`).

- If `atlassian.account_id` is set and `--reset` wasn't passed, use it.
- Otherwise call `mcp__plugin_atlassian_atlassian__atlassianUserInfo` (no args), read `account_id`, and write it back to `pell-config.json:atlassian.account_id` (atomic read-modify-write).

If `atlassianUserInfo` fails: exit with "Couldn't resolve your Atlassian identity — the Atlassian OAuth MCP isn't responding. See the README prerequisites." (`account_id` is a public identifier, not a secret.)

## Step 3 — Resolve the repo set

- **Repos in args** → use exactly those. Validate each as you query (Step 4); on a 404/no-access, print `(skipping <repo> — not found or no access)` and continue with the rest.
- **No repos in args** → enumerate the workspace: `mcp__atlassian-bitbucket__bitbucketRepository` `action=list`, `workspaceId=<workspace>`, paginating until exhausted. Collect repo slugs and print `Scanning <N> repos in <workspace>…` so the user knows a no-arg run does more work.

## Step 4 — Query each repo

For each repo, call `mcp__atlassian-bitbucket__bitbucketPullRequest`:
- `action=list`, `workspaceId`, `repoId=<slug>`
- `state=OPEN`
- `q=reviewers.account_id="<account_id>"`

Run these in **parallel batches** (≤ ~10 at a time) to stay under rate limits; on a 429, fall back to sequential. If one repo's query fails, print `(couldn't query <repo> — <error>)` and continue — a partial queue beats none.

Aggregate `values`, tagging each PR with its repo. Capture per PR: `id`, `title`, `author.display_name`, `source.branch.name`, `destination.branch.name`, `updated_on`, `comment_count`, `draft`, `links.html.href`.

**`from <name>` filter** → drop PRs whose author display name doesn't match.

**`unapproved` filter (only if requested)** → for each remaining PR, `action=get` and inspect `participants[]` for your `account_id`; keep it only if that entry's `approved` is false. (Approval state isn't in the list response, which is why this is opt-in.)

If nothing matches: print `No open PRs awaiting your review (scanned <N> repos).` and stop.

## Step 5 — Render the list

Group by repo; within a repo, **oldest `updated_on` first** (the stalest PR needs you most). Order repos by the age of their oldest waiting PR (most-overdue repo first). Number sequentially across the whole list.

```
## PRs awaiting your review — <total> across <repos> repos

### atlasviewapp (2)
**[1]** #14 · "Fix cart totals" · @Dana · `feature/cart → main` · updated 3d ago · 2 comments
**[2]** #9  · "Dashboard edits" [draft] · @Sam · `john-dashboard-editpage → main` · updated 6w ago · 1 comment

### rrs-web (1)
**[3]** #88 · "Null-check the session" · @Lee · `bugfix/RRS-12 → develop` · updated 1d ago · 0 comments
```

Format rules:
- `#<id>` then title truncated to 70 chars with `…` if longer; append `[draft]` for draft PRs
- `(updated <relative time>)` — largest unit giving an integer ≥ 1 (`5h ago`, `3d ago`, `6w ago`, `2mo ago`)
- `newest first` reverses the within-repo sort; `by age` produces a single flat oldest-first list with no repo headers

## Step 6 — Offer to chain into a review

After the list, ask:

> Review one of these? Enter a number for a full `/pell:three-pass-review`, or `<number> correctness|quality|security|test` for a lighter single-dimension pass. `n` to skip.

- **A bare number** that maps to a listed PR → invoke `/pell:three-pass-review <workspace>/<repo>#<id>` for that PR.
- **A number followed by `correctness` / `quality` / `security` / `test`** → invoke the matching single-dimension review on that PR instead (`/pell:correctness-review <PR>`, etc.).
- **`n` (or empty/Enter)** → exit cleanly. No side effects.
- **An out-of-range number** → "That's not on the list — pick `1` through `<N>`, or `n` to skip." Re-prompt once; after a second miss, exit cleanly.

Hand off to the review command's normal flow — it owns WIP detection, Jira lookup, and the comment-posting gate. `review-queue` does no review work itself.

## Operator notes

- **Read-only** — the only write is the `account_id` cache in `pell-config.json`. Selecting a PR chains into a review command; this command never comments, approves, or merges.
- Requires **both** MCPs: Bitbucket (PR + repo listing) and the Atlassian OAuth connection (`atlassianUserInfo`).
- A no-arg workspace scan is N+1 calls; always print the repo count first and parallelize. Suggest passing a repo for speed.
- Don't fail the whole run for one repo — skip it with a note and render what you have.
