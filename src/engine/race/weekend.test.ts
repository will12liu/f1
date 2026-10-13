import { describe, expect, it } from "vitest";
import { lineup, prepareNextRound } from "../season/season";
import { loadWorld } from "../testWorld";
import { defaultPlan, idealSetup, setupEstimate } from "./weekend";

describe("race weekend", () => {
  it("setup work sharpens the engineer's estimate; a setup near the ideal qualifies better than a bad one", () => {
    const c = { id: "monza", aero: 0.2, power: 0.6, mech: 0.2 };
    let errSetup = 0;
    let errLong = 0;
    for (let s = 0; s < 40; s++) {
      const ideal = idealSetup(s, c);
      errSetup += Math.abs(setupEstimate(s, c, "x", "setup").mid - ideal);
      errLong += Math.abs(setupEstimate(s, c, "x", "long").mid - ideal);
    }
    expect(errSetup).toBeLessThan(errLong);
    expect(idealSetup(1, c)).toBeLessThan(0.5); // a power track wants low downforce

    let good = 0;
    let bad = 0;
    for (let s = 0; s < 25; s++) {
      const w = loadWorld(100 + s);
      const d = lineup(w)[8].driver;
      const circuit = w.circuits.find((x) => x.id === w.calendar[0].circuitId)!;
      const seed = prepareNextRound(w)!.input.seed;
      const opt = idealSetup(seed, circuit);
      const g = prepareNextRound(w, { [d.id]: { ...defaultPlan(opt) } })!.quali.find((q) => q.driverId === d.id)!.pos;
      const b = prepareNextRound(w, { [d.id]: { ...defaultPlan(opt > 0.5 ? 0 : 1) } })!.quali.find((q) => q.driverId === d.id)!.pos;
      good += g;
      bad += b;
    }
    expect(good).toBeLessThan(bad);
  }, 60_000);
});
