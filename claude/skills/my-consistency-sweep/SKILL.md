---
name: my-consistency-sweep
description: Find contradictions, duplicated rules and stale references across a project's instruction files and docs. Use on request, after a process or docs change, or when the instructions feel out of step with the code. Reports only.
---

# Consistency sweep

Reports only: Casper decides every fix.

1. **Group the files**: the root CLAUDE.md, each nested CLAUDE.md, the agent config
   (`.claude/skills`, `.claude/agents`, settings, task runner), and the human docs
   (README, docs/).
2. **Sweep**: one `my-reviewer` per group, in parallel. Each reads its group in full,
   using the other files and the code as evidence, and reports:
   - contradiction: a statement another file or the code contradicts (cite both sides),
   - duplicate: a rule written out at length where its home is elsewhere, so the copies drift,
   - stale: a file, function, flag, command or count that no longer exists or reads
     differently (quote the grep or ls).
   Each finding: `file:line`, the other side, the claim, the smallest fix.
3. **Merge** findings that one fix settles.
4. **Verify**: two fresh reviewers per finding try to refute it. Confirmed needs both.
5. **Report** confirmed, unconfirmed and refuted findings, each with its fix, then the
   fixes Casper should pick in a **For you** block.
