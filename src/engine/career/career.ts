// Driver career: you are one driver. Start in F3 or F2, race your own races (live, with dials and moments),
// earn XP and spend it on ratings, build fame, sign endorsements, keep your team's trust, and get the seat
// offers that take you to F1. The AI runs everyone else exactly as in the sandbox.
import { SPONSOR_BRANDS } from "../../../data/manual/manager";
import { genDriver } from "../generate";
import { clampRating, ovrOf, RATING_KEYS } from "../ratings";
import { hashString, makeRng, type Rng } from "../rng";
import { ageOf } from "../season/development";
import { hasLicence, juniorStandings, licencePointsSL, type Junior } from "../season/juniors";
import { driverValue, salaryFor } from "../season/offseason";
import { driverStandings, f1Teams } from "../season/season";
import type { Driver, DriverRatings, RatingKey, Series, Team, World } from "../types";
import { drawEvent } from "./events";
import { shopAfterRound } from "./shop";

// ───────────── who you are ─────────────

export interface Archetype {
  id: string;
  label: string;
  blurb: string;
  primary: RatingKey[]; // +5 at the start, no ceiling
  weak: RatingKey[]; // -4 at the start, capped at 84
}
export const ARCHETYPES: Archetype[] = [
  { id: "qualifier", label: "Qualifier", blurb: "Raw one-lap speed. Saturday is your day; long runs less so.", primary: ["quali", "starts", "composure"], weak: ["tyres", "energy"] },
  { id: "racer", label: "Racer", blurb: "Wheel-to-wheel instinct. You make up places on Sunday.", primary: ["racecraft", "overtaking", "defending"], weak: ["quali", "feedback"] },
  { id: "tyres", label: "Tyre whisperer", blurb: "Long stints, gentle on the rubber, strong on strategy.", primary: ["tyres", "energy", "consistency"], weak: ["quali", "starts"] },
  { id: "wet", label: "Wet-weather ace", blurb: "Feel and calm when it's hardest.", primary: ["wet", "composure", "consistency"], weak: ["energy", "starts"] },
  { id: "aggressor", label: "Aggressor", blurb: "Late on the brakes, never gives an inch. Stewards know your name.", primary: ["overtaking", "starts", "pace"], weak: ["consistency", "tyres"] },
  { id: "technician", label: "Technician", blurb: "Engineers love you: feedback, setup, energy management.", primary: ["feedback", "energy", "pace"], weak: ["overtaking", "racecraft"] },
];

export const TIERS = {
  academy: { label: "Academy-backed", blurb: "An F1 team's junior programme pays your way. More talent, more pressure.", ovr: { F3: 66, F2: 72 }, pot: 90, cash: 0.2e6, fame: 8 },
  mid: { label: "Midfield", blurb: "A good junior record and a family that sacrificed a lot.", ovr: { F3: 64, F2: 70 }, pot: 86, cash: 0.5e6, fame: 4 },
  self: { label: "Self-funded", blurb: "Less talent on paper, but money to buy a better seat.", ovr: { F3: 62, F2: 68 }, pot: 83, cash: 6e6, fame: 3 },
} as const;
export type Tier = keyof typeof TIERS;

export const DIFFICULTY = {
  rookie: { label: "Rookie", xp: 1.4, duel: 0.15 }, // duel: added to the player's duel odds (log-odds)
  pro: { label: "Pro", xp: 1, duel: 0 },
  champion: { label: "Champion", xp: 0.85, duel: -0.15 },
  legend: { label: "Legend", xp: 0.7, duel: -0.3 },
} as const;
export type Difficulty = keyof typeof DIFFICULTY;

// ───────────── state ─────────────

export interface Endorsement {
  id: string;
  brand: string;
  sector: string;
  pay: number; // per season
  until: number;
}
export interface EndorseOffer extends Omit<Endorsement, "until"> {
  years: number;
  expires: number; // round
  pushed?: boolean;
}
export interface SeatOffer {
  id: string;
  talks?: number; // negotiation rounds used
  clauses?: { release?: boolean; lead?: boolean };
  teamId: string;
  series: Series;
  role: "race" | "reserve";
  salary: number; // negative = you pay for the seat
  years: number;
  academy?: string; // an F1 team's junior programme comes with it
  note: string;
}
export interface CareerMsg {
  id: string;
  season: number;
  round: number;
  from: string;
  subject: string;
  body: string;
  read?: boolean;
}
export interface RaceLog {
  season: number;
  round: number;
  series: Series;
  circuitId: string;
  grid: number;
  pos: number;
  status: string;
  rating: number; // 0-10
  xp: number;
  dotd: boolean; // driver of the day
}

export interface CareerState {
  driverId: string;
  archetype: string;
  tier: Tier;
  difficulty: Difficulty;
  xp: number; // toward the next point
  points: number; // upgrade points to spend
  trust: number; // team trust 0-100
  fame: number; // 0-100
  cash: number;
  deals: Endorsement[];
  dealOffers: EndorseOffer[];
  seatOffers: SeatOffer[];
  next?: SeatOffer; // the offer accepted for next season
  academyOf?: string; // F1 team whose junior programme backs you
  inbox: CareerMsg[];
  log: RaceLog[];
  seasons: { season: number; series: Series; teamId: string | null; pos: number; points: number; wins: number; podiums: number }[];
  caps: Partial<Record<RatingKey, number>>;
  seq: number;
  // the life layer (events.ts)
  morale?: number; // 0-100: a happy driver is a little quicker
  rel?: Record<string, number>; // engineer, boss, agent, mate, family, press: 0-100
  rival?: string; // driver id
  battles?: Record<string, number>; // close finishes against each driver
  event?: { id: string; title: string; text: string; opts: { label: string; sub: string }[] };
  lastEvents?: Record<string, number>;
  lastBeatMate?: boolean;
  owned?: string[]; // shop items
  clauses?: { release?: boolean; lead?: boolean }; // in the current contract
}

/** Pace from morale for the player's car (fraction of a lap; negative = quicker). */
export const moraleForm = (w: World, driverId: string) => {
  const c = careerOf(w);
  return c && c.driverId === driverId ? -((c.morale ?? 60) - 60) * 0.00004 : 0;
};

const id = (c: CareerState, p: string) => `${p}${++c.seq}`;
export const careerOf = (w: World): CareerState | null => (w.mode === "career" && w.careerState ? w.careerState : null);
export const meOf = (w: World): Driver | undefined => {
  const c = careerOf(w);
  return c ? w.drivers.find((d) => d.id === c.driverId) : undefined;
};
const crng = (w: World, tag: string): Rng => makeRng(hashString(`${w.seed}:career:${w.season}:${w.results.length}:${tag}`));

export function note(w: World, c: CareerState, from: string, subject: string, body: string) {
  c.inbox.unshift({ id: id(c, "m"), season: w.season, round: w.results.length, from, subject, body });
  if (c.inbox.length > 120) c.inbox.length = 120;
}

// ───────────── start ─────────────

export interface NewDriver {
  first: string;
  last: string;
  nat: string;
  archetype: string;
  tier: Tier;
  start: Junior;
  difficulty: Difficulty;
}

export function startCareer(w: World, o: NewDriver) {
  const arch = ARCHETYPES.find((a) => a.id === o.archetype) ?? ARCHETYPES[1];
  const tier = TIERS[o.tier];
  const rng = makeRng(hashString(`${w.seed}:newdriver:${o.first}${o.last}`));
  const age = o.start === "F3" ? 17 : 19;
  const d = genDriver(rng, { series: o.start, season: w.season, age, level: tier.ovr[o.start], pot: tier.pot, idPrefix: "me" });
  d.first = o.first;
  d.last = o.last;
  d.nat = o.nat;
  d.code = o.last.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase().padEnd(3, "X");
  const r = { ...d.ratings };
  for (const k of RATING_KEYS) r[k] = clampRating(tier.ovr[o.start] + rng.normal(0, 2));
  for (const k of arch.primary) r[k] = clampRating(r[k] + 6);
  for (const k of arch.weak) r[k] = clampRating(r[k] - 5);
  r.aggression = arch.id === "aggressor" ? 82 : arch.id === "technician" ? 45 : 60;
  d.ratings = r as DriverRatings;
  d.ovr = ovrOf(d.ratings);
  d.pot = tier.pot;
  d.peak = 29;
  d.decline = 34;
  w.drivers.push(d);
  // a seat: academy drivers get a top junior team, the self-funded buy a good one, the rest a midfield seat
  const teams = w.teams.filter((t) => t.series === o.start).sort((a, b) => b.car.aero - a.car.aero);
  const team = o.tier === "mid" ? teams[Math.floor(teams.length / 2)] : teams[o.tier === "academy" ? 0 : 1];
  takeSeat(w, d, team);
  d.contract = { teamId: team.id, until: w.season, salary: 0 };
  const caps: Partial<Record<RatingKey, number>> = {};
  for (const k of arch.weak) caps[k] = 84;
  const academyOf = o.tier === "academy" ? rng.pick(f1Teams(w).filter((t) => t.budget >= 4)).id : undefined;
  w.mode = "career";
  w.careerState = {
    driverId: d.id,
    archetype: arch.id,
    tier: o.tier,
    difficulty: o.difficulty,
    xp: 0,
    points: 3,
    trust: 55,
    fame: tier.fame,
    cash: tier.cash,
    deals: [],
    dealOffers: [],
    seatOffers: [],
    academyOf,
    inbox: [],
    log: [],
    seasons: [],
    caps,
    seq: 0,
  };
  const c = w.careerState;
  note(w, c, team.name, `Welcome to ${team.name}`, `${o.first}, you race in ${o.start} for ${team.name} this season.${academyOf ? ` The ${w.teams.find((t) => t.id === academyOf)?.name} junior programme backs you: results get you noticed.` : ""} Earn XP on track and spend it on your skills. You need 40 super licence points to race in F1.`);
}

/** Put a driver in a team's seat (the team's weakest driver gives it up if it's full). */
function takeSeat(w: World, d: Driver, team: Team) {
  for (const t of w.teams) t.drivers = t.drivers.filter((x) => x !== d.id);
  const per = team.series === "F3" ? 3 : 2;
  if (team.drivers.length >= per) {
    const out = team.drivers.map((x) => w.drivers.find((y) => y.id === x)!).filter(Boolean).sort((a, b) => a.ovr - b.ovr)[0];
    team.drivers = team.drivers.filter((x) => x !== out.id);
    out.teamId = null;
    if (out.series === "F1") out.contract = null;
  }
  team.drivers.push(d.id);
  d.series = team.series;
  d.teamId = team.id;
}

// ───────────── progression ─────────────

export const XP_PER_POINT = 100;
export const pointCost = (v: number) => (v < 60 ? 1 : v < 70 ? 2 : v < 80 ? 3 : v < 85 ? 5 : v < 90 ? 8 : 12);

export function trainCap(c: CareerState, k: RatingKey): number {
  return Math.min(99, c.caps[k] ?? 99);
}

/** Spend points on one rating (+1 each). The overall can't pass the potential. */
export function spendPoint(w: World, k: RatingKey, times = 1): { ok: boolean; msg: string } {
  const c = careerOf(w);
  const d = meOf(w);
  if (!c || !d) return { ok: false, msg: "" };
  if (k === "aggression") return { ok: false, msg: "Aggression is your style, not a skill to train." };
  let bought = 0;
  for (let i = 0; i < times; i++) {
    const v = d.ratings[k];
    const cost = pointCost(v);
    if (c.points < cost) break;
    if (v >= trainCap(c, k)) return { ok: bought > 0, msg: bought ? `+${bought}` : `${k} is at its ceiling for your archetype.` };
    const next = { ...d.ratings, [k]: v + 1 };
    if (ovrOf(next) > d.pot) return { ok: bought > 0, msg: bought ? `+${bought}` : "You've reached your potential for now. It grows with results." };
    d.ratings[k] = v + 1;
    c.points -= cost;
    bought++;
  }
  d.ovr = ovrOf(d.ratings);
  return { ok: bought > 0, msg: bought ? `+${bought} ${k}` : "Not enough points." };
}

/** Let the coach spend the points (strengths first, then the weakest areas). */
export function autoSpend(w: World): { ok: boolean; msg: string } {
  const c = careerOf(w);
  const d = meOf(w);
  if (!c || !d) return { ok: false, msg: "" };
  const arch = ARCHETYPES.find((a) => a.id === c.archetype)!;
  let n = 0;
  for (let guard = 0; guard < 200 && c.points > 0; guard++) {
    const keys = RATING_KEYS.filter((k) => k !== "aggression").sort((a, b) => d.ratings[a] + (arch.primary.includes(a) ? -6 : 0) - (d.ratings[b] + (arch.primary.includes(b) ? -6 : 0)));
    let spent = false;
    for (const k of keys) {
      if (pointCost(d.ratings[k]) <= c.points && spendPoint(w, k).ok) {
        spent = true;
        n++;
        break;
      }
    }
    if (!spent) break;
  }
  return { ok: n > 0, msg: n ? `${n} upgrades bought.` : "Nothing to buy." };
}

// ───────────── after every round ─────────────

/** Expected finishing position from the car (rank of the team's car in its series). */
function expectedPos(w: World, d: Driver): number {
  const teams = w.teams.filter((t) => t.series === d.series).sort((a, b) => b.car.power + b.car.aero + b.car.mech - (a.car.power + a.car.aero + a.car.mech));
  const i = teams.findIndex((t) => t.id === d.teamId);
  const per = d.series === "F3" ? 3 : 2;
  return i < 0 ? 15 : i * per + per / 2 + 0.5;
}

export function careerAfterRound(w: World) {
  const c = careerOf(w);
  const d = meOf(w);
  if (!c || !d) return;
  const round = w.results.length;
  const rng = crng(w, "round");
  const mult = DIFFICULTY[c.difficulty].xp * (ageOf(d, w.season) < 22 ? 1.25 : ageOf(d, w.season) > 30 ? 0.8 : 1);
  // which race was mine this weekend?
  let row: { grid: number; pos: number; status: string; points: number; teamId: string } | undefined;
  let series: Series = d.series;
  let circuitId = "";
  if (d.series === "F1") {
    const res = w.results[w.results.length - 1];
    const x = res?.classification.find((r) => r.driverId === d.id);
    if (x) {
      row = x;
      circuitId = res.circuitId;
    }
  } else {
    const res = (w.juniorResults ?? []).find((r) => r.round === round && r.series === d.series);
    const x = res?.rows.find((r) => r.driverId === d.id);
    if (x && res) {
      row = x;
      circuitId = res.circuitId;
    }
  }
  let xp = 14; // testing and the simulator, every weekend
  if (row) {
    series = d.series;
    const fin = row.status === "Finished" || row.status === "Lapped";
    const exp = expectedPos(w, d);
    const gained = row.grid - row.pos;
    let rating = 6 + (fin ? (exp - row.pos) * 0.18 + gained * 0.08 : -1.5) + (row.pos === 1 && fin ? 1.2 : row.pos <= 3 && fin ? 0.6 : 0);
    rating = Math.round(Math.max(1, Math.min(10, rating + rng.normal(0, 0.3))) * 10) / 10;
    xp += 25 + Math.max(0, rating - 5) * 10 + (fin && row.pos === 1 ? 25 : fin && row.pos <= 3 ? 12 : 0);
    const tier = series === "F1" ? 1.6 : series === "F2" ? 0.8 : 0.5;
    const fameGain = (fin ? (row.pos === 1 ? 4 : row.pos <= 3 ? 2 : row.points > 0 ? 0.5 : 0) : -0.3) * tier;
    c.fame = Math.max(0, Math.min(100, c.fame + fameGain));
    // team trust: against the expectation and the team-mate
    const mate = w.drivers.find((x) => x.teamId === d.teamId && x.id !== d.id);
    const mateRow = d.series === "F1" ? w.results[w.results.length - 1]?.classification.find((r) => r.driverId === mate?.id) : (w.juniorResults ?? []).find((r) => r.round === round && r.series === d.series)?.rows.find((r) => r.driverId === mate?.id);
    let dt = fin ? (exp - row.pos) * 0.6 : -2;
    if (mateRow) dt += mateRow.pos > row.pos ? 2 : -1.5;
    c.lastBeatMate = mateRow ? mateRow.pos > row.pos : undefined;
    // rivals: the driver you keep finishing next to
    const rows = d.series === "F1" ? w.results[w.results.length - 1]?.classification : (w.juniorResults ?? []).find((r) => r.round === round && r.series === d.series)?.rows;
    const near = rows?.find((r) => Math.abs(r.pos - row!.pos) === 1 && r.driverId !== mate?.id && r.pos < row!.pos);
    if (near) {
      const b = ((c.battles ??= {})[near.driverId] = (c.battles[near.driverId] ?? 0) + 1);
      if (b >= 3 && c.rival !== near.driverId) {
        c.rival = near.driverId;
        const rv = w.drivers.find((x) => x.id === near.driverId);
        note(w, c, "Press", "A rivalry", `You and ${rv?.first} ${rv?.last} keep fighting over the same piece of track. The press has noticed.`);
      }
    }
    c.morale = Math.max(0, Math.min(100, (c.morale ?? 60) + (fin ? (exp - row.pos) * 0.4 : -3)));
    c.trust = Math.max(0, Math.min(100, c.trust + Math.max(-5, Math.min(5, dt))));
    const dotd = rating >= 8.5 || (gained >= 6 && fin);
    c.log.push({ season: w.season, round, series, circuitId, grid: row.grid, pos: row.pos, status: row.status, rating, xp: Math.round(xp * mult), dotd });
    if (dotd) {
      c.fame = Math.min(100, c.fame + 1);
      note(w, c, "Fans", "Driver of the Day", `P${row.grid} to P${row.pos}. The fans voted you Driver of the Day.`);
    }
  }
  // XP to points
  c.xp += Math.round(xp * mult);
  while (c.xp >= XP_PER_POINT) {
    c.xp -= XP_PER_POINT;
    c.points++;
  }
  // money: salary and endorsements
  const R = w.calendar.length;
  c.cash += (d.contract?.salary ?? 0) / R + c.deals.filter((x) => x.until >= w.season).reduce((s, x) => s + x.pay, 0) / R;
  // potential grows a little with results (a driver who wins everywhere was better than we thought)
  if (row && row.pos <= 2 && rng.chance(0.25)) d.pot = Math.min(99, d.pot + 1);
  // endorsement offers follow fame
  c.dealOffers = c.dealOffers.filter((o) => o.expires >= round);
  if (c.deals.length + c.dealOffers.length < 5 && rng.chance(0.12 + c.fame / 250)) {
    const o = endorseOffer(w, c, rng);
    c.dealOffers.push(o);
    note(w, c, "Your agent", `${o.brand} wants you`, `${o.brand} (${o.sector}) offers $${(o.pay / 1e6).toFixed(2)}M a season for ${o.years} year${o.years > 1 ? "s" : ""}. Open until round ${o.expires}.`);
  }
  // F1 academies notice strong juniors
  if (!c.academyOf && d.series !== "F1" && row && row.pos <= 3 && rng.chance(0.25)) {
    const t = rng.pick(f1Teams(w));
    c.academyOf = t.id;
    note(w, c, t.name, `Join the ${t.name} junior programme`, `We've watched your results. ${t.name} wants you in its academy: support, simulator time, and a path to an F1 seat. (You're in.)`);
    c.trust = Math.min(100, c.trust + 3);
  }
  shopAfterRound(w);
  if (round === R) seasonEndOffers(w, c, d);
  else drawEvent(w);
}

function endorseOffer(w: World, c: CareerState, rng: Rng): EndorseOffer {
  const used = new Set([...c.deals.map((x) => x.brand), ...c.dealOffers.map((x) => x.brand)]);
  const b = rng.pick(SPONSOR_BRANDS.filter((x) => !used.has(x.name)));
  const pay = Math.round((25e3 * Math.pow(1 + c.fame / 8, 2.1) * (0.8 + rng.next() * 0.5)) / 1e3) * 1e3;
  return { id: id(c, "e"), brand: b.name, sector: b.sector, pay, years: rng.int(1, 3), expires: w.results.length + 4 };
}

// ───────────── silly season ─────────────

/** Offers for next season, made when the season ends (before the market). */
function seasonEndOffers(w: World, c: CareerState, d: Driver) {
  const rng = crng(w, "offers");
  const offers: SeatOffer[] = [];
  const add = (o: Omit<SeatOffer, "id">) => offers.push({ ...o, id: id(c, "s") });
  const v = driverValue(d, w.season + 1);
  const standing = d.series === "F2" || d.series === "F3" ? juniorStandings(w, d.series as Junior).findIndex((r) => r.driverId === d.id) + 1 : driverStandings(w).findIndex((r) => r.driverId === d.id) + 1;
  const own = w.teams.find((t) => t.id === d.teamId);
  const licensed = hasLicence(w, d) || licencePointsSL(d, w.season) + (d.series === "F2" && standing > 0 && standing <= 3 ? 40 : 0) >= 40;
  // stay where you are (a renewal) if the team trusts you
  if (own && c.trust >= 25) add({ teamId: own.id, series: own.series, role: "race", salary: own.series === "F1" ? Math.round(salaryFor(d.ovr) * (0.8 + c.trust / 250)) : 0, years: own.series === "F1" ? 2 : 1, note: "Renewal with your current team." });
  // step up in the junior ladder
  if (d.series === "F3") {
    const f2 = w.teams.filter((t) => t.series === "F2").sort((a, b) => b.car.aero - a.car.aero);
    const reach = standing > 0 && standing <= 3 ? 0 : standing <= 8 ? 3 : standing <= 14 ? 6 : 9;
    for (const t of f2.slice(reach, reach + 2)) add({ teamId: t.id, series: "F2", role: "race", salary: 0, years: 1, note: `An F2 seat${reach ? "" : " with a front-running team"}.` });
    const paid = f2[Math.min(f2.length - 1, Math.max(0, reach - 3))];
    if (paid) add({ teamId: paid.id, series: "F2", role: "race", salary: -2.5e6, years: 1, note: "A paid F2 seat: you (or your backers) bring the budget." });
  }
  if (d.series === "F3" || d.series === "F2") {
    const same = w.teams.filter((t) => t.series === d.series && t.id !== d.teamId).sort((a, b) => b.car.aero - a.car.aero);
    const t = same[Math.min(same.length - 1, Math.max(0, Math.floor(standing / 3)))];
    if (t) add({ teamId: t.id, series: d.series, role: "race", salary: 0, years: 1, note: `Another year in ${d.series} with a different team.` });
  }
  // F1: race seats where a deal is ending, and reserve roles
  if (licensed && d.series !== "F1") {
    const open = f1Teams(w).filter((t) => t.drivers.some((x) => (w.drivers.find((y) => y.id === x)?.contract?.until ?? 0) <= w.season));
    const academyTeam = c.academyOf ? open.find((t) => t.id === c.academyOf) : undefined;
    const keen = [academyTeam, ...open.filter((t) => t !== academyTeam)].filter((t): t is Team => !!t);
    for (const t of keen) {
      const worst = t.drivers.map((x) => w.drivers.find((y) => y.id === x)!).sort((a, b) => driverValue(a, w.season + 1) - driverValue(b, w.season + 1))[0];
      const bias = t.id === c.academyOf ? 6 : 0;
      if (worst && v + bias + (standing === 1 ? 4 : standing <= 3 ? 2 : 0) > driverValue(worst, w.season + 1) - 2 && rng.chance(0.75)) {
        add({ teamId: t.id, series: "F1", role: "race", salary: Math.max(1e6, salaryFor(d.ovr)), years: 2, academy: c.academyOf, note: `A race seat in F1${t.id === c.academyOf ? ", from your academy team" : ""}.` });
        if (offers.filter((o) => o.series === "F1" && o.role === "race").length >= 2) break;
      }
    }
    const reserveTeam = (c.academyOf && w.teams.find((t) => t.id === c.academyOf)) || rng.pick(f1Teams(w));
    add({ teamId: reserveTeam.id, series: "F1", role: "reserve", salary: 0.5e6, years: 1, note: "Reserve driver: simulator work, Friday runs, and you're first in line if a seat opens. No racing." });
  }
  if (d.series === "F1" && ((d.contract?.until ?? 0) <= w.season || c.clauses?.release)) {
    // other F1 teams want a strong driver (when your deal ends, or a release clause lets you go)
    for (const t of f1Teams(w).filter((t) => t.id !== d.teamId)) {
      const worst = t.drivers.map((x) => w.drivers.find((y) => y.id === x)!).filter((x) => (x.contract?.until ?? 0) <= w.season).sort((a, b) => driverValue(a, w.season + 1) - driverValue(b, w.season + 1))[0];
      if (worst && v > driverValue(worst, w.season + 1) + 1 && rng.chance(0.6)) add({ teamId: t.id, series: "F1", role: "race", salary: Math.round(salaryFor(d.ovr) * 1.1), years: 2, note: `${t.name} wants you.` });
      if (offers.length >= 4) break;
    }
  }
  c.seatOffers = offers;
  const contractEnds = (d.contract?.until ?? w.season) <= w.season;
  note(w, c, "Your agent", "Silly season", `${offers.length} offer${offers.length === 1 ? "" : "s"} for next season.${contractEnds ? " Your contract ends: pick one before the winter, or you'll take the best one I can find." : ""}`);
}

export function acceptSeat(w: World, offerId: string): { ok: boolean; msg: string } {
  const c = careerOf(w);
  if (!c) return { ok: false, msg: "" };
  const o = c.seatOffers.find((x) => x.id === offerId);
  if (!o) return { ok: false, msg: "That offer is gone." };
  if (o.salary < 0 && c.cash < -o.salary) return { ok: false, msg: "You can't afford this seat." };
  c.next = o;
  return { ok: true, msg: `Agreed: ${w.teams.find((t) => t.id === o.teamId)?.name} for next season.` };
}

/** Winter, before the AI market: your next seat. Called from endSeason. */
export function careerMarket(w: World, next: number) {
  const c = careerOf(w);
  const d = meOf(w);
  if (!c || !d) return;
  const st = d.series === "F2" || d.series === "F3" ? juniorStandings(w, d.series as Junior) : null;
  const pos = st ? st.findIndex((r) => r.driverId === d.id) + 1 : driverStandings(w).findIndex((r) => r.driverId === d.id) + 1;
  const wins = st ? (st.find((r) => r.driverId === d.id)?.wins ?? 0) : 0;
  c.seasons.push({ season: w.season, series: d.series, teamId: d.teamId, pos, points: st ? (st.find((r) => r.driverId === d.id)?.points ?? 0) : (driverStandings(w).find((r) => r.driverId === d.id)?.points ?? 0), wins, podiums: 0 });
  let o = c.next;
  if (!o && (d.contract?.until ?? w.season) <= w.season) o = c.seatOffers.filter((x) => x.salary >= 0).sort((a, b) => (a.series === "F1" && a.role === "race" ? -1 : 0) - (b.series === "F1" && b.role === "race" ? -1 : 0))[0];
  c.next = undefined;
  c.seatOffers = [];
  if (!o) return;
  const team = w.teams.find((t) => t.id === o!.teamId)!;
  if (o.salary < 0) c.cash += o.salary;
  if (o.academy) c.academyOf = o.academy;
  if (o.role === "reserve") {
    for (const t of w.teams) t.drivers = t.drivers.filter((x) => x !== d.id);
    d.series = "F1";
    d.teamId = null;
    team.reserve = d.id;
    d.contract = { teamId: team.id, until: next + o.years - 1, salary: o.salary };
    note(w, c, team.name, "Reserve driver", `You're ${team.name}'s reserve driver for ${next}. Be ready.`);
    return;
  }
  takeSeat(w, d, team);
  d.contract = { teamId: team.id, until: next + o.years - 1, salary: Math.max(0, o.salary) };
  c.clauses = o.clauses;
  c.trust = o.clauses?.lead ? 65 : 55;
  note(w, c, team.name, `${team.name} for ${next}`, `You race in ${team.series} for ${team.name} in ${next}.`);
}

/** Contract talks: ask for more money, a different length, or a clause. The team says yes, counters, or walks. */
export function negotiateSeat(w: World, offerId: string, ask: number, years: number, clause?: "release" | "lead"): { ok: boolean; msg: string } {
  const c = careerOf(w);
  const d = meOf(w);
  if (!c || !d) return { ok: false, msg: "" };
  const o = c.seatOffers.find((x) => x.id === offerId);
  if (!o) return { ok: false, msg: "That offer is gone." };
  if ((o.talks ?? 0) >= 2) return { ok: false, msg: "They've made their final offer." };
  o.talks = (o.talks ?? 0) + 1;
  const team = w.teams.find((t) => t.id === o.teamId)!;
  const r = makeRng(hashString(`${w.seed}:talks:${o.id}:${o.talks}`));
  const want = o.series === "F1" ? (driverValue(d, w.season + 1) - 75) / 25 : 0.4; // how badly they want you
  const agent = (c.rel?.agent ?? 50) / 100;
  let p = 0.85 - Math.max(0, ask - 1) * 1.8 + want * 0.4 + c.fame / 250 + (agent - 0.5) * 0.3 - (clause ? 0.18 : 0) - Math.abs(years - o.years) * 0.06;
  if (o.salary <= 0 && ask > 1) p -= 0.3; // a junior seat doesn't pay; asking for money is a stretch
  p = Math.max(0.05, Math.min(0.95, p));
  const base = o.salary === 0 && ask > 1 ? 150_000 : o.salary;
  if (r.chance(p)) {
    o.salary = o.salary < 0 ? Math.round((o.salary / ask) / 1e4) * 1e4 : Math.round((base * ask) / 1e4) * 1e4;
    o.years = years;
    if (clause) o.clauses = { ...o.clauses, [clause]: true };
    return { ok: true, msg: `${team.name} agrees.` };
  }
  if (r.chance(0.4)) {
    c.seatOffers = c.seatOffers.filter((x) => x !== o);
    return { ok: false, msg: `${team.name} pulls the offer.` };
  }
  if (o.salary > 0) o.salary = Math.round((o.salary * (1 + Math.max(0, ask - 1) * 0.3)) / 1e4) * 1e4;
  return { ok: false, msg: `${team.name} won't go that far. They improve the offer a little${o.talks >= 2 ? ", and that's final" : ""}.` };
}

// ───────────── endorsements ─────────────

export function signDeal(w: World, offerId: string, push: boolean): { ok: boolean; msg: string } {
  const c = careerOf(w);
  if (!c) return { ok: false, msg: "" };
  const o = c.dealOffers.find((x) => x.id === offerId);
  if (!o) return { ok: false, msg: "That offer is gone." };
  c.dealOffers = c.dealOffers.filter((x) => x !== o);
  let pay = o.pay;
  if (push) {
    const r = makeRng(hashString(`${w.seed}:push:${o.id}`));
    if (!r.chance(0.5 + c.fame / 300)) return { ok: false, msg: `${o.brand} walked away while your agent pushed.` };
    pay = Math.round((pay * (1.25 + r.next() * 0.25)) / 1e3) * 1e3;
  }
  c.deals.push({ id: o.id, brand: o.brand, sector: o.sector, pay, until: w.season + o.years - 1 });
  c.fame = Math.min(100, c.fame + 0.5);
  return { ok: true, msg: `${o.brand}: $${(pay / 1e6).toFixed(2)}M a season.` };
}

export function careerWinter(w: World) {
  const c = careerOf(w);
  if (!c) return;
  c.deals = c.deals.filter((x) => x.until >= w.season);
  c.dealOffers = [];
  c.fame = Math.max(0, c.fame * 0.92); // people forget
}
