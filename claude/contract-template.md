# Workflow contract template

Copy this section into a project's CLAUDE.md and fill it in. Delete lines that do not
apply; the personal CLAUDE.md treats a missing contract as stage `mature`. Project specifics go in the
project's CLAUDE.md, never in this repo.

```markdown
## Workflow contract

- Stage: mature                 # mvp: review then merge, no changelog or PR screenshots
- Tracker: GitHub issues; read with `gh issue view <n> --comments`
- Progress note: <path>         # optional; where the orchestrator keeps task state, rulings and open questions
- Host CLI: gh                  # gh | glab
- Gate: `<command>`             # add the full gate if there is one: (full: `<command>`)
- Gate hooks: pre-commit runs `<gate>`, pre-push the full gate; installed by `<command>`   # or: none
- Base branch: main
- Merge policy: Casper merges   # or: my-orchestrator merges after the review passes
- Landing: <command, or none>   # the step that merges to the base (rebase, gate, push)
- Max parallel implementers: 3  # optional; default 3, the gate is CPU-bound
- Parallelism: <max plans at once, conditions>   # optional; plans, not implementers
- Changelog: CHANGELOG.md, `## [Unreleased]`   # or: none
- Preview: <command, or none>   # runs the branch for Casper's live check
- Pair tool: <skill or command and output folder, or none>   # before/after captures of changed UI states
- Versioning: bump only on main when releasing
- Decisions log: docs/decisions.md
- Status page: <artifact url>   # optional; main rewrites it on every wake
- Review pitfalls: <blockers and majors specific to this project, or the file that lists them>
- Extra review areas: <name: what it covers>
- Lasting choices: <extra areas beyond CLAUDE.md's list, e.g. device protocol>   # optional
- Role exceptions: <e.g. hardware work keeps the main thread hands-on>
```
