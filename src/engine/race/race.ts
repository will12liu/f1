// The race engine: a lap-by-lap runner (`createRace`), deterministic from the seed. `simRace` drains it.
// Each lap: pit calls -> every car's potential lap time (car, driver, tyres, fuel, dirty air, noise) ->
// road order resolved front to back (a car that would cross the line ahead of the car in front must pass
// it; failing leaves him stuck behind) -> retirements, contact, safety cars -> tyres, fuel, records.
// The replay (race/replay.ts) rebuilds positions from `lapEnd` and `events`.
import { hashString, makeRng, type Rng } from "../rng";
import type { CircuitDef, Compound, DnfReason, DriverRatings, PitLoss } from "../types";
import { DIAL, dialFx, NEUTRAL, type Command, type DialFx, type Dials, type Forecast } from "./dials";
import { POINTS, RACE, tyreCost, tyreLife } from "./model";
import {
  ATTACK_LABEL, chooseSit, CONTACT, DEFEND_LABEL, fill, PAYOFF, pickWeighted, readText, tendencies,
  type AttackMove, type DefendMove, type DuelRecord, type MCtx, type MomentChoice, type PendingMoment, type Reads,
} from "./moments";
import { plans, type Stint, type WearRate } from "./strategy";

export interface Entry {
  driverId: string;
  teamId: string;
  grid: number; // 1-based
  car: number; // car pace at this track (0-100)
  reliability: number;
  r: DriverRatings;
  form?: number; // pace on the day, fraction of the lap (dayForms)
  name?: string; // driver's last name (for moment texts)
  pit?: number; // pit crew 0-100 (team-principal mode; undefined = the standard AI crew)
  strat?: number; // strategy department 0-100 (undefined = standard)
}

export interface RaceInput {
  seed: number;
  circuit: CircuitDef;
  pitLoss?: PitLoss;
  entries: Entry[];
  laps?: number; // override (tests)
  commands?: Command[]; // dial changes and pit calls, each applied at the start of its lap (replays a live race)
  focus?: number[]; // the player's cars: they get key moments (duels, calls)
  moments?: "off" | "key" | "all";
  choices?: MomentChoice[]; // answers to moments (replay); when set, the race never waits for an answer
  reads?: Reads; // what the player knows of other drivers' habits
}

export type Flag = "green" | "sc" | "vsc" | "red";

export type RaceEventKind =
  | "pass" | "pit" | "dnf" | "sc" | "vsc" | "red" | "green" | "fastest" | "contact" | "penalty" | "mistake" | "slowstop"
  | "limits" // track-limits strike (info = strike number)
  | "bw" // black-and-white flag (last warning)
  | "blue" // a = the lapped car shown blue flags, b = the car lapping him
  | "yellow" // local yellow (info = sector 1-3)
  | "served" // drive-through / stop-go served (x = seconds in the pit lane)
  | "restart" // standing restart after a red flag
  | "teamorder" // a = the car letting its team-mate (b) through
  | "duel"; // a player's duel: info = attackMove|defendMove|passed|playerCar

export interface RaceEvent {
  lap: number;
  t: number; // race time (seconds since the start) the event happens at
  kind: RaceEventKind;
  a: number; // car index
  b?: number; // other car
  info?: string; // compound fitted, DNF reason, penalty seconds, ...
  x?: number; // pit: seconds lost in the pit lane
}

export interface StintRecord {
  c: Compound;
  from: number; // first lap
  to: number; // last lap
}

export interface CarState {
  idx: number;
  e: Entry;
  cum: number; // race time at the end of the last completed lap
  laps: number;
  out: DnfReason | null;
  outLap: number;
  outT: number;
  compound: Compound;
  age: number;
  wear: number;
  used: Compound[];
  plan: Stint[];
  stints: StintRecord[];
  pits: number;
  damage: number; // seconds per lap
  forcePit: boolean;
  penalty: number;
  fuel: number;
  last: number;
  best: number;
  passes: number;
  dirty: boolean; // within a second of the car ahead at the start of this lap
  lastPit: number;
  dials: Dials;
  ctl: boolean; // someone has touched this car's dials or pit calls (untouched cars skip the dial maths)
  battery: number; // ERS charge 0-1
  box: "S" | "M" | "H" | "auto" | null; // requested stop at the end of this lap
  hold: boolean; // skip a planned stop this lap
  lift: boolean; // lifting and coasting this lap (tank short)
  strikes: number; // track-limits strikes
  prone: number; // how much this driver fights the track limits this weekend
  blueIgnored: number;
  owed: 0 | 1 | 2; // drive-through (1) or stop-go (2) still to serve
  pp: number; // licence penalty points picked up this race
  pens: string[]; // penalties given ("5s track limits", ...)
}

export interface RaceState {
  laps: number;
  lap: number; // laps completed by the leader
  cars: CarState[];
  order: number[]; // running cars in road order (car indexes)
  flag: Flag;
  flagLaps: number; // laps of the current neutralisation left
  restart: boolean;
  standing: boolean; // the next lap is a standing restart (after a red flag)
  events: RaceEvent[];
  lapEnd: number[][]; // [car][lap] race time at the end of each lap (lap 0 = start position)
  sc: number;
  vsc: number;
  red: number;
  passes: number;
  fastest: { car: number; time: number; lap: number } | null;
  flagLog: { lap: number; flag: Flag }[]; // flag in force on each lap that wasn't green
  commands: Command[]; // every command applied so far (feed back as input.commands to replay the race)
  choices: MomentChoice[]; // every moment answered (feed back as input.choices)
  duels: DuelRecord[];
  seen: { driverId: string; role: "def" | "att"; move: string }[]; // habits shown in duels (merged into the reads)
}

export interface RaceRunner {
  state: RaceState;
  input: RaceInput;
  step(): void; // one lap
  done(): boolean;
  result(): RaceResult;
  /** Queue a change for a car from the next lap. */
  command(cmd: Omit<Command, "lap">): void;
  /** What the car's current dials lead to: tyres, battery, fuel, next stop. */
  forecast(idx: number): Forecast;
  /** A key moment waiting for the player (the race doesn't move until `choose`). */
  pending(): PendingMoment | null;
  choose(opt: string): void;
}

export interface ResultRow {
  idx: number;
  driverId: string;
  teamId: string;
  grid: number;
  pos: number;
  laps: number;
  time: number;
  gap: number;
  status: "Finished" | "Lapped" | DnfReason;
  points: number;
  pits: number;
  fastest: number;
  passes: number;
  stints: StintRecord[];
  penalty: number; // seconds added to the race time (penalties not served in the pits)
  pens: string[];
  pp: number; // licence penalty points
}

export interface RaceResult {
  rows: ResultRow[];
  sc: number;
  vsc: number;
  red: number;
  passes: number;
  fastest: { idx: number; time: number; lap: number } | null;
  leadChanges: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function createRace(input: RaceInput): RaceRunner {
  const c = input.circuit;
  const rng: Rng = makeRng(input.seed);
  const laps = input.laps ?? c.laps;
  const pitLoss = input.pitLoss ?? RACE.pitLossDefault;
  const base = c.base;
  const otIdx = clamp(Math.round(c.overtake), 1, 5) - 1;

  const wearMult = (r: DriverRatings) => 1.12 - (r.tyres - 50) * 0.004;
  const wearRate = (r: DriverRatings): WearRate => {
    const m = wearMult(r) * 1.04;
    return { S: m / tyreLife("S", c), M: m / tyreLife("M", c), H: m / tyreLife("H", c), I: m / tyreLife("I", c), W: m / tyreLife("W", c) };
  };

  // Strategy: the cheapest plan, sometimes the second (teams differ), from the same tyre model.
  const choosePlan = (car: CarState, from: number, keep: boolean, maxStops = laps - from > 36 ? 2 : 1, want?: Compound) => {
    const ps = plans({
      from,
      laps,
      wear: wearRate(car.e.r),
      base,
      pitLoss: pitLoss.normal,
      used: car.used,
      first: keep ? { c: car.compound, age: car.age } : want ? { c: want, age: 0 } : undefined,
      maxStops,
    });
    if (want && !ps.length) return choosePlan(car, from, keep, maxStops);
    // a better strategy department picks the second-best plan less often (same draw either way)
    const pick = ps.length > 1 && ps[1].cost - ps[0].cost < 4 && rng.chance(0.15 * (car.e.strat === undefined ? 1 : Math.max(0.1, (100 - car.e.strat) / 45))) ? ps[1] : ps[0];
    return pick;
  };

  const cars: CarState[] = input.entries.map((e, idx) => ({
    idx,
    e,
    cum: 0,
    laps: 0,
    out: null,
    outLap: 0,
    outT: 0,
    compound: "M",
    age: 0,
    wear: 0,
    used: [],
    plan: [],
    stints: [],
    pits: 0,
    damage: 0,
    forcePit: false,
    penalty: 0,
    fuel: laps * RACE.fuelPerLapKg,
    last: 0,
    best: Infinity,
    passes: 0,
    dirty: false,
    lastPit: -99,
    dials: { ...NEUTRAL },
    ctl: false,
    battery: DIAL.battery0,
    box: null,
    hold: false,
    lift: false,
    strikes: 0,
    prone: 1,
    blueIgnored: 0,
    owed: 0,
    pp: 0,
    pens: [],
  }));

  // Start: grid slots plus the launch (starts rating + luck).
  for (const car of cars) {
    const p = choosePlan(car, 0, false);
    car.plan = p.stints;
    car.compound = p.stints[0].c;
    car.used = [car.compound];
    car.stints = [{ c: car.compound, from: 1, to: laps }];
    const launch = (car.e.r.starts - 75) * 0.012 + rng.normal(0, RACE.launchSd);
    car.cum = (car.e.grid - 1) * RACE.gridGap - launch;
  }

  const state: RaceState = {
    laps,
    lap: 0,
    cars,
    order: cars.map((x) => x.idx).sort((a, b) => cars[a].e.grid - cars[b].e.grid),
    flag: "green",
    flagLaps: 0,
    restart: false,
    standing: false,
    events: [],
    lapEnd: cars.map((x) => [(x.e.grid - 1) * RACE.gridGap]),
    sc: 0,
    vsc: 0,
    red: 0,
    passes: 0,
    fastest: null,
    flagLog: [],
    commands: [],
    choices: [],
    duels: [],
    seen: [],
  };
  const queue: Command[] = (input.commands ?? []).map((x) => ({ ...x }));

  const ev = (e: RaceEvent) => state.events.push(e);
  for (const car of cars) car.prone = rng.chance(RACE.limitsProne) ? 8 : 0.45;
  // jump starts (the transponder sees it; five seconds)
  for (const car of cars) if (rng.chance(RACE.jumpStart * (0.5 + car.e.r.aggression / 100))) penalise(car, "5s", "jump start", 1, 0, 0);

  function retire(car: CarState, why: DnfReason, lap: number, t: number) {
    if (car.out) return;
    car.out = why;
    car.outLap = lap;
    car.outT = t;
    car.stints[car.stints.length - 1].to = lap;
    ev({ lap, t, kind: "dnf", a: car.idx, info: why });
  }

  let pendingFlag: Flag | null = null;
  let leadChanges = 0;
  let lapExtra = new Map<number, number>(); // time lost in incidents this lap (added when the lap is committed)
  const lose = (car: CarState, s: number) => lapExtra.set(car.idx, (lapExtra.get(car.idx) ?? 0) + s);
  const rank: Record<Flag, number> = { green: 0, vsc: 1, sc: 2, red: 3 };
  const callFlag = (f: Flag) => {
    if (state.lap >= laps - 1) return; // too late to matter
    if (!pendingFlag || rank[f] > rank[pendingFlag]) pendingFlag = f;
  };
  /** After a crash or a car stopped on track: red flag (rare), safety car or VSC. */
  const neutralise = (scChance: number, vscChance: number, red = 0, r: Rng = rng) => {
    if (red && r.chance(red)) callFlag("red");
    else if (r.chance(clamp(scChance, 0, 0.95))) callFlag("sc");
    else if (r.chance(vscChance)) callFlag("vsc");
  };

  /** A penalty from the stewards: time ("5s"/"10s", served at a stop or added at the end), a drive-through
   *  or a stop-go (served on a later lap), plus licence points. */
  function penalise(car: CarState, what: "5s" | "10s" | "drive-through" | "stop-go", why: string, lap: number, t: number, pp: number) {
    if (what === "5s") car.penalty += 5;
    else if (what === "10s") car.penalty += 10;
    else car.owed = what === "drive-through" ? 1 : 2;
    car.pp += pp;
    car.pens.push(`${what} ${why}`);
    ev({ lap, t, kind: "penalty", a: car.idx, info: `${what}|${why}${pp ? `|${pp}` : ""}` });
  }

  function contact(att: CarState, def: CarState, L: number, t: number, r: Rng = rng) {
    ev({ lap: L, t, kind: "contact", a: att.idx, b: def.idx });
    const x = r.next();
    let dnfs = 0;
    if (x < 0.35) {
      att.damage += 0.5;
      att.forcePit = laps - L > 4;
    } else if (x < 0.55) {
      def.damage += 0.3;
      def.forcePit = laps - L > 2;
      lose(def, 6);
    } else if (x < 0.75) {
      retire(att, "Collision", L, t);
      dnfs++;
    } else if (x < 0.85) {
      retire(def, "Collision", L, t);
      dnfs++;
    } else if (x < 0.92) {
      retire(att, "Collision", L, t);
      retire(def, "Collision", L, t);
      dnfs += 2;
    } else {
      lose(att, 8); // spun, kept going
    }
    if (!att.out && (def.out || x < 0.55) && r.chance(0.6)) {
      const y = r.next();
      const serious = def.out || x < 0.2;
      if (y < 0.08 && laps - L > 3) penalise(att, "drive-through", "causing a collision", L, t, serious ? 3 : 2);
      else if (y < 0.33) penalise(att, "10s", "causing a collision", L, t, serious ? 2 : 1);
      else penalise(att, "5s", "causing a collision", L, t, serious && y < 0.6 ? 1 : 0);
    }
    if (dnfs) neutralise(RACE.scAfterCrash * (0.5 + c.sc), 0.22, RACE.redAfterCrash * c.sc * dnfs, r);
    else yellow(att, L, t);
  }

  // ---- key moments (player's cars only) ----
  const focus = new Set(input.focus ?? []);
  const momentMode = input.moments ?? "off";
  const replaying = !!input.choices;
  const lastMoment = new Map<number, number>(); // car -> lap of its last moment
  const seenSits = new Map<string, number>();
  const shown = new Map<number, number>();
  const nameOf = (car: CarState) => car.e.name ?? car.e.driverId;
  const mrngFor = (tag: string) => makeRng(hashString(`${input.seed}:moment:${tag}`));

  /** May this car get a moment now? (spacing and a cap per race, more often late on) */
  function momentOk(car: CarState, L: number, kind: "call" | "duel"): boolean {
    if (!focus.has(car.idx) || momentMode === "off") return false;
    const since = L - (lastMoment.get(car.idx) ?? -99);
    if (momentMode === "all") return kind === "duel" ? since >= 1 : since >= 3;
    return since >= (laps - L < 6 ? 1 : 3) && (shown.get(car.idx) ?? 0) < 9;
  }

  function ctxFor(me: CarState, opp: CarState | null, L: number, flag: Flag, restart: boolean): MCtx {
    const pos = state.order.indexOf(me.idx) + 1;
    const ahead = pos > 1 ? cars[state.order[pos - 2]] : null;
    const behind = pos < state.order.length ? cars[state.order[pos]] : null;
    const fx = dialFx(me.dials, me.battery);
    const burn = RACE.fuelPerLapKg * fx.burn;
    const mate = cars.find((x) => x !== me && x.e.teamId === me.e.teamId && !x.out);
    const mateBehind = !!mate && behind === mate && mate.cum - me.cum < 1.2 && mate.age + 4 < me.age;
    return {
      lap: L,
      laps,
      left: laps - L + 1,
      pos,
      me: nameOf(me),
      opp: opp ? nameOf(opp) : ahead ? nameOf(ahead) : "",
      gap: opp ? Math.abs(opp.cum - me.cum) : ahead ? me.cum - ahead.cum : 99,
      behindGap: behind ? behind.cum - me.cum : 99,
      flag,
      restart,
      wear: me.wear,
      tyreLapsLeft: Math.max(0, (1 - me.wear) / (wearRate(me.e.r)[me.compound] * fx.wear)),
      stopDue: me.plan.length > 1 ? me.plan[0].until - L : null,
      battery: me.battery,
      fuelShort: me.fuel - burn * (laps - L + 1) < -0.3,
      strikes: me.strikes,
      mateBehindFaster: mateBehind,
      mate: mate ? nameOf(mate) : "",
      forLead: pos === 2,
      forPodium: pos >= 2 && pos <= 4,
      forPoints: pos >= 2 && pos <= 11,
      teammateFight: !!opp && opp.e.teamId === me.e.teamId,
    };
  }

  /** Ask the player (or read the stored answer). Records every answer. */
  function* ask(m: PendingMoment): Generator<PendingMoment, string, string | undefined> {
    let opt: string;
    if (replaying) opt = input.choices!.find((x) => x.lap === m.lap && x.car === m.car && x.sit === m.sit)?.opt ?? "auto";
    else opt = (yield m) ?? "auto";
    if (!m.opts.some((o) => o.id === opt && !o.disabled)) opt = "auto";
    state.choices.push({ lap: m.lap, car: m.car, sit: m.sit, opt });
    lastMoment.set(m.car, m.lap);
    shown.set(m.car, (shown.get(m.car) ?? 0) + 1);
    seenSits.set(m.sit, (seenSits.get(m.sit) ?? 0) + 1);
    return opt;
  }
  const pen = (id: string) => 1 / (1 + (seenSits.get(id) ?? 0) * 0.8);

  /** Resolve a duel the player answered: the other driver picks by habit, the payoff table shifts the odds. */
  function duel(x: CarState, y: CarState, me: CarState, opt: string, p0: number, pc0: number, dr: Rng, L: number) {
    let attMove: AttackMove;
    let defMove: DefendMove;
    if (me === x) {
      attMove = opt as AttackMove;
      const tw = tendencies(y.e.driverId, y.e.r.aggression).def;
      defMove = y.battery > 0.4 && dr.chance(0.18) ? "ersDef" : pickWeighted(tw, dr);
      state.seen.push({ driverId: y.e.driverId, role: "def", move: defMove });
    } else {
      defMove = opt as DefendMove;
      const tw = tendencies(x.e.driverId, x.e.r.aggression).att;
      attMove = x.battery > 0.4 && dr.chance(0.18) ? "ers" : pickWeighted(tw, dr);
      state.seen.push({ driverId: x.e.driverId, role: "att", move: attMove });
    }
    if (attMove === "ers") {
      x.battery = Math.max(0, x.battery - 0.25);
      x.ctl = true;
    }
    if (defMove === "ersDef") {
      y.battery = Math.max(0, y.battery - 0.2);
      y.ctl = true;
    }
    let passed = false;
    let hit = false;
    let wait = false;
    if (attMove === "wait") wait = true;
    else if (defMove === "yield") {
      passed = true;
      y.wear = Math.max(0, y.wear - 0.01);
    } else {
      const m = PAYOFF[attMove][defMove];
      const odds = (m / (1 - m)) * (p0 / (1 - p0));
      const p = clamp(odds / (1 + odds), 0.03, 0.97);
      hit = dr.chance(Math.min(0.5, pc0 * CONTACT[attMove][defMove] * 1.6));
      passed = !hit && dr.chance(p);
      if (attMove === "late" && !passed && !hit && dr.chance(0.12)) lose(x, 0.8 + dr.next()); // locked up
      if (defMove === "lateDef" && !passed && dr.chance(0.14)) penalise(y, "5s", "moving under braking", L, x.cum + (y.cum - x.cum), 0);
    }
    state.duels.push({ lap: L, att: x.idx, def: y.idx, attMove, defMove, passed, contact: hit, player: me.idx });
    ev({ lap: L, t: x.cum + 1, kind: "duel", a: x.idx, b: y.idx, info: `${attMove}|${defMove}|${passed ? 1 : 0}|${me.idx}` });
    return { passed, hit, wait };
  }

  /** A local yellow where something happened (the viewer shows the sector). */
  function yellow(car: CarState, L: number, t: number) {
    const frac = clamp((t - car.cum) / base, 0, 0.999); // how far round the lap
    ev({ lap: L, t, kind: "yellow", a: car.idx, info: String(1 + Math.floor(frac * 3)) });
  }

  function* lap(): Generator<PendingMoment, void, string | undefined> {
    if (state.lap >= laps) return;
    const L = state.lap + 1;
    const flag = state.flag;
    lapExtra = new Map();
    const restart = state.restart;
    state.restart = false;
    if (flag !== "green") state.flagLog.push({ lap: L, flag });
    const standing = state.standing;
    state.standing = false;
    const running = state.order.map((i) => cars[i]).filter((x) => !x.out);

    // Commands for this lap (dials, pit calls, team orders).
    const letBy = new Set<number>();
    for (const cmd of queue.filter((x) => x.lap === L)) {
      const car = cars[cmd.car];
      state.commands.push(cmd);
      if (!car || car.out) continue;
      car.ctl = true;
      if (cmd.dials) car.dials = { ...car.dials, ...cmd.dials };
      if (cmd.pit === "box") car.box = cmd.compound ?? "auto";
      if (cmd.pit === "stay") car.hold = true;
      if (cmd.letBy) letBy.add(car.idx);
    }
    // strategy and radio calls for the player's cars
    for (const car of running) {
      if (!momentOk(car, L, "call") || L >= laps) continue;
      const cx = ctxFor(car, null, L, flag, restart);
      const mr = mrngFor(`call:${L}:${car.idx}`);
      const s = chooseSit(cx, "call", mr, pen);
      if (!s?.calls) continue;
      if (momentMode === "key" && !mr.chance(Math.min(0.85, s.w(cx) / 16 + 0.1))) continue;
      const ahead = cx.pos > 1 ? cars[state.order[cx.pos - 2]] : null;
      const behind = cars[state.order[cx.pos]];
      const extra = { behind: behind ? nameOf(behind) : "the car behind", opp: ahead ? nameOf(ahead) : "the car ahead" };
      const opt = yield* ask({
        id: `${L}:${car.idx}:${s.id}`, kind: "call", sit: s.id, car: car.idx, lap: L, t: car.cum,
        title: fill(mr.pick(s.title), cx, extra), text: fill(mr.pick(s.text), cx, extra),
        opts: s.calls.map((o) => ({ id: o.id, label: o.label, hint: o.hint })),
      });
      const o = s.calls.find((x) => x.id === opt);
      if (!o) continue;
      if (o.dials) {
        car.ctl = true;
        car.dials = { ...car.dials, ...o.dials };
      }
      if (o.pit === "box") car.box = "auto";
      if (o.pit === "stay") car.hold = true;
      if (o.letBy) letBy.add(car.idx);
    }

    // what each touched car's dials do this lap
    const fxs = new Map<number, DialFx>();
    for (const car of running) if (car.ctl) fxs.set(car.idx, dialFx(car.dials, car.battery));

    // Dirty air from the gaps at the start of the lap.
    for (let k = 0; k < running.length; k++) running[k].dirty = k > 0 && running[k].cum - running[k - 1].cum < 1.0;

    // Pit calls.
    const pitting = new Set<number>();
    for (const car of running) {
      if (L >= laps || flag === "red") break;
      const left = laps - L;
      let pit = car.forcePit || car.box !== null;
      if (!pit && car.plan.length > 1 && car.plan[0].until <= L && !car.hold) pit = true;
      if (!pit && car.wear > 1.04 && left > 2 && !car.hold) pit = true;
      if (!pit && flag !== "green" && L - car.lastPit > 4 && left > 3 && !car.hold) {
        // a cheap stop under a safety car: compare staying out with a new set now
        const loss = flag === "sc" ? pitLoss.sc : pitLoss.vsc;
        const maxStops = left > 36 ? 2 : 1;
        const stay = plans({ from: L, laps, wear: wearRate(car.e.r), base, pitLoss: pitLoss.normal, used: car.used, first: { c: car.compound, age: car.age }, maxStops })[0];
        const now = plans({ from: L, laps, wear: wearRate(car.e.r), base, pitLoss: pitLoss.normal, used: car.used, maxStops })[0];
        if (stay && now && now.cost + loss < stay.cost - 1.5) pit = true;
      }
      if (pit) pitting.add(car.idx);
    }

    // Potential lap times.
    const pot = new Map<number, number>();
    const teamStops = new Map<string, number>();
    const pitTime = new Map<number, number>();
    for (const car of running) {
      const r = car.e.r;
      let t: number;
      if (flag === "sc" || flag === "red") t = base * RACE.scLapFactor + rng.normal(0, 0.1);
      else if (flag === "vsc") t = base * RACE.vscLapFactor + rng.normal(0, 0.1);
      else {
        t = base * (1 + RACE.raceSpread * (RACE.carK * (100 - car.e.car) + RACE.drvK * (100 - r.pace)));
        t += tyreCost(car.compound, car.wear + wearRate(r)[car.compound] / 2, base);
        t += car.fuel * RACE.fuelSecPerKg + (car.e.form ?? 0) * base;
        t += car.damage;
        const fx = fxs.get(car.idx);
        if (fx) {
          t += (fx.sec * base) / 90;
          // a tank that can't make the lap: lift and coast
          const burn = RACE.fuelPerLapKg * fx.burn;
          car.lift = car.fuel < burn - 0.05;
          if (car.lift) t += ((DIAL.liftSec * base) / 90) * (1 + (3 * Math.max(0, burn * 0.75 - car.fuel)) / burn);
        }
        if (car.dirty) t += RACE.dirtyAir;
        if (car.age === 0 && L > 1) t += 0.4; // tyres coming in
        t += rng.normal(0, RACE.noise + (100 - r.consistency) * RACE.noisePerPoint);
        if (rng.chance(RACE.mistake * (1 + (100 - r.consistency) / 25) * (fx?.risk ?? 1))) {
          const lost = 0.6 + rng.next() * 2.6;
          t += lost;
          ev({ lap: L, t: car.cum + t * 0.6, kind: "mistake", a: car.idx, info: lost.toFixed(1) });
        }
      }
      if (L === 1) t += RACE.startLoss;
      if (standing) t += RACE.startLoss + (car.e.r.starts - 75) * -0.012 + rng.normal(0, RACE.launchSd);
      if (flag === "green" && L > 1) {
        // track limits: three strikes and the black-and-white flag, then five seconds each
        if (rng.chance(RACE.trackLimits * car.prone * (0.6 + r.aggression / 100) * (fxs.get(car.idx)?.risk ?? 1))) {
          car.strikes++;
          const at = car.cum + t * (0.2 + 0.6 * rng.next());
          ev({ lap: L, t: at, kind: "limits", a: car.idx, info: String(car.strikes) });
          if (car.strikes === 3) ev({ lap: L, t: at, kind: "bw", a: car.idx });
          if (car.strikes >= 4) penalise(car, "5s", "track limits", L, at, 0);
        }
        // a drive-through / stop-go owed: served this lap
        if (car.owed && !pitting.has(car.idx) && laps - L >= 1) {
          const x = car.owed === 1 ? pitLoss.normal - 2 : pitLoss.normal + 9;
          t += x;
          ev({ lap: L, t: car.cum + t, kind: "served", a: car.idx, info: car.owed === 1 ? "drive-through" : "stop-go", x });
          car.owed = 0;
        }
      }
      if (pitting.has(car.idx)) {
        let loss = flag === "sc" ? pitLoss.sc : flag === "vsc" ? pitLoss.vsc : pitLoss.normal;
        loss += rng.normal(0, 0.4);
        if (car.e.pit !== undefined) loss += (70 - car.e.pit) * 0.012; // a better crew is quicker
        if (rng.chance(RACE.slowStop * (car.e.pit === undefined ? 1 : Math.max(0.3, 1.8 - car.e.pit / 60)))) {
          const extra = 2 + rng.next() * 7;
          loss += extra;
          ev({ lap: L, t: car.cum + t, kind: "slowstop", a: car.idx, info: extra.toFixed(1) });
        }
        // double stack under a neutralisation: the second car waits
        const n = teamStops.get(car.e.teamId) ?? 0;
        if (n && flag !== "green") loss += 3.5;
        teamStops.set(car.e.teamId, n + 1);
        if (car.penalty >= 5 && rng.chance(0.85)) {
          loss += car.penalty; // served at the stop
          car.penalty = 0;
        }
        if (rng.chance(RACE.unsafeRelease)) penalise(car, "5s", "unsafe release", L, car.cum + t + loss, 0);
        else if (rng.chance(RACE.pitSpeeding)) penalise(car, "5s", "speeding in the pit lane", L, car.cum + t + loss, 0);
        t += loss;
        pitTime.set(car.idx, loss);
      }
      pot.set(car.idx, car.cum + t);
    }

    // Team orders: the car told to move over finishes the lap just behind its team-mate.
    for (const idx of letBy) {
      const car = cars[idx];
      const mate = running.find((x) => x !== car && x.e.teamId === car.e.teamId);
      if (!mate || car.out || pitting.has(idx) || pitting.has(mate.idx) || flag !== "green") continue;
      const behind = mate.cum - car.cum;
      if (behind <= 0 || behind > 2.5) continue;
      pot.set(idx, Math.max(pot.get(idx)!, pot.get(mate.idx)! + 0.6));
      ev({ lap: L, t: car.cum + (pot.get(idx)! - car.cum) * 0.5, kind: "teamorder", a: idx, b: mate.idx });
    }

    // Road order, front to back.
    const fin = new Map<number, number>();
    const list: CarState[] = [];
    const fights = new Map<number, number>();
    if (flag === "sc" || flag === "red") {
      // the pack closes up behind the safety car (or into the pit lane under a red); stops drop cars back
      let prev = -Infinity;
      const stay = running.filter((x) => !pitting.has(x.idx));
      for (let k = 0; k < stay.length; k++) {
        const car = stay[k];
        const p = pot.get(car.idx)!;
        const gap = k === 0 ? 0 : car.cum - stay[k - 1].cum;
        // (a car laps down can't gain more than its own lap on the field: at least a base lap)
        const f = k === 0 ? p : Math.max(car.cum + base, prev + RACE.scGap, Math.min(p, prev + Math.max(RACE.scGap, gap * 0.35)));
        fin.set(car.idx, f);
        prev = f;
        list.push(car);
      }
      for (const car of running.filter((x) => pitting.has(x.idx))) {
        fin.set(car.idx, pot.get(car.idx)!);
        list.push(car);
      }
      list.sort((a, b) => fin.get(a.idx)! - fin.get(b.idx)!);
      for (let k = 1; k < list.length; k++) {
        const need = fin.get(list[k - 1].idx)! + RACE.scGap * 0.5;
        if (fin.get(list[k].idx)! < need) fin.set(list[k].idx, need);
      }
    } else {
      for (const x of running) {
        let f = pot.get(x.idx)!;
        let at = list.length; // insert position
        while (at > 0) {
          const y = list[at - 1];
          const fy = fin.get(y.idx)!;
          if (f >= fy + RACE.minGap) break;
          const pitInvolved = pitting.has(x.idx) || pitting.has(y.idx);
          if (pitInvolved || y.out) {
            if (f < fy) {
              at--;
              continue;
            }
            break;
          }
          // team orders: the team-mate ahead moves over, no fight
          if (letBy.has(y.idx) && y.e.teamId === x.e.teamId) {
            f = Math.min(f, fy - 0.05);
            fin.set(y.idx, Math.max(fy, f + 0.4));
            at--;
            continue;
          }
          // a real fight
          let duelRng: Rng | null = null;
          const n = fights.get(x.idx) ?? 0;
          const canFight = flag === "green" && n < 2 && !(L === 1 && f >= fy);
          let ok = false;
          if (canFight) {
            fights.set(x.idx, n + 1);
            let adv = fy + RACE.minGap - f;
            if (fxs.size) adv += (fxs.get(x.idx)?.attack ?? 0) - (fxs.get(y.idx)?.defend ?? 0); // ERS overtake / defend mode
            let T = RACE.passT[otIdx];
            if (L === 1 || restart) T *= 0.7;
            const late = laps - L < 8 ? 1 : 0;
            const press = (car: CarState) => late * (100 - car.e.r.composure) * 0.15;
            const skill = (x.e.r.overtaking - press(x) - (y.e.r.defending - press(y))) / 100 + (x.e.r.racecraft - y.e.r.racecraft) / 200;
            const z = (adv - T) / (0.25 * T + 0.1) + skill * RACE.passSkill;
            const p = 1 / (1 + Math.exp(-z));
            const pc = RACE.contact * (0.6 + x.e.r.aggression / 125) * (1.45 - x.e.r.racecraft / 200) * (L === 1 ? 2.2 : 1);
            // a duel for the player's car?
            const me = focus.has(x.idx) ? x : focus.has(y.idx) ? y : null;
            let ans = "auto";
            if (me && L > 1 && momentOk(me, L, "duel")) {
              const opp = me === x ? y : x;
              const cx = ctxFor(me, opp, L, flag, restart);
              const mr = mrngFor(`duel:${L}:${x.idx}:${y.idx}`);
              const role = me === x ? "attack" : "defend";
              const s = chooseSit(cx, "duel", mr, (id) => (id.startsWith(role === "attack" ? "att-" : "def-") ? pen(id) : 0));
              if (s && (momentMode === "all" || mr.chance(Math.min(0.9, s.w(cx) / 14 + 0.12)))) {
                const extra = { target: role === "attack" ? cx.pos - 1 : cx.pos };
                const moves = role === "attack" ? (Object.keys(ATTACK_LABEL) as AttackMove[]) : (Object.keys(DEFEND_LABEL) as DefendMove[]);
                ans = yield* ask({
                  id: `${L}:${me.idx}:${s.id}`, kind: role, sit: s.id, car: me.idx, vs: opp.idx, lap: L, t: Math.min(x.cum, y.cum),
                  title: fill(mr.pick(s.title), cx, extra), text: fill(mr.pick(s.text), cx, extra),
                  read: readText(input.reads, opp.e.driverId, role === "attack" ? "def" : "att"),
                  opts: moves.map((mv) => {
                    const [label, hint] = role === "attack" ? ATTACK_LABEL[mv as AttackMove] : DEFEND_LABEL[mv as DefendMove];
                    const disabled = (mv === "ers" && me.battery < 0.25) || (mv === "ersDef" && me.battery < 0.2);
                    return { id: mv, label, hint, disabled };
                  }),
                });
              }
            }
            if (ans !== "auto" && me) {
              const dr = makeRng(hashString(`${input.seed}:duel:${L}:${x.idx}:${y.idx}`));
              duelRng = dr;
              const res = duel(x, y, me, ans, p, pc, dr, L);
              if (res.hit) {
                contact(x, y, L, x.cum + (f - x.cum) * 0.5, dr);
                if (x.out) break;
                f = Math.max(f, fy + RACE.minGap) + (x.damage ? 1.5 : 0);
                break;
              }
              if (res.wait) {
                f = fy + RACE.minGap + dr.next() * 0.3;
                x.wear = Math.max(0, x.wear - 0.004);
                break;
              }
              ok = res.passed;
            } else {
              if (rng.chance(pc)) {
                contact(x, y, L, x.cum + (f - x.cum) * 0.5);
                if (x.out) break;
                f = Math.max(f, fy + RACE.minGap) + (x.damage ? 1.5 : 0);
                break;
              }
              ok = rng.chance(p);
            }
          }
          const rr = duelRng ?? rng;
          duelRng = null;
          if (ok) {
            const t = x.cum + (f - x.cum) * (0.3 + rr.next() * 0.6);
            ev({ lap: L, t, kind: "pass", a: x.idx, b: y.idx });
            x.passes++;
            state.passes++;
            f = Math.min(f, fy - 0.05);
            fin.set(y.idx, Math.max(fy, f + RACE.passLoss) + (canFight ? RACE.passLoss * 0.5 : 0));
            at--;
            continue;
          }
          // can't get by: drop back a little to cool the tyres and try again later
          f = fy + RACE.minGap + rr.next() * 0.9;
          break;
        }
        if (x.out) continue;
        fin.set(x.idx, f);
        list.splice(at, 0, x);
        // keep everyone he passed behind him
        for (let k = at + 1; k < list.length; k++) {
          const need = fin.get(list[k - 1].idx)! + 0.15;
          if (fin.get(list[k].idx)! < need) fin.set(list[k].idx, need);
        }
      }
    }

    // Blue flags: a car about to be lapped has to let the leaders by (both lose a little).
    if (flag === "green" && L > 2) {
      for (const x of list) {
        if (x.out || pitting.has(x.idx)) continue;
        const fx0 = fin.get(x.idx)!;
        for (const y of list) {
          if (y === x || y.out || pitting.has(y.idx)) continue;
          const lapT = fin.get(y.idx)! - y.cum;
          const g0 = y.cum - x.cum;
          const g1 = fin.get(y.idx)! - fx0;
          if (!(g0 > 0 && g0 < lapT && g1 >= lapT)) continue;
          const tAt = x.cum + (fx0 - x.cum) * clamp((lapT - g0) / Math.max(0.1, g1 - g0), 0, 1);
          ev({ lap: L, t: tAt, kind: "blue", a: y.idx, b: x.idx });
          lose(y, RACE.blueLoss[0] * (0.5 + rng.next()));
          lose(x, RACE.blueLoss[1] * rng.next());
          if (rng.chance(RACE.blueIgnore * (0.5 + y.e.r.aggression / 100))) {
            y.blueIgnored++;
            lose(x, 0.6);
            if (y.blueIgnored === 3) penalise(y, "5s", "ignoring blue flags", L, tAt, 1);
          }
        }
      }
    }

    // First-lap incident in the pack.
    if (L === 1 && list.length > 8 && rng.chance(RACE.lap1Contact * (0.6 + c.sc) * (1 + c.overtake / 5))) {
      const k = 3 + Math.floor(rng.next() * (list.length - 4));
      const att = list[k];
      const def = list[k - 1];
      if (!att.out && !def.out) contact(att, def, 1, (att.cum + (fin.get(att.idx) ?? att.cum)) / 2 - 20);
    }

    // Retirements (green or not).
    for (const car of list) {
      if (car.out) continue;
      const f = fin.get(car.idx)!;
      const tMid = car.cum + (f - car.cum) * rng.next();
      if (rng.chance((RACE.mech * (100 - car.e.reliability) / 100) * (fxs.get(car.idx)?.mech ?? 1))) {
        retire(car, "Mechanical", L, tMid);
        neutralise(RACE.scAfterMech * (0.5 + c.sc), RACE.vscAfterMech);
        yellow(car, L, tMid);
        continue;
      }
      if (flag !== "green") continue;
      const r = car.e.r;
      const pCrash = RACE.crash * (1 + (100 - r.consistency) / 18) * (0.7 + r.aggression / 160) * (L === 1 ? 4 : 1) * (car.wear > 1 ? 2 : 1) * (fxs.get(car.idx)?.risk ?? 1);
      if (rng.chance(pCrash)) {
        retire(car, "Crash", L, tMid);
        yellow(car, L, tMid);
        neutralise(RACE.scAfterCrash * (0.5 + c.sc), 0.22, RACE.redAfterCrash * c.sc);
      }
    }
    if (flag === "green" && rng.chance((RACE.debrisSc * c.sc) / laps)) callFlag(rng.chance(0.7) ? "sc" : "vsc");

    // Commit the lap.
    const done = list.filter((x) => !x.out);
    const wasLeader = state.order[0];
    for (const car of done) {
      const f = fin.get(car.idx)! + (lapExtra.get(car.idx) ?? 0);
      fin.set(car.idx, f);
      car.last = f - car.cum;
      const r = car.e.r;
      const neutral = flag !== "green";
      const fx = fxs.get(car.idx);
      car.wear += wearRate(r)[car.compound] * (neutral ? 0.3 : 1) * (car.dirty ? RACE.dirtyWear : 1) * (1 + (0.08 * car.fuel) / (laps * RACE.fuelPerLapKg)) * (fx && !neutral ? fx.wear : 1);
      car.age++;
      car.fuel = Math.max(0, car.fuel - RACE.fuelPerLapKg * (neutral ? 0.55 : 1) * (fx && !neutral ? fx.burn * (car.lift ? 0.75 : 1) : 1));
      if (fx) car.battery = clamp(car.battery + (neutral ? 0.06 : fx.flow), 0, 1); // the battery refills behind the safety car
      car.hold = false;
      car.lift = false;
      if (!neutral && !pitting.has(car.idx) && L > 1 && car.last < car.best) {
        car.best = car.last;
        if (!state.fastest || car.last < state.fastest.time) {
          state.fastest = { car: car.idx, time: car.last, lap: L };
          if (L > 3) ev({ lap: L, t: f, kind: "fastest", a: car.idx, info: car.last.toFixed(3) });
        }
      }
      if (pitting.has(car.idx)) {
        car.stints[car.stints.length - 1].to = L;
        const want = car.box && car.box !== "auto" ? car.box : undefined;
        car.box = null;
        const p = choosePlan(car, L, false, undefined, want);
        car.plan = p.stints;
        car.compound = p.stints[0].c;
        if (!car.used.includes(car.compound)) car.used.push(car.compound);
        car.stints.push({ c: car.compound, from: L + 1, to: laps });
        car.wear = 0;
        car.age = 0;
        car.pits++;
        car.lastPit = L;
        car.forcePit = false;
        car.damage = Math.max(0, car.damage - 0.5);
        ev({ lap: L, t: f, kind: "pit", a: car.idx, info: car.compound, x: pitTime.get(car.idx) });
      } else if (flag === "red" && laps - L > 2) {
        // red flag: everyone in the pit lane, a free change of tyres
        car.stints[car.stints.length - 1].to = L;
        const p = choosePlan(car, L, false);
        car.plan = p.stints;
        car.compound = p.stints[0].c;
        if (!car.used.includes(car.compound)) car.used.push(car.compound);
        car.stints.push({ c: car.compound, from: L + 1, to: laps });
        car.wear = 0;
        car.age = 0;
      } else if (car.plan.length > 1 && car.plan[0].until < L) {
        // missed the planned stop (neutralisation, etc.): re-plan from here
        car.plan = choosePlan(car, L, true).stints;
      }
      car.cum = f;
      car.laps = L;
      state.lapEnd[car.idx].push(f);
    }
    state.order = done.sort((a, b) => a.cum - b.cum).map((x) => x.idx);
    if (state.order[0] !== wasLeader && L > 1) leadChanges++;
    state.lap = L;

    // Flags for the next lap.
    if (flag !== "green") {
      state.flagLaps--;
      if (state.flagLaps <= 0) {
        state.flag = "green";
        state.restart = flag === "sc" || flag === "red";
        state.standing = flag === "red";
        ev({ lap: L, t: cars[state.order[0]]?.cum ?? 0, kind: flag === "red" ? "restart" : "green", a: state.order[0] ?? 0 });
      }
    } else if (pendingFlag) {
      state.flag = pendingFlag;
      state.flagLaps = pendingFlag === "sc" ? 3 + Math.floor(rng.next() * 3) : pendingFlag === "red" ? 1 : 2 + Math.floor(rng.next() * 2);
      if (pendingFlag === "sc") state.sc++;
      else if (pendingFlag === "red") state.red++;
      else state.vsc++;
      ev({ lap: L, t: cars[state.order[0]]?.cum ?? 0, kind: pendingFlag, a: state.order[0] ?? 0 });
    }
    pendingFlag = null;
  }

  function result(): RaceResult {
    const finishers = cars.filter((x) => !x.out);
    const leader = finishers.reduce((a, b) => (b.cum < a.cum ? b : a), finishers[0]);
    const T = leader ? leader.cum : 0;
    type Row = Omit<ResultRow, "pos" | "points">;
    const rows: Row[] = cars.map((x) => {
      // a drive-through or stop-go not served in time becomes 20 / 30 seconds
      const owed = x.owed === 1 ? 20 : x.owed === 2 ? 30 : 0;
      const base = { idx: x.idx, driverId: x.e.driverId, teamId: x.e.teamId, grid: x.e.grid, pits: x.pits, fastest: x.best, passes: x.passes, stints: x.stints, penalty: x.penalty + owed, pens: x.pens, pp: x.pp };
      if (x.out) return { ...base, laps: x.outLap - 1, time: x.outT, gap: 0, status: x.out };
      // the lap on which he crossed the line after the leader finished
      const ends = state.lapEnd[x.idx];
      let l = laps;
      for (let k = 1; k < ends.length; k++)
        if (ends[k] >= T) {
          l = k;
          break;
        }
      const time = ends[l] + x.penalty + owed;
      return { ...base, laps: l, time, gap: l === laps ? time - T : 0, status: l === laps ? "Finished" : "Lapped" };
    });
    const ranked = rows.sort((a, b) => {
      const fa = a.status === "Finished" || a.status === "Lapped";
      const fb = b.status === "Finished" || b.status === "Lapped";
      if (fa !== fb) return fa ? -1 : 1;
      if (a.laps !== b.laps) return b.laps - a.laps;
      return a.time - b.time;
    });
    const winTime = ranked[0]?.time ?? 0;
    const out: ResultRow[] = ranked.map((r, k) => {
      const fin = r.status === "Finished" || r.status === "Lapped";
      return { ...r, pos: k + 1, gap: r.status === "Finished" ? r.time - winTime : r.gap, points: fin && k < POINTS.length ? POINTS[k] : 0 };
    });
    return {
      rows: out,
      sc: state.sc,
      vsc: state.vsc,
      red: state.red,
      passes: state.passes,
      fastest: state.fastest ? { idx: state.fastest.car, time: state.fastest.time, lap: state.fastest.lap } : null,
      leadChanges,
    };
  }

  function command(cmd: Omit<Command, "lap">) {
    queue.push({ ...cmd, lap: state.lap + 1 });
  }

  function forecast(idx: number): Forecast {
    const car = cars[idx];
    const fx = dialFx(car.dials, car.battery);
    const left = laps - state.lap;
    const wpl = wearRate(car.e.r)[car.compound] * fx.wear;
    const burn = RACE.fuelPerLapKg * fx.burn;
    const margin = car.fuel - burn * left;
    return {
      tyreLapsLeft: Math.max(0, (1 - car.wear) / wpl),
      tyreWear: car.wear,
      battery: car.battery,
      batteryEmptyLap: fx.flow < 0 && car.battery > 0 ? state.lap + Math.ceil(car.battery / -fx.flow) : null,
      fuel: car.fuel,
      fuelMargin: margin,
      fuelShortLap: margin < -0.05 ? state.lap + Math.floor(car.fuel / burn) + 1 : null,
      lapDelta: (fx.sec * base) / 90,
      nextStop: car.box ? { lap: state.lap + 1, compound: car.box === "auto" ? "?" : car.box } : car.plan.length > 1 ? { lap: car.plan[0].until, compound: car.plan[1].c } : null,
    };
  }

  // the runner: a lap is a generator that can stop at a moment until the player answers
  let gen: Generator<PendingMoment, void, string | undefined> | null = null;
  let waiting: PendingMoment | null = null;
  let answer: string | undefined;
  function step() {
    if (!gen) {
      if (state.lap >= laps) return;
      gen = lap();
      answer = undefined;
    }
    if (waiting && answer === undefined) return;
    const r = gen.next(answer);
    answer = undefined;
    if (r.done) {
      gen = null;
      waiting = null;
    } else waiting = r.value;
  }

  return {
    state, input, step, done: () => state.lap >= laps && !gen, result, command, forecast,
    pending: () => waiting,
    choose: (opt: string) => {
      if (waiting) answer = opt;
    },
  };
}

export function simRace(input: RaceInput): { result: RaceResult; state: RaceState } {
  const r = createRace(input);
  while (!r.done()) {
    r.step();
    if (r.pending()) r.choose("auto");
  }
  return { result: r.result(), state: r.state };
}
