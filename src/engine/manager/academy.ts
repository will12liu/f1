// The academy: scouts learn the true potential of junior drivers (F4 prospects, F3, F2), you sign the ones
// you believe in, place them in junior teams (buy your own F2/F3 team, or pay for a seat), and they develop
// faster with your programme. Academy drivers sign their first F1 deal with you cheaply.
import { personName } from "../generate";
import { hashString, makeRng } from "../rng";
import { ageOf } from "../season/development";
import { hasLicence, juniorStandings, licencePointsSL } from "../season/juniors";
import type { Driver, World } from "../types";
import { activeManager, prestigeOf } from "./manager";
import { book, fmtM, message, mgrRng, nextId, type Manager, type Scout } from "./state";
import type { Answer } from "./actions";

export const ACADEMY = {
  max: 6,
  fee: { F4: 0.25e6, F3: 0.6e6, F2: 1.2e6 } as Record<string, number>,
  seatFee: { F3: 1.5e6, F2: 3e6 } as Record<string, number>, // paying a junior team for a seat
  buy: { F3: 14e6, F2: 32e6 } as Record<string, number>,
  running: { F3: 7e6, F2: 12e6 } as Record<string, number>, // per season, outside the cost cap
  program: [0, 0, 4e6, 7e6, 11e6, 16e6], // upgrade cost to each level
  scoutPay: [0.15e6, 0.7e6],
};

const ok = (msg: string): Answer => ({ ok: true, msg });
const no = (msg: string): Answer => ({ ok: false, msg });
function mgr(w: World): Manager {
  const m = activeManager(w);
  if (!m) throw new Error("not in team-principal mode");
  m.academy ??= [];
  m.scouts ??= [];
  m.knowledge ??= {};
  m.juniorTeams ??= [];
  m.program ??= 2;
  return m;
}

/** A fixed, per-driver error in what you think his potential is (shrinks as scouts learn more). */
function bias(d: Driver) {
  return makeRng(hashString(`potbias:${d.id}`)).normal(0, 1);
}
/** What you believe a driver's potential is: a range that narrows with knowledge. */
export function potEstimate(w: World, d: Driver): { lo: number; hi: number; mid: number; k: number } {
  const m = w.manager;
  const k = Math.min(100, m?.knowledge?.[d.id] ?? (d.series === "F1" ? 100 : 10));
  const err = (1 - k / 100) * 12;
  const mid = Math.round(Math.max(d.ovr, d.pot + bias(d) * err * 0.6));
  const half = Math.round(err * 0.7);
  const top = Math.min(99, mid);
  return { lo: Math.min(top, Math.max(d.ovr, mid - half)), hi: Math.min(99, mid + half), mid: top, k };
}

export function scoutAsk(rating: number) {
  const [lo, hi] = ACADEMY.scoutPay;
  return Math.round((lo + (hi - lo) * Math.max(0, (rating - 40) / 55)) / 1e4) * 1e4;
}

/** Scouts on the market (a few new names each season). */
export function scoutMarket(w: World): Scout[] {
  const m = mgr(w);
  const want = 5;
  const free = m.scouts!.filter((s) => !s.hired);
  if (free.length < want) {
    const rng = mgrRng(w, `scouts:${m.scouts!.length}`);
    for (let i = free.length; i < want; i++) {
      const n = personName(rng);
      const rating = Math.round(Math.max(35, Math.min(95, rng.normal(62, 12))));
      m.scouts!.push({ id: nextId(m, "sc"), ...n, rating, salary: scoutAsk(rating), focus: rng.pick(["F4", "F3", "F2"] as const), hired: false });
    }
  }
  return m.scouts!.filter((s) => !s.hired);
}

// ---- actions ----

export function hireScout(w: World, scoutId: string): Answer {
  const m = mgr(w);
  const s = m.scouts!.find((x) => x.id === scoutId && !x.hired);
  if (!s) return no("Not available.");
  if (m.scouts!.filter((x) => x.hired).length >= 5) return no("Five scouts is the most the department can run.");
  s.hired = true;
  return ok(`${s.first} ${s.last} joins as a scout (${fmtM(s.salary)} a season).`);
}
export function fireScout(w: World, scoutId: string): Answer {
  const m = mgr(w);
  m.scouts = m.scouts!.filter((x) => x.id !== scoutId);
  return ok("Scout released.");
}
export function setScoutFocus(w: World, scoutId: string, focus: Scout["focus"]): Answer {
  const m = mgr(w);
  const s = m.scouts!.find((x) => x.id === scoutId && x.hired);
  if (!s) return no("Not your scout.");
  s.focus = focus;
  return ok(`${s.last} now watches ${focus}.`);
}

export function signAcademy(w: World, driverId: string): Answer {
  const m = mgr(w);
  const d = w.drivers.find((x) => x.id === driverId);
  if (!d || d.retired || !["F2", "F3", "F4"].includes(d.series)) return no("Only junior drivers can join an academy.");
  if (m.academy!.some((a) => a.driverId === d.id)) return no("Already in your academy.");
  if (m.academy!.length >= ACADEMY.max) return no(`The academy is full (${ACADEMY.max}). Release someone first.`);
  // a strong prospect wants a team with a future
  const est = potEstimate(w, d);
  const p = prestigeOf(w, m.teamId);
  if (d.pot >= 88 && p < 0.8 && makeRng(hashString(`acad:${d.id}:${w.season}`)).chance(0.5)) return no(`${d.last} would rather wait for a bigger team's academy.`);
  const fee = ACADEMY.fee[d.series] ?? 0.5e6;
  m.academy!.push({ driverId: d.id, since: w.season, fee });
  m.knowledge![d.id] = Math.max(m.knowledge![d.id] ?? 0, 40);
  message(w, m, { kind: "driver", from: "Academy", subject: `${d.first} ${d.last} joins the academy`, body: `${ageOf(d, w.season)}, ${d.series}. Our estimate of his potential: ${est.lo}-${est.hi}. Support costs ${fmtM(fee)} a season.` });
  return ok(`${d.first} ${d.last} signed to the academy.`);
}

export function releaseAcademy(w: World, driverId: string): Answer {
  const m = mgr(w);
  m.academy = m.academy!.filter((a) => a.driverId !== driverId);
  return ok("Released from the academy.");
}

export function buyJuniorTeam(w: World, teamId: string): Answer {
  const m = mgr(w);
  const t = w.teams.find((x) => x.id === teamId);
  if (!t || (t.series !== "F2" && t.series !== "F3")) return no("Not a junior team.");
  if (m.juniorTeams!.includes(t.id)) return no("Already yours.");
  if (m.juniorTeams!.some((id) => w.teams.find((x) => x.id === id)?.series === t.series)) return no(`You already own an ${t.series} team.`);
  const cost = ACADEMY.buy[t.series];
  if (m.cash - cost < -30e6) return no("Not enough money.");
  book(w, m, "facility", -cost, false, `buying ${t.name}`);
  m.juniorTeams!.push(t.id);
  return ok(`${t.name} is yours. Put academy drivers in its seats.`);
}

/** Put an academy driver in a seat: in your own junior team, or pay another team for one. */
export function placeDriver(w: World, driverId: string, teamId: string): Answer {
  const m = mgr(w);
  const d = w.drivers.find((x) => x.id === driverId);
  const t = w.teams.find((x) => x.id === teamId);
  if (!d || !t || !m.academy!.some((a) => a.driverId === d.id)) return no("Only your academy drivers.");
  if (t.series !== "F2" && t.series !== "F3") return no("Junior teams only.");
  if (t.series === "F2" && d.series === "F4") return no("Straight from F4 to F2 is too big a step.");
  if (w.results.length > 0 && d.teamId && d.series === t.series) return no("Seat changes mid-season only between series breaks: try in the winter.");
  const own = m.juniorTeams!.includes(t.id);
  const per = t.series === "F3" ? 3 : 2;
  if (!own) {
    const fee = ACADEMY.seatFee[t.series];
    if (m.cash - fee < -30e6) return no("Not enough money for the seat.");
    book(w, m, "transfer", -fee, false, `${t.name} seat for ${d.last}`);
  }
  // free a seat: the team's weakest non-academy driver goes back to the pool
  if (t.drivers.length >= per) {
    const acad = new Set(m.academy!.map((a) => a.driverId));
    const out = t.drivers.map((id) => w.drivers.find((x) => x.id === id)!).filter((x) => x && !acad.has(x.id)).sort((a, b) => a.ovr - b.ovr)[0];
    if (!out) return no(`${t.name} is full of your own drivers.`);
    t.drivers = t.drivers.filter((x) => x !== out.id);
    out.teamId = null;
  }
  for (const x of w.teams) x.drivers = x.drivers.filter((id) => id !== d.id);
  d.series = t.series;
  d.teamId = t.id;
  t.drivers.push(d.id);
  return ok(`${d.last} drives for ${t.name}${own ? "" : ` (seat paid: ${fmtM(ACADEMY.seatFee[t.series])})`}.`);
}

export function upgradeProgram(w: World): Answer {
  const m = mgr(w);
  if (m.program! >= 5) return no("Top level already.");
  const cost = ACADEMY.program[m.program! + 1];
  if (m.cash - cost < -30e6) return no("Not enough money.");
  book(w, m, "facility", -cost, false, `academy programme level ${m.program! + 1}`);
  m.program = m.program! + 1;
  return ok(`Academy programme is now level ${m.program}.`);
}

// ---- every round and every winter ----

export function academyAfterRound(w: World) {
  const m = activeManager(w);
  if (!m) return;
  mgr(w);
  const R = w.calendar.length;
  const rng = mgrRng(w, "academy");
  // scouts learn: each looks at a few drivers in his series, the least known first
  const pool = w.drivers.filter((d) => !d.retired);
  for (const s of m.scouts!.filter((x) => x.hired)) {
    const targets = pool.filter((d) => d.series === s.focus).sort((a, b) => (m.knowledge![a.id] ?? 0) - (m.knowledge![b.id] ?? 0) + rng.normal(0, 8));
    for (const d of targets.slice(0, 3)) m.knowledge![d.id] = Math.min(100, (m.knowledge![d.id] ?? 10) + s.rating / 7);
    book(w, m, "staff", -s.salary / R, false, `scout ${s.last}`);
  }
  for (const a of m.academy!) {
    m.knowledge![a.driverId] = Math.min(100, (m.knowledge![a.driverId] ?? 10) + 3);
    book(w, m, "staff", -a.fee / R, false, "academy support");
  }
  for (const id of m.juniorTeams!) {
    const t = w.teams.find((x) => x.id === id);
    if (t) book(w, m, "ops", -ACADEMY.running[t.series] / R, false, `${t.name} running costs`);
  }
}

/** Winter: academy drivers develop faster; ageing out; junior champions noted. Before the market. */
export function academyWinter(w: World) {
  const m = activeManager(w);
  if (!m?.academy?.length) return;
  mgr(w);
  for (const a of [...m.academy!]) {
    const d = w.drivers.find((x) => x.id === a.driverId);
    if (!d || d.retired) {
      m.academy = m.academy!.filter((x) => x !== a);
      continue;
    }
    if (d.series === "F1") {
      m.academy = m.academy!.filter((x) => x !== a);
      continue;
    }
    // coaching: a nudge toward potential
    const gain = Math.max(0, d.pot - d.ovr) * (0.04 + m.program! * 0.025 + (m.facilities.sim.level - 1) * 0.01);
    for (const k of Object.keys(d.ratings) as (keyof typeof d.ratings)[]) if (k !== "aggression") d.ratings[k] = Math.min(99, d.ratings[k] + gain);
    d.ovr = Math.min(d.pot, Math.round(d.ovr + gain));
  }
  const st = { F2: juniorStandings(w, "F2"), F3: juniorStandings(w, "F3") };
  const lines = m.academy!.map((a) => {
    const d = w.drivers.find((x) => x.id === a.driverId)!;
    const s = (st as Record<string, ReturnType<typeof juniorStandings>>)[d.series];
    const pos = s ? s.findIndex((r) => r.driverId === d.id) + 1 : 0;
    return `${d.first} ${d.last}: ${d.series}${pos ? ` P${pos}` : ""}, ${licencePointsSL(d, w.season)} licence points${hasLicence(w, d) ? " (licensed)" : ""}`;
  });
  if (lines.length) message(w, m, { kind: "driver", from: "Academy", subject: "Academy report", body: lines.join(". ") + "." });
}
