---
name: visual-scratchpad
description: Use when about to explain something inherently visual — architecture or data-flow diagrams, state machines, geometry or layout, before/after comparisons, tree or graph structures, timelines, or table-heavy comparisons — and a rendered view in a browser would communicate it better than terminal prose. Also use when soliciting a choice that's clearer as clickable options than as text.
---

# Visual Scratchpad

Render the concept to a live browser pad instead of (or alongside) explaining it in text.

## How to use it

1. **Ensure the server is up.** Check `~/.claude/pell-visual/server.pid`; if it names no live process, start the bundled server in the background (Bash tool, `run_in_background`):

   ```bash
   python3 "${CLAUDE_PLUGIN_ROOT}/skills/visual-scratchpad/server.py" >/dev/null 2>&1
   ```

   Then read `~/.claude/pell-visual/server.port` for the bound port. If `python3` is unavailable, skip the canvas and explain in the terminal — never block the task.

2. **Write the fragment** to `~/.claude/pell-visual/scratch.html` (overwrite). Choose the format by leading character:
   - Start with `<` → rendered as **HTML** (use for SVG/diagrams, precise layout, color, interactive buttons).
   - Otherwise → rendered as **Markdown** (use for prose and tables).

3. **Mention the URL once** per session: `http://127.0.0.1:<port>`.

4. **Start watch mode** (default). If you have NOT already started the inbox watcher this session, start a zero-token shell watcher via the Monitor tool (`persistent: true`), streaming new lines so each click reacts in near-real-time:

   ```bash
   tail -n0 -F ~/.claude/pell-visual/inbox.jsonl
   ```

   Each line is a browser event `{"ts":…, "payload":…}` — parse the payload and react. **At most one watcher per session** — if one is already running, skip this step. Never poll with a recurring agent, `loop`, or cron.

## Collecting input

To get a choice back, include interactive HTML that calls `pellSend(...)`:

```html
<button onclick="pellSend('variant-2')">Variant 2</button>
```

With watch mode on (step 4), clicks react in near-real-time. They also always surface on the user's next turn via the plugin's UserPromptSubmit hook, so nothing is lost even if the watcher isn't running.

## Boundaries

- One global pad — a new write overwrites the last.
- Loopback only; the content you write is trusted and rendered as-is.
- Don't poll the inbox with a recurring agent or timer — that wastes tokens. Watching is a shell `tail -F` streamed via Monitor; zero cost while idle, one watcher per session. The user can stop it with `/pell:visualize stop-watch`.
