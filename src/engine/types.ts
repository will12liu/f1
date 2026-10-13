// Shared game types. Engine code is pure TS (no React) and runs in a Web Worker.
import type { CircuitDef } from "../../data/manual/circuits";

export type { CircuitDef };
export interface PitLoss {
  normal: number;
  sc: number;
  vsc: number;
}
/** A circuit in the world: the hand facts plus the measured pit-lane loss. */
export type Circuit = CircuitDef & { pitLoss: PitLoss };
export type Series = "F1" | "F2" | "F3" | "F4"; // F4 = the prospect pool (not raced)
export type Compound = "S" | "M" | "H" | "I" | "W";

/** Driver attributes, 25-99 like the NBA game's. */
export interface DriverRatings {
  quali: number; // one-lap pace
  pace: number; // race pace
  racecraft: number; // wheel-to-wheel judgement, lap 1
  overtaking: number;
  defending: number;
  starts: number;
  tyres: number; // tyre management
  energy: number; // fuel / battery management
  wet: number;
  consistency: number;
  composure: number; // under pressure
  aggression: number; // style, not quality: more passes and more contact
  feedback: number; // technical feedback (car development)
  fitness: number;
}
export type RatingKey = keyof DriverRatings;

export interface Contract {
  teamId: string;
  until: number; // last season of the deal
  salary: number; // $ per season
}

export interface Driver {
  id: string;
  first: string;
  last: string;
  code: string; // three letters
  num: number;
  nat: string;
  born: number; // birth year
  series: Series;
  teamId: string | null;
  ratings: DriverRatings;
  ovr: number;
  pot: number;
  peak: number; // age at which he stops improving
  decline: number; // age at which decline starts
  contract: Contract | null;
  retired?: number; // season he retired
  real?: boolean; // from real data (vs generated)
  licence?: { season: number; round: number; pts: number; spent?: boolean }[]; // penalty points (12 in 12 months = a race ban)
  bannedFor?: { season: number; round: number }; // sits out this round
  sl?: { season: number; series: string; pos: number; pts: number }[]; // super licence points by season
}

/** The car: most of the result in F1. 0-100 scale; reliability is a separate risk number. */
export interface Car {
  power: number;
  aero: number;
  mech: number;
  reliability: number;
  dev: number; // in-season development rate (0-100)
}

export interface Team {
  id: string;
  name: string;
  short: string;
  color: string;
  color2: string;
  engine: string;
  series: Series;
  car: Car;
  budget: number; // 1-5
  drivers: string[]; // race drivers (two)
  reserve?: string;
}

export type DnfReason = "Mechanical" | "Crash" | "Collision" | "Damage";

export interface Classified {
  driverId: string;
  teamId: string;
  grid: number; // 1-based, 0 = pit-lane start
  pos: number; // 1-based finishing order (DNFs at the end)
  laps: number;
  time: number; // seconds (race time for finishers)
  gap: number; // to the winner, seconds (finishers on the lead lap)
  status: "Finished" | "Lapped" | DnfReason;
  points: number;
  pits: number;
  fastest: number; // best lap
  passes: number; // on-track passes made
  pens?: string[]; // penalties given ("5s track limits", ...)
  pp?: number; // licence penalty points
}

export interface RaceSummary {
  round: number;
  quali: { driverId: string; pos: number; q: (number | null)[] }[];
  circuitId: string;
  season: number;
  pole: string;
  winner: string;
  fastestLap: { driverId: string; time: number };
  classification: Classified[];
  sc: number; // safety-car periods
  vsc: number;
  red?: number;
  overtakes: number;
  stand_ins?: { driverId: string; for: string }[]; // reserves racing for a banned driver
}

/** Everything the 2D viewer needs to replay a race. */
export interface Replay {
  season: number;
  round: number;
  circuitId: string;
  laps: number;
  cars: { driverId: string; teamId: string }[];
  grid: string[]; // driver ids in grid order
  lapEnd: number[][];
  events: { lap: number; t: number; kind: string; a: number; b?: number; info?: string; x?: number }[];
  flags: { lap: number; flag: "sc" | "vsc" | "red" }[];
  stints: { c: Compound; from: number; to: number }[][];
}

export interface Round {
  round: number;
  circuitId: string;
  date: string; // ISO date
}

export interface SeasonRecord {
  season: number;
  champion: string;
  championTeam: string;
  constructors: string;
  f2Champion?: string;
  f3Champion?: string;
  standings: { driverId: string; teamId: string; points: number; wins: number }[];
  teamStandings: { teamId: string; points: number }[];
}

/** Off-track life (Phase 11+). Kept here so saves have a stable shape. */
export interface Life {
  fame: number;
  cash: number;
}

/** The player's career (Phase 8+). */
export interface Career {
  driverId: string;
  stage: "testing" | "F3" | "F2" | "F1" | "reserve";
  trust: number; // team trust 0-100
  superLicence: { season: number; points: number }[];
  life: Life;
}

export interface World {
  mode?: "sandbox" | "manager" | "career"; // sandbox = run the whole grid; manager = you run one team; career = you are one driver
  careerState?: import("./career/career").CareerState;
  manager?: import("./manager/state").Manager;
  staff?: import("./manager/state").Staff[]; // key people of every F1 team, and free agents
  reads?: import("./race/moments").Reads; // what the player has learned of each driver's habits in duels
  juniorResults?: import("./season/juniors").JuniorResult[]; // this season's F2/F3 races
  slSeeded?: boolean;
  version: number;
  seed: number;
  season: number;
  calendar: Round[];
  circuits: Circuit[];
  teams: Team[];
  drivers: Driver[];
  results: RaceSummary[]; // this season's completed rounds
  replays: Record<number, Replay>; // this season's races, for the race viewer
  history: SeasonRecord[];
  carMean: number; // F1 car ratings are relative: each winter the field mean is put back here
  career?: Career;
}
