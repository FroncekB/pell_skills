# Pell Toolkit Improvements — Implementation Plan

> **For agentic workers:** This is a multi-phase roadmap. Phases 1–2 are fully specified and executable now. Phases 3–5 are scoped with acceptance criteria and a required design-first step (brainstorm → spec) before their command bodies are authored — they are NOT pre-written here because their designs aren't settled, and guessing them would violate the no-placeholder rule. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the documentation drift in the existing toolkit, then fill the two missing halves of the review lifecycle (reviewing others' PRs; responding to review on your own PR) plus a test-coverage review dimension.

**Architecture:** Phase 1 corrects drift in two docs and adds a `from-ticket` hand-off to two existing commands — no new surface. Phases 2–5 add new commands/agents that mirror the established primitive→composite and reviewer-agent patterns; each new MCP-touching command verifies its tool schemas before authoring (per the repo's MCP-verification discipline).

**Tech Stack:** Markdown command/agent/skill files under `plugins/pell/`; Bitbucket + Jira Atlassian MCP servers; validation via `claude plugin validate ./plugins/pell`.

**Authoring discipline (Phases 2–5):** when creating or editing any command, agent, or skill, invoke `superpowers:writing-skills` first (notify-don't-force if absent) — it governs structure, "description-as-trigger," and pre-deployment verification. This is required for every authoring task below (2.1, 2.2, 2.3, 3.3, 4.3, and each Phase 5 item).

**Validation pattern (this repo has no unit-test harness for prompt files):** after editing anything under `plugins/pell/`, run `claude plugin validate ./plugins/pell`, then smoke-test via `/plugin marketplace update pell-skills && /reload-plugins` and invoke the affected command. Commits follow the repo's conventional style (`docs(...)`, `feat(...)`, `chore(pell): bump version`).

---

## MCP capability check (verified 2026-05-28, before planning)

The new phases lean on the two Atlassian MCP servers. Tool schemas were loaded and inspected (not extrapolated from prior usage) to confirm feasibility and surface gaps.

**Jira — `plugin:atlassian:atlassian` (OAuth):** all tools the shipped commands and the new phases need exist with the expected params.

| Tool | Confirmed for | Notes |
|-|-|
| `getAccessibleAtlassianResources` | cloud_id resolution | as used today |
| `atlassianUserInfo` | "who am I" (Jira) | **no params; returns the Jira/OAuth identity only — NOT a Bitbucket UUID** |
| `searchJiraIssuesUsingJql` | my-tickets, triage, standup, release-notes | `cloudId`+`jql` required; `maxResults` ≤ 100 (default 10); `fields[]`; `nextPageToken` paging |
| `getJiraIssue` | release-notes key→summary, related | `fields[]`, `expand`, `responseContentFormat` |
| `getJiraIssueRemoteIssueLinks` | related, from-ticket | external links |
| `getTransitionsForJiraIssue` / `transitionJiraIssue` / `editJiraIssue` / `addCommentToJiraIssue` | start-work, finish-work, triage | unchanged |

**Bitbucket — `atlassian-bitbucket` (API token):**

| Tool | Confirmed for | Notes |
|-|-|
| `bitbucketPullRequest` | address-review, review-queue, release-notes | actions: `create/get/list/merge/approve/request-changes/comment/comments/diff`. `action=comments` lists; `parentCommentId` replies to a thread; `pending` drafts a review comment; `q`/`state`/`pagelen` filter `list`; inline anchor params for posting |
| `bitbucketRepository` | review-queue identity, commit reports | `defaultReviewers` supports `excludeCurrentUser` (server knows the auth'd user) but does **not** return that user's UUID directly |
| `bitbucketWorkspace` | workspace lookup | `list`/`get` |
| `bitbucketRepoContent` | reviewers' `context_source: bitbucket` | file fetch — already used |

**Confirmed gap (drives Phase 4 design):** there is **no Bitbucket "current user" tool** in the MCP surface, and `atlassianUserInfo` returns the Jira identity, not the Bitbucket `{uuid}` that the PR `reviewers` array and any `reviewers.uuid` BBQL filter require. `review-queue` therefore cannot self-identify the current Bitbucket reviewer without one of: a one-time `pell-config.json` value, the `defaultReviewers` ± `excludeCurrentUser` diff trick, or a confirmed BBQL self-token. This is resolved in Task 4.1, not assumed.

**Still to verify at build time (response shapes, not tool existence):** the `action=comments` response fields (Task 3.2) and whether `action=list`'s `q` accepts `reviewers.uuid` server-side (Task 4.1).

---

## Phase 1 — Fixes (do ASAP)

Three corrections. All low-risk. No new commands.

### Task 1.1: Make `plugins/pell/README.md` a thin pointer, not a stale duplicate

**Root cause of the drift:** the plugin README duplicated the command reference, then wasn't updated as commands were added. It documents only the 5 review commands and lists `start-work`/`triage`/`from-ticket`/etc. as "Future additions." The *root* `README.md` is the live, complete reference. Fix the drift at its source: stop duplicating.

**Files:**
- Modify: `plugins/pell/README.md` (full rewrite)

- [ ] **Step 1: Rewrite the plugin README as a short index that defers to the root README for detail.** Keep: a one-line plugin description, a command list grouped by bucket (names + one-liners only), the agent list, the severity-scale table, and a "full reference: see the marketplace root README" pointer. Remove the per-command usage blocks and the entire "Future additions" / "Coming soon" section. Group the command list exactly by the buckets actually shipped:
  - **Review primitives:** `correctness-review`, `quality-review`, `security-review`, (Phase 2 adds `test-review`)
  - **Review composites:** `three-pass-review`, `local-review`
  - **Repo-wide audits:** `repo-review`, `repo-security-review`
  - **Jira ops:** `my-tickets`, `triage`, `related`, `start-work`, `finish-work`
  - **Composers:** `from-ticket`, `wrap-up`
  - **Visual:** `visualize`
  - **Auto-invoked skills:** `frontend-router`, `visual-scratchpad`
  - **Agents:** `correctness-reviewer`, `quality-reviewer`, `security-reviewer`, `repo-quality-reviewer`, `repo-security-reviewer`
- [ ] **Step 2: Validate.** Run `claude plugin validate ./plugins/pell`. Expected: PASS (README is not schema-validated, but this catches accidental frontmatter/structure breakage elsewhere).
- [ ] **Step 3: Commit.**
```bash
git add plugins/pell/README.md
git commit -m "docs(readme): make plugin README a thin index, fix command drift"
```

### Task 1.2: Reconcile the architecture spec with the shipped reality

The spec is declared "the source of truth" in CLAUDE.md but contradicts itself: §8 still describes the abandoned multi-plugin model (`pell-correctness-review` as its own plugin, `/pell-correctness-review:...` invocations, `pell-correctness-review:correctness-reviewer` agents) which §1 overruled. §9's layout omits every command added after migration. The status line claims §4–§7 are "working assumptions to refine."

**Files:**
- Modify: `docs/specs/2026-05-27-pell-skills-architecture.md`

- [ ] **Step 1: Fix §8's table and prose** to single-plugin namespacing. Keep the *principles* (reviewers report, composites act; surface everything with severity; uniform contract; local-FS-default context) — those are implemented and correct. Replace the per-plugin table with the real shape:

| Dimension | Slash command | Agent (`subagent_type`) |
|-|-|-|
| Correctness | `/pell:correctness-review` | `correctness-reviewer` |
| Quality | `/pell:quality-review` | `quality-reviewer` |
| Security | `/pell:security-review` | `security-reviewer` |

  Update §8.1's reference from "each review dimension is its own plugin" framing to "each reviewer is a sibling agent in the one `pell` plugin."
- [ ] **Step 2: Update §9's repo layout** to list all shipped files: commands (`correctness-review`, `quality-review`, `security-review`, `three-pass-review`, `local-review`, `repo-review`, `repo-security-review`, `my-tickets`, `triage`, `related`, `start-work`, `finish-work`, `from-ticket`, `wrap-up`, `visualize`), agents (add `repo-quality-reviewer`, `repo-security-reviewer`), skills (`frontend-router`, `visual-scratchpad`), and `hooks/hooks.json`.
- [ ] **Step 3: Update the status line and build order.** Change the top status from "draft (§4–§7 working assumptions)" to "implemented — see §12." Add a short **§12. Implementation status** section: a one-line note that Buckets 1–3 plus repo-audits and the visual scratchpad shipped, and that this improvements plan (`2026-05-28-pell-toolkit-improvements-plan.md`) tracks the remaining gaps.
- [ ] **Step 4: Commit.**
```bash
git add docs/specs/2026-05-27-pell-skills-architecture.md
git commit -m "docs(spec): reconcile architecture spec with shipped single-plugin layout"
```

### Task 1.3: Offer `from-ticket` as a hand-off from `my-tickets` and `triage`

Both commands chain only into `start-work` (branch only), never the richer `from-ticket` (branch + brainstorm + plan). Add `from-ticket` as a second hand-off so the ticket-pick can go straight to design.

**Files:**
- Modify: `plugins/pell/commands/my-tickets.md` (Step 5)
- Modify: `plugins/pell/commands/triage.md` (Step 5 action menu)

- [ ] **Step 1: `my-tickets` Step 5** — change the chain prompt from a single start-work hand-off to a depth choice. New prompt: `Start work on one of these? Enter a number for branch-only (/pell:start-work), or "<number> plan" to also brainstorm + plan (/pell:from-ticket). "n" to skip.` Parse a trailing `plan`/`design` token on the picked number → invoke `/pell:from-ticket <KEY> <forwarded context>`; bare number → `/pell:start-work <KEY> <forwarded context>` (unchanged). Preserve the existing pass-through of pre-authorizations.
- [ ] **Step 2: `triage` Step 5 action menu** — add one line: `d = design (claim + /pell:from-ticket)` beneath the existing `s = start work` line. Behavior for `d`: claim with the same y/n gate as `c`/`s`, then invoke `/pell:from-ticket <KEY>` with leftover freeform context. Update the menu's documented choices in the operator notes accordingly.
- [ ] **Step 3: Validate.** `claude plugin validate ./plugins/pell` → PASS.
- [ ] **Step 4: Smoke-test.** `/reload-plugins`, run `/pell:my-tickets` and `/pell:triage <KEY>`, confirm both new hand-off paths dispatch the right command. (If no live Jira, at minimum confirm the prompts render and parse the `plan`/`d` tokens.)
- [ ] **Step 5: Commit.**
```bash
git add plugins/pell/commands/my-tickets.md plugins/pell/commands/triage.md
git commit -m "feat(jira-ops): offer from-ticket hand-off from my-tickets and triage"
```

**Phase 1 acceptance:** plugin README lists every shipped command; the architecture spec has no internal contradiction about plugin count or layout; picking a ticket in `my-tickets`/`triage` can route to either `start-work` or `from-ticket`.

---

## Phase 2 — Test-coverage review dimension

Add a fourth review dimension. Today nothing asks "are these changes adequately tested?" — a gap that matters given the team's mock/prod-divergence lesson. Mirror the existing primitive + agent + composite-wiring pattern exactly.

### Task 2.1: Create the `test-reviewer` agent

**Files:**
- Create: `plugins/pell/agents/test-reviewer.md`

- [ ] **Step 1: Write the agent**, mirroring `agents/quality-reviewer.md`'s structure (same Inputs / Context-discovery / Output-format sections, same `local`|`bitbucket` context-source handling, same 4000-char cap, same trailing-JSON contract). Frontmatter:
```yaml
---
name: test-reviewer
description: Reviews a code change for test adequacy — does new/changed behavior have tests, do the tests actually assert the behavior (not tautological/mock-only), are edge and error paths covered, are there flaky patterns. Returns ALL findings including nits. Use as part of /pell:test-review, /pell:three-pass-review, or /pell:local-review.
model: inherit
---
```
  **What it looks for:** (1) new/changed behavior with no test at all; (2) tests that would still pass if the code were broken (assertion-free, tautological, asserting on mocks instead of behavior) — call this out explicitly, it's the mock/prod-divergence trap; (3) happy-path-only coverage (missing edge cases, error paths, boundary values); (4) flaky patterns (time/ordering/network dependence, shared mutable fixtures); (5) tests in the wrong layer (unit test that should be integration to catch the real failure). **What it does NOT look for:** impl correctness (correctness-reviewer), style (quality-reviewer), security (security-reviewer). **Context discovery:** locate the test framework + where tests live (mirror quality-reviewer's convention-file discovery; add `*.spec.ts`/`*.test.ts`, `*Tests.cs`/`*_test.go`/`test_*.py` location detection).
  **Severity scale:** `major` (untested critical new logic, or a test that can't fail) / `minor` (happy-path-only, missing edge cases) / `nit` (test naming, arrange-act-assert clarity, fixture hygiene).
- [ ] **Step 2: Validate.** `claude plugin validate ./plugins/pell` → PASS.
- [ ] **Step 3: Commit.**
```bash
git add plugins/pell/agents/test-reviewer.md
git commit -m "feat(review): add test-reviewer agent for test-adequacy dimension"
```

### Task 2.2: Create the `/pell:test-review` primitive command

**Files:**
- Create: `plugins/pell/commands/test-review.md`

- [ ] **Step 1: Write the command** by copying `commands/correctness-review.md` and swapping the dimension: dispatch `subagent_type="test-reviewer"`, render a report titled `## Test Coverage Review` with `### Major / ### Minor / ### Nits` sections (no blocker tier — test gaps aren't production blockers). Keep the identical scope/context-source parsing, the PR-vs-local detection, the Jira-context fetch in PR mode, and the read-only hand-off (Step 5). Frontmatter `description` and `argument-hint` mirror correctness-review's shape.
- [ ] **Step 2: Validate** → PASS.
- [ ] **Step 3: Commit.**
```bash
git add plugins/pell/commands/test-review.md
git commit -m "feat(review): add /pell:test-review primitive"
```

### Task 2.3: Wire the test dimension into the composites

**Files:**
- Modify: `plugins/pell/commands/three-pass-review.md` (Step 5 dispatch, Step 6 render, Step 1 parse)
- Modify: `plugins/pell/commands/local-review.md` (Step 2 dispatch, Step 3 render, Step 1 parse)

- [ ] **Step 1: Make it a 4th parallel agent, on by default, suppressible.** In both composites' parse step, recognize `skip tests` / `no test review` → omit the test pass. Otherwise dispatch `test-reviewer` alongside the existing three in the same single-message parallel `Agent` block.
- [ ] **Step 2: Add a `### Test Coverage` section** to both report templates (after `### Security`), with `Major / Minor / Nits` sub-lines, and add a Test line to the `### Counts` block. The composites are no longer "three-pass" in dimension count — keep the command name (renaming is churn) but update the in-report heading to not claim a fixed number. Update `three-pass-review`'s top-of-file framing sentence accordingly.
- [ ] **Step 3: Update the README** (root + the now-thin plugin index from Task 1.1) to list `test-review` and note the composites include a test pass by default (suppress with `skip tests`).
- [ ] **Step 4: Validate** → PASS. **Smoke-test:** run `/pell:local-review` on a diff that adds untested logic; confirm the Test Coverage section appears and flags it; run `/pell:local-review skip tests` and confirm it's omitted.
- [ ] **Step 5: Commit.**
```bash
git add plugins/pell/commands/three-pass-review.md plugins/pell/commands/local-review.md README.md plugins/pell/README.md
git commit -m "feat(review): add test-coverage pass to three-pass and local review composites"
```

**Phase 2 acceptance:** `/pell:test-review` works standalone in PR and local mode; both composites include a Test Coverage section by default and omit it on `skip tests`; the agent reuses the standard JSON contract so future composers can dispatch it.

---

## Phase 3 — `/pell:address-review` (respond to review on your PR)

The missing receiving end of review. `three-pass-review` *posts* comments; nothing pulls them back to triage and address. **Confirmed feasible:** `bitbucketPullRequest action=comments` lists comments, `parentCommentId` replies to a thread, and the `local-review` fix-application machinery (re-locate by content, Edit, never auto-commit) is directly reusable.

**This phase requires a design pass first** — the comment-grouping UX and the "what counts as addressed" model are genuine design questions. Do not author the command body before the spec exists.

- [ ] **Task 3.1: Brainstorm + write the design spec.** Use `superpowers:brainstorming` (notify-don't-force if absent) → `docs/specs/2026-05-28-pell-address-review-design.md`. Resolve the open questions below.
- [ ] **Task 3.2: Verify the `action=comments` *response* shape** (the tool itself is confirmed in the MCP matrix). Make one real call and confirm the response exposes: comment id, inline anchor (path + line), author, resolved/outdated state, and thread/parent linkage. Confirm whether resolved comments can be filtered server-side or must be filtered client-side. Record findings in the spec.
- [ ] **Task 3.3: Write `plugins/pell/commands/address-review.md`** per the approved spec, mirroring `local-review`'s fix-application section. Validate + smoke-test against a real PR with open comments.
- [ ] **Task 3.4: Update both READMEs; commit per task.**

**Open design questions (resolve in 3.1):**
- Scope of comments: all open / unresolved-only / since-last-push / by-author? Default?
- Per-comment actions: apply suggested fix (reuse local-review machinery) · reply on the thread (`parentCommentId`) · mark addressed · skip. How is "addressed" signaled back — a reply, a resolve, or nothing?
- Does it offer to push the fix commit, or stop at working-tree edits like `local-review`? (Lean: stop at working tree; pushing is `finish-work`'s job.)
- Pairing with `wrap-up`: is `address-review` a standalone command, or also a stage in a future "iterate on review feedback" composer?

**Phase 3 acceptance:** from a PR with open inline comments, the command lists them grouped sensibly, applies mechanical fixes in-place (never auto-committing), and can reply on threads — all gated on confirmation.

---

## Phase 4 — `/pell:review-queue` (PRs awaiting your review)

The missing "review others" entry point. Mirrors `my-tickets`/`triage` but for the reviewer role: list open PRs where you're a requested reviewer, then chain into `/pell:three-pass-review` on the one you pick.

**This phase requires a design + verification pass first** — feasibility hinges on two unknowns surfaced during planning.

- [ ] **Task 4.1: Resolve the two blockers confirmed during the MCP check before committing to a design.**
  - **Current Bitbucket user identity (confirmed gap):** the MCP matrix established there is no Bitbucket current-user tool, and `atlassianUserInfo` returns the Jira identity, not the Bitbucket `{uuid}`. Pick a resolution path and record it: (a) one-time `bitbucket.user_uuid` in `pell-config.json` (re-promptable via `--reset`); (b) derive by diffing `defaultReviewers` with vs. without `excludeCurrentUser`; (c) a BBQL self-token if one is confirmed to exist. Option (a) is the safe default unless (c) checks out.
  - **Reviewer filtering:** make a real `action=list` call to confirm whether the `q` BBQL accepts `reviewers.uuid="{...}"` (combined with `state=OPEN`). If not filterable server-side, design the client-side filter (list OPEN PRs, inspect each PR's reviewer participation).
- [ ] **Task 4.2: Brainstorm + write `docs/specs/2026-05-28-pell-review-queue-design.md`** once 4.1 resolves feasibility. Decide: which repo(s) to scan (cwd origin only, or a configured set?), how to present (group by age / by repo / by author?), and the chain target (default `three-pass-review`; offer `correctness-review` etc. as lighter passes?).
- [ ] **Task 4.3: Write `plugins/pell/commands/review-queue.md`** per the spec, mirroring `my-tickets`' list-then-chain structure. Validate + smoke-test.
- [ ] **Task 4.4: Update both READMEs; commit per task.**

**Phase 4 acceptance:** lists open PRs the user is requested to review (current-repo origin at minimum), and picking one dispatches a review composite against it.

---

## Phase 5 — Second-tier backlog (each gets its own brainstorm → spec → plan)

Not detailed here; these are independent features that each warrant their own cycle once Phases 1–4 land. Listed so the roadmap is complete.

- **`claude-md-init`** — scaffold a project `CLAUDE.md` from a Pell template (.NET/React/Bitbucket/Jira conventions, the severity vocab). Promised in the original architecture build order (§10.6) and the root README "Coming soon" but never built. Could notify-don't-force toward the third-party `claude-md-management` plugin, or ship a genuine Pell template.
- **`/pell:standup`** — synthesize `my-tickets` + recent git activity + open PRs into a standup blurb. Pure read-composition over existing MCP calls; no new side effects.
- **`/pell:release-notes <ref>..<ref>`** — GitFlow-aware: list merged PRs between two refs, resolve each PR's Jira key, fetch ticket summaries, group by type. Composes git + Bitbucket + Jira reads.

---

## Self-review notes

- **Spec coverage:** every item from the analysis maps to a task — README drift (1.1), spec drift (1.2), my-tickets/triage→from-ticket (1.3), test dimension (2.1–2.3), address-review (Phase 3), review-queue (Phase 4), claude-md-init/standup/release-notes (Phase 5).
- **No fabricated command bodies for unsettled designs:** Phases 3–5 deliberately stop at scope + acceptance + a design-first task rather than inventing prompt text that brainstorming hasn't validated. That is intentional, not a placeholder gap.
- **Naming consistency:** new `subagent_type="test-reviewer"` and `/pell:test-review` match the existing `<dimension>-reviewer` / `/pell:<dimension>-review` convention.
- **Convention adherence:** plans saved under `docs/specs/` (repo convention) rather than the writing-plans default `docs/superpowers/plans/`; commits use the repo's conventional-commit scopes; validation uses `claude plugin validate` + the reload loop, since there is no prompt-file test harness.
