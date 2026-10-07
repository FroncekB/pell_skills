# `buddy` mod Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A personal Claude Code mod that recreates the April Fools 2026 `/buddy` companion: a seeded ASCII creature in the band above the prompt, with a Haiku-written soul, reactions, talk, pet, and reroll.

**Architecture:** One hooks module (`register.tsx`) does wiring only: events, commands, the band's render hook. Five pure files hold everything testable without a session: bones (`roll.ts`), art (`sprites.ts`), band layout (`layout.ts`), model prompts and rules (`voice.ts`), and the saved record and subcommand parsing (`record.ts`). The session's live values live in `$.state`. The saved record lives in `$.store`.

**Tech Stack:** Claude Code mods API (function hooks, TypeScript/TSX, `claude-code` and `claude-code/testing` modules), Claude Code 2.1.289's `claude plugin validate` / `claude plugin test`, TypeScript 5.6 via `npx` for the type-check.

**Spec:** [`2026-10-07-buddy-mod-design.md`](2026-10-07-buddy-mod-design.md)

## Global Constraints

- **Mod folder:** `C:\Users\BrandonF\.claude\dev-mods\629e9b24-6418-45cd-8de5-a611d13bd535\buddy`. It is its own git repo (Task 1 runs `git init`). Code commits go there. This repo only holds the spec and this plan.
- **Shell:** Git Bash. Every command block starts with these two lines, because shell variables don't persist between calls:
  ```bash
  MOD="$HOME/.claude/dev-mods/629e9b24-6418-45cd-8de5-a611d13bd535/buddy"
  CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
  ```
  `$CC` is the desktop app's bundled Claude Code (2.1.289 when this was written). The `claude` on PATH is 2.1.263, which has no `plugin test` command and an older validator. Never use it for this mod.
- **Hot reload:** the first file written into the mod folder makes Claude Code ask the person "Enable hot reloading for this session?". After that, every edit reloads the mod when the turn ends. While a task is red (tests written, code not yet), a reload may print a dim "module did not load" line. That's expected.
- **`$` stays in `register.tsx`.** The validator follows `$` only into functions declared in the same file. Pure files never take `$`.
- **State refs are literals:** `atom({ plugin: 'buddy', key: '<literal>' } as const, initial)`. The contract file exports a type before its `declare module` block, or the validator doesn't see the declarations.
- **Tests find elements by text, never by `key`.** `Text` drops `key` in a drawn description. `find({ text })` also matches a `Code` element's `source`.
- **No Node or DOM.** `crypto.randomUUID`, `Math.random`, `Date`, `AbortController` and `String.raw` are available.
- **`noUncheckedIndexedAccess` is on.** An indexed read is `T | undefined`, so use `!` only where the index is provably in range.
- **Art:** every art line inside `String.raw` starts at column 0. No backticks and no `${` in art.
- **Every hook catches its own errors** and lets the event continue (`next(e)`, or returns `next`'s result unchanged).
- **Haiku calls:** model `haiku`, `timeoutMs: 8000`. `maxTokens: 60` for speech, 200 for hatch.
- **Constants** (from the spec):

  | Name | Value |
  |-|-|
  | Tick | 500 ms |
  | Quip cooldown | 180_000 ms |
  | Talk/pet floor | 5_000 ms |
  | Long turn | 120_000 ms |
  | Quip chance | 0.25 |
  | Max speech length | 90 chars |
  | Bubble lifetime | 24 ticks |
  | Hearts | 5 ticks |
  | Full layout | at least 6 rows and 44 columns |
  | Bubble | at most 50 wide, at most 3 lines |

- **Commit trailer:** every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

### Deliberate deviations from the spec

Each is small and is noted in the spec's status line in Task 7.

1. A sixth pure file, `record.ts`, holds record classification and subcommand parsing so `register.tsx` stays wiring only.
2. On the desktop surface the sprite is always drawn in `Code`. The desktop's `Text` font is unknown, and `Code` is source text, so desktop sprites aren't colored. The name line keeps its color.
3. The `tool.call` test checks that errored and denied results pass through unchanged, instead of forcing the tally code to throw, since there's no seam to force that.
4. `/buddy pet` while the buddy is off replies `<name> is hidden. Run /buddy to bring it back.` and draws nothing.
5. The bubble's `<` sits on its first text line (band row 1), matching the spec's mockup.
6. The mod-level test file is `buddy.test.tsx`: it needs JSX to stand in for the engine's own band.

---

### Task 1: Scaffold the mod and roll the bones

**Files:**
- Create: `$MOD/.claude-plugin/plugin.json`
- Create: `$MOD/hooks/hooks.json`
- Create: `$MOD/types/index.d.ts`
- Create: `$MOD/hooks/register.tsx` (a stub, replaced in Task 5)
- Create: `$MOD/tsconfig.json`
- Create: `$MOD/.gitignore`
- Create: `$MOD/hooks/roll.ts`
- Test: `$MOD/hooks/roll.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - from `types/index.d.ts`: `Mode`, `Soul`, `BuddyRecord`, `Bubble`, and the `PluginState['buddy']` contract
  - from `roll.ts`:
    - lists and their types: `SALT`, `SPECIES` / `Species`, `EYES` / `Eye`, `STATS` / `StatName`, `HATS` / `Hat`, `RARITIES` / `Rarity`
    - rarity table: `RarityInfo`, `RARITY: Record<Rarity, RarityInfo>`
    - the bones type: `Bones = { rarity, species, eye, hat: Hat | 'none', shiny, stats: Record<StatName, number>, peak: StatName, low: StatName }`
    - functions: `fnv1a32(text): number`, `mulberry32(seed): () => number`, `rngFor(seed: string): () => number`, `rollBones(seed: string): Bones`

- [ ] **Step 1: Create the folder, manifest, hook list, contract, tsconfig, gitignore and stub module**

```bash
MOD="$HOME/.claude/dev-mods/629e9b24-6418-45cd-8de5-a611d13bd535/buddy"
mkdir -p "$MOD/.claude-plugin" "$MOD/hooks" "$MOD/types"
```

`$MOD/.claude-plugin/plugin.json`:
```json
{
  "name": "buddy",
  "version": "0.1.0",
  "description": "A seeded ASCII companion above the prompt, recreating the April Fools 2026 /buddy.",
  "author": { "name": "Brandon Froncek" },
  "types": "./types/index.d.ts"
}
```

`$MOD/hooks/hooks.json`:
```json
{ "modules": ["./register.tsx"] }
```

`$MOD/types/index.d.ts`:
```ts
export type Mode = 'on' | 'muted' | 'off'

export type Soul = { name: string; personality: string; hatchedAt: string }

export type BuddyRecord = {
  schema: 1
  seed: string
  soul: Soul
  mode: Mode
  rerolls: number
}

export type Bubble = { text: string; untilTick: number }

declare module 'claude-code' {
  interface PluginState {
    buddy: {
      record: BuddyRecord | null
      hatching: boolean
      tick: number
      bubble: Bubble | null
      heartsUntilTick: number
      lastQuipAt: number
      lastReplyAt: number
    }
  }
}
```

`$MOD/hooks/register.tsx` (stub until Task 5):
```tsx
import type { Register } from 'claude-code'

export const register: Register = () => {}
```

`$MOD/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "es2023", "lib": ["es2023"], "types": [],
    "module": "esnext", "moduleResolution": "bundler",
    "strict": true, "noUncheckedIndexedAccess": true,
    "noEmit": true, "skipLibCheck": true,
    "jsx": "react", "jsxFactory": "h", "jsxFragmentFactory": "Fragment"
  },
  "include": [".claude-plugin/types", "hooks", "types"]
}
```

`$MOD/.gitignore`:
```
.claude-plugin/types/
node_modules/
```

- [ ] **Step 2: Initialise the mod's own git repo**

```bash
MOD="$HOME/.claude/dev-mods/629e9b24-6418-45cd-8de5-a611d13bd535/buddy"
git -C "$MOD" init -q && git -C "$MOD" status --short
```
Expected: the six files above listed as untracked.

- [ ] **Step 3: Write the failing tests**

`$MOD/hooks/roll.test.ts`:
```ts
import { expect, test } from 'claude-code/testing'

import { EYES, RARITIES, RARITY, SPECIES, STATS, fnv1a32, mulberry32, rollBones } from './roll'

test('fnv1a32 matches the published FNV-1a test vectors', () => {
  expect(fnv1a32('')).toBe(0x811c9dc5)
  expect(fnv1a32('a')).toBe(0xe40c292c)
  expect(fnv1a32('foobar')).toBe(0xbf9cf968)
})

test('mulberry32 is deterministic and stays in [0, 1)', () => {
  const a = mulberry32(42)
  const b = mulberry32(42)
  for (let i = 0; i < 1000; i++) {
    const x = a()
    expect(x).toBe(b())
    expect(x >= 0 && x < 1).toBe(true)
  }
})

test('the same seed always gives the same bones', () => {
  expect(rollBones('3f1c2b9e-seed')).toEqual(rollBones('3f1c2b9e-seed'))
  const b = rollBones('any-seed')
  expect(SPECIES).toContain(b.species)
  expect(EYES).toContain(b.eye)
})

test('rarity and shiny odds match the weights over 100,000 fixed seeds', { timeoutMs: 30_000 }, () => {
  const N = 100_000
  const counts: Record<string, number> = {}
  let shiny = 0
  for (let i = 0; i < N; i++) {
    const b = rollBones(`test-${i}`)
    counts[b.rarity] = (counts[b.rarity] ?? 0) + 1
    if (b.shiny) shiny++
  }
  for (const r of RARITIES) {
    expect(Math.abs(((counts[r] ?? 0) / N) * 100 - RARITY[r].weight)).toBeLessThanOrEqual(1)
  }
  expect(Math.abs((shiny / N) * 100 - 1)).toBeLessThanOrEqual(0.3)
})

test('stats respect each rarity floor, with one peak and one low', { timeoutMs: 30_000 }, () => {
  for (let i = 0; i < 20_000; i++) {
    const b = rollBones(`stat-${i}`)
    const F = RARITY[b.rarity].floor
    expect(b.peak).not.toBe(b.low)
    for (const s of STATS) {
      const v = b.stats[s]
      if (s === b.peak) {
        expect(v).toBeGreaterThanOrEqual(F + 50)
        expect(v).toBeLessThanOrEqual(100)
      } else if (s === b.low) {
        expect(v).toBeGreaterThanOrEqual(Math.max(1, F - 10))
        expect(v).toBeLessThanOrEqual(F + 4)
      } else {
        expect(v).toBeGreaterThanOrEqual(F)
        expect(v).toBeLessThanOrEqual(F + 39)
      }
    }
  }
})

test('hats only appear at rarities allowed to wear them', { timeoutMs: 30_000 }, () => {
  for (let i = 0; i < 20_000; i++) {
    const b = rollBones(`hat-${i}`)
    expect(RARITY[b.rarity].hats).toContain(b.hat)
  }
})
```

- [ ] **Step 4: Run the tests to see them fail**

```bash
MOD="$HOME/.claude/dev-mods/629e9b24-6418-45cd-8de5-a611d13bd535/buddy"
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test "$MOD"
```
Expected: FAIL, because `./roll` can't be resolved.

- [ ] **Step 5: Write `roll.ts`**

`$MOD/hooks/roll.ts`:
```ts
// Bones: everything about a buddy derived from its seed. Recomputed on every
// load and never saved, as in the original.

export const SALT = 'friend-2026-401'

export const SPECIES = [
  'duck', 'goose', 'blob', 'cat', 'dragon', 'octopus', 'owl', 'penguin', 'turtle',
  'snail', 'ghost', 'axolotl', 'capybara', 'cactus', 'robot', 'rabbit', 'mushroom', 'chonk',
] as const
export type Species = (typeof SPECIES)[number]

export const EYES = ['·', '✦', '×', '◉', '@', '°'] as const
export type Eye = (typeof EYES)[number]

export const STATS = ['DEBUGGING', 'PATIENCE', 'CHAOS', 'WISDOM', 'SNARK'] as const
export type StatName = (typeof STATS)[number]

export const HATS = ['crown', 'tophat', 'propeller', 'halo', 'wizard', 'beanie', 'tinyduck'] as const
export type Hat = (typeof HATS)[number]

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const
export type Rarity = (typeof RARITIES)[number]

export type RarityInfo = {
  weight: number
  stars: number
  floor: number
  hats: readonly (Hat | 'none')[]
  color: string | undefined
}

export const RARITY: Record<Rarity, RarityInfo> = {
  common: { weight: 60, stars: 1, floor: 5, hats: ['none'], color: undefined },
  uncommon: { weight: 25, stars: 2, floor: 15, hats: ['none', 'crown', 'tophat', 'propeller'], color: 'green' },
  rare: { weight: 10, stars: 3, floor: 25, hats: ['none', 'crown', 'tophat', 'propeller', 'halo', 'wizard'], color: 'blue' },
  epic: { weight: 4, stars: 4, floor: 35, hats: ['none', 'crown', 'tophat', 'propeller', 'halo', 'wizard', 'beanie'], color: 'magenta' },
  legendary: {
    weight: 1, stars: 5, floor: 50,
    hats: ['none', 'crown', 'tophat', 'propeller', 'halo', 'wizard', 'beanie', 'tinyduck'],
    color: 'yellow',
  },
}

export type Bones = {
  rarity: Rarity
  species: Species
  eye: Eye
  hat: Hat | 'none'
  shiny: boolean
  stats: Record<StatName, number>
  peak: StatName
  low: StatName
}

export function fnv1a32(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function rngFor(seed: string): () => number {
  return mulberry32(fnv1a32(seed + SALT))
}

function int(rng: () => number, n: number): number {
  return Math.floor(rng() * n)
}

function pick<T>(rng: () => number, list: readonly T[]): T {
  return list[int(rng, list.length)]!
}

function pickRarity(rng: () => number): Rarity {
  let roll = rng() * 100
  for (const rarity of RARITIES) {
    roll -= RARITY[rarity].weight
    if (roll < 0) return rarity
  }
  return 'common'
}

// Draw order is fixed (spec section 2) so a seed always yields the same buddy.
export function rollBones(seed: string): Bones {
  const rng = rngFor(seed)
  const rarity = pickRarity(rng)
  const species = pick(rng, SPECIES)
  const eye = pick(rng, EYES)
  const hat = pick(rng, RARITY[rarity].hats)
  const shiny = rng() < 0.01
  const peakIndex = int(rng, STATS.length)
  let lowIndex = int(rng, STATS.length)
  while (lowIndex === peakIndex) lowIndex = int(rng, STATS.length)
  const floor = RARITY[rarity].floor
  const stats = {} as Record<StatName, number>
  STATS.forEach((name, i) => {
    if (i === peakIndex) stats[name] = Math.min(100, floor + 50 + int(rng, 30))
    else if (i === lowIndex) stats[name] = Math.max(1, floor - 10 + int(rng, 15))
    else stats[name] = floor + int(rng, 40)
  })
  return { rarity, species, eye, hat, shiny, stats, peak: STATS[peakIndex]!, low: STATS[lowIndex]! }
}
```

- [ ] **Step 6: Run the tests and validate**

```bash
MOD="$HOME/.claude/dev-mods/629e9b24-6418-45cd-8de5-a611d13bd535/buddy"
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test "$MOD" && "$CC" plugin validate "$MOD"
```
Expected: 6 pass, 0 fail. Validate reports no errors; it lists `types ... declares state: buddy.record, buddy.hatching, ...`.

If the rarity test fails by a small margin, check `pickRarity` first. Don't widen the tolerance.

- [ ] **Step 7: Commit**

```bash
MOD="$HOME/.claude/dev-mods/629e9b24-6418-45cd-8de5-a611d13bd535/buddy"
git -C "$MOD" add -A && git -C "$MOD" commit -q -m "feat: scaffold buddy mod and seeded bones" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Sprites

**Files:**
- Create: `$MOD/hooks/sprites.ts`
- Test: `$MOD/hooks/sprites.test.ts`

**Interfaces:**
- Consumes: `Hat`, `Species`, `SPECIES`, `EYES`, `HATS` from `roll.ts`.
- Produces:
  - constants and types: `SPRITE_W = 12`, `BLANK` (12 spaces), `type Frame = 0 | 1 | 2`, `HAT_ART: Record<Hat, string>`, `HEARTS: readonly string[]`
  - `fillEyes(row, eye): string`
  - `bodyRows(species, frame): string[]` returns 4 unpadded rows with `{E}` still in them
  - `spriteRows({ species, eye, frame, top }): string[]` returns 5 rows, each padded to 12
  - `topRow({ hat, heartsFrame: number | null, sparkle: number | null }): string`
  - `eggRows(frame): string[]` returns 5 rows, each padded to 12
  - `faceFor(species, eye): string`
  - `frameAt(tick): { frame: Frame; blink: boolean }`

- [ ] **Step 1: Write the failing tests**

`$MOD/hooks/sprites.test.ts`:
```ts
import { expect, test } from 'claude-code/testing'

import { EYES, HATS, SPECIES } from './roll'
import { BLANK, HAT_ART, HEARTS, SPRITE_W, bodyRows, eggRows, faceFor, fillEyes, frameAt, spriteRows, topRow } from './sprites'

test('every species frame is 4 body rows of at most 12 columns for every eye', () => {
  const over: string[] = []
  for (const species of SPECIES) {
    for (const frame of [0, 1, 2] as const) {
      const rows = bodyRows(species, frame)
      if (rows.length !== 4) over.push(`${species} frame ${frame}: ${rows.length} rows`)
      for (const eye of [...EYES, '-']) {
        for (const row of rows) {
          const drawn = fillEyes(row, eye)
          if (drawn.length > SPRITE_W) over.push(`${species} frame ${frame}: "${drawn}"`)
        }
      }
    }
  }
  expect(over).toEqual([])
})

test('a drawn sprite is exactly 5 rows of 12 columns with the hat row on top', () => {
  for (const species of SPECIES) {
    for (const frame of [0, 1, 2] as const) {
      const rows = spriteRows({ species, eye: '·', frame, top: BLANK })
      expect(rows).toHaveLength(5)
      expect(rows.every(r => r.length === SPRITE_W)).toBe(true)
      expect(rows[0]).toBe(BLANK)
    }
  }
})

test('hats, hearts and egg frames fit the same 12-column box', () => {
  for (const hat of HATS) expect(HAT_ART[hat].length).toBeLessThanOrEqual(SPRITE_W)
  for (const row of HEARTS) expect(row.length).toBeLessThanOrEqual(SPRITE_W)
  for (const frame of [0, 1, 2] as const) {
    const egg = eggRows(frame)
    expect(egg).toHaveLength(5)
    expect(egg.every(r => r.length === SPRITE_W)).toBe(true)
  }
})

test('every compact face is at most 6 columns', () => {
  for (const species of SPECIES) expect(faceFor(species, '·').length).toBeLessThanOrEqual(6)
})

test('hearts beat the hat, and the hat beats the sparkle', () => {
  expect(topRow({ hat: 'crown', heartsFrame: 0, sparkle: 0 })).toContain('♥')
  expect(topRow({ hat: 'crown', heartsFrame: null, sparkle: 0 })).toBe(HAT_ART.crown.padEnd(SPRITE_W))
  expect(topRow({ hat: 'none', heartsFrame: null, sparkle: 0 }).trim()).toBe('*')
  expect(topRow({ hat: 'none', heartsFrame: null, sparkle: null })).toBe(BLANK)
})

test('the 16-tick cycle rests, fidgets twice and blinks once', () => {
  const cycle = Array.from({ length: 16 }, (_, t) => frameAt(t))
  expect(cycle.filter(f => f.frame === 1)).toHaveLength(1)
  expect(cycle.filter(f => f.frame === 2)).toHaveLength(1)
  expect(cycle.filter(f => f.blink)).toHaveLength(1)
  expect(frameAt(16)).toEqual(frameAt(0))
})
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
MOD="$HOME/.claude/dev-mods/629e9b24-6418-45cd-8de5-a611d13bd535/buddy"
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test "$MOD"
```
Expected: the 6 new tests FAIL because `./sprites` can't be resolved. The 6 roll tests still pass.

- [ ] **Step 3: Write `sprites.ts`**

`$MOD/hooks/sprites.ts`. The art lines must start at column 0 exactly as shown:
```ts
// ASCII art drawn fresh for this mod in the original's format: 5 rows x 12
// columns, row 0 kept for a hat, {E} marking each eye.
import type { Hat, Species } from './roll'

export const SPRITE_W = 12
export const BLANK = ' '.repeat(SPRITE_W)
export type Frame = 0 | 1 | 2

// Each entry: the rest frame's four body rows, a line holding only "~", then
// the fidget-B frame's four body rows. Lines start at column 0. Rest rows stay
// within 11 columns so fidget A (rest nudged one column right) still fits.
const ART: Record<Species, string> = {
  duck: String.raw`
    __
  <({E} )___
   ( ._> /
    '---'
~
    __
  <({E} )___
   ( ._> \/
    '---'
`,
  goose: String.raw`
   ({E}>
    ) )
  _/  (_
  \____/
~
   ({E}O
    ) )
  _/  (_
  \____/
`,
  blob: String.raw`
   .---.
  ( {E} {E} )
  (  ~  )
   '---'
~

  .-----.
 ( {E}   {E} )
  '-----'
`,
  cat: String.raw`
  /\_/\
 ( {E}.{E} )
  > ^ <
 (_____)~
~
  /\_/\
 ( {E}.{E} )
  > ^ <
 (_____)_
`,
  dragon: String.raw`
  __/\__
 ({E}  {E} )~>
  \ ^^ /
  /_/\_\
~
  __/\__
 ({E}  {E} )~>*
  \ ^^ /
  /_/\_\
`,
  octopus: String.raw`
   .--.
  ( {E}{E} )
  /||||\
  \/\/\/
~
   .--.
  ( {E}{E} )
  \||||/
  /\/\/\
`,
  owl: String.raw`
  /\__/\
 ( {E}  {E} )
 (  vv  )
  '----'
~
  /\__/\
 ( {E}  - )
 (  vv  )
  '----'
`,
  penguin: String.raw`
   .--.
  ({E} v {E})
  /(  )\
   ^  ^
~
   .--.
  ({E} v {E})
  \(  )/
   ^  ^
`,
  turtle: String.raw`
   ____
 _/____\({E}>
 \_____/
  ^   ^
~
   ____
 _/____\{E}>
 \_____/
  ^   ^
`,
  snail: String.raw`
 {E} {E}  .--.
 \ \ ( @ )
  \_\_)__/
   ~~~~~~
~
 {E}  {E} .--.
 | / ( @ )
  \_\_)__/
   ~~~~~~
`,
  ghost: String.raw`
   .--.
  / {E}{E} \
  |  o |
  |/\/\|
~
   .--.
  / {E}{E} \
  |  O |
  |\/\/|
`,
  axolotl: String.raw`
 >\.--./<
  ( {E}{E} )
  ( ww )~
   ^  ^
~
 >/.--.\<
  ( {E}{E} )
  ( ww )~
   ^  ^
`,
  capybara: String.raw`
  ._____.
 ( {E}    \
 (u______)
  ||   ||
~
  ._____.
 ( {E}    \
 (o______)
  ||   ||
`,
  cactus: String.raw`
    .-.
 .-.|{E}{E}|.-.
 '-'|  |'-'
    |__|
~
    .*.
 .-.|{E}{E}|.-.
 '-'|  |'-'
    |__|
`,
  robot: String.raw`
    ||
  [{E}__{E}]
  |[==]|
  d|__|b
~
    |*
  [{E}__{E}]
  |[==]|
  d|__|b
`,
  rabbit: String.raw`
  (\ /)
  (\_/)
  ( {E}.{E})
  c(")(")
~
  (\ -)
  (\_/)
  ( {E}.{E})
  c(")(")
`,
  mushroom: String.raw`
  .-'''-.
 /  o  o \
 '-------'
   |{E}{E}|
~
  .-'''-. .
 /  o  o \
 '-------'
   |{E}{E}|
`,
  chonk: String.raw`
  /\___/\
 (  {E} {E}  )
 (   w   )
  (_____)
~
  /\___/\
 (  {E} {E}  )
 (   w   )~
  (_____)
`,
}

const EGG = String.raw`
    .--.
   /    \
   \    /
    '--'
~
    .--.
   /\/\/\
   \    /
    '--'
`

const FACE: Record<Species, string> = {
  duck: '<({E})',
  goose: '({E}>',
  blob: '({E}{E})',
  cat: '=^{E}^=',
  dragon: '({E}{E})>',
  octopus: '({E}{E})/',
  owl: '({E}v{E})',
  penguin: '<{E}v{E}>',
  turtle: '[]{E}>',
  snail: '@_{E}{E}',
  ghost: '/{E}{E}\\',
  axolotl: '>({E}{E})<',
  capybara: '({E}u)',
  cactus: '|{E}{E}|',
  robot: '[{E}_{E}]',
  rabbit: '({E}.{E})',
  mushroom: '^{E}{E}^',
  chonk: '({E}w{E})',
}

export const HAT_ART: Record<Hat, string> = {
  crown: '   .WWW.',
  tophat: '   _|##|_',
  propeller: '    -=+=-',
  halo: '    (  )',
  wizard: '     /*\\',
  beanie: '    (##)',
  tinyduck: "     <(')",
}

export const HEARTS: readonly string[] = ['   ♥    ♥', '  ♥   ♥  ♥', ' ♥  ♥   ♥']

function parseArt(art: string): [string[], string[]] {
  const lines = art.replace(/\r/g, '').split('\n').slice(1, -1)
  const cut = lines.indexOf('~')
  return [lines.slice(0, cut), lines.slice(cut + 1)]
}

// Pads only. A row that overflows stays long so the tests catch it.
function fit(row: string): string {
  return row.padEnd(SPRITE_W)
}

export function fillEyes(row: string, eye: string): string {
  return row.split('{E}').join(eye)
}

export function bodyRows(species: Species, frame: Frame): string[] {
  const [rest, alt] = parseArt(ART[species])
  if (frame === 1) return rest.map(row => ' ' + row)
  return frame === 0 ? rest : alt
}

export function spriteRows(o: { species: Species; eye: string; frame: Frame; top: string }): string[] {
  return [o.top, ...bodyRows(o.species, o.frame).map(row => fillEyes(row, o.eye))].map(fit)
}

export function topRow(o: { hat: Hat | 'none'; heartsFrame: number | null; sparkle: number | null }): string {
  if (o.heartsFrame !== null) return fit(HEARTS[o.heartsFrame % HEARTS.length]!)
  if (o.hat !== 'none') return fit(HAT_ART[o.hat])
  if (o.sparkle !== null) return fit(o.sparkle % 2 === 0 ? '*' : ' '.repeat(SPRITE_W - 1) + '*')
  return BLANK
}

export function eggRows(frame: Frame): string[] {
  const [whole, cracked] = parseArt(EGG)
  const body = frame === 0 ? whole : frame === 1 ? whole.map(row => ' ' + row) : cracked
  return [BLANK, ...body].map(fit)
}

export function faceFor(species: Species, eye: string): string {
  return fillEyes(FACE[species], eye)
}

// 16-tick cycle: rest, fidget A at 5, fidget B at 11, a blink at 14.
export function frameAt(tick: number): { frame: Frame; blink: boolean } {
  const t = ((tick % 16) + 16) % 16
  if (t === 5) return { frame: 1, blink: false }
  if (t === 11) return { frame: 2, blink: false }
  return { frame: 0, blink: t === 14 }
}
```

- [ ] **Step 4: Run the tests to see them pass**

Same command as Step 2. Expected: 12 pass, 0 fail.

If the width test lists an offender, shorten that row of art. Never add `.slice` to `fit`.

- [ ] **Step 5: Commit**

```bash
MOD="$HOME/.claude/dev-mods/629e9b24-6418-45cd-8de5-a611d13bd535/buddy"
git -C "$MOD" add -A && git -C "$MOD" commit -q -m "feat: sprites for 18 species, hats, hearts and egg" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Band layout

**Files:**
- Create: `$MOD/hooks/layout.ts`
- Test: `$MOD/hooks/layout.test.ts`

**Interfaces:**
- Consumes: `Bones`, `RARITY`, `STATS`, `rollBones` from `roll.ts`; `Soul` from `../types`.
- Produces:
  - constants: `MIN_FULL_ROWS = 6`, `MIN_FULL_COLS = 44`, `MAX_BUBBLE_LINES = 3`, `MAX_BUBBLE_W = 50`
  - `isCompact(maxRows, bodyColumns): boolean`
  - `bubbleWidth(bodyColumns): number`
  - `wrap(text, width, maxLines): string[]`
  - `bubbleRows(text, width): string[]` (every row exactly `width` long)
  - `bandRows(sprite, say: string | null, bodyColumns): { sprite: string[]; bubble: string[] }` (both length 5)
  - `nameLine(name, bones): { label: string; stars: string }`
  - `compactLine(face, name, say: string | null): string`
  - `cardLines(soul, bones, rerolls): string[]`

- [ ] **Step 1: Write the failing tests**

`$MOD/hooks/layout.test.ts`:
```ts
import { expect, test } from 'claude-code/testing'

import { bandRows, bubbleRows, cardLines, compactLine, isCompact, nameLine, wrap } from './layout'
import { rollBones } from './roll'

const SPRITE = ['a', 'b', 'c', 'd', 'e'].map(s => s.padEnd(12))
const SOUL = { name: 'Pip', personality: 'Counts semicolons.', hatchedAt: '2026-10-07T12:00:00.000Z' }

test('wrap keeps short text on one line', () => {
  expect(wrap('Three retries. Bold strategy.', 30, 3)).toEqual(['Three retries. Bold strategy.'])
})

test('wrap breaks on words and cuts the third line with an ellipsis', () => {
  expect(wrap('one two three four five six', 9, 3)).toEqual(['one two', 'three', 'four fiv…'])
})

test('wrap hard-splits a word longer than a line and never exceeds the width', () => {
  const lines = wrap('x'.repeat(200), 10, 3)
  expect(lines).toHaveLength(3)
  expect(lines.every(l => l.length <= 10)).toBe(true)
  expect(lines[2]?.endsWith('…')).toBe(true)
})

test('every bubble row is exactly the bubble width, with the tail on the first text line', () => {
  const rows = bubbleRows('hi there', 20)
  expect(rows).toHaveLength(3)
  expect(rows.every(r => r.length === 20)).toBe(true)
  expect(rows[1]?.startsWith('< ')).toBe(true)
  expect(bubbleRows('word '.repeat(40), 30)).toHaveLength(5)
})

test('compact below 6 rows or 44 columns', () => {
  expect(isCompact(5, 80)).toBe(true)
  expect(isCompact(6, 43)).toBe(true)
  expect(isCompact(6, 44)).toBe(false)
})

test('the band is always 5 sprite rows beside 5 bubble rows', () => {
  const quiet = bandRows(SPRITE, null, 80)
  expect(quiet.sprite).toHaveLength(5)
  expect(quiet.bubble).toEqual(['', '', '', '', ''])
  const talking = bandRows(SPRITE, 'Hello there.', 80)
  expect(talking.bubble).toHaveLength(5)
  expect(talking.bubble[1]).toContain('Hello there.')
})

test('name line, compact line and card', () => {
  const bones = rollBones('layout-seed')
  const { label, stars } = nameLine('Pip', bones)
  expect(label).toContain(`Pip  ${bones.rarity} ${bones.species}`)
  expect(stars.length).toBeGreaterThanOrEqual(1)
  expect(compactLine('<(·)', 'Pip', null)).toBe('<(·)  Pip')
  expect(compactLine('<(·)', 'Pip', 'Hi.')).toBe('<(·)  Pip: Hi.')
  const card = cardLines(SOUL, bones, 2)
  expect(card.length).toBeLessThanOrEqual(12)
  expect(card[0]).toMatch(/^Pip, /)
  expect(card.join('\n')).toContain('Rerolls: 2')
  expect(card.join('\n')).toContain('Hatched 2026-10-07')
})
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
MOD="$HOME/.claude/dev-mods/629e9b24-6418-45cd-8de5-a611d13bd535/buddy"
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test "$MOD"
```
Expected: the 7 new tests FAIL because `./layout` can't be resolved.

- [ ] **Step 3: Write `layout.ts`**

`$MOD/hooks/layout.ts`:
```ts
// The band's text layout: bubble wrapping, full and compact rows, and the card.
import type { Soul } from '../types'
import { RARITY, STATS } from './roll'
import type { Bones } from './roll'

export const MIN_FULL_ROWS = 6
export const MIN_FULL_COLS = 44
export const MAX_BUBBLE_LINES = 3
export const MAX_BUBBLE_W = 50

export function isCompact(maxRows: number, bodyColumns: number): boolean {
  return maxRows < MIN_FULL_ROWS || bodyColumns < MIN_FULL_COLS
}

export function bubbleWidth(bodyColumns: number): number {
  return Math.min(bodyColumns - 14, MAX_BUBBLE_W)
}

export function wrap(text: string, width: number, maxLines: number): string[] {
  const lines: string[] = []
  let line = ''
  for (let word of text.split(/\s+/).filter(Boolean)) {
    while (word.length > width) {
      if (line) {
        lines.push(line)
        line = ''
      }
      lines.push(word.slice(0, width))
      word = word.slice(width)
    }
    if (!word) continue
    if (!line) line = word
    else if (line.length + 1 + word.length <= width) line += ' ' + word
    else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  const last = kept[maxLines - 1]!
  kept[maxLines - 1] = (last.length < width ? last : last.slice(0, width - 1)) + '…'
  return kept
}

// A box exactly `width` wide: " .---." / "< text |" / "| text |" / " '---'".
export function bubbleRows(text: string, width: number): string[] {
  const inner = width - 4
  const lines = wrap(text, inner, MAX_BUBBLE_LINES)
  return [
    ' .' + '-'.repeat(width - 3) + '.',
    ...lines.map((line, i) => (i === 0 ? '< ' : '| ') + line.padEnd(inner) + ' |'),
    " '" + '-'.repeat(width - 3) + "'",
  ]
}

export function bandRows(
  sprite: readonly string[],
  say: string | null,
  bodyColumns: number,
): { sprite: string[]; bubble: string[] } {
  const box = say ? bubbleRows(say, bubbleWidth(bodyColumns)) : []
  return {
    sprite: Array.from({ length: 5 }, (_, i) => sprite[i] ?? ''),
    bubble: Array.from({ length: 5 }, (_, i) => box[i] ?? ''),
  }
}

export function nameLine(name: string, bones: Bones): { label: string; stars: string } {
  return {
    label: `  ${name}  ${bones.rarity} ${bones.species}${bones.shiny ? ' (shiny)' : ''}  `,
    stars: '★'.repeat(RARITY[bones.rarity].stars),
  }
}

export function compactLine(face: string, name: string, say: string | null): string {
  return say ? `${face}  ${name}: ${say}` : `${face}  ${name}`
}

export function cardLines(soul: Soul, bones: Bones, rerolls: number): string[] {
  const bar = (v: number) => '#'.repeat(Math.round(v / 5)).padEnd(20, '-')
  return [
    `${soul.name}, ${bones.rarity} ${bones.species} ${'★'.repeat(RARITY[bones.rarity].stars)}${bones.shiny ? ' (shiny)' : ''}`,
    `Hat: ${bones.hat}   Eyes: ${bones.eye}`,
    soul.personality,
    ...STATS.map(s => `${s.padEnd(10)} ${bar(bones.stats[s])} ${String(bones.stats[s]).padStart(3)}`),
    `Hatched ${soul.hatchedAt.slice(0, 10)}   Rerolls: ${rerolls}`,
  ]
}
```

- [ ] **Step 4: Run the tests to see them pass**

Same command as Step 2. Expected: 19 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
MOD="$HOME/.claude/dev-mods/629e9b24-6418-45cd-8de5-a611d13bd535/buddy"
git -C "$MOD" add -A && git -C "$MOD" commit -q -m "feat: band layout, speech bubble and card" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Voice: prompts, rules and fallbacks

**Files:**
- Create: `$MOD/hooks/voice.ts`
- Test: `$MOD/hooks/voice.test.ts`

**Interfaces:**
- Consumes: `Bones`, `StatName`, `STATS`, `rngFor`, `rollBones` from `roll.ts`; `Mode`, `Soul` from `../types`.
- Produces:
  - constants: `QUIP_COOLDOWN_MS`, `REPLY_FLOOR_MS`, `LONG_TURN_MS`, `QUIP_CHANCE`, `MAX_SAY`, `BUBBLE_TICKS`, `HEART_TICKS`
  - prompt strings: `PET_PROMPT`, `HELLO_PROMPT`
  - `FALLBACK_NAMES: readonly string[]` (24 names)
  - turn types: `TurnReason`, `TurnSummary = { reason; durationMs; tools: Record<string, number>; failed: string[] }`
  - rules: `isNotable(summary)`, `shouldQuip({ mode, inFlight, now, lastQuipAt, summary, roll })`
  - text handling: `matchAddress(name, text): string | null`, `cleanSay(raw): string`
  - prompt builders: `personaSystem(soul, bones)`, `reactionPrompt(summary)`, `talkPrompt(message)`, `hatchRequest(bones): { system; prompt }`
  - soul handling: `parseSoul(text): { name; personality } | null`, `fallbackSoul(seed, bones)`
  - `cannedLine(bones, n): string`

- [ ] **Step 1: Write the failing tests**

`$MOD/hooks/voice.test.ts`:
```ts
import { expect, test } from 'claude-code/testing'

import { rollBones } from './roll'
import {
  FALLBACK_NAMES, MAX_SAY, QUIP_COOLDOWN_MS, cannedLine, cleanSay, fallbackSoul, hatchRequest,
  matchAddress, parseSoul, reactionPrompt, shouldQuip,
} from './voice'
import type { TurnSummary } from './voice'

const CALM: TurnSummary = { reason: 'answer', durationMs: 4_000, tools: { Read: 2 }, failed: [] }
const ROUGH: TurnSummary = { reason: 'answer', durationMs: 4_000, tools: { Bash: 2 }, failed: ['Bash'] }
const NOW = 1_000_000
const base = { mode: 'on' as const, inFlight: false, now: NOW, lastQuipAt: 0, summary: CALM, roll: 0.9 }

test('the speak-or-not rule', () => {
  expect(shouldQuip({ ...base, summary: ROUGH })).toBe(true)
  expect(shouldQuip({ ...base, summary: { ...CALM, reason: 'error' } })).toBe(true)
  expect(shouldQuip({ ...base, summary: { ...CALM, reason: 'aborted' } })).toBe(true)
  expect(shouldQuip({ ...base, summary: { ...CALM, durationMs: 120_001 } })).toBe(true)
  expect(shouldQuip(base)).toBe(false)
  expect(shouldQuip({ ...base, roll: 0.1 })).toBe(true)
  expect(shouldQuip({ ...base, summary: ROUGH, lastQuipAt: NOW - QUIP_COOLDOWN_MS + 1 })).toBe(false)
  expect(shouldQuip({ ...base, summary: ROUGH, inFlight: true })).toBe(false)
  expect(shouldQuip({ ...base, summary: ROUGH, mode: 'muted' })).toBe(false)
  expect(shouldQuip({ ...base, summary: ROUGH, mode: 'off' })).toBe(false)
})

test('the name matcher', () => {
  expect(matchAddress('Pip', 'Pip, hi')).toBe('hi')
  expect(matchAddress('Pip', '  pip: how are you?')).toBe('how are you?')
  expect(matchAddress('Pip', 'Pipeline, hi')).toBeNull()
  expect(matchAddress('Pip', 'Fix Pip, hi')).toBeNull()
  expect(matchAddress('Pip', 'Pip,')).toBeNull()
})

test('reply cleanup strips quotes, newlines and emoji, and caps the length', () => {
  expect(cleanSay('"Hello!"  \n there \u{1F600}')).toBe('Hello! there')
  expect(cleanSay("'quoted'")).toBe('quoted')
  expect(cleanSay("it's fine")).toBe("it's fine")
  const long = cleanSay('x'.repeat(200))
  expect(long).toHaveLength(MAX_SAY)
  expect(long.endsWith('…')).toBe(true)
  expect(cleanSay('  \n ')).toBe('')
})

test('hatch JSON is validated, with a seeded fallback', () => {
  expect(parseSoul('```json\n{"name": "Pip", "personality": "Counts semicolons."}\n```')).toEqual({
    name: 'Pip',
    personality: 'Counts semicolons.',
  })
  expect(parseSoul('{"name": "R2D2", "personality": "Beeps."}')).toBeNull()
  expect(parseSoul(`{"name": "Pip", "personality": "${'x'.repeat(161)}"}`)).toBeNull()
  expect(parseSoul('no json here')).toBeNull()
  const bones = rollBones('voice-seed')
  const a = fallbackSoul('voice-seed', bones)
  expect(a).toEqual(fallbackSoul('voice-seed', bones))
  expect(FALLBACK_NAMES).toContain(a.name)
  expect(a.personality.length).toBeLessThanOrEqual(160)
  expect(hatchRequest(bones).prompt).toContain(`Species: ${bones.species}.`)
})

test('the reaction prompt carries the event summary and nothing else', () => {
  const p = reactionPrompt(ROUGH)
  expect(p).toContain('Tools used: Bash x2.')
  expect(p).toContain('Failed tools: Bash.')
  expect(p).toContain('Took 4s.')
})

test('canned lines come from the peak stat pool', () => {
  const bones = rollBones('voice-seed')
  expect(cannedLine(bones, 0).length).toBeGreaterThan(0)
  expect(cannedLine(bones, 3)).toBe(cannedLine(bones, 0))
})
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
MOD="$HOME/.claude/dev-mods/629e9b24-6418-45cd-8de5-a611d13bd535/buddy"
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test "$MOD"
```
Expected: the 6 new tests FAIL because `./voice` can't be resolved.

- [ ] **Step 3: Write `voice.ts`**

`$MOD/hooks/voice.ts`:
```ts
// What the buddy says and when: prompts for Haiku, the speak-or-not rule,
// reply cleanup, and fallbacks for when the model doesn't answer.
import type { Mode, Soul } from '../types'
import { STATS, rngFor } from './roll'
import type { Bones, StatName } from './roll'

export const QUIP_COOLDOWN_MS = 180_000
export const REPLY_FLOOR_MS = 5_000
export const LONG_TURN_MS = 120_000
export const QUIP_CHANCE = 0.25
export const MAX_SAY = 90
export const BUBBLE_TICKS = 24
export const HEART_TICKS = 5

export const PET_PROMPT = 'The developer just petted you. React in one line.'
export const HELLO_PROMPT = 'The developer just called you over. Say hello in one line.'

export type TurnReason = 'answer' | 'aborted' | 'refusal' | 'error'
export type TurnSummary = {
  reason: TurnReason
  durationMs: number
  tools: Record<string, number>
  failed: string[]
}

export function isNotable(s: TurnSummary): boolean {
  return s.failed.length > 0 || s.reason === 'error' || s.reason === 'aborted' || s.durationMs > LONG_TURN_MS
}

export function shouldQuip(o: {
  mode: Mode
  inFlight: boolean
  now: number
  lastQuipAt: number
  summary: TurnSummary
  roll: number
}): boolean {
  if (o.mode !== 'on' || o.inFlight) return false
  if (o.now - o.lastQuipAt < QUIP_COOLDOWN_MS) return false
  return isNotable(o.summary) || o.roll < QUIP_CHANCE
}

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// "Pip, hi" or "pip: hi" at the very start of the prompt. Returns what follows.
export function matchAddress(name: string, text: string): string | null {
  const match = new RegExp(`^\\s*${escapeRe(name)}\\s*[,:]\\s*(\\S[\\s\\S]*)$`, 'i').exec(text)
  return match ? match[1]!.trim() : null
}

export function cleanSay(raw: string): string {
  const text = raw
    .replace(/[\uD800-\uDFFF]/g, '')
    .replace(/["“”‘’`]/g, '')
    .replace(/^'+|'+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > MAX_SAY ? text.slice(0, MAX_SAY - 1) + '…' : text
}

function statLine(b: Bones): string {
  return STATS.map(s => `${s} ${b.stats[s]}`).join(', ')
}

export function personaSystem(soul: Soul, b: Bones): string {
  return [
    `You are ${soul.name}, a ${b.rarity}${b.shiny ? ' shiny' : ''} ${b.species} who lives in a developer's terminal, above their prompt.`,
    `Personality: ${soul.personality}`,
    `Stats: ${statLine(b)}.`,
    `Reply with one line of at most ${MAX_SAY} characters, in character. No markdown, no emoji, no quotation marks.`,
  ].join('\n')
}

export function reactionPrompt(s: TurnSummary): string {
  const tools = Object.entries(s.tools).map(([tool, n]) => `${tool} x${n}`).join(', ') || 'none'
  return [
    'Claude just finished a turn for the developer.',
    `Outcome: ${s.reason}. Took ${Math.round(s.durationMs / 1000)}s.`,
    `Tools used: ${tools}.`,
    `Failed tools: ${s.failed.length ? s.failed.join(', ') : 'none'}.`,
    'React in one line.',
  ].join('\n')
}

export function talkPrompt(message: string): string {
  return `The developer says to you: ${message.slice(0, 500)}\nReply in one line.`
}

export function hatchRequest(b: Bones): { system: string; prompt: string } {
  return {
    system: [
      'You name and describe a small ASCII pet that lives in a developer terminal.',
      'Reply with JSON only: {"name": "...", "personality": "..."}',
      'name: one word, letters only, at most 12 characters.',
      "personality: at most 160 characters, written in the pet's own voice, shaped by its highest and lowest stats.",
    ].join('\n'),
    prompt:
      `Species: ${b.species}. Rarity: ${b.rarity}. Shiny: ${b.shiny ? 'yes' : 'no'}. ` +
      `Highest stat: ${b.peak} (${b.stats[b.peak]}). Lowest stat: ${b.low} (${b.stats[b.low]}).`,
  }
}

export function parseSoul(text: string): { name: string; personality: string } | null {
  const json = /\{[\s\S]*\}/.exec(text)?.[0]
  if (!json) return null
  try {
    const value = JSON.parse(json) as { name?: unknown; personality?: unknown }
    const name = typeof value.name === 'string' ? value.name.trim() : ''
    const personality = typeof value.personality === 'string' ? value.personality.trim() : ''
    if (!/^[A-Za-z]{1,12}$/.test(name)) return null
    if (personality.length === 0 || personality.length > 160) return null
    return { name, personality }
  } catch {
    return null
  }
}

export const FALLBACK_NAMES: readonly string[] = [
  'Pip', 'Biscuit', 'Mochi', 'Byte', 'Nib', 'Pixel', 'Tofu', 'Gizmo',
  'Sprocket', 'Noodle', 'Widget', 'Pebble', 'Bloop', 'Cosmo', 'Dot', 'Fennel',
  'Grub', 'Juniper', 'Kiwi', 'Lint', 'Moss', 'Nacho', 'Quill', 'Ziggy',
]

const TRAITS: Record<StatName, string> = {
  DEBUGGING: 'Spots the off-by-one before you do and will not stop mentioning it.',
  PATIENCE: 'Has watched a thousand builds fail and is ready to watch a thousand more.',
  CHAOS: 'Thinks force-pushing on a Friday builds character.',
  WISDOM: 'Speaks rarely, mostly in proverbs about caching.',
  SNARK: 'Has opinions about your variable names and shares all of them.',
}

export function fallbackSoul(seed: string, b: Bones): { name: string; personality: string } {
  const rng = rngFor(seed + ':name')
  const name = FALLBACK_NAMES[Math.floor(rng() * FALLBACK_NAMES.length)]!
  return { name, personality: `${TRAITS[b.peak]} Low on ${b.low.toLowerCase()}.` }
}

const CANNED: Record<StatName, readonly string[]> = {
  DEBUGGING: ['Have you tried reading the stack trace?', 'I counted. It is off by one.', 'Somewhere a semicolon is laughing.'],
  PATIENCE: ['Take your time. I have nowhere to be.', 'Deep breath. The build will finish.', 'Still here. Still rooting for you.'],
  CHAOS: ['Ship it. What could go wrong?', 'Delete the tests. Feel free.', 'I pressed a key. Not telling which.'],
  WISDOM: ['A cache is a promise you forget to keep.', 'The bug is where you are not looking.', 'Every refactor begins with a nap.'],
  SNARK: ['Bold of you to call that a variable name.', 'I would have done it faster. Probably.', 'Oh good, more TODOs.'],
}

export function cannedLine(b: Bones, n: number): string {
  const pool = CANNED[b.peak]
  return pool[((n % pool.length) + pool.length) % pool.length]!
}
```

- [ ] **Step 4: Run the tests to see them pass**

Same command as Step 2. Expected: 25 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
MOD="$HOME/.claude/dev-mods/629e9b24-6418-45cd-8de5-a611d13bd535/buddy"
git -C "$MOD" add -A && git -C "$MOD" commit -q -m "feat: voice rules, prompts and fallbacks" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Commands, hatching and the band

**Files:**
- Create: `$MOD/hooks/record.ts`
- Test: `$MOD/hooks/record.test.ts`
- Replace: `$MOD/hooks/register.tsx` (the stub from Task 1)
- Test: `$MOD/hooks/buddy.test.tsx`

**Interfaces:**
- Consumes: everything produced by Tasks 1 to 4, with the exact names listed there.
- Produces:
  - from `record.ts`: `STORE_KEY = 'buddy'`, `USAGE`, `type Loaded`, `classifyRecord(raw): Loaded`, `newRecord(seed, soul, rerolls): BuddyRecord`, `type Sub`, `parseSub(args): Sub`
  - in `register.tsx`, which Task 6 extends:
    - helpers: `later($, work)`, `ask($, rec, bones, prompt, kind: 'react' | 'reply')`, `showBubble($, text)`
    - variables: `inFlight` and the state atoms `record`, `bubble` and `lastQuipAt`
  - in `buddy.test.tsx`, which Task 6 extends: `world(on, store?)`, `model(on, soul, say)`, `runner($)`, `RECORD`, `START`, `band(maxRows?, bodyColumns?)`

- [ ] **Step 1: Write the failing pure tests for `record.ts`**

`$MOD/hooks/record.test.ts`:
```ts
import { expect, test } from 'claude-code/testing'

import { classifyRecord, newRecord, parseSub } from './record'

const SOUL = { name: 'Pip', personality: 'x', hatchedAt: '2026-10-07T00:00:00.000Z' }

test('records are classified, and only schema 1 is ours', () => {
  expect(classifyRecord(undefined)).toEqual({ kind: 'none' })
  expect(classifyRecord(null)).toEqual({ kind: 'none' })
  const rec = newRecord('s', SOUL, 0)
  expect(classifyRecord(rec)).toEqual({ kind: 'ok', record: rec })
  expect(classifyRecord({ schema: 2, seed: 'x' })).toEqual({ kind: 'foreign', schema: '2' })
  expect(classifyRecord('junk')).toEqual({ kind: 'foreign', schema: 'unknown' })
})

test('a new record starts on, with the rerolls it is given', () => {
  expect(newRecord('s', SOUL, 3)).toEqual({ schema: 1, seed: 's', soul: SOUL, mode: 'on', rerolls: 3 })
})

test('subcommands', () => {
  expect(parseSub('')).toBe('show')
  expect(parseSub('  pet ')).toBe('pet')
  expect(parseSub('CARD')).toBe('card')
  expect(parseSub('mute')).toBe('mute')
  expect(parseSub('unmute')).toBe('unmute')
  expect(parseSub('off')).toBe('off')
  expect(parseSub('reroll')).toBe('reroll')
  expect(parseSub('reroll confirm')).toBe('reroll-confirm')
  expect(parseSub('reroll now')).toBe('usage')
  expect(parseSub('pet twice')).toBe('usage')
  expect(parseSub('dance')).toBe('usage')
})
```

- [ ] **Step 2: Write the failing mod-level tests**

`$MOD/hooks/buddy.test.tsx`:
```tsx
import type { ModelCompleteResult, On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { FALLBACK_NAMES } from './voice'

const ZERO = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const ok = (text: string): ModelCompleteResult => ({ isAnswered: true, text, usage: ZERO })
const failed = (): ModelCompleteResult => ({ isAnswered: false, reason: 'empty-reply', usage: ZERO })

const RECORD = {
  schema: 1,
  seed: 'test-seed',
  soul: { name: 'Pip', personality: 'Counts semicolons.', hatchedAt: '2026-10-07T00:00:00.000Z' },
  mode: 'on',
  rerolls: 0,
}
const START = { cwd: '.', surface: 'terminal' as const, isInteractive: true }
const RUN = { origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 100 } }

const band = (maxRows = 10, bodyColumns = 80) => ({
  component: 'AbovePrompt' as const,
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows,
    bodyColumns,
    scroll: { offset: 0, bodyRows: maxRows - 1 },
    view: {},
  },
})

// The world beneath the plugin: a clock, a store, the command registry, session
// start, and a stand-in for the engine's own band so a pass-through is visible.
function world(on: On, store: Record<string, unknown> = {}) {
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on, store)
  on('command.register', async (_$, e) => ({ command: e.name }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('ui.render', { component: 'AbovePrompt' }, async ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine band</Text>
  })
  return clock
}

// Answers $.model.complete: hatch requests get `soul`, everything else gets
// `say`; null answers as a failure. Returns the prompts the plugin sent.
function model(on: On, soul: string | null, say: string | null): string[] {
  const prompts: string[] = []
  on('model.complete', async (_$, e) => {
    prompts.push(e.prompt)
    const text = e.system?.includes('JSON only') ? soul : say
    return text === null ? failed() : ok(text)
  })
  return prompts
}

const runner = ($: Engine) => async (args: string) =>
  (await $.command.run({ command: 'buddy', args, ...RUN })).text

test("before hatching, the band is the engine's own", async ($, on) => {
  world(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await ui.find({ text: 'engine band' })).toBeDefined()
  expect(await runner($)('pet')).toBe('No buddy yet. Run /buddy to hatch one.')
})

test('hatching names the buddy and draws it on terminal and desktop', async ($, on) => {
  const clock = world(on)
  model(on, '{"name": "Pip", "personality": "Counts semicolons."}', 'Hello there.')
  await $.session.start(START)
  expect(await runner($)('')).toMatch(/^Pip, a .* hatched\.$/)
  await clock.settle()
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'buddy', surface, ...band() })
    expect(await ui.find({ text: /Pip/ })).toBeDefined()
    expect(await ui.find({ text: /Hello there\./ })).toBeDefined()
  }
})

test('a failing model still hatches, with a fallback name', async ($, on) => {
  world(on)
  model(on, null, null)
  await $.session.start(START)
  const text = (await runner($)('')) ?? ''
  expect(FALLBACK_NAMES).toContain(text.split(',')[0])
})

test('the full band is six rows on the terminal; a short band is one line', async ($, on) => {
  world(on, { buddy: RECORD })
  await $.session.start(START)
  const full = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band(10, 80) })
  const drawn = (await full.drawn()) as unknown as { children: unknown[] }
  expect(drawn.children).toHaveLength(6)
  for (const surface of ['terminal', 'desktop'] as const) {
    const short = await $.ui.mount({ plugin: 'buddy', surface, ...band(3, 80) })
    const texts = await short.findAll({ type: 'Text' })
    expect(texts).toHaveLength(1)
    expect(texts[0]?.text).toMatch(/Pip/)
  }
})

test('petting shows hearts then a reply; a second pet inside 5 s gets a canned line', async ($, on) => {
  const clock = world(on, { buddy: RECORD })
  const prompts = model(on, null, 'Purr.')
  await $.session.start(START)
  const run = runner($)
  expect(await run('pet')).toBeUndefined()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await ui.find({ text: /♥/ })).toBeDefined()
  await clock.settle()
  expect(await ui.find({ text: /Purr\./ })).toBeDefined()
  await run('pet')
  await clock.settle()
  expect(prompts.filter(p => p.includes('petted'))).toHaveLength(1)
  await clock.advance(3_000)
  expect(await ui.find({ text: /♥/ })).toBeUndefined()
})

test('card shows name, stats and rerolls', async ($, on) => {
  world(on, { buddy: RECORD })
  await $.session.start(START)
  const card = (await runner($)('card')) ?? ''
  expect(card).toMatch(/^Pip, /)
  expect(card).toMatch(/DEBUGGING/)
  expect(card).toMatch(/Rerolls: 0/)
})

test('reroll asks first, then replaces the buddy and counts the reroll', async ($, on) => {
  world(on, { buddy: RECORD })
  model(on, '{"name": "Bix", "personality": "New here."}', 'Hi.')
  await $.session.start(START)
  const run = runner($)
  expect(await run('reroll')).toMatch(/^This replaces Pip, .* for good\. Run \/buddy reroll confirm\.$/)
  expect(await run('card')).toMatch(/Rerolls: 0/)
  expect(await run('reroll confirm')).toMatch(/^Bix, a /)
  const card = (await run('card')) ?? ''
  expect(card).toMatch(/^Bix, /)
  expect(card).toMatch(/Rerolls: 1/)
})

test('off hides the buddy and /buddy brings it back', async ($, on) => {
  const clock = world(on, { buddy: RECORD })
  model(on, null, 'Back again.')
  await $.session.start(START)
  const run = runner($)
  expect(await run('off')).toBe('Pip is hidden. Run /buddy to bring it back.')
  const hidden = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await hidden.find({ text: 'engine band' })).toBeDefined()
  expect(await run('pet')).toBe('Pip is hidden. Run /buddy to bring it back.')
  expect(await run('')).toMatch(/^Pip, .*, is here\.$/)
  await clock.settle()
  const shown = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await shown.find({ text: /Back again\./ })).toBeDefined()
})

test('a record from a newer schema is never touched', async ($, on) => {
  world(on, { buddy: { schema: 2, seed: 'future' } })
  await $.session.start(START)
  const run = runner($)
  for (const args of ['', 'pet', 'reroll confirm']) {
    expect(await run(args)).toBe('Saved buddy uses schema 2; this mod knows 1.')
  }
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await ui.find({ text: 'engine band' })).toBeDefined()
})
```

- [ ] **Step 3: Run the tests to see them fail**

```bash
MOD="$HOME/.claude/dev-mods/629e9b24-6418-45cd-8de5-a611d13bd535/buddy"
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test "$MOD"
```
Expected: `record.test.ts` FAILS because `./record` can't be resolved. The `buddy.test.tsx` tests FAIL: the stub registers nothing, so `buddy` is never registered and nothing draws.

- [ ] **Step 4: Write `record.ts`**

`$MOD/hooks/record.ts`:
```ts
// The saved record and the /buddy subcommands. Pure: no $.
import type { BuddyRecord, Soul } from '../types'

export const STORE_KEY = 'buddy'
export const USAGE = 'Usage: /buddy [pet | card | mute | unmute | off | reroll [confirm]]'

export type Loaded =
  | { kind: 'none' }
  | { kind: 'ok'; record: BuddyRecord }
  | { kind: 'foreign'; schema: string }

export function classifyRecord(raw: unknown): Loaded {
  if (raw === undefined || raw === null) return { kind: 'none' }
  const schema = typeof raw === 'object' ? (raw as { schema?: unknown }).schema : undefined
  if (schema === 1) return { kind: 'ok', record: raw as BuddyRecord }
  return { kind: 'foreign', schema: schema === undefined ? 'unknown' : String(schema) }
}

export function newRecord(seed: string, soul: Soul, rerolls: number): BuddyRecord {
  return { schema: 1, seed, soul, mode: 'on', rerolls }
}

export type Sub = 'show' | 'pet' | 'card' | 'mute' | 'unmute' | 'off' | 'reroll' | 'reroll-confirm' | 'usage'

const SIMPLE: readonly string[] = ['pet', 'card', 'mute', 'unmute', 'off']

export function parseSub(args: string): Sub {
  const words = args.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const [first, second] = words
  if (first === undefined) return 'show'
  if (first === 'reroll') {
    if (words.length === 1) return 'reroll'
    return words.length === 2 && second === 'confirm' ? 'reroll-confirm' : 'usage'
  }
  return words.length === 1 && SIMPLE.includes(first) ? (first as Sub) : 'usage'
}
```

- [ ] **Step 5: Replace `register.tsx`**

`$MOD/hooks/register.tsx`:
```tsx
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { BuddyRecord } from '../types'
import { bandRows, cardLines, compactLine, isCompact, nameLine } from './layout'
import { STORE_KEY, USAGE, classifyRecord, newRecord, parseSub } from './record'
import type { Sub } from './record'
import { RARITY, rollBones } from './roll'
import type { Bones } from './roll'
import { eggRows, faceFor, frameAt, spriteRows, topRow } from './sprites'
import type { Frame } from './sprites'
import {
  BUBBLE_TICKS,
  HEART_TICKS,
  HELLO_PROMPT,
  PET_PROMPT,
  REPLY_FLOOR_MS,
  cannedLine,
  cleanSay,
  fallbackSoul,
  hatchRequest,
  parseSoul,
  personaSystem,
} from './voice'

const record = atom({ plugin: 'buddy', key: 'record' } as const, null)
const hatching = atom({ plugin: 'buddy', key: 'hatching' } as const, false)
const tick = atom({ plugin: 'buddy', key: 'tick' } as const, 0)
const bubble = atom({ plugin: 'buddy', key: 'bubble' } as const, null)
const heartsUntil = atom({ plugin: 'buddy', key: 'heartsUntilTick' } as const, 0)
const lastQuipAt = atom({ plugin: 'buddy', key: 'lastQuipAt' } as const, 0)
const lastReplyAt = atom({ plugin: 'buddy', key: 'lastReplyAt' } as const, 0)

type Look = {
  sprite: string[]
  face: string
  name: string
  label: string
  stars: string
  starColor: string | undefined
  spriteColor: string | undefined
  say: string | null
}

const tint = (color: string | undefined) => (color ? { color } : {})

export const register: Register = on => {
  // Module variables start over on a hot reload; nothing here needs to survive one.
  let timer: { cancel: () => void } | null = null
  let inFlight: { controller: AbortController; kind: 'react' | 'reply' } | null = null
  let cannedCount = 0

  function startTimer($: EngineInterface) {
    timer?.cancel()
    timer = $.clock.every(500, () => {
      void update($, tick, n => n + 1)
    })
  }

  function stopTimer() {
    timer?.cancel()
    timer = null
  }

  // Work that must outlive the hook that started it (spec: work meant to outlive
  // a dispatch runs on a $.clock timer).
  function later($: EngineInterface, work: () => Promise<unknown>) {
    $.clock.after(0, () => {
      void work().catch(() => undefined)
    })
  }

  async function save($: EngineInterface, rec: BuddyRecord): Promise<string | null> {
    await update($, record, () => rec)
    if (rec.mode === 'off') stopTimer()
    else if (!timer) startTimer($)
    try {
      await $.store.set(STORE_KEY, rec)
      return null
    } catch {
      return 'Could not save your buddy; it lives for this session only.'
    }
  }

  async function showBubble($: EngineInterface, text: string) {
    const now = await read($, tick)
    await update($, bubble, () => ({ text, untilTick: now + BUBBLE_TICKS }))
  }

  // One model call at a time: a reply cancels a pending reaction; a reaction
  // never starts while anything is pending.
  async function ask(
    $: EngineInterface,
    rec: BuddyRecord,
    bones: Bones,
    prompt: string,
    kind: 'react' | 'reply',
  ): Promise<string | null> {
    if (kind === 'react' && inFlight) return null
    if (kind === 'reply') inFlight?.controller.abort()
    const mine = { controller: new AbortController(), kind }
    inFlight = mine
    try {
      const result = await $.model.complete(
        { model: 'haiku', system: personaSystem(rec.soul, bones), prompt, maxTokens: 60, timeoutMs: 8000 },
        { signal: mine.controller.signal },
      )
      if (mine.controller.signal.aborted || !result.isAnswered) return null
      return cleanSay(result.text) || null
    } catch {
      return null
    } finally {
      if (inFlight === mine) inFlight = null
    }
  }

  // Talk, pet and hello: answered even when muted, at most one model call per 5 s.
  async function reply($: EngineInterface, rec: BuddyRecord, prompt: string) {
    const bones = rollBones(rec.seed)
    const now = await $.clock.now()
    const last = await read($, lastReplyAt)
    await update($, lastReplyAt, () => now)
    const text = now - last < REPLY_FLOOR_MS ? null : await ask($, rec, bones, prompt, 'reply')
    await showBubble($, text ?? cannedLine(bones, cannedCount++))
  }

  async function hatch($: EngineInterface, rerolls: number): Promise<string> {
    const seed = crypto.randomUUID()
    const bones = rollBones(seed)
    await update($, hatching, () => true)
    if (!timer) startTimer($)
    let soul = fallbackSoul(seed, bones)
    try {
      const request = hatchRequest(bones)
      const result = await $.model.complete({
        model: 'haiku',
        system: request.system,
        prompt: request.prompt,
        maxTokens: 200,
        timeoutMs: 8000,
      })
      if (result.isAnswered) soul = parseSoul(result.text) ?? soul
    } catch {
      // Keep the fallback soul: hatching never fails.
    }
    const hatchedAt = new Date(await $.clock.now()).toISOString()
    const rec = newRecord(seed, { ...soul, hatchedAt }, rerolls)
    const note = await save($, rec)
    await update($, hatching, () => false)
    await update($, bubble, () => null)
    later($, () => reply($, rec, HELLO_PROMPT))
    return note ?? `${soul.name}, a ${bones.rarity}${bones.shiny ? ' shiny' : ''} ${bones.species}, hatched.`
  }

  async function runBuddy($: EngineInterface, sub: Sub): Promise<string | undefined> {
    if (sub === 'usage') return USAGE
    const loaded = classifyRecord(await $.store.get(STORE_KEY))
    if (loaded.kind === 'foreign') return `Saved buddy uses schema ${loaded.schema}; this mod knows 1.`
    if (loaded.kind === 'none') {
      return sub === 'show' ? hatch($, 0) : 'No buddy yet. Run /buddy to hatch one.'
    }
    const rec = loaded.record
    const bones = rollBones(rec.seed)
    const who = `${rec.soul.name}, ${bones.rarity} ${bones.species}`
    const hidden = `${rec.soul.name} is hidden. Run /buddy to bring it back.`
    switch (sub) {
      case 'show': {
        const shown: BuddyRecord = { ...rec, mode: 'on' }
        const note = await save($, shown)
        later($, () => reply($, shown, HELLO_PROMPT))
        return note ?? `${who}, is here.`
      }
      case 'pet': {
        if (rec.mode === 'off') return hidden
        const now = await read($, tick)
        await update($, heartsUntil, () => now + HEART_TICKS)
        later($, () => reply($, rec, PET_PROMPT))
        return undefined
      }
      case 'card':
        return cardLines(rec.soul, bones, rec.rerolls).join('\n')
      case 'mute':
        return (await save($, { ...rec, mode: 'muted' })) ?? `${rec.soul.name} will stay quiet unless spoken to.`
      case 'unmute':
        return (await save($, { ...rec, mode: 'on' })) ?? `${rec.soul.name} can talk again.`
      case 'off':
        return (await save($, { ...rec, mode: 'off' })) ?? hidden
      case 'reroll':
        return `This replaces ${who}, for good. Run /buddy reroll confirm.`
      case 'reroll-confirm':
        return hatch($, rec.rerolls + 1)
    }
  }

  function eggLook(frame: Frame): Look {
    return {
      sprite: eggRows(frame),
      face: '(egg)',
      name: 'hatching...',
      label: '  hatching...',
      stars: '',
      starColor: undefined,
      spriteColor: undefined,
      say: null,
    }
  }

  async function buddyLook($: EngineInterface, rec: BuddyRecord, t: number): Promise<Look> {
    const bones = rollBones(rec.seed)
    const { frame, blink } = frameAt(t)
    const eye = blink ? '-' : bones.eye
    const heartsUntilTick = await read($, heartsUntil)
    const top = topRow({
      hat: bones.hat,
      heartsFrame: t < heartsUntilTick ? t : null,
      sparkle: bones.shiny ? t : null,
    })
    const said = await read($, bubble)
    const { label, stars } = nameLine(rec.soul.name, bones)
    return {
      sprite: spriteRows({ species: bones.species, eye, frame, top }),
      face: faceFor(bones.species, eye),
      name: rec.soul.name,
      label,
      stars,
      starColor: RARITY[bones.rarity].color,
      spriteColor: bones.shiny ? 'yellow' : undefined,
      say: said && t < said.untilTick ? said.text : null,
    }
  }

  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({
        name: 'buddy',
        description: 'Hatch, pet, or manage your terminal buddy',
        argumentHint: '[pet | card | mute | unmute | off | reroll [confirm]]',
        immediate: true,
      })
      const loaded = classifyRecord(await $.store.get(STORE_KEY))
      const rec = loaded.kind === 'ok' ? loaded.record : null
      await update($, record, () => rec)
      if (rec && rec.mode !== 'off') startTimer($)
    } catch {
      // The buddy never holds up a session.
    }
    return next(e)
  })

  on('command.run', { command: 'buddy' }, async ($, e) => {
    try {
      return { text: await runBuddy($, parseSub(e.args)) }
    } catch {
      return { text: 'Your buddy hit a snag. Try again.' }
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    try {
      const rec = await read($, record)
      const isHatching = await read($, hatching)
      if (e.props.hasSurvey || (!isHatching && (!rec || rec.mode === 'off'))) return next(e)

      const { Box, Code, Text } = $.ui.resolve(e)
      const t = await read($, tick)
      const view = isHatching || !rec ? eggLook(frameAt(t).frame) : await buddyLook($, rec, t)

      if (isCompact(e.props.maxRows, e.props.bodyColumns)) {
        return <Text wrap="truncate-end">{compactLine(view.face, view.name, view.say)}</Text>
      }

      const rows = bandRows(view.sprite, view.say, e.props.bodyColumns)
      const nameRow = (
        <Box>
          <Text dimColor>{view.label}</Text>
          <Text {...tint(view.starColor)}>{view.stars}</Text>
        </Box>
      )

      if (e.surface === 'desktop') {
        const source = rows.sprite.map((row, i) => (row + ' ' + (rows.bubble[i] ?? '')).trimEnd()).join('\n')
        return (
          <Box flexDirection="column">
            <Code source={source} />
            {nameRow}
          </Box>
        )
      }

      return (
        <Box flexDirection="column">
          {rows.sprite.map((row, i) => (
            <Box>
              <Text {...tint(view.spriteColor)} bold={view.spriteColor !== undefined}>
                {row}
              </Text>
              <Text>{' ' + (rows.bubble[i] ?? '')}</Text>
            </Box>
          ))}
          {nameRow}
        </Box>
      )
    } catch {
      return next(e)
    }
  })
}
```

`lastQuipAt` and `ask`'s `'react'` path are unused until Task 6. Leave them in place.

- [ ] **Step 6: Run the tests and validate**

```bash
MOD="$HOME/.claude/dev-mods/629e9b24-6418-45cd-8de5-a611d13bd535/buddy"
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test "$MOD" && "$CC" plugin validate "$MOD"
```
Expected: 37 pass, 0 fail. Validate reports no errors. Its `calls:` line includes `$.command.register`, `$.model.complete`, `$.store.get`, `$.store.set`, `$.clock.every`, `$.clock.after`, `$.ui.resolve`.

If a mounted drawing doesn't update after a state change (the hearts or bubble assertions fail while the state is right), mount a fresh drawing after the change instead of reusing `ui`. Note it in the commit message.

- [ ] **Step 7: Commit**

```bash
MOD="$HOME/.claude/dev-mods/629e9b24-6418-45cd-8de5-a611d13bd535/buddy"
git -C "$MOD" add -A && git -C "$MOD" commit -q -m "feat: /buddy commands, hatching and the prompt band" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Reactions and talking

**Files:**
- Modify: `$MOD/hooks/register.tsx` (the voice import; new hooks inserted before the `ui.render` hook)
- Modify: `$MOD/hooks/buddy.test.tsx` (append tests)

**Interfaces:**
- Consumes:
  - from Task 5's `register.tsx`: `later`, `ask`, `showBubble`, `reply`, `inFlight`, and the atoms `record`, `lastQuipAt`
  - from `voice.ts`: `matchAddress`, `reactionPrompt`, `shouldQuip`, `talkPrompt`, `TurnSummary`
  - from Task 5's test file: `world`, `model`, `runner`, `RECORD`, `START`, `band`
- Produces: the `tool.call`, `turn.complete` and `prompt.submit` hooks.

- [ ] **Step 1: Append the failing tests**

Append to `$MOD/hooks/buddy.test.tsx`:
```tsx
const TURN = { answer: 'done', durationMs: 4_000, isAborted: false, turnId: 't1', reason: 'answer' as const }

// Beneath the plugin: Bash fails, turns and prompts pass straight through.
function engineBelow(on: On) {
  on('tool.call', async () => ({ isError: true as const, result: 'boom' }))
  on('turn.complete', async (_$, e) => ({ text: e.answer }))
  on('prompt.submit', async (_$, e) => ({ text: e.text }))
}

test('a turn with a failed tool gets one reaction, then the cooldown holds', async ($, on) => {
  const clock = world(on, { buddy: RECORD })
  engineBelow(on)
  const prompts = model(on, null, 'Ouch.')
  await $.session.start(START)
  const reactions = () => prompts.filter(p => p.includes('Failed tools'))
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await $.turn.complete(TURN)
  await clock.settle()
  expect(reactions()).toHaveLength(1)
  expect(reactions()[0]).toContain('Failed tools: Bash.')
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await ui.find({ text: /Ouch\./ })).toBeDefined()
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await $.turn.complete({ ...TURN, turnId: 't2' })
  await clock.settle()
  expect(reactions()).toHaveLength(1)
})

test('subagent turns and a muted buddy stay quiet', async ($, on) => {
  const clock = world(on, { buddy: RECORD })
  engineBelow(on)
  const prompts = model(on, null, 'Ouch.')
  await $.session.start(START)
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await $.turn.complete({ ...TURN, agentId: 'a1' })
  await clock.settle()
  expect(prompts).toHaveLength(0)
  await runner($)('mute')
  await $.turn.complete(TURN)
  await clock.settle()
  expect(prompts).toHaveLength(0)
})

test('tool results pass through unchanged', async ($, on) => {
  world(on, { buddy: RECORD })
  on('tool.call', async (_$, e) =>
    e.tool === 'Bash' && e.command === 'deny' ? { deny: 'not here' } : { isError: true as const, result: 'boom' },
  )
  await $.session.start(START)
  expect(await $.tool.call({ tool: 'Bash', command: 'false' })).toMatchObject({ isError: true, result: 'boom' })
  expect(JSON.stringify(await $.tool.call({ tool: 'Bash', command: 'deny' }))).toContain('not here')
})

test('a prompt addressed to the buddy is answered by it and never reaches Claude', async ($, on) => {
  const clock = world(on, { buddy: RECORD })
  engineBelow(on)
  const prompts = model(on, null, 'Doing great.')
  await $.session.start(START)
  const asked = await $.prompt.submit({ text: 'Pip, how are you?', wait: false, origin: { kind: 'composer' } })
  expect(asked).toEqual({ drop: '(to Pip)' })
  await clock.settle()
  expect(prompts[0]).toContain('how are you?')
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await ui.find({ text: /Doing great\./ })).toBeDefined()
  const passed = await $.prompt.submit({ text: 'Pipeline, run it', wait: false, origin: { kind: 'composer' } })
  expect(passed).toMatchObject({ text: 'Pipeline, run it' })
})

test('when the buddy is off, even its name goes to Claude', async ($, on) => {
  world(on, { buddy: RECORD })
  engineBelow(on)
  await $.session.start(START)
  await runner($)('off')
  const passed = await $.prompt.submit({ text: 'Pip, hi', wait: false, origin: { kind: 'composer' } })
  expect(passed).toMatchObject({ text: 'Pip, hi' })
})
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
MOD="$HOME/.claude/dev-mods/629e9b24-6418-45cd-8de5-a611d13bd535/buddy"
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test "$MOD"
```
Expected:
- FAIL: "a turn with a failed tool gets one reaction" (0 reactions)
- FAIL: "a prompt addressed to the buddy…" (the prompt passes through)
- PASS: "subagent turns…", "tool results pass through…" and "when the buddy is off…" (nothing reacts or intercepts yet)

- [ ] **Step 3: Extend the voice import in `register.tsx`**

Replace the `./voice` import block with:
```tsx
import {
  BUBBLE_TICKS,
  HEART_TICKS,
  HELLO_PROMPT,
  PET_PROMPT,
  REPLY_FLOOR_MS,
  cannedLine,
  cleanSay,
  fallbackSoul,
  hatchRequest,
  matchAddress,
  parseSoul,
  personaSystem,
  reactionPrompt,
  shouldQuip,
  talkPrompt,
} from './voice'
import type { TurnSummary } from './voice'
```

- [ ] **Step 4: Insert the reaction and talk hooks**

In `register.tsx`, insert this block directly above the line `on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {`:
```tsx
  // The current main turn's tool tally; reset when that turn completes.
  let tally: Record<string, number> = {}
  let failedTools: string[] = []

  async function react($: EngineInterface, summary: TurnSummary) {
    const rec = await read($, record)
    if (!rec) return
    const now = await $.clock.now()
    const speak = shouldQuip({
      mode: rec.mode,
      inFlight: inFlight !== null,
      now,
      lastQuipAt: await read($, lastQuipAt),
      summary,
      roll: Math.random(),
    })
    if (!speak) return
    await update($, lastQuipAt, () => now)
    const text = await ask($, rec, rollBones(rec.seed), reactionPrompt(summary), 'react')
    if (text) await showBubble($, text)
  }

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    try {
      tally[e.tool] = (tally[e.tool] ?? 0) + 1
      if (ran.deny === undefined && ran.isError === true) failedTools.push(e.tool)
    } catch {
      // Counting never changes a tool call.
    }
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    try {
      if (e.agentId === undefined) {
        const summary: TurnSummary = { reason: e.reason, durationMs: e.durationMs, tools: tally, failed: failedTools }
        tally = {}
        failedTools = []
        later($, () => react($, summary))
      }
    } catch {
      // A reaction is never worth breaking a turn over.
    }
    return result
  })

  on('prompt.submit', async ($, e, next) => {
    try {
      const rec = await read($, record)
      const fromPerson = e.origin.kind === 'composer' || e.origin.kind === 'bridge'
      const message = rec && rec.mode !== 'off' && fromPerson ? matchAddress(rec.soul.name, e.text) : null
      if (rec && message !== null) {
        later($, () => reply($, rec, talkPrompt(message)))
        return { drop: `(to ${rec.soul.name})` }
      }
    } catch {
      // Fall through: the prompt goes to Claude.
    }
    return next(e)
  })

```

- [ ] **Step 5: Run the tests and validate**

```bash
MOD="$HOME/.claude/dev-mods/629e9b24-6418-45cd-8de5-a611d13bd535/buddy"
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test "$MOD" && "$CC" plugin validate "$MOD"
```
Expected: 42 pass, 0 fail. Validate's `hooks:` line lists `session.start`, `command.run{command=buddy}`, `tool.call`, `turn.complete`, `prompt.submit` and `ui.render{component=AbovePrompt}`.

- [ ] **Step 6: Commit**

```bash
MOD="$HOME/.claude/dev-mods/629e9b24-6418-45cd-8de5-a611d13bd535/buddy"
git -C "$MOD" add -A && git -C "$MOD" commit -q -m "feat: reactions to turns and talking to the buddy by name" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Type-check, see it live, and record what shipped

**Files:**
- Modify: `docs/specs/2026-10-07-buddy-mod-design.md` in the Pell_Skills worktree (status line only)

**Interfaces:**
- Consumes: the finished mod.
- Produces: a verified, loaded mod and an accurate spec status.

- [ ] **Step 1: Type-check**

This fetches TypeScript 5.6 from npm on the first run.

```bash
MOD="$HOME/.claude/dev-mods/629e9b24-6418-45cd-8de5-a611d13bd535/buddy"
ls "$MOD/.claude-plugin/types/claude-code/index.d.ts" && npx -y -p typescript@5.6 tsc -p "$MOD"
```
Expected: no output from `tsc` (exit 0).

If `ls` fails, the engine hasn't laid the types yet because hot reload was declined. In that case, type-check against the skill's copy instead:
```bash
MOD="$HOME/.claude/dev-mods/629e9b24-6418-45cd-8de5-a611d13bd535/buddy"
TYPES="$(ls -d "$(cygpath -u "$LOCALAPPDATA")"/Temp/claude/bundled-skills/*/*/plugin-authoring/types/claude-code.d.ts | sort -V | tail -1)"
TMP="$(mktemp -d)"
cat > "$TMP/tsconfig.json" <<EOF
{ "extends": "$MOD/tsconfig.json", "include": ["$TYPES", "$MOD/hooks", "$MOD/types"] }
EOF
npx -y -p typescript@5.6 tsc -p "$TMP/tsconfig.json"
```
Fix every error, re-run the tests, and commit the fixes in the mod repo as `fix: type errors`.

- [ ] **Step 2: Final full run**

```bash
MOD="$HOME/.claude/dev-mods/629e9b24-6418-45cd-8de5-a611d13bd535/buddy"
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test "$MOD" && "$CC" plugin validate "$MOD" && git -C "$MOD" status --short
```
Expected: 42 pass, 0 fail; validation passes; a clean working tree.

- [ ] **Step 3: See it live in the Desktop Code tab**

With hot reload enabled, the mod is already loaded in the building session. Ask the person to try these and report what they see, since only they can see the band:
1. `/buddy`: the egg wobbles, a buddy hatches, and a hello bubble appears. Check that the sprite lines up; if it doesn't, the desktop's `Code` is drawing a proportional font, which is a real bug to report back.
2. `/buddy pet`: hearts in the hat row, then a reply.
3. `<Name>, how's it going?`: the transcript shows `(to <Name>)` and the bubble answers. No Claude turn starts.
4. `/buddy card`, then `/buddy mute`, `/buddy unmute`, `/buddy off`, `/buddy`.
5. Narrow the window until the band switches to the one-line compact form.

Fix anything that looks wrong with a failing test first, then the fix.

- [ ] **Step 4: Note what the terminal needs**

Tell the person that the `claude` on their PATH is 2.1.263, and mods need 2.1.287 or later in the terminal. Offer to run `claude update`, but don't run it without a yes. After updating, they can try it with:
```bash
claude --plugin-dir "$HOME/.claude/dev-mods/629e9b24-6418-45cd-8de5-a611d13bd535/buddy"
```

- [ ] **Step 5: Offer the permanent install (ask first)**

The dev-mods folder is tied to this session. Offer to:
1. copy the mod, with its git history, to `~/.claude/mods/buddy`
2. add `"CLAUDE_CODE_PLUGIN_DIRS": "~/.claude/mods/buddy"` to the `env` block of `~/.claude/settings.json`

That second step is a change to their global settings, so do both only on an explicit yes. If they agree:
```bash
mkdir -p "$HOME/.claude/mods" && cp -r "$HOME/.claude/dev-mods/629e9b24-6418-45cd-8de5-a611d13bd535/buddy" "$HOME/.claude/mods/buddy"
```
Then edit `~/.claude/settings.json` with the Edit tool. Keep every existing key, and if an `env` block exists, add to it rather than replacing it.

- [ ] **Step 6: Record what shipped in the spec**

In the Pell_Skills worktree, change the spec's status line from `**Status:** approved` to:
```markdown
**Status:** shipped as a personal mod, 2026-10-07. Plan: [`2026-10-07-buddy-mod-plan.md`](2026-10-07-buddy-mod-plan.md); its "Deliberate deviations" section lists six small departures from this spec.
```
Then commit it:
```bash
cd "C:/Users/BrandonF/Desktop/Pell_Repos/Pell_Skills/.claude/worktrees/code-buddy-mods-recreation-57588d"
git add docs/specs/2026-10-07-buddy-mod-design.md && git commit -q -m "docs(specs): mark buddy mod shipped" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
