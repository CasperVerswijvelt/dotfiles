---
name: my-repo-audit
description: Audit a repo with specialist auditors, verify every finding, and turn what survives into a plan of independent PRs plus the product decisions they need. Use only when Casper asks for an audit, a health check or "what should we fix", for the whole repo or since a ref. Audit and plan only.
---

# Repo audit

Ends with a PR plan and Casper's decisions, never with code. It runs many agents, so
say the rough count before starting.

## 1. Scope

Whole repo, or `since <ref>` (check it with `git rev-parse --verify`; auditors read
`git diff <ref>...HEAD` plus the code around it). Run from a clean checkout of the
current base. List open PRs with the host CLI, so nothing in flight is re-found.

## 2. Audit

One `my-reviewer` per specialty, in parallel, blind to each other: correctness, state and
concurrency, architecture, over-engineering and dead code, code quality and resource
leaks, UI and responsive layout, copy and accessibility, docs against code, security
and leaked data, tests and CI, product fit. Add the contract's extra areas; drop what
the repo has no surface for.

Each gets: the scope, the open PRs, the severities in `my-pr-review` (the "caused by
this change" rule does not apply), and these rules: cite a `file:line` you read and a
concrete failure scenario; check code, not comments; respect recorded decisions; at
most 12 findings, most severe first; read-only.

## 3. Verify

One fresh reviewer per finding tries to refute it, defaulting to "not valid" when
unsure, and returns: valid, worth fixing, severity, visible to users, needs hardware or
a human to settle, the smallest fix and the files it touches.

## 4. Plan

One Opus `my-reviewer` merges duplicates and groups the kept findings into PRs: one theme
each, reviewable in one sitting, every PR off the base and independent of the others
(no stacking). Per PR: title, why, files, screenshots yes/no, overlap with an open PR,
risk. Then a merge order, and the product decisions, each with options and a
recommendation. Technical choices are made, not asked.

## 5. Present

Counts (reported, kept, needs a human, rejected), the PR table, the merge order, then
the decisions in a **⚠️ For you** block. Spot-check two kept findings first.

Afterwards each PR runs through its own `my-orchestrator`, one at a time, never as a
parallel fan-out. The plan entry and its decisions are that orchestrator's input.
