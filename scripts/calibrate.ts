// Sims races on the 2026 calendar with the real grid and compares averages with real targets
// (data/generated/targets.json from `npm run data`, plus a few hand targets). Usage: npm run calibrate [races]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dayForms } from "../src/engine/race/model";
import { qualify } from "../src/engine/race/qualifying";
import { simRace } from "../src/engine/race/race";
import { carPace } from "../src/engine/ratings";
import { lineup } from "../src/engine/season/season";
import type { World } from "../src/engine/types";

const ROOT = join(import.meta.dirname, "..");
const world = JSON.parse(readFileSync(join(ROOT, "public/data/world-2026.json"), "utf8")) as World;
type Targets = Record<string, { value: number; note: string }>;
const { all: targets, y2026 } = JSON.parse(readFileSync(join(ROOT, "data/generated/targets.json"), "utf8")) as { all: Targets; y2026: Targets };

// Hand targets where the data can't measure the same thing.
const HAND: Record<string, { value: number; note: string }> = {
  passesPerRace: { value: 45, note: "on-track passes after lap 1, excl. pit cycles (2023-25 seasons ~40-50)" },
  pitsPerFinisher: { value: 1.6, note: "stops per finisher in a dry race (OpenF1's pit list also counts drive-throughs and red-flag entries)" },
};

const n = Number(process.argv[2] ?? 460);
const field = lineup(world);
const sums: Record<string, number[]> = {};
const push = (k: string, v: number) => (sums[k] ??= []).push(v);
const leadT0 = Date.now();

for (let i = 0; i < n; i++) {
  const round = world.calendar[i % world.calendar.length];
  const circuit = world.circuits.find((c) => c.id === round.circuitId)!;
  const seed = 1000 + i;
  const form = dayForms(seed, field.length);
  const q = qualify(seed, circuit, field.map(({ team, driver }, k) => ({ driverId: driver.id, teamId: team.id, car: carPace(team.car, circuit), r: driver.ratings, form: form[k] })));
  const grid = new Map(q.map((x) => [x.driverId, x.pos]));
  const entries = field
    .map(({ team, driver }, k) => ({ driverId: driver.id, teamId: team.id, grid: grid.get(driver.id)!, car: carPace(team.car, circuit), reliability: team.car.reliability, r: driver.ratings, form: form[k] }))
    .sort((a, b) => a.grid - b.grid);
  const { result, state } = simRace({ seed, circuit, pitLoss: circuit.pitLoss, entries });
  const rows = result.rows;
  const fin = rows.filter((r) => r.status === "Finished" || r.status === "Lapped");
  push("dnfPerRace", rows.length - fin.length);
  push("pitsPerFinisher", fin.reduce((s, r) => s + r.pits, 0) / fin.length);
  push("scShare", result.sc > 0 ? 1 : 0);
  push("scPerRace", result.sc);
  push("vscShare", result.vsc > 0 ? 1 : 0);
  push("passesPerRace", state.events.filter((e) => e.kind === "pass" && e.lap > 1).length);
  push("lap1Passes", state.events.filter((e) => e.kind === "pass" && e.lap === 1).length);
  push("poleWin", rows[0].grid === 1 ? 1 : 0);
  push("winnerTop3Grid", rows[0].grid <= 3 ? 1 : 0);
  if (fin[1]?.status === "Finished") push("winMargin", fin[1].gap);
  push("lappedPerRace", fin.filter((r) => r.status === "Lapped").length);
  push("qualiFinishCorr", rankCorr(fin.map((r) => r.grid), fin.map((r) => r.pos)));
  push("leadChanges", result.leadChanges);
  const stops = fin.map((r) => r.pits);
  push("oneStopShare", stops.filter((s) => s === 1).length / stops.length);
}

function rankCorr(a: number[], b: number[]) {
  const rank = (xs: number[]) => {
    const r = new Array<number>(xs.length);
    xs.map((x, i) => [x, i] as const).sort((p, q) => p[0] - q[0]).forEach(([, i], k) => (r[i] = k + 1));
    return r;
  };
  const ra = rank(a);
  const rb = rank(b);
  const m = a.length;
  return 1 - (6 * ra.reduce((s, x, i) => s + (x - rb[i]) ** 2, 0)) / (m * (m * m - 1));
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
console.log(`${n} races in ${((Date.now() - leadT0) / 1000).toFixed(1)}s\n`);
console.log("metric".padEnd(18), "sim".padStart(8), "2023-26".padStart(8), "2026".padStart(8), "  note");
let off = 0;
for (const [k, xs] of Object.entries(sums)) {
  const t = HAND[k] ?? targets[k];
  const t26 = HAND[k] ? undefined : y2026[k];
  const sim = mean(xs);
  // within 20% of either the multi-season average or the 2026 number counts as on target
  const near = (v?: number) => v !== undefined && Math.abs(sim - v) / Math.max(0.05, Math.abs(v)) <= 0.2;
  const flag = t ? (near(t.value) || near(t26?.value) ? "" : " <-") : "";
  if (flag) off++;
  console.log(k.padEnd(18), sim.toFixed(3).padStart(8), (t ? t.value.toFixed(3) : "-").padStart(8), (t26 ? t26.value.toFixed(3) : "-").padStart(8), flag.padEnd(4), t?.note ?? "");
}
console.log(off ? `\n${off} metric(s) more than 20% off` : "\nall metrics within 20%");
