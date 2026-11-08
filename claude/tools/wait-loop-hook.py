#!/usr/bin/env python3
# PreToolUse hook for Bash: logs waiting loops (pgrep, until, while/for with sleep).
# Log only; never blocks. The next retro checks the log for false blocks, then it enforces.
# Matching is one linear pass: strip quotes and heredoc bodies, split into commands, walk them.
import datetime
import json
import os
import re
import sys

LOG = os.environ.get("WAIT_LOOP_HOOK_LOG") or os.path.expanduser(
    "~/dotfiles/claude/tools/retro/wait-loop-hook.log")
MAX_LOGGED = 300  # chars of the command kept in the log (privacy)

HEREDOC = re.compile(r"<<(-?)[ \t]*(?:'([^'\n]*)'|\"([^\"\n]*)\"|([A-Za-z0-9_]+))")
SPLIT = re.compile(r"[;&|()`\n]+")
PREFIX = {"!", "then", "do", "else", "elif", "if", "{", "time", "while", "until"}


def strip(cmd):
    """Drop quoted strings and heredoc bodies. Linear."""
    out = []
    pending = []
    i, n = 0, len(cmd)
    while i < n:
        c = cmd[i]
        if c == "\\":
            i += 2
        elif c in "'\"":
            j = i + 1
            while j < n and cmd[j] != c:
                j += 2 if (c == '"' and cmd[j] == "\\") else 1
            out.append(" ")
            i = j + 1
        elif c == "<" and cmd.startswith("<<", i) and not cmd.startswith("<<<", i):
            m = HEREDOC.match(cmd, i)
            if m:
                pending.append(m.group(2) or m.group(3) or m.group(4))
                i = m.end()
            else:
                i += 2
        elif c == "\n":
            out.append("\n")
            i += 1
            for word in pending:
                while i < n:
                    j = cmd.find("\n", i)
                    j = n if j < 0 else j
                    line = cmd[i:j].strip()
                    i = min(j + 1, n)
                    if line == word:
                        break
            pending = []
        else:
            out.append(c)
            i += 1
    return "".join(out)


def match(cmd):
    depth = 0  # open while/for loops
    found = None
    for seg in SPLIT.split(strip(cmd)):
        words = seg.split()
        if not words:
            continue
        if words[0] == "done":
            depth = max(0, depth - 1)
            continue
        k = 0
        while k < len(words) and words[k] in PREFIX:
            if words[k] == "until":
                found = found or "until-loop"
                depth += 1
            elif words[k] == "while":
                depth += 1
            k += 1
        if k == 0 and words[0] == "for":
            depth += 1
            continue
        if k >= len(words):
            continue
        if words[k] == "pgrep":
            return "pgrep"
        if words[k] == "sleep" and depth and not found:
            found = "while-sleep"
    return found


def main():
    try:
        data = json.load(sys.stdin)
        cmd = (data.get("tool_input") or {}).get("command") or ""
        name = match(cmd)
        if not name:
            return
        one = cmd[:MAX_LOGGED].replace("\\", "\\\\").replace("\n", "\\n")
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
