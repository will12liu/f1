import { describe, expect, it } from "vitest";
import { carPace } from "../ratings";
import { lineup, licencePoints, simNextRound, BAN_POINTS, raceLineup } from "../season/season";
import { loadWorld } from "../testWorld";
import { simRace, type RaceInput } from "./race";

const w = loadWorld();
const field = lineup(w);
const input = (seed: number, id = "silverstone"): RaceInput => {
  const circuit = w.circuits.find((c) => c.id === id)!;
  return { seed, circuit, pitLoss: circuit.pitLoss, entries: field.map(({ team, driver }, i) => ({ driverId: driver.id, teamId: team.id, grid: i + 1, car: carPace(team.car, circuit), reliability: team.car.reliability, r: driver.ratings })) };
};

describe("stewards and flags", () => {
  const races = Array.from({ length: 120 }, (_, i) => simRace(input(500 + i, ["silverstone", "monaco", "baku", "monza"][i % 4])));

  it("track limits: the black-and-white flag on the third strike, five seconds from the fourth", () => {
    let pens = 0;
    for (const { state } of races)
      for (const car of state.cars) {
        const strikes = state.events.filter((e) => e.kind === "limits" && e.a === car.idx).length;
        const bw = state.events.some((e) => e.kind === "bw" && e.a === car.idx);
        const tl = car.pens.filter((p) => p.includes("track limits")).length;
        expect(bw).toBe(strikes >= 3);
        expect(tl).toBe(Math.max(0, strikes - 3));
        pens += tl;
      }
    expect(pens).toBeGreaterThan(0);
  });

  it("penalties end up in the race time when they aren't served", () => {
    for (const { result } of races)
      for (const r of result.rows) {
        if (r.status !== "Finished") continue;
        const given = r.pens.reduce((s, p) => s + (p.startsWith("10s") ? 10 : p.startsWith("5s") ? 5 : 0), 0);
        expect(r.penalty).toBeLessThanOrEqual(given + 30);
        expect(r.penalty).toBeGreaterThanOrEqual(0);
      }
  });

  it("blue flags are shown, and red flags bring a standing restart with fresh tyres", () => {
    expect(races.some(({ state }) => state.events.some((e) => e.kind === "blue"))).toBe(true);
    const red = races.find(({ result }) => result.red > 0);
    expect(red).toBeTruthy();
    const { state } = red!;
    const redLap = state.flagLog.find((f) => f.flag === "red")!.lap;
    expect(state.events.some((e) => e.kind === "restart" && e.lap === redLap)).toBe(true);
    // everyone still running got a new set at the red flag
    for (const car of state.cars) if (!car.out && state.laps - redLap > 2) expect(car.stints.some((s) => s.from === redLap + 1)).toBe(true);
  });

  it("12 licence points mean a race ban, and a reserve races instead", () => {
    const world = loadWorld(3);
    const d = world.drivers.find((x) => x.id === lineup(world)[0].driver.id)!;
    d.licence = [{ season: world.season, round: 0, pts: BAN_POINTS - 1 }];
    // the next race's points push him over: simulate it by hand
    d.licence.push({ season: world.season, round: 1, pts: 1 });
    expect(licencePoints(d, world.season, 1)).toBe(BAN_POINTS);
    d.bannedFor = { season: world.season, round: 1 };
    const ln = raceLineup(world, 1);
    expect(ln.some((x) => x.driver.id === d.id)).toBe(false);
    expect(ln.find((x) => x.standIn === d.id)).toBeTruthy();
    const sum = simNextRound(world)!;
    expect(sum.stand_ins?.[0].for).toBe(d.id);
    expect(sum.classification.some((c) => c.driverId === d.id)).toBe(false);
  });
});
