#!/usr/bin/env python3
"""Claude Code session retrospective: tokens, cost, time per aspect, counts, human turns.

usage: retro.py [--project-dir DIR] [--tasks-dir DIR ...] [--json OUT] [--last N]
                [--idle-min M] [--exclude-desc REGEX] [SESSION_ID_OR_JSONL ...]
Stdlib only. Discovers the agent tree (main -> orchestrator -> implementer/reviewer/scout).
"""
import argparse, collections, glob, json, os, re, sys
from datetime import datetime

# USD per 1M tokens: (input, output, cache_read). Cache write = 1.25x input (5m) / 2x (1h).
# Source: claude-api skill model table (cached 2026-10-06). Haiku 5.5 uses the <=100K-prompt rate.
PRICES = {
    "claude-opus-5-5": (4, 20, 0.20), "claude-opus-5": (5, 25, 0.50), "claude-opus-4-8": (5, 25, 0.50),
    "claude-opus-4-7": (5, 25, 0.50), "claude-opus-4-6": (5, 25, 0.50),
    "claude-sonnet-5-5": (2, 10, 0.20), "claude-sonnet-5": (2, 10, 0.20), "claude-sonnet-4-6": (3, 15, 0.30),
    "claude-haiku-5-5": (0.10, 0.50, 0.01), "claude-haiku-4-5": (1, 5, 0.10),
    "claude-fable-5-1": (10, 50, 0.25), "claude-fable-5": (10, 50, 0.25),
}
# first match wins; applied to the command with heredoc bodies stripped
BASH_CLASSES = [
    ("land", r"\bjust land\b"), ("goldens", r"update-goldens|--tags[ =]golden|\bjust goldens\b"),
    ("gate", r"\bjust check(-all)?\b|\bgit commit\b|\bgit push\b|\.githooks|pre-commit"),
    ("tests", r"\b(flutter|dart) test\b|\bjust test"),
    ("walkthrough", r"\bwalk(-demo)?\b|playwright|chrome"),
    ("build", r"\bjust (preview|up|serve)|flutter build|\bjust preview-stop"),
    ("git", r"\bgit\b"),
    ("read_search", r"^\s*(cd [^&;]+&&\s*)?(cat|rg|grep|ls|find|head|tail|wc|sed -n|stat|tree|sort|jq)\b"),
]
FAIL_HOOK = re.compile(r"hook|pre-commit|githook|just check", re.I)


def ts_of(d):
    try:
        return datetime.fromisoformat(d["timestamp"].replace("Z", "+00:00")).timestamp()
    except Exception:
        return None


def load(path):
    out = []
    try:
        with open(path, errors="replace") as f:
            for line in f:
                try:
                    d = json.loads(line)
                except Exception:
                    continue
                if isinstance(d, dict):
                    out.append(d)
    except OSError:
        pass
    return out


def text_of(content):
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(b.get("text", "") if isinstance(b, dict) and b.get("type") == "text" else
                         (text_of(b.get("content")) if isinstance(b, dict) and b.get("type") == "tool_result" else "")
                         for b in content)
    return ""


def bash_class(cmd):
    cmd = re.sub(r"<<-?\s*'?\"?(\w+)'?\"?.*?(\n\1\b|\Z)", " ", cmd, flags=re.S)
    for name, rx in BASH_CLASSES:
        if re.search(rx, cmd):
            return name
    return "other"


def tool_class(name, inp, background=False):
    n = name or ""
    if n == "Bash":
        return bash_class((inp or {}).get("command", ""))
    if n in ("Read", "Grep", "Glob", "LS"):
        return "read_search"
    if n in ("Edit", "Write", "NotebookEdit", "MultiEdit"):
        return "edits"
    if n in ("Agent", "Task"):
        return "agent_launch" if background else "subagent_wait"
    if re.search(r"chrome|playwright|browser", n, re.I):
        return "walkthrough"
    if n in ("Monitor", "TaskOutput", "Sleep"):
        return "wait_tool"
    if n == "SendMessage":
        return "messaging"
    return "other"


def is_fail(block, d):
    t = text_of(block.get("content"))
    tr = d.get("toolUseResult")
    return bool(block.get("is_error")) or t.startswith("Exit code") or (isinstance(tr, dict) and tr.get("interrupted"))


# ---------- discovery ----------
def first_session(path):
    for d in load(path)[:30]:
        if d.get("sessionId"):
            return d["sessionId"], d.get("agentId")
    return None, None


def discover(project_dir, sid, tasks_dirs):
    """-> (main_path, {agentId: {path, meta}})"""
    main = os.path.join(project_dir, sid + ".jsonl")
    agents = {}
    seen = {os.path.realpath(main)}
    sub = os.path.join(project_dir, sid, "subagents")
    cand = sorted(glob.glob(os.path.join(sub, "*.jsonl")))
    for td in tasks_dirs:
        cand += sorted(glob.glob(os.path.join(td, "*.output")))
    for p in cand:
        rp = os.path.realpath(p)
        if rp in seen or not os.path.exists(rp):
            continue
        s, aid = first_session(rp)
        if p.startswith(sub):
            s = sid  # trust the directory
        if s != sid:
            continue
        seen.add(rp)
        base = os.path.basename(rp)
        aid = aid or re.sub(r"^agent-|\.(jsonl|output)$", "", base)
        meta = {}
        mp = rp[:-6] + ".meta.json" if rp.endswith(".jsonl") else ""
        if mp and os.path.exists(mp):
            try:
                meta = json.load(open(mp))
            except Exception:
                pass
        agents[aid] = {"path": rp, "meta": meta}
    return main, agents


# ---------- per-transcript analysis ----------
def analyse(path, aid, role, idle):
    rows = load(path)
    a = {"id": aid, "role": role, "tokens": collections.Counter(), "cost_by_model": collections.defaultdict(float),
         "models": collections.Counter(), "tools": collections.Counter(), "spawned": collections.Counter(),
         "send_message": 0, "notifications": 0, "time": collections.Counter(), "tool_time": collections.Counter(),
         "gaps": [], "commits": {"cmds": 0, "failed": 0, "hook_failures": 0}, "gate": collections.Counter(),
         "human_turns": [], "notif_turns": [], "other_time": collections.Counter()}
    seen_msg, seen_tool, usage = set(), set(), {}  # usage: msg id -> max per field (streamed duplicates)
    order = []
    notif_keys = set()
    turn_ends = []
    for d in rows:
        t, ts = d.get("type"), ts_of(d)
        if t == "system" and d.get("subtype") == "turn_duration" and ts:
            turn_ends.append(ts)
        if t == "attachment" and (d.get("attachment") or {}).get("type") == "queued_command":
            p = (d["attachment"].get("prompt") or "")
            if "<task-notification>" in p:
                notif_keys.add(hash(p))
        if ts is None or t not in ("assistant", "user"):
            continue
        m = d.get("message") or {}
        if t == "assistant":
            mid = m.get("id") or d.get("requestId") or d.get("uuid")
            u = m.get("usage") or {}
            if m.get("model") and m["model"] != "<synthetic>":
                usage.setdefault(mid, {"model": m["model"], "u": collections.Counter(), "c5": 0, "c1": 0})
                e = usage[mid]
                for k in ("input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens", "output_tokens"):
                    e["u"][k] = max(e["u"][k], u.get(k) or 0)
                cc = u.get("cache_creation") or {}
                e["c5"] = max(e["c5"], cc.get("ephemeral_5m_input_tokens") or 0)
                e["c1"] = max(e["c1"], cc.get("ephemeral_1h_input_tokens") or 0)
            g = {"kind": "asst", "ts": ts, "tools": [], "text": []}
            order.append(g)
            for b in m.get("content") or []:
                if not isinstance(b, dict):
                    continue
                if b.get("type") == "tool_use" and b["id"] not in seen_tool:
                    seen_tool.add(b["id"])
                    g["tools"].append(b)
                elif b.get("type") == "text" and b.get("text", "").strip() and (mid, b["text"]) not in seen_msg:
                    seen_msg.add((mid, b["text"]))
                    g["text"].append(b["text"])
            continue
        # user entry
        c = m.get("content")
        if isinstance(c, list) and any(isinstance(b, dict) and b.get("type") == "tool_result" for b in c):
            for b in c:
                if isinstance(b, dict) and b.get("type") == "tool_result":
                    order.append({"kind": "result", "ts": ts, "block": b, "d": d})
            continue
        txt = text_of(c)
        kind = (d.get("origin") or {}).get("kind")
        if kind is None:
            if d.get("isMeta") or (d.get("isSidechain") and order) or re.match(r"\s*<(local-command|command-|system-reminder)", txt):
                kind = "meta"
            elif "<task-notification>" in txt[:40]:
                kind = "task-notification"
            elif not order and aid != "main":
                kind = "prompt"
            else:
                kind = "human"
        if kind == "task-notification":
            notif_keys.add(hash(txt))
            order.append({"kind": "notif", "ts": ts, "text": txt})
        elif kind == "human" and not re.match(r"\s*<(local-command|command-)", txt) and txt.strip():
            order.append({"kind": "human", "ts": ts, "text": txt})
        else:
            order.append({"kind": "prompt" if not order else "meta", "ts": ts})
    order = [o for o in order if o["kind"] != "meta"]
    order.sort(key=lambda o: o["ts"])
    a["notifications"] = len(notif_keys)

    # tokens and cost
    notes = []
    for e in usage.values():
        u = e["u"]
        model = re.sub(r"\[.*\]$|-\d{8}$", "", e["model"])
        a["models"][model] += 1
        c5 = e["c5"] if (e["c5"] or e["c1"]) else u["cache_creation_input_tokens"]
        c1 = e["c1"]
        for k, v in (("input", u["input_tokens"]), ("cache_read", u["cache_read_input_tokens"]),
                     ("cache_creation", c5 + c1), ("output", u["output_tokens"])):
            a["tokens"][k] += v
        p = PRICES.get(model)
        if p:
            a["cost_by_model"][model] += (u["input_tokens"] * p[0] + u["output_tokens"] * p[1] +
                                          u["cache_read_input_tokens"] * p[2] + c5 * p[0] * 1.25 + c1 * p[0] * 2) / 1e6
        else:
            a.setdefault("unpriced", set()).add(model)
    a["model"] = a["models"].most_common(1)[0][0] if a["models"] else None

    # timeline
    uses = {}
    last_end_pending = None
    bg_launch = {}
    prev = order[0]["ts"] if order else None
    prev_ev = None
    pending = {}
    gate_last_failed = False
    for o in order:
        dt = o["ts"] - prev
        cat, label = None, ""
        if o["kind"] == "asst":
            cat = "generation"
            for b in o["tools"]:
                inp = b.get("input") or {}
                a["tools"][b["name"]] += 1
                bgd = bool(inp.get("run_in_background"))
                uses[b["id"]] = (b["name"], inp, bgd)
                pending[b["id"]] = (b["name"], inp)
                if b["name"] in ("Agent", "Task"):
                    a["spawned"][inp.get("subagent_type") or "general-purpose"] += 1
                if b["name"] == "SendMessage":
                    a["send_message"] += 1
                if b["name"] == "Bash":
                    cmd = re.sub(r"<<.*", "", inp.get("command", ""), flags=re.S)
                    for k in ("just land", "just check-all", "just check"):
                        if re.search(r"\b" + k + r"\b(?!-)", cmd):
                            a["gate"][k] += 1
                    if re.search(r"\bgit commit\b", cmd):
                        a["commits"]["cmds"] += 1
        elif o["kind"] == "result":
            b = o["block"]
            name, inp, bgd = uses.get(b.get("tool_use_id"), ("?", {}, False))
            tr = o["d"].get("toolUseResult")
            if name in ("Agent", "Task") and isinstance(tr, dict) and tr.get("isAsync"):
                bgd = True
                bg_launch[tr.get("agentId")] = inp.get("description", "")
            cat = tool_class(name, inp, bgd)
            pending.pop(b.get("tool_use_id"), None)
            label = name + (": " + (inp.get("command") or inp.get("description") or "")[:80].replace("\n", " ") if inp else "")
            a["tool_time"][name] += dt
            if cat == "other":
                a["other_time"][label[:90]] += dt
            if name == "Bash":
                cmd = inp.get("command", "")
                failed = is_fail(b, o["d"])
                cls = cat
                if re.search(r"\bgit commit\b", re.sub(r"<<.*", "", cmd, flags=re.S)) and failed:
                    a["commits"]["failed"] += 1
                    if FAIL_HOOK.search(text_of(b.get("content"))):
                        a["commits"]["hook_failures"] += 1
                if cls in ("gate", "land"):
                    if failed:
                        a["gate"]["failed_runs"] += 1
                    if gate_last_failed:
                        a["gate"]["retries"] += 1
                    gate_last_failed = failed
        else:  # human / notif / prompt
            if o["kind"] == "prompt":
                cat = "start"
            elif prev_ev and prev_ev["kind"] == "asst" and not pending:
                cat = "wait_human" if o["kind"] == "human" else "wait_notification"
                if o["kind"] == "notif":
                    m_ = re.search(r"<task-id>(\w+)</task-id>", o.get("text", ""))
                    label = "awaiting notification, then received from " + (bg_launch.get(m_ and m_.group(1)) or (m_ and m_.group(1)) or "?")
                    if m_ and ("completed" in o.get("text", "") or "finished" in o.get("text", "")):
                        bg_launch.pop(m_ and m_.group(1), None)
                else:
                    label = "awaiting user"
            else:
                cat = "wait_other"
                label = "pending: " + ", ".join(n for n, _ in pending.values())
        if cat == "generation" and prev_ev and prev_ev["kind"] == "asst":
            cat = "generation"
        a["time"][cat] += dt
        if dt > idle:
            a["gaps"].append({"agent": aid, "secs": round(dt), "start": prev, "category": cat,
                              "pending": label or ("model generation" if cat == "generation" else cat)})
        prev, prev_ev = o["ts"], o
    ts_all = [o["ts"] for o in order]
    a["start"], a["end"] = (min(ts_all), max(ts_all)) if ts_all else (None, None)
    a["wall"] = (a["end"] - a["start"]) if ts_all else 0
    gaps = [order[i]["ts"] - order[i - 1]["ts"] for i in range(1, len(order))]
    a["active"] = sum(g for g in gaps if g <= idle)
    a["gaps"].sort(key=lambda g: -g["secs"])

    # main-thread turns
    turn_ends.sort()

    def end_after(t0):
        return next((e for e in turn_ends if e > t0), None)

    def words_between(t0, t1):
        return sum(len(" ".join(g["text"]).split()) for g in order if g["kind"] == "asst" and t0 < g["ts"] <= t1)

    humans = [o for o in order if o["kind"] == "human"]
    for i, o in enumerate(humans):
        nxt = humans[i + 1]["ts"] if i + 1 < len(humans) else float("inf")
        end = end_after(o["ts"])
        if end is None or end > nxt:
            asst = [g["ts"] for g in order if g["kind"] == "asst" and o["ts"] < g["ts"] < nxt]
            end = max(asst) if asst else o["ts"]
        a["human_turns"].append({"ts": datetime.fromtimestamp(o["ts"]).astimezone().isoformat(timespec="seconds"),
                                 "words": len(o["text"].split()), "secs_to_reply": round(end - o["ts"], 1),
                                 "reply_words": words_between(o["ts"], end), "text": o["text"].strip()[:70]})
    for o in order:
        if o["kind"] == "notif":
            end = end_after(o["ts"]) or o["ts"]
            rw = words_between(o["ts"], end)
            a["notif_turns"].append({"secs": round(end - o["ts"], 1), "relayed": rw > 0, "reply_words": rw})
    return a


# ---------- tree ----------
def build(session_ids, project_dir, tasks_dirs, idle, exclude_desc):
    nodes, notes = {}, []
    spawn_owner = {}  # tool_use id -> owner agent id
    for sid in session_ids:
        main_path, agents = discover(project_dir, sid, tasks_dirs)
        if not os.path.exists(main_path):
            notes.append("main transcript missing: " + main_path)
            continue
        mid = "main:" + sid[:8]
        nodes[mid] = {"id": mid, "path": main_path, "meta": {}, "role": "main", "desc": "main thread " + sid, "parent": None}
        for aid, v in agents.items():
            m = v["meta"]
            nodes[aid] = {"id": aid, "path": v["path"], "meta": m, "role": m.get("agentType") or "unknown",
                          "desc": m.get("description", ""), "parent": m.get("parentAgentId") or mid, "sid": sid, "main": mid}
        for n in list(nodes.values()):
            if "sid" in n or n["id"] == mid:
                for d in load(n["path"]):
                    if d.get("type") == "assistant":
                        for b in (d.get("message") or {}).get("content") or []:
                            if isinstance(b, dict) and b.get("type") == "tool_use" and b.get("name") in ("Agent", "Task"):
                                spawn_owner[b["id"]] = (n["id"], b.get("input") or {})
                    elif d.get("type") == "user":
                        tr = d.get("toolUseResult")
                        if isinstance(tr, dict) and tr.get("agentId"):
                            sp = [u for u in [d.get("sourceToolUseID")] if u]
                            c = (d.get("message") or {}).get("content")
                            if isinstance(c, list):
                                sp += [b.get("tool_use_id") for b in c if isinstance(b, dict)]
                            for u in sp:
                                if u in spawn_owner and tr["agentId"] in nodes:
                                    nodes[tr["agentId"]].setdefault("_via", spawn_owner[u])
    for n in nodes.values():  # fill gaps in meta from the spawning tool_use
        via = n.pop("_via", None)
        if via and n.get("parent") is not None:
            if n["role"] == "unknown":
                n["role"] = via[1].get("subagent_type") or "unknown"
            n["desc"] = n["desc"] or via[1].get("description", "")
            if n["parent"] == n.get("main"):
                n["parent"] = via[0]
    rx = re.compile(exclude_desc, re.I) if exclude_desc else None
    excluded = set()
    def is_excl(n):
        if n["id"] in excluded:
            return True
        if n["parent"] in nodes and is_excl(nodes[n["parent"]]):
            excluded.add(n["id"]); return True
        if rx and n["role"] != "main" and rx.search(n["desc"] or ""):
            excluded.add(n["id"]); return True
        return False
    keep = [n for n in nodes.values() if not is_excl(n)]
    if excluded:
        notes.append("excluded %d agent transcripts (description matches /%s/ or descendants): %s" % (
            len(excluded), exclude_desc, ", ".join(sorted(excluded))))
    out = []
    for n in keep:
        a = analyse(n["path"], n["id"] if n["role"] != "main" else "main", n["role"], idle)
        a.update(id=n["id"], description=n["desc"], parent=n["parent"], spawn_depth=n["meta"].get("spawnDepth"),
                 request_shape=n["meta"].get("requestShape"))
        out.append(a)
    return out, notes


def fmt_t(s):
    s = int(round(s or 0))
    return "%d:%02d:%02d" % (s // 3600, s % 3600 // 60, s % 60)


def summarise(agents, notes, idle):
    unpriced = set()
    tot = {"tokens": collections.Counter(), "cost": 0.0, "time": collections.Counter(), "tools": collections.Counter(),
           "spawned": collections.Counter(), "send_message": 0, "notifications": 0, "gate": collections.Counter(),
           "commits": collections.Counter(), "agents_by_role": collections.Counter(), "tokens_by_role": {},
           "cost_by_role": collections.defaultdict(float), "other_time": collections.Counter(), "tool_time": collections.Counter()}
    for a in agents:
        a["cost_usd"] = round(sum(a["cost_by_model"].values()), 6) if not a.get("unpriced") else None
        unpriced |= a.get("unpriced", set())
        tot["tokens"].update(a["tokens"]); tot["time"].update(a["time"]); tot["tools"].update(a["tools"])
        tot["spawned"].update(a["spawned"]); tot["gate"].update(a["gate"]); tot["commits"].update(a["commits"])
        tot["other_time"].update(a["other_time"]); tot["tool_time"].update(a["tool_time"])
        tot["send_message"] += a["send_message"]; tot["agents_by_role"][a["role"]] += 1
        tot["cost"] += sum(a["cost_by_model"].values()); tot["cost_by_role"][a["role"]] += sum(a["cost_by_model"].values())
        if a["role"] == "main":
            tot["notifications"] += a["notifications"]
        tr = tot["tokens_by_role"].setdefault(a["role"], collections.Counter()); tr.update(a["tokens"])
    if unpriced:
        notes.append("no price known for: %s; their cost is excluded and the agent cost is null" % ", ".join(sorted(unpriced)))
    notes.append("prices: claude-api skill table (2026-10-06); cache write 1.25x (5m) / 2x (1h) input; "
                 "Haiku 5.5 at the <=100K-prompt rate; advisor-model usage is not separated")
    notes.append("time categories partition each agent's own timeline (parallel agents overlap); "
                 "tool intervals of parallel tool calls are split by result arrival")
    main = [a for a in agents if a["role"] == "main"]
    mt = {}
    for m in main:
        ht = sum(h["secs_to_reply"] for h in m["human_turns"]); nt = sum(n["secs"] for n in m["notif_turns"])
        mt = {"answering_casper_secs": ht, "handling_notifications_secs": nt,
              "notification_turns": len(m["notif_turns"]), "notification_turns_relayed": sum(n["relayed"] for n in m["notif_turns"])}
    gaps = sorted((g for a in agents for g in a["gaps"]), key=lambda g: -g["secs"])
    return {"idle_threshold_secs": idle, "notes": notes, "totals": tot, "main_thread": mt, "top_gaps": gaps[:20],
            "agents": agents}


def render(r):
    ag, t, L = r["agents"], r["totals"], []
    L.append("== per role (agents | in | cache_read | cache_write | out | cost USD)")
    for role, n in sorted(t["agents_by_role"].items()):
        k = t["tokens_by_role"][role]
        L.append("%-16s %3d  %9d %11d %10d %9d  %8.2f" % (role, n, k["input"], k["cache_read"], k["cache_creation"], k["output"], t["cost_by_role"][role]))
    k = t["tokens"]
    L.append("%-16s %3d  %9d %11d %10d %9d  %8.2f" % ("TOTAL", len(ag), k["input"], k["cache_read"], k["cache_creation"], k["output"], t["cost"]))
    mains = [a for a in ag if a["role"] == "main"]
    if mains:
        L.append("main wall %s  active(<=%ds gaps) %s" % (fmt_t(sum(a["wall"] for a in mains)), r["idle_threshold_secs"], fmt_t(sum(a["active"] for a in mains))))
    L.append("== time per aspect, summed over agents (h:mm:ss)")
    L.append("  ".join("%s %s" % (c, fmt_t(s)) for c, s in sorted(t["time"].items(), key=lambda x: -x[1])))
    m = r["main_thread"]
    if m:
        L.append("== main thread: answering Casper %s | background notification turns %s (%d turns, %d relayed)" % (
            fmt_t(m["answering_casper_secs"]), fmt_t(m["handling_notifications_secs"]), m["notification_turns"], m["notification_turns_relayed"]))
    L.append("== counts")
    L.append("tools: " + ", ".join("%s %d" % x for x in t["tools"].most_common(10)))
    L.append("agents spawned: " + ", ".join("%s %d" % x for x in t["spawned"].most_common()) + " | SendMessage %d | notifications to main %d" % (t["send_message"], t["notifications"]))
    c, g = t["commits"], t["gate"]
    L.append("commits %d (failed %d, hook failures %d) | just check %d, check-all %d, land %d | failed gate/land runs %d, retries %d" % (
        c["cmds"], c["failed"], c["hook_failures"], g["just check"], g["just check-all"], g["just land"], g["failed_runs"], g["retries"]))
    L.append("== top agents by cost (id role model wall active cost desc)")
    for a in sorted(ag, key=lambda a: -(a["cost_usd"] or 0))[:12]:
        L.append("%-18s %-15s %-17s %s %s %7s  %s" % (a["id"][:18], a["role"], a["model"], fmt_t(a["wall"]), fmt_t(a["active"]),
                 "n/a" if a["cost_usd"] is None else "%.2f" % a["cost_usd"], (a["description"] or "")[:40]))
    if mains:
        L.append("== human turns (time, words, secs to reply, reply words)")
        for h in mains[0]["human_turns"]:
            L.append("%s %4dw %7.0fs %5dw  %s" % (h["ts"][11:19], h["words"], h["secs_to_reply"], h["reply_words"], h["text"][:45].replace("\n", " ")))
    L.append("== top idle gaps")
    for g in r["top_gaps"][:5]:
        L.append("%s %-18s %-10s %s" % (fmt_t(g["secs"]), g["agent"][:18], g["category"], g["pending"][:80]))
    L += ["note: " + n for n in r["notes"]]
    return "\n".join(L)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("sessions", nargs="*")
    ap.add_argument("--project-dir", default=os.path.expanduser("~/.claude/projects/-Users-casper-Documents-Projecten-gym-app"))
    ap.add_argument("--tasks-dir", action="append", default=[])
    ap.add_argument("--json")
    ap.add_argument("--last", type=int)
    ap.add_argument("--idle-min", type=float, default=5)
    ap.add_argument("--exclude-desc", default="retrospective|retro\\b")
    a = ap.parse_args(argv)
    ids = []
    for s in a.sessions:
        if s.endswith(".jsonl"):
            a.project_dir = os.path.dirname(os.path.abspath(s)); s = os.path.basename(s)[:-6]
        ids.append(s)
    if a.last:
        fs = sorted(glob.glob(os.path.join(a.project_dir, "*.jsonl")), key=os.path.getmtime)[-a.last:]
        ids += [os.path.basename(f)[:-6] for f in fs]
    if not ids:
        ap.error("give a session id/jsonl or --last N")
    idle = a.idle_min * 60
    agents, notes = build(ids, a.project_dir, a.tasks_dir, idle, a.exclude_desc)
    r = summarise(agents, notes, idle)
    txt = render(r)
    if a.json:
        def enc(o):
            if isinstance(o, (collections.Counter, collections.defaultdict)):
                return dict(o)
            if isinstance(o, set):
                return sorted(o)
            return str(o)
        with open(a.json, "w") as f:
            json.dump(r, f, indent=1, default=enc)
    print(txt)
    return r


if __name__ == "__main__":
    main()
