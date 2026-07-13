# Conductor port — design

**Date:** 2026-07-13
**Status:** design (awaiting review)
**Source:** Tom Neyland's `conductor` plugin — https://github.com/TomNeyland/SkillsForThings/ (`plugins/conductor/`, v0.4.0)

## Goal

Replace pell's `/pell:coordinate` command with a faithful port of Tom Neyland's
`conductor` plugin, folded into the single `pell` plugin. The port keeps Tom's
design intact and adapts only where pell conventions or name collisions force a
change. The result is a conductor subsystem: a lead ("conductor") who scopes,
delegates owned units to worker subagents, gates their plans, reviews by blast
radius, traces seams, and integrates — plus the long-autonomous-build skill
family and a standing enthusiast/critic pair.

## Decisions (locked with the user)

1. **Scope:** full port — all 7 skills, all 5 agents, the shared playbook.
2. **Form:** *replace* the command. Delete `plugins/pell/commands/coordinate.md`;
   `coordinate-agents` becomes the skill entrypoint. No thin command wrapper.
3. **Agent contract:** *faithful to Tom* — prose reports ("your final message IS
   the report", ranked findings citing `file:line` + severity), and read-only
   roles keep an explicit `tools: Read, Grep, Glob, Bash` line. This deliberately
   diverges from pell's documented "agents output JSON / omit the tools line"
   convention (see Divergences).
4. **Pell-isms dropped:** no Jira seed, no persistence docs (`design.md` /
   `decisions.md` / `tracks.md`), no `~/.claude/pell-config.json` root, no
   `--resume` / `--dry-run` / `--reset`, no per-step `(y/n)` gates. Tom's
   conductor is leaner; the faithful choice keeps it that way.

## What ships

### Skills (each is `skills/<name>/SKILL.md`; no assets, no per-skill README)

| Skill | Role |
|-|-|
| `coordinate-agents` | The conductor loop. Entrypoint. Ships with `references/playbook.md`. |
| `autonomous-build` | Front door to long autonomous product-building sessions. |
| `autonomous-build-purpose-layers` | Each commit renders a new semantic layer, not a polish pass. |
| `autonomous-build-jealousy-ranking` | Rank backlog by who'd be jealous (tool vs toy), red-team, kill-and-replace. |
| `autonomous-build-session-pacing` | Pacemaker heartbeat, commit/push cadence, budget triage, typecheck-as-truth. |
| `autonomous-build-commit-essays` | Commit messages as design narrative (WHY + audience + arc-position). |
| `fan-and-critic` | Two standing opposed reviewers — an enthusiast fan and a harsh critic. |

### Agents (each is `agents/conductor-<name>.md`)

| Agent | Role | Tools line |
|-|-|-|
| `conductor-implementer` | Build & wire ONE delegated unit end-to-end in an isolated worktree. | omitted (inherits full surface — it writes code) |
| `conductor-scout` | Read-only investigator: drift hunt, reinvention audit, RCA, area map. | `Read, Grep, Glob, Bash` |
| `conductor-correctness-reviewer` | Adversarial correctness review of a unit; one of a dual-model pair. | `Read, Grep, Glob, Bash` |
| `conductor-integration-gap-auditor` | Is the unit *connected* (wired seams), not just correct; one of a dual pair. | `Read, Grep, Glob, Bash` |
| `conductor-design-steward` | UI/verbal cohesion — tokens, primitives, copy voice, fidelity. | `Read, Grep, Glob, Bash` |

### Edits

- `plugins/pell/.claude-plugin/plugin.json` — bump `0.12.0` → `0.13.0` (minor:
  new skills + agents). Extend the description to mention the conductor
  subsystem.
- `CLAUDE.md` — add a one-line documented exception: the `conductor-*` agents
  intentionally use prose reports + explicit read-only `tools:` lines and do not
  follow the JSON/omit-tools convention, because they are a faithful port of an
  upstream design where the conductor reads reasoning-rich prose. This prevents a
  future maintainer from "fixing" them back into the pell convention.

### Not ported

- The `conductor` `plugin.json` (pell stays one plugin — nothing added to
  `marketplace.json`, no new dir under `plugins/`).
- Decorative `assets/*.png` / `*.svg` per skill (Tom's branding, non-functional).
- Per-skill `README.md` files (pell skills ship `SKILL.md` only).
- Tom's top-level `conductor/README.md`.

## Adaptations from verbatim (the pell delta)

1. **Agent namespace.** Prefix all five agents `conductor-`. This avoids
   clobbering pell's existing `agents/correctness-reviewer.md` (a JSON-emitting
   diff reviewer used by `/pell:correctness-review`, `/pell:three-pass-review`,
   `/pell:local-review`), and keeps the conductor family legible next to pell's
   review agents. Update every cross-reference:
   - `coordinate-agents` "Composes with" section: role names become
     `conductor-implementer` / `conductor-correctness-reviewer` /
     `conductor-integration-gap-auditor` / `conductor-scout` /
     `conductor-design-steward`.
   - `references/playbook.md` role-file list: same rename.
   - Each agent body's "paired with a same-prompt reviewer" / cross-role mentions.
2. **Drop the non-existent ancestor reference.** `coordinate-agents` names
   `orchestrating-greenfield-builds` as its "prototype ancestor". That skill is
   not in pell; remove the sentence.
3. **Playbook path.** Agents instruct the worker to "read your role file / the
   playbook IN FULL." Point them at the bundled file via
   `${CLAUDE_PLUGIN_ROOT}/skills/coordinate-agents/references/playbook.md` and
   `${CLAUDE_PLUGIN_ROOT}/agents/conductor-<role>.md` so the reference resolves at
   runtime from the installed plugin cache. Keep Tom's "point to it, never
   summarize (drifts)" instruction.
4. **`autonomous-build` invocation phrasing.** Tom's description says "Use ONLY
   when the user explicitly invokes this skill by name — e.g. `/autonomous-build`".
   pell skills are invoked via the Skill tool / by name, not as a slash command.
   Reword to preserve the do-not-auto-fire intent without implying a
   `/autonomous-build` command exists.
5. **Plain text / no glyphs.** pell house style forbids emoji and box-drawing.
   Tom's files already comply; verify during authoring and fix any stray glyph.
6. **Branch reads.** Any `git rev-parse --abbrev-ref HEAD` becomes
   `git branch --show-current`. (Tom's files use `merge-base` / `diff` / `log` /
   `date` / `sleep` — no offending call spotted, but confirm during authoring.)

## Divergences consciously accepted (and why)

- **Agent output + tools convention.** `CLAUDE.md` §"adding an agent" says output
  JSON and omit `tools:`. The conductor agents do neither. Reason: they report to
  a human-like conductor who weighs reasoning ("disagreement is signal — state
  your reasoning, not just verdicts"), and the read-only roles rely on a
  constrained tools line as a real safety property. They are a *separate* agent
  family from pell's command-parsed reviewers, so the divergence breaks nothing.
  Mitigation: the documented `CLAUDE.md` exception above.
- **Loss of the old command's Jira/persistence/resume.** The retired
  `/pell:coordinate` seeded Jira context, kept living design docs, and supported
  `--resume` across sessions. The faithful port has none of these. Accepted per
  the user's "replace + faithful" choice. If long-session continuity becomes a
  need, `autonomous-build-session-pacing` (commit/push cadence) and commit-essays
  (git log as the audit trail) are the conductor's answer instead of persisted
  spec docs.

## Fidelity checklist (per file, during authoring)

For each ported file, the port is faithful when:
- The role/loop/lenses/red-flags text matches Tom's semantics (light editing for
  the adaptations above only — no rewriting of the ideas).
- Cross-references resolve to real pell paths / prefixed agent names.
- Frontmatter matches pell shape: skills need `name` + `description` (trigger-led
  "Use when …"); agents need `name` + `description` + `model: inherit`, plus the
  `tools:` line only on the read-only roles.
- No emoji/glyphs; text markers only.

## Validation

```bash
claude plugin validate ./plugins/pell
```

- Confirm `plugin.json` version bumped to `0.13.0` in the same change.
- Local reload test:
  ```
  /plugin marketplace update pell-skills
  /reload-plugins
  ```
  Then confirm `coordinate-agents` and the `conductor-*` agents are discoverable
  and `/pell:coordinate` is gone.

## Out of scope

- Building the conductor's *target* products — this ships the coordination
  tooling, not any application it would coordinate.
- Reworking pell's existing review agents/commands to match the conductor
  contract — the two families coexist.
- Porting Tom's `orchestrating-greenfield-builds` prototype (superseded by
  `coordinate-agents`).
