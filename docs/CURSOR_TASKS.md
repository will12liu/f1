# Tasks for Cursor (small, safe, one per chat)

These are sized for a fast model (Grok / Composer). Do ONE task per chat. Read `AGENTS.md` first.

## Ground rules for every task

- **Another agent (Claude) works in this same folder at the same time**, building the 3D cockpit moments.
  **Do not edit these files**: `src/engine/race/*`, `src/engine/season/*`, `src/engine/rng.ts`,
  `src/ui/race/QualiLap.tsx`, `src/ui/race/drive.ts`, `src/ui/race/drive.test.ts`, `src/ui/race/RaceViewer.tsx`,
  `src/ui/pages/LiveRace.tsx`, `src/ui/race/MomentCard.tsx`, `src/ui/race/BrakeBar.tsx`, anything under
  `src/ui/race/cockpit/`, `package.json`, `package-lock.json`, `CLAUDE.md`, `docs/NEXT.md`.
- If `npx tsc` or `npm test` fails ONLY in files you did not touch, that's the other agent mid-work: note it in
  the Results section, make sure your own files are clean, and still commit your own files.
- Never add `Math.random()` to anything under `src/engine/`.
- When done: `npx tsc --noEmit -p . && npm test` must pass. Then commit ONLY the files you changed
  (`git add <files>`, not `git add -A`: there is uncommitted work in progress in the tree) and push.
- UI rules: solid colours, high contrast, plain labels, no gradients / glass / emoji in headings / fade on hover.
- If a task turns out bigger than described, stop and write what you found at the bottom of this file.

## C1. Twenty more life events (content only)

File: `data/manual/events.csv` (open the top of `src/engine/career/sheet.ts` for the column rules).
Add 20 new events (2-3 replies each), one row per reply. Keep them short, about F1 life, grounded, not silly.
Mix of senders: `{engineer}`, `{boss}`, `{agent}`, `Mum`, `{partner}`, `{sibling}`, `{friend}`, `Trainer`,
`Press officer`. Use `when` conditions so they fit the moment (e.g. `won`, `dnf`, `f1`, `junior`, `fame>20`,
`partner`, `morale<40`). Effects small (fame/trust/morale +-1..5, xp 10-40, cash in tens of thousands).
Check with `npm run events -- --list` (it must print 0 problems), then run the tests.

## C2. More radio lines (content only)

File: `src/ui/race/Radio.tsx`. Add 2-3 more variants to each engineer reaction array (pass made, pass lost,
pit, contact) and two new questions in the Radio menu: "How's my pace?" (answer from `me.interval` vs the car
ahead: closing or not is fine to fake as "about the same") and "Weather?" (always "Dry all race."). Keep the
same tone: short, like a real F1 race engineer.

## C3. Your people in the race debrief

File: `src/ui/components/Ceremony.tsx` (the career race debrief). Under the result, add one line from the
phone: if `careerState.life` has a partner or a parent, show a short text from them that fits the result
(won / podium / points / no points / DNF), e.g. Mum: "We screamed at the TV!". Pick the text with the round
number (`world.results.length % lines.length`), never `Math.random()`. Style like the phone's message bubble.

## C4. Test pass in the browser (no code unless a bug is obvious and tiny)

`npm run dev`, make a throwaway career at `/new/career` (start F2), then check and write results at the bottom
of this file:
1. Calendar: click a future race day, "Sim to here" sims the right number of rounds.
2. Phone: a text from a family member shows reply buttons; replying moves their bar in Contacts.
3. Phone: Stocks, type `25k` in the amount box, Buy works; Sell all works.
4. Career hub: nothing overlaps at 1280px and at phone width (DevTools device mode).

## C5. The moments view setting (a small standalone component)

Create a NEW file `src/ui/race/MomentsView.tsx` (do not edit LiveRace.tsx; Claude will mount it there). Export:
- `type MomentsView = "cockpit" | "simple"`
- `readMomentsView(): MomentsView` (localStorage key `paddock.momentsView`, default `"cockpit"`, wrapped in
  try/catch like `readMode` in LiveRace.tsx)
- `function MomentsViewPicker({ value, onChange })`: two big buttons styled like the "Key moments" picker on the
  live race pre-race screen (look at LiveRace.tsx for the classes, but don't edit it): `3D cockpit` ("Drive the
  moment yourself, from the car") and `Simple` ("Pick a move, then the braking bar"). Saves to localStorage on change.

## Results / notes from Cursor

(write here)
