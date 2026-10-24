# Retro log

| date | project | sessions | wall | cost | gate minutes | agents | tasks | cost/task | wakes/task | gate min/task | review rounds/task |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-18 | gym-app | 1 | 3h58m | $45 | 45 | 67 | n/a | n/a | n/a | n/a | n/a |
| 2026-10-19 | gym-app | 1 | 11h13m | $87 | 140 | 134 | n/a | n/a | n/a | n/a | n/a |
| 2026-10-20 | gym-app | 1 | 15h29m | $36 | 109 | 90 | n/a | n/a | n/a | n/a | n/a |
| 2026-10-21 | gym-app | 66f20f75 + c18d3333 | 19h34m (main) | $190.11 | 203 | 164 | 25 | $7.60 | 0.2 | 8.1 | 1.36 |
| 2026-10-21 | gym-app | 86f48aee (pm) | 2h43m (main) | $13.42 | 25 | 19 | 2 | $6.71 | 0.5 | 12.6 | 2.00 |
| 2026-10-22 | gym-app | 2a6a6f1c (Mb to M4c, retro window 21 Oct 20:17 to 22 Oct 09:47) | 13h29m (main, incl. ~4h wait for Casper) | $79.64 | 137 | 174 | 27 | $2.95 | 0.5 | 5.1 | 1.00 |
| 2026-10-22 | gym-app | f115a4aa (M4b T5 to M5c T2, 10:47 to 18:49) | 8h02m (main) | $122.64 | 65 | 175 | 32 | $3.83 | 1.5 | 2.0 | 1.19 (commit proxy; 1.00 by the tool, no "Task <n>:" commits) |
| 2026-10-23 | gym-app | cb6be1d5 (M5c T3 to invites CLI, 22 Oct 19:51 to 23 Oct 09:54) | 14h03m (main, incl. 5h45m overnight; active 1h06m) | $124.32 | 54 (tool; it misses the one-call `just --justfile ... land` form: 54 land runs, 175 min by transcript) | 265 | 40 | $3.11 | 0.7 | 1.4 (tool; ~5.7 with land runs) | 1.00 (commit proxy) |
| 2026-10-24 | gym-app | 20 sessions (1ac19228, 1b8944fe, c95398f4, 2f9646e6 coordinator, +16; window 23 Oct 09:54 to 24 Oct 09:45; landing breakdown) | 165h28m (main, summed over 19 parallel mains; excl. 89d82544 open since 14 Oct; 386h04m incl.) | $566.90 (whole transcripts; ~$374 for agents started in window) | 1006 (tool: gate 326 + land 604 + goldens 76; misses `just gate`: 192 gate runs, 1145 min by transcript) | 882 (570 started in window) | 108 | $5.25 | 3.9 | 9.3 (tool; ~14 with `just gate` runs) | 1.32 (commit proxy) |
