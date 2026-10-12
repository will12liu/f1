// What the team principal can do between races. Every action checks the rules, changes the world and
// returns a short answer for the UI ({ ok, msg }). Randomness (does he accept?) is seeded from the
// save, the date and the action, so a decision can't be re-rolled by asking again.
import { FACILITIES, SPONSOR_TIERS, STAFF_ROLES } from "../../../data/manual/manager";
import { hashString, makeRng } from "../rng";
import { ageOf } from "../season/development";
import { driverValue, salaryFor } from "../season/offseason";
import { driverMap, f1Teams } from "../season/season";
import type { Driver, World } from "../types";
import { activeManager, efficiency, MANAGER_RULES, myTeam, NAMES, PROJECT, prestigeOf, slotsFree, staffAsk, startManager } from "./manager";
import { book, fmtM, message, nextId, type Area, type FacilityKey, type Manager, type Size } from "./state";

export interface Answer {
  ok: boolean;
  msg: string;
}
const no = (msg: string): Answer => ({ ok: false, msg });
const yes = (msg: string): Answer => ({ ok: true, msg });
const decide = (w: World, tag: string) => makeRng(hashString(`${w.seed}:act:${w.season}:${w.results.length}:${tag}`));

function mgr(w: World): Manager {
  const m = activeManager(w);
  if (!m) throw new Error("not in team-principal mode");
  return m;
}

// ---- sponsors ----

export function signSponsor(w: World, offerId: string): Answer {
  const m = mgr(w);
  const o = m.offers.find((x) => x.id === offerId);
  if (!o) return no("That offer is gone.");
  if (slotsFree(m, o.tier) <= 0) return no(`No free ${SPONSOR_TIERS[o.tier].label.toLowerCase()} slot. Drop a partner first.`);
  if (m.sponsors.some((s) => s.sector === o.sector)) return no(`You already have a ${o.sector.toLowerCase()} partner; they have exclusivity.`);
  m.offers = m.offers.filter((x) => x !== o);
  m.sponsors.push({ id: o.id, brand: o.brand, sector: o.sector, tier: o.tier, perSeason: o.perSeason, until: w.season + o.years - (w.results.length === 0 ? 1 : 0), bonus: o.bonus, satisfaction: 62, expects: o.expects });
  return yes(`${o.brand} signed: ${fmtM(o.perSeason)} a season.`);
}

export function dropSponsor(w: World, dealId: string): Answer {
  const m = mgr(w);
  const d = m.sponsors.find((x) => x.id === dealId);
  if (!d) return no("No such partner.");
  const fee = d.perSeason * 0.25;
  book(w, m, "transfer", -fee, false, `ending the ${d.brand} deal early`);
  m.sponsors = m.sponsors.filter((x) => x !== d);
  return yes(`${d.brand} released. Termination fee ${fmtM(fee)}.`);
}

// ---- R&D ----

export function projectQuote(w: World, area: Area, size: Size, target: "now" | "next") {
  const m = mgr(w);
  const team = myTeam(w)!;
  const eff = efficiency(w, m, area);
  let gain = PROJECT.gain[size] * eff * (area === "reliability" ? 2 : 1);
  if (target === "next") gain *= PROJECT.nextYear;
  else if (area !== "reliability") gain *= Math.max(0.15, 1 - (team.car[area] - 80) / 30);
  return { cost: PROJECT.cost[size], rounds: PROJECT.rounds[size], hours: area === "aero" ? PROJECT.hours[size] : 0, gain, eff };
}

export function startProject(w: World, area: Area, size: Size, target: "now" | "next"): Answer {
  const m = mgr(w);
  const q = projectQuote(w, area, size, target);
  if (m.projects.length >= MANAGER_RULES.maxProjects(m.facilities.factory.level)) return no(`The factory can run ${MANAGER_RULES.maxProjects(m.facilities.factory.level)} projects at once. Upgrade it for more.`);
  if (q.hours > m.atr.hours - m.atr.used) return no(`Not enough wind tunnel time: ${Math.round(m.atr.hours - m.atr.used)} hours left, ${q.hours} needed.`);
  if (m.cash - q.cost < -30e6) return no("The bank won't lend more. Find money first.");
  const left = w.calendar.length - w.results.length;
  if (target === "now" && q.rounds > left) return no(`Only ${left} races left: it wouldn't be ready this year. Build it for next year's car.`);
  const used = new Set(m.projects.map((p) => p.name));
  const name = NAMES[area].find((n) => !used.has(n)) ?? `${area} update`;
  m.atr.used += q.hours;
  book(w, m, "rnd", -q.cost, true, name);
  m.projects.push({ id: nextId(m, "p"), name, area, size, cost: q.cost, hours: q.hours, rounds: q.rounds, roundsLeft: q.rounds, target, started: { season: w.season, round: w.results.length } });
  return yes(`${name} started: ${q.rounds} races, ${fmtM(q.cost)}.`);
}

export function upgradeFacility(w: World, key: FacilityKey): Answer {
  const m = mgr(w);
  const f = m.facilities[key];
  if (f.building) return no("Already being upgraded.");
  if (f.level >= 5) return no("Already the best there is.");
  const to = f.level + 1;
  const cost = FACILITIES[key].cost[to];
  if (m.cash - cost < -30e6) return no("Not enough money.");
  book(w, m, "facility", -cost, false, `${FACILITIES[key].label} to level ${to}`);
  f.building = { to, roundsLeft: FACILITIES[key].rounds[to] };
  return yes(`${FACILITIES[key].label} upgrade to level ${to} started (${FACILITIES[key].rounds[to]} races).`);
}

// ---- staff ----

export function hireStaff(w: World, staffId: string, salary: number, years: number): Answer {
  const m = mgr(w);
  const s = (w.staff ?? []).find((x) => x.id === staffId);
  if (!s) return no("Not found.");
  if (s.teamId === m.teamId) return no("Already works for you.");
  const ask = staffAsk(s.role, s.rating) * (s.teamId ? 1.35 : 1);
  const rng = decide(w, `staff:${s.id}`);
  if (salary < ask * 0.95) return no(`${s.first} ${s.last} wants at least ${fmtM(ask)} a season.`);
  if (s.teamId) {
    // poaching: a better team, or more money, convinces him; then gardening leave
    const from = w.teams.find((t) => t.id === s.teamId)!;
    const pull = (prestigeOf(w, m.teamId) - prestigeOf(w, from.id)) * 0.8 + (salary / ask - 1) * 1.5;
    if (!rng.chance(Math.max(0.1, Math.min(0.9, 0.45 + pull)))) return no(`${s.first} ${s.last} is staying at ${from.name}.`);
    if (s.role === "td" || s.role === "aero" || s.role === "design") from.car.dev = Math.max(35, from.car.dev - (s.rating - 50) * 0.12);
    s.joins = { season: w.season, round: w.results.length + MANAGER_RULES.gardenRounds, teamId: m.teamId };
    s.teamId = from.id; // still paid by them until he leaves
    s.salary = salary;
    s.until = w.season + years;
    message(w, m, { kind: "staff", from: "HR", subject: `${s.first} ${s.last} signed`, body: `He leaves ${from.name} and joins after ${MANAGER_RULES.gardenRounds} races of gardening leave.` });
    return yes(`${s.first} ${s.last} signed from ${from.name}. He starts in ${MANAGER_RULES.gardenRounds} races.`);
  }
  const old = (w.staff ?? []).find((x) => x.teamId === m.teamId && x.role === s.role && !x.joins);
  if (old) releaseStaff(w, m, old.id);
  s.teamId = m.teamId;
  s.salary = salary;
  s.until = w.season + years;
  return yes(`${s.first} ${s.last} is your new ${STAFF_ROLES[s.role].label.toLowerCase()}.`);
}

function releaseStaff(w: World, m: Manager, id: string) {
  const s = (w.staff ?? []).find((x) => x.id === id)!;
  const left = Math.max(0, s.until - w.season + 1 - w.results.length / w.calendar.length);
  book(w, m, "staff", -s.salary * left * 0.5, false, `paying off ${s.first} ${s.last}`);
  s.teamId = null;
}

export function fireStaff(w: World, staffId: string): Answer {
  const m = mgr(w);
  const s = (w.staff ?? []).find((x) => x.id === staffId && x.teamId === m.teamId);
  if (!s) return no("Not one of yours.");
  releaseStaff(w, m, s.id);
  return yes(`${s.first} ${s.last} has left. The chair is empty until you hire someone.`);
}

export function renewStaff(w: World, staffId: string, years: number): Answer {
  const m = mgr(w);
  const s = (w.staff ?? []).find((x) => x.id === staffId && x.teamId === m.teamId);
  if (!s) return no("Not one of yours.");
  const salary = Math.max(s.salary, staffAsk(s.role, s.rating)) * 1.05;
  s.salary = Math.round(salary / 1e4) * 1e4;
  s.until = Math.max(s.until, w.season) + years;
  return yes(`${s.first} ${s.last} extended to ${s.until} at ${fmtM(s.salary)} a season.`);
}

// ---- drivers ----

/** What a driver wants to drive for us: market rate, more from a weaker team, more for a star. */
export function driverAsk(w: World, d: Driver): number {
  const m = mgr(w);
  const base = salaryFor(d.ovr);
  const p = prestigeOf(w, m.teamId);
  const star = d.ovr >= 88 ? 1 + (1.2 - p) * 0.6 : 1;
  return Math.round((base * (1.25 - 0.25 * p) * Math.max(1, star)) / 1e5) * 1e5;
}

/** Would he even consider us? Stars don't join backmarkers. */
export function driverWilling(w: World, d: Driver): boolean {
  const m = mgr(w);
  const p = prestigeOf(w, m.teamId);
  return driverValue(d, w.season) < 84 + p * 8;
}

export function renewDriver(w: World, driverId: string, salary: number, years: number): Answer {
  const m = mgr(w);
  const d = driverMap(w).get(driverId);
  if (!d || d.teamId !== m.teamId) return no("Not your driver.");
  const ask = driverAsk(w, d);
  if (salary < ask * 0.95) return no(`${d.last} wants ${fmtM(ask)} a season.`);
  if (ageOf(d, w.season) > 36 && years > 1) return no(`${d.last} only wants one more year.`);
  d.contract = { teamId: m.teamId, until: Math.max(d.contract?.until ?? w.season, w.season) + years, salary };
  return yes(`${d.first} ${d.last} extended to ${d.contract.until}.`);
}

export function releaseDriver(w: World, driverId: string): Answer {
  const m = mgr(w);
  const team = myTeam(w)!;
  const d = driverMap(w).get(driverId);
  if (!d || d.teamId !== m.teamId) return no("Not your driver.");
  const left = Math.max(0, (d.contract?.until ?? w.season) - w.season + 1 - w.results.length / w.calendar.length);
  book(w, m, "transfer", -(d.contract?.salary ?? 0) * left * 0.5, false, `releasing ${d.last}`);
  team.drivers = team.drivers.filter((x) => x !== d.id);
  d.teamId = null;
  d.contract = null;
  return yes(`${d.first} ${d.last} released. Sign someone before the next race or the reserve drives.`);
}

/** Sign now (free agent / junior into an open seat) or for next season (his deal elsewhere ends this year). */
export function signDriver(w: World, driverId: string, salary: number, years: number): Answer {
  const m = mgr(w);
  const team = myTeam(w)!;
  const d = driverMap(w).get(driverId);
  if (!d || d.retired) return no("Not available.");
  if (d.teamId === m.teamId) return no("Already yours.");
  if (!driverWilling(w, d)) return no(`${d.last} isn't interested in ${team.name} right now.`);
  const ask = driverAsk(w, d);
  if (salary < ask * 0.95) return no(`${d.last} wants ${fmtM(ask)} a season.`);
  const f1Seat = f1Teams(w).find((t) => t.drivers.includes(d.id));
  if (!f1Seat) {
    if (team.drivers.length >= 2) return no("Both seats are taken. Release a driver first, or sign him for next year once a contract ends.");
    for (const t of w.teams) t.drivers = t.drivers.filter((x) => x !== d.id);
    d.series = "F1";
    d.teamId = m.teamId;
    d.contract = { teamId: m.teamId, until: w.season + years - 1, salary };
    team.drivers.push(d.id);
    return yes(`${d.first} ${d.last} joins now.`);
  }
  if (!d.contract || d.contract.until > w.season) return no(`${d.last} is under contract with ${f1Seat.name} until ${d.contract?.until}.`);
  const myNext = team.drivers.filter((id) => (driverMap(w).get(id)?.contract?.until ?? 0) > w.season).length + m.precontracts.length;
  if (myNext >= 2) return no("You already have two drivers for next season.");
  if (m.precontracts.some((p) => p.driverId === d.id)) return no("Already agreed.");
  m.precontracts.push({ driverId: d.id, salary, until: w.season + years });
  message(w, m, { kind: "driver", from: "Sporting director", subject: `${d.first} ${d.last} for next season`, body: `Pre-contract signed: he joins from ${w.season + 1}, ${fmtM(salary)} a season until ${w.season + years}.` });
  return yes(`${d.first} ${d.last} agreed to join next season.`);
}

export function setReserve(w: World, driverId: string): Answer {
  mgr(w);
  const team = myTeam(w)!;
  team.reserve = driverId;
  return yes("Reserve driver set.");
}

// ---- inbox, jobs ----

export function markRead(w: World, ids: string[]): Answer {
  const m = w.manager;
  if (!m) return no("");
  for (const x of m.inbox) if (ids.includes(x.id)) x.read = true;
  return yes("");
}

/** After the sack: take one of the offers (or any team, if the offers ran out). */
export function takeJob(w: World, teamId: string): Answer {
  const m = w.manager;
  if (!m?.fired) return no("You have a job.");
  const keep = { history: m.history, inbox: m.inbox, name: m.name };
  startManager(w, teamId, keep.name);
  w.manager!.history = keep.history;
  w.manager!.inbox = [...w.manager!.inbox, ...keep.inbox].slice(0, 120);
  return yes(`You are the new team principal of ${w.teams.find((t) => t.id === teamId)?.name}.`);
}
