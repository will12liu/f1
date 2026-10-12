import { describe, expect, it } from "vitest";
import { RATING_KEYS } from "./ratings";
import { loadWorld } from "./testWorld";

describe("world-2026", () => {
  const w = loadWorld();
  it("has the 2026 grid: 11 teams, 22 race drivers", () => {
    const f1 = w.teams.filter((t) => t.series === "F1");
    expect(f1).toHaveLength(11);
    for (const t of f1) expect(t.drivers).toHaveLength(2);
    expect(new Set(f1.flatMap((t) => t.drivers)).size).toBe(22);
  });
  it("has junior grids (F2 22, F3 30)", () => {
    const n = (s: string) => w.teams.filter((t) => t.series === s).reduce((k, t) => k + t.drivers.length, 0);
    expect(n("F2")).toBe(22);
    expect(n("F3")).toBe(30);
  });
  it("ratings and cars are in range", () => {
    for (const d of w.drivers) {
      for (const k of RATING_KEYS) expect(d.ratings[k]).toBeGreaterThanOrEqual(25), expect(d.ratings[k]).toBeLessThanOrEqual(99);
      expect(d.pot).toBeGreaterThanOrEqual(d.ovr);
    }
    for (const t of w.teams) for (const v of [t.car.power, t.car.aero, t.car.mech, t.car.reliability]) expect(v).toBeGreaterThan(40), expect(v).toBeLessThan(100);
  });
  it("has a calendar of real circuits with outlines and pit losses", () => {
    expect(w.calendar.length).toBeGreaterThanOrEqual(20);
    for (const r of w.calendar) {
      const c = w.circuits.find((x) => x.id === r.circuitId);
      expect(c).toBeTruthy();
      expect(c!.pitLoss.normal).toBeGreaterThan(10);
    }
  });
});
