# Directions templates

Stage 5 writes two or three directions (two when the brand already fixes most choices, otherwise three), then checkpoint 2 asks the engineer to pick. Everything here is internal. The client never sees the directions.

Rules:

- Plain text. No emoji or glyphs. Minimal table separators (`|-|-|`).
- Letters are `a`, `b`, `c`. Names are one or two lowercase words from the concept, joined with a hyphen.
- Every claim about fit cites the brief (`design/brief.md`).
- Copy is in the glossary's words, never the framework's demo words.

## Directions README

File: `docs/project/design/directions/README.md`.

```
# Directions: <project name>

Status: waiting for your pick

Write your pick on the Pick line in place of `(not yet chosen)`: a single direction, a mix such as "B, with A's headings", or a direction with adjustments in plain words. Then change the status line to `Status: picked`.

Pick: (not yet chosen)

## Side by side

|Direction|Home|List|Form|Detail|
|-|-|-|-|-|
|A: <name>|![A home](captures/a-home-light.png)|![A list](captures/a-list-light.png)|![A form](captures/a-form-light.png)|![A detail](captures/a-detail-light.png)|
|B: <name>|![B home](captures/b-home-light.png)|![B list](captures/b-list-light.png)|![B form](captures/b-form-light.png)|![B detail](captures/b-detail-light.png)|

The mobile captures are in `captures/` beside these, named `<letter>-<page>-mobile.png`. Each direction's touch density: [A](captures/a-touch.png), [B](captures/b-touch.png).

## The directions

|Direction|File|Steward's notes|
|-|-|-|
|A: <name>|[a-<name>.md](a-<name>.md)|<one line, or "no flags">|
|B: <name>|[b-<name>.md](b-<name>.md)|<one line, or "no flags">|

The steward's notes for each direction are at the end of its file, under "Steward's notes".

## Across the directions

<One line per steward finding that holds for every direction, such as a framework word on the generated screens, or `None.`>

## Full contact sheet

To open every direction side by side on every screen state, run from `<Code>.React`:

    <the exact screens command the stage ran, limited to the direction themes>

then open the contact sheet it writes.
```

Notes:

- The `Status: waiting for your pick` line is exact. The skill reads it to know whether to wait.
- Drop the row for a third direction when there are two. Add a `C` row when there are three.
- The contact sheet command is `npm run screens` run with only the direction themes. Write the exact command the stage ran, as the harness defines it, so the engineer can paste it. Never leave the placeholder in the committed README.
- `<project name>` is the intake sheet's title after `Intake sheet: `. This title replaces the one the fork's skeleton wrote.
- The image paths are the committed captures per direction (see below). The side-by-side table shows the light captures. The line under it names the mobile ones and links the touch ones; drop the touch links when the brief has no touch group.
- "Across the directions" holds what the steward found in every direction, once, so it isn't lost when no direction is flagged for it.

## Per-direction file

File: `docs/project/design/directions/<letter>-<name>.md`.

```
# Direction <LETTER>: <name>

## Concept

<Two or three sentences. The metaphor, taken from the client's work and the brief's subject, never "modern and professional".>

## The bold move

<One choice that makes this direction unlike the others, in one or two sentences. Name the tokens or patterns it changes.>

## Why it fits

<Two to four bullets. Each cites a part of the brief: the subject, an audience, the tone, the brand.>

## Copy voice

|Where|String|
|-|-|
|Empty state|<a real empty state for the main entity, in the glossary's words, that says what to do next>|
|Error|<a real error message, in the glossary's words>|
|Confirmation|<a real confirmation, in the glossary's words>|

## Status tones

|Status|Tone|
|-|-|
|<A status of the main workflow entity, by its label on screen>|<one of the framework's tones>|

## Steward's notes

Waiting for the steward's review.
```

Rules:

- Exactly three copy strings: an empty state, an error and a confirmation, for the main entity, in the words of the page group the direction serves first. Where the glossary gives that entity two names, one per page group, use that group's.
- The status tones cover every status of the main workflow entity, in its spec's order, each by the label the screen shows (`Not started`, not `NotStarted`). The lock maps each label back to its enum name. Use only tone names the framework's design system defines. Stage 5's screens show the tones stage 2 wrote, so the steward judges a direction's tones from this table.
- The three litmus questions the steward asks of every direction: could it belong to 100 companies, does it serve the work or the screenshot, and is every choice intentional. The first judges the visual choices, since the words on screen come from the specs and are the same in every direction. For the third, a demo theme's choices count as the framework's defaults.
- A direction the steward flags gets one revision. It then goes to the pick with the notes attached.
- "Steward's notes" starts as the line `Waiting for the steward's review.`. The steward is read-only, so after its review design-director replaces that line with notes from the design steward's review: what it flagged against the brief and the three litmus questions, and whether the direction was revised once. Write `No flags.` when there are none, then the steward's minor findings, one line each.
- A claim in a direction's file or theme README that the captures don't bear out is corrected, whether or not the direction was flagged. That isn't a revision.

## Theme folder rules

Each direction is a theme folder at `src/themes/direction-<letter>/` inside `<Code>.React`.

Contents:

- `theme.css`: the theme's tokens.
- `README.md`: the concept, the bold move, the fonts with their licenses, and the fingerprint: the seven measures in a `|Measure|Value|` table between `<!-- fingerprint:start -->` and `<!-- fingerprint:end -->`. The first six must agree with `theme.css`. Rows in view comes from `screens-output/fingerprint.json` after a harness run; until then it holds the rows you expect, since the README test wants a number.

It must pass, before the stage commits:

- the theme contract test: every token in `TOKEN_CONTRACT`, and no others
- the contrast test: every contrast pair passes
- the README test: the README exists and holds the required parts, its fingerprint table included
- the fingerprint test: the theme differs measurably from every other theme folder, the demo themes included. A recolor fails on its own.

Touch block: when the brief has a touch group (a page group used on a phone outdoors or with large touch targets), the theme includes the touch-density block, `@media screen { [data-density="touch"] { ... } }`. It sets the fixed set of length tokens and no colors. Its floors are `text-base` at least 16px and `control-height` at least 44px, every base floor it doesn't raise still holds (`text-xs` at least 12px), and its `control-height` is greater than the theme's own. When the copied demo theme has no touch block, take `pell`'s and resize it. When the brief has no touch group, the theme has no touch block.

Other rules:

- Tokens only. No raw colors or sizes outside the contract.
- Fonts load from an `@fontsource-variable` package under the SIL Open Font License 1.1 (`OFL-1.1`); the README test fails any other license. A font without such a package cannot load, so the brief names the closest open font that has one, and the theme uses that. Install it at an exact version published at least 14 days ago.
- Print uses paper values and the contract's print density, so the client's widest generated list fits on paper.
- The demo themes stay until the lock removes them. Never edit them.
- When the brief has a touch group, each direction shows at least one screen in its touch density. The home's `touch` state does that in every theme.

## Captures

The directions are shown on the client's own screens, with sample data from the spec examples: the home page in each role's home state, with the queues from stage 3, and the main entities' generated list, form and detail pages. `npm run screens` runs with only the direction themes.

The stage commits 8 captures per direction under `docs/project/design/directions/captures/`, each page in light and mobile, plus one touch capture when the brief has a touch group. They come from the gate's run, `<Code>.React/screens-output/direction-<letter>/<mode>/`, and "the main entity" is the main workflow's entity:

|Page|Capture in the run|Committed as|
|-|-|-|
|home|the home in the home state of the main persona's role|`<letter>-home-light.png`, `<letter>-home-mobile.png`|
|list|`<plural>-list-default.png`|`<letter>-list-light.png`, `<letter>-list-mobile.png`|
|form|`<singular>-edit-default.png`, filled in; `<singular>-form-default.png` when the entity has no edit state|`<letter>-form-light.png`, `<letter>-form-mobile.png`|
|detail|`<singular>-detail-default.png`|`<letter>-detail-light.png`, `<letter>-detail-mobile.png`|
|touch|stage 5 step 3's touch state, or the home's `touch` state when step 3 was skipped, in mobile|`<letter>-touch.png`|

Captures are committed so the README shows the directions wherever the engineer reads the repo, without running the harness.
