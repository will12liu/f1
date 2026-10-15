import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { TrackFile } from "../components/bits";
import { at, build, lapScore, refLap, refSectors, startState, stepCar, vLimit, type Geo, type Input } from "./drive";

const track = (id: string) => JSON.parse(readFileSync(`public/data/tracks/${id}.json`, "utf8")) as TrackFile;
const monza = () => build(track("monza"), 5.793, 83.1);
const monaco = () => build(track("monaco"), 3.337, 75.1);

/** A tidy driver: brakes when the reference profile ahead is slower than it can brake to, else throttle;
 *  holds the middle of the road unless told to steer. Stops once the lap is deleted. */
function drive(g: Geo, grip = 1, aggression = 1, steer?: () => number) {
  const s = startState(g);
  const dt = 1 / 120;
  let steps = 0;
  while (!s.done && !s.deleted && steps++ < 120 * 200) {
    // brake if any point in the next 300 m needs a speed we can't reach by braking from here
    let brake = 0;
    for (let look = 0; look <= 300; look += 10) {
      const dd = s.d + look / g.m;
      const want = at(g, g.ref.v, dd) * aggression;
      const can = Math.sqrt(Math.max(0, s.v * s.v - 2 * 0.7 * (28 * g.g + 0.0035 * s.v * s.v) * look));
      if (can > want) brake = 1;
    }
    const hold = Math.max(-1, Math.min(1, -s.x * 2 - s.vlat * 0.15));
    const inp: Input = { throttle: brake ? 0 : 1, brake, steer: steer ? steer() : hold };
    stepCar(g, s, inp, dt, grip);
  }
  return s;
}

describe("qualifying lap driving model", () => {
  it("tunes the grip so the perfect lap matches the engine's pole time", () => {
    const g = monza();
    expect(Math.abs(g.ref.lap - 83.1)).toBeLessThan(0.02);
    expect(g.g).toBeGreaterThan(0.5);
    expect(g.g).toBeLessThan(1.2);
    const m = monaco();
    expect(Math.abs(m.ref.lap - 75.1)).toBeLessThan(0.02);
    // the reference times are monotonic and the sectors add up to the reference lap
    for (let i = 1; i <= g.n; i++) expect(g.ref.t[i]).toBeGreaterThan(g.ref.t[i - 1]);
    const secs = refSectors(g);
    expect(Math.abs(secs.reduce((a, b) => a + b, 0) - refLap(g))).toBeLessThan(0.01);
  });

  it("corner speed limits come from curvature", () => {
    expect(vLimit(0, 1)).toBe(Infinity);
    expect(vLimit(1 / 20, 1)).toBeLessThan(vLimit(1 / 60, 1));
    expect(vLimit(1 / 20, 1.1)).toBeGreaterThan(vLimit(1 / 20, 1));
  });

  it("a driver who follows the reference profile gets round near the reference time and stays on the track", () => {
    for (const g of [monza(), monaco()]) {
      const s = drive(g);
      expect(s.done).toBe(true);
      expect(s.deleted).toBe(false);
      expect(s.sectors.length).toBe(3);
      expect(s.t).toBeGreaterThan(g.ref.lap * 0.98);
      expect(s.t).toBeLessThan(g.ref.lap * 1.06);
      expect(Math.abs(s.sectors.reduce((a, b) => a + b, 0) - s.t)).toBeLessThan(0.01);
    }
  });

  it("too much speed into a corner runs the car wide and the lap gets deleted", () => {
    const g = monza();
    const s = drive(g, 1, 1.25); // brakes for 25% more than the corners allow
    expect(s.deleted).toBe(true);
  });

  it("more grip from a better driver keeps the same aggressive inputs on the road", () => {
    const g = monaco();
    expect(drive(g, 1, 1.08).deleted).toBe(true); // 8% over the corner speeds on a real-width road: off
    const b = drive(g, 1.06, 1.08);
    expect(b.deleted).toBe(false);
    expect(b.t).toBeLessThan(g.ref.lap);
  });

  it("using the width of the road beats the centreline reference", () => {
    const g = monza();
    const s = drive(g, 1, 1.06);
    expect(s.deleted).toBe(false);
    expect(s.t).toBeLessThan(g.ref.lap);
    expect(lapScore(g, s.t, false)).toBeGreaterThan(0.9);
  });

  it("flat out, no brakes, is off the road at the first proper corner (a real-width road, not the drawing's)", () => {
    const g = build(track("albert_park"), 5.278, 80.1);
    const s = startState(g);
    for (let i = 0; i < 120 * 20 && !s.deleted; i++) stepCar(g, s, { throttle: 1, brake: 0, steer: 0 }, 1 / 120);
    expect(s.deleted).toBe(true);
    expect(s.t).toBeLessThan(10);
  });

  it("steering off the road is track limits", () => {
    const g = monza();
    const s = drive(g, 1, 0.9, () => 1);
    expect(s.deleted).toBe(true);
    expect(s.deletedAt).toBeDefined();
  });

  it("maps the lap time to the engine's 0-1 around the reference", () => {
    const g = monza();
    const ref = refLap(g);
    expect(lapScore(g, ref, false)).toBeCloseTo(0.55, 5);
    expect(lapScore(g, g.ref.lap, false)).toBeGreaterThan(0.95);
    expect(lapScore(g, ref + 10, false)).toBe(0);
    expect(lapScore(g, ref - 10, false)).toBe(1);
    expect(lapScore(g, ref - 1, true)).toBe(0.1);
  });
});
