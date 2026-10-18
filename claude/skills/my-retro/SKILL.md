---
name: my-retro
description: Retrospective on Claude Code sessions, measured from the transcripts. Use for "retro", "retrospective", "why was that slow", "why was that expensive", "what did that session cost".
---

# Retro

Input: session ids, or "last N sessions" of a project. Output: an HTML page link and the
top 3 findings.

1. **Measure.** Run from the project's directory and write the JSON to the scratchpad:
   `python3 "$(realpath <skill dir>/../../tools/retro/retro.py)" --json <out.json> <session ids>`
   (`<skill dir>` is this skill's directory, a symlink into the repo, hence `realpath`).
   The project dir defaults to `~/.claude/projects/<slug>`, the cwd's absolute path with
   `/` replaced by `-`; `--project-dir` overrides it. Prefer explicit session ids (or
   `.jsonl` paths). `--last N` takes the newest transcripts by mtime, which includes the
   session running the retro: use `--last N+1` and drop the current session, whose id is
   in the scratchpad path (`.../<project-slug>/<session-id>/scratchpad`). `--help` lists the rest.
2. **Plan vs landed.** One `my-scout` reads the plan, `progress.md` and `git log` for the
   window and reports what landed against what was planned.
3. **Incidents.** One `my-reviewer` checks the transcripts and the JSON for each pattern,
   with timestamps and minutes lost:
   - stall: an agent backgrounded a command and ended its turn, or an orchestrator ended "waiting"
   - interim notifications relayed to Casper
   - queued SendMessage splitting one piece of work
   - duplicate gate runs: hook plus land plus reviewer re-runs, full checks on docs-only changes
   - walkthrough re-shoots
4. **Rank** findings by measured cost (minutes, dollars). Each gets one concrete fix and
   the file it changes.
5. **Publish** an HTML page with the Artifact tool (load `artifact-design` first):
   summary, time and tokens by role, progress vs plan, ranked findings, main-thread turns
   that needed Casper.
6. **Log** one row in `~/dotfiles/claude/tools/retro/retro-log.md`: date, project,
   sessions, wall, cost, gate minutes, agents. From the JSON: wall = sum of `wall` over
   agents with `role` "main"; cost = `totals.cost` (if an agent's `cost_usd` is null for an
   unpriced model, log the priced subtotal with a `+` suffix); gate minutes =
   `totals.time` gate + land + goldens, seconds / 60; agents = `len(agents)`.

## Known limits

Say these on the page, and fix them when iterating.
- Agent time is summed, so parallel agents overlap and it exceeds wall time.
- Failed hook runs are undercounted: detection needs `is_error` or an "Exit code" prefix.
  One run reported 0 failures where the transcripts showed 3.
- Interim notifications are not tagged in the JSON, so the reviewer finds them by reading.
