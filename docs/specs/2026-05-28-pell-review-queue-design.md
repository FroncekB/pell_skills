# `/pell:review-queue` — Design Spec

**Status:** approved
**Author:** Brandon Froncek + Claude
**Date:** 2026-05-28
**Parent spec:** [`2026-05-27-pell-skills-architecture.md`](2026-05-27-pell-skills-architecture.md)
**Roadmap:** Phase 4 of [`2026-05-28-pell-toolkit-improvements-plan.md`](2026-05-28-pell-toolkit-improvements-plan.md)

## Purpose

`/pell:review-queue` is the "review others" entry point — the reviewer-role mirror of `/pell:my-tickets` and `/pell:triage`. It lists the open Bitbucket PRs where you're a requested reviewer, then chains into a review command on the one you pick. It is a **read-only list-then-chain** command: the only side effect is the review you explicitly select, plus the transparent identity-cache write.

It mirrors `/pell:my-tickets`' structure: resolve identity → query → render a numbered list → reply with a number to chain.

## 1. Invocation

```
/pell:review-queue [repo …] [freeform filters]
```

Examples:

```
/pell:review-queue                          # scan the whole workspace
/pell:review-queue atlasviewapp             # just one repo (fast)
/pell:review-queue atlasviewapp rrs-web     # a couple of repos
/pell:review-queue unapproved               # drop PRs you've already approved (costs per-PR gets)
/pell:review-queue newest first             # override the default oldest-first ordering
/pell:review-queue --reset                  # re-resolve and re-cache your account_id
```

## 2. Architecture & flow

```
1. Parse args                  (optional repo(s); freeform filters)
2. Resolve identity            (atlassianUserInfo.account_id, cached)
3. Resolve repo set            (args, else enumerate workspace repos)
4. Query PRs                   (per repo: OPEN + reviewers.account_id filter, parallel batches)
5. Render                      (numbered list grouped by repo, oldest-first)
6. Chain                       (reply <n> → /pell:three-pass-review <that PR>)
```

## 3. Argument grammar

Freeform-first per Pell convention.

### 3.1 Repo selection (optional)

- One or more repo identifiers → scan only those: a repo slug (`atlasviewapp`), or a Bitbucket repo URL. Workspace defaults to `pellsoftware`; a URL or `workspace <slug>` overrides it.
- **No repo given → scan the entire workspace** (§5).

### 3.2 Filters

| Phrase | Effect |
|-|-|
| `unapproved`, `needs review`, `not approved` | Drop PRs you've already approved. Requires a per-PR `get` (approval state isn't in the list response — §9), so it's opt-in. |
| `from <name>`, `by <name>` | Keep only PRs whose **author** display name contains `<name>` (client-side). |
| `newest first` | Sort newest-updated first (default is oldest-first). |
| `by age` | Flatten into a single oldest-first list, ignoring repo grouping. |

### 3.3 `--reset`

Clears the cached `account_id` in `pell-config.json` and re-resolves it. Use if you switched Atlassian accounts.

### 3.4 Unrecognized text

Passes through as informational context; no control-flow impact.

## 4. Identity resolution

1. Read `~/.claude/pell-config.json` (treat missing as `{}`). If `atlassian.account_id` is cached and `--reset` wasn't passed, use it.
2. Otherwise call `mcp__plugin_atlassian_atlassian__atlassianUserInfo` (no args) and read `account_id`. Write it back atomically under `atlassian.account_id`.
3. If `atlassianUserInfo` fails (the Atlassian OAuth connection is down), exit: `"Couldn't resolve your Atlassian identity — the Atlassian OAuth MCP isn't responding. See the README prerequisites."`

**Why this works (verified — §9):** the `account_id` from `atlassianUserInfo` is the unified Atlassian account id, and Bitbucket honors it in the reviewer filter. No Bitbucket UUID, no config bootstrap, no current-user Bitbucket tool needed.

## 5. Repo-set resolution

- **Repos given in args** → use exactly those (validate each; on a 404/no-access, print `(skipping <repo> — not found or no access)` and continue with the rest).
- **No repos given** → enumerate the workspace: `mcp__atlassian-bitbucket__bitbucketRepository` `action=list`, `workspaceId=pellsoftware`, paginate until exhausted. Collect repo slugs. Print `Scanning <N> repos in pellsoftware…` so the user knows a no-arg run does more work.

## 6. Querying PRs

For each repo in the set, call `mcp__atlassian-bitbucket__bitbucketPullRequest`:
- `action=list`, `workspaceId`, `repoId=<slug>`
- `state=OPEN`
- `q=reviewers.account_id="<account_id>"`

Run these in **parallel batches** (≤ ~10 at a time) to stay under rate limits; fall back to sequential on a 429. Aggregate the `values` arrays, tagging each PR with its repo.

Capture per PR (all present in the list response — §9): `id`, `title`, `author.display_name`, `source.branch.name`, `destination.branch.name`, `created_on`, `updated_on`, `comment_count`, `draft`, `links.html.href`.

**`unapproved` filter (opt-in only):** for each candidate, `action=get` and inspect `participants[]` for your `account_id`; keep the PR only if that entry's `approved` is false. (This is why it costs N extra calls.)

If no PRs match across the whole set: print `No open PRs awaiting your review (scanned <N> repos).` and stop.

## 7. Rendering

Group by repo; within a repo, oldest `updated_on` first (the stalest PR needs you most). Order repos by the age of their oldest waiting PR (most-overdue repo first). Number sequentially across the whole list for the pick prompt.

```
## PRs awaiting your review — <total> across <repos> repos

### atlasviewapp (2)
**[1]** #14 · "Fix cart totals" · @Dana · `feature/cart → main` · updated 3d ago · 2 comments
**[2]** #9  · "Dashboard edits" [draft] · @Sam · `john-dashboard-editpage → main` · updated 6w ago · 1 comment

### rrs-web (1)
**[3]** #88 · "Null-check the session" · @Lee · `bugfix/RRS-12 → develop` · updated 1d ago · 0 comments
```

`newest first` reverses the sort; `by age` produces a single flat oldest-first list without repo headers.

## 8. Chaining into a review

Prompt:

> Reply with a number to review that PR — defaults to `/pell:three-pass-review`. Add a dimension for a lighter pass (e.g. `2 correctness`). `q` to quit.

- Bare `<n>` → dispatch `/pell:three-pass-review <workspace>/<repo>#<id>` for that PR.
- `<n> correctness` | `quality` | `security` | `test` → dispatch the matching single-dimension review (`/pell:correctness-review <PR>`, etc.) instead.
- `q` / `quit` / empty → exit cleanly.

`review-queue` does no review work itself — it forwards the chosen PR identifier to the review command, which owns its own WIP detection, Jira lookup, and comment-posting gate.

## 9. MCP capability findings

Verified live against `pellsoftware/atlasviewapp` on 2026-05-28:

- **Identity:** `atlassianUserInfo` → `account_id = 637ce68f5fc160544e18ed28`, which is exactly the `account_id` on Brandon's Bitbucket reviewer/comment entry. The Atlassian account is unified across Jira and Bitbucket. No Bitbucket current-user tool exists, but none is needed.
- **Reviewer filter works server-side:** `action=list` + `state=OPEN` + `q=reviewers.account_id="<id>"` returned the PR where the user is a reviewer, and returned **empty** for a non-reviewer's id (the PR author) — proving the filter is honored, not ignored. `reviewers.uuid="{…}"` works identically.
- **`action=list` requires `repoId`** (no workspace-wide PR endpoint via this tool) — hence the per-repo iteration in §6.
- **`action=list` omits the `reviewers`/`participants`/approval data** that `action=get` includes — hence the `unapproved` filter needs a per-PR `get` (§6).
- **`defaultReviewers` was empty both with and without `excludeCurrentUser`** — the plan's "diff defaultReviewers to derive identity" (option b) is a dead end; moot now that identity comes from `account_id`.
- **List response fields confirmed present:** `id`, `title`, `author{display_name,account_id,uuid}`, `source/destination.branch.name`, `created_on`, `updated_on`, `comment_count`, `draft`, `state`, `links.html`.

## 10. Operator notes

- **Read-only.** The only writes are the `account_id`/`cloud_id` cache in `pell-config.json`. Selecting a PR hands off to a review command; `review-queue` itself never comments, approves, or merges.
- **No secrets** in `pell-config.json` — `account_id` is a public Atlassian identifier, not a credential.
- A no-arg workspace scan is N+1 calls; always print the repo count first and parallelize. Suggest passing a repo for speed.
- If a per-repo query fails (rate limit, transient), note it and continue — a partial queue beats no queue. Don't fail the whole run for one repo.
- Requires **both** MCPs: Bitbucket (PR + repo listing) and the Atlassian OAuth connection (`atlassianUserInfo`).

## 11. Out of scope

- **Posting reviews / approvals** — selecting a PR chains into a review command; this command never approves or requests changes itself.
- **Authored-by-me PRs** — this is the reviewer queue, not `my-prs`; author-side tracking is a separate command if ever wanted.
- **Cross-workspace scanning** — one workspace per invocation (default `pellsoftware`, override via URL/`workspace`).
- **Persisting a curated repo set** — per the design decision, repo scope is arg-driven with a workspace-wide default; no `review_repos` config list (YAGNI).
- **Approval-state in the default view** — only the opt-in `unapproved` filter pays for per-PR `get`s.
