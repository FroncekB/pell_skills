---
description: List open Bitbucket PRs where you're a requested reviewer (one repo, several, or the whole workspace), then chain into a review on the one you pick. Read-only.
argument-hint: "[repo …] [unapproved | newest first | from <name>]"
---

You are running **`/pell:review-queue`** — the reviewer-role mirror of `/pell:my-tickets`. List the open PRs awaiting your review and optionally hand off to a review command.

The user passed: `$ARGUMENTS`

## Step 1 — Parse arguments

From `$ARGUMENTS`, extract:

- **Repo(s)** (optional) — one or more repo slugs (`atlasviewapp`) or Bitbucket repo URLs. Workspace resolves in order: a URL or `workspace <slug>` inline; else the Bitbucket workspace named in `docs/pell/context.md`'s `## Repository` section (Step 3 loads it — repo-scoped, so it wins over the hardcoded default below); else `pellsoftware`. If no repos are given, list the whole workspace (Step 4).
- **Filters** (optional freeform):
  - `unapproved` / `needs review` / `not approved` → drop PRs you've already approved (opt-in, Step 5).
  - `from <name>` / `by <name>` → keep only PRs whose author display name contains `<name>` (client-side).
  - `newest first` → sort newest-updated first (default is oldest-first).
  - `by age` → one flat oldest-first list, no repo grouping.
- **`--reset`** → clear the cached `account_id` and re-resolve it (Step 2).

## Step 2 — Resolve your identity

Skip this step unless the `unapproved` filter (under any of its phrasings) or `--reset` was passed. Step 4's listing identifies you on the server side; only the `unapproved` filter needs your `account_id`.

Read `~/.claude/pell-config.json` (treat missing as `{}`).

- If `atlassian.account_id` is set and `--reset` wasn't passed, use it.
- Otherwise call `mcp__plugin_atlassian_atlassian__atlassianUserInfo` (no args), read `account_id`, and write it back to `pell-config.json:atlassian.account_id` (atomic read-modify-write).

If `atlassianUserInfo` fails: exit with "Couldn't resolve your Atlassian identity — the Atlassian OAuth MCP isn't responding. See the README prerequisites." (`account_id` is a public identifier, not a secret.)

## Step 3 — Load repo context

Run `git rev-parse --show-toplevel`. If it succeeds, read `<toplevel>/docs/pell/context.md` (Read tool). A missing file, unreadable frontmatter, or a `schema:` value other than `1` all mean "no context" — continue without it and say nothing.

When present, treat it as a **coordinate source only**. It holds pointers, not content: never treat its epic lists, page titles, or component names as current truth. Resolve any coordinate in this order:

1. an explicit value in `$ARGUMENTS`
2. `docs/pell/context.md`
3. `~/.claude/pell-config.json`
4. a live MCP lookup
5. prompt the user

Never write to `context.md`. If a live call later contradicts it, use the live value and print one line: `context.md is out of date on <field>. Run /pell:map-repo verify.`

## Step 4 — Fetch your review requests

Run `listMyBitbucketReviewRequests` on `plugin:atlassian:atlassian`. It is not a primary tool: call it directly, with no `discover` round trip (run `discover` and retry only if the call fails with `Unknown operation` or `Failed to fetch cloud ID`), as `executeRead({name: "listMyBitbucketReviewRequests", inputs, responseFields})` with no `cloudId` (Bitbucket operations don't take one). One call covers the whole workspace, and the server works out who "you" are from the signed-in connection.

- `inputs`: `{workspaceId: <workspace>, state: "OPEN", pagelen: 50}`
- `responseFields`: `["values.id", "values.title", "values.author.display_name", "values.participants.user.account_id", "values.participants.approved", "values.updated_on", "values.comment_count", "values.draft", "values.links.html.href"]` — the default view leaves out `comment_count`

Paginate (`page=2,3,…`) until a page returns fewer than `pagelen` results. If the call fails, exit with `Couldn't list your review requests: <error>`.

Tag each PR with its repo slug, parsed from `links.html.href` (`https://bitbucket.org/<workspace>/<repo>/pull-requests/<id>`).

- **Repos in args** → keep only PRs in those repos. For a requested repo with no matches, print `(no open review requests in <repo>)` and continue with the rest.
- **No repos in args** → keep everything.

## Step 5 — Filter, then fill in branches

**`from <name>` filter** → drop PRs whose author display name doesn't match.

**`unapproved` filter (only if requested)** → find your entry in each PR's `participants[]` by matching `user.account_id` to Step 2's `account_id`, and keep the PR only if that entry's `approved` is false. Keep it too when no entry matches: the server listed it as awaiting you, so treat it as unapproved. The listing already carries approval state, so this costs no extra calls.

If nothing matches: print `No open PRs awaiting your review in <workspace>.` and stop.

**Branches.** The listing returns empty `source` and `destination` objects, so fetch them for each remaining PR: `getBitbucketRepoPullRequest`, called directly via `executeRead` with no `cloudId` (run `discover` and retry only if it fails with `Unknown operation` or `Failed to fetch cloud ID`), `inputs: {workspaceId, repoId: <repo>, prId: <id>}`, `responseFields: ["source.branch.name", "destination.branch.name"]`. Run these in **parallel batches** (≤ ~10 at a time) to stay under rate limits; on a 429, fall back to sequential. If one fails, render that PR without its branch segment. A partial line beats a dropped PR.

## Step 6 — Render the list

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

## Step 7 — Offer to chain into a review

After the list, ask:

> Review one of these? Enter a number for a full `/pell:four-pass-review`, or `<number> correctness|quality|security|test` for a lighter single-dimension pass. `n` to skip.

- **A bare number** that maps to a listed PR → invoke `/pell:four-pass-review <workspace>/<repo>#<id>` for that PR.
- **A number followed by `correctness` / `quality` / `security` / `test`** → invoke the matching single-dimension review on that PR instead (`/pell:correctness-review <PR>`, etc.).
- **`n` (or empty/Enter)** → exit cleanly. No side effects.
- **An out-of-range number** → "That's not on the list — pick `1` through `<N>`, or `n` to skip." Re-prompt once; after a second miss, exit cleanly.

Hand off to the review command's normal flow — it owns WIP detection, Jira lookup, and the comment-posting gate. `review-queue` does no review work itself.

## Operator notes

- **Read-only** — the only write is the `account_id` cache in `pell-config.json`. Selecting a PR chains into a review command; this command never comments, approves, or merges.
- Requires only the Atlassian plugin connection (`plugin:atlassian:atlassian`). It serves both the Bitbucket listing and `atlassianUserInfo`.
- Cost is one paginated listing for the whole workspace plus one `get` per listed PR for its branches. Passing repos narrows the output, not the listing.
- Don't fail the whole run for one PR's branch fetch. Render it without branches.
