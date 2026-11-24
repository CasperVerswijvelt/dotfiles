#!/usr/bin/env python3
"""PreToolUse hook: block Opus on my-implementer and my-scout, and general-purpose agents."""
import json
import sys

FIXED_MODEL_TYPES = {"my-implementer", "my-scout"}


def check(data):
    """Return a deny reason, or None to allow."""
    if not isinstance(data, dict) or data.get("tool_name") not in ("Agent", "Task"):
        return None
    tool_input = data.get("tool_input")
    if not isinstance(tool_input, dict):
        return None
    agent = tool_input.get("subagent_type") or ""
    model = tool_input.get("model")
    if agent in FIXED_MODEL_TYPES and isinstance(model, str) and "opus" in model.lower():
        return (f"{agent} sets its own model: drop the `model` field, "
                "and use my-orchestrator when the task needs Opus judgement.")
    if agent in ("", "general-purpose"):
        return ("Start a named my-* agent instead of general-purpose "
                "(my-implementer, my-reviewer, my-scout, my-orchestrator).")
    return None


def main():
    try:
        data = json.load(sys.stdin)
        reason = check(data)
    except Exception:
        return
    if reason:
        print(json.dumps({"hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }}))


if __name__ == "__main__":
    main()
