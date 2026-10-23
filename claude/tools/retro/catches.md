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
| 2026-10-21 | gym-app | correctness review | M3j T1 adopt skipped parent and reference checks | blocker |
| 2026-10-21 | gym-app | correctness review | M3j T2 adopt gave 500 on a malformed row, now 400 | major |
| 2026-10-21 | gym-app | correctness review | M3j T3 connect did not log out on a failed connect, no re-entry guard, phone-only check not exact | major |
| 2026-10-21 | gym-app | plan-close review correctness | M3j close: adopt refused local- photo names, phone photos lost on connect | blocker |
| 2026-10-21 | gym-app | correctness review | M3i T3 photo edits did not share the outbox queue rule after sign-out | major |
| 2026-10-21 | gym-app | correctness review | M3i T2 a linked account with a lost token could not sign in | major |
| 2026-10-22 | gym-app | plan-close review correctness | M3h close: History detail page read every workout | major |
| 2026-10-22 | gym-app | correctness review | M3h T4a History lost its order with old queued edits and hid a failed older read | major |
| 2026-10-22 | gym-app | correctness review round 3 | M4b T3 reopening the weight sheet in lb and tapping Done rewrote stored kg (1.25 became 1.27) | major |
| 2026-10-21 | gym-app | goldens (check-all) | M3i close: catalog harness rendered the unlinked UI | minor |
| 2026-10-22 | gym-app | goldens (check-all) | M3h close: catalog workout page needed its entry provider overridden | minor |
| 2026-10-22 | gym-app | correctness review (all areas) | M4b T5 hero weight stepper showed a hard-coded "kg" beside an lb value | major |
| 2026-10-22 | gym-app | plan-close review correctness | M4b close slot sheet chips converted the shown lb value twice (45 lb read 99.2) | blocker |
| 2026-10-22 | gym-app | correctness review | M4c T3 trained-day Semantics dropped the tap action, TalkBack could not open a day | major |
| 2026-10-22 | gym-app | plan-close review correctness | M4d close recovery read the clock once, Stats kept "Fatigued" after 48 h | major |
| 2026-10-22 | gym-app | correctness review (UI inside) | M4e T4 nothing-logged page was blank with a nameless row; exercise row blanked on pick | major |
| 2026-10-22 | gym-app | plan-close review correctness | M4e close right-only per-side set read "9/9" and drew two lines | major |
| 2026-10-22 | gym-app | correctness review | M5b T2 updated-routine row summary was not the changed count (decision) | major |
| 2026-10-22 | gym-app | correctness review | M5b T3 failed Undo mark left the row stuck "changed since"; workout note reused as title | major |
| 2026-10-22 | gym-app | correctness review | M5b T5 propose_routine tool text still said "saved" next to Apply (ticket requirement) | major |
| 2026-10-22 | gym-app | correctness and architecture review | M5b T7 importer titles over 80 chars refused the whole session; start sheet ignored the title | major |
| 2026-10-22 | gym-app | plan-close review correctness | M5b close Apply after Undo of a new routine was refused, blocking Apply all | major |
| 2026-10-22 | gym-app | correctness review round 2 | M5b close fix overwrote a live routine edited on another device | major |
| 2026-10-22 | gym-app | plan-close review correctness | M4g close neglected sort duplicated in the widget; Stats progress row read the head twice | major |
| 2026-10-22 | gym-app | UI and product inside correctness | M4d T4 recovery subtitle "last 7 days" did not match the 48 h logic | minor |
| 2026-10-22 | gym-app | live coach check | M5a lb replies echoed "(6 kg)"; fixed in the prompt (tests fake the model) | major |
| 2026-10-22 | gym-app | live coach check | M5b close live-coach seed lacked the new title after schema 27 | minor |
| 2026-10-22 | gym-app | mockup / milestone shots (Casper) | M4 milestone notes: Home placeholder removed and freestyle card, muscle rows too spaced, all workouts listed (became M4g) | major |
| 2026-10-22 | gym-app | mockup (Casper) | M5c suggestion rows need own leading icons; M5d plus icon and sheet; M6 undo placeholder, non-destructive alignment | major |
| 2026-10-22 | gym-app | goldens (check-all) | M4f close stale stats_recovery golden re-rendered | minor |
| 2026-10-22 | gym-app | summary | about 90 minors in per-task and close reviews, mostly plan ticks, stale comments, test gaps | minor |
| 2026-10-23 | gym-app | audit auditors (correctness) | audit C1: a phone pulling a routine that dropped an exercise deleted elsewhere failed every pull for good (FK order), A1 | major |
| 2026-10-23 | gym-app | audit auditors (correctness, state) | audit C3/C4/S5: after a long offline spell edits were refused one per cycle, a 5xx dropped queued photos, A2 | major |
| 2026-10-23 | gym-app | audit auditors (state, security, quality) | S2 stuck busy coach slot (A14), Q1 unbounded sign-in challenge map on a public host (A9), adopt library-id clash gave 500 (A3), restore mid-push (A3) | minor |
| 2026-10-23 | gym-app | audit verifiers | 3 of 20 verified claims rejected (C2, X1, P3); also confirmed C1, C3, P1 as real | minor |
| 2026-10-23 | gym-app | audit tests and CI auditor | CLAUDE.md claimed repo rules (radii, const new, no disabled lints) the test did not enforce; hooks check read local git config (A7) | minor |
| 2026-10-23 | gym-app | audit architecture auditor | arch-A1 to A3 notes were used by the M6 plan (photo queue with a kind, no eviction, backup, sweep folder) | minor |
| 2026-10-23 | gym-app | audit product-fit and undo auditor + its verifiers | P1 to P9 became A12 and A13 (about $7.3, 65 agent-min), removed the next morning by Coach Undo in place (948 lines gone): NIL value | nil |
| 2026-10-23 | gym-app | correctness review | A2 in-memory retry lost on restart (B round 1) | major |
| 2026-10-23 | gym-app | correctness review (UI inside) | A4 48 dp rest-close hit box moved the card content (B round 1) | major |
| 2026-10-23 | gym-app | correctness review | M5d T5 pending item type read stale, photo numbering per message not per conversation, sheet closed mid-correction written to (B round 1) | major |
| 2026-10-23 | gym-app | correctness review | M6 T1 connect summary ignored progress photos, fit values unbounded (2 rounds); M6 T5 single-photo Undo (B round 1) | major |
| 2026-10-23 | gym-app | correctness review (round 1 and round 2) | M6 T7b scrub row flickered on crossing a dot; round 2 found the fix froze the rows after a failed weight read | major |
| 2026-10-23 | gym-app | correctness review (rounds 1 to 3) | M6 T3 GPS removal failed open on a truncated JPEG; rebuilt from an allowlist, fail closed | major |
| 2026-10-23 | gym-app | plan-close review correctness and architecture | M5c close: exercise Undo after a failed marker, archived routine blocking Undo (code removed 2026-10-23); M6 close: duplicated photo route helper, plan text vs code | major |
| 2026-10-23 | gym-app | gate | repo_rules_test failed every land once core.hooksPath became absolute (M5c); A7 fixed the test | minor |
| 2026-10-23 | gym-app | mockup (Casper) | M6 T7b first mockup stacked two segmented controls; one app bar toggle instead (decision 176) | major |
| 2026-10-23 | gym-app | simplification review (5 lenses + judge) | 5 of 5 proposals approved by Casper; about 10.8k net lines out (REST routes, 20 walks, overwrite notices, Settings invites, Docker image stage) for $6.4 plus $17.2 to execute | major |
| 2026-10-23 | gym-app | summary | most per-task reviews (about 30 of 40) gave A or A- with minors only; no live-check or golden catch in this window | minor |

## Escaped

Bugs found later (by Casper, a later plan, the live app) that an existing or removed check
would have caught.

| date found | project | bug | found by | check that would have caught it | check state (existing / removed) |
|---|---|---|---|---|---|
| 2026-10-22 | gym-app | M3j demo snapshot test dated its weigh-in local tomorrow; the server refuses it between 00:00 and 02:00 Brussels | a landing run (flake) | a test that pins the clock | existing (no check caught it) |
| 2026-10-22 | gym-app | M3h perf test counted the 2 s watchPerformance flush as History load (read 2.1 s, real ~100 ms) | the implementer in T4d | a review of the measurement start point | existing (no check caught it) |
| 2026-10-22 | gym-app | settings golden stale from M4b T1 (08:51) to M4b T6 (11:12): weight-unit row added, no re-render; reviewers and a scout spent time on it | a reviewer and a scout at M4c/M4e | goldens in landing (just land runs only just check) | removed (goldens run at plan close only) |
| 2026-10-22 | gym-app | stats_recovery golden stale after 1f829c96 caption change, failed task gates until M4f close | a reviewer (M4e T4) and a scout | goldens in landing | removed (goldens run at plan close only) |
| 2026-10-22 | gym-app | M4g T2 muscle rows: plan said "normal 56 row", implementer only cut a gap, rows looked unchanged; the 36 px dense row took two more commits | Casper on the status page pair | a reviewer reading the after shot against the milestone note | existing (T2 all-areas review gave 3 minors) |
| 2026-10-22 | gym-app | Muscle list top and bottom padding off after the dense rows (DenseRows) | Casper | a reviewer reading the after shot | existing (no check caught it) |
| 2026-10-22 | gym-app | M4e exercise progress: Last 5 rows not tappable, row label said exercise type instead of what the chart plots | Casper on the preview | the M4e mockup check | existing (mockup approved it) |
| 2026-10-22 | gym-app | Exercise photo PUT carried no sync epoch, so a queued photo could upload after a backup restore | main reading sync code, fixed in task/photo-epoch (finder not in transcripts, unverified) | an M3 sync correctness review | existing (no check caught it) |
| 2026-10-23 | gym-app | M5d T5 built one profile row with unsure items as extra rows, not the per-item rows of Casper's approved mockup (progress.md ruling; he said work independently, re-shoot skipped); his verdict on the built UI is not in the notes (unverified) | the orchestrator's own ruling | a reviewer reading the built UI against the approved mockup shots | removed (no per-task pairs since 2026-10-19) |
| 2026-10-23 | gym-app | M6 T7b mockup stacked two segmented controls | Casper on the mockup | a UI-rules pass on the mockup (one concept, one look) | existing (no check caught it) |
| 2026-10-23 | gym-app | audit A12 and A13 built Undo dependency checks; Casper: "the persisted version grew too complex", removed next morning | Casper | the audit judge asking "does this fix add state at mvp" against the Undo principle (decisions 173, 177, 210) | existing (no check) |
| 2026-10-23 | gym-app | audit rejected D1 (unused entity REST routes) and D2 (one-off walks) as minor; the simplification review found them the top cut (about 6.9k lines) | the simplification review | an architecture or simplification lens in the whole-repo audit | existing (audit has none at mvp) |
| 2026-10-23 | gym-app | A7 injected clocks into route tests and added a demo path test that simplification T1 deleted within 50 minutes (ordering) | simplification T1 | run deletions before hardening on the same files | existing (no ordering rule) |
| 2026-10-23 | gym-app | A9 global challenge cap of 10,000 let one visitor lock every sign-in; per-visitor limit added a day later | the A9 review follow-up and main | a security verifier asked about abuse of the cap itself | existing (verifier accepted the cap) |
| 2026-10-23 | gym-app | walk scenarios rotted: walk-local start, weight-live, walk-offline fail on stale UI text on main; live-coach apply mode clicks "Apply" but the UI says "Apply all" | simplify-1 T1 and M5c close | the on-request walks run once per plan | removed (walks cut until release) |
