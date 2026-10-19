---
name: my-pr-review
description: Review, grade and iterate on a change in any project. Use when asked to review a branch or PR, check whether it is mergeable, run the pre-merge review, or re-review after fixes. Also the reference for what counts as a finding, the severities and the grade.
---

# Review

**Mergeable at A-: zero blockers, zero open majors.** Minors never block. The grade is
computed from counts, never awarded. The rubric's project content (pitfalls, extra
areas) comes from the project's `## Workflow contract` and the files it points to.

## Running it

The orchestrator runs it as nested `my-reviewer` agents, never inline in a context that
wrote the code. Each agent's prompt holds only the refs (`base...head`), the ticket and
the approved approach and, for a UI change, the pair paths: never the author's rationale or a hint where to look. Commit first.

**Scale by diff, same bar.** Small (under ~150 changed lines, no new screen, no schema
change): ONE `my-reviewer` covers every area below (UI and product included when UI
changed), then the judge; no verify step. Larger: the full set. Plan-close review (wins over the small-diff rule):
correctness and architecture only, and no judge when there are no blockers or majors;
the grade then follows from the minor count.
Reviewers read code and, for a UI change, the before/after pair, not a walk folder.

1. **Areas**, in parallel, one `my-reviewer` each (Sonnet), blind to each other:
   - **correctness**: logic, state, async, error paths, data loss, trust boundaries.
   - **architecture**: layering, reuse of existing helpers, over-engineering, dead code.
   - **UI and product** (one area, also where the contract names ui and product as
     extra areas): UI at every supported size, the project's UI rules, copy and l10n.
     Use it as a first-time user would. Can everything created be used? Does
     each control do something visible, labelled in the user's words? Is the ticket
     solved, including sibling paths? An instruction taken too literally, where the
     intent was different, is a major. A fix that contradicts a recorded decision is
     marked "ask Casper".
   - **gates**: cite the gate result from the commit hook or the landing step output
     rather than re-running it on a branch whose commits went through the gate hook;
     re-run only when that evidence is missing or the branch has unhooked commits. Docs
     and changelog in step with the change.
   - every extra area the contract adds.

   Skip correctness, architecture and UI when no code changed. Each returns
   `{findings: [{area, severity, file, line, claim, scenario}], followups: []}`.
2. **Verify**: each blocker and major gets its own fresh reviewer that sees only the claim,
   the cited lines and the diff, and tries to refute it; minors get none. Its verdict is
   confirmed, refuted (with evidence) or unconfirmed; only confirmed counts, the others
   are reported.
3. **Judge**: one `my-reviewer` spawned on Opus. It merges duplicates, drops
   out-of-scope findings into follow-ups, checks severities against this skill and
   computes the grade. It reads each verifier's verdict body, not only the verdict
   word: a body that contradicts its word (REFUTED over text confirming the finding)
   takes the body's meaning, or the finding is re-verified.

## What counts

A finding is caused by this change: a line it adds or changes, or a regression it
causes elsewhere (cite both sites and the causal chain). It needs a concrete failure
scenario and something the reviewer read. A pre-existing bug, a missing feature the
change never claimed, or a refactor taste is a follow-up, never a finding.

## Severity

- **Blocker**: wrong output, crash, data loss, hang or security hole on a reachable
  path; a broken project principle; the ticket's problem still reachable; a bypassed
  gate (`--no-verify`).
- **Major**: wrong in a rare reachable state; risky logic with no test; a UI rule
  broken; logic duplicated where a shared helper exists; dead code added; docs now
  contradicting the code; a product dead end; a requirement missing or unasked work added.
- **Minor**: everything else. At most five reported.

## Grade

| Grade | Condition |
|---|---|
| A | 0 blockers, 0 majors, 0-2 minors |
| A- | 0 blockers, 0 majors, 3-5 minors |
| B | 0 blockers, 1-2 majors |
| C | 0 blockers, 3-5 majors |
| D | 1 blocker, or 6+ majors |
| F | 2+ blockers, or a red gate |

A gate failure that also fails on the base is pre-existing and does not count. A major
closes by a fix or by Casper's explicit waiver, which becomes a filed issue.

## Rounds

At most two. Round 2 reviews only the fix commits plus the open findings (fixed, not
fixed, regressed); new blockers count anywhere, new majors only in fixed code, no
minors. Anything still open after round 2 goes to Casper as a decision.

## Report

```
<branch or PR> [<grade>] round <n>
<what it does, 2 sentences>
Blockers (n) / Majors (n): file:line: defect. Failure: scenario.
Minors (n): file:line: one line
Unconfirmed (n) / Refuted (n): file:line: claim. Evidence.
Gate: <result>. Verdict: mergeable | not: <what must close>.
Ask Casper: <findings marked so, or none>
Follow-ups: <one line each, or omit>
```
