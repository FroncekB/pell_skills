# `buddy` mod — Design Spec

**Status:** built 2026-10-07; live check pending. Plan: [`2026-10-07-buddy-mod-plan.md`](2026-10-07-buddy-mod-plan.md); its "Deliberate deviations" section lists six small departures from this spec. Changes made during the build: `$`-taking helpers live at module top level of `register.tsx` (the engine loader requires it); `wrap` returns nothing for a width or line count under 1; a failed save keeps the buddy alive in `$.state` (an `unsaved` flag) while another session's newer record still wins (section 9); the tool-call tally skips subagent calls (section 6); names that read as prompt openers are rejected at hatch (section 7).
**Author:** Brandon Froncek + Claude
**Date:** 2026-10-07
**Scope:** personal Claude Code mod. Not part of the `pell` plugin; this spec lives here only because this repo keeps dated specs.

## Purpose

Recreate the `/buddy` companion Claude Code shipped for April Fools 2026 as a mod: an ASCII creature above the prompt with a seeded species, rarity, stats, hat and eyes, a Claude-written name and personality, and a speech bubble that reacts to the session.

Reference for the original's mechanics: [claudefa.st buddy guide](https://claudefa.st/blog/guide/mechanics/claude-buddy), [claudebuddy.net](https://claudebuddy.net/). The sprites are drawn fresh for this mod in the original's format; none are copied.

### Differences from the original

| Original | This mod | Why |
|-|-|-|
| Seeded from the account UUID | Seeded from a random UUID rolled at first hatch | The mods API exposes no account id |
| Sits beside the input box | Sits in the band above the prompt | No mod surface beside the input |
| Main Claude's system prompt names the companion | Claude is never told; the mod answers direct address itself | Working sessions cost the same as without the mod |
| No reroll | `/buddy reroll confirm` | Requested; upgrades come later |

## 1. Location and loading

Built in `~/.claude/dev-mods/<session-id>/buddy/`, which hot-reloads in the session that wrote it. Once it works, copy it to `~/.claude/mods/buddy` and add that path to `CLAUDE_CODE_PLUGIN_DIRS` to load it in every session.

```
buddy/
  .claude-plugin/plugin.json   { name: "buddy", version, description, types: "./types/index.d.ts" }
  hooks/hooks.json             { modules: ["./register.tsx"] }
  hooks/register.tsx           wiring only: events, commands, the band's render hook
  hooks/roll.ts                seed -> bones; pure
  hooks/sprites.ts             species art, eggs, hats, hearts, faces; pure
  hooks/layout.ts              bubble wrap, full and compact band layouts; pure
  hooks/voice.ts               Haiku prompts, reply cleanup, speak-or-not rule, name matcher, fallbacks; pure
  types/index.d.ts             PluginState contract for the `buddy` plugin
  hooks/*.test.ts
```

`register.tsx` holds no game logic. Everything testable without a session lives in the four pure files.

## 2. Bones (seeded traits)

Recomputed from `record.seed` on every load and never saved, as in the original.

**Generator.** `hash = fnv1a32(seed + "friend-2026-401")`, then `rng = mulberry32(hash)`. Draws are taken in this fixed order so a seed always yields the same buddy:

1. rarity
2. species
3. eyes
4. hat
5. shiny
6. peak stat index
7. low stat index (re-drawn until it differs from the peak)
8. the five stat values, in the order DEBUGGING, PATIENCE, CHAOS, WISDOM, SNARK

**Rarity.**

| Rarity | Weight | Stars | Stat floor F | Hats allowed (uniform, `none` included) | Color |
|-|-|-|-|-|-|
| common | 60 | 1 | 5 | none | default |
| uncommon | 25 | 2 | 15 | none, crown, tophat, propeller | green |
| rare | 10 | 3 | 25 | + halo, wizard | blue |
| epic | 4 | 4 | 35 | + beanie | magenta |
| legendary | 1 | 5 | 50 | + tinyduck | yellow |

**Species** (uniform, independent of rarity): duck, goose, blob, cat, dragon, octopus, owl, penguin, turtle, snail, ghost, axolotl, capybara, cactus, robot, rabbit, mushroom, chonk.

**Eyes** (uniform): `·` `✦` `×` `◉` `@` `°`.

**Shiny:** `rng() < 0.01`, independent of rarity.

**Stats** (each an integer from 1 to 100; `r(n)` is a uniform integer in `0..n-1`):
- peak: `min(100, F + 50 + r(30))`
- low: `max(1, F - 10 + r(15))`
- the other three: `F + r(40)`

The peak is always the unique maximum, since the others top out at `F + 39`.

## 3. Saved record and session state

**`$.store` key `buddy`** (survives across sessions):
```ts
type BuddyRecord = {
  schema: 1
  seed: string                      // crypto.randomUUID()
  soul: { name: string; personality: string; hatchedAt: string }   // ISO date
  mode: 'on' | 'muted' | 'off'
  rerolls: number
}
```
- A missing key means not hatched.
- Any `schema` other than 1 is never read further or overwritten; `/buddy` replies `Saved buddy uses schema N; this mod knows 1.`
- Later upgrades (XP, unlocked hats) add fields under `schema: 2` with a migration from 1.

**`$.state`, plugin `buddy`** (survives hot reload, not sessions):

| Key | Type | Meaning |
|-|-|-|
| `record` | `BuddyRecord \| null` | Mirror of the store, loaded at `session.start` |
| `hatching` | `boolean` | Egg is showing |
| `tick` | `number` | Animation tick, +1 every 500 ms |
| `bubble` | `{ text: string; untilTick: number } \| null` | Current speech; shown while `tick < untilTick` |
| `heartsUntilTick` | `number` | Hearts replace the hat row while `tick` is below it |
| `lastQuipAt` | `number` | Clock ms of the last reaction quip |
| `lastReplyAt` | `number` | Clock ms of the last talk or pet reply |

Module variables (lost on reload, which is acceptable): the current turn's tool tally and the `AbortController` of the in-flight Haiku call.

## 4. Commands

`$.command.register({ name: 'buddy' })` in `session.start`. The `command.run` hook reads the subcommand from `e.args`.

| Command | Effect | Reply text |
|-|-|-|
| `/buddy` | No record: hatch. Otherwise set mode `on` and say hello in the bubble | One line naming the buddy |
| `/buddy pet` | Hearts for 5 ticks, then a reply in the bubble | None |
| `/buddy card` | Nothing changes | Name, species, rarity stars, shiny, hat, personality, five stat bars; at most 12 lines |
| `/buddy mute` / `unmute` | Mode `muted` / `on` | One line |
| `/buddy off` | Mode `off`; animation timer stops | One line |
| `/buddy reroll` | Nothing changes | `This replaces <name>, <rarity> <species>, for good. Run /buddy reroll confirm.` |
| `/buddy reroll confirm` | New seed, new hatch, `rerolls + 1`, mode `on` | One line naming the new buddy |
| anything else | Nothing changes | The usage line |

Before hatching, every subcommand except `/buddy` replies `No buddy yet. Run /buddy to hatch one.` With an unknown-schema record, every subcommand, `reroll confirm` included, replies with the schema line from Section 3 and changes nothing.

## 5. Hatching

1. Set `hatching = true`; the band shows the egg's 3 frames.
2. Roll bones from the seed.
3. Ask Haiku for the soul: given species, rarity, shiny, peak and low stat, return JSON `{"name": "...", "personality": "..."}`. The name is one word of letters, at most 12 characters; the personality is at most 160 characters, written in character and flavored by the peak and low stats.
4. If the call fails, the JSON doesn't parse, or a field breaks its limits, use a fallback: a name from a local list of 24 (picked with the seed's rng) and a personality template keyed to the peak stat.
5. Save the record with `hatchedAt` set to today, mirror it into `record`, set `hatching = false`, and say hello.

Hatching cannot fail. If the store write fails, the command text says so and the buddy lives for this session only.

## 6. Reactions

Main conversation only: a `turn.complete` with `agentId` set is ignored.

- **`tool.call`:** `await next(e)`, then add the tool name to the turn's tally, and add it to the failures if the result has `isError`. Return `next`'s result unchanged.
- **`turn.complete`:** build the event summary, reset the tally, and decide whether to speak.

**Speak-or-not rule** (`voice.ts`, pure):
```
speak = mode == 'on'
     && no Haiku call in flight
     && now - lastQuipAt >= 180_000
     && (notable || rng() < 0.25)
notable = failures > 0 || reason in {error, aborted} || durationMs > 120_000
```

**Event summary sent to Haiku:** outcome (`reason`), duration in seconds, tool call counts by name, and the names of failed tools. Never prompt text, answer text, file contents, or command arguments.

**Haiku call:** `$.model.complete` with model `haiku`, `maxTokens` 60, `timeoutMs` 8000. The system text carries the soul, species, rarity and stats, and asks for one line of at most 90 characters, in character, with no markdown and no emoji. The reply is shown for 24 ticks (12 s) and `lastQuipAt` is set.

## 7. Talking and petting

**Name matcher** (`voice.ts`, pure): `^\s*<name>\s*[,:]\s*(\S.*)$`, case-insensitive, with the name regex-escaped. It matches `Pip, hi` and `pip: hi`; it doesn't match `Pipeline, hi` or `Fix Pip, hi`.

**`prompt.submit`:** when mode is not `off`, the prompt came from the person (not a plugin, peer or notification), and the matcher hits, return `{ drop: '(to <name>)' }` without calling `next`. No turn starts and Claude never sees the text. Then ask Haiku for a reply to the captured message, using the same call shape as reactions. Any other prompt goes to `next(e)` untouched.

**Petting:** hearts for 5 ticks, then a Haiku reply to "you were petted".

**Shared rules for talk and pet:**
- They are answered even when mode is `muted`. Mute silences reactions only.
- They skip the 3-minute cooldown but are spaced at least 5 s apart (`lastReplyAt`). A request inside that window is answered with a canned line instead of a model call.
- They abort an in-flight reaction call and take its place. A reaction that comes up while any call is in flight is skipped.

## 8. Drawing

One `ui.render` hook on `{ component: 'AbovePrompt' }`. It returns `next(e)` (draws nothing) when there is no `record` and `hatching` is false, when mode is `off`, or when `e.props.hasSurvey` is true.

Elements come from `$.ui.resolve(e)`. On the desktop surface the sprite goes inside the `Code` element if `Text` there isn't monospace (verified first in the build).

**Full layout** when `maxRows >= 6` and `bodyColumns >= 44`. The band is always 6 rows, with or without a bubble.

```
            .----------------------------------.
    __     <  Three retries. Bold strategy.     |
  <(o )___  '----------------------------------'
   ( ._> /
    `---'
  Pip  uncommon duck  **
```

- Left column: the 12×5 sprite, then a dim name line with the stars in the rarity color.
- Right column: the bubble, wrapped to `min(bodyColumns - 14, 50)` and at most 3 text lines (longer text is cut with `…`), with its `<` on sprite row 2.

**Compact layout** otherwise: one row with the species face, the name, and the bubble text truncated with `wrap: 'truncate-end'`.

**Sprites** (`sprites.ts`):
- Each species has 3 frames (rest, fidget A, fidget B). Each frame is 5 strings, exactly 12 columns wide once `{E}` is replaced by the eye. Row 0 is blank and holds the hat.
- 7 hats, each exactly 12 columns, replace row 0.
- 3 hearts frames replace row 0 while petted.
- 3 egg frames are shown while hatching.
- One compact face per species, at most 6 columns.

**Animation:** `$.clock.every(500)` sets `tick + 1`, which redraws only the band's readers. Over a 16-tick cycle the frame is rest, except tick 5 (fidget A), tick 11 (fidget B) and tick 14 (rest frame with eyes drawn as `-`, a blink). The timer is created in `session.start` and on `/buddy`, and cancelled on `/buddy off`.

**Color:**
- The name and stars use the rarity color.
- A shiny buddy's sprite is bold yellow, with a `*` in a corner of row 0 that moves between corners per frame. The sparkle is hidden when a hat or hearts take the row.

**Glyph width:** `★ ♥ ◉ ✦` are narrow in Windows Terminal. A terminal that draws East Asian ambiguous-width characters wide will misalign the sprite; that's accepted.

## 9. Failure handling

The buddy never blocks a prompt, a tool call or a turn.

- Every hook wraps its own logic in `try`/`catch` and on error falls back to `next(e)` (or, after `next` already ran, to returning its result unchanged).
- **Haiku results:**

  | Outcome | Reaction | Talk or pet | Hatch |
  |-|-|-|-|
  | `isAnswered: false` | No bubble | Canned line from a pool keyed to the peak stat | Section 5 fallback |
  | Empty after cleanup | No bubble | Canned line | Section 5 fallback |

  Cleanup trims, strips quotes, newlines and non-BMP characters, then cuts to 90 characters.
- **Store:** a write failure is reported in the command text and the session continues from `$.state`. Store size is not a concern: the record is under 1 KB.
- **Hot reload:** `register` and `session.start` run again. State survives; the timer is recreated; an in-flight call is dropped.

## 10. Cost

| Source | Rate | Each call |
|-|-|-|
| Reactions | At most 20 per hour (3-minute cooldown) | About 400 tokens in, 60 or fewer out, Haiku |
| Talk and pet | Person-initiated, at most 1 per 5 s | Same |
| Hatch and reroll | Once per buddy | Same |

`/buddy card` output may be recorded where Claude reads it, which is why it's capped at 12 lines.

## 11. Testing

All tests run with `claude plugin test <mod folder>`.

**Pure units:**
- `roll.test.ts`:
  - the same seed gives the same bones
  - over 100,000 fixed seeds (`test-0` to `test-99999`, so the test is repeatable), rarity frequencies fall within 1 percentage point of the weights and shiny within 0.3 points of 1%
  - per rarity, the peak is in `[F+50, 100]`, the low in `[max(1, F-10), F+4]`, and the others in `[F, F+39]`
  - hats only appear at rarities allowed to have them
- `sprites.test.ts`:
  - every species × frame × eye is 5 rows of exactly 12 columns
  - row 0 is blank in every body frame
  - every hat, hearts frame and egg frame fits the same box
  - every face is at most 6 columns
- `layout.test.ts`:
  - the bubble never exceeds its width or 3 text lines
  - compact is chosen below 6 rows or 44 columns
  - the full band is always 6 rows
- `voice.test.ts`:
  - the speak-or-not rule gives the right answer across notable, the roll, the cooldown, in-flight, muted and off
  - the name-matcher cases from Section 7
  - reply cleanup
  - hatch JSON validation and fallback

**Mod-level** (mounted through the engine on `terminal` and `desktop`):
- hatch with a mocked `$.model.complete` draws the sprite and name; with a failing model it uses a fallback name
- `/buddy pet` draws hearts, then a bubble
- `Pip, hi` resolves `{ drop: '(to Pip)' }`, the bubble shows the reply, and no turn starts
- `tool.call` returns `next`'s result unchanged, even when the tally code throws
- the first `/buddy reroll` changes nothing; `confirm` changes the seed and adds to `rerolls`
- mode `off` passes the band through
- a `schema: 2` record is never overwritten

**Checks before done:** `claude plugin validate`, `tsc -p` on the mod, then a hot reload in the building session to look at the buddy in the terminal and the Desktop Code tab.

## 12. Out of scope (later)

- **Upgrades:** XP from session activity, raised stat floors, unlocked hats, earned rerolls. The schema field is the hook for this.
- **Shipping in the `pell` plugin:** it would be that plugin's first hooks module, which needs an architecture spec change and requires Claude Code v2.1.287 or later for every Pell engineer.
- **Sound, and drawing in the VS Code panel or `claude -p`:** hooks run there, but nothing draws.
