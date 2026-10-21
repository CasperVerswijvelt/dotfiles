# Personal workflow

Applies in every project, to the main thread and every agent. The project's own
CLAUDE.md wins where they differ. Its `## Workflow contract` section sets the project's fields (template: `~/dotfiles/claude/contract-template.md`). No contract: infer what you can from the repo and treat the stage as `mature`.

## Roles

| Role | Model | Job |
|---|---|---|
| Main thread | Opus | Product decisions with Casper; starts `my-orchestrator` agents; relays their reports. |
| `my-orchestrator` | Opus | One plan or PR, delegated end to end. |
| `my-implementer` | Sonnet | One task from a precise prompt. |
| `my-reviewer` | Sonnet, judge on Opus | One review area, one verification, or the judgement. |
| `my-scout` | Haiku | Checkable lookups; runs the gate and reports failures. |

- Each `my-*` agent sets its own model. Ask for Opus only where the table says Opus or the contract's role exceptions do.
- A subagent saw none of your conversation: its prompt carries everything it needs.

## Verifying

- Verify objectively: test it, measure it, drive the real app yourself. Hand Casper no
  click-through checklists.
- Ask him only for what a human must observe (which speaker played, does it look right).
- Require him present for a step whose failure would leave no trace afterwards.
- Motion and feel are Casper's call, judged live on the contract's `Preview`: before the
  plan is written and again before merge. His verdict is the gate. Tests still pin timing.
- Show UI changes as before/after pairs (the contract's `Pair tool`), on the status page
  when the contract names one. A judgement item without a pair (a mockup) gets its images
  on the page the same way.

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
- Gates run as git hooks so they cannot be skipped. The contract's `Gate hooks` line says
  which gate runs where.
- The `my-*` skills and the project's Workflow contract override superpowers skills: in a
  project with a contract, do not load superpowers brainstorming, writing-plans,
  subagent-driven-development or using-git-worktrees.
- Settled product and process decisions: one line each in the project's decisions log
  (`my-decision-log`).
- This config stays generic and works in any project. Nothing project- or employer-specific
  goes here (trackers, hosts, team names, reviewers): it goes in that project's repo, reachable
  from its CLAUDE.md. Each side works without the other.

## Git

- Commit only when asked. Starting a plan or PR counts as asking for its commits. An
  orchestrator's prompt to an implementer states whether it commits.
- One commit per task where possible: the plan tick and the contract's progress note go in
  the task's last code commit, never in separate bookkeeping commits. The contract says
  what else waits for plan close (such as the tracker).
- Push, open a PR or merge only when Casper asks, or when the contract's merge policy
  lets the `my-orchestrator` merge (that includes pushing the base). Otherwise Casper
  merges.
- Every commit and push goes through the hooks: never pass `--no-verify`.
- Releases: when Casper asks for one, the version bump commit and the release tag go
  directly on the base branch, pushed without a PR. A project's contract can override
  this.

## Compact instructions

When compacting, keep verbatim: the task, plan and approved approach; branch, PR number
and last reviewed sha; open review findings with their state and the round; decisions
pending with Casper; every dead end tried, and why it failed.

## Main thread only

Agents skip this section: your own prompt says how you work and report.

- No hands-on work: no reading code or diffs, no running gates, no waiting loops
  (pgrep, until), no ops (container rebuilds, backups). Read-only lookups of the
  contract's tracker, plans, progress note and git state (log, status, branch) are fine.
  A step outside a plan goes to a `my-implementer`. The contract's role exceptions
  override this.
- An agent listed as "completed" may only be idle between its children: it is finished
  only when its final report arrives. Never claim a plan is unattended from the list alone.
- An orchestrator prompt points at the contract and the plan. It does not restate gates,
  close steps or merge policy.
- When something needs Casper, main's message ends with one bold line with an emoji, e.g.
  `**🔔 2 decisions and 1 action need you** (status page, or run /my-open-items)`. Nothing
  needed: no line. The items (lean context, what the answer changes, your recommendation)
  live in the status page's Needs you section; with no status page, list them briefly
  above that line: decisions with a recommendation, physical actions apart.
- Technical choices come in two kinds:
  - Local and reversible (naming, structure inside a module, which helper, test shape):
    make it and say nothing.
  - Lasting (data model or schema, file or wire formats, public or cross-module API, new
    dependency or platform, security or privacy model, anything costly to undo once
    shipped or once data exists): a Needs you item with a recommendation and what each
    option costs later. Once settled, it goes in the decisions log. A project's contract
    can add to this list.
- A question that exists only because something is broken is a bug: diagnose it to the cause.
- Talk to Casper about product behaviour and lasting choices only. No progress narration,
  no restating what an agent did, no summary of routine work.
- Batch questions, each saying what exists now, what the answer changes for him and
  what each option costs later. Describe the current state in Casper's words with a
  concrete example, no internal nouns. Check each recommendation against his recorded
  rules and decisions before giving it.
- Propose the narrower scope; Casper prunes rather than grows.
- Each project may name a status page in its contract (`Status page: <url>`). On every
  wake main rewrites it (Needs you / Running / Done this session) by
  reading the artifact URL and republishing. An answered question leaves the page. Done
  this session accumulates for the whole session, newest first; a new session starts it empty.
- Relay a final report as what changed for Casper, in at most three lines; when nothing
  changed for him (refactor, internal fix), one line, or nothing when a status page carries
  it. Details go on the status page. An interim or background notification never reaches
  Casper in chat; status lines go on the page.
- When Casper may still add to a docs request, ask him whether more is coming, or tell
  the implementer to commit but land only on main's go. A SendMessage that returns
  "queued" to an agent that is mid-land gets a fresh agent with a new task instead.
- Before stating what is running, check (agent list, task state); never recall.
- Condense an orchestrator report per the relay rule above. Its `Pairs:` block goes on the
  status page, or in chat when the contract names no status page; its For-you line becomes
  Needs you items on the page, then the one bold line. A status table only when 2+ plans run.
