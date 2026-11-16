# Project pack formats

Every file below lives under `docs/project/` in the client fork. The framework's fork tool writes each as a title plus one line naming what goes in it. Design intake fills them. Everything here is internal: the reader is the Pell engineer who owns the project.

Rules for all files:

- Plain text. No emoji or glyphs.
- Markdown tables use the minimum separator row (`|-|-|`, one hyphen per column). Every row starts and ends with `|`.
- A field with a list of allowed values holds one of them and nothing after it. A note goes in a field that takes free text.
- Words on screens, in labels and in examples come from `glossary.md`, which comes from the client's own documents.
- Never edit a converted source under `sources/`. Citations by line number depend on it.
- IDs are never reused or renumbered.

## requirements.md

One Markdown table, one requirement per row, with these seven columns in this order. The scoreboard and the acceptance tag check read it, so the header row is exact:

```
|ID|Requirement|Source|Personas|Verified by|Scope|Depends on|
|-|-|-|-|-|-|-|
```

|Column|Holds|Allowed values|
|-|-|-|
|ID|The requirement's ID|`REQ-<SOW item>.<n>`, such as `REQ-14.3`. `<SOW item>` is the item's number in the source. `<n>` counts requirements in order within the item. A source with no numbered items uses its sections, numbered in order. `REQ-0.<n>` is a requirement found in a source but in no SOW item.|
|Requirement|One behavior, in one sentence, in the client's words|Free text, one sentence|
|Source|Where it came from|`sources/<file>.md:<line>` or `sources/<file>.md:<first>-<last>`. A requirement the engineer adds on the intake sheet, with no source line to cite, cites the approved sheet's committed line as `intake-sheet.md:<line>`. That is the only Source allowed outside `sources/`, because at checkpoint 1 the engineer is the authority.|
|Personas|Who it serves|Persona names from `personas.md`, comma separated|
|Verified by|How it will be shown to be done|`acceptance`, `integration`, `unit` or `review`. `review` means judged on screenshots, such as "the theme uses the client's logo".|
|Scope|Whether it is built|`in`, or `out: <reason>` where the reason is a later phase, the SOW's out-of-scope list, or removed by the engineer|
|Depends on|What it waits on|Empty, or a comma separated list of `Q-<n>` (open questions only), `INT-<n>`, and what it needs that the framework can't do yet, in the words of the fork's `CLAUDE.md` "What the generators don't do", such as `file fields`|

Example row:

```
|REQ-14.3|<Persona> sees only <Entity> records assigned to <Persona>'s <Group>.|sources/<file>.md:212|<Persona>|acceptance|in|Q-4|
```

Notes:

- Use `acceptance` for what a Playwright scenario can prove through the UI. Use `integration` or `unit` for what is better proven below the UI (a time rule, arithmetic, a permission rule).
- Out-of-scope requirements stay in the table with `out: <reason>` so nobody builds them by accident.
- Cite the original wording's line. Never cite a line you did not read.

## open-questions.md

One entry per question, as a level-3 heading and a field list. Questions are written so they can be sent to the client as they stand. Project 3 reads and adds to the same format.

```
### Q-<n>

- Question: <the question as it would be asked, ready to send>
- Guess: <what the build does until it is answered>
- If wrong: <what changes>
- Risk: high | medium | low
- Asked: <yyyy-MM-dd>
- Blocks: <REQ-<SOW item>.<n>, ...> or none
- Answer: <left empty until it is answered>
```

Rules:

- `Q-<n>` counts up from 1 and is never reused.
- Every question has a guess. The run never waits on an answer.
- `Risk` is high when a wrong guess changes the domain model, the roles or many screens, medium when it changes a few screens or a rule, low otherwise. A question that changes only theme values or assets, such as the brand colors or the logo, is low or medium, however many screens show them.
- `Asked` is the date the question was written. For `Q-1`, rewritten from the fork's logo bullet, it is the date stage 2 rewrote it. Nothing is sent to the client by the run.
- `Blocks` lists requirements that cannot be finished until the question is answered. Each of those requirements lists `Q-<n>` in its `Depends on` column, and the two always agree.
- `Answer` is filled by the engineer, or by stage 3 when a correction on the approved intake sheet answers the question, citing the sheet's line as `intake-sheet.md:<line>`. An answered question blocks nothing: its `Blocks` becomes `none`, and its requirements drop `Q-<n>` from `Depends on`. The `decisions.md` line for the correction names what it settled.

## glossary.md

One table. One row per term the client uses.

```
|Term|Meaning|Label to use on screens|Words to avoid|Source|
|-|-|-|-|-|
```

- `Term`: the client's word, as written in the source. When the engineer renames a term on the intake sheet, the Term takes the new name, the Source stays, and the old name goes under Words to avoid.
- `Meaning`: one short sentence.
- `Label to use on screens`: the exact label for menus, headings, buttons and empty states.
- `Words to avoid`: generic or framework words the client does not use (for example the demo entity's name), or `none`.
- `Source`: `sources/<file>.md:<line>`, or `intake-sheet.md:<line>` for a term the engineer added on the sheet.

Every status of every workflow entity has a row, with its label as the screens show it.

## personas.md

One level-2 section per persona, named as the client names the role.

```
## <Persona>

- Role: <the role in default-roles.json>, or `does not sign in`
- Where and device: <desk, phone, tablet; indoors or outdoors>
- How often: <several times a day, daily, weekly>
- Questions they open the app to answer:
  1. <question>
  2. <question>
  3. <question>
```

Three to five questions. They are the questions the home page's queues answer, so write them as the person would ask them ("what needs my approval", "what is due today").

## workflows.md

One level-2 section per workflow, headed `WF-<n>: <name>`. `<n>` counts up from 1.

```
## WF-<n>: <name>

- Personas: <persona names>
- Frequency: <how often it runs>
- Device: <where it is used>
- Steps:
  1. <who does what>
  2. <who does what>
- Statuses: <status>, <status>, <status> (in order), then any off the main path
- Requirements: <REQ-<SOW item>.<n>, ...>
```

Steps are numbered and name the persona who acts. A step the app does on its own, such as a schedule or a time limit, names `The app` as who acts. Statuses use the client's words.

## integrations.md

One level-2 section per outside system, headed `INT-<n>: <system>`. `<n>` counts up from 1.

```
## INT-<n>: <system>

- Direction: in | out | both
- What for: <one sentence>
- Credentials held by: <who>
- Sandbox: <yes, <where> | no | unknown>
- Requirements: <REQ-<SOW item>.<n>, ...>
```

Sandbox holds `yes` with where, `no` or `unknown`, and nothing else. A note on the sandbox goes in What for, or in an open question.

## decisions.md line

One line appended per decision a stage makes on the engineer's behalf. The file only grows.

```
- <yyyy-MM-dd> | <stage> | <decision> | <reason> | decided by: <engineer, agent or design-intake>
```

- `<stage>` is the stage's name, such as `extract`, `generate`, `lock`.
- `decided by:` is `engineer` for a correction taken from the approved intake sheet, the agent's name for an agent's decision, and `design-intake` for one the skill makes itself.

## run-log.md line

Each stage appends one line at the end of the file, below the title and line the framework's fork tool wrote. The file only grows.

```
- <yyyy-MM-dd> | design-intake <stage> | <minutes> min | <tokens> tokens | <note>
```

- `<stage>` is the stage number and name, such as `2 extract`.
- `<minutes>` is a whole number, from the stage's start commit to the line (`SKILL.md`, "Log").
- `<tokens>` is a number such as `292k`, or `unknown` when the session reports none (`SKILL.md`, "Log").
- `<note>` says what the stage added in a few words: the counts, the questions it raised, the check runs that failed, any flake, and anything the stage tells the engineer to do, such as regenerating `Initial`.

## sources/README.md

Written only by the scaffolder's `sources add` and `sources fetch`: one row per converted file or fetched page in its `|File|Original|Origin|Converted|` table, below the title and line the fork starts it with. Read it; never edit it by hand. It "lists a source" once it has a row.
