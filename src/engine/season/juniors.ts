// The junior ladder races for real: F2 (14 rounds) and F3 (10 rounds) run feature races on F1 weekends with
// the same engine (spec cars, shorter races), with championships and FIA super licence points. F4 is the
// prospect pool below them (not raced): 15-16 year-olds that F3 teams and academies pick from.
import { genDriver } from "../generate";
import { hashString, makeRng } from "../rng";
import { carPace } from "../ratings";
import type { DrivenRace } from "../race/driven";
import { applyDrivenQuali, qualify } from "../race/qualifying";
import { simRace, type Entry, type RaceInput } from "../race/race";
import type { Circuit, Driver, Series, World } from "../types";
import type { Command } from "../race/dials";
import { moraleForm } from "../career/career";
import { planEffects, type WeekendPlan } from "../race/weekend";
import type { MomentChoice } from "../race/moments";

export type Junior = "F2" | "F3";
export const JUNIOR = {
  F2: { rounds: 14, km: 170, sl: [40, 40, 40, 30, 20, 10, 8, 6, 4, 3] },
  F3: { rounds: 10, km: 120, sl: [30, 25, 20, 15, 12, 9, 7, 5, 3, 2] },
  points: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
  licence: 40, // super licence points over three seasons needed for an F1 seat
  f4Pool: 26,
};

export interface JuniorResult {
  series: Junior;
  round: number;
  circuitId: string;
  rows: { driverId: string; teamId: string; grid: number; pos: number; points: number; status: string }[];
}

/** Evenly spread junior rounds over the F1 calendar (1-based round numbers). */
export function juniorRounds(calendarLength: number, series: Junior): number[] {
  const n = Math.min(calendarLength, JUNIOR[series].rounds);
  return Array.from({ length: n }, (_, i) => Math.round(((i + 0.5) * calendarLength) / n + 0.01));
}
export const isJuniorRound = (w: World, series: Junior, round: number) => juniorRounds(w.calendar.length, series).includes(round);

/** The junior grid at a circuit as a race input (spec cars: a third of the F1-style spread). */
export function juniorInput(w: World, series: Junior, round: number, circuit: Circuit, plan?: WeekendPlan, qualiTimes?: Record<string, number>): RaceInput {
  const seed = hashString(`${w.seed}:${w.season}:${round}:${series}`);
  const fx = (id: string) => (plan?.[id] ? planEffects(seed, circuit, plan[id]) : null);
  const teams = w.teams.filter((t) => t.series === series);
  const dm = new Map(w.drivers.map((d) => [d.id, d]));
  const field = teams.flatMap((t) => t.drivers.map((id) => ({ team: t, driver: dm.get(id) })).filter((x): x is { team: (typeof teams)[number]; driver: Driver } => !!x.driver && !x.driver.retired));
  const car = (t: (typeof teams)[number]) => 80 + (carPace(t.car, circuit) - 80) * 0.6;
  let q = qualify(
    seed,
    circuit,
    field.map(({ team, driver }) => ({
      driverId: driver.id,
      teamId: team.id,
      car: car(team),
      r: fx(driver.id)?.quali(driver.ratings) ?? driver.ratings,
      form: (moraleForm(w, driver.id) || 0) + (fx(driver.id)?.form ?? 0) || undefined,
      plan: plan?.[driver.id] ? { risk: plan[driver.id].risk, late: plan[driver.id].late, laps: plan[driver.id].laps } : undefined,
    })),
  );
  if (qualiTimes) q = applyDrivenQuali(q, qualiTimes);
  const grid = new Map(q.map((x) => [x.driverId, x.pos]));
  const entries: Entry[] = field
    .map(({ team, driver }) => ({
      driverId: driver.id,
      teamId: team.id,
      grid: grid.get(driver.id)!,
      car: car(team),
      reliability: team.car.reliability,
      r: fx(driver.id)?.race(driver.ratings) ?? driver.ratings,
      name: driver.last,
      form: (moraleForm(w, driver.id) || 0) + (fx(driver.id)?.form ?? 0) || undefined,
    }))
    .sort((a, b) => a.grid - b.grid);
  const laps = Math.max(12, Math.round(JUNIOR[series].km / circuit.km));
  // junior cars are slower: a longer base lap (F2 ~ +8%, F3 ~ +14%)
  const slow = series === "F2" ? 1.08 : 1.14;
  return { seed, circuit: { ...circuit, base: circuit.base * slow }, pitLoss: circuit.pitLoss, entries, laps };
}

export interface JuniorLive {
  series: Junior;
  commands: Command[];
  choices: MomentChoice[];
  focus: number[];
  moments: "off" | "key" | "all";
  plan?: WeekendPlan;
  duelEdge?: number;
  launch?: Record<number, number>;
}

/** A junior race the player drove, in the shape the championship stores. */
export function juniorResultFrom(series: Junior, round: number, circuitId: string, race: DrivenRace): JuniorResult {
  return {
    series,
    round,
    circuitId,
    rows: race.rows.map((r) => ({
      driverId: r.driverId,
      teamId: r.teamId,
      grid: r.grid,
      pos: r.pos,
      points: r.pos <= JUNIOR.points.length ? JUNIOR.points[r.pos - 1] : 0,
      status: r.status,
    })),
  };
}

/** Run this round's junior races (if any). `live` replays the one the player drove.
 *  `replace` is a race they drove themselves, used instead of simulating that series. */
export function simJuniorRound(w: World, round: number, circuit: Circuit, live?: JuniorLive, replace?: JuniorResult, qualiTimes?: Record<string, number>) {
  ensureProspects(w);
  for (const series of ["F3", "F2"] as Junior[]) {
    if (!isJuniorRound(w, series, round)) continue;
    if (replace && replace.series === series && replace.round === round) {
      (w.juniorResults ??= []).push(replace);
      continue;
    }
    const input = juniorInput(w, series, round, circuit, live?.series === series ? live.plan : undefined, qualiTimes);
    if (input.entries.length < 6) continue;
    const l = live?.series === series ? live : undefined;
    const { result, state } = simRace(l ? { ...input, commands: l.commands, choices: l.choices, focus: l.focus, moments: l.moments, reads: w.reads, duelEdge: l.duelEdge, launch: l.launch } : input);
    for (const x of state.seen) {
      const r = ((w.reads ??= {})[x.driverId] ??= { def: {}, att: {} });
      r[x.role][x.move] = (r[x.role][x.move] ?? 0) + 1;
    }
    (w.juniorResults ??= []).push({
      series,
      round,
      circuitId: circuit.id,
      rows: result.rows.map((r) => {
        const fin = r.status === "Finished" || r.status === "Lapped";
        return { driverId: r.driverId, teamId: r.teamId, grid: r.grid, pos: r.pos, points: fin && r.pos <= 10 ? JUNIOR.points[r.pos - 1] : 0, status: r.status };
      }),
    });
  }
}

export interface JuniorStanding {
  driverId: string;
  teamId: string;
  points: number;
  wins: number;
  podiums: number;
  races: number;
}
export function juniorStandings(w: World, series: Junior): JuniorStanding[] {
  const rows = new Map<string, JuniorStanding>();
  for (const res of (w.juniorResults ?? []).filter((x) => x.series === series))
    for (const r of res.rows) {
      const x = rows.get(r.driverId) ?? { driverId: r.driverId, teamId: r.teamId, points: 0, wins: 0, podiums: 0, races: 0 };
      x.points += r.points;
      x.races++;
      if (r.pos === 1 && r.points) x.wins++;
      if (r.pos <= 3 && r.points) x.podiums++;
      x.teamId = r.teamId;
      rows.set(r.driverId, x);
    }
  return [...rows.values()].sort((a, b) => b.points - a.points || b.wins - a.wins);
}

/** Super licence points from the last three seasons (an F1 start counts as licensed). */
export function licencePointsSL(d: Driver, season: number): number {
  return (d.sl ?? []).filter((x) => x.season > season - 3).reduce((s, x) => s + x.pts, 0);
}
export function hasLicence(w: World, d: Driver): boolean {
  if (d.series === "F1" && d.teamId) return true;
  if (w.history.some((h) => h.standings.some((r) => r.driverId === d.id))) return true;
  if (d.real && d.series === "F1") return true;
  return licencePointsSL(d, w.season) >= JUNIOR.licence;
}

/** End of season: junior champions and super licence points from the final standings. */
export function juniorSeasonEnd(w: World): { F2?: string; F3?: string } {
  const out: { F2?: string; F3?: string } = {};
  const dm = new Map(w.drivers.map((d) => [d.id, d]));
  // the first time: give the 2026 junior grid the points they earned before the game began (by level)
  if (!w.slSeeded) {
    w.slSeeded = true;
    for (const series of ["F2", "F3"] as Junior[]) {
      const ds = w.drivers.filter((d) => d.series === series && !d.retired).sort((a, b) => b.ovr - a.ovr);
      ds.forEach((d, i) => {
        const pts = JUNIOR[series].sl[Math.min(9, i + 2)] ?? 0;
        if (pts) (d.sl ??= []).push({ season: w.season - 1, series, pos: i + 3, pts });
      });
    }
  }
  for (const series of ["F2", "F3"] as Junior[]) {
    const st = juniorStandings(w, series);
    if (st[0]) out[series] = st[0].driverId;
    st.forEach((r, i) => {
      const d = dm.get(r.driverId);
      const pts = JUNIOR[series].sl[i] ?? 0;
      if (d && pts) (d.sl ??= []).push({ season: w.season, series, pos: i + 1, pts });
    });
  }
  return out;
}

/** The F4 prospect pool: 15-16 year-olds below F3 (topped up every winter). */
export function ensureProspects(w: World, season = w.season) {
  const pool = w.drivers.filter((d) => d.series === ("F4" as Series) && !d.retired);
  if (pool.length >= JUNIOR.f4Pool) return;
  const rng = makeRng(hashString(`${w.seed}:f4:${season}`));
  for (let i = pool.length; i < JUNIOR.f4Pool; i++) {
    const age = rng.int(15, 16);
    const level = rng.normal(57, 4);
    const pot = Math.min(96, level + Math.abs(rng.normal(0, 9)) + 10);
    w.drivers.push(genDriver(rng, { series: "F4" as Series, season, age, level, pot, idPrefix: "p" }));
  }
}
