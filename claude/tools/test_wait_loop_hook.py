import json
import os
import subprocess
import sys
import tempfile
import unittest

HOOK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "wait-loop-hook.py")


class WaitLoopHookTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.log = os.path.join(self.dir.name, "sub", "hook.log")

    def tearDown(self):
        self.dir.cleanup()

    def feed(self, raw):
        r = subprocess.run([sys.executable, HOOK], input=raw, text=True, capture_output=True,
                           env={**os.environ, "WAIT_LOOP_HOOK_LOG": self.log})
        self.assertEqual(r.returncode, 0)
        self.assertEqual(r.stdout, "")
        return r

    def lines(self):
        if not os.path.exists(self.log):
            return []
        return open(self.log).read().splitlines()

    def send(self, cmd):
        self.feed(json.dumps({"tool_input": {"command": cmd}, "session_id": "s1", "cwd": "/x"}))

    def test_logs_waiting_loops(self):
        cases = {
            "pgrep": "while pgrep -f flutter >/dev/null; do :; done",
            "until-loop": "until [ -f /tmp/done ]; do\n  echo hi\ndone",
            "while-sleep": "while true; do\n  check\n  sleep 5\ndone",
        }
        for name, cmd in cases.items():
            self.send(cmd)
            got = self.lines()[-1].split("\t")
            self.assertEqual(got[1:3], ["s1", "/x"])
            self.assertEqual(got[3], name, cmd)
        self.assertEqual(len(self.lines()), 3)
        self.assertNotIn("\n", self.lines()[1])
        self.assertIn("\\n", self.lines()[1])

    def test_logs_more_loops(self):
        cases = {
            "while-sleep": ["for i in 1 2; do sleep 1; done",
                            "while ! curl -s x; do sleep 2; done"],
            "until-loop": ["until curl -s x\ndo\n  echo w\ndone", "until false; do :; done"],
            "pgrep": ["pgrep -f flutter", "x=$(pgrep foo)"],
        }
        for name, cmds in cases.items():
            for cmd in cmds:
                self.send(cmd)
                self.assertEqual(self.lines()[-1].split("\t")[3], name, cmd)

    def test_ignores_plain_commands(self):
        for cmd in ["git status", "just gate", "grep -n sleep file.dart", "echo until",
                    "grep -rn pgrep docs", "cd x && sleep 1", "git commit -m 'a; sleep 2'",
                    "git commit -m 'a\nsleep 3\nb'", "git commit -m \"x\nsleep 3\"",
                    "sleep 1; echo hi", "sleep 30 && git status",
                    "cat <<EOF\nwhile x; do sleep 1; done\nEOF\necho ok",
                    "while x; do echo a; done; sleep 1"]:
            self.send(cmd)
        self.assertEqual(self.lines(), [])

    def test_large_input_is_fast(self):
        import time
        cmd = "x" + "; while x; do echo a; done" * 8000
        self.assertGreater(len(cmd), 200000)
        t = time.monotonic()
        self.send(cmd)
        self.assertLess(time.monotonic() - t, 1.0)

    def test_bad_json_exits_zero(self):
        self.feed("not json")
        self.feed("")
        self.assertEqual(self.lines(), [])

    def test_truncates(self):
        self.send("pgrep x " + "a" * 2000)
        self.assertLess(len(self.lines()[0]), 400)
        self.assertNotIn("a" * 301, self.lines()[0])


if __name__ == "__main__":
    unittest.main()
