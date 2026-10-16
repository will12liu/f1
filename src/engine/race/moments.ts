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
// Option ids are stable: saved races replay the answer by id. A no-effect option is labelled "No change"
// or "Stay on the plan". Fuel mix is set by the car (race.ts), so fuel-short stays at weight 0.
sit({
  id: "sc-box", kind: "call",
  w: (c) => (c.flag === "sc" && c.left > 4 && (c.stopDue === null || c.stopDue > 1) && c.wear > 0.3 ? 14 : 0),
  title: ["Safety car: box?", "Cheap stop", "Safety car deployed", "Box, box?", "Window is open", "Safety car, your call"],
  text: [
    "Safety car. A stop costs about half the usual. Tyres are {wear}% worn, {left} laps left. Box or stay out?",
    "Field is bunching up. We are P{pos}. New tyres now, or keep the place?",
    "{left} to go and the safety car is out. These tyres are {wear}% gone. It's a cheap stop if you want it.",
    "Safety car, {me}. Pit loss is small. Do you want the new set this lap?",
    "They're packing up behind the safety car. Box for tyres, or we hold P{pos}?",
    "Copy the safety car. Stop is cheap. Tyres won't see the flag like this. Your call.",
  ],
  calls: [
    { id: "box", label: "Box this lap", hint: "Pit this lap: a cheap stop under the safety car, new tyres, you lose track position.", pit: "box" },
    { id: "stay", label: "Stay out", hint: "Stay out: you keep the place and these tyres. The stop is refused even if it was due.", pit: "stay" },
  ],
});
sit({
  id: "tyres-gone", kind: "call",
  w: (c) => (c.flag === "green" && c.tyreLapsLeft < 4 && c.left > 5 && (c.stopDue === null || c.stopDue > 2) ? 10 : 0),
  title: ["Tyres are going", "The rears are finished", "Grip is falling away", "We are losing the tyres", "Cliff is close", "Tyres, your call"],
  text: [
    "Tyres have about {tyrelaps} laps in them and {left} to go. Box, or nurse them?",
    "You're losing time every lap. {wear}% worn. We can box, save them, or keep pushing.",
    "Grip is going, {me}. About {tyrelaps} laps left in this set. What do you want?",
    "The rears are finished for a long run. {left} laps still on the board. Box now?",
    "Degradation is high. We can pit this lap, look after them, or send it.",
    "These won't last at this pace. {tyrelaps} laps, then they're done. Call it.",
  ],
  calls: [
    { id: "box", label: "Box this lap", hint: "Pit this lap for a new set. You give up the place and get the grip back.", pit: "box" },
    { id: "nurse", label: "Nurse them", hint: "Tyre care 5, pace 2: slower, the tyres last longer. A needle game sets how well you save them.", dials: { tyres: 5, pace: 2 } },
    { id: "push", label: "Push on", hint: "Pace 4, tyre care 1: faster now, the tyres fall off quicker.", dials: { pace: 4, tyres: 1 } },
  ],
});
sit({
  id: "undercut", kind: "call",
  w: (c) => (c.flag === "green" && c.gap < 1.8 && c.stopDue !== null && c.stopDue <= 3 && c.stopDue > 0 && c.pos > 1 ? 8 : 0),
  title: ["Undercut?", "Box early to jump him", "The undercut is on", "Stop this lap?", "Window on {opp}", "We can go early"],
  text: [
    "{opp} is {gap}s ahead. The stop is due in {stopdue} laps. Box now and try the undercut?",
    "Window is open on {opp}. Go early, stay on the plan, or go long and push?",
    "He's {gap}s up the road. If we box this lap we undercut him. Plan says {stopdue}.",
    "{me}, {opp} is in range and our stop is close. In this lap, or as planned?",
    "Undercut looks on. {gap}s to {opp}, stop due in {stopdue}. Your call.",
    "We can jump {opp} if we pit now. Or we follow the plan and stop in {stopdue}.",
  ],
  calls: [
    { id: "plan", label: "Stay on the plan", hint: "No change: you stop when the plan says, not this lap." },
    { id: "box", label: "Box for the undercut", hint: "Pit this lap: you stop early and try to jump the car ahead on fresh tyres.", pit: "box" },
    { id: "overcut", label: "Stay out and push", hint: "Stay out, pace 4, tyre care 2: you go longer on these tyres and try the overcut. The tyres wear faster.", pit: "stay", dials: { pace: 4, tyres: 2 } },
  ],
});
sit({
  id: "restart", kind: "call",
  w: (c) => (c.restart && c.flag === "green" ? 9 : 0),
  title: ["Restart", "Green flag coming", "Lights out again", "Restart this lap", "Get ready", "Green in this sector"],
  text: [
    "Restart is this lap. P{pos}, {opp} ahead, {behind} behind. How do you want it?",
    "Green flag coming. Turn one: attack, defend, or a clean restart?",
    "Lights are about to go. You are P{pos}. {opp} in front, {behind} in the mirrors.",
    "{me}, restart. We can send the battery forward, cover the inside, or leave it.",
    "Restart in this lap. You choose the mode into turn one.",
    "Restart, P{pos}. {left} laps after this. Tell me attack, defend, or no change.",
  ],
  calls: [
    { id: "neutral", label: "No change", hint: "No change: you keep your dials as they are. The getaway bar still decides your start." },
    { id: "attack", label: "Full attack", hint: "Pace 5, ERS attack: quicker off the restart and stronger in a pass. Tyres and battery go quicker.", dials: { ers: "attack", pace: 5 } },
    { id: "defend", label: "Cover the inside", hint: "ERS defend: you spend battery to hold the inside. No extra pace.", dials: { ers: "defend" } },
  ],
});
sit({
  id: "fuel-short", kind: "call",
  w: () => 0, // fuel runs on auto now (race.ts): kept so old saved answers still read
  title: ["Fuel", "We're short on fuel", "Save fuel", "Fuel to the flag", "Numbers are tight", "We need to save"],
  text: [
    "We're short on fuel to the flag. Lean mix, lift and coast, or leave it?",
    "Fuel is critical. {left} laps to go. We have to save or we are hoping for a safety car.",
    "{me}, the tank does not make it at this pace. Lift, or a small save?",
    "Target lap is plus fuel. {left} to go. Lean, a big lift, or no change.",
    "We will not make the flag like this. Tell me how hard you want to save.",
    "Fuel warning. {left} laps. I can lean it, or you lift and coast.",
  ],
  calls: [
    { id: "lean", label: "Lean mix", hint: "Pace 2, engine low, lean mix: slower, you burn less. The car may put the mix back to standard.", dials: { pace: 2, engine: "low", fuel: "lean" } },
    { id: "lift", label: "Lift and coast", hint: "Pace 1, engine low, lean mix: a big lift. You save the most fuel and lose the most time.", dials: { pace: 1, engine: "low", fuel: "lean" } },
    { id: "ignore", label: "No change", hint: "No change: you stay on this pace and hope for a safety car." },
  ],
});
sit({
  id: "limits", kind: "call",
  w: (c) => (c.strikes === 3 ? 12 : 0),
  title: ["Black-and-white flag", "Last warning", "Track limits", "Next one is a penalty", "Race control", "Ease off the kerbs"],
  text: [
    "Three strikes for track limits. The next one is a penalty. Back off, or keep pushing?",
    "Race control has the black and white flag out. We need a margin, or you stay committed.",
    "{me}, that's the warning. One more and they give you time. Your call.",
    "Track limits, lap {lap}. They've seen you. Leave the white line, or keep sending it.",
    "Black and white, P{pos}. I recommend pace down. You can ignore it.",
    "Last warning. {left} laps left. Don't give them the excuse, unless you want the time.",
  ],
  calls: [
    { id: "careful", label: "Back off", hint: "Pace 2, tyre care 4: slower, you leave a margin at the white line.", dials: { pace: 2, tyres: 4 } },
    { id: "same", label: "Keep pushing", hint: "Pace 4, engine high: you stay on the limit. Faster, and the next strike is still a penalty.", dials: { pace: 4, engine: "high" } },
  ],
});
sit({
  id: "mate-swap", kind: "call",
  w: (c) => (c.mateBehindFaster ? 7 : 0),
  title: ["Team orders?", "Your team-mate is faster", "Swap the cars?", "{mate} is stuck", "Let him through?", "Pit wall"],
  text: [
    "{mate} is right behind you and quicker. Let him through, or no order?",
    "{mate} has better tyres and is stuck behind you. Swap, or you keep racing.",
    "Pit wall, {me}. {mate} is faster in your mirrors. We can swap the cars this lap.",
    "He's lost time behind you. Team wants to know: move over for {mate}, or race on?",
    "{mate} is the quicker car right now. One lap, you let him by, or we leave it.",
    "Orders are available. {mate} behind, you are P{pos}. Swap or no change.",
  ],
  calls: [
    { id: "race", label: "No change", hint: "No change: no team order. You keep the place and race." },
    { id: "swap", label: "Let him through", hint: "Team order: you move over this lap and let your team-mate through.", letBy: true },
  ],
});
sit({
  id: "pressure", kind: "call",
  w: (c) => (c.flag === "green" && c.lap > 4 && c.behindGap < 0.7 && c.left > 3 && c.battery > 0.2 ? 3 : 0),
  title: ["Pressure from behind", "He's all over you", "{behind} in the mirrors", "Break the tow?", "Close behind", "Defend or go"],
  text: [
    "{behind} has been in your mirrors. Defend with the battery, push to break the tow, or no change?",
    "The car behind is close, under a second. ERS: defend, attack, or leave it balanced?",
    "{me}, {behind} is under a second back. We can spend the battery to hold him, or try to pull away.",
    "Tow is strong. P{pos}, {behind} right there. Push now or cover the position?",
    "He's been with you for laps. I can give you overtake mode or defend mode.",
    "{behind} is all over the gearbox. {left} laps left. What do you want from the battery?",
  ],
  calls: [
    { id: "ignore", label: "No change", hint: "No change: you do not defend and you do not push." },
    { id: "defend", label: "Defend mode", hint: "ERS defend: harder to pass, the battery drops.", dials: { ers: "defend" } },
    { id: "push", label: "Push to break the tow", hint: "Pace 4, ERS attack: you try to pull out of the tow. Tyres and battery go quicker.", dials: { pace: 4, ers: "attack" } },
  ],
});
sit({
  id: "battery-low", kind: "call",
  w: (c) => (c.flag === "green" && !c.restart && c.battery < 0.25 && c.left > 3 && c.lap > 3 ? 6 : 0),
  title: ["Battery is low", "Charge it", "ERS is empty", "Harvest now?", "Don't spend it", "Battery, {me}"],
  text: [
    "Battery is nearly empty with {left} laps to go. Harvest now, or keep deploying?",
    "{me}, we have almost nothing in the battery. A long straight is coming. Charge, or stay on it?",
    "ERS is flat. If we harvest you are slower this lap and full for the next fight.",
    "Charge is under a quarter. I want harvest. You can keep attack mode if you need the lap.",
    "We cannot defend and we cannot pass like this. Harvest, or leave the mode as it is?",
    "Battery warning, lap {lap}. Lift the deployment and fill it, or keep using what's left.",
  ],
  calls: [
    { id: "harvest", label: "Harvest now", hint: "ERS harvest, pace 2: slower now, the battery fills.", dials: { ers: "harvest", pace: 2 } },
    { id: "deploy", label: "Keep deploying", hint: "ERS attack: you keep spending it. Quicker until the battery is empty.", dials: { ers: "attack" } },
  ],
});
sit({
  id: "gap-behind", kind: "call",
  w: (c) => (c.flag === "green" && !c.restart && c.pos > 1 && c.behindGap > 4 && c.left > 8 && c.gap > 2 ? 5 : 0),
  title: ["Gap behind", "Free air", "Nothing behind", "We can save", "Comfortable", "Manage this stint"],
  text: [
    "More than four seconds behind, and {left} laps still to run. Save the tyres, or push for the fastest lap?",
    "{me}, the car behind is gone. We can look after the engine, or you send it.",
    "Clear air, P{pos}. No one in the mirrors. Cruise and save, or chase the lap?",
    "Gap is safe. {left} to go. I recommend tyre care and engine low. Or pace up for the fastest.",
    "Nobody threatening. We can bank the tyres for later, or push while the air is clean.",
    "Comfortable. {opp} is {gap}s up the road, nothing close behind. Save or attack the stint?",
  ],
  calls: [
    { id: "save", label: "Save the tyres", hint: "Tyre care 5, pace 2, engine low: slower, the tyres and the power unit last longer.", dials: { tyres: 5, pace: 2, engine: "low" } },
    { id: "flyer", label: "Push for the fastest lap", hint: "Pace 5, engine high, ERS attack: a fast lap now. Tyres, battery and the engine all pay for it.", dials: { pace: 5, engine: "high", ers: "attack" } },
  ],
});
sit({
  id: "closing", kind: "call",
  w: (c) => (c.flag === "green" && !c.restart && c.pos > 1 && c.gap >= 1 && c.gap <= 2 && c.left > 3 ? 6 : 0),
  title: ["Closing on {opp}", "Not in the DRS yet", "We are catching him", "Two seconds", "Bring him in", "Patient or push"],
  text: [
    "{opp} is {gap}s ahead. Not close enough for DRS. Push to close it, or stay patient?",
    "We are closing, slowly. {gap}s to {opp}. I can give you pace 4, or we wait for the tyres.",
    "{me}, he's {gap}s up the road. A push now gets you to the DRS. It costs the rears.",
    "Gap is coming down, still over a second. Attack the gap, or hold this pace?",
    "P{pos}, {opp} ahead by {gap}s. Not a fight yet. Your call on the pace.",
    "We can be on him if you push. Or we leave the plan and wait. {left} laps left.",
  ],
  calls: [
    { id: "patient", label: "Stay patient", hint: "No change: you keep this pace and wait for the gap to come.", },
    { id: "push-gap", label: "Push to catch him", hint: "Pace 4, ERS attack: faster for the chase. Tyres and battery go quicker.", dials: { pace: 4, ers: "attack" } },
  ],
});
sit({
  id: "points-home", kind: "call",
  w: (c) => (c.flag === "green" && !c.restart && c.forPoints && c.pos <= 10 && c.left <= 5 && c.left > 1 ? 8 : 0),
  title: ["Bring it home", "Points place", "Five laps left", "Don't throw it away", "P{pos} to the flag", "Hold the points"],
  text: [
    "{left} laps left and you are P{pos}, in the points. Bring it home, or attack?",
    "The flag is close. P{pos} is points. I want engine low and a safe pace. You can still push.",
    "{me}, {left} to go. Nothing silly. Cruise it home, or go after {opp}?",
    "We are in the points. {gap}s to the car ahead. Manage, or spend the battery?",
    "Last part of the race. P{pos}. Bring the car home, or attack for one more place.",
    "Don't give this away. {left} laps. Safe mode, or pace 4 and overtake mode.",
  ],
  calls: [
    { id: "home", label: "Bring it home", hint: "Pace 2, engine low, tyre care 4: slower, you protect the car and the tyres.", dials: { pace: 2, engine: "low", tyres: 4 } },
    { id: "attack-pts", label: "Attack", hint: "Pace 4, ERS attack: you go for the place ahead. More tyre wear, more battery used.", dials: { pace: 4, ers: "attack" } },
  ],
});
sit({
  id: "manage-lead", kind: "call",
  w: (c) => (c.flag === "green" && !c.restart && c.pos === 1 && c.behindGap > 1.5 && c.left > 3 ? 7 : 0),
  title: ["You lead", "Manage the lead", "P1, gap behind", "Control the race", "Don't overdrive", "Leader's choice"],
  text: [
    "You lead, and there is a gap behind. Engine low and manage it, or keep pushing?",
    "P1, {me}. The car behind is not in your mirrors. We can save the power unit.",
    "{left} laps left in the lead. I recommend we manage. You can stay flat out.",
    "Gap is there. No need to stress the engine unless you want the fastest lap.",
    "Control pace from the front. Engine low, or pace 4 and keep the hammer down.",
    "Leading. {behind} is the first car behind. Manage the gap, or push away.",
  ],
  calls: [
    { id: "manage", label: "Manage it", hint: "Engine low, pace 2, tyre care 4: slower, less engine risk, the tyres last.", dials: { engine: "low", pace: 2, tyres: 4 } },
    { id: "push-lead", label: "Keep pushing", hint: "Pace 4, engine high: you keep pulling away. More wear and more engine risk.", dials: { pace: 4, engine: "high" } },
  ],
});
sit({
  id: "engine-hot", kind: "call",
  w: (c) => (c.flag === "green" && !c.restart && c.lap > 10 && c.left > 4 ? 2 : 0),
  title: ["Engine temperatures", "Power unit is warm", "Turn it down", "Temps", "Cool the engine", "Engine, {me}"],
  text: [
    "Engine temperatures are up, lap {lap}. Engine low for the stint, or leave it?",
    "{me}, the power unit is warm. I want mode low. You can ignore it.",
    "Temps are climbing with {left} laps still to run. Turn it down, or stay as we are?",
    "We are asking a lot of the engine. Low mode costs a bit of lap time and saves it.",
    "Engine warning, not critical. Drop the mode, or keep this one.",
    "Power unit would like a breather. {left} to go. Your call.",
  ],
  calls: [
    { id: "cool", label: "Engine low", hint: "Engine low, pace 3: a little slower, much less chance of a mechanical.", dials: { engine: "low", pace: 3 } },
    { id: "ignore-temp", label: "No change", hint: "No change: you leave the engine where it is." },
  ],
});
sit({
  id: "mate-race", kind: "call",
  w: (c) => (c.flag === "green" && !c.restart && c.mate !== "" && (c.teammateFight || c.opp === c.mate) && c.gap < 2 && c.gap > 0.2 && !c.mateBehindFaster ? 6 : 0),
  title: ["Team-mate ahead", "Race {mate}?", "Same team", "Hold station?", "Your team-mate", "{mate} is ahead"],
  text: [
    "{mate} is {gap}s ahead, same team. Race him, or hold station?",
    "You are on your team-mate. {gap}s to {mate}. The wall will accept either call.",
    "{me}, that's {mate} in front. Push and race, or pace 2 and hold station.",
    "No order yet. {mate} is {gap}s up the road. Do you want to race him?",
    "Team-mate, P{pos} behind him. We can attack, or we tuck in and save the tyres.",
    "{mate}, {gap}s. Race or hold. Tell me.",
  ],
  calls: [
    { id: "race-him", label: "Race him", hint: "Pace 4, ERS attack: you attack your team-mate. More tyre wear, battery down.", dials: { pace: 4, ers: "attack" } },
    { id: "station", label: "Hold station", hint: "Pace 2, tyre care 4, ERS balanced: you stop attacking and look after the tyres.", dials: { pace: 2, tyres: 4, ers: "balanced" } },
  ],
});
sit({
  id: "vsc-box", kind: "call",
  w: (c) => (c.flag === "vsc" && c.left > 4 && c.wear > 0.35 && (c.stopDue === null || c.stopDue > 1) ? 11 : 0),
  title: ["Virtual safety car", "VSC: box?", "Cheap stop, VSC", "Virtual, your call", "VSC window", "Pit or stay"],
  text: [
    "Virtual safety car. The stop is cheaper. Tyres are {wear}% worn. Box, or stay out?",
    "VSC. We are P{pos}. A stop now loses less than a normal stop. Want it?",
    "{left} laps left, VSC on the board. New tyres, or keep the track position?",
    "{me}, virtual safety car. Pit loss is down. These tyres are {wear}% gone.",
    "Window under the VSC. Box this lap, or we hold P{pos} and stay out.",
    "They're all slowing. We can pit for a cheap set, or keep this one.",
  ],
  calls: [
    { id: "box", label: "Box this lap", hint: "Pit this lap: a cheaper stop under the virtual safety car, new tyres, you lose places.", pit: "box" },
    { id: "stay", label: "Stay out", hint: "Stay out: you keep the place. The stop is refused even if it was due.", pit: "stay" },
  ],
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
  q?: number; // how well the player executed it (0-1, from the braking mini-game); none = an average job
}

/** A duel answer that was executed through the mini-game: log-odds and contact multiplier from the score. */
export const EXEC = { edge: 2.2, mid: 0.55, contactLo: 0.6, contactHi: 1.3 };
export const execEdge = (q: number | undefined) => (q === undefined ? 0 : EXEC.edge * (Math.max(0, Math.min(1, q)) - EXEC.mid));
export const execContact = (q: number | undefined) => (q === undefined ? 1 : EXEC.contactHi - (EXEC.contactHi - EXEC.contactLo) * Math.max(0, Math.min(1, q)));

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
