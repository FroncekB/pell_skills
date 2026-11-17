# Repo standup formats

These are the files the run keeps in the client fork's `docs/project/`, and the messages it sends. The framework's `scoreboard` command parses most of them, so the shapes below are exact. Everything here is internal: the reader is the Pell engineer who owns the project.

Rules for all files:

- Plain text. No emoji or glyphs.
- Markdown tables use the minimum separator row (`|-|-|`, one hyphen per column). Every row starts and ends with `|`.
- A `|` inside a cell is written `\|`. The reader unescapes it. A raw `|` adds a cell, so the row is reported as a diagnostic and dropped.
- The reader takes the first pipe table in a file. Nothing above a table's header may start with `|`.
- A field with a list of allowed values holds one of them and nothing after it.
- A list cell is comma separated. An empty cell and `none` both mean no items.
- IDs are never reused or renumbered.
- No client name anywhere a file might leave the fork.

`requirements.md`, `open-questions.md`, `integrations.md` and `decisions.md` use design intake's formats unchanged, in `plugins/pell/skills/design-intake/references/formats.md`. The orchestrator appends to `open-questions.md` and `decisions.md` and never rewrites them. It edits `requirements.md` only for an answer or an engineer's edit, as design intake's rules for that file allow. The same escape rule holds in `requirements.md`: a `|` in a cell is `\|`.

## status.md

Read first by every session. Kept short. The lines come in this order, one each:

```
# Status

- Phase: intake
- State: running
- Unit: U-4, attempt 2, branch unit/U-4
- Stop date: 2026-11-20
- Staging: skipped, no Azure module
- Updated: 2026-11-16 14:05
- Next: U-5, U-7, U-8
- Scoreboard: 3 Verified, 1 Built-unverified, 9 Not built, 1 Parked, 2 Blocked-on-client, 0 Blocked-on-access, 1 Out-of-scope
```

|Line|Holds|
|-|-|
|Phase|`fork`, `intake`, `foundation`, `design`, `prototype`, `workflows`, `hardening`, `staging` or `handoff`|
|State|`running`, `waiting on <path>`, `stopped: <reason>` or `done`|
|Unit|`U-<n>, attempt <a>, branch unit/U-<n>`, or `none` between units|
|Stop date|`<yyyy-MM-dd>`, or `none`|
|Staging|Written only when staging is skipped: `skipped, no Azure module`. Omitted otherwise.|
|Updated|`<yyyy-MM-dd HH:mm>`, local time|
|Next|up to three movable units from `scoreboard`, in order, or `none`|
|Scoreboard|the `States:` line of the command's output, without its label|

## queue.md

One table, built at the start of phase 6 and kept current. The header is exact:

```
|Unit|Kind|Title|Requirements|Depends on|Risk|State|Attempts|Parks|
|-|-|-|-|-|-|-|-|-|
|U-1|link|Link the approvals screen to the order detail|REQ-3.2|none|generated|merged|1|0|
|U-2|rule|Order totals and rounding|REQ-5.1, REQ-5.2|none|standard|merged|1|0|
|U-3|integration|Payment gateway client|REQ-8.1, REQ-8.2|INT-1, Q-6|high|queued|0|0|
|U-4|workflow|WF-1: Approve an order|REQ-14.3, REQ-14.4|U-2|high|in progress|2|0|
|U-5|review|Judge the themed screens|REQ-2.4|U-4|standard|parked|3|1|
```

|Column|Holds|
|-|-|
|Unit|`U-<n>`, counting up from 1, never reused|
|Kind|`link`, `workflow`, `rule`, `integration`, `review` or `fix`|
|Title|One line, in the client's words|
|Requirements|Comma separated `REQ-<SOW item>.<n>`. A requirement is in at most one open unit.|
|Depends on|Comma separated `U-<n>`, `Q-<n>`, `INT-<n>` and framework module names, or `none`. An `integration` unit lists its `INT-<n>` and its access question `Q-<n>`.|
|Risk|`generated`, `standard` or `high`|
|State|`queued`, `in progress`, `merged`, `parked` or `dropped` (its requirements went out of scope)|
|Attempts|A whole number: attempts started, counting the one in progress|
|Parks|A whole number: times the unit has parked|

A State cell holds one of the five words and nothing after it. Attempts and Parks are digits only.

## known-gaps.md

One level-2 section per parked unit, then the minor findings left unfixed, then anything hardening logged below medium. Each entry names its unit and requirements.

```
# Known gaps

## U-5: Judge the themed screens (REQ-2.4)

- Attempt 1: <what was tried>. Failed: <the check that failed>.
- Attempt 2: <what was tried>. Failed: <the check that failed>.
- Attempt 3: <what was tried>. Failed: <the check that failed>.
- Question: Q-9, with its best guess.

## Minor findings left unfixed

- U-2 (REQ-5.1): <finding, one line>

## Logged by hardening

- U-4 (REQ-14.3): <finding below medium, one line>
```

The scoreboard doesn't read this file.

## reviews.md

The verdicts for `review` requirements, one row each time a requirement is judged. The header is exact:

```
|Requirement|Date|Unit|Reviewer|Verdict|Evidence|
|-|-|-|-|-|-|
|REQ-2.4|2026-11-16|U-5|conductor-design-steward|fail|design/captures/login-dark.png: the logo is the demo mark|
|REQ-2.4|2026-11-17|U-9|conductor-design-steward|pass|design/captures/login-dark.png, design/captures/login-light.png|
```

|Column|Holds|
|-|-|
|Requirement|One `REQ-<SOW item>.<n>`. A requirement judged again gets a new row; the latest date decides.|
|Date|`<yyyy-MM-dd>`|
|Unit|`U-<n>` of the unit that was judged|
|Reviewer|the agent's name|
|Verdict|`pass` or `fail`|
|Evidence|the captures, as paths under the fork, and a few words on what they show|

## run-log.md

Design intake's file. Design intake writes its lines in its own shape and the orchestrator adds its own. The scoreboard reads both.

```
- <yyyy-MM-dd HH:mm> | repo-standup <phase> <U-<n> or -> | <minutes> min | <tokens> tokens | <outcome>: <note>
```

- `<phase>` is one word from the Phase list in `status.md`. The last word before the second `|` is the unit, `U-<n>`, or `-` for a line that isn't about one unit.
- `<minutes>` is a number, from the unit's start commit to the line, or `unknown`.
- `<tokens>` is a number such as `310k`, or `unknown`. An unknown figure is never written as `0`.
- `<outcome>` is exactly one of the words below, followed by `:` and the note.
- The note ends with the tokens by model, as `opus <n>, sonnet <n>`, with `k` or `m` allowed on each count. Write no other word followed by a number that reads like `opus 3` in a note, because the reader takes every such pair as a model's tokens.
- When the conductor's own tokens are unknown, the note says `workers only` before the tokens by model.
- A `phase` line carries only tokens that no other line counts: no unit's line and no `queue` line. So the cost tables can sum every line.

|Outcome|Written when|Note, as an example|
|-|-|-|
|`merged`|A unit merged|`WF-1 approvals, 4 requirements Verified; opus 120k, sonnet 190k`|
|`merged`, with no build|Its requirements were all Verified before it started|`already verified; opus 0, sonnet 0`|
|`attempt-failed`|A unit's attempt failed|`attempt 2, done check left REQ-14.4 Built-unverified; opus 40k, sonnet 150k`|
|`attempt-failed`, conductor's share unknown|The usage tool couldn't be loaded|`attempt 1, the e2e check failed; workers only; opus 20k, sonnet 70k`|
|`failed-env`|An environmental failure, not an attempt|`SQL Server process failed to start; opus 0, sonnet 12k`|
|`parked`|A unit parked on its third failed attempt|`3 attempts failed, Q-9 added; opus 90k, sonnet 300k`|
|`phase`|A phase ended|`workflows ended, 12 merged; opus 15k, sonnet 0`|
|`notified`|A notification was sent|`through Q-7; alerts: none`|
|`stopped`|The run stopped|`3 parks in a row; opus 0, sonnet 0`|
|`queue`, an audit|An integration-gap audit ran|`audit, 2 fix units; opus 60k, sonnet 0`|
|`queue`, a hardening pass|A hardening pass ran|`hardening pass, 3 fix units; opus 240k, sonnet 30k`|
|`queue`|The queue was built or changed|`built, 14 units; opus 80k, sonnet 0`|

Full lines, one per shape. The `notified` line carries no token figure, so its minutes and tokens are `0`:

```
- 2026-11-16 14:05 | repo-standup workflows U-4 | 42 min | 310k tokens | merged: WF-1 approvals, 4 requirements Verified; opus 120k, sonnet 190k
- 2026-11-16 15:10 | repo-standup workflows U-5 | 18 min | unknown tokens | attempt-failed: attempt 1, the e2e check failed; workers only; opus 20k, sonnet 70k
- 2026-11-16 15:12 | repo-standup workflows - | 0 min | 0 tokens | notified: through Q-7; alerts: none
```

The `notified` line's note is `through Q-<n>; alerts: <comma list or none>`. `Q-<n>` is the highest question number the notification covers, which is how `scoreboard` knows what is new. `<comma list>` is `none`, or the alerts that notification carried plus every `parked-twice U-<n>` the previous `notified` line named, separated by `, `. The scoreboard reads only the last `notified` line, and a unit parked twice stays parked, so carrying those entries forward keeps it from raising them again. The words are the scoreboard's own: `blocked-over-30`, and `parked-twice U-<n>` with one entry per unit, as in `alerts: blocked-over-30, parked-twice U-7, parked-twice U-9`. A third word, `security`, is the skill's own, for a high or critical security finding. The scoreboard doesn't print or de-duplicate it and ignores words it doesn't print, so the skill itself sends the security alert once per finding. When the notification tool is missing or doesn't send, the message goes in chat and the note adds `; chat only`.

**Lists.** Design intake's lines can carry lists. Each item sits on its own indented line under the stage's line, as `  - <item>`. The reader joins those lines into the note of the line above, so an indented line belongs to the line it follows. The orchestrator writes none of its own, and puts no unrelated line between a design intake line and its list.

**Token accounting.** The figures come from the platform check:

- A unit's tokens are the sum of its workers' `subagent_tokens`, from their completion notices, plus the conductor's share.
- The conductor's share is the difference in `mcp__ccd_session_mgmt__get_usage` between the unit's start and its end.
- When that tool can't be loaded, the note says `workers only`.
- The figures track context, so they understate billing. The cost report says so, and its dollar column is a floor.
- `opus <n>, sonnet <n>` splits the same total by the model each worker ran on, with the conductor's share under the session's own model.

## Notifications

Sent with `PushNotification`: one line, under 200 characters. `<counts>` is `<n> merged, <n> Verified of <n> in scope, <n> parked`. A question is cut to fit, so the whole line stays under 200.

|Notification|Wording|
|-|-|
|Question batch|`<n> questions added; the riskiest: Q-<n>, <question>`|
|Alert, a security finding|`Alert: high security finding on U-<n>; the merge is blocked. <counts>`|
|Alert, parked twice|`Alert: U-<n> has parked twice. <counts>`|
|Alert, blocked share|`Alert: <n>% of the remaining requirements are blocked on the client or on access. <counts>`|
|Stop|`Run stopped: <reason>. <counts>. See docs/project/handoff.md`|
|Stop at the guard check|`Run stopped: the push guard isn't loaded. Open a new session in the fork folder and type /pell:repo-standup.`|

The reason in a stop is one of:

|Reason|When|
|-|-|
|`failed-env twice in a row, <the failing check>`|The scoreboard's `env-broken`, or a second `failed-env` line on any unit since the last `merged`, `parked` or `attempt-failed` line|
|`3 parks in a row`|The scoreboard's `parks-in-a-row`|
|`the stop date has passed`|The stop date, through the handoff|
|`design intake stopped: <its reason>`|Design intake's `stopped:` line, or the skill's own `design intake stopped: no outcome line` after two calls with neither an outcome line nor a commit|
|`guard not loaded; open a new session in the fork folder`|The guard check failed|
|`main diverged`|A rebase onto `origin/main` conflicted, or the checks failed after it|
|`an uncommitted file no unit wrote: <path>`|A file outside `docs/project/` was left uncommitted at a unit boundary|
|`scoreboard: <the diagnostic>`|The scoreboard exited 1 on a line the engineer wrote|

Phase 9's own reason, when the run ends with `State: done`, is in `handoff.md`. The same reason follows `stopped:` in `status.md`, as `State: stopped: guard not loaded; open a new session in the fork folder`. The guard stop's notification has its own wording, in the row above.

## Commit messages

|When|Message|
|-|-|
|A unit starts, on `main`, or an interrupted attempt starts over|`Unit U-<n> starts`|
|A unit merges, or is marked merged as already verified|`Unit U-<n>: <title>`|
|The conductor commits an engineer's edits to the pack|`Repo standup: the engineer's edits`|
|Setup writes `status.md`|`Repo standup: setup`|
|`status.md` alone, never inside another commit: `State: running` when a session carries on, before a design intake call, or at a checkpoint|`Repo standup: status`|
|The queue is built or changed, or a unit goes back after a `failed-env`|`Repo standup: the queue`|
|An attempt fails|`Repo standup: U-<n> attempt failed`|
|A unit parks|`Repo standup: U-<n> parked`|
|An integration-gap audit|`Repo standup: audit`|
|A hardening pass|`Repo standup: hardening`|
|The run stops|`Repo standup: stopped`|
|The implementer's work, on the unit's branch|`Unit U-<n>: <title>, work`|
|A fix round, on the unit's branch|`Unit U-<n>: <title>, fix`|
|A `review` unit's `reviews.md` rows, on its branch|`Unit U-<n>: <title>, reviews`|
|What is left on a unit's branch when the conductor leaves it|`Unit U-<n>: <title>, left over`|
|The performance smoke test, on `perf/smoke`|`Performance smoke test`|

These are the conductor's commits, and the worker commits whose subjects it names. Design intake's stage commits keep design intake's own messages. Every message in this table ends with the co-author line the session was given for its commits, as a last `-m`. The fork's `CLAUDE.md` names no line of its own, so when the session was given none, the message ends without one.
