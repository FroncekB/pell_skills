# Visual Scratchpad Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a live visual scratchpad — a zero-dependency local server + browser viewer that Claude writes to, with a bidirectional event inbox — as the `/pell:visualize` command and the auto-invoked `pell:visual-scratchpad` skill.

**Architecture:** A Python stdlib HTTP server (`server.py`) serves a viewer page and live-pushes a watched content file (`~/.claude/pell-visual/scratch.html`) over SSE. The page auto-detects HTML vs Markdown and renders it; it also exposes `window.pellSend()` which POSTs events to an inbox file. A plugin-shipped `UserPromptSubmit` hook (`inbox_check.py`) surfaces unconsumed inbox events to Claude on its next turn (passive tier); a `watch` mode lets Claude tail the inbox via a zero-token shell watcher (active tier).

**Tech Stack:** Python 3 stdlib only (`http.server`, `socket`, `json`), vanilla HTML/JS, vendored `marked.min.js` (MIT), Claude Code plugin hooks. No third-party Python/Node packages.

**Spec:** [`2026-05-28-pell-visual-scratchpad-design.md`](2026-05-28-pell-visual-scratchpad-design.md)

---

## File Structure

| File | Responsibility |
|-|-|
| `plugins/pell/skills/visual-scratchpad/server.py` | Zero-dep server: serves viewer + JS, SSE push of `scratch.html`, `POST /event` → inbox, port selection, pidfile. |
| `plugins/pell/skills/visual-scratchpad/viewer.html` | The page: `EventSource` live render w/ HTML/Markdown auto-detect; `window.pellSend()`. |
| `plugins/pell/skills/visual-scratchpad/marked.min.js` | Vendored Markdown renderer (MIT), served locally. |
| `plugins/pell/skills/visual-scratchpad/inbox_check.py` | `UserPromptSubmit` hook script: surface unconsumed events, advance offset, silent no-op otherwise. |
| `plugins/pell/skills/visual-scratchpad/test_server.py` | Unit tests for `sse_encode`. |
| `plugins/pell/skills/visual-scratchpad/test_inbox_check.py` | Unit tests for `read_new_events` / `format_context`. |
| `plugins/pell/skills/visual-scratchpad/SKILL.md` | The auto-invoked skill body. |
| `plugins/pell/commands/visualize.md` | The `/pell:visualize` command body. |
| `plugins/pell/hooks/hooks.json` | Registers the `UserPromptSubmit` hook. |
| `plugins/pell/.claude-plugin/plugin.json` | Version bump 0.9.0 → 0.10.0. |
| `README.md` | New docs section. |

**Transient state** (created at runtime, never committed): `~/.claude/pell-visual/{scratch.html,inbox.jsonl,inbox.offset,server.pid,server.port}`.

**Test runner:** unit tests are co-located with the scripts (clean imports). Run from the skill dir:
```bash
cd plugins/pell/skills/visual-scratchpad && python3 -m unittest test_server test_inbox_check -v
```

**Scope note — one narrowing of the spec:** spec §9 lists a Node fallback if `python3` is missing. This plan does **not** implement a parallel `server.js` (it would double the engine for a case that won't hit on a machine that already has `/usr/bin/python3`). Degradation is **python3-or-terminal**: if `python3` is absent, the command/skill skips the canvas and explains in the terminal. Flag at execution handoff.

---

### Task 1: Scaffold skill dir + vendor marked.min.js

**Files:**
- Create: `plugins/pell/skills/visual-scratchpad/` (directory)
- Create: `plugins/pell/skills/visual-scratchpad/marked.min.js`

- [ ] **Step 1: Create the skill directory**

```bash
mkdir -p plugins/pell/skills/visual-scratchpad
```

- [ ] **Step 2: Vendor marked.min.js (MIT, pinned)**

```bash
curl -fsSL https://cdn.jsdelivr.net/npm/marked@12.0.0/marked.min.js \
  -o plugins/pell/skills/visual-scratchpad/marked.min.js
```

- [ ] **Step 3: Verify the asset downloaded and is JS, not an error page**

```bash
wc -c plugins/pell/skills/visual-scratchpad/marked.min.js   # expect > 20000
head -c 60 plugins/pell/skills/visual-scratchpad/marked.min.js
```
Expected: byte count in the tens of thousands; the head shows minified JS (e.g. `(function(){...` or a license comment `/*! marked...`). If the file is small or HTML, the download failed — stop and resolve network access before continuing.

- [ ] **Step 4: Validate the plugin**

Run: `claude plugin validate ./plugins/pell`
Expected: exits 0 (a skill dir with no SKILL.md yet is fine; validate checks declared components — the new dir has none until Task 7).

- [ ] **Step 5: Commit**

```bash
git add plugins/pell/skills/visual-scratchpad/marked.min.js
git commit -m "$(cat <<'EOF'
feat(visual-scratchpad): scaffold skill dir, vendor marked.min.js

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: server.py — SSE engine + HTTP server

**Files:**
- Create: `plugins/pell/skills/visual-scratchpad/test_server.py`
- Create: `plugins/pell/skills/visual-scratchpad/server.py`

- [ ] **Step 1: Write the failing test for `sse_encode`**

Create `plugins/pell/skills/visual-scratchpad/test_server.py`:

```python
import unittest

import server


class SseEncodeTest(unittest.TestCase):
    def test_single_line(self):
        self.assertEqual(server.sse_encode("hi"), "data: hi\n\n")

    def test_multi_line(self):
        self.assertEqual(server.sse_encode("a\nb"), "data: a\ndata: b\n\n")

    def test_empty(self):
        self.assertEqual(server.sse_encode(""), "data: \n\n")

    def test_trailing_newline(self):
        self.assertEqual(server.sse_encode("x\n"), "data: x\ndata: \n\n")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd plugins/pell/skills/visual-scratchpad && python3 -m unittest test_server -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'server'`.

- [ ] **Step 3: Implement server.py**

Create `plugins/pell/skills/visual-scratchpad/server.py`:

```python
#!/usr/bin/env python3
"""Zero-dependency local server for the pell visual scratchpad.

Serves the viewer page, live-pushes the watched content file over SSE, and
accepts browser->Claude events via POST /event. Binds 127.0.0.1 only.
"""
import argparse
import json
import os
import socket
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ASSETS_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_STATE = os.path.expanduser("~/.claude/pell-visual")


def sse_encode(text):
    """Encode text as one SSE message: a data: line per source line."""
    lines = text.split("\n")
    return "".join("data: " + line + "\n" for line in lines) + "\n"


def read_text(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        return ""


def pick_port(preferred, span=10):
    for port in range(preferred, preferred + span):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise SystemExit("No free port in %d-%d" % (preferred, preferred + span - 1))


class Handler(BaseHTTPRequestHandler):
    content_path = ""
    inbox_path = ""

    def log_message(self, *args):
        pass

    def _serve_file(self, rel, ctype):
        try:
            with open(os.path.join(ASSETS_DIR, rel), "rb") as f:
                body = f.read()
        except FileNotFoundError:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            self._serve_file("viewer.html", "text/html; charset=utf-8")
        elif self.path == "/marked.min.js":
            self._serve_file("marked.min.js", "text/javascript; charset=utf-8")
        elif self.path == "/stream":
            self._stream()
        else:
            self.send_error(404)

    def _stream(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.end_headers()
        last_sent = None
        last_mtime = None
        last_ping = time.time()
        try:
            content = read_text(self.content_path)
            self.wfile.write(sse_encode(content).encode("utf-8"))
            self.wfile.flush()
            last_sent = content
            while True:
                time.sleep(0.25)
                try:
                    mtime = os.path.getmtime(self.content_path)
                except FileNotFoundError:
                    mtime = None
                if mtime != last_mtime:
                    last_mtime = mtime
                    content = read_text(self.content_path)
                    if content != last_sent:
                        self.wfile.write(sse_encode(content).encode("utf-8"))
                        self.wfile.flush()
                        last_sent = content
                if time.time() - last_ping > 15:
                    self.wfile.write(b": keepalive\n\n")
                    self.wfile.flush()
                    last_ping = time.time()
        except (BrokenPipeError, ConnectionResetError):
            return

    def do_POST(self):
        if self.path != "/event":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length).decode("utf-8") if length else ""
        try:
            payload = json.loads(raw)
        except (json.JSONDecodeError, ValueError):
            payload = raw
        line = json.dumps({"ts": time.time(), "payload": payload})
        with open(self.inbox_path, "a", encoding="utf-8") as f:
            f.write(line + "\n")
        self.send_response(204)
        self.end_headers()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=7654)
    ap.add_argument("--state-dir", default=DEFAULT_STATE)
    args = ap.parse_args()

    os.makedirs(args.state_dir, exist_ok=True)
    content_path = os.path.join(args.state_dir, "scratch.html")
    inbox_path = os.path.join(args.state_dir, "inbox.jsonl")
    pid_path = os.path.join(args.state_dir, "server.pid")
    port_path = os.path.join(args.state_dir, "server.port")
    if not os.path.exists(content_path):
        with open(content_path, "w", encoding="utf-8") as f:
            f.write("")

    port = pick_port(args.port)
    Handler.content_path = content_path
    Handler.inbox_path = inbox_path

    httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    with open(pid_path, "w") as f:
        f.write(str(os.getpid()))
    with open(port_path, "w") as f:
        f.write(str(port))
    sys.stderr.write("pell-visual server on http://127.0.0.1:%d\n" % port)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        for p in (pid_path, port_path):
            try:
                os.remove(p)
            except FileNotFoundError:
                pass


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `cd plugins/pell/skills/visual-scratchpad && python3 -m unittest test_server -v`
Expected: 4 tests PASS.

- [ ] **Step 5: Integration smoke — start the server and exercise every route**

```bash
python3 plugins/pell/skills/visual-scratchpad/server.py --port 7654 --state-dir /tmp/pv-test &
SRV=$!
sleep 1
curl -s http://127.0.0.1:7654/ | head -c 40                       # expect <!doctype html
curl -s http://127.0.0.1:7654/marked.min.js | head -c 20          # expect JS
curl -s -X POST http://127.0.0.1:7654/event \
  -H 'Content-Type: application/json' -d '{"click":"ok"}' -w '%{http_code}\n'  # expect 204
cat /tmp/pv-test/inbox.jsonl                                       # expect one line w/ payload {"click":"ok"}
echo '<h1>live</h1>' > /tmp/pv-test/scratch.html
timeout 2 curl -sN http://127.0.0.1:7654/stream | head -5         # expect data: <h1>live</h1>
kill $SRV; rm -rf /tmp/pv-test
```
Expected: HTML served, JS served, POST returns 204 and appends to inbox, SSE stream emits `data:` lines including the written content.

- [ ] **Step 6: Validate + commit**

```bash
claude plugin validate ./plugins/pell
git add plugins/pell/skills/visual-scratchpad/server.py plugins/pell/skills/visual-scratchpad/test_server.py
git commit -m "$(cat <<'EOF'
feat(visual-scratchpad): zero-dep SSE server with event inbox

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: viewer.html — live render + pellSend

**Files:**
- Create: `plugins/pell/skills/visual-scratchpad/viewer.html`

- [ ] **Step 1: Write viewer.html**

Create `plugins/pell/skills/visual-scratchpad/viewer.html`:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>pell visual scratchpad</title>
<script src="/marked.min.js"></script>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; font: 15px/1.6 -apple-system, system-ui, sans-serif;
         background: Canvas; color: CanvasText; }
  #bar { position: fixed; top: 8px; right: 12px; font-size: 12px; opacity: .6; }
  #dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%;
         background: #c33; vertical-align: middle; margin-right: 5px; }
  #dot.on { background: #3a3; }
  #view { max-width: 900px; margin: 0 auto; padding: 32px 24px 80px; }
  #view table { border-collapse: collapse; }
  #view th, #view td { border: 1px solid #8884; padding: 4px 10px; }
  #view pre { background: #8881; padding: 12px; border-radius: 6px; overflow: auto; }
  #view button { font: inherit; padding: 6px 14px; margin: 4px 6px 4px 0;
                 border-radius: 6px; border: 1px solid #8886; cursor: pointer; }
</style>
</head>
<body>
<div id="bar"><span id="dot"></span><span id="status">connecting…</span></div>
<div id="view"></div>
<script>
  const view = document.getElementById("view");
  const dot = document.getElementById("dot");
  const status = document.getElementById("status");

  function render(text) {
    if (text.trimStart().startsWith("<")) {
      view.innerHTML = text;
    } else {
      view.innerHTML = window.marked ? marked.parse(text) : text;
    }
  }

  window.pellSend = function (payload) {
    return fetch("/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  };

  const es = new EventSource("/stream");
  es.onopen = () => { dot.classList.add("on"); status.textContent = "live"; };
  es.onerror = () => { dot.classList.remove("on"); status.textContent = "reconnecting…"; };
  es.onmessage = (e) => render(e.data);
</script>
</body>
</html>
```

- [ ] **Step 2: Manual browser smoke (the gate for this task)**

```bash
python3 plugins/pell/skills/visual-scratchpad/server.py --state-dir ~/.claude/pell-visual &
```
Open `http://127.0.0.1:7654` in a browser (status dot should turn green / "live"), then run each line and watch the tab update with no reload:

```bash
echo '<h1 style="color:teal">HTML works</h1><svg width=80 height=80><circle cx=40 cy=40 r=30 fill=coral/></svg>' > ~/.claude/pell-visual/scratch.html
printf '## Markdown works\n\n| a | b |\n|-|-|\n| 1 | 2 |\n' > ~/.claude/pell-visual/scratch.html
echo '<button onclick="pellSend({choice:1})">Click me</button>' > ~/.claude/pell-visual/scratch.html
```
After clicking the button: `cat ~/.claude/pell-visual/inbox.jsonl` shows a line with `"payload": {"choice": 1}`. Confirm: HTML renders raw, Markdown renders as a table, the SVG draws, and the button POSTs. Then `kill %1` (or the server PID).

- [ ] **Step 3: Validate + commit**

```bash
claude plugin validate ./plugins/pell
git add plugins/pell/skills/visual-scratchpad/viewer.html
git commit -m "$(cat <<'EOF'
feat(visual-scratchpad): viewer page with HTML/Markdown auto-detect and pellSend

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: inbox_check.py — UserPromptSubmit hook script

**Files:**
- Create: `plugins/pell/skills/visual-scratchpad/test_inbox_check.py`
- Create: `plugins/pell/skills/visual-scratchpad/inbox_check.py`

- [ ] **Step 1: Write the failing tests**

Create `plugins/pell/skills/visual-scratchpad/test_inbox_check.py`:

```python
import os
import tempfile
import unittest

import inbox_check


class ReadNewEventsTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.inbox = os.path.join(self.dir, "inbox.jsonl")

    def _write(self, text):
        with open(self.inbox, "w", encoding="utf-8") as f:
            f.write(text)

    def test_missing_file(self):
        events, off = inbox_check.read_new_events(self.inbox, 0)
        self.assertEqual(events, [])
        self.assertEqual(off, 0)

    def test_two_events_from_zero(self):
        self._write('{"payload": "a"}\n{"payload": "b"}\n')
        events, off = inbox_check.read_new_events(self.inbox, 0)
        self.assertEqual([e["payload"] for e in events], ["a", "b"])
        self.assertEqual(off, os.path.getsize(self.inbox))

    def test_offset_at_eof_returns_nothing(self):
        self._write('{"payload": "a"}\n')
        size = os.path.getsize(self.inbox)
        events, off = inbox_check.read_new_events(self.inbox, size)
        self.assertEqual(events, [])
        self.assertEqual(off, size)

    def test_malformed_line_wrapped(self):
        self._write("not json\n")
        events, _ = inbox_check.read_new_events(self.inbox, 0)
        self.assertEqual(events, [{"payload": "not json"}])

    def test_truncation_resets(self):
        self._write('{"payload": "a"}\n')
        events, off = inbox_check.read_new_events(self.inbox, 9999)
        self.assertEqual([e["payload"] for e in events], ["a"])
        self.assertEqual(off, os.path.getsize(self.inbox))


class FormatContextTest(unittest.TestCase):
    def test_lists_payloads(self):
        out = inbox_check.format_context([{"payload": "x"}, {"payload": {"k": 1}}])
        self.assertIn("visual scratchpad", out)
        self.assertIn('"x"', out)
        self.assertIn('"k": 1', out)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run to verify failure**

Run: `cd plugins/pell/skills/visual-scratchpad && python3 -m unittest test_inbox_check -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'inbox_check'`.

- [ ] **Step 3: Implement inbox_check.py**

Create `plugins/pell/skills/visual-scratchpad/inbox_check.py`:

```python
#!/usr/bin/env python3
"""UserPromptSubmit hook: surface unconsumed visual-scratchpad events.

Silent no-op when the inbox is absent or has no new events. Otherwise emits a
UserPromptSubmit additionalContext JSON envelope and advances the consume offset.
"""
import json
import os
import sys

STATE = os.path.expanduser("~/.claude/pell-visual")
INBOX = os.path.join(STATE, "inbox.jsonl")
OFFSET = os.path.join(STATE, "inbox.offset")


def read_offset():
    try:
        with open(OFFSET) as f:
            return int(f.read().strip() or "0")
    except (FileNotFoundError, ValueError):
        return 0


def read_new_events(inbox_path, offset):
    """Return (events, new_offset) for inbox bytes past offset."""
    try:
        size = os.path.getsize(inbox_path)
    except FileNotFoundError:
        return [], offset
    if offset > size:  # inbox truncated/rotated since last read
        offset = 0
    if offset == size:
        return [], offset
    with open(inbox_path, "rb") as f:
        f.seek(offset)
        chunk = f.read()
    new_offset = offset + len(chunk)
    events = []
    for line in chunk.decode("utf-8", "replace").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            events.append({"payload": line})
    return events, new_offset


def format_context(events):
    parts = ["The user interacted with the visual scratchpad since the last turn:"]
    for ev in events:
        parts.append("- " + json.dumps(ev.get("payload", ev)))
    return "\n".join(parts)


def main():
    events, new_offset = read_new_events(INBOX, read_offset())
    if not events:
        return
    os.makedirs(STATE, exist_ok=True)
    with open(OFFSET, "w") as f:
        f.write(str(new_offset))
    out = {
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": format_context(events),
        }
    }
    sys.stdout.write(json.dumps(out))


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd plugins/pell/skills/visual-scratchpad && python3 -m unittest test_inbox_check -v`
Expected: 6 tests PASS.

- [ ] **Step 5: Manual no-op + consume check**

```bash
rm -rf /tmp/pv-ic && mkdir -p /tmp/pv-ic
HOME=/tmp HOME_OVERRIDE=1 true   # (informational; script uses ~/.claude/pell-visual)
# With no inbox, the hook must print nothing:
python3 plugins/pell/skills/visual-scratchpad/inbox_check.py ; echo "[exit $?]"
```
Expected: no stdout, `[exit 0]`. (Full consume/offset behavior is covered by the unit tests; the live hook path is exercised in Task 10.)

- [ ] **Step 6: Validate + commit**

```bash
claude plugin validate ./plugins/pell
git add plugins/pell/skills/visual-scratchpad/inbox_check.py plugins/pell/skills/visual-scratchpad/test_inbox_check.py
git commit -m "$(cat <<'EOF'
feat(visual-scratchpad): UserPromptSubmit inbox-check hook script

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: hooks/hooks.json — register the UserPromptSubmit hook

**Files:**
- Create: `plugins/pell/hooks/hooks.json`

- [ ] **Step 1: Create the hooks file**

Create `plugins/pell/hooks/hooks.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "command -v python3 >/dev/null 2>&1 && python3 \"${CLAUDE_PLUGIN_ROOT}/skills/visual-scratchpad/inbox_check.py\" || true",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

The `command -v python3 … || true` guard makes the hook a clean no-op (exit 0, no stderr) on machines without `python3`, so it is safe to ship plugin-wide.

- [ ] **Step 2: Validate JSON + plugin**

```bash
python3 -m json.tool plugins/pell/hooks/hooks.json >/dev/null && echo "json ok"
claude plugin validate ./plugins/pell
```
Expected: `json ok`; validate exits 0. (Live firing of the hook is verified in Task 10 after a plugin reload — a freshly authored hook is not active in the current session.)

- [ ] **Step 3: Commit**

```bash
git add plugins/pell/hooks/hooks.json
git commit -m "$(cat <<'EOF'
feat(visual-scratchpad): register UserPromptSubmit inbox hook

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: commands/visualize.md — the explicit command

**Files:**
- Create: `plugins/pell/commands/visualize.md`

- [ ] **Step 1: Write the command body**

Create `plugins/pell/commands/visualize.md` (mirror the freeform-arg + read-only-by-default style of `commands/start-work.md`):

````markdown
---
description: Open and drive the live visual scratchpad — a browser tab that renders whatever Claude writes to it, with click-back events. Starts a zero-dependency local server on first use.
argument-hint: ["<what to visualize>" | watch | stop-watch | stop | clear]
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
````

- [ ] **Step 2: Validate + commit**

```bash
claude plugin validate ./plugins/pell
git add plugins/pell/commands/visualize.md
git commit -m "$(cat <<'EOF'
feat(visual-scratchpad): add /pell:visualize command

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: SKILL.md — the auto-invoked skill

**Files:**
- Create: `plugins/pell/skills/visual-scratchpad/SKILL.md`

- [ ] **Step 1: Write the skill**

Create `plugins/pell/skills/visual-scratchpad/SKILL.md` (description = trigger, per the skill conventions in CLAUDE.md):

```markdown
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
```

- [ ] **Step 2: Validate + commit**

```bash
claude plugin validate ./plugins/pell
git add plugins/pell/skills/visual-scratchpad/SKILL.md
git commit -m "$(cat <<'EOF'
feat(visual-scratchpad): add auto-invoked skill

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Bump plugin version

**Files:**
- Modify: `plugins/pell/.claude-plugin/plugin.json`

- [ ] **Step 1: Bump the version 0.9.0 → 0.10.0**

Edit `plugins/pell/.claude-plugin/plugin.json`, changing `"version": "0.9.0"` to `"version": "0.10.0"`.

- [ ] **Step 2: Validate + commit**

```bash
claude plugin validate ./plugins/pell
git add plugins/pell/.claude-plugin/plugin.json
git commit -m "$(cat <<'EOF'
chore(pell): bump version to 0.10.0 — adds visual scratchpad

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: README section

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read the README to find the command-listing section**

Run: `grep -n "pell:wrap-up\|pell:from-ticket\|^## \|^### " README.md`
Use the output to locate where the per-command docs live (the `/pell:wrap-up` and `/pell:from-ticket` sections are the models to mirror).

- [ ] **Step 2: Add a `/pell:visualize` + visual-scratchpad subsection**

Insert, in the same style and location as the other command docs, content covering:

```markdown
### `/pell:visualize` — live visual scratchpad

A browser "second screen" Claude can draw to. A zero-dependency local server
(Python stdlib, `127.0.0.1` only) serves a page that live-renders a file Claude
writes to — diagrams, SVG, tables, before/after comparisons — over SSE.

- `/pell:visualize` — start the server, print the URL
- `/pell:visualize "<concept>"` — render a fragment for that concept
- `/pell:visualize watch` — react to clicks in near-real-time (zero-token shell watcher)
- `/pell:visualize stop-watch` · `stop` · `clear`

It's also **bidirectional**: pages can call `pellSend(payload)` (e.g. on a
button) to post events to an inbox. A bundled `UserPromptSubmit` hook surfaces
those events to Claude on its next turn, so Claude can render clickable options
and read your choice back — a richer alternative to a text prompt.

The auto-invoked **`visual-scratchpad`** skill does the same thing proactively:
when Claude is about to explain something inherently visual, it pushes a rendered
view to the pad. Requires `python3`; degrades to a terminal explanation if absent.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs(readme): add visual scratchpad section

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Manual end-to-end smoke test (user-driven)

**Files:** none (verification only).

- [ ] **Step 1: Reload the plugin so the new command, skill, and hook are active**

```
/plugin marketplace update pell-skills
/reload-plugins
```

- [ ] **Step 2: Output path — open + draw**

Run `/pell:visualize` → confirm a `http://127.0.0.1:<port>` URL is printed and the page opens live (green status dot). Run `/pell:visualize "the request flow: client → API → DB"` → confirm a diagram/table renders in the tab without reload.

- [ ] **Step 3: Bidirectional — passive hook**

Have Claude render an interactive fragment, e.g. `/pell:visualize "two options as buttons A and B"`. Click a button in the page. Then send Claude any message → confirm Claude sees the click (the UserPromptSubmit hook surfaces `Canvas inbox: …`). Confirm `~/.claude/pell-visual/inbox.offset` advanced and the same click is **not** surfaced again on the following turn.

- [ ] **Step 4: Bidirectional — watch mode**

Run `/pell:visualize watch`, click a button, confirm Claude reacts. Confirm idle cost is zero (no repeated turns while you don't click). Run `/pell:visualize stop-watch`.

- [ ] **Step 5: Idempotency + teardown**

Run `/pell:visualize` twice → confirm only one server process (`pgrep -af server.py`). Run `/pell:visualize stop` → confirm the process is gone and `server.pid` removed.

- [ ] **Step 6: Degradation**

(Optional) Temporarily make `python3` unresolvable (or reason through it) → confirm `/pell:visualize "x"` explains in the terminal rather than erroring.

---

## Self-Review

- **Spec coverage:** §1 tiers → Tasks 2 (SSE/output), 4–5 (passive hook), 6 §4 (watch). §2 components → Tasks 1–8 (every file). §3 server → Task 2. §4 viewer → Task 3. §5 command → Task 6. §6 skill → Task 7. §7 asset paths → Task 6 (`${CLAUDE_PLUGIN_ROOT}`) + Task 7 (`${CLAUDE_SKILL_DIR}`). §8 security → loopback bind (Task 2), trusted-innerHTML (Task 3). §9 degradation → Task 6 Step 2 + Task 7 (python3-or-terminal; Node fallback descoped, flagged above). §10 verify items → resolved in planning (hook format, asset paths) or covered by Task 10 smoke (wake immediacy, Monitor). §11 out-of-scope → respected (one global pad, no auto-open, no auth, no recurring LLM poll).
- **Placeholder scan:** none — every code step has complete content; the Node fallback is an explicit descope, not a TODO.
- **Type consistency:** `sse_encode`, `read_new_events(inbox_path, offset) -> (events, new_offset)`, `format_context(events)`, the `hookSpecificOutput.additionalContext` envelope, `~/.claude/pell-visual/{scratch.html,inbox.jsonl,inbox.offset,server.pid,server.port}`, and port default `7654` are used consistently across server.py, inbox_check.py, hooks.json, the command, and the skill.
