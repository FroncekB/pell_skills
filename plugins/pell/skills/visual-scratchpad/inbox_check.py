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
