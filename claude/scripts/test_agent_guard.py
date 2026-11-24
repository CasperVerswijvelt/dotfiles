import json
import os
import subprocess
import sys
import unittest

HOOK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "agent-guard.py")


def run(stdin):
    p = subprocess.run([sys.executable, HOOK], input=stdin, capture_output=True, text=True)
    assert p.returncode == 0, p.stderr
    return json.loads(p.stdout) if p.stdout.strip() else None


def call(tool="Agent", **tool_input):
    return run(json.dumps({"tool_name": tool, "tool_input": tool_input}))


class AgentGuardTest(unittest.TestCase):
    def assertDenied(self, out):
        self.assertEqual(out["hookSpecificOutput"]["permissionDecision"], "deny")
        self.assertTrue(out["hookSpecificOutput"]["permissionDecisionReason"])

    def test_implementer_opus_denied(self):
        self.assertDenied(call(subagent_type="my-implementer", model="opus"))

    def test_scout_opus_denied(self):
        self.assertDenied(call(subagent_type="my-scout", model="Opus"))

    def test_implementer_without_model_allowed(self):
        self.assertIsNone(call(subagent_type="my-implementer"))

    def test_reviewer_opus_allowed(self):
        self.assertIsNone(call(subagent_type="my-reviewer", model="opus"))

    def test_general_purpose_denied(self):
        self.assertDenied(call(subagent_type="general-purpose"))

    def test_missing_subagent_type_denied(self):
        self.assertDenied(call(prompt="x"))

    def test_old_task_name_checked(self):
        self.assertDenied(call(tool="Task", subagent_type="general-purpose"))

    def test_other_types_allowed(self):
        for t in ("my-orchestrator", "fork", "Explore", "Plan", "web-fetch", "claude"):
            self.assertIsNone(call(subagent_type=t, model="opus"), t)

    def test_non_agent_tool_allowed(self):
        self.assertIsNone(call(tool="Bash", command="ls"))

    def test_malformed_stdin_allowed(self):
        self.assertIsNone(run("not json"))
        self.assertIsNone(run(""))


if __name__ == "__main__":
    unittest.main()
