# Where we are (read this first)

_Last updated 2026-10-12. Everything below the line "Original brief" is the original handoff, unchanged._

## Paste this into the new session
> Read `docs/HANDOFF.md` (status first, then the original brief) and `CLAUDE.md`. We're building a browser F1 driver-career game in `~/Coding/f1`, same stack and structure as `/Users/williamliu/Coding/nba-gm` (read it for reference, never edit it). Phases 0-4 are done. Start Phase 5 (resource dials). The in-race mechanics must be resource dials plus attack/defend duels, not timing bars. After each batch: `npx tsc --noEmit -p . && npm test`, then commit and push to main.

## Done
| Phase | State | Where |
| --- | --- | --- |
| 0 Project and docs | Done except hosting (see Blocked) | `package.json` (same versions as nba-gm), `CLAUDE.md`, `wrangler.jsonc`, `public/_redirects`, `public/favicon.svg` |
| 1 Data and types | Done | `src/engine/types.ts`, `scripts/fetch.ts`, `scripts/build-world.ts`, `data/manual/{circuits,teams,drivers}.ts`, `public/data/world-2026.json`, `public/data/tracks/*.json` |
| 2 Headless race engine | Done, calibrated (500 races, all 13 metrics within 20%) | `src/engine/race/{model,strategy,race,qualifying}.ts`, `scripts/calibrate.ts` |
| 3 Season engine | Done | `src/engine/season/{season,development,offseason}.ts`, `scripts/season-check.ts` |
| 4 2D race view | Done, checked in the browser (desktop + phone width) | `src/engine/race/replay.ts`, `src/ui/race/RaceViewer.tsx`, pages in `src/ui/pages/` |
| 5 Dials | Done: dials, ERS battery, fuel, engine modes, commands + replay, forecasts, engineer calls, live race page with the pit wall. Checked in the browser: live result = saved result | `src/engine/race/{dials,engineer}.ts`, `race.ts`, `src/ui/race/PitWall.tsx`, `src/ui/pages/LiveRace.tsx` |

Tests: 20 passing (Phase 5 added `race/dials.test.ts`, including a hash of 60 races from before the dials). Earlier: 12 passing (`src/engine/world.test.ts`, `race/race.test.ts`, `season/season.test.ts`). Typecheck and `npm run build` pass. Two local commits on `main`.

## Open questions from section 10: what was picked (change any of them)
1. Data scope: real F1 grid only; F2 (22) and F3 (30) are generated drivers on real junior team names.
2. Sprint weekends and practice depth: later (not in v1 so far).
3. Single-player only; team-principal mode stays a later phase.
4. Visual style: team-coloured dots with codes on the track outline.
5. Car vs driver: realistic, about 75-80% car (carK 0.064%/pt vs drvK 0.03%/pt; race gaps 1.6x one-lap gaps).
6. Mobile: works at phone width, desktop first.

## Things that differ from the brief
- **Data source.** Jolpica stopped responding mid-download, so everything comes from **OpenF1** (results, qualifying, pit stops, race control, overtakes, drivers) and **MultiViewer** (circuit outlines, pit-lane loss). Madring and Sepang are not in MultiViewer: their outlines are traced from one OpenF1 race lap. Jolpica is optional (`npm run data:fetch jolpica`).
- **2026 grid** was confirmed from OpenF1 session data: 11 teams (Cadillac joined, Sauber is Audi), 22 drivers. The calendar is the 23 non-cancelled 2026 races (Bahrain/Jeddah cancelled; a "Bahrain GP" ran at Sepang).
- **Ratings.** Drivers: hand ratings (2/3) + a least-squares solve of teammate gaps in 2025-26 qualifying and races (1/3). Cars: each team's 2026 Q1 gap to the fastest, minus its driver's share, then a hand tilt to power/aero/mech. Aston Martin (~56) and Cadillac (~64) come out far behind because the 2026 data says so. Contract end years are approximate.
- **2026 regs:** no DRS; "follow within a second" is already in the pass model's threshold (overtake mode). There's no separate DRS/overtake-mode system yet; Phase 5 ERS is where it belongs.
- **Calibration targets.** OpenF1's overtakes (~265/race, counts every position swap) and pit lists (count drive-throughs) don't measure the same thing, so passes (45 after lap 1) and stops per finisher (1.6) are hand targets. The others come from OpenF1 2023-26 and 2026 alone. 2026 race control writes "VSC DEPLOYED", older seasons "VIRTUAL SAFETY CAR DEPLOYED".
- **The game currently starts at round 1 of 2026** with the real grid and simulates the whole season (it doesn't import the real 2026 results so far).

## Current calibration (npm run calibrate 500)
DNF/race 3.5 (real 2.6 all years, 4.2 in 2026) · stops/finisher 1.65 (1.6) · SC share 0.56 (0.48/0.53) · VSC share 0.39 (0.45/0.71) · passes after lap 1 44 (45) · pole wins 0.52 (0.63/0.71) · winner from top 3 0.84 (0.90/0.94) · P1-P2 margin 5.9s (8.6/6.5) · lapped cars 4.5 (4.7/6.4) · quali-finish rank corr 0.88 (0.79/0.85). Weakest: pole-to-win and margins are a little low.

## Blocked / needs the user
- **GitHub:** no remote yet and `gh` isn't installed. User creates an empty repo (e.g. `will12liu/f1-career`), then `git remote add origin https://github.com/will12liu/f1-career.git && git push -u origin main`.
- **Cloudflare Pages:** connect the repo, build `npm run build`, output `dist`.
- The preview tool in the old session started nba-gm's dev server (it read nba-gm's launch config). Run the F1 server on its own port: `npx vite --port 5174` (or the `f1-career` entry in `.claude/launch.json`).

## Added on 2026-10-12 (after Phase 5, on request)
- Stewards and flags (track limits, black-and-white flag, blue flags, yellows, red flag + standing restart, drive-through/stop-go, licence points and bans). Calibration all within 20% including the new metrics.
- Cars drawn as top-down F1 cars in team colours, a safety car on track, yellow/red sectors, penalty and flag chips in the timing tower.
- Team-principal mode (manager): money under the cost cap, sponsors, R&D with wind-tunnel allocation, facilities, staff (with poaching), driver contracts, board and the sack, FIA cap breaches, inbox, two-car pit wall with team orders. `npm run check:manager` for balance.

## Added on 2026-10-13
- Phase 6 key moments (duels + calls), F2/F3 races and super licences, manager academy and scouts, driver career mode (creator, XP and training, fame, endorsements, trust, silly-season offers, F1 path).

Also done on 2026-10-13: Phase 7 (practice programmes, setup vs a hidden ideal, qualifying calls), the career life layer (event deck, morale, relationships, rivals), contract negotiation with clauses, the paddock life shop, career balance (`npm run check:career`), IBM Plex Sans instead of Inter, save export/import.

Also on 2026-10-13 (UI pass): full-screen start menu with a panel per mode, full-screen new-game page, bigger type everywhere, hub home screens (next-race banner, stat strip, big tiles) for career, team principal and sandbox. Inner pages (training, R&D, people, standings...) still use the older, denser layout.

## Next
- Big-menu pass over the inner pages (Training, Deals, Life, R&D, People, Finance, Standings), and the live race pre-race screen.
- Phase 12 optional layers (investing, property, relationships, casino) if wanted.
- Phase 13: tutorial hints for dials/duels/weekend, a phone-width pass over the new pages, accessibility.
- Deeper AI for the other ten teams in manager mode (they still develop automatically), engine-component penalties, weather.
- Hosting is still blocked on a GitHub repo + Cloudflare Pages (see Blocked).

## Next: Phase 6 (duels) [done]
Phase 5 is done (see the table). Open points from it: AI cars always run neutral dials; the trust stub always accepts; the live race needs a driver picked each time (no career yet).

## Phase 5 plan (done, kept for reference)
Phase 5 plan, following section 5a:
1. Add `dials` to `CarState` (pace 1-5, tyre care 1-5, fuel mix, ERS deploy mode + battery charge, engine mode) with 3 = today's behaviour so calibration doesn't move. AI teams stay neutral (maybe vary late in races).
2. Effects in `race.ts` lap time / wear / fuel / reliability: push = faster now, more wear and fuel; tyre care = slower, less wear; ERS = a battery that drains in overtake/defend mode and refills when harvesting (adds to pass chance in `passT`/skill); engine high = power + mech DNF risk.
3. Runner API: `setDials(carIdx, dials)` applied from the next lap (stamp changes like the NBA live coach), stored as adjustments so `liveResult`-style replay reproduces the race.
4. Forecast helpers (pure): laps until the tyres are gone at current dials, battery empty lap, fuel to the end.
5. Engineer proposals: pit call from `plans()`; accepting/ignoring depends on trust (trust comes in Phase 8, stub it).
6. UI: pit-wall panel next to the timing tower in `RaceViewer` for the followed car, with gauges + forecast text.
7. Tests: each dial trades off correctly (push faster now, worse tyres later; ERS empty = no overtake mode), and a race with all-neutral dials is byte-identical to before.

Phase 6 needs: `pending()/choose()` on the runner, a duel when the focus car is within ~1s of another (freeze-frame with inside/outside arrows on the canvas), payoff tables, opponent tendencies (`career.reads`), own RNG keyed by lap + car pair, stored choices replayed so watched = recorded.

## Useful commands
`npm run dev` · `npm test` · `npm run typecheck` · `npm run data:fetch [openf1|tracks|jolpica]` · `npm run data` · `npm run calibrate 500` · `npm run check:season [seed] [seasons]`

---

# Original brief

# F1 Career Sim: handoff

A browser Formula 1 career game, built the way the NBA GM game was built: you are one person (a young driver), the AI runs everything else (teams, the grid, the seat market). Same stack, same philosophy, **different feel and different moment-to-moment mechanics**. This file is the brief for a fresh Claude Code session in a new folder. Copy it into the new project as `docs/HANDOFF.md`.

## 0. Decisions already made

| Topic | Decision |
| --- | --- |
| Mode | **Driver career** (you are one driver). A team-principal manager mode is a later, separate phase, not v1. |
| Start | F3 or F2 prospect (the equivalent of the NBA draft prospect). Combine-style testing, junior seasons, then a seat or no seat in F1. |
| Race sim | Lap by lap, watched on a 2D top-down track (the equivalent of the simcast court). Time slows down at decisions. |
| In-race mechanics | **No timing bars.** Two systems instead: (1) **resource dials** you set and adjust for the whole race, (2) **attack/defend duels** where you choose a line and may get beaten. |
| Data | Real teams, drivers and tracks (like real 2K ratings in the NBA game). Keep names in data files so they can be swapped for fictional ones before publishing widely. |
| Pacing | Player decides: full weekend (practice, qualifying, race), or auto-sim parts. |
| Borrow | Life layer, progression (XP/points/potential/archetypes), contracts and market, and the tech stack plus hosting. Mechanics get reused, the basketball flavor does not. |
| Hosting | Static site on Cloudflare Pages, auto-deploy from GitHub main. Saves in IndexedDB. No backend. |

## 1. Setting up the new project (do this first)

1. New folder (for example `~/Coding/f1-career`), `git init`, create an empty GitHub repo, connect it.
2. Scaffold: `npm create vite@latest . -- --template react-ts`, then add Tailwind 4, Zustand, Dexie, Comlink, Vitest. Match the NBA game's `package.json` versions (read them from `/Users/williamliu/Coding/nba-gm/package.json`).
3. Copy the NBA game's `CLAUDE.md` structure (commands, layout, notes). Start the F1 one short and grow it with each phase, exactly as the NBA one grew.
4. Add `public/_redirects` with `/* /index.html 200` (SPA fallback), a favicon, and a `wrangler.jsonc` like the NBA repo has.
5. Cloudflare Pages: connect the repo, build command `npm run build`, output `dist`. Every push to main deploys.
6. Standing workflow the user wants: after each batch run `npx tsc --noEmit -p . && npm test`, then `git add -A && git commit && git push origin main` without asking. Never force-push. Commit messages end with the Co-Authored-By line from the session.
7. Keep the NBA repo open read-only as a reference: `/Users/williamliu/Coding/nba-gm`. Copy files out of it, never edit it from the F1 session.

## 2. What to borrow from the NBA game (map)

Legend: **Copy** = take nearly as is, rename. **Adapt** = same structure, new content. **Skip** = basketball-specific.

### Tech and plumbing (Copy)
- `src/engine/rng.ts` (seeded mulberry32, `hashString`). Everything random must use it.
- `src/db/` Dexie saves, `src/state/` zustand store, Comlink worker wrapper: the pattern of "engine runs in a worker, UI calls it, save to IndexedDB".
- Vitest setup, the `scripts/` pattern (`data:fetch` cached into `data/raw`, `data` builds `public/data/*.json`, `calibrate` compares sim averages to real targets, `check:career` plays a career headlessly).
- Tailwind theme classes (`panel`, `btn-primary`, `input`), the `ui/icons.ts` emoji-art approach.

### Career layer (Adapt)
| NBA file | F1 version |
| --- | --- |
| `career/archetypes.ts` (position, height, archetype, tier -> ovr/pot, mentality) | Driver creator: nationality, height/weight (weight matters in F1), archetype (Qualifier, Racer, Tyre whisperer, Wet-weather specialist, Aggressor, Technician), tier (big-budget academy, mid-level, self-funded/pay driver), personality. Fixed start ovr/pot per tier so careers are comparable. |
| `career/flow.ts` (startCareer, simToCombine, enterDraft, stepOffseason) | `startCareer` -> junior testing -> F3 season -> F2 season -> F1 seat market. Stage field on `career` just like `stage`. |
| `career/combine.ts` + `Drills.tsx` + `CombineGames.tsx` | Rookie test days: simulator laps, reaction/fitness tests, a simulated race stint, team workouts (visit F1 team simulators and move their interest in you, like `career.interest[tid]`). Mini-games here may use different mechanics from the race ones (see section 5), not timing bars. |
| `career/difficulty.ts` | Rookie / Pro / Champion / Legend: scales how forgiving duels and dials are, XP, trust speed. |
| `season/progress.ts` (XP per game, weekly points, `attrCap`, potential) | XP per session/race, weekly conversion to attribute points, car-specific ceilings, driver peak/decline age (drivers peak later than basketball players, roughly 26-34). Reuse the "ovr can't pass pot" and persistent fractional offset ideas. |
| `career/career.ts` trust (coach trust drives minutes) | **Team trust** drives seat security, car upgrade priority (who gets the new floor first), strategy priority, and #1/#2 driver status. Moves with results vs expectation vs teammate. |
| `career/life.ts` (fame, relations, rivals, deals, event deck, cooldowns, `shouldStop`) | Fame, relations (race engineer, team principal, manager, mentor, press, family, teammate), rivals (formed from on-track incidents, team-mate wars, "cooked" equivalent: outqualifying a champion by big margins), sponsors/endorsements, event deck (write 150+ events, many by archetype and situation). Reuse `EvDef`/`Fx` structure and the `w: (ctx) => weight` pattern. |
| `career/shop.ts` / `shopData.ts` | Paddock life shop: simulator rig at home, private trainer, nutrition, watches, supercars (invented brand names), helicopter, boats, apartments in Monaco-like cities. Perks give XP %, fitness, fame, focus. Same perk system (`perksOf(owned)`). |
| `career/invest.ts`, `property.ts`, `love.ts`, `casino.ts` | Copy nearly verbatim as an optional "off-track life" layer, rename flavor. Do these last. |
| `career/rookie.ts`, `flow.ts` extensions, `tradereq.ts` | **Contracts**: junior team offers, F1 reserve driver deal, race seat contract with length, salary, performance clauses, options for the team, buyout clauses. Request a release/seat swap = trade request. Mid-season extension talks. |
| `career/rating.ts` (0-10 match rating, player of game) | Driver rating per race (0-10) and Driver of the Day. |
| `season/` team trust, hype, form | Team form (car development momentum), driver form, fan hype. |
| `offseason/` phases | Winter phases: development -> silly season (driver market) -> car launch (new regs/upgrades revealed) -> testing -> season. |
| `trade/` | The **driver market**: AI teams evaluate drivers (pace, age, sponsor money, nationality, team fit) and sign/drop them across the season. Reuse value/need-based evaluation, not the CBA rules. |

### Skip (basketball-specific)
`sim/game.ts` possession engine, `court2d.ts`, `Simcast` court art, draft lottery, CBA cap rules, rotations/minutes, the 30-team trade-block logic. Reuse only the *shapes*: a generator that yields moments, a runner with `step()`, `pending()`, `choose()`, `result()`, a replay layer that rebuilds positions from events.

## 3. The game, in plain words

You are a young driver. You choose how to spend your time, grow your skills, race on weekends, deal with a team, rivals, press and family, and try to reach and win in F1. The AI runs every team, every other driver, the car development race and the seat market. A season has a calendar of rounds (real circuits). Weeks between rounds are life: XP spending, events, shop, sponsors, contract talks.

### Ladders
- Career modes of play: F3 -> F2 -> F1 (F1 reserve/test driver allowed). Each series has its own grid, calendar (shorter), teams, car quality range.
- **Super licence points** from junior results gate the F1 jump (use the real idea: points for finishing positions in F2/F3 over three seasons).
- AI drivers also progress and get seats, so the grid changes every year.

### Driver ratings (about 14, 0-99 like the NBA ones)
Qualifying pace, Race pace, Racecraft, Overtaking, Defending, Starts, Tyre management, Fuel/energy management, Wet weather, Consistency, Composure (under pressure), Aggression, Technical feedback (car development), Fitness. One `ovr` formula (fit it so a given car + driver ovr gives realistic lap-time deltas). Archetypes boost some and cap weaknesses exactly like `archCap`. A weight/height slider affects car fit (taller/heavier = minor lap-time penalty, fitness impact).

### The car (not a driver rating)
Each team has a car with Engine, Aero, Chassis, Reliability, plus a development rate. **In F1 the car is most of the result**: model roughly 70-80% car, 20-30% driver at the limit. The team's car improves during the season through the AI development race, and your `technical feedback` and `trust` change how much of the development you steer. 2026 is a new regulation year (new engines/aero), so give the car ratings a reset-and-reshuffle event each winter.

### Weekend flow (player can skip any part)
1. **Practice** (skippable): setup mini-decision (set a few setup sliders: downforce, ride height, gears; bad guess costs pace; engineer advice improves with trust) and learning tyre degradation, which reveals info used in the race.
2. **Qualifying**: Q1/Q2/Q3 knockouts. One-lap pace from `qualifying pace`, car, setup, track evolution, tyre set, traffic. Your decisions use the **dials** (below) not a bar: how much risk on the out-lap, when to go out, which tyre. Mistakes (a lock-up, running wide) are a risk roll that grows with push level.
3. **Race**: lap-by-lap, watched on the 2D track, with dials and duels.
4. **After**: result, driver rating 0-10, Driver of the Day, morale, press, trust/fame/XP, events.

## 4. The race engine

Pure TS in `src/engine/race/`, no React. Deterministic from the seed (same discipline as the NBA sim). A `createRace` runner that you step lap by lap (and in sub-steps within a lap for animation), mirroring `createGame` in `sim/game.ts`.

### Per-car state each lap
Position, gap to car ahead/behind, tyre compound + age + wear, fuel load, battery (ERS) charge, engine/gearbox wear, damage, DRS availability, pit plan, penalties, status (running/DNF), plus the driver's current dials.

### Lap time model
```
lapTime = trackBase
        + carDelta(team car, track type weighting: power / downforce / mechanical)
        + driverDelta(driver pace rating, wet factor)
        + tyreEffect(compound grip, wear curve, temperature window)
        + fuelEffect(weight)         // lighter = quicker as fuel burns
        + dirtyAir(gap ahead < 1s)   // costs time and tyre wear
        + dialEffects(push, tyre care, ERS)
        + noise(consistency)
```
Fit it so a typical race has realistic gaps, pit windows, two-stop vs one-stop trade-offs, and overtakes per race. Start with a dry race and add wet/mixed weather second.

### Events the engine produces
Start (grid, launch, lap-1 incidents), overtakes (resolved by duels or auto), pit stops (undercut/overcut, slow stop chance), safety car / VSC / red flag (rate by track), mechanical DNFs (reliability), collisions (aggression, contact penalties), weather changes, penalties (track limits, collision, unsafe release), team orders, DRS trains, fastest lap. All of these go into an event list for the replay.

### Calibration targets (build `npm run calibrate` for F1)
Real averages to hit: DNF rate per race, safety-car chance per race, overtakes per race by circuit type, pit stops per driver, number of lead changes, pole-to-win conversion, qualifying-to-finish correlation, lap-time spread between teams, points distribution. Gather targets from the last few seasons of real data.

## 5. Mechanics that are NOT timing bars

The NBA game uses timing bars at key moments and in drills. The F1 game must feel different. Two pillars:

### 5a. Resource dials (the whole race)
Persistent controls on a pit-wall panel that you can change at any time (changes apply at the next lap). Every dial trades a short-term gain against a later cost, so the skill is planning and reading the race.

- **Pace (1-5)**: push harder for lap time vs. protect tyres/fuel/engine.
- **Tyre care (1-5)**: smooth vs. aggressive; affects wear rate and temperature.
- **Fuel mix**: lean to save fuel (needed in some strategies), rich for speed.
- **ERS deploy**: battery charge is a real resource. Choose where to spend it: overtake mode (adds speed for a set of laps), defend mode, harvest. Running out at the wrong time loses places.
- **Engine mode**: standard, high (power, but wear and reliability risk).
- **Brake bias / balance (small)**: optional, low priority for v1.
- **Pit call**: you can request a stop; the engineer proposes strategy and you accept or push back (trust matters: low trust = he ignores you or argues).

UI: gauges + a small forecast ("at this pace tyres are gone in 9 laps", "battery empty by lap 34"). Teach the player through the forecast, not a manual.

### 5b. Attack/defend duels (the key moments)
When you are within about a second of another car (and more likely with DRS or a tyre/ERS advantage), the race **pauses on the track** (a freeze-frame like the NBA "hold") and you pick a move. The opponent's response is chosen by his AI profile. Outcomes come from a payoff table weighted by skills, car delta, tyre delta, ERS spent and the track's overtaking difficulty.

Attack options: **Inside line**, **Outside line**, **Late braking**, **Switchback / dummy**, **Wait and set up** (save tyres, gain info), **Commit with ERS** (spend battery for a better chance).
Defend options: **Cover inside**, **Cover outside**, **Hold the racing line**, **Late defend** (risky, can be penalized), **Yield** (protect tyres, accept the position).

Mechanic rules:
- Every move has a success window that depends on counters. Inside beats a defender covering outside; late braking beats a soft defender but risks lockup and contact; a dummy beats a defender who commits early.
- **Reads**: opponents have tendencies (a late defender, an early coverer). Each duel with them reveals part of the tendency (stored on `career`), so the player learns drivers the way a real racer would.
- **Risk meter**: aggressive moves have a contact chance; contact can mean damage, a penalty, a puncture or a DNF for both.
- **Composure**: how much the pressure of a rival, a last-lap duel or a title fight reduces your effective rating.
- You can choose "let the engineer/driver instinct decide" (auto at your skill level), same as the NBA "standard option".
- Duels use their **own RNG** keyed by lap and car pair (same trick as `moments.ts`), so skipping or auto-playing a duel never changes the rest of the race in unrelated ways.

Other non-bar ideas you can use for variety (drills, qualifying, rookie tests, press): sector-by-sector "ideal line" puzzles where you pick an approach per corner type, setup trade-off sliders with hidden optimum learned across sessions, memory/sequence tasks for pit-stop crew, short strategy puzzles ("tyres will die at lap 22, rain at lap 30, what do you do?"). The principle: **decisions with trade-offs and information, not reflexes.**

### 5c. Moment catalog (borrow the structure of `sim/moments.ts`)
Each moment is a `sit({...})` with a weight function over a context (lap, position, gap, tyre state, weather, championship situation) and a list of option ids (first option = default). Roughly 60-100 situations: lap-1 scramble, restart after safety car, undercut chance, defend a podium on old tyres, team-order request, teammate battle, rival duel, lapped traffic, rain onset (pit for inters or gamble), last-lap duel, title decider, red-flag restart, mechanical warning on the radio, mistake recovery. Penalize repeats like `seenSits`.

## 6. The 2D race view

Same idea as `Simcast` + `court2d.ts`: the engine produces events, a replay layer rebuilds positions, a canvas draws them.

- Each circuit is a closed polyline (or SVG path) with start/finish, sector markers, pit lane, DRS zones. Source options: hand-simplify real outlines; or derive from open telemetry data (OpenF1/FastF1 position data is public, verify current availability and terms). Store as JSON under `public/data/tracks/`.
- Positions: from each car's cumulative race distance (laps + fraction), mapped to the polyline with interpolation. Gaps become distances. Cars on the same spot offset laterally by line (inside/outside during duels).
- Include a **timing tower** (positions, gaps, tyre compounds, pit counts), lap counter, weather, safety-car banner, and a mini-map with sectors.
- Time controls: 1x, 2x, 4x, skip to next moment. Slow down automatically during duels and the final laps (like `slowZones` in `Simcast`).
- Freeze-frame at a duel with arrows on the track showing the move options (inside/outside), so no text-only cards.

## 7. Data pipeline (first real work)

Put all real-world facts in `data/` files built by scripts, exactly like the NBA game. Everything must be swappable.

- **Calendar**: current season rounds with circuit, date, laps, distance, overtaking difficulty, weather profile, characteristics (power/downforce/mechanical), tyre allocation. Sprint weekends if you want them (flag, can be v2).
- **Teams**: names, colors, base car rating, reliability, development rate, budget, drivers and contracts.
- **Drivers**: current F1 grid plus F2 and F3 grids and a prospects pool (academy drivers, karting graduates). Ratings derived from results data (qualifying delta to teammate, race pace delta, overtakes, DNF/crash rate, wet results), then hand-tuned in `data/manual/` like `blend-config.ts` and `hand ratings`.
- **History for calibration**: results, grid, pit stops, lap times for several seasons. Public sources: Jolpica (Ergast successor), OpenF1, FastF1. Verify each is reachable and its terms before building on it; some sites block scripts (as 2kratings did for the NBA game), so be ready to read data through the browser and save it to `data/raw/browser/`.
- 2026 is a regulation reset (new power units, new aero, more teams on the grid). Confirm the actual 2026 team and driver lineup from a current source before encoding it, do not trust memory.

## 8. Step-by-step build plan

Each phase ends with something runnable and tests green, then commit and push.

**Phase 0: Project and docs.** Scaffold, tooling, hosting, `CLAUDE.md`, this handoff in `docs/`. Acceptance: blank app deploys to Cloudflare Pages.

**Phase 1: Data and types.** `types.ts` (Driver, Team, Car, Circuit, Race, Career, Life). Fetch scripts and `data/` files for calendar, teams, drivers, tracks. `npm run data` writes `public/data/world-2026.json`. Acceptance: a typed world loads and a test checks counts and ranges.

**Phase 2: Headless race engine.** Lap-time model, tyres, fuel, pit stops, DRS, safety car, DNFs, no UI. `npm run calibrate` hits the real targets from section 4. Acceptance: 500 simulated races match targets within tolerance; determinism test (same seed = same race).

**Phase 3: Season engine.** Calendar, standings, points, simple AI car development, AI driver aging, contracts expiring. `npm run check:season` sims several seasons and prints champions, grid changes, development curves. Acceptance: realistic dynasties and upsets, no runaway.

**Phase 4: 2D race view.** Track rendering, replay from events, timing tower, time controls. Acceptance: watch a full AI race at 4x with correct positions.

**Phase 5: Dials.** The pit-wall panel, forecasts, engineer proposals, real effects in the engine. Acceptance: tests show each dial trades off correctly (push = faster now, worse tyres later; ERS empty = no overtake mode).

**Phase 6: Duels and moments.** The generator that yields a `PendingMoment`, freeze-frame UI, payoff tables, reads, risk and contact, own RNG, replay of stored choices so watched = recorded (copy `liveResult`/`commitLive` logic). Acceptance: auto-play and manual play with the same choices produce identical results; non-focus races byte-identical to before.

**Phase 7: Qualifying and practice.** Q1/Q2/Q3, track evolution, setup decisions, tyre info. Acceptance: pole-to-win and grid-order realism.

**Phase 8: Career flow.** Creator (archetype/tier/mentality), rookie test days, F3 and F2 seasons, super licence points, seat market into F1, undrafted equivalent (no seat -> reserve driver or lower series). Acceptance: `check:career` plays a full F3->F1 career headlessly with sensible outcomes by tier.

**Phase 9: Progression.** XP per session, weekly points, attribute caps by archetype, potential re-projection, car-feedback effect on development. Acceptance: blue-chip reaches top-team level in about 4-5 years, a mid prospect settles midfield, like the NBA pacing targets.

**Phase 10: Contracts and market.** Offers, negotiation (asking vs value vs team budget), options and buyouts, extensions, release requests, AI teams chasing the best free drivers, a "silly season" news feed. Acceptance: tests for counters and signing, grid reshuffles each winter.

**Phase 11: Life layer.** Fame, relationships, rivals, sponsors, event deck (150+ events, many by archetype and weekend situation), match rating and Driver of the Day, social media, paddock shop. Acceptance: events fire at a sane rate with a frequency setting.

**Phase 12: Optional layers.** Home/property, love and kids, investing, casino (all copied from the NBA game with flavor changes).

**Phase 13: Polish.** Difficulty levels, accessibility, mobile layout, save export/import, favicon/icon, performance, tutorial hints for dials and duels.

## 9. Lessons from the NBA build (avoid these)

- Keep the sim **deterministic**; cache keys must include everything that affects the result (we had a flaky test because a cache key missed age/potential/ratings).
- Moments must use **their own RNG** so the unfocused sim is identical with or without the player's participation.
- Never let the UI decide outcomes. The engine yields a pending decision, the UI answers, the engine continues.
- Pause the animation exactly at the decision point and show the set-up, not a text card with no board. Players disliked cards before the play was visible.
- Players dislike repeated mechanics. Rotate formats (dials, duels, puzzles, choices). Too many timing bars was an explicit complaint.
- Write tests per feature (about one test per major system). Run `tsc` and the full suite before every push.
- Do not overwrite existing files by accident. Check before creating files with common names.
- Use Python for multi-line edits on macOS (BSD `sed` breaks).
- Real names and brand images are fine for private play; for a public build use invented brand names and original art (emoji or SVG).
- Check for the browser preview server errors after edits; HMR 500s are sometimes transient.

## 10. Open questions for the new session to settle with the user

1. Exact data scope for v1: only F1 (with a skeleton F2/F3 grid of generated drivers), or full real F2/F3 grids?
2. Sprint weekends and practice depth: include in v1 or later?
3. Single-player-only league (AI runs everything), or also a "team principal" mode after v1?
4. Visual style: simple dots on a track outline, or small car sprites and team colors?
5. How realistic should the car-vs-driver split be (arcade closer to 60/40, or realistic 75/25)?
6. Mobile support priority.

## 10b. Casino and poker logic (if you copy the optional casino layer)

The NBA game's poker was written from scratch in `src/engine/career/casinoGames.ts` (about 330 lines): its own 5-7 card evaluator (21-combination best-five search), a four-seat no-limit hold'em state machine with side pots, and a rule-of-thumb AI (hand strength plus pot odds, a style per seat, some bluffing). It is tested (chips conserved across all-in showdowns), but it is not the strongest possible opponent. If you want better, these open-source pieces turned up in a search (check licence, maintenance and bundle size before adopting; none were verified by running them):

- Hand evaluation (fast, browser-safe): [`@pokertools/evaluator`](https://classic.yarnpkg.com/en/package/@pokertools/evaluator) (TypeScript, MIT, zero dependencies, claims 16M+ 7-card hands per second), [`poker-evaluator`](https://libraries.io/npm/poker-evaluator) (Two Plus Two lookup table, Monte Carlo odds helpers), [`pokersolver`](https://github.com/goldfire/pokersolver) (MIT, easy hand names and winners, much slower).
- Full game engines to read or reuse for betting rules and side pots: [`@pokertools/engine`](https://cdn.jsdelivr.net/npm/@pokertools/engine@1.0.16/README.md) (MIT, immutable state, side pots, chip-conservation audit, auto run-out), [`poker-ts`](https://www.npmjs.com/package/poker-ts) (TypeScript port of a C++ table state machine, integer chips).
- Stronger AI (research-grade, mostly Python/Rust/C++, so use them as references or to precompute tables, not to ship in the browser): [Gongsta/Poker-AI](https://github.com/Gongsta/Poker-AI) (heads-up CFR with abstraction, readable), [Poker-MCCFRM](https://github.com/ozzi7/Poker-MCCFRM), [krukah/robopoker](https://backiee.wasmer.app/http_github_com/krukah/robopoker) (Rust), `rs_poker` (Rust, equity plus CFR).
- Recommended path for a browser game: use `@pokertools/evaluator` for hands, then give the AI a Monte Carlo equity estimate (simulate a few hundred random opponent holdings) and decide with pot odds plus a per-opponent style and tendency memory. That feels human and is cheap. Avoid the repos that automate real-money poker sites.

## 11. Prompt to paste into the new session

> Read `docs/HANDOFF.md` in this project first. We are building a browser Formula 1 career game (driver career, F3 -> F2 -> F1) using the same stack and structure as `/Users/williamliu/Coding/nba-gm`, which you can read for reference but must not edit. Start with Phase 0 and Phase 1, ask me the open questions in section 10 before choosing the data scope, and push to GitHub main after each batch (typecheck and tests first). The in-race mechanics must be resource dials plus attack/defend duels, not timing bars.
