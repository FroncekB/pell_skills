---
description: Compose ticket-to-implementation in one command. Fetches a Jira ticket, dispatches /pell:start-work to create a branch, then hands off to superpowers:brainstorming → writing-plans for the design and plan. When superpowers isn't installed, runs a lightweight inline substitute that produces a starter spec.
argument-hint: "<JIRA-KEY> [skip start-work | design only | plan only | start-work pre-auths | --reset] [freeform]"
---

You are running **`/pell:from-ticket`**. Sequence three pieces of existing machinery — `/pell:start-work`, `superpowers:brainstorming`, `superpowers:writing-plans` — into one ticket-to-plan workflow. `from-ticket` itself does no design work; it parses args, gathers context, detects existing artifacts, and dispatches each stage with the right inputs.

The user passed: `$ARGUMENTS`

## Step 1 — Parse arguments

Extract from `$ARGUMENTS` (all matches independent; freeform-first):

- **Jira key** (required) — first match for `[A-Z][A-Z0-9]+-\d+`. If none, exit with: "I need a Jira key, e.g. `/pell:from-ticket RRS-1020`."
- **Skip flags** (case-insensitive):
  - `skip start-work` / `branch ready` / `already on branch` → skip Stage 4
  - `design only` / `skip plan` / `no plan` → after Stage 5, instruct brainstorming not to chain into writing-plans
  - `plan only` / `skip brainstorm` / `skip design` → skip brainstorming; dispatch writing-plans directly. Requires an existing spec for `<KEY>`; otherwise error: "plan only requires an existing spec for `<KEY>`."
- **Pre-auths forwarded verbatim to `/pell:start-work`** (do NOT reinterpret; capture the matched substrings to append to the start-work invocation):
  - `assign to me`, `assign me`
  - `move it to <status>`, `transition to <status>`, `move to <status>`
  - `don't touch jira`, `skip jira`, `no jira changes`
  - `call it <slug>`, `name it <slug>`, `branch <slug>`
- **`--reset` flag** — clears artifacts for this ticket key (handled in Step 3).

**Conflict rules:**
- `skip start-work` + `plan only` is valid (resume-from-spec workflow).
- `design only` + `plan only` is an error: "Pick one — design only or plan only, not both."
- Unrecognized text passes through as informational context. It does NOT affect control flow at the from-ticket layer; brainstorming sees it as additional seed context.

Extract `projectKey` from the Jira key (everything before the `-`).

## Step 2 — Fetch ticket + related

**Resolve `cloudId`:**

Read `~/.claude/pell-config.json` (treat missing as `{}`).
- If `jira.cloud_id` is set, use it.
- Otherwise call `mcp__plugin_atlassian_atlassian__getAccessibleAtlassianResources`, use the first result's `id`, atomically write it back to `pell-config.json:jira.cloud_id`.

**Run the two MCP calls in parallel:**

1. `mcp__plugin_atlassian_atlassian__getJiraIssue` with:
   - `cloudId`
   - `issueIdOrKey`: `<KEY>`
   - `fields`: `["summary", "description", "status", "issuetype", "priority", "assignee", "reporter", "labels", "issuelinks", "subtasks", "parent"]`
   - `responseContentFormat`: `"markdown"`

2. `mcp__plugin_atlassian_atlassian__getJiraIssueRemoteIssueLinks` with `cloudId` and `issueIdOrKey: <KEY>`.

**Failure handling:**
- Ticket 404 → exit: "`<KEY>` doesn't exist in Jira (or you don't have access)."
- Ticket MCP unreachable → exit: "Jira MCP isn't responding — see the README prerequisites."
- Remote-links 404 or empty → continue silently; render `(no external links)` in the seed.
- Remote-links other failure → continue; render `(remote links unavailable — <error>)` in the seed.

**Capture for later stages:**
- `summary`, `description` (full markdown, no truncation)
- `status.name`, `issuetype.name`, `priority.name`, `labels`
- `assignee.displayName` (default `"unassigned"`), `reporter.displayName` (default `"unknown"` — Atlassian MCP sometimes omits this even when requested)
- `parent` (key + summary + status), `subtasks` (key + summary + status list), `issuelinks` (relationship + key + summary + status list)
- Remote links (title + url + application.name)

After the fetch, print one line: `Loaded <KEY> — <summary> (status: <status>, type: <type>).`

## Step 3 — Existing-artifact detection

Glob for prior artifacts in the working directory:

```bash
ls docs/superpowers/specs/<KEY>-*.md 2>/dev/null
ls docs/superpowers/plans/<KEY>-*.md 2>/dev/null
```

If `docs/superpowers/` doesn't exist, treat as "no artifacts found."

**If `--reset` was passed:** enumerate all matched files, then ask once:

> Remove N existing artifacts for `<KEY>`?
> - `<path1>`
> - `<path2>`
> (y/n)

On `y`, delete all listed files and proceed as Fresh below. On `n`, exit cleanly.

**Otherwise, branch on what was found:**

| Specs | Plans | Behavior |
|-|-|-|
| 0 | 0 | Fresh — proceed through all stages normally |
| ≥1 | 0 | Prompt: "Design spec exists for `<KEY>`: `<path>`. Pick one: (1) resume — skip brainstorming, dispatch writing-plans against this spec; (2) rewrite — `--reset` and start fresh; (3) cancel." |
| 0 | ≥1 | Prompt: "Plan file exists for `<KEY>` without a matching spec: `<path>`. Pick one: (1) open the plan in your editor and proceed manually; (2) rewrite — `--reset` and start fresh; (3) cancel." Don't auto-dispatch — anomalous state. |
| ≥1 | ≥1 | Prompt: "Both spec and plan exist for `<KEY>`:\n  spec: `<spec path>`\n  plan: `<plan path>`\nPick one: (1) open both — work is done; (2) rewrite — `--reset` and start fresh; (3) cancel." |

**Multiple files in either category:** list all paths, then ask the user which to use via numbered prompt. Don't pick the newest automatically — multiple files usually indicates a prior abort needing cleanup attention.

**Skip-flag interactions:**
- `plan only` + spec found → silently resume (this is exactly what plan-only means).
- `plan only` + no spec found → error per Step 1.
- `design only` + spec found → ignore the existing spec, run brainstorming fresh. Brainstorming writes a new spec file with a different timestamp suffix.

**Resume implies "skip start-work":** when the user picks option (1) for any non-fresh state, treat it as if `skip start-work` was also passed. The assumption is they're already on a `<KEY>-*` branch. If they aren't, they can re-invoke `/pell:from-ticket <KEY>` without resuming to get the branch created.

**Rewrite option (2):** sets the `--reset` flag inline and re-enters Step 3 from the top.
