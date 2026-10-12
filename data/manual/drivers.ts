// Hand ratings for the 2026 F1 grid (our read, like the NBA game's hand ratings). Keyed by race number.
// `base` = the overall we'd give him; `tags` push groups of attributes up, `weak` pulls single ones down.
// build-world blends these (2/3) with what 2025-26 data says (1/3: qualifying and race pace vs his
// teammate, retirements). Contract end years are approximate (`until`); the note says so.

export type Tag = "qualifier" | "racer" | "tyres" | "wet" | "defender" | "starts" | "consistent" | "calm" | "tech" | "energy";

export interface HandDriver {
  num: number;
  id: string;
  first: string;
  last: string;
  code: string;
  nat: string;
  born: number;
  team: string;
  base: number;
  pot?: number;
  aggression: number;
  tags: Tag[];
  weak?: string[];
  until: number;
  peak?: number;
  decline?: number;
}

export const TAG_KEYS: Record<Tag, string[]> = {
  qualifier: ["quali"],
  racer: ["racecraft", "overtaking"],
  tyres: ["tyres"],
  wet: ["wet"],
  defender: ["defending"],
  starts: ["starts"],
  consistent: ["consistency"],
  calm: ["composure"],
  tech: ["feedback"],
  energy: ["energy"],
};

export const CONTRACT_NOTE = "Contract end years are approximate; not every deal length is public.";

export const HAND: HandDriver[] = [
  { num: 3, id: "verstappen", first: "Max", last: "Verstappen", code: "VER", nat: "Dutch", born: 1997, team: "red_bull", base: 95, aggression: 80, tags: ["racer", "wet", "qualifier", "defender", "calm", "tyres"], until: 2028 },
  { num: 1, id: "norris", first: "Lando", last: "Norris", code: "NOR", nat: "British", born: 1999, team: "mclaren", base: 91, aggression: 55, tags: ["qualifier", "tyres"], weak: ["starts"], until: 2027 },
  { num: 81, id: "piastri", first: "Oscar", last: "Piastri", code: "PIA", nat: "Australian", born: 2001, team: "mclaren", base: 90, pot: 92, aggression: 56, tags: ["consistent", "tyres", "calm"], until: 2028 },
  { num: 16, id: "leclerc", first: "Charles", last: "Leclerc", code: "LEC", nat: "Monegasque", born: 1997, team: "ferrari", base: 91, aggression: 62, tags: ["qualifier", "racer"], weak: ["tyres"], until: 2029 },
  { num: 44, id: "hamilton", first: "Lewis", last: "Hamilton", code: "HAM", nat: "British", born: 1985, team: "ferrari", base: 89, aggression: 55, tags: ["wet", "tyres", "calm", "racer"], until: 2026, peak: 30, decline: 37 },
  { num: 63, id: "russell", first: "George", last: "Russell", code: "RUS", nat: "British", born: 1998, team: "mercedes", base: 90, aggression: 62, tags: ["qualifier", "consistent"], until: 2027 },
  { num: 12, id: "antonelli", first: "Kimi", last: "Antonelli", code: "ANT", nat: "Italian", born: 2006, team: "mercedes", base: 88, pot: 95, aggression: 66, tags: ["racer", "qualifier"], weak: ["consistency"], until: 2027 },
  { num: 14, id: "alonso", first: "Fernando", last: "Alonso", code: "ALO", nat: "Spanish", born: 1981, team: "aston_martin", base: 87, aggression: 70, tags: ["racer", "defender", "tyres", "tech", "starts", "calm"], weak: ["fitness"], until: 2026, peak: 30, decline: 39 },
  { num: 55, id: "sainz", first: "Carlos", last: "Sainz", code: "SAI", nat: "Spanish", born: 1994, team: "williams", base: 87, aggression: 58, tags: ["tech", "consistent", "defender"], until: 2027 },
  { num: 23, id: "albon", first: "Alexander", last: "Albon", code: "ALB", nat: "Thai", born: 1996, team: "williams", base: 85, aggression: 52, tags: ["tyres", "consistent", "tech"], until: 2027 },
  { num: 10, id: "gasly", first: "Pierre", last: "Gasly", code: "GAS", nat: "French", born: 1996, team: "alpine", base: 85, aggression: 60, tags: ["starts", "racer"], until: 2028 },
  { num: 6, id: "hadjar", first: "Isack", last: "Hadjar", code: "HAD", nat: "French", born: 2004, team: "red_bull", base: 84, pot: 90, aggression: 66, tags: ["qualifier"], until: 2027 },
  { num: 30, id: "lawson", first: "Liam", last: "Lawson", code: "LAW", nat: "New Zealander", born: 2002, team: "rb", base: 81, pot: 85, aggression: 78, tags: ["racer", "defender"], weak: ["consistency"], until: 2026 },
  { num: 41, id: "lindblad", first: "Arvid", last: "Lindblad", code: "LIN", nat: "British", born: 2007, team: "rb", base: 79, pot: 91, aggression: 70, tags: ["racer"], until: 2027 },
  { num: 43, id: "colapinto", first: "Franco", last: "Colapinto", code: "COL", nat: "Argentine", born: 2003, team: "alpine", base: 79, pot: 83, aggression: 70, tags: ["racer"], weak: ["consistency"], until: 2026 },
  { num: 87, id: "bearman", first: "Oliver", last: "Bearman", code: "BEA", nat: "British", born: 2005, team: "haas", base: 83, pot: 89, aggression: 70, tags: ["racer"], until: 2026 },
  { num: 31, id: "ocon", first: "Esteban", last: "Ocon", code: "OCO", nat: "French", born: 1996, team: "haas", base: 82, aggression: 72, tags: ["defender", "tyres"], until: 2026 },
  { num: 27, id: "hulkenberg", first: "Nico", last: "Hülkenberg", code: "HUL", nat: "German", born: 1987, team: "audi", base: 83, aggression: 55, tags: ["qualifier", "consistent"], until: 2026, peak: 30, decline: 36 },
  { num: 5, id: "bortoleto", first: "Gabriel", last: "Bortoleto", code: "BOR", nat: "Brazilian", born: 2004, team: "audi", base: 80, pot: 87, aggression: 56, tags: ["consistent"], until: 2027 },
  { num: 18, id: "stroll", first: "Lance", last: "Stroll", code: "STR", nat: "Canadian", born: 1998, team: "aston_martin", base: 77, aggression: 58, tags: ["starts", "wet"], weak: ["quali"], until: 2027 },
  { num: 11, id: "perez", first: "Sergio", last: "Pérez", code: "PER", nat: "Mexican", born: 1990, team: "cadillac", base: 80, aggression: 60, tags: ["tyres", "defender"], weak: ["quali"], until: 2027 },
  { num: 77, id: "bottas", first: "Valtteri", last: "Bottas", code: "BOT", nat: "Finnish", born: 1989, team: "cadillac", base: 80, aggression: 45, tags: ["qualifier", "calm"], until: 2027 },
];
