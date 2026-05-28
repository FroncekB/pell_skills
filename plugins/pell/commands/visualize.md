---
description: Open and drive the live visual scratchpad — a browser tab that renders whatever Claude writes to it, with click-back events. Starts a zero-dependency local server on first use.
argument-hint: '"<what to visualize>" | watch | stop-watch | stop | clear'
---

You are running **`/pell:visualize`**. Manage the visual scratchpad: a local browser page that live-renders a file Claude writes to, and posts click events back to an inbox Claude reads.

The user passed: `$ARGUMENTS`

## Step 1 — Parse the argument

Recognize these forms (case-insensitive), else treat the whole string as a *description to visualize*:

- empty → **open**: ensure the server is up, print the URL.
- `stop` → kill the server (and any watcher).
- `stop-watch` → stop the watcher only; leave the server running.
- `clear` → blank the scratchpad.
- `watch` → ensure up, then start the inbox watcher (Step 4).
- anything else → **draw**: ensure up, compose a fragment for that description, print the URL.

## Step 2 — Ensure the server is running

The server lives at `${CLAUDE_PLUGIN_ROOT}/skills/visual-scratchpad/server.py`; transient state is in `~/.claude/pell-visual/`.

Run this check via the Bash tool:

```bash
PV=~/.claude/pell-visual
if [ -f "$PV/server.pid" ] && kill -0 "$(cat "$PV/server.pid")" 2>/dev/null; then
  echo "running on http://127.0.0.1:$(cat "$PV/server.port" 2>/dev/null || echo 7654)"
else
  echo "not running"
fi
```

- If it prints `running on <url>` → reuse that URL.
- If it prints `not running`:
  - If `python3` is unavailable (`command -v python3` is empty) → **degrade**: tell the user the canvas needs `python3`, skip it, and (for a *draw* request) describe the concept in the terminal instead. Do not error out.
  - Otherwise start it in the background (do NOT block on it):

    ```bash
    python3 "${CLAUDE_PLUGIN_ROOT}/skills/visual-scratchpad/server.py" >/dev/null 2>&1
    ```

    Launch this with the Bash tool's `run_in_background` option. Then read `~/.claude/pell-visual/server.port` to learn the bound port and form `http://127.0.0.1:<port>`.

## Step 3 — Act on the parsed form

- **open** → print: `Visual scratchpad: http://127.0.0.1:<port> — open it in a browser.`
- **draw** → compose an HTML or Markdown fragment for the description and write it to `~/.claude/pell-visual/scratch.html` (overwrite). Convention: start the content with `<` for HTML (diagrams, SVG, precise layout, interactive buttons); otherwise it renders as Markdown (prose, tables). To collect input, include elements that call `pellSend(...)`, e.g. `<button onclick="pellSend('option-a')">Option A</button>`. Then print the URL.
- **clear** → write an empty string to `~/.claude/pell-visual/scratch.html`; print `Scratchpad cleared.`
- **stop** → `kill "$(cat ~/.claude/pell-visual/server.pid)" 2>/dev/null` and stop any watcher; print `Visual scratchpad stopped.`

## Step 4 — Watch mode (only on `watch`)

Start a **zero-token shell watcher** over the inbox using the Monitor tool, streaming new lines:

```bash
tail -n0 -F ~/.claude/pell-visual/inbox.jsonl
```

Each emitted line is a browser event `{"ts":…, "payload":…}`. When a line arrives, parse the payload and react to it in context. Re-arm by continuing to stream. This blocks in the shell for free — **do not** wrap it in a short-timeout poll loop, and **never** implement watching as a recurring agent, `loop`, or cron (that burns tokens on every tick). Stop on `/pell:visualize stop-watch` or `stop`.

Tell the user: `Watching the scratchpad inbox — click things in the page and I'll react.` Note that how *immediately* a click lands depends on the harness; clicks always surface at the latest on your next turn via the inbox hook.

## Operator notes

- **Never** expose the server beyond `127.0.0.1`.
- **Never** spawn a second server — always reuse via the pidfile check in Step 2.
- The scratchpad is a single global pad shared across repos and sessions; `clear` or a fresh `draw` overwrites it.
- If `python3` is missing, degrade to a terminal explanation — never halt the user's real task.
