---
name: my-decision-log
description: Record a settled product or process decision in the project's decisions log, or check it before reopening a question. Use when Casper settles a decision, when a default is taken for an open question, or before proposing something that may contradict an earlier ruling.
---

# Decision log

The log is the file the contract names, else `docs/decisions.md` (create it with a
`# Decisions` heading).

- **Append one line**: `- YYYY-MM-DD · <decision> · <why>`. In the same commit as
  the change it governs, when there is one.
- **A default taken for an open question** is logged the same way, ending `(default,
  awaiting Casper)`; replace the line when he answers.
- **Before reopening** a recorded decision, ask Casper. Grep the log first.
- **Archive** once it passes about 100 lines: move superseded and settled-and-encoded
  entries to `docs/decisions-archive.md` until the active list is about 60 lines, and leave
  a pointer line. Never drop a line.
