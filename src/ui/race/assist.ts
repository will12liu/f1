// Driving assists for the 3D duels and the qualifying lap, like the F1 games' levels: braking assist, steering
// assist, throttle, a brake cue. They change the inputs before drive.ts sees them, never the physics, and cap
// the score a little so driving without them is still worth it.
import { at, braking, clamp, type CarState, type Geo, type Input } from "./drive";

export type Assist = "full" | "medium" | "light" | "off";
export const ASSISTS: { id: Assist; label: string; hint: string }[] = [
  { id: "full", label: "Full", hint: "The car brakes and accelerates, you steer and pick your side." },
  { id: "medium", label: "Medium", hint: "It brakes for you if you're late and keeps you on the road." },
  { id: "light", label: "Light", hint: "A brake cue and a steadier car. You do the driving." },
  { id: "off", label: "Off", hint: "No help. The best scores." },
];
/** The best score each level allows (0-1): assists make it easier, not better. */
export const ASSIST_CAP: Record<Assist, number> = { full: 0.82, medium: 0.9, light: 0.97, off: 1 };
/** A little grip in hand with the assists (traction control and ABS, roughly). */
export const ASSIST_GRIP: Record<Assist, number> = { full: 1.04, medium: 1.025, light: 1.01, off: 1 };

const KEY = "paddock.assist";
export function readAssist(): Assist {
  try {
    const v = localStorage.getItem(KEY);
    return v === "full" || v === "light" || v === "off" || v === "medium" ? v : "medium";
  } catch {
    return "medium";
  }
}
export function saveAssist(a: Assist): Assist {
  try {
    localStorage.setItem(KEY, a);
  } catch {
    /* private mode */
  }
  return a;
}
export const nextAssist = (a: Assist): Assist => ASSISTS[(ASSISTS.findIndex((x) => x.id === a) + 1) % ASSISTS.length].id;

/** Must we brake now to make the slowest point in the next 300 m at `margin` x the reference speed? */
export function mustBrake(g: Geo, s: CarState, grip: number, margin = 1): boolean {
  for (let look = 0; look <= 300; look += 5) {
    const want = at(g, g.ref.v, s.d + look / g.m) * margin;
    const can = Math.sqrt(Math.max(0, s.v * s.v - 2 * 0.72 * braking(s.v, g.g * grip) * look));
    if (can > want) return true;
  }
  return false;
}

/** The inputs after the assist. `inp.steer` still picks the side (full) or steers (the rest). */
export function assisted(g: Geo, s: CarState, inp: Input, level: Assist, grip = 1, ahead: number | null = null): { inp: Input; cue: boolean } {
  if (level === "off") return { inp, cue: false };
  // a car right ahead in your lane counts as a corner: full and medium won't drive into its back
  const close = (level === "full" || level === "medium") && ahead !== null && ahead < 9;
  const cue = mustBrake(g, s, grip) || close;
  // where the car should sit: the racing line, moved across by the stick on full assist
  const line = at(g, g.line, s.d) * 0.6;
  const hold = (lane: number) => clamp((lane - s.x) * 2.2 - s.vlat * 0.18, -1, 1);
  if (level === "full") {
    const lane = clamp(line + inp.steer * 0.85, -0.95, 0.95);
    const brake = cue ? 1 : 0;
    return { inp: { throttle: brake ? 0 : 1, brake, steer: hold(lane) }, cue };
  }
  if (level === "medium") {
    const late = mustBrake(g, s, grip, 1.03) || close; // you've missed it: it brakes for you
    const brake = Math.max(inp.brake, late ? 1 : 0);
    const steer = Math.abs(inp.steer) > 0.1 ? clamp(inp.steer + hold(line) * 0.3, -1, 1) : hold(s.x * 0.5 + line * 0.5);
    // never let it run off: pull back hard near the edge
    const edge = Math.abs(s.x) > 0.85 ? hold(Math.sign(s.x) * 0.6) : steer;
    return { inp: { throttle: brake ? 0 : Math.max(inp.throttle, 1), brake, steer: edge }, cue };
  }
  // light: only steadies the car when you let go of the wheel
  const steer = Math.abs(inp.steer) > 0.1 ? inp.steer : clamp(-s.vlat * 0.15, -0.4, 0.4);
  return { inp: { ...inp, steer }, cue };
}
