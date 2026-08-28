---
description: Place a Jira ticket in the whole project — builds and caches a synthesized Statement of Work from the project's epics and linked Confluence scope docs, then runs a Definition-of-Ready check on the ticket (description, acceptance criteria, epic fit, unlinked dependencies, sibling overlap). Offers a gated comment listing questions for the reporter. Run with a bare project key to see the project picture.
argument-hint: "[JIRA-KEY | PROJECT-KEY] [refresh | deep | skip comment | sow <confluence-url> | --dry-run | --verbose]"
---

You are running **`/pell:scope`**. Answer two questions about a ticket before anyone starts it: *where does it fit in the whole project?* and *does it have enough information to start?* Read-only against Jira and Confluence. The only writes are the SOW cache file in the repo and an optional Jira comment — each `(y/n)`-gated, both suppressed by `--dry-run`.

The user passed: `$ARGUMENTS`

## Step 1 — Parse arguments

Work through `$ARGUMENTS` in this order. Strip each recognized modifier as you capture it so the key search below sees only what is left.

**Modifiers** (case-insensitive):
- `refresh` → `refresh = true` (rebuild the SOW even if a fresh cache exists)
- `deep` → `deep = true` (lift the 10-page traversal cap)
- `skip comment` → `skip_comment = true`
- `sow <url>` → `pinned_sow_url = <url>` (capture the whole URL token; strip both words)
- `--dry-run` → `dry_run = true`
- `--verbose` → `verbose = true`
- `--reset` → accepted for convention; there is no cached config to clear beyond `jira.cloud_id`, which every Jira command shares. Print `Nothing to reset for /pell:scope.` and continue.

**Mode and keys**, from the remaining text:
1. First match of `\b[A-Z][A-Z0-9]+-\d+\b` → `mode = ticket`, `ticket_key = <match>`, `project_key = <text before the dash>`.
2. Otherwise first match of `\b[A-Z][A-Z0-9]+\b` → `mode = project`, `project_key = <match>`.
3. Otherwise run `git branch --show-current` and match the issue-key regex against it (Pell branches are `<KEY>-<description>`, e.g. `RRS-1020-fix-cart`). On a match, `mode = ticket` as in 1. If the command fails (not a repo, detached HEAD) or nothing matches, exit with: "I need a ticket or project key. Try `/pell:scope RRS-1020`, `/pell:scope RRS`, or run this from a branch named like `RRS-1020-...`."

An explicit key in `$ARGUMENTS` always wins over the branch-detected key.

## Step 2 — Resolve `cloudId`

Read `~/.claude/pell-config.json` (treat missing as `{}`).

- If `jira.cloud_id` is set, use it.
- Otherwise call `mcp__plugin_atlassian_atlassian__getAccessibleAtlassianResources`, use the first result's `id`, write it back atomically to `pell-config.json:jira.cloud_id`.

## Step 3 — Load or build the SOW cache

**Locate.** Run `git rev-parse --show-toplevel`. `sow_path = <toplevel>/docs/pell/sow-<project_key>.md`. If the command fails (not a git repo), use `./docs/pell/sow-<project_key>.md` and print `Not in a git repo — using ./docs/pell/ for the SOW cache.`

**Load.** If `sow_path` exists, read it and parse the YAML frontmatter for `generated_at` and `sow_sources`. If the frontmatter is missing or unparseable, print `SOW cache at <sow_path> has no readable frontmatter — rebuilding.` and treat the file as missing.

**Decide.** Rebuild when any of: the file is missing; `refresh` is set; `generated_at` is more than 14 days before now. Otherwise use the cache.

**Rebuild path.**
1. Print `Building the SOW for <project_key> — walking every issue in the project (up to 10 pages of 100<; cap lifted by "deep" when set>).`
2. Dispatch the `sow-builder` agent via the Agent tool with `subagent_type="sow-builder"` and a prompt containing these labeled lines:
   ```
   cloudId: <cloudId>
   project_key: <project_key>
   sow_sources: [<cached sow_sources, plus pinned_sow_url if set, comma-separated URLs; or empty list>]
   deep: <true|false>
   verbose: <true|false>
   ```
3. Parse the trailing JSON. If `sow_markdown` is empty, exit with `Could not build the SOW: <summary>.`
4. Print the stats line: `<stats.issues> issues · <stats.epics> epics · <stats.unparented> unparented · <stats.scope_docs> scope doc(s)<; truncated at 10 pages — rerun with "deep" for the full project, when stats.truncated>`.
5. Unless `dry_run`: prompt `Write the synthesized SOW to <sow_path>? (y/n)`. On `y`, create `docs/pell/` if needed and write `sow_markdown` to `sow_path`; print `Saved <sow_path>. Commit it with your normal workflow.` On `n`, print `Not saved — using the document for this run only.` When `dry_run`, print `--dry-run: SOW not written.`
6. `sow_doc = sow_markdown`; `drift_line = ""` (a fresh build has no drift).

**Cached path.**
1. `sow_doc` = file contents.
2. Run one drift query: `mcp__plugin_atlassian_atlassian__searchJiraIssuesUsingJql` with `cloudId`, `jql`: `project = "<project_key>" AND updated >= "<generated_at formatted yyyy-MM-dd HH:mm>"`, `fields: ["key"]`, `maxResults: 100`.
3. `drift_line` = `SOW cache is <n> day(s) old; <count> ticket(s) changed since. Say "refresh" to rebuild.` Use `100+` for the count when the response has a `nextPageToken` or returns 100 results. If the query fails: `SOW cache is <n> day(s) old; drift check failed: <error>.` Never abort over drift.

If `mode = project`, skip to Step 7.
