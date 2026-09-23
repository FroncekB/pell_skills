# CLAUDE.md — pell_skills

You're working in **Pell Software's Claude Code skill marketplace**. This repo ships a single plugin (`pell`) that bundles every Pell-specific command, sub-agent, and auto-invoked skill. Engineers across Pell install it once and get the whole kit.

The architecture spec at `docs/specs/2026-05-27-pell-skills-architecture.md` is the source of truth for every decision below. Read it before making structural changes.

## Repo layout

```
pell_skills/
├── .claude-plugin/marketplace.json     # lists ONLY the `pell` plugin — do not add others here
├── docs/specs/                          # architectural specs
└── plugins/pell/
    ├── .claude-plugin/plugin.json
    ├── commands/<name>.md               # slash commands — /pell:<name>
    ├── agents/<name>.md                 # composable sub-agents — dispatched via subagent_type
    └── skills/<name>/SKILL.md           # auto-invoked skills (description-matched)
```

**Everything goes into `plugins/pell/`.** Don't add new plugin directories under `plugins/` and don't add new entries to `marketplace.json` — the design is one giant `pell` plugin.

## Conventions when adding a command

1. **Filename = invocation:** `commands/foo.md` becomes `/pell:foo`.
2. **Frontmatter is required:**
   ```yaml
   ---
   description: One to three sentences on what the command does
   argument-hint: <expected positional shape>
   ---
   ```
3. **Arguments are freeform-first.** Parse `$ARGUMENTS` as natural-language context; pull out structured pieces (ticket key, PR URL, paths) but let the user override behavior with free text ("skip jira", "use bitbucket", "treat as hotfix").
4. **Reserved flags:** `--reset` (clear cached config), `--dry-run` (preview, no side effects), `--verbose`.
5. **Default to read-only.** Any side effect (file edit, Bitbucket comment, Jira transition, branch creation) is gated on a `(y/n)` prompt that names exactly what will change.
6. **Notify, never force, for external plugin dependencies** (e.g. `superpowers`, `frontend-design`). Skip the step or substitute inline — don't halt the workflow.
7. **Renaming a command ships a deprecated alias.** Plugins have no alias mechanism, so leave a thin file under the old name: a description that says "Deprecated alias for /pell:<new>", a body that prints one rename line and forwards `$ARGUMENTS` verbatim to the new command via the Skill tool, and no logic of its own. Keep it a release or two, then delete it under the removal rules in Housekeeping. If the command posts a marker that another command matches by literal text, the matcher accepts both the old and new strings. `three-pass-review` → `four-pass-review` is the first instance (architecture spec §11).

## Conventions when adding an agent

1. **Filename = subagent_type:** `agents/foo-reviewer.md` is dispatched via `subagent_type="foo-reviewer"`.
2. **Frontmatter:**
   ```yaml
   ---
   name: foo-reviewer
   description: When to use this agent (used for tool routing)
   model: inherit
   ---
   ```

   > **Exception — mechanical agents.** `model: inherit` is the default because most agents review or design and need the orchestrator's model. An agent whose work is mechanical — paginate an API, group records, summarize pages into a few sentences, fill a fixed template — may pin `model: sonnet` instead, with a one-paragraph rationale at the top of its body. Today that is only `sow-builder`, the longest-running agent in the plugin. Pinning is a deliberate cost decision, not a quality shortcut: spot-check the output on a real project before pinning, and revert to `inherit` if the template quality drops.

3. **Omit the `tools:` line** so the agent inherits the orchestrator's tool surface (including MCP tools when needed).
4. **Output JSON, not prose.** Orchestrators parse the trailing JSON object. Use the shape `{"findings": [...], "summary": "..."}`.
5. **Surface everything** with severity tags. Never pre-filter — the orchestrator decides what's actionable.

> **Exception — `conductor-*` agents.** The five `conductor-*` worker agents
> (`conductor-implementer`, `conductor-scout`, `conductor-correctness-reviewer`,
> `conductor-integration-gap-auditor`, `conductor-design-steward`) intentionally
> break rules 3 and 4: read-only roles carry an explicit
> `tools: Read, Grep, Glob, Bash` line, and all five emit ranked prose reports
> ("final message IS the report") rather than JSON. They are a faithful port of
> an upstream design (conductor) where the coordinating skill reads
> reasoning-rich prose and where read-only enforcement is a real safety property.
> Do not "fix" them into the JSON/omit-tools shape. See
> `docs/specs/2026-07-13-conductor-port-design.md`.

## Conventions when adding a skill

1. **Directory = name:** `skills/foo/SKILL.md` becomes the auto-invoked skill `foo`.
2. **Frontmatter is required:**
   ```yaml
   ---
   name: foo
   description: Use when … — this string drives auto-invocation, so be specific about the trigger
   ---
   ```
3. **Description = trigger.** Skills fire on description match. Write the description so Claude can decide in one read whether the skill applies. Lead with "Use when …" and enumerate the conditions.
4. **Body is short.** A skill is a router or a workflow — not a tutorial. Mirror `skills/frontend-router/SKILL.md` for routing skills; defer to longer guidance only when the skill *is* the workflow.
5. **Notify, never block** when the skill recommends an external plugin. Match the policy in §4 of the architecture spec.

## Context source convention (reviewer agents)

This section is the **maintainer's reference** for the context-source override. Note: the plugin ships as `plugins/pell/` only — this `CLAUDE.md` is **not** installed, so command and agent bodies **cannot** reference it at runtime (a bare "see CLAUDE.md" in a shipped body would resolve to the *user's own* project file). Shipped bodies must restate the trigger phrases and `bitbucketRepoContent` call shape inline and be kept in sync with the canonical wording below.

Reviewers read surrounding code from one of two sources:
- **`local` (default)** — `Read`/`Grep`/`Glob` against `<repo_root>` (the user's working dir, assumed to be a checkout of the target repo).
- **`bitbucket` (override)** — `mcp__atlassian-bitbucket__bitbucketRepoContent` against the PR's source branch. Canonical call shape: `action="files.get"`, `workspaceId=<workspace>`, `repoId=<repo>`, `referenceOrSha=<branch>`, `path=<file>`.

Override is triggered by freeform `$ARGUMENTS` phrases: `use bitbucket`, `use mcp`, `use remote`, `fetch via bitbucket`, `not LFS`, `not local`.

## Repo context convention

This section is the **maintainer's reference** for the repo-context read that ten consumer commands perform (`finish-work`, `from-ticket`, `groom`, `my-tickets`, `precheck`, `related`, `review-queue`, `scope`, `start-work`, `triage`). Note: the plugin ships as `plugins/pell/` only — this `CLAUDE.md` is **not** installed, so command bodies **cannot** reference it at runtime (a bare "see CLAUDE.md" in a shipped body would resolve to the *user's own* project file). Shipped bodies must restate the block below inline and be kept in sync with the canonical wording here.

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

Each shipped command inserts this verbatim immediately after its existing `pell-config.json` read, adjusting only the step number (`N`) in the heading to fit that command's own sequence. Three invariants make this safe to wire into nine commands at once — see design spec [`2026-09-16-pell-map-repo-design.md`](docs/specs/2026-09-16-pell-map-repo-design.md) Section 12: a consumer never writes `context.md` (only `/pell:map-repo` does), never validates it (no extra MCP call spent checking freshness), and a missing, unparseable, or unknown-`schema:` file falls through to that command's existing behavior plus at most one note. `docs/pell/context.md` is repo-scoped and resolves **above** `~/.claude/pell-config.json`, which is machine-global — this fixes the latent bug where a cached `jira.cloud_id` follows the developer rather than the repo.

## Atlassian tool-name convention

`plugin:atlassian:atlassian` is canonical, but only a small set of its tools are primary: `getAccessibleAtlassianResources`, `atlassianUserInfo`, `getJiraIssue`, `searchJiraIssuesUsingJql`, `editJiraIssue`, `transitionJiraIssue`, `createJiraIssue`, `addOrEditJiraIssueComment`, `getConfluenceContent`, `searchConfluence`, `search`, `createConfluenceContent`, `updateConfluenceContent`. Everything else is reached through `discover`, then `executeRead` / `executeWrite` with `cloudId` top-level, under a name that differs from the classic connection's direct tool (`listJiraIssueTransitions` vs `getTransitionsForJiraIssue`, `addOrEditJiraIssueComment` vs `addCommentToJiraIssue`).

Any call outside the primary set names **both** shapes inline, by role — "The tool differs by connection shape — name both, by role, and use whichever the session exposes: …" — with the params for each, since those can differ too (`linkType` vs `type`). Classic names are written bare; their prefix is install-specific. Naming one shape fails silently and nothing validates it, so confirm every new name with `discover` before merging. The verified pairs are in architecture spec §4.4; like the other conventions here, shipped bodies restate them inline rather than pointing at this file or the spec.

**Read views.** `getJiraIssue` and `searchJiraIssuesUsingJql` default to `view: "compact"`, which returns only `summary`, `description`, `status.name`, `assignee.displayName`, `priority`, and `updated`, and drops everything else even when it is listed in `fields` (`parent`, `issuetype`, `issuelinks`, `subtasks`, `labels`, `components`, `created`, `project`, `status.statusCategory.key`, `assignee.accountId`). A call that reads any dropped field passes `view: "full"` with a one-line inline note saying which fields it needs; `full` still honours `fields`, so keep the list explicit to bound the payload. Calls that read only compact fields stay on the default. `reporter` never comes back on the plugin connection in any view: request `creator` alongside it and fall back to `creator`, labelled as such.

## Shared config

Per-user preferences (Jira project transitions, GitFlow defaults, etc.) live in `~/.claude/pell-config.json`. Schema sketched in the architecture spec §5. **No secrets** — those stay in MCP config.

Reads are free; writes are atomic per-section; any cached value is re-promptable via `--reset`.

## Housekeeping — update the docs in the same change

Docs here are load-bearing. `README.md` is how Pell engineers discover commands, `plugins/pell/README.md` ships *inside* the plugin, and the specs are what the next session reads before touching structure. A change that lands without them looks merged but is invisible. Do the housekeeping in the same commit as the change — not as a follow-up.

**Any change under `plugins/pell/`:**

- Bump `plugins/pell/.claude-plugin/plugin.json` — see [Validation and reload loop](#validation-and-reload-loop) below
- Update `plugins/pell/README.md`, the in-plugin reference that ships to installed users: grouped command lists, agent list, skill list, severity scales
- Re-read the frontmatter `description`. It drives routing and auto-invocation, so behavior that changed usually means a description that needs to change too

**Adding, renaming, or removing a command / agent / skill — also:**

- `README.md`: the table under `## Commands` (including the "Twenty commands" count), the per-command `### /pell:<name>` section, and the sub-agent and auto-invoked-skill lists further down. Table anchors must match the headings they point at
- `docs/specs/2026-05-27-pell-skills-architecture.md` §12 Implementation status — move the item from "Not yet built" to "Built", or drop it
- The `description` in `plugin.json` and in `.claude-plugin/marketplace.json` when the change shifts what the plugin *is* (a new category of surface) — not for a routine addition
- Removing something means deleting every mention: both READMEs, the spec, and any command body that dispatches it. Don't leave a dangling anchor or an orphaned `subagent_type`

**Changing a convention, pattern, or policy — also:**

- This `CLAUDE.md`. The conventions sections are the contract for the next session; a deliberate exception gets written down as an exception (see the `conductor-*` note above), not left for someone to "fix"
- `docs/specs/2026-05-27-pell-skills-architecture.md` — the architecture spec is the source of truth. Update the relevant numbered section, and add to §11 when you resolve an open decision
- Cross-check the copies that ship: the context-source trigger phrases and the `bitbucketRepoContent` call shape are restated inline in every reviewer command and agent, because `CLAUDE.md` isn't installed. Change one, grep for the rest

**Dated specs (`docs/specs/<date>-*-design.md`, `-plan.md`) are point-in-time records, not living docs.** Don't rewrite one to match a later change — append a short status note ("superseded by ...", "shipped as ...") and put the current truth in the architecture spec or the README.

**Before calling it done, grep for what you renamed:** `grep -rn "<old-name>" README.md docs/ plugins/`. A stale reference inside another command body is the most common form of rot in this repo, and nothing validates it.

## Validation and reload loop

After editing anything under `plugins/pell/`:

```bash
claude plugin validate ./plugins/pell
```

**Bump the version in `plugins/pell/.claude-plugin/plugin.json`** in the same change — minor for a new command/agent/skill, patch for a fix. The installed plugin cache is keyed by version (`~/.claude/plugins/cache/pell-skills/pell/<version>/`); if the version doesn't change, `/plugin marketplace update` + `/reload-plugins` will **not** rebuild the cache, so installed users keep loading the old copy and never see your change. A change that adds a command but not a version bump looks merged but ships to nobody.

To test the change locally:

```
/plugin marketplace update pell-skills
/reload-plugins
```

Then invoke the affected command.

## Style preferences

- Keep single-purpose command bodies under ~150 lines; if one grows past that from *duplicated* logic, factor it into a sub-agent. Multi-step composite orchestrators (e.g. `from-ticket`, `finish-work`, `wrap-up`) legitimately run longer — their length is sequential steps, not bloat, so don't force an extraction that adds indirection
- Descriptions (command/agent frontmatter): one to three sentences. Lead with the action; add a sentence or two only when it sharpens routing
- Severity vocabulary: correctness uses `blocker/major/minor/nit`; quality uses `major/minor/nit`; security uses `critical/high/medium/low/nit`
- **Output is plain text — no emoji or glyphs.** Status and report lines use text markers (`Linked.`, `Failed:`, `[resolved]`, `_None._`), never `✓`/`⚠`/`↳`
- **Read the current branch with `git branch --show-current`** — not `git rev-parse --abbrev-ref HEAD`
- **Pell branch shape is `<KEY>-<description>`** where `<KEY>` is the full Jira issue key (e.g. `RRS-1020-fix-cart`, key `RRS-1020`); the leading key is matched by the regex `[A-Z][A-Z0-9]+-\d+`. Use "KEY = full issue key" consistently — don't split the project prefix and number into separate `<KEY>-<number>` placeholders
- When unsure about how to structure something, mirror an existing command. Don't invent new patterns without updating the architecture spec first
- This repo is read by humans and Claude alike. Prefer clarity over cleverness in command bodies — they're prompts, not code

## MCP servers used

- `atlassian-bitbucket` (API token, see repo README) — PR data, diffs, file content, inline comments
- `plugin:atlassian:atlassian` (OAuth) — Jira issue lookup, transitions

Both must coexist via the dual-connection workaround (both on the `mcp.atlassian.com/v1/mcp/authv2` endpoint, distinguished by a throwaway query param on the Bitbucket entry so Claude Code doesn't collapse them onto one session) — see the README setup section and the user's `~/.claude/projects/.../memory/atlassian-mcp-setup.md`.
