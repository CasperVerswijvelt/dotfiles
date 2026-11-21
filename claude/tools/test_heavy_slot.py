import importlib.machinery
import importlib.util
import os
import signal
import subprocess
import sys
import tempfile
import threading
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

    def test_child_killed_by_signal_gives_128_plus_n(self):
        self.assertEqual(self.run_tool("sh", "-c", "kill -9 $$").returncode, 137)

    def test_sigterm_forwarded_to_child(self):
        p = self.start("sleep", "30")
        time.sleep(0.5)
        p.send_signal(signal.SIGTERM)
        p.communicate(timeout=10)
        self.assertEqual(p.returncode, 143)

    def test_signal_while_waiting_never_starts_child(self):
        self.hold()
        self.hold()
        marker = os.path.join(self.dir.name, "started")
        c = self.start("touch", marker, HEAVY_SLOT_WAIT="20")
        time.sleep(0.7)
        c.send_signal(signal.SIGTERM)
        c.communicate(timeout=10)
        self.assertEqual(c.returncode, 143)
        self.assertFalse(os.path.exists(marker))

    def test_waiters_get_slots_in_ticket_order(self):
        log = os.path.join(self.dir.name, "log")
        self.hold("1.5")
        ws = []
        for name in ("w1", "w2", "w3"):
            ws.append(self.start("sh", "-c", f"echo {name} >> {log}; sleep 0.2",
                                 HEAVY_SLOTS="1", HEAVY_SLOT_WAIT="20", HEAVY_SLOT_MIN_FREE_PCT="0"))
            time.sleep(0.4)
        for w in ws:
            w.communicate(timeout=20)
        with open(log) as f:
            self.assertEqual(f.read().split(), ["w1", "w2", "w3"])

    def test_dead_waiter_ticket_is_skipped(self):
        dead = subprocess.Popen(["true"])
        dead.wait()
        q = os.path.join(self.dir.name, "queue")
        os.makedirs(q)
        with open(os.path.join(self.dir.name, "counter"), "w") as f:
            f.write("5")
        open(os.path.join(q, f"{3:010d}.{dead.pid}"), "w").close()
        r = self.run_tool("echo", "ok", HEAVY_SLOT_WAIT="5")
        self.assertEqual(r.returncode, 0)
        self.assertIn("ok", r.stdout)
        self.assertEqual(os.listdir(q), [])

    def test_live_earlier_ticket_blocks_until_timeout(self):
        q = os.path.join(self.dir.name, "queue")
        os.makedirs(q)
        with open(os.path.join(self.dir.name, "counter"), "w") as f:
            f.write("5")
        open(os.path.join(q, f"{3:010d}.{os.getppid()}"), "w").close()
        r = self.run_tool("echo", "x", HEAVY_SLOT_WAIT="1")
        self.assertEqual(r.returncode, 75)


class MemoryCheckTest(unittest.TestCase):
    def test_low_memory_holds_waiter_until_ok(self):
        with tempfile.TemporaryDirectory() as d:
            os.environ["HEAVY_SLOT_DIR"] = d
            loader = importlib.machinery.SourceFileLoader("heavy_slot_mod", TOOL)
            spec = importlib.util.spec_from_loader("heavy_slot_mod", loader)
            mod = importlib.util.module_from_spec(spec)
            loader.exec_module(mod)
            level = {"pct": 3}
            mod.free_pct = lambda: level["pct"]
            mod.MIN_FREE_PCT = 10
            got = []
            t = threading.Thread(target=lambda: got.append(mod.acquire(10, 0.05)))
            t.start()
            time.sleep(0.5)
            self.assertEqual(got, [])
            level["pct"] = 50
            t.join(5)
            self.assertEqual(len(got), 1)
            self.assertIsNotNone(got[0])
            os.close(got[0])

    def test_failed_probe_counts_as_ok(self):
        with tempfile.TemporaryDirectory() as d:
            os.environ["HEAVY_SLOT_DIR"] = d
            loader = importlib.machinery.SourceFileLoader("heavy_slot_mod2", TOOL)
            spec = importlib.util.spec_from_loader("heavy_slot_mod2", loader)
            mod = importlib.util.module_from_spec(spec)
            loader.exec_module(mod)
            mod.free_pct = lambda: None
            self.assertTrue(mod.memory_ok())


class DefaultSlotsTest(unittest.TestCase):
    def load(self, values, env=None):
        sys.path.insert(0, os.path.dirname(TOOL))
        import resources
        self.addCleanup(sys.path.remove, os.path.dirname(TOOL))
        real = resources.sysctl
        self.addCleanup(setattr, resources, "sysctl", real)
        resources.sysctl = lambda name: values.get(name)
        old = os.environ.pop("HEAVY_SLOTS", None)
        if env:
            os.environ["HEAVY_SLOTS"] = env
        self.addCleanup(os.environ.pop, "HEAVY_SLOTS", None)
        if old is not None:
            self.addCleanup(os.environ.__setitem__, "HEAVY_SLOTS", old)
        loader = importlib.machinery.SourceFileLoader("heavy_slot_default", TOOL)
        spec = importlib.util.spec_from_loader("heavy_slot_default", loader)
        mod = importlib.util.module_from_spec(spec)
        loader.exec_module(mod)
        return mod.SLOTS

    def test_24gb_4_perf_cores_gives_2(self):
        self.assertEqual(self.load({"hw.memsize": 24 * 2**30, "hw.nperflevels": 2, "hw.perflevel0.name": "Performance",
                                    "hw.perflevel0.physicalcpu": 4, "hw.perflevel1.name": "Efficiency",
                                    "hw.perflevel1.physicalcpu": 4}), 2)

    def test_48gb_m5_pro_super_and_performance_levels_give_4(self):
        self.assertEqual(self.load({
            "hw.memsize": 48 * 2**30, "hw.nperflevels": 3,
            "hw.perflevel0.name": "Super", "hw.perflevel0.physicalcpu": 6,
            "hw.perflevel1.name": "Performance", "hw.perflevel1.physicalcpu": 6,
            "hw.perflevel2.name": "Efficiency", "hw.perflevel2.physicalcpu": 4}), 4)

    def test_perf_cores_skips_efficiency_level(self):
        import resources
        self.load({"hw.nperflevels": 2, "hw.perflevel0.name": "Performance", "hw.perflevel0.physicalcpu": 6,
                   "hw.perflevel1.name": "Efficiency", "hw.perflevel1.physicalcpu": 4})
        self.assertEqual(resources.perf_cores(), 6)

    def test_sysctl_failure_gives_2(self):
        self.assertEqual(self.load({}), 2)

    def test_env_override_wins(self):
        self.assertEqual(self.load({"hw.memsize": 48 * 2**30, "hw.physicalcpu": 12}, env="7"), 7)


if __name__ == "__main__":
    unittest.main()
