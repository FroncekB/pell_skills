# Conductor Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Because every deliverable is a Claude Code skill/agent markdown file, also invoke superpowers:writing-skills before authoring, per this repo's convention.

**Goal:** Replace pell's `/pell:coordinate` command with a faithful port of Tom Neyland's `conductor` plugin — 7 skills + 5 worker agents + a shared playbook — folded into the single `pell` plugin.

**Architecture:** Copy each upstream file, then apply a small, enumerated set of adaptations (agent namespace prefix, dropped ancestor reference, runtime playbook paths, frontmatter shape). No behavior is reinvented — this is a port. The conductor agents form a separate family from pell's existing JSON-emitting review agents; the two coexist.

**Tech Stack:** Claude Code plugin format (markdown skills/agents with YAML frontmatter); `claude plugin validate` for structural verification; `${CLAUDE_PLUGIN_ROOT}` for runtime file references.

## Global Constraints

- Everything goes under `plugins/pell/` — no new dir under `plugins/`, no edits to `.claude-plugin/marketplace.json`.
- Design source of truth: `docs/specs/2026-07-13-conductor-port-design.md`.
- Upstream source (v0.4.0): `plugins/conductor/*` in https://github.com/TomNeyland/SkillsForThings/. A local copy of every needed file is in this session's scratchpad: `/tmp/claude-1001/-mnt-c-Users-BrandonF-Desktop-Pell-Repos-Pell-Skills/a4194b91-a5c5-4890-a86b-c3a80c75e4c9/scratchpad/` (filenames are the upstream path with `/` → `_`). If the scratchpad copy is gone (fresh session), re-fetch with `gh api "repos/TomNeyland/SkillsForThings/contents/<path>" -H "Accept: application/vnd.github.raw"`.
- **Agent frontmatter (pell shape):** `name` (= filename minus `.md`), `description`, `model: inherit`. Add a `tools: Read, Grep, Glob, Bash` line ONLY on the four read-only agents; `conductor-implementer` omits `tools:` (it writes code, inherits the full surface).
- **Skill frontmatter (pell shape):** `name` (= directory), trigger-led `description` starting "Use when …".
- **Agent namespace:** all five agents are prefixed `conductor-`. The exact dispatch handles are: `conductor-implementer`, `conductor-scout`, `conductor-correctness-reviewer`, `conductor-integration-gap-auditor`, `conductor-design-steward`.
- **Playbook location:** `plugins/pell/skills/coordinate-agents/references/playbook.md`. Runtime references use `${CLAUDE_PLUGIN_ROOT}/skills/coordinate-agents/references/playbook.md`.
- **No unit-test harness exists for prompt files.** The verification step for every task is `claude plugin validate ./plugins/pell` (structural) plus the grep-based fidelity checks each task names. "RED" = validate/grep fails before the file is right; "GREEN" = both pass.
- **Commits:** this repo's rule is *commit only when the user asks*. Do NOT commit per task. Leave every task at a validated working-tree state; a single commit gate at the end (Task 7) is deferred to explicit user consent.
- **House style:** plain text, no emoji/glyphs in emitted status lines. Preserve Tom's instructional content verbatim, including flow arrows inside fenced code blocks (they are teaching content, not emitted output).

---

### Task 1: Foundation — retire the command, bump version, record the exception

**Files:**
- Delete: `plugins/pell/commands/coordinate.md`
- Modify: `plugins/pell/.claude-plugin/plugin.json`
- Modify: `CLAUDE.md` (repo root)

**Interfaces:**
- Consumes: nothing.
- Produces: version `0.13.0`; a documented convention exception that later agent tasks rely on to justify their frontmatter.

- [ ] **Step 1: Delete the retired command**

```bash
git rm plugins/pell/commands/coordinate.md
```

(If not tracking via git yet, `rm plugins/pell/commands/coordinate.md`.)

- [ ] **Step 2: Bump the version and extend the description**

In `plugins/pell/.claude-plugin/plugin.json`, change `"version": "0.12.0"` to `"version": "0.13.0"` and extend the description to mention the conductor subsystem. Result:

```json
{
  "name": "pell",
  "version": "0.13.0",
  "description": "Pell Software's Claude Code toolkit: PR/local code reviewers (correctness, quality, security), Jira workflow ops, house-style guidance, and the conductor subsystem (coordinate-agents + autonomous-build family + worker agents). One plugin, many skills.",
  "author": {
    "name": "Pell Software"
  }
}
```

- [ ] **Step 3: Record the convention exception in CLAUDE.md**

In `CLAUDE.md`, under "## Conventions when adding an agent", append this note after the existing numbered list:

```markdown
> **Exception — `conductor-*` agents.** The five `conductor-*` worker agents
> (`conductor-implementer`, `conductor-scout`, `conductor-correctness-reviewer`,
> `conductor-integration-gap-auditor`, `conductor-design-steward`) intentionally
> break rules 3 and 4: read-only roles carry an explicit
> `tools: Read, Grep, Glob, Bash` line, and all five emit ranked prose reports
> ("final message IS the report") rather than JSON. They are a faithful port of
> an upstream design (conductor) where the coordinating skill reads reasoning-rich
> prose and where read-only enforcement is a real safety property. Do not "fix"
> them into the JSON/omit-tools shape. See
> `docs/specs/2026-07-13-conductor-port-design.md`.
```

- [ ] **Step 4: Verify**

```bash
claude plugin validate ./plugins/pell
grep '"version": "0.13.0"' plugins/pell/.claude-plugin/plugin.json
test ! -e plugins/pell/commands/coordinate.md && echo "command removed"
grep -c "conductor-\*" CLAUDE.md
```

Expected: validate passes; version line present; "command removed" printed; grep count ≥ 1.

---

### Task 2: Port the five conductor agents

**Files:**
- Create: `plugins/pell/agents/conductor-implementer.md` (from scratchpad `plugins_conductor_agents_implementer.md`)
- Create: `plugins/pell/agents/conductor-scout.md` (from `plugins_conductor_agents_scout.md`)
- Create: `plugins/pell/agents/conductor-correctness-reviewer.md` (from `plugins_conductor_agents_correctness-reviewer.md`)
- Create: `plugins/pell/agents/conductor-integration-gap-auditor.md` (from `plugins_conductor_agents_integration-gap-auditor.md`)
- Create: `plugins/pell/agents/conductor-design-steward.md` (from `plugins_conductor_agents_design-steward.md`)

**Interfaces:**
- Consumes: the CLAUDE.md exception from Task 1 (justifies the tools line + prose reports).
- Produces: the five dispatch handles named in Global Constraints, referenced by Task 3's `coordinate-agents` skill and playbook.

- [ ] **Step 1: Copy each source file to its prefixed destination**

```bash
S=/tmp/claude-1001/-mnt-c-Users-BrandonF-Desktop-Pell-Repos-Pell-Skills/a4194b91-a5c5-4890-a86b-c3a80c75e4c9/scratchpad
D=plugins/pell/agents
cp "$S/plugins_conductor_agents_implementer.md"            "$D/conductor-implementer.md"
cp "$S/plugins_conductor_agents_scout.md"                  "$D/conductor-scout.md"
cp "$S/plugins_conductor_agents_correctness-reviewer.md"   "$D/conductor-correctness-reviewer.md"
cp "$S/plugins_conductor_agents_integration-gap-auditor.md" "$D/conductor-integration-gap-auditor.md"
cp "$S/plugins_conductor_agents_design-steward.md"         "$D/conductor-design-steward.md"
```

- [ ] **Step 2: Fix each agent's `name:` in frontmatter to match its prefixed filename**

Edit the `name:` field in each file:
- `conductor-implementer.md`: `name: implementer` → `name: conductor-implementer`
- `conductor-scout.md`: `name: scout` → `name: conductor-scout`
- `conductor-correctness-reviewer.md`: `name: correctness-reviewer` → `name: conductor-correctness-reviewer`
- `conductor-integration-gap-auditor.md`: `name: integration-gap-auditor` → `name: conductor-integration-gap-auditor`
- `conductor-design-steward.md`: `name: design-steward` → `name: conductor-design-steward`

Leave `description`, `model: inherit`, and (on the four read-only agents) the `tools: Read, Grep, Glob, Bash` line exactly as upstream. `conductor-implementer.md` must have NO `tools:` line — confirm the copy didn't introduce one.

- [ ] **Step 3: Point the playbook reference at the runtime path**

In all five files, the line reads: `Fuller shared way-to-think: the plugin's `playbook` reference.` Replace with:

```markdown
Fuller shared way-to-think — read it in full, do not work from a summary:
`${CLAUDE_PLUGIN_ROOT}/skills/coordinate-agents/references/playbook.md`.
```

Do not alter any other body text (priority lenses, procedures, report contracts stay verbatim). Prose mentions of sibling roles ("the correctness reviewer owns depth") stay as descriptive prose — only Task 3's dispatch lists use the exact prefixed handles.

- [ ] **Step 4: Verify**

```bash
claude plugin validate ./plugins/pell
grep -l "name: conductor-" plugins/pell/agents/conductor-*.md | wc -l          # expect 5
grep -L "tools:" plugins/pell/agents/conductor-implementer.md                  # implementer prints (no tools line)
grep -l "tools: Read, Grep, Glob, Bash" plugins/pell/agents/conductor-scout.md plugins/pell/agents/conductor-correctness-reviewer.md plugins/pell/agents/conductor-integration-gap-auditor.md plugins/pell/agents/conductor-design-steward.md | wc -l  # expect 4
grep -rl 'the plugin.s .playbook. reference' plugins/pell/agents/ || echo "old playbook ref gone"
```

Expected: validate passes; 5 prefixed names; implementer has no tools line; 4 read-only agents carry the tools line; no stale playbook reference.

---

### Task 3: Port the coordinate-agents skill + shared playbook

**Files:**
- Create: `plugins/pell/skills/coordinate-agents/SKILL.md` (from scratchpad `plugins_conductor_skills_coordinate-agents_SKILL.md`)
- Create: `plugins/pell/skills/coordinate-agents/references/playbook.md` (from `plugins_conductor_skills_coordinate-agents_references_playbook.md`)

**Interfaces:**
- Consumes: the five `conductor-*` handles from Task 2.
- Produces: the entrypoint skill (auto-invokes when a task is large enough to split across coordinated subagents).

- [ ] **Step 1: Copy both source files**

```bash
S=/tmp/claude-1001/-mnt-c-Users-BrandonF-Desktop-Pell-Repos-Pell-Skills/a4194b91-a5c5-4890-a86b-c3a80c75e4c9/scratchpad
mkdir -p plugins/pell/skills/coordinate-agents/references
cp "$S/plugins_conductor_skills_coordinate-agents_SKILL.md"                     plugins/pell/skills/coordinate-agents/SKILL.md
cp "$S/plugins_conductor_skills_coordinate-agents_references_playbook.md"       plugins/pell/skills/coordinate-agents/references/playbook.md
```

- [ ] **Step 2: Drop the non-existent ancestor reference in SKILL.md**

Remove this sentence (it names a skill not being ported):

```markdown
This is the current general coordinator. `orchestrating-greenfield-builds` is its specialized,
greenfield-specific prototype ancestor.
```

- [ ] **Step 3: Rename the role handles in the SKILL.md "Composes with" section**

Change the worker-role list from the bare names to the prefixed handles, and make the playbook path explicit:

- `implementer` → `conductor-implementer`
- `correctness-reviewer` → `conductor-correctness-reviewer`
- `integration-gap-auditor` → `conductor-integration-gap-auditor`
- `scout` → `conductor-scout`
- `design-steward` → `conductor-design-steward`
- `references/playbook` → `${CLAUDE_PLUGIN_ROOT}/skills/coordinate-agents/references/playbook.md`

Leave the `fan-and-critic` and `autonomous-build` skill names unchanged (skills are not prefixed). Leave the loop, delegating, plan-gate, base-integrity, review, integration, escalate, and red-flags sections verbatim.

- [ ] **Step 4: Rename the role-file list in playbook.md**

In the "Then read your role file" block, change the bare filenames to the prefixed agent handles and point at the runtime path:

```markdown
**Then read your role file** — it carries your procedure, your report contract, and your role's own
failure classes: `conductor-implementer` · `conductor-integration-gap-auditor` ·
`conductor-correctness-reviewer` · `conductor-scout` · `conductor-design-steward`
(each at `${CLAUDE_PLUGIN_ROOT}/agents/<name>.md`)
```

Leave §1–§10 and the closing universal-norms paragraph verbatim.

- [ ] **Step 5: Verify**

```bash
claude plugin validate ./plugins/pell
grep -c "orchestrating-greenfield-builds" plugins/pell/skills/coordinate-agents/SKILL.md   # expect 0
grep -c "conductor-implementer" plugins/pell/skills/coordinate-agents/SKILL.md              # expect >=1
grep -c "conductor-" plugins/pell/skills/coordinate-agents/references/playbook.md           # expect >=5
test -f plugins/pell/skills/coordinate-agents/references/playbook.md && echo "playbook present"
```

Expected: validate passes; ancestor reference gone; prefixed handles present in both files; playbook present.

---

### Task 4: Port the autonomous-build skill family (5 skills)

**Files:**
- Create: `plugins/pell/skills/autonomous-build/SKILL.md` (from `plugins_conductor_skills_autonomous-build_SKILL.md`)
- Create: `plugins/pell/skills/autonomous-build-purpose-layers/SKILL.md`
- Create: `plugins/pell/skills/autonomous-build-jealousy-ranking/SKILL.md`
- Create: `plugins/pell/skills/autonomous-build-session-pacing/SKILL.md`
- Create: `plugins/pell/skills/autonomous-build-commit-essays/SKILL.md`

**Interfaces:**
- Consumes: nothing from prior tasks (self-contained skills; `autonomous-build`'s body references the four sub-skills by name and `coordinate-agents` by name — all present after this task + Task 3).
- Produces: the long-session skill family.

- [ ] **Step 1: Copy all five source files**

```bash
S=/tmp/claude-1001/-mnt-c-Users-BrandonF-Desktop-Pell-Repos-Pell-Skills/a4194b91-a5c5-4890-a86b-c3a80c75e4c9/scratchpad
for n in autonomous-build autonomous-build-purpose-layers autonomous-build-jealousy-ranking autonomous-build-session-pacing autonomous-build-commit-essays; do
  mkdir -p "plugins/pell/skills/$n"
  cp "$S/plugins_conductor_skills_${n}_SKILL.md" "plugins/pell/skills/$n/SKILL.md"
done
```

- [ ] **Step 2: Adapt the `autonomous-build` invocation phrasing**

In `plugins/pell/skills/autonomous-build/SKILL.md`, the `description` says "Use ONLY when the user explicitly invokes this skill by name — e.g., `/autonomous-build`, `use autonomous-build`, …". pell has no `/autonomous-build` slash command. Reword to preserve the do-not-auto-fire intent without implying a command:

```yaml
description: Use ONLY when the user explicitly names this skill — e.g., "use autonomous-build", "kick off with autonomous-build", or an equivalent explicit request. Do NOT auto-fire on generic "build me X" / "new project" / "take it further" phrasings; those go through the normal flow.
```

Leave the four other sub-skills' frontmatter and all five bodies verbatim (pacemaker `sleep 600`, `gh repo create --private`, the `superpowers:brainstorming` notify, the sub-skill table, the commit-essay example).

- [ ] **Step 3: Verify**

```bash
claude plugin validate ./plugins/pell
ls plugins/pell/skills/ | grep -c autonomous-build          # expect 5
grep -c "/autonomous-build" plugins/pell/skills/autonomous-build/SKILL.md   # expect 0
for n in autonomous-build autonomous-build-purpose-layers autonomous-build-jealousy-ranking autonomous-build-session-pacing autonomous-build-commit-essays; do
  head -3 "plugins/pell/skills/$n/SKILL.md" | grep -q "name: $n" && echo "$n name ok"
done
```

Expected: validate passes; 5 autonomous-build skills; no `/autonomous-build` slash implication; each skill's `name` matches its directory.

---

### Task 5: Port the fan-and-critic skill

**Files:**
- Create: `plugins/pell/skills/fan-and-critic/SKILL.md` (from `plugins_conductor_skills_fan-and-critic_SKILL.md`)

**Interfaces:**
- Consumes: nothing.
- Produces: the standing enthusiast/critic pair skill (referenced by `coordinate-agents` "Composes with").

- [ ] **Step 1: Copy the source file**

```bash
S=/tmp/claude-1001/-mnt-c-Users-BrandonF-Desktop-Pell-Repos-Pell-Skills/a4194b91-a5c5-4890-a86b-c3a80c75e4c9/scratchpad
mkdir -p plugins/pell/skills/fan-and-critic
cp "$S/plugins_conductor_skills_fan-and-critic_SKILL.md" plugins/pell/skills/fan-and-critic/SKILL.md
```

- [ ] **Step 2: Port verbatim**

No adaptations. Keep the reviewer-prompt skeleton, the weighing guidance, and the "TDD Gap" note (honest upstream metadata). Frontmatter is already pell-compliant (`name: fan-and-critic`, trigger-led description).

- [ ] **Step 3: Verify**

```bash
claude plugin validate ./plugins/pell
head -3 plugins/pell/skills/fan-and-critic/SKILL.md | grep -q "name: fan-and-critic" && echo "name ok"
```

Expected: validate passes; name ok.

---

### Task 6: Full validation, glyph sweep, and reload smoke test

**Files:** none created; verifies the whole subsystem.

**Interfaces:**
- Consumes: everything from Tasks 1–5.
- Produces: a validated, load-tested plugin.

- [ ] **Step 1: Structural validation**

```bash
claude plugin validate ./plugins/pell
```

Expected: PASS.

- [ ] **Step 2: Glyph sweep on emitted-status surfaces**

Confirm no emoji crept in (flow arrows inside fenced code blocks are allowed instructional content and are fine):

```bash
grep -rlP '[\x{2705}\x{26A0}\x{2717}\x{2714}\x{1F300}-\x{1FAFF}]' plugins/pell/skills plugins/pell/agents || echo "no emoji"
```

Expected: "no emoji".

- [ ] **Step 3: Inventory check**

```bash
ls plugins/pell/agents/conductor-*.md | wc -l                          # expect 5
ls -d plugins/pell/skills/*/ | wc -l                                   # expect 9 (frontend-router, visual-scratchpad + 7 new)
test -f plugins/pell/skills/coordinate-agents/references/playbook.md && echo "playbook ok"
test ! -e plugins/pell/commands/coordinate.md && echo "command gone"
```

Expected: 5 agents; 9 skill dirs; playbook ok; command gone.

- [ ] **Step 4: Reload smoke test**

In the Claude Code session:

```
/plugin marketplace update pell-skills
/reload-plugins
```

Then confirm `coordinate-agents`, the `autonomous-build*` family, and `fan-and-critic` appear in the skills list, the `conductor-*` agents are dispatchable, and `/pell:coordinate` no longer resolves.

---

### Task 7: Commit (gated on user consent)

**Files:** none.

- [ ] **Step 1: Show the user exactly what will be committed and ask**

```bash
git status
git diff --stat
```

Present the file list and ask: `Commit the conductor port (N files) on a new branch? (y/n)`. Per repo rule, do not commit without a yes. On yes, branch first (do not commit on `main`), then commit with a message describing the port and the co-author trailer this repo requires.

---

## Self-Review

**Spec coverage** (each design section → task):
- Delete command → Task 1. Version bump → Task 1. CLAUDE.md exception → Task 1.
- 5 agents with prefix + tools rules + playbook path → Task 2.
- coordinate-agents skill + playbook + ancestor drop + handle rename → Task 3.
- autonomous-build family + invocation rewording → Task 4.
- fan-and-critic → Task 5.
- Not-ported items (assets, per-skill READMEs, conductor plugin.json, marketplace.json) → honored by never copying them (no task creates them).
- Validation + reload → Task 6. Commit gate → Task 7.
No gaps.

**Placeholder scan:** No TBD/TODO. Every edit names the exact source file and the exact string change. Verification steps have concrete commands + expected output.

**Type/name consistency:** The five handles (`conductor-implementer`, `conductor-scout`, `conductor-correctness-reviewer`, `conductor-integration-gap-auditor`, `conductor-design-steward`) are used identically in Global Constraints, Task 1's CLAUDE.md note, Task 2's frontmatter, and Task 3's dispatch lists. Skill directory names match their `name:` frontmatter. Playbook runtime path is identical in Task 2 Step 3, Task 3 Step 3/4, and Global Constraints.
