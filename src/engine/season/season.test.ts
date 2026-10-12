import { describe, expect, it } from "vitest";
import { loadWorld } from "../testWorld";
import { endSeason } from "./offseason";
import { driverStandings, lineup, seasonOver, simNextRound } from "./season";

describe("season", () => {
  it("runs a season and a winter with full, valid grids", () => {
    const w = loadWorld(11);
    while (!seasonOver(w)) simNextRound(w);
    expect(w.results).toHaveLength(w.calendar.length);
    const ds = driverStandings(w);
    expect(ds[0].points).toBeGreaterThan(ds[5].points);
    endSeason(w);
    expect(w.season).toBe(2027);
    expect(w.history).toHaveLength(1);
    expect(w.results).toHaveLength(0);
    for (const s of ["F1", "F2", "F3"] as const) {
      const teams = w.teams.filter((t) => t.series === s);
      for (const t of teams) expect(t.drivers).toHaveLength(s === "F3" ? 3 : 2);
    }
    // nobody drives for two teams, everyone listed exists and isn't retired
    const all = w.teams.flatMap((t) => t.drivers);
    expect(new Set(all).size).toBe(all.length);
    for (const id of all) {
      const d = w.drivers.find((x) => x.id === id)!;
      expect(d).toBeTruthy();
      expect(d.retired).toBeUndefined();
    }
    expect(lineup(w)).toHaveLength(22);
    for (const { driver, team } of lineup(w)) expect(driver.teamId).toBe(team.id);
  });

  it("is deterministic from the seed", () => {
    const a = loadWorld(3);
    const b = loadWorld(3);
    for (let i = 0; i < 3; i++) {
      simNextRound(a);
      simNextRound(b);
    }
    expect(JSON.stringify(a.results)).toBe(JSON.stringify(b.results));
  });
});
