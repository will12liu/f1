import { describe, expect, it } from "vitest";
import { carPace } from "../ratings";
import { lineup } from "../season/season";
import { loadWorld } from "../testWorld";
import { applyDrivenQuali, qualify } from "./qualifying";
import { indexReplay, viewAt } from "./replay";
import { createRace, simRace, type RaceInput } from "./race";
import type { Replay } from "../types";

const w = loadWorld();
const circuit = w.circuits.find((c) => c.id === "silverstone")!;
const field = lineup(w);
const input = (seed: number): RaceInput => ({
  seed,
  circuit,
  pitLoss: circuit.pitLoss,
  entries: field.map(({ team, driver }, i) => ({ driverId: driver.id, teamId: team.id, grid: i + 1, car: carPace(team.car, circuit), reliability: team.car.reliability, r: driver.ratings })),
});

describe("race engine", () => {
  it("is deterministic: same seed, same race", () => {
    const a = simRace(input(42));
    const b = simRace(input(42));
    expect(JSON.stringify(a.result)).toBe(JSON.stringify(b.result));
    expect(JSON.stringify(a.state.events)).toBe(JSON.stringify(b.state.events));
    const c = simRace(input(43));
    expect(JSON.stringify(c.result)).not.toBe(JSON.stringify(a.result));
  });

  it("steps lap by lap like the drained race", () => {
    const r = createRace(input(5));
    let laps = 0;
    while (!r.done()) {
      r.step();
      laps++;
      expect(r.state.lap).toBe(laps);
    }
    expect(laps).toBe(circuit.laps);
    expect(JSON.stringify(r.result())).toBe(JSON.stringify(simRace(input(5)).result));
  });

  it("produces a sane classification", () => {
    for (let s = 0; s < 20; s++) {
      const { result, state } = simRace(input(100 + s));
      expect(result.rows).toHaveLength(22);
      expect(result.rows.map((r) => r.pos)).toEqual(Array.from({ length: 22 }, (_, i) => i + 1));
      const pts = result.rows.reduce((n, r) => n + r.points, 0);
      const finishers = result.rows.filter((r) => r.status === "Finished" || r.status === "Lapped").length;
      expect(pts).toBe([25, 18, 15, 12, 10, 8, 6, 4, 2, 1].slice(0, finishers).reduce((a, b) => a + b, 0));
      for (const r of result.rows) {
        if (r.status !== "Finished" && r.status !== "Lapped") continue;
        // dry race: two compounds unless it ended early
        expect(new Set(r.stints.map((x) => x.c)).size).toBeGreaterThanOrEqual(2);
        const ends = state.lapEnd[r.idx];
        for (let l = 1; l < ends.length; l++) expect(ends[l]).toBeGreaterThan(ends[l - 1]);
      }
      // no impossible laps (incidents only ever cost time)
      for (const r of result.rows) if (isFinite(r.fastest)) expect(r.fastest).toBeGreaterThan(circuit.base * 0.985);
      // the winner is on the lead lap and fastest over the distance
      const w0 = result.rows[0];
      expect(w0.status).toBe("Finished");
      for (const r of result.rows.filter((x) => x.status === "Finished")) expect(r.time).toBeGreaterThanOrEqual(w0.time);
    }
  });

  it("puts faster cars ahead on average", () => {
    let top = 0;
    let back = 0;
    for (let s = 0; s < 30; s++) {
      const { result } = simRace(input(200 + s));
      for (const r of result.rows) {
        const rank = field.findIndex((f) => f.driver.id === r.driverId);
        const carScore = carPace(field[rank].team.car, circuit);
        if (carScore > 90) top += r.points;
        if (carScore < 80) back += r.points;
      }
    }
    expect(top).toBeGreaterThan(back * 5);
  });

  it("qualifying returns every driver once, ordered by session", () => {
    const q = qualify(9, circuit, field.map(({ team, driver }) => ({ driverId: driver.id, teamId: team.id, car: carPace(team.car, circuit), r: driver.ratings })));
    expect(q.map((x) => x.pos)).toEqual(Array.from({ length: 22 }, (_, i) => i + 1));
    expect(new Set(q.map((x) => x.driverId)).size).toBe(22);
    expect(q.slice(0, 10).every((x) => x.out === 3)).toBe(true);
    expect(q.slice(16).every((x) => x.out === 1)).toBe(true);
  });

  it("a driven qualifying time puts that driver on pole and leaves another series alone", () => {
    const q = qualify(9, circuit, field.map(({ team, driver }) => ({ driverId: driver.id, teamId: team.id, car: carPace(team.car, circuit), r: driver.ratings })));
    const back = q[q.length - 1].driverId;
    const times = Object.fromEntries(q.map((r) => [r.driverId, (r.q[2] ?? r.q[1] ?? r.q[0] ?? 90) as number]));
    times[back] = 60;
    const next = applyDrivenQuali(q, times);
    expect(next[0].driverId).toBe(back);
    expect(next[0].q).toEqual([60, 60, 60]);
    expect(next[0].out).toBe(3);
    expect(next.map((x) => x.pos)).toEqual(Array.from({ length: 22 }, (_, i) => i + 1));
    expect(applyDrivenQuali(next, { "some-junior": 70 }).map((x) => x.driverId)).toEqual(next.map((x) => x.driverId));
  });

  it("the qualifying-lap mini-game moves only that driver's laps", () => {
    const entries = (laps?: number[]) =>
      field.map(({ team, driver }, i) => ({ driverId: driver.id, teamId: team.id, car: carPace(team.car, circuit), r: driver.ratings, ...(i === 12 && laps ? { plan: { risk: [2, 2, 2], late: [false, false, false], laps } } : {}) }));
    const good = qualify(9, circuit, entries([1, 1, 1]));
    const bad = qualify(9, circuit, entries([0, 0, 0]));
    const id = field[12].driver.id;
    const q1 = (rows: typeof good, d: string) => rows.find((x) => x.driverId === d)!.q[0];
    expect(q1(good, id)!).toBeLessThan(q1(bad, id)! - 0.4);
    expect(q1(good, field[3].driver.id)).toBe(q1(bad, field[3].driver.id));
  });

  it("the replay's final timing order matches the classification", () => {
    const { result, state } = simRace(input(77));
    const replay: Replay = {
      season: 2026,
      round: 1,
      circuitId: circuit.id,
      laps: state.laps,
      cars: input(77).entries.map((e) => ({ driverId: e.driverId, teamId: e.teamId })),
      grid: [],
      lapEnd: state.lapEnd,
      events: state.events,
      flags: [],
      stints: state.cars.map((c) => c.stints),
    };
    const ix = indexReplay(replay);
    const v = viewAt(ix, ix.end);
    const fin = result.rows.filter((r) => r.status === "Finished" || r.status === "Lapped").map((r) => r.idx);
    expect(v.cars.slice(0, fin.length).map((c) => c.idx)).toEqual(fin);
    // at the start everyone is on lap 0 in grid order
    const v0 = viewAt(ix, 0);
    expect(v0.cars.map((c) => c.idx)).toEqual(Array.from({ length: 22 }, (_, i) => i));
  });
});
