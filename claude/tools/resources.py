# Machine resource probe shared by heavy-slot and emulator-lease (imported from the tools dir).
import subprocess


def sysctl(name):
    """Integer value of a sysctl key, or None when it is missing or the call fails."""
    try:
        out = subprocess.run(["sysctl", "-n", name], capture_output=True, text=True, timeout=5)
        return int(out.stdout.strip()) if out.returncode == 0 else None
    except (OSError, ValueError, subprocess.SubprocessError):
        return None


def ram_gb():
    mem = sysctl("hw.memsize")
    return None if mem is None else mem // 2**30


def perf_cores():
    cores = sysctl("hw.perflevel0.physicalcpu")
    return cores if cores else sysctl("hw.physicalcpu")


def default_heavy_slots():
    """max(1, min((ram_gb - 8) // 8, ceil(perf_cores / 3))); 2 when the probe fails.
    Ceiling, not floor: a 4 performance-core 24 GB machine must get 2."""
    ram, cores = ram_gb(), perf_cores()
    if ram is None or cores is None:
        return 2
    return max(1, min((ram - 8) // 8, (cores + 2) // 3))


def default_emulator_max():
    """2 emulators at 32 GB or more, else 1 (also when the probe fails)."""
    ram = ram_gb()
    return 2 if ram is not None and ram >= 32 else 1
