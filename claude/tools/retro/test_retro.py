#!/usr/bin/env python3
import json, os, tempfile, unittest
import retro

HERE = os.path.dirname(os.path.abspath(__file__))
SID = "11111111-aaaa-bbbb-cccc-000000000000"


class T(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.r = retro.summarise(*(lambda a, n: (a, n))(*retro.build([SID], os.path.join(HERE, "fixtures/proj"), [], 300, "retro")), 300)
        cls.by = {a["role"]: a for a in cls.r["agents"]}

    def test_tree(self):
        self.assertEqual(sorted(self.by), ["main", "my-implementer"])
        self.assertTrue(self.by["my-implementer"]["parent"].startswith("main:"))

    def test_tokens_deduped_and_cost(self):
        k = self.by["main"]["tokens"]
        self.assertEqual((k["input"], k["output"], k["cache_read"], k["cache_creation"]), (14, 35, 1000, 50))
        want = (14 * 4 + 35 * 20 + 1000 * 0.2 + 50 * 4 * 1.25) / 1e6
        self.assertAlmostEqual(self.by["main"]["cost_usd"], want, places=6)

    def test_gate_time_commits_and_hook_failure(self):
        s = self.by["my-implementer"]
        self.assertEqual(s["time"]["gate"], 180)  # check 120 + failed commit 30 + commit 30
        self.assertEqual(s["commits"], {"cmds": 2, "failed": 1, "hook_failures": 1})
        self.assertEqual(s["gate"]["just check"], 1)
        self.assertEqual(s["gate"]["retries"], 1)

    def test_main_gap_notification_and_human_turns(self):
        m = self.by["main"]
        self.assertEqual({(g["secs"], g["category"]) for g in m["gaps"]}, {(595, "wait_human"), (592, "wait_notification")})
        self.assertEqual(m["notifications"], 1)
        self.assertEqual([h["secs_to_reply"] for h in m["human_turns"]], [10, 4])
        self.assertEqual(m["human_turns"][0]["reply_words"], 2)
        self.assertEqual(self.r["main_thread"]["notification_turns_relayed"], 1)
        self.assertEqual(m["spawned"]["my-implementer"], 1)

    def test_render(self):
        self.assertIn("TOTAL", retro.render(self.r))


def _gap_after_asst(next_row):
    """analyse() a tiny subagent transcript: prompt, assistant text, 1h gap, next_row, assistant."""
    def asst(ts, i):
        return {"type": "assistant", "timestamp": ts, "message": {"id": i, "model": "claude-sonnet-5-5", "content": [{"type": "text", "text": "x"}], "usage": {}}}
    rows = [{"type": "user", "timestamp": "2026-10-18T10:00:00.000Z", "message": {"content": "go"}, "isSidechain": True},
            asst("2026-10-18T10:00:05.000Z", "m1")]
    if next_row:
        rows.append(next_row)
    rows.append(asst("2026-10-18T11:00:05.000Z", "m2"))
    with tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False) as f:
        f.write("\n".join(json.dumps(r) for r in rows))
    try:
        return retro.analyse(f.name, "aX", "my-implementer", 300)
    finally:
        os.unlink(f.name)


class Resume(unittest.TestCase):
    def test_coordinator_resume_gap_is_wait(self):
        resume = {"type": "user", "timestamp": "2026-10-18T11:00:00.000Z", "origin": {"kind": "coordinator"}, "isMeta": True, "isSidechain": True,
                  "message": {"content": "The coordinator sent a message while you were working:\ngo on"}}
        a = _gap_after_asst(resume)
        self.assertEqual(a["gaps"][0]["category"], "wait_resume")
        self.assertLess(a["time"]["generation"], 20)

    def test_plain_generation_gap_stays_generation(self):
        a = _gap_after_asst(None)
        self.assertEqual(a["gaps"][0]["category"], "generation")
        self.assertGreater(a["time"]["generation"], 3000)


if __name__ == "__main__":
    unittest.main()
