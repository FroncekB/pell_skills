---
description: Three-pass review of a Bitbucket PR — dispatches correctness, quality, and security reviewers in parallel with linked Jira context. Optionally posts findings as inline PR comments.
argument-hint: <PR url | repo#number | bare PR number>
---

You are running **`/pell:three-pass-review`** — the PR composite. Orchestrate, aggregate, decide on side effects.

The user passed: `$ARGUMENTS`

## Step 1 — Resolve the PR and context source

Parse `$ARGUMENTS`:
- Full URL — extract workspace, repo, prId
- `<repo>#<n>` — workspace defaults to `pellsoftware`
- Bare number — resolve repo from `git remote get-url origin`. If origin isn't Bitbucket, ask the user for a full URL

**Context source** for the reviewers' surrounding-code fetches:
- Default: `local` — assume the user is in a local checkout of the same repo. Reviewers will use `Read`/`Grep`/`Glob` against `<repo_root>`
- If `$ARGUMENTS` contains `use bitbucket`, `use mcp`, `use remote`, `fetch via bitbucket`, `not LFS`, or `not local` → use `bitbucket` — reviewers will fetch via `mcp__atlassian-bitbucket__bitbucketRepoContent` (action `files.get`) against the PR's source branch

Honor other freeform context too (e.g. "skip jira", "treat as urgent").

## Step 2 — Fetch PR data

Call **in parallel**:
- `mcp__atlassian-bitbucket__bitbucketPullRequest` with `action=get`
- `mcp__atlassian-bitbucket__bitbucketPullRequest` with `action=diff`

Capture: title, description, source branch, destination branch, author, state, full diff.

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

> This PR looks like a work-in-progress (`<reason>`). Continue the three-pass review? (y/n)

Wait for confirmation.

## Step 5 — Dispatch the three reviewers in parallel

In a **single assistant message**, make three `Agent` tool calls:

1. `subagent_type="correctness-reviewer"`
2. `subagent_type="quality-reviewer"`
3. `subagent_type="security-reviewer"`

Each agent gets the same prepared prompt:

```
mode: pr
context_source: <local | bitbucket>
repo_root: <output of `git rev-parse --show-toplevel`>
workspace: <workspace>
repo: <repo>
branch: <source branch>

PR: <workspace>/<repo>#<prId> — "<title>"
Author: <author>
Branch: <source> → <destination>

Jira: <KEY>: <summary> — <status>
Jira description / acceptance criteria:
<markdown>

(omit Jira block if no ticket)

Diff:
<diff>

Per your context discovery contract: use Read/Grep/Glob from repo_root when context_source is `local`; use mcp__atlassian-bitbucket__bitbucketRepoContent when context_source is `bitbucket`.

Return findings as JSON per your output contract.
```

## Step 6 — Aggregate and render

Parse each agent's JSON output. Render a single report:

```
## Three-Pass Review — <PR title> (#<prId>)

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

### Counts
- Correctness: <blocker> blocker, <major> major, <minor> minor, <nit> nits
- Quality: <major> major, <minor> minor, <nit> nits
- Security: <critical> critical, <high> high, <medium> medium, <low> low, <nit> nits
- **Total:** <N findings>

### Verdict
<one paragraph: ship / fix-before-merge / block, naming the most important findings>
```

Use the severity headers as a compact summary line; render full findings below. Group nits at the end of each section.

## Step 7 — Offer to post comments

Ask the user which severity threshold to post:

> Post findings as inline comments on PR #<prId>?
> - **blockers-only** — just blocker/critical findings
> - **major+** — blocker/critical + major/high
> - **minor+** — everything except nits (recommended default)
> - **all** — everything including nits
> - **select** — interactively pick findings
> - **no** — exit

Default if user just says "yes": `minor+`. Never post nits by default.

For each finding to post:
1. Call `mcp__atlassian-bitbucket__bitbucketPullRequest` with:
   - `action=comment`
   - `prId=<prId>`, `workspaceId=<workspace>`, `repoId=<repo>`
   - `inlinePath=<file>`, `inlineToLine=<line>`
   - `content`: `**[<dimension>/<severity>]** <finding>\n\n**Suggested fix:** <fix>`
2. Run sequentially (Bitbucket may rate-limit)
3. Report back: "Posted N inline comments. Failed: M (reasons: …)"

If the user picks `no`, exit cleanly.

## Operator notes

- **Never** post comments without explicit confirmation
- If a reviewer agent returns malformed JSON, render its raw output under that dimension and skip the side-effect offer for that dimension
- Findings from different reviewers may overlap — show both, they're different angles
