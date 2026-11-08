# Personal workflow

Applies in every project, to the feature session and every agent. Feature-session-only rules live in the `Main thread` output style (`claude/output-styles/main-thread.md`). The project's own
CLAUDE.md wins where they differ. Its `## Workflow contract` section sets the project's fields (template: `~/dotfiles/claude/contract-template.md`). No contract: infer what you can from the repo and treat the stage as `mature`.

## Roles

| Role | Model | Job |
|---|---|---|
| Feature session | Opus | One per feature: product decisions with Casper, the plan, starts agents, closes the plan. |
| `my-orchestrator` | Opus | One plan with several tasks, delegated end to end. |
| `my-implementer` | Sonnet | One task from a precise prompt. |
| `my-reviewer` | Sonnet, judge on Opus | One review area, one verification, or the judgement. |
| `my-scout` | Haiku | Checkable lookups; runs the fast or full gate and reports failures. |

- Each `my-*` agent sets its own model. Ask for Opus only where the table says Opus or the contract's role exceptions do.
- A subagent saw none of your conversation: its prompt carries everything it needs.

## Verifying

- Verify objectively: test it, measure it, drive the real app yourself. Hand Casper no
  click-through checklists.
- Ask him only for what a human must observe (which speaker played, does it look right).
- Require him present for a step whose failure would leave no trace afterwards.
- Motion and feel are Casper's call, judged live on the contract's `Preview`: before the
  plan is written and again before merge. His verdict is the gate. Tests still pin timing.
  When a step waits on his live verdict, the agent reports and ends; the feature session
  hands the verdict to a fresh agent. No Opus agent idles waiting.
- A layout or look decision gets a mockup on the real UI before it is built. No per-task
  before/after pairs: shoot pairs (the contract's `Pair tool`) only when Casper asks for
  shots of a screen or at his milestone check, on the status page when the contract names
  one. A mockup gets its images on the page the same way.
- Images for Casper go on a private artifact page through `files`, never read by the model.
  A single quick shot: copy it shrunk with `sips -Z 800` into a gitignored folder in the cwd
  (build/) and Read that copy. An agent checking a shot shrinks it the same way. Each mockup
  round is a fresh agent. Native file sending does not work in remote sessions.
- A project with a web build gets one quick real-browser check of it at plan close (loads,
  works offline).

## Shell hygiene

Agents run hooks, landing, gate runs, builds, server starts and pair captures in the
foreground with a long Bash timeout (up to 600000 ms), never backgrounded: a subagent's
background completions go to the feature session, not to the agent or its parent. Never
background a command and then end the turn. Such a long command never shares a command
with a commit. No pgrep loops. Heavy runs (app test suites,
full builds) go through `~/dotfiles/claude/tools/heavy-slot`, which queues them (2 slots) and
gives up after about 5 min with "machine busy, run again": then just run the command again. Subagents have no Monitor, and macOS has no `timeout`. Never
poll with `sleep`. Never `sed -i`: use Edit or python3.

Plain, separate commands with absolute paths. Keep `cd` out of the command doing the
work, and never `cd` outside your worktree. Build paths without a nested `$(git ...)`,
and quote globs.

## Writing style

Everything you write (comments, commits, PR bodies, docs, UI copy): concise and plain.
No em or en dashes in prose: use a full stop, comma or colon. Say it once, in the
shortest sentence that keeps the reason.

## Rules and decisions

- Tests (mvp stage default; a project's contract `Tests:` line may override): test logic that
  can lose data or give a wrong answer (sync, save, undo, schedule and date rules, migrations,
  parsing, error paths). Flow tests only for multi-step user paths. No tests for layout
  constants, colour, copy, tokens or component choice (reviewers and repo rule tests cover
  those), except one pin for a layout bug that happened twice. Pin each property once, in the
  owning package. No getter or framework tests. A fix wave adds a test only for a reproduced bug.
- Prefer a rule a test enforces over a paragraph of prose.
- Commit and push hooks run only (part of) the fast gate (format, lint/analyze; seconds),
  never the test suite or other long work. The full gate runs once per branch, before the
  PR, MR or merge, so tests still cannot be skipped. The contract's `Gate hooks` and
  `Landing` lines say which runs where. No contract: infer both gates from the repo.
- Weigh every suggested or planned change or addition against its technical cost (code
  added, complexity, upkeep, what it locks in). When that cost is high, it goes to Casper
  as a decision stating the cost, even when the change looks small or was already
  recommended.
- Settled product and process decisions: one line each in the project's decisions log
  (`my-decision-log`).
- This config stays generic and works in any project. Nothing project- or employer-specific
  goes here (trackers, hosts, team names, reviewers): it goes in that project's repo, reachable
  from its CLAUDE.md. Each side works without the other.

## Git

- Commit only when asked. Starting a plan or PR counts as asking for its commits. An
  orchestrator's prompt to an implementer states whether it commits.
- One commit per task where possible: the plan tick goes in
  the task's last code commit, never in separate bookkeeping commits. The contract says
  what else waits for plan close (such as the tracker). Plan close also deletes the plan
  file (see Feature sessions).
- Push, open a PR or merge only when Casper asks, or when the contract's merge policy
  lets the agent merge (that includes pushing the base). Otherwise Casper
  merges.
- No new PR or MR, and no push to an open one, without a `my-review` grade of A- or
  better for that change, whatever its size, the agent type or docs-only. A prompt that
  asks an agent to open a PR names the review as the step before it.
- A worktree you create (`git worktree add`, or an agent isolation worktree) you remove
  once its work is merged into its target or pushed and reported (`git worktree remove`,
  never `--force`). Never remove one holding uncommitted or unpushed work. Leftovers: the
  `my-worktree-cleanup` skill.
- Every commit and push goes through the hooks: never pass `--no-verify`.
- Releases: when Casper asks for one, the version bump commit and the release tag go
  directly on the base branch, pushed without a PR. A project's contract can override
  this.

## Feature sessions

- One Opus session per feature (Casper runs 1 to 2 at once). It discusses the feature with
  Casper, may read code and make a mockup, and never writes app code or runs tests itself.
- Plan review before shipping: a clean `my-reviewer` reads the draft plan with the spec and
  decisions log and lists every question an implementer would still have to ask. The session
  answers each with Casper or records a default in the plan.
- A plan file (`docs/plans/<feature>.md`) has the sections listed in `my-feature-flow`
  (Required plan sections).
- On "Ship the plan" (or similar) it commits the plan on the feature's own branch (named by
  the contract's rules, cut from the base branch) and pushes it without opening a PR. Implementation continues on that branch, unless the contract lands each task to the base.
- It then starts the `my-orchestrator` (several tasks) or a `my-implementer` then a
  `my-reviewer` (one task), receives their reports, answers their questions with Casper in
  the same session, and sees the plan closed (its agents do the close steps: merge per the
  contract, tracker, cleanup).
- A worker hitting something unsettled takes the plan's default when one fits and lists it in
  its report. It stops only for a real product decision.
- Parallel landings rely on the contract's landing step rejecting when the base moved (rerun)
  and on the cap of 2 features. A small main session may exist for a standing loop, only to
  start feature sessions, never relaying.
- A plan file is deleted once implemented, in the change that implements it (the last
  task's commit or the plan-close step), so no plan ever reaches the base branch.
  Open follow-ups go into the PR body.
- A small fix Casper asks for directly needs no plan: the session starts an implementer.

## Memory

Auto memory is off. Nothing is remembered unless Casper asks. When he asks to remember something, write it into the repo: a settled decision in the decisions log (`my-decision-log`), a project rule in its CLAUDE.md, a procedure in a skill, a generic workflow rule here in the dotfiles. Never a memory file.

## Compact instructions

When compacting, keep verbatim: the task, plan and approved approach; branch, PR number
and last reviewed sha; open review findings with their state and the round; decisions
pending with Casper; every dead end tried, and why it failed.
