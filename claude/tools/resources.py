# Machine resource probe shared by heavy-slot and emulator-lease (imported from the tools dir).
import subprocess


def sysctl(name):
    """Value of a sysctl key as a string, or None when it is missing or the call fails."""
    try:
        out = subprocess.run(["sysctl", "-n", name], capture_output=True, text=True, timeout=5)
        return out.stdout.strip() if out.returncode == 0 else None
    except (OSError, subprocess.SubprocessError):
        return None


def sysctl_int(name):
    try:
        return int(sysctl(name))
    except (TypeError, ValueError):
        return None


def ram_gb():
    mem = sysctl_int("hw.memsize")
    return None if mem is None else mem // 2**30


def perf_cores():
    """Physical cores of every performance level except Efficiency. Level 0 is not always the
    Performance cluster (a Super cluster can sit above it), so all levels are read."""
    levels = sysctl_int("hw.nperflevels")
    if not levels:
        return sysctl_int("hw.physicalcpu")
    total = 0
    for i in range(levels):
        name = sysctl(f"hw.perflevel{i}.name")
        cores = sysctl_int(f"hw.perflevel{i}.physicalcpu")
        if cores and (name or "").strip().lower() != "efficiency":
            total += cores
    return total or sysctl_int("hw.physicalcpu")


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
