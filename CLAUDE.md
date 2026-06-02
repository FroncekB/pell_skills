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
3. **Omit the `tools:` line** so the agent inherits the orchestrator's tool surface (including MCP tools when needed).
4. **Output JSON, not prose.** Orchestrators parse the trailing JSON object. Use the shape `{"findings": [...], "summary": "..."}`.
5. **Surface everything** with severity tags. Never pre-filter — the orchestrator decides what's actionable.

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

## Shared config

Per-user preferences (Jira project transitions, GitFlow defaults, etc.) live in `~/.claude/pell-config.json`. Schema sketched in the architecture spec §5. **No secrets** — those stay in MCP config.

Reads are free; writes are atomic per-section; any cached value is re-promptable via `--reset`.

## Validation and reload loop

After editing anything under `plugins/pell/`:

```bash
claude plugin validate ./plugins/pell
```

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

Both must coexist via the dual-endpoint workaround described in the user's `~/.claude/projects/.../memory/atlassian-mcp-setup.md`.
