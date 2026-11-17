---
name: repo-standup
description: Use when starting or continuing a repo-standup run that builds a client project from the Pell Web App Framework end to end, such as /pell:repo-standup, "start repo standup" or "continue the build".
---

# Repo standup

Builds a client project from the Pell Web App Framework end to end: it forks the framework for the client, runs design intake, builds every requirement one unit at a time, hardens the result, and writes the handoff for the Pell engineer who will own the project. Everything it writes is internal. The client sees nothing until that engineer has reviewed it.

The session is the conductor. Each invocation works out where the run stands from the fork's files alone, never from a transcript, and carries on until it has to stop. Every later session takes the same prompt, `/pell:repo-standup`, opened in the fork's folder with auto mode on.

`<skill>` is `${CLAUDE_PLUGIN_ROOT}/skills/repo-standup`, `<Code>` is `client.yaml`'s `name.code`, and pack paths are under `docs/project/`.

## Where the run stands

First, load the deferred tools in one ToolSearch call, `select:PushNotification,Monitor,mcp__ccd_session_mgmt__get_usage`. A tool that doesn't load is missing. Then read this table from the top, at every invocation. The first row that holds decides.

|When|Next|
|-|-|
|No `client.yaml` and `docs/project/` at the repository root|Phase 1, then setup|
|`status.md` holds no `Phase:` line|Setup. A guard check that fails doesn't stop this session.|
|The guard check (Every session) fails|Stop: `guard not loaded; open a new session in the fork folder`|
|`HEAD` is on `unit/U-<n>` or `perf/smoke`, or a `queue.md` row is `in progress`|That attempt, or that hardening pass, starts over (`loop.md`, "An interrupted attempt")|
|`Phase:` is `intake`, `foundation`, `design` or `prototype`|Design intake, phases 2 to 5|
|`queue.md` holds no unit|Build the queue (`loop.md`); phase 6|
|The scoreboard names a movable unit|The work loop (`loop.md`, "One unit")|
|Nothing movable, and no hardening pass yet or units merged since the last|Phase 7 (`loop.md`, "Hardening")|
|Nothing movable, and the last hardening pass saw every merged unit|Phase 8, then phase 9|

**The Phase line** follows the run. Design intake's stages set `intake` to `prototype` (Phases 2 to 5), and its `done` sets `workflows`. A hardening pass sets `hardening`, phase 8 `staging`, and phase 9 `handoff`. When the loop moves a unit while `Phase:` is `staging` or `handoff`, as after a resume, it sets `workflows` again. Each change is a phase end (Stops, alerts and question batches).

A run is never closed. `State: done` means only that nothing could move when it stopped. The next session runs the scoreboard again, and when an answer or an engineer's edit has made a unit movable, the loop resumes and the handoff is rewritten at the next stop.

## Phase 1 and setup

**Phase 1.** Run `/pell:init-client-repo` with the invocation's arguments. It asks its own yeses, and sets the Bitbucket branch restrictions itself. Then work in the folder its report names. Keep its `Branch rules` line, with the manual settings when it says `not set`, and repeat it to the engineer at the session's end. If the engineer meant an existing fork, tell them to open the session in that folder instead.

**Setup**, once per fork, in this order. The guard goes live from `.claude/settings.local.json` and then denies reads and writes under `.git/` and `.claude/`, so that file is written last, and a setup that finds the guard live skips the install.
1. Ask the engineer for an optional stop date (`yyyy-MM-dd`).
2. Run the guard check's canary (Every session, step 1). A deny with the canary's reason means an earlier setup installed the guard and this session loaded it: go to step 9. Decide this by the canary alone, never by reading the guard's files.
3. Run `git config --get core.hooksPath`. When it prints a value, git would skip the pre-push hook: stop, write nothing, and ask the engineer to unset it and type the prompt again.
4. Copy `<skill>/hooks/guard.mjs`, `shell-words.mjs`, `protected-paths.mjs` and `pre-push.mjs` into `.claude/repo-standup/`, with `cp`.
5. Write `client.yaml`'s `repository.bitbucket` (`<workspace>/<slug>`) as the only line of `.claude/repo-standup/client-repo`. Both guard layers read the allowed repo from there alone; with no such file every push is denied.
6. Copy `<skill>/hooks/pre-push` to `.git/hooks/pre-push`, and `chmod +x` it.
7. Add `.claude/repo-standup/` and `.claude/settings.local.json` to `.git/info/exclude`, each on a line of its own unless it's there, so neither reaches the client repo.
8. Copy `<skill>/hooks/settings.local.json` to `.claude/settings.local.json`. When that file exists, add the hook entry to its `PreToolUse` list unless it's there, and keep the rest.
9. Write `status.md` as `formats.md` says: the phase design intake's signal table points to (`intake` for a new fork), `State: running`, `Unit: none`, the stop date or `none`, `Next: none`. Commit it as `Repo standup: setup`.
10. The notification check.

Then call design intake. The session that ran setup never pushes, and ends at checkpoint 1 at the latest, or right after setup when design intake is already past it. At its end, tell the engineer to open every later session in the fork's folder with auto mode on, since a session loads the guard only from the folder it starts in.

## Every session

Once the fork exists and setup is done, each invocation runs these, then goes on down the table above:
1. **The guard check**, unless this session ran setup. Run exactly `git push --force --dry-run repo-standup-guard-check main` with the Bash tool. It is a canary the guard must refuse, and since that remote doesn't exist, nothing reaches the network. A deny whose reason is `repo-standup guard: canary` means the guard is loaded. Anything else, git's "does not appear to be a git repository" included, means it isn't: write `State: stopped: guard not loaded; open a new session in the fork folder`, append the `stopped` line, send `formats.md`'s guard-stop notification and append its `notified` line, commit as `Repo standup: stopped`, push nothing, and end the turn. With the guard not loaded, nothing denies those writes.
2. **The notification check**, when the last `notified` line in `run-log.md` ends with `; chat only`.
3. A read of `status.md`. Keep the State it holds as the session's starting State. As soon as the session goes on past the guard check to run anything, set `State: running`, and commit `status.md` alone as `Repo standup: status` (the command is in Phases 2 to 5), never inside the engineer's edits.

**The notification check.** Send one test `PushNotification`, `Repo standup: test notification`. When the tool reports mobile push disabled, or is missing, tell the engineer to turn mobile push on in Claude Code's config (`/config`) and connect Remote Control. Carry on either way: until a notification sends, each message also goes in chat and its `notified` line ends with `; chat only`. The test itself writes no `notified` line.

## Phases 2 to 5: design intake

Call design intake once per stage, with the Skill tool (`pell:design-intake`), passing `from repo-standup` in its arguments, and on its first call any SOW files, site URL or brand files this invocation named. Before each call, set `State: running` and commit a changed `status.md` alone (`git commit -m "Repo standup: status" -m "<the co-author line>" -- docs/project/status.md`), so design intake never takes it for the engineer's edit. Once stage 3 has passed, and while the tree is clean, fetch and rebase first (Where the engineer answers, step 2). In these phases design intake commits the engineer's edits itself. Read the outcome line that ends each call:

- `design-intake: ran stage <n> <name>`: set `Phase:` from the stage (1 and 2 intake, 3 foundation, 4 to 6 design, 7 and 8 prototype), and call it again.
- `design-intake: waiting on <path>`: write `State: waiting on <path>`, with the phase from the path (`intake-sheet.md` is intake, `design/directions/README.md` is design), commit, and end the turn. Design intake has sent the checkpoint notification when its stage ran in this session: when the session's starting State wasn't already `waiting on` that path, append a `notified` line through the highest question number.
- `design-intake: done`: set `Phase: workflows`, and go to phase 6.
- `design-intake: stopped: <reason>`: stop with `design intake stopped: <reason>`. A later session calls design intake again, and it retries.
- No outcome line: read design intake's signal table ("Find the next stage" in its `SKILL.md`) and act on the first row that holds: a Wait row as `waiting on` the file it names, "None of these" as `done`, any other by calling again. Two calls in a row that end with no outcome line and no new commit stop the run with `design intake stopped: no outcome line`.

Never run design intake's stages or dispatch their agents yourself. Stages 7 and 8 run their own units, with their own park rule.

## Phases 6 and 7: the work loop

`references/loop.md` holds the procedure: the queue, one unit, the implementer's brief, the risk paths, the review table and models, parks, the integration-gap audit and hardening. The rules:
- One unit at a time, in the fork's own checkout. Each unit is implemented, checked, reviewed and merged before the next starts.
- Done is computed by the scoreboard from test results and files. A worker's claim is never a pass.
- Keep the conductor's context small: re-read `status.md` at the start of each unit, read only the pack slices a unit needs, and give workers paths, not contents.
- The conductor is the session's model. Each worker's tier is passed as the Agent tool's `model`.

## Phases 8 and 9

**Phase 8.** Set `Phase: staging`, and add `Staging: skipped, no Azure module` to `status.md`. Staging's `phase` line, written when phase 9 begins, says `staging skipped, no Azure module`. The deploy waits for the Azure module.

**Phase 9.** Set `Phase: handoff`, and write the handoff as `references/handoff.md` says, with the `handoff-writer` agent. It ends with the commit, the push, the stop notification and `State: done`. Its stop reason, `State` and notification wording are in `references/handoff.md`.

## Where the engineer answers

The engineer answers in the fork's working tree, or anywhere else and pushes to `main`. At each unit boundary, on `main`, in this order:
1. Commit uncommitted edits under `docs/project/` as `Repo standup: the engineer's edits`. A rewritten `scoreboard.md` isn't one: restore it. An uncommitted file anywhere else was written by no unit: stop with `an uncommitted file no unit wrote: <path>`.
2. When `origin` is the client repo, `git fetch origin`. When `origin/main` holds commits `main` lacks, `git rebase origin/main`, which moves the run's unpushed commits on top, or fast-forwards when there are none. A rebase conflict: `git rebase --abort`, and stop with `main diverged`.

A push at merge rejected because the engineer pushed meanwhile takes the same path: `git fetch origin`, then `git rebase origin/main`. Run the checks again when the incoming commits touch anything outside `docs/project/`, then push. A rebase conflict, or checks that fail after the rebase, stop the run with `main diverged`.

## Commits and pushes

- Every commit the conductor makes, and every worker commit whose subject it names, uses a message from `formats.md`, given with `-m`, one per paragraph. Each ends with the co-author line the session was given for its commits, as a last `-m "<the co-author line>"`. The fork's `CLAUDE.md` names no line of its own, so when the session was given none, the message ends without one. Design intake's stage commits keep design intake's own messages.
- On `main` the conductor commits only bookkeeping. A unit's code reaches `main` only through `git merge --ff-only`.
- The only push is `git push origin main`, exactly, alone in its command: never forced, never another branch or remote. It is a standing yes, the run's only outward action.
- No push before design intake's stage 3 has passed (`run-log.md` has its stage 3 line), and none in a session whose guard check hasn't passed.
- When `origin` is missing or isn't the client repo (`git remote get-url origin` against `repository.bitbucket`), skip every fetch and push, say so in the run-log note, and carry on.

**Commands the guard denies.** Never write them. They hold for everything the session runs, design intake's stages included, and every worker's brief points here.
- `git -c`, `git --no-pager`, or any git global option but `-C`
- `git clean`
- `cd` into `.claude`, and any read or write under `.git/` or `.claude/` once setup is done, except `.git/pell-repo-standup.diff`
- a heredoc or `$(...)` in a commit message: use `-m`
- `$(...)` in any git command's arguments: run `git rev-parse` first, then write its value
- any push but `git push origin main` alone in its command, and `--no-verify` anywhere

Also: never a foreground `sleep`. A wait uses a background command and its completion notice, or Monitor. PowerShell 5.1 has no `&&`: chain on success as `cmd1; if ($?) { cmd2 }`.

## Stops, alerts and question batches

The scoreboard computes the numbers (`loop.md`, "Terms"). The conductor judges the rest.

|Stop|From|Then|
|-|-|-|
|`stop: nothing-movable`|the scoreboard|Phase 7 while a hardening pass is due (the table above); then phases 8 and 9, and `State: done`|
|`stop: env-broken`, or a second `failed-env` line on any unit since the last `merged`, `parked` or `attempt-failed` line|the scoreboard, `run-log.md`|Stop: `failed-env twice in a row, <the failing check>`|
|`stop: parks-in-a-row`|the scoreboard|Stop: `3 parks in a row`|
|Today is past `Stop date`|`status.md`, at each unit boundary|Finish the current attempt, then write the handoff (`references/handoff.md`), which stops with `the stop date has passed`|
|`design-intake: stopped: <reason>`|design intake|Stop: `design intake stopped: <reason>`|
|The usage limit|the platform|Nothing: state is committed at each unit boundary, and an interrupted attempt starts over|

**To stop:** send the question batch when `sinceNotified.questions` is above 0; write `State: stopped: <reason>` and append the `stopped` line; send the stop notification and append its `notified` line; commit as `Repo standup: stopped`; push under the rules above, except after `main diverged`, whose push would be rejected, so it pushes nothing; end the turn, telling the engineer the reason and what would let the run move. The notification comes before the commit so that its `notified` line is committed. At the stop date, the handoff's final sequence does the commit, the push and the notification.

**A stop already reported.** A session whose starting State is `stopped: 3 parks in a row` or `stopped: failed-env twice in a row, ...` takes the prompt as the engineer's go-ahead. It sets `State: running`, and until the next `merged` line ignores that stop's old trigger from both sources, the scoreboard's `stop` and the `run-log.md` rule in the table above, so the first unit boundary doesn't stop again for the old reason. Before that `merged` line, one new line of the same kind stops the run again: after `3 parks in a row`, a new `parked` line; after a `failed-env` stop, a new `failed-env` line. So a broken environment costs one more try, not a loop. A session that starts with the stop date passed runs nothing and asks the engineer to change or clear the `Stop date` line.

**Alerts** send a notification and carry on, in `formats.md`'s wording:
- each entry in `alerts`: `blocked-over-30`, and `parked-twice U-<n>`
- a high or critical security finding, the skill's own `security` alert, once per finding

**Question batches.** When `sinceNotified.questions` is above 0, one notification, `<n> questions added; the riskiest: Q-<n>, <question>`, goes out: when `batchDue` is true (every 10 merged units), at each phase end, and at every stop. The riskiest is the one with the highest Risk, then the one that blocks the most requirements.

**A phase end.** Each time `status.md`'s Phase changes (The Phase line, above), append a `phase` line for the phase that ended, `<phase> ended`. It carries only tokens that no other line counts, so the cost tables can sum every line. Then send the batch when one is due.

**Notifications** use `PushNotification`: one line, under 200 characters. Each one sent appends a `notified` line, `through Q-<n>; alerts: <list or none>`. `Q-<n>` is the highest question it covers, the last line's when it covers none. The list names the alerts it carried, plus each `parked-twice U-<n>` the last `notified` line named, so the scoreboard doesn't raise that one again. When the tool is missing or doesn't send, the message goes in chat, and the note ends `; chat only`.

## Never wait on the client

The run never waits on the client or shows the client anything. Every question carries a guess, and the build goes on with it. The only waits are design intake's two checkpoints, which wait on the engineer. The engineer may walk the client through the prototype by screen share; the run doesn't wait for that either.

## An exception to the read-only default

Pell commands gate each side effect on a `(y/n)`. This skill writes, commits and pushes inside the fork it runs in without asking: the invocation is the yes, and pushing to the client repo's `main` is a standing yes. Its only other side effects go through `/pell:init-client-repo`'s own gates.

## References

- `<skill>/references/loop.md`: the work loop and hardening.
- `<skill>/references/formats.md`: `status.md`, `queue.md`, `known-gaps.md`, `reviews.md`, the run-log line, the notification wordings and the commit messages.
- `<skill>/references/handoff.md`: the handoff package and its final sequence.
- `${CLAUDE_PLUGIN_ROOT}/skills/design-intake/references/formats.md`: `requirements.md`, `open-questions.md`, `decisions.md`, `workflows.md` and `integrations.md`.
- `<skill>/hooks/`: the push guard setup installs. `<skill>/rates.json`: the prices `scoreboard --cost` reads.
