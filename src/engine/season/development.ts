// Car development (in-season upgrades, the winter reshuffle) and driver aging.
import { clampRating, ovrOf, RATING_KEYS } from "../ratings";
import type { Rng } from "../rng";
import type { Car, Driver, World } from "../types";

export const DEV = {
  perRound: 0.24, // points per round at dev 100
  budget: 0.045, // extra per budget level above 3
  noise: 0.2,
  winterPull: 0.25, // fraction of the gap to the field mean closed over the winter
  winterNoise: 2.2,
  regPull: 0.55, // regulation-change winters shake the order up
  regNoise: 4.2,
  regYears: [2030, 2035, 2040, 2045, 2050],
};

const AREAS = ["power", "aero", "mech"] as const;
const clampCar = (v: number) => Math.max(40, Math.min(99, v));

/** After every round: each F1 team brings upgrades (dev rate, budget, harder near the top). */
export function developCarsAfterRound(w: World, rng: Rng) {
  const mine = w.manager && !w.manager.fired ? w.manager.teamId : null; // the player's team develops through R&D projects
  for (const t of w.teams) {
    if (t.series !== "F1" || t.id === mine) continue;
    const rate = (t.car.dev / 100) * DEV.perRound + (t.budget - 3) * DEV.budget;
    for (const a of AREAS) {
      const room = Math.max(0.15, 1 - (t.car[a] - 80) / 30);
      t.car[a] = clampCar(t.car[a] + rate * room + rng.normal(0, DEV.noise));
    }
    t.car.reliability = Math.min(97, t.car.reliability + 0.12 + rng.normal(0, 0.1));
  }
}

/** Winter: the order partly converges and reshuffles (much more in a regulation-change year). */
export function winterCars(w: World, rng: Rng, nextSeason: number) {
  const teams = w.teams.filter((t) => t.series === "F1");
  const reg = DEV.regYears.includes(nextSeason);
  const mean = (a: (typeof AREAS)[number]) => teams.reduce((s, t) => s + t.car[a], 0) / teams.length;
  for (const a of AREAS) {
    const m = mean(a);
    for (const t of teams) {
      const pull = reg ? DEV.regPull : DEV.winterPull;
      const budgetEdge = (t.budget - 3) * (reg ? 1.2 : 0.4);
      t.car[a] = t.car[a] + (m - t.car[a]) * pull + budgetEdge + rng.normal(0, reg ? DEV.regNoise : DEV.winterNoise);
    }
    // keep the scale fixed: the field mean goes back to where it was when the world was made
    const shift = w.carMean - mean(a);
    for (const t of teams) t.car[a] = clampCar(t.car[a] + shift);
  }
  for (const t of teams) {
    t.car.reliability = Math.max(70, Math.min(96, t.car.reliability - (reg ? 6 : 2) + rng.normal(0, 1.5) + (t.budget - 3)));
    t.car.dev = Math.max(35, Math.min(95, t.car.dev + rng.normal(0, 4) + (t.budget - 3) * 0.8 + (65 - t.car.dev) * 0.1));
  }
}

export const ageOf = (d: Driver, season: number) => season - d.born;

/** End-of-season development for one driver: growth toward potential while young, decline when old. */
export function developDriver(d: Driver, season: number, rng: Rng) {
  const age = ageOf(d, season);
  let delta: number;
  if (age < d.peak) delta = Math.max(0, d.pot - d.ovr) * (age < 21 ? 0.28 : 0.22) + rng.normal(0, 1.2);
  else if (age < d.decline) delta = rng.normal(0.1, 0.9);
  else delta = -(1.3 + (age - d.decline) * 0.6) + rng.normal(0, 0.9);
  const before = d.ovr;
  for (const k of RATING_KEYS) {
    if (k === "aggression") {
      d.ratings.aggression = clampRating(d.ratings.aggression - (age > 28 ? 0.6 : 0) + rng.normal(0, 1.2));
      continue;
    }
    // experience keeps the craft; age takes fitness and raw pace first
    let mult = 1;
    if (delta < 0 && (k === "racecraft" || k === "tyres" || k === "feedback" || k === "composure" || k === "energy")) mult = 0.4;
    if (delta < 0 && (k === "fitness" || k === "quali" || k === "starts")) mult = 1.5;
    d.ratings[k] = clampRating(d.ratings[k] + delta * mult * (0.7 + rng.next() * 0.6));
  }
  d.ovr = ovrOf(d.ratings);
  // potential re-projection
  if (age < d.peak) d.pot = Math.max(d.ovr, Math.round(d.pot + (d.ovr - before - Math.max(0, d.pot - before) * 0.28) * 0.5 + rng.normal(0, 1)));
  else d.pot = Math.max(d.ovr, Math.round((d.pot + d.ovr) / 2));
}

export function carSummary(c: Car) {
  return { power: Math.round(c.power), aero: Math.round(c.aero), mech: Math.round(c.mech), reliability: Math.round(c.reliability), dev: Math.round(c.dev) };
}
