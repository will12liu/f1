import { describe, expect, it } from "vitest";
import { carPace } from "../ratings";
import { lineup } from "../season/season";
import { loadWorld } from "../testWorld";
import { createRace, simRace, type RaceInput } from "./race";

const w = loadWorld();
const field = lineup(w);
const input = (seed: number, extra: Partial<RaceInput> = {}): RaceInput => {
  const circuit = w.circuits.find((c) => c.id === "monza")!;
  return {
    seed,
    circuit,
    pitLoss: circuit.pitLoss,
    entries: field.map(({ team, driver }, i) => ({ driverId: driver.id, teamId: team.id, grid: i + 1, car: carPace(team.car, circuit), reliability: team.car.reliability, r: driver.ratings, name: driver.last })),
    ...extra,
  };
};
/** Play a live race answering every moment with `pick` (by index of the options, skipping disabled ones). */
function play(seed: number, focus: number[], pick: (opts: { id: string; disabled?: boolean }[], n: number) => string, q?: (n: number) => number | undefined) {
  const r = createRace(input(seed, { focus, moments: "all" }));
  let n = 0;
  while (!r.done()) {
    r.step();
    const m = r.pending();
    if (m) {
      const k = n++;
      r.choose(pick(m.opts, k), m.kind === "call" ? undefined : q?.(k));
    }
  }
  return { r, n };
}

describe("key moments", () => {
  it("stop the race for duels and calls, and the race replays exactly from the answers", () => {
    const { r, n } = play(21, [8, 9], (opts, k) => opts.filter((o) => !o.disabled)[k % opts.filter((o) => !o.disabled).length].id);
    expect(n).toBeGreaterThan(3);
    expect(r.state.choices.length).toBe(n);
    expect(r.state.duels.length).toBeGreaterThan(0);
    const again = simRace(input(21, { focus: [8, 9], moments: "all", choices: r.state.choices, commands: r.state.commands }));
    expect(JSON.stringify(again.result)).toBe(JSON.stringify(r.result()));
    expect(JSON.stringify(again.state.lapEnd)).toBe(JSON.stringify(r.state.lapEnd));
  });

  it("mini-game scores are stored with the answers and the race replays exactly from them", () => {
    const { r } = play(23, [8, 9], (opts, k) => opts.filter((o) => !o.disabled)[k % opts.filter((o) => !o.disabled).length].id, (k) => (k * 0.37) % 1);
    expect(r.state.choices.some((c) => c.q !== undefined)).toBe(true);
    const again = simRace(input(23, { focus: [8, 9], moments: "all", choices: r.state.choices, commands: r.state.commands }));
    expect(JSON.stringify(again.result)).toBe(JSON.stringify(r.result()));
  });

  it("execution matters: perfect braking passes more often than a missed braking point", () => {
    const rate = (q: number) => {
      let pass = 0;
      let all = 0;
      for (let s = 0; s < 20; s++) {
        const { r } = play(500 + s, [6, 7, 8, 9, 10, 11], (opts) => (opts.some((o) => o.id === "inside") ? "inside" : "auto"), () => q);
        for (const d of r.state.duels) if (d.attMove === "inside") (all++, (pass += d.passed ? 1 : 0));
      }
      return pass / Math.max(1, all);
    };
    expect(rate(1)).toBeGreaterThan(rate(0) + 0.1);
  }, 30_000);

  it("the start mini-game: a jump start is penalised, a good launch beats a slow one, and only that car's launch moves", () => {
    const jump = simRace(input(24, { launch: { 9: -1 } }));
    expect(jump.result.rows.find((r) => r.idx === 9)!.pens.join(" ")).toContain("jump");
    const good = createRace(input(24, { launch: { 9: 1 } }));
    const slow = createRace(input(24, { launch: { 9: 0 } }));
    expect(good.state.cars[9].cum).toBeLessThan(slow.state.cars[9].cum);
    expect(good.state.cars[3].cum).toBe(slow.state.cars[3].cum);
  });

  it("the pit-stop mini-game: a perfect stop is quicker than a botched one, an unsafe release is five seconds", () => {
    const stopAt = (crew: number, unsafe = false) => {
      const r = simRace(input(25, { commands: [{ lap: 12, car: 9, pit: "box", compound: "H", crew, unsafe }] }));
      const pit = r.state.events.find((e) => e.kind === "pit" && e.a === 9 && e.lap === 12)!;
      return { x: pit.x!, pens: r.result.rows.find((row) => row.idx === 9)!.pens.join(" "), r };
    };
    const good = stopAt(1);
    const bad = stopAt(0);
    expect(good.x).toBeLessThan(bad.x - 1);
    expect(stopAt(0.8, true).pens).toContain("unsafe");
    const again = simRace(input(25, { commands: good.r.state.commands }));
    expect(JSON.stringify(again.result)).toBe(JSON.stringify(good.r.result));
  });

  it("answering every moment with instinct gives exactly the race nobody played", () => {
    const { r } = play(22, [5], () => "auto");
    const plain = simRace(input(22));
    expect(JSON.stringify(r.result())).toBe(JSON.stringify(plain.result));
  });

  it("the choice matters: a dive up the inside wins more often against an outside cover than an inside cover", () => {
    // statistics over many duels: compare pass rates by the defender's response for 'inside'
    const tally: Record<string, [number, number]> = {};
    for (let s = 0; s < 40; s++) {
      const { r } = play(300 + s, [6, 7, 8, 9, 10, 11], (opts) => (opts.some((o) => o.id === "inside") ? "inside" : "auto"));
      for (const d of r.state.duels) {
        if (d.attMove !== "inside") continue;
        const t = (tally[d.defMove] ??= [0, 0]);
        t[0] += d.passed ? 1 : 0;
        t[1]++;
      }
    }
    const rate = (k: string) => (tally[k] ? tally[k][0] / Math.max(1, tally[k][1]) : NaN);
    expect(tally.coverIn?.[1]).toBeGreaterThan(5);
    expect(rate("coverIn")).toBeLessThan(rate("hold"));
  }, 60_000);

  it("with moments off nothing stops", () => {
    const r = createRace(input(23, { focus: [3], moments: "off" }));
    while (!r.done()) {
      r.step();
      expect(r.pending()).toBeNull();
    }
  });
});
