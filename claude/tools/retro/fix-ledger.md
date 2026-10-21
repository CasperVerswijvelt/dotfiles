# Fix ledger

Process changes made after a retro, with a measurable prediction. One ledger for all projects.
Whoever applies a fix adds its row in the same commit. A later retro reviews every open row
against its own numbers and sets the status. Never auto-revert: a "worse" row goes to Casper
as a question.

Status: open, worked, no effect, worse, too little data.

| id | date | project | change | commits | prediction (metric, direction, size) | status | evidence |
|---|---|---|---|---|---|---|---|
| R1 | 2026-10-20 | all | One all-areas reviewer per small task instead of one per area | dotfiles e02362b | Orchestrator wakes per task down (baseline: not measured per task, 90 agents in the 2026-10-20 retro) | worked | retro 2026-10-21 pm: one all-areas reviewer each for T6 and T8; 0.5 orchestrator wakes/task |
| R2 | 2026-10-20 | all | Review round 2 only after a blocker or major finding | dotfiles e02362b | Review rounds per task down toward 1.0 (baseline: not measured per task) | worked | retro 2026-10-21: 1.36 rounds/task; every round 2 followed a named major; minors landed without re-review |
| R3 | 2026-10-20 | all | Plan-close gate and live check run in the last fix-wave implementer | dotfiles e02362b | Gate agents per plan 0 (baseline: separate gate agents each plan; gate minutes 109 in the 2026-10-20 retro) | worked | retro 2026-10-21: one exception: plan-close gate ran in the last fix wave, but M3f spawned a separate land agent re-running a 2.5 min check; M3a ran check-all 4x |
| R4 | 2026-10-20 | all | "Completed" is not finished: no false "unattended" claims | dotfiles e02362b | Stall incidents (agent ended turn waiting on a backgrounded command) 0 per retro | no effect | retro 2026-10-21: predicted 0 stalls, 2 occurred at 19:21 and 19:56 on 2026-10-20, both from SendMessage-resuming a child then ending the turn; none after switching to foreground Agent calls; recurred 2026-10-21 pm: implementer backgrounded find /, ~17 min wait, woke main |
| R5 | 2026-10-20 | all | my-open-items skill and one-line main chat | dotfiles 04ccefb | Main-thread output tokens per turn down (baseline: main role output tokens in the 2026-10-20 retro JSON) | too little data | retro 2026-10-21 pm: main output 20.9k tokens this session, no baseline |
| R6 | 2026-10-20 | gym-app | `just live-coach` (pending, plan M2z) | pending, plan M2z | Live-check minutes per plan down | too little data | retro 2026-10-21 pm: live-coach ran ok at M3g close, no minutes baseline |
| R7 | 2026-10-21 | gym-app | One orchestrator per plan, fresh one for the next from tracker and progress note | dotfiles this commit | Orchestrator cost per plan down ~55%; cache_write per plan down | too little data | retro 2026-10-21 pm: one orchestrator $3.05 for M3g, no per-plan baseline |
| R8 | 2026-10-21 | gym-app | Orchestrator waits on children in foreground Agent calls, never SendMessage then end turn; Casper items go to main at once | dotfiles this commit | Stalls 0; mockup-to-Casper latency under 10 min | worked | retro 2026-10-21 pm: orchestrator 0 stalls over 72 min of foreground waits |
| R9 | 2026-10-21 | gym-app | Split tasks over ~45 min at planning; implementers run only touched-file tests while iterating, full gate once in the hook | dotfiles this commit | Tests-while-iterating minutes per task down ~30%; tasks over 60 min 0-1 per plan | superseded 2026-10-21 (full gate now in landing step, R17) | retro 2026-10-21 |
| R10 | 2026-10-21 | gym-app | Questions for Casper raised at preflight and sent to main at once; independent work continues | dotfiles this commit | Idle wait on Casper with runnable work ~0 | too little data | retro 2026-10-21 pm: no preflight question this window; Android sign-in block surfaced only mid-T8 |
| R11 | 2026-10-21 | gym-app | Minors-only review gets no fix wave: minors ride in the landing or next task commit | dotfiles this commit | Minors-only fix agents per plan 0 | worked | retro 2026-10-21 pm: T6 and T8 minors rode in the land agent |
| R12 | 2026-10-21 | gym-app | Round 2 only when the fix wave touched concurrency, sync or ordering code; else a verifier | dotfiles this commit | Round-2 reviews per plan down ~80% with no escaped bug | worked | retro 2026-10-21 pm: one round 2 (46 s, $0.24) after sync-code fix, no escape |
| R13 | 2026-10-21 | gym-app | Gates-and-docs review area merged into the architecture reviewer | dotfiles this commit | Reviewers per task down by 1 on big tasks | worked | retro 2026-10-21 pm: close ran correctness + architecture reviewers |
| R14 | 2026-10-21 | gym-app | Plan close: one all-areas reviewer when no storage, sync or server code touched | dotfiles this commit | Close reviewers on non-sync plans 1 | too little data | retro 2026-10-21 pm: M3g touched sync, rule not exercised |
| R15 | 2026-10-21 | gym-app | Plan close full gate runs once in the last fix-wave commit, no separate land agent | dotfiles this commit | check-all runs per close 1 | superseded 2026-10-21 (full gate now in landing step, R17) | retro 2026-10-21 |
| R16 | 2026-10-21 | gym-app | Relay Casper's answers only after free-text questions are answered and he confirmed | dotfiles this commit | Re-relays and hold messages after a Casper answer 0 | too little data | retro 2026-10-21 pm: no re-relays seen, few Casper answers |
| R17 | 2026-10-21 | gym-app | Hooks light: commit and push hooks run only format and analyze, tests run in the landing step | dotfiles this commit | Commit hook under 20 s; gate minutes per task down ~70%; tasks failing at land no more than ~1 per plan above today | too little data | retro 2026-10-21 pm: 0 hook/land failures, ~2.3 min per land; 2 tasks only, 12.6 gate min/task vs 8.1 confounded by close and follow-up lands |
| R18 | 2026-10-21 | gym-app | Pairs dropped: no per-task before/after pairs, only on request or at milestone check | dotfiles this commit | Walk minutes per plan down ~90%; no look regression reported by Casper at milestone check | too little data | retro 2026-10-21 pm: no pairs shot; milestone check pending |

Baselines for R1 to R6 are the 2026-10-20 gym-app retro (page https://claude.ai/artifact/9iNqpfadNhwDrUJd8V1wmE) and its
row in retro-log.md (wall 15h29m, cost $36, gate 109 min, 90 agents). Per-task numbers start
with the first retro that has them; until then compare per plan.

## Casper's signal

Items Casper raised per feedback round or milestone check (from the project's roadmap and
plans, e.g. "Feedback round" plans). Fewer items per round means fewer misses reach him.

| date of retro | project | round / check | items |
|---|---|---|---|
| 2026-10-21 | gym-app | M3 For-you round | 8 items answered (2 changed: refused edits get a Sync log; server address became phone-only with first-launch choice), plus 1 mockup verdict (changed: row into Data, renamed) |
| 2026-10-21 | gym-app | M3g close open items | 4 questions answered (keep update-app row; sync log codes x2; Android check moved to phone) |
