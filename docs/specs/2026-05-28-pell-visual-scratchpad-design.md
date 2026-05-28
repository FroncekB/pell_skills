# `/pell:visualize` + `pell:visual-scratchpad` — Design Spec

**Status:** approved
**Author:** Brandon Froncek + Claude
**Date:** 2026-05-28
**Parent spec:** [`2026-05-27-pell-skills-architecture.md`](2026-05-27-pell-skills-architecture.md)

## Purpose

A live visual scratchpad — a "second screen" any Claude Code session can draw to. A tiny zero-dependency local server watches one file and renders it in a browser tab, live-updating via Server-Sent Events. Claude writes to that file to show concepts that are clearer seen than read: architecture and data-flow diagrams, state machines, geometry/layout, before/after comparisons, trees and graphs, timelines, table-heavy comparisons.

It is also **bidirectional**: the page can send events back (button clicks, form input) to an inbox file, which Claude picks up on its next turn. This turns the scratchpad into an input device — a richer `AskUserQuestion` where Claude renders clickable options or a form and reads back the user's choice.

Two surfaces, one shared engine:

- **`/pell:visualize`** (command) — the explicit "open / draw / control the window" action.
- **`pell:visual-scratchpad`** (auto-invoked skill) — fires when Claude is about to explain something inherently visual, ensures the server is up, and pushes a fragment.

## 1. Interaction tiers

The feature is layered. The output direction always works; the input direction has a cheap default and an opt-in live mode.

|-|-|-|
| Tier | Direction | Mechanism |
| **Output** | Claude → browser | Write `scratch.html`; server SSE-pushes; page renders. Always on. |
| **Passive inbox** (default) | browser → Claude | Click → `POST /event` → append `inbox.jsonl`. A `UserPromptSubmit` hook surfaces unconsumed events on Claude's next typed turn. Zero background cost. |
| **Watch mode** (opt-in) | browser → Claude | Claude launches a **shell** watcher (`tail -F` on `inbox.jsonl` via the Monitor tool). Shell blocks for free; each real event notifies Claude → one bounded turn → re-arm. Zero token cost while idle. |

**Token discipline (non-negotiable):** the input watcher is plain shell, never a recurring LLM agent, `loop`, or cron timer. Claude is invoked only when a real event lands. The watcher blocks indefinitely — **no short timeouts that cause periodic empty wake-ups**. Passive tier spawns no background process at all.

## 2. Components

All code is bundled in the plugin; transient state lives outside the repo.

### 2.1 Bundled in `plugins/pell/`

|-|-|
| File | Responsibility |
| `skills/visual-scratchpad/server.py` | Zero-dep Python stdlib server. Serves the viewer + vendored JS, holds SSE connections (output), accepts `POST /event` (input), watches the content file. Binds `127.0.0.1` only. |
| `skills/visual-scratchpad/viewer.html` | The page. `EventSource` for live render with HTML/Markdown auto-detect; exposes `window.pellSend(payload)`. |
| `skills/visual-scratchpad/marked.min.js` | Vendored Markdown renderer (MIT), served locally — no CDN / internet dependency. |
| `skills/visual-scratchpad/inbox-check.py` | The `UserPromptSubmit` hook script. Surfaces unconsumed inbox events, then marks them consumed. Silent no-op when the inbox is empty or absent. |
| `skills/visual-scratchpad/SKILL.md` | The auto-invoked skill. |
| `commands/visualize.md` | The explicit command. |
| plugin hook registration | Registers `inbox-check.py` as a `UserPromptSubmit` hook (format confirmed at implementation — see §10). |

### 2.2 Transient state in `~/.claude/pell-visual/`

|-|-|
| Path | Purpose |
| `scratch.html` | The one watched file. Claude → browser. |
| `inbox.jsonl` | Append-only event log. Browser → Claude. |
| `inbox.offset` | Byte offset of the last event the hook consumed. |
| `server.pid` | Idempotent start/stop. |
| `server.port` | The port the running server actually bound (default 7654; see §3.2). |

A single **global** pad, not per-repo — keeps repos clean and survives across sessions and projects.

## 3. The server (`server.py`)

Zero third-party dependencies. `ThreadingHTTPServer` so long-lived SSE connections don't block `POST`s. Bound to `127.0.0.1` exclusively.

### 3.1 Routes

|-|-|
| Route | Behavior |
| `GET /` | Serve `viewer.html`. |
| `GET /marked.min.js` | Serve the vendored renderer. |
| `GET /stream` | SSE. **On connect, immediately push the current `scratch.html`** so a fresh tab isn't blank. Then poll the file's mtime every ~250 ms; on change, read and push. |
| `POST /event` | Read JSON body, append one line `{"ts": <epoch>, "payload": <body>}` to `inbox.jsonl`. Respond `204`. |

### 3.2 Port selection

Default `7654`. On start: if `server.pid` names a live process and the port answers, **reuse it** (don't spawn a duplicate). Otherwise clear the stale pidfile and bind `7654`; if `7654` is taken by something that isn't ours, try `7655…7664` and record the chosen port in `server.port`. Callers read `server.port` to print the correct URL.

### 3.3 SSE encoding

Content is multi-line. Encode **one `data:` line per source line**, terminated by a blank line; the browser rejoins with `\n`. This keeps arbitrary HTML/Markdown intact across the wire.

### 3.4 Lifecycle

Writes `server.pid` + `server.port` on start; removes them on clean exit. Launched via `run_in_background`; runs until `stop` (§5) or the machine reboots. Lightweight enough to leave running.

## 4. The viewer (`viewer.html`)

Minimal, self-contained page:

- A single content container, readable typography, sensible max-width, light/dark aware.
- `const es = new EventSource('/stream'); es.onmessage = e => render(e.data);`
- **`render(text)` auto-detect:** if the first non-whitespace character is `<` → treat as HTML (`container.innerHTML = text`); otherwise → `container.innerHTML = marked.parse(text)`. The skill documents this convention so Claude writes accordingly (HTML for diagrams/SVG/precise layout, Markdown for prose + tables).
- **`window.pellSend(payload)`** → `fetch('/event', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)})`. Claude writes interactive HTML that calls it, e.g. `<button onclick="pellSend('variant-2')">Option B</button>` or a form whose submit handler calls `pellSend({...})`.
- A small connection-status indicator (optional).

## 5. `/pell:visualize` behavior

Freeform-first per Pell convention. Recognized forms:

|-|-|
| Invocation | Action |
| `/pell:visualize` | Ensure server up; print the URL. |
| `/pell:visualize "<description>"` | Ensure up; Claude composes a fragment visualizing the description, writes `scratch.html`; print the URL. |
| `/pell:visualize watch` | Ensure up; launch the shell watcher (Tier 3). |
| `/pell:visualize stop-watch` | Stop the watcher (leave server running). |
| `/pell:visualize stop` | Stop the watcher and kill the server via `server.pid`. |
| `/pell:visualize clear` | Blank `scratch.html`. |

Anything else in `$ARGUMENTS` is freeform context for the fragment Claude composes.

## 6. `pell:visual-scratchpad` skill

**Trigger (description):** fires when Claude is about to explain something inherently visual — architecture / data flow, state machines, geometry / layout, before-after comparisons, tree / graph structures, timelines, table-heavy comparisons — and a rendered view would communicate better than terminal prose.

**Body (lean, per skill conventions):**
1. Ensure the server is running (start `server.py` in the background from the skill's bundled path if not).
2. Write the HTML/Markdown fragment to `scratch.html`.
3. Mention the URL once per session.
4. Documents the HTML-vs-Markdown auto-detect convention (§4) and the `pellSend` interaction convention — so when Claude wants input, it renders interactive elements rather than asking in text.

## 7. Asset path resolution

Both surfaces need to locate the bundled `server.py` / `viewer.html` at runtime.

- **Skill:** uses the base directory the harness injects when the skill loads.
- **Command:** uses `$CLAUDE_PLUGIN_ROOT`.
- **Fallback** (if either is unavailable): copy assets into `~/.claude/pell-visual/` on first run and launch from there.

The server serves `viewer.html` / `marked.min.js` from its own directory and watches the content file in `~/.claude/pell-visual/`, so the two locations stay decoupled.

## 8. Security

- **Loopback only.** The server binds `127.0.0.1` and is never exposed to the network. No auth needed — only the local user reaches it.
- **Content is trusted — `innerHTML` is intentional, not a bug.** The author of `scratch.html` is Claude; the audience is the same local user; there is no untrusted-input → render path (the inbox flows the *other* way and is consumed as JSON by the hook, never rendered as HTML). `innerHTML` does not execute `<script>` tags, and the inline `onclick` handlers it *does* wire up are exactly how `pellSend` interactivity works. **An HTML sanitizer (e.g. DOMPurify) is deliberately NOT used**: it would strip those inline handlers and break the bidirectional feature, while defending against a threat (untrusted content injection) that does not exist in this loopback-only, single-author model. If a future version ever renders third-party content, this decision must be revisited.
- **Inbox is local data.** `inbox.jsonl` holds only what the page posts. The hook treats payloads as user-supplied context, consistent with how Claude Code treats `UserPromptSubmit` hook output.

## 9. Error handling & degradation (notify-don't-block)

|-|-|
| Situation | Behavior |
| `python3` missing | Fall back to `node` (also stdlib-only via `node:http`). |
| Both runtimes missing | Skip the visual; explain in the terminal instead. Never halt the real work. |
| Port range exhausted | Report it; continue without the canvas. |
| Server already running | Reuse it (pidfile + port check); never spawn a duplicate. |
| `scratch.html` write fails | Surface the error; the rest of the turn proceeds. |
| Browser can't auto-open | Expected — we only print the URL (WSL makes auto-open unreliable). |

## 10. Items to verify at implementation (not guessed)

1. **Plugin-shipped `UserPromptSubmit` hook:** exact config location/format for a plugin to register a hook, and how the hook injects context (stdout vs. `hookSpecificOutput.additionalContext` JSON).
2. **Asset paths:** confirm `$CLAUDE_PLUGIN_ROOT` is present in command context and the skill base-dir injection; otherwise use the §7 copy-on-first-run fallback.
3. **Watch-mode immediacy:** whether a completed `run_in_background` task / Monitor stream wakes a fully idle session immediately or surfaces on the next turn. Watch mode is token-safe either way; this only affects how instant the reaction feels.
4. **Monitor tool usage:** confirm the exact invocation for streaming `tail -F inbox.jsonl` so each new line notifies Claude.

## 11. Out of scope (v1)

- **Multiple / per-project pads** — one global pad only. Multi-pad routing is a future concern.
- **Auto-opening the browser** — we print the URL; the user opens it.
- **Authentication / network exposure** — loopback only, by design.
- **Instant reaction to a click while Claude is fully idle** — clicks surface on the next turn (passive) or via the opt-in watcher (best-effort immediacy pending §10.3). Not a guaranteed real-time wake.
- **A component framework or persistent canvas history** — the pad shows the latest fragment; Claude authors raw HTML/Markdown. No widget library, no scrollback.
- **Recurring LLM polling of any kind** — explicitly forbidden for cost reasons (§1).
