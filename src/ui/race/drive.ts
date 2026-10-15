// The driving model behind the qualifying lap: the circuit as a centreline with signed curvature (from the
// same outline the race view draws), a simple car (power, drag, brakes, lateral grip that grows with speed),
// a perfect reference lap from a backward/forward speed-profile pass, and a per-track grip factor chosen so
// that perfect lap equals the engine's pole time (so the clock reads like real qualifying). Pure TS, no canvas:
// QualiLap.tsx draws and drives it, drive.test.ts pins the numbers. Nothing here touches the engine's RNG.
import type { TrackFile } from "../components/bits";

export const HALF = 9; // half the road width as drawn, track units
/** Half the road width in the physics, metres: a real F1 track is 12-15 m wide. The drawing is wider than this
 *  (the outline's scale makes 9 units about 18 m), but x is in half-widths so the car sits in the same place. */
export const HALF_M = 7.5;
/** |x| in half-widths: the white line is at 1, the kerb runs to `kerb`, all four wheels are off beyond `limit`. */
export const EDGE = { kerb: 1.2, limit: 1.5, clamp: 1.8 }; // the car is drawn about a third of the road wide, so 1.5 is all four wheels past the kerb

export const CAR = {
  A0: 26, // lateral grip (m/s²) at a crawl, times the track's grip factor
  A2: 0.0035, // downforce: extra lateral grip per (m/s)², capped at 80 m/s
  AMAX: 14, // traction-limited acceleration (m/s²)
  PM: 1000, // power over mass: acceleration = PM / v once power limited
  DRAG: 0.00125, // drag deceleration per (m/s)²: top speed about 330 km/h
  B0: 28, // brakes at a crawl (m/s²), plus the downforce term and drag
  B2: 0.0035,
  STEER: 18, // lateral acceleration the wheel asks for at full lock (m/s²)
  DAMP: 4, // how quickly the car straightens when you let go (1/s)
  slide: 0.75, // share of the missing grip that becomes drift (1 = pure physics; a little forgiveness)
  margin: 1.04, // reference lap = perfect lap x margin: a normal lap for this driver (q 0.55)
  k: 0.08, // q spread: a lap k x reference slower than the reference scores 0, 0.45k quicker scores 1
  skill: 0.0012, // grip per rating point above 75 (quali 60%, pace 40%): about +-3%
};

export interface Ref {
  v: number[]; // perfect-lap speed at each point (m/s)
  t: number[]; // cumulative time at each point from the line (s)
  lap: number; // the perfect lap (s)
  brake: boolean[]; // braking zone at this point
}

export interface Geo {
  n: number;
  len: number; // lap length, track units
  m: number; // metres per track unit
  ds: number; // metres between points
  px: number[];
  py: number[];
  nx: number[]; // left normal (driver's left)
  ny: number[];
  kap: number[]; // signed curvature, rad/m, right turn positive
  line: number[]; // a racing line, half-widths (+ = left), drawn as the guide
  kerb: boolean[];
  pts: [number, number][];
  w: number;
  h: number;
  corners: { n: number; f: number }[];
  g: number; // grip and power factor that makes the perfect lap hit the target
  ref: Ref;
  target: number; // the pole time the perfect lap was tuned to (s)
}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function blur(a: number[], r: number): number[] {
  const n = a.length;
  const out = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = 0;
    let w = 0;
    for (let k = -r; k <= r; k++) {
      const g = Math.exp(-(k * k) / (2 * (r / 2) ** 2));
      s += a[(i + k + n) % n] * g;
      w += g;
    }
    out[i] = s / w;
  }
  return out;
}

export const lateral = (v: number, g: number) => g * CAR.A0 + CAR.A2 * Math.min(v, 80) ** 2;
export const accel = (v: number, g: number) => Math.min(CAR.AMAX * g, (CAR.PM * g) / Math.max(v, 1));
export const braking = (v: number, g: number) => g * CAR.B0 + CAR.B2 * v * v;
export const drag = (v: number) => CAR.DRAG * v * v;
/** Fastest steady speed through curvature k (rad/m); Infinity when the corner is flat out. */
export const vLimit = (k: number, g: number) => (Math.abs(k) > CAR.A2 ? Math.sqrt((g * CAR.A0) / (Math.abs(k) - CAR.A2)) : Infinity);
/** The friction circle: what is left for the brakes and the throttle once a share `use` of the grip is cornering. */
export const circleOf = (use: number) => Math.sqrt(Math.max(0, 1 - use * use));
export const BRAKE_FLOOR = 0.3; // brakes never drop below this share, even at the limit
export const PUSH_FLOOR = 0.35;
const useAt = (v: number, k: number, g: number) => Math.min(1, (v * v * Math.abs(k)) / lateral(v, g));

/** The perfect lap at grip g: corner limits, then brake as late as possible, then accelerate as hard as possible,
 *  with the same friction circle the car has (less braking and traction while the tyres corner). */
export function perfectLap(kap: number[], ds: number, g: number): { lap: number; v: number[] } {
  const n = kap.length;
  const v = kap.map((k) => Math.min(1e3, vLimit(k, g)));
  for (let pass = 0; pass < 2; pass++)
    for (let i = n - 1; i >= 0; i--) {
      const j = (i + 1) % n;
      const b = braking(v[j], g) * Math.max(BRAKE_FLOOR, circleOf(useAt(v[j], kap[j], g))) + drag(v[j]);
      v[i] = Math.min(v[i], Math.sqrt(v[j] ** 2 + 2 * b * ds));
    }
  for (let pass = 0; pass < 2; pass++)
    for (let i = 0; i < n; i++) {
      const j = (i - 1 + n) % n;
      const a = accel(v[j], g) * Math.max(PUSH_FLOOR, circleOf(useAt(v[j], kap[j], g))) - drag(v[j]);
      v[i] = Math.min(v[i], Math.sqrt(Math.max(1, v[j] ** 2 + 2 * a * ds)));
    }
  let lap = 0;
  for (let i = 0; i < n; i++) lap += ds / ((v[i] + v[(i + 1) % n]) / 2);
  return { lap, v };
}

/** Grip factor so the perfect lap takes `target` seconds (more grip = quicker; bisection). */
export function calibrate(kap: number[], ds: number, target: number): number {
  let lo = 0.25;
  let hi = 1.6;
  for (let it = 0; it < 36; it++) {
    const g = (lo + hi) / 2;
    if (perfectLap(kap, ds, g).lap > target) lo = g;
    else hi = g;
  }
  return (lo + hi) / 2;
}

/** Geometry and the reference lap for a track; `km` is the real lap length, `target` the pole time to match. */
export function build(track: TrackFile, km: number, target: number): Geo {
  const pts = track.pts;
  const n = pts.length;
  const px = pts.map((p) => p[0]);
  const py = pts.map((p) => p[1]);
  let len = 0;
  for (let i = 0; i < n; i++) len += Math.hypot(px[(i + 1) % n] - px[i], py[(i + 1) % n] - py[i]);
  const m = (km * 1000) / len;
  const ds = (len / n) * m;
  const nx: number[] = [];
  const ny: number[] = [];
  const turn: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n];
    const b = pts[(i + 1) % n];
    const tx = b[0] - a[0];
    const ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    nx.push(ty / l); // left of the direction of travel (screen y points down)
    ny.push(-tx / l);
    const h1 = Math.atan2(pts[i][1] - a[1], pts[i][0] - a[0]);
    const h2 = Math.atan2(b[1] - pts[i][1], b[0] - pts[i][0]);
    let d = h2 - h1;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    turn.push(d); // positive = clockwise on screen = a right turn for the driver
  }
  const c = blur(turn, 3);
  const kap = c.map((v) => v / ds);
  const cMax = Math.max(...c.map(Math.abs)) || 1;
  const ahead = Math.round(n * 0.018);
  // the guide line: inside at the apex (against the turn), outside on the way in (with the turn ahead)
  const raw = c.map((_, i) => (-1.6 * c[i] + 1.1 * c[(i + ahead) % n]) / cMax);
  const line = blur(raw, 4).map((v) => clamp(v * 1.4, -0.82, 0.82));
  const g = calibrate(kap, ds, target);
  const { lap, v } = perfectLap(kap, ds, g);
  const t: number[] = [0];
  for (let i = 1; i <= n; i++) t.push(t[i - 1] + ds / ((v[i - 1] + v[i % n]) / 2));
  const brake = v.map((s, i) => v[(i + 1) % n] < s - 0.25);
  return { n, len, m, ds, px, py, nx, ny, kap, line, kerb: c.map((x) => Math.abs(x) > cMax * 0.3), pts, w: track.w, h: track.h, corners: track.corners ?? [], g, ref: { v, t, lap, brake }, target };
}

/** Interpolated value at distance d (track units) along the lap. */
export function at(g: Geo, arr: number[], d: number): number {
  const f = ((((d % g.len) + g.len) % g.len) / g.len) * g.n;
  const i = Math.floor(f) % g.n;
  const j = (i + 1) % g.n;
  const u = f - Math.floor(f);
  return arr[i] * (1 - u) + arr[j] * u;
}

/** The perfect lap's time at distance d from the line (0..lap). */
export function refTime(g: Geo, d: number): number {
  const dd = clamp(d, 0, g.len);
  const f = (dd / g.len) * g.n;
  const i = Math.min(g.n - 1, Math.floor(f));
  const u = f - i;
  return g.ref.t[i] * (1 - u) + g.ref.t[i + 1] * u;
}

/** The reference lap (a normal lap for this driver) and the time at d along it. */
export const refLap = (g: Geo) => g.ref.lap * CAR.margin;
export const refAt = (g: Geo, d: number) => refTime(g, d) * CAR.margin;

export interface Input {
  throttle: number; // 0-1
  brake: number; // 0-1
  steer: number; // -1 (right) .. 1 (left)
}

export interface CarState {
  d: number; // distance along the lap, track units (negative on the run-up to the line)
  x: number; // lateral offset, half-widths, + = left
  v: number; // m/s
  vlat: number; // lateral speed over the track, m/s, + = left
  t: number; // lap clock (s), runs from the line
  started: boolean; // crossed the line
  sector: number; // sectors completed
  sectors: number[]; // sector times
  deleted: boolean; // track limits
  deletedAt?: number; // distance where it happened
  use: number; // share of the lateral grip in use (0-1)
  surface: "track" | "kerb" | "off";
  done: boolean;
}

/** Flying start: on the straight before the line at the reference speed. */
export function startState(g: Geo, runUp = 110): CarState {
  const d = -Math.min(runUp, g.len * 0.1);
  return { d, x: 0, v: at(g, g.ref.v, d) * 0.97, vlat: 0, t: 0, started: false, sector: 0, sectors: [], deleted: false, use: 0, surface: "track", done: false };
}

export const gripOf = (ratings?: { quali: number; pace: number }) => (ratings ? 1 + ((ratings.quali - 75) * 0.6 + (ratings.pace - 75) * 0.4) * CAR.skill : 1);

/** One physics step (dt about 1/120 s). Steering asks for lateral acceleration; what the tyres can't give
 *  becomes drift over the track (understeer: running wide). The friction circle leaves less for the brakes
 *  and throttle when the tyres are loaded sideways. */
export function stepCar(g: Geo, s: CarState, inp: Input, dt: number, grip = 1): void {
  if (s.done) return;
  const kc = at(g, g.kap, s.d);
  const off = s.x * HALF_M; // metres left of the centreline
  const wide = clamp(1 + off * kc, 0.6, 1.6); // > 1 on the outside of the turn: a longer, gentler arc
  const kCar = kc / wide;
  const ax = Math.abs(s.x);
  s.surface = ax <= 1 ? "track" : ax <= EDGE.kerb ? "kerb" : "off";
  const surf = s.surface === "track" ? 1 : s.surface === "kerb" ? 0.9 : 0.45;
  const aFollow = -s.v * s.v * kCar; // what the corner needs (toward the inside), left positive
  const aAvail = lateral(s.v, g.g * grip) * surf;
  const authority = Math.min(1, s.v / 30);
  const aSteer = inp.steer * CAR.STEER * authority - s.vlat * CAR.DAMP;
  const aDes = aFollow + aSteer;
  const aAch = clamp(aDes, -aAvail, aAvail);
  s.use = aAvail > 0 ? Math.abs(aAch) / aAvail : 1;
  const inGrip = Math.abs(aDes) <= aAvail;
  s.vlat += (inGrip ? aSteer : (aAch - aFollow) * CAR.slide) * dt;
  s.x += (s.vlat / HALF_M) * dt;
  if (Math.abs(s.x) > EDGE.clamp) {
    s.x = Math.sign(s.x) * EDGE.clamp;
    s.vlat = 0;
  }
  if (Math.abs(s.x) > EDGE.limit && !s.deleted) {
    s.deleted = true;
    s.deletedAt = s.d;
  }
  const circle = circleOf(s.use);
  const push = inp.throttle * accel(s.v, g.g) * Math.max(PUSH_FLOOR, circle) * (s.surface === "off" ? 0.5 : 1);
  const stop = inp.brake * braking(s.v, g.g) * Math.max(BRAKE_FLOOR, circle) * surf;
  const a = push - stop - drag(s.v) - (s.surface === "off" ? 6 : s.surface === "kerb" ? 0.8 : 0);
  s.v = Math.max(0, s.v + a * dt);
  const before = s.d;
  s.d += (s.v * dt) / g.m / wide;
  if (!s.started) {
    if (before < 0 && s.d >= 0) {
      s.started = true;
      s.t = s.v > 0 ? (s.d * g.m) / s.v : 0; // the part of this step past the line
    }
    return;
  }
  s.t += dt;
  const next = ((s.sector + 1) * g.len) / 3;
  if (s.d >= next) {
    const over = s.v > 0 ? ((s.d - next) * g.m) / s.v : 0;
    const at_ = s.t - over;
    s.sectors.push(at_ - (s.sectors.length ? s.sectors.reduce((p, q) => p + q, 0) : 0));
    s.sector++;
    if (s.sector === 3) {
      s.t = at_;
      s.done = true;
    }
  }
}

/** The 0-1 the engine wants: 0.55 at the reference lap, 1 near the perfect lap, 0 well off; a deleted lap 0.1. */
export function lapScore(g: Geo, time: number, deleted: boolean): number {
  if (deleted) return 0.1;
  const ref = refLap(g);
  return clamp(0.55 + (ref - time) / (CAR.k * ref), 0, 1);
}

/** Reference sector times (the normal lap). */
export const refSectors = (g: Geo): number[] => [0, 1, 2].map((k) => refAt(g, ((k + 1) * g.len) / 3) - refAt(g, (k * g.len) / 3));

/** Sector colours like the TV: purple beats the reference, green beats your best, yellow otherwise. */
export function sectorTone(t: number, ref: number, best?: number): "purple" | "green" | "yellow" {
  if (t < ref) return "purple";
  if (best !== undefined ? t < best : t < ref + 0.4) return "green";
  return "yellow";
}
export const TONE = { purple: "#c084fc", green: "#34d399", yellow: "#facc15" };

export const GEARS = [0, 85, 125, 165, 205, 245, 280, 310]; // km/h where each gear starts
export const gearOf = (v: number) => {
  const kmh = v * 3.6;
  let gear = 1;
  for (let i = 1; i < GEARS.length; i++) if (kmh >= GEARS[i]) gear = i + 1;
  return gear;
};

export const fmtDelta = (sec: number) => `${sec < 0 ? "-" : "+"}${Math.abs(sec).toFixed(2)}`;

/** The best lap this weekend, as a trace to draw a ghost from: position every GHOST_DT seconds from the line. */
export interface Ghost {
  time: number;
  sectors: number[];
  d: number[];
  x: number[];
}
export const GHOST_DT = 0.1;

export function ghostAt(gh: Ghost, t: number): { d: number; x: number } | null {
  if (t < 0) return null;
  const f = t / GHOST_DT;
  const i = Math.floor(f);
  if (i >= gh.d.length - 1) return null;
  const u = f - i;
  return { d: gh.d[i] * (1 - u) + gh.d[i + 1] * u, x: gh.x[i] * (1 - u) + gh.x[i + 1] * u };
}

const ghosts = new Map<string, Ghost>();
const ghostKey = (trackId: string) => `paddock.ghost.${trackId}`;
export function loadGhost(trackId: string): Ghost | null {
  const g = ghosts.get(trackId);
  if (g) return g;
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(ghostKey(trackId)) : null;
    if (raw) {
      const parsed = JSON.parse(raw) as Ghost;
      ghosts.set(trackId, parsed);
      return parsed;
    }
  } catch {
    /* no storage */
  }
  return null;
}
export function saveGhost(trackId: string, gh: Ghost): void {
  ghosts.set(trackId, gh);
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(ghostKey(trackId), JSON.stringify({ ...gh, d: gh.d.map((v) => Math.round(v * 10) / 10), x: gh.x.map((v) => Math.round(v * 100) / 100) }));
  } catch {
    /* private mode or full */
  }
}
