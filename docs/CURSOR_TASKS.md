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

C4, in a headless browser against `npm run dev` (127.0.0.1:5173). Throwaway F2 careers, created with Random at `/new/career`. The saves live in that browser profile only.

1. Calendar: worked. A new career showed 0 of 23 rounds. On the June page, clicking the R6 race day offered **Sim to here (6 rounds)**, and it was enabled. After the sim and dismissing Continue, the page showed 6 of 23. That is 0 plus the 6 rounds on the button.
2. Phone, family: worked for a weekend text. The starter note from Mum ("Proud of you. Call when you can, we watch every race.") does not show reply buttons. It offers "Hey, got a minute?" instead. After a few simmed rounds, Dad texted "Good weekend. Keep your head down." and the thread showed **Thanks Dad. Means a lot** and **Yeah yeah, I know**. Contacts before the warm reply: Mum 70, Dad 62. After it: Mum 70, Dad 67.
3. Phone, stocks: worked. On Paddock 100, typing `25k` left Buy enabled. After Buy the holding read $24.9K and the toast was "Bought 273 P100." Sell all left the holding at $0 and the toast was "Sold for $24.8K."
4. Career hub: the floating Phone button overlaps content. At 1280x900 it covers the super licence tile (0/40) and the top-right of the messages card. At 390px wide it covers the circuit drawing on the next-race banner, and the top nav scrolls sideways so the links after Calendar sit off-screen until you scroll. Left as it is: that button is on every career page on purpose, and moving it is a layout change, not a one-line fix.

No code change for C4. `npx tsc --noEmit -p .` and `npm test` passed on C1, C2, C3 and C5 (59 tests). C1's `npm run events -- --list` printed 0 problems (48 events, 105 replies). Nothing failed in files this agent did not touch.

## Commits

Work order was C1, C2, C3, C5, then C4. Each code commit was pushed to `main`.

- `858eebd` Add twenty life events about race weekends, family, the team and the press.
- `61c9b5b` Add more engineer radio lines, plus pace and weather calls.
- `005c174` Show a text from a parent or partner on the race debrief.
- `06f6dc5` Add a cockpit or simple picker for how key moments are played.
- C4 is the notes commit on this file (no game code).
