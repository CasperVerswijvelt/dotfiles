# Workflow contract template

Copy this section into a project's CLAUDE.md and fill it in. Delete lines that do not
apply; the personal CLAUDE.md treats a missing contract as stage `mature`. Project specifics go in the
project's CLAUDE.md, never in this repo.

```markdown
## Workflow contract

- Stage: mature                 # mvp: review then merge, no changelog or PR screenshots
- Tracker: GitHub issues; read with `gh issue view <n> --comments`
- Host CLI: gh                  # gh | glab
- Fast gate: `<command>`        # format, lint/analyze on touched code; seconds to a minute; no full test suite
- Full gate: `<command>`        # everything; runs once per branch, before the PR, MR or merge. One command for both: set both to it
- Gate hooks: pre-commit and pre-push run (part of) the fast gate; installed by `<command>`   # or: none
- Base branch: main
- Merge policy: Casper merges   # or: the implementer lands after the review passes
- Landing: <command, or none>   # the step that merges to the base (rebase, tests, push); runs the test suite
- Cleanup: <command run at plan close>   # optional; default: remove the task's own worktree and merged branch
- Parallelism: <features in flight>   # optional; default: one main session, at most 2 features, landings one at a time
- Main session: <exact session title>   # optional; the one session that builds; planning sessions message it
- Changelog: CHANGELOG.md, `## [Unreleased]`   # or: none
- Preview: <command, or none>   # runs the branch for Casper's live check
- Pair tool: <skill or command and output folder, or none>   # before/after captures, only on Casper's request or at his milestone check
- Versioning: bump only on main when releasing
- Decisions log: docs/decisions.md
- Status page: <artifact url>   # optional; without it main lists what needs Casper in chat
- Review pitfalls: <blockers and majors specific to this project, or the file that lists them>
- Extra review areas: <name: what it covers>
- Lasting choices: <extra areas beyond CLAUDE.md's list, e.g. device protocol>   # optional
- Role exceptions: <e.g. hardware work keeps the main thread hands-on>
```
