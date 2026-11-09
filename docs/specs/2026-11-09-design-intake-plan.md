# Design intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build design intake: the framework changes it needs (scaffolder `check` and `sources`, a 501 for contract-first stubs, the acceptance tag check, the touch density) and the Pell skill and agents that turn a client's SOW into the project pack, a client theme, a prototype and tagged acceptance tests.

**Architecture:** Two branches named `design-intake`. The framework branch, cut from `react` after Phase 4 merges, adds deterministic tools and checks with their tests. The Pell_Skills branch adds one skill, `design-intake`, which runs whichever stage is next and stops at two checkpoints, plus two new agents and a screenshot mode for the design steward. Two trials prove the whole run.

**Tech Stack:** .NET 10, xUnit v3 with Shouldly; React 19, Vitest, Playwright, ESLint and Stylelint; YamlDotNet; DocumentFormat.OpenXml, UglyToad.PdfPig and AngleSharp, new to the framework; Claude Code plugin Markdown.

**Spec:** `docs/specs/2026-11-09-design-intake-design.md` in this repo (approved by Brandon on 2026-11-09). Read it before any task.

## Global Constraints

- Framework work happens in a git worktree of `pell_web_app_framework`, on branch `design-intake` cut from `react` after Phase 4's branch has merged into `react`. Pell_Skills work happens in the existing worktree `pell-skills-design-intake` on branch `design-intake`. Never use Brandon's main checkouts, never touch `master`, and never push or merge: those are Brandon's.
- No client name anywhere in the framework or Pell_Skills: code, docs, tests, fixtures, examples or commit messages. Trial 2's results stay outside both repos.
- No ruling or ledger IDs (`R12`, `Phase 3 ledger`) in code comments; `LedgerIdCommentTests` fails on them.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Framework code follows its `CLAUDE.md`: warnings are errors, `this.` everywhere, file-scoped namespaces, `.cs` files UTF-8 with BOM, new classes `sealed`, xUnit v3 with Shouldly and hand-written fakes, package versions only in `Directory.Packages.props` (each new package MIT, Apache-2.0 or BSD, at its latest stable version), tokens only in React, and every check in "Standard commands" passing before a task's commit.
- Pell_Skills follows its `CLAUDE.md`: plain-text output with no emoji or glyphs, agents with `model: inherit` and no `tools:` line (the `conductor-*` exception stays), `claude plugin validate ./plugins/pell` passing.
- Exact values from the spec: requirement IDs `REQ-<SOW item>.<n>` (and `REQ-0.<n>`), Playwright tags `@REQ-<n>.<n>`, the 501 title "This part of the app isn't built yet.", touch floors `text-base` ≥ 16px and `control-height` ≥ 44px, a long sheet shows its first 50 rows, brand capture fetches at most 6 client pages and at most 3 pages per reference product.

## Review Focus

1. **Multi-level Word numbering** ("1.", "1.1", "a.") and numbering that restarts in a new list: the Markdown shows the numbers Word shows. Pinned in Task 4.
2. **Text beyond ASCII** (curly quotes, em dashes, accented names) in `.docx`, `.xlsx` and HTML: written as UTF-8 and unchanged. Pinned in Tasks 4, 5 and 6.
3. **A site that redirects** (http to https, the bare domain to `www.`): followed only while each hop stays on an allowed host or its subdomain. Pinned in Task 6.
4. **A spec whose `defaultRoles` names a role `default-roles.json` lacks**: `check` reports it with the spec's file and line. Pinned in Task 1.
5. **A requirement tag on `test.describe`** rather than on each test: it counts for every test inside. Pinned in Task 3.

---

# Part A: Framework (`pell_web_app_framework`, branch `design-intake`)

Before Task 1: confirm `git log react --oneline` shows Phase 4's merge, then create the worktree, for example `git worktree add -b design-intake ../pell-design-intake react`, from the framework checkout without changing that checkout.

### Task 1: Scaffolder `check`

**Files:**
- Create: `tools/PellFramework.Scaffolder/Commands/CheckCommand.cs`
- Modify: `tools/PellFramework.Scaffolder/Commands/CommandLine.cs` (the dispatch switch and `Usage`)
- Modify: `CLAUDE.md` (Generators, Commands table: a `check` row)
- Test: `tools/PellFramework.Scaffolder.Tests/Commands/CheckCommandTests.cs`

**Interfaces:**
- Consumes: `SpecLoader.LoadAll(string repoRoot) : SpecSet` (`Settings`, `Entities`, `Diagnostics`, `IsValid`); `SpecDiagnostic(File, Line, Column, Message)`; `ExitCode.Success`, `ExitCode.Failed`; `CommandContext`.
- Produces: `public static int CheckCommand.Run(IReadOnlyList<string> args, CommandContext context)`. It prints one line per diagnostic to `context.Error` as `<file>:<line>:<column>: <message>`, with `<file>` relative to the repository root and `/`-separated, and `Specs are valid.` to `context.Out` when there are none. It writes no file. Task 9's skill and the intake-analyst rely on this output.

- [ ] **Step 1: Write the failing tests** in `CheckCommandTests`, using `TestRepository` and the `CommandLine.Run` helper that `CommandTests` uses:
  - `Check_passes_a_valid_spec_set_and_writes_nothing`: with the Order spec, exit code `0`, output contains `Specs are valid.`, and the repository's files and their contents are unchanged (snapshot before and after).
  - `Check_reports_each_problem_with_its_file_and_line`: with a spec holding an unknown key on line 6, exit code `1`, and the error output contains `specs/entities/<plural>.yaml:6:`.
  - `Check_reports_a_default_role_that_default_roles_json_lacks`: a spec granting `Night Shift: [View]`, exit code `1`, and the error names the spec's file and the `defaultRoles` line.
- [ ] **Step 2: Run them and see them fail.** `dotnet test tools/PellFramework.Scaffolder.Tests -c Release --filter "FullyQualifiedName~CheckCommandTests"`. Expected: FAIL, `CheckCommand` does not exist.
- [ ] **Step 3: Implement `CheckCommand.Run`**, add `"check" => CheckCommand.Run(rest, context)` to the switch and `check` to `Usage` with the line "Checks every spec and default-roles.json; writes nothing", and add the CLAUDE.md row.
- [ ] **Step 4: Run the tests and see them pass**, then the scaffolder suite (`dotnet test tools/PellFramework.Scaffolder.Tests -c Release`) and Phase 4's `RecipeCommandsTests`. Expected: PASS.
- [ ] **Step 5: Commit** `Add the scaffolder's check command`.

### Task 2: `NotBuiltException` answers 501

**Files:**
- Create: `PellFramework.Domain/Exceptions/NotBuiltException.cs`
- Modify: `PellFramework.API/Infrastructure/GlobalExceptionHandler.cs` (`Map`)
- Modify: `PellFramework.IntegrationTests/Infrastructure/ThrowingController.cs` (a `ThrowNotBuiltPath` action)
- Modify: `CLAUDE.md` (API, authorization and errors: a "Contract-first stubs" bullet), `docs/recipes/add-a-page.md` (one paragraph pointing at it)
- Test: `PellFramework.Tests/Hosting/GlobalExceptionHandlerTests.cs`, `PellFramework.IntegrationTests/Hosting/PipelineTests.cs`, `PellFramework.React/src/shared/api/responseError.test.ts`

**Interfaces:**
- Produces: `public sealed class NotBuiltException(string message = NotBuiltException.DefaultMessage) : Exception(message)` in `PellFramework.Domain.Exceptions`, with `public const string DefaultMessage = "This part of the app isn't built yet.";`. `Map` returns `(StatusCodes.Status501NotImplemented, exception.Message)` for it. Stage 7's stubs throw it.

- [ ] **Step 1: Write the failing tests.**
  - `NotBuiltException_maps_to_501_with_its_message`: `GlobalExceptionHandler.Map(new NotBuiltException()).ShouldBe((StatusCodes.Status501NotImplemented, "This part of the app isn't built yet."))`. Add the same row to `KnownExceptions`.
  - In `PipelineTests`, `A_not_built_endpoint_is_a_501_problem_with_its_title`: GET `ThrowingController.ThrowNotBuiltPath`, status `501`, content type `application/problem+json`, title `This part of the app isn't built yet.`
  - In `responseError.test.ts`, `loadErrorMessage shows a 501's title`: a `ResponseError` built for status 501 with that title returns the title.
- [ ] **Step 2: Run them and see them fail.** `dotnet test PellFramework.Tests -c Release --filter "FullyQualifiedName~GlobalExceptionHandlerTests"`, `dotnet test PellFramework.IntegrationTests -c Release --filter "FullyQualifiedName~PipelineTests"`, and `npx vitest run src/shared/api/responseError.test.ts` in `PellFramework.React/`. Expected: FAIL on the missing type and route. The Vitest case may already pass, because `loadErrorMessage` returns any problem's title. Keep it as a guard.
- [ ] **Step 3: Implement** the exception, the `Map` arm (before the `_` arm), and the `ThrowingController` action. Write the CLAUDE.md bullet: a stub is the real route, permission attribute, request and response models, and an action that throws `NotBuiltException`; its integration tests cover 401, 403 and 501; the build replaces the throw behind the same contract. Add one paragraph in the recipe pointing at it.
- [ ] **Step 4: Run the three test commands and see them pass**, then the unit and integration suites. Expected: PASS.
- [ ] **Step 5: Commit** `Answer 501 for an endpoint that isn't built yet`.

### Task 3: Acceptance folder, persona sign-in and the tag check

**Files:**
- Create: `PellFramework.React/e2e/acceptance/README.md`
- Create: `PellFramework.React/e2e/support/users.ts` (moved helpers)
- Modify: `PellFramework.React/e2e/admin.spec.ts` (import the moved helpers)
- Create: `PellFramework.React/src/test/acceptanceTags.ts`
- Test: `PellFramework.React/src/test/acceptanceTags.test.ts`, `PellFramework.React/src/test/acceptance-folder.test.ts`

**Interfaces:**
- Produces, in `e2e/support/users.ts`: the helpers `admin.spec.ts` keeps unexported today (`apiAsSeededUser`, `inviteTeamMember`, `joinAndSignIn`), exported unchanged, plus `signInWithRole(page: Page, roleName: string): Promise<{ email: string }>`. It invites a new user as the seeded administrator, gives them the named role, accepts the invitation and signs in. Stage 8's scenarios use it.
- Produces, in `src/test/acceptanceTags.ts`:
  - `export const REQ_TAG = /^@REQ-\d+\.\d+$/`
  - `export interface AcceptanceTest { title: string; line: number; tags: string[] }`
  - `export function acceptanceTests(source: string, fileName: string): AcceptanceTest[]`: parses with the TypeScript compiler API. Each `test(...)` call, `test.fail`/`test.skip` forms included, gets its own `tag` option plus the tags of every enclosing `test.describe(...)`.
  - `export function requirementIds(markdown: string): Set<string>`: the first column of every table row in `requirements.md` that starts with `REQ-`.

- [ ] **Step 1: Write the failing tests.**
  - `acceptanceTags.test.ts`, with inline sources:
    - `a test's own tag is read`
    - `a describe's tag counts for every test inside`
    - `an untagged test has no tags`
    - `REQ_TAG takes @REQ-14.3 and refuses @REQ-14 and @REQ-14.3.1`
    - `requirementIds reads the ID column` (a three-row table with one `REQ-0.1` row)
  - `acceptance-folder.test.ts`, over the real folder:
    - `every acceptance test carries a requirement tag`
    - `every tag names a listed requirement`, which runs only when `../docs/project/requirements.md` exists (relative to `PellFramework.React`). With an empty folder both pass. Each failure names the file, line and test.
  - A temporary scenario under `e2e/acceptance/` with an unknown tag must make the second test fail. Check this once by hand and don't commit the scenario.
- [ ] **Step 2: Run them and see them fail.** `npx vitest run src/test/acceptanceTags.test.ts src/test/acceptance-folder.test.ts`. Expected: FAIL, the module doesn't exist.
- [ ] **Step 3: Implement** `acceptanceTags.ts` and the folder test. Move the three helpers into `e2e/support/users.ts`, add `signInWithRole`, and point `admin.spec.ts` at them. Write the README: how to tag (`{ tag: ['@REQ-14.3'] }`), that a new scenario starts as `test.fail()`, that the unit which makes it pass removes the mark in the same change, and that the scoreboard counts a requirement verified only when its scenarios pass with no mark.
- [ ] **Step 4: Run them and see them pass**, then `npm run lint && npm run typecheck && npm test` and `npm run test:e2e`; the admin scenarios must still pass. Expected: PASS.
- [ ] **Step 5: Commit** `Add the acceptance folder, its tag check and persona sign-in`.

### Task 4: `sources add` for Word documents

**Files:**
- Create: `tools/PellFramework.Scaffolder/Commands/SourcesCommand.cs`
- Create: `tools/PellFramework.Scaffolder/Sources/SourceConverter.cs`, `Sources/DocxConverter.cs`, `Sources/SourceIndex.cs`, `Sources/SourceSlug.cs`
- Modify: `tools/PellFramework.Scaffolder/Commands/CommandLine.cs` (`CommandContext` gains `TimeProvider? Clock = null`; switch and `Usage` gain `sources`)
- Modify: `Directory.Packages.props`, `tools/PellFramework.Scaffolder/PellFramework.Scaffolder.csproj` (DocumentFormat.OpenXml)
- Modify: `CLAUDE.md` (Generators, Commands table: a `sources` row)
- Test: `tools/PellFramework.Scaffolder.Tests/Sources/DocxConverterTests.cs`, `tools/PellFramework.Scaffolder.Tests/Commands/SourcesCommandTests.cs`, and a test helper `tools/PellFramework.Scaffolder.Tests/Sources/DocxBuilder.cs` that builds `.docx` files in memory with the OpenXml SDK, so no binary fixtures are committed

**Interfaces:**
- Produces:
  - `public static int SourcesCommand.Run(IReadOnlyList<string> args, CommandContext context)`, handling `add <file>... [--refresh]`. Task 6 adds `fetch`.
  - `public static string DocxConverter.ToMarkdown(Stream docx)`
  - `public static ConvertedSource SourceConverter.Convert(string path)`, where `ConvertedSource(string Markdown, string Kind)` dispatches on extension. Task 5 adds the other extensions.
  - `SourceIndex.Upsert(string repoRoot, SourceIndexRow row)`, where `SourceIndexRow(string File, string Original, string Origin, DateOnly Converted, string Sha256)`.
  - `SourceSlug.For(string fileName) : string`
- Behavior the stages rely on:
  - `add` copies the original to `docs/project/sources/originals/<file name>`.
  - It writes `docs/project/sources/<slug>.md`, whose first line is `<!-- source: originals/<file name> | sha256: <hex> | converted: <yyyy-MM-dd> | converter: sources 1 -->`.
  - It upserts a row in `docs/project/sources/README.md` under the skeleton's title and line, in a table `|File|Original|Origin|Converted|`.
  - A file whose SHA-256 is already indexed is skipped with a line saying so, unless `--refresh`. An existing converted file is never rewritten without `--refresh`.

- [ ] **Step 1: Write the failing tests.**
  - `DocxConverterTests`:
    - `Headings_become_markdown_headings` (Heading1 to `#`, Heading2 to `##`)
    - `Automatic_numbers_are_written_out`: three numbered items, each with two bullets, become `1. First item` with `   - ...`, then `2.`, `3.`
    - `Multi_level_numbers_are_written_as_word_shows_them`: `1.`, `1.1`, `a.`
    - `A_list_that_restarts_starts_again_at_1`
    - `Tables_become_markdown_tables`, using `|-|-|` separators
    - `Text_beyond_ascii_is_unchanged`: curly quotes, an em dash, `é`
    - `Empty_paragraphs_are_dropped`
  - `SourcesCommandTests`:
    - `Add_writes_the_original_the_markdown_and_an_index_row`, with the date pinned by a fake clock
    - `Add_skips_a_file_already_converted`
    - `Add_refresh_converts_again`
    - `Add_refuses_an_unknown_extension`: exit `1`, and the message names the extensions it takes
    - `Two_files_with_the_same_name_get_distinct_slugs`
- [ ] **Step 2: Run them and see them fail.** `dotnet test tools/PellFramework.Scaffolder.Tests -c Release --filter "FullyQualifiedName~Sources"`. Expected: FAIL.
- [ ] **Step 3: Implement.** Numbering comes from the numbering part: the abstract numbering's level formats (`decimal`, `lowerLetter`, `upperLetter`, `lowerRoman`, `bullet`) and level text (`%1.%2`), with counters per numbering instance. A bullet level becomes `-`. Indent two spaces per level. Write files as UTF-8 without BOM, with `\n` line endings.
- [ ] **Step 4: Run them and see them pass**, then the scaffolder suite. Expected: PASS.
- [ ] **Step 5: Commit** `Convert Word sources to Markdown with the scaffolder`.

### Task 5: `sources add` for spreadsheets, PDFs and text

**Files:**
- Create: `tools/PellFramework.Scaffolder/Sources/XlsxConverter.cs`, `Sources/PdfConverter.cs`
- Modify: `Sources/SourceConverter.cs`; `Directory.Packages.props` and the csproj (UglyToad.PdfPig)
- Test: `tools/PellFramework.Scaffolder.Tests/Sources/XlsxConverterTests.cs`, `Sources/PdfConverterTests.cs`, with in-memory builders (OpenXml for `.xlsx`, PdfPig's `PdfDocumentBuilder` for `.pdf`)

**Interfaces:**
- Produces: `public static string XlsxConverter.ToMarkdown(Stream xlsx, int maxRows = 50)` and `public static string PdfConverter.ToMarkdown(Stream pdf)`. A PDF with no text throws `SourceRefusedException(string message)`, which `SourcesCommand` reports with exit `1`. `.md` and `.txt` are copied as they are.

- [ ] **Step 1: Write the failing tests.**
  - `XlsxConverterTests`:
    - `Each_sheet_becomes_a_heading_and_a_table`: `## Sheet: <name>`, with the first row as the header
    - `A_long_sheet_shows_its_first_50_rows_and_its_count`: 120 rows give 50 table rows and `Rows: 120 (first 50 shown)`
    - `Formulas_show_their_values`
    - `Dates_show_as_iso_dates`
    - `Shared_strings_beyond_ascii_are_unchanged`
  - `PdfConverterTests`:
    - `Each_page_is_marked`: `<!-- page 1 -->`, `<!-- page 2 -->`
    - `A_pdf_with_no_text_is_refused`, with a message naming the file and saying it has no text layer
  - `SourcesCommandTests`: `Add_copies_markdown_and_text_as_they_are`.
- [ ] **Step 2: Run them and see them fail.** Same filter as Task 4. Expected: FAIL.
- [ ] **Step 3: Implement** the two converters and the dispatch.
- [ ] **Step 4: Run them and see them pass**, then the scaffolder suite. Expected: PASS.
- [ ] **Step 5: Commit** `Convert spreadsheets, PDFs and text sources`.

### Task 6: `sources fetch`

**Files:**
- Create: `tools/PellFramework.Scaffolder/Sources/PageFetcher.cs`, `Sources/RobotsRules.cs`, `Sources/HtmlToMarkdown.cs`, `Sources/BrandSignals.cs`
- Modify: `Commands/SourcesCommand.cs` (`fetch`); `Commands/CommandLine.cs` (`CommandContext` gains `HttpMessageHandler? Http = null`); `Directory.Packages.props` and the csproj (AngleSharp)
- Test: `tools/PellFramework.Scaffolder.Tests/Sources/PageFetcherTests.cs`, `Sources/BrandSignalsTests.cs`, `Sources/RobotsRulesTests.cs`, with a fake `HttpMessageHandler` that serves a table of URLs

**Interfaces:**
- Produces: `sources fetch <url> --allow <host>... [--to site|references] [--refresh]`.
  - It writes `docs/project/sources/<site|references>/<host>/<path slug>.md`. The first line is `<!-- fetched: <url> | sha256: <hex> | fetched-on: <yyyy-MM-dd> | fetcher: sources 1 -->`, then a `## Brand signals` section, then `## Page text`.
  - It saves logo candidates under the page's folder in `assets/`.
  - It upserts the index row with the URL as its origin.
  - `BrandSignals.Read(IDocument html, IReadOnlyList<string> css) : BrandSignals(IReadOnlyList<(string Color, int Uses)> Colors, IReadOnlyList<string> Fonts, IReadOnlyList<Uri> LogoCandidates)`
  - `RobotsRules.Parse(string robotsTxt) : RobotsRules`, with `Allows(string path) : bool` for `User-agent: *`
- Rules:
  - GET only, with no cookie container and a generic user agent (`PellSourcesFetcher/1`). No forms and no scripts run.
  - Redirects are followed by hand, at most 5, each hop on an allowed host or its subdomain.
  - `robots.txt` is read once per host; a 404 allows everything.
  - Only `text/html` pages are fetched.
  - Stylesheets are fetched only from allowed hosts; `<style>` blocks are read in place.
  - Colors (`#rgb`, `#rrggbb`, `rgb()`, `hsl()`) are normalized to lower-case `#rrggbb` and ranked by use; the top 12 are kept.
  - Fonts come from `font-family` first names, `@font-face` names and Google Fonts `family=` parameters.
  - Logo candidates are images whose `src`, `alt`, `class` or `id` contains `logo`, the `og:image`, and `icon`/`apple-touch-icon` links. They are downloaded from any host when they are image types, at most 2 MB each and at most 10 per page. (Plan's call: logos often sit on a CDN; they are part of the page.)
  - A page already fetched is skipped unless `--refresh`.

- [ ] **Step 1: Write the failing tests.**
  - `PageFetcherTests`:
    - `Fetch_refuses_a_host_not_allowed`: exit `1`, nothing written
    - `Fetch_refuses_a_non_http_scheme`
    - `Fetch_refuses_a_path_robots_disallows`
    - `Fetch_follows_a_redirect_to_www_of_an_allowed_host`
    - `Fetch_refuses_a_redirect_off_the_allowed_hosts`
    - `Fetch_sends_no_cookie_header`: the fake handler asserts it
    - `Fetch_writes_the_header_brand_signals_and_page_text`
    - `Fetch_skips_a_page_already_fetched`
    - `Fetch_saves_logo_candidates_and_skips_one_over_2_MB`
  - `BrandSignalsTests`:
    - `Colors_are_normalized_and_ranked_by_use`
    - `Google_fonts_families_are_named`
    - `Font_face_names_are_named`
    - `Logo_images_are_found_by_src_alt_class_or_id`
  - `RobotsRulesTests`:
    - `Disallow_prefixes_for_all_agents_are_honored`
    - `Rules_for_other_agents_are_ignored`
  - HTML with curly quotes and accents keeps them in the page text.
- [ ] **Step 2: Run them and see them fail.** Same filter. Expected: FAIL.
- [ ] **Step 3: Implement.** Production code builds its `HttpClient` from `context.Http ?? new SocketsHttpHandler { UseCookies = false, AllowAutoRedirect = false }`.
- [ ] **Step 4: Run them and see them pass**, then the scaffolder suite. Expected: PASS.
- [ ] **Step 5: Commit** `Fetch a client's pages for brand capture`.

### Task 7: The touch block in the theme contract

**Files:**
- Modify: `PellFramework.React/src/styles/tokenContract.ts`
- Modify: `PellFramework.React/src/test/themeCss.ts` (and `themeCss.test.ts`)
- Modify: `PellFramework.React/src/test/theme-contract.test.ts`, `src/test/design-system-doc.test.ts`
- Modify: `PellFramework.React/src/themes/pell/theme.css`, `src/themes/pell/README.md`
- Modify: `docs/design-system.md` (the token contract table and floors, a "Touch density" subsection under "Anatomy of a theme")

**Interfaces:**
- Produces, in `tokenContract.ts`:
  - `TokenBlock` becomes `'root' | 'dark' | 'print' | 'touch'`
  - `export const OPTIONAL_BLOCKS: readonly TokenBlock[] = ['touch']`
  - `export const TOUCH_TOKENS`: the type scale and its line heights, `control-height`, `control-height-sm`, `row-height`, `cell-padding-x`, `spacing` and `section-gap`
  - `export const TOUCH_FLOORS_PX = { 'text-base': 16, 'control-height': 44 }`
- Produces, in `themeCss.ts`: the parser accepts exactly one optional `@media screen { [data-density="touch"] { ... } }` block, read as `touch`, and still throws on anything else. `ThemeBlocks['touch']` is `{}` when absent. Task 8 sets the attribute; stage 5 writes the block.

- [ ] **Step 1: Write the failing tests.**
  - `themeCss.test.ts`:
    - `reads the touch block`
    - `a theme without a touch block has an empty one`
    - `refuses a second touch block`
    - `refuses a touch selector outside @media screen`
  - `theme-contract.test.ts`, per theme:
    - `a touch block defines exactly the touch tokens`
    - `touch lengths parse as lengths`
    - `the touch block meets its floors`
  - `design-system-doc.test.ts`: the touch block's label and its floors appear in the doc's tables.
- [ ] **Step 2: Run them and see them fail.** `npx vitest run src/test/themeCss.test.ts src/test/theme-contract.test.ts src/test/design-system-doc.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the contract and parser changes. Give `pell` a touch block that meets the floors, with `control-height` exactly `44px` (Task 8's check pins it) and the other values chosen by eye on the harness in Task 8, and add a "Touch density" paragraph to its README. Document the block, how a page group opts in (Task 8), and the floors in `docs/design-system.md`.
- [ ] **Step 4: Run them and see them pass**, then `npm run lint && npm run typecheck && npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `Let a theme define a touch density`.

### Task 8: Opting a page group into touch, and seeing it

**Files:**
- Create: `PellFramework.React/src/shared/components/DensityGroup.tsx`, `DensityGroup.stories.tsx`, `DensityGroup.test.tsx`
- Create: `PellFramework.React/eslint-plugin-pell/rules/density-through-group.js` and its test; register it in the plugin and `eslint.config.js`
- Modify: `PellFramework.React/screens/screenStates.ts` (`ScreenState` gains `density?: 'touch'`), `screens/capture.spec.ts` (apply it before capture), `screens/routes.ts` (a `touch` state on the home route), `src/test/storybook-snapshots.test.tsx` (`STORY_MODULES`)
- Modify: `docs/design-system.md` (Layout patterns: a DensityGroup row), `CLAUDE.md` (Design: one bullet)
- Create: `PellFramework.React/screens/density.spec.ts`, added to the `pell` capture project so `scripts/screens.mjs` finds it a project
- Test: as listed, plus `screens/screenStates.test.ts`

**Interfaces:**
- Produces:
  - `export function DensityGroup({ density, children }: { density: 'touch'; children: ReactNode }): JSX.Element`. It renders `<div data-density={density} className="contents">`; custom properties inherit through `display: contents`. A route group opts in with `{ element: <DensityGroup density="touch"><Outlet /></DensityGroup>, children: [...] }`.
  - `pell/density-through-group` fails any JSX `data-density` attribute outside `src/shared/components/DensityGroup.tsx`.
  - A screen state with `density: 'touch'` sets `data-density="touch"` on `<main>` before its capture, so stage 5 can show any generated screen in a direction's touch density.

- [ ] **Step 1: Write the failing tests.**
  - `DensityGroup.test.tsx`: `marks its subtree touch` and `adds no box of its own` (the class is `contents`).
  - The rule test: `data-density` on a `div` in `src/app` fails, and inside `DensityGroup.tsx` it passes.
  - `screenStates.test.ts`: `a touch state names the touch density`.
  - In `screens/density.spec.ts`, `a touch capture is taller at control height`: in `pell`, a button's computed height inside `main` is `44px` in the home route's `touch` state and `36px` in its default state.
- [ ] **Step 2: Run them and see them fail.** `npx vitest run src/shared/components/DensityGroup.test.tsx src/test/design-lint` and `npm run screens -- --theme pell -g home`. Expected: FAIL.
- [ ] **Step 3: Implement**, register the story, and write the new baseline with `npm run screens -- --theme pell --update-snapshots=missing`. Look at it on the contact sheet before committing it.
- [ ] **Step 4: Run them and see them pass**, then `npm run lint && npm run typecheck && npm test` and `npm run screens -- --theme pell`. Expected: PASS.
- [ ] **Step 5: Commit** `Opt a page group into the touch density`.

### Task 9: Branch check before merge

- [ ] **Step 1:** Run every command in the framework's "Standard commands" one at a time, `generate --check`, the scaffolder tests, `tools/sample-build-test.sh`, and Phase 4's `tools/fork-build-test.sh`. Then run `npm run screens` once in every theme. Expected: all pass.
- [ ] **Step 2:** `LedgerIdCommentTests` passed in Step 1's unit tests, and a search of the branch's diff for the trial client's name and words finds nothing.
- [ ] **Step 3:** Tell Brandon the branch is ready to merge, with the commit list. Don't merge or push.

---

# Part B: Pell_Skills (`pell-skills-design-intake`, branch `design-intake`)

These tasks are prompts and reference files, not code. Each task's check is `claude plugin validate ./plugins/pell` plus a read-through against the spec section it implements; their behavior is proven by the trials in Part C. Part B can start before Part A.

### Task 10: The skill's formats and templates

**Files:**
- Create: `plugins/pell/skills/design-intake/references/formats.md`
- Create: `plugins/pell/skills/design-intake/references/intake-sheet.md`
- Create: `plugins/pell/skills/design-intake/references/directions.md`

**Interfaces:**
- Produces the formats every later task and both agents point at, by these headings. Stages, agents and Project 3 cite them by file and heading.
  - `formats.md`:
    - `## requirements.md`: the seven columns from the spec's table, in order (ID, Requirement, Source, Personas, Verified by, Scope, Depends on), with their allowed values and one example row
    - `## open-questions.md`: the entry fields (ID `Q-<n>`, question ready to send, guess, if wrong, risk, asked, blocks, Answer)
    - `## glossary.md`, `## personas.md`, `## workflows.md` (`WF-<n>`), `## integrations.md` (`INT-<n>`)
    - `## decisions.md line`: `- <yyyy-MM-dd> | <stage> | <decision> | <reason> | decided by: <engineer or agent>`
    - `## run-log.md line`: `- <yyyy-MM-dd> | design-intake <stage> | <minutes> min | <tokens> tokens | <note>`, which follows Phase 4's first line and only appends
  - `intake-sheet.md`: the template in the spec's ten-part order, with each section's rules (at most 8 guesses, at most 5 workflows, the domain model table's columns, "never restate a requirement the SOW states clearly", the status line `Status: draft`, and how to correct). It uses neutral placeholders, never a real client's words.
  - `directions.md`:
    - the directions README template, with `Status: waiting for your pick`, the pick line, the side-by-side capture table and the contact sheet command
    - the per-direction file template (concept, bold move, why it fits, three copy strings, status tones)
    - the theme folder rules: `src/themes/direction-<letter>/`, the contract, contrast, README and fingerprint tests, and a touch block when the brief has a touch group
    - the 8 committed captures per direction

- [ ] **Step 1:** Write the three files from the spec's "The project pack", "Checkpoint 1" and "Stage 5" sections. The template borrows the shape of the approved sample intake sheet, with no client words.
- [ ] **Step 2:** `claude plugin validate ./plugins/pell` passes. A search for the trial client's name and words in `plugins/` finds nothing.
- [ ] **Step 3: Commit** `Add design intake's formats and templates`.

### Task 11: The stage procedures and the skill

**Files:**
- Create: `plugins/pell/skills/design-intake/references/stages.md`
- Create: `plugins/pell/skills/design-intake/SKILL.md`

**Interfaces:**
- Consumes: Task 10's references; the framework commands from Part A (`check`, `sources add`, `sources fetch`), Phase 4's `ready orders` and `ready themes`, and the framework's "Adding an entity" steps.
- Produces:
  - `SKILL.md` frontmatter: `name: design-intake`, and a description that starts "Use when starting or continuing design intake in a client fork made from the Pell Web App Framework" and lists the triggers from the spec's "The skill" section.
  - The body holds:
    - the next-stage table from the spec, verbatim in meaning
    - the per-stage line naming the agent and the `stages.md` heading
    - the rules: commit per stage, append `run-log.md` and `decisions.md` lines per `formats.md`, never push before stage 3 passes, push only to the client repo with no force, never wait on the client, and the questions channel
    - the push notification rule with its fallback to chat and `run-log.md`
    - the read-only exception
  - It points at references as `${CLAUDE_PLUGIN_ROOT}/skills/design-intake/references/<file>.md`.
  - `stages.md` has one heading per stage (`## Stage 1: Sources` to `## Stage 8: Acceptance`, `## Checkpoint 1`, `## Checkpoint 2`). Each gives the exact commands, the files written, what "passes" means, and what the stage sends the engineer. Stage 3 includes `ready orders` and its printed follow-ups. Stage 6 includes `ready themes`, the logo rule, the status tones written into the specs, and the screen inventory's links table. Stage 7 includes the contract-first stub steps and the "no links, no eject" rule. Stage 8 includes the tag and `test.fail()` ratchet and `signInWithRole`.

- [ ] **Step 1:** Write `stages.md` from the spec's "The stages" section, then `SKILL.md` as a short router, under about 150 lines.
- [ ] **Step 2:** Check by reading: every row of the spec's next-stage table and every stage step appears once, with no procedure written in both files. Then `claude plugin validate ./plugins/pell`.
- [ ] **Step 3: Commit** `Add the design-intake skill`.

### Task 12: The intake-analyst agent

**Files:**
- Create: `plugins/pell/agents/intake-analyst.md`

**Interfaces:**
- Produces: frontmatter `name: intake-analyst`, a one-to-three-sentence description ("Use to turn a client's converted SOW and documents into ..."), and `model: inherit`. The body covers:
  - the inputs (converted sources only)
  - its two jobs: stage 2's extraction and stage 3's corrections
  - the rules from the spec's Agents section
  - the generator's limits, from the framework's `CLAUDE.md` "What the generators don't do", and the `check` loop
  - the house SOW format and the ID rule
  - the trailing JSON `{"files": [...], "questions": [...], "summary": "..."}`
  - pointers to `formats.md` and `intake-sheet.md`

- [ ] **Step 1:** Write the agent.
- [ ] **Step 2:** `claude plugin validate ./plugins/pell`. Read it against the spec's Stage 2, Checkpoint 1 and Stage 3.
- [ ] **Step 3: Commit** `Add the intake-analyst agent`.

### Task 13: The design-director agent and the steward's screenshot mode

**Files:**
- Create: `plugins/pell/agents/design-director.md`
- Modify: `plugins/pell/agents/conductor-design-steward.md` (a `## Screenshot mode` section; frontmatter and the other sections unchanged)

**Interfaces:**
- Produces:
  - `design-director`: frontmatter `name`, a description, and `model: inherit`. The body covers stages 4 to 6 per `stages.md`:
    - brand capture limits (6 client pages, 3 per reference product)
    - the brief's contents
    - direction themes that pass the framework's theme tests
    - one revision after the steward's flag, then to the pick
    - the lock steps
    - "notify, never block" on `frontend-design`
    - the trailing JSON
  - The steward's `## Screenshot mode`:
    - given a harness run, read `screens-output/manifest.json` and the captures
    - judge them against the brief, the conventions, the three litmus questions and the five review-only tells
    - report as its existing prose report, ranked
    - stay read-only, and leave its use outside design intake unchanged

- [ ] **Step 1:** Write the agent and the section.
- [ ] **Step 2:** `claude plugin validate ./plugins/pell`. Read them against the spec's Stages 4 to 6 and the Agents section.
- [ ] **Step 3: Commit** `Add the design-director agent and the steward's screenshot mode`.

### Task 14: The fictional SOW for trial 1

**Files:**
- Create: `docs/trials/design-intake/fictional-sow.md`
- Create: `docs/trials/design-intake/README.md` (how to run trial 1 and what passing means, copied from the spec's trial 1)

**Interfaces:**
- Produces: a fictional client SOW in Pell's house format, as the spec describes it:
  - about ten numbered items, each with user stories, a "User Roles this applies to" list and some "Technical Notes"
  - two portals (one for field staff on phones, one for the client's customers)
  - a workflow with at least two review steps and a send-back
  - an estimate table, assumptions, two later phases and an out-of-scope list
  - two deliberate conflicts with the framework (a third-party grid; roles scoped to locations) and one requirement in no item
  - It names no real company. It lives outside `plugins/`, so it doesn't ship with the plugin.

- [ ] **Step 1:** Write the two files.
- [ ] **Step 2:** Check by reading: every element listed above is present, so trial 1 exercises each stage and both intake-sheet sections that list conflicts and beyond-SOW requirements.
- [ ] **Step 3: Commit** `Add a fictional SOW for the design intake trial`.

### Task 15: Housekeeping

**Files:**
- Modify: `plugins/pell/.claude-plugin/plugin.json` (`0.22.0` to `0.23.0`)
- Modify: `README.md`:
  - `## Auto-invoked skills`: a `### \`design-intake\`` section
  - `## Composable building blocks (sub-agents)`: rows for both agents
  - `## Conductor subsystem`: the steward's screenshot mode in one line
- Modify: `plugins/pell/README.md` (`## Auto-invoked skills (description-matched)` and `## Agents (composable building blocks)`)
- Modify: `docs/specs/2026-05-27-pell-skills-architecture.md` (`## 11. Resolved decisions log`: the read-only exception for design intake; `## 12. Implementation status`: a Built line)
- Modify: `CLAUDE.md` (beside rule 5 under `## Conventions when adding a command`: a `> **Exception — design-intake.**` blockquote saying the skill writes and commits inside the fork it runs in without `(y/n)` prompts, because the orchestrator runs it unattended; the invocation is the yes; it pushes only to the client repo)

- [ ] **Step 1:** Make the edits.
- [ ] **Step 2:** Run `claude plugin validate ./plugins/pell`, then `grep -rn "design-intake\|intake-analyst\|design-director" README.md plugins/pell/README.md docs/specs/2026-05-27-pell-skills-architecture.md CLAUDE.md`. Every surface names them, and table anchors match their headings.
- [ ] **Step 3: Commit** `Document design intake and bump the plugin to 0.23.0`.

---

# Part C: Trials (after Phase 4 and Part A are on `react`, and Part B is on its branch)

### Task 16: Trial 1, the fictional SOW

- [ ] **Step 1:** Make a throwaway fork in a scratch folder with Phase 4's fork tool, from `react`, with no Bitbucket repo and no push. Load the plugin from this branch (`claude --plugin-dir <worktree>/plugins/pell`, or a local marketplace).
- [ ] **Step 2:** Run the `design-intake` skill stage by stage with `fictional-sow.md` and a made-up client URL served locally, or skip fetching with a note. Brandon answers both checkpoints: he corrects at least one guess and one entity name on the intake sheet, and picks a mix at checkpoint 2.
- [ ] **Step 3:** Check what passing means:
  - every pack file matches its format in `formats.md`
  - every requirement's Source line exists in its converted file
  - the beyond-SOW requirement is `REQ-0.1` and on the sheet
  - both conflicts are in the sheet's disagreement section
  - Brandon's corrections show in the specs and in `decisions.md`
  - the directions pass the fingerprint
  - no screen shows "Orders"
  - each stub answers 501
  - every acceptance scenario is tagged and marked `test.fail()`
  - every check in the fork's Standard commands passes after stages 3, 6, 7 and 8
- [ ] **Step 4:** Write `docs/trials/design-intake/trial-1-results.md`: what passed, what failed, the minutes at each checkpoint and the tokens per stage. File fixes as new tasks. Commit `Record design intake trial 1`.

### Task 17: Trial 2, the latest real SOW

- [ ] **Step 1:** In a scratch fork that is never pushed, and with no Bitbucket repo, run every stage on the latest real Pell SOW whose project engineers are building by hand.
- [ ] **Step 2:** Compare the domain model, personas and roles with what the engineers built. Record the engineer's minutes at each checkpoint and the tokens per stage.
- [ ] **Step 3:** Write the results to a notes file outside both repositories (the session's shared notes folder). Tell Brandon the results and any fixes they call for. Delete the scratch fork when he's read them.
