import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { TrackFile } from "../components/bits";
import { at, build, type Geo, type Input } from "./drive";
import { createSelf, drivenResult, qualiTimesOf, selfSkill, stepSelf, type SelfCar, type SelfSpec } from "./self";

const monza = () => build(JSON.parse(readFileSync("public/data/tracks/monza.json", "utf8")) as TrackFile, 5.793, 83.1);

function spec(id: string, grid: number, skill: number, player = false): SelfSpec {
  return { id, teamId: "t", name: id, code: id.slice(0, 3).toUpperCase(), grid, skill, player, grip: player ? 1.06 : 1, color: "#fff" };
}

/** Holds the racing line and brakes when well above the reference speed. */
function follow(g: Geo, car: SelfCar): Input {
  const want = at(g, g.line, Math.max(0, car.d));
  const tx = at(g, g.px, car.d + 1) - at(g, g.px, car.d - 1);
  const tz = at(g, g.py, car.d + 1) - at(g, g.py, car.d - 1);
  let dh = Math.atan2(tx, tz) - car.head;
  while (dh > Math.PI) dh -= 2 * Math.PI;
  while (dh < -Math.PI) dh += 2 * Math.PI;
  const steer = Math.max(-1, Math.min(1, (want - car.x) * 1.6 + dh * 1.8));
  const ref = at(g, g.ref.v, Math.max(0, car.d));
  const brake = car.v > ref * 1.12 ? 1 : 0;
  return { throttle: brake ? 0 : 1, brake, steer };
}

const ZERO: Input = { throttle: 0, brake: 0, steer: 0 };
const DT = 1 / 120;

function run(g: Geo, state: ReturnType<typeof createSelf>, input: (car: SelfCar) => Input, cap = 120 * 200) {
  let steps = 0;
  while (state.phase !== "done" && steps++ < cap) {
    const me = state.cars.find((c) => c.player);
    stepSelf(state, g, state.phase === "lights" || !me ? ZERO : input(me), DT);
  }
  return steps;
}

describe("self driven race", () => {
  it("gives a faster car a higher skill", () => {
    expect(selfSkill(95, 90, 1, "a")).toBeGreaterThan(selfSkill(40, 45, 1, "b"));
    expect(selfSkill(95, 90, 1, "a")).toBe(selfSkill(95, 90, 1, "a"));
  });

  it("runs an AI field the same way twice and the quicker cars finish ahead", () => {
    const g = monza();
    const specs = [0.99, 0.96, 0.93, 0.9, 0.87, 0.84].map((skill, i) => spec(`d${i}`, i + 1, skill));
    const once = () => {
      const state = createSelf(7, g, specs, "race", 1);
      run(g, state, () => ZERO, 120 * 140);
      return drivenResult(state);
    };
    const a = once();
    const b = once();
    expect(a.rows[0].status).toBe("Finished");
    expect(a.rows[0].laps).toBe(1);
    expect(a.rows[0].driverId).toBe("d0");
    expect(a.rows[a.rows.length - 1].driverId).toBe("d5");
    expect(a.rows.map((r) => r.time)).toEqual(b.rows.map((r) => r.time));
    expect(a.lapEnd[0].length).toBe(2);
  });

  it("lets a tidy player pull away from a slow car", () => {
    const g = monza();
    const state = createSelf(3, g, [spec("me", 1, 1, true), spec("ai", 2, 0.84)], "race", 1);
    run(g, state, (car) => follow(g, car), 120 * 130);
    const me = state.cars.find((c) => c.player)!;
    const ai = state.cars.find((c) => !c.player)!;
    expect(me.finished).toBe(true);
    expect(me.finishT).toBeLessThan(ai.finished ? ai.finishT : state.raceT);
    expect(Math.abs(me.x)).toBeLessThan(1.5);
  });

  it("records a qualifying time for every car and repeats", () => {
    const g = monza();
    const specs = [spec("me", 1, 1, true), spec("ai", 2, 0.8)];
    const once = () => {
      const state = createSelf(11, g, specs, "quali", 0);
      run(g, state, (car) => follow(g, car), 120 * 360);
      return qualiTimesOf(state, g);
    };
    const times = once();
    expect(times.me).toBeGreaterThan(70);
    expect(times.ai).toBeGreaterThan(times.me);
    expect(once()).toEqual(times);
  });

  it("jumps only when the throttle is still down as the lights go out", () => {
    const g = monza();
    const gas: Input = { throttle: 1, brake: 0, steer: 0 };
    const tapped = createSelf(1, g, [spec("me", 1, 1, true)], "race", 1);
    stepSelf(tapped, g, gas, 0.4);
    expect(tapped.phase).toBe("lights");
    stepSelf(tapped, g, ZERO, 5 + tapped.outDelay);
    expect(tapped.phase).toBe("green");
    expect(tapped.cars[0].jump).toBe(false);
    expect(tapped.cars[0].hold).toBe(0);

    const held = createSelf(1, g, [spec("me", 1, 1, true)], "race", 1);
    stepSelf(held, g, gas, 5 + held.outDelay + 0.02);
    expect(held.phase).toBe("green");
    expect(held.cars[0].jump).toBe(true);
    expect(held.cars[0].hold).toBe(5);
    expect(held.cars[0].pen).toBe(5);
  });
});

describe("self driven race with assists", () => {
  it("full assists, hands off: the player's car laps cleanly, on a front-runner's pace, not faster than a same-skill car", () => {
    for (const [id, km, base] of [["monza", 5.793, 83.1], ["monaco", 3.337, 75.1], ["silverstone", 5.891, 87.3]] as const) {
      const g = build(JSON.parse(readFileSync(`public/data/tracks/${id}.json`, "utf8")) as TrackFile, km, base);
      const state = createSelf(5, g, [spec("me", 2, 0.97, true), spec("ai", 1, 0.97)], "race", 1, "full");
      run(g, state, () => ZERO, 120 * 200);
      const me = state.cars.find((c) => c.player)!;
      const ai = state.cars.find((c) => !c.player)!;
      expect(me.finished).toBe(true);
      expect(Math.abs(me.x)).toBeLessThan(1.2);
      // within a couple of percent of the same-skill AI car over the lap
      expect(me.finishT / ai.finishT).toBeGreaterThan(0.97);
      expect(me.finishT / ai.finishT).toBeLessThan(1.05);
    }
  });
});
