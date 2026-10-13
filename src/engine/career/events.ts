// The life between race weekends: an event deck (press, engineer, team boss, team-mate, rivals, agent,
// family, fans). Each event is a situation with a weight over the career context and two or three choices
// with effects on fame, trust, morale, money, XP and relationships. Written in data/manual/events.csv.
import { hashString, makeRng } from "../rng";
import type { World } from "../types";
import { careerOf, meOf, note, type CareerState } from "./career";
import { EVENT_SHEET } from "./eventSheet";
import { lifeLogEvent } from "./life";
import { parseSheet, type EvDef } from "./sheet";

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
// The events live in a spreadsheet: data/manual/events.csv (see sheet.ts for the columns). `npm run events`
// checks it and rebuilds eventSheet.ts; the dev server does that on save.
const sheet = parseSheet(EVENT_SHEET);
if (sheet.errors.length) console.warn(`events.csv:\n${sheet.errors.join("\n")}`);
const defs: EvDef[] = sheet.defs;

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
