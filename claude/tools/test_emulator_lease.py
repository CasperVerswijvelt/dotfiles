import contextlib
import importlib.machinery
import importlib.util
import io
import json
import os
import subprocess
import tempfile
import time
import unittest

TOOL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "emulator-lease")


class EmulatorLeaseTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        loader = importlib.machinery.SourceFileLoader("emulator_lease_mod", TOOL)
        spec = importlib.util.spec_from_loader("emulator_lease_mod", loader)
        self.m = importlib.util.module_from_spec(spec)
        loader.exec_module(self.m)
        self.m.DIR = self.dir.name
        self.m.WAIT = 0.3
        self.m.POLL = 0.05
        self.m.BOOT_TIMEOUT = 2
        self.m.MAX_AGE = 3600
        self.up = False  # fake emulator state
        self.boots = []
        self.adb_calls = []
        self.m.adb = self.fake_adb
        self.m.start_emulator = self.fake_start
        os.environ.pop("EMULATOR_AVD", None)

    def tearDown(self):
        self.dir.cleanup()

    def fake_adb(self, *args, timeout=30):
        self.adb_calls.append(args)
        if args == ("devices",):
            return "List of devices attached\n" + ("emulator-5554\tdevice\n" if self.up else "")
        if args[-1:] == ("sys.boot_completed",):
            return "1\n" if self.up else ""
        if args[2:] == ("emu", "kill"):
            self.up = False
        return ""

    def fake_start(self, avd):
        self.boots.append(avd)
        self.up = True
        return 4242

    def run_main(self, *argv):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            rc = self.m.main(list(argv))
        return rc, out.getvalue(), err.getvalue()

    def lease(self):
        with open(os.path.join(self.dir.name, "lease.json")) as f:
            return json.load(f)

    def put_lease(self, owner, pid, age=0):
        with open(os.path.join(self.dir.name, "lease.json"), "w") as f:
            json.dump({"owner": owner, "pid": pid, "emulator_pid": 1, "serial": "emulator-5554",
                       "time": time.time() - age}, f)

    def dead_pid(self):
        p = subprocess.Popen(["true"])
        p.wait()
        return p.pid

    def test_acquire_boots_and_prints_serial(self):
        rc, out, _ = self.run_main("acquire", "a", "--avd", "pix", "--pid", str(os.getpid()))
        self.assertEqual((rc, out), (0, "emulator-5554\n"))
        self.assertEqual(self.boots, ["pix"])
        lease = self.lease()
        self.assertEqual((lease["owner"], lease["pid"], lease["emulator_pid"]), ("a", os.getpid(), 4242))

    def test_same_owner_gets_same_serial_without_reboot(self):
        self.run_main("acquire", "a", "--avd", "pix", "--pid", str(os.getpid()))
        rc, out, _ = self.run_main("acquire", "a", "--avd", "pix", "--pid", str(os.getpid()))
        self.assertEqual((rc, out), (0, "emulator-5554\n"))
        self.assertEqual(self.boots, ["pix"])

    def test_no_avd_is_exit_2(self):
        rc, out, _ = self.run_main("acquire", "a")
        self.assertEqual((rc, out), (2, ""))

    def test_second_owner_times_out_with_75(self):
        self.run_main("acquire", "a", "--avd", "pix", "--pid", str(os.getpid()))
        rc, out, err = self.run_main("acquire", "b", "--avd", "pix", "--pid", str(os.getpid()))
        self.assertEqual((rc, out), (75, ""))
        self.assertIn("emulator busy, run again", err)
        self.assertEqual(self.lease()["owner"], "a")

    def test_dead_owner_lease_is_reclaimed_and_emulator_reused(self):
        self.up = True
        self.put_lease("a", self.dead_pid())
        rc, out, _ = self.run_main("acquire", "b", "--avd", "pix", "--pid", str(os.getpid()))
        self.assertEqual((rc, out), (0, "emulator-5554\n"))
        self.assertEqual(self.boots, [])
        self.assertEqual(self.lease()["owner"], "b")

    def test_dead_owner_with_dead_emulator_reboots(self):
        self.put_lease("a", self.dead_pid())
        rc, _, _ = self.run_main("acquire", "b", "--avd", "pix", "--pid", str(os.getpid()))
        self.assertEqual(rc, 0)
        self.assertEqual(self.boots, ["pix"])

    def test_max_age_lease_is_reclaimed(self):
        self.up = True
        self.m.MAX_AGE = 10
        self.put_lease("a", os.getpid(), age=100)
        rc, _, _ = self.run_main("acquire", "b", "--avd", "pix", "--pid", str(os.getpid()))
        self.assertEqual(rc, 0)
        self.assertEqual(self.lease()["owner"], "b")

    def test_release_by_holder_kills_and_frees(self):
        self.run_main("acquire", "a", "--avd", "pix", "--pid", str(os.getpid()))
        rc, _, _ = self.run_main("release", "a")
        self.assertEqual(rc, 0)
        self.assertIn(("-s", "emulator-5554", "emu", "kill"), self.adb_calls)
        self.assertFalse(self.up)
        self.assertFalse(os.path.exists(os.path.join(self.dir.name, "lease.json")))

    def test_release_by_non_holder_is_noop(self):
        self.run_main("acquire", "a", "--avd", "pix", "--pid", str(os.getpid()))
        self.adb_calls.clear()
        rc, _, err = self.run_main("release", "b")
        self.assertEqual(rc, 0)
        self.assertIn("holds no lease", err)
        self.assertEqual(self.adb_calls, [])
        self.assertEqual(self.lease()["owner"], "a")

    def test_status(self):
        self.assertEqual(self.run_main("status")[1], "free\n")
        self.put_lease("a", os.getpid(), age=5)
        out = self.run_main("status")[1]
        self.assertRegex(out, r"^a, emulator-5554, \d+s\n$")


if __name__ == "__main__":
    unittest.main()
