# Handoff: where the game is, and what to build next

Written 2026-10-13 at the end of a long Claude Code session, for whoever picks it up next (Cursor's agent, or
Claude again). Read `CLAUDE.md` first (layout, engine rules, UI rules), then this. `docs/HANDOFF.md` is the
original build plan (phases); most of it is done.

## The game today (one paragraph)

Paddock is a browser F1 career sim (Vite + React 19 + Tailwind 4 + Zustand + Dexie, the engine in a Web Worker
via Comlink, Vitest). Three modes from the full-screen start menu: driver career (F3 -> F2 -> F1), team principal,
sandbox. The race engine is a seeded lap-by-lap runner (`src/engine/race/race.ts`); live races run it on the main
thread one lap ahead of the 2D canvas (`src/ui/race/RaceViewer.tsx`) and re-sim it in the worker on save.
Mini-games feed scores (0-1) into the engine: lights-out start, duel braking bar, pit stop (wheel guns +
release), qualifying lap (onboard chase cam on the real track), training hot lap + reaction test. Key moments
slow to 1x, zoom on the two cars and end with a result panel. Team radio. A phone (life layer: messages,
contacts/partner/family, stocks, crypto, homes, cars, businesses, social). Life events live in a spreadsheet
(`data/manual/events.csv`, `npm run events`). Creator: build points or editable archetype presets.

## Rules that matter most (do not break)

1. **Determinism.** Everything random uses `src/engine/rng.ts` (seeded). A player input may change odds or
   times, never the NUMBER of random draws, so the AI's race is identical whatever you do. Mini-game scores are
   stored where the replay finds them: `MomentChoice.q` (duels), `Command.crew/unsafe` (pit stops),
   `RaceInput.launch` (starts), `CarPlan.laps` (qualifying laps), all carried by `LiveAnswers` (season.ts) into
   `commitRound`. Tests pin this (`dials.test.ts` hash of 60 untouched races, `moments.test.ts`). Keep them green.
2. **After each batch:** `npx tsc --noEmit -p . && npm test`, then commit and push to `main` (Cloudflare Pages
   deploys main; remote `https://github.com/will12liu/f1`). Never force-push. Commit messages are one plain
   sentence of what changed.
3. **UI:** big, full-screen, high-contrast, solid colours, NBA GM style (`/Users/williamliu/Coding/nba-gm`, read
   it for reference, never edit it). Never: gradients, glass, emoji in headings, Inter, coloured-border cards,
   three-icon rows, badge-above-headline, fade-on-hover, fade-in-on-scroll, lucide everywhere, buzzword copy,
   em dashes in UI copy. Plain labels.
4. Use Python (or the editor) for multi-line edits; BSD `sed` on macOS breaks on them.
5. Dev server: `npx vite --port 5174 --strictPort` (or `npm run dev` on 5173). The user's own saves live in
   their Chrome's IndexedDB; a fresh browser has none (make a throwaway career from `/new/career`).
6. A new worker action needs a page reload in dev (the worker doesn't hot-reload).

## What the user asked for next (in their words: "improve the qualifying, improve the actual GAME itself,
## in the moments you can view it from INSIDE the car like F1, make it more skill based")

### 1. Qualifying lap: real driving, real lap time (DONE 2026-10-16: drive.ts + QualiLap.tsx; the notes below are how it was specced)

Now (`src/ui/race/QualiLap.tsx`): the car follows the track at a fixed speed profile and you only steer left/right
to stay on a green racing line; score = share of time on the line. It looks like the track but it's a
line-following game, not driving.

Make it driving:
- **Throttle and brake** (Up/W = throttle, Down/S/Space = brake; touch: right half throttle, left half brake,
  plus steering on drag or tilt). Speed is a real state: accelerate on straights, brake for corners.
- **Corner speed limit** from curvature (`v_max = sqrt(grip * radius)`, radius from the polyline's turn per
  metre, already computed as `c` in `build()`); over the limit the car runs wide (lateral offset drifts to the
  outside) and onto the grass/kerb (slow, and a "lap deleted" if all four wheels leave: track limits).
- **Line still matters:** taking the inside of a corner shortens the distance, the outside-apex-outside line
  raises the radius (higher `v_max`). The current racing line can stay as an optional guide (toggle).
- **Lap time is the score:** a reference lap time from the engine (the driver's expected quali time at this
  track, or a fixed target) and the player's time; live delta (+/-), sector times vs the reference coloured
  purple/green/yellow. Map to the engine's 0-1: `q = clamp(0.55 + (ref - time) / k)` so `QUALI.lapSkill`
  keeps the effect sane (about -0.25s .. +0.3s on the real lap). A deleted lap = q 0.1.
- **Ghost car** of your best lap this weekend (keep it in component state; optional localStorage per track).
- **Driver skill shows:** grip/brake strength scale a little with the driver's `quali` and `pace` ratings, so a
  better driver is easier to drive fast (keeps the sim honest).
- Keep: one try per session, the mini-map, kerbs, the result screen, "Don't drive it".
- Track data: `public/data/tracks/<id>.json` (`pts` evenly resampled, `w`/`h`, `corners[{n,f}]`), loaded via
  `loadTrack` in `components/bits.tsx`. Units are px of a 1000-wide frame (~2 m per unit on a 5 km lap).

### 2. Cockpit view in key moments ("from INSIDE the car") (FIRST VERSION DONE 2026-10-16 with three.js, see CLAUDE.md "Cockpit duels"; still to do: tune the scoring with real play, opponent habits from `tendencies`, better car model, a sound)

Duel moments open `MomentCard` -> pick a move -> `BrakeBar` (a flat timing bar). Replace the bar with a
**pseudo-3D onboard** (OutRun-style road projection, canvas 2D, no WebGL needed):
- Build road segments from the track polyline ahead of the car (curvature -> x offset per segment, flat
  ground); project with a simple camera (height, depth, FOV); draw tarmac, kerbs (red/white alternating), grass,
  the braking boards (300/200/100) before the corner.
- Cockpit overlay drawn on top: halo bar, steering wheel with a little display (speed, gear, delta), mirrors.
- The other car as a sprite ahead (attack) or in the mirrors (defend), placed by the gap from the race state.
- The skill part: brake at the right board (timing = the existing 0-1 score), then pick inside/outside by
  steering (matches the chosen move), then the exit (throttle on at the apex). Combine into the same
  `q` -> `MomentChoice.q` -> `execEdge/execContact` (moments.ts) so nothing in the engine changes.
- Keep the old bar as a fallback ("Simple controls" setting) and for touch devices if the 3D view is too much.
- A cheap first step: render the cockpit view for the existing braking zone only (boards approach, press
  brake), then add steering.

Built 2026-10-16 (Claude, see CLAUDE.md "Cockpit duels"): `src/ui/race/cockpit/` (`duel.ts` pure + tested at
every circuit, `scene.ts` road/cars/sky/onboard, `Cockpit3D.tsx`), the TV replay after each duel, sound, mirrors,
night races, phone pads + tilt, the moments-view picker on the pre-race screen, duel practice on the Training
page, and an "Onboard" view for the qualifying lap. Also built: the 3D start (`Start3D.tsx`: grid slot, field, gantry), the
race view's "Onboard" ride-along (`RaceOnboard.tsx`), street-circuit scenery, the guide painted on the road in
onboard qualifying. Still open: tune `duelScore` from real play (the user hasn't driven it yet), trees and
landmarks per circuit, a better car model (wheels that turn, a livery stripe), the duel at the corner where the
fight actually is, cars in the race onboard using real lateral positions (now: racing line + side-by-side nudge).

### 3. More skill in the race itself

DONE 2026-10-16: safety-car restart Go bar (`RACE.restartSkill`), tyre saving needle game on "Nurse them"
(`TyreSave.tsx`, wear for five laps), difficulty sets the windows (`DIFFICULTY[..].window`). Still an idea:
defending as two timings (pick the side early, hold it under braking).

## Not checked in a browser yet

- Calendar "Sim to here" (`src/ui/pages/Calendar.tsx`) and the slimmer career hub (`src/ui/career/CareerHq.tsx`).
- Phone text replies (`lifeReply` in `career/life.ts`, Messages in `ui/career/Phone.tsx`).
- The 1x/zoom moment view on a big screen (tested only in a small pane).

## Smaller ideas the user liked earlier

- Close paddock friends race you a bit cleaner (contact multiplier in duels from `life.people` friends).
- Partner/family in the race debrief (`components/Ceremony.tsx`).
- More texts that react to results.

## Files you'll touch most

- Qualifying: `src/ui/race/QualiLap.tsx`, `src/ui/race/Weekend.tsx`, `src/engine/race/qualifying.ts` (`QUALI`).
- Moments: `src/ui/race/MomentCard.tsx`, `src/ui/race/BrakeBar.tsx`, `src/engine/race/moments.ts`,
  `src/ui/pages/LiveRace.tsx` (Outcome panel, focus/zoom), `src/ui/race/RaceViewer.tsx`.
- Tests: `src/engine/race/*.test.ts`, `src/engine/career/career.test.ts`.
