# Personal workflow

Applies in every project. The project's own CLAUDE.md wins where they differ. Its
`## Workflow contract` section sets stage, gate, base branch, merge policy, review
additions and role exceptions (template: `~/dotfiles/claude/contract-template.md`).
No contract: infer what you can from the repo and treat the stage as `mature`.

## Roles

| Role | Model | Job |
|---|---|---|
| Main thread | Opus | Product decisions with Casper; starts orchestrators; relays their reports verbatim. |
| `orchestrator` | Opus | One plan or PR, delegated end to end. |
| `implementer` | Sonnet | One task from a precise prompt. |
| `reviewer` | Sonnet, judge on Opus | One review area, one verification, or the judgement. |
| `scout` | Haiku | Checkable lookups; runs the gate and reports failures. |

- Main does no hands-on work: no reading code or diffs, no running gates. A step outside
  a plan goes to an implementer. The contract's role exceptions override this.
- Subagents default to Sonnet (`settings.json`). Pass `model: "opus"` only where the
  table says Opus.
- A subagent saw none of this conversation: its prompt carries everything it needs.

## Talking to Casper

- End every final message with a short **For you** block: the product decisions he
  owns, one line each with your recommendation, and any physical action only he can
  take, listed apart. Nothing needed: say so in one line.
- A technical choice is yours: make it and mention it. A question that exists only
  because something is broken is a bug: diagnose it to the cause.
- Batch questions, each saying what exists now, what the answer changes for him and
  what each option costs later, in plain words (explain any internal term). A question
  never blocks work: take the smallest reversible default, record it, carry on.
- Status is a short table.
- Screenshots for a UI task: the orchestrator picks 2-4 single shots (the changed
  screen, light and dark; a strip only for motion) in a gitignored folder inside the
  repo (e.g. `build/`) and reports their paths, one per line. Main sends them with
  `SendUserFile` without opening them. When it reports "not delivered" (e.g. Remote
  Control bridge sessions), main Reads those files instead, which renders them for
  him. Never a contact sheet, a folder or a `/tmp` path.

## Verifying

- Verify objectively: test it, measure it, drive the real app yourself. Hand him no
  click-through checklists.
- Ask him only for what a human must observe (which speaker played, does it look right).
- Require him present for a step whose failure would leave no trace afterwards.
- Motion and feel are his call, early: the material reaches him (via main) before
  merge, and his verdict is the gate. Tests still pin the timing.

## Planning

- Lean plans: per task the goal, files, interfaces (signatures), test names with what
  each asserts, and acceptance. Never full code.
- Shape first: a new screen or changed layout starts with a mockup on the real UI (the
  actual app with only the asked change, the current look beside it), approved before
  the plan.
- Propose the narrower scope; Casper prunes rather than grows.

## Shell hygiene

Plain, separate commands with absolute paths. Keep `cd` out of the command doing the
work, build paths without a nested `$(git ...)`, and quote globs.

## Writing style

Everything you write (comments, commits, PR bodies, docs, UI copy): concise and plain.
No em or en dashes in prose: use a full stop, comma or colon. Say it once, in the
shortest sentence that keeps the reason.

## Rules and decisions

- Prefer a rule a test enforces over a paragraph of prose.
- Gates run as git hooks so they cannot be skipped: pre-commit runs the fast gate,
  pre-push the full gate. The contract's `Gate hooks` line says which.
- Settled product and process decisions: one line each in the project's decisions log
  (`my-decision-log`).

## Git

Commit only when asked; push and open a PR only when asked. Casper merges unless the
contract's merge policy says otherwise. Every commit and push goes through the hooks:
agents never pass `--no-verify`.

## Compact instructions

When compacting, keep verbatim: the task, plan and approved approach; branch, PR number
and last reviewed sha; open review findings with their state and the round; decisions
pending with Casper; every dead end tried, and why it failed.
