// The driveable duel: your car (drive.ts physics) and the other car on the run into one braking zone, out to
// the corner exit. Pure, no three.js, so it's tested headlessly. The result is the same 0-1 the braking bar
// gives (MomentChoice.q): a clear pass on the road scores near 1, still behind near 0.3, off the road or into
// the other car near 0. The engine still rolls the duel with that score, so a close call goes to the odds.
import { at, EDGE, HALF_M, stepCar, type CarState, type Geo, type Input } from "../drive";

export type Side = "attack" | "defend";

export interface Zone {
  brakeD: number; // where the perfect lap starts braking, track units
  apexD: number; // slowest point after it
  drop: number; // speed lost, m/s
  turn: number; // +1 right-hander, -1 left
}

export interface Rival {
  d: number;
  x: number; // half-widths, + = left
  v: number;
}

export interface Duel {
  g: Geo;
  side: Side;
  move: string;
  zone: Zone;
  endD: number;
  me: CarState;
  opp: Rival;
  t: number;
  braked: boolean; // first brake press seen (the approach is on auto throttle until then)
  minGap: number; // metres, signed (me ahead +), closest call
  contact: boolean;
  result: { q: number; why: string } | null;
}

export const RUN = 340; // metres from the start to the braking point
const LEN = 5.4; // car length (m), for contact
const WIDE = 1.9; // car width plus a little (m)

/** The braking zones of a lap, heaviest first. */
export function zones(g: Geo): Zone[] {
  const out: Zone[] = [];
  const v = g.ref.v;
  for (let i = 0; i < g.n; i++) {
    if (!g.ref.brake[i] || g.ref.brake[(i - 1 + g.n) % g.n]) continue;
    let j = i;
    while (g.ref.brake[j % g.n] && j - i < g.n) j++;
    const a = j % g.n;
    let k = 0;
    for (let q = -3; q <= 3; q++) k += g.kap[(a + q + g.n) % g.n];
    out.push({ brakeD: (i / g.n) * g.len, apexD: (j / g.n) * g.len, drop: v[i] - v[a], turn: k >= 0 ? 1 : -1 });
  }
  return out.sort((x, y) => y.drop - x.drop);
}

/** The duel's opening frame: RUN metres before the zone; attacking you start in the tow 16 m back, defending
 *  you lead by 14 m. `pick` chooses among the three heaviest zones (the lap number, so it's not always T1). */
export function startDuel(g: Geo, side: Side, move: string, pick = 0): Duel {
  const zs = zones(g);
  const zone = zs[Math.abs(pick) % Math.min(3, zs.length)];
  // distances run on past the line (d grows past g.len; at() wraps), so nothing crosses zero
  const lift = zone.brakeD - RUN / g.m < 0 ? g.len : 0;
  const z = { ...zone, brakeD: zone.brakeD + lift, apexD: zone.apexD + lift + (zone.apexD < zone.brakeD ? g.len : 0) };
  const d0 = z.brakeD - RUN / g.m;
  const v0 = at(g, g.ref.v, d0) * 0.98;
  const me: CarState = { d: d0, x: side === "attack" ? -0.15 * z.turn : 0.1 * z.turn, v: v0, vlat: 0, t: 0, started: false, sector: 0, sectors: [], deleted: false, use: 0, surface: "track", done: false };
  const off = (side === "attack" ? 16 : -14) / g.m;
  const opp: Rival = { d: d0 + off, x: at(g, g.line, d0 + off), v: v0 };
  return { g, side, move, zone: z, endD: z.apexD + 60 / g.m, me, opp, t: 0, braked: false, minGap: (me.d - opp.d) * g.m, contact: false, result: null };
}

const gapM = (s: Duel) => (s.me.d - s.opp.d) * s.g.m;

/** One step. `inp` is the player's; until the first brake press the throttle is held for them. */
export function stepDuel(s: Duel, inp: Input, dt: number, grip = 1): void {
  if (s.result) return;
  const { g, zone } = s;
  if (inp.brake > 0) s.braked = true;
  const ers = (s.move === "ers" || s.move === "ersDef") && !s.braked ? 1.06 : 1;
  const mine: Input = { throttle: s.braked ? inp.throttle : 1, brake: inp.brake, steer: inp.steer };
  stepCar(g, s.me, mine, dt, grip * ers);
  s.t += dt;

  // the other car: the reference lap, a touch slower in the braking zone when it's ahead (it defends the
  // inside), quicker on the straight when it's behind (the tow); its line drifts to the inside to attack
  const o = s.opp;
  const inZone = o.d > zone.brakeD - 20 / g.m && o.d < zone.apexD + 60 / g.m;
  // defending: if you've covered the inside he has to go round the outside, the long way
  const covered = s.side === "defend" && s.me.x * -zone.turn > 0.3;
  const f = s.side === "attack" ? (inZone ? 0.95 : 0.985) : inZone ? (covered ? 0.95 : 0.985) : 1.02;
  let vt = at(g, g.ref.v, o.d) * f;
  const gap = gapM(s);
  const lat = Math.abs(s.me.x - o.x) * HALF_M;
  // behind and boxed in: it can't drive through you, it waits
  if (s.side === "defend" && gap > 0 && gap < LEN + 2.5 && lat < WIDE) vt = Math.min(vt, s.me.v);
  o.v += Math.max(-35 * dt, Math.min(12 * dt, vt - o.v));
  o.d += (o.v * dt) / g.m;
  const near = o.d > zone.brakeD - 260 / g.m && o.d < zone.apexD;
  const tx = s.side === "defend" && near ? (covered ? 0.6 : -0.55) * zone.turn : s.side === "attack" && near ? -0.35 * zone.turn : at(g, g.line, o.d) * 0.8;
  o.x += (tx - o.x) * Math.min(1, dt * 1.6);

  const now = gapM(s);
  if (Math.abs(now) < Math.abs(s.minGap)) s.minGap = now;
  if (Math.abs(now) < LEN && Math.abs(s.me.x - o.x) * HALF_M < WIDE) s.contact = true;
  if (s.contact || s.me.d >= s.endD || s.t > 22 || (s.braked && s.me.v < 4)) s.result = duelScore(s);
}

/** On the road to the engine's 0-1. */
export function duelScore(s: Duel): { q: number; why: string } {
  if (s.contact) return { q: 0.03, why: "Contact" };
  const gap = gapM(s);
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  let q: number;
  let why: string;
  if (s.side === "attack") {
    q = clamp(0.3 + (gap + 16) * 0.026);
    why = gap > LEN ? "Through, you're ahead" : gap > -LEN ? "Side by side" : gap > -14 ? "Closer, still behind" : "No way past";
    // the move you picked: inside means inside of him at the apex, outside the other way
    const side = (s.me.x - s.opp.x) * -s.zone.turn; // + = you're on the inside
    if ((s.move === "inside" && side < 0) || (s.move === "outside" && side > 0)) {
      q -= 0.12;
      why += " (wrong side)";
    }
  } else {
    q = clamp(0.5 + gap * 0.045);
    why = gap > 8 ? "Held him off" : gap > 0 ? "Just kept it" : gap > -LEN ? "He's alongside" : "He's through";
  }
  if (s.me.deleted || Math.abs(s.me.x) > EDGE.limit) {
    q = Math.min(q, 0.15);
    why = "Ran wide";
  }
  return { q: clamp(q), why };
}
