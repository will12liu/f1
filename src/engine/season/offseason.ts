// End of season -> winter: record the champions, age and develop every driver, retirements, the driver
// market (expiring contracts, re-signings, free seats filled from F1 free agents and F2), the junior
// ladder (F3 -> F2 promotions, new F3 rookies), the car reshuffle, and next year's calendar.
import { genDriver } from "../generate";
import { hashString, makeRng, type Rng } from "../rng";
import type { Driver, Series, Team, World } from "../types";
import { ageOf, developDriver, winterCars } from "./development";
import { driverStandings, seasonOver, teamStandings } from "./season";

export const MARKET = {
  resignBase: 0.55,
  ageCliff: 33,
};

export function salaryFor(ovr: number): number {
  return Math.round(Math.max(1, (ovr - 70) * 2.3) * 1e6);
}

/** How much a team wants a driver (the market's single number). */
export function driverValue(d: Driver, season: number, rng?: Rng): number {
  const age = ageOf(d, season);
  let v = d.ovr;
  if (age < 25) v += Math.max(0, d.pot - d.ovr) * 0.35;
  if (age > MARKET.ageCliff) v -= (age - MARKET.ageCliff) * 1.4;
  if (d.series === "F2") v -= 1.5; // rookie risk
  if (rng) v += rng.normal(0, 1.5);
  return v;
}

export function endSeason(w: World) {
  if (!seasonOver(w)) throw new Error("season not over");
  const season = w.season;
  const rng = makeRng(hashString(`${w.seed}:winter:${season}`));
  const ds = driverStandings(w);
  const ts = teamStandings(w);
  w.history.push({
    season,
    champion: ds[0]?.driverId ?? "",
    championTeam: ds[0]?.teamId ?? "",
    constructors: ts[0]?.teamId ?? "",
    standings: ds.map((r) => ({ driverId: r.driverId, teamId: r.teamId, points: r.points, wins: r.wins })),
    teamStandings: ts.map((r) => ({ teamId: r.teamId, points: r.points })),
  });
  const next = season + 1;

  // Develop and age everyone (the season just ended counts as this age).
  for (const d of w.drivers) if (!d.retired) developDriver(d, season, rng);

  // Retirements.
  for (const d of w.drivers) {
    if (d.retired) continue;
    const age = ageOf(d, next);
    const seated = d.series === "F1" && d.teamId;
    let p = 0;
    if (age >= 35) p = (age - 34) * 0.16 + (seated ? 0 : 0.25);
    if (!seated && d.series === "F1" && age >= 29) p += 0.3;
    if (d.series !== "F1" && age >= 26) p += 0.35;
    if (rng.chance(Math.min(0.95, p))) retire(w, d, season);
  }

  juniorLadder(w, rng, next);
  driverMarket(w, rng, next);
  juniorSeats(w, rng, next);
  winterCars(w, rng, next);

  // forget generated drivers who retired without ever racing in F1
  const raced = new Set(w.history.flatMap((h) => h.standings.map((r) => r.driverId)));
  w.drivers = w.drivers.filter((d) => !d.retired || d.real || raced.has(d.id));

  w.season = next;
  w.results = [];
  w.replays = {};
  w.calendar = w.calendar.map((r) => ({ ...r, date: shiftYear(r.date) }));
}

function retire(w: World, d: Driver, season: number) {
  d.retired = season;
  d.contract = null;
  for (const t of w.teams) t.drivers = t.drivers.filter((id) => id !== d.id);
  d.teamId = null;
}

const shiftYear = (iso: string) => {
  const dt = new Date(iso + "T12:00:00Z");
  dt.setUTCDate(dt.getUTCDate() + 364);
  return dt.toISOString().slice(0, 10);
};

/** F1 seats: expiring deals re-sign or walk, then teams (best car first) fill their seats. */
function driverMarket(w: World, rng: Rng, next: number) {
  const f1 = w.teams.filter((t) => t.series === "F1");
  const active = w.drivers.filter((d) => !d.retired);
  // expiring contracts
  for (const t of f1) {
    for (const id of [...t.drivers]) {
      const d = active.find((x) => x.id === id);
      if (!d) continue;
      if (d.contract && d.contract.until >= next) continue;
      const teammate = t.drivers.map((x) => active.find((y) => y.id === x)).find((y) => y && y.id !== id);
      const v = driverValue(d, next);
      const keep = MARKET.resignBase + (v - 80) * 0.04 + (teammate && v > driverValue(teammate, next) ? 0.1 : 0);
      if (rng.chance(Math.max(0.05, Math.min(0.97, keep)))) {
        d.contract = { teamId: t.id, until: next + rng.int(0, 2), salary: salaryFor(d.ovr) };
      } else {
        t.drivers = t.drivers.filter((x) => x !== id);
        d.teamId = null;
        d.contract = null;
      }
    }
  }
  // fill seats: stronger teams choose first
  const strength = (t: Team) => t.car.power + t.car.aero + t.car.mech + t.budget * 3;
  for (let pass = 0; pass < 2; pass++)
    for (const t of [...f1].sort((a, b) => strength(b) - strength(a))) {
      if (t.drivers.length >= 2) continue;
      const pool = active.filter((d) => !d.teamId || (d.series !== "F1" && d.teamId)).filter((d) => d.series === "F1" || d.series === "F2");
      const best = pool
        .map((d) => ({ d, v: driverValue(d, next, rng) }))
        .sort((a, b) => b.v - a.v)
        .slice(0, 3);
      if (!best.length) break;
      const pick = best[rng.chance(0.6) ? 0 : Math.min(best.length - 1, rng.int(1, 2))].d;
      for (const jt of w.teams) jt.drivers = jt.drivers.filter((x) => x !== pick.id);
      pick.series = "F1";
      pick.teamId = t.id;
      pick.contract = { teamId: t.id, until: next + rng.int(0, 2), salary: salaryFor(pick.ovr) };
      t.drivers.push(pick.id);
    }
}

/** F3 -> F2 promotions, F2 drivers stepping up are handled by the market, new F3 rookies arrive. */
function juniorLadder(w: World, rng: Rng, next: number) {
  const juniors = (s: Series) => w.drivers.filter((d) => !d.retired && d.series === s);
  // best F3 drivers step up to F2 (rank by ovr with luck, like a championship)
  const f3 = juniors("F3")
    .map((d) => ({ d, v: d.ovr + rng.normal(0, 2.5) }))
    .sort((a, b) => b.v - a.v);
  for (const { d } of f3.slice(0, 10)) {
    d.series = "F2";
    d.teamId = null;
  }
  // F2 drivers who are too old for the ladder drift out
  for (const d of juniors("F2")) if (ageOf(d, next) >= 26 && rng.chance(0.6)) d.retired = next - 1;
  // new F3 rookies to keep the grid full (30)
  const need = 30 - juniors("F3").length;
  for (let i = 0; i < need; i++) {
    const age = rng.int(17, 19);
    const level = rng.normal(62, 4);
    const pot = Math.min(95, level + Math.abs(rng.normal(0, 7)) + 6);
    w.drivers.push(genDriver(rng, { series: "F3", season: next, age, level, pot }));
  }
}

/** Junior teams fill their seats (F2: 2 per team, F3: 3) from their series' drivers. */
function juniorSeats(w: World, rng: Rng, next: number) {
  for (const s of ["F2", "F3"] as Series[]) {
    const teams = w.teams.filter((t) => t.series === s);
    const per = s === "F2" ? 2 : 3;
    const pool = w.drivers.filter((d) => !d.retired && d.series === s);
    for (const t of teams) t.drivers = t.drivers.filter((id) => pool.some((d) => d.id === id && d.teamId === t.id));
    const free = pool.filter((d) => !teams.some((t) => t.drivers.includes(d.id))).sort((a, b) => driverValue(b, next) - driverValue(a, next));
    // top teams first
    const order = [...teams].sort((a, b) => b.car.aero + b.car.power - (a.car.aero + a.car.power));
    while (free.length && order.some((t) => t.drivers.length < per)) {
      for (const t of order) {
        if (t.drivers.length >= per || !free.length) continue;
        const k = Math.min(free.length - 1, Math.floor(rng.next() * 3));
        const d = free.splice(k, 1)[0];
        d.teamId = t.id;
        t.drivers.push(d.id);
      }
    }
    // F2 needs 22: top up with generated drivers
    const want = teams.length * per;
    let have = teams.reduce((n, t) => n + t.drivers.length, 0);
    while (have < want) {
      const t = order.find((x) => x.drivers.length < per)!;
      const d = genDriver(rng, { series: s, season: next, age: s === "F2" ? rng.int(19, 22) : rng.int(17, 19), level: s === "F2" ? rng.normal(70, 3) : rng.normal(63, 3), pot: s === "F2" ? rng.normal(78, 4) : rng.normal(74, 5) });
      d.teamId = t.id;
      t.drivers.push(d.id);
      w.drivers.push(d);
      have++;
    }
  }
}
