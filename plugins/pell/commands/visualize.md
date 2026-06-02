---
description: Open and drive the live visual scratchpad — a browser tab that renders whatever Claude writes to it, with click-back events Claude reacts to live by default. Starts a no-install local server (Python stdlib only) on first use.
argument-hint: '"<what to visualize>" | no-watch | watch | stop-watch | stop | clear'
---

You are running **`/pell:visualize`**. Manage the visual scratchpad: a local browser page that live-renders a file Claude writes to, and posts click events back to an inbox Claude reads.

The user passed: `$ARGUMENTS`

## Step 1 — Parse the argument

Recognize these forms (case-insensitive), else treat the whole string as a *description to visualize*:

- empty → **open**: ensure the server is up, print the URL.
- `stop` → kill the server (and any watcher).
- `stop-watch` → stop the watcher only; leave the server running.
- `clear` → blank the scratchpad.
- `no-watch` → run the **open**/**draw** action normally but DO NOT auto-start the watcher this invocation. (Strip the token; the rest of the string is still the description, if any.)
- `watch` → ensure up and (re)arm the watcher explicitly. Watch is on by default, so you only need this to restart it after a `stop-watch`.
- anything else → **draw**: ensure up, compose a fragment for that description, print the URL.

**Watch mode is the default.** For **open** and **draw**, after Step 3 you also start the watcher (Step 4) — unless `no-watch` was passed.

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

- **open** → print: `Visual scratchpad: http://127.0.0.1:<port> — open it in a browser.` Then start watch mode (Step 4) unless `no-watch`.
- **draw** → compose an HTML or Markdown fragment for the description and write it to `~/.claude/pell-visual/scratch.html` (overwrite). Convention: start the content with `<` for HTML (diagrams, SVG, precise layout, interactive buttons); otherwise it renders as Markdown (prose, tables). To collect input, include elements that call `pellSend(...)`, e.g. `<button onclick="pellSend('option-a')">Option A</button>`. Print the URL, then start watch mode (Step 4) unless `no-watch`.
- **clear** → write an empty string to `~/.claude/pell-visual/scratch.html`; print `Scratchpad cleared.` (Does not start the watcher.)
- **stop** → `kill "$(cat ~/.claude/pell-visual/server.pid)" 2>/dev/null` and stop any watcher; print `Visual scratchpad stopped.`

## Step 4 — Watch mode (default)

Runs automatically after **open** and **draw** (suppress with `no-watch`). **Idempotency:** if you already started the inbox watcher earlier this session, do nothing — never run a second one. Otherwise start a **zero-token shell watcher** over the inbox using the Monitor tool (`persistent: true`), streaming new lines:

```bash
tail -n0 -F ~/.claude/pell-visual/inbox.jsonl
```

Each emitted line is a browser event `{"ts":…, "payload":…}`. When a line arrives, parse the payload and react to it in context. The stream stays open and re-arms itself. This blocks in the shell for free — **do not** wrap it in a short-timeout poll loop, and **never** implement watching as a recurring agent, `loop`, or cron (that burns tokens on every tick). Stop on `/pell:visualize stop-watch` or `stop`.

The first time you arm it in a session, tell the user: `Watching the scratchpad inbox — click things in the page and I'll react.` Note that how *immediately* a click lands depends on the harness; clicks always surface at the latest on your next turn via the inbox hook.

## Operator notes

- **Never** expose the server beyond `127.0.0.1`.
- **Never** spawn a second server — always reuse via the pidfile check in Step 2.
- **Never** run a second watcher — at most one inbox watcher per session (Step 4 idempotency).
- The scratchpad is a single global pad shared across repos and sessions; `clear` or a fresh `draw` overwrites it.
- If `python3` is missing, degrade to a terminal explanation — never halt the user's real task.
