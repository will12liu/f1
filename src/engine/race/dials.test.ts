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
  it("leave untouched races exactly as before Phase 5", () => {
    const h = createHash("sha1");
    for (const id of ["silverstone", "monaco", "monza", "spa"]) for (let s = 0; s < 15; s++) h.update(fingerprint(s * 7 + 1, id));
    expect(h.digest("hex")).toBe("986a5864e5a7a7cff25e1dcce60e2a18e454fdfa"); // hash of the same 60 races before dials existed
  }, 60_000);

  it("neutral dials set by hand change nothing", () => {
    const cmds: Command[] = [0, 5, 11].map((car) => ({ lap: 3, car, dials: { ...NEUTRAL } }));
    for (const s of [3, 8]) {
      const a = fingerprint(s, "silverstone");
      const b = simRace(input(s, "silverstone", cmds));
      expect(JSON.stringify(b.result) + JSON.stringify(b.state.events) + JSON.stringify(b.state.lapEnd)).toBe(a);
    }
  });

  it("pushing is faster now and costs tyres and fuel", () => {
    const base = runFor(1, 8);
    const push = runFor(1, 8, { car: 0, dials: { pace: 5 } });
    const a = base.state.cars[0];
    const b = push.state.cars[0];
    expect(b.cum).toBeLessThan(a.cum - 1.5);
    expect(b.wear).toBeGreaterThan(a.wear * 1.12);
    expect(b.fuel).toBeLessThan(a.fuel);
    // and the forecast says the set dies sooner
    expect(push.forecast(0).tyreLapsLeft).toBeLessThan(base.forecast(0).tyreLapsLeft);
  });

  it("tyre care is slower now and saves the tyres", () => {
    const base = runFor(2, 8);
    const care = runFor(2, 8, { car: 0, dials: { tyres: 5 } });
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

  it("a rich mix all race runs the tank short and the car has to lift", () => {
    const r = createRace(input(6));
    r.command({ car: 0, dials: { fuel: "rich", pace: 5 } });
    expect(r.forecast(0).fuelMargin).toBeGreaterThanOrEqual(-0.01); // neutral until the command lands
    r.step();
    expect(r.forecast(0).fuelShortLap).not.toBeNull();
    const lean = createRace(input(6));
    lean.command({ car: 0, dials: { fuel: "lean" } });
    lean.step();
    expect(lean.forecast(0).fuelMargin).toBeGreaterThan(3);
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
