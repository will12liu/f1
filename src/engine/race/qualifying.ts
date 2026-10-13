// Knockout qualifying (Q1/Q2/Q3). One flying lap per session from car pace, qualifying pace, track
// evolution and luck; a scrappy lap (lock-up, running wide) is a risk roll that grows with inconsistency.
import { makeRng } from "../rng";
import type { CircuitDef, DriverRatings } from "../types";
import { RACE } from "./model";

export interface QualiEntry {
  driverId: string;
  teamId: string;
  car: number;
  r: DriverRatings;
  form?: number;
  plan?: { risk: number[]; late: boolean[]; laps?: (number | null)[] }; // the player's qualifying calls (AI: none); laps: the lap mini-game per session (0-1)
}

export interface QualiRow {
  driverId: string;
  teamId: string;
  pos: number;
  q: (number | null)[]; // best time in Q1, Q2, Q3 (null = didn't run / no time)
  out: 1 | 2 | 3; // session he was knocked out in (3 = made Q3)
}

export const QUALI = {
  sd: 0.1,
  sdPerPoint: 0.004,
  evolution: [0.45, 0.2, 0], // track gets quicker through the sessions
  scrappy: 0.035,
  noTime: 0.006, // crash / track limits deleted lap in a session
  tow: 0.08, // luck of the tow / traffic
  lapSkill: 0.5, // the lap mini-game: seconds per point of score around 0.55 (perfect -0.23s, a mess +0.28s)
};

export function qualify(seed: number, circuit: CircuitDef, entries: QualiEntry[]): QualiRow[] {
  const rng = makeRng(seed ^ 0x51a11);
  const n = entries.length;
  const q3 = Math.min(10, n);
  const q2 = Math.min(n, q3 + Math.ceil((n - q3) / 2));
  const lap = (e: QualiEntry, s: number): number | null => {
    // the player's calls change the odds and the pace, never the number of random draws
    const risk = e.plan?.risk[s] ?? 2;
    const late = e.plan?.late[s] ?? false;
    const riskMult = risk === 3 ? 2.3 : risk === 1 ? 0.45 : 1;
    if (rng.chance(QUALI.noTime * (1 + (100 - e.r.consistency) / 20) * riskMult * (late ? 1.6 : 1))) return null;
    let t = circuit.base * (1 + RACE.carK * (100 - e.car) + RACE.drvK * (100 - e.r.quali) + (e.form ?? 0)) - 0.4;
    t += QUALI.evolution[s];
    if (e.plan) t += (2 - risk) * 0.13 - (late ? 0.12 : 0);
    t += rng.normal(0, QUALI.sd + (100 - e.r.consistency) * QUALI.sdPerPoint);
    t += rng.normal(0, QUALI.tow);
    const lq = e.plan?.laps?.[s];
    if (lq !== undefined && lq !== null) t -= (Math.max(0, Math.min(1, lq)) - 0.55) * QUALI.lapSkill;
    const lapMult = lq === undefined || lq === null ? 1 : lq >= 0.85 ? 0.4 : lq < 0.3 ? 2 : 1;
    if (rng.chance(QUALI.scrappy * (1 + (100 - e.r.consistency) / 25) * riskMult * lapMult)) t += 0.3 + rng.next() * 1.2;
    return t;
  };
  const rows: QualiRow[] = entries.map((e) => ({ driverId: e.driverId, teamId: e.teamId, pos: 0, q: [null, null, null], out: 1 }));
  const rank = (ids: number[], s: number) => ids.slice().sort((a, b) => (rows[a].q[s] ?? Infinity) - (rows[b].q[s] ?? Infinity));
  let alive = entries.map((_, i) => i);
  for (let s = 0; s < 3; s++) {
    for (const i of alive) rows[i].q[s] = lap(entries[i], s);
    if (s === 2) break;
    alive = rank(alive, s).slice(0, s === 0 ? q2 : q3);
    for (const i of alive) rows[i].out = (s + 2) as 2 | 3;
  }
  // grid: Q3 order, then the Q2 knockouts, then the Q1 knockouts
  const all = entries.map((_, i) => i);
  const grid = [3, 2, 1].flatMap((o) => rank(all.filter((i) => rows[i].out === o), o - 1));
  grid.forEach((i, k) => (rows[i].pos = k + 1));
  return rows.sort((a, b) => a.pos - b.pos);
}
