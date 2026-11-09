# Intake sheet template

Checkpoint 1. The sheet is `docs/project/intake-sheet.md`. The engineer reads it in about 15 minutes and corrects it in place. It has ten parts, in the order below. Write it from the finished pack, not in the SOW's order.

The ten parts:

1. The status line and how to correct (the top of the file, under the title)
2. What was read
3. The riskiest guesses
4. Where the SOW and the framework disagree
5. Personas
6. The domain model
7. Top workflows
8. Guesses on what the SOW doesn't say
9. Left out on purpose
10. The open questions sent with the sheet

Rules for the whole sheet:

- Never restate a requirement the SOW states clearly. The sheet holds only what the engineer must check: guesses, conflicts and the model.
- Tables and short lists only. No YAML, no long prose.
- Use the client's words from `glossary.md`.
- Cite SOW items by number ("items 6, 21"), not by line.
- Plain text. No emoji or glyphs. Minimal table separators (`|-|-|`).
- No blanks for the engineer to fill in. Every cell holds the best guess.
- The headings below are exact. Parts 2 to 10 are `##` headings with the part's name and no number.

Per-part rules:

- Part 1: the line is exactly `Status: draft`. The engineer changes it to `Status: approved`. The how-to-correct paragraph says: edit any line in place, cross out a guess and write the right answer beside it, there are no blanks to fill, and the next run reads the changes from the file's git diff.
- Part 2: counts of requirements, personas, entities, workflows and open questions. If any requirement is numbered `REQ-0.<n>` (found in a source but in no SOW item), add one line listing them, since they are beyond the SOW.
- Part 3: at most 8 guesses, riskiest first. Each says what the build assumes, the SOW items it rests on, and what changes if it is wrong. Numbered rows.
- Part 4: one row per disagreement. The build follows the framework unless the engineer changes the last column.
- Part 5: one row per persona, with the questions they open the app to answer.
- Part 6: the mandatory model review. One table, one row per entity, with exactly the six columns shown. "Generator" is `whole`, `basic slice` or `by hand`, with a short note. After the table, one line per workflow entity gives its statuses in order and any off the main path. No YAML.
- Part 7: at most 5 workflows, each with the SOW items it covers.
- Part 8: one row for each of brand, products users like, the workflow that must be excellent, density, integrations, and hosting and compliance. Always all six rows.
- Part 9: later phases and the SOW's out-of-scope list, with counts, recorded as `out:` in `requirements.md`.
- Part 10: the count of open questions and the three riskiest, by `Q-<n>`.

## Template

Copy from here down and replace each `<placeholder>`.

```
# Intake sheet: <project name>

Status: draft

Change the status line to `Status: approved` when you are done.

To correct the sheet, edit any line in place. Cross out a guess and write the right answer beside it. There are no blanks to fill. The next run reads your changes from the file's git diff and applies them before design starts.

## What was read

Read from: <source name> (`sources/<file>.md`, <n> items) and <client site> (`sources/site/`, <n> pages). From those, intake wrote <n> requirements, <n> personas, <n> entities, <n> workflows and <n> open questions.

Beyond the SOW: <REQ-0.<n>, ... with one phrase each>. Omit this line when there are none.

## The riskiest guesses

|#|The build assumes|From|If it's wrong|
|-|-|-|-|
|1|<what the build does>|items <n>, <n>|<what changes>|

## Where the SOW and the framework disagree

The build follows the framework unless you change the last column.

|SOW says|Framework does|The build will|
|-|-|-|
|<what the SOW says> (item <n>)|<what the framework does>|<what the build does, and why>|

## Personas

|Persona|Where and how often|What they open the app to find out|
|-|-|-|
|<Persona>|<device and place>, <frequency>|<question>? <question>?|

## The domain model

Check the names (they become every label), the key fields, the links and the statuses. "Generator" says how much the scaffolder writes; the rest is hand-built.

|Entity|What it is|Key fields|Links to|Statuses|Generator|
|-|-|-|-|-|-|
|<Entity>|<one line>|<field>, <field>|<Entity>, <Entity>|<Status>, <Status>, or none|<whole, basic slice or by hand>, <note>|

<Entity> statuses, in order: <Status>, <Status>, <Status>. Off the main path: <Status>.

## Top workflows

1. **<Workflow name>** (items <n> to <n>). <One or two sentences: who does what, in order.>

## Guesses on what the SOW doesn't say

|Input|Guess|
|-|-|
|Brand|<colors, font, logo source>|
|Products users like|<reference product>. Disliked: <product or tool>.|
|The workflow that must be excellent|<workflow>, because <reason>.|
|Density|<per page group: compact, comfortable or touch>|
|Integrations|<system and what for>, or none|
|Hosting and compliance|<where it runs, data rules>, or no regulated data|

## Left out on purpose

<Later phases> (<n> items) and the SOW's out-of-scope list (<n> items) are in `requirements.md` marked `out:`, so nobody builds them by accident.

## Open questions sent with this sheet

<n> questions in `open-questions.md`, each with the guess the build uses. The three riskiest: <Q-n>, <Q-n>, <Q-n>.
```
