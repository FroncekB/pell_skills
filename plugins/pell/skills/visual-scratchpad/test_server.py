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
