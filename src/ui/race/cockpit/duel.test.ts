import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { TrackFile } from "../../components/bits";
import { at, build, type Input } from "../drive";
import { aheadOf, inferMove, startDuel, stepDuel, zones, type Duel } from "./duel";

const track = (id: string) => JSON.parse(readFileSync(`public/data/tracks/${id}.json`, "utf8")) as TrackFile;
const monza = () => build(track("monza"), 5.793, 83.1);

/** A driver who brakes `late` metres after a tidy driver would (negative = earlier), holds the middle and
 *  moves `lane` half-widths across (+ left). */
function run(s: Duel, late = 0, lane = 0) {
  const g = s.g;
  for (let i = 0; i < 120 * 30 && !s.result; i++) {
    let brake = 0;
    for (let look = 0; look <= 300; look += 5) {
      const want = at(g, g.ref.v, s.me.d + (look + late) / g.m);
      const can = Math.sqrt(Math.max(0, s.me.v ** 2 - 2 * 0.7 * (28 * g.g + 0.0035 * s.me.v ** 2) * look));
      if (can > want) brake = 1;
    }
    const inp: Input = { throttle: brake ? 0 : 1, brake, steer: Math.max(-1, Math.min(1, (lane - s.me.x) * 2 - s.me.vlat * 0.15)) };
    stepDuel(s, inp, 1 / 120);
  }
  return s.result!;
}

describe("cockpit duel", () => {
  it("finds braking zones, heaviest first", () => {
    const z = zones(monza());
    expect(z.length).toBeGreaterThan(4);
    expect(z[0].drop).toBeGreaterThanOrEqual(z[1].drop);
  });
  it("a tidy attack on the inside gains, a flat-out one ends off the road or in the car", () => {
    const g = monza();
    const z = zones(g)[0];
    const duel = startDuel(g, "attack", "free", 0);
    const good = run(duel, 0, -0.9 * z.turn);
    expect(good.q).toBeGreaterThan(0.55);
    expect(inferMove(duel)).toBe("inside"); // driving up the inside counts as the inside move
    const silly = run(startDuel(g, "attack", "inside", 0), 400, -0.9 * z.turn);
    expect(silly.q).toBeLessThan(0.2);
  });
  it("defending: covering the inside keeps him behind", () => {
    const g = monza();
    const z = zones(g)[0];
    const r = run(startDuel(g, "defend", "coverIn", 0), 0, -0.9 * z.turn);
    expect(r.q).toBeGreaterThan(0.5);
  });
});

describe("cockpit duel on every circuit", async () => {
  const { CIRCUITS } = await import("../../../../data/manual/circuits");
  it("sets up and finishes a tidy run at each track, attacking and defending", () => {
    const bad: string[] = [];
    for (const c of CIRCUITS) {
      const g = build(track(c.id), c.km, c.base - 0.4);
      for (const side of ["attack", "defend"] as const)
        for (const pick of [0, 1, 2]) {
          const s = startDuel(g, side, side === "attack" ? "inside" : "coverIn", pick);
          const r = run(s, 0, -0.9 * s.zone.turn);
          if (!r || r.why === "Contact" || r.why === "Ran wide") bad.push(`${c.id} ${side} ${pick}: ${r?.why}`);
        }
    }
    expect(bad).toEqual([]);
  });
});

describe("driving assists", async () => {
  const { CIRCUITS } = await import("../../../../data/manual/circuits");
  const { assisted } = await import("../assist");
  const drive = (s: Duel, level: "full" | "medium", inp: Input) => {
    for (let i = 0; i < 120 * 30 && !s.result; i++) stepDuel(s, assisted(s.g, s.me, inp, level, 1, aheadOf(s)).inp, 1 / 120);
    return s.result!;
  };
  it("full: hands off the wheel, the car makes every braking zone cleanly; medium: never braking, it still brakes for you", () => {
    const bad: string[] = [];
    for (const c of CIRCUITS) {
      const g = build(track(c.id), c.km, c.base - 0.4);
      for (const side of ["attack", "defend"] as const) {
        const a = drive(startDuel(g, side, "hold", 0), "full", { throttle: 0, brake: 0, steer: 0 });
        if (a.why === "Contact" || a.why === "Ran wide") bad.push(`${c.id} full ${side}: ${a.why}`);
        const b = drive(startDuel(g, side, "hold", 1), "medium", { throttle: 1, brake: 0, steer: 0 });
        if (b.why === "Contact" || b.why === "Ran wide") bad.push(`${c.id} medium ${side}: ${b.why}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
