# Catches

Value guard for retros. The value reviewer appends this retro's catches and escapes. A class
with repeated real catches is marked keep, and is not proposed for cutting without evidence
against it. A removed check that shows up under Escaped is proposed for restoring.

Severity: blocker, major, minor. Only real catches count: a confirmed bug or rule break, not
a style nit. Classes: each review area, plan-close review, live check, goldens, UI pairs,
gate, and any other named check.

## Caught

| date | project | class | what it caught | severity |
|---|---|---|---|---|
| 2026-10-21 | gym-app | correctness review | M3e T1 same-day weigh-ins sorted by random id | major |
| 2026-10-21 | gym-app | correctness review round 2 | M3e T4 account-switch left the old account's pull alive | major |
| 2026-10-21 | gym-app | correctness review | M3e T7b uploaded workout vanished when the pull after PUT failed | major |
| 2026-10-21 | gym-app | plan-close review correctness | M3e close, 5 s upload timeout wrapped the whole pull | major |
| 2026-10-21 | gym-app | correctness review round 2 | M3f T4 dependent mutations applied after retryLater | major |
| 2026-10-21 | gym-app | correctness review | M3g T2 owed full pull after refusal not persisted | major |
| 2026-10-21 | gym-app | correctness review | M3g T3 deleting a refused workout never queued DeleteWorkout | major |
| 2026-10-21 | gym-app | UI and product inside correctness | M3e T7a failed first pull left screens blank | major |
| 2026-10-21 | gym-app | UI and product inside all-areas | M3g T5 "Update the app to sync" hidden when outbox empty, found reading the pair | major |
| 2026-10-21 | gym-app | UI and product | M3g T7 demo server refused the first weigh-in of the day, unasked behaviour | major |
| 2026-10-21 | gym-app | architecture review | M3e close DTO-to-row write existed 3 times | major |
| 2026-10-21 | gym-app | architecture review | M3e T6 writeDtos in app not store | major |
| 2026-10-21 | gym-app | plan-close architecture | M3f close ReviewWorkout minted random ids so replays diverged | major |
| 2026-10-21 | gym-app | tests-gap check | 7 rubric majors for missing tests (M3e T4, T6; M3f T4 per-user isolation; M3g T1, T4, T5, T7) | major |
| 2026-10-21 | gym-app | docs review | M3 answers commit exposed a held item on STATUS and roadmap | major |
| 2026-10-21 | gym-app | gate | M3b spike broke the Space spacing rule | minor |
| 2026-10-21 | gym-app | goldens (check-all) | M3a slot_sheet re-render | minor |
| 2026-10-21 | gym-app | mockup (Casper) | Sync log moved into Data as "Server sync log" (product) | major |
| 2026-10-21 | gym-app | summary | about 150 minors, mostly stale plan text and test nits | minor |

## Escaped

Bugs found later (by Casper, a later plan, the live app) that an existing or removed check
would have caught.

| date found | project | bug | found by | check that would have caught it | check state (existing / removed) |
|---|---|---|---|---|---|
