# The handoff

Written in phase 9, and again each time a resumed run stops. Everything is under `docs/project/`, and its reader is the Pell engineer who will own the project, not the client. `<skill>` is `${CLAUDE_PLUGIN_ROOT}/skills/repo-standup`, `<Code>` is `client.yaml`'s `name.code`.

## The reading order

1. `handoff.md`, one page.
2. `scoreboard.md`, regenerated after the final checks.
3. `open-questions.md`, ready to send. `handoff.md` lists the unanswered ones, riskiest first.
4. `known-gaps.md`: parked units, unfixed minor findings, hardening's low findings, and links not yet built.
5. `demo/<persona>.md`, one per persona with a Verified workflow.
6. `decisions.md`, as it stands.
7. `cost-report.md`: the `scoreboard --cost` tables, then the writer's reading of them.

## The final sequence

1. Run every check with every theme (`npm run screens`).
2. Run `scoreboard --cost --rates <skill>/rates.json`. It rewrites `scoreboard.md` and the tables in `cost-report.md`.
3. Dispatch `handoff-writer` (`sonnet`, pinned) with the repository root, `<Code>`, and the stop reason below. It writes `handoff.md`, the demo scripts and `cost-report.md`'s prose, and ends with `{"files": [...], "questions": [...], "summary": "..."}`. Check that every path in `files` exists.
4. Write `status.md`: `State: done` or `State: stopped: <reason>`, as below. Append the `stopped` line to `run-log.md` (outcome `stopped`, note `<reason>; opus <n>, sonnet <n>`, with `done` as the reason when it ends done). Send the stop notification (`formats.md`) and append its `notified` line. Commit everything as `Repo standup: handoff`, then push under `SKILL.md`'s rules.

The handoff is done when every requirement is in exactly one state, every check passes on `main`, and `handoff.md` is written.

## The stop reason

The conductor gives the writer the reason, and writes the same one to `status.md`.

|The run ends because|State|Reason in `handoff.md`|
|-|-|-|
|Nothing is movable (phases 8 and 9 reached)|`State: done`|`nothing movable`|
|Today is past `Stop date`|`State: stopped: the stop date has passed`|`the stop date has passed`|
|Any other stop|`State: stopped: <reason>`, from `formats.md`'s reasons table|that reason|

`done` means only that nothing could move when the run stopped. The next session runs the scoreboard again and resumes if an answer or an edit made a unit movable. A handoff written for a stop other than the guard check, which writes none, is rewritten at every later stop.

Phase 9's notification is `formats.md`'s Stop row, with the reason from the table above (`nothing movable` for `done`).

## handoff.md

One page. Sections in this order, with these headings. Copy numbers, never compute them.

```
# Handoff

## Why the run stopped

<The reason, in one sentence. For nothing movable, name what remains: parked, Blocked-on-client and Blocked-on-access counts from scoreboard.md. For any other stop, say what would let the run move.>

## Where it stands

<The scoreboard.md header's counts per state, as one line. Then the staging line from status.md when present (Staging: skipped, no Azure module).>

## The three riskiest guesses

1. Q-<n> (<Risk>): <question>. The build uses: <guess>. If wrong: <if wrong>.
2. ...
3. ...

## Do this first

<Two to four steps, in order. Start with the first step below that applies.>

## Run the app

Command: `dotnet run --project <Code>.API --launch-profile https`

|Persona|Role|Login|
|-|-|-|
|<persona>|<role>|<role in kebab case>@sample.test|

Password: <the value of Seed:SampleUserPassword in <Code>.API/appsettings.Development.json, or the setup note below>

## Unanswered questions, riskiest first

|Q|Risk|Question|Blocks|
|-|-|-|-|

## Where everything is

<One line each: scoreboard.md, open-questions.md, known-gaps.md, demo/, decisions.md, cost-report.md.>
```

**The three riskiest guesses.** The three unanswered questions in `open-questions.md` with the highest `Risk` (`high`, then `medium`, then `low`), by the `Risk` field and never by your own judgment. A tie goes to the question that blocks more requirements, then to the lower number. An unanswered question has an empty `Answer`. With fewer than three unanswered, list those, and with none write `None: every question is answered.`

**Do this first.** The first step that applies, then the ones after it:
1. When the password isn't set, set it (see below), since nothing else can be shown without it.
2. Read the three guesses and send `open-questions.md` to the client as it stands, or ask the engineer who owns the client contact.
3. Open the parked units in `known-gaps.md`, if any.
4. Rehearse one `demo/<persona>.md` script before showing the prototype.

**Personas and logins.** One row per persona in `personas.md` whose `Role:` line isn't `does not sign in`. A persona who doesn't sign in is left out, and one line below the table names them. The role is the `Role:` line. The login is the role in kebab case plus `@sample.test` (`Field Supervisor` is `field-supervisor@sample.test`), because in Development the framework's seed makes one active user per role in `default-roles.json`, with sample data on (`Seed:SampleData`). A role in `personas.md` that `default-roles.json` lacks gets the note `no such role in default-roles.json` in place of a login.

**The password.** Read `Seed:SampleUserPassword` from `<Code>.API/appsettings.Development.json`. When it has a value, write it. When the key is missing or empty, write this and never a made-up value:

```
Password: not set. Add "Seed": { "SampleData": true, "SampleUserPassword": "<choose one>" } to <Code>.API/appsettings.Development.json, then start the app. The seed signs the users up with that password in Development only.
```

`appsettings.Development.json` is the Development file. The sample password is never for production.

**Unanswered questions.** Every unanswered question, riskiest first (same order as the three guesses), with its `Blocks` list or `none`. The question text is as `open-questions.md` words it.

## A demo script

`demo/<persona>.md`, one per persona in `personas.md` who signs in and has at least one Verified workflow. A workflow is Verified when every requirement in its `Requirements:` line is Verified in `scoreboard.md`. A persona who signs in with no Verified workflow gets no file, and `handoff.md`'s persona table notes `no verified workflow`. The script is for the engineer to rehearse, never for the client, and every label and status in it is the glossary's.

```
# Demo: <Persona>

<One sentence: who this persona is, and the workflow set below, in the client's words.>

## Before you start

- Start the app: `dotnet run --project <Code>.API --launch-profile https`
- Sign in as `<role in kebab case>@sample.test`, password as in handoff.md.
- Device: <the persona's Where and device, from personas.md>

## WF-<n>: <workflow name>

Verified requirements: <REQ ids>

|Step|Do|Say|
|-|-|-|
|1|<who acts, in the glossary's words: the action on the screen>|<one line of what to tell the audience at this point>|
|2|...|...|

Ends with: <the status the record reaches, by its label>.

## If asked

<One line each, for the persona's questions in personas.md that the demo does not answer, or a guess from open-questions.md the demo leans on: say it is a guess.>
```

Steps follow the workflow's `Steps:` in `workflows.md`, keeping only those the persona acts in, and a step the app does on its own (`The app`) as a sentence the persona sees the result of. Never add a step `workflows.md` doesn't hold. A step's Say line never promises something no Verified requirement covers. A guess the demo leans on is named as a guess, with its `Q-<n>`.

## cost-report.md

The tables are written by `scoreboard --cost --rates <skill>/rates.json`, between `<!-- scoreboard:cost -->` and `<!-- /scoreboard:cost -->`. The writer adds prose before the opening marker and after the closing one, and never edits between them. The tables carry a note that worker tokens understate billing, so the dollar figure is a floor. The prose says so too, in its first sentence.

Before the markers: a title and one sentence on what the tables show and that the dollar figure is a floor.

After the markers, under `## Reading the numbers`:
- Where the tokens went: the largest rows, by phase and by model, named from the tables and nothing else.
- What was expensive: units with parks or failed attempts, from the tables or the run-log's counts as `scoreboard.md` carries them.
- `## An estimate for the next run`: one short paragraph for a similar SOW, saying what drove this run's cost, in words, quoting a figure only when a table holds it. No figure is derived: when no table gives a basis, say that an estimate needs a second run to compare.

## A resumed run

A run that stops again rewrites `handoff.md`, the demo scripts and `cost-report.md`'s prose from the new files, never appends to the old ones. A demo script for a persona whose workflow is no longer Verified is deleted, and listed in `files`.
