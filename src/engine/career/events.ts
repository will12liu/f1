// The life between race weekends: an event deck (press, engineer, team boss, team-mate, rivals, agent,
// family, fans). Each event is a situation with a weight over the career context and two or three choices
// with effects on fame, trust, morale, money, XP and relationships. Borrowed shape: the NBA game's `EvDef`.
import { hashString, makeRng } from "../rng";
import type { World } from "../types";
import { careerOf, meOf, note, type CareerState } from "./career";
import { lifeLogEvent } from "./life";

export type Rel = "engineer" | "boss" | "agent" | "mate" | "family" | "press" | "partner" | "friend";
export interface Fx {
  fame?: number;
  trust?: number;
  morale?: number;
  cash?: number;
  xp?: number;
  rel?: Partial<Record<Rel, number>>;
  rival?: "add" | "end";
  rentVal?: number; // fraction lost from the rented home's value
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
  partner: string | null;
  sibling: string;
  friend: string | null;
  rental: string | null;
}
interface EvDef {
  id: string;
  gap: number; // rounds before it can come again
  from?: string; // who texts it (the phone's Messages)
  w: (c: Ctx) => number;
  title: string;
  text: string;
  opts: EvOption[];
}

const defs: EvDef[] = [];
const ev = (d: EvDef) => defs.push(d);

// ── after a result ──
ev({
  id: "win-press", from: "Press officer", gap: 3, w: (c) => (c.lastPos === 1 ? 8 : 0),
  title: "Winner's press conference", text: "Winner's presser in ten minutes. They'll ask if you're ready for the next step. How do you want to play it?",
  opts: [
    { label: "Humble: thank the team", sub: "The team likes it", fx: { trust: 3, fame: 1, rel: { boss: 3, engineer: 2 } } },
    { label: "Confident: \"I'm ready for anything\"", sub: "Headlines, and a few raised eyebrows", fx: { fame: 3, rel: { press: 3, boss: -1 } } },
  ],
});
ev({
  id: "dnf-blame", from: "{engineer}", gap: 4, w: (c) => (c.lastDnf ? 6 : 0),
  title: "A retirement", text: "Tough one. Before the debrief I need to hear what happened out there.",
  opts: [
    { label: "Own it", sub: "Morale takes a hit, the team respects it", fx: { morale: -3, trust: 2, rel: { engineer: 3 } } },
    { label: "Blame the car", sub: "Feel better, team less happy", fx: { morale: 2, trust: -3, rel: { engineer: -4 } } },
    { label: "Say nothing, go to the simulator", sub: "Extra work", fx: { xp: 20, morale: -1 } },
  ],
});
ev({
  id: "beaten-mate", from: "{engineer}", gap: 4, w: (c) => (c.beatMate === false ? 5 : 0),
  title: "{mate} beat you", text: "{mate} was ahead again. The data says you're losing it in the slow corners. Want to go through it?",
  opts: [
    { label: "Study {mate}'s data", sub: "Learn, and swallow your pride", fx: { xp: 30, morale: -2, rel: { mate: 1, engineer: 2 } } },
    { label: "Ask for a different setup direction", sub: "Your engineer may or may not agree", p: (c) => 0.4 + c.rel("engineer") / 200, fx: { xp: 15, rel: { engineer: 2 } }, miss: { rel: { engineer: -3 }, morale: -2 }, ok: "{engineer} agrees. It feels better already.", bad: "{engineer} thinks it's you, not the car." },
  ],
});
ev({
  id: "beat-mate", from: "{boss}", gap: 4, w: (c) => (c.beatMate === true ? 3 : 0),
  title: "Team-mate tension", text: "{mate} isn't happy after today. Keep it professional this week, okay?",
  opts: [
    { label: "Offer to share data", sub: "The team loves it", fx: { trust: 3, rel: { mate: 4, boss: 2 } } },
    { label: "Keep your secrets", sub: "Your edge stays yours", fx: { morale: 2, rel: { mate: -3 } } },
  ],
});
ev({
  id: "big-gain", from: "Media team", gap: 4, w: (c) => (c.lastPos !== null && c.lastGrid !== null && c.lastGrid - c.lastPos >= 6 ? 6 : 0),
  title: "The overtake everyone's talking about", text: "Your move into the last chicane is everywhere. Two million views and climbing. Post the onboard?",
  opts: [
    { label: "Post the onboard", sub: "Fame", fx: { fame: 3, rel: { press: 1 } } },
    { label: "Let it speak for itself", sub: "Calm and cool", fx: { fame: 1, morale: 2 } },
  ],
});
// ── rivals ──
ev({
  id: "rival-words", from: "Press officer", gap: 5, w: (c) => (c.rival ? 5 : 0),
  title: "{rival} has something to say", text: "Heads up: {rival} just told reporters you're dangerous in the braking zones. They want a reaction.",
  opts: [
    { label: "Fire back", sub: "The rivalry heats up", fx: { fame: 2, morale: 2, rel: { press: 2 } } },
    { label: "Ignore it", sub: "Stay above it", fx: { morale: -1, rel: { boss: 1 } } },
    { label: "Go and talk to {rival}", sub: "Might end it", p: () => 0.5, fx: { rival: "end", morale: 2 }, miss: { morale: -2 }, ok: "You clear the air with {rival}.", bad: "{rival} won't listen." },
  ],
});
// ── team ──
ev({
  id: "boss-meeting", from: "{boss}", gap: 6, w: (c) => (c.trust < 35 ? 6 : 1),
  title: "{boss} wants a word", text: "Motorhome, after the briefing. We need more from you.",
  opts: [
    { label: "Promise results", sub: "Pressure on", fx: { trust: 3, morale: -2 } },
    { label: "Ask for better equipment", sub: "Could go either way", p: (c) => 0.3 + c.rel("boss") / 200, fx: { trust: 1, morale: 3, rel: { boss: 2 } }, miss: { trust: -4, rel: { boss: -3 } }, ok: "{boss} agrees to look at the car.", bad: "{boss} doesn't like excuses." },
  ],
});
ev({
  id: "sim-day", from: "{engineer}", gap: 3, w: () => 3,
  title: "Simulator day", text: "There's a free simulator slot at the factory this week. Want it?",
  opts: [
    { label: "Take it", sub: "XP, a tired week", fx: { xp: 35, morale: -1, rel: { engineer: 1 } } },
    { label: "Rest", sub: "Recharge", fx: { morale: 4 } },
  ],
});
ev({
  id: "engineer-bond", from: "{engineer}", gap: 6, w: (c) => (c.rel("engineer") > 60 ? 2 : 1),
  title: "Dinner with {engineer}", text: "A few of us are getting dinner tonight. You in?",
  opts: [
    { label: "Go", sub: "A better relationship", fx: { rel: { engineer: 4 }, morale: 2 } },
    { label: "Skip it, early night", sub: "Focus", fx: { xp: 10 } },
  ],
});
ev({
  id: "setup-dispute", from: "{engineer}", gap: 5, w: () => 2,
  title: "A setup argument", text: "Saw your note about more front wing. I don't agree: it'll eat the rears.",
  opts: [
    { label: "Insist", sub: "Your car, your call", p: () => 0.5, fx: { morale: 3, xp: 10 }, miss: { rel: { engineer: -3 }, morale: -2 }, ok: "You were right. The car feels great.", bad: "It didn't work. {engineer} is not impressed." },
    { label: "Trust {engineer}", sub: "Teamwork", fx: { rel: { engineer: 3 }, trust: 1 } },
  ],
});
ev({
  id: "team-event", from: "{boss}", gap: 6, w: () => 2,
  title: "Factory visit", text: "The factory staff would love to see you this week. Can you come by and say thanks?",
  opts: [
    { label: "Spend the whole day there", sub: "They love it", fx: { trust: 3, rel: { boss: 2, engineer: 2 }, morale: -1 } },
    { label: "A quick visit", sub: "Done", fx: { trust: 1 } },
  ],
});
// ── agent, money, fame ──
ev({
  id: "agent-plan", from: "{agent}", gap: 8, w: (c) => (c.round > 4 ? 2 : 0),
  title: "{agent} has a plan", text: "We need to talk about the next two years. Call me when you're out of the car.",
  opts: [
    { label: "Push for a bigger team", sub: "Fame, the team hears about it", fx: { fame: 1, trust: -2, rel: { agent: 3 } } },
    { label: "Stay loyal", sub: "The team appreciates it", fx: { trust: 3, rel: { agent: -1, boss: 2 } } },
  ],
});
ev({
  id: "social", from: "Media team", gap: 4, w: (c) => (c.fame > 10 ? 3 : 1),
  title: "Social media", text: "Someone dug up a video of you karting at nine. It's going viral.",
  opts: [
    { label: "Share it", sub: "Fame", fx: { fame: 2 } },
    { label: "Stay off your phone", sub: "Focus", fx: { morale: 1, xp: 5 } },
  ],
});
ev({
  id: "fan-event", from: "Fan club", gap: 5, w: (c) => (c.fame > 15 ? 3 : 0),
  title: "Fan event", text: "About three hundred fans in your colours at the gate, asking for autographs. Prep starts in an hour.",
  opts: [
    { label: "Sign everything", sub: "Fame, a tired evening", fx: { fame: 2, morale: -1 } },
    { label: "Half an hour, then back to work", sub: "Balance", fx: { fame: 1 } },
  ],
});
ev({
  id: "charity", from: "{agent}", gap: 10, w: (c) => (c.fame > 20 ? 2 : 0),
  title: "Charity karting race", text: "A children's charity wants you at their karting day. They'd love a donation too. Good cause.",
  opts: [
    { label: "Do it and donate", sub: "Good for everyone", fx: { fame: 2, cash: -20_000, morale: 3 } },
    { label: "Politely decline", sub: "Busy schedule", fx: {} },
  ],
});
ev({
  id: "interview", from: "{agent}", gap: 4, w: (c) => (c.fame > 8 ? 3 : 1),
  title: "Big interview", text: "A big magazine wants a long sit-down. They'll ask about your future.",
  opts: [
    { label: "Open up", sub: "Fame, press likes you", fx: { fame: 2, rel: { press: 3 } } },
    { label: "Say nothing interesting", sub: "Safe", fx: { rel: { press: -1 }, morale: 1 } },
    { label: "Hint you want F1", sub: "Headlines; the team may not like it", fx: { fame: 3, trust: -2 } },
  ],
});
ev({
  id: "money-trouble", from: "{agent}", gap: 8, w: (c) => (c.cash < 100_000 && c.series !== "F1" ? 4 : 0),
  title: "Money is tight", text: "I looked at your account. Junior racing is eating it. We need to sort this.",
  opts: [
    { label: "Ask {agent} for a personal sponsor", sub: "Might work", p: (c) => 0.35 + c.fame / 100, fx: { cash: 150_000, rel: { agent: 2 } }, miss: { morale: -3 }, ok: "{agent} found a local backer.", bad: "Nobody bit." },
    { label: "Coach karting on weekends off", sub: "Money, less rest", fx: { cash: 40_000, morale: -2 } },
  ],
});
// ── personal ──
ev({
  id: "family", from: "Mum", gap: 6, w: () => 2,
  title: "Home", text: "We haven't seen you since the winter. Come home for a weekend?",
  opts: [
    { label: "Go home", sub: "Recharge", fx: { morale: 5, rel: { family: 4 } } },
    { label: "Stay and train", sub: "XP", fx: { xp: 25, rel: { family: -3 } } },
  ],
});
ev({
  id: "fitness", from: "Trainer", gap: 5, w: () => 2,
  title: "Fitness camp", text: "I want you at altitude camp for a week. Your neck strength is behind where it should be.",
  opts: [
    { label: "Do it", sub: "Fitness and XP", fx: { xp: 25, morale: -1 } },
    { label: "Normal week", sub: "Rest", fx: { morale: 1 } },
  ],
});
ev({
  id: "nerves", from: "Trainer", gap: 6, w: (c) => (c.morale < 40 ? 5 : 0),
  title: "Doubts", text: "You're not sleeping before races, are you? I can tell. We should talk.",
  opts: [
    { label: "Talk to a sports psychologist", sub: "Costs money, helps", fx: { cash: -15_000, morale: 8 } },
    { label: "Push through", sub: "Might pass", p: () => 0.5, fx: { morale: 4 }, miss: { morale: -3 }, ok: "It passes.", bad: "It gets worse." },
  ],
});
ev({
  id: "mentor", from: "Unknown number", gap: 12, w: (c) => (c.age < 21 ? 2 : 0),
  title: "A former champion calls", text: "This is a former world champion. I've been watching your onboards. I could coach you for a few weekends, if you want.",
  opts: [
    { label: "Yes, absolutely", sub: "XP and morale", fx: { xp: 40, morale: 3 } },
    { label: "Not now", sub: "Stay focused", fx: {} },
  ],
});
ev({
  id: "rumour", from: "{agent}", gap: 6, w: (c) => (c.fame > 12 ? 2 : 0),
  title: "Paddock rumour", text: "The paddock's saying another team wants you next year. Your boss has heard it too.",
  opts: [
    { label: "Deny it", sub: "Keep the team happy", fx: { trust: 2 } },
    { label: "\"I'm focused on now\"", sub: "Keeps your options open", fx: { fame: 1, trust: -1, rel: { agent: 2 } } },
  ],
});

// ── people off the track (the phone) ──
ev({
  id: "partner-race", from: "{partner}", gap: 6, w: (c) => (c.partner ? 3 : 0),
  title: "Can I come?", text: "Can I come to the next race? I've never seen you do it up close.",
  opts: [
    { label: "Of course, I'll sort a pass", sub: "Happier, a little distracted", fx: { morale: 3, xp: -5, rel: { partner: 8 } } },
    { label: "Not this one, it's a big weekend", sub: "Focus", fx: { rel: { partner: -5 } } },
  ],
});
ev({
  id: "partner-away", from: "{partner}", gap: 5, w: (c) => (c.partner && c.rel("partner") < 45 ? 5 : 0),
  title: "We never see each other", text: "We never see each other. Are we doing this or not?",
  opts: [
    { label: "Fly home between races", sub: "Tired, but worth it", fx: { cash: -6_000, morale: -1, rel: { partner: 14 } } },
    { label: "After the season, I promise", sub: "It might not wait", fx: { rel: { partner: -8 }, xp: 10 } },
  ],
});
ev({
  id: "sibling-course", from: "{sibling}", gap: 10, w: () => 1.5,
  title: "A favour", text: "Don't laugh. I got into a design course but it's $20K. Could you help?",
  opts: [
    { label: "Pay for it", sub: "Family first", fx: { cash: -20_000, morale: 2, rel: { family: 8 } } },
    { label: "Help with half", sub: "Fair", fx: { cash: -10_000, rel: { family: 3 } } },
    { label: "Not right now", sub: "Racing is expensive", fx: { rel: { family: -6 } } },
  ],
});
ev({
  id: "mum-race", from: "Mum", gap: 8, w: () => 1.5,
  title: "Mum wants to come", text: "Your dad and I want to watch a race from the grandstand this year. Which one is best?",
  opts: [
    { label: "Get them paddock passes", sub: "They'll love it", fx: { cash: -4_000, morale: 3, rel: { family: 8 } } },
    { label: "Watch at home, it's better on TV", sub: "True, and a bit cold", fx: { rel: { family: -4 } } },
  ],
});
ev({
  id: "tenant", from: "Letting agent", gap: 6, w: (c) => (c.rental ? 3 : 0),
  title: "Problem at the {rental}", text: "The tenants at the {rental} say the boiler's gone. Do we fix it properly?",
  opts: [
    { label: "Fix it properly", sub: "$9K", fx: { cash: -9_000 } },
    { label: "Patch it", sub: "Cheaper; the place suffers", fx: { cash: -1_500, rentVal: 0.04 } },
  ],
});
ev({
  id: "friend-sim", from: "{friend}", gap: 5, w: (c) => (c.friend ? 2 : 0),
  title: "Simulator night", text: "Coming over for a sim battle tonight? Loser buys dinner.",
  opts: [
    { label: "You're on", sub: "XP and a good night", fx: { xp: 15, morale: 2, rel: { friend: 6 } } },
    { label: "Early night for me", sub: "Rest", fx: { morale: 1 } },
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
  c.event = { id: pick.e.id, from: cap(fillText(pick.e.from ?? "Paddock", x)), title: fillText(pick.e.title, x), text: fillText(pick.e.text, x), opts: pick.e.opts.map((o) => ({ label: fillText(o.label, x), sub: o.sub })) };
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
  lifeLogEvent(w, c.event.from ?? "Paddock", c.event.text, fillText(o.label, x), works ? (o.ok ? fillText(o.ok, x) : "") : msg);
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
  for (const [k, v] of Object.entries(fx.rel ?? {})) {
    (c.rel ??= {})[k] = clamp((c.rel[k] ?? 50) + (v ?? 0));
    // the phone's people: family, partner, paddock friends
    const roles = k === "family" ? ["mum", "dad", "sibling"] : k === "partner" ? ["partner"] : k === "friend" ? ["friend"] : [];
    for (const p of c.life?.people ?? []) if (roles.includes(p.role)) p.rel = clamp(p.rel + (v ?? 0));
  }
  if (fx.rentVal) {
    const h = c.life?.homes.find((x) => x.rented);
    if (h) h.value *= 1 - fx.rentVal;
  }
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
    rel: (k) => (k === "partner" ? (c.life?.people.find((p) => p.role === "partner")?.rel ?? 50) : (c.rel?.[k] ?? 50)),
    round: w.results.length,
    rounds: w.calendar.length,
    age: w.season - d.born,
    deals: c.deals.length,
    partner: c.life?.people.find((p) => p.role === "partner")?.name.split(" ")[0] ?? null,
    sibling: c.life?.people.find((p) => p.role === "sibling")?.name.split(" ")[0] ?? "your sibling",
    friend: c.life?.people.find((p) => p.role === "friend")?.name ?? null,
    rental: (() => {
      const h = c.life?.homes.find((x) => x.rented);
      return h ? h.key.replace("flat", "flat").replace("town", "townhouse").replace("lake", "lake house").replace("monaco", "Monaco flat").replace("villa", "villa") : null;
    })(),
  };
}

function fillText(t: string, x: Ctx) {
  return t.replace(/\{(\w+)\}/g, (_, k) => {
    if (k === "agent") return x.agentName;
    const v = (x as unknown as Record<string, unknown>)[k];
    return typeof v === "string" || typeof v === "number" ? String(v) : "";
  });
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export const EVENT_COUNT = () => defs.length;
