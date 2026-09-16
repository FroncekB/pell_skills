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

## Step 5 — Write `context.md`

Skip this step, and Steps 6 and 7, when `verify` is set — go to Step 8 instead.

Prompt:

> Write repo coordinates to `docs/pell/context.md`? (y/n)

Under `--dry-run`, skip this prompt entirely: print `--dry-run: context.md not written.` and continue to Step 7. Step 6 has nothing to patch without a written file, so it is skipped too.

On `n`: print `context.md not written.` and continue to Step 7, skipping Step 6 for the same reason — a declined write leaves nothing for the SOW build to patch.

On `y`: create `docs/pell/` under `repo_root` if it does not exist, then write `context_path` in this shape (design spec Section 7). Frontmatter:

```
---
schema: 1
generated_at: <ISO-8601 UTC, e.g. 2026-09-16T14:22:00Z>
generated_by: /pell:map-repo
repo: <workspace>/<slug>
---
```

Followed by `# Repo context — <slug>`, then the preamble paragraph — mandatory, copied exactly, never paraphrased:

```
Coordinates only. Nothing here is a source of truth — it tells you where the
sources of truth live. Fetch live before relying on any content.
```

Then the body sections, in this order, built from the resolved coordinates and the interview's confirmed/corrected/dropped/skipped answers:

- **`## Repository`** — Bitbucket workspace, repo slug, default base branch, branch shape (`<KEY>-<description>`, with a worked example when a key is known), CI system. Omit a line whose value is unknown rather than guessing.
- **`## Atlassian site`** — site URL, cloudId.
- **`## Jira — <KEY> (<name>)`** — one section per discovered project key, repeated in the same frequency-rank order Step 3 discovered them. Each holds: issue types, workflow (statuses joined by `->`), transition names exactly as the API returned them (`start`, `in_review`, `done` — write `unverified` for any role that could not be confirmed; never a fabricated name), components, active epics as `<KEY> (<summary>)`, and a `Synthesized SOW:` line. Before Step 6 runs, write that line as `Synthesized SOW: none — run /pell:scope <KEY>`; Step 6 patches it on a successful build.
- **`## Confluence`** — space key, space id, and a `Page | id | Covers` table of canonical pages.
- **`## Google Drive`** — one line per labelled folder: `<label>: <folder_id> (<name>)`.
- **`## Gaps`** — one line per dropped `low_confidence` field and per `gaps` entry (answered or skipped), each stating how to resolve it. Render `_None._` when empty.

Repo-level sections (`Repository`, `Atlassian site`, `Confluence`, `Google Drive`, `Gaps`) appear once regardless of how many projects were found; only `## Jira —` repeats. This file holds coordinates and confirmed values only — never a scope statement, epic body, or Confluence page body. That content lives in the SOW or on the source system, not here.

Print `Wrote docs/pell/context.md` and continue to Step 6.

## Step 6 — Build the SOW

Skip this entire step, and go directly to Step 7, when any of: `verify` is set (see Step 8); Step 5 did not write `context.md` (declined, or `--dry-run`); or `skip_sow` is set — print `Skipping the SOW build.` first in that last case.

`context.md` is already written at this point on every path that reaches this step. That ordering is load-bearing: a declined, failed, or slow SOW build must never cost the developer the coordinates already sitting on disk.

For each Jira project key discovered in Step 3, in the same frequency-rank order:

1. Check whether `docs/pell/sow-<KEY>.md` exists.
   - It does not exist: not current — fall through to the prompt below.
   - It exists: read its own YAML frontmatter for `generated_at`.
     - Present and less than 14 days old: print `SOW for <KEY> is current (built <date>) — skipping.` and continue to the next key.
     - Absent, unparseable, or 14 days old or older: not current — fall through to the prompt below.

   This age is read only from that file's own frontmatter — never re-derive or re-implement a clock here; the 14-day rule belongs to `/pell:scope` alone.
2. Unless `with_sow` is set, prompt naming the cost:

   > Build the Statement of Work for `<KEY>`? This walks every issue in the project plus any linked Confluence scope docs — typically 1-3 minutes. (y/n)

   `with_sow` answers this `y` for every key without prompting.
3. On `y` (or `with_sow`): build `sow_sources` before dispatching. `sow-builder`'s Step 4 needs a real Confluence URL per page and treats anything else as unresolvable (`_Fetch failed: unrecognized Confluence URL shape_`), but `repo-mapper` returns `coordinates.confluence.pages[]` as `{title, id, covers}` — no URL (design spec §5.3; `repo-mapper.md`'s output format). Passing the bare `id` through would silently lose the exact saving §8 promises over the lazy path. For each page in `coordinates.confluence.pages`, construct `https://<coordinates.atlassian.site>/wiki/spaces/<coordinates.confluence.space_key>/pages/<id>`. Add any `seed_urls` captured in Step 1 to the same list — a URL the developer supplied at invocation is as authoritative as one the walk discovered. Then dispatch the Agent tool with `subagent_type="sow-builder"` — the existing agent, unmodified — with a prompt containing these labeled lines:

   ```
   cloudId: <coordinates.atlassian.cloud_id>
   project_key: <KEY>
   sow_sources: [<constructed Confluence page URLs, plus seed_urls, or empty>]
   deep: false
   verbose: <verbose>
   ```

4. On success (non-empty `sow_markdown`): write `docs/pell/sow-<KEY>.md` with the returned document, print `Wrote docs/pell/sow-<KEY>.md (<stats.issues> issues · <stats.epics> epics · <stats.scope_docs> scope doc)`, then patch **only** the `Synthesized SOW:` line for `<KEY>` in the `context.md` just written, to `Synthesized SOW: docs/pell/sow-<KEY>.md (built <today's date>)`. No separate gate covers this patch — it is covered by the `y` already given to the build itself.
5. On `n`, or on failure or an empty result: leave the `context.md` line as `Synthesized SOW: none — run /pell:scope <KEY>`, and add a line under `## Gaps` — `SOW for <KEY> not built — run /pell:scope <KEY>.` on decline, or `SOW build for <KEY> failed: <summary> — run /pell:scope <KEY>.` on failure. This is a **per-source** failure: `context.md` stays intact exactly as written, and the walk continues to the next project key.

Continue to Step 7 once every discovered key has been handled.

## Step 7 — `CLAUDE.md` pointer

Skip this step when `verify` is set — go to Step 8 instead.

Locate `<repo_root>/CLAUDE.md`. Show the exact block and the target path before prompting — never prompt blind:

```markdown
<!-- pell:context-pointer -->
## Repo context

Project coordinates — Jira keys and exact transition names, Confluence space and
canonical page ids, Drive folder ids, Bitbucket slug — are mapped in
`docs/pell/context.md`. Read it before any Jira, Confluence, or Drive lookup for
this repo. It holds pointers, not content: fetch live before relying on anything
it names.
```

If `CLAUDE.md` exists, prompt:

> Add the repo-context pointer block to `CLAUDE.md`? (y/n)

On `y`: locate `<!-- pell:context-pointer -->` in the file.
- If present, replace from that marker through the end of the block — that is, up to the next `## ` heading **after** the block's own `## Repo context` heading, or end of file if none follows — with the block above. The "after its own heading" qualifier is load-bearing: `## Repo context` is the very next line after the marker, so a naive "replace up to the next `## `" would match the block's own heading and replace only the marker line, leaving the stale body stranded under a duplicated heading. That is precisely the failure acceptance case 5 ("run twice, replaced not duplicated") exists to catch — do not re-simplify this back to "the next `## `."
- If absent, append the block at the end of the file, preceded by a blank line.

This makes re-running idempotent — the marker plus the corrected replace-range is what stops a second copy from stacking.

If `CLAUDE.md` does not exist, ask a further, separate `(y/n)`:

> `CLAUDE.md` doesn't exist in this repo. Create it containing only the pointer block above? (y/n)

On `y` to either prompt: write the file as described. On `n` to either: print `CLAUDE.md not written.` and continue.

Under `--dry-run`: skip both prompts, print `--dry-run: CLAUDE.md not written.`, and continue.

This gate is always separate from the `context.md` gate and the SOW gates in Step 6 — never bundle it with either. Consent to write a cache file under `docs/pell/` is not consent to edit the repo's own instruction file.

On a successful write, print exactly one of: `Added the pointer block to CLAUDE.md`, `Replaced the pointer block in CLAUDE.md`, or `Created CLAUDE.md with the pointer block`.

Continue to Step 9.

## Step 8 — `verify` mode

Runs instead of Steps 3 through 7 when `verify` was parsed in Step 1. Steps 3 and 4 already skip themselves in that case (see Step 3) and Step 5 routes here too (see Step 5) — this step is what all of them were skipping ahead to. No full walk, no `repo-mapper` dispatch: only cheap, falsifiable checks (design spec Section 11).

If `context_path` does not exist, print `No context.md found — nothing to verify. Run /pell:map-repo to build one.` and exit.

Otherwise, parse `context_path` in full. Step 2 only reads the `schema` / `generated_at` / `repo` frontmatter, and under `verify` it skips its own summary render entirely — nothing about the body has been read yet, and this step needs it. Read the body sections now and extract: Bitbucket workspace, slug, and base branch from `## Repository`; the recorded transition names (`start`, `in_review`, `done`) from each `## Jira — <KEY>` section; the canonical page ids from the `## Confluence` table; the folder ids from `## Google Drive`; and each project's `Synthesized SOW:` path from its Jira section. Then re-check each of:

| Check | Method |
|-|-|
| Bitbucket slug, base branch | `git remote -v`, `git symbolic-ref refs/remotes/origin/HEAD` |
| Transition names | the transitions-for-issue call (direct, or via `discover`/`executeRead` per Section 5.0) on one sampled issue per recorded Jira project |
| Confluence page ids | `getConfluencePage` by id — resolves or 404s |
| Drive folder ids | `get_file_metadata` by id — resolves or 404s |
| SOW freshness | stat `docs/pell/sow-<KEY>.md` per recorded project, read its own `generated_at` |

The first four rows compare the live value against what `context.md` records; a mismatch, or a 404 against a recorded id, is drift. The SOW row **reports only** — `verify` never rebuilds a SOW, no matter its age. Rebuilding is the expensive operation this whole design moved out of the mid-task path; that stays with `/pell:scope`. Render it per recorded project as `sow-<KEY>.md is <n> days old. Run /pell:map-repo refresh, or "refresh" inside /pell:scope.` A project with no recorded SOW gets no row.

If nothing drifted (the SOW row never counts as drift): print `No drift. context.md verified against 4 sources.` and exit without writing.

If something drifted, render each finding as `<field>: <recorded> -> <actual>`, one per line, then prompt:

> `context.md` has drifted on `<n>` field(s). Rewrite just those lines? (y/n)

On `y`: rewrite **only** the drifted lines in place, preserving `## Gaps` and any hand-edits untouched, and bump `generated_at` to now. Print `Wrote docs/pell/context.md (<n> field(s) corrected).`

On `n`: print `Not rewritten.`

Under `--dry-run`: run every check above in full, render the drift (or its absence) exactly as above, skip the rewrite prompt, and print `--dry-run: context.md not written.` instead of writing.

Exit after this step. `verify` never continues to Step 9 or to any of Steps 5 through 7.

## Step 9 — Render

Skipped entirely under `verify` — Step 8 renders its own outcome and exits.

The **existing-file summary** — headed `context.md — mapped <n> days ago.`, the `Repository` / `Atlassian` / `Jira` / `Confluence` / `Drive` / `Gaps` field block, and the `Say "refresh" to rebuild, or "verify" to check it for drift.` closer — is already defined in Step 2. It reproduces design spec Section 14's field set exactly; reuse it verbatim from there and do not redefine it here.

After a build in this run (Steps 3 through 7 ran, regardless of how many of their gates were accepted), render the **post-build summary**: the same field block Step 2 uses (`Repository`, `Atlassian`, `Jira`, `Confluence`, `Drive`, `Gaps` — identical shape and content rules, one repeated `Jira` row per discovered project when there is more than one), headed `Mapped <slug>.` instead of an age line, built from the coordinates and interview answers just gathered:

```
Mapped rrs-web.

Repository   pellsoftware/rrs-web · base develop · Bitbucket Pipelines
Atlassian    pellsoftware.atlassian.net
Jira         RRS (Retail Rewards System) — 5 issue types, 3 components, 2 active epics
             transitions: start "In Progress" · done "Done" · in_review unverified
Confluence   RRSDEV — 3 canonical pages
Drive        2 folders (requirements, design)
Gaps         2 — see the file

Wrote docs/pell/context.md
Wrote docs/pell/sow-RRS.md (127 issues · 2 epics · 1 scope doc)
Added the pointer block to CLAUDE.md

Commit all three with your normal workflow.
```

Follow the field block with one `Wrote ...` / `Added ...` / `Replaced ...` / `Created ...` line per file this run actually touched, in the fixed order `context.md`, then each `sow-<KEY>.md` built this run, then the `CLAUDE.md` line — worded exactly as shown in the template above. Omit the line for any file not written this run (declined, `--dry-run`, or skipped).

Close with `Commit all three with your normal workflow.` when all three kinds of file were written this run (`context.md`, at least one SOW, and `CLAUDE.md`); otherwise close with `Commit the file(s) written above with your normal workflow.` Never tell the developer to commit something that was not written.

Under `--dry-run`, render this same summary from the interview answers so the developer sees the full preview, but every `Wrote` / `Added` line is replaced by what Steps 5 through 7 already printed (`--dry-run: ... not written.`), and the closing line is `--dry-run: nothing was written.`

## Failure behavior

Design spec Section 13 names two failure classes. A **per-source** failure degrades to a `## Gaps` entry and the walk continues; a **total** failure exits outright because there is nothing left to interview or write. Only the first two rows below are total — everything else is per-source and must never stop the command.

| Condition | Behavior |
|-|-|
| Not in a git repository | Exit (Step 2). Total — this command is repo-scoped by definition. |
| `repo-mapper` returns absent or empty `coordinates` | Exit with `Could not map this repo: <summary>.` (Step 3). Total — nothing to interview or write, and an empty `context.md` would be worse than none. |
| No git remote | Ask for workspace/slug, or omit the `## Repository` line that needs it |
| No issue keys in 200 commits or branch names | Ask for the project key outright, or record the gap |
| Atlassian MCP absent or unauthenticated | Skip Jira and Confluence, record under `## Gaps`, continue |
| Drive MCP absent | Skip Drive, record under `## Gaps`, continue |
| Bitbucket MCP absent | Not needed — the `## Repository` section comes from local git |
| A Jira project key resolves to nothing | Record under `## Gaps`, continue with the other keys |
| SOW build fails or returns empty | `context.md` is already written and stays intact; record the failure under `## Gaps` (Step 6); continue to the next project |
| Unknown `schema:` in an existing `context.md` | Print `context.md is schema <n>; this build writes schema 1 — rebuilding.` and treat the file as missing (Step 2) |

MCP handling follows architecture spec Section 4: notify, never force. A developer without the Drive connector still gets a useful Jira, Confluence, and Bitbucket map.
