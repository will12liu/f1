// The race engine: a lap-by-lap runner (`createRace`), deterministic from the seed. `simRace` drains it.
// Each lap: pit calls -> every car's potential lap time (car, driver, tyres, fuel, dirty air, noise) ->
// road order resolved front to back (a car that would cross the line ahead of the car in front must pass
// it; failing leaves him stuck behind) -> retirements, contact, safety cars -> tyres, fuel, records.
// The replay (race/replay.ts) rebuilds positions from `lapEnd` and `events`.
import { makeRng, type Rng } from "../rng";
import type { CircuitDef, Compound, DnfReason, DriverRatings, PitLoss } from "../types";
import { DIAL, dialFx, NEUTRAL, type Command, type DialFx, type Dials, type Forecast } from "./dials";
import { POINTS, RACE, tyreCost, tyreLife } from "./model";
import { plans, type Stint, type WearRate } from "./strategy";

export interface Entry {
  driverId: string;
  teamId: string;
  grid: number; // 1-based
  car: number; // car pace at this track (0-100)
  reliability: number;
  r: DriverRatings;
  form?: number; // pace on the day, fraction of the lap (dayForms)
}

export interface RaceInput {
  seed: number;
  circuit: CircuitDef;
  pitLoss?: PitLoss;
  entries: Entry[];
  laps?: number; // override (tests)
  commands?: Command[]; // dial changes and pit calls, each applied at the start of its lap (replays a live race)
}

export type Flag = "green" | "sc" | "vsc";

export type RaceEventKind = "pass" | "pit" | "dnf" | "sc" | "vsc" | "green" | "fastest" | "contact" | "penalty" | "mistake" | "slowstop";

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
}

export interface RaceState {
  laps: number;
  lap: number; // laps completed by the leader
  cars: CarState[];
  order: number[]; // running cars in road order (car indexes)
  flag: Flag;
  flagLaps: number; // laps of the current neutralisation left
  restart: boolean;
  events: RaceEvent[];
  lapEnd: number[][]; // [car][lap] race time at the end of each lap (lap 0 = start position)
  sc: number;
  vsc: number;
  passes: number;
  fastest: { car: number; time: number; lap: number } | null;
  flagLog: { lap: number; flag: Flag }[]; // flag in force on each lap that wasn't green
  commands: Command[]; // every command applied so far (feed back as input.commands to replay the race)
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
  penalty: number;
}

export interface RaceResult {
  rows: ResultRow[];
  sc: number;
  vsc: number;
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
    const pick = ps.length > 1 && ps[1].cost - ps[0].cost < 4 && rng.chance(0.15) ? ps[1] : ps[0];
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
    events: [],
    lapEnd: cars.map((x) => [(x.e.grid - 1) * RACE.gridGap]),
    sc: 0,
    vsc: 0,
    passes: 0,
    fastest: null,
    flagLog: [],
    commands: [],
  };
  const queue: Command[] = (input.commands ?? []).map((x) => ({ ...x }));

  const ev = (e: RaceEvent) => state.events.push(e);

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
  const callFlag = (f: Flag) => {
    if (state.lap >= laps - 1) return; // too late to matter
    if (f === "sc" || !pendingFlag) pendingFlag = f;
  };

  function contact(att: CarState, def: CarState, L: number, t: number) {
    ev({ lap: L, t, kind: "contact", a: att.idx, b: def.idx });
    const x = rng.next();
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
    if (!att.out && (def.out || x < 0.55) && rng.chance(0.45)) {
      const pen = rng.chance(0.75) ? 5 : 10;
      att.penalty += pen;
      ev({ lap: L, t, kind: "penalty", a: att.idx, info: `${pen}s` });
    }
    if (dnfs && rng.chance(clamp(RACE.scAfterCrash * (0.5 + c.sc), 0, 0.95))) callFlag("sc");
    else if (dnfs && rng.chance(0.22)) callFlag("vsc");
  }

  function step() {
    if (state.lap >= laps) return;
    const L = state.lap + 1;
    const flag = state.flag;
    lapExtra = new Map();
    const restart = state.restart;
    state.restart = false;
    if (flag !== "green") state.flagLog.push({ lap: L, flag });
    const running = state.order.map((i) => cars[i]).filter((x) => !x.out);

    // Commands for this lap (dials, pit calls).
    for (const cmd of queue.filter((x) => x.lap === L)) {
      const car = cars[cmd.car];
      state.commands.push(cmd);
      if (!car || car.out) continue;
      car.ctl = true;
      if (cmd.dials) car.dials = { ...car.dials, ...cmd.dials };
      if (cmd.pit === "box") car.box = cmd.compound ?? "auto";
      if (cmd.pit === "stay") car.hold = true;
    }
    // what each touched car's dials do this lap
    const fxs = new Map<number, DialFx>();
    for (const car of running) if (car.ctl) fxs.set(car.idx, dialFx(car.dials, car.battery));

    // Dirty air from the gaps at the start of the lap.
    for (let k = 0; k < running.length; k++) running[k].dirty = k > 0 && running[k].cum - running[k - 1].cum < 1.0;

    // Pit calls.
    const pitting = new Set<number>();
    for (const car of running) {
      if (L >= laps) break;
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
      if (flag === "sc") t = base * RACE.scLapFactor + rng.normal(0, 0.1);
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
      if (pitting.has(car.idx)) {
        let loss = flag === "sc" ? pitLoss.sc : flag === "vsc" ? pitLoss.vsc : pitLoss.normal;
        loss += rng.normal(0, 0.4);
        if (rng.chance(RACE.slowStop)) {
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
        t += loss;
        pitTime.set(car.idx, loss);
      }
      pot.set(car.idx, car.cum + t);
    }

    // Road order, front to back.
    const fin = new Map<number, number>();
    const list: CarState[] = [];
    const fights = new Map<number, number>();
    if (flag === "sc") {
      // the pack closes up behind the safety car; stops drop cars back
      let prev = -Infinity;
      const stay = running.filter((x) => !pitting.has(x.idx));
      for (let k = 0; k < stay.length; k++) {
        const car = stay[k];
        const p = pot.get(car.idx)!;
        const gap = k === 0 ? 0 : car.cum - stay[k - 1].cum;
        const f = k === 0 ? p : Math.max(prev + RACE.scGap, Math.min(p, prev + Math.max(RACE.scGap, gap * 0.35)));
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
          // a real fight
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
            if (rng.chance(pc)) {
              contact(x, y, L, x.cum + (f - x.cum) * 0.5);
              if (x.out) break;
              f = Math.max(f, fy + RACE.minGap) + (x.damage ? 1.5 : 0);
              break;
            }
            ok = rng.chance(p);
          }
          if (ok) {
            const t = x.cum + (f - x.cum) * (0.3 + rng.next() * 0.6);
            ev({ lap: L, t, kind: "pass", a: x.idx, b: y.idx });
            x.passes++;
            state.passes++;
            f = Math.min(f, fy - 0.05);
            fin.set(y.idx, Math.max(fy, f + RACE.passLoss) + (canFight ? RACE.passLoss * 0.5 : 0));
            at--;
            continue;
          }
          // can't get by: drop back a little to cool the tyres and try again later
          f = fy + RACE.minGap + rng.next() * 0.9;
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
        if (rng.chance(RACE.scAfterMech * (0.5 + c.sc))) callFlag("sc");
        else if (rng.chance(RACE.vscAfterMech)) callFlag("vsc");
        continue;
      }
      if (flag !== "green") continue;
      const r = car.e.r;
      const pCrash = RACE.crash * (1 + (100 - r.consistency) / 18) * (0.7 + r.aggression / 160) * (L === 1 ? 4 : 1) * (car.wear > 1 ? 2 : 1) * (fxs.get(car.idx)?.risk ?? 1);
      if (rng.chance(pCrash)) {
        retire(car, "Crash", L, tMid);
        if (rng.chance(clamp(RACE.scAfterCrash * (0.5 + c.sc), 0, 0.95))) callFlag("sc");
        else if (rng.chance(0.22)) callFlag("vsc");
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
        state.restart = flag === "sc";
        ev({ lap: L, t: cars[state.order[0]]?.cum ?? 0, kind: "green", a: state.order[0] ?? 0 });
      }
    } else if (pendingFlag) {
      state.flag = pendingFlag;
      state.flagLaps = pendingFlag === "sc" ? 3 + Math.floor(rng.next() * 3) : 2 + Math.floor(rng.next() * 2);
      if (pendingFlag === "sc") state.sc++;
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
      const base = { idx: x.idx, driverId: x.e.driverId, teamId: x.e.teamId, grid: x.e.grid, pits: x.pits, fastest: x.best, passes: x.passes, stints: x.stints, penalty: x.penalty };
      if (x.out) return { ...base, laps: x.outLap - 1, time: x.outT, gap: 0, status: x.out };
      // the lap on which he crossed the line after the leader finished
      const ends = state.lapEnd[x.idx];
      let l = laps;
      for (let k = 1; k < ends.length; k++)
        if (ends[k] >= T) {
          l = k;
          break;
        }
      const time = ends[l] + x.penalty;
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

  return { state, input, step, done: () => state.lap >= laps, result, command, forecast };
}

export function simRace(input: RaceInput): { result: RaceResult; state: RaceState } {
  const r = createRace(input);
  while (!r.done()) r.step();
  return { result: r.result(), state: r.state };
}
