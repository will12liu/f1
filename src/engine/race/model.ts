// Tuning knobs of the race engine (check with `npm run calibrate`). Times are seconds.
import { makeRng } from "../rng";
import type { CircuitDef, Compound } from "../types";

export const RACE = {
  carK: 0.00064, // fraction of the base lap per car-pace point below 100 (75-80% of the spread)
  drvK: 0.0003, // fraction of the base lap per driver point below 100
  raceSpread: 1.6, // car and driver gaps open up over a race distance (tyre wear, traffic) vs one lap
  dayForm: 0.0011, // sd of a car's pace on the day (setup, track temperature suiting it), fraction of the lap
  fuelPerLapKg: 1.6,
  fuelSecPerKg: 0.032,
  noise: 0.17, // lap-to-lap noise for a perfectly consistent driver
  noisePerPoint: 0.006, // extra noise per consistency point below 100
  mistake: 0.0045, // chance of a small mistake per lap (scaled by consistency)
  crash: 0.0003, // chance a lap ends in the wall (scaled by consistency/aggression)
  mech: 0.009, // x (100 - reliability)/100 per lap = mechanical DNF chance
  minGap: 0.3, // a car can't cross the line closer than this behind the car it failed to pass
  dirtyAir: 0.22, // lap-time cost of following within a second
  dirtyWear: 1.08,
  passT: [0.35, 0.6, 0.95, 1.35, 2.4], // pace advantage needed for a ~50% pass, by overtaking difficulty 1-5
  passSkill: 3.2,
  passLoss: 0.35, // time both lose in a fight
  contact: 0.008, // contact chance per pass attempt (scaled by aggression/racecraft)
  lap1Contact: 0.05, // chance of a first-lap incident somewhere in the pack (scaled by track)
  startLoss: 2.6, // standing start
  gridGap: 0.22, // grid slot spacing at the start
  launchSd: 0.2,
  crewMid: 0.6, // pit-stop mini-game: a score of 0.6 is an average stop
  crewSpread: 1.5, // seconds per point of score: a perfect stop -0.6s, a botched one +0.9s
  launchSkill: 0.5, // the player's reaction start: a perfect launch gains 0.25s, a slow one loses 0.25s
  slowStop: 0.035,
  scLapFactor: 1.38,
  vscLapFactor: 1.3,
  scGap: 0.9,
  debrisSc: 0.04, // chance per race of a safety car without a retirement, scaled by track sc
  scAfterCrash: 0.45, // x track sc factor
  scAfterMech: 0.12,
  vscAfterMech: 0.22,
  pitLossDefault: { normal: 21, sc: 13, vsc: 15 },
  // stewards and flags
  trackLimits: 0.0036, // chance of a track-limits strike per car per green lap (x aggression, x push)
  jumpStart: 0.003,
  limitsProne: 0.12, // share of drivers who fight the track limits all weekend (x8 strikes; the rest x0.45)
  unsafeRelease: 0.011, // per stop
  pitSpeeding: 0.006,
  blueLoss: [0.55, 0.18], // seconds the lapped car / the car lapping lose
  blueIgnore: 0.012, // chance a lapped car holds up a leader
  redAfterCrash: 0.17, // x track sc factor, per car out

};

export const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

export const COMPOUNDS: Record<Compound, { name: string; grip: number; life: number; color: string }> = {
  S: { name: "Soft", grip: 0, life: 22, color: "#ef4444" },
  M: { name: "Medium", grip: 0.48, life: 33, color: "#facc15" },
  H: { name: "Hard", grip: 0.85, life: 46, color: "#e5e7eb" },
  I: { name: "Intermediate", grip: 0, life: 35, color: "#22c55e" },
  W: { name: "Wet", grip: 0, life: 45, color: "#3b82f6" },
};

export const DRY: Compound[] = ["S", "M", "H"];

/** Laps until a set is fully worn at this track (before driver/dial effects). */
export function tyreLife(c: Compound, track: Pick<CircuitDef, "deg">): number {
  return COMPOUNDS[c].life * (1.45 - 0.15 * track.deg);
}

/** Lap-time cost of a tyre at a given wear (0 = new, 1 = worn out; past 1 is the cliff). Scaled to the lap. */
export function tyreCost(c: Compound, wear: number, base: number): number {
  const scale = base / 90;
  const w = Math.max(0, wear);
  const cliff = w > 1 ? 7 * (w - 1) + 18 * (w - 1) ** 2 : 0;
  return scale * (COMPOUNDS[c].grip + 1.1 * Math.pow(Math.min(w, 1), 1.7) + cliff);
}

/** Each car's pace on the day (fraction of a lap; negative = quicker), shared by qualifying and the race. */
export function dayForms(seed: number, n: number): number[] {
  const rng = makeRng(seed ^ 0xf0f0f);
  return Array.from({ length: n }, () => rng.normal(0, RACE.dayForm));
}
