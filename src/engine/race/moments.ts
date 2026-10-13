// Key moments: the race stops for a decision. Two kinds:
//  - DUELS: you're attacking or defending within a second. You pick a move, the other driver picks his by
//    his tendencies, and a payoff table (move vs response) shifts the odds the engine already had from pace,
//    skill and the track. Moves carry contact and penalty risk.
//  - CALLS: strategy and radio situations (safety car, tyres going, undercut, fuel, restart, team orders).
//    Each option becomes dial changes or a pit call for that lap.
// Situations are data with weight functions (borrowed from the NBA game's moments). Every moment has an
// "instinct" option that runs the plain AI path, so skipping a moment never changes the rest of the race.
import { hashString, makeRng, type Rng } from "../rng";
import type { Dials } from "./dials";

export type AttackMove = "inside" | "outside" | "late" | "dummy" | "ers" | "wait";
export type DefendMove = "coverIn" | "coverOut" | "hold" | "lateDef" | "ersDef" | "yield";

/** Base pass chance for each move against each response (before pace, skill and the track). */
export const PAYOFF: Record<Exclude<AttackMove, "wait">, Record<Exclude<DefendMove, "yield">, number>> = {
  inside: { coverIn: 0.18, coverOut: 0.78, hold: 0.6, lateDef: 0.25, ersDef: 0.4 },
  outside: { coverIn: 0.72, coverOut: 0.14, hold: 0.25, lateDef: 0.55, ersDef: 0.35 },
  late: { coverIn: 0.45, coverOut: 0.6, hold: 0.66, lateDef: 0.2, ersDef: 0.42 },
  dummy: { coverIn: 0.7, coverOut: 0.7, hold: 0.18, lateDef: 0.5, ersDef: 0.4 },
  ers: { coverIn: 0.58, coverOut: 0.58, hold: 0.55, lateDef: 0.48, ersDef: 0.3 },
};
/** Contact multiplier on the engine's contact chance. */
export const CONTACT: Record<Exclude<AttackMove, "wait">, Record<Exclude<DefendMove, "yield">, number>> = {
  inside: { coverIn: 1.8, coverOut: 0.8, hold: 1.1, lateDef: 3.2, ersDef: 1 },
  outside: { coverIn: 0.6, coverOut: 1.4, hold: 1.3, lateDef: 1.2, ersDef: 0.8 },
  late: { coverIn: 1.3, coverOut: 1.1, hold: 1.2, lateDef: 3.6, ersDef: 1.2 },
  dummy: { coverIn: 0.8, coverOut: 0.8, hold: 1, lateDef: 1.5, ersDef: 0.8 },
  ers: { coverIn: 0.6, coverOut: 0.6, hold: 0.7, lateDef: 1.3, ersDef: 0.7 },
};

export const ATTACK_LABEL: Record<AttackMove, [string, string]> = {
  inside: ["Dive up the inside", "Beats a car covering the outside. Risky if he moves late."],
  outside: ["Around the outside", "Long way round. Works if he covers the inside."],
  late: ["Brake later than him", "Beats a car holding the line. A lock-up or contact if he moves late."],
  dummy: ["Dummy, then switch back", "Beats a car that commits early. Useless against the racing line."],
  ers: ["Overtake mode, all of it", "Spends a quarter of the battery. Good against anything."],
  wait: ["Stay close, wait a lap", "No attempt. Learn how he defends, keep the tyres."],
};
export const DEFEND_LABEL: Record<DefendMove, [string, string]> = {
  coverIn: ["Cover the inside", "Stops the dive. Leaves the outside open."],
  coverOut: ["Cover the outside", "Stops the long way round. Opens the inside."],
  hold: ["Hold the racing line", "Best exit. Beats the dummy, weak to late braking."],
  lateDef: ["Move late under braking", "Strong, but contact and a penalty are possible."],
  ersDef: ["Defend mode", "Spends battery to stay ahead."],
  yield: ["Let him go", "No fight: protect the tyres, lose the place."],
};

/** A driver's habits in a fight, fixed per driver (from his id and his ratings). */
export function tendencies(driverId: string, aggression: number): { def: Record<Exclude<DefendMove, "yield" | "ersDef">, number>; att: Record<Exclude<AttackMove, "wait" | "ers">, number> } {
  const r = makeRng(hashString(`tend:${driverId}`));
  const a = aggression / 100;
  return {
    def: { coverIn: 1 + r.next() * 2, coverOut: 0.4 + r.next(), hold: 0.8 + r.next() * 1.6, lateDef: (0.2 + r.next() * 1.4) * (0.5 + a) },
    att: { inside: 1 + r.next() * 2 * (0.5 + a), outside: 0.3 + r.next() * 1.2, late: 0.6 + r.next() * 1.6 * (0.5 + a), dummy: 0.3 + r.next() },
  };
}

export function pickWeighted<K extends string>(w: Record<K, number>, rng: Rng): K {
  const keys = Object.keys(w) as K[];
  let x = rng.next() * keys.reduce((s, k) => s + w[k], 0);
  for (const k of keys) if ((x -= w[k]) <= 0) return k;
  return keys[keys.length - 1];
}

/** What the player knows of an opponent from past duels: "covers the inside 3 of 4 times". */
export type Reads = Record<string, { def: Record<string, number>; att: Record<string, number> }>;
export function readText(reads: Reads | undefined, driverId: string, role: "def" | "att"): string | null {
  const r = reads?.[driverId]?.[role];
  if (!r) return null;
  const total = Object.values(r).reduce((s, n) => s + n, 0);
  if (!total) return null;
  const [top, n] = Object.entries(r).sort((a, b) => b[1] - a[1])[0];
  const label = role === "def" ? DEFEND_LABEL[top as DefendMove][0].toLowerCase() : ATTACK_LABEL[top as AttackMove][0].toLowerCase();
  return `Seen ${total} time${total > 1 ? "s" : ""}: he tends to ${label} (${n} of ${total}).`;
}

// ───────────── context and situations ─────────────

export interface MCtx {
  lap: number;
  laps: number;
  left: number; // laps to go
  pos: number; // 1-based
  me: string; // driver last name
  opp: string; // the other car's driver
  gap: number; // seconds to the car ahead (calls) / between the two cars (duels)
  behindGap: number;
  flag: "green" | "sc" | "vsc" | "red";
  restart: boolean;
  wear: number;
  tyreLapsLeft: number;
  stopDue: number | null; // laps until the planned stop
  battery: number;
  fuelShort: boolean;
  strikes: number;
  mateBehindFaster: boolean;
  mate: string;
  forLead: boolean;
  forPodium: boolean;
  forPoints: boolean;
  teammateFight: boolean;
}

export type SitKind = "attack" | "defend" | "call";
export interface CallOption {
  id: string;
  label: string;
  hint: string;
  dials?: Partial<Dials>;
  pit?: "box" | "stay";
  letBy?: boolean;
}

interface Sit {
  id: string;
  kind: SitKind;
  w: (c: MCtx) => number;
  title: string[];
  text: string[];
  calls?: CallOption[]; // for calls (the first is the default); duels use the move lists
}

const sits: Sit[] = [];
const sit = (s: Sit) => sits.push(s);

// ── duels: attacking ──
sit({
  id: "att-lead", kind: "attack",
  w: (c) => (c.pos === 2 ? 12 : 0),
  title: ["For the lead", "The lead is right there", "Go for the win"],
  text: ["{gap}s behind {opp} for the lead, {left} laps to go. Into the braking zone: what's the move?", "You're on {opp}'s gearbox for P1. He knows you're coming.", "The leader, {opp}, is within reach. Lap {lap}."],
});
sit({
  id: "att-last", kind: "attack",
  w: (c) => (c.left <= 2 ? 14 : 0),
  title: ["Last chance", "Final laps", "Now or never"],
  text: ["{left} to go and {opp} is {gap}s ahead for P{target}. One more go.", "This is the last real chance at {opp}. P{target} on the line.", "Final laps. {opp} is defending everything."],
});
sit({
  id: "att-podium", kind: "attack",
  w: (c) => (c.forPodium ? 8 : 0),
  title: ["A podium place", "P{target} is there", "Attack for the podium"],
  text: ["{opp} has P{target} and you're {gap}s behind with fresher tyres in your head.", "The podium is one car away: {opp}.", "{gap}s to {opp}. A podium if you get by."],
});
sit({
  id: "att-points", kind: "attack",
  w: (c) => (c.forPoints ? 5 : 0),
  title: ["Points on the line", "Into the top ten", "Attack for P{target}"],
  text: ["P{target} means points. {opp} is {gap}s ahead.", "{opp} is holding you out of the points. Lap {lap}.", "You're right behind {opp}. P{target} is worth it."],
});
sit({
  id: "att-mate", kind: "attack",
  w: (c) => (c.teammateFight ? 6 : 0),
  title: ["Team-mate ahead", "Same team, same piece of track"],
  text: ["{opp}, your team-mate, is {gap}s ahead. The team says race clean.", "You're on your team-mate's tail. The pit wall is watching."],
});
sit({
  id: "att-any", kind: "attack",
  w: () => 2,
  title: ["Within a second", "On his gearbox", "Close enough to try"],
  text: ["{gap}s behind {opp} for P{target}, lap {lap}.", "You've caught {opp}. The braking zone is coming.", "{opp} is defending. {gap}s between you."],
});
// ── duels: defending ──
sit({
  id: "def-lead", kind: "defend",
  w: (c) => (c.pos === 1 ? 12 : 0),
  title: ["Defend the lead", "Leader under attack", "Hold on to P1"],
  text: ["{opp} is {gap}s behind and lining you up for the lead.", "You lead, but {opp} is all over you. Lap {lap}.", "{opp} has the run on you. The lead is at stake."],
});
sit({
  id: "def-last", kind: "defend",
  w: (c) => (c.left <= 2 ? 14 : 0),
  title: ["Hold on", "Final laps", "Bring it home"],
  text: ["{left} to go. {opp} is {gap}s behind for P{pos}.", "Last laps and {opp} is coming. Where do you put the car?", "Defend P{pos} from {opp}, {left} laps left."],
});
sit({
  id: "def-podium", kind: "defend",
  w: (c) => c.pos <= 3 ? 8 : 0,
  title: ["Defend the podium", "P{pos} under threat"],
  text: ["{opp} wants your podium. {gap}s behind.", "The podium is yours if you hold off {opp}."],
});
sit({
  id: "def-any", kind: "defend",
  w: () => 2,
  title: ["Under attack", "He's coming", "Defend"],
  text: ["{opp} is {gap}s behind you into the braking zone.", "{opp} pulls out of the slipstream. P{pos} at stake.", "Mirrors full of {opp}. Lap {lap}."],
});

// ── calls ──
const box: CallOption = { id: "box", label: "Box this lap", hint: "Take the stop now.", pit: "box" };
const stay: CallOption = { id: "stay", label: "Stay out", hint: "Keep track position.", pit: "stay" };
sit({
  id: "sc-box", kind: "call",
  w: (c) => (c.flag === "sc" && c.left > 4 && (c.stopDue === null || c.stopDue > 1) && c.wear > 0.3 ? 14 : 0),
  title: ["Safety car: box?", "Cheap stop", "Safety car deployed"],
  text: ["Safety car. A stop costs half of the usual now. Tyres are {wear}% worn and {left} laps remain.", "The field is bunching up behind the safety car. Box for new tyres, or keep P{pos}?"],
  calls: [box, stay],
});
sit({
  id: "tyres-gone", kind: "call",
  w: (c) => (c.flag === "green" && c.tyreLapsLeft < 4 && c.left > 5 && (c.stopDue === null || c.stopDue > 2) ? 10 : 0),
  title: ["Tyres are going", "The rears are finished", "Grip is falling away"],
  text: ["The tyres have about {tyrelaps} laps left and {left} to go. Box now, or nurse them?", "You're losing time every lap on these tyres. The engineer asks what you want."],
  calls: [box, { id: "nurse", label: "Nurse them", hint: "Tyre care 5, pace 2.", dials: { tyres: 5, pace: 2 } }, { id: "push", label: "Push on", hint: "Ignore it and keep pushing.", dials: { pace: 4 } }],
});
sit({
  id: "undercut", kind: "call",
  w: (c) => (c.flag === "green" && c.gap < 1.8 && c.stopDue !== null && c.stopDue <= 3 && c.stopDue > 0 && c.pos > 1 ? 8 : 0),
  title: ["Undercut?", "Box early to jump him", "The undercut is on"],
  text: ["{opp} is {gap}s ahead and the stop is due in {stopdue} laps. Box now to jump him on fresh tyres?", "The window is open. Go early for the undercut on {opp}, or follow the plan?"],
  calls: [{ id: "plan", label: "Follow the plan", hint: "Stop when planned." }, box, { id: "overcut", label: "Stay longer", hint: "Push on old tyres, try the overcut.", pit: "stay", dials: { pace: 4 } }],
});
sit({
  id: "restart", kind: "call",
  w: (c) => (c.restart && c.flag === "green" ? 9 : 0),
  title: ["Restart", "Green flag coming", "Lights out again"],
  text: ["The restart is this lap. You're P{pos} with {opp} ahead and {behind} behind.", "Restart. How do you go into turn one?"],
  calls: [{ id: "neutral", label: "Clean restart", hint: "No risk." }, { id: "attack", label: "Full attack", hint: "Overtake mode and pace 5.", dials: { ers: "attack", pace: 5 } }, { id: "defend", label: "Cover the inside", hint: "Defend mode.", dials: { ers: "defend" } }],
});
sit({
  id: "fuel-short", kind: "call",
  w: (c) => (c.fuelShort ? 9 : 0),
  title: ["Fuel", "We're short on fuel", "Save fuel"],
  text: ["The engineer: we're short on fuel to the flag. Lean mix or lift and coast?", "Fuel is critical. {left} laps to go."],
  calls: [{ id: "lean", label: "Lean mix", hint: "Slower, saves fuel.", dials: { fuel: "lean" } }, { id: "lift", label: "Lift and coast", hint: "Pace 1 until the numbers work.", dials: { pace: 1, fuel: "lean" } }, { id: "ignore", label: "Ignore it", hint: "Hope for a safety car." }],
});
sit({
  id: "limits", kind: "call",
  w: (c) => (c.strikes === 3 ? 12 : 0),
  title: ["Black-and-white flag", "Last warning", "Track limits"],
  text: ["That's three strikes for track limits: the next one is a penalty.", "Race control has shown you the black-and-white flag."],
  calls: [{ id: "careful", label: "Back off", hint: "Pace 2 for a while.", dials: { pace: 2 } }, { id: "same", label: "Keep pushing", hint: "Risk the penalty." }],
});
sit({
  id: "mate-swap", kind: "call",
  w: (c) => (c.mateBehindFaster ? 7 : 0),
  title: ["Team orders?", "Your team-mate is faster", "Swap the cars?"],
  text: ["{mate} is right behind you and quicker. The pit wall asks: let him through?", "{mate} has better tyres and is stuck behind you."],
  calls: [{ id: "race", label: "Let them race", hint: "No orders." }, { id: "swap", label: "Swap the cars", hint: "You move over this lap.", letBy: true }],
});
sit({
  id: "pressure", kind: "call",
  w: (c) => (c.flag === "green" && c.lap > 4 && c.behindGap < 0.7 && c.left > 3 && c.battery > 0.2 ? 3 : 0),
  title: ["Pressure from behind", "He's all over you"],
  text: ["{behind} has been in your mirrors for laps. Use the battery to defend?", "The car behind is close. The engineer asks about the ERS."],
  calls: [{ id: "ignore", label: "Run your race", hint: "No change." }, { id: "defend", label: "Defend mode", hint: "ERS defend.", dials: { ers: "defend" } }, { id: "push", label: "Push to break the tow", hint: "Pace 4.", dials: { pace: 4 } }],
});

export function chooseSit(c: MCtx, kind: SitKind | "duel", rng: Rng, pen: (id: string) => number): Sit | null {
  const fits = sits.filter((s) => (kind === "duel" ? s.kind !== "call" : s.kind === kind)).map((s) => ({ s, w: s.w(c) * pen(s.id) })).filter((x) => x.w > 0);
  if (!fits.length) return null;
  let r = rng.next() * fits.reduce((a, x) => a + x.w, 0);
  for (const x of fits) if ((r -= x.w) <= 0) return x.s;
  return fits[fits.length - 1].s;
}

export const sitById = (id: string) => sits.find((s) => s.id === id);

export function fill(text: string, c: MCtx, extra: Record<string, string | number> = {}): string {
  const vars: Record<string, string | number> = {
    lap: c.lap,
    left: c.left,
    pos: c.pos,
    me: c.me,
    opp: c.opp,
    gap: c.gap.toFixed(1),
    wear: Math.round(Math.min(1, c.wear) * 100),
    tyrelaps: Math.max(0, Math.floor(c.tyreLapsLeft)),
    stopdue: c.stopDue ?? "-",
    mate: c.mate,
    behind: extra.behind ?? "the car behind",
    target: c.pos,
    ...extra,
  };
  return text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

/** A moment waiting for the player's answer. */
export interface PendingMoment {
  id: string; // `${lap}:${car}:${sit}`
  kind: SitKind;
  sit: string;
  car: number; // the player's car
  vs?: number; // the other car in a duel
  lap: number;
  t: number; // race time to freeze the picture at
  title: string;
  text: string;
  read?: string | null;
  opts: { id: string; label: string; hint: string; disabled?: boolean }[];
}

export interface MomentChoice {
  lap: number;
  car: number;
  sit: string;
  opt: string; // "auto" = instinct (the plain AI path)
}

export interface DuelRecord {
  lap: number;
  att: number;
  def: number;
  attMove: string;
  defMove: string;
  passed: boolean;
  contact: boolean;
  player: number; // the player's car in it
}
