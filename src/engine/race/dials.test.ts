import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { carPace } from "../ratings";
import { lineup } from "../season/season";
import { loadWorld } from "../testWorld";
import { DIAL, dialFx, NEUTRAL, type Command } from "./dials";
import { createRace, simRace, type RaceInput } from "./race";

const w = loadWorld();
const field = lineup(w);
const input = (seed: number, id = "silverstone", commands?: Command[]): RaceInput => {
  const circuit = w.circuits.find((c) => c.id === id)!;
  return {
    seed,
    circuit,
    pitLoss: circuit.pitLoss,
    commands,
    entries: field.map(({ team, driver }, i) => ({ driverId: driver.id, teamId: team.id, grid: i + 1, car: carPace(team.car, circuit), reliability: team.car.reliability, r: driver.ratings })),
  };
};
const fingerprint = (seed: number, id: string, commands?: Command[]) => {
  const { result, state } = simRace(input(seed, id, commands));
  return JSON.stringify(result) + JSON.stringify(state.events) + JSON.stringify(state.lapEnd);
};
/** Run `laps` laps with a command for car `car` from lap 1, return the runner. */
const runFor = (seed: number, laps: number, cmd?: Omit<Command, "lap">) => {
  const r = createRace(input(seed));
  if (cmd) r.command(cmd);
  for (let l = 0; l < laps; l++) r.step();
  return r;
};

describe("dials", () => {
  it("leave untouched races exactly as the pinned engine (catches accidental changes; update on purpose)", () => {
    const h = createHash("sha1");
    for (const id of ["silverstone", "monaco", "monza", "spa"]) for (let s = 0; s < 15; s++) h.update(fingerprint(s * 7 + 1, id));
    expect(h.digest("hex")).toBe("732c2090a86a8b9f9b271a08c85c986da240ee10"); // 60 races, engine as of the stewards/flags update
  }, 60_000);

  it("neutral dials set by hand change nothing", () => {
    const cmds: Command[] = [0, 5, 11].map((car) => ({ lap: 3, car, dials: { ...NEUTRAL } }));
    for (const s of [3, 8]) {
      const a = fingerprint(s, "silverstone");
      const b = simRace(input(s, "silverstone", cmds));
      expect(JSON.stringify(b.result) + JSON.stringify(b.state.events) + JSON.stringify(b.state.lapEnd)).toBe(a);
    }
  });

  /** A seed where both runs stay green and clean for car 0 over the first 8 laps (so only the dial differs). */
  const cleanPair = (cmd: Omit<Command, "lap">) => {
    for (let seed = 1; seed < 200; seed++) {
      const a = runFor(seed, 8);
      const b = runFor(seed, 8, cmd);
      const clean = (r: typeof a) => !r.state.flagLog.length && !r.state.cars[0].pens.length && !r.state.cars[0].out && !r.state.events.some((e) => e.a === 0 && (e.kind === "contact" || e.kind === "mistake" || e.kind === "pit"));
      if (clean(a) && clean(b)) return [a, b] as const;
    }
    throw new Error("no clean seed");
  };

  it("pushing is faster now and costs tyres and fuel", () => {
    const [base, push] = cleanPair({ car: 0, dials: { pace: 5 } });
    const a = base.state.cars[0];
    const b = push.state.cars[0];
    expect(b.cum).toBeLessThan(a.cum - 1.5);
    expect(b.wear).toBeGreaterThan(a.wear * 1.12);
    expect(b.fuel).toBeLessThan(a.fuel);
    // and the forecast says the set dies sooner
    expect(push.forecast(0).tyreLapsLeft).toBeLessThan(base.forecast(0).tyreLapsLeft);
  });

  it("tyre care is slower now and saves the tyres", () => {
    const [base, care] = cleanPair({ car: 0, dials: { tyres: 5 } });
    expect(care.state.cars[0].cum).toBeGreaterThan(base.state.cars[0].cum + 1);
    expect(care.state.cars[0].wear).toBeLessThan(base.state.cars[0].wear * 0.9); // 0.8x, plus some dirty air from being slower
  });

  it("ERS: attack drains the battery and an empty battery gives no overtake mode", () => {
    const r = runFor(4, 3, { car: 3, dials: { ers: "attack" } });
    expect(r.state.cars[3].battery).toBeLessThan(DIAL.battery0);
    expect(r.forecast(3).batteryEmptyLap).not.toBeNull();
    expect(dialFx({ ...NEUTRAL, ers: "attack" }, 0.5).attack).toBeGreaterThan(0);
    const empty = dialFx({ ...NEUTRAL, ers: "attack" }, 0);
    expect(empty.attack).toBe(0);
    expect(empty.sec).toBe(0);
    expect(dialFx({ ...NEUTRAL, ers: "defend" }, 0).defend).toBe(0);
    // harvesting refills it, at a lap-time cost
    const h = runFor(4, 3, { car: 3, dials: { ers: "harvest" } });
    expect(h.state.cars[3].battery).toBeGreaterThan(DIAL.battery0);
    expect(dialFx({ ...NEUTRAL, ers: "harvest" }, 0.5).sec).toBeGreaterThan(0);
  });

  it("fuel is on auto: a rich order is ignored, and a car that pushed all race goes lean by itself", () => {
    const r = createRace(input(6));
    r.command({ car: 0, dials: { fuel: "rich", pace: 5 } });
    r.step();
    r.step();
    expect(r.state.cars[0].dials.fuel).not.toBe("rich");
    while (!r.done() && r.state.cars[0].dials.fuel !== "lean") r.step();
    expect(r.state.cars[0].dials.fuel).toBe("lean");
    const calm = createRace(input(6));
    calm.command({ car: 0, dials: { pace: 3 } });
    calm.step();
    calm.step();
    expect(calm.state.cars[0].dials.fuel).toBe("std");
  });

  it("a stop can be called for a compound, or put off a lap", () => {
    const r = runFor(9, 10);
    r.command({ car: 2, pit: "box", compound: "H" });
    r.step();
    const c = r.state.cars[2];
    if (!c.out) {
      expect(c.lastPit).toBe(11);
      expect(c.compound).toBe("H");
    }
    // stay out: the planned stop slips by a lap
    const base = simRace(input(10));
    const k = 1;
    const planned = base.state.cars[k].stints[0].to;
    const held = simRace(input(10, "silverstone", [{ lap: planned, car: k, pit: "stay" }]));
    if (!held.state.cars[k].out && !base.state.cars[k].out) expect(held.state.cars[k].stints[0].to).toBeGreaterThan(planned);
  });

  it("team orders: the car told to move over ends the lap behind its team-mate", () => {
    let checked = 0;
    for (let seed = 1; seed < 60 && checked < 3; seed++) {
      const r = createRace(input(seed));
      for (let l = 0; l < 6; l++) r.step();
      const s = r.state;
      // find two team-mates running nose to tail
      const k = s.order.findIndex((idx, i) => i + 1 < s.order.length && s.cars[s.order[i + 1]].e.teamId === s.cars[idx].e.teamId && s.cars[s.order[i + 1]].cum - s.cars[idx].cum < 2);
      if (k < 0 || s.flag !== "green") continue;
      const front = s.order[k];
      const back = s.order[k + 1];
      r.command({ car: front, letBy: true });
      r.step();
      if (s.cars[front].out || s.cars[back].out || s.flagLog.some((f) => f.lap === s.lap) || s.cars[front].lastPit === s.lap || s.cars[back].lastPit === s.lap) continue;
      expect(s.order.indexOf(back)).toBeLessThan(s.order.indexOf(front));
      expect(s.events.some((e) => e.kind === "teamorder" && e.a === front && e.b === back)).toBe(true);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("a race driven live replays exactly from its commands", () => {
    const r = createRace(input(12));
    while (!r.done()) {
      const L = r.state.lap;
      if (L === 2) r.command({ car: 4, dials: { pace: 4, ers: "attack" } });
      if (L === 9) r.command({ car: 4, dials: { ers: "harvest", tyres: 4 } });
      if (L === 15) r.command({ car: 4, pit: "box", compound: "H" });
      if (L === 30) r.command({ car: 4, dials: { engine: "high", pace: 5 } });
      r.step();
    }
    const again = simRace(input(12, "silverstone", r.state.commands));
    expect(JSON.stringify(again.result)).toBe(JSON.stringify(r.result()));
    expect(JSON.stringify(again.state.lapEnd)).toBe(JSON.stringify(r.state.lapEnd));
  });
});
