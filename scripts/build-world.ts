// Builds public/data/world-2026.json (teams, cars, drivers, juniors, calendar, circuits) and
// data/generated/targets.json (real race averages for `npm run calibrate`) from cached raw data.
//
// Driver ratings: hand ratings (data/manual/drivers.ts) for 2/3, data for 1/3. The data part solves a
// small least-squares problem: qualifying and race-time gaps between teammates (2025 + 2026, every
// pairing links the grid together) with the hand ratings as the prior.
// Cars: 2026 qualifying gap of each team to pole, corrected for its drivers, on the engine's scale.
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CIRCUITS } from "../data/manual/circuits";
import { HAND, TAG_KEYS } from "../data/manual/drivers";
import { JUNIOR_TEAMS, TEAMS } from "../data/manual/teams";
import { genDriver } from "../src/engine/generate";
import { clampRating, ovrOf, RATING_KEYS } from "../src/engine/ratings";
import { RACE } from "../src/engine/race/model";
import { makeRng } from "../src/engine/rng";
import type { Circuit, Driver, DriverRatings, Round, Team, World } from "../src/engine/types";
import { RAW, readRaw } from "./lib/cache";
import { buildTracks } from "./lib/tracks";

const SEASON = 2026;
const ROOT = join(import.meta.dirname, "..");

interface Session { session_key: number; circuit_key: number; date_start: string; is_cancelled?: boolean; year: number; meeting_key: number }
interface ResultRow { position: number | null; driver_number: number; number_of_laps: number; dnf: boolean; dns: boolean; dsq: boolean; duration: number | number[] | null; gap_to_leader: number | string | (number | string | null)[] | null }
interface DriverRow { driver_number: number; name_acronym: string; team_name: string; full_name: string }

function sessions(year: number, kind: "Race" | "Qualifying"): Session[] {
  return (readRaw<Session[]>(`openf1/${year}/sessions-${kind}.json`) ?? []).filter((s) => !s.is_cancelled && s.date_start < new Date().toISOString());
}
const result = (y: number, k: number) => readRaw<ResultRow[]>(`openf1/${y}/result-${k}.json`) ?? [];
const drivers = (y: number, k: number) => readRaw<DriverRow[]>(`openf1/${y}/drivers-${k}.json`) ?? [];

// ---------- pairwise teammate gaps ----------
interface Pair { a: string; b: string; d: number; w: number } // a - b in rating points (positive = a better)

function teammatePairs(years: number[], kind: "Race" | "Qualifying"): Pair[] {
  const out: Pair[] = [];
  for (const y of years) {
    const yw = y === SEASON ? 1 : 0.6;
    for (const s of sessions(y, kind)) {
      const res = result(y, s.session_key);
      const dr = new Map(drivers(y, s.session_key).map((d) => [d.driver_number, d]));
      const byTeam = new Map<string, { code: string; t: number }[]>();
      const raceTime = res.find((r) => r.position === 1 && typeof r.duration === "number")?.duration as number | undefined;
      for (const r of res) {
        const d = dr.get(r.driver_number);
        if (!d || r.dns || r.dsq) continue;
        let t: number | null = null;
        if (kind === "Qualifying" && Array.isArray(r.duration)) {
          const ts = r.duration.filter((x): x is number => typeof x === "number" && x > 0);
          t = ts.length ? Math.min(...ts) : null;
        } else if (kind === "Race" && !r.dnf && raceTime && typeof r.gap_to_leader === "number") t = raceTime + r.gap_to_leader;
        if (t === null) continue;
        const list = byTeam.get(d.team_name) ?? [];
        list.push({ code: d.name_acronym, t });
        byTeam.set(d.team_name, list);
      }
      for (const list of byTeam.values()) {
        if (list.length !== 2) continue;
        const [x, y2] = list;
        const pct = ((y2.t - x.t) / Math.min(x.t, y2.t)) * 100; // positive = x quicker
        const cap = kind === "Qualifying" ? 1.2 : 0.8;
        if (Math.abs(pct) > cap * 2) continue; // a broken lap / a problem, not pace
        const clipped = Math.max(-cap, Math.min(cap, pct));
        // percent of a lap -> rating points (the engine: drvK per point)
        const pts = clipped / 100 / RACE.drvK;
        out.push({ a: x.code, b: y2.code, d: pts, w: kind === "Race" ? yw * 0.5 : yw });
      }
    }
  }
  return out;
}

/** Least squares: sum w (q_a - q_b - d)^2 + lambda (q - prior)^2, by Gauss-Seidel. */
function solve(pairs: Pair[], prior: Map<string, number>, lambda: number): Map<string, number> {
  const q = new Map(prior);
  for (const p of pairs) for (const c of [p.a, p.b]) if (!q.has(c)) q.set(c, 82);
  const pri = new Map([...q.keys()].map((k) => [k, prior.get(k) ?? 82]));
  for (let it = 0; it < 200; it++)
    for (const k of q.keys()) {
      let num = lambda * pri.get(k)!;
      let den = lambda;
      for (const p of pairs) {
        if (p.a === k) {
          num += p.w * (q.get(p.b)! + p.d);
          den += p.w;
        } else if (p.b === k) {
          num += p.w * (q.get(p.a)! - p.d);
          den += p.w;
        }
      }
      q.set(k, num / den);
    }
  return q;
}

// ---------- drivers ----------
function handRatings(h: (typeof HAND)[number]): DriverRatings {
  const r = {} as DriverRatings;
  for (const k of RATING_KEYS) r[k] = h.base - 1.5;
  for (const t of h.tags) for (const k of TAG_KEYS[t]) r[k as keyof DriverRatings] += 5;
  for (const k of h.weak ?? []) r[k as keyof DriverRatings] -= 6;
  r.aggression = h.aggression;
  // re-centre so the overall lands on the hand base
  const off = h.base - ovrOf(r);
  for (const k of RATING_KEYS) if (k !== "aggression") r[k] = clampRating(r[k] + off);
  return r;
}

function buildDrivers(): Driver[] {
  const years = [2025, 2026];
  const hand = new Map(HAND.map((h) => [h.code, { h, r: handRatings(h) }]));
  const qPairs = teammatePairs(years, "Qualifying");
  const rPairs = teammatePairs(years, "Race");
  const q = solve(qPairs, new Map([...hand].map(([c, x]) => [c, x.r.quali])), 1.5);
  const p = solve(rPairs, new Map([...hand].map(([c, x]) => [c, x.r.pace])), 1.5);
  // retirements per start vs the grid (2026)
  const starts = new Map<string, number>();
  const dnfs = new Map<string, number>();
  for (const s of sessions(SEASON, "Race")) {
    const dr = new Map(drivers(SEASON, s.session_key).map((d) => [d.driver_number, d.name_acronym]));
    for (const r of result(SEASON, s.session_key)) {
      const c = dr.get(r.driver_number);
      if (!c || r.dns) continue;
      starts.set(c, (starts.get(c) ?? 0) + 1);
      if (r.dnf) dnfs.set(c, (dnfs.get(c) ?? 0) + 1);
    }
  }
  const out: Driver[] = [];
  for (const { h, r } of hand.values()) {
    const ratings = { ...r };
    const blend = (hk: number, data: number | undefined) => clampRating(data === undefined ? hk : (2 / 3) * hk + (1 / 3) * data);
    ratings.quali = blend(r.quali, q.get(h.code));
    ratings.pace = blend(r.pace, p.get(h.code));
    const st = starts.get(h.code) ?? 0;
    if (st >= 6) {
      const rate = (dnfs.get(h.code) ?? 0) / st;
      ratings.consistency = clampRating(ratings.consistency - (rate - 0.12) * 12);
    }
    const ovr = ovrOf(ratings);
    out.push({
      id: h.id,
      first: h.first,
      last: h.last,
      code: h.code,
      num: h.num,
      nat: h.nat,
      born: h.born,
      series: "F1",
      teamId: h.team,
      ratings,
      ovr,
      pot: Math.max(ovr, h.pot ?? ovr),
      peak: h.peak ?? 28,
      decline: h.decline ?? 34,
      contract: { teamId: h.team, until: h.until, salary: Math.round(Math.max(1, (ovr - 70) * 2.3) * 1e6) },
      real: true,
    });
    console.log(`${h.code} ovr ${ovr} quali ${r.quali}->${ratings.quali} (data ${q.get(h.code)?.toFixed(1)}) pace ${r.pace}->${ratings.pace} (data ${p.get(h.code)?.toFixed(1)})`);
  }
  return out;
}

// ---------- cars ----------
function buildTeams(ds: Driver[]): Team[] {
  const gaps = new Map<string, number[]>();
  const quali = new Map(ds.map((d) => [d.code, d.ratings.quali]));
  for (const s of sessions(SEASON, "Qualifying")) {
    const res = result(SEASON, s.session_key);
    const dr = new Map(drivers(SEASON, s.session_key).map((d) => [d.driver_number, d]));
    const best = new Map<string, { t: number; code: string }>();
    for (const r of res) {
      const d = dr.get(r.driver_number);
      if (!d || !Array.isArray(r.duration)) continue;
      const ts = r.duration.filter((x): x is number => typeof x === "number" && x > 0);
      if (!ts.length) continue;
      // Q1 times are slower (track evolution): compare everyone on their Q1 lap
      const t = ts[0];
      const cur = best.get(d.team_name);
      if (!cur || t < cur.t) best.set(d.team_name, { t, code: d.name_acronym });
    }
    const pole = Math.min(...[...best.values()].map((x) => x.t));
    for (const [team, b] of best) {
      const g = (b.t - pole) / pole + RACE.drvK * ((quali.get(b.code) ?? 85) - 92); // remove the driver's part
      gaps.set(team, [...(gaps.get(team) ?? []), g]);
    }
  }
  const med = (a: number[]) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const teamGap = new Map([...gaps].map(([k, v]) => [k, med(v)]));
  const minGap = Math.min(...teamGap.values());
  // reliability: 2026 retirements per car-race
  const rel = new Map<string, { n: number; dnf: number }>();
  for (const s of sessions(SEASON, "Race")) {
    const dr = new Map(drivers(SEASON, s.session_key).map((d) => [d.driver_number, d.team_name]));
    for (const r of result(SEASON, s.session_key)) {
      const t = dr.get(r.driver_number);
      if (!t || r.dns) continue;
      const x = rel.get(t) ?? { n: 0, dnf: 0 };
      x.n++;
      if (r.dnf) x.dnf++;
      rel.set(t, x);
    }
  }
  const allRate = [...rel.values()].reduce((s, x) => s + x.dnf, 0) / Math.max(1, [...rel.values()].reduce((s, x) => s + x.n, 0));
  const teams: Team[] = TEAMS.map((t) => {
    const g = teamGap.get(t.openf1);
    const level = g === undefined ? 80 : 94 - (g - minGap) / RACE.carK;
    const r = rel.get(t.openf1);
    const rate = r ? (r.dnf + allRate * 8) / (r.n + 8) : allRate; // shrink toward the grid
    const reliability = Math.max(74, Math.min(95, 100 - ((rate * 0.55) / (RACE.mech * 57)) * 100));
    console.log(`${t.short} car ${level.toFixed(1)} (gap ${g === undefined ? "?" : ((g - minGap) * 100).toFixed(2) + "%"}) rel ${reliability.toFixed(1)} dnf ${(rate * 100).toFixed(1)}%`);
    return {
      id: t.id,
      name: t.name,
      short: t.short,
      color: t.color,
      color2: t.color2,
      engine: t.engine,
      series: "F1" as const,
      car: { power: level + t.tilt.power, aero: level + t.tilt.aero, mech: level + t.tilt.mech, reliability, dev: t.dev },
      budget: t.budget,
      drivers: ds.filter((d) => d.teamId === t.id).map((d) => d.id),
    };
  });
  return teams;
}

// ---------- juniors ----------
function buildJuniors(): { teams: Team[]; drivers: Driver[] } {
  const rng = makeRng(2026);
  const teams: Team[] = [];
  const out: Driver[] = [];
  for (const j of JUNIOR_TEAMS) {
    const id = `${j.series.toLowerCase()}-${j.short.toLowerCase()}`;
    const per = j.series === "F2" ? 2 : 3;
    const t: Team = {
      id,
      name: j.name,
      short: j.short,
      color: j.color,
      color2: "#111111",
      engine: j.series === "F2" ? "Mecachrome" : "Mecachrome",
      series: j.series,
      car: { power: j.level, aero: j.level, mech: j.level, reliability: 92, dev: 50 },
      budget: 3,
      drivers: [],
    };
    for (let i = 0; i < per; i++) {
      const d =
        j.series === "F2"
          ? genDriver(rng, { series: "F2", season: SEASON, age: rng.int(19, 23), level: rng.normal(72, 3.5), pot: rng.normal(80, 4), idPrefix: "f2-" })
          : genDriver(rng, { series: "F3", season: SEASON, age: rng.int(17, 20), level: rng.normal(64, 3.5), pot: rng.normal(76, 5), idPrefix: "f3-" });
      d.teamId = id;
      t.drivers.push(d.id);
      out.push(d);
    }
    teams.push(t);
  }
  return { teams, drivers: out };
}

// ---------- calendar ----------
function buildCalendar(): Round[] {
  const races = (readRaw<Session[]>(`openf1/${SEASON}/sessions-Race.json`) ?? []).filter((s) => !s.is_cancelled);
  const byKey = new Map(CIRCUITS.map((c) => [c.key, c]));
  return races
    .sort((a, b) => a.date_start.localeCompare(b.date_start))
    .map((s) => byKey.get(s.circuit_key))
    .filter((c): c is (typeof CIRCUITS)[number] => !!c)
    .map((c, i) => ({ round: i + 1, circuitId: c.id, date: races.find((s) => s.circuit_key === c.key)!.date_start.slice(0, 10) }));
}

// ---------- calibration targets ----------
function buildTargets(years: number[]) {
  const out: Record<string, { value: number; n: number; note: string }> = {};
  const add = (k: string, xs: number[], note: string) => {
    if (xs.length) out[k] = { value: Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 1000) / 1000, n: xs.length, note };
  };
  const dnf: number[] = [];
  const pits: number[] = [];
  const scAny: number[] = [];
  const scCount: number[] = [];
  const vscAny: number[] = [];
  const overtakes: number[] = [];
  const poleWin: number[] = [];
  const margin: number[] = [];
  const lapped: number[] = [];
  const spearman: number[] = [];
  const top3Pole: number[] = [];
  for (const y of years) {
    const qByMeeting = new Map(sessions(y, "Qualifying").map((s) => [s.meeting_key, s.session_key]));
    for (const s of sessions(y, "Race")) {
      const res = result(y, s.session_key);
      if (res.length < 15) continue;
      const started = res.filter((r) => !r.dns);
      dnf.push(started.filter((r) => r.dnf).length);
      const winner = res.find((r) => r.position === 1);
      const p2 = res.find((r) => r.position === 2);
      if (p2 && typeof p2.gap_to_leader === "number") margin.push(p2.gap_to_leader);
      if (winner) lapped.push(started.filter((r) => !r.dnf && r.number_of_laps < winner.number_of_laps).length);
      const pit = readRaw<{ driver_number: number }[]>(`openf1/${y}/pit-${s.session_key}.json`) ?? [];
      if (pit.length) {
        const fin = started.filter((r) => !r.dnf);
        const per = fin.map((r) => pit.filter((p) => p.driver_number === r.driver_number).length);
        pits.push(per.reduce((a, b) => a + b, 0) / per.length);
      }
      const sc = readRaw<{ message: string }[]>(`openf1/${y}/sc-${s.session_key}.json`) ?? [];
      const nSc = sc.filter((m) => /^SAFETY CAR DEPLOYED/.test(m.message)).length;
      scAny.push(nSc > 0 ? 1 : 0);
      scCount.push(nSc);
      vscAny.push(sc.some((m) => /(VIRTUAL SAFETY CAR|VSC) DEPLOYED/.test(m.message)) ? 1 : 0);
      const ot = readRaw<unknown[]>(`openf1/${y}/overtakes-${s.session_key}.json`);
      if (ot && ot.length) overtakes.push(ot.length);
      const qk = qByMeeting.get(s.meeting_key);
      if (qk) {
        const qr = result(y, qk);
        const pole = qr.find((r) => r.position === 1);
        if (pole && winner) poleWin.push(pole.driver_number === winner.driver_number ? 1 : 0);
        if (winner) {
          const wq = qr.find((r) => r.driver_number === winner.driver_number);
          if (wq?.position) top3Pole.push(wq.position <= 3 ? 1 : 0);
        }
        // rank correlation among finishers
        const pairs = started
          .filter((r) => !r.dnf && r.position)
          .map((r) => [qr.find((x) => x.driver_number === r.driver_number)?.position ?? null, r.position!] as const)
          .filter((x): x is readonly [number, number] => x[0] !== null);
        if (pairs.length > 10) spearman.push(rankCorr(pairs.map((x) => x[0]), pairs.map((x) => x[1])));
      }
    }
  }
  add("dnfPerRace", dnf, "retirements per race");
  add("pitsPerFinisher", pits, "pit stops per classified finisher");
  add("scShare", scAny, "share of races with a safety car");
  add("scPerRace", scCount, "safety-car periods per race");
  add("vscShare", vscAny, "share of races with a virtual safety car");
  add("overtakesPerRace", overtakes, "OpenF1 overtakes per race (all on-track position swaps, incl. lap 1)");
  add("poleWin", poleWin, "pole sitter wins");
  add("winnerTop3Grid", top3Pole, "winner qualified top 3");
  add("winMargin", margin, "P1-P2 gap at the flag (s)");
  add("lappedPerRace", lapped, "classified cars a lap down or more");
  add("qualiFinishCorr", spearman, "rank correlation qualifying -> finish (finishers)");
  return out;
}

function rankCorr(a: number[], b: number[]): number {
  const rank = (xs: number[]) => {
    const idx = xs.map((x, i) => [x, i] as const).sort((p, q) => p[0] - q[0]);
    const r = new Array(xs.length);
    idx.forEach(([, i], k) => (r[i] = k + 1));
    return r as number[];
  };
  const ra = rank(a);
  const rb = rank(b);
  const n = a.length;
  const d2 = ra.reduce((s, x, i) => s + (x - rb[i]) ** 2, 0);
  return 1 - (6 * d2) / (n * (n * n - 1));
}

// ---------- main ----------
if (!readdirSync(join(RAW, "openf1")).length) throw new Error("run npm run data:fetch first");
const pitLoss = buildTracks();
const f1Drivers = buildDrivers();
const f1Teams = buildTeams(f1Drivers);
const juniors = buildJuniors();
const calendar = buildCalendar();
const used = new Set(calendar.map((r) => r.circuitId));
const circuits: Circuit[] = CIRCUITS.filter((c) => used.has(c.id)).map((c) => ({ ...c, pitLoss: pitLoss[c.id] ?? { normal: 21, sc: 13, vsc: 15 } }));
const carMean = f1Teams.reduce((s, t) => s + (t.car.power + t.car.aero + t.car.mech) / 3, 0) / f1Teams.length;
const world: World = {
  version: 1,
  seed: 0,
  season: SEASON,
  calendar,
  circuits,
  teams: [...f1Teams, ...juniors.teams],
  drivers: [...f1Drivers, ...juniors.drivers],
  results: [],
  replays: {},
  history: [],
  carMean: Math.round(carMean * 10) / 10,
};
mkdirSync(join(ROOT, "public/data"), { recursive: true });
writeFileSync(join(ROOT, `public/data/world-${SEASON}.json`), JSON.stringify(world));
mkdirSync(join(ROOT, "data/generated"), { recursive: true });
const targets = { all: buildTargets([2023, 2024, 2025, 2026]), y2026: buildTargets([2026]) };
writeFileSync(join(ROOT, "data/generated/targets.json"), JSON.stringify(targets, null, 2));
console.log(`world-${SEASON}: ${calendar.length} rounds, ${f1Teams.length} F1 teams, ${world.drivers.length} drivers, car mean ${carMean.toFixed(1)}`);
console.log(targets);
