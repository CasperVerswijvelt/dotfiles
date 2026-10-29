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
concurrency, architecture, over-engineering and dead code (including leanness: features or
options tacked on that complicate the UI, UX or code), code quality and resource leaks, UI
and responsive layout (including static performance: unneeded rebuilds, heavy visual
components, expensive work in build), copy and accessibility, docs against code, security
and leaked data, tests and CI, product fit. Also these standard areas:
- **UI guidelines:** are there written and test-enforced rules for which component serves
  which goal, spacing, radii, button hierarchy, sheets vs pages vs dialogs, scroll-behind?
  Report gaps, contradictions and unenforced rules, and propose the missing ones.
- **Visual consistency and widget reuse:** the same kind of thing looks the same
  everywhere; report local copies or near-duplicates of shared components.
- **UX walk:** walk the product as its user would. Friction is reported as product
  questions with a concrete example, not as fixes.
- **Zoomed-out architecture:** question the whole system for overengineering. Each finding
  says what a simpler system looks like and its technical cost. At stage `mvp` (the
  contract's Stage line) ask it "what would we delete for the actual user count":
  architecture weight, dead code, features not worth their upkeep. Its deletions are
  planned first (see 4).

Add the contract's extra areas; drop what the repo has no surface for (a non-UI project
skips the UI areas). When the focus is architecture, state and concurrency folds into the
architecture reviewer (they duplicated each other).

Each gets: the scope, the open PRs, the severities in `my-review` (the "caused by
this change" rule does not apply), and these rules: cite a `file:line` you read and a
concrete failure scenario; check code, not comments; respect recorded decisions; at
most 12 findings, most severe first; read-only. A finding that contradicts a recorded
decision is framed as "decision X costs Y", not as a bug.

## 3. Verify

One fresh reviewer per blocker or major finding (none for minors) tries to refute it, defaulting to "not valid" when
unsure. Every item that will go to Casper as a decision gets one too, whatever its
severity: it tries to refute the premise (does the situation it describes happen in the
code, file:line). Each returns: valid, worth fixing, severity, visible to users, needs hardware or
a human to settle, the smallest fix and the files it touches.

## 4. Plan

One Opus `my-reviewer` merges duplicates and groups the kept findings into PRs: one theme
each, reviewable in one sitting, every PR off the base and independent of the others
(no stacking). Per PR: title, why, files, screenshots yes/no, overlap with an open PR,
risk, technical cost (low, medium, high: lines and complexity added or removed, upkeep).
Only findings about stored data, sync, data loss and security are planned into PRs. Every
other finding goes into one list Casper picks from (a Needs you item), and is not executed
by default. A finding whose fix costs high (the cost rule in `CLAUDE.md`), any UX-walk friction and
any finding that reopens a recorded decision is a product decision with its cost, not a
planned PR. Simplification deletions come first in the order, before any hardening task,
so no fix hardens code that is about to be cut. A finding whose fix adds stored state, a stored
check or a new format goes to Casper as one question with a recommendation, not as a
series of edge-case decisions. Then a merge order, and the product decisions, each with options and a
recommendation. Other technical choices are made, not asked.

Every audit, the planner also produces:
- A short map of the canonical flow every feature should follow (how it reads, writes,
  syncs or communicates data). It is the yardstick for findings.
- An exceptions table: each place that deviates from that flow, with `file:line`, why it
  deviates, its existence cost (low, medium, high: lines, complexity, upkeep) and one
  option: make it fit (how, cost), remove (impact), or keep as a recorded exception with
  the trigger that ends it.
- Proposed long-term rules, each marked test-enforced (which test, and how) or
  reviewer-enforced.

## 5. Present

Counts (reported, kept, needs a human, rejected), the flow map, the exceptions table, the
proposed rules, the PR table, the merge order, then
the decisions as Needs you items (listed briefly in chat, or the status page when the contract names one). Spot-check two kept findings first.

Afterwards the planned PRs and the findings Casper picked run as plans through
`my-feature-flow`. A plan entry and its decisions are the input.
