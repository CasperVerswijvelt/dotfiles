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
   The JSON has `per_task` (cost, orchestrator wakes, gate minutes, review rounds per landed
   task, from the repo's `<plan> Task <n>:` commits in the window); `--tasks N` overrides the
   count, `--repo` the repo.
2. **Plan vs landed.** One `my-scout` reads the plan, the progress note and `git log` for the
   window and reports what landed against what was planned. It also counts the items in
   Casper's feedback rounds and milestone checks in the window (the project's roadmap and
   plans, e.g. "Feedback round" plans) and lists them per round.
3. **Review the ledger.** For every `open` row in `~/dotfiles/claude/tools/retro/fix-ledger.md`
   (and any "too little data"), compare its prediction with this retro's numbers and set the
   status (worked, no effect, worse, too little data) with evidence: retro dates and
   numbers. A "worse" row goes to Casper as a question on the page's findings and in main's
   Needs you, with the revert as one option. Never revert on your own. Append Casper's items
   per round to the ledger's "Casper's signal" table.
4. **Incidents.** One `my-reviewer` checks the transcripts and the JSON for each pattern,
   with timestamps and minutes lost:
   - stall: an agent backgrounded a command and ended its turn, or an orchestrator ended "waiting"
   - interim notifications relayed to Casper
   - queued SendMessage splitting one piece of work
   - duplicate gate runs: hook plus land plus reviewer re-runs, full checks on docs-only changes
   - UI capture re-shoots
5. **Value at this stage.** Measuring waste is not enough: ask whether each activity is
   worth doing now. One `my-reviewer` groups `agents` in the JSON into activity classes by
   `role` and `description` (implementation, each review area and verifier, fix waves,
   gates, landing, and the project's verification activities as named in its CLAUDE.md or
   contract, e.g. UI capture, goldens, live checks), summing `wall`, `cost_usd` and `time`. For each class it reads what it caught
   in the plan's progress note, review findings, fix waves, capture notes and live check
   results, and classifies each catch as confirmed real bug, minor, or nothing. Verdict per
   class: keep, slim, cut or replace. The yardstick is the project's stated priorities: the
   contract `Stage:` line in its CLAUDE.md and the criteria in its decisions log. Output a
   table (activity / time / cost / caught / verdict), then concrete proposals, each with
   the time and cost saved per plan. Read `~/dotfiles/claude/tools/retro/catches.md` first:
   a class with repeated real catches is marked keep and is not proposed for cutting without
   evidence; a removed check listed under Escaped is proposed for restoring. The reviewer
   then appends this retro's catches and escapes (bugs found later by Casper, a later plan
   or the live app, with the check that would have caught them) to that file.
6. **Rank** findings by measured cost (minutes, dollars). Each gets one concrete fix and
   the file it changes.
7. **Publish** an HTML page with the Artifact tool (load `artifact-design` first):
   summary, time and tokens by role, the value table, progress vs plan, ranked findings, main-thread turns
   that needed Casper, and a trend section: per-task metrics across the retro-log rows and
   every ledger row with its status.
8. **Log** one row in `~/dotfiles/claude/tools/retro/retro-log.md`: date, project,
   sessions, wall, cost, gate minutes, agents, tasks, cost/task, wakes/task, gate min/task,
   review rounds/task (n/a if not measurable). From the JSON: wall = sum of `wall` over
   agents with `role` "main"; cost = `totals.cost` (if an agent's `cost_usd` is null for an
   unpriced model, log the priced subtotal with a `+` suffix); gate minutes =
   `totals.time` gate + land + goldens, seconds / 60; agents = `len(agents)`; the per-task columns come from `per_task`.
   For each process fix applied after this retro, whoever applies it adds a row to
   `fix-ledger.md` in the same commit: date, project, change, commit sha, a prediction naming
   its metric, direction and size, status `open`.

## Known limits

Say these on the page, and fix them when iterating.
- Agent time is summed, so parallel agents overlap and it exceeds wall time.
- Failed hook runs are undercounted: detection needs `is_error` or an "Exit code" prefix.
  One run reported 0 failures where the transcripts showed 3.
- Per-task numbers need task commits named `<plan> Task <n>:`; other repos pass `--tasks N`.
  Review rounds are a proxy (1 + "review fixes" commits per task): reviewer agents are not
  tagged by round. Orchestrator wakes count starts, resumes and notifications.
- Gate minutes per task include gate time of agents running in parallel, so they can exceed
  wall time.
- Interim notifications are not tagged in the JSON, so the reviewer finds them by reading.
