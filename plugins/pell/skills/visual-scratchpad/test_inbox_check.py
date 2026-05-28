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
