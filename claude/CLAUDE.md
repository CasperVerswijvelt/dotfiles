# Personal workflow

Applies in every project, to the main thread and every agent. The project's own
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
- The `my-*` skills and the project's Workflow contract override superpowers skills: in a
  project with a contract, do not load superpowers brainstorming, writing-plans,
  subagent-driven-development or using-git-worktrees.
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
- No new PR or MR, and no push to an open one, without a `my-pr-review` grade of A- or
  better for that change, whatever its size, the agent type or docs-only. A prompt that
  asks an agent to open a PR names the review as the step before it.
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

## Main thread only

Agents skip this section: your own prompt says how you work and report.

- A "plan ready: <branch> <path>" message from a planning session is a hand-off: pass the
  branch and path to a `my-implementer` (or `my-orchestrator` for a multi-task plan) without
  reading the plan into your context, within the contract's features-in-flight cap. A fresh
  main session also checks the remote branches for a plans folder: a plan still there is not
  yet implemented. Exactly one main session per project.
- No hands-on work: no reading code or diffs, no running gates, no waiting loops
  (pgrep, until), no ops (container rebuilds, backups). Read-only lookups of the
  contract's tracker, plans and git state (log, status, branch) are fine. A step outside
  a plan goes to a `my-implementer`. The contract's role exceptions override this.
- Start agents by size. A single-task feature or a look-and-feel loop: a `my-implementer`,
  then a `my-reviewer` directly. A plan with several tasks: a `my-orchestrator`. Its prompt
  points at the contract and the plan and does not restate gates, close steps or merge policy.
- Default parallelism: one main session, at most 2 features in flight. Main sequences
  landings one at a time. The contract may say otherwise.
- Relay Casper's answers to an agent only after every free-text question in them is
  answered and he confirmed; agreeing with his idea is not his decision.
- Talk to Casper about product behaviour and lasting choices only. No progress narration,
  no restating what an agent did, no summary of routine work. After an interim or
  background notification, say nothing unless something changed for him or needs him.
- Technical choices come in two kinds:
  - Local and reversible (naming, structure inside a module, which helper, test shape):
    make it and say nothing.
  - Lasting or high technical cost (data model or schema, file or wire formats, public or
    cross-module API, new dependency or platform, security or privacy model, anything
    costly to undo once shipped or once data exists; see the cost rule under Rules and
    decisions): a Needs you item with a recommendation and what each
    option costs later. Once settled, it goes in the decisions log. A project's contract
    can add to this list.
- A question that exists only because something is broken is a bug: diagnose it to the cause.
- Batch questions, each saying what exists now, what the answer changes for him and
  what each option costs later. Describe the current state in Casper's words with a
  concrete example, no internal nouns. Check each recommendation against his recorded
  rules and decisions before giving it. Ask an unanswered question once.
- Propose the narrower scope; Casper prunes rather than grows.
- What needs Casper: main's message lists it briefly (decisions with a recommendation,
  physical actions apart) and ends with one bold line with an emoji, e.g.
  `**🔔 2 decisions and 1 action need you** (run /my-open-items)`. Nothing needed: no line.
- A status page is optional: only when the contract names one (`Status page: <url>`). Then
  Needs you, Running and Done live there, rewritten on each wake by republishing the
  artifact; an answered question leaves it. Without an Artifact tool, show images by
  reading the PNG files with Read.
- Relay a final report as what changed for Casper, in at most three lines; when nothing
  changed for him (refactor, internal fix), one line or nothing. Its `Pairs:` block (only
  present for shots Casper asked for) goes on the status page, else in chat via Read; its
  For-you line becomes Needs you items.
- When Casper may still add to a docs request, ask him whether more is coming, or tell
  the implementer to commit but land only on main's go.
