#!/usr/bin/env python3
# PreToolUse hook for Bash: logs waiting loops (pgrep, until, while+sleep, sleep polling).
# Log only; never blocks. The next retro checks the log for false blocks, then it enforces.
import datetime
import json
import os
import re
import sys

LOG = os.environ.get("WAIT_LOOP_HOOK_LOG") or os.path.expanduser(
    "~/dotfiles/claude/tools/retro/wait-loop-hook.log")

# Command words only: at line start or after a separator, so `grep sleep` and `echo until` do not match.
START = r"(?:^|[;&|(\n]|\bthen\b|\bdo\b)\s*"
PATTERNS = [
    ("pgrep", re.compile(r"(?:^|[;&|(!\n`]|\$\(|\b(?:while|until|if|then|do)\b)\s*pgrep\b")),
    ("until-loop", re.compile(START + r"until\b[^\n]*?;\s*do\b")),
    ("while-sleep", re.compile(START + r"while\b[\s\S]*?\bdo\b[\s\S]*?" + START + r"sleep\s+\d")),
    ("sleep-polling", re.compile(r"(?:&&|\|\||;|\n)\s*sleep\s+\d|" + START + r"sleep\s+\d+[^\n]*?(?:&&|\|\||;)")),
]


def match(cmd):
    for name, rx in PATTERNS:
        if rx.search(cmd):
            return name
    return None


def main():
    try:
        data = json.load(sys.stdin)
        cmd = (data.get("tool_input") or {}).get("command") or ""
        name = match(cmd)
        if not name:
            return
        one = cmd.replace("\\", "\\\\").replace("\n", "\\n")[:500]
        line = "\t".join([
            datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
            str(data.get("session_id", "")), str(data.get("cwd", "")), name, one])
        os.makedirs(os.path.dirname(LOG), exist_ok=True)
        with open(LOG, "a") as f:
            f.write(line + "\n")
    except Exception:
        pass


if __name__ == "__main__":
    main()
    sys.exit(0)
