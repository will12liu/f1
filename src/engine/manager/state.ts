// Team-principal mode: the shapes that live on the save, and small shared helpers.
import { hashString, makeRng, type Rng } from "../rng";
import type { World } from "../types";

export type StaffRole = "td" | "aero" | "design" | "engineer" | "strategy" | "pit";
export const ROLES: StaffRole[] = ["td", "aero", "design", "engineer", "strategy", "pit"];

export interface Staff {
  id: string;
  first: string;
  last: string;
  nat: string;
  role: StaffRole;
  rating: number; // 30-99
  age: number;
  salary: number; // $ per season
  until: number; // last season of the contract
  teamId: string | null; // null = free agent
  joins?: { season: number; round: number; teamId: string }; // gardening leave: joins this team from that round
}

export type FacilityKey = "tunnel" | "cfd" | "sim" | "factory";
export interface Facility {
  level: number; // 1-5
  building?: { to: number; roundsLeft: number };
}

export type Area = "aero" | "mech" | "power" | "reliability";
export type Size = "S" | "M" | "L";

export interface Project {
  id: string;
  name: string;
  area: Area;
  size: Size;
  cost: number;
  hours: number; // wind tunnel / CFD hours (aero only)
  rounds: number;
  roundsLeft: number;
  target: "now" | "next"; // this year's car or next year's
  started: { season: number; round: number };
  gain?: number; // delivered (rating points)
  outcome?: "good" | "ok" | "poor" | "failed";
}

export type Tier = "title" | "major" | "minor";
export type BonusKind = "points" | "podium" | "win" | "position";
export interface Bonus {
  kind: BonusKind; // points/podium/win: paid per car per race; position: paid if the team ends the season at `target` or better
  amount: number;
  target?: number;
}
export interface SponsorDeal {
  id: string;
  brand: string;
  sector: string;
  tier: Tier;
  perSeason: number;
  until: number; // last season
  bonus: Bonus;
  satisfaction: number; // 0-100
  expects: number; // constructors' position the sponsor hopes for
}
export interface SponsorOffer extends Omit<SponsorDeal, "satisfaction"> {
  expiresRound: number; // offer withdrawn after this round of this season (0 = before the season)
  years: number;
  renewal?: boolean;
}

export type LedgerCat = "prize" | "sponsor" | "bonus" | "owner" | "merch" | "drivers" | "staff" | "ops" | "engine" | "rnd" | "facility" | "fine" | "transfer";
export interface LedgerEntry {
  season: number;
  round: number;
  cat: LedgerCat;
  amount: number; // + income, - spending
  capped: boolean; // counts against the cost cap
  note?: string;
}

export interface Message {
  id: string;
  season: number;
  round: number;
  from: string;
  subject: string;
  body: string;
  kind: "board" | "sponsor" | "rnd" | "staff" | "fia" | "driver" | "finance" | "race";
  read?: boolean;
}

export interface PreContract {
  driverId: string;
  salary: number;
  until: number;
}

export interface Manager {
  teamId: string;
  name: string; // the team principal
  cash: number;
  ledger: LedgerEntry[]; // this season and last
  sponsors: SponsorDeal[];
  offers: SponsorOffer[];
  facilities: Record<FacilityKey, Facility>;
  projects: Project[];
  finished: Project[]; // last 30
  atr: { hours: number; used: number; pct: number }; // this half-season
  nextCar: { power: number; aero: number; mech: number; reliability: number };
  board: { confidence: number; target: number; expected: number };
  inbox: Message[];
  precontracts: PreContract[];
  orders: { swap: boolean }; // team orders allowed in the live race
  history: { season: number; pos: number; points: number; profit: number; confidence: number }[];
  prestige: number; // 0.5-1.6: what sponsors, staff and drivers think of the team
  capPenalty?: number; // ATR cut next season after a breach
  fired?: { season: number; offers: string[] }; // sacked: teams that would hire you
  seq: number;
}

export const mgrRng = (w: World, tag: string): Rng => makeRng(hashString(`${w.seed}:mgr:${w.season}:${w.results.length}:${tag}`));

export const nextId = (m: Manager, p: string) => `${p}${++m.seq}`;

export function message(w: World, m: Manager, msg: Omit<Message, "id" | "season" | "round">) {
  m.inbox.unshift({ ...msg, id: nextId(m, "m"), season: w.season, round: w.results.length });
  if (m.inbox.length > 120) m.inbox.length = 120;
}

export function book(w: World, m: Manager, cat: LedgerCat, amount: number, capped: boolean, note?: string) {
  if (!amount) return;
  m.cash += amount;
  m.ledger.push({ season: w.season, round: w.results.length, cat, amount, capped, note });
}

/** Spending this season that counts against the cost cap. */
export function capSpend(w: World, m: Manager): number {
  return -m.ledger.filter((e) => e.season === w.season && e.capped && e.amount < 0).reduce((s, e) => s + e.amount, 0);
}

export const fmtM = (x: number) => {
  const a = Math.abs(x);
  return `${x < 0 ? "-" : ""}$${a >= 1e6 || a === 0 ? `${(a / 1e6).toFixed(1)}M` : `${Math.round(a / 1e3)}K`}`;
};
