# Trial 1 results: the fictional SOW

**Passed**, with four deviations from the plan, listed below. Every pass criterion holds. The trial found 116 gaps in the skill's instructions, 16 in the design steward's role file, 7 slips in the pack it wrote and 27 framework defects. Each is listed with file:line in `trial-1-notes.md`, and the fix tasks are at the end of this file.

Run on 2026-11-16 with the skill at Pell_Skills `design-intake` bb3e0ad and the framework at its `design-intake` branch, 9e0ff9b. The fork was made by the fork tool as Brightfold Linen (`BrightfoldLinen`). It is local only and was never pushed. The client site wasn't fetched, because `example.com` doesn't resolve; the README expects that.

## Deviations

- **Stages ran as subagents.** Headless `claude -p --plugin-dir` couldn't run, because the CLI isn't signed in here. Each stage ran as a subagent playing the skill and the stage's agent from the branch's files. That tests every stage's procedure and output, but not the plugin's loading or triggering, which `claude plugin validate` covers. It is also why the run log says "unknown tokens" and no notification was sent.
- **Checkpoint 1 was answered by Claude.** Brandon handed it over ("You can do it"). Claude corrected one guess (one invoice per customer per month, with no depot) and one entity name (Par change request became Par request).
- **Stage 5's gate was narrowed.** The field and institutional demo themes can't print the client's wide lists, and stage 5 may not edit a demo theme. The gate counted the direction themes, plus the fingerprint across all themes. The demo themes' failures were recorded.
- **Stage 7 prototyped workflow 1 only.** Brandon chose that for cost. It covers Today's route, Stop counts, Dispatcher Review and Stop review. The other 14 hand-built screens stay `planned` for the build. Stage 8 still wrote scenarios for every workflow.

## Pass criteria

|Criterion|Result|Evidence|
|-|-|-|
|Every pack file matches its format|Passed, 7 minor slips|PK-1 to PK-7: a Blocks with no matching Depends on, two system steps with no persona, five statuses missing from the glossary, stale counts|
|Every Source line exists|Passed|84 requirement, 57 glossary and 4 brief citations; all 84 requirement citations were read against the SOW|
|The beyond-SOW requirement is REQ-0.1, on the sheet|Passed|requirements.md:76, intake-sheet.md:13|
|Both conflicts are in the disagreement section|Passed|AG Grid at intake-sheet.md:34, depot and location scoping at :35|
|The corrections show in the specs and `decisions.md`|Passed|checked after stage 3|
|The directions pass the fingerprint|Passed, under the narrowed gate|the three directions are at least 6 measures apart|
|No screen shows "Orders"|Passed|"order" appears only in the shared components' Storybook copy|
|Each stub answers 501|Passed|10 stubs, each with 401, 403 and 501 tests|
|Every acceptance scenario is tagged and marked|Passed, with a defect|43 scenarios tag all 51 in-scope acceptance requirements. 35 are marked; 8 already pass, so they lose the mark as stages.md says. Every Driver scenario stops at sign-in (S8-F1), so it fails for the wrong reason.|
|Every check passes after stages 3, 6, 7 and 8|Passed|after stage 8: build 0 warnings, unit 865, integration 880, lint, typecheck, npm test 3115, check:api, screens 473, e2e 90 (35 expected failures), generate --check|

## Time and tokens

|Stage|Agent minutes|Tokens|Fork commit|
|-|-|-|-|
|1 Sources|1|98k|cd600ed|
|2 Extract|20|292k|0237473|
|3 Generate|108|456k|f795508|
|4 Brief|7|205k|6dc3747|
|5 Directions, with one steward review and one revision|106|875k|5ea3519|
|6 Lock|30|357k|0d0e3cc|
|7 Prototype, 4 of 18 screens, with three steward reviews|152|1,270k|faefd55|
|8 Acceptance, 7 workflows|67|470k|5a00b31|
|Total|491|4,022k||

Tokens are the per-agent counts the app reports when each agent finishes. For a long-running agent the count tracks its context as it grows, so it understates what was billed. Use it to compare stages, not to price a run.

At the same rate, stage 7 for all 18 screens would take about 11 hours and 5.7M tokens. That makes it the stage to budget for.

**The engineer's time at the checkpoints:**
- **Checkpoint 1:** the sheet was ready, and Brandon handed it over 10 minutes later. The corrections took Claude a few minutes.
- **Checkpoint 2:** Brandon picked about a minute after the directions were shown. The pick was one line: "A, with B's headings".

## What matters most

1. **The Driver's acceptance scenarios can never pass** (S8-3, S8-F1). `signInWithRole` waits for the home page's "Signed in as" line, but stage 7 sends a driver from the home page to Today's route. Every Driver scenario fails at sign-in, so the expected-failure gate passes for the wrong reason and will keep failing after the build.
2. **Nothing checks that a marked scenario fails at the unbuilt part** (S8-5). A test under `test.fail()` that times out counts as unexpected (S8-4, S8-F2).
3. **Acceptance scenarios leave people behind** (S8-16, S8-F5). At 50 active people, five generated CSP specs fail. The trial's scenarios now deactivate the people they make.
4. **Stage 5's every-theme gate is impossible with the demo themes** (S5-15, S5-F3).
5. **Stage 7's rules leave too much to judgment** (S7-1, S7-3, S7-S1, S7-S5, S7-17):
   - what a unit is
   - whether an endpoint needs a new permission
   - when the steward's notable findings flag a unit
   - where findings with no flag go
6. **Links:** the skill says the generator can't write links, but `type: link` works (S2-1).
7. **Migrations:** an agent can't delete migrations, so `Initial` can't be regenerated, and stage 3 added migrations instead (S3-3).
8. **The screens harness signs in as an administrator** (S3-10, S5-4, S5-F2), so no capture shows the home page any persona sees.

## Fix tasks

- [ ] **Task 16a: fix the skill.** On Pell_Skills `design-intake`, fix every S-, S-S and PK item in `trial-1-notes.md`. Then run `claude plugin validate ./plugins/pell`, bump the version and have the fix reviewed.
- [ ] **Task 16b: fix the framework.** On the framework's `design-intake` branch, fix these defects, each with a test:
  - S3-15 to S3-24 and S3-27
  - S4-F1 and S4-F2
  - S5-F1 to S5-F4
  - S6-F1 and S6-F2
  - S7-F1 to S7-F3
  - S8-F1 to S8-F5
  - and stop `sources add` from catching OperationCanceledException

  Some of these were fixed in the trial fork's own copy. The framework still has them all.
- [ ] **Trial 2 (Task 17) confirms both.** Its Driver scenarios stop at the unbuilt part, not at sign-in. Its stage 5 runs every theme. Its run log records tokens.
