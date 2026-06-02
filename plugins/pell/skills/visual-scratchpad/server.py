#!/usr/bin/env python3
"""Local server for the pell visual scratchpad (Python stdlib only — no pip installs).

Serves the viewer page, live-pushes the watched content file over SSE, and
accepts browser->Claude events via POST /event. Binds 127.0.0.1 only.

Bundles a vendored marked.min.js (third-party, served at /marked.min.js) for
client-side Markdown rendering — see marked.min.js for upstream provenance.

The state layout under --state-dir (default ~/.claude/pell-visual) is a contract
shared with inbox_check.py: scratch.html holds the rendered content, inbox.jsonl
holds browser->Claude events. Keep the two files in sync if either path changes.
"""
import argparse
import json
import os
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ASSETS_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_STATE = os.path.expanduser("~/.claude/pell-visual")
MAX_EVENT_BYTES = 1 << 20  # cap on POST /event bodies — loopback-only, but bounded


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


def make_server(preferred, span=10):
    """Bind a ThreadingHTTPServer on the first free port in the span.

    Constructs the server directly instead of probing a port and rebinding
    later, so there is no TOCTOU window where another process can claim the
    port between the check and the bind.
    """
    for port in range(preferred, preferred + span):
        try:
            return ThreadingHTTPServer(("127.0.0.1", port), Handler)
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
        if length < 0 or length > MAX_EVENT_BYTES:
            self.send_error(413)
            return
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

    Handler.content_path = content_path
    Handler.inbox_path = inbox_path

    httpd = make_server(args.port)
    port = httpd.server_address[1]
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
