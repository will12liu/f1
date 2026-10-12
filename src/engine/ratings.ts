// Overall ratings and the car's pace at a given track.
import type { Car, CircuitDef, DriverRatings, RatingKey } from "./types";

/** Weights of the driver overall. Aggression is style, so it doesn't count. */
export const OVR_WEIGHTS: Record<RatingKey, number> = {
  quali: 0.15,
  pace: 0.2,
  racecraft: 0.1,
  overtaking: 0.07,
  defending: 0.06,
  starts: 0.04,
  tyres: 0.1,
  energy: 0.05,
  wet: 0.05,
  consistency: 0.09,
  composure: 0.05,
  aggression: 0,
  feedback: 0.03,
  fitness: 0.01,
};

export const RATING_KEYS = Object.keys(OVR_WEIGHTS) as RatingKey[];

export const RATING_LABELS: Record<RatingKey, string> = {
  quali: "Qualifying pace",
  pace: "Race pace",
  racecraft: "Racecraft",
  overtaking: "Overtaking",
  defending: "Defending",
  starts: "Starts",
  tyres: "Tyre management",
  energy: "Energy management",
  wet: "Wet weather",
  consistency: "Consistency",
  composure: "Composure",
  aggression: "Aggression",
  feedback: "Technical feedback",
  fitness: "Fitness",
};

export function ovrOf(r: DriverRatings): number {
  let s = 0;
  for (const k of RATING_KEYS) s += r[k] * OVR_WEIGHTS[k];
  return Math.round(s);
}

export const clampRating = (v: number) => Math.max(25, Math.min(99, Math.round(v)));

/** Car pace at a track: its power/aero/mechanical ratings weighted by the track's character. */
export function carPace(car: Car, c: Pick<CircuitDef, "power" | "aero" | "mech">): number {
  return car.power * c.power + car.aero * c.aero + car.mech * c.mech;
}

/** One number for the car (average track). */
export const carOvr = (car: Car) => Math.round((car.power + car.aero + car.mech) / 3);
