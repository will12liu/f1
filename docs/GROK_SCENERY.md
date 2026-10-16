# Task for Grok: the 3D surroundings and the track

Read `AGENTS.md` and the "Cockpit duels" part of `CLAUDE.md` first. This task is ONLY the world around the car in
the 3D views: the track surface, kerbs, run-off, barriers, scenery, sky and light. The car model, the driving
physics, the duel logic and the assists are done and must not change.

## Where the 3D world is built

Everything is in `src/ui/race/cockpit/scene.ts` (three.js r180, loaded lazily):
- `frame(g, d, x)`: the position (`px`, `pz`, metres), the left normal (`nx`, `ny`), the direction (`dx`, `dz`) and
  `yaw` at distance `d` along the lap (track units) and lateral offset `x` (half-widths, + = left). Use it for
  placing anything along the track. `g.m` = metres per track unit, `g.len` = lap length in track units, `HALF_M` =
  half the road width in metres (7.5). The track is flat (y = 0 is the road).
- `road(g, d0, d1, zs, trackId)`: builds the road between two distances as one vertex-coloured mesh (`strip(a, b,
  y0, y1, pick)` adds a band from lateral metre `a` to `b`, flat when y0 = y1, a vertical wall when not), then the
  grandstands / street buildings and the braking boards (`board()`). Called by `Cockpit3D.tsx` (about 1 km around
  one braking zone), `Start3D.tsx` (the grid and turn 1), `onboard()` (the whole lap, qualifying) and
  `raceOnboard()` (the whole lap, 22 cars).
- `sky(scene, trackId)`: background, fog and lights; `NIGHT` = floodlit races. `STREET` = street circuits;
  `groundOf(trackId)` = the ground colour (grass, or concrete on the streets). The ground is one big plane made in
  each caller.
- `guideMesh(g)`: the racing line painted on the road (qualifying onboard only).
- Track data: `g.kerb[i]` (kerb at point i), `g.kap[i]` (curvature, + = right turn), `g.line[i]` (racing line),
  `g.ref.brake[i]` (braking zone), `zones(g)` (braking zones: `brakeD`, `apexD`, `turn`), `g.corners`.
  Circuit facts in `data/manual/circuits.ts` (`street`, `km`, `country`).

## What to build (in this order; commit after each)

1. **Road surface.** Tarmac that doesn't look like one flat colour: a slightly darker racing line (follow
   `g.line`), lighter tyre marks into the braking zones (`g.ref.brake`), a white start/finish line at d = 0 and a
   chequered strip, painted grid boxes (only near d = 0), the pit-lane exit line. Keep it vertex colours or one small
   canvas texture repeated along the road; no big image files.
2. **Kerbs.** Real kerbs: raised a few cm, red/white blocks about 1 m long on the outside of corners and on the
   apex (inside), sausage kerbs (yellow, raised) behind the apex at a few corners; flat green-and-white painted
   run-off strip after the kerb at circuits (not street tracks). Use `g.kerb` and the sign of `g.kap` to know inside
   and outside.
3. **Run-off.** At circuits: a tarmac run-off band (blue-grey with painted stripes) on the outside of the heavier
   corners (`zones(g)`), gravel (beige, rough) on the outside of the rest, grass elsewhere. At street tracks: none,
   the wall is right there.
4. **Barriers.** Circuits: armco (two grey rails on posts) or tyre walls (stacked black cylinders with a coloured
   belt) behind the run-off, a catch fence (thin posts plus a see-through mesh, `transparent` material, low opacity)
   on top near grandstands. Streets: concrete blocks with advertising boards in plain colours (no real brands), the
   debris fence above. Marshal posts (small orange huts) every 300-400 m.
5. **Scenery.** Trees (simple low-poly cones and spheres, InstancedMesh, hundreds of them, darker at night), grass
   banks, a pit building and paddock along the main straight (long box with garages, team colour strips), a
   start-line gantry already exists in `Start3D.tsx` (don't touch it), a few cranes / TV towers, a bridge over the
   track at circuits that have one (Suzuka, Spa, Monza style; one generic footbridge is fine), grandstands with
   rows of seats and a roof. Street tracks: buildings with window rows (one canvas texture), lamp posts, a harbour
   for Monaco (`trackId === "monaco"`: water plane and a few boats on one side), skyscrapers for Singapore / Las
   Vegas / Baku.
6. **Sky and light.** A sky that isn't one flat colour (a big sphere with a vertex-colour gradient from horizon to
   top is fine; this is 3D, not a UI gradient), a sun with soft shadows ONLY on the cars (shadows on everything is
   too slow), night races with floodlight poles along the track and a darker ground, a little haze at distance.
   Pick the time of day per circuit (most afternoon, the `NIGHT` ones at night).
7. **Per-circuit touches.** A small table `SCENERY: Record<trackId, {...}>` (tree density, ground colour, barrier
   type, landmarks) so circuits feel different: Monza trees and the old banking colours, Spa forest and hills (flat
   ground, but tall dark trees), Silverstone open and flat, Suzuka a ferris wheel by turn 1, Bahrain sand instead of
   grass, Abu Dhabi the hotel over the track (a box bridge), Interlagos dense city on one side.

## Rules

- Everything stays deterministic and stable: no `Math.random()` for placement. Use a seeded RNG from the track id
  (`makeRng(hashString(trackId))` from `src/engine/rng.ts`) so the same circuit always looks the same.
- Performance: 60 fps on a laptop in `raceOnboard` (the whole lap, 22 cars). Use `InstancedMesh` for anything
  repeated (trees, posts, tyres, kerb blocks, seats), merge static geometry, share materials, keep each scene under
  about 300k triangles plus the cars, no shadows except from the sun onto the cars, `fog` hides the far end.
- No downloaded assets unless they are CC0 (and then credit them in `public/models/CREDITS.txt`); prefer making
  shapes in code. No real brand names or logos on boards.
- Nothing may block the road: keep scenery outside `HALF_M + 1.5` m (circuits: outside the barrier line; streets:
  behind the wall at `HALF_M + 4`). The car can go to x = 1.8 half-widths before the lap or duel ends.
- **Do not edit**: the car model code in `scene.ts` (`loadModels`, `fillModel`, `car`, `blockCar`, `inside`,
  `steerWheels`, `EYE`, `DRIVER`, `NUMBER`), `duel.ts`, `assist.ts`, `drive.ts`, `QualiLap.tsx` logic, the HUD in
  `Cockpit3D.tsx` / `Start3D.tsx`, anything under `src/engine/`, `CLAUDE.md`. You may split the scenery into a new
  file (`src/ui/race/cockpit/world.ts`) and call it from `road()` / `sky()`.
- Keep the existing function signatures of `road`, `sky`, `groundOf`, `onboard`, `raceOnboard` so the callers
  don't change.
- After each step: `npx tsc --noEmit -p . && npm test` must pass; then commit only your files (`git add <files>`)
  with one plain sentence and push. If the push is rejected: `git pull --rebase`, then push. Never force-push.

## How to look at it

`npm run dev`, open a career save (or make one at `/new/career`), then:
- Training page, "Practice an attack": the duel cockpit at the next circuit (Quit top right).
- Weekend screen, qualifying, press "Onboard" (or V): the whole lap in 3D.
- A race page, Watch, click a car in the timing tower, press "Onboard": the whole field.
Check a normal circuit (Silverstone, Monza), a street track (Monaco, Baku), and a night race (Singapore, Bahrain).
Write what you did and anything left at the bottom of this file.

## Results / notes from Grok

(write here)
