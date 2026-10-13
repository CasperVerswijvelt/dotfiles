---
name: my-pr-review
description: Review, grade and iterate on a change in any project. Use when asked to review a branch or PR, check whether it is mergeable, run the pre-merge review, or re-review after fixes. Also the reference for what counts as a finding, the severities and the grade.
---

# Review

**Mergeable at A-: zero blockers, zero open majors.** Minors never block. The grade is
computed from counts, never awarded. The rubric's project content (pitfalls, extra
areas) comes from the project's `## Workflow contract` and the files it points to.

## Running it

The orchestrator runs it as nested `reviewer` agents, never inline in a context that
wrote the code. Each agent's prompt holds only the refs (`base...head`), the ticket and
the approved approach: never the author's rationale or a hint where to look. Commit first.

1. **Areas**, in parallel, one reviewer each (Sonnet), blind to each other:
   - **correctness**: logic, state, async, error paths, data loss, trust boundaries.
   - **architecture**: layering, reuse of existing helpers, over-engineering, dead code.
   - **interface**: UI at every supported size, the project's UI rules, copy and l10n.
   - **gates**: run the contract's gate; docs and changelog in step with the change.
   - **product**: walk it as a first-time user. Can everything created be used? Does
     each control do something visible, labelled in the user's words? Is the ticket
     solved, including sibling paths? An instruction taken too literally, where the
     intent was different, is a major. A fix that contradicts a recorded decision is
     marked "ask Casper".
   - every extra area the contract adds.

   Skip correctness, architecture and interface when no code changed. Each returns
   `{findings: [{area, severity, file, line, claim, scenario}], followups: []}`.
2. **Verify**: each blocker and major gets two fresh reviewers that see only the claim,
   the cited lines and the diff, and try to refute it. Confirmed needs both. Anything
   else is refuted (with evidence) or unconfirmed; neither counts, both are reported.
3. **Judge**: one reviewer spawned with `model: "opus"`. It merges duplicates, drops
   out-of-scope findings into follow-ups, checks severities against this skill and
   computes the grade.

## What counts

A finding is caused by this change: a line it adds or changes, or a regression it
causes elsewhere (cite both sites and the causal chain). It needs a concrete failure
scenario and something the reviewer read. A pre-existing bug, a missing feature the
change never claimed, or a refactor taste is a follow-up, never a finding.

## Severity

- **Blocker**: wrong output, crash, data loss, hang or security hole on a reachable
  path; a broken project principle; the ticket's problem still reachable.
- **Major**: wrong in a rare reachable state; risky logic with no test; a UI rule
  broken; logic duplicated where a shared helper exists; dead code added; docs now
  contradicting the code; a product dead end; a requirement missing or unasked work added.
- **Minor**: everything else. At most five reported.

## Grade

| Letter | | Suffix | |
|---|---|---|---|
| A | 0 blockers, 0 majors | (none) | 0-2 minors |
| B | 0 blockers, 1-2 majors | - | 3-5 minors |
| C | 0 blockers, 3-5 majors | | |
| D | 1 blocker, or 6+ majors | | |
| F | 2+ blockers, or a red gate | | |

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
