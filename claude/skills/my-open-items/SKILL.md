---
name: my-open-items
description: Walk Casper through every open item that needs his decision or input, one question at a time. Use for "go over open items", "what needs me", "walk me through the questions", or /my-open-items.
---

# Open items

Main thread only. Done when every open item has been asked, or deliberately parked by his answer.

1. **Gather** from the contract's `Status page:` Needs you section (Artifact tool, action
   read), the For-you lines of this session's orchestrator reports, and the open questions
   in the contract's Tracker and Progress note. Merge duplicates.
2. **Verify** each item against live state (agent list, task state, git, the log) before
   asking. An item already answered or moot is dropped, never asked from memory.
3. **Order**: decisions that block work, then defaults taken that he may override, then
   physical actions only he can do.
4. **Ask** with AskUserQuestion, one item per call, so his answer can reshape the next.
   - Context in 1-3 lean sentences in his words: what exists now, with a concrete
     example, no internal nouns. Then what the answer changes.
   - 2-4 options, recommended first and labelled "(Recommended)", each with its cost
     later. Check the recommendation against the decisions log first (`my-decision-log`).
   - A physical action gets "done" and "not yet".
   - Follow free-text answers literally: "not yet" or "keep talking" starts no work.
5. **Close** with one short summary of what was decided. Main does no hands-on work, so
   an implementer or the running orchestrator records the decisions per `my-decision-log`.
   Then update the status page: answered items leave Needs you, decisions go to Done this
   session. Start work only for what he approved. Relay answers to an agent only after
   every free-text question in his answers is answered and he confirmed; agreeing with his
   idea is not his decision.
