---
name: my-pr-flow
description: Take a change from branch to merge or open PR, in any project, by its Workflow contract. Use when starting feature or fix work, when work on a ticket begins, or when asked what still has to happen before a change lands.
---

# Branch to PR

The main thread starts a `my-orchestrator` with the task and relays its report. The
orchestrator runs these steps, delegating each one (gate runs, rebases and status edits
included). Read the project's
`## Workflow contract` first: its stage picks the path in step 6.

Agent descriptions follow the rule in `my-orchestrator`.

## 1. Branch off the base

```bash
git -C <repo> fetch origin <base>
git -C <repo> switch -c <type>/<slug> origin/<base>
git -C <repo> branch --unset-upstream
```

The last line keeps a bare `git push` off the base branch.

## 2. Plan

Read the ticket (the contract says how). Write a lean plan: per task the goal, files,
interfaces (signatures), test names with what each asserts, acceptance. Never full code.
A `my-scout` gathers what you need to know about the code.

- A new screen or changed layout (a layout decision): a mockup on the real UI (the
  actual app with only the asked change, the current look beside it) goes up for approval
  before it is built.
- A task about motion or feel carries Casper's verdict from a live check on the contract's
  `Preview`; without it the task waits, and the orchestrator stops and reports (it does
  not stay alive waiting). Main resumes with a fresh orchestrator that reads the progress
  note.
- Product questions go up as `my-orchestrator` says; a changed answer becomes a
  follow-up task.
- A big change (new screen, data model change) waits for Casper's approval of the plan.

Before implementation:

- **Preflight.** Check every task's files and interfaces against the base, read only, and
  record each adaptation or conflict in the progress note with its cost if wrong. An
  implementer reusing a preflight commit checks `git diff <base>` for deletions outside
  the task: preflight commits lag the base and would undo merged review fixes.
- **UI task check**, written in the plan: the user goal in one sentence; everything the
  task lets the user create is usable within the task; for each spec or decision
  instruction, what the user sees and does (if it reads oddly, ask Casper); the states
  (empty, loading, error, long, scrolled, saving) and their transitions, each with an
  animation note; the shared components used (a new one needs a reason).

Done when every task has files, interfaces, test names and acceptance.

## 3. Implement

One `my-implementer` per task, tests first. The prompt states whether it commits. Tasks run in parallel only when their files
are disjoint, at most 3 at once (the gate is CPU-bound) unless the contract sets another
number, and each parallel task gets its own worktree: the `my-implementer`'s prompt names the exact
path and it works only there. Remove the worktree after the merge.
A UI change gets before/after pairs of the changed states, captured by the implementer with the contract's `Pair tool` into a gitignored folder in the repo.

## 4. Gate

The contract's gate is green before the review. A red gate grades F, so reviewing
first wastes a round.

## 5. Review

Commit, then run `my-pr-review` until it passes or round 2 ends. Fixes go to a fresh
implementer and are committed before the next round. The implementer of the last wave
then lands the task (step 6), continued as the same agent. At plan close the plan-close
gate (`check-all` or equivalent) and the live check run in that last fix-wave implementer,
not a separate gate agent.

## 6. Land

**mvp**: no changelog, PR screenshots or release steps. After the review passes, merge to
the base if the merge policy allows (through the contract's landing step when it has one),
push, delete the branch.

**mature**:
1. Changelog entry, when the project keeps one (one line).
2. Screenshots through the contract's `Pair tool`, when it has one and the change is
   visible.
3. Rebase on the base and run the gate again. This is the last rebase.
4. Push and open the PR only when Casper asks. Never base a PR on another open PR.
5. After posting: sync by merging the base in, never force-push. New commits get a
   round-2 review.
6. Casper merges. Releases follow the Releases rule in `~/dotfiles/claude/CLAUDE.md`, never on the branch.

## 7. Report

The completion report, in the format `my-orchestrator` defines.
