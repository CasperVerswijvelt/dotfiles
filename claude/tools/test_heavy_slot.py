import os
import signal
import subprocess
import sys
import tempfile
import time
import unittest

TOOL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "heavy-slot")


class HeavySlotTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.env = {k: v for k, v in os.environ.items() if k != "HEAVY_SLOT_HELD"}
        self.env.update(HEAVY_SLOT_DIR=self.dir.name, HEAVY_SLOTS="2", HEAVY_SLOT_POLL="0.2")
        self.procs = []

    def tearDown(self):
        for p in self.procs:
            if p.poll() is None:
                p.kill()
            p.wait()
        self.dir.cleanup()

    def start(self, *cmd, **env):
        p = subprocess.Popen([sys.executable, TOOL, *cmd], env={**self.env, **env},
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        self.procs.append(p)
        return p

    def hold(self, secs="30"):
        p = self.start("sleep", secs)
        time.sleep(0.5)
        return p

    def run_tool(self, *cmd, **env):
        return subprocess.run([sys.executable, TOOL, *cmd], env={**self.env, **env},
                              capture_output=True, text=True, timeout=20)

    def test_third_waits_then_starts(self):
        a = self.hold("1.5")
        self.hold()
        c = self.start("echo", "ran", HEAVY_SLOT_WAIT="10")
        out, err = c.communicate(timeout=15)
        self.assertEqual(c.returncode, 0)
        self.assertIn("ran", out)
        self.assertEqual(err.count("waiting for a test slot"), 1)
        a.wait()

    def test_gives_up_with_75(self):
        self.hold()
        self.hold()
        r = self.run_tool("echo", "x", HEAVY_SLOT_WAIT="1")
        self.assertEqual(r.returncode, 75)
        self.assertIn("machine busy, run again", r.stderr)
        self.assertNotIn("x", r.stdout)

    def test_killed_holder_frees_slot(self):
        a = self.hold()
        self.hold()
        a.send_signal(signal.SIGKILL)
        a.wait()
        # the orphaned child still runs but holds no lock fd
        r = self.run_tool("echo", "ok", HEAVY_SLOT_WAIT="5")
        self.assertEqual(r.returncode, 0)
        self.assertIn("ok", r.stdout)

    def test_nested_runs_directly(self):
        self.hold()
        self.hold()
        r = self.run_tool("echo", "nested", HEAVY_SLOT_HELD="1", HEAVY_SLOT_WAIT="1")
        self.assertEqual(r.returncode, 0)
        self.assertIn("nested", r.stdout)

    def test_child_gets_held_env(self):
        r = self.run_tool("sh", "-c", "echo $HEAVY_SLOT_HELD")
        self.assertEqual(r.stdout.strip(), "1")

    def test_exit_code_passes_through(self):
        self.assertEqual(self.run_tool("sh", "-c", "exit 3").returncode, 3)


if __name__ == "__main__":
    unittest.main()
