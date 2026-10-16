# Task for Grok: better radio calls in the live race

Read `AGENTS.md` first. Finish or park the scenery task (`docs/GROK_SCENERY.md`) and commit it before starting
this one: `npx tsc` currently fails on unused variables in your `scene.ts` work (`belts`, `huts`, `boats`).

## What the player sees now

In a live race, "key moments" stop the race. There are two kinds:
- **Duels** (attack / defend): Claude changed these on 2026-10-16. In the 3D cockpit view there is no list any
  more: "KEY MOMENT", a 3-2-1 countdown, then you drive it. Don't touch duels.
- **Calls** (kind `"call"`): a card with 2-3 choices (safety car box?, tyres going, undercut, restart, track
  limits, team orders, pressure from behind). The player says these feel samey and some choices don't make sense
  (e.g. "pressure" offers "Run your race / Defend mode / Push to break the tow" and nothing visible happens).
  **This task: more calls, more text variants, and choices that clearly mean something.**

## Where they live

`src/engine/race/moments.ts`, section `// ── calls ──`. Each call is a `sit({ id, kind: "call", w, title, text,
calls })`:
- `w(c)`: weight from the race context `MCtx` (read the interface near the top: `pos`, `gap`, `behindGap`,
  `wear`, `tyreLapsLeft`, `left`, `lap`, `flag`, `restart`, `battery`, `stopDue`, `strikes`, `mateBehindFaster`,
  `forPoints`, `teammateFight`, ...). 0 = never. Keep weights in the same range as the existing ones (3-14).
- `title` / `text`: arrays of variants; `{opp}`, `{behind}`, `{pos}`, `{gap}`, `{left}`, `{wear}`, `{tyrelaps}`,
  `{stopdue}`, `{mate}`, `{lap}` are filled in (see `fill()`).
- `calls`: the options. Each can set `dials` (`pace` 1-5, `tyres` 1-5, `ers` harvest/balanced/attack/defend,
  `engine` low/std/high), `pit: "box" | "stay"`, `letBy: true`. The first option is the default. These are the
  ONLY effects available: write options whose effect is exactly what the label says.

## What to do

1. **Rewrite the existing calls' options so each one's effect is obvious from its label and hint.** Hints should
   say the dial change in plain words plus the trade-off ("Pace 4, ERS attack: faster now, tyres and battery go
   quicker"). Every option must do something different (no option that does nothing unless its label is "No
   change"/"Stay on the plan").
2. **Give every call 4-6 title variants and 4-6 text variants**, written like a real F1 race engineer on the radio:
   short, specific, using the placeholders. No jokes, no emoji, no em dashes.
3. **Add 8 new calls**, each with a sensible `w` and 2-3 options, for example:
   - Rain is coming? No: there is no weather. Don't invent mechanics that don't exist.
   - Battery low before a long straight (`battery < 0.25`): harvest now vs keep deploying.
   - Big gap behind, comfortable (`behindGap > 4`, `left > 8`): save the tyres/engine vs push for fastest lap.
   - Closing on the car ahead but not in DRS yet (`gap` 1-2 s): push for two laps vs stay patient.
   - Last 5 laps, holding a points place (`forPoints`, `left <= 5`): bring it home vs attack.
   - Leading (`pos === 1`) with a gap: manage it (engine low) vs keep pushing.
   - Engine temperatures (any lap > 10, rare weight 2): engine low for a few laps vs ignore.
   - Fighting your team-mate (`teammateFight`): race him vs hold station.
   Use only existing context fields and existing dials/pit/letBy.
4. Keep the old ids working: never delete or rename an existing `id` (saved races replay from answers by id).
   `fuel-short` stays at weight 0.

## Rules

- Only edit `src/engine/race/moments.ts`, and only the `// ── calls ──` section plus new `sit({...})` blocks in
  it. Do NOT touch the duel sits, `PAYOFF`, `CONTACT`, `tendencies`, `chooseSit`, the RNG, `race.ts`, or anything
  else in `src/engine/`.
- No `Math.random()` anywhere. Weights only read `c`.
- After each step: `npx tsc --noEmit -p . && npm test` must pass (the moments and dials tests pin determinism; if
  one fails, your change broke a rule above: undo it). Commit only `src/engine/race/moments.ts` (plus your notes in
  this file) with one plain sentence, push; `git pull --rebase` if rejected; never force-push.
- Check it in the browser: `npm run dev`, a career save, race live with Key moments set to "Every fight".
- Write what you changed at the bottom of this file.

## Results / notes from Grok

Only the `// ── calls ──` block in `src/engine/race/moments.ts`. Duels, ids, and the rest of `src/engine/` are unchanged. `fuel-short` is still weight 0.

Existing calls, same ids, options now match the label:
- `sc-box`: box this lap pits; stay out holds the stop.
- `tyres-gone`: box pits; nurse is tyre care 5 and pace 2 (the needle game still keys off `nurse`); push on is pace 4 and tyre care 1.
- `undercut`: stay on the plan does nothing; box pits early; stay out and push is pace 4, tyre care 2, and hold the stop.
- `restart`: no change leaves the dials; full attack is pace 5 and ERS attack; cover the inside is ERS defend. The getaway bar is unchanged.
- `fuel-short`: lean is pace 2, engine low, lean mix; lift and coast is pace 1 as well; no change does nothing. The car still sets the mix itself when a race is running.
- `limits`: back off is pace 2 and tyre care 4; keep pushing is pace 4 and engine high.
- `mate-swap`: no change; let him through is `letBy`.
- `pressure`: no change; defend mode is ERS defend; push to break the tow is pace 4 and ERS attack.

Each of those, and the eight new ones, has six title lines and six text lines. Placeholders only from `fill()`.

New calls: `battery-low` (harvest vs keep deploying), `gap-behind` (save vs fastest lap), `closing` (patient vs pace 4), `points-home` (bring it home vs attack), `manage-lead` (engine low vs keep pushing), `engine-hot` (weight 2, any green lap after 10, not on a restart), `mate-race` (race him vs hold station, when the car ahead is your team-mate or `teammateFight`), `vsc-box` (box vs stay under a virtual safety car). They stay quiet on a restart lap so the restart call still wins. `npx tsc --noEmit -p . && npm test` passed after the option rewrite, after the extra lines, and after the new calls. In the browser, a career live race with Every fight selected reached the lights-out start.
