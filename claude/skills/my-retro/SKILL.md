---
name: my-retro
description: Retrospective on Claude Code sessions, measured from the transcripts. Use for "retro", "retrospective", "why was that slow", "why was that expensive", "what did that session cost".
---

# Retro

Input: session ids, or "last N sessions" of a project. Output: an HTML page link and the
top 3 findings.

1. **Measure.** Write the JSON to the scratchpad:
   `python3 ~/dotfiles/claude/tools/retro/retro.py --project-dir ~/.claude/projects/<project-slug> --json <out.json> --last N`
   or end with session ids (or `.jsonl` paths) instead of `--last N`. The default project
   is gym-app. `--help` lists the rest.
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
   sessions, wall, cost, gate minutes, agents.

## Known limits

Say these on the page, and fix them when iterating.
- Agent time is summed, so parallel agents overlap and it exceeds wall time.
- Failed hook runs are undercounted: detection needs `is_error` or an "Exit code" prefix.
  One run reported 0 failures where the transcripts showed 3.
- Interim notifications are not tagged in the JSON, so the reviewer finds them by reading.
