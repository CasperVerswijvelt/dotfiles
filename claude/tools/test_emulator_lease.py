import contextlib
import importlib.machinery
import importlib.util
import io
import json
import os
import subprocess
import tempfile
import threading
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
        self.stopped = []
        self.m.stop_emulator = self.stopped.append
        self.m.proc_exited = lambda pid: False
        os.environ.pop("EMULATOR_AVD", None)

    def tearDown(self):
        self.dir.cleanup()

    def fake_adb(self, *args, timeout=30):
        self.adb_calls.append(args)
        if args == ("devices",):
            return "List of devices attached\n" + ("emulator-5554\tdevice\n" if self.up else "")
        if args[-1:] == ("sys.boot_completed",):
            return "1\n" if self.up else ""
        if args[2:] == ("get-state",):
            return "device\n" if self.up else ""
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

    def test_no_pid_lease_stays_held_after_acquirer_is_gone(self):
        self.run_main("acquire", "a", "--avd", "pix")
        self.assertIsNone(self.lease()["pid"])
        rc, out, _ = self.run_main("acquire", "b", "--avd", "pix")
        self.assertEqual((rc, out), (75, ""))
        self.assertEqual(self.lease()["owner"], "a")

    def test_holder_reacquire_refreshes_age(self):
        self.m.MAX_AGE = 10
        self.run_main("acquire", "a", "--avd", "pix")
        self.put_lease("a", None, age=8)
        rc, out, _ = self.run_main("acquire", "a", "--avd", "pix")
        self.assertEqual((rc, out), (0, "emulator-5554\n"))
        self.assertLess(time.time() - self.lease()["time"], 2)
        self.put_lease("a", None, age=8)
        self.m.MAX_AGE = 10
        self.run_main("acquire", "a", "--avd", "pix")
        rc, _, _ = self.run_main("acquire", "b", "--avd", "pix")
        self.assertEqual(rc, 75)

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

    def lease_file_exists(self):
        return os.path.exists(os.path.join(self.dir.name, "lease.json"))

    def test_boot_timeout_kills_started_emulator_and_leaves_no_lease(self):
        self.m.BOOT_TIMEOUT = 0.3
        self.m.WAIT = 30
        self.m.start_emulator = lambda avd: 4242  # never comes up
        t0 = time.monotonic()
        rc, out, _ = self.run_main("acquire", "a", "--avd", "pix")
        self.assertEqual((rc, out), (1, ""))
        self.assertLess(time.monotonic() - t0, 2)
        self.assertEqual(self.stopped, [4242])
        self.assertFalse(self.lease_file_exists())

    def test_boot_wait_is_capped_by_acquire_budget(self):
        self.m.BOOT_TIMEOUT = 30
        self.m.WAIT = 0.3
        self.m.start_emulator = lambda avd: 4242
        t0 = time.monotonic()
        rc, out, _ = self.run_main("acquire", "a", "--avd", "pix")
        self.assertEqual((rc, out), (75, ""))
        self.assertLess(time.monotonic() - t0, 3)
        self.assertEqual(self.stopped, [])
        self.assertFalse(self.lease_file_exists())

    def test_boot_early_exit_stops_waiting_and_kills(self):
        self.m.BOOT_TIMEOUT = 30
        self.m.start_emulator = lambda avd: 4242
        self.m.proc_exited = lambda pid: True
        t0 = time.monotonic()
        rc, out, _ = self.run_main("acquire", "a", "--avd", "pix")
        self.assertEqual((rc, out), (1, ""))
        self.assertLess(time.monotonic() - t0, 2)
        self.assertEqual(self.stopped, [4242])
        self.assertFalse(self.lease_file_exists())

    def test_holder_reacquire_with_dead_emulator_reboots(self):
        self.run_main("acquire", "a", "--avd", "pix")
        self.up = False
        rc, out, _ = self.run_main("acquire", "a", "--avd", "pix")
        self.assertEqual((rc, out), (0, "emulator-5554\n"))
        self.assertEqual(self.boots, ["pix", "pix"])
        self.assertEqual(self.lease()["owner"], "a")

    def test_busy_waiters_are_served_in_fifo_order(self):
        self.m.WAIT = 10
        self.run_main("acquire", "a", "--avd", "pix")
        order = []
        real = self.m.try_take

        def spy(owner, avd, pid, deadline):
            r = real(owner, avd, pid, deadline)
            if r[0] == "ok":
                order.append(owner)
            return r

        self.m.try_take = spy
        qdir = os.path.join(self.dir.name, "queue")
        threads = []
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            for i, owner in enumerate(("b", "c")):
                t = threading.Thread(target=self.m.cmd_acquire, args=(owner, "pix", None))
                t.start()
                threads.append(t)
                end = time.monotonic() + 5
                while len(os.listdir(qdir)) < i + 1 and time.monotonic() < end:
                    time.sleep(0.01)
            self.m.main(["release", "a"])
            end = time.monotonic() + 5
            while "b" not in order and time.monotonic() < end:
                time.sleep(0.01)
            self.assertEqual(order, ["b"])
            self.m.main(["release", "b"])
            for t in threads:
                t.join(10)
        self.assertEqual(order, ["b", "c"])

    def test_status_with_malformed_lease_does_not_raise(self):
        with open(os.path.join(self.dir.name, "lease.json"), "w") as f:
            json.dump({"owner": "a"}, f)
        self.assertEqual(self.run_main("status")[0], 0)


if __name__ == "__main__":
    unittest.main()
