// Team-principal mode: start a team, what happens after every race (money, R&D, sponsors, board, staff)
// and over the winter (prize money, cost-cap check, board review, contracts, next year's car).
// The AI keeps running the other ten teams exactly as in the sandbox.
import { ATR, FACILITIES, FINANCE, SPONSOR_BRANDS, SPONSOR_TIERS, STAFF_ROLES, WORKS } from "../../../data/manual/manager";
import { personName } from "../generate";
import type { Rng } from "../rng";
import { salaryFor } from "../season/offseason";
import { driverMap, f1Teams, teamStandings } from "../season/season";
import type { Driver, RaceSummary, Team, World } from "../types";
import { book, capSpend, fmtM, message, mgrRng, nextId, ROLES, type Area, type Bonus, type FacilityKey, type Manager, type Project, type Size, type SponsorOffer, type Staff, type StaffRole, type Tier } from "./state";

export const PROJECT = {
  cost: { S: 2.6e6, M: 6.2e6, L: 12.5e6 } as Record<Size, number>,
  rounds: { S: 3, M: 5, L: 8 } as Record<Size, number>,
  gain: { S: 0.65, M: 1.5, L: 3.0 } as Record<Size, number>,
  hours: { S: 16, M: 36, L: 70 } as Record<Size, number>,
  failChance: 0.07,
  nextYear: 1.25, // work on next year's car goes further (more freedom), 1.6 before new regulations
};

export const NAMES: Record<Area, string[]> = {
  aero: ["Floor edge revision", "Front wing flap profile", "Low-drag rear wing", "Sidepod inlet and cooling", "Diffuser kick", "Beam wing", "Engine cover", "Front suspension fairings"],
  mech: ["Rear suspension geometry", "Front upright", "Brake duct and cooling", "Weight reduction", "Steering rack", "Heave spring package"],
  power: ["Power unit cooling", "Energy recovery software", "Exhaust layout", "Fuel system", "Combustion update", "Battery thermal management"],
  reliability: ["Gearbox internals", "Hydraulics", "Cooling margins", "Electronics loom", "Driveshaft"],
};

/** The expected points a team should score per season by constructors' position (for the board). */
const SEASON_PTS = [700, 520, 410, 300, 170, 125, 92, 66, 46, 30, 15];

export const MANAGER_RULES = { firedBelow: 20, maxProjects: (factory: number) => 2 + Math.floor(factory / 2), gardenRounds: 4 };

export const isWorks = (teamId: string) => WORKS.includes(teamId);
export const activeManager = (w: World): Manager | null => (w.manager && !w.manager.fired ? w.manager : null);
export const myTeam = (w: World): Team | undefined => (w.manager ? w.teams.find((t) => t.id === w.manager!.teamId) : undefined);

/** A team's strength order today (1 = fastest car). */
export function carRank(w: World, teamId: string): number {
  const ts = f1Teams(w).map((t) => ({ id: t.id, v: t.car.power + t.car.aero + t.car.mech + t.car.reliability * 0.1 })).sort((a, b) => b.v - a.v);
  return ts.findIndex((t) => t.id === teamId) + 1;
}

/** Last season's constructors' position (or today's car order before the first season ends). */
export function lastPosition(w: World, teamId: string): number {
  const h = w.history[w.history.length - 1];
  if (h) {
    const i = h.teamStandings.findIndex((x) => x.teamId === teamId);
    if (i >= 0) return i + 1;
  }
  return carRank(w, teamId);
}

export function prestigeOf(w: World, teamId: string): number {
  const t = w.teams.find((x) => x.id === teamId)!;
  const recent = w.history.slice(-3).map((h) => h.teamStandings.findIndex((x) => x.teamId === teamId) + 1).filter((p) => p > 0);
  const pos = recent.length ? recent.reduce((s, p) => s + p, 0) / recent.length : carRank(w, teamId);
  const heritage = ["ferrari", "mclaren", "mercedes", "williams", "red_bull"].includes(teamId) ? 0.12 : 0;
  return Math.max(0.5, Math.min(1.6, 0.55 + (11 - pos) * 0.075 + (t.budget - 3) * 0.06 + heritage));
}

// ---- staff ----

export function staffAsk(role: StaffRole, rating: number): number {
  const [lo, hi] = STAFF_ROLES[role].pay;
  const x = Math.max(0, Math.min(1, (rating - 40) / 55));
  return Math.round((lo + (hi - lo) * x * x) / 1e4) * 1e4;
}

function genStaff(w: World, rng: Rng, role: StaffRole, level: number, teamId: string | null): Staff {
  const n = personName(rng);
  const rating = Math.round(Math.max(35, Math.min(96, rng.normal(level, 6))));
  return { id: `s${w.season}-${rng.int(0, 1e9).toString(36)}`, first: n.first, last: n.last, nat: n.nat, role, rating, age: rng.int(31, 62), salary: staffAsk(role, rating), until: w.season + rng.int(0, 2), teamId };
}

/** Every F1 team's key people (their level follows the team's development rate and budget), plus free agents. */
export function seedStaff(w: World, rng: Rng) {
  w.staff = [];
  for (const t of f1Teams(w)) {
    const level = 52 + (t.car.dev - 60) * 0.8 + (t.budget - 3) * 3;
    for (const role of ROLES) w.staff.push(genStaff(w, rng, role, level + (role === "pit" ? 4 : 0), t.id));
  }
  topUpFreeStaff(w, rng);
}

function topUpFreeStaff(w: World, rng: Rng) {
  const staff = (w.staff ??= []);
  for (const role of ROLES) {
    const free = staff.filter((s) => !s.teamId && s.role === role).length;
    for (let i = free; i < 4; i++) staff.push(genStaff(w, rng, role, rng.normal(58, 9), null));
  }
}

/** The people working for a team right now (not on gardening leave), by role. */
export function teamStaff(w: World, teamId: string): Partial<Record<StaffRole, Staff>> {
  const out: Partial<Record<StaffRole, Staff>> = {};
  for (const s of w.staff ?? []) if (s.teamId === teamId && !s.joins) out[s.role] = s;
  return out;
}

const ratingOf = (s: Staff | undefined) => s?.rating ?? 35; // an empty chair

/** How far R&D money goes in an area: people, facilities, and (for power) whether you build the engine. */
export function efficiency(w: World, m: Manager, area: Area): number {
  const st = teamStaff(w, m.teamId);
  const f = m.facilities;
  const td = ratingOf(st.td) / 300;
  let spec = 0;
  let fac = 0;
  if (area === "aero") {
    spec = ratingOf(st.aero) / 350;
    fac = f.tunnel.level * 0.04 + f.cfd.level * 0.03;
  } else if (area === "mech") {
    spec = ratingOf(st.design) / 350;
    fac = f.factory.level * 0.035 + f.sim.level * 0.035;
  } else if (area === "power") {
    spec = ratingOf(st.design) / 500 + 0.06;
    fac = f.factory.level * 0.05;
  } else {
    spec = ratingOf(st.design) / 350;
    fac = f.factory.level * 0.06;
  }
  let e = 0.35 + td + spec + fac;
  if (area === "power" && !isWorks(m.teamId)) e *= 0.5; // a customer team can only work on integration
  return e;
}

/** Race-weekend help from the people: pit crew (stop time, slow stops), strategy (plan choice), engineers (pace). */
export function raceBoost(w: World, teamId: string): { pit?: number; strat?: number; form: number } {
  const m = activeManager(w);
  if (!m || m.teamId !== teamId) return { form: 0 };
  const st = teamStaff(w, teamId);
  return { pit: ratingOf(st.pit), strat: ratingOf(st.strategy), form: -(ratingOf(st.engineer) - 60) * 0.000025 + -(m.facilities.sim.level - 3) * 0.00012 };
}

// ---- sponsors ----

export function genOffer(w: World, m: Manager, rng: Rng, tier: Tier, expiresRound: number): SponsorOffer {
  const used = new Set([...m.sponsors.map((s) => s.brand), ...m.offers.map((s) => s.brand)]);
  const free = SPONSOR_BRANDS.filter((b) => !used.has(b.name));
  const b = rng.pick(free.length ? free : SPONSOR_BRANDS);
  const p = m.prestige;
  const perSeason = Math.round((SPONSOR_TIERS[tier].base * p * (0.8 + rng.next() * 0.45)) / 1e5) * 1e5;
  const pos = lastPosition(w, m.teamId);
  const expects = Math.max(1, Math.min(11, pos + rng.int(-2, 1)));
  const kinds: Bonus["kind"][] = pos <= 3 ? ["win", "podium", "position"] : pos <= 6 ? ["podium", "points", "position"] : ["points", "position"];
  const kind = rng.pick(kinds);
  const scale = tier === "title" ? 1 : tier === "major" ? 0.35 : 0.1;
  const bonus: Bonus =
    kind === "win" ? { kind, amount: Math.round(1.2e6 * scale * 10) / 10 } : kind === "podium" ? { kind, amount: Math.round(0.6e6 * scale) } : kind === "points" ? { kind, amount: Math.round(0.18e6 * scale) } : { kind, amount: Math.round(8e6 * scale), target: expects };
  return { id: nextId(m, "o"), brand: b.name, sector: b.sector, tier, perSeason, until: 0, years: rng.int(1, 3), bonus, expects, expiresRound };
}

export const slotsFree = (m: Manager, tier: Tier) => SPONSOR_TIERS[tier].slots - m.sponsors.filter((s) => s.tier === tier).length;

// ---- start ----

export function startManager(w: World, teamId: string, name: string) {
  const rng = mgrRng(w, "start");
  const team = w.teams.find((t) => t.id === teamId);
  if (!team || team.series !== "F1") throw new Error(`not an F1 team: ${teamId}`);
  w.mode = "manager";
  if (!w.staff) seedStaff(w, rng);
  const lvl = (x: number) => Math.max(1, Math.min(5, Math.round(x)));
  const m: Manager = {
    teamId,
    name,
    cash: (20 + team.budget * 12) * 1e6,
    ledger: [],
    sponsors: [],
    offers: [],
    facilities: { tunnel: { level: lvl(team.budget - 0.4 + rng.normal(0, 0.5)) }, cfd: { level: lvl(team.budget - 0.2 + rng.normal(0, 0.5)) }, sim: { level: lvl(team.budget - 0.5 + rng.normal(0, 0.6)) }, factory: { level: lvl(team.budget - 0.3 + rng.normal(0, 0.5)) } },
    projects: [],
    finished: [],
    atr: { hours: 0, used: 0, pct: 1 },
    nextCar: { power: 0, aero: 0, mech: 0, reliability: 0 },
    board: { confidence: 60, target: 6, expected: 6 },
    inbox: [],
    precontracts: [],
    orders: { swap: true },
    history: [],
    prestige: 1,
    seq: 0,
  };
  w.manager = m;
  m.prestige = prestigeOf(w, teamId);
  // existing partners: a title partner for most teams, a couple of majors, some suppliers
  const deal = (tier: Tier) => {
    const o = genOffer(w, m, rng, tier, 0);
    m.sponsors.push({ ...o, until: w.season + rng.int(0, 2), satisfaction: 60 });
  };
  if (m.prestige > 0.75 || rng.chance(0.6)) deal("title");
  for (let i = 0; i < 2; i++) deal("major");
  for (let i = 0; i < 3 + rng.int(0, 2); i++) deal("minor");
  newSeason(w, m, rng, true);
  message(w, m, {
    kind: "board",
    from: "The board",
    subject: `Welcome to ${team.name}`,
    body: `${name}, the job is yours. We expect P${m.board.target} in the constructors' championship. The cost cap is ${fmtM(FINANCE.costCap)}; stay under it. You have ${fmtM(m.cash)} in the bank and ${Math.round(m.atr.hours)} hours of wind tunnel and CFD time for the first half of the season.`,
  });
}

/** Season set-up: ATR allocation, board target, sponsor offers, prestige. */
function newSeason(w: World, m: Manager, rng: Rng, first = false) {
  const pos = lastPosition(w, m.teamId);
  m.prestige = prestigeOf(w, m.teamId);
  m.atr = { hours: (ATR.baseHours * ATR.scale[pos - 1] * (1 - (m.capPenalty ?? 0))) / 2, used: 0, pct: ATR.scale[pos - 1] };
  m.capPenalty = undefined;
  const expected = carRank(w, m.teamId);
  const team = myTeam(w)!;
  m.board.expected = expected;
  m.board.target = Math.max(1, Math.min(11, expected - (team.budget >= 5 && expected > 2 ? 1 : 0)));
  if (!first) m.board.confidence = Math.round(m.board.confidence * 0.7 + 60 * 0.3);
  m.offers = m.offers.filter((o) => o.renewal);
  const tiers: Tier[] = [];
  if (slotsFree(m, "title")) tiers.push("title");
  for (let i = 0; i < Math.min(2, slotsFree(m, "major")); i++) tiers.push("major");
  for (let i = 0; i < Math.min(3, slotsFree(m, "minor")); i++) tiers.push("minor");
  for (const tier of tiers) m.offers.push(genOffer(w, m, rng, tier, 6));
}

// ---- after every race ----

function teamPointsIn(s: RaceSummary, teamId: string) {
  return s.classification.filter((c) => c.teamId === teamId).reduce((x, c) => x + c.points, 0);
}

export function managerAfterRound(w: World, s: RaceSummary) {
  const m = activeManager(w);
  if (!m) return;
  const rng = mgrRng(w, "round");
  const team = myTeam(w)!;
  const R = w.calendar.length;
  const pos0 = lastPosition(w, m.teamId);
  const dm = driverMap(w);

  // money in
  book(w, m, "prize", FINANCE.prize[pos0 - 1] / R, false, "prize fund instalment");
  book(w, m, "owner", FINANCE.owner[team.budget] / R, false);
  book(w, m, "merch", (FINANCE.merch * m.prestige) / R, false);
  for (const sp of m.sponsors) book(w, m, "sponsor", sp.perSeason / R, false, sp.brand);
  // bonuses
  const mine = s.classification.filter((c) => c.teamId === m.teamId);
  for (const sp of m.sponsors) {
    let n = 0;
    for (const c of mine) {
      const fin = c.status === "Finished" || c.status === "Lapped";
      if (!fin) continue;
      if (sp.bonus.kind === "points" && c.points > 0) n++;
      if (sp.bonus.kind === "podium" && c.pos <= 3) n++;
      if (sp.bonus.kind === "win" && c.pos === 1) n++;
    }
    if (n) book(w, m, "bonus", n * sp.bonus.amount, false, `${sp.brand} ${sp.bonus.kind} bonus`);
  }
  // money out
  const drivers = team.drivers.map((id) => dm.get(id)).filter((d): d is Driver => !!d);
  book(w, m, "drivers", -drivers.reduce((x, d) => x + (d.contract?.salary ?? salaryFor(d.ovr)), 0) / R, false);
  const people = (w.staff ?? []).filter((x) => x.teamId === m.teamId && !x.joins).sort((a, b) => b.salary - a.salary);
  const top3 = people.slice(0, 3).reduce((x, p) => x + p.salary, 0);
  const rest = people.slice(3).reduce((x, p) => x + p.salary, 0);
  book(w, m, "staff", -top3 / R, false, "three best-paid staff (outside the cap)");
  book(w, m, "staff", -(rest + FINANCE.baseStaff) / R, true);
  book(w, m, "ops", -FINANCE.ops, true, "freight, travel, parts");
  if (!isWorks(m.teamId)) book(w, m, "engine", -FINANCE.engineFee / R, true, `${team.engine} power units`);

  // R&D projects
  for (const p of m.projects) p.roundsLeft--;
  for (const p of m.projects.filter((x) => x.roundsLeft <= 0)) deliver(w, m, p, rng);
  m.projects = m.projects.filter((x) => x.roundsLeft > 0);

  // facilities being built
  for (const k of Object.keys(m.facilities) as FacilityKey[]) {
    const f = m.facilities[k];
    if (!f.building) continue;
    if (--f.building.roundsLeft <= 0) {
      f.level = f.building.to;
      f.building = undefined;
      message(w, m, { kind: "rnd", from: "Operations", subject: `${FACILITIES[k].label} upgrade finished`, body: `The ${FACILITIES[k].label.toLowerCase()} is now level ${f.level}.` });
    }
  }

  // staff arriving from gardening leave
  for (const st of w.staff ?? []) {
    if (st.joins && (st.joins.season < w.season || (st.joins.season === w.season && st.joins.round <= w.results.length))) {
      const old = (w.staff ?? []).find((x) => x.teamId === st.joins!.teamId && x.role === st.role && !x.joins && x !== st);
      if (old) old.teamId = null;
      st.teamId = st.joins.teamId;
      st.joins = undefined;
      if (st.teamId === m.teamId) message(w, m, { kind: "staff", from: "HR", subject: `${st.first} ${st.last} starts today`, body: `Our new ${STAFF_ROLES[st.role].label.toLowerCase()} has served the gardening leave and starts work.` });
    }
  }

  // wind tunnel: the second half of the season gets a new allocation from today's standings
  if (w.results.length === Math.floor(R / 2)) {
    const pos = teamStandings(w).findIndex((x) => x.teamId === m.teamId) + 1;
    m.atr = { hours: (ATR.baseHours * ATR.scale[pos - 1]) / 2 + Math.max(0, m.atr.hours - m.atr.used) * 0.25, used: 0, pct: ATR.scale[pos - 1] };
    message(w, m, { kind: "fia", from: "FIA", subject: "Aerodynamic testing allocation", body: `For the second half of the season you have ${Math.round(m.atr.hours)} hours (${Math.round(ATR.scale[pos - 1] * 100)}% of the base, from P${pos} in the standings).` });
  }

  // board and sponsors react: where we stand against the target, and a good or bad weekend
  const nowPos0 = teamStandings(w).findIndex((x) => x.teamId === m.teamId) + 1;
  const pts = teamPointsIn(s, m.teamId);
  const exp = SEASON_PTS[m.board.target - 1] / R;
  const weekend = pts > exp * 1.5 ? 0.4 : pts < exp * 0.4 ? -0.3 : 0;
  const before = m.board.confidence;
  const settle = Math.min(1, w.results.length / 5); // early standings don't mean much
  m.board.confidence = Math.max(0, Math.min(100, m.board.confidence + settle * Math.max(-1.2, Math.min(1.2, (m.board.target - nowPos0) * 0.4)) + weekend));
  if (before >= 35 && m.board.confidence < 35) message(w, m, { kind: "board", from: "The board", subject: "We are concerned", body: `Results are below what we expected (P${m.board.target}). Things need to turn around.` });
  const nowPos = teamStandings(w).findIndex((x) => x.teamId === m.teamId) + 1;
  for (const sp of m.sponsors) {
    const d = nowPos <= sp.expects ? 1.2 : -0.8 * (nowPos - sp.expects);
    const was = sp.satisfaction;
    sp.satisfaction = Math.max(0, Math.min(100, sp.satisfaction + d + rng.normal(0, 0.6)));
    if (was >= 30 && sp.satisfaction < 30) message(w, m, { kind: "sponsor", from: sp.brand, subject: "We expected more", body: `${sp.brand} hoped for P${sp.expects} or better. Our partnership is under review.` });
  }
  // offers come and go
  m.offers = m.offers.filter((o) => o.renewal || o.expiresRound >= w.results.length);
  if (rng.chance(0.2)) {
    const tier: Tier | undefined = slotsFree(m, "major") ? "major" : slotsFree(m, "minor") ? "minor" : undefined;
    if (tier) {
      const o = genOffer(w, m, rng, tier, w.results.length + 4);
      m.offers.push(o);
      message(w, m, { kind: "sponsor", from: o.brand, subject: "Partnership proposal", body: `${o.brand} (${o.sector}) offers ${fmtM(o.perSeason)} a season for ${o.years} year${o.years > 1 ? "s" : ""} as ${SPONSOR_TIERS[tier].label.toLowerCase()}. The offer stands until round ${o.expiresRound}.` });
    }
  }
  // contracts running out at the end of the season
  if (w.results.length === R - 4) {
    const staffOut = (w.staff ?? []).filter((x) => x.teamId === m.teamId && !x.joins && x.until <= w.season);
    const driversOut = team.drivers.map((id) => dm.get(id)).filter((d): d is Driver => !!d && (!d.contract || d.contract.until <= w.season));
    if (staffOut.length || driversOut.length)
      message(w, m, {
        kind: "staff",
        from: "HR",
        subject: "Contracts ending this season",
        body: `Four races to go. Out of contract: ${[...driversOut.map((d) => `${d.first} ${d.last} (driver)`), ...staffOut.map((x) => `${x.first} ${x.last} (${STAFF_ROLES[x.role].label.toLowerCase()})`)].join(", ")}. Renew them or they leave.`,
      });
  }
  // cost cap warning
  const spend = capSpend(w, m);
  const share = spend / FINANCE.costCap;
  const progress = w.results.length / R;
  if (progress < 1 && share > progress + 0.08 && share > 0.5 && !m.inbox.some((x) => x.season === w.season && x.subject === "Cost cap")) {
    message(w, m, { kind: "finance", from: "Finance director", subject: "Cost cap", body: `We've used ${Math.round(share * 100)}% of the cap with ${Math.round(progress * 100)}% of the season gone. Slow down the R&D spending or we'll breach.` });
  }
}

function deliver(w: World, m: Manager, p: Project, rng: Rng) {
  const team = myTeam(w)!;
  let q = Math.max(0.35, Math.min(1.5, rng.normal(1, 0.22)));
  let outcome: "good" | "ok" | "poor" | "failed" = q > 1.12 ? "good" : q > 0.85 ? "ok" : "poor";
  if (rng.chance(PROJECT.failChance)) {
    q = 0.1;
    outcome = "failed";
  }
  const eff = efficiency(w, m, p.area);
  let gain = PROJECT.gain[p.size] * eff * q;
  if (p.area === "reliability") gain *= 2;
  if (p.target === "next") {
    gain *= w.season + 1 >= 2030 && (w.season + 1) % 5 === 0 ? 1.6 : PROJECT.nextYear;
    m.nextCar[p.area] += gain;
  } else if (p.area === "reliability") {
    team.car.reliability = Math.min(97, team.car.reliability + gain);
  } else {
    const room = Math.max(0.15, 1 - (team.car[p.area] - 80) / 30);
    gain *= room;
    team.car[p.area] = Math.min(99, team.car[p.area] + gain);
  }
  const done: Project = { ...p, gain, outcome };
  m.finished.unshift(done);
  if (m.finished.length > 30) m.finished.length = 30;
  const label = { good: "came out better than the simulations", ok: "works as designed", poor: "doesn't deliver what the tunnel promised", failed: "doesn't correlate with the wind tunnel. We'll take it off the car" }[outcome];
  message(w, m, { kind: "rnd", from: "Technical director", subject: `${p.name}: ${outcome === "failed" ? "failed" : "on the car"}`, body: `The ${p.name.toLowerCase()} ${label}. ${outcome === "failed" ? "" : `+${gain.toFixed(2)} ${p.area}${p.target === "next" ? " for next year's car" : ""}.`}` });
}

/** Cost-cap spending so far plus what the rest of the season will cost to run (without new R&D). */
export function capForecast(w: World, m: Manager): { spent: number; committed: number; room: number } {
  const team = myTeam(w)!;
  const R = w.calendar.length;
  const left = R - w.results.length;
  const people = (w.staff ?? []).filter((x) => x.teamId === m.teamId && !x.joins).sort((a, b) => b.salary - a.salary);
  const rest = people.slice(3).reduce((x, p) => x + p.salary, 0);
  const perRound = (rest + FINANCE.baseStaff) / R + FINANCE.ops + (isWorks(team.id) ? 0 : FINANCE.engineFee / R);
  const spent = capSpend(w, m);
  const committed = perRound * left;
  return { spent, committed, room: FINANCE.costCap - spent - committed };
}

// ---- winter ----

/** End of season, before the driver market: prize money position, cost cap, board review, sponsors, staff. */
export function managerSeasonEnd(w: World) {
  const m = activeManager(w);
  if (!m) return;
  const rng = mgrRng(w, "end");
  const h = w.history[w.history.length - 1];
  const pos = h.teamStandings.findIndex((x) => x.teamId === m.teamId) + 1;
  const points = h.teamStandings[pos - 1]?.points ?? 0;

  // season-target sponsor bonuses
  for (const sp of m.sponsors) if (sp.bonus.kind === "position" && pos <= (sp.bonus.target ?? 0)) book(w, m, "bonus", sp.bonus.amount, false, `${sp.brand} target met`);

  // cost cap
  const spend = capSpend(w, m);
  if (spend > FINANCE.costCap) {
    const over = spend / FINANCE.costCap - 1;
    const minor = over <= FINANCE.breachMinor;
    const fine = minor ? 4e6 + over * 60e6 : 25e6 + over * 150e6;
    book(w, m, "fine", -fine, false, "cost cap breach");
    m.capPenalty = minor ? ATR.breachCut : ATR.breachCut * 2;
    m.board.confidence -= minor ? 8 : 20;
    message(w, m, { kind: "fia", from: "FIA Cost Cap Administration", subject: `${minor ? "Minor" : "Material"} breach of the cost cap`, body: `You spent ${fmtM(spend)} against a cap of ${fmtM(FINANCE.costCap)} (${(over * 100).toFixed(1)}% over). Fine: ${fmtM(fine)}. Aerodynamic testing cut by ${Math.round(m.capPenalty * 100)}% next season.` });
  }

  // board review
  const diff = m.board.target - pos;
  m.board.confidence = Math.max(0, Math.min(100, m.board.confidence + (diff >= 0 ? diff * 10 + 6 : diff * 10) + (m.cash < 0 ? -8 : 0)));
  const profit = m.ledger.filter((e) => e.season === w.season).reduce((x, e) => x + e.amount, 0);
  m.history.push({ season: w.season, pos, points, profit, confidence: Math.round(m.board.confidence) });
  if (m.cash < 0) book(w, m, "owner", -m.cash * FINANCE.ownerBailout, false, "owner covers part of the overspend");

  if (m.board.confidence < MANAGER_RULES.firedBelow && m.history.length >= 2) {
    const prestige = prestigeOf(w, m.teamId);
    const offers = f1Teams(w)
      .filter((t) => t.id !== m.teamId && prestigeOf(w, t.id) < prestige)
      .sort(() => rng.next() - 0.5)
      .slice(0, 2)
      .map((t) => t.id);
    m.fired = { season: w.season, offers };
    message(w, m, { kind: "board", from: "The board", subject: "We are letting you go", body: `P${pos} against a target of P${m.board.target} is not good enough. Thank you for your work.${offers.length ? " Other teams have been in touch." : ""}` });
    return;
  }
  message(w, m, { kind: "board", from: "The board", subject: `Season review: P${pos}`, body: `${diff > 0 ? "Better than we asked for. Well done." : diff === 0 ? "Target met." : `We asked for P${m.board.target}.`} Board confidence: ${Math.round(m.board.confidence)}/100. Result for the year: ${fmtM(profit)}.` });

  // sponsors: expiring deals renew or leave; unhappy ones walk
  for (const sp of [...m.sponsors]) {
    if (sp.until <= w.season) {
      m.sponsors = m.sponsors.filter((x) => x !== sp);
      if (sp.satisfaction >= 55) {
        const o: SponsorOffer = { ...sp, id: nextId(m, "o"), perSeason: Math.round((sp.perSeason * (0.9 + sp.satisfaction / 250) * prestigeOf(w, m.teamId)) / m.prestige / 1e5) * 1e5, years: rng.int(1, 3), expiresRound: 3, renewal: true, until: 0 };
        m.offers.push(o);
        message(w, m, { kind: "sponsor", from: sp.brand, subject: "Renewal offer", body: `${sp.brand} would like to continue: ${fmtM(o.perSeason)} a season for ${o.years} more year${o.years > 1 ? "s" : ""}. Sign before round 3.` });
      } else message(w, m, { kind: "sponsor", from: sp.brand, subject: "Partnership ends", body: `${sp.brand} won't renew.` });
    } else if (sp.satisfaction < 25) {
      m.sponsors = m.sponsors.filter((x) => x !== sp);
      message(w, m, { kind: "sponsor", from: sp.brand, subject: "Break clause", body: `${sp.brand} uses the performance clause to end the deal early.` });
    }
  }

  // staff contracts and ageing (AI teams mostly renew; ours leave unless renewed)
  for (const st of w.staff ?? []) {
    st.age++;
    st.rating = Math.max(30, Math.min(97, Math.round(st.rating + (st.age < 40 ? 1 : st.age > 55 ? -1.2 : 0) + rng.normal(0, 1.5))));
    if (st.teamId && st.until <= w.season) {
      if (st.teamId === m.teamId) {
        message(w, m, { kind: "staff", from: "HR", subject: `${st.first} ${st.last} leaves`, body: `Our ${STAFF_ROLES[st.role].label.toLowerCase()}'s contract ran out.` });
        st.teamId = null;
      } else if (rng.chance(0.8)) st.until = w.season + rng.int(1, 3);
      else {
        // replaced by the best free agent in the role
        const team = st.teamId;
        st.teamId = null;
        const rep = (w.staff ?? []).filter((x) => !x.teamId && x.role === st.role && x !== st).sort((a, b) => b.rating - a.rating)[0];
        if (rep) {
          rep.teamId = team;
          rep.until = w.season + rng.int(1, 3);
        }
      }
    }
    if (!st.teamId && st.age > 66) st.until = -1; // retires
  }
  w.staff = (w.staff ?? []).filter((s) => s.teamId || s.until !== -1);
  topUpFreeStaff(w, rng);
  m.ledger = m.ledger.filter((e) => e.season >= w.season - 1);
}

/** Our seats before the AI market runs: expiring deals leave, pre-contracts arrive, empty seats get filled. */
export function managerMarket(w: World, next: number) {
  const m = activeManager(w);
  if (!m) return;
  const team = myTeam(w)!;
  const dm = driverMap(w);
  for (const id of [...team.drivers]) {
    const d = dm.get(id);
    if (!d || (d.contract && d.contract.until >= next)) continue;
    team.drivers = team.drivers.filter((x) => x !== id);
    d.teamId = null;
    d.contract = null;
    message(w, m, { kind: "driver", from: "Sporting director", subject: `${d.first} ${d.last} leaves`, body: `His contract ran out and he leaves the team.` });
  }
  for (const pc of m.precontracts) {
    const d = dm.get(pc.driverId);
    if (!d || d.retired || team.drivers.length >= 2) continue;
    for (const t of w.teams) t.drivers = t.drivers.filter((x) => x !== d.id);
    d.series = "F1";
    d.teamId = team.id;
    d.contract = { teamId: team.id, until: pc.until, salary: pc.salary };
    team.drivers.push(d.id);
  }
  m.precontracts = [];
  ensureSeats(w, next);
}

/** Two cars on the grid: an empty seat is filled with the reserve or the best driver we can afford. */
export function ensureSeats(w: World, season = w.season) {
  const m = activeManager(w);
  if (!m) return;
  const team = myTeam(w)!;
  const taken = new Set(f1Teams(w).flatMap((t) => t.drivers));
  while (team.drivers.length < 2) {
    const pool = w.drivers.filter((d) => !d.retired && !taken.has(d.id) && (d.series === "F1" || d.series === "F2") && (!d.contract || d.contract.teamId === team.id));
    const pick = (team.reserve && pool.find((d) => d.id === team.reserve)) || pool.sort((a, b) => b.ovr - a.ovr)[0];
    if (!pick) break;
    for (const t of w.teams) t.drivers = t.drivers.filter((x) => x !== pick.id);
    pick.series = "F1";
    pick.teamId = team.id;
    pick.contract = { teamId: team.id, until: season, salary: salaryFor(pick.ovr) };
    team.drivers.push(pick.id);
    taken.add(pick.id);
    message(w, m, { kind: "driver", from: "Sporting director", subject: `${pick.first} ${pick.last} fills the seat`, body: `We had an empty car, so we signed ${pick.first} ${pick.last} on a one-year deal.` });
  }
}

/** New season (called after the winter, season already moved on): next year's car work lands, new targets. */
export function managerWinter(w: World) {
  const m = activeManager(w);
  if (!m) return;
  const team = myTeam(w)!;
  for (const a of ["power", "aero", "mech"] as const) team.car[a] = Math.min(99, team.car[a] + m.nextCar[a]);
  team.car.reliability = Math.min(97, team.car.reliability + m.nextCar.reliability);
  const carried = m.nextCar;
  m.nextCar = { power: 0, aero: 0, mech: 0, reliability: 0 };
  newSeason(w, m, mgrRng(w, "winter"));
  message(w, m, {
    kind: "board",
    from: "The board",
    subject: `${w.season} season`,
    body: `The new car carries +${carried.aero.toFixed(1)} aero, +${carried.mech.toFixed(1)} mechanical, +${carried.power.toFixed(1)} power from last year's work. Target: P${m.board.target}. Wind tunnel allocation ${Math.round(m.atr.pct * 100)}% (${Math.round(m.atr.hours)} hours for the first half).`,
  });
}
