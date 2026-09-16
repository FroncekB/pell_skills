# `/pell:map-repo` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/pell:map-repo` — a command that walks a repo's Jira, Confluence, Drive, and Bitbucket coordinates once, writes them to a committed `docs/pell/context.md`, offers to build the project SOW at setup time instead of mid-task, and points every future session at the file from the repo's own `CLAUDE.md` — plus the `repo-mapper` agent that does the walk and the read block that wires nine existing commands to consume it.

**Architecture:** One command (`plugins/pell/commands/map-repo.md`) orchestrates: arg parsing, locate/load, agent dispatch, gap interview, `context.md` write, per-project SOW build, `CLAUDE.md` pointer, `verify` mode, render. One new agent (`plugins/pell/agents/repo-mapper.md`) does the multi-MCP walk and returns proven/inferred/absent findings as JSON. The SOW build reuses the **existing** `sow-builder` agent unchanged. Nine existing commands gain a read block. `docs/pell/context.md` lives in the *target* repo beside `sow-<PROJECT>.md`.

**Tech Stack:** Markdown command + agent prompts (Claude Code plugin). MCP tools on `plugin:atlassian:atlassian` (`getAccessibleAtlassianResources`, `getVisibleJiraProjects`, `getJiraProjectIssueTypesMetadata`, `getTransitionsForJiraIssue`, `searchJiraIssuesUsingJql`, `getJiraIssueRemoteIssueLinks`, `getConfluenceSpaces`, `getConfluencePage`) and on the Drive MCP (`search_files`, `get_file_metadata`) — every name verified in Task 1. Local: `Read`/`Write`/`Edit`/`Glob`/`Bash` (git).

**Spec:** [`2026-09-16-pell-map-repo-design.md`](2026-09-16-pell-map-repo-design.md). Every `§N` below points there.

**Verification model (read this):** These deliverables are declarative prompts, not executable code — there is no unit-test harness in this repo. The gate at each task is, in order: (1) `claude plugin validate ./plugins/pell` passes; (2) a re-read of the written section against the cited spec section. Functional verification is **manual invocation** (Task 7), because behavior depends on live MCP responses and on a real repo's git history. Do not invent a pytest/jest suite.

**Authoring discipline (required):** Before writing or editing any file under `plugins/pell/` in Tasks 2–5, invoke `superpowers:writing-skills` via the Skill tool (notify-don't-force if it isn't installed) and follow its structure guidance. This is a standing repo rule for command/agent/skill authoring.

## Global Constraints

- Output is plain text — no emoji or glyphs. Status lines use text markers (`Wrote docs/pell/context.md`, `No drift.`, `_None._`).
- Read the current branch with `git branch --show-current`, never `git rev-parse --abbrev-ref HEAD`.
- Issue-key regex is `\b[A-Z][A-Z0-9]+-\d+\b`; `KEY` means the full issue key (e.g. `RRS-1020`). Pell branch shape is `<KEY>-<description>`.
- Every side effect is `(y/n)`-gated and the prompt names exactly what will change (§9). Gates are **never bundled**. `--dry-run` suppresses all of them.
- Reserved flags `--reset`, `--dry-run`, `--verbose` are accepted; `--reset` is a documented no-op here (§1).
- Agent frontmatter: `name`, `description`, `model: inherit`; **no `tools:` line**; trailing JSON output. The `conductor-*` exception does not apply to `repo-mapper`.
- Artifact path: `docs/pell/context.md` relative to `git rev-parse --show-toplevel`. Beside, never inside, `sow-<PROJECT>.md`.
- `context.md` frontmatter is exactly `schema: 1`, `generated_at` (ISO 8601 UTC), `generated_by: /pell:map-repo`, `repo: <workspace>/<slug>`.
- **No expiry threshold for `context.md`** (§4). Do not add a staleness timer. The 14-day rule belongs to `/pell:scope` alone and is not duplicated here (§8).
- `context.md` holds **coordinates, not content**. Never write a scope statement, epic body, or page body into it.
- **No secrets, ever** — tokens stay in MCP config. cloudId, space ids, page ids, and folder ids are identifiers and are allowed.
- Bump `plugins/pell/.claude-plugin/plugin.json` from `0.16.0` to `0.17.0` (minor: new command + new agent) in the same change set. Verified safe: the local plugin cache at `~/.claude/plugins/cache/pell-skills/pell/` holds only `0.14.0`, and no branch in this repo declares `0.17.0`.
- Never commit, push, transition, or mutate Jira/Confluence/Drive/Bitbucket from these prompts. The command writes local files only.

---

## File Structure

- **Create:** `plugins/pell/agents/repo-mapper.md` — the coordinate walker. Input: `repo_root`, `seed_project_keys`, `seed_urls`, `known_cloud_id`, `verbose`. Output: trailing JSON with `coordinates`, `low_confidence`, `gaps`, `summary`. One responsibility: turn a checkout into proven/inferred/absent coordinates. It never writes files and never prompts.
- **Create:** `plugins/pell/commands/map-repo.md` — the command. Sequential steps mirror §3–§11 and §14. This is a multi-step composite orchestrator, so its length is sequential steps, not bloat; do not force an extraction.
- **Modify:** nine commands with a `pell-config.json` read — `finish-work`, `from-ticket`, `my-tickets`, `precheck`, `related`, `review-queue`, `scope`, `start-work`, `triage`. Each gains the identical read block (§12).
- **Modify:** `plugins/pell/commands/scope.md` — additionally, one line in its Step 3 rebuild path pointing at `/pell:map-repo` as the eager alternative. Its lazy build, 14-day rule, and drift query stay **unchanged**.
- **Modify:** `CLAUDE.md` — new `## Repo context convention` maintainer section holding the canonical read block (§12).
- **Modify:** `plugins/pell/.claude-plugin/plugin.json` — `0.16.0` -> `0.17.0`.
- **Modify:** `plugins/pell/README.md`, root `README.md` — command index row, agent list, per-command section.
- **Modify:** `docs/specs/2026-05-27-pell-skills-architecture.md` §12 — built list.

Task order: schemas first (Task 1) so every tool name the prompts embed is real; agent next (Task 2) so the command dispatches an interface that exists; command in two halves (Tasks 3–4) split at the first write, because the read half is reviewable on its own; consumers (Task 5) after the artifact they read is specified; docs + version (Task 6); manual verification (Task 7).

---

## Task 1: Verify every MCP schema the two prompts will name

A prompt that names a tool parameter that does not exist fails silently at runtime, months later. Verify now; copy verbatim later.

**Files:**
- None written to the repo. Produces a scratchpad note that Tasks 2–4 copy from.

**Interfaces:**
- Produces: exact tool names and parameter shapes for the Jira, Confluence, and Drive calls in §5, recorded at `<scratchpad>/map-repo-mcp-schemas.md`.

- [ ] **Step 1: Authenticate the Atlassian MCP if needed**

Run `ToolSearch` with query `+atlassian`. If the only matching entry is an `authenticate` tool, call it, hand the user the URL, and complete the flow. Do not proceed until Jira tools appear in results.

- [ ] **Step 2: Load the Atlassian tool schemas**

Run `ToolSearch` with query:

```
select:mcp__plugin_atlassian_atlassian__getAccessibleAtlassianResources,mcp__plugin_atlassian_atlassian__getVisibleJiraProjects,mcp__plugin_atlassian_atlassian__searchJiraIssuesUsingJql,mcp__plugin_atlassian_atlassian__getJiraIssueRemoteIssueLinks,mcp__plugin_atlassian_atlassian__transitionJiraIssue
```

Then a second search for the three whose exact names are least certain:

```
+jira project issue types metadata transitions
```

Record the real names for: project issue-type metadata, transitions-for-issue, Confluence spaces list, Confluence page fetch.

- [ ] **Step 3: Load the Drive tool schemas**

Run `ToolSearch` with query `+drive search files metadata`. Record the exact names and required parameters for the folder-search and metadata-by-id calls. The Drive MCP is namespaced by a server id (e.g. `mcp__98ef4c9a-...__search_files`), which **differs per install** — note this, because the agent prompt must refer to the tools by their unqualified role ("the Drive file-search tool") rather than hardcoding a server id that will not match another developer's config.

- [ ] **Step 4: Confirm the transition-sampling call actually returns names**

Pick any real issue key from a Pell project. Call the transitions tool on it. Confirm the response contains human-readable transition names (`In Progress`, not just numeric ids). Record one real example response shape. §5.1 depends on this.

- [ ] **Step 5: Write the verified shapes to the scratchpad**

Write `<scratchpad>/map-repo-mcp-schemas.md` with one section per tool: exact name, required params, the response field each walk step reads.

- [ ] **Step 6: Reconcile the spec if anything differs**

If any name or parameter in §5's walk table is wrong, edit `docs/specs/2026-09-16-pell-map-repo-design.md` to match reality and commit that correction alone:

```bash
git add docs/specs/2026-09-16-pell-map-repo-design.md
git commit -m "docs(specs): correct MCP tool names in map-repo design"
```

---

## Task 2: `repo-mapper` agent (§5)

**Files:**
- Create: `plugins/pell/agents/repo-mapper.md`

**Interfaces:**
- Consumes: the verified tool names from Task 1.
- Produces: the JSON contract below. Task 3 parses exactly these keys.

- [ ] **Step 1: Invoke `superpowers:writing-skills`**

Call the Skill tool with `skill: superpowers:writing-skills`. If it is not installed, note that and continue — notify, never force.

- [ ] **Step 2: Read the reference agent**

Read `plugins/pell/agents/sow-builder.md` in full. It is the closest existing analogue: an expensive walker that returns JSON. Match its structure, heading style, and tone.

- [ ] **Step 3: Create the agent file**

Write `plugins/pell/agents/repo-mapper.md` starting with exactly this frontmatter:

```yaml
---
name: repo-mapper
description: Walks a checkout and its linked Jira, Confluence, Drive, and Bitbucket surfaces to produce the repo's coordinates — project keys, exact transition names, space and page ids, folder ids, repo slug. Read-only; writes no files and asks no questions. Dispatched by /pell:map-repo.
model: inherit
---
```

Body sections, in order:

1. **Inputs you will receive in the dispatching prompt** — the five labeled lines from §5 verbatim (`repo_root`, `seed_project_keys`, `seed_urls`, `known_cloud_id`, `verbose`).
2. **Step 1 — Local facts** — transcribe the four local rows of §5's walk table (`git remote -v`, CI file detection, `git symbolic-ref refs/remotes/origin/HEAD`, issue-key extraction from `git log --oneline -200` + `git branch -a`, ranked by frequency).
3. **Step 2 — Atlassian site** — `getAccessibleAtlassianResources`, skipped when `known_cloud_id` is non-empty.
4. **Step 3 — Jira per project key** — metadata, components, issue types, open-epic JQL.
5. **Step 4 — Transition sampling** — transcribe §5.1 in full, including the four-issue distinct-status sampling and the rule that any unobserved role goes to `low_confidence` rather than being guessed.
6. **Step 5 — Confluence** — remote links across ~20 recent issues, ranked by inbound link count; space lookup by name similarity.
7. **Step 6 — Drive** — folder search by project name and key. Refer to the tools by role, not by the install-specific server id (Task 1 Step 3).
8. **Step 7 — Existing SOWs** — glob `docs/pell/sow-*.md`, read each one's `generated_at`.
9. **Confidence channels** — transcribe §5.2 verbatim. This is the agent's most important rule.
10. **Output format** — the JSON contract below, with the instruction that the final message ends with this object and nothing after it.

The output contract, copied exactly into the agent body:

```json
{
  "coordinates": {
    "repository": { "workspace": "...", "slug": "...", "base_branch": "...", "ci": "..." },
    "atlassian":  { "site": "...", "cloud_id": "..." },
    "jira":       [ { "key": "RRS", "name": "...", "issue_types": [], "statuses": [],
                      "transitions": { "start": "...", "in_review": null, "done": "..." },
                      "components": [], "active_epics": [], "sow_path": "..." } ],
    "confluence": { "space_key": "...", "space_id": "...",
                    "pages": [ { "title": "...", "id": "...", "covers": "..." } ] },
    "drive":      [ { "label": "requirements", "folder_id": "...", "name": "..." } ]
  },
  "low_confidence": [ { "field": "confluence.pages", "value": [],
                        "why": "inferred from 3 inbound links; confirm" } ],
  "gaps":           [ { "field": "drive.qa_plans", "why": "no folder matched 'RRS'",
                        "ask": "Paste the Drive folder URL for QA test plans, or say skip." } ],
  "summary": "one-line outcome"
}
```

Add an explicit rule near the end: **a `null` or omitted value is correct when a thing could not be determined; an invented value is a defect.** Unavailable MCP surfaces produce `gaps` entries and the walk continues (§13).

- [ ] **Step 4: Validate**

```bash
claude plugin validate ./plugins/pell
```

Expected: PASS. If it fails on frontmatter, fix the YAML and re-run before continuing.

- [ ] **Step 5: Self-check against §5, §5.1, §5.2, §13**

Re-read the file against those four sections. Confirm: no `tools:` line; trailing JSON; the three confidence channels are distinct; every unavailable source degrades to a `gap` rather than aborting.

- [ ] **Step 6: Commit**

```bash
git add plugins/pell/agents/repo-mapper.md
git commit -m "feat(map-repo): add repo-mapper agent"
```

---

## Task 3: `/pell:map-repo` — read half (§1–§6)

Everything up to the first write. Reviewable on its own: at the end of this task the command can be invoked, will walk a repo, and will render findings — but will not touch disk.

**Files:**
- Create: `plugins/pell/commands/map-repo.md`

**Interfaces:**
- Consumes: the `repo-mapper` JSON contract from Task 2.
- Produces: in-session values `repo_root`, `context_path`, `coordinates`, `low_confidence`, `gaps`, and the answered interview results — all consumed by Task 4's write steps.

- [ ] **Step 1: Invoke `superpowers:writing-skills` and read the reference command**

Call the Skill tool with `skill: superpowers:writing-skills`. Then read `plugins/pell/commands/scope.md` in full — it is the structural model (arg parsing, cache locate/load, agent dispatch, gated write).

- [ ] **Step 2: Create `map-repo.md` with frontmatter and intro**

```yaml
---
description: Map a repo's Jira, Confluence, Drive, and Bitbucket coordinates into a committed docs/pell/context.md so every session stops re-deriving them, and optionally build the project SOW at setup time. Read-only against every remote system; all writes are local and gated.
argument-hint: "[refresh | verify | with sow | skip sow | PROJECT-KEY | <url> | --dry-run | --verbose]"
---
```

Intro paragraph: state that the command is read-only against Jira, Confluence, Drive, and Bitbucket; that every write is local and `(y/n)`-gated; that it never commits. Then `The user passed: $ARGUMENTS`.

- [ ] **Step 3: Write Step 1 — Parse arguments (§3)**

Transcribe §3's four-step ordering. Include both exclusivity rules explicitly:

- `refresh` and `verify` are mutually exclusive; `refresh` wins and the command says so.
- `with sow` and `skip sow` are mutually exclusive; **`skip sow` wins** — the conservative reading, since it is the one that cannot cost three unwanted minutes.

Include the `--reset` no-op line: print `Nothing to reset for /pell:map-repo.` and continue.

- [ ] **Step 4: Write Step 2 — Locate and load (§4)**

Transcribe §4 including:
- `repo_root` = `git rev-parse --show-toplevel`; on failure exit with the exact message from §4. This is the only fatal case.
- `context_path` = `<repo_root>/docs/pell/context.md`.
- The three frontmatter outcomes (unparseable, unknown `schema:`, valid).
- The refresh prompt and clean exit on `n`.
- The explicit note that there is **no expiry threshold**, with its reasoning.

- [ ] **Step 5: Write Step 3 — Dispatch `repo-mapper` (§5)**

Specify the Agent tool call with `subagent_type="repo-mapper"` and a prompt containing the five labeled lines. Read `known_cloud_id` from `~/.claude/pell-config.json` (treat missing as `{}`) and pass it so the agent can skip a redundant call.

Specify parsing the trailing JSON, and the failure path: if `coordinates` is absent or empty, exit with `Could not map this repo: <summary>.`

- [ ] **Step 6: Write Step 4 — Render findings and interview gaps (§6)**

Transcribe §6. The rule that must be unmissable in the prose: **one item at a time**, `low_confidence` before `gaps`, never batched. Include the stated reason — a developer asked six questions at once confirms all six without reading them.

`skip` is always a valid answer and leaves the field recorded under `## Gaps`.

- [ ] **Step 7: Validate**

```bash
claude plugin validate ./plugins/pell
```

Expected: PASS.

- [ ] **Step 8: Self-check against §1, §3, §4, §5, §6**

Confirm the argument table in the frontmatter hint matches §1's table exactly, including `with sow` and `skip sow`.

- [ ] **Step 9: Commit**

```bash
git add plugins/pell/commands/map-repo.md
git commit -m "feat(map-repo): add command through the gap interview"
```

---

## Task 4: `/pell:map-repo` — write half (§7–§11, §14)

**Files:**
- Modify: `plugins/pell/commands/map-repo.md` (append Steps 5–9)

**Interfaces:**
- Consumes: Task 3's in-session values.
- Produces: `docs/pell/context.md` in the target repo; optionally `docs/pell/sow-<KEY>.md`; optionally a `CLAUDE.md` pointer block.

- [ ] **Step 1: Write Step 5 — Write `context.md` (§7, §9)**

Specify the gate verbatim:

> Write repo coordinates to `docs/pell/context.md`? (y/n)

On `y`: create `docs/pell/` if needed, write the document in the §7 shape. Transcribe §7's section order and the worked example as the template. The preamble paragraph is mandatory and must be copied exactly:

```
Coordinates only. Nothing here is a source of truth — it tells you where the
sources of truth live. Fetch live before relying on any content.
```

Multi-project repos get one `## Jira — <KEY>` section per key; repo-level sections appear once.

On `n` or `--dry-run`: print that nothing was written and skip to Step 7 (the SOW build has nothing to patch).

- [ ] **Step 2: Write Step 6 — SOW build (§8)**

Transcribe §8's five-point flow. The ordering constraint is load-bearing and must be stated in the prose: **`context.md` is already written at this point**, so a declined, failed, or slow SOW never costs the developer the coordinates.

Per discovered project key, in frequency rank:

- Existing `docs/pell/sow-<KEY>.md` under 14 days old -> print `SOW for <KEY> is current (built <date>) — skipping.` and continue. Read the age from that file's own `generated_at` frontmatter; do not re-derive a clock here.
- Otherwise prompt, naming the cost:

  > Build the Statement of Work for `<KEY>`? This walks every issue in the project plus any linked Confluence scope docs — typically 1-3 minutes. (y/n)

- On `y`: dispatch the **existing** `sow-builder` agent with `subagent_type="sow-builder"`, passing `cloudId`, `project_key`, `sow_sources` (Confluence pages this walk already identified as scope docs), `deep: false`, `verbose`. Do not modify `sow-builder`.
- On success: write `docs/pell/sow-<KEY>.md`, then patch only the `Synthesized SOW:` line for that project in `context.md`.
- On `n` or failure: leave the line as `Synthesized SOW: none — run /pell:scope <KEY>` and add an entry under `## Gaps`.

`with sow` skips the per-project prompt; `skip sow` skips the whole step; `--dry-run` suppresses the build.

- [ ] **Step 3: Write Step 7 — `CLAUDE.md` pointer (§10)**

The block to insert, copied exactly:

```markdown
<!-- pell:context-pointer -->
## Repo context

Project coordinates — Jira keys and exact transition names, Confluence space and
canonical page ids, Drive folder ids, Bitbucket slug — are mapped in
`docs/pell/context.md`. Read it before any Jira, Confluence, or Drive lookup for
this repo. It holds pointers, not content: fetch live before relying on anything
it names.
```

Idempotency rule, stated explicitly: locate `<!-- pell:context-pointer -->`; if present, replace from the marker through the end of that section (up to the next `## ` at the same level, or EOF); if absent, append at end of file. Re-running never stacks duplicates.

Show the exact text and target path **before** prompting. This gate is separate from the `context.md` gate and must never be bundled with it. If no `CLAUDE.md` exists, offer to create a minimal one holding only the pointer block — a further, separate `(y/n)`.

- [ ] **Step 4: Write Step 8 — `verify` mode (§11)**

This step runs instead of Steps 3–7 when `verify` was parsed. Transcribe §11's four checks plus the SOW freshness row. State the two rules that keep ownership clean:

- `verify` **reports** a stale SOW and never rebuilds one — rebuilding is the expensive operation this design moved out of the mid-task path.
- The scoped rewrite touches only drifted lines, preserving `## Gaps` and any hand-edits. Bump `generated_at` on write.

No drift -> print `No drift. context.md verified against 4 sources.` and exit without writing.

- [ ] **Step 5: Write Step 9 — Render (§14)**

Transcribe §14's two render templates verbatim: the post-build summary (including the `Wrote ...` lines and `Commit all three with your normal workflow.`) and the summary-only variant headed `context.md — mapped <n> days ago.`

- [ ] **Step 6: Write the Failure behavior appendix (§13)**

Add a short closing section transcribing §13's table. The two rules an implementer most easily gets wrong: not-a-git-repo is the **only** fatal case, and a failed SOW build leaves `context.md` intact.

- [ ] **Step 7: Validate**

```bash
claude plugin validate ./plugins/pell
```

Expected: PASS.

- [ ] **Step 8: Self-check the gate inventory against §9**

List every write the finished command performs and compare to §9's table. There must be exactly: `context.md`, `sow-<KEY>.md` per project, the `context.md` SOW-line patch (covered by the SOW gate), the `CLAUDE.md` pointer block, and optional `CLAUDE.md` creation. Any write not in that table is a defect. Confirm `--dry-run` suppresses all of them and that no step runs `git add` or `git commit`.

- [ ] **Step 9: Commit**

```bash
git add plugins/pell/commands/map-repo.md
git commit -m "feat(map-repo): add writes, SOW build, pointer, and verify mode"
```

---

## Task 5: Consumption contract — canonical block, nine commands, scope pointer (§12)

**Files:**
- Modify: `CLAUDE.md` (new `## Repo context convention` section)
- Modify: `plugins/pell/commands/{finish-work,from-ticket,my-tickets,precheck,related,review-queue,scope,start-work,triage}.md`

**Interfaces:**
- Consumes: the `context.md` shape from Task 4.
- Produces: nothing new. Nine commands gain a read that is safe to ignore.

- [ ] **Step 1: Locate every insertion point**

```bash
grep -n "pell-config.json" plugins/pell/commands/*.md
```

Record, per file, the heading of the step that reads the config. The new block goes **immediately after** that step. If the command numbers its steps, renumber the subsequent ones.

- [ ] **Step 2: Add the canonical block to `CLAUDE.md`**

Add a `## Repo context convention` section, placed directly after the existing `## Context source convention (reviewer agents)` section. Open it with the same maintainer's-reference framing that section uses — the plugin ships as `plugins/pell/` only, so shipped bodies must restate the block inline and be kept in sync with this canonical wording. Then the block itself:

```markdown
## Step N — Load repo context

Run `git rev-parse --show-toplevel`. If it succeeds, read `<toplevel>/docs/pell/context.md` (Read tool). A missing file, unreadable frontmatter, or a `schema:` value other than `1` all mean "no context" — continue without it and say nothing.

When present, treat it as a **coordinate source only**. It holds pointers, not content: never treat its epic lists, page titles, or component names as current truth. Resolve any coordinate in this order:

1. an explicit value in `$ARGUMENTS`
2. `docs/pell/context.md`
3. `~/.claude/pell-config.json`
4. a live MCP lookup
5. prompt the user

Never write to `context.md`. If a live call later contradicts it, use the live value and print one line: `context.md is out of date on <field>. Run /pell:map-repo verify.`
```

- [ ] **Step 3: Insert the block into all nine commands**

For each file from Step 1, insert the block verbatim at the recorded point, adjusting only the step number in the heading to fit that command's sequence. The body text is identical across all nine — this is deliberate, and the `CLAUDE.md` section is the grep target that proves it.

- [ ] **Step 4: Add the eager-path pointer to `scope.md`**

In `scope.md`'s Step 3 rebuild path, immediately before the `Building the SOW for <project_key>` print line, add:

```markdown
If the SOW is missing entirely, mention once: `Tip: /pell:map-repo builds this at setup time, so a readiness check never has to wait for it.` Then continue with the build — never block on it.
```

Change nothing else in `scope.md`'s Step 3. Its lazy build, its 14-day staleness rule, and its drift query are unchanged and remain the single owner of the SOW clock.

- [ ] **Step 5: Verify the three consumer invariants hold**

Re-read each of the nine edits against §12 and confirm, per file:

1. The command never writes `context.md`.
2. The command never validates it (no extra MCP call spent checking freshness).
3. A missing, unparseable, or unknown-`schema:` file falls through to that command's **existing** behavior plus at most one note.

Invariant 3 is what makes editing nine files at once safe. A file that fails it is a defect, not a style issue.

- [ ] **Step 6: Confirm the resolution order actually reorders `cloud_id`**

In each command that resolves `cloudId`, confirm `context.md` is consulted **before** `~/.claude/pell-config.json`. This is the ordering that fixes the latent multi-site bug (§12) — a machine-global `jira.cloud_id` must not win over a repo-scoped one.

- [ ] **Step 7: Validate**

```bash
claude plugin validate ./plugins/pell
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add CLAUDE.md plugins/pell/commands/
git commit -m "feat(map-repo): wire nine commands to read docs/pell/context.md"
```

---

## Task 6: Docs and version bump

**Files:**
- Modify: `plugins/pell/.claude-plugin/plugin.json`
- Modify: `plugins/pell/README.md`, root `README.md`
- Modify: `docs/specs/2026-05-27-pell-skills-architecture.md` (§12 built list)

**Interfaces:**
- Consumes: nothing. Produces: a cache-busting version so installed users actually receive the change.

- [ ] **Step 1: Bump the version**

Edit `plugins/pell/.claude-plugin/plugin.json`: `"version": "0.16.0"` -> `"version": "0.17.0"`.

This is not optional bookkeeping. The installed plugin cache is keyed by version, so without the bump `/plugin marketplace update` + `/reload-plugins` will not rebuild and installed users keep loading the old copy — the change looks merged and ships to nobody.

- [ ] **Step 2: Update the plugin description if needed**

Read the `description` field. If it enumerates capabilities, add repo mapping to the list. If it is already generic, leave it.

- [ ] **Step 3: Update both READMEs**

Add `/pell:map-repo` to the command index table and add a per-command section describing: what it maps, where it writes, the SOW offer, and `verify`. Add `repo-mapper` to the agent list.

- [ ] **Step 4: Update the architecture spec's built list**

In `docs/specs/2026-05-27-pell-skills-architecture.md` §12, add `/pell:map-repo` and `repo-mapper` to the implemented set.

- [ ] **Step 5: Validate**

```bash
claude plugin validate ./plugins/pell
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add plugins/pell/.claude-plugin/plugin.json plugins/pell/README.md README.md docs/specs/2026-05-27-pell-skills-architecture.md
git commit -m "docs(map-repo): index the command, bump plugin to 0.17.0"
```

---

## Task 7: Manual verification (§16 acceptance matrix)

Behavior depends on live MCP responses and real git history, so this is hand-run. Work through all twelve cases.

**Files:**
- None. Findings become fixes in the relevant earlier task's file.

**Interfaces:**
- Consumes: everything. Produces: a pass/fail note per case.

- [ ] **Step 1: Reload the plugin**

```
/plugin marketplace update pell-skills
```

```
/reload-plugins
```

Then confirm `/pell:map-repo` appears in the command list. If it does not, the version bump did not take — recheck Task 6 Step 1.

- [ ] **Step 2: Run cases 1–4 in a real Pell repo**

| # | Scenario | Expected |
|-|-|-|
| 1 | Fresh repo, no `context.md` | Full walk, gap interview one at a time, both gates offered |
| 2 | Repo with a current file | Summary + age, refresh offer, clean exit on `n` |
| 3 | `verify` after corrupting a page id | Drift reported; scoped rewrite offered |
| 4 | Repo with no `CLAUDE.md` | Minimal-file creation offered, separately gated |

- [ ] **Step 3: Run cases 5–8**

| # | Scenario | Expected |
|-|-|-|
| 5 | Run twice in a row | Pointer block replaced, not duplicated |
| 6 | Hand-corrupted `context.md` | All nine consumers fall back cleanly, one nudge line |
| 7 | Drive MCP disconnected | Jira/Confluence/repo sections still written; Drive in `## Gaps` |
| 8 | Repo spanning two Jira projects | Two `## Jira —` sections in one file; two separate SOW prompts |

For case 6, corrupt the file by replacing its frontmatter with `schema: 99`, then invoke `/pell:start-work` and `/pell:scope` and confirm neither errors.

- [ ] **Step 4: Run cases 9–12 — the SOW integration**

| # | Scenario | Expected |
|-|-|-|
| 9 | Decline the SOW prompt | `context.md` still written; SOW line reads `none — run /pell:scope <KEY>` |
| 10 | SOW build fails mid-walk | `context.md` intact, failure in `## Gaps`, command exits cleanly |
| 11 | Existing SOW under 14 days old | Skipped with a note, not rebuilt |
| 12 | `/pell:scope` on a repo never mapped | Lazy build still works exactly as today |

Case 12 is the regression guard for the whole SOW change. If it fails, `/pell:scope` has been made to depend on setup having run, which the design explicitly forbids.

- [ ] **Step 5: Confirm the dry-run and read-only claims**

Run `/pell:map-repo --dry-run` in a repo with no `context.md`. Confirm: the walk and interview happen, and `git status --porcelain` is unchanged afterward. Then confirm nothing in the session mutated Jira, Confluence, Drive, or Bitbucket.

- [ ] **Step 6: Fix and re-verify**

For each failure, fix it in the file that owns it, re-run `claude plugin validate`, re-run the failing case, and commit the fix with a message naming the case number.

- [ ] **Step 7: Final commit and PR**

```bash
git add -A
git commit -m "fix(map-repo): address manual verification findings"
```

Then open the PR against `main` from `add-map-repo-command`.

---

## Self-Review

**Spec coverage.** Every section maps to a task: §1/§3 -> T3.3; §2 -> T3–T4 structure; §4 -> T3.4; §5/§5.1/§5.2/§5.3 -> T2; §6 -> T3.6; §7 -> T4.1; §8 -> T4.2; §9 -> T4.8; §10 -> T4.3; §11 -> T4.4; §12 -> T5; §13 -> T2.3 and T4.6; §14 -> T4.5; §15 -> constraints (no-secrets, hand-edit preservation in T4.4); §16 -> T6, T7; §17 -> not implemented by design; §18 -> constraints.

**Placeholders.** None. Every step names a file, a command to run, or text to copy. The transcribe-from-§N instructions are concrete because the spec travels with the plan and each cites an exact section.

**Type consistency.** The JSON keys in Task 2 (`coordinates`, `low_confidence`, `gaps`, `summary`) are the same keys Task 3 Step 5 parses. `context_path`, `repo_root`, `seed_project_keys`, `seed_urls`, `known_cloud_id` are spelled identically in Tasks 2 and 3. The `sow-builder` input names (`cloudId`, `project_key`, `sow_sources`, `deep`, `verbose`) match the existing agent's contract in `2026-08-28-pell-scope-design.md` §9 and are not redefined here.

**One gap found and closed during review:** Task 4 Step 2 originally let the SOW skip-check re-derive a 14-day clock. Corrected to read the age from the existing SOW's own `generated_at`, keeping `/pell:scope` the single owner of that rule per §8.
