// A race you drive, on the real circuit: grid, five lights, the field racing a line, DRS, gaps.
// The AI follows the same idea as a real-time race (corner speed, a line, a move for the car ahead).
// Your car uses the qualifying-lap physics. Fixed steps, so a scripted input always finishes the same way.
// The season stores the classification; it does not re-sim this race in the lap engine.
import { hashString, makeRng } from "../../engine/rng";
import type { DrivenRace } from "../../engine/race/driven";
import { RACE } from "../../engine/race/model";
import { accel, at, braking, clamp, EDGE, gripOf, HALF_M, refLap, stepCar, type CarState, type Geo, type Input } from "./drive";

export interface SelfSpec {
  id: string;
  teamId: string;
  name: string;
  code: string;
  grid: number; // 1-based start slot
  skill: number; // AI speed as a share of the perfect lap
  player: boolean;
  grip: number;
  color: string;
  color2?: string;
  num?: number;
}

export interface SelfCar {
  id: string;
  teamId: string;
  name: string;
  code: string;
  grid: number;
  skill: number;
  player: boolean;
  grip: number;
  color: string;
  color2?: string;
  num?: number;
  d: number; // track units, negative on the grid
  x: number; // half-widths, + = left
  v: number;
  vlat: number;
  lap: number;
  dist: number; // track units from the grid, for the order
  last: number;
  best: number;
  ends: number[]; // race time at each line crossing
  finished: boolean;
  finishT: number;
  drsOpen: boolean;
  pen: number;
  passes: number;
  hold: number;
  jump: boolean;
  lapBad: boolean;
  bias: number;
  passT: number;
  passX: number;
  lapMark: number;
  body: CarState;
}

export interface SelfState {
  mode: "race" | "quali";
  laps: number;
  phase: "lights" | "green" | "done";
  clock: number; // lights clock
  raceT: number;
  outDelay: number;
  lights: number; // 0-5 reds still showing
  go: boolean;
  ended: boolean; // quali: the player boxed or did three laps
  minLap: number; // a crossing shorter than this is a partial lap, not a time
  cars: SelfCar[];
  order: number[]; // indexes, leader first
}

/** How quick this car is in the field. A front-runner sits just off the perfect lap; the back is a few percent slower. */
export function selfSkill(car: number, pace: number, seed: number, id: string): number {
  const r = makeRng(hashString(`self:${seed}:${id}`));
  const n = clamp(0.62 * (car / 100) + 0.38 * (pace / 100), 0, 1);
  // a few percent covers the field: DRS can still close a small gap, a slow car loses seconds a lap
  return clamp(0.945 + 0.05 * n + r.normal(0, 0.002), 0.93, 0.998);
}

export { gripOf };

const bodyAt = (d: number, x: number): CarState => ({
  d, x, v: 0, vlat: 0, t: 0, started: false, sector: 0, sectors: [], deleted: false, use: 0, surface: "track", done: false,
});

export function createSelf(seed: number, g: Geo, specs: SelfSpec[], mode: "race" | "quali", laps: number): SelfState {
  const rng = makeRng(seed ^ 0x51f1);
  const others = specs.filter((s) => !s.player);
  const cars: SelfCar[] = specs.map((s) => {
    // qualifying is a flying lap: you start at the line, the field is already around the circuit
    let d: number;
    let x: number;
    let v = 0;
    if (mode === "quali") {
      if (s.player) {
        d = -12 / g.m;
        x = 0;
        v = at(g, g.ref.v, d) * 0.97;
      } else {
        const i = Math.max(0, others.findIndex((o) => o.id === s.id));
        d = ((i + 0.5) / Math.max(1, others.length)) * g.len;
        x = (i % 2 === 0 ? 0.4 : -0.4);
        v = at(g, g.ref.v, d) * s.skill;
      }
    } else {
      d = -(12 + (s.grid - 1) * 8) / g.m;
      x = (s.grid % 2 === 0 ? 1 : -1) * (2.6 / HALF_M);
    }
    const body = bodyAt(d, x);
    body.v = v;
    return {
      ...s,
      d,
      x,
      v,
      vlat: 0,
      lap: 0,
      dist: d,
      last: 0,
      best: 0,
      ends: [],
      finished: false,
      finishT: 0,
      drsOpen: false,
      pen: 0,
      passes: 0,
      hold: 0,
      jump: false,
      lapBad: false,
      bias: (rng.next() - 0.5) * 0.1,
      passT: 0,
      passX: 0,
      lapMark: 0,
      body,
    };
  });
  return {
    mode,
    laps: mode === "quali" ? 0 : Math.max(1, laps),
    phase: "lights",
    clock: 0,
    raceT: 0,
    outDelay: 0.4 + rng.next() * 1.05,
    lights: 0,
    go: false,
    ended: false,
    minLap: g.ref.lap * 0.72,
    cars,
    order: cars.map((_, i) => i).sort((i, j) => cars[j].dist - cars[i].dist),
  };
}

function place(c: SelfCar, g: Geo) {
  c.dist = c.lap * g.len + c.d;
}

function finishLap(c: SelfCar, state: SelfState) {
  const lt = state.raceT - c.lapMark;
  c.lap++;
  c.last = lt;
  c.ends.push(state.raceT);
  const clean = state.mode === "race" || !c.lapBad;
  if (lt >= state.minLap && clean && (!c.best || lt < c.best)) c.best = lt;
  c.lapMark = state.raceT;
  c.lapBad = false;
  if (state.mode === "race" && c.lap >= state.laps && !c.finished) {
    c.finished = true;
    c.finishT = state.raceT + c.pen;
  }
}

function laneFree(state: SelfState, car: SelfCar, lane: number, g: Geo): boolean {
  for (const o of state.cars) {
    if (o === car || o.finished) continue;
    const gap = (o.dist - car.dist) * g.m;
    if (gap > -7 && gap < 14 && Math.abs(o.x - lane) < 0.32) return false;
  }
  return true;
}

function stepAI(state: SelfState, g: Geo, car: SelfCar, dt: number) {
  if (car.finished) {
    car.v = 0;
    return;
  }
  if (car.hold > 0) {
    car.hold -= dt;
    car.v = 0;
    return;
  }
  if (car.v < 2) car.v = 8;
  const wear = 1 - Math.min(0.035, car.lap * 0.0014);
  let target = at(g, g.ref.v, Math.max(0, car.d)) * car.skill * wear;
  let want = at(g, g.line, Math.max(0, car.d)) * 0.72 + car.bias;
  if (car.passT > 0) {
    car.passT -= dt;
    want = car.passX;
  }
  for (const o of state.cars) {
    if (o === car || o.finished) continue;
    const gap = (o.dist - car.dist) * g.m;
    if (gap <= 0 || gap > 42 || Math.abs(o.x - car.x) > 0.55) continue;
    if (car.passT <= 0 && car.v > o.v - 4) {
      const prefer = car.x >= o.x ? 1 : -1;
      for (const sg of [prefer, -prefer]) {
        const lane = clamp(o.x + sg * 0.5, -0.82, 0.82);
        if (laneFree(state, car, lane, g)) {
          car.passX = lane;
          car.passT = 1.7;
          want = lane;
          break;
        }
      }
    }
    if (gap < 18) target = Math.min(target, Math.max(8, o.v - (18 - gap) * 0.4));
  }
  if (car.drsOpen) target *= 1.018;
  const rate = car.v < target ? accel(car.v, g.g) : braking(car.v, g.g) * 0.9;
  car.v += clamp(target - car.v, -rate * dt, rate * dt);
  const step = (1.8 + car.v * 0.015) * dt;
  car.x = clamp(car.x + clamp(want - car.x, -step, step), -0.88, 0.88);
  const before = car.d;
  car.d += (car.v * dt) / g.m;
  if (before < g.len && car.d >= g.len) {
    car.d -= g.len;
    finishLap(car, state);
  }
}

function stepPlayer(state: SelfState, g: Geo, car: SelfCar, inp: Input, dt: number) {
  const body = car.body;
  if (car.finished) {
    body.v = 0;
    car.v = 0;
    return;
  }
  if (car.hold > 0) {
    car.hold -= dt;
    body.v = 0;
    car.v = 0;
    return;
  }
  body.done = false;
  stepCar(g, body, inp, dt, car.grip);
  if (car.drsOpen && inp.throttle > 0.5 && body.v > 20) body.v += 1.05 * dt;
  if (Math.abs(body.x) > EDGE.limit) car.lapBad = true;
  body.done = false;
  if (body.d >= g.len) {
    body.d -= g.len;
    finishLap(car, state);
    body.sector = 0;
    body.sectors = [];
    body.started = true;
    body.deleted = false;
    body.t = 0;
    body.done = false;
  }
  car.d = body.d;
  car.x = body.x;
  car.v = body.v;
  car.vlat = body.vlat;
}

function separate(state: SelfState, g: Geo) {
  const cars = state.cars;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      if (a.finished || b.finished) continue;
      const gap = (b.dist - a.dist) * g.m;
      if (Math.abs(gap) > 6.5 || Math.abs(a.x - b.x) > 0.3) continue;
      const sg = Math.sign(a.x - b.x) || 1;
      const nudge = (c: SelfCar, dir: number) => {
        if (c.player) c.body.x = clamp(c.body.x + dir, -1.2, 1.2);
        else c.x = clamp(c.x + dir, -0.9, 0.9);
      };
      nudge(a, sg * 0.03);
      nudge(b, -sg * 0.03);
      const back = gap >= 0 ? a : b;
      const front = gap >= 0 ? b : a;
      if (back.player) back.body.v *= 0.99;
      else if (back.v > front.v) back.v = front.v;
    }
  }
}

function refreshOrder(state: SelfState) {
  const prev = new Map(state.order.map((idx, pos) => [idx, pos]));
  const next = state.cars.map((_, i) => i).sort((i, j) => state.cars[j].dist - state.cars[i].dist);
  next.forEach((idx, pos) => {
    const was = prev.get(idx);
    if (was !== undefined && pos < was) state.cars[idx].passes++;
  });
  state.order = next;
}

function applyDrs(state: SelfState, g: Geo) {
  for (let k = 0; k < state.order.length; k++) {
    const c = state.cars[state.order[k]];
    const straight = Math.abs(at(g, g.kap, Math.max(0, c.d))) < 0.0016;
    const ahead = k > 0 ? state.cars[state.order[k - 1]] : null;
    const gapM = ahead ? (ahead.dist - c.dist) * g.m : 999;
    const sec = c.v > 8 ? gapM / c.v : 99;
    c.drsOpen = straight && c.lap >= 1 && !c.finished && !!ahead && sec > 0 && sec < 1;
  }
}

/** One fixed step. `inp` is the player's throttle, brake and steer (ignored for a field of AI). */
export function stepSelf(state: SelfState, g: Geo, inp: Input, dt: number) {
  if (state.phase === "done") return;
  if (state.phase === "lights") {
    state.clock += dt;
    state.lights = Math.min(5, Math.floor(state.clock));
    const me = state.cars.find((c) => c.player);
    // a jump is the throttle still held as the lights go out. A tap earlier does not stick.
    if (state.clock >= 5 + state.outDelay) {
      state.phase = "green";
      state.raceT = 0;
      state.go = true;
      if (me && inp.throttle > 0.55) {
        me.jump = true;
        me.hold = 5;
        me.pen = 5;
      }
    }
    return;
  }
  state.raceT += dt;
  state.go = state.raceT < 1.3;
  state.lights = 0;
  for (const c of state.cars) place(c, g);
  for (const c of state.cars) {
    if (c.player) stepPlayer(state, g, c, inp, dt);
    else stepAI(state, g, c, dt);
    place(c, g);
  }
  separate(state, g);
  for (const c of state.cars) {
    if (c.player) {
      c.d = c.body.d;
      c.x = c.body.x;
      c.v = c.body.v;
    }
    place(c, g);
  }
  refreshOrder(state);
  applyDrs(state, g);
  if (state.mode === "quali") {
    const me = state.cars.find((c) => c.player);
    if (state.ended || (me && me.lap >= 3)) state.phase = "done";
  } else {
    const me = state.cars.find((c) => c.player);
    const leader = state.cars[state.order[0]];
    const caught = !state.cars.some((c) => !c.finished && leader && leader.dist - c.dist < g.len * 0.98);
    if (leader?.finished && caught && (!me || me.finished)) state.phase = "done";
  }
}

/** Qualifying: keep the laps already set and stop. */
export function endQuali(state: SelfState) {
  state.ended = true;
}

/** Best clean lap per driver. An AI car that never finished one gets a time off the reference lap. */
export function qualiTimesOf(state: SelfState, g: Geo): Record<string, number> {
  const ref = refLap(g);
  const out: Record<string, number> = {};
  for (const c of state.cars) {
    if (c.best > 0) out[c.id] = Math.round(c.best * 1000) / 1000;
    else if (!c.player) out[c.id] = Math.round((ref / c.skill) * 1000) / 1000;
  }
  return out;
}

export function drivenResult(state: SelfState): DrivenRace {
  const cars = state.cars.slice().sort((a, b) => {
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    if (a.finished && b.finished) return a.finishT - b.finishT;
    return b.dist - a.dist;
  });
  const winner = cars.find((c) => c.finished);
  const rows = cars.map((c, i) => {
    const fin = c.finished;
    return {
      driverId: c.id,
      teamId: c.teamId,
      grid: c.grid,
      pos: i + 1,
      laps: c.lap,
      time: fin ? c.finishT : state.raceT,
      gap: fin && winner ? c.finishT - winner.finishT : 0,
      status: fin ? ("Finished" as const) : ("Lapped" as const),
      best: c.best || 0,
      passes: c.passes,
    };
  });
  const byGrid = state.cars.slice().sort((a, b) => a.grid - b.grid);
  return {
    laps: state.laps,
    rows,
    lapEnd: byGrid.map((c) => [(c.grid - 1) * RACE.gridGap, ...c.ends.map((t) => Math.round(t * 1000) / 1000)]),
    gridIds: byGrid.map((c) => c.id),
  };
}

/** Still running the field home after you took the flag. */
export function settling(state: SelfState): boolean {
  if (state.mode !== "race" || state.phase !== "green") return false;
  const me = state.cars.find((c) => c.player);
  return !!me?.finished;
}
