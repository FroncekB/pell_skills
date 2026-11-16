# Design intake stages

How to run each stage and checkpoint. `SKILL.md` decides which one runs, and holds the rules every stage shares: the commit, the `run-log.md` and `decisions.md` lines, the push and how a notification is sent. This file doesn't repeat them. Under each stage, "Sends" is what the engineer is told at its end.

## Terms used below

- `<Code>` and `<lower>` are `client.yaml`'s `name.code` and `name.lower`.
- **The project name** is the intake sheet's title after `Intake sheet: ` (`intake-sheet.md` says where stage 2 takes it from). Every later title that names the project uses it.
- Scaffolder commands run from the repository root. npm commands run in `<Code>.React/`.
- Pack paths are under `docs/project/`. `formats.md`, `intake-sheet.md` and `directions.md` sit beside this file, at `${CLAUDE_PLUGIN_ROOT}/skills/design-intake/references/`.
- **The checks** are every command in the fork's `CLAUDE.md` "Standard commands", run one at a time, each passing: the build, the unit and integration tests, the React checks, the screenshots in the active theme, end to end and `generate --check`. They share the integration tests' LocalDB database and port 7143, so never run two at once.
- **A failing check** is fixed and run again. In stages 3, 5 and 6, the third failed run of the same check stops the stage: `design-intake: stopped: <check> failed three times`, with the last failure in the chat message. Stages 7 and 8 park a unit instead (see Working with agents).
- **Flakes.** A failure in a screen or test the stage didn't change, or one whose trace shows the harness's own network error (a `net::` error loading a page or an asset), is rerun once, alone (`-g <route>` with its `--project`). If it passes, it is a flake: name it in the run-log note, and it counts as no failed run or round. A second failure is real.
- **Formatting.** Format only with what the fork's Standard commands name. Never run a formatter they don't, such as Prettier: the lint is the fork's style check.
- **Baselines.** A screen new to the harness gets its baseline with `npm run screens -- --active --update-snapshots=missing`, which writes the missing ones alone and moves none that exist. It reports each baseline it writes as a failure, so count the failures that aren't a missing snapshot: any one is real. A screen the stage changed on purpose gets its baseline rewritten alone with `npm run screens -- --active --update-all -g <route>`. So does a screen whose baseline the fork left showing the framework's name or demo content where the screen now shows the client's, such as the home and sign-in pages, with a `decisions.md` line. Either way, read the new images first, the PNGs under `<Code>.React/screens/__baselines__/<platform>/<theme>/<mode>/`, since an agent can't open the contact sheet. Then run `npm run screens -- --active`, which must pass. Never rewrite every baseline at once.
- **Captures.** A harness run writes each capture to `<Code>.React/screens-output/<theme>/<mode>/<route>-<state>.png` and lists it in `manifest.json`. Routes are in kebab case: an entity's list is `<plural>-list`, its new form `<singular>-form`, its edit form `<singular>-edit` and its detail `<singular>-detail`, and a route's normal state is `default`. Every run empties `screens-output/` first, so copy what a later step needs before the next run.
- **Framework defects.** Intake never changes a template, the scaffolder, a generated file, or any other framework file its stage's "Writes" line doesn't name, to get past a check. When a framework defect fails a check, change the spec to avoid it (an example, a limit, a column), with a `decisions.md` line naming the defect, and name it in the run-log note for the framework. When no spec change avoids it, stop: `design-intake: stopped: framework defect: <what fails>`.

## Working with agents

- **intake-analyst and design-director** work in the fork's checkout, on `main`. Give each the stage and its job, the repository root, `client.yaml`'s names, and the paths of the references the stage names. Each writes its own `decisions.md` lines, and ends with `{"files": [...], "questions": [...], "summary": "..."}`. Its `questions` feed the notification, and its `summary` the run-log note.
- **conductor-implementer** never works on `main`, and gets one unit at a time. Its worktree is the fork's own checkout, the repository root, switched to the unit's branch. It makes no other worktree. Before each unit:
  1. Commit the stage's work so far on `main` as `Design intake stage <n>: <name>, work so far`, unless there is nothing to commit. The implementer stops on a dirty tree.
  2. Run `git switch -C intake-<stage name> main`. This drops any commits an interrupted unit left on the branch, and that unit runs again.
  3. Give it the unit, the branch, its worktree (the repository root), the expected tip (`git rev-parse main`), `client.yaml` as its sentinel file, the references, the stage's rules, the unit's checks, the Formatting rule (Terms) and its commit's subject.

  It commits on the branch and reports. Its commit's subject is the one the stage names for the unit, and its body an essay. A later commit on the branch adds what it does after a comma, such as `Design intake stage 7: <screen>, revision`. Its own commit carries the unit's bookkeeping, such as stage 7's inventory row. A revision after stage 7's design review isn't a new unit: it runs on the same branch, with no `switch -C`, and the branch's tip (`git rev-parse HEAD`) as the expected tip.

  **The unit's checks** run on the unit's branch after the implementer reports, before anything merges; each stage names them. When they pass (and, in stage 7, the steward has reviewed the unit), `git switch main` and `git merge --ff-only intake-<stage name>`. At the stage's end, `git branch -d intake-<stage name>` when it is still there. Units run one at a time, because they share the database and the port.

  **Three failed rounds park a unit** in stages 7 and 8, and stop stage 3 as a failing check does (Terms). A round is one run of the unit's checks after the implementer reports. When a round fails, the implementer gets the failures and fixes them on the same branch, as for a revision; the round after a design review's revision counts too. A flake (Terms) is no failed round. In stages 7 and 8, after the third failed round:
  1. `git switch main`, then `git branch -m intake-<stage name> parked/intake-<stage name>-<unit>`, with `<unit>` the unit's first screen's name (stage 7) or its workflow's name (stage 8) in kebab case. The unit is left as it is: unmerged, unpushed, its inventory rows unchanged.
  2. Add an open question, in `formats.md`'s format, saying what the unit needs to pass, with the check that failed in its If wrong, the unit's requirements in its Blocks, and the guess that the build finishes the unit from its branch. List it in those requirements' Depends on, and add a `decisions.md` line naming the unit.
  3. Go on to the next unit. A run that resumes the stage skips any unit with a `parked/` branch, and the stage's run-log note names each parked unit.
- **conductor-design-steward** is read-only, in its screenshot mode. Give it the run, `<Code>.React/screens-output/` (its `manifest.json` and the captures), with the commit and time the run was made; the captures to read, which each stage names; `docs/project/design/brief.md`; `docs/project/glossary.md`; and from stage 6 on `docs/project/design/conventions.md`. Its report is ranked prose.

## Stage 1: Sources

Done by the skill itself.

**Inputs.** Take each from the invocation's arguments when they name it: file paths, the site URL, brand files, and liked or disliked products. Ask the engineer once for whatever is still missing:
- Required: the source documents (the SOW and anything sent with it: `.docx`, `.xlsx`, `.pdf`, `.md` or `.txt`) and the client's website URL.
- Optional, and skippable: a brand guide, logo file or prototype the client already has (files, screenshots or a URL), and the products the client's users like or dislike, with their URLs.

Without a SOW there is nothing to run. If no one can answer, as in an unattended run whose arguments name none, stop: `design-intake: stopped: no SOW given`. A missing website URL doesn't stop the stage: step 4 is skipped, with its question.

1. **Convert each document.**
   ```
   dotnet run --project tools/<Code>.Scaffolder -c Release -- sources add <file>...
   ```
   It writes the original, unchanged, to `docs/project/sources/originals/<file name>`; the Markdown to `docs/project/sources/<slug>.md`, whose first line is `<!-- source: originals/<file> | sha256: <hex> | converted: <date> | converter: sources 1 -->`; and a row in `docs/project/sources/README.md`. A file already converted is skipped. A PDF with no text is reported as unreadable, the rest are still converted, and the run exits 1: add an open question asking for a text copy, with the guess that the build goes on without it. Number stage 1's questions from `Q-2`, since stage 2 makes the fork's logo question `Q-1`.
2. **Record the answers as a source**, so no later stage depends on this conversation. Write them to `intake-answers.md` in a new, empty folder under the system's temporary directory (`$TMPDIR` or `%TEMP%`), never in the repository, in this shape. `sources add` it, then delete that folder. `<engineer>` is `git config user.name`, or `engineer` when it is empty.
   ```
   # Intake answers

   - Given by: <engineer>, <yyyy-MM-dd>
   - Client website: <url>
   - Brand guide, logo or prototype: <file names or a URL>, or none
   - Products users like: <name and URL>, ... or none given
   - Products users dislike: <name and URL>, ... or none given
   ```
3. **Images** the engineer gave (a logo, screenshots of a prototype) can't be converted. Copy them unchanged into `docs/project/sources/originals/`. A prototype URL on another host than the client's site isn't fetched; ask for screenshots instead.
4. **Fetch the client's home page**, so stage 2 reads the client's own words:
   ```
   dotnet run --project tools/<Code>.Scaffolder -c Release -- sources fetch <site url> --allow <site domain> --to site
   ```
   Pass `--allow` the site's host without a leading `www.` (`example.com` for `www.example.com`, `shop.example.com` for `www.shop.example.com`). It takes the host's subdomains too, so a redirect from `example.com` to `www.example.com` is followed, while one from `www.` to the bare host would be refused. It writes `docs/project/sources/site/<host>/<path slug>.md`, with a `## Brand signals` section (colors ranked by use, fonts, logo candidates) and `## Page text`, saves the logo candidates in `assets/` beside it, and adds a row to `sources/README.md`. This page is the first of the 6 client pages stage 4 may fetch. A refused fetch (a name that doesn't resolve, robots.txt, not HTML, a redirect off the host) is noted in the run-log, never worked around.

   When the home page isn't fetched, for any reason, add an open question asking for the brand guide and the logo, and for the site's address when it may be wrong, with the guess that the brief guesses the brand from the SOW and the client's trade.

Never pass `--refresh` once stage 2 has cited a file, since the cited lines must not move. A new version of a document is added under a new file name.

**Writes:** `sources/originals/`, `sources/*.md` (`intake-answers.md` among them), `sources/site/`, `sources/README.md`, and `open-questions.md` when a file is refused or the home page isn't fetched.

**Passes when** every document the engineer gave has a row in `sources/README.md` and its converted file, or an open question; `intake-answers.md` is converted; and the home page is fetched, or the run-log note says why not and the brand question is asked.

**Sends**, only when it added questions: "Sources converted: <n> documents, <n> site pages. <n> questions added; the riskiest: Q-<n>, <question>."

## Stage 2: Extract

Done by intake-analyst, dispatched for extraction with the converted sources (`sources/*.md` and `sources/site/`), `formats.md` and `intake-sheet.md`. It reads only the converted Markdown, never the originals. In one pass it writes:

1. `requirements.md`, `glossary.md`, `personas.md`, `workflows.md`, `integrations.md` and `open-questions.md`, each as `formats.md` says. A requirement found in a source but in no SOW item is `REQ-0.<n>`. The fork's `open-questions.md` starts with a logo question written as a bullet with no ID (`- **Logo and icon.** ...`). Rewrite it as `Q-1` in `formats.md`'s entry format, keeping its meaning, asked on the day it is rewritten. Questions stage 1 added keep their IDs, and new ones count on from the highest, from `Q-2` when there are none.
2. One entity spec per entity in `specs/entities/`, each started with
   ```
   dotnet run --project tools/<Code>.Scaffolder -c Release -- new <Name> <Plural>
   ```
   When `new` refuses a name the API already uses, such as `Route` or `Claim`, prefix it with a word from the client's domain (`DeliveryRoute`), and keep the glossary's label for the screens. Labels and the three examples use the glossary's words. The links wait for stage 3: the intake sheet's domain model names them, and the specs leave them out until the engineer has approved them.
3. The roles in `<Code>.API/Configuration/default-roles.json`, one per persona that signs in, beside the roles already there. Each spec's `defaultRoles` grants come from what each role must see and do across every SOW item, not only from the item's "User Roles this applies to" list: a role that reads an entity on another item's screen needs that entity's View.
4. The `check` loop, run until it passes:
   ```
   dotnet run --project tools/<Code>.Scaffolder -c Release -- check
   ```
   It writes nothing. It prints `<file>:<line>:<column>: <message>` to stderr for each problem and exits 1, or prints `Specs are valid.` and exits 0.
5. `intake-sheet.md`, from the template in `intake-sheet.md`, with `Status: draft`.

It never runs `generate`.

**Writes:** the six pack files above, `specs/entities/*.yaml`, `default-roles.json` and `intake-sheet.md`.

**Passes when** `check` prints `Specs are valid.` (run it once more after the agent reports); every requirement's Source names a converted file that exists and a line within it, or, for a row the engineer added on the intake sheet only, a line of the approved sheet as `formats.md` says; and the sheet has its ten parts and `Status: draft`.

**Sends** checkpoint 1's notification: "The intake sheet is ready: docs/project/intake-sheet.md. <n> guesses; the riskiest: <guess 1 in one sentence>. <n> open questions." The call ends with `design-intake: waiting on docs/project/intake-sheet.md`.

## Checkpoint 1

The engineer reads `docs/project/intake-sheet.md` in about 15 minutes, corrects it in place, and changes the status line to `Status: approved`.

While it says `Status: draft`, a run only reminds the engineer in chat: the file, how to correct it (edit any line in place, cross out a guess and write the answer beside it), and the line to change. It sends no second notification.

The engineer may also edit a pack file, a spec in `specs/entities/` or a role in `default-roles.json`. They may commit the edits or leave them in the working tree. The run commits them before stage 3, as `SKILL.md` says, and stage 3 reads them.

## Stage 3: Generate

Done by intake-analyst (step 1), the skill (steps 2, 3 and 5) and conductor-implementer (step 4). A failing check is fixed and run again (see "A failing check" and "Framework defects" in Terms).

1. **Apply the corrections, then declare the links.** Find stage 2's commit with `git log -1 --format=%H --grep="^Design intake stage 2: extract$"`. Dispatch intake-analyst for corrections with `git diff <that commit> HEAD -- docs/project/ specs/ <Code>.API/Configuration/default-roles.json`: the sheet's diff, and any pack file, spec or role the engineer edited. It carries each correction into the pack, the specs and the roles, with a `decisions.md` line for each (decided by: engineer). A correction it can't apply without guessing becomes an open question with its best guess, and the run goes on. Then it declares each link in the approved domain model's "Links to" column that the generator can write as a `type: link` field in its spec, as the fork's `CLAUDE.md` "Links" says, and leaves the rest hand-built. The `check` loop passes again.

   The approved sheet is never rewritten: it is the record of what the engineer approved, and a line a correction made stale stays as it is. From here on the pack and the specs are current, and a later stage that reads the sheet reads it through stage 3's corrections in `decisions.md`.
2. **Generate every entity**, following the fork's `CLAUDE.md` "Adding an entity" for all the specs at once:
   1. `dotnet run --project tools/<Code>.Scaffolder -c Release -- generate --skip-api`
   2. The build: `dotnet build <Code>.Web.sln -c Release -p:ShouldRunNpmInstall=false -p:ShouldRunBuildScript=false`
   3. **A migration.** The fork's `CLAUDE.md` makes deleting migration files a person's job, so intake never regenerates `Initial`. Add an additive migration named for the change, such as `ClientEntities`: `dotnet ef migrations add <Name> --project <Code>.Infrastructure --startup-project <Code>.API --configuration Release`, with a `decisions.md` line. The run-log note, the stage's chat message and checkpoint 2's notification ask the engineer to regenerate `Initial` before the first deployment.
   4. `dotnet run --project tools/<Code>.Scaffolder -c Release -- generate`
   5. The new screens' baselines, in the active theme (see Baselines).
   6. The checks. The first `npm test` writes the new stories' Storybook snapshots, and that diff only adds lines. Check it with `git diff --patience --numstat` on the snapshot file, since git's default diff can show an add-only change as removed lines. A fix that changes an example after that first `npm test` rewrites the snapshots the stage wrote with `npm test -- -u`; the diff from the stage's start commit still only adds lines.

   Companion rules the specs can't state are the build's work, not intake's.
3. **Remove Order.** Once the client's entities pass, commit the stage's work so far (as `Design intake stage 3: generate, work so far`), so what the command changes is the whole diff, then run:
   ```
   dotnet run --project tools/<Code>.Scaffolder -c Release -- ready orders
   ```
   It removes the demo entity, sets `client.yaml`'s `ready.orders: removed`, and prints its follow-ups. Run them in order, with an additive migration (as in step 2.3, such as `RemoveOrders`) where it says to regenerate `Initial`: the migration, `generate`, `npm test -- -u` (the Storybook snapshot diff only removes lines, by `git diff --patience --numstat`), then the checks. The home page loses Order's queues, so rewrite its baselines (see Baselines, `-g home`) before the screenshots. From here on, no screen shows "Orders".

   When `client.yaml` already says `ready.orders: removed`, an earlier try at this stage removed Order. Skip `ready orders`, which refuses a second run with exit 1, and run its follow-ups.
4. **Home queues.** One conductor-implementer unit, `home queues`, on `intake-generate` (see Working with agents), writes each entity's queues companion, `<Code>.React/src/app/<plural in kebab case>/<camelPlural>Queues.ts`, from the personas' questions ("what needs my approval", "what failed", "what's due"), so the home page answers them for each persona. Every filter a queue sets must be one the list shows that user, which `homeQueues.test.ts` checks. An entity no persona's question touches keeps its empty list. A question that touches an entity but that no list filter can answer, because it needs a field the spec doesn't have (such as when a record was created), is hand-built: the implementer's report names it, and so does the run-log note. The harness's home state for each role shows that role's queues, so the home's baselines are rewritten again (see Baselines, `-g home`).

   The unit's commit is `Design intake stage 3: generate, home queues`. Its checks are the React checks (`npm run lint && npm run typecheck && npm test`, which runs `homeQueues.test.ts`) and `npm run screens -- --active`. If step 5 then fails in the unit's files, the unit runs again: `git switch -C intake-generate main`, the failure to the implementer, its checks, and the merge, as another round.
5. **The last checks, then the push.** Run the checks. When every one passes, commit and push: this is intake's first push.

**Writes:** the corrected pack, specs and roles, the links in the specs among them; the generated slices and their companions; the queues; the migrations; the OpenAPI document and API types; the Storybook snapshots and baselines; `client.yaml`'s `ready.orders`.

**Passes when** `generate --check` passes, `ready.orders` is `removed`, every link the generator can write is declared, and every check passes.

**Sends**, only when the corrections added questions: "Entities generated and pushed: <n> entities, <n> corrections applied. <n> questions added; the riskiest: Q-<n>, <question>." The chat message adds: "Before the first deployment, regenerate Initial: intake added <n> migrations."

## Stage 4: Brief

Done by design-director.

1. **Brand capture.** Take the site URL from `sources/intake-answers.md`. Fetch the client site's pages that show the logo, the services and the voice, at most 6 client pages in all, the home page from stage 1 included:
   ```
   dotnet run --project tools/<Code>.Scaffolder -c Release -- sources fetch <url> --allow <site host> --to site
   ```
   If stage 1 has no home page, try it once. Every fetch tried counts toward the 6, a refused one included. Take the other pages only from links on a page you fetched; never guess a path.

   Then the reference products. Fetch only those the approved intake sheet lists under "Guesses on what the SOW doesn't say", liked or disliked. A product the engineer struck there is never fetched, even though `intake-answers.md` still names it. Take each URL from `intake-answers.md`, or from the sheet when the engineer wrote one there. A listed product with no URL in either, or a tool or form with no pages (paper tickets, a spreadsheet), is read from what the sheet says, as what it contributes or what to avoid, not fetched. Fetch its public pages, at most 3 each:
   ```
   dotnet run --project tools/<Code>.Scaffolder -c Release -- sources fetch <url> --allow <product host> --to references
   ```
   Pass each `--allow` the host without a leading `www.`, as in stage 1. Each page lands at `docs/project/sources/<site|references>/<host>/<path slug>.md`, as in stage 1. Fetch only the pages brand capture needs: no sign-ins, no forms, never `--refresh`. Reference products are read for density and interaction patterns, never for styling to copy.

   When no client page was read, for any reason (a name that doesn't resolve, robots.txt, a site that renders only with scripts), and no open question asks for the brand guide yet, add one, and guess from what was read.
2. **The brief**, `docs/project/design/brief.md`, in at most 700 words:
   - the subject and its metaphor, from the client's work, never "modern and professional". With no client page or brand source read, it says so.
   - the audiences and their density, per page group. A theme has two densities: its own, set for the main audience (a desk tool is compact, close reading now and then comfortable), and the touch block, for a page used on a phone outdoors or with large targets. A page group that uses the touch block is a "touch group". A page group that shares an entity with a desk group gets hand-built screens and routes of its own: never mark a generated route a desk group uses as touch.
   - tone and copy voice, with `glossary.md` as the source of words
   - the brand: colors with their OKLCH values, fonts, and the logo. With no color declared anywhere, guess them from the trade and the subject, each marked `guess`; with no font declared, name none and list two to four checked packages for the directions. Log each guess in `decisions.md`. A font loads only from an `@fontsource-variable` package under the SIL Open Font License 1.1, so the brief names the closest open font that has one.
   - what each reference product contributes, or what to avoid
   - the tell list: the framework's (`docs/design-system.md`, "The tell list"), plus anything this client's users would find generic

**Writes:** `sources/site/`, `sources/references/`, `sources/README.md`, `design/brief.md`, and `open-questions.md` when it asks.

**Passes when** the brief holds all six parts in at most 700 words, and every page fetched is within the limits and indexed.

**Sends**, only when it added questions: "Design brief written. <n> questions added; the riskiest: Q-<n>, <question>."

## Stage 5: Directions

Done by design-director. conductor-design-steward reviews.

The skill dispatches three times, in this order, even when the steward flags nothing:

1. design-director, job "Directions": steps 1 to 4.
2. conductor-design-steward: step 5's review of step 4's run.
3. design-director, job "After review", with the steward's report: the rest of step 5 (the one revision and the steward's notes), then steps 6 to 8.

Steps:

1. **How many.** Three directions, or two when the brand already fixes most choices. Letters `a`, `b`, `c`.
2. **Each direction**, as `directions.md` says:
   - a theme folder, `<Code>.React/src/themes/direction-<letter>/`, with `theme.css` and `README.md` ("Theme folder rules"). Install each font's `@fontsource-variable` package at an exact version published at least 14 days ago, `npm install <package>@<version>` (`npm view <package> time` lists the dates), which writes `package.json` and `package-lock.json`. When the brief has a touch group, `theme.css` holds the touch block, `@media screen { [data-density="touch"] { ... } }`.
   - `docs/project/design/directions/<letter>-<name>.md` ("Per-direction file").

   Never edit a demo theme or `client.yaml`'s `theme`: the directions aren't active. While working, check the folders with `npx vitest run src/test/theme-contract.test.ts src/test/theme-contrast.test.ts src/test/theme-readme.test.ts`.
3. **A touch screen.** When the brief has a touch group whose main screen the generator writes, add a screen state with `density: 'touch'` for that screen to its entity's companion, `<Code>.React/screens/<camelPlural>Screens.ts`, such as `list: { touch: { density: 'touch', modes: ['mobile'] } }`, and write its baseline in the active theme (see Baselines). That baseline only keeps the active run passing; the lock replaces it. When the group's main screen is hand-built and not built yet, skip this step: the home's `touch` state already shows each direction's touch block, and stage 7 adds the screen's touch state with the screen.
4. **Show them on the client's screens.** Run the harness with only the direction themes, one `--theme` per letter made:
   ```
   npm run screens -- --theme direction-a --theme direction-b --theme direction-c
   ```
   The same command works in bash and PowerShell. Never set `SCREENS_THEMES` yourself: the script sets it for Playwright, and with no `--theme` it runs every theme folder. It shows the home page in each role's home state, with stage 3's queues, and each main entity's generated list, form and detail pages, with sample data from the spec examples. The step passes when the command exits 0: design-director fixes and reruns it as its own work (see "A failing check" and "Flakes" in Terms).
5. **Design review.** Dispatch conductor-design-steward over that run (see Working with agents), against the brief and the three litmus questions in `directions.md`. The captures it reads, for each direction: the 8 that step 7 copies, the main entity's list in dark and in print, and the touch capture; then the main entity's empty, error and form-error states, in light. It judges each direction's status tones from the direction file, since every direction's screens show the tones stage 2 wrote. A direction it flags gets one revision by design-director, within which the director reruns step 4 and fixes what it sees until it passes. design-director writes the steward's notes into the direction file's "Steward's notes", and the direction goes to the pick. It is never reviewed twice, so the stage can't loop.
6. **The gate.** Run `npm run screens` once, with every theme folder, the demo themes included. The gate judges the direction themes: each direction's captures pass axe and the layout gates, and the fingerprint passes across every theme, each direction differing from every other theme folder in at least three measures (`screens-output/fingerprint.json`). A demo theme's failure on a client screen doesn't block, since the lock retires the demo themes: the run-log note lists each one by theme, route and mode. A failing direction capture is rerun alone once (Flakes, in Terms). Then `npm run lint && npm run typecheck && npm test`.
7. **The captures.** Copy them from the gate's run, before the harness runs again (see Captures, in Terms): 8 per direction from `<Code>.React/screens-output/direction-<letter>/<light|mobile>/`, plus the touch capture when the brief has a touch group, to `docs/project/design/directions/captures/`, with the captures and names in `directions.md` ("Captures").
8. **The README**, `docs/project/design/directions/README.md`, from `directions.md` ("Directions README"), with `Status: waiting for your pick` and step 4's exact command as the contact sheet command.

**Writes:** the `direction-*` theme folders, the font packages in `package.json` and `package-lock.json`, the touch state and its baseline when step 3 runs, the direction files, the captures and the README.

**Passes when** every direction passes the contract, contrast and README tests; in the every-theme run, every direction's captures and the fingerprint pass, with any demo-theme failure on a client screen listed in the run-log note; the React checks pass; each direction has its captures and a complete file with the steward's notes; and the README is written.

**Sends** checkpoint 2's notification: "Directions are ready to pick: docs/project/design/directions/README.md. <n> directions: <letter and name>, ... Steward's flags: <one line each, or none>." When intake added migrations, it ends: "Before the first deployment, regenerate Initial: intake added <n> migrations." The call ends with `design-intake: waiting on docs/project/design/directions/README.md`.

## Checkpoint 2

The engineer reads `docs/project/design/directions/README.md` in about 10 minutes, writes the pick on its Pick line (one direction, a mix such as "B, with A's headings", or a direction with adjustments in plain words), and changes the status to `Status: picked`. The client doesn't see the directions.

While it says `Status: waiting for your pick`, a run only reminds the engineer in chat: the file, the Pick and status lines, and the contact sheet command in the README. It sends no second notification. A `Status: picked` whose Pick line is still `Pick: (not yet chosen)` counts as waiting, and gets the same reminder.

The run commits the engineer's edit before stage 6, as `SKILL.md` says, and stage 6 reads the Pick line.

## Stage 6: Lock

Done by design-director.

1. **The client theme.** `git mv` the picked direction's folder to `<Code>.React/src/themes/<lower>/`. Apply the engineer's mix or adjustments, and update its README, its fingerprint table included ("Theme folder rules" in `directions.md`). Delete the other direction folders. Then `npm uninstall` each font package that no theme folder left imports, the demo themes' included. Name the new folder in `client.yaml`'s `theme` and in `VITE_THEME` in `<Code>.React/.env`, together, since the drift test fails when they differ.

   The lock may change a value the pick doesn't name to pass a check, such as a contrast pair the mix breaks or a keyboard check, in the spirit of the pick, with a `decisions.md` line. If the fix would change a fingerprint measure or a token the bold move names, stop: `design-intake: stopped: the pick fails <check>`.
2. **The logo.** Take the first that applies:
   - `client.yaml`'s `logo` is already set: keep it.
   - The engineer supplied an image in `sources/originals/`: use it.
   - Brand capture found a usable logo in `sources/site/<host>/assets/`: use it. Usable means an `.svg`, `.png` or `.webp` that reads as the client's mark at small size, not a photo or a banner.
   - None: leave `logo: null`. The Pell placeholder stays, and so does `Q-1`, the logo question.

   To use a logo, copy it to `<Code>.React/public/brand-mark<ext>`, then set `client.yaml`'s `logo: <Code>.React/public/brand-mark<ext>` and `VITE_BRAND_MARK=/brand-mark<ext>` in `<Code>.React/.env` together. When it came from the client's site, `Q-1`, the logo question in `open-questions.md`, takes "using the logo from the client's site" as its guess.
3. **Remove the demo themes.** Commit the stage's work so far (as `Design intake stage 6: lock, work so far`), then run:
   ```
   dotnet run --project tools/<Code>.Scaffolder -c Release -- ready themes
   ```
   It needs `client.yaml`'s `theme` to name a non-demo folder with a `theme.css` that passes the contract, contrast and README tests, and to match `VITE_THEME`. It removes the four demo themes and their baselines, uninstalls the font packages only they import, sets `ready.demoThemes: removed`, and prints the screenshot steps for the client theme. When the theme has no baselines yet, as after a lock, that is `npm run screens -- --active --update-snapshots=missing`, a look at the new images, then `npm run screens -- --active`; otherwise only the last. Step 6 follows what it printed. If it fails after its first write, don't run it again, since the fonts can no longer be found: take the steps it names as not done by hand.
4. **Status tones.** Stage 2 wrote a tone for every status. For each workflow entity, rewrite them in its spec's `workflow.statuses` (`<Status>: <tone>`, in enum order): `neutral`, `info`, `success`, `warning` or `destructive`. The main entity's come from the pick's status tones, each label in the pick mapped to its enum name (`Not started` to `NotStarted`); the rest follow in the same spirit. Then:
   ```
   dotnet run --project tools/<Code>.Scaffolder -c Release -- generate
   ```
   See which Storybook snapshots changed with `npx vitest run src/test/storybook-snapshots.test.tsx`. If each failure is only a status stamp's tone (its tone classes and `data-tone`), run `npm test -- -u`. If anything else changed, stop: `design-intake: stopped: generate changed more than the tones`.
5. **Touch groups opt in.** Wrap the routes of each page group the brief marks touch in `DensityGroup` from `src/shared/components/DensityGroup.tsx`, in the app shell's routes, never in a generated file: `{ element: <DensityGroup density="touch"><Outlet /></DensityGroup>, children: [...] }`. A page never sets its own density; the design lint refuses it. A touch group with no routes yet, because its screens are hand-built and not built, is skipped: stage 7's first unit in it adds the route group. A touch state stage 5 added stays, since it shows a screen of that group.
6. **Baselines.** Write the client theme's baselines with the steps `ready themes` printed (see Baselines). Check each claim in the client theme's README against the new captures, and correct the README and `conventions.md` where a capture doesn't bear one out. Then run the checks. The baselines' last passing `npm run screens -- --active` counts as the checks' screenshots when nothing visible has changed since.
7. **`docs/project/design/conventions.md`**, with:
   - the page patterns used per page group, and which groups use the touch density
   - each persona's first page. For a persona whose first page isn't the attention-queue home, the check that sends them there: grants the persona holds and the home's personas don't. The administrator holds every permission, so a single grant sends them too; pair it with one the persona lacks, such as "holds `<Plural>.ViewAssigned` and not `<Plural>.View`".
   - the status tones per entity
   - the copy voice, with `docs/project/glossary.md` as the source of words
   - the empty, loading and error strings for each list screen in the inventory, in the client's words. Loading is the label the framework announces, since its loading state shows no words. An error string is for a failure with no title from the server; a server's title is shown as it is. The strings bind hand-built screens only: generated pages keep their templates' strings.
   - the design rules: home pages answer the personas' questions, density follows the audience, copy comes from the glossary, icons only where they help scanning, no decoration, and the unglamorous screens get equal care
   - what the pick changed
8. **`docs/project/design/screen-inventory.md`**: under the title, one summary line counting the screens by Written by and by State, then two tables. The first has one row per screen the app needs:
   ```
   |Screen|Pattern|Page group|Personas|Workflow|Requirements|Way in|Written by|API|State|
   |-|-|-|-|-|-|-|-|-|-|
   ```
   - Workflow: `WF-<n>`, or `none`.
   - Way in: how its personas reach it: a nav item, a home queue, or a link from a screen named here. A generated page can't link to a hand-built one, so a way in from a generated page is written `seam: <from where>`, for the build.
   - Written by: `generator`, `framework` (a screen the framework ships, such as home, sign-in, users and roles) or `hand-built`.
   - API: each endpoint it calls, as `<METHOD> /api/<route>`, marked `existing`, `stub to write` or `stub` (written, answers 501). A stub that adds input to a generated action, such as a reason or an outcome, is a resource of its own under the record, a noun in kebab case (`POST /api/<plural>/{shortId}/<noun>`), never a change to the generated action.
   - State: `exists` (the generator or the framework wrote it), `planned` (hand-built, not started), `prototype` (stage 7 built it on stubs) or `built` (the build filled its endpoints).

   The second has one row per link in the approved domain model's "Links to" column, a hand-built entity's links included, and checks that stage 3 declared each one it could:
   ```
   |From entity|Field|Points at|Required|Made by|
   |-|-|-|-|-|
   ```
   - Points at: the entity, or what it points at when that is no entity, such as the user.
   - Made by: `spec` for a link stage 3 declared as a `type: link` field, which `generate` turns into the pickers, filters, columns and detail links; or `hand-built: <why>` for one the generator can't write, such as a link on a child row, to the user, or to an entity with no spec. Read each `spec` row's field in its spec. A link the generator could write that no spec declares is `hand-built: not declared at stage 3`, with a `decisions.md` line, and the run-log note names it: the fork's `CLAUDE.md` "Adding a link" adds it later as a spec change and `generate`.

   The build works from the `hand-built` rows.

**Writes:** `src/themes/<lower>/`, `client.yaml` and `.env`, the brand mark, `open-questions.md`, the specs' tones and what `generate` rewrites, the route groups, the baselines, `conventions.md` and `screen-inventory.md`.

**Passes when** `client.yaml`'s `theme` is `<lower>` and its copies agree; `ready.demoThemes` is `removed`; no `direction-*` folder is left; the client theme's baselines are committed; every check passes; and both design files are written.

**Sends**, only when it added questions: "Design locked on <lower>. <n> questions added; the riskiest: Q-<n>, <question>."

## Stage 7: Prototype

Done by conductor-implementer, one unit at a time. conductor-design-steward reviews each unit.

A unit is one screen inventory row that is `hand-built` and `planned`, or the rows that call a stub in common (`stub to write` on both), in the inventory's order. A unit of several rows runs at its first row's place and is named for its first screen. An endpoint that already exists joins no rows. A run that stops part way resumes at the first `planned` row whose unit isn't parked. A unit that fails its checks three times is parked, and the stage goes on to the next unit (see Working with agents).

The implementer's brief adds to its own rules: a stub that throws `NotBuiltException` is the real contract, not a facade, and stays until the build fills it. Offline use, sync and anything else a stub can't show are the build's.

For each unit:

1. **The API contract, first.** Each endpoint the screen needs is written for real in C#. That includes one the inventory missed, such as an image the screen shows: write it as a stub too, and add it to the row.
   - its route under `/api/`, by the fork's `CLAUDE.md`. A stub that adds input to a generated action is a resource of its own (stage 6, step 8).
   - its permission: the existing one that says who may do it, or a new constant in a group of its own with its `PermissionDefinition` in `Permissions.All`, since a new key in an entity's group breaks that entity's generated permission tests. On the action as `[RequirePermission(Permissions.<Name>)]`, or `[RequireAnyPermission(Permissions.<A>, Permissions.<B>)]` where two grants open it.
   - its request and response models, `sealed class` with `required` members, the response declared with `[ProducesResponseType<T>(StatusCodes.Status200OK)]`
   - an action that throws `NotBuiltException` (in `<Code>.Domain/Exceptions`), which answers 501 "This part of the app isn't built yet." A stub on one record first checks the record's scope through the entity's generated `Visible...` or `...ToChange` helpers, as the fork's `CLAUDE.md` asks of a companion action, so a record out of scope answers 404 before the 501, and a change takes `If-Match`. The entity's generated scope test finds it, and its hand-written part gives a valid body for each new request type.
   - integration tests for 401, 403 and the 501

   Then refresh the OpenAPI document (the "Refresh the OpenAPI document" row of Standard commands) and the React types with `npm run generate:api`, so the page and its fixtures use the generated types.
2. **The page**, composed from the framework's patterns in `src/shared`, with its route, its permission guard, and a nav item when the page is a starting point rather than opened from another screen. A page in a touch group sits under its `DensityGroup` route group; the first unit in a touch group adds that group to the app shell's routes (stage 6, step 5). A persona whose first page isn't the attention-queue home gets it from the home route by the check `conventions.md` names. A link to a screen a later unit builds goes to the generated page for now, and the unit that builds the screen moves it. A way in the inventory marks `seam` is left for the build, and the implementer's report names it.
3. **Fixtures** in `<Code>.React/src/test/fixtures/`, typed by the generated types and written in the glossary's words. The harness's answers go in `screens/fixtures.ts`, and the screen states in `screens/routes.ts`, the empty, error and form-error states `conventions.md` names included, and a touch state for a page in a touch group.
4. **A story and a Vitest test.** Register the story in `STORY_MODULES` in `src/test/storybook-snapshots.test.tsx`, and render the test with `renderWithProviders`. Then the design lint (`npm run lint`) and the screenshots in the client theme (see Baselines). The page shows `conventions.md`'s strings, and a server's problem title as it is.
5. **The grants.** A new permission goes to the roles, in `default-roles.json`, of the personas that use the screen. A reused one is granted already.
6. **Design review**, on the unit's branch, before the unit merges. Once the unit's checks pass (below), dispatch conductor-design-steward (see Working with agents), against the brief and `conventions.md`, over the unit's captures from that run in every mode, plus the home and one generated list of the same page group for cohesion. Its brief says that a hand-built page showing the 501's "isn't built yet" load error is expected, by design, and no finding. The unit is flagged when any finding on its captures fails a litmus question or is ranked `blocks`. A flagged unit gets one revision on the same branch, with each flagged finding and the revision the steward gave for it (see Working with agents), then its checks run again, with no second review. The revision never edits `conventions.md`. Every finding that doesn't flag the unit, one in code outside the unit's diff or against a locked string included, goes in the stage's run-log note, or into an open question when it needs the client, for the build.

The unit's own commit, `Design intake stage 7: <first screen's name>`, moves its rows to `prototype`, their API marks from `stub to write` to `stub`, and the inventory's summary line. The unit's checks are the build, the integration tests, `npm run lint && npm run typecheck && npm test`, `npm run check:api` and `npm run screens -- --active`. A unit passes when its checks pass and the steward has reviewed it. Only then does it merge into `main`. The checks run once more at the stage's end.

**No links of its own.** Stage 3 declared every link the generator can write. A unit never adds a link field to a spec, never ejects a generated file, and never hand-writes a picker or filter into a generated page. The inventory's `hand-built` links wait for the build.

**Writes:** the endpoints, models and permissions, with their integration tests; the OpenAPI document and API types; the pages, routes, touch route groups and nav items; the fixtures, harness answers and screen states; the stories, Vitest tests, Storybook snapshots and baselines; `default-roles.json`; the inventory's rows and summary line; and `open-questions.md`.

**Passes when** every hand-built row is `prototype` or its unit is parked with an open question, each stub's tests prove its 401, 403 and 501, and every check passes.

**Sends**, in chat, and as a notification only when it added questions: "Prototype built: <n> screens on <n> stubs, <n> units parked. See them on the contact sheet (`npm run screens -- --active`, then `screens-output/index.html`) and in Storybook. In the running app a hand-built page shows its 501 as a load error until the build fills it." The engineer may walk the client through it by screen share. Corrections come back as edits to the pack, which the next stage reads; the run doesn't wait for them.

## Stage 8: Acceptance

Done by conductor-implementer, one unit per workflow, in `workflows.md`'s order. A unit that fails its checks three times is parked, and the stage goes on to the next workflow (see Working with agents). Each unit's commit is `Design intake stage 8: WF-<n> <workflow name>`.

For each requirement in `requirements.md` whose Scope is `in` and whose Verified by is `acceptance`, write a Playwright scenario in `<Code>.React/e2e/acceptance/<workflow>.spec.ts`, named for its workflow in kebab case. A requirement two workflows list is written once, in the first. A requirement no workflow lists goes in the unit of the workflow its screen serves (the inventory's Workflow column), or, when its screen serves none, in a last unit of its own, `other`, written to `other.spec.ts`. Each scenario:

- is tagged with every requirement it proves, as `{ tag: ['@REQ-14.3'] }`. A tag on `test.describe` counts for every test inside.
- is written from the requirement, its workflow, the guesses of the questions in its Depends on, and the prototype's screens, finding elements by role and by label in the glossary's words. A screen still `planned` has no labels yet: its steps use labels guessed in the glossary's words, which the build may rename but never drop.
- starts from records the seeded administrator makes through the endpoints the inventory names, a link given as `<field>ShortId`, with `e2e/support`'s record helpers, its helper for a change with `If-Match` among them. Its setup holds only what its requirement and workflow name: a scope or limit they don't name stays out.
- signs in the persona who does the step, with `signInWithRole(page, roleName)` from `e2e/support/users.ts`, which has the seeded administrator invite a new person with the role and deactivates that person when the test ends. The role must already exist in `default-roles.json` and must not require MFA (`requiresMfa: false`), since the helper can't answer an MFA challenge. The persona's first page doesn't matter: the helper waits for the sign-in, not for the home page. A second persona in the same scenario signs in on a page from the `newPerson` fixture of `e2e/support/people.ts`; the file then imports that module's `test` in place of Playwright's, which keeps the name the tag check reads.
- is marked with `test.fail(...)` in place of `test(...)`, as the fork's `e2e/acceptance/README.md` shows

```ts
import { expect, test } from '@playwright/test';
import { signInWithRole } from '../support/users';

test.fail('<what the persona does, in the glossary words>', { tag: ['@REQ-<item>.<n>'] }, async ({ page }) => {
  await signInWithRole(page, '<Role>');
  // the workflow's steps, found by role and label
});
```

The tag check reads only a call named `test` (or `test.fail`, `test.skip`, `test.only`, `test.fixme`) whose title is a string literal and whose last argument is an inline function, as above. Tell the implementer never to alias `test`, compute a title or pass a named callback: the check wouldn't see that scenario. Setup more than one file needs goes in `e2e/acceptance/support/*.ts`, never copied into each file.

**The mark is a ratchet**, and the implementer's brief says so, since its own rules would read the mark as a skipped test. While the feature isn't built, the scenario fails as expected and the gate passes. Once the feature works, Playwright fails the run with "expected to fail but passed", so the unit that built it removes the mark in the same change, turning `test.fail(` into `test(`. A requirement counts as verified only when its scenarios pass with no mark. A scenario that already passes, because a generated screen does what it asks, loses its mark now. Never weaken an assertion to make a scenario pass or fail.

**A marked scenario fails at the unbuilt part**, never at sign-in, setup or a wrong label. The framework's end-to-end config gives each action a short timeout, so a step on a control that isn't built fails at once instead of waiting out the test, which Playwright would count as unexpected; never raise it. The unit reads each marked scenario's error from the run (Playwright's JSON reporter gives each one's error and step), checks that it stops at the unbuilt part, and its report says where each stops. A part of a requirement no screen in the inventory offers is left unasserted, and becomes an open question for the build.

A requirement better proven below the UI (a time rule, arithmetic, a permission rule) says `integration` or `unit` and gets no scenario here. The build's units write those tests, tagged with the same ID.

Each unit passes `npm run lint && npm run typecheck && npm test`, whose tag check fails any test under `e2e/acceptance/` without a `@REQ-<n>.<n>` tag that names a requirement in `requirements.md`, and `npm run test:e2e`, where every marked scenario fails as expected at its unbuilt part and the framework's own specs still pass: the scenarios share their database. The unit's checks run once more at the stage's end.

**Writes:** `<Code>.React/e2e/acceptance/*.spec.ts`, `<Code>.React/e2e/acceptance/support/*.ts`, and `open-questions.md`.

**Passes when** every in-scope `acceptance` requirement has a tagged scenario or belongs to a parked unit with an open question, each scenario is marked with `test.fail` unless it already passes, each marked scenario fails at its unbuilt part, and the unit's checks pass.

**Sends**, in chat, and as a notification only when it added questions: "Acceptance written: <n> scenarios for <n> requirements, <n> scenarios already passing (<n> requirements verified), <n> units parked." The next run reports that intake is done.
