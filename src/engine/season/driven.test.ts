import { describe, expect, it } from "vitest";
import { loadWorld } from "../testWorld";
import { prepareNextRound, simNextRound } from "./season";
import type { DrivenRace } from "../race/driven";

describe("a race the player drove", () => {
  it("is stored as the round: winner, classification, points and a replay from the line crossings", () => {
    const w = loadWorld(4);
    const prep = prepareNextRound(w)!;
    const grid = prep.quali.map((q) => q.driverId);
    const team = new Map(prep.input.entries.map((e) => [e.driverId, e.teamId]));
    // the last qualifier wins, the rest finish in grid order a second apart
    const order = [grid[grid.length - 1], ...grid.slice(0, -1)];
    const laps = 5;
    const race: DrivenRace = {
      laps,
      rows: order.map((id, i) => ({ driverId: id, teamId: team.get(id)!, grid: grid.indexOf(id) + 1, pos: i + 1, laps, time: 400 + i, gap: i, status: "Finished", best: 79 + i * 0.01, passes: 0 })),
      lapEnd: grid.map((id, g) => [g * 0.2, ...Array.from({ length: laps }, (_, k) => (k + 1) * 80 + order.indexOf(id))]),
      gridIds: grid,
    };
    const s = simNextRound(w, [], undefined, undefined, undefined, undefined, { race })!;
    expect(s.winner).toBe(order[0]);
    expect(s.classification[0].points).toBe(25);
    expect(s.classification.map((c) => c.driverId)).toEqual(order);
    expect(w.results[w.results.length - 1].winner).toBe(order[0]);
    const rp = w.replays[s.round];
    expect(rp?.laps).toBe(laps);
    expect(rp?.lapEnd.length).toBe(grid.length);
  });
});
