---
description: Map a repo's Jira, Confluence, Drive, and Bitbucket coordinates into a committed docs/pell/context.md so every session stops re-deriving them, and optionally build the project SOW at setup time. Read-only against every remote system; all writes are local and gated.
argument-hint: "[refresh | verify | with sow | skip sow | PROJECT-KEY | <url> | --dry-run | --verbose]"
---

You are running **`/pell:map-repo`**. It walks this repo's Jira, Confluence, Drive, and Bitbucket coordinates and writes them to a committed `docs/pell/context.md`, so future sessions stop re-deriving them. Read-only against Jira, Confluence, Drive, and Bitbucket — every write is local and `(y/n)`-gated, and this command never commits.

The user passed: `$ARGUMENTS`

## Step 1 — Parse arguments

Work through `$ARGUMENTS` in this order, stripping each recognized token as you go so the later matches only see what's left.

1. **Modifiers** (case-insensitive): `refresh`, `verify`, `with sow`, `skip sow`, `--dry-run`, `--verbose`, `--reset`.
   - `refresh` → `refresh = true` (full rebuild even when a current file exists).
   - `verify` → `verify = true` (cheap drift re-check only; no full walk).
   - `refresh` and `verify` are mutually exclusive. If both appear, `refresh` wins — print `Both "refresh" and "verify" were given — refresh wins; doing a full rebuild.` and continue with `verify = false`.
   - `with sow` → `with_sow = true` (build the SOW for every discovered project without the per-project prompt).
   - `skip sow` → `skip_sow = true` (suppress the SOW offer entirely).
   - `with sow` and `skip sow` are mutually exclusive. If both appear, `skip sow` wins — it's the conservative reading, since it's the one that cannot cost three unwanted minutes. Print `Both "with sow" and "skip sow" were given — skip sow wins; the SOW offer will be suppressed.` and continue with `with_sow = false`.
   - `--dry-run` → `dry_run = true` (render everything; write nothing).
   - `--verbose` → `verbose = true` (show the agent's per-source findings and confidence reasoning).
   - `--reset` → accepted for convention only; `/pell:map-repo` has no cached config of its own to clear. Print `Nothing to reset for /pell:map-repo.` and continue.
2. Any `https://` token → append to `seed_urls[]`.
3. Any remaining match of `\b[A-Z][A-Z0-9]+\b` that is not a recognized modifier → append to `seed_project_keys[]`.
4. Whatever prose remains is context for the `repo-mapper` prompt, not a directive — pass it through as-is, don't parse it further.

## Step 2 — Locate and load

Run `git rev-parse --show-toplevel`. If it fails, exit — this is the only fatal case in this command:

> Not in a git repository. `/pell:map-repo` maps a repo's coordinates, so run it from inside one.

`repo_root` = the toplevel path. `context_path` = `<repo_root>/docs/pell/context.md`.

If `context_path` does not exist, treat it as missing and continue to Step 3.

If it exists, parse its YAML frontmatter for `schema`, `generated_at`, and `repo`:

- **Unparseable or missing frontmatter** → print `context.md has no readable frontmatter — rebuilding.` and treat the file as missing. Continue to Step 3.
- **`schema` newer than the schema this build writes (1)** → print `context.md is schema <n>; this build writes schema 1 — rebuilding.` and treat the file as missing. Continue to Step 3.
- **Valid** →
  - `refresh` set → rebuild regardless of age; continue to Step 3.
  - `verify` set → skip the rebuild prompt below. `verify` is a cheap drift re-check, not a rebuild — it never reaches Step 3 or Step 4.
  - Neither set → print the existing file's summary, in the same shape the post-write render uses, headed with its age instead of "Mapped":

    ```
    context.md — mapped <n> days ago.

    Repository   <workspace>/<slug> · base <base_branch> · <ci>
    Atlassian    <site>
    Jira         <KEY> (<name>) — <n> issue types, <n> components, <n> active epics
                 transitions: start "<start>" · done "<done>" · in_review <value or "unverified">
    Confluence   <space_key> — <n> canonical pages
    Drive        <n> folders (<label>, <label>, ...)
    Gaps         <n> — see the file

    Say "refresh" to rebuild, or "verify" to check it for drift.
    ```

    Then prompt:

    > `context.md` was mapped `<n>` days ago. Rebuild it? (y/n)

    On `n`, exit without changes. On `y`, continue to Step 3.

There is deliberately **no expiry threshold** on `context.md`. Coordinates don't rot on a fixed clock the way a synthesized SOW does, and no single cheap query detects drift across four independent systems at once. Staleness is handled by surfacing the age on every read and by the explicit `verify` mode, not by a timer that cries wolf — that's also why the 14-day staleness rule stays with `/pell:scope` alone and isn't reused here.

## Step 3 — Dispatch `repo-mapper`

Skip this step and Step 4 when `verify` is set (see Step 2) — `verify` never dispatches the agent.

Read `~/.claude/pell-config.json` (treat a missing file as `{}`) for `jira.cloud_id`, so the agent can skip a redundant `getAccessibleAtlassianResources` call.

Print `Mapping this repo — walking git history, Jira, Confluence, Drive, and Bitbucket. This can take a minute.` so the developer isn't staring at a blank prompt while the walk runs.

Call the Agent tool with `subagent_type="repo-mapper"` and a prompt containing these labeled lines:

```
repo_root: <repo_root>
seed_project_keys: [<seed_project_keys, or empty>]
seed_urls: [<seed_urls, or empty>]
known_cloud_id: <jira.cloud_id from pell-config.json, or empty>
verbose: <verbose>
```

Parse the trailing JSON object off the agent's response: `coordinates`, `low_confidence`, `gaps`, `summary`.

If `coordinates` is absent or empty, exit with:

> Could not map this repo: `<summary>`.

Otherwise continue to Step 4 with `coordinates`, `low_confidence`, and `gaps` in hand.

## Step 4 — Render findings and interview gaps

Render the proven findings first, from `coordinates`, so the developer sees what came free before anything is asked of them:

- **Repository** — workspace, slug, base branch, CI.
- **Atlassian site** — site URL, cloud ID.
- **Jira**, per discovered project key — issue types, statuses, transitions (naming which roles were confirmed and which are still unresolved), components, active epics, existing SOW path if any.
- **Confluence** — space key and id, candidate canonical pages.
- **Google Drive** — labelled folder ids.

Then walk `low_confidence` and `gaps` **one item at a time, `low_confidence` before `gaps`, never batched**. This ordering and the one-at-a-time rule are load-bearing, not a style preference: a developer asked six questions at once confirms all six without reading them, which defeats the entire point of splitting proven, inferred, and absent into separate channels. Never collapse this into a single prompt or an "answer these" checklist, no matter how few items there are.

For each `low_confidence` item, in order:
- Show the field, its inferred value, and its `why`.
- Ask the developer to confirm it, correct it (supply a replacement value), or drop it — a dropped field is recorded under `## Gaps` instead of being written as a coordinate.

For each `gaps` item, in order:
- Ask its `ask` string verbatim.
- `skip` is always a valid answer. A skipped gap is still recorded under `## Gaps` — answering "skip" is not the same as never having asked, and the eventual file should show that the question was posed and left open, not omit it silently.

Record every answer — confirmed, corrected, dropped, or skipped — against its field as you go. This resolved set, together with `repo_root`, `context_path`, and the proven `coordinates`, is what the write steps that follow this interview consume.

Under `--dry-run`, run this interview in full; only the eventual write is suppressed.
