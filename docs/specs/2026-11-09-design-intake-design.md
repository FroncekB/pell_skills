# Design intake: Design Spec

Status: approved design (Brandon, 2026-11-09), not yet implemented
Date: 2026-11-09
Related: the repo-standup plans (`02-design-intake.md`, `03-orchestrator.md` and the plans README's decisions 7 to 16, kept outside this repo); the Pell Web App Framework's `docs/design-system.md` and the Generators section of its `CLAUDE.md`; the Phase 4 fork tooling spec (framework branch `phase-4-fork-tooling`, `docs/superpowers/specs/2026-11-09-phase-4-fork-tooling-design.md`).

Marks: **(Brandon)** is a decision Brandon made, **(Phase 4)** one the Phase 4 spec made that this spec follows, and **(Claude's call)** one made while writing this spec, for Brandon to check.

## Why

Repo-standup forks the Pell Web App Framework for a new client and has agents build the project from the client's Scope of Work. Design intake is the step between the fork and the build. It turns the SOW into everything the build needs: numbered requirements, the client's words, who uses the app and why, a domain model the generator can write, roles, a look that belongs to this client, and tests that say when each requirement is done.

Two earlier attempts show what goes wrong without it. The first experiment's visual direction was rejected as "too AI" (dark default, card kit, icons everywhere), and its replacement as "too quiet". A real client project built by hand ended up as stock shadcn: metric-card dashboards and "Coming soon" cards. The framework now decides layout, tokens and the tell list, and lints for them. Intake has to supply what the framework can't: the client's subject, words and point of view.

**Who reads it (Brandon).** Everything intake writes is internal. Its reader is the Pell engineer who will own the project: they learn what was built from the pack, add the custom features, and demo to the client. Nothing is written for the client, and the run never shows the client anything or waits on them (plans README, decision 12).

## What it is

A Pell skill, `design-intake`, run inside a client fork. Each run does the next stage that isn't blocked, then stops. Two stages end at a checkpoint where the engineer reads one file and edits it in place. The orchestrator (Project 3) calls the same skill for its intake, design and prototype phases. Until Project 3 exists, an engineer runs it by hand.

```
fork (Phase 4)
  │
  ▼ 1. Sources       documents and the client's pages → Markdown, once        (scaffolder `sources`)
  ▼ 2. Extract       requirements, glossary, personas, workflows, specs, roles (intake-analyst)
  ◆ Checkpoint 1     intake-sheet.md: engineer corrects in place, marks approved
  ▼ 3. Generate      apply corrections, generate every entity, home queues     (intake-analyst, implementer)
  ▼ 4. Brief         brand capture and the design brief                        (design-director)
  ▼ 5. Directions    two or three theme folders, shown on the client's screens (design-director, design steward)
  ◆ Checkpoint 2     design/directions/README.md: engineer picks, mixes or adjusts
  ▼ 6. Lock          the client theme, conventions, screen inventory           (design-director)
  ▼ 7. Prototype     every hand-built screen, on contract-first API stubs     (implementer, design steward)
  ▼ 8. Acceptance    Playwright scenarios tagged @REQ, expected to fail        (implementer)
```

## Decisions

|Decision|Who|
|-|-|
|The pack is internal; its reader is the owning engineer. No client-facing documents.|Brandon|
|The main input is the SOW as a `.docx` in Pell's house format, whose requirements are already clear. Intake mostly splits, numbers and cites them.|Brandon|
|The intake sheet's shape: riskiest guesses first, where the SOW and the framework disagree, personas, the domain model in one table, top workflows, guesses on what the SOW doesn't say. It never restates what the SOW already says clearly.|Brandon (approved a sample)|
|The entities are generated right after the intake sheet is approved, before the directions, so the directions are shown on the client's own screens.|Brandon|
|A direction is a theme folder under `src/themes/`, rendered by the screenshot harness.|Brandon|
|Themes gain an optional touch-density block that a page group opts into: a framework change.|Brandon|
|Screens the generator doesn't write are built on contract-first API stubs that return 501 until the build fills them.|Brandon|
|Acceptance scenarios live in `e2e/acceptance/`, tagged with requirement IDs, and start marked expected-to-fail.|Brandon|
|The prototype leaves out links between entities (a job's customer, a crew's vendor), because the generator writes none. The build adds them, and teaching the generator to write links is a separate framework follow-up. Nothing Project 2 does may stop a link being added later as a spec change.|Brandon|
|The spec, plan, skill and agents live in Pell_Skills on branch `design-intake`. Framework changes go on a framework branch `design-intake` cut from `react`. The source converter is a scaffolder command.|Brandon|
|Entity specs live in `specs/entities/`, the theme in `<Code>.React/src/themes/<lower>/`, default roles in `default-roles.json` plus each spec's `defaultRoles`, and acceptance tests in `<Code>.React/e2e/acceptance/`. The pack keeps no second copy.|Phase 4 (the first two approved by Brandon)|
|The fork keeps the four demo themes and Order until `ready themes` and `ready orders` remove them. `client.yaml`'s `theme` names the active theme, and the screenshot baselines follow it.|Phase 4 (Brandon)|

## Goals

1. **Minutes, not hours, for the engineer.** Checkpoint 1 is read and corrected in about 15 minutes, checkpoint 2 in about 10. Neither asks the engineer to fill in blanks.
2. **Every requirement traces to its source.** Each one cites the line of the converted source it came from, and its ID keeps the SOW item number, so an engineer can go from a failing test to the SOW line and its estimate.
3. **Every guess is visible.** A guess says what the build does and what changes if it's wrong. The riskiest ones are the first thing the engineer reads.
4. **A design that belongs to this client.** The brief is grounded in the client's subject and users. The directions differ from each other measurably and are judged on the client's own screens and words.
5. **The prototype is the real app** (decision 13). Generated pages run on sample data from the spec examples. Hand-built pages run on fixtures typed by the real API contract.
6. **Done is measurable from the start.** Every in-scope requirement says how it will be verified, and the Playwright ones exist before the build starts.
7. **Resumable from files.** A run picks up from the pack and the repo alone; nothing depends on a transcript.

## Non-goals

- Anything the client reads: reports, proposals, decks, a demo site.
- SOWs that live in Jira or Confluence. `pell:sow-builder` could feed them later; the first version reads files.
- Sites that render only with JavaScript. Brand capture reads plain HTML and CSS; for a script-only site it asks for the brand guide through an open question.
- Scanned documents with no text layer. The converter reports them, and an open question asks for a text copy.
- Building the business logic behind the stubs, the scoreboard, `status.md`, the work loop and the handoff: Project 3.
- Links between entities in the prototype: foreign keys, lookups, pickers and filters from one entity to another. The screen inventory lists them for the build.
- Fixing the framework gaps an SOW reveals, such as region-scoped roles or text kept in one place for translation. Intake flags them on the intake sheet; closing them is project work or later framework work.

## Anti-goals (it fails even if it works)

- An intake sheet that echoes the SOW back, buries its guesses in prose, or shows YAML.
- A requirement with no source, or a feature the SOW doesn't ask for, presented as in scope.
- Directions that are recolors of each other or of a demo theme, or that "could belong to 100 companies".
- Copy, labels or fixtures that aren't in the client's words: "Order" where the client says "Job".
- A run that waits on the client, or shows the client anything.
- A client's name in the framework or in Pell_Skills: code, docs, tests, fixtures or examples.

## Constraints

- Runs on a developer machine (decision 8): .NET 10, Node 22 and SQL Server (LocalDB or the engineer's own server). Nothing needs Python or pandoc.
- Fetching for brand capture (decision 16): only the client site the engineer named and the public pages of the reference products on the intake sheet; only the pages brand capture needs; no sign-ins and no forms; each page cached once in `sources/`.
- Outward-facing actions (decision 10): pushing to the client repo is a standing yes. Intake does nothing else outward.
- Questions go only through `open-questions.md` (decision 11). The engineer gets one push notification at the end of any stage that adds questions, and one at each checkpoint.
- No token cap (decision 9), but each stage logs its minutes and tokens as a line in `run-log.md`.
- All paths are relative. The framework's rules apply to everything intake writes in the fork: tokens only, the design lint, generated files never edited, no ruling or ledger IDs in code comments.

## Inputs

Required (the skill asks for them on its first run, since the fork command doesn't take them (Phase 4)):
- the source documents: the SOW and anything sent with it (`.docx`, `.xlsx`, `.pdf`, `.md`, `.txt`)
- the client's website URL

Optional, asked once and skippable:
- a brand guide, logo file or prototype the client already has (screenshots or a URL)
- reference products the client's users like or dislike

**Pell's house format**, which the analyst and trial 1's fictional SOW follow:
- The scope is a top-level list of items, numbered by Word's automatic numbering.
- Each item holds:
  - user stories ("As a Regional Manager, I ...") with bullets of behavior under them
  - a "User Roles this applies to" list
  - sometimes "Technical Notes"
- The estimate table at the end lists the same items by number with their hours.
- Around the items sit the overview, the assumptions, testing, project management, summaries of later phases, and an out-of-scope list.

An item's number is the first part of a requirement's ID. The second part is the analyst's, counting requirements in order within the item. The converter writes Word's automatic numbers into the Markdown as text, so item numbers are visible and citable.

Everything else in the plan's "wanted" list (users, devices, the one workflow that must be excellent, integrations, hosting, density) is drafted by intake from the documents and corrected on the intake sheet.

## The stages

Each stage commits its work on the run's branch (`main` in a fork) with a message naming the stage, appends a line to `docs/project/run-log.md`, and appends a line to `docs/project/decisions.md` for each decision it makes on the engineer's behalf. Nothing is pushed until stage 3 passes every check, so the client repo never holds specs without their generated code. **(Claude's call)**

### Stage 1: Sources

The scaffolder's new `sources` command (see Framework changes) converts each document once and writes:
- the original, unchanged, under `docs/project/sources/originals/` (the client repo is private, and a citation is only checkable against the original) **(Claude's call)**
- `docs/project/sources/<slug>.md`: the Markdown, with a header naming the original, its SHA-256, the date and the converter version
- a row per source in `docs/project/sources/README.md`

The converted files are never edited, so a citation by line number stays true. Everything after this stage reads the Markdown, never the originals.

### Stage 2: Extract (intake-analyst)

The intake-analyst reads the converted sources and writes, in one stage:
- `requirements.md`, `glossary.md`, `personas.md`, `workflows.md`, `integrations.md` and `open-questions.md` (formats below)
- one entity spec per entity in `specs/entities/`, started with the scaffolder's `new` command and checked with the new `check` command until it passes. Labels and the three examples use the glossary's words.
- the roles in `default-roles.json`, one per persona that signs in, plus each spec's `defaultRoles` grants, taken from the SOW's "User Roles this applies to" lists
- `intake-sheet.md`

It doesn't run `generate`. A requirement found in a source but in no SOW item is numbered `REQ-0.<n>` and listed on the intake sheet, because it is beyond the SOW. **(Claude's call)**

At the end, the stage sends a push notification: the intake sheet is ready, how many guesses it holds, and the riskiest one.

### Checkpoint 1: the intake sheet

`docs/project/intake-sheet.md`, in this order:

1. **The status line**, `Status: draft`, which the engineer changes to `Status: approved`, and how to correct: edit any line in place, cross out a guess and write the right answer beside it.
2. **What was read**, and the counts: requirements, personas, entities, workflows, open questions.
3. **The riskiest guesses** (at most 8): what the build assumes, the SOW items it rests on, and what changes if it's wrong.
4. **Where the SOW and the framework disagree**: what the SOW says, what the framework does, and what the build will do. The build follows the framework unless the engineer changes the line.
5. **Personas**: where and how often each works, and the questions they open the app to answer.
6. **The domain model**, the mandatory review (decision 14): one table with each entity's name in the client's words, what it is, its key fields, its links to other entities, its statuses, and how much the generator writes (whole, basic slice, or by hand). Each workflow entity's statuses follow in order. No YAML.
7. **Top workflows** (at most 5), each with the SOW items it covers.
8. **Guesses on what the SOW doesn't say**: brand, reference products, the workflow that must be excellent, density, integrations, hosting and compliance.
9. **Left out on purpose**: later phases and the SOW's out-of-scope list, recorded as out of scope in `requirements.md`.
10. **The open questions sent with the sheet**: the count and the three riskiest.

It never restates a requirement the SOW states clearly. The engineer may commit the edit or leave it in the working tree; the next run commits it if needed.

### Stage 3: Generate

Runs once the intake sheet says `Status: approved`.

1. **Apply the corrections.** The intake-analyst reads the sheet's diff since its own commit and carries each correction into the pack, the specs and the roles, with a `decisions.md` line for each (decided by: engineer). A correction it can't apply without guessing becomes an open question with its best guess, and the run continues.
2. **Generate every entity**, following the framework's "Adding an entity" steps for all the specs at once: `generate --skip-api`, the build, regenerating `Initial`, `generate`, the missing baselines in the active theme, and every check in the fork's Standard commands.
3. **Remove Order.** Once the client's entities pass, `ready orders` (Phase 4) and the follow-up steps it prints remove the demo entity, so no direction or prototype screen shows "Orders". The queue example stays readable in the framework's docs and in the scaffolder's test copy of Order. **(Claude's call)**
4. **Home queues.** The implementer writes each entity's queues companion from the personas' questions ("what needs my approval", "what failed", "what's due"), so the home page answers them for each persona.
5. **Push.** The first push of intake's work happens here, once every check passes.

This stage is the orchestrator's Foundation phase, moved ahead of design **(Brandon)**. Project 3's phase table changes to match (see Changes to other plans).

### Stage 4: Brief (design-director)

**Brand capture.** The design-director runs `sources fetch` on the client site: the home page and the pages that show the logo, the services and the voice, at most 6 pages **(Claude's call)**. It then fetches the public pages of the reference products on the approved intake sheet, at most 3 each. The command records each page's colors, fonts and logo candidates (see Framework changes). Reference products are read for density and interaction patterns, never for styling to copy.

**The brief**, `docs/project/design/brief.md`, on one page:
- the subject and its metaphor, from the client's work, never "modern and professional" (the first experiment's directions were "controlled document", "working ledger" and "community institution")
- the audiences and their density, per page group: a desk tool is compact, and a page used on a phone outdoors uses the touch density
- tone and copy voice, with the glossary as the source of words
- the brand: colors (with their OKLCH values), fonts, and the logo. A font with no `@fontsource-variable` package can't load under the CSP, so the brief names the closest open font that has one.
- what each reference product contributes
- the tell list: the framework's, plus anything this client's users would find generic

### Stage 5: Directions (design-director, design steward)

Three directions by default, two when the brand already fixes most choices **(Claude's call)**. Each direction is:
- a theme folder, `src/themes/direction-<a|b|c>/`: `theme.css` and its README (concept, bold move, fonts and licenses). It passes the theme contract, contrast and README tests, and the fingerprint against every other theme folder, the demo themes included, so a recolor fails on its own. When the brief has a touch page group, it includes the touch-density block.
- `docs/project/design/directions/<letter>-<name>.md`: the concept, the bold move, why it fits this client (citing the brief), copy voice shown in three real strings (an empty state, an error and a confirmation, in the glossary's words) and the status tones for the main workflow entity

The directions are shown on the client's own screens: the home page with the queues from stage 3, and each main entity's generated list, form and detail page, with sample data from the spec examples. `npm run screens` runs with only the direction themes, and the contact sheet puts them side by side. When the brief has a touch page group, each direction also shows at least one screen in its touch density. **(Claude's call on that requirement; the mechanism is the builder's)**

The design steward (extended, below) reviews each direction's captures against the brief and three litmus questions: could it belong to 100 companies, does it serve the work or the screenshot, and is every choice intentional? A direction it flags gets one revision. It then goes to the pick with the steward's notes attached, so the stage can't loop. **(Claude's call)**

The stage commits 8 captures per direction under `docs/project/design/directions/captures/`: the home, list, form and detail pages, each in light and mobile. The README can then show the directions side by side wherever the engineer reads the repo, without running the harness. **(Claude's call)**

### Checkpoint 2: the pick

`docs/project/design/directions/README.md`:
- the status line, `Status: waiting for your pick`, which the engineer changes to `Status: picked`
- a line for the pick: one direction, a mix ("B, with A's headings"), or a direction with adjustments in plain words
- the captures side by side, a link to each direction's file and to the steward's notes, and the command that opens the full contact sheet

A push notification goes out when the README is ready. The client doesn't see the directions **(decision 12)**.

### Stage 6: Lock (design-director)

1. **The client theme.** The picked direction, with the engineer's mix or adjustments applied, becomes `src/themes/<lower>/` (`lower` from `client.yaml`). The other direction folders are deleted. `client.yaml`'s `theme` and the copies its drift test checks name the new folder. If the engineer's mix breaks a contrast pair, the director fixes the pair in the spirit of the pick and logs the change in `decisions.md`.
2. **The logo.** If brand capture found a usable logo, the lock sets `client.yaml`'s `logo` to it, and Phase 4's logo question in `open-questions.md` takes "using the logo from the client's site" as its guess. **(Claude's call)**
3. **`ready themes`** (Phase 4) removes the demo themes.
4. **Status tones** for each workflow entity are written into its spec, and `generate` runs.
5. **Baselines** for the client theme are rewritten, and every check passes.
6. **`design/conventions.md`**: the page patterns used per page group and which groups use the touch density; status tones per entity; copy voice; empty, loading and error states in the client's words; the design rules from the plan (home pages answer questions, density follows the audience, copy comes from the glossary, icons only where they help scanning, no decoration, the unglamorous screens get equal care); and what the pick changed.
7. **`design/screen-inventory.md`**: every screen the app needs, one row each: its pattern, page group, personas, workflow, requirements, whether the generator writes it or it's hand-built, the API it calls (existing or a stub to write) and its state (exists, prototype, built). A second table lists every link between entities from the approved domain model: the entity and field it starts from, the entity it points at, whether it's required, and the pickers, filters, columns and detail links it adds to which screens. The build, or the generator once it writes links, works from that table.

### Stage 7: Prototype (implementer, design steward)

One unit per hand-built screen, or per workflow when its screens share an API, taken from the screen inventory. For each unit:

1. **The API contract, first.** Each endpoint the screen needs is written for real in C#: its route, its permission (a constant and `PermissionDefinition` in `Permissions.All`), its request and response models, and an action that throws the new `NotBuiltException`, which answers 501. Its integration tests cover 401, 403 and the 501. The OpenAPI document and the React types are refreshed, so the page and its fixtures use generated types. **(Brandon)**
2. **The page**, composed from the framework's patterns, with its route, nav item and permission guard. A persona whose first page isn't the attention-queue home gets it from the home route by permission.
3. **Fixtures** in `src/test/fixtures/`, typed by the generated types and written in the glossary's words, with the harness's answers in `screens/fixtures.ts` and its screen states in `screens/routes.ts`.
4. **A story and a Vitest test**, the design lint, and the screenshots in the client theme.
5. **The grants**: the new permissions go to the default roles of the personas that use the screen.
6. **Design review**: the design steward reviews the unit's captures.

**No links, and nothing that blocks them (Brandon).** A unit never adds a link between entities, never ejects a generated file, and never hand-writes a picker or filter into a generated page. A generated form or list shows only its entity's own fields until the link is added. That keeps every link addable later as a spec change and `generate`.

The screen inventory row moves to "prototype". The engineer reviews the prototype on the contact sheet and in Storybook, and may walk the client through it by screen share. Corrections come back as edits to the pack, which the next stage or shift reads; the run doesn't wait (decision 12). In the running app a hand-built page shows its 501 as a load error until the build fills the endpoint.

When Project 3 exists, these units go through its work loop. Before then, the skill runs them one at a time.

### Stage 8: Acceptance (implementer)

For each in-scope requirement whose "verified by" is `acceptance`, a Playwright scenario in `e2e/acceptance/<workflow>.spec.ts`:
- tagged with every requirement it proves (`{ tag: ['@REQ-14.3'] }`)
- written from the requirement, its workflow and the prototype's screens, finding elements by role and by label in the glossary's words
- signing in as a user of the persona's role
- marked `test.fail()` **(Brandon)**

The mark is a ratchet. While the feature isn't built, the scenario fails as expected and the gate passes. Once the feature works, Playwright fails the run with "expected to fail but passed", so the unit that built it must remove the mark in the same change. A requirement counts as verified only when its scenarios pass with no mark. The scoreboard (Project 3) counts that from Playwright's JSON report, which carries tags and annotations.

Requirements better proven below the UI (a time rule, pay arithmetic, a permission rule) say `integration` or `unit`. The build's units write those tests, tagged with the same ID.

## How the skill knows the next stage

The skill reads the pack, not a transcript:

|When|Next|
|-|-|
|`sources/README.md` lists no source|Ask for the inputs; stage 1|
|`requirements.md` holds no requirement|Stage 2|
|The intake sheet says `Status: draft`|Wait: remind the engineer, run nothing|
|Approved, but the specs aren't generated (`generate --check` fails)|Stage 3|
|`design/brief.md` is only its skeleton line|Stage 4|
|No direction file in `design/directions/`|Stage 5|
|The directions README says `Status: waiting for your pick`|Wait|
|Picked, and `client.yaml`'s `theme` is still a demo or direction theme|Stage 6|
|A screen inventory row is hand-built and not yet prototyped|Stage 7|
|An in-scope `acceptance` requirement has no tagged scenario|Stage 8|
|None of these|Report that intake is done|

Project 3 reads the same signals, and also its own `status.md`.

## The project pack

Phase 4's fork tool writes the skeleton: each file holds a title and one line naming what goes in it, who writes it and who reads it, and each folder a `README.md` with the same line. Project 2 fills these:

|Path|What goes in it|
|-|-|
|`sources/README.md`|One row per source: the converted file, its original, its origin (a document or a URL) and the date|
|`sources/*.md`, `sources/originals/`, `sources/site/`, `sources/references/`|The converted documents and their originals; the client's pages; the reference products' pages|
|`intake-sheet.md`|Checkpoint 1|
|`requirements.md`|The requirements, one per row (format below)|
|`glossary.md`|Term, meaning, the label to use on screens, words to avoid, source|
|`personas.md`|Each persona: its role in `default-roles.json`, where and on what device, how often, and 3 to 5 questions they open the app to answer|
|`workflows.md`|`WF-<n>`: name, personas, frequency, device, numbered steps, the statuses it moves through, the requirements it covers|
|`integrations.md`|`INT-<n>`: system, direction, what for, who holds the credentials, sandbox, requirements|
|`open-questions.md`|`Q-<n>`, format below|
|`design/brief.md`|The design brief|
|`design/directions/README.md`, `design/directions/<letter>-<name>.md`, `design/directions/captures/`|Checkpoint 2 and the directions|
|`design/conventions.md`|The locked conventions|
|`design/screen-inventory.md`|Every screen, tied to personas, workflows and requirements|

Project 2 also appends to Project 3's `decisions.md` and `run-log.md`. **(Phase 4 lists both in the skeleton.)**

**`requirements.md`** is a Markdown table with fixed columns, which the scoreboard and the acceptance tag check read **(Claude's call on the columns)**:

|Column|Holds|
|-|-|
|ID|`REQ-<SOW item>.<n>`, such as `REQ-14.3`. A source with no numbered items uses its sections, numbered in order. `REQ-0.<n>` is a requirement in no SOW item. IDs are never reused or renumbered.|
|Requirement|One behavior, in one sentence, in the client's words|
|Source|`sources/<file>.md:<line>` or a line range|
|Personas|Who it serves|
|Verified by|`acceptance`, `integration`, `unit` or `review` (judged on screenshots, such as "the theme uses the client's logo")|
|Scope|`in`, or `out:` and why (a later phase, the SOW's out-of-scope list, removed by the engineer)|
|Depends on|Open questions (`Q-<n>`), integrations (`INT-<n>`) or framework modules this requirement waits on|

**`open-questions.md`** holds one entry per question: its ID, the question as it would be asked (ready to send), the guess the build uses, what changes if the guess is wrong, risk (high, medium or low), the date asked, the requirements it blocks, and an Answer line the engineer fills in. Project 3 reads and adds to the same format.

## Agents

All live in `plugins/pell/agents/` on the Pell_Skills branch and follow its agent conventions: `model: inherit`, so they run on the run's model, which is the strongest; no `tools:` line; and a trailing JSON object, `{"files": [...], "questions": [...], "summary": "..."}`, naming what they wrote and the open questions they added. **(Claude's call on the JSON shape)** The two `conductor-*` agents keep their prose reports, as that repo's exception says.

**intake-analyst** (new). Stages 2 and 3's corrections. It cites every requirement and invents none. It marks every guess with what changes if it's wrong. It writes the specs in the client's words with three realistic examples each. It states in the spec everything the generator can declare, and lists the rest as hand-built on the intake sheet. It knows the framework's "What the generators don't do" list and the shape of the intake sheet.

**design-director** (new). Stages 4 to 6. It grounds every direction in the brief and makes each one's bold move a real choice, inside the token contract. It writes theme folders that pass the framework's theme tests, and the conventions and inventory at the lock. It uses the `frontend-design` skill when it's installed, but its own rules don't depend on it.

**conductor-design-steward** (extended). It gains a screenshot mode. Given a harness run, it reads `screens-output/manifest.json` and the captures, and judges them against the brief, the conventions, the three litmus questions and the framework's review-only tells: chatty banners, decorative charts, copy not in the client's words, empty states that don't say what to do next, and metric tiles. It stays read-only and generic, so its other uses are unchanged.

**conductor-implementer** (existing; mid-tier model). Stage 3's queues, and stages 7 and 8. No change, beyond what the skill's references tell it about stubs and the ratchet.

## The skill

`plugins/pell/skills/design-intake/`:
- `SKILL.md`: when it triggers ("start intake for this fork", "the intake sheet is approved", "I picked direction B", or a call from the orchestrator), how it finds the next stage, what each stage does and which agent does it, the commit, log and notification rules, and that it never waits on the client
- `references/`: the formats (requirements, open questions, the intake sheet, the directions README), the stage procedures in detail, and the framework commands each stage runs

It tells the engineer in chat when they're present. It sends a push notification at each checkpoint and at the end of any stage that added questions, through Claude Code's own push notification tool. That goes to the engineer's own devices, so it's not an outward action. Where the session has no such tool, the message goes in chat and in `run-log.md`. **(Claude's call)**

**An exception to the repo's read-only default.** Pell commands gate each side effect on a `(y/n)`. This skill writes and commits throughout the fork it runs in without asking, because the orchestrator runs it unattended. The invocation itself is the yes. Its writes stay inside that fork, and it pushes only under decision 10. The exception is written into the repo's `CLAUDE.md` and architecture spec in the same change, as that repo's conventions require. **(Claude's call)**

**Housekeeping.** The same change bumps the plugin's minor version, adds the skill and the two agents to both READMEs and to the architecture spec's implementation status, and passes `claude plugin validate ./plugins/pell`.

## Framework changes

On the framework branch `design-intake`, cut from `react`. Each lands with its tests and docs, and the framework's own checks pass. The fork tool (Phase 4) carries them into every fork.

### 1. Touch density

- A theme may hold one more block, for the touch density (the selector is the builder's call). When present, it defines a fixed set of length tokens and no others: the type scale with its line heights, `control-height`, `control-height-sm`, `row-height`, `cell-padding-x`, `spacing` and `section-gap`. The exact set is the builder's, kept in `TOKEN_CONTRACT`. It holds no colors, so contrast is unchanged.
- Floors in the touch block: `text-base` at least 16px and `control-height` at least 44px. **(Claude's call)**
- A page group opts in through the app shell (a layout or route option, not a class on a page), and the design lint keeps pages from setting density themselves.
- `pell` gets a touch block, so the contract tests, the harness and Storybook exercise it. The other demo themes don't need one. **(Claude's call)**
- `docs/design-system.md` documents the block, and its doc tests cover it.

### 2. Contract-first stubs

- `NotBuiltException`, mapped in `GlobalExceptionHandler.Map` to 501 with a title a user may read, such as "This part of the app isn't built yet."
- CLAUDE.md gets the rule: how to write a stub (route, permission, models, the throw), its tests (401, 403, 501), and that the build replaces the throw behind the same contract.
- A list page, detail page or form shows the 501's title in its load error, as it does for other problems.

### 3. Acceptance folder and tag check

- `PellFramework.React/e2e/acceptance/`, with a README on the tags and the expected-failure ratchet. The framework ships no scenarios there, so `ready orders` has nothing to remove.
- A check run by `npm test`: every test under `e2e/acceptance/` carries at least one `@REQ-<n>.<n>` tag. Where `docs/project/requirements.md` exists, every tag names a requirement listed there. With no scenarios, it passes.
- `npm run test:e2e` runs the folder like the rest of `e2e/`.

### 4. Scaffolder `check`

`check` parses every spec and `default-roles.json` as `generate` does, prints each problem with its file and line, writes nothing, and exits 1 on any problem. It gives the intake-analyst a fast loop that doesn't depend on the database or the build.

### 5. Scaffolder `sources`

- `sources add <file>...` converts `.docx` (headings, lists with Word's automatic numbers written out, tables), `.xlsx` (one table per sheet, values not formulas, and the first 50 rows of a long sheet with its row count, since intake needs the shape, not the data **(Claude's call)**), `.pdf` (text by page, with page markers) and `.md` or `.txt` (copied). It writes the original, the Markdown and the index row as stage 1 describes. A file already converted is skipped unless `--refresh`.
- `sources fetch <url> --allow <host>...` fetches one page over plain HTTP(S) GET:
  - from an allowed host only
  - respecting `robots.txt`
  - no cookies, no forms, no scripts
  - once per page, unless `--refresh`
  
  It writes the page as Markdown under `sources/site/` or `sources/references/`, with a header holding the colors declared in the page's same-site stylesheets (ranked by use), the font families and font services named, and the logo candidates (images whose source, alt text or class names a logo, the Open Graph image and the touch icon). It saves those candidates under the page's `assets/` folder.
- Package choices are the builder's: permissive licenses, versions in `Directory.Packages.props`.

## Changes to other plans

These plans live outside this repo. This spec doesn't edit them; whoever owns each does.

- **Project 3, `03-orchestrator.md`:** Foundation moves to just after checkpoint 1, and Project 2's stage 3 does it. The run's phases become Fork, Intake, Foundation, Design, Prototype and acceptance, Workflows, Hardening, Staging and Handoff. A unit that removes an acceptance scenario's expected-failure mark and changes its assertions needs review, so a scenario can't be weakened to pass.
- **Project 1, a generator follow-up (Brandon):** the generator writes links between entities: the foreign key, the lookup endpoint, the form's picker, the list's filter and column, and the detail page's link. Adding a link to an entity that's already generated must be a spec edit and `generate`, before and after the first deployment. A fork made before the feature lands needs a way to take it, since template changes don't reach an existing fork. Until then, the build writes links by hand.
- **Project 2's plan, `02-design-intake.md`:** the outputs table points at the code homes above, and `design/theme.*` is dropped. Directions are theme folders.
- **Phase 4:** nothing to change. The lock runs `ready themes`. Phase 4's plan already makes the Storybook theme list follow the active theme, and checks both focus-halo cases, so the keyboard checks still run once only the client theme is left. Phase 4 also adds `ready` to the scaffolder's command switch, so `sources` and `check` meet it there in a small merge conflict.

## Order of work

Most of this depends on Phase 4: `client.yaml`, the pack skeleton, the `ready` commands, and the theme and Storybook changes the touch density sits beside. **(Claude's call)**
- The Pell_Skills branch can start at once. It holds the skill, the agents, their references and trial 1's fictional SOW.
- The framework branch is cut from `react` after Phase 4 merges. If it hasn't merged when implementation starts, the Pell_Skills work goes first.
- The trials run once both branches and Phase 4 are in place: a fork made from the framework branch, with the skill loaded from the Pell_Skills branch.

## Testing and trials

**Framework changes:** each comes with tests in the framework's own suites:
- the converter, against small `.docx`, `.xlsx`, `.pdf` and HTML fixtures written for the tests
- `check`, against good and broken specs
- the 501 mapping, with an integration test of a stub endpoint
- the touch block, in the theme contract tests, a harness capture and a story
- the tag check, against scenarios with good, missing and unknown tags

**The skill and agents:** two trials, after Phase 4's fork tool has landed.
1. **A fictional SOW** in Pell's house format, written for the trial and kept with the skill: about ten numbered items, two portals and a workflow with review steps. Run every stage in a throwaway fork, with a person answering both checkpoints. It passes when each stage's files match their formats, every citation points at a line that exists, and every check in the fork passes after stages 3, 6, 7 and 8.
2. **The latest real Pell SOW**, whose project engineers are already building by hand, in a scratch fork that is never pushed. Compare the domain model, personas and roles with what the engineers built, and record the engineer's minutes at each checkpoint and the tokens per stage. The results stay in a local notes file, never in this repo or the framework, because they name the client.

## Exit

- The framework branch and the Pell_Skills branch are merged by Brandon.
- Trial 1 passes. Trial 2 has run, with its comparison and measures recorded.

## Left to the builder

- The touch block's selector, its exact token set, and how a page group opts in.
- How a direction shows a screen in its touch density before any touch page exists, such as a story or a harness state wrapping a generated page.
- The converter's packages, HTML-to-Markdown details and color ranking.
- The skill's reference files' structure, and how much of each stage's procedure lives in the agent prompt versus the skill.
- How the stub tests are organized: a test per stub, or one test over every endpoint that throws `NotBuiltException`.
- Where the acceptance scenarios' persona users come from: the e2e support helpers, or a seed.
