---
description: Close out a branch by opening a Bitbucket PR and (only on explicit consent) transitioning the linked Jira ticket and adding a PR-link comment. Read-only against Jira by default; PR creation always confirmed.
argument-hint: "[JIRA-KEY] [into <base>] [title: <text>] [freeform context]"
---

You are running **`/pell:finish-work`**. Close out work by opening a Bitbucket PR. Default behavior is read-only against Jira; the Jira transition and comment fire only on inline pre-authorization or per-action `y` answers. PR creation is always explicitly confirmed even with pre-auth shortcuts — opening the wrong PR is annoying enough to warrant the gate.

The user passed: `$ARGUMENTS`

## Step 1 — Parse arguments

Extract from `$ARGUMENTS`:

- **Jira key** (optional) — first match for `[A-Z][A-Z0-9]+-\d+`. If absent, inferred from the branch name in Step 2.
- **Base branch override** — phrases like `into <branch>`, `against <branch>`, `target <branch>`. Capture `<branch>` verbatim.
- **PR title override** — `title: "<text>"` or `title: <text>` (quoted text wins; otherwise capture the rest of the line). If absent, default title is built in Step 6.
- **Pre-authorizations** (each independent):
  - Push: `push it`, `push the branch`, `go ahead and push`
  - Transition: `move to <status>`, `move it to <status>`, `transition to <status>`
  - Comment: `comment with PR link`, `comment on jira`, `link the PR`
- **Declines:**
  - `don't touch jira`, `skip jira`, `no jira changes` → suppress both Step 7 sub-steps
  - `skip the comment`, `no comment` → suppress only Step 7b
- **`--reset` flag** — clears the cached "in_review" transition for this project before Step 7a.

The rest of `$ARGUMENTS` is informational context.

## Step 2 — Resolve the Jira key

If a key was parsed in Step 1, use it.

Otherwise, run `git branch --show-current`. Match against `^([A-Z][A-Z0-9]+-\d+)-` — capture the key from the branch name (the `<KEY>-<description>` shape `/pell:start-work` creates).

If no match → ask the user:

> I couldn't find a Jira key in the current branch name (`<branch>`). What ticket is this PR for? (Provide a key like `RRS-1020`, or `n` to cancel.)

On `n`, exit cleanly.

Extract `projectKey` from the resolved Jira key (everything before the `-`).

## Step 3 — Resolve `cloudId`, fetch ticket, fetch current user

Read `~/.claude/pell-config.json` (treat missing file as `{}`).

**Cloud ID:** if `jira.cloud_id` is set, use it. Otherwise call `mcp__plugin_atlassian_atlassian__getAccessibleAtlassianResources`, use the first result's `id`, write it back to config (atomic read-modify-write).

**Ticket:** call `mcp__plugin_atlassian_atlassian__getJiraIssue` with `cloudId`, `issueIdOrKey: <KEY>`, `responseContentFormat: "markdown"`. Capture `summary`, `status.name`, `description`.

If not found → exit with: "Couldn't find `<KEY>`. Check the key and your Jira MCP connection."

**Current user:** call `mcp__plugin_atlassian_atlassian__atlassianUserInfo`. Capture `accountId`. Session-scoped only — do NOT write to config.

## Step 4 — Resolve the base branch

The PR's destination branch, in this order:

1. If `into <branch>` was passed inline → use it (Step 1)
2. Run `git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null` — strip the `refs/remotes/origin/` prefix. This is the repo's default branch (`develop` for most Pell repos, `main` for some).
3. If step 2 fails or returns empty → read `pell-config.json:bitbucket.default_base_branch`
4. If still empty → ask:

   > I couldn't determine the base branch for this PR. What should I target? (e.g. `develop`, `main`)

Resolve the branch name; remember it as `<base>`.

## Step 5 — Pre-flight (push state + existing PR)

Run `git rev-parse --abbrev-ref HEAD` to get the current branch name (`<branch>`).

**Pushed?**

- Run `git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null`. If it fails (no upstream), the branch has never been pushed.
- Otherwise, run `git rev-list @{u}..HEAD --count` — non-zero means there are unpushed commits.

If either condition triggers, push is needed.

If the user pre-authorized `push it` inline → run `git push -u origin <branch>` without prompting. On push failure, surface the git error verbatim and exit.

Otherwise, ask:

> Branch `<branch>` has unpushed commits (or no upstream). Push to `origin` first? (y/n)

- `y` → `git push -u origin <branch>`. On failure, surface the error and exit.
- `n` → exit with: "PR creation needs the branch pushed first. Push manually with `git push -u origin <branch>` and re-run."

**Existing PR for this branch?**

Resolve the workspace and repo. Run `git remote get-url origin` and parse the Bitbucket URL — expect `git@bitbucket.org:<workspace>/<repo>.git` or `https://bitbucket.org/<workspace>/<repo>.git`. If parsing fails → ask the user for the workspace/repo. Cache nothing.

Call `mcp__atlassian-bitbucket__bitbucketPullRequest` with:
- `action`: `list`
- `workspaceId`: `<workspace>`
- `repoId`: `<repo>`
- `state`: `OPEN`
- `q`: `source.branch.name="<branch>"` (Bitbucket's BBQL filter syntax)

The response is paginated; pagelen defaults are fine for this check (we expect 0 or 1 result).

If a PR exists, print:

> A PR is already open for `<branch>`: `<existing PR URL>`. Skip the PR-create step and continue with optional Jira updates? (y/n)

- `y` → skip Step 6, use the existing PR's URL/ID for Step 7b's comment step
- `n` → exit cleanly

## Step 6 — Create the PR

**Build the title:**

- If the user passed `title: <text>` inline → use it verbatim
- Otherwise: `<KEY>: <Jira summary>` (e.g. `RRS-1020: Cart fails to update item quantity`)

**Build the description:**

```
Closes <KEY>.

<first ~10 lines of the Jira description, if non-empty, with a "..." line if truncated>
```

If the Jira description is empty, skip the second block.

**Confirm:**

Print:

> Open PR `<branch>` → `<base>`?
> Title: `<title>`
> Description starts with: `Closes <KEY>.`
> (y/n)

This prompt is required even when the user passed pre-authorizations elsewhere — PR creation is the one side-effect that's always explicitly confirmed.

On `y`, call `mcp__atlassian-bitbucket__bitbucketPullRequest` with:
- `action`: `create`
- `workspaceId`: `<workspace>`
- `repoId`: `<repo>`
- `sourceBranch`: `<branch>`
- `targetBranch`: `<base>`
- `title`: the assembled title
- `description`: the assembled description

Capture the new PR's URL and ID from the response.

On `n`, exit cleanly: "Cancelled. No PR opened, no Jira changes made."

On MCP failure, surface the error and exit. Do NOT proceed to Step 7 — the PR is the load-bearing deliverable.

## Step 7 — Jira side-effects (opt-in, asked one at a time)

If the user typed `don't touch jira`, `skip jira`, or `no jira changes`, skip this entire step.

Otherwise, run 7a and 7b in order. Each is independent.

### Step 7a — Transition to "in review"

**Discover the "in_review" transition for this project:**

If `$ARGUMENTS` contained `--reset`, clear `pell-config.json:jira.transitions[<projectKey>].in_review` before continuing.

Look up `pell-config.json:jira.transitions[<projectKey>].in_review`:

- **Cached and the ticket's current `status.name` matches it (case-insensitive)** → skip Step 7a entirely. Print: "Ticket already in `<status.name>` — skipping transition."
- **Cached but the ticket is NOT in that status** → use the cached transition name. Skip discovery.
- **Not cached** → run discovery:
  1. Call `mcp__plugin_atlassian_atlassian__getTransitionsForJiraIssue` with `cloudId` and `issueIdOrKey: <KEY>`. Capture `{id, name}` for each transition
  2. Score candidates — favor names containing (case-insensitive) any of: `in review`, `code review`, `review`, `ready for review`, `qa`, `testing`. Push these to the top of the list
  3. Filter out names that match (case-insensitive) any of: `done`, `closed`, `resolved`, `won't do`, `wont do`, `cancelled`, `canceled`, `rejected`, `to do`, `backlog`, `in progress`. None of these are "in review" candidates
  4. If 0 candidates remain → exit with: "No 'in review' transitions available for `<KEY>`. Available transitions: `<comma-separated list of all names from the unfiltered response>`. Pass one explicitly with `move it to <name>` to bypass discovery."
  5. If exactly 1 candidate → use it. Ask: "Use `<name>` as the 'in review' transition for `<projectKey>` going forward? (y/n)" — on `y`, cache; on `n`, use for this invocation only
  6. If 2+ candidates → render a numbered list (favored candidates first), ask which means "in review", cache the selection

**If the user pre-authorized `move it to <status>` inline:**

Match `<status>` (case-insensitive) against the candidate names. Exactly one match → use it, cache. Zero or multiple matches → fall back to the discovery flow above.

**Apply the transition:**

If pre-authorized, run without prompting. Otherwise ask:

> Want me to move `<KEY>` to `<chosen transition name>`?

On `y`, call `mcp__plugin_atlassian_atlassian__transitionJiraIssue` with `cloudId`, `issueIdOrKey: <KEY>`, `transition: {id: <chosen id>}`.

On failure, print: "⚠ Failed to transition — `<error>`." Continue to Step 7b. Do NOT roll back the PR.

On `n`, continue to Step 7b silently.

### Step 7b — Comment with PR link

Skip this sub-step if the user passed `skip the comment` or `no comment` inline.

If pre-authorized (`comment with PR link`, `comment on jira`, `link the PR`) → post without prompting.

Otherwise ask:

> Want me to add a comment to `<KEY>` with the PR link?

On `y`, call `mcp__plugin_atlassian_atlassian__addCommentToJiraIssue` with:
- `cloudId`
- `issueIdOrKey`: `<KEY>`
- `commentBody`: `PR opened: <PR URL>` (use markdown if the MCP supports it)

On failure, print: "⚠ Failed to comment — `<error>`." Continue to Step 8.

On `n`, continue silently.

## Step 8 — Report

Print this report. Omit lines that don't apply:

```
✓ Pushed <branch> to origin
✓ Opened PR #<id>: <PR URL>
✓ Moved <KEY> to "<new status>"
✓ Commented on <KEY> with PR link

Ticket: <KEY> — <summary>
PR: <PR URL>
Base: <base>

You're done — ping reviewers when ready.
```

For each declined or skipped action, add a transparency line:

```
- Skipped Jira transition (you answered no)
- Skipped Jira comment (you said "skip the comment")
```

## Operator notes

- **Never** merge, approve, close the PR, or close the ticket. Those are post-review actions, separate concern
- **Never** mutate Jira without explicit consent — pre-authorization in `$ARGUMENTS` or `y` to a named per-action prompt
- PR creation is the one side-effect that's confirmed even when other actions are pre-authorized
- If any non-fatal step fails (transition, comment), continue with the rest. The PR is the load-bearing deliverable
- The user's `$ARGUMENTS` always wins over defaults
