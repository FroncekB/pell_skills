---
name: visual-scratchpad
description: Use when about to explain something inherently visual — architecture or data-flow diagrams, state machines, geometry or layout, before/after comparisons, tree or graph structures, timelines, or table-heavy comparisons — and a rendered view in a browser would communicate it better than terminal prose. Also use when soliciting a choice that's clearer as clickable options than as text.
---

# Visual Scratchpad

Render the concept to a live browser pad instead of (or alongside) explaining it in text.

## How to use it

1. **Ensure the server is up.** Check `~/.claude/pell-visual/server.pid`; if it names no live process, start the bundled server in the background (Bash tool, `run_in_background`):

   ```bash
   python3 "${CLAUDE_SKILL_DIR}/server.py" >/dev/null 2>&1
   ```

   Then read `~/.claude/pell-visual/server.port` for the bound port. If `python3` is unavailable, skip the canvas and explain in the terminal — never block the task.

2. **Write the fragment** to `~/.claude/pell-visual/scratch.html` (overwrite). Choose the format by leading character:
   - Start with `<` → rendered as **HTML** (use for SVG/diagrams, precise layout, color, interactive buttons).
   - Otherwise → rendered as **Markdown** (use for prose and tables).

3. **Mention the URL once** per session: `http://127.0.0.1:<port>`.

## Collecting input

To get a choice back, include interactive HTML that calls `pellSend(...)`:

```html
<button onclick="pellSend('variant-2')">Variant 2</button>
```

Clicks land in the inbox and surface on the user's next turn (the plugin's UserPromptSubmit hook). For near-real-time reaction, the user can run `/pell:visualize watch`.

## Boundaries

- One global pad — a new write overwrites the last.
- Loopback only; the content you write is trusted and rendered as-is.
- Don't poll the inbox with a recurring agent or timer — that wastes tokens. Watching is a shell `tail -F`, owned by `/pell:visualize watch`.
