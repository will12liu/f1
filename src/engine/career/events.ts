// The life between race weekends: an event deck (press, engineer, team boss, team-mate, rivals, agent,
// family, fans). Each event is a situation with a weight over the career context and two or three choices
// with effects on fame, trust, morale, money, XP and relationships. Borrowed shape: the NBA game's `EvDef`.
import { hashString, makeRng } from "../rng";
import type { World } from "../types";
import { careerOf, meOf, note, type CareerState } from "./career";

export type Rel = "engineer" | "boss" | "agent" | "mate" | "family" | "press";
export interface Fx {
  fame?: number;
  trust?: number;
  morale?: number;
  cash?: number;
  xp?: number;
  rel?: Partial<Record<Rel, number>>;
  rival?: "add" | "end";
}
export interface EvOption {
  label: string;
  sub: string;
  fx: Fx;
  p?: (c: Ctx) => number; // chance it works (else `miss`)
  miss?: Fx;
  ok?: string;
  bad?: string;
}
export interface Ctx {
  series: string;
  fame: number;
  trust: number;
  morale: number;
  cash: number;
  lastPos: number | null; // last race finish
  lastGrid: number | null;
  lastDnf: boolean;
  beatMate: boolean | null;
  rival: string | null;
  mate: string;
  boss: string;
  engineer: string;
  agentName: string;
  rel: (r: Rel) => number;
  round: number;
  rounds: number;
  age: number;
  deals: number;
}
interface EvDef {
  id: string;
  gap: number; // rounds before it can come again
  w: (c: Ctx) => number;
  title: string;
  text: string;
  opts: EvOption[];
}

const defs: EvDef[] = [];
const ev = (d: EvDef) => defs.push(d);

// ── after a result ──
ev({
  id: "win-press", gap: 3, w: (c) => (c.lastPos === 1 ? 8 : 0),
  title: "Winner's press conference", text: "Microphones everywhere after your win. A journalist asks if you're ready for the next step.",
  opts: [
    { label: "Humble: thank the team", sub: "The team likes it", fx: { trust: 3, fame: 1, rel: { boss: 3, engineer: 2 } } },
    { label: "Confident: \"I'm ready for anything\"", sub: "Headlines, and a few raised eyebrows", fx: { fame: 3, rel: { press: 3, boss: -1 } } },
  ],
});
ev({
  id: "dnf-blame", gap: 4, w: (c) => (c.lastDnf ? 6 : 0),
  title: "A retirement", text: "You didn't see the flag. {engineer} wants to go through what happened before the debrief.",
  opts: [
    { label: "Own it", sub: "Morale takes a hit, the team respects it", fx: { morale: -3, trust: 2, rel: { engineer: 3 } } },
    { label: "Blame the car", sub: "Feel better, team less happy", fx: { morale: 2, trust: -3, rel: { engineer: -4 } } },
    { label: "Say nothing, go to the simulator", sub: "Extra work", fx: { xp: 20, morale: -1 } },
  ],
});
ev({
  id: "beaten-mate", gap: 4, w: (c) => (c.beatMate === false ? 5 : 0),
  title: "{mate} beat you", text: "{mate} finished ahead again. The data shows you lost time in the slow corners.",
  opts: [
    { label: "Study {mate}'s data", sub: "Learn, and swallow your pride", fx: { xp: 30, morale: -2, rel: { mate: 1, engineer: 2 } } },
    { label: "Ask for a different setup direction", sub: "Your engineer may or may not agree", p: (c) => 0.4 + c.rel("engineer") / 200, fx: { xp: 15, rel: { engineer: 2 } }, miss: { rel: { engineer: -3 }, morale: -2 }, ok: "{engineer} agrees. It feels better already.", bad: "{engineer} thinks it's you, not the car." },
  ],
});
ev({
  id: "beat-mate", gap: 4, w: (c) => (c.beatMate === true ? 3 : 0),
  title: "Team-mate tension", text: "{mate} is cold with you after you beat him again. The team asks you to keep it professional.",
  opts: [
    { label: "Offer to share data", sub: "The team loves it", fx: { trust: 3, rel: { mate: 4, boss: 2 } } },
    { label: "Keep your secrets", sub: "Your edge stays yours", fx: { morale: 2, rel: { mate: -3 } } },
  ],
});
ev({
  id: "big-gain", gap: 4, w: (c) => (c.lastPos !== null && c.lastGrid !== null && c.lastGrid - c.lastPos >= 6 ? 6 : 0),
  title: "The overtake everyone's talking about", text: "Your move into the last chicane is all over social media.",
  opts: [
    { label: "Post the onboard", sub: "Fame", fx: { fame: 3, rel: { press: 1 } } },
    { label: "Let it speak for itself", sub: "Calm and cool", fx: { fame: 1, morale: 2 } },
  ],
});
// ── rivals ──
ev({
  id: "rival-words", gap: 5, w: (c) => (c.rival ? 5 : 0),
  title: "{rival} has something to say", text: "In the paddock, {rival} tells reporters you're dangerous in the braking zones.",
  opts: [
    { label: "Fire back", sub: "The rivalry heats up", fx: { fame: 2, morale: 2, rel: { press: 2 } } },
    { label: "Ignore it", sub: "Stay above it", fx: { morale: -1, rel: { boss: 1 } } },
    { label: "Go and talk to {rival}", sub: "Might end it", p: () => 0.5, fx: { rival: "end", morale: 2 }, miss: { morale: -2 }, ok: "You clear the air with {rival}.", bad: "{rival} won't listen." },
  ],
});
// ── team ──
ev({
  id: "boss-meeting", gap: 6, w: (c) => (c.trust < 35 ? 6 : 1),
  title: "{boss} wants a word", text: "{boss} calls you into the motorhome. \"We need more from you.\"",
  opts: [
    { label: "Promise results", sub: "Pressure on", fx: { trust: 3, morale: -2 } },
    { label: "Ask for better equipment", sub: "Could go either way", p: (c) => 0.3 + c.rel("boss") / 200, fx: { trust: 1, morale: 3, rel: { boss: 2 } }, miss: { trust: -4, rel: { boss: -3 } }, ok: "{boss} agrees to look at the car.", bad: "{boss} doesn't like excuses." },
  ],
});
ev({
  id: "sim-day", gap: 3, w: () => 3,
  title: "Simulator day", text: "The factory has a free simulator slot this week.",
  opts: [
    { label: "Take it", sub: "XP, a tired week", fx: { xp: 35, morale: -1, rel: { engineer: 1 } } },
    { label: "Rest", sub: "Recharge", fx: { morale: 4 } },
  ],
});
ev({
  id: "engineer-bond", gap: 6, w: (c) => (c.rel("engineer") > 60 ? 2 : 1),
  title: "Dinner with {engineer}", text: "{engineer} invites you to dinner with the race engineers.",
  opts: [
    { label: "Go", sub: "A better relationship", fx: { rel: { engineer: 4 }, morale: 2 } },
    { label: "Skip it, early night", sub: "Focus", fx: { xp: 10 } },
  ],
});
ev({
  id: "setup-dispute", gap: 5, w: () => 2,
  title: "A setup argument", text: "You want more front wing for the next race. {engineer} disagrees.",
  opts: [
    { label: "Insist", sub: "Your car, your call", p: () => 0.5, fx: { morale: 3, xp: 10 }, miss: { rel: { engineer: -3 }, morale: -2 }, ok: "You were right. The car feels great.", bad: "It didn't work. {engineer} is not impressed." },
    { label: "Trust {engineer}", sub: "Teamwork", fx: { rel: { engineer: 3 }, trust: 1 } },
  ],
});
ev({
  id: "team-event", gap: 6, w: () => 2,
  title: "Factory visit", text: "The team asks you to visit the factory and thank the staff.",
  opts: [
    { label: "Spend the whole day there", sub: "They love it", fx: { trust: 3, rel: { boss: 2, engineer: 2 }, morale: -1 } },
    { label: "A quick visit", sub: "Done", fx: { trust: 1 } },
  ],
});
// ── agent, money, fame ──
ev({
  id: "agent-plan", gap: 8, w: (c) => (c.round > 4 ? 2 : 0),
  title: "{agent} has a plan", text: "Your manager {agent} wants to talk about the next two years.",
  opts: [
    { label: "Push for a bigger team", sub: "Fame, the team hears about it", fx: { fame: 1, trust: -2, rel: { agent: 3 } } },
    { label: "Stay loyal", sub: "The team appreciates it", fx: { trust: 3, rel: { agent: -1, boss: 2 } } },
  ],
});
ev({
  id: "social", gap: 4, w: (c) => (c.fame > 10 ? 3 : 1),
  title: "Social media", text: "A video of you karting as a kid is going viral.",
  opts: [
    { label: "Share it", sub: "Fame", fx: { fame: 2 } },
    { label: "Stay off your phone", sub: "Focus", fx: { morale: 1, xp: 5 } },
  ],
});
ev({
  id: "fan-event", gap: 5, w: (c) => (c.fame > 15 ? 3 : 0),
  title: "Fan event", text: "Hundreds of fans in your colours want autographs. It eats your preparation time.",
  opts: [
    { label: "Sign everything", sub: "Fame, a tired evening", fx: { fame: 2, morale: -1 } },
    { label: "Half an hour, then back to work", sub: "Balance", fx: { fame: 1 } },
  ],
});
ev({
  id: "charity", gap: 10, w: (c) => (c.fame > 20 ? 2 : 0),
  title: "Charity karting race", text: "A charity asks you to drive in their karting event.",
  opts: [
    { label: "Do it and donate", sub: "Good for everyone", fx: { fame: 2, cash: -20_000, morale: 3 } },
    { label: "Politely decline", sub: "Busy schedule", fx: {} },
  ],
});
ev({
  id: "interview", gap: 4, w: (c) => (c.fame > 8 ? 3 : 1),
  title: "Big interview", text: "A magazine wants an in-depth interview. They'll ask about your future.",
  opts: [
    { label: "Open up", sub: "Fame, press likes you", fx: { fame: 2, rel: { press: 3 } } },
    { label: "Say nothing interesting", sub: "Safe", fx: { rel: { press: -1 }, morale: 1 } },
    { label: "Hint you want F1", sub: "Headlines; the team may not like it", fx: { fame: 3, trust: -2 } },
  ],
});
ev({
  id: "money-trouble", gap: 8, w: (c) => (c.cash < 100_000 && c.series !== "F1" ? 4 : 0),
  title: "Money is tight", text: "Your savings are running low. Racing in the juniors is expensive.",
  opts: [
    { label: "Ask {agent} for a personal sponsor", sub: "Might work", p: (c) => 0.35 + c.fame / 100, fx: { cash: 150_000, rel: { agent: 2 } }, miss: { morale: -3 }, ok: "{agent} found a local backer.", bad: "Nobody bit." },
    { label: "Coach karting on weekends off", sub: "Money, less rest", fx: { cash: 40_000, morale: -2 } },
  ],
});
// ── personal ──
ev({
  id: "family", gap: 6, w: () => 2,
  title: "Home", text: "Your family wants you home for a weekend. You haven't seen them in months.",
  opts: [
    { label: "Go home", sub: "Recharge", fx: { morale: 5, rel: { family: 4 } } },
    { label: "Stay and train", sub: "XP", fx: { xp: 25, rel: { family: -3 } } },
  ],
});
ev({
  id: "fitness", gap: 5, w: () => 2,
  title: "Fitness camp", text: "Your trainer wants a week of altitude training.",
  opts: [
    { label: "Do it", sub: "Fitness and XP", fx: { xp: 25, morale: -1 } },
    { label: "Normal week", sub: "Rest", fx: { morale: 1 } },
  ],
});
ev({
  id: "nerves", gap: 6, w: (c) => (c.morale < 40 ? 5 : 0),
  title: "Doubts", text: "You can't sleep before races. It's getting into your head.",
  opts: [
    { label: "Talk to a sports psychologist", sub: "Costs money, helps", fx: { cash: -15_000, morale: 8 } },
    { label: "Push through", sub: "Might pass", p: () => 0.5, fx: { morale: 4 }, miss: { morale: -3 }, ok: "It passes.", bad: "It gets worse." },
  ],
});
ev({
  id: "mentor", gap: 12, w: (c) => (c.age < 21 ? 2 : 0),
  title: "A former champion calls", text: "A retired champion offers to coach you for a few weekends.",
  opts: [
    { label: "Yes, absolutely", sub: "XP and morale", fx: { xp: 40, morale: 3 } },
    { label: "Not now", sub: "Stay focused", fx: {} },
  ],
});
ev({
  id: "rumour", gap: 6, w: (c) => (c.fame > 12 ? 2 : 0),
  title: "Paddock rumour", text: "A rumour says another team wants you next year. {boss} has heard it too.",
  opts: [
    { label: "Deny it", sub: "Keep the team happy", fx: { trust: 2 } },
    { label: "\"I'm focused on now\"", sub: "Keeps your options open", fx: { fame: 1, trust: -1, rel: { agent: 2 } } },
  ],
});

/** Draw an event for this weekend (or none): about one weekend in three. */
export function drawEvent(w: World): void {
  const c = careerOf(w);
  const d = meOf(w);
  if (!c || !d || c.event) return;
  const rng = makeRng(hashString(`${w.seed}:life:${w.season}:${w.results.length}`));
  if (!rng.chance(0.4)) return;
  const x = ctxOf(w, c);
  const last = c.lastEvents ?? {};
  const fits = defs.map((e) => ({ e, wt: (w.season * 100 + x.round) - (last[e.id] ?? -999) > e.gap ? e.w(x) : 0 })).filter((f) => f.wt > 0);
  if (!fits.length) return;
  let r = rng.next() * fits.reduce((s, f) => s + f.wt, 0);
  const pick = fits.find((f) => (r -= f.wt) <= 0) ?? fits[fits.length - 1];
  (c.lastEvents ??= {})[pick.e.id] = w.season * 100 + x.round;
  c.event = { id: pick.e.id, title: fillText(pick.e.title, x), text: fillText(pick.e.text, x), opts: pick.e.opts.map((o) => ({ label: fillText(o.label, x), sub: o.sub })) };
}

export function answerEvent(w: World, i: number): { ok: boolean; msg: string } {
  const c = careerOf(w);
  if (!c?.event) return { ok: false, msg: "" };
  const def = defs.find((e) => e.id === c.event!.id);
  const o = def?.opts[i];
  if (!def || !o) return { ok: false, msg: "" };
  const x = ctxOf(w, c);
  const rng = makeRng(hashString(`${w.seed}:life:${w.season}:${w.results.length}:${def.id}:${i}`));
  const works = o.p ? rng.chance(o.p(x)) : true;
  apply(c, works ? o.fx : (o.miss ?? {}));
  const msg = works ? (o.ok ? fillText(o.ok, x) : "Done.") : fillText(o.bad ?? "It didn't work out.", x);
  note(w, c, "Life", c.event.title, `${o.label}. ${msg}`);
  c.event = undefined;
  return { ok: works, msg };
}

function apply(c: CareerState, fx: Fx) {
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  if (fx.fame) c.fame = clamp(c.fame + fx.fame);
  if (fx.trust) c.trust = clamp(c.trust + fx.trust);
  if (fx.morale) c.morale = clamp((c.morale ?? 60) + fx.morale);
  if (fx.cash) c.cash += fx.cash;
  if (fx.xp) {
    c.xp += fx.xp;
    while (c.xp >= 100) {
      c.xp -= 100;
      c.points++;
    }
  }
  for (const [k, v] of Object.entries(fx.rel ?? {})) (c.rel ??= {})[k] = clamp((c.rel[k] ?? 50) + (v ?? 0));
  if (fx.rival === "end") c.rival = undefined;
}

function ctxOf(w: World, c: CareerState): Ctx {
  const d = meOf(w)!;
  const last = c.log[c.log.length - 1];
  const recent = last && last.season === w.season && last.round >= w.results.length - 1 ? last : null;
  const mate = w.drivers.find((x) => x.teamId === d.teamId && x.id !== d.id);
  const team = w.teams.find((t) => t.id === d.teamId);
  const rival = c.rival ? w.drivers.find((x) => x.id === c.rival) : null;
  const r = makeRng(hashString(`people:${c.driverId}`));
  const names = ["Marco", "Sarah", "Tom", "Elena", "James", "Yuki", "Pierre", "Hannah", "Diego", "Anna"];
  return {
    series: d.series,
    fame: c.fame,
    trust: c.trust,
    morale: c.morale ?? 60,
    cash: c.cash,
    lastPos: recent && (recent.status === "Finished" || recent.status === "Lapped") ? recent.pos : null,
    lastGrid: recent ? recent.grid : null,
    lastDnf: !!recent && recent.status !== "Finished" && recent.status !== "Lapped",
    beatMate: recent ? (c.lastBeatMate ?? null) : null,
    rival: rival ? `${rival.first} ${rival.last}` : null,
    mate: mate ? `${mate.first} ${mate.last}` : "your team-mate",
    boss: team ? `the ${team.name} boss` : "the team boss",
    engineer: names[r.int(0, 9)],
    agentName: names[(r.int(0, 9) + 3) % 10],
    rel: (k) => c.rel?.[k] ?? 50,
    round: w.results.length,
    rounds: w.calendar.length,
    age: w.season - d.born,
    deals: c.deals.length,
  };
}

function fillText(t: string, x: Ctx) {
  return t.replace(/\{(\w+)\}/g, (_, k) => {
    if (k === "agent") return x.agentName;
    const v = (x as unknown as Record<string, unknown>)[k];
    return typeof v === "string" || typeof v === "number" ? String(v) : "";
  });
}

export const EVENT_COUNT = () => defs.length;
