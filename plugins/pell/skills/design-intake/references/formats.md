# Project pack formats

Every file below lives under `docs/project/` in the client fork. Phase 4's fork tool writes each as a title plus one line naming what goes in it. Design intake fills them. Everything here is internal: the reader is the Pell engineer who owns the project.

Rules for all files:

- Plain text. No emoji or glyphs.
- Markdown tables use the minimum separator row (`|-|-|`, one hyphen per column).
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
|Depends on|What it waits on|Empty, or a comma separated list of `Q-<n>`, `INT-<n>` and framework module names|

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
- Answer: <left empty; the engineer fills it in>
```

Rules:

- `Q-<n>` counts up from 1 and is never reused.
- Every question has a guess. The run never waits on an answer.
- `Risk` is high when a wrong guess changes the domain model, the roles or many screens, medium when it changes a few screens or a rule, low otherwise.
- `Asked` is the date the question was written. Nothing is sent to the client by the run.
- `Blocks` lists requirements that cannot be finished until the question is answered. Each of those requirements lists `Q-<n>` in its `Depends on` column.

## glossary.md

One table. One row per term the client uses.

```
|Term|Meaning|Label to use on screens|Words to avoid|Source|
|-|-|-|-|-|
```

- `Term`: the client's word, as written in the source.
- `Meaning`: one short sentence.
- `Label to use on screens`: the exact label for menus, headings, buttons and empty states.
- `Words to avoid`: generic or framework words the client does not use (for example the demo entity's name), or `none`.
- `Source`: `sources/<file>.md:<line>`.

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

Steps are numbered and name the persona who acts. Statuses use the client's words.

## integrations.md

One level-2 section per outside system, headed `INT-<n>: <system>`. `<n>` counts up from 1.

```
## INT-<n>: <system>

- Direction: in | out | both
- What for: <one sentence>
- Credentials held by: <who>
- Sandbox: <yes, with where | no | unknown>
- Requirements: <REQ-<SOW item>.<n>, ...>
```

## decisions.md line

One line appended per decision a stage makes on the engineer's behalf. The file only grows.

```
- <yyyy-MM-dd> | <stage> | <decision> | <reason> | decided by: <engineer or agent>
```

- `<stage>` is the stage's name, such as `extract`, `generate`, `lock`.
- `decided by:` is `engineer` for a correction taken from the approved intake sheet, otherwise the agent's name.

## run-log.md line

Each stage appends one line after the first line Phase 4's fork tool wrote. The file only grows.

```
- <yyyy-MM-dd> | design-intake <stage> | <minutes> min | <tokens> tokens | <note>
```

- `<stage>` is the stage number and name, such as `2 extract`.
- `<note>` says what the stage added in a few words: the counts, or the questions it raised.
