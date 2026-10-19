// Driving assists for the 3D duels and the qualifying lap, like the F1 games' levels: braking assist, steering
// assist, throttle, a brake cue. They change the inputs before drive.ts sees them, never the physics, and cap
// the score a little so driving without them is still worth it.
import { at, braking, clamp, type CarState, type Geo, type Input } from "./drive";

export type Assist = "full" | "medium" | "light" | "off";
export const ASSISTS: { id: Assist; label: string; hint: string }[] = [
  { id: "full", label: "Full", hint: "Hold W: the car brakes for every corner and holds the line, you steer to pick your side." },
  { id: "medium", label: "Medium", hint: "Hold W: it brakes for you if you're late and keeps you on the road." },
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

/** How hard we need to brake now to make the slowest point in the next 300 m at `margin` x the reference speed:
 *  the deceleration it takes over the share of the brakes we plan to use (1 = right on it, above = late). */
export function brakeNeed(g: Geo, s: CarState, grip: number, margin = 1): number {
  let need = 0;
  const avail = 0.72 * braking(s.v, g.g * grip);
  for (let look = 5; look <= 300; look += 5) {
    const want = at(g, g.ref.v, s.d + look / g.m) * margin;
    if (s.v <= want) continue;
    need = Math.max(need, (s.v * s.v - want * want) / (2 * look) / avail);
  }
  return need;
}
export const mustBrake = (g: Geo, s: CarState, grip: number, margin = 1) => brakeNeed(g, s, grip, margin) >= 1;

/** Brake pressure from the need: squeezes on near the limit and settles at what the corner takes (no on/off chatter). */
const pressure = (need: number, from: number) => clamp((need - from) / 0.2, 0, 1);

/** The inputs after the assist. `inp.steer` still picks the side (full) or steers (the rest). */
export function assisted(g: Geo, s: CarState, inp: Input, level: Assist, grip = 1, ahead: number | null = null): { inp: Input; cue: boolean } {
  if (level === "off") return { inp, cue: false };
  // a car right ahead in your lane counts as a corner: full and medium won't drive into its back
  const close = (level === "full" || level === "medium") && ahead !== null && ahead < 9;
  const need = brakeNeed(g, s, grip);
  const cue = need >= 0.95 || close;
  // where the car should sit: the racing line, moved across by the stick on full assist
  const line = at(g, g.line, s.d) * 0.6;
  const hold = (lane: number) => clamp((lane - s.x) * 2.2 - s.vlat * 0.18, -1, 1);
  if (level === "full") {
    const lane = clamp(line + inp.steer * 0.85, -0.95, 0.95);
    const brake = Math.max(inp.brake, close ? 1 : pressure(need, 0.85));
    return { inp: { throttle: brake > 0.05 ? 0 : inp.throttle, brake, steer: hold(lane) }, cue }; // the throttle is always yours
  }
  if (level === "medium") {
    // you've missed it: it brakes for you, as hard as it takes
    const brake = Math.max(inp.brake, close ? 1 : pressure(brakeNeed(g, s, grip, 1.03), 0.95));
    const steer = Math.abs(inp.steer) > 0.1 ? clamp(inp.steer + hold(line) * 0.3, -1, 1) : hold(s.x * 0.5 + line * 0.5);
    // never let it run off: pull back hard near the edge
    const edge = Math.abs(s.x) > 0.85 ? hold(Math.sign(s.x) * 0.6) : steer;
    return { inp: { throttle: brake > 0.05 ? 0 : inp.throttle, brake, steer: edge }, cue };
  }
  // light: only steadies the car when you let go of the wheel
  const steer = Math.abs(inp.steer) > 0.1 ? inp.steer : clamp(-s.vlat * 0.15, -0.4, 0.4);
  return { inp: { ...inp, steer }, cue };
}

// The camera for the driven views (duels, drive it yourself, the qualifying lap), saved: chase behind the car,
// far chase, or onboard from the cockpit. Here rather than in look.ts so pages can read it without three.js.
export type DriveCam = "chase" | "far" | "onboard";
const CAM_KEY = "paddock.cam";
export function readCam(): DriveCam {
  try {
    const v = localStorage.getItem(CAM_KEY);
    return v === "far" || v === "onboard" ? v : "chase";
  } catch {
    return "chase";
  }
}
export function saveCam(c: DriveCam): DriveCam {
  try {
    localStorage.setItem(CAM_KEY, c);
  } catch {
    /* private mode */
  }
  return c;
}
export const nextCam = (c: DriveCam): DriveCam => (c === "chase" ? "far" : c === "far" ? "onboard" : "chase");
export const CAM_LABEL: Record<DriveCam, string> = { chase: "Chase cam", far: "Far cam", onboard: "Onboard" };
