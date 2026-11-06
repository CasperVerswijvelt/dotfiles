# Personal workflow

Applies in every project, to the main thread and every agent. Main-thread-only rules live in the `Main thread` output style (`claude/output-styles/main-thread.md`). The project's own
CLAUDE.md wins where they differ. Its `## Workflow contract` section sets the project's fields (template: `~/dotfiles/claude/contract-template.md`). No contract: infer what you can from the repo and treat the stage as `mature`.

## Roles

| Role | Model | Job |
|---|---|---|
| Main thread | Opus | Product decisions with Casper; starts agents; relays their reports. |
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
  When a step waits on his live verdict, the agent reports and ends; main relays the
  verdict to a fresh agent. No Opus agent idles waiting.
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
background completions go to the main thread, not to the agent or its parent. Never
background a command and then end the turn. Such a long command never shares a command
with a commit. Never wait on another agent's process (no pgrep loops): if the machine is
busy, just run the command. Subagents have no Monitor, and macOS has no `timeout`. Never
poll with `sleep`. Never `sed -i`: use Edit or python3.

Plain, separate commands with absolute paths. Keep `cd` out of the command doing the
work, and never `cd` outside your worktree. Build paths without a nested `$(git ...)`,
and quote globs.

## Writing style

Everything you write (comments, commits, PR bodies, docs, UI copy): concise and plain.
No em or en dashes in prose: use a full stop, comma or colon. Say it once, in the
shortest sentence that keeps the reason.

## Rules and decisions

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
  file (see Planning sessions).
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

## Planning sessions

- A planning session (any number at once) discusses a feature with Casper, may read code and
  make a mockup, and never writes app code or runs tests.
- On "Ship the plan" (or similar) it writes `docs/plans/<feature>.md` (scope, acceptance tests,
  open questions answered), commits it on the feature's own branch (named by the contract's
  rules, cut from the base branch) and pushes that branch without opening a PR. The
  implementation continues on that branch. It then messages the main session: "plan ready:
  <branch> docs/plans/<feature>.md". It finds that
  session by the contract's `Main session` title (list_sessions or ListAgents, then
  send_message / SendMessage).
- A plan file is deleted once implemented, in the change that implements it (the last
  task's commit or the plan-close step), so no plan ever reaches the base branch.
  Open follow-ups go into the PR body.
- A small fix Casper asks for directly in the main session needs no planning session.

## Compact instructions

When compacting, keep verbatim: the task, plan and approved approach; branch, PR number
and last reviewed sha; open review findings with their state and the round; decisions
pending with Casper; every dead end tried, and why it failed.
