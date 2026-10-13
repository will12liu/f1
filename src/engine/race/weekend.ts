// The race weekend for the player's cars: practice (a programme, then a setup choice against a hidden
// optimum the engineer estimates) and qualifying (how hard to push each lap, when to go out). AI cars run
// the calibrated baseline (an ideal setup), so a good weekend matches them and a bad one costs time.
import { hashString, makeRng } from "../rng";
import type { CircuitDef, DriverRatings } from "../types";

export type Program = "setup" | "long" | "quali";
export const PROGRAMS: Record<Program, [string, string]> = {
  setup: ["Setup work", "The engineer's read on the ideal downforce gets much sharper."],
  long: ["Long runs", "You learn the tyres: better tyre management in the race."],
  quali: ["Qualifying simulations", "Low fuel, soft tyres: a bit more one-lap pace."],
};

export interface CarPlan {
  program: Program;
  setup: number; // 0 = low downforce, 1 = high
  risk: [number, number, number]; // per session: 1 = safe, 2 = normal, 3 = all in
  late: [boolean, boolean, boolean]; // go out at the end of the session
  laps?: (number | null)[]; // the qualifying-lap mini-game per session (0-1; null = not driven)
}
export type WeekendPlan = Record<string, CarPlan>; // by driver id

export const defaultPlan = (setup = 0.5): CarPlan => ({ program: "setup", setup, risk: [2, 2, 2], late: [false, false, false] });

/** The hidden ideal downforce at this track this weekend (aero tracks want more, power tracks less). */
export function idealSetup(seed: number, c: Pick<CircuitDef, "aero" | "power" | "mech" | "id">): number {
  const r = makeRng(hashString(`setup:${seed}:${c.id}`));
  return Math.max(0.1, Math.min(0.9, 0.5 + (c.aero - c.power) * 1.0 + r.normal(0, 0.08)));
}

/** What the engineer thinks the ideal is: a fixed error per weekend and driver, smaller after setup work. */
export function setupEstimate(seed: number, c: Pick<CircuitDef, "aero" | "power" | "mech" | "id">, driverId: string, program: Program, engineer = 60): { mid: number; spread: number } {
  const ideal = idealSetup(seed, c);
  const sd = (program === "setup" ? 0.05 : 0.14) * (1.4 - engineer / 150);
  const r = makeRng(hashString(`est:${seed}:${c.id}:${driverId}`));
  return { mid: Math.max(0, Math.min(1, ideal + r.normal(0, sd))), spread: sd * 1.5 };
}

/** What a plan does to one driver's weekend: pace (form), and rating nudges for qualifying and the race. */
export function planEffects(seed: number, c: Pick<CircuitDef, "aero" | "power" | "mech" | "id">, p: CarPlan) {
  const err = Math.abs(p.setup - idealSetup(seed, c));
  const form = Math.max(-0.0002, (err - 0.05) * 0.005); // fraction of a lap; a near-perfect setup is a hair quicker
  const quali = (r: DriverRatings): DriverRatings => (p.program === "quali" ? { ...r, quali: Math.min(99, r.quali + 2) } : r);
  const race = (r: DriverRatings): DriverRatings => (p.program === "long" ? { ...r, tyres: Math.min(99, r.tyres + 4) } : r);
  return { form, quali, race, err };
}
