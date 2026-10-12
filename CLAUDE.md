# Paddock (F1 career sim)

Browser Formula 1 career game, built like the NBA GM game (`/Users/williamliu/Coding/nba-gm`: read it for reference, never edit it). The plan and phases are in docs/HANDOFF.md. Built so far: Phases 0-4 (scaffold, data + types, headless race engine + calibration, season engine, 2D race view).

## Commands
- `npm run dev`: app at localhost:5173 · `npm test`: vitest · `npm run typecheck`
- `npm run data:fetch [openf1|tracks|jolpica]`: download raw sources into `data/raw` (cached, gitignored; `--force` refetches). OpenF1 (results, qualifying, pit stops, safety-car messages, overtakes, drivers), MultiViewer (circuit outlines, pit-lane loss; new circuits are traced from OpenF1 positions). Jolpica is optional (it was unreachable/slow; nothing depends on it).
- `npm run data`: rebuild `public/data/world-2026.json`, `public/data/tracks/*.json` and `data/generated/targets.json`
- `npm run calibrate [races]`: sim races on the 2026 calendar with the real grid, compare with real averages (tuning knobs: `RACE` in `src/engine/race/model.ts`)
- `npm run check:season [seed] [seasons]`: sim seasons + winters headlessly (champions, car order, grid changes, development by age)

## Workflow
- After each batch: `npx tsc --noEmit -p . && npm test`, then commit and push to main (Cloudflare Pages deploys main). Never force-push.
- Use Python for multi-line edits (BSD sed breaks). Check before creating files with common names.

## Layout
- `src/engine/`: pure TS, no React; runs in a Web Worker (`worker.ts`, Comlink). Everything random uses `rng.ts` (seeded mulberry32).
- `src/engine/race/`: `model.ts` (constants, tyres), `strategy.ts` (pit plans from the tyre model), `race.ts` (lap-by-lap runner), `qualifying.ts`, `replay.ts` (positions/timing at any time from a Replay).
- `src/engine/season/`: `season.ts` (next round, standings), `development.ts` (car upgrades, winter reshuffle, driver aging), `offseason.ts` (champions, retirements, driver market, junior ladder).
- `src/ui/` (pages, `race/RaceViewer.tsx` canvas), `src/state/game.ts` (zustand), `src/db/db.ts` (Dexie saves).
- `scripts/`: data pipeline. `data/manual/`: hand inputs (circuits, teams, hand driver ratings). `data/generated/`: written by scripts.

## Data notes
- Real names, teams, circuits and colours live in `data/manual/*` so they can be swapped for fictional ones before a public build.
- Driver ratings (14, 25-99): hand ratings 2/3 + data 1/3. The data part is a least-squares solve of teammate gaps (2025-26 qualifying best laps, race times) with the hand ratings as the prior (`scripts/build-world.ts`). Contract end years are approximate.
- Cars: power/aero/mech (0-100, relative) + reliability + dev rate. Level from each team's 2026 Q1 gap to the fastest, minus its driver's share; tilt by hand. `world.carMean` keeps the scale fixed across winters.
- 2026 grid: 11 teams (Cadillac joined), 22 drivers, confirmed from OpenF1 session data.

## Race engine (src/engine/race)
- Lap time = base × (1 + carK·(100 − car pace at this track) + drvK·(100 − race pace)) + tyre cost(compound, wear) + fuel + damage + dirty air + noise (consistency) + mistakes. Car ≈ 75-80% of the spread (carK 0.064%/pt, drvK 0.03%/pt).
- Road order each lap, front to back: a car that would cross the line within `minGap` of the car ahead must pass it (logistic on pace advantage vs the track's overtaking difficulty, overtaking vs defending, racecraft, composure late on); failing leaves it stuck behind (dirty air next lap). Lap 1 and restarts pass easier. Contact chance per attempt (aggression, racecraft): damage, puncture, DNF, spin, penalties. Incident time losses go through `lapExtra` (never touch `cum` mid-lap).
- Pit strategy: `plans()` enumerates 0/1/2-stop compound sequences against the same tyre model (prefix sums); AI teams take the best or a close second. Cheap stops under SC/VSC are taken when they beat staying out. Two dry compounds are mandatory.
- Safety car / VSC: from crashes, collisions, stopped cars and debris (scaled by the track's `sc`). SC compresses the field and costs less in the pits.
- `createRace(input)` is a runner (`step()` = one lap, `result()`); `simRace` drains it. Deterministic from the seed (tested). Phase 6 adds `pending()/choose()` for duels with their own RNG.
- Calibration (230-460 races, `npm run calibrate`): DNFs, stops per finisher, SC/VSC shares, passes after lap 1, pole-to-win, winner from top 3, P1-P2 margin, lapped cars, quali→finish rank correlation.

## Season (src/engine/season)
- `simNextRound`: knockout qualifying (Q1/Q2/Q3) → race → `RaceSummary` + `Replay` stored on the world (`world.replays`, current season only), then in-season car development (dev rate, budget, harder near the top).
- `endSeason`: history record, drivers develop/age (peak 26-30, decline after), retirements, F1 market (expiring deals re-sign or walk; best car picks first from F1 free agents and F2), F3→F2 promotions and new F3 rookies, junior seats, winter car reshuffle (bigger in regulation years: 2030, 2035...), next calendar. Generated drivers who retire without an F1 start are dropped.

## 2D race view (src/ui/race/RaceViewer.tsx)
- Tracks: evenly resampled polylines (index 0 = start/finish), corners as lap fractions. Positions come from each car's lap-end times (`lapEnd`) interpolated; pit laps spend their pit time in the pit lane at the end of the lap; retirements stop where they happened.
- Timing tower uses crossing times (gap to leader / interval), tyres, stops. Speeds 1x-16x (1x = 6 race seconds per second), last laps slow down, scrubber, +1 lap, skip to the flag, click a car to follow it.
