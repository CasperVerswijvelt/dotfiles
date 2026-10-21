# Fix ledger

Process changes made after a retro, with a measurable prediction. One ledger for all projects.
Whoever applies a fix adds its row in the same commit. A later retro reviews every open row
against its own numbers and sets the status. Never auto-revert: a "worse" row goes to Casper
as a question.

Status: open, worked, no effect, worse, too little data.

| id | date | project | change | commits | prediction (metric, direction, size) | status | evidence |
|---|---|---|---|---|---|---|---|
| R1 | 2026-10-20 | all | One all-areas reviewer per small task instead of one per area | dotfiles e02362b | Orchestrator wakes per task down (baseline: not measured per task, 90 agents in the 2026-10-20 retro) | too little data | retro 2026-10-21: first per-task numbers; reviewers 2.8/task incl. close and round 2, $14.5 total |
| R2 | 2026-10-20 | all | Review round 2 only after a blocker or major finding | dotfiles e02362b | Review rounds per task down toward 1.0 (baseline: not measured per task) | worked | retro 2026-10-21: 1.36 rounds/task; every round 2 followed a named major; minors landed without re-review |
| R3 | 2026-10-20 | all | Plan-close gate and live check run in the last fix-wave implementer | dotfiles e02362b | Gate agents per plan 0 (baseline: separate gate agents each plan; gate minutes 109 in the 2026-10-20 retro) | worked | retro 2026-10-21: one exception: plan-close gate ran in the last fix wave, but M3f spawned a separate land agent re-running a 2.5 min check; M3a ran check-all 4x |
| R4 | 2026-10-20 | all | "Completed" is not finished: no false "unattended" claims | dotfiles e02362b | Stall incidents (agent ended turn waiting on a backgrounded command) 0 per retro | no effect | retro 2026-10-21: predicted 0 stalls, 2 occurred at 19:21 and 19:56 on 2026-10-20, both from SendMessage-resuming a child then ending the turn; none after switching to foreground Agent calls |
| R5 | 2026-10-20 | all | my-open-items skill and one-line main chat | dotfiles 04ccefb | Main-thread output tokens per turn down (baseline: main role output tokens in the 2026-10-20 retro JSON) | too little data | retro 2026-10-21 |
| R6 | 2026-10-20 | gym-app | `just live-coach` (pending, plan M2z) | pending, plan M2z | Live-check minutes per plan down | too little data | retro 2026-10-21: no live-coach run |

Baselines for R1 to R6 are the 2026-10-20 gym-app retro (page https://claude.ai/artifact/9iNqpfadNhwDrUJd8V1wmE) and its
row in retro-log.md (wall 15h29m, cost $36, gate 109 min, 90 agents). Per-task numbers start
with the first retro that has them; until then compare per plan.

## Casper's signal

Items Casper raised per feedback round or milestone check (from the project's roadmap and
plans, e.g. "Feedback round" plans). Fewer items per round means fewer misses reach him.

| date of retro | project | round / check | items |
|---|---|---|---|
| 2026-10-21 | gym-app | M3 For-you round | 8 items answered (2 changed: refused edits get a Sync log; server address became phone-only with first-launch choice), plus 1 mockup verdict (changed: row into Data, renamed) |
