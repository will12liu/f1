# Paddock (F1 career sim)

Browser Formula 1 career game, built like the NBA GM game (`/Users/williamliu/Coding/nba-gm`: read it for reference, never edit it). The plan and phases are in docs/HANDOFF.md. Built so far: Phases 0-6 (scaffold, data + types, race engine + calibration, season engine, 2D race view, resource dials + live race, key moments), stewards and flags, team-principal mode with an academy, real F2/F3 championships, and driver career mode (Phase 8 + 9, parts of 10/11).

## Commands
- `npm run dev`: app at localhost:5173 · `npm test`: vitest · `npm run typecheck`
- `npm run data:fetch [openf1|tracks|jolpica]`: download raw sources into `data/raw` (cached, gitignored; `--force` refetches). OpenF1 (results, qualifying, pit stops, safety-car messages, overtakes, drivers), MultiViewer (circuit outlines, pit-lane loss; new circuits are traced from OpenF1 positions). Jolpica is optional (it was unreachable/slow; nothing depends on it).
- `npm run data`: rebuild `public/data/world-2026.json`, `public/data/tracks/*.json` and `data/generated/targets.json`
- `npm run calibrate [races]`: sim races on the 2026 calendar with the real grid, compare with real averages (tuning knobs: `RACE` in `src/engine/race/model.ts`)
- `npm run check:season [seed] [seasons]`: sim seasons + winters headlessly (champions, car order, grid changes, development by age)
- `npm run check:career [seasons] [seed]`: driver careers for each background and start (auto training, best seat each winter): series, standing, overall, licence, first F1 seat
- `npm run check:manager [team] [seasons] [seed]`: team-principal seasons with an automatic principal (position, cap spend, profit, car rank, board)

## Workflow
- After each batch: `npx tsc --noEmit -p . && npm test`, then commit and push to main (Cloudflare Pages deploys main). Never force-push.
- Use Python for multi-line edits (BSD sed breaks). Check before creating files with common names.

## Layout
- `src/engine/`: pure TS, no React; runs in a Web Worker (`worker.ts`, Comlink). Everything random uses `rng.ts` (seeded mulberry32).
- `src/engine/race/`: `model.ts` (constants, tyres), `strategy.ts` (pit plans from the tyre model), `race.ts` (lap-by-lap runner), `dials.ts` (dial effects, commands, forecast type), `engineer.ts` (engineer calls), `qualifying.ts`, `replay.ts` (positions/timing at any time from a Replay).
- `src/engine/season/`: `season.ts` (next round, standings), `development.ts` (car upgrades, winter reshuffle, driver aging), `offseason.ts` (champions, retirements, driver market, junior ladder).
- `src/ui/` (pages, `race/RaceViewer.tsx` canvas), `src/state/game.ts` (zustand), `src/db/db.ts` (Dexie saves).
- `scripts/`: data pipeline. `data/manual/`: hand inputs (circuits, teams, hand driver ratings). `data/generated/`: written by scripts.

## Data notes
- Real names, teams, circuits and colours live in `data/manual/*` so they can be swapped for fictional ones before a public build.
- Driver ratings (14, 25-99): hand ratings 2/3 + data 1/3. The data part is a least-squares solve of teammate gaps (2025-26 qualifying best laps, race times) with the hand ratings as the prior (`scripts/build-world.ts`). Contract end years are approximate.
- Cars: power/aero/mech (0-100, relative) + reliability + dev rate. Level from each team's 2026 Q1 gap to the fastest, minus its driver's share; tilt by hand. `world.carMean` keeps the scale fixed across winters.
- 2026 grid: 11 teams (Cadillac joined), 22 drivers, confirmed from OpenF1 session data.

## Race engine (src/engine/race)
- Lap time = base × (1 + raceSpread·(carK·(100 − car pace at this track) + drvK·(100 − race pace)) + day form) + tyre cost(compound, wear) + fuel + damage + dirty air + noise (consistency) + mistakes. Car ≈ 75-80% of the spread (carK 0.064%/pt, drvK 0.03%/pt); gaps open up 1.6x over a race vs one lap. Day form (`dayForms(seed)`) is shared by qualifying and the race.
- Road order each lap, front to back: a car that would cross the line within `minGap` of the car ahead must pass it (logistic on pace advantage vs the track's overtaking difficulty, overtaking vs defending, racecraft, composure late on); failing leaves it stuck behind (dirty air next lap). Lap 1 and restarts pass easier. Contact chance per attempt (aggression, racecraft): damage, puncture, DNF, spin, penalties. Incident time losses go through `lapExtra` (never touch `cum` mid-lap).
- Pit strategy: `plans()` enumerates 0/1/2-stop compound sequences against the same tyre model (prefix sums); AI teams take the best or a close second. Cheap stops under SC/VSC are taken when they beat staying out. Two dry compounds are mandatory.
- Safety car / VSC: from crashes, collisions, stopped cars and debris (scaled by the track's `sc`). SC compresses the field and costs less in the pits.
- `createRace(input)` is a runner (`step()` = one lap, `result()`); `simRace` drains it. Deterministic from the seed (tested). Phase 6 adds `pending()/choose()` for duels with their own RNG.
- Calibration (`npm run calibrate 500`): DNFs, stops per finisher, SC/VSC shares, passes after lap 1, pole-to-win, winner from top 3, P1-P2 margin, lapped cars, quali→finish rank correlation. Targets: OpenF1 2023-26 and 2026 alone (`data/generated/targets.json`); passes and stops are hand targets (OpenF1's overtakes and pit lists count other things). All within 20% as of Phase 2. OpenF1 2026 race control says "VSC DEPLOYED", older seasons "VIRTUAL SAFETY CAR DEPLOYED".

## Season (src/engine/season)
- `simNextRound`: knockout qualifying (Q1/Q2/Q3) → race → `RaceSummary` + `Replay` stored on the world (`world.replays`, current season only), then in-season car development (dev rate, budget, harder near the top).
- `endSeason`: history record, drivers develop/age (peak 26-30, decline after), retirements, F1 market (expiring deals re-sign or walk; best car picks first from F1 free agents and F2), F3→F2 promotions and new F3 rookies, junior seats, winter car reshuffle (bigger in regulation years: 2030, 2035...), next calendar. Generated drivers who retire without an F1 start are dropped.

## Dials and the live race (Phase 5)
- `Dials` per car: pace 1-5, tyre care 1-5, fuel lean/std/rich, ERS harvest/balanced/attack/defend (battery 0-1, starts 0.6), engine low/std/high. Effects in `dialFx` (`DIAL` knobs): lap time, wear, burn, mistake/crash odds, mechanical odds, pass advantage. An empty battery can't attack or defend. A tank that can't make the lap lifts and coasts.
- Neutral = the AI. Cars nobody touched skip the dial maths (`car.ctl`), and dials never draw random numbers. Test `dials.test.ts` pins a hash of 60 races from before Phase 5: keep it passing.
- `runner.command({car, dials | pit: "box"|"stay", compound})` applies at the start of the next lap and is logged in `state.commands`. `RaceInput.commands` replays them: same input + commands = same race. `runner.forecast(idx)`: tyre laps left, battery empty lap, fuel margin, next stop.
- Live race (`/g/:id/live`, `LiveRace.tsx`): the worker's `prepareRound` gives qualifying + the input; the main thread runs `createRace` one lap ahead of the screen (`LiveSource.advance`); `commitRound(world, commands)` re-sims it in the worker and saves. `PitWall.tsx` is the panel. Trust is stubbed (`engineerAccepts`).

## Key moments (Phase 6, src/engine/race/moments.ts)
- The lap is a generator (`lap()` in race.ts): it yields a `PendingMoment` for the player's cars (`input.focus`, `input.moments` off/key/all); `runner.pending()/choose(opt)`. Calls at the start of a lap (safety car box, tyres gone, undercut, restart, fuel, black-and-white, team-mate swap, pressure) become dials/pit/letBy for that lap. Duels replace the logistic pass roll in a fight: the player's move vs the other driver's habit (`tendencies`, seeded by driver id), `PAYOFF` x the engine's own odds, `CONTACT` x contact chance; own RNG per duel (`seed:duel:lap:x:y`).
- "Instinct" (`auto`) runs the plain AI path (main RNG), so it equals the race nobody played (tested). Every answer goes to `state.choices`; `input.choices` replays them without waiting. Moment selection uses its own RNG (`seed:moment:...`) with spacing, a per-race cap ("key") and a repeat penalty.
- Habits seen in duels (`state.seen`) merge into `world.reads`; the card shows "Seen N times: he tends to ...". Live UI: `MomentCard` under the track, rings and IN/OUT lines on the canvas, setting on the pre-race screen.

## Race weekend (Phase 7, src/engine/race/weekend.ts)
- Career and team-principal live races start with practice (programme: setup work sharpens the engineer's estimate of the hidden ideal downforce; long runs +4 tyres for the race; quali sims +2 quali) and a setup slider (error from the ideal costs pace via `form`), then qualifying calls per session (risk 1-3: pace vs mistake/no-time odds; late run: faster track, more risk). `qualify` changes only odds and pace for planned entries, never the number of draws, so AI qualifying is unchanged. The plan (`WeekendPlan`, by driver id) goes through `prepareNextRound`/`juniorInput` and `commitRound`.

## Stewards and flags
- Track limits (strikes; black-and-white on the 3rd; 5s from the 4th; a few "prone" drivers per race), jump starts, unsafe release, pit speeding, collision penalties (5s/10s/drive-through, licence points). Drive-through/stop-go served on a later lap (`served` event, shown in the pit lane), else +20/+30s. Blue flags cost the lapped car and the leader a little. Local yellows (sector) after incidents. Red flag: SC-style lap, free tyre change, standing restart.
- Licence points on `Driver.licence`; 12 in 12 months = ban for the next round (`bannedFor`), `raceLineup` puts in the reserve or best free driver. Knobs in `RACE` (model.ts); calibrate checks red flags, penalties and strikes per race.

## Team-principal mode (src/engine/manager, src/ui/manager)
- `world.mode = "manager"`, `world.manager` (state.ts), `world.staff` (six key roles for every F1 team + free agents). Real-world money rules in `data/manual/manager.ts` (cost cap, prize fund, ATR scale, sponsor tiers, invented sponsor brands, facilities, staff pay).
- After each round (`managerAfterRound`, called from `simNextRound`): income (prize instalment, owner, merch, sponsors, bonuses), spending (drivers, staff, ops, engine fee; capped vs not), R&D projects tick and deliver (gain = size x efficiency x quality x room; 7% fail), facilities build, gardening leave ends, ATR refill at mid-season, board confidence (standings vs target), sponsor satisfaction, new offers, cap warnings.
- Winter: `managerSeasonEnd` (position bonuses, cap breach fines and ATR cut, board review and the sack after 2+ seasons, sponsor renewals/break clauses, staff contracts and ageing), `managerMarket` (our seats: expiring deals leave, pre-contracts arrive, `ensureSeats`), the AI market skips our team, `managerWinter` (next-year car work lands, new targets/ATR/offers). The player's team gets no automatic AI development.
- Actions (actions.ts, run in the worker via `act`): sponsors, projects, facilities, staff hire/poach/renew/release, drivers renew/release/sign/pre-contract/reserve, inbox, take a job after the sack. Race help: pit crew (stop time, slow stops), strategy (plan choice), engineers + simulator (pace) via `raceBoost` -> `Entry.pit/strat/form`. Team orders: `Command.letBy`.

## Junior ladder and academy
- F2 (14 rounds) and F3 (10) race on F1 weekends with the same engine (`season/juniors.ts`: spec cars at 0.6 of the spread, longer base lap, feature distance), standings, FIA super licence points (`Driver.sl`; 40 over 3 seasons = licence; the first winter seeds earlier points by level). F3 to F2 promotion by standings, F4 = prospect pool (15-18, not raced) feeding F3. F1 seats (AI market and the player) need a licence.
- Manager academy (`manager/academy.ts`): up to 6 academy drivers (yearly fee), scouts (focus F4/F3/F2) raise `knowledge` so the potential estimate (`potEstimate`, fixed per-driver bias) narrows, buy one F2 and one F3 team (your academy drivers get its seats), pay for seats elsewhere, programme level speeds their development every winter, academy graduates ask half the F1 salary.

## Driver career (src/engine/career/career.ts, src/ui/career)
- `world.mode = "career"`, `world.careerState`. Creator: name, nationality, archetype (6; primary +6, weak -5 and capped at 84), tier (academy/mid/self-funded: start ovr, pot, cash, fame), start F3 (17) or F2 (19), difficulty (XP multiplier, `duelEdge` in duels).
- After each round (`careerAfterRound`): your race (junior or F1) gives a 0-10 rating, Driver of the Day, XP (100 = 1 point), fame, team trust (vs expectation and team-mate), salary + endorsement income, endorsement offers by fame, F1 academy invitations; the last round makes seat offers (renewal, F2 step-up, paid seat, same series, F1 race seats where a deal ends if licensed, reserve).
- Points buy +1 on a rating (`pointCost` rises with the level), capped by archetype and by potential. Winter: natural growth (18% of the gap to potential while young; decline after `decline`). Target (check:career): academy/mid reach F1 in 3-5 seasons, a blue-chip is ~87 by year 5. Winter: `careerMarket` (accepted offer or the best free one) before the AI ladder/market, which never move, develop or retire your driver.
- Live: `prepareJunior` (worker) races your F2/F3 feature race; `commitRound(..., junior)` replays it inside `simJuniorRound`.
- Contract talks (`negotiateSeat`): money, years and a clause (release if a top team calls / number-one driver); acceptance from how much they want you, fame, agent; two rounds, then final; pushing too hard can lose the offer. Paddock life shop (`career/shop.ts`): items with a price, yearly upkeep and per-weekend perks (XP, morale, fame), some gated by fame.
- Life layer (`career/events.ts`): about one weekend in three draws an event (`EvDef`: weight over a context, options with `Fx`: fame, trust, morale, cash, XP, relationships, rival; some options are chances). It waits on the career page until answered. Morale moves race pace a little (`moraleForm`); a rival forms after 3 close finishes against the same driver.

## UI rules
- Big menus: `/` is a full-screen start menu (one panel per mode, its saves under it; `SaveMeta.mode/who/color` from `summarize(world)`), `/new/:mode` is the full-screen creator. Each mode's home is a hub (`components/hub.tsx`: `NextRace` banner, `BigStat`, `Tile`/`TileGroup`), the detailed pages stay in the top nav. Root font is 17px from 1024px wide, 18px from 1536px.
- No gradients, glass, emoji in headings, badge-above-headline, three-icon rows, fade-on-hover or fade-in-on-scroll, buzzword copy. Solid colours, high contrast, one spacing scale, plain labels.

## 2D race view (src/ui/race/RaceViewer.tsx)
- Tracks: evenly resampled polylines (index 0 = start/finish), corners as lap fractions. Positions come from each car's lap-end times (`lapEnd`) interpolated; pit laps spend their pit time in the pit lane at the end of the lap; retirements stop where they happened.
- Timing tower uses crossing times (gap to leader / interval), tyres, stops. Speeds 1x-16x (1x = 6 race seconds per second), last laps slow down, scrubber, +1 lap, skip to the flag, click a car to follow it.
