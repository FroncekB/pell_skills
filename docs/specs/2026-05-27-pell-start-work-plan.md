# `/pell:start-work` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `/pell:start-work <KEY>` — a single Claude Code slash command that fetches a Jira ticket, optionally creates a properly-named local branch, and (only on explicit user consent or inline pre-authorization) assigns the ticket / transitions its status.

**Architecture:** Single command file at `plugins/pell/commands/start-work.md` (~120-140 lines of prompt content). No new agents or skills. Reads/writes `~/.claude/pell-config.json` for cached cloud_id and per-project transition selections. Uses Atlassian Jira MCP for ticket data and side-effects; uses Bash for local git operations.

**Tech Stack:**
- Plugin manifest: `plugins/pell/.claude-plugin/plugin.json` (already at v0.2.0; bumps to v0.3.0 when this lands)
- Command file: markdown with YAML frontmatter (`description`, `argument-hint`)
- MCPs: `plugin:atlassian:atlassian` (Jira)
- Shared config: `~/.claude/pell-config.json`
- Validation: `claude plugin validate ./plugins/pell`

**Source spec:** [`2026-05-27-pell-start-work-design.md`](2026-05-27-pell-start-work-design.md). All design decisions are locked there — this plan implements them, it does not relitigate them.

**Patterns to mirror:**
- `plugins/pell/commands/three-pass-review.md` — MCP orchestration, freeform argument parsing
- `plugins/pell/commands/local-review.md` — read-only-by-default style, per-action confirmation prompts

**File structure (single file modification):**
- Create: `plugins/pell/commands/start-work.md`
- Modify: `plugins/pell/.claude-plugin/plugin.json` (version bump)
- Modify: `docs/specs/2026-05-27-pell-skills-architecture.md` (drop vestigial `gitflow` config section per spec §5)
- Modify: `README.md` (remove `start-work` from "Coming soon", add to "Commands reference")
- Modify: `CLAUDE.md` (no changes — conventions already cover this command shape)

---

## Task 1: Scaffold the command file with frontmatter + Step 1 (argument parsing)

**Files:**
- Create: `plugins/pell/commands/start-work.md`

This task establishes the command exists and has its argument-parsing section. After this, `claude plugin validate` should pass and the command should appear in the plugin's command list, even though invoking it would stop after Step 1.

- [ ] **Step 1: Create the command file with frontmatter + intro + Step 1 content**

Write to `plugins/pell/commands/start-work.md`:

````markdown
---
description: Fetch a Jira ticket, create a properly-named local branch, and (only on explicit consent) assign or transition the ticket. Read-only against Jira by default — side-effects are opt-in per action or pre-authorized inline ("assign to me", "move it to in-progress").
argument-hint: <JIRA-KEY> [freeform context]
---

You are running **`/pell:start-work`**. Execute the steps below in order. Default behavior is read-only against Jira; side-effects fire only when the user pre-authorizes inline or answers `y` to a named per-action prompt.

The user passed: `$ARGUMENTS`

## Step 1 — Parse arguments

Extract from `$ARGUMENTS`:

- **Jira key** (required) — first match for `[A-Z][A-Z0-9]+-\d+`. If none, exit with: "I need a Jira key, e.g. `/pell:start-work RRS-1020`. (Listing your assigned tickets will live in `/pell:my-tickets` once that's built.)"
- **Branch description override** — phrases like `call it <slug>`, `name it <slug>`, `branch <slug>`. Capture the slug verbatim — preserve the casing and hyphenation the user typed.
- **Jira pre-authorizations** (each independent) — `assign to me` / `assign me` / `move it to <status>` / `transition to <status>` / `move to <status>`.
- **Jira decline** — `don't touch jira` / `skip jira` / `no jira changes`. Suppresses both side-effect prompts in Step 5.
- **`--reset` flag** — clears the cached "start" transition for this project before Step 5b.

The rest of `$ARGUMENTS` is informational context (e.g. "this is urgent") — let it color tone but don't let it drive control flow.

Extract `projectKey` from the Jira key (everything before the `-`).
````

- [ ] **Step 2: Validate the plugin manifest**

Run: `claude plugin validate ./plugins/pell`
Expected: `✔ Validation passed` (the existing version warning may also appear — that's fine; we bump version in Task 8).

- [ ] **Step 3: Commit**

```bash
git add plugins/pell/commands/start-work.md
git commit -m "feat(start-work): scaffold command with frontmatter and arg parsing"
```

---

## Task 2: Add Step 2 (fetch ticket + resolve cloud_id)

**Files:**
- Modify: `plugins/pell/commands/start-work.md` (append section)

After this task, the command knows how to look up the Jira ticket. Still no side-effects possible.

- [ ] **Step 1: Append Step 2 section to the command file**

Edit `plugins/pell/commands/start-work.md`. The current file ends with:

```
Extract `projectKey` from the Jira key (everything before the `-`).
```

Append immediately after that line:

````markdown

## Step 2 — Fetch the Jira ticket

**Resolve `cloudId`:**

Read `~/.claude/pell-config.json` (use the Read tool; if the file doesn't exist, treat it as empty config `{}`).

- If `jira.cloud_id` is set in the config, use it
- Otherwise, call `mcp__plugin_atlassian_atlassian__getAccessibleAtlassianResources`. Use the first result's `id` as `cloudId`. Then atomically write it back:
  1. Re-read the config (or use the empty `{}` if it didn't exist)
  2. Set `jira.cloud_id = <cloudId>`
  3. Write the merged JSON back to `~/.claude/pell-config.json`

`cloud_id` is an identifier, not a preference — caching it on first use is transparent, no prompt needed.

**Fetch the ticket:**

Call `mcp__plugin_atlassian_atlassian__getJiraIssue` with:
- `cloudId`: the resolved value above
- `issueIdOrKey`: the parsed `<KEY>`
- `responseContentFormat`: `"markdown"`

Capture these fields for later steps:
- `summary` (string)
- `issuetype.name` (string)
- `status.name` (string)
- `assignee.displayName` and `assignee.accountId` (may be null if unassigned)
- `description` (markdown — keep the first ~5 lines for the Step 6 summary)

If the call fails with "not found" or 404 → exit with: "Couldn't find `<KEY>`. Check the key and your Jira MCP connection."

If the MCP call fails for any other reason (connection, auth) → exit with: "Jira MCP isn't responding — see the README prerequisites and try `/mcp` to verify the connection."
````

- [ ] **Step 2: Validate**

Run: `claude plugin validate ./plugins/pell`
Expected: `✔ Validation passed`.

- [ ] **Step 3: Commit**

```bash
git add plugins/pell/commands/start-work.md
git commit -m "feat(start-work): add Jira ticket fetch and cloud_id caching"
```

---

## Task 3: Add Step 3 (pre-flight checks)

**Files:**
- Modify: `plugins/pell/commands/start-work.md` (append section)

After this task, the command can safely refuse to proceed when the working tree is dirty or we're not in a git repo, and it can detect existing branches for the same key.

- [ ] **Step 1: Append Step 3 section**

Edit `plugins/pell/commands/start-work.md`. The current file ends with:

```
If the MCP call fails for any other reason (connection, auth) → exit with: "Jira MCP isn't responding — see the README prerequisites and try `/mcp` to verify the connection."
```

Append immediately after that line:

````markdown

## Step 3 — Pre-flight checks

Run the three blocking checks first; abort on first failure. Then surface the two non-blocking warnings.

**Blocking:**

1. **In a git repo?** Run `git rev-parse --show-toplevel`. If the command fails (non-zero exit), exit with: "I need to be in a git checkout to create a branch. `cd` to the target repo and re-run."

2. **Working tree clean?** Run `git status --porcelain`. If the output is non-empty, exit with: "You have uncommitted changes. Stash, commit, or reset, then re-run." Do NOT auto-stash.

3. **Branch already exists for this key?** Run `git branch --list "<KEY>-*"`. If any branches match, ask:

   > A branch for `<KEY>` already exists: `<existing-branch>`. Switch to it instead of creating a new one? (y/n)

   - `y` → run `git checkout <existing-branch>`, then skip to Step 5
   - `n` → continue to Step 4 (the user accepts that they'll have two branches for this ticket)

**Resolve current user identity (for warnings + Step 5a):**

Call `mcp__plugin_atlassian_atlassian__atlassianUserInfo`. Capture `accountId` and `displayName`. Hold this in session memory — do NOT write it to `pell-config.json`. Identity is not a preference and the file may be shared across projects.

**Non-blocking warnings — surface and continue:**

- If `assignee.accountId` is set and != current user's `accountId`, print: "Heads up: this ticket is assigned to `<assignee.displayName>`."
- If `pell-config.json:jira.transitions[<projectKey>].start` is set AND `status.name` matches it (case-insensitive), print: "Ticket is already in `<status.name>`."
````

- [ ] **Step 2: Validate**

Run: `claude plugin validate ./plugins/pell`
Expected: `✔ Validation passed`.

- [ ] **Step 3: Commit**

```bash
git add plugins/pell/commands/start-work.md
git commit -m "feat(start-work): add pre-flight checks (git state, existing branch, assignee warnings)"
```

---

## Task 4: Add Step 4 (branch derivation + creation)

**Files:**
- Modify: `plugins/pell/commands/start-work.md` (append section)

After this task, the command can derive a branch name from the ticket summary, accept user overrides (inline or interactive), and create the branch via `git checkout -b`. The Jira side-effects are still unreachable.

- [ ] **Step 1: Append Step 4 section**

Edit `plugins/pell/commands/start-work.md`. The current file ends with:

```
- If `pell-config.json:jira.transitions[<projectKey>].start` is set AND `status.name` matches it (case-insensitive), print: "Ticket is already in `<status.name>`."
```

Append immediately after that line:

````markdown

## Step 4 — Confirm and create the branch

**Derive the suggested description from the ticket summary:**

1. Start with `summary` from Step 2
2. Strip any leading `[<KEY>]` prefix Jira sometimes embeds (regex: `^\[?<KEY>\]?\s*[:\-]?\s*`)
3. Replace whitespace and punctuation runs with `-`
4. Split on `-`, take the first 5 tokens, rejoin with `-`. Also apply a 40-char soft cap: if the joined result exceeds 40 chars, drop tokens from the end until it fits (keep at least 2 tokens)
5. Preserve the summary's original casing — Pell convention is sentence-case-with-hyphens (e.g. `Fixing-broken-item`), not lowercase-kebab-case
6. Trim leading/trailing hyphens

Worked example: `"Cart fails to update item quantity"` → tokens `Cart`, `fails`, `to`, `update`, `item` → `Cart-fails-to-update-item` → final branch `<KEY>-Cart-fails-to-update-item`.

**Confirm the branch name:**

If the user pre-authorized a branch description inline (`call it <slug>`, `name it <slug>`, `branch <slug>`), use that slug verbatim as the description; skip the prompt.

Otherwise, print:

> Ticket: `<KEY> — <summary>` (status: `<status.name>`, type: `<issuetype.name>`)
>
> Suggested branch: `<KEY>-<derived-description>`
>
> Press Enter to accept, type a different description (e.g. `Fixing-cart`), or `n` to cancel.

- Empty response → accept the suggestion
- Any non-`n` text → use that as the description verbatim (don't re-derive)
- `n` → exit cleanly: "Cancelled. No branch created, no Jira changes made."

**Create the branch:**

Run `git checkout -b <KEY>-<description>`. The base is wherever the user is now — don't switch to `develop` or `main` first.

If `git checkout -b` fails (e.g. invalid branch name, branch already exists despite the Step 3 check having said otherwise), surface the git error verbatim and exit. Do NOT proceed to Step 5 — branch creation is the gating prerequisite for the Jira side-effects.
````

- [ ] **Step 2: Validate**

Run: `claude plugin validate ./plugins/pell`
Expected: `✔ Validation passed`.

- [ ] **Step 3: Commit**

```bash
git add plugins/pell/commands/start-work.md
git commit -m "feat(start-work): derive branch name from Jira summary and create branch"
```

---

## Task 5: Add Step 5a (Jira assignment opt-in)

**Files:**
- Modify: `plugins/pell/commands/start-work.md` (append section)

After this task, the command can optionally assign the ticket to the current user — but only on inline pre-authorization or per-action `y` answer. Read-only by default.

- [ ] **Step 1: Append Step 5a section**

Edit `plugins/pell/commands/start-work.md`. The current file ends with:

```
If `git checkout -b` fails (e.g. invalid branch name, branch already exists despite the Step 3 check having said otherwise), surface the git error verbatim and exit. Do NOT proceed to Step 5 — branch creation is the gating prerequisite for the Jira side-effects.
```

Append immediately after that line:

````markdown

## Step 5 — Jira side-effects (opt-in, one at a time)

If the user typed `don't touch jira`, `skip jira`, or `no jira changes` in `$ARGUMENTS`, skip this entire step. Do NOT prompt for either action.

Otherwise, run 5a and 5b in order. Each is independent — `n` on 5a does not skip 5b.

### Step 5a — Assignment

Skip this sub-step entirely if `assignee.accountId` (from Step 2) equals the current user's `accountId` (from Step 3). The ticket is already yours.

If the user pre-authorized inline (`assign to me`, `assign me`) → call the assign MCP directly without prompting.

Otherwise, ask:

> Want me to assign `<KEY>` to you?

On `y`, call `mcp__plugin_atlassian_atlassian__editJiraIssue` with:
- `cloudId`: from Step 2
- `issueIdOrKey`: `<KEY>`
- `fields`: `{"assignee": {"accountId": "<current user accountId>"}}`

On failure, print a single line: "⚠ Failed to assign — `<error message>`." and continue to Step 5b. Do NOT roll back the branch.

On `n`, continue to Step 5b silently.
````

- [ ] **Step 2: Validate**

Run: `claude plugin validate ./plugins/pell`
Expected: `✔ Validation passed`.

- [ ] **Step 3: Commit**

```bash
git add plugins/pell/commands/start-work.md
git commit -m "feat(start-work): add opt-in Jira assignment with inline pre-authorization"
```

---

## Task 6: Add Step 5b (transition discovery + opt-in transition)

**Files:**
- Modify: `plugins/pell/commands/start-work.md` (append section)

This is the most intricate sub-step. After this task, the command can discover available transitions for a project on first use, cache the user's selection, and apply the transition with explicit consent.

- [ ] **Step 1: Append Step 5b section**

Edit `plugins/pell/commands/start-work.md`. The current file ends with:

```
On `n`, continue to Step 5b silently.
```

Append immediately after that line:

````markdown

### Step 5b — Status transition

**Discover the "start" transition for this project:**

If `$ARGUMENTS` contained `--reset`, clear `pell-config.json:jira.transitions[<projectKey>].start` (read config, delete the key, write back) before continuing.

Look up `pell-config.json:jira.transitions[<projectKey>].start`:

- **Cached and the ticket's current `status.name` matches it (case-insensitive)** → skip Step 5b entirely. Nothing to do; the ticket is already in the start status. Print one line: "Ticket already in `<status.name>` — skipping transition."

- **Cached but the ticket is NOT in that status** → use the cached transition name. Skip discovery.

- **Not cached** → run discovery:
  1. Call `mcp__plugin_atlassian_atlassian__getTransitionsForJiraIssue` with `cloudId` and `issueIdOrKey: <KEY>`. Capture the list of `{id, name}` objects from the response
  2. Filter out names that match (case-insensitive) any of: `done`, `closed`, `resolved`, `won't do`, `wont do`, `cancelled`, `canceled`, `rejected`. These are never "start" candidates
  3. If 0 candidates remain → exit with: "No 'start' transitions available for `<KEY>`. Available transitions: `<comma-separated list of all names from the unfiltered response>`. Pass one explicitly with `move it to <name>` to bypass discovery."
  4. If exactly 1 candidate remains → use it. Ask:
     > Use `<name>` as the 'start work' transition for `<projectKey>` going forward? (y/n)

     On `y`, write the selection to config (`jira.transitions.<projectKey>.start = "<name>"`, atomic read-modify-write). On `n`, use the transition for this invocation but do NOT cache.
  5. If 2+ candidates remain → render a numbered list and ask:
     > Which of these means 'start work' for `<projectKey>`?
     > 1. `<name1>`
     > 2. `<name2>`
     > ...

     User picks a number. Write the selection to config (always cache here — multi-option means the user made a deliberate choice).

**If the user pre-authorized `move it to <status>` (or `move to <status>` / `transition to <status>`) inline:**

Resolve the target by matching `<status>` (case-insensitive) against the candidate names from discovery (or against the cached selection if cached):

- Exactly one match → use it as the chosen transition, skip the per-action prompt below. Cache the match if not already cached.
- Zero or multiple matches → fall back to the discovery flow above.

**Apply the transition:**

If the user pre-authorized inline, run the transition without prompting. Otherwise ask:

> Want me to move `<KEY>` to `<chosen transition name>`?

On `y`, call `mcp__plugin_atlassian_atlassian__transitionJiraIssue` with:
- `cloudId`: from Step 2
- `issueIdOrKey`: `<KEY>`
- `transition`: the `{id}` object from the candidate (you must pass the ID, not the name)

On failure, print a single line: "⚠ Failed to transition — `<error message>`." and continue to Step 6. Do NOT roll back the branch or the assignment.

On `n`, continue to Step 6 silently.
````

- [ ] **Step 2: Validate**

Run: `claude plugin validate ./plugins/pell`
Expected: `✔ Validation passed`.

- [ ] **Step 3: Commit**

```bash
git add plugins/pell/commands/start-work.md
git commit -m "feat(start-work): add transition discovery, caching, and opt-in status transition"
```

---

## Task 7: Add Step 6 (final report)

**Files:**
- Modify: `plugins/pell/commands/start-work.md` (append section)

After this task, the command produces a unified summary so the engineer knows exactly what happened — what changed, what was skipped, and what the ticket says.

- [ ] **Step 1: Append Step 6 section**

Edit `plugins/pell/commands/start-work.md`. The current file ends with:

```
On `n`, continue to Step 6 silently.
```

Append immediately after that line:

````markdown

## Step 6 — Report

Print this report. Replace bracketed placeholders with the actual values; omit lines that don't apply (e.g. skip the "Assigned" line if assignment was skipped or declined).

```
✓ On branch `<new branch>` (created from `<base branch from `git rev-parse --abbrev-ref HEAD@{1}` if available, else "current branch">`)
✓ Assigned <KEY> to you
✓ Moved <KEY> to "<new status>"

Ticket: <KEY> — <summary>
Type: <issuetype.name>   Status: <new status, or original if no transition happened>

Description:
<first ~5 lines of description, truncated with "…" if longer>

You're ready to start.
```

If the user declined any Jira action, add a single transparency line for each skip:

```
- Skipped Jira assignment (you answered no)
- Skipped Jira transition (you said "don't touch jira")
```

Use the second phrasing only if `don't touch jira` was the trigger; otherwise say "(you answered no)".

## Operator notes

- **Never** push, commit, post comments, open PRs, or stash. None of those are in scope for this command
- **Never** mutate Jira without explicit consent — either pre-authorization in `$ARGUMENTS` or a `y` answer to a named per-action prompt
- If any non-fatal step fails (Jira assignment, Jira transition, summary truncation), continue with the next step. The branch is the load-bearing deliverable; Jira changes are convenience
- The user's `$ARGUMENTS` always wins over defaults. If they typed something this command doesn't explicitly handle, interpret it naturally
````

- [ ] **Step 2: Validate**

Run: `claude plugin validate ./plugins/pell`
Expected: `✔ Validation passed`.

- [ ] **Step 3: Verify command body length**

Run: `wc -l plugins/pell/commands/start-work.md`
Expected: between 120 and 160 lines. The spec target was 120-140; up to 160 is acceptable.

- [ ] **Step 4: Commit**

```bash
git add plugins/pell/commands/start-work.md
git commit -m "feat(start-work): add final report and operator notes"
```

---

## Task 8: Update docs (architecture spec, README, plugin version)

**Files:**
- Modify: `docs/specs/2026-05-27-pell-skills-architecture.md` (drop vestigial `gitflow` section per design spec §5)
- Modify: `README.md` (move `start-work` from "Coming soon" to "Commands reference")
- Modify: `plugins/pell/.claude-plugin/plugin.json` (bump to v0.3.0)

After this task, all documentation reflects the new command and the obsolete `gitflow` schema is gone.

- [ ] **Step 1: Update the architecture spec — drop the `gitflow` block from the JSON schema sketch**

Edit `docs/specs/2026-05-27-pell-skills-architecture.md`. Find the block:

```json
  "gitflow": {
    "feature_prefix": "feature/",
    "bugfix_prefix": "bugfix/",
    "hotfix_prefix": "hotfix/"
  }
```

Remove the entire `gitflow` key including its preceding comma. The resulting `pell-config.json` schema sketch should end after the `bitbucket` block.

Also: the line above the schema ends with a trailing comma on the `bitbucket` block — adjust that comma to be a non-trailing one (drop it) since `bitbucket` is now the last key.

Add a one-line note immediately under the schema block:

> Note: branch names are flat (`<KEY>-<description>`, no GitFlow prefix) — confirmed during `/pell:start-work` design. See [`2026-05-27-pell-start-work-design.md`](2026-05-27-pell-start-work-design.md) §5.

- [ ] **Step 2: Update README — add `start-work` to "Commands reference"**

Edit `README.md`. Find the line:

```
### `/pell:local-review`
```

Insert this entire block immediately before it (with a blank line separator):

```markdown
### `/pell:start-work <KEY>`

Fetch a Jira ticket, create a properly-named local branch (`<KEY>-<sentence-case-description>`), and optionally assign / transition the ticket. Read-only against Jira by default — side-effects only fire when you pre-authorize inline or answer `y` to a named per-action prompt.

**Usage:**

```
/pell:start-work RRS-1020
/pell:start-work RRS-1020 call it Fixing-cart-bug          # override the derived description
/pell:start-work RRS-1020 assign to me                     # pre-authorize assignment
/pell:start-work RRS-1020 yeah move it to in-progress      # pre-authorize transition
/pell:start-work RRS-1020 assign to me and move to in-progress
/pell:start-work RRS-1020 don't touch jira                 # branch only, no Jira side-effects
/pell:start-work RRS-1020 --reset                          # re-prompt cached transition for this project
```

**Behavior:**

1. Parses `<KEY>` and any inline pre-authorizations from `$ARGUMENTS`
2. Fetches the ticket via the Atlassian Jira MCP (cloud_id cached transparently on first use)
3. Pre-flight: aborts if not in a git repo or the working tree is dirty; offers to switch to an existing branch for the same key
4. Derives a sentence-case-with-hyphens description from the Jira summary; asks you to accept, override, or cancel
5. `git checkout -b <KEY>-<description>` from your current branch (no base switching)
6. Optionally assigns and transitions the ticket — each as its own `y/n` prompt with the specific status name, or pre-authorized inline
7. Reports what changed

**Side-effects:** branch creation requires confirmation; Jira changes are strictly opt-in. Never commits, pushes, or opens a PR.

```

(That's the entire block to insert. Note the closing triple-backtick at the very end belongs to the inserted markdown.)

- [ ] **Step 3: Update README — remove `start-work` from "Coming soon"**

Edit `README.md`. Find the line:

```
- **Jira workflow ops:** `start-work`, `triage`, `related`, `finish-work` — adaptive to per-project Jira transition workflows
```

Replace with:

```
- **Jira workflow ops:** `triage`, `related`, `finish-work`, `my-tickets` — adaptive to per-project Jira transition workflows
```

(`start-work` removed, `my-tickets` added per spec §7 forward-looking note.)

- [ ] **Step 4: Bump plugin version**

Edit `plugins/pell/.claude-plugin/plugin.json`. Change:

```json
  "version": "0.2.0",
```

to:

```json
  "version": "0.3.0",
```

- [ ] **Step 5: Validate**

Run: `claude plugin validate ./plugins/pell`
Expected: `✔ Validation passed` with no warnings (the version warning should be gone now that version is bumped).

- [ ] **Step 6: Commit**

```bash
git add docs/specs/2026-05-27-pell-skills-architecture.md README.md plugins/pell/.claude-plugin/plugin.json
git commit -m "docs: document /pell:start-work in README, drop vestigial gitflow config, bump to v0.3.0"
```

---

## Task 9: Manual smoke test against a real Jira ticket

**Files:** none (verification only)

After this task, we've confirmed the command works end-to-end with a real ticket. There's no automated test harness for slash commands — this is the verification gate.

- [ ] **Step 1: Reload the plugin in this session**

In a Claude Code session at the repo root, run:

```
/plugin marketplace update pell-skills
/reload-plugins
```

Expected output mentions `pell` plugin reloaded and the new command count reflects `start-work`. If the command doesn't appear, re-run validate and check the file landed correctly.

- [ ] **Step 2: Smoke test against a real Pell ticket (read-only path)**

In a fresh Claude Code session inside a Pell repo (e.g. `~/repos/vrs_default` or wherever you have a Pell checkout), run:

```
/pell:start-work <a real Jira key you can transition> don't touch jira
```

Expected behavior:
1. Fetches the ticket via Jira MCP
2. Reports any pre-flight warnings (existing branch, assignee mismatch)
3. Shows the derived branch name and asks for confirmation
4. After `y`, creates the branch with `git checkout -b`
5. Skips Step 5 entirely (because of `don't touch jira`)
6. Prints the report with a transparency line about skipping Jira

After: run `git branch --show-current` — should be the new branch. Run `git checkout -` to get back to where you were, then `git branch -D <new branch>` to clean up.

- [ ] **Step 3: Smoke test with Jira side-effects (full path)**

In a fresh session (preferably against a sandbox/test ticket, not a real in-progress one), run:

```
/pell:start-work <test ticket key> assign to me and move to in-progress
```

Expected behavior:
1. Same fetch + pre-flight + branch creation as before
2. Step 5a: assigns the ticket without prompting (pre-authorized)
3. Step 5b: discovers transitions (first-time-per-project), shows the candidate list if there are multiple, picks `In Progress` via the inline pre-authorization match, applies it without prompting
4. Final report shows ✓ for branch, assignment, and transition

After: verify in Jira that the ticket is assigned to you and in the expected status. Clean up the branch.

- [ ] **Step 4: Smoke test for `--reset` flag**

Re-run the same command but with `--reset`:

```
/pell:start-work <test ticket key> --reset assign to me and move to in-progress
```

Expected behavior: re-prompts for transition discovery (since cache was cleared), then proceeds. Useful to confirm the `--reset` plumbing works.

- [ ] **Step 5: Document any defects found**

If anything misbehaves, open an issue (`gh issue create`) with:
- The exact `$ARGUMENTS` you passed
- The full assistant output up to the misbehavior
- What you expected vs. what happened

Then return to the failing task in this plan and revise. Don't proceed to push until the smoke tests pass on the happy paths.

- [ ] **Step 6: Push**

Once smoke tests pass:

```bash
git push origin main
```

(Or follow Pell's PR-based flow if `pell_skills` has moved off direct-to-main pushes by the time this runs.)

---

## Spec coverage self-check

Cross-referencing tasks against the spec sections:

| Spec section | Implemented in |
|-|-|
| §2 Invocation shape (args, --reset, freeform) | Task 1 |
| §3 Step 1 Parse arguments | Task 1 |
| §3 Step 2 Fetch ticket (incl. cloud_id) | Task 2 |
| §3 Step 3 Pre-flight (git checks, existing branch, warnings) | Task 3 |
| §3 Step 4 Branch derivation + creation | Task 4 |
| §3 Step 5a Assignment opt-in | Task 5 |
| §3 Step 5b Transition discovery, caching, opt-in | Task 6 |
| §3 Step 6 Report | Task 7 |
| §4 Side-effect matrix | Embedded in tasks 1-7 (each side-effect is named explicitly) |
| §5 Config-file changes | Task 8 (drop gitflow); Task 2 (cloud_id write); Task 6 (transition write) |
| §6 Error paths | Tasks 2, 3, 4, 5, 6 (each surfaces its own errors) |
| §7 Forward-looking notes | Task 8 adds `my-tickets` to the "Coming soon" list |
| §8 Implementation surface | All tasks combined produce the single command file |
| §9 Open follow-ups (architecture spec edit) | Task 8 |

No spec section is unimplemented. No placeholders remain.
