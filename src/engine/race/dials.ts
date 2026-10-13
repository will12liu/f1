// Resource dials: the pit-wall controls a driver sets for the whole race (changes apply from the next lap).
// Every dial trades something now for something later. Neutral dials (pace 3, tyre care 3, standard fuel,
// balanced ERS, standard engine) are exactly the AI's behaviour, so a race nobody touches is unchanged.
// Dials never draw random numbers: they only move lap times, wear, burn and the odds of rolls the engine
// already makes, so changing them can't reshuffle unrelated luck.

export type FuelMix = "lean" | "std" | "rich";
export type ErsMode = "harvest" | "balanced" | "attack" | "defend";
export type EngineMode = "low" | "std" | "high";

export interface Dials {
  pace: number; // 1-5: 1 = cruise, 5 = flat out
  tyres: number; // 1-5 tyre care: 1 = attack the tyres, 5 = nurse them
  fuel: FuelMix;
  ers: ErsMode;
  engine: EngineMode;
}

export const NEUTRAL: Dials = { pace: 3, tyres: 3, fuel: "std", ers: "balanced", engine: "std" };

export const isNeutral = (d: Dials) => d.pace === 3 && d.tyres === 3 && d.fuel === "std" && d.ers === "balanced" && d.engine === "std";

export const DIAL = {
  // per pace step from 3 (seconds at a 90 s lap, scaled to the track)
  paceSec: 0.16,
  paceWear: 0.08, // wear multiplier per step
  paceFuel: 0.035, // burn multiplier per step
  paceMistake: 0.4, // mistake / crash odds multiplier per step above 3
  // per tyre-care step from 3
  careSec: 0.11,
  careWear: 0.1,
  fuelSec: { lean: 0.22, std: 0, rich: -0.14 },
  fuelBurn: { lean: 0.9, std: 1, rich: 1.08 },
  liftSec: 2.2, // lap cost of lifting and coasting when the tank can't make the lap
  engineSec: { low: 0.12, std: 0, high: -0.17 },
  engineMech: { low: 0.6, std: 1, high: 2.4 }, // mechanical DNF odds multiplier
  // ERS: battery 0-1. Balanced holds the charge.
  battery0: 0.6,
  ersSec: { harvest: 0.2, balanced: 0, attack: -0.12, defend: 0 },
  ersFlow: { harvest: 0.09, balanced: 0, attack: -0.14, defend: -0.07 }, // charge per lap
  ersAttack: 0.3, // effective seconds of pace advantage in a pass attempt (overtake mode)
  ersDefend: 0.28, // seconds taken off an attacker's advantage
};

export interface DialFx {
  sec: number; // lap time change at a 90 s lap (negative = quicker)
  wear: number; // multiplier
  burn: number; // multiplier
  risk: number; // mistake / crash multiplier
  mech: number; // mechanical DNF multiplier
  attack: number; // extra pass advantage, seconds (0 without charge)
  defend: number; // seconds off an attacker's advantage (0 without charge)
  flow: number; // battery change this lap
}

/** What the dials do this lap, given the battery charge at the start of it. */
export function dialFx(d: Dials, battery: number): DialFx {
  const p = d.pace - 3;
  const care = d.tyres - 3;
  const charged = battery > 0.001;
  const ers = charged || d.ers === "harvest" ? d.ers : "balanced"; // an empty battery can't deploy
  return {
    sec: -p * DIAL.paceSec + care * DIAL.careSec + DIAL.fuelSec[d.fuel] + DIAL.engineSec[d.engine] + DIAL.ersSec[ers],
    wear: Math.max(0.4, (1 + p * DIAL.paceWear) * (1 - care * DIAL.careWear)),
    burn: (1 + p * DIAL.paceFuel) * DIAL.fuelBurn[d.fuel],
    risk: p > 0 ? 1 + p * DIAL.paceMistake : 1 + p * 0.15,
    mech: DIAL.engineMech[d.engine],
    attack: ers === "attack" ? DIAL.ersAttack : 0,
    defend: ers === "defend" ? DIAL.ersDefend : 0,
    flow: DIAL.ersFlow[ers],
  };
}

/** A change the player (or a stored replay) makes to one car, applied at the start of `lap`. */
export interface Command {
  lap: number;
  car: number;
  dials?: Partial<Dials>;
  pit?: "box" | "stay"; // box at the end of this lap / skip a planned stop this lap
  letBy?: boolean; // team orders: let the team-mate behind through this lap
  compound?: "S" | "M" | "H"; // tyre wanted at a requested stop
  crew?: number; // the pit-stop mini-game: how well the stop went (0-1)
  unsafe?: boolean; // released into the path of another car (mini-game)
}

export interface Forecast {
  tyreLapsLeft: number; // laps until the set is worn out at these dials (clean air)
  tyreWear: number; // 0-1+
  battery: number;
  batteryEmptyLap: number | null; // null = not draining
  fuel: number; // kg in the tank
  fuelMargin: number; // kg left at the flag at these dials (negative = short)
  fuelShortLap: number | null; // lap the tank can't cover any more
  lapDelta: number; // seconds per lap vs neutral dials at this track
  nextStop: { lap: number; compound: string } | null;
}
