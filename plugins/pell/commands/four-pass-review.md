---
description: Four-pass review of a Bitbucket PR — dispatches correctness, quality, security, and test-coverage reviewers in parallel with linked Jira context; add "skip tests" to drop the test-coverage pass. Offers a run-marker comment on the PR (default yes), then optionally posts findings as inline PR comments.
argument-hint: <PR url | repo#number | bare PR number>
---

You are running **`/pell:four-pass-review`** — the PR composite. Orchestrate, aggregate, decide on side effects.

The user passed: `$ARGUMENTS`

## Step 1 — Resolve the PR and context source

Parse `$ARGUMENTS`:
- Full URL — extract workspace, repo, prId
- `<repo>#<n>` — workspace defaults to `pellsoftware`
- Bare number — resolve repo from `git remote get-url origin`. If origin isn't Bitbucket, ask the user for a full URL

**Context source** for the diff and the reviewers' surrounding-code reads:
- Default: `git` — Step 2 fetches the PR's branches into the user's local clone of the same repo. Reviewers read the PR's code at its head commit with `git show`/`git grep`, so whichever branch is checked out doesn't matter
- If `$ARGUMENTS` contains `use bitbucket`, `use mcp`, `use remote`, `fetch via bitbucket`, `not LFS`, or `not local` → use `bitbucket` — the diff comes from Bitbucket and reviewers fetch files via `getBitbucketRepoFileContent` (`executeRead` on `plugin:atlassian:atlassian`) against the PR's source branch

**Test pass:** on by default. If `$ARGUMENTS` contains `skip tests`, `no tests`, or `-tests` → do not dispatch the test-coverage reviewer in Step 5, and omit the Test Coverage section, its count line, and its run-marker entries downstream. `with tests`, `include tests`, and `+tests` are accepted as no-ops — the pass already runs.

**Run marker:** on by default (Step 7 asks, default yes). If `$ARGUMENTS` contains `skip marker` or `no marker` → skip Step 7 entirely. If it contains `post marker` or `mark reviewed` → Step 7 posts without asking. If it contains `--dry-run` → nothing is posted to the PR; Steps 7 and 8 render what would have been posted instead.

Honor other freeform context too (e.g. "skip jira", "treat as urgent").

## Step 2 — Fetch PR data

Run `getBitbucketRepoPullRequest` on `plugin:atlassian:atlassian`. It is not a primary tool: call it directly with `executeRead({name: "getBitbucketRepoPullRequest", inputs: {workspaceId, repoId, prId}, responseFields})`, with `responseFields` beside `inputs`, never inside it, and no `cloudId` (Bitbucket operations ignore it). If any Bitbucket call in this command fails with `Unknown operation` or `Failed to fetch cloud ID`, the name has changed: run `discover` once for it and retry with the name it returns.
- `responseFields: ["title", "description", "state", "draft", "author.display_name", "source.branch.name", "source.commit.hash", "destination.branch.name"]` (the default view leaves out `description` and `draft`, which Step 4 reads, and `source.commit.hash`, which the diff check reads)

Capture: title, description, source branch, source commit, destination branch, author, state.

**Diff from the local clone** (skip when the context source is `bitbucket`). Run from `git rev-parse --show-toplevel`:
1. `git remote get-url origin` must name `<workspace>/<repo>` (case-insensitive). Then `git fetch origin <source> <destination>`, which updates remote-tracking refs only; local branches and the working tree are untouched
2. `git rev-parse origin/<source>` must start with the PR's `source.commit.hash`. A mismatch means the PR comes from a fork or the branch moved since the PR fetch. Keep the full SHA as `<source_sha>`
3. `git diff --stat origin/<destination>...<source_sha>`. The three-dot form diffs against the merge base, as Bitbucket does. If it's empty, tell the user "No changes to review." and stop. Don't print the full diff into this conversation — the reviewers read it from the file
4. `git diff --output=<git_dir>/pell-four-pass-review.diff origin/<destination>...<source_sha>`, where `<git_dir>` is the output of `git rev-parse --absolute-git-dir`. That file is `diff_path` for Step 5. It sits inside `.git`, so it is never committed, and the next run overwrites it

If there's no clone or any of steps 1–4 fails, print `Couldn't diff locally (<reason>). Using Bitbucket.` and switch the context source to `bitbucket`.

**Diff from Bitbucket** (context source `bitbucket`): don't fetch it here. Each reviewer fetches it with `getBitbucketRepoPullRequestDiff` itself, so the diff never passes through this conversation or the reviewer prompts.

## Step 3 — Find and fetch the Jira ticket

Search for a Jira key (`[A-Z][A-Z0-9]+-\d+`) in this order:
1. PR title
2. Source branch name (including GitFlow patterns: `feature/KEY-N-*`, `bugfix/KEY-N-*`, `hotfix/KEY-N-*`, `release/KEY-N-*`)
3. PR description

If no key is found, **stop and ask**: "I couldn't find a Jira key in the PR title, branch (`<branch>`), or description. What ticket is this for? (Provide a key like `RRS-1020`, or reply `skip`.)"

If a key was found or supplied (not `skip`):
1. Use `mcp__plugin_atlassian_atlassian__getAccessibleAtlassianResources` to get the cloud ID (cache it for this session)
2. Call `mcp__plugin_atlassian_atlassian__getJiraIssue` with `cloudId=<cloudId>`, `issueIdOrKey=<key>`, `responseContentFormat="markdown"`
3. Capture summary, description (with acceptance criteria), status

## Step 4 — WIP detection

If the PR's `draft` field is true OR the description contains phrases like "WIP", "work in progress", "didn't finish", "didn't fully implement", "incomplete":

> This PR looks like a work-in-progress (`<reason>`). Continue the four-pass review? (y/n)

Wait for confirmation. If the user declines, stop — nothing is posted to the PR.

## Step 5 — Dispatch the four reviewers in parallel

In a **single assistant message**, make the reviewer `Agent` tool calls — all four reviewers, unless the test pass was skipped in Step 1:

1. `subagent_type="correctness-reviewer"`
2. `subagent_type="quality-reviewer"`
3. `subagent_type="security-reviewer"`
4. `subagent_type="test-reviewer"` (omit only if `skip tests` / `no tests` / `-tests` was passed)

Each agent gets the same prepared prompt:

```
mode: pr
context_source: <git | bitbucket>
repo_root: <output of `git rev-parse --show-toplevel`>
ref: <source_sha>   (context_source git only)
workspace: <workspace>
repo: <repo>
branch: <source branch>
pr_id: <prId>
diff_path: <diff_path>   (context_source git only)

PR: <workspace>/<repo>#<prId> — "<title>"
Author: <author>
Branch: <source> → <destination>

Jira: <KEY>: <summary> — <status>
Jira description / acceptance criteria:
<markdown>

(omit Jira block if no ticket)

With diff_path, Read it in full before reviewing. Without one (context_source bitbucket), fetch the diff yourself with getBitbucketRepoPullRequestDiff (executeRead on plugin:atlassian:atlassian with workspace, repo, pr_id; no discover, no cloudId). Per your context discovery contract: use git show/git grep at ref from repo_root when context_source is `git`; use getBitbucketRepoFileContent (call it directly with executeRead on plugin:atlassian:atlassian; no discover, no cloudId) when context_source is `bitbucket`.

Return findings as JSON per your output contract.
```

## Step 6 — Aggregate and render

Parse each agent's JSON output. Render a single report:

```
## Four-Pass Review — <PR title> (#<prId>)

**Branch:** `<source>` → `<destination>`
**Author:** <author>
**Jira:** <KEY>: <summary> — <status>   (or "No Jira ticket linked")

### Correctness
**Blockers:** _None._  |  **Major:** _None._  |  **Minor:** _None._  |  **Nits:** _None._
- [severity] `file:line` — finding. **Fix:** …
- ...

### Code Quality
**Major:** _None._  |  **Minor:** _None._  |  **Nits:** _None._
- ...

### Security
**Critical:** _None._  |  **High:** _None._  |  **Medium:** _None._  |  **Low:** _None._  |  **Nits:** _None._
- ...

### Test Coverage
**Major:** _None._  |  **Minor:** _None._  |  **Nits:** _None._
- [severity] `file:line` — finding. **Fix:** …
- ...

(Omit the **Test Coverage** section only if the test pass was skipped via `skip tests`.)

### Counts
- Correctness: <blocker> blocker, <major> major, <minor> minor, <nit> nits
- Quality: <major> major, <minor> minor, <nit> nits
- Security: <critical> critical, <high> high, <medium> medium, <low> low, <nit> nits
- Test Coverage: <major> major, <minor> minor, <nit> nits   (omit only if test pass skipped)
- **Total:** <N findings>

### Verdict
<one paragraph: ship / fix-before-merge / block, naming the most important findings>
```

Use the severity headers as a compact summary line; render full findings below. Group nits at the end of each section.

## Step 7 — Post the run marker (gated, default yes)

Skip this step if `skip marker` / `no marker` was passed.

Fill this template from the report's **Counts** section — the passes that ran plus per-dimension counts, nothing else (no verdict, no finding text). A dimension whose reviewer returned malformed JSON reports `n/a` instead of counts.

```
**Four-pass review run** via `/pell:four-pass-review`

Passes: correctness, quality, security, test coverage   (drop test coverage only if test pass skipped)
- Correctness: <blocker> blocker, <major> major, <minor> minor, <nit> nits
- Quality: <major> major, <minor> minor, <nit> nits
- Security: <critical> critical, <high> high, <medium> medium, <low> low, <nit> nits
- Test Coverage: <major> major, <minor> minor, <nit> nits   (omit only if test pass skipped)
- Total: <N> findings
```

Show the body. Then:

- If `--dry-run` was passed → print `Run marker not posted (dry-run).` and continue to Step 8. Do not ask.
- If `post marker` / `mark reviewed` was passed → post without asking.
- Otherwise ask:

> Post this run-marker comment on PR #<prId>? (Y/n)

`y`, `yes`, or an empty reply → post. `n` / `no` → print `Run marker skipped.` and continue to Step 8.

To post, run `addBitbucketRepoPullRequestComment` on `plugin:atlassian:atlassian`. It is not a primary tool: call it directly with `executeWrite({name: "addBitbucketRepoPullRequestComment", inputs: {...}})` and no `cloudId` (on `Unknown operation` or `Failed to fetch cloud ID`, `discover` it once, as in Step 2). Inputs:
- `prId=<prId>`, `workspaceId=<workspace>`, `repoId=<repo>`
- `content=<body>`

This is a general PR comment — do **not** pass `inlinePath`, `inlineToLine`, `parentCommentId`, or `pending`.

On success print `Run marker posted.` On failure print `Failed to post run marker: <error>.` and continue to Step 8 — the marker never blocks the inline-comment offer.

## Step 8 — Offer to post inline comments

Ask the user which severity threshold to post:

> Post findings as inline comments on PR #<prId>?
> - **blockers-only** — just blocker/critical findings
> - **major+** — blocker/critical + major/high
> - **minor+** — everything except nits (recommended default)
> - **all** — everything including nits
> - **select** — interactively pick findings
> - **no** — exit

Default if user just says "yes": `minor+`. Never post nits by default. If `--dry-run`, list what would be posted (file, line, dimension/severity) at the chosen threshold and stop — make no calls.

For each finding to post:
1. Call `executeWrite` with `name: "addBitbucketRepoPullRequestComment"` (the same operation as the Step 7 marker) and these inputs:
   - `prId=<prId>`, `workspaceId=<workspace>`, `repoId=<repo>`
   - `inlinePath=<file>`, `inlineToLine=<line>`
   - `content`: `**[<dimension>/<severity>]** <finding>\n\n**Suggested fix:** <fix>`
2. Run sequentially (Bitbucket may rate-limit)
3. Report back: "Posted N inline comments. Failed: M (reasons: …)"

If the user picks `no`, exit cleanly.

## Operator notes

- **Never** post comments without confirmation — the run marker's confirmation is the default-yes prompt in Step 7 (or `post marker` in `$ARGUMENTS`); inline findings need the Step 8 threshold answer
- The run marker is one general comment; findings are inline comments. Never fold findings into the marker or post the marker as an inline comment
- If a reviewer agent returns malformed JSON, render its raw output under that dimension, report `n/a` for it in the run marker, and skip the inline-comment offer for that dimension
- Findings from different reviewers may overlap — show both, they're different angles
- Never paste the diff into the reviewer prompts. Writing four copies of it is the most expensive thing this command can do
