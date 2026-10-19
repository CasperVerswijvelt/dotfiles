# Workflow contract template

Copy this section into a project's CLAUDE.md and fill it in. Delete lines that do not
apply; the personal CLAUDE.md treats a missing contract as stage `mature`.

```markdown
## Workflow contract

- Stage: mature                 # mvp: review then merge, no changelog or PR screenshots
- Tracker: GitHub issues; read with `gh issue view <n> --comments`
- Host CLI: gh                  # gh | glab
- Gate: `just check`             # add the full gate if there is one: (full: `just check-all`)
- Gate hooks: pre-commit runs `just check`, pre-push the full gate; installed by `just setup`   # or: none
- Base branch: main
- Merge policy: Casper merges   # or: my-orchestrator merges after the review passes
- Max parallel implementers: 3  # optional; default 3, the gate is CPU-bound
- Changelog: CHANGELOG.md, `## [Unreleased]`   # or: none
- Screenshots: the `pr-screenshots` skill       # or: none
- Versioning: bump only on main when releasing
- Decisions log: docs/decisions.md
- Status page: <artifact url>   # optional; main rewrites it on every wake
- Review pitfalls: <blockers and majors specific to this project, or the file that lists them>
- Extra review areas: <name: what it covers>
- Role exceptions: <e.g. hardware work keeps the main thread hands-on>
```
