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

Change the status line to `Status: picked` when you have chosen.

Pick: <write one: a single direction, a mix such as "B, with A's headings", or a direction with adjustments in plain words>

## Side by side

|Direction|Home|List|Form|Detail|
|-|-|-|-|-|
|A: <name>|![A home](captures/a-home-light.png)|![A list](captures/a-list-light.png)|![A form](captures/a-form-light.png)|![A detail](captures/a-detail-light.png)|
|B: <name>|![B home](captures/b-home-light.png)|![B list](captures/b-list-light.png)|![B form](captures/b-form-light.png)|![B detail](captures/b-detail-light.png)|

The mobile captures are in `captures/` beside these, named `<letter>-<page>-mobile.png`.

## The directions

|Direction|File|Steward's notes|
|-|-|-|
|A: <name>|[a-<name>.md](a-<name>.md)|<one line, or "no flags">|
|B: <name>|[b-<name>.md](b-<name>.md)|<one line, or "no flags">|

The steward's notes for each direction are at the end of its file, under "Steward's notes".

## Full contact sheet

To open every direction side by side on every screen state, run from `<Code>.React`:

    <the exact screens command the stage ran, limited to the direction themes>

then open the contact sheet it writes.
```

Notes:

- The `Status: waiting for your pick` line is exact. The skill reads it to know whether to wait.
- Drop the row for a third direction when there are two. Add a `C` row when there are three.
- The contact sheet command is `npm run screens` run with only the direction themes. Write the exact command the stage ran, as the harness defines it, so the engineer can paste it. Never leave the placeholder in the committed README.
- The image paths are the 8 committed captures per direction (see below). The side-by-side table shows the light captures. Link the mobile ones in the line under it.

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
|Empty state|<a real empty state for a main entity, in the glossary's words, that says what to do next>|
|Error|<a real error message, in the glossary's words>|
|Confirmation|<a real confirmation, in the glossary's words>|

## Status tones

|Status|Tone|
|-|-|
|<Status of the main workflow entity>|<one of the framework's tones>|

## Steward's notes

Waiting for the steward's review.
```

Rules:

- Exactly three copy strings: an empty state, an error and a confirmation.
- The status tones cover every status of the main workflow entity. Use only tone names the framework's design system defines.
- The three litmus questions the steward asks of every direction: could it belong to 100 companies, does it serve the work or the screenshot, and is every choice intentional.
- A direction the steward flags gets one revision. It then goes to the pick with the notes attached.
- "Steward's notes" starts as the line `Waiting for the steward's review.`. The steward is read-only, so after its review design-director replaces that line with notes from the design steward's review: what it flagged against the brief and the three litmus questions, and whether the direction was revised once. Write `No flags.` when there are none.

## Theme folder rules

Each direction is a theme folder at `src/themes/direction-<letter>/` inside `<Code>.React`.

Contents:

- `theme.css`: the theme's tokens.
- `README.md`: the concept, the bold move, and the fonts with their licenses.

It must pass, before the stage commits:

- the theme contract test: every token in `TOKEN_CONTRACT`, and no others
- the contrast test: every contrast pair passes
- the README test: the README exists and holds the required parts
- the fingerprint test: the theme differs measurably from every other theme folder, the demo themes included. A recolor fails on its own.

Touch block: when the brief has a touch group (a page group used on a phone outdoors or with large touch targets), the theme includes the touch-density block. It sets the fixed set of length tokens and no colors. Its floors are `text-base` at least 16px and `control-height` at least 44px. When the brief has no touch group, the theme has no touch block.

Other rules:

- Tokens only. No raw colors or sizes outside the contract.
- Fonts load from an `@fontsource-variable` package. A font without one cannot load under the CSP, so the brief names the closest open font that has one, and the theme uses that.
- The demo themes stay until the lock removes them. Never edit them.
- When the brief has a touch group, each direction shows at least one screen in its touch density.

## Captures

The directions are shown on the client's own screens, with sample data from the spec examples: the home page with the queues from stage 3, and the main entities' generated list, form and detail pages. `npm run screens` runs with only the direction themes.

The stage commits 8 captures per direction under `docs/project/design/directions/captures/`: the home, list, form and detail pages, each in light and mobile.

|Page|Light|Mobile|
|-|-|-|
|home|`<letter>-home-light.png`|`<letter>-home-mobile.png`|
|list|`<letter>-list-light.png`|`<letter>-list-mobile.png`|
|form|`<letter>-form-light.png`|`<letter>-form-mobile.png`|
|detail|`<letter>-detail-light.png`|`<letter>-detail-mobile.png`|

Captures are committed so the README shows the directions wherever the engineer reads the repo, without running the harness. A direction that also shows a touch-density screen adds it as `<letter>-<page>-touch.png`, beyond the 8.
