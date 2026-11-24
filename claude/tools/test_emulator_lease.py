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
import unittest.mock

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
        self.m.MAX = 1
        self.serials = set()  # fake emulators that are up
        self.boots = []
        self.ports = []
        self.adb_calls = []
        self.m.adb = self.fake_adb
        self.real_start = self.m.start_emulator
        self.m.start_emulator = self.fake_start
        self.stopped = []
        self.m.stop_emulator = self.fake_stop
        self.m.proc_exited = lambda pid: False
        self.m.adb_available = lambda: True
        self.m.STOP_WAIT = 0.3
        os.environ.pop("EMULATOR_AVD", None)

    def tearDown(self):
        self.dir.cleanup()

    @property
    def up(self):
        return "emulator-5554" in self.serials

    @up.setter
    def up(self, value):
        (self.serials.add if value else self.serials.discard)("emulator-5554")

    def fake_adb(self, *args, timeout=30):
        self.adb_calls.append(args)
        if args == ("devices",):
            return "List of devices attached\n" + "".join(f"{s}\tdevice\n" for s in sorted(self.serials))
        up = len(args) > 1 and args[1] in self.serials
        if args[-1:] == ("sys.boot_completed",):
            return "1\n" if up else ""
        if args[2:] == ("get-state",):
            return "device\n" if up else ""
        if args[2:] == ("emu", "kill"):
            self.serials.discard(args[1])
        return ""

    def fake_stop(self, pid, serial=None):
        self.stopped.append(pid)
        if serial:
            self.fake_adb("-s", serial, "emu", "kill")

    def fake_start(self, avd, port):
        self.boots.append(avd)
        self.ports.append(port)
        self.serials.add(f"emulator-{port}")
        return 4242

    def run_main(self, *argv):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            rc = self.m.main(list(argv))
        return rc, out.getvalue(), err.getvalue()

    def lease(self, slot=0):
        with open(os.path.join(self.dir.name, f"lease-{slot}.json")) as f:
            return json.load(f)

    def put_lease(self, owner, pid, age=0, slot=0, name=None):
        with open(os.path.join(self.dir.name, name or f"lease-{slot}.json"), "w") as f:
            json.dump({"owner": owner, "pid": pid, "emulator_pid": 1,
                       "serial": f"emulator-{5554 + 2 * slot}", "time": time.time() - age}, f)

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
        self.assertFalse(self.lease_file_exists())

    def test_release_by_non_holder_is_noop(self):
        self.run_main("acquire", "a", "--avd", "pix", "--pid", str(os.getpid()))
        self.adb_calls.clear()
        rc, _, err = self.run_main("release", "b")
        self.assertEqual(rc, 0)
        self.assertIn("holds no lease", err)
        self.assertEqual(self.adb_calls, [])
        self.assertEqual(self.lease()["owner"], "a")

    def test_release_without_adb_and_running_emulator_keeps_lease_and_fails(self):
        self.run_main("acquire", "a", "--avd", "pix")
        self.m.adb_available = lambda: False
        self.m.adb = lambda *a, timeout=30: ""  # adb missing: swallowed, as in the field
        self.put_lease("a", None)  # emulator_pid 1 stays alive
        rc, _, err = self.run_main("release", "a")
        self.assertEqual(rc, 1)
        self.assertIn("lease of a kept", err)
        self.assertTrue(self.lease_file_exists())

    def test_release_without_adb_stops_by_pid_and_frees(self):
        self.run_main("acquire", "a", "--avd", "pix")
        self.m.adb_available = lambda: False
        self.m.adb = lambda *a, timeout=30: ""
        p = subprocess.Popen(["sleep", "60"], start_new_session=True)
        self.addCleanup(p.kill)
        lease = self.lease()
        lease["emulator_pid"] = p.pid
        with open(os.path.join(self.dir.name, "lease-0.json"), "w") as f:
            json.dump(lease, f)
        import signal
        self.m.stop_emulator = lambda pid, serial=None: os.killpg(pid, signal.SIGTERM)
        threading.Thread(target=p.wait, daemon=True).start()  # reap so the pid is dead
        rc, _, _ = self.run_main("release", "a")
        self.assertEqual(rc, 0)
        self.assertFalse(self.lease_file_exists())

    def test_release_passes_stored_pid_to_stop_emulator(self):
        self.run_main("acquire", "a", "--avd", "pix")
        self.run_main("release", "a")
        self.assertEqual(self.stopped, [4242])

    def test_find_bin_falls_back_to_sdk_dirs(self):
        sdk = os.path.join(self.dir.name, "sdk")
        os.makedirs(os.path.join(sdk, "emulator"))
        path = os.path.join(sdk, "emulator", "emulator")
        with open(path, "w") as f:
            f.write("#!/bin/sh\n")
        os.chmod(path, 0o755)
        env = {"PATH": self.dir.name, "ANDROID_HOME": sdk}
        with unittest.mock.patch.dict(os.environ, env):
            self.assertEqual(self.m.find_bin("emulator"), path)

    def test_acquire_without_emulator_binary_fails_cleanly(self):
        self.m.start_emulator = self.real_start
        self.m.find_bin = lambda name: None
        rc, out, err = self.run_main("acquire", "a", "--avd", "pix")
        self.assertEqual((rc, out), (1, ""))
        self.assertIn("emulator binary not found", err)
        self.assertFalse(self.lease_file_exists())

    def test_status(self):
        self.assertEqual(self.run_main("status")[1], "free\n")
        self.put_lease("a", os.getpid(), age=5)
        out = self.run_main("status")[1]
        self.assertRegex(out, r"^a, emulator-5554, \d+s\n$")

    def lease_file_exists(self, slot=0):
        return os.path.exists(os.path.join(self.dir.name, f"lease-{slot}.json"))

    def test_boot_timeout_kills_started_emulator_and_leaves_no_lease(self):
        self.m.BOOT_TIMEOUT = 0.3
        self.m.WAIT = 30
        self.m.start_emulator = lambda avd, port: 4242  # never comes up
        t0 = time.monotonic()
        rc, out, _ = self.run_main("acquire", "a", "--avd", "pix")
        self.assertEqual((rc, out), (1, ""))
        self.assertLess(time.monotonic() - t0, 2)
        self.assertEqual(self.stopped, [4242])
        self.assertFalse(self.lease_file_exists())

    def test_boot_wait_is_capped_by_acquire_budget(self):
        self.m.BOOT_TIMEOUT = 30
        self.m.WAIT = 0.3
        self.m.start_emulator = lambda avd, port: 4242
        t0 = time.monotonic()
        rc, out, _ = self.run_main("acquire", "a", "--avd", "pix")
        self.assertEqual((rc, out), (75, ""))
        self.assertLess(time.monotonic() - t0, 3)
        self.assertEqual(self.stopped, [])
        self.assertFalse(self.lease_file_exists())

    def test_boot_early_exit_stops_waiting_and_kills(self):
        self.m.BOOT_TIMEOUT = 30
        self.m.start_emulator = lambda avd, port: 4242
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
        with open(os.path.join(self.dir.name, "lease-0.json"), "w") as f:
            json.dump({"owner": "a"}, f)
        self.assertEqual(self.run_main("status")[0], 0)

    def test_second_lease_granted_at_max_2_with_different_serial(self):
        self.m.MAX = 2
        rc_a, out_a, _ = self.run_main("acquire", "a", "--avd", "pix")
        rc_b, out_b, _ = self.run_main("acquire", "b", "--avd", "pix")
        self.assertEqual((rc_a, out_a, rc_b, out_b), (0, "emulator-5554\n", 0, "emulator-5556\n"))
        self.assertEqual(self.ports, [5554, 5556])
        self.assertEqual((self.lease(0)["owner"], self.lease(1)["owner"]), ("a", "b"))

    def test_third_owner_is_busy_at_max_2(self):
        self.m.MAX = 2
        self.run_main("acquire", "a", "--avd", "pix")
        self.run_main("acquire", "b", "--avd", "pix")
        rc, out, _ = self.run_main("acquire", "c", "--avd", "pix")
        self.assertEqual((rc, out), (75, ""))

    def test_second_owner_queues_at_max_1(self):
        self.run_main("acquire", "a", "--avd", "pix")
        rc, out, _ = self.run_main("acquire", "b", "--avd", "pix")
        self.assertEqual((rc, out), (75, ""))
        self.assertFalse(self.lease_file_exists(1))

    def test_release_frees_only_that_slot(self):
        self.m.MAX = 2
        self.run_main("acquire", "a", "--avd", "pix")
        self.run_main("acquire", "b", "--avd", "pix")
        self.run_main("release", "b")
        self.assertEqual(self.serials, {"emulator-5554"})
        self.assertFalse(self.lease_file_exists(1))
        self.assertEqual(self.lease(0)["owner"], "a")
        rc, out, _ = self.run_main("acquire", "c", "--avd", "pix")
        self.assertEqual((rc, out), (0, "emulator-5556\n"))

    def test_owner_reacquire_keeps_its_slot(self):
        self.m.MAX = 2
        self.run_main("acquire", "a", "--avd", "pix")
        self.run_main("acquire", "b", "--avd", "pix")
        rc, out, _ = self.run_main("acquire", "b", "--avd", "pix")
        self.assertEqual((rc, out), (0, "emulator-5556\n"))
        self.assertEqual(self.boots, ["pix", "pix"])

    def test_stale_slot_1_reclaimed_and_emulator_reused(self):
        self.m.MAX = 2
        self.serials = {"emulator-5554", "emulator-5556"}
        self.put_lease("a", os.getpid(), slot=0)
        self.put_lease("x", self.dead_pid(), slot=1)
        rc, out, _ = self.run_main("acquire", "b", "--avd", "pix")
        self.assertEqual((rc, out), (0, "emulator-5556\n"))
        self.assertEqual(self.boots, [])
        self.assertEqual(self.lease(1)["owner"], "b")

    def test_legacy_lease_json_becomes_slot_0(self):
        self.up = True
        self.put_lease("a", None, name="lease.json")
        rc, _, _ = self.run_main("acquire", "b", "--avd", "pix")
        self.assertEqual(rc, 75)
        self.assertEqual(self.lease(0)["owner"], "a")
        self.assertFalse(os.path.exists(os.path.join(self.dir.name, "lease.json")))

    def test_status_lists_every_slot(self):
        self.m.MAX = 2
        self.put_lease("a", os.getpid(), age=5, slot=1)
        out = self.run_main("status")[1]
        self.assertRegex(out, r"^slot 0: free\nslot 1: a, emulator-5556, \d+s\n$")

    def test_max_default_follows_ram(self):
        import resources
        real = resources.sysctl
        self.addCleanup(setattr, resources, "sysctl", real)
        resources.sysctl = lambda name: {"hw.memsize": 48 * 2**30}.get(name)
        self.assertEqual(resources.default_emulator_max(), 2)
        resources.sysctl = lambda name: {"hw.memsize": 24 * 2**30}.get(name)
        self.assertEqual(resources.default_emulator_max(), 1)
        resources.sysctl = lambda name: None
        self.assertEqual(resources.default_emulator_max(), 1)

    def test_release_frees_every_slot_of_the_owner(self):
        self.m.MAX = 2
        self.serials = {"emulator-5554", "emulator-5556"}
        self.put_lease("a", None, slot=0)
        self.put_lease("a", None, slot=1)
        self.run_main("release", "a")
        self.assertFalse(self.lease_file_exists(0))
        self.assertFalse(self.lease_file_exists(1))
        self.assertEqual(self.serials, set())

    def test_lease_above_lowered_max_is_listed_and_released(self):
        self.put_lease("a", None, slot=1)
        self.assertRegex(self.run_main("status")[1], r"^slot 0: free\nslot 1: a, emulator-5556, \d+s\n$")
        self.run_main("release", "a")
        self.assertFalse(self.lease_file_exists(1))

    def test_foreign_emulator_on_port_fails_fast_with_message(self):
        self.m.BOOT_TIMEOUT = 30
        self.m.start_emulator = lambda avd, port: 4242  # exits at once: port taken
        self.m.proc_exited = lambda pid: True
        rc, out, err = self.run_main("acquire", "a", "--avd", "pix")
        self.assertEqual((rc, out), (1, ""))
        self.assertIn("console port 5554", err)


if __name__ == "__main__":
    unittest.main()
