# Agent instructions (Cursor, Claude, any coding agent)

Read these before changing anything:
1. `CLAUDE.md`: the project's rules, layout, engine and UI notes (kept up to date; treat it as the spec).
2. `docs/NEXT.md`: where the game is and what to build next (qualifying, cockpit view, more skill).

The short version:
- Determinism: player inputs never change the number of random draws; mini-game scores are stored with the
  answer/command/plan so replays match. Keep `npm test` green (it pins this).
- After each batch: `npx tsc --noEmit -p . && npm test`, then commit and push to `main`. Never force-push.
- UI: big, full-screen, solid colours, high contrast, NBA GM style (`/Users/williamliu/Coding/nba-gm`, read-only).
  No gradients, glass, emoji in headings, Inter, coloured-border cards, fade-on-hover, buzzword copy.
- Keep `CLAUDE.md` and `docs/NEXT.md` updated when you finish something.
