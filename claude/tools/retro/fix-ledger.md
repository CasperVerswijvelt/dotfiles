# Fix ledger

Process changes made after a retro, with a measurable prediction. One ledger for all projects.
Whoever applies a fix adds its row in the same commit. A later retro reviews every open row
against its own numbers and sets the status. Never auto-revert: a "worse" row goes to Casper
as a question.

Status: open, worked, no effect, worse, too little data.

| id | date | project | change | commits | prediction (metric, direction, size) | status | evidence |
|---|---|---|---|---|---|---|---|
| R1 | 2026-10-20 | all | One all-areas reviewer per small task instead of one per area | dotfiles e02362b | Orchestrator wakes per task down (baseline: not measured per task, 90 agents in the 2026-10-20 retro) | open | |
| R2 | 2026-10-20 | all | Review round 2 only after a blocker or major finding | dotfiles e02362b | Review rounds per task down toward 1.0 (baseline: not measured per task) | open | |
| R3 | 2026-10-20 | all | Plan-close gate and live check run in the last fix-wave implementer | dotfiles e02362b | Gate agents per plan 0 (baseline: separate gate agents each plan; gate minutes 109 in the 2026-10-20 retro) | open | |
| R4 | 2026-10-20 | all | "Completed" is not finished: no false "unattended" claims | dotfiles e02362b | Stall incidents (agent ended turn waiting on a backgrounded command) 0 per retro | open | |
| R5 | 2026-10-20 | all | my-open-items skill and one-line main chat | dotfiles 04ccefb | Main-thread output tokens per turn down (baseline: main role output tokens in the 2026-10-20 retro JSON) | open | |
| R6 | 2026-10-20 | gym-app | `just live-coach` (pending, plan M2z) | pending, plan M2z | Live-check minutes per plan down | open | |

Baselines for R1 to R6 are the 2026-10-20 gym-app retro (page https://claude.ai/artifact/9iNqpfadNhwDrUJd8V1wmE) and its
row in retro-log.md (wall 15h29m, cost $36, gate 109 min, 90 agents). Per-task numbers start
with the first retro that has them; until then compare per plan.

## Casper's signal

Items Casper raised per feedback round or milestone check (from the project's roadmap and
plans, e.g. "Feedback round" plans). Fewer items per round means fewer misses reach him.

| date of retro | project | round / check | items |
|---|---|---|---|
