# Design intake stages

How to run each stage and checkpoint. `SKILL.md` decides which one runs, and holds the rules every stage shares: the commit, the `run-log.md` and `decisions.md` lines, the push and how a notification is sent. This file doesn't repeat them. Under each stage, "Sends" is what the engineer is told at its end.

## Terms used below

- `<Code>` and `<lower>` are `client.yaml`'s `name.code` and `name.lower`.
- Scaffolder commands run from the repository root. npm commands run in `<Code>.React/`.
- Pack paths are under `docs/project/`. `formats.md`, `intake-sheet.md` and `directions.md` sit beside this file, at `${CLAUDE_PLUGIN_ROOT}/skills/design-intake/references/`.
- **The checks** are every command in the fork's `CLAUDE.md` "Standard commands", run one at a time, each passing: the build, the unit and integration tests, the React checks, the screenshots in the active theme, end to end and `generate --check`. They share the integration tests' LocalDB database and port 7143, so never run two at once.
- **Baselines.** A screen new to the harness gets its baseline with `npm run screens -- --active --update-snapshots=missing`, which writes the missing ones alone, reports each one it writes as a failure, and moves none that exist. A screen the stage changed on purpose gets its baseline rewritten alone with `npm run screens -- --active --update-all -g <route>`. Either way, look at the images on the contact sheet (`screens-output/index.html`) first, then run `npm run screens -- --active`, which must pass. Never rewrite every baseline at once.

## Working with agents

- **intake-analyst and design-director** work in the fork's checkout, on `main`. Give each the stage and its job, the repository root, `client.yaml`'s names, and the paths of the references the stage names. Each ends with `{"files": [...], "questions": [...], "summary": "..."}`. Its `questions` feed the notification, and its `summary` the run-log note.
- **conductor-implementer** never works on `main`, and gets one unit at a time. Its worktree is the fork's own checkout, the repository root, switched to the unit's branch. It makes no other worktree. Before each unit:
  1. Commit the stage's work so far on `main` as `Design intake stage <n>: <name>, work so far`, unless there is nothing to commit. The implementer stops on a dirty tree.
  2. Run `git switch -C intake-<stage name> main`. This drops any commits an interrupted unit left on the branch, and that unit runs again.
  3. Give it the unit, the branch, its worktree (the repository root), the expected tip (`git rev-parse main`), `client.yaml` as its sentinel file, the references and the stage's rules.

  It commits on the branch and reports. Its own commit carries the unit's bookkeeping, such as stage 7's inventory row. A revision after stage 7's design review isn't a new unit: it runs on the same branch, with no `switch -C`, and the branch's tip (`git rev-parse HEAD`) as the expected tip. When the unit passes, `git switch main` and `git merge --ff-only intake-<stage name>`. At the stage's end, `git branch -d intake-<stage name>` when it is still there. Units run one at a time, because they share the database and the port.

  **Three failed rounds park a unit**, in stages 7 and 8. A round is one run of the unit's checks after the implementer reports. When a round fails, the implementer gets the failures and fixes them on the same branch, as for a revision; the round after a design review's revision counts too. After the third failed round:
  1. `git switch main`, then `git branch -m intake-<stage name> parked/intake-<stage name>-<unit>`, with `<unit>` the screen's name (stage 7) or the workflow's (stage 8) in kebab case. The unit is left as it is: unmerged, unpushed, its inventory row unchanged.
  2. Add an open question, in `formats.md`'s format, saying what the unit needs to pass, with the check that failed in its If wrong, the unit's requirements in its Blocks, and the guess that the build finishes the unit from its branch. List it in those requirements' Depends on, and add a `decisions.md` line naming the unit.
  3. Go on to the next unit. A run that resumes the stage skips any unit with a `parked/` branch, and the stage's run-log note names each parked unit.
- **conductor-design-steward** is read-only, in its screenshot mode. Give it `<Code>.React/screens-output/` (its `manifest.json` and the captures), `design/brief.md`, and from stage 6 on `design/conventions.md`. Its report is ranked prose.

## Stage 1: Sources

Done by the skill itself.

**Inputs.** Ask the engineer once:
- Required: the source documents (the SOW and anything sent with it: `.docx`, `.xlsx`, `.pdf`, `.md` or `.txt`) and the client's website URL.
- Optional, and skippable: a brand guide, logo file or prototype the client already has (files, screenshots or a URL), and the products the client's users like or dislike, with their URLs.

Without a SOW there is nothing to run. If no one can answer, stop and report what is missing.

1. **Convert each document.**
   ```
   dotnet run --project tools/<Code>.Scaffolder -c Release -- sources add <file>...
   ```
   It writes the original, unchanged, to `docs/project/sources/originals/<file name>`; the Markdown to `docs/project/sources/<slug>.md`, whose first line is `<!-- source: originals/<file> | sha256: <hex> | converted: <date> | converter: sources 1 -->`; and a row in `docs/project/sources/README.md`. A file already converted is skipped. A PDF with no text is reported as unreadable, the rest are still converted, and the run exits 1: add an open question asking for a text copy, with the guess that the build goes on without it. Number stage 1's questions from `Q-2`, since stage 2 makes the fork's logo question `Q-1`.
2. **Record the answers as a source**, so no later stage depends on this conversation. Write them to `intake-answers.md` in a temporary folder outside the repository, in this shape, and `sources add` it:
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
   Pass `--allow` the bare domain (`example.com`, not `www.example.com`). It takes the domain's subdomains too, so a redirect from `example.com` to `www.example.com` is followed, while one from `www.` to the bare domain would be refused. It writes `docs/project/sources/site/<host>/<path slug>.md`, with a `## Brand signals` section (colors ranked by use, fonts, logo candidates) and `## Page text`, saves the logo candidates in `assets/` beside it, and adds a row to `sources/README.md`. This page is the first of the 6 client pages stage 4 may fetch. A refused fetch (robots.txt, not HTML, a redirect off the host) is noted in the run-log, never worked around.

Never pass `--refresh` once stage 2 has cited a file, since the cited lines must not move. A new version of a document is added under a new file name.

**Writes:** `sources/originals/`, `sources/*.md` (`intake-answers.md` among them), `sources/site/`, `sources/README.md`, and `open-questions.md` when a file is refused.

**Passes when** every document the engineer gave has a row in `sources/README.md` and its converted file, or an open question; `intake-answers.md` is converted; and the home page is fetched, or the run-log note says why not.

**Sends**, only when it added questions: "Sources converted: <n> documents, <n> site pages. <n> questions added; the riskiest: Q-<n>, <question>."

## Stage 2: Extract

Done by intake-analyst, dispatched for extraction with the converted sources (`sources/*.md` and `sources/site/`), `formats.md` and `intake-sheet.md`. It reads only the converted Markdown, never the originals. In one pass it writes:

1. `requirements.md`, `glossary.md`, `personas.md`, `workflows.md`, `integrations.md` and `open-questions.md`, each as `formats.md` says. A requirement found in a source but in no SOW item is `REQ-0.<n>`. The fork's `open-questions.md` starts with a logo question written as a bullet with no ID (`- **Logo and icon.** ...`). Rewrite it as `Q-1` in `formats.md`'s entry format, keeping its meaning. Questions stage 1 added keep their IDs, and new ones count on from the highest, from `Q-2` when there are none.
2. One entity spec per entity in `specs/entities/`, each started with
   ```
   dotnet run --project tools/<Code>.Scaffolder -c Release -- new <Name> <Plural>
   ```
   Labels and the three examples use the glossary's words.
3. The roles in `<Code>.API/Configuration/default-roles.json`, one per persona that signs in, beside the roles already there. Each spec's `defaultRoles` grants come from the SOW's "User Roles this applies to" lists.
4. The `check` loop, run until it passes:
   ```
   dotnet run --project tools/<Code>.Scaffolder -c Release -- check
   ```
   It writes nothing. It prints `<file>:<line>:<column>: <message>` to stderr for each problem and exits 1, or prints `Specs are valid.` and exits 0.
5. `intake-sheet.md`, from the template in `intake-sheet.md`, with `Status: draft`.

It never runs `generate`.

**Writes:** the six pack files above, `specs/entities/*.yaml`, `default-roles.json` and `intake-sheet.md`.

**Passes when** `check` prints `Specs are valid.` (run it once more after the agent reports); every requirement's Source names a converted file that exists and a line within it, or, for a row the engineer added on the intake sheet only, a line of the approved sheet as `formats.md` says; and the sheet has its ten parts and `Status: draft`.

**Sends** checkpoint 1's notification: "The intake sheet is ready: docs/project/intake-sheet.md. <n> guesses; the riskiest: <guess 1 in one sentence>. <n> open questions."

## Checkpoint 1

The engineer reads `docs/project/intake-sheet.md` in about 15 minutes, corrects it in place, and changes the status line to `Status: approved`.

While it says `Status: draft`, a run only reminds the engineer in chat: the file, how to correct it (edit any line in place, cross out a guess and write the answer beside it), and the line to change. It sends no second notification.

The engineer may also edit a pack file, a spec in `specs/entities/` or a role in `default-roles.json`. They may commit the edits or leave them in the working tree. The run commits them before stage 3, as `SKILL.md` says, and stage 3 reads them.

## Stage 3: Generate

Done by intake-analyst (step 1), the skill (steps 2, 3 and 5) and conductor-implementer (step 4).

1. **Apply the corrections.** Find stage 2's commit with `git log -1 --format=%H --grep="^Design intake stage 2: extract$"`. Dispatch intake-analyst for corrections with `git diff <that commit> HEAD -- docs/project/ specs/ <Code>.API/Configuration/default-roles.json`: the sheet's diff, and any pack file, spec or role the engineer edited. It carries each correction into the pack, the specs and the roles, with a `decisions.md` line for each (decided by: engineer). A correction it can't apply without guessing becomes an open question with its best guess, and the run goes on. The `check` loop passes again.
2. **Generate every entity**, following the fork's `CLAUDE.md` "Adding an entity" for all the specs at once:
   1. `dotnet run --project tools/<Code>.Scaffolder -c Release -- generate --skip-api`
   2. The build: `dotnet build <Code>.Web.sln -c Release -p:ShouldRunNpmInstall=false -p:ShouldRunBuildScript=false`
   3. Regenerate `Initial`: delete `<Code>.Infrastructure/Migrations/*`, then `dotnet ef migrations add Initial --project <Code>.Infrastructure --startup-project <Code>.API --configuration Release`. If deleting is refused, add an additive migration with the same command and a new name, and say so in `decisions.md` and the stage's notes.
   4. `dotnet run --project tools/<Code>.Scaffolder -c Release -- generate`
   5. The new screens' baselines, in the active theme (see Baselines).
   6. The checks. The first `npm test` writes the new stories' Storybook snapshots, and that diff only adds lines.

   Companion rules the specs can't state are the build's work, not intake's.
3. **Remove Order.** Once the client's entities pass, commit the stage's work so far (as `Design intake stage 3: generate, work so far`), so what the command changes is the whole diff, then run:
   ```
   dotnet run --project tools/<Code>.Scaffolder -c Release -- ready orders
   ```
   It removes the demo entity, sets `client.yaml`'s `ready.orders: removed`, and prints its follow-ups. Run them in order: regenerate `Initial` (as in step 2.3), run `generate`, run `npm test -- -u` (the Storybook snapshot diff only removes lines), then the checks. The home page loses Order's queues, so rewrite its baseline (see Baselines, `-g home`) before the screenshots. From here on, no screen shows "Orders".

   When `client.yaml` already says `ready.orders: removed`, an earlier try at this stage removed Order. Skip `ready orders`, which refuses a second run with exit 1, and run its follow-ups.
4. **Home queues.** conductor-implementer writes each entity's queues companion, `<Code>.React/src/app/<plural in kebab case>/<camelPlural>Queues.ts`, from the personas' questions ("what needs my approval", "what failed", "what's due"), so the home page answers them for each persona. Every filter a queue sets must be one the list shows that user, which `homeQueues.test.ts` checks. An entity no persona's question touches keeps its empty list. The home page's baseline is rewritten again.
5. **The last checks, then the push.** Run the checks. When every one passes, commit and push: this is intake's first push.

**Writes:** the corrected pack, specs and roles; the generated slices and their companions; the queues; the migration; the OpenAPI document and API types; the Storybook snapshots and baselines; `client.yaml`'s `ready.orders`.

**Passes when** `generate --check` passes, `ready.orders` is `removed`, and every check passes.

**Sends**, only when the corrections added questions: "Entities generated and pushed: <n> entities, <n> corrections applied. <n> questions added; the riskiest: Q-<n>, <question>."

## Stage 4: Brief

Done by design-director.

1. **Brand capture.** Take the site URL from `sources/intake-answers.md`. Fetch the client site's pages that show the logo, the services and the voice, at most 6 client pages in all, the home page from stage 1 included:
   ```
   dotnet run --project tools/<Code>.Scaffolder -c Release -- sources fetch <url> --allow <site domain> --to site
   ```
   Then the reference products. Fetch only those the approved intake sheet lists under "Guesses on what the SOW doesn't say", liked or disliked. A product the engineer struck there is never fetched, even though `intake-answers.md` still names it. Take each URL from `intake-answers.md`, or from the sheet when the engineer wrote one there. A listed product with no URL in either is read from what the sheet says, not fetched. Fetch its public pages, at most 3 each:
   ```
   dotnet run --project tools/<Code>.Scaffolder -c Release -- sources fetch <url> --allow <product domain> --to references
   ```
   Pass each `--allow` the bare domain, as in stage 1. Each page lands at `docs/project/sources/<site|references>/<host>/<path slug>.md`, as in stage 1. Fetch only the pages brand capture needs: no sign-ins, no forms, never `--refresh`. Reference products are read for density and interaction patterns, never for styling to copy. A site that renders only with scripts leaves little page text: add an open question asking for the brand guide, and guess from what was read.
2. **The brief**, `docs/project/design/brief.md`, on one page:
   - the subject and its metaphor, from the client's work, never "modern and professional"
   - the audiences and their density, per page group: a desk tool is compact, and a page used on a phone outdoors uses the touch density. A page group that uses it is a "touch group".
   - tone and copy voice, with `glossary.md` as the source of words
   - the brand: colors with their OKLCH values, fonts, and the logo. A font with no `@fontsource-variable` package can't load under the CSP, so the brief names the closest open font that has one.
   - what each reference product contributes
   - the tell list: the framework's (`docs/design-system.md`, "The tell list"), plus anything this client's users would find generic

**Writes:** `sources/site/`, `sources/references/`, `sources/README.md`, `design/brief.md`, and `open-questions.md` when it asks.

**Passes when** the brief holds all six parts on one page, and every page fetched is within the limits and indexed.

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
   - a theme folder, `<Code>.React/src/themes/direction-<letter>/`, with `theme.css` and `README.md` ("Theme folder rules"). Install each font's `@fontsource-variable` package with `npm install`. When the brief has a touch group, `theme.css` holds the touch block, `@media screen { [data-density="touch"] { ... } }`.
   - `docs/project/design/directions/<letter>-<name>.md` ("Per-direction file").

   Never edit a demo theme or `client.yaml`'s `theme`: the directions aren't active. While working, check the folders with `npx vitest run src/test/theme-contract.test.ts src/test/theme-contrast.test.ts src/test/theme-readme.test.ts`.
3. **A touch screen.** When the brief has a touch group, add a screen state with `density: 'touch'` for that group's main screen to its entity's companion, `<Code>.React/screens/<camelPlural>Screens.ts`, such as `list: { touch: { density: 'touch', modes: ['mobile'] } }`, and write its baseline in the active theme (see Baselines).
4. **Show them on the client's screens.** Run the harness with only the direction themes, one `--theme` per letter made:
   ```
   npm run screens -- --theme direction-a --theme direction-b --theme direction-c
   ```
   The same command works in bash and PowerShell. Never set `SCREENS_THEMES` yourself: the script sets it for Playwright, and with no `--theme` it runs every theme folder. It shows the home page with stage 3's queues and each main entity's generated list, form and detail pages, with sample data from the spec examples. The contact sheet puts the directions side by side.
5. **Design review.** Dispatch conductor-design-steward over that run, against the brief and the three litmus questions in `directions.md`. A direction it flags gets one revision by design-director, and step 4 runs again. design-director writes the steward's notes into the direction file's "Steward's notes", and the direction goes to the pick. It is never reviewed twice, so the stage can't loop.
6. **The gate.** Run `npm run screens` once, with every theme folder, the demo themes included. It must pass: each direction differs from every other theme in at least three fingerprint measures (`screens-output/fingerprint.json`), and passes axe and the layout gates. Then `npm run lint && npm run typecheck && npm test`.
7. **The captures.** Copy 8 per direction from `<Code>.React/screens-output/direction-<letter>/<light|mobile>/<route>-<state>.png` to `docs/project/design/directions/captures/`, with the names and the optional touch capture in `directions.md` ("Captures"): the home page, and the main workflow entity's list, form and detail pages.
8. **The README**, `docs/project/design/directions/README.md`, from `directions.md` ("Directions README"), with `Status: waiting for your pick` and step 4's exact command as the contact sheet command.

**Writes:** the `direction-*` theme folders, the font packages in `package.json`, the touch state and its baseline, the direction files, the captures and the README.

**Passes when** every direction passes the contract, contrast and README tests; the every-theme run passes, fingerprint included; the React checks pass; each direction has its 8 captures and a complete file with the steward's notes; and the README is written.

**Sends** checkpoint 2's notification: "Directions are ready to pick: docs/project/design/directions/README.md. <n> directions: <letter and name>, ... Steward's flags: <one line each, or none>."

## Checkpoint 2

The engineer reads `docs/project/design/directions/README.md` in about 10 minutes, writes the pick on its Pick line (one direction, a mix such as "B, with A's headings", or a direction with adjustments in plain words), and changes the status to `Status: picked`. The client doesn't see the directions.

While it says `Status: waiting for your pick`, a run only reminds the engineer in chat: the file, the Pick and status lines, and the contact sheet command in the README. It sends no second notification. A `Status: picked` whose Pick line is still `Pick: (not yet chosen)` counts as waiting, and gets the same reminder.

The run commits the engineer's edit before stage 6, as `SKILL.md` says, and stage 6 reads the Pick line.

## Stage 6: Lock

Done by design-director.

1. **The client theme.** `git mv` the picked direction's folder to `<Code>.React/src/themes/<lower>/`. Apply the engineer's mix or adjustments, and update its README, its fingerprint table included ("Theme folder rules" in `directions.md`). Delete the other direction folders, and `npm uninstall` the font packages only they imported. Then name the new folder in `client.yaml`'s `theme` and in `VITE_THEME` in `<Code>.React/.env`, together, since the drift test fails when they differ. If the mix breaks a contrast pair, fix the pair in the spirit of the pick and add a `decisions.md` line.
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
4. **Status tones.** For each workflow entity, write each status's tone into its spec's `workflow.statuses` (`<Status>: <tone>`, in enum order): `neutral`, `info`, `success`, `warning` or `destructive`, from the pick's status tones for the main entity and in the same spirit for the rest. Then:
   ```
   dotnet run --project tools/<Code>.Scaffolder -c Release -- generate
   ```
   If the Storybook snapshots change only where a tone changed, read the diff, then run `npm test -- -u`.
5. **Touch groups opt in.** Wrap the routes of each page group the brief marks touch in `DensityGroup` from `src/shared/components/DensityGroup.tsx`, in the app shell's routes, never in a generated file: `{ element: <DensityGroup density="touch"><Outlet /></DensityGroup>, children: [...] }`. A page never sets its own density; the design lint refuses it.
6. **Baselines.** Write the client theme's baselines with the steps `ready themes` printed (see Baselines), then run the checks.
7. **`docs/project/design/conventions.md`**, with:
   - the page patterns used per page group, and which groups use the touch density
   - the status tones per entity
   - the copy voice, with the glossary as the source of words
   - the empty, loading and error states, in the client's words
   - the design rules: home pages answer the personas' questions, density follows the audience, copy comes from the glossary, icons only where they help scanning, no decoration, and the unglamorous screens get equal care
   - what the pick changed
8. **`docs/project/design/screen-inventory.md`**, with two tables. The first has one row per screen the app needs:
   ```
   |Screen|Pattern|Page group|Personas|Workflow|Requirements|Written by|API|State|
   |-|-|-|-|-|-|-|-|-|
   ```
   - Written by: `generator` or `hand-built`.
   - API: each endpoint it calls, as `<METHOD> /api/<route>`, marked `existing` or `stub to write`.
   - State: `exists` (the generator wrote it), `planned` (hand-built, not started), `prototype` (stage 7 built it on stubs) or `built` (the build filled its endpoints).

   The second has one row per link between entities in the approved domain model:
   ```
   |From entity|Field|Points at|Required|Adds|
   |-|-|-|-|-|
   ```
   - Adds: the pickers, filters, columns and detail links the link brings, and on which screens.

   The build, or the generator once it writes links, works from this table.

**Writes:** `src/themes/<lower>/`, `client.yaml` and `.env`, the brand mark, `open-questions.md`, the specs' tones and what `generate` rewrites, the route groups, the baselines, `conventions.md` and `screen-inventory.md`.

**Passes when** `client.yaml`'s `theme` is `<lower>` and its copies agree; `ready.demoThemes` is `removed`; no `direction-*` folder is left; the client theme's baselines are committed; every check passes; and both design files are written.

**Sends**, only when it added questions: "Design locked on <lower>. <n> questions added; the riskiest: Q-<n>, <question>."

## Stage 7: Prototype

Done by conductor-implementer, one unit at a time. conductor-design-steward reviews each unit.

A unit is one screen inventory row that is `hand-built` and `planned`, or one workflow when its screens share an API, in the inventory's order. A run that stops part way resumes at the first `planned` row whose unit isn't parked. A unit that fails its checks three times is parked, and the stage goes on to the next row (see Working with agents).

The implementer's brief adds to its own rules: a stub that throws `NotBuiltException` is the real contract, not a facade, and stays until the build fills it.

For each unit:

1. **The API contract, first.** Each endpoint the screen needs is written for real in C#:
   - its route under `/api/`, by the fork's `CLAUDE.md`
   - its permission: a constant and a `PermissionDefinition` in `Permissions.All`, on the action as `[RequirePermission(Permissions.<Name>)]`
   - its request and response models, `sealed class` with `required` members, the response declared with `[ProducesResponseType<T>(StatusCodes.Status200OK)]`
   - an action that throws `NotBuiltException` (in `<Code>.Domain/Exceptions`), which answers 501 "This part of the app isn't built yet."
   - integration tests for 401, 403 and the 501

   Then refresh the OpenAPI document (the "Refresh the OpenAPI document" row of Standard commands) and the React types with `npm run generate:api`, so the page and its fixtures use the generated types.
2. **The page**, composed from the framework's patterns in `src/shared`, with its route, nav item and permission guard. A page in a touch group sits under its `DensityGroup` route group. A persona whose first page isn't the attention-queue home gets it from the home route by permission.
3. **Fixtures** in `<Code>.React/src/test/fixtures/`, typed by the generated types and written in the glossary's words. The harness's answers go in `screens/fixtures.ts`, and the screen states in `screens/routes.ts`.
4. **A story and a Vitest test.** Register the story in `STORY_MODULES` in `src/test/storybook-snapshots.test.tsx`, and render the test with `renderWithProviders`. Then the design lint (`npm run lint`) and the screenshots in the client theme (see Baselines).
5. **The grants.** The new permissions go to the roles, in `default-roles.json`, of the personas that use the screen.
6. **Design review**, on the unit's branch, before the unit merges. Once the unit's checks pass (below), conductor-design-steward reviews the captures that run wrote, against the brief and `conventions.md`. A unit it flags gets one revision on the same branch (see Working with agents), then its checks run again, with no second review.

The unit's own commit moves its inventory row to `prototype`. The unit's checks are the build, its integration tests, `npm run lint && npm run typecheck && npm test`, `npm run check:api` and `npm run screens -- --active`. A unit passes when its checks pass and the steward has reviewed it. Only then does it merge into `main`. The checks run once more at the stage's end.

**No links, and nothing that blocks them.** A unit never adds a link between entities, never ejects a generated file, and never hand-writes a picker or filter into a generated page. A generated form or list shows only its entity's own fields until the link is added. That keeps every link addable later as a spec change and `generate`. The links wait in the inventory's links table.

**Writes:** the endpoints, models and permissions, with their integration tests; the OpenAPI document and API types; the pages, routes and nav items; the fixtures, harness answers and screen states; the stories, Vitest tests, Storybook snapshots and baselines; `default-roles.json`; and the inventory rows.

**Passes when** every hand-built row is `prototype` or its unit is parked with an open question, each stub's tests prove its 401, 403 and 501, and every check passes.

**Sends**, in chat, and as a notification only when it added questions: "Prototype built: <n> screens on <n> stubs, <n> units parked. See them on the contact sheet (`npm run screens -- --active`, then `screens-output/index.html`) and in Storybook. In the running app a hand-built page shows its 501 as a load error until the build fills it." The engineer may walk the client through it by screen share. Corrections come back as edits to the pack, which the next stage reads; the run doesn't wait for them.

## Stage 8: Acceptance

Done by conductor-implementer, one unit per workflow. A unit that fails its checks three times is parked, and the stage goes on to the next workflow (see Working with agents).

For each requirement in `requirements.md` whose Scope is `in` and whose Verified by is `acceptance`, write a Playwright scenario in `<Code>.React/e2e/acceptance/<workflow>.spec.ts`, named for its workflow in kebab case. Each scenario:

- is tagged with every requirement it proves, as `{ tag: ['@REQ-14.3'] }`. A tag on `test.describe` counts for every test inside.
- is written from the requirement, its workflow and the prototype's screens, finding elements by role and by label in the glossary's words
- signs in as a user of the persona's role with `signInWithRole(page, roleName)` from `e2e/support/users.ts`, which has the seeded administrator invite a new person with the role. The role must already exist in `default-roles.json` and must not require MFA (`requiresMfa: false`), since the helper can't answer an MFA challenge.
- is marked `test.fail()`

```ts
import { expect, test } from '@playwright/test';
import { signInWithRole } from '../support/users';

test('<what the persona does, in the glossary words>', { tag: ['@REQ-<item>.<n>'] }, async ({ page }) => {
  test.fail();
  await signInWithRole(page, '<Role>');
  // the workflow's steps, found by role and label
});
```

The tag check reads only a call named `test` (or `test.fail`, `test.skip`, `test.only`, `test.fixme`) whose title is a string literal and whose last argument is an inline function, as above. Tell the implementer never to alias `test`, compute a title or pass a named callback: the check wouldn't see that scenario.

**The mark is a ratchet**, and the implementer's brief says so, since its own rules would read the mark as a skipped test. While the feature isn't built, the scenario fails as expected and the gate passes. Once the feature works, Playwright fails the run with "expected to fail but passed", so the unit that built it removes the mark in the same change. A requirement counts as verified only when its scenarios pass with no mark. A scenario that already passes, because a generated screen does what it asks, loses its mark now. Never weaken an assertion to make a scenario pass or fail.

A requirement better proven below the UI (a time rule, arithmetic, a permission rule) says `integration` or `unit` and gets no scenario here. The build's units write those tests, tagged with the same ID.

Each unit passes `npm run lint && npm run typecheck && npm test`, whose tag check fails any test under `e2e/acceptance/` without a `@REQ-<n>.<n>` tag that names a requirement in `requirements.md`, and `npm run test:e2e`, where every marked scenario fails as expected. The checks run once more at the stage's end.

**Writes:** `<Code>.React/e2e/acceptance/*.spec.ts`.

**Passes when** every in-scope `acceptance` requirement has a tagged scenario or belongs to a parked unit with an open question, each scenario is marked `test.fail()` unless it already passes, and every check passes.

**Sends**, in chat, and as a notification only when it added questions: "Acceptance written: <n> scenarios for <n> requirements, <n> already passing, <n> units parked." The next run reports that intake is done.
