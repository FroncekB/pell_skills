---
description: Three-pass review of local uncommitted changes — dispatches correctness, quality, and security reviewers that respect CLAUDE.md and surrounding code conventions. Optionally applies suggested fixes.
argument-hint: [--staged | --uncommitted | --range <a>..<b> | <path>]
---

You are running **`/pell:local-review`** — the local composite. Orchestrate, aggregate, decide on side effects.

The user passed: `$ARGUMENTS`

## Step 1 — Resolve scope

Parse `$ARGUMENTS`:
- No arguments → `git diff HEAD` (all uncommitted: staged + unstaged) [default]
- `--staged` → `git diff --cached`
- `--uncommitted` → `git diff`
- `--range <a>..<b>` → `git diff <a>..<b>`
- A path or paths → `git diff HEAD -- <paths>`

Honor any freeform context (e.g. "ignore the test files", "focus on the new module").

Run the appropriate `git diff`. If empty, tell the user "No changes to review." and stop.

Also capture:
- `git status --short` — modified vs new files
- `git rev-parse --show-toplevel` — the repo root

## Step 2 — Dispatch the three reviewers in parallel

In a **single assistant message**, make three `Agent` tool calls:

1. `subagent_type="correctness-reviewer"`
2. `subagent_type="quality-reviewer"`
3. `subagent_type="security-reviewer"`

Each agent gets:

```
mode: local
repo_root: <path>

Scope: <describe: "all uncommitted changes", "staged only", "files X,Y", etc.>

Diff:
<diff>

git status:
<git status --short output>

You have full local tool access (Read, Grep, Glob, Bash). Discover CLAUDE.md (root + nested near changed files), convention files (.editorconfig, .eslintrc*, pyproject.toml, .csharpierrc, stylecop.json), and surrounding code patterns yourself before reviewing.

Return findings as JSON per your output contract.
```

## Step 3 — Aggregate and render

Same report shape as `/pell:three-pass-review`:

```
## Local Review — <scope description>

**Files changed:** <count> (<file1>, <file2>, ...)

### Correctness
**Blockers:** _None._  |  **Major:** _None._  |  **Minor:** _None._  |  **Nits:** _None._
- [severity] `file:line` — finding. **Fix:** …

### Code Quality
**Major:** _None._  |  **Minor:** _None._  |  **Nits:** _None._
- ...

### Security
**Critical:** _None._  |  **High:** _None._  |  **Medium:** _None._  |  **Low:** _None._  |  **Nits:** _None._
- ...

### Counts
- (same as three-pass-review)

### Verdict
<one paragraph>
```

## Step 4 — Offer to apply fixes

Ask the user which severity threshold to fix:

> Apply suggested fixes to your working tree?
> - **blockers-only** — just blocker/critical findings
> - **major+** — blocker/critical + major/high
> - **minor+** — everything except nits (recommended default)
> - **all** — everything including nits
> - **select** — interactively pick findings
> - **no** — exit

Default if user just says "yes": `minor+`. Never apply nits by default.

### Applying a fix

For each finding to apply:

1. **Re-locate the target line by content.** The diff line may have shifted since review. Read the file and find the relevant code by content, not just by line number
2. Use `Edit` (or `MultiEdit` if multiple fixes touch the same file in one batch) to apply the suggested fix
3. If the fix is ambiguous (e.g. "consider extracting this method"), skip it with a note — only apply concrete, mechanical fixes. Never guess
4. After all fixes:
   - Run any obvious test/lint command derivable from the project (e.g. `npm test`, `dotnet test`, `pytest`). Look for clues in `package.json` scripts, a `Makefile`, etc. **If you can't identify one, skip — do not guess.**
   - Show `git diff --stat` so the user sees what changed

Report back:

> Applied N fixes. Skipped M (ambiguous). Failed K (reasons: …).
> <git diff --stat output>

If the user picks `no`, exit cleanly.

## Operator notes

- **Never commit anything.** Modify the working tree only; the user reviews `git diff` and commits when ready
- **Never apply fixes without explicit confirmation**
- If a reviewer agent returns malformed JSON, render its raw output and skip the side-effect offer for that dimension
- Findings from different reviewers may overlap — show both, they're different angles
