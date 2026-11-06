#!/usr/bin/env python3
"""Count MCP tool calls per server and Skill calls per skill over the last N days."""
import argparse
import glob
import json
import os
import time
from collections import defaultdict


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--days", type=int, default=30)
    days = ap.parse_args().days
    cutoff = time.time() - days * 86400
    root = os.path.expanduser("~/.claude/projects")
    files = glob.glob(os.path.join(root, "*", "*.jsonl")) + glob.glob(
        os.path.join(root, "*", "*", "subagents", "*.jsonl")
    )
    files = [f for f in files if os.path.getmtime(f) >= cutoff]

    mcp = defaultdict(lambda: [0, set()])
    skills = defaultdict(lambda: [0, set()])
    for f in files:
        with open(f, errors="replace") as fh:
            for line in fh:
                if '"tool_use"' not in line:
                    continue
                try:
                    content = json.loads(line).get("message", {}).get("content")
                except ValueError:
                    continue
                if not isinstance(content, list):
                    continue
                for b in content:
                    if not isinstance(b, dict) or b.get("type") != "tool_use":
                        continue
                    name = b.get("name") or ""
                    if name.startswith("mcp__"):
                        row = mcp[name.split("__")[1]]
                    elif name == "Skill":
                        inp = b.get("input") or {}
                        row = skills[str(inp.get("skill", "?"))]
                    else:
                        continue
                    row[0] += 1
                    row[1].add(f)

    print(f"Last {days} days, {len(files)} session files\n")
    for title, table in (("MCP server", mcp), ("Skill", skills)):
        print(f"{title:<45}{'calls':>8}{'sessions':>10}")
        for k, (c, s) in sorted(table.items(), key=lambda x: -x[1][0]):
            print(f"{k:<45}{c:>8}{len(s):>10}")
        print()


main()
