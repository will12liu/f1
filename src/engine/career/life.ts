// Life off the track, run from the phone: money (stocks, crypto, homes, cars, businesses), people (family,
// partner, paddock friends) and a feed. Everything moves once per race weekend (`lifeAfterRound`) with its own
// seeded RNG (`seed:life:...`), so it never touches the race or season draws. F1 stays the main game: perks are
// small (morale, fame, XP) and the money mostly matters for what you can buy.
import { personName } from "../generate";
import { hashString, makeRng, type Rng } from "../rng";
import type { World } from "../types";
import { careerOf, meOf, note, type CareerState } from "./career";

export type Market = "stock" | "crypto";
export interface Ticker {
  sym: string;
  name: string;
  what: string;
  market: Market;
  start: number;
  vol: number; // weekly volatility
  drift: number; // weekly drift
}
export const TICKERS: Ticker[] = [
  { sym: "P100", name: "Paddock 100", what: "Index fund: the hundred biggest companies", market: "stock", start: 100, vol: 0.018, drift: 0.0022 },
  { sym: "GRIP", name: "Gripline Tyres", what: "Tyres for road cars and junior series", market: "stock", start: 64, vol: 0.04, drift: 0.002 },
  { sym: "VOLT", name: "Voltaic", what: "Energy drinks, sponsors half the paddock", market: "stock", start: 38, vol: 0.055, drift: 0.0025 },
  { sym: "MRDN", name: "Meridian Fuels", what: "Fuel and synthetic fuel research", market: "stock", start: 82, vol: 0.035, drift: 0.0012 },
  { sym: "SKYR", name: "Skyreach Airlines", what: "Flies the circus between races", market: "stock", start: 21, vol: 0.06, drift: 0.001 },
  { sym: "KAEL", name: "Kaelen Watches", what: "Luxury watches, official timekeeper", market: "stock", start: 145, vol: 0.03, drift: 0.0018 },
  { sym: "NBYT", name: "Neonbyte", what: "Chips for simulators and car electronics", market: "stock", start: 55, vol: 0.075, drift: 0.0035 },
  { sym: "ARCW", name: "Arcwave Telecom", what: "Mobile networks, pays a steady dividend", market: "stock", start: 29, vol: 0.025, drift: 0.0015 },
  { sym: "LAPS", name: "LapCoin", what: "The first coin, the least wild", market: "crypto", start: 4200, vol: 0.14, drift: 0.004 },
  { sym: "APEX", name: "Apex", what: "Smart-contract chain", market: "crypto", start: 310, vol: 0.18, drift: 0.004 },
  { sym: "PITS", name: "PitStop Token", what: "A fan token. Volatile", market: "crypto", start: 1.8, vol: 0.26, drift: 0.002 },
  { sym: "DRS", name: "DRS", what: "A meme coin. Anything can happen", market: "crypto", start: 0.04, vol: 0.38, drift: 0 },
];
const FEE: Record<Market, number> = { stock: 0.005, crypto: 0.015 };
const HIST = 30;

export interface HomeDef {
  key: string;
  name: string;
  where: string;
  price: number;
  perks: { morale?: number; fame?: number; xp?: number };
  party: number; // what a party costs here
  needs?: number; // fame
}
export const HOMES: HomeDef[] = [
  { key: "flat", name: "Flat near the factory", where: "Ten minutes from the team", price: 450_000, perks: { morale: 0.3, xp: 3 }, party: 8_000 },
  { key: "town", name: "Townhouse back home", where: "Near your family", price: 900_000, perks: { morale: 0.6 }, party: 15_000 },
  { key: "lake", name: "Lake house", where: "Quiet, a boat dock", price: 2_200_000, perks: { morale: 0.9 }, party: 30_000 },
  { key: "monaco", name: "Monaco apartment", where: "Harbour view, half the grid lives here", price: 5_500_000, perks: { morale: 0.7, fame: 0.3 }, party: 60_000, needs: 35 },
  { key: "villa", name: "Coastal villa", where: "Pool, gym, a garage for six", price: 9_000_000, perks: { morale: 1.1, fame: 0.4 }, party: 90_000, needs: 50 },
];
export interface CarDef {
  key: string;
  name: string;
  what: string;
  price: number;
  perks: { morale?: number; fame?: number };
  dep: number; // weekly value change (negative = loses value)
  needs?: number;
}
export const CARS: CarDef[] = [
  { key: "hatch", name: "Hot hatch", what: "Small, quick, cheap to run", price: 42_000, perks: { morale: 0.15 }, dep: -0.008 },
  { key: "gt", name: "Grand tourer", what: "Long drives between races", price: 220_000, perks: { morale: 0.3, fame: 0.05 }, dep: -0.005 },
  { key: "super", name: "Supercar", what: "Mid-engined, photographed everywhere", price: 380_000, perks: { morale: 0.35, fame: 0.15 }, dep: -0.004, needs: 20 },
  { key: "classic", name: "1970s classic", what: "A collector's car: tends to gain value", price: 1_100_000, perks: { morale: 0.4, fame: 0.1 }, dep: 0.003 },
  { key: "hyper", name: "Hypercar", what: "Limited run of 150", price: 2_800_000, perks: { morale: 0.5, fame: 0.35 }, dep: -0.001, needs: 45 },
];
export interface BizDef {
  key: string;
  name: string;
  what: string;
  price: number;
  income: (fame: number) => number; // per weekend at level 1
  needs?: number;
}
export const BIZ: BizDef[] = [
  { key: "kart", name: "Karting track", what: "Where it all started. Steady money", price: 800_000, income: (f) => 5_000 * (1 + f / 60) },
  { key: "brand", name: "Clothing brand", what: "Caps and shirts with your number. Lives on fame", price: 300_000, income: (f) => 600 + f * f * 5, needs: 10 },
  { key: "f4", name: "Share in an F4 team", what: "Run young drivers. Some years pay, some don't", price: 1_500_000, income: () => 7_500 },
];

export type Role = "mum" | "dad" | "sibling" | "partner" | "friend";
export interface Person {
  id: string;
  role: Role;
  name: string;
  rel: number; // 0-100
  job?: string;
  driverId?: string; // a paddock friend
  status?: "dating" | "together" | "engaged" | "married";
  since?: number; // weekend index it started
  seen?: number; // last weekend index you did something with them
}
export interface Holding {
  units: number;
  cost: number; // total paid
}
export interface Owned {
  id: string;
  key: string;
  value: number;
  paid: number;
  rented?: boolean;
  reno?: number; // homes: 0-3
}
export interface Msg {
  from: string;
  text: string;
  me?: boolean;
  t: number; // weekend index
}
export interface Post {
  who: string;
  text: string;
  t: number;
  likes: number;
}
export interface LifeState {
  t: number; // weekends lived (season * 100 + round)
  prices: Record<string, number[]>;
  hold: Record<string, Holding>;
  homes: Owned[];
  cars: Owned[];
  biz: { key: string; level: number; paid: number }[];
  people: Person[];
  date?: Person; // someone you met this weekend
  done: Record<string, number>; // action key -> weekend index (once per weekend)
  msgs: Msg[];
  feed: Post[];
  ledger: [string, number][]; // last weekend's money in/out
  seq: number;
}

const wk = (w: World) => w.season * 100 + w.results.length;
const lrng = (w: World, tag: string): Rng => makeRng(hashString(`${w.seed}:life:${w.season}:${w.results.length}:${tag}`));
const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const JOBS = ["a physio", "a photographer", "an architect", "a journalist", "a pilot", "a chef", "a lawyer", "a doctor", "a designer", "a musician", "a teacher", "an engineer"];

export function lifeOf(w: World): LifeState | null {
  return careerOf(w)?.life ?? null;
}

/** Make the life state the first time it's needed (old saves too). */
export function ensureLife(w: World): LifeState | null {
  const c = careerOf(w);
  const d = meOf(w);
  if (!c || !d) return null;
  if (c.life) return c.life;
  const r = makeRng(hashString(`${w.seed}:life:init`));
  const prices: Record<string, number[]> = {};
  for (const tk of TICKERS) {
    let p = tk.start * (0.8 + r.next() * 0.4);
    const h: number[] = [];
    for (let i = 0; i < HIST; i++) {
      p = step(tk, p, r);
      h.push(p);
    }
    prices[tk.sym] = h;
  }
  const fam = (role: Role, first: string, rel: number): Person => ({ id: role, role, name: role === "sibling" ? `${first} ${d.last}` : first, rel });
  const mum = personName(r).first;
  const dad = personName(r).first;
  const sib = personName(r).first;
  const L: LifeState = {
    t: wk(w),
    prices,
    hold: {},
    homes: [],
    cars: [],
    biz: [],
    people: [fam("mum", "Mum", 70), fam("dad", "Dad", 62), { ...fam("sibling", sib, 58), job: r.pick(JOBS) }],
    done: {},
    msgs: [
      { from: "Mum", text: "Proud of you. Call when you can, we watch every race.", t: wk(w) },
      { from: sib, text: "Don't forget us when you're famous", t: wk(w) },
    ],
    feed: [],
    ledger: [],
    seq: 0,
  };
  void mum;
  void dad;
  // two paddock friends from your series
  const pool = w.drivers.filter((x) => x.series === d.series && x.id !== d.id && Math.abs(w.season - x.born - (w.season - d.born)) <= 4);
  for (let i = 0; i < 2 && pool.length; i++) {
    const f = pool.splice(r.int(0, pool.length - 1), 1)[0];
    L.people.push({ id: `f-${f.id}`, role: "friend", name: `${f.first} ${f.last}`, driverId: f.id, rel: 50 + r.int(0, 15) });
  }
  c.life = L;
  return L;
}

function step(tk: Ticker, p: number, r: Rng): number {
  let ch = tk.drift + r.normal(0, tk.vol);
  if (tk.market === "crypto") {
    if (r.chance(0.025)) ch -= 0.45; // a crash
    else if (r.chance(0.03)) ch += 0.5; // a run
  }
  return Math.max(tk.start * 0.002, p * Math.exp(ch));
}
export const priceOf = (L: LifeState, sym: string) => L.prices[sym][L.prices[sym].length - 1];
const homeDef = (k: string) => HOMES.find((h) => h.key === k)!;
const carDef = (k: string) => CARS.find((h) => h.key === k)!;
const bizDef = (k: string) => BIZ.find((h) => h.key === k)!;

export function netWorth(c: CareerState): { cash: number; stocks: number; crypto: number; homes: number; cars: number; biz: number; total: number } {
  const L = c.life;
  const v = { cash: c.cash, stocks: 0, crypto: 0, homes: 0, cars: 0, biz: 0, total: 0 };
  if (L) {
    for (const [sym, h] of Object.entries(L.hold)) {
      const tk = TICKERS.find((t) => t.sym === sym);
      if (tk) v[tk.market === "stock" ? "stocks" : "crypto"] += h.units * priceOf(L, sym);
    }
    v.homes = L.homes.reduce((s, h) => s + h.value, 0);
    v.cars = L.cars.reduce((s, h) => s + h.value, 0);
    v.biz = L.biz.reduce((s, b) => s + b.paid * 0.8, 0);
  }
  v.total = v.cash + v.stocks + v.crypto + v.homes + v.cars + v.biz;
  return v;
}
export const followers = (fame: number) => Math.round(1800 * Math.pow(1.13, fame));
export const rentOf = (o: Owned) => o.value * 0.0034;
export const homePerks = (o: Owned) => {
  const p = homeDef(o.key).perks;
  const k = 1 + 0.25 * (o.reno ?? 0);
  return { morale: (p.morale ?? 0) * k, fame: (p.fame ?? 0) * k, xp: (p.xp ?? 0) * k };
};
export const bizIncome = (b: { key: string; level: number }, fame: number) => bizDef(b.key).income(fame) * b.level;
export const doneThisWeek = (w: World, key: string) => (careerOf(w)?.life?.done[key] ?? -1) === wk(w);

function msg(L: LifeState, from: string, text: string, t: number, me?: boolean) {
  L.msgs.push({ from, text, t, me });
  if (L.msgs.length > 160) L.msgs.splice(0, L.msgs.length - 160);
}
function post(L: LifeState, who: string, text: string, t: number, likes: number) {
  L.feed.unshift({ who, text, t, likes: Math.round(likes) });
  if (L.feed.length > 60) L.feed.length = 60;
}
function morale(c: CareerState, x: number) {
  c.morale = clamp((c.morale ?? 60) + x);
}
function addXp(c: CareerState, x: number) {
  c.xp += x;
  while (c.xp >= 100) {
    c.xp -= 100;
    c.points++;
  }
}

// ───────────── every weekend ─────────────

export function lifeAfterRound(w: World) {
  const c = careerOf(w);
  const d = meOf(w);
  const L = ensureLife(w);
  if (!c || !d || !L) return;
  const t = wk(w);
  const r = lrng(w, "week");
  const R = w.calendar.length;
  const led: [string, number][] = [];
  // markets
  for (const tk of TICKERS) {
    const h = L.prices[tk.sym];
    h.push(step(tk, h[h.length - 1], r));
    if (h.length > HIST) h.shift();
  }
  const div = (L.hold.ARCW?.units ?? 0) * priceOf(L, "ARCW") * 0.0025;
  if (div > 1) led.push(["Arcwave dividend", div]);
  // homes: value drifts; rent or perks
  for (const o of L.homes) {
    o.value *= Math.exp(0.0018 + r.normal(0, 0.01));
    led.push([`${homeDef(o.key).name} upkeep`, -o.value * 0.0007]);
    if (o.rented) led.push([`Rent: ${homeDef(o.key).name}`, rentOf(o)]);
    else {
      const p = homePerks(o);
      morale(c, p.morale);
      c.fame = clamp(c.fame + p.fame);
      addXp(c, p.xp);
    }
  }
  for (const o of L.cars) {
    const def = carDef(o.key);
    o.value *= Math.exp(def.dep + r.normal(0, def.key === "classic" ? 0.012 : 0.003));
    led.push([`${def.name} running costs`, -def.price * 0.0012]);
    morale(c, def.perks.morale ?? 0);
    c.fame = clamp(c.fame + (def.perks.fame ?? 0));
  }
  for (const b of L.biz) {
    const def = bizDef(b.key);
    const inc = def.key === "f4" ? bizIncome(b, c.fame) * (0.2 + r.next() * 1.6) : bizIncome(b, c.fame) * (0.85 + r.next() * 0.3);
    led.push([def.name, inc]);
  }
  for (const [, v] of led) c.cash += v;
  L.ledger = led;
  // people: bonds fade without contact; a partner and family move morale a little
  for (const p of L.people) {
    const quiet = t - (p.seen ?? L.t);
    if (p.role === "partner" && quiet > 3) p.rel = clamp(p.rel - 1.5);
    else if (quiet > 6) p.rel = clamp(p.rel - 0.5);
    if (p.role === "partner") morale(c, ((p.rel - 50) / 50) * (p.status === "married" ? 0.8 : 0.5));
    if (p.role === "mum" || p.role === "dad") morale(c, ((p.rel - 50) / 50) * 0.15);
  }
  // a partner who's had enough leaves
  const partner = L.people.find((p) => p.role === "partner");
  if (partner && partner.rel < 12) {
    L.people = L.people.filter((p) => p !== partner);
    msg(L, partner.name, "I can't do this anymore. You're never here. I'm sorry.", t);
    morale(c, -8);
    note(w, c, "Life", `${partner.name} left`, `${partner.name} ended it. Spend time with the people who matter.`);
  }
  L.date = undefined;
  // the feed: fans react to the weekend
  const last = c.log[c.log.length - 1];
  if (last && last.season === w.season && last.round === w.results.length) {
    const fin = last.status === "Finished" || last.status === "Lapped";
    const fan = `@${r.pick(["pitlane", "boxbox", "apexhunter", "flatout", "sector3", "slipstream", "kerbside", "gridwalk"])}${r.int(1, 99)}`;
    const name = d.last;
    const text = !fin
      ? r.pick([`Gutted for ${name} today. Next one.`, `${name} out early. Not his day.`, `Heads up ${name}, plenty of races left`])
      : last.pos === 1
        ? r.pick([`${name.toUpperCase()} WINS. What a drive.`, `Told you all ${name} was the real deal`, `P1 for ${name}. Frame it.`])
        : last.pos <= 3
          ? r.pick([`Podium for ${name}! Getting closer every week`, `P${last.pos}. ${name} is so consistent`, `That podium was earned the hard way`])
          : last.grid - last.pos >= 5
            ? `${name} from P${last.grid} to P${last.pos}. Overtake of the weekend?`
            : last.pos <= 10
              ? r.pick([`Solid points for ${name}`, `P${last.pos} for ${name}, quietly good`])
              : r.pick([`Tough one for ${name}. The car isn't there yet`, `P${last.pos}. ${name} deserves better machinery`]);
    post(L, fan, text, t, followers(c.fame) * (0.002 + r.next() * 0.004) * (fin && last.pos <= 3 ? 3 : 1));
  }
  // someone texts now and then
  if (r.chance(0.3)) {
    const p = r.pick(L.people);
    const lines: Record<Role, string[]> = {
      mum: ["Saw the race. Are you eating properly?", "Your dad shouted at the TV again", "Call me after the next one"],
      dad: ["Good weekend. Keep your head down.", "Watched your onboard three times. Brake later into turn one.", "Proud of you, kid"],
      sibling: ["Can I come to a race this year?", "My friends think you're famous now. Annoying.", "Mum keeps asking me if you've called her"],
      partner: ["Miss you. When are you home?", "Watching from the sofa, go get them", "I booked us dinner for when you're back"],
      friend: ["Simulator battle tonight?", "Dinner after the briefing?", "Good race. You were mega in the last sector"],
    };
    msg(L, p.name, r.pick(lines[p.role]), t);
  }
  void R;
}

// ───────────── actions (worker, via `act`) ─────────────

type Ans = { ok: boolean; msg: string };
const no = (m: string): Ans => ({ ok: false, msg: m });

export function lifeInit(w: World): Ans {
  ensureLife(w);
  return { ok: true, msg: "" };
}

/** Buy (amount > 0, in money) or sell (amount < 0, money worth; -Infinity sells all) a ticker. */
export function lifeTrade(w: World, sym: string, amount: number): Ans {
  const c = careerOf(w);
  const L = ensureLife(w);
  const tk = TICKERS.find((x) => x.sym === sym);
  if (!c || !L || !tk) return no("");
  const p = priceOf(L, sym);
  const h = (L.hold[sym] ??= { units: 0, cost: 0 });
  if (amount > 0) {
    const spend = Math.min(amount, c.cash);
    if (spend < 100) return no("Not enough in the bank.");
    const units = (spend * (1 - FEE[tk.market])) / p;
    h.units += units;
    h.cost += spend;
    c.cash -= spend;
    return { ok: true, msg: `Bought ${fmtU(units)} ${sym}.` };
  }
  if (h.units <= 0) return no("You don't own any.");
  const units = Math.min(h.units, -amount / p);
  const got = units * p * (1 - FEE[tk.market]);
  h.cost *= 1 - units / h.units;
  h.units -= units;
  if (h.units < 1e-9) delete L.hold[sym];
  c.cash += got;
  return { ok: true, msg: `Sold for ${money(got)}.` };
}

export function lifeBuy(w: World, kind: "home" | "car" | "biz", key: string): Ans {
  const c = careerOf(w);
  const d = meOf(w);
  const L = ensureLife(w);
  if (!c || !d || !L) return no("");
  const def = kind === "home" ? HOMES.find((x) => x.key === key) : kind === "car" ? CARS.find((x) => x.key === key) : BIZ.find((x) => x.key === key);
  if (!def) return no("");
  if (def.needs && c.fame < def.needs) return no(`Needs fame ${def.needs}.`);
  const price = kind === "home" ? Math.round(def.price * homeMarket(L)) : def.price;
  if (c.cash < price) return no("You can't afford it.");
  if (kind === "biz" && L.biz.some((b) => b.key === key)) return no("You already own it.");
  c.cash -= price;
  if (kind === "biz") L.biz.push({ key, level: 1, paid: price });
  else (kind === "home" ? L.homes : L.cars).push({ id: `${key}${++L.seq}`, key, value: price, paid: price, reno: 0 });
  const t = wk(w);
  if (kind === "car") post(L, `@${d.last.toLowerCase()}`, `New toy. ${def.name}.`, t, followers(c.fame) * 0.01);
  if (kind === "home") post(L, `@${d.last.toLowerCase()}`, `Keys. ${def.name}.`, t, followers(c.fame) * 0.008);
  note(w, c, "Life", def.name, `You bought ${def.name.toLowerCase()} for ${money(price)}.`);
  return { ok: true, msg: `${def.name} is yours.` };
}
/** Homes cost more when the market is up: the average drift since the start, from the index. */
const homeMarket = (L: LifeState) => clamp(priceOf(L, "P100") / 100, 0.8, 1.5) ** 0.5;
export const homePrice = (L: LifeState, key: string) => Math.round(homeDef(key).price * homeMarket(L));

export function lifeSell(w: World, kind: "home" | "car" | "biz", id: string): Ans {
  const c = careerOf(w);
  const L = ensureLife(w);
  if (!c || !L) return no("");
  if (kind === "biz") {
    const b = L.biz.find((x) => x.key === id);
    if (!b) return no("");
    L.biz = L.biz.filter((x) => x !== b);
    c.cash += b.paid * 0.8;
    return { ok: true, msg: `Sold for ${money(b.paid * 0.8)}.` };
  }
  const list = kind === "home" ? L.homes : L.cars;
  const o = list.find((x) => x.id === id);
  if (!o) return no("");
  const got = o.value * (kind === "home" ? 0.96 : 0.92);
  if (kind === "home") L.homes = L.homes.filter((x) => x !== o);
  else L.cars = L.cars.filter((x) => x !== o);
  c.cash += got;
  return { ok: true, msg: `Sold for ${money(got)} (${got >= o.paid ? "+" : ""}${money(got - o.paid)} on what you paid).` };
}

/** Homes: rent out / move back in, renovate, throw a party. */
export function lifeHome(w: World, id: string, what: "rent" | "reno" | "party"): Ans {
  const c = careerOf(w);
  const d = meOf(w);
  const L = ensureLife(w);
  const o = L?.homes.find((x) => x.id === id);
  if (!c || !d || !L || !o) return no("");
  const def = homeDef(o.key);
  const t = wk(w);
  if (what === "rent") {
    o.rented = !o.rented;
    return { ok: true, msg: o.rented ? `Rented out: ${money(rentOf(o))} a weekend. You lose its perks.` : "You've moved back in." };
  }
  if (what === "reno") {
    if ((o.reno ?? 0) >= 3) return no("Nothing left to renovate.");
    const cost = o.value * 0.12;
    if (c.cash < cost) return no(`Renovating costs ${money(cost)}.`);
    c.cash -= cost;
    o.reno = (o.reno ?? 0) + 1;
    o.value += cost * 1.3;
    return { ok: true, msg: `Renovated for ${money(cost)}. Worth more, and nicer to live in.` };
  }
  if (o.rented) return no("Tenants live there.");
  if (doneThisWeek(w, `party`)) return no("One party a weekend.");
  if (c.cash < def.party) return no(`A party here costs ${money(def.party)}.`);
  c.cash -= def.party;
  L.done.party = t;
  const r = lrng(w, `party:${id}`);
  morale(c, 4);
  c.fame = clamp(c.fame + 1 + def.party / 60_000);
  for (const p of L.people) if (p.role === "friend" || p.role === "partner") (p.rel = clamp(p.rel + 6)), (p.seen = t);
  post(L, `@${d.last.toLowerCase()}`, r.pick(["Good people, good night", "Housewarming done right", "Thanks everyone for coming"]), t, followers(c.fame) * 0.012);
  if (r.chance(0.18)) {
    c.trust = clamp(c.trust - 3);
    post(L, "@paddockgossip", `Neighbours called the police on ${d.first} ${d.last}'s party. The team won't love that`, t, followers(c.fame) * 0.02);
    return { ok: true, msg: "Great night, until the neighbours called the police. The team noticed. Trust -3." };
  }
  return { ok: true, msg: "Great night. Morale up, fame up, friends happy." };
}

export function lifeCarDrive(w: World, id: string): Ans {
  const c = careerOf(w);
  const L = ensureLife(w);
  const o = L?.cars.find((x) => x.id === id);
  if (!c || !L || !o) return no("");
  if (doneThisWeek(w, "drive")) return no("You've been out already this weekend.");
  L.done.drive = wk(w);
  morale(c, 2);
  if (lrng(w, "drive").chance(0.1)) {
    c.cash -= 2_500;
    c.fame = clamp(c.fame - 0.5);
    return { ok: true, msg: "A speeding ticket. $2.5K and a headline." };
  }
  return { ok: true, msg: "A long drive in the hills. Morale +2." };
}

export function lifeBizUp(w: World, key: string): Ans {
  const c = careerOf(w);
  const L = ensureLife(w);
  const b = L?.biz.find((x) => x.key === key);
  if (!c || !L || !b) return no("");
  if (b.level >= 3) return no("It's as big as it gets.");
  const cost = bizDef(key).price * 0.6 * b.level;
  if (c.cash < cost) return no(`Expanding costs ${money(cost)}.`);
  c.cash -= cost;
  b.level++;
  b.paid += cost;
  return { ok: true, msg: `Expanded. Level ${b.level}.` };
}

/** People: once per weekend each. */
export function lifePerson(w: World, id: string, what: "talk" | "gift" | "money" | "date" | "propose" | "marry" | "breakup" | "movein"): Ans {
  const c = careerOf(w);
  const d = meOf(w);
  const L = ensureLife(w);
  const p = L?.people.find((x) => x.id === id);
  if (!c || !d || !L || !p) return no("");
  const t = wk(w);
  const r = lrng(w, `p:${id}:${what}`);
  const once = () => {
    if ((L.done[id] ?? -1) === t) return false;
    L.done[id] = t;
    p.seen = t;
    return true;
  };
  if (what === "breakup") {
    L.people = L.people.filter((x) => x !== p);
    morale(c, -5);
    post(L, "@paddockgossip", `${d.first} ${d.last} is single again, sources say`, t, followers(c.fame) * 0.02);
    return { ok: true, msg: `You and ${p.name} are over.` };
  }
  if (!once()) return no(`You've seen ${p.name.split(" ")[0]} this weekend.`);
  const first = p.name.split(" ")[0];
  if (what === "talk" || what === "date") {
    const cost = what === "date" ? 1_500 : 0;
    c.cash -= cost;
    p.rel = clamp(p.rel + 5 + r.int(0, 4));
    morale(c, 1);
    if (p.role === "friend") addXp(c, 8);
    const said = p.role === "friend" ? "You swap notes on braking points. +8 XP." : p.role === "partner" ? "A good evening." : "A long call. It helped.";
    msg(L, p.name, what === "date" ? "Dinner tonight?" : "Hey, got a minute?", t, true);
    msg(L, p.name, r.pick(["Always", "Of course", "Was hoping you'd call", "Finally!"]), t);
    return { ok: true, msg: `${said} ${first} +${Math.round(5)}.` };
  }
  if (what === "gift") {
    const cost = p.role === "partner" ? 6_000 : 2_000;
    if (c.cash < cost) return no("You can't afford it.");
    c.cash -= cost;
    p.rel = clamp(p.rel + 10);
    msg(L, p.name, r.pick(["You didn't have to! Thank you", "I love it", "Ha, you remembered"]), t);
    return { ok: true, msg: `${first} loved it.` };
  }
  if (what === "money") {
    if (c.cash < 25_000) return no("You can't spare it.");
    c.cash -= 25_000;
    p.rel = clamp(p.rel + 12);
    morale(c, 1);
    msg(L, p.name, "You're the best. I'll pay you back. Probably.", t);
    return { ok: true, msg: `You sent ${first} $25K.` };
  }
  if (p.role !== "partner") return no("");
  const long = t - (p.since ?? t);
  if (what === "movein") {
    if (p.status !== "dating") return no("");
    if (long < 6 || p.rel < 60) return no(`${first} isn't ready yet.`);
    p.status = "together";
    morale(c, 3);
    return { ok: true, msg: `You and ${first} move in together.` };
  }
  if (what === "propose") {
    if (p.status !== "together") return no("");
    if (c.cash < 30_000) return no("A ring costs $30K.");
    c.cash -= 30_000;
    if (r.chance(clamp((p.rel - 40) / 50, 0.05, 0.97))) {
      p.status = "engaged";
      p.since = t;
      morale(c, 6);
      post(L, `@${d.last.toLowerCase()}`, `${first} said yes`, t, followers(c.fame) * 0.03);
      return { ok: true, msg: `${first} said yes.` };
    }
    p.rel = clamp(p.rel - 15);
    morale(c, -6);
    return no(`${first} said it's too soon. The ring stays in the drawer. ($30K)`);
  }
  if (what === "marry") {
    if (p.status !== "engaged") return no("");
    const cost = 120_000 + c.fame * 3_000;
    if (c.cash < cost) return no(`The wedding costs ${money(cost)}.`);
    c.cash -= cost;
    p.status = "married";
    p.rel = clamp(p.rel + 15);
    morale(c, 10);
    c.fame = clamp(c.fame + 2);
    post(L, "@paddockgossip", `${d.first} ${d.last} got married this weekend. Congrats to the happy couple`, t, followers(c.fame) * 0.05);
    note(w, c, "Life", "You got married", `You married ${p.name}.`);
    return { ok: true, msg: `You married ${first}. Morale +10.` };
  }
  return no("");
}

/** Meet someone (once per weekend), then ask them out. */
export function lifeMeet(w: World, ask?: boolean): Ans {
  const c = careerOf(w);
  const L = ensureLife(w);
  if (!c || !L) return no("");
  if (L.people.some((p) => p.role === "partner")) return no("You're with someone.");
  const t = wk(w);
  if (!ask) {
    if ((L.done.meet ?? -1) === t) return no("You've been out already this weekend.");
    L.done.meet = t;
    const r = lrng(w, "meet");
    const n = personName(r);
    L.date = { id: `p${++L.seq}`, role: "partner", name: `${n.first} ${n.last}`, job: r.pick(JOBS), rel: 30 + r.int(0, 30) };
    return { ok: true, msg: `You met ${n.first} at a friend's dinner.` };
  }
  const p = L.date;
  if (!p) return no("");
  L.date = undefined;
  const r = lrng(w, `ask:${p.id}`);
  if (r.chance(clamp(0.25 + p.rel / 150 + c.fame / 300 + ((c.morale ?? 60) - 50) / 200, 0.1, 0.9))) {
    L.people.push({ ...p, status: "dating", since: t, seen: t, rel: p.rel + 10 });
    msg(L, p.name, "Had a really nice time. Same again next week?", t);
    return { ok: true, msg: `${p.name.split(" ")[0]} said yes. You're seeing each other.` };
  }
  return no(`${p.name.split(" ")[0]} isn't interested. Next time.`);
}

const fmtU = (u: number) => (u >= 100 ? Math.round(u).toLocaleString() : u.toFixed(u >= 1 ? 2 : 4));
export const money = (x: number) => {
  const a = Math.abs(x);
  const trim = (x: string) => x.replace(/\.0+$/, "").replace(/(\.\d)0$/, "$1");
  const s = a >= 1e6 ? `${trim((a / 1e6).toFixed(2))}M` : a >= 1e3 ? `${trim((a / 1e3).toFixed(a >= 1e5 ? 0 : 1))}K` : `${Math.round(a)}`;
  return `${x < 0 ? "-" : ""}$${s}`;
};

/** Record an answered life event in the phone's message thread. */
export function lifeLogEvent(w: World, from: string, text: string, reply: string, outcome: string) {
  const L = ensureLife(w);
  const d = meOf(w);
  if (!L || !d) return;
  const t = wk(w);
  msg(L, from, text, t);
  msg(L, from, reply, t, true);
  if (outcome && outcome !== "Done.") msg(L, from, outcome, t);
}
