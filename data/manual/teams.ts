// Hand-maintained team facts (2026). `openf1` is the team name in OpenF1 data; colours are OpenF1's.
// The car's overall level is measured from 2026 qualifying (build-world); `tilt` shifts it between
// power / aero / mechanical (our read: 2026 is a new power-unit era). `dev` = in-season development
// rate, `budget` 1-5. Swap names here for fictional ones before a public build.

export interface TeamDef {
  id: string;
  openf1: string;
  name: string;
  short: string;
  color: string;
  color2: string;
  engine: string;
  budget: number;
  dev: number;
  tilt: { power: number; aero: number; mech: number };
}

export const TEAMS: TeamDef[] = [
  { id: "mercedes", openf1: "Mercedes", name: "Mercedes", short: "MER", color: "#00D7B6", color2: "#111111", engine: "Mercedes", budget: 5, dev: 75, tilt: { power: 2.5, aero: 0, mech: 0 } },
  { id: "ferrari", openf1: "Ferrari", name: "Ferrari", short: "FER", color: "#ED1131", color2: "#FFEB3B", engine: "Ferrari", budget: 5, dev: 72, tilt: { power: 1, aero: 0, mech: 0.5 } },
  { id: "mclaren", openf1: "McLaren", name: "McLaren", short: "MCL", color: "#F47600", color2: "#1F2937", engine: "Mercedes", budget: 5, dev: 80, tilt: { power: 1.5, aero: 1.5, mech: 0 } },
  { id: "red_bull", openf1: "Red Bull Racing", name: "Red Bull Racing", short: "RBR", color: "#4781D7", color2: "#E10600", engine: "Red Bull Ford", budget: 5, dev: 78, tilt: { power: -1, aero: 1.5, mech: 0.5 } },
  { id: "aston_martin", openf1: "Aston Martin", name: "Aston Martin", short: "AMR", color: "#229971", color2: "#CEDC00", engine: "Honda", budget: 5, dev: 80, tilt: { power: -2, aero: 1.5, mech: 0 } },
  { id: "williams", openf1: "Williams", name: "Williams", short: "WIL", color: "#1868DB", color2: "#FFFFFF", engine: "Mercedes", budget: 4, dev: 70, tilt: { power: 2, aero: -1, mech: 0 } },
  { id: "rb", openf1: "Racing Bulls", name: "Racing Bulls", short: "RB", color: "#6C98FF", color2: "#FFFFFF", engine: "Red Bull Ford", budget: 3, dev: 62, tilt: { power: -1, aero: 0.5, mech: 0 } },
  { id: "alpine", openf1: "Alpine", name: "Alpine", short: "ALP", color: "#00A1E8", color2: "#FF87BC", engine: "Mercedes", budget: 3, dev: 64, tilt: { power: 1.5, aero: -0.5, mech: 0 } },
  { id: "haas", openf1: "Haas F1 Team", name: "Haas", short: "HAA", color: "#9C9FA2", color2: "#E10600", engine: "Ferrari", budget: 3, dev: 60, tilt: { power: 1, aero: -0.5, mech: 0 } },
  { id: "audi", openf1: "Audi", name: "Audi", short: "AUD", color: "#F50537", color2: "#C0C0C0", engine: "Audi", budget: 4, dev: 72, tilt: { power: -1, aero: 0, mech: 0.5 } },
  { id: "cadillac", openf1: "Cadillac", name: "Cadillac", short: "CAD", color: "#909090", color2: "#1A1A1A", engine: "Ferrari", budget: 4, dev: 66, tilt: { power: 1, aero: -1, mech: 0 } },
];

/** Junior series teams (spec cars: small differences). Real names; swappable. */
export const JUNIOR_TEAMS: { series: "F2" | "F3"; name: string; short: string; color: string; level: number }[] = [
  ...[
    ["Prema", "PRE", "#E11D48", 82], ["ART Grand Prix", "ART", "#9CA3AF", 81], ["Campos", "CAM", "#F59E0B", 80], ["Hitech", "HIT", "#64748B", 80],
    ["MP Motorsport", "MPM", "#F97316", 80], ["DAMS", "DAM", "#0EA5E9", 78], ["Rodin", "ROD", "#22C55E", 79], ["Invicta", "INV", "#A3E635", 81],
    ["Van Amersfoort", "VAR", "#F472B6", 77], ["AIX", "AIX", "#8B5CF6", 76], ["Trident", "TRI", "#3B82F6", 78],
  ].map(([name, short, color, level]) => ({ series: "F2" as const, name: name as string, short: short as string, color: color as string, level: level as number })),
  ...[
    ["Prema", "PRE", "#E11D48", 82], ["ART Grand Prix", "ART", "#9CA3AF", 81], ["Campos", "CAM", "#F59E0B", 80], ["Hitech", "HIT", "#64748B", 80],
    ["MP Motorsport", "MPM", "#F97316", 81], ["Trident", "TRI", "#3B82F6", 80], ["Rodin", "ROD", "#22C55E", 78], ["Van Amersfoort", "VAR", "#F472B6", 78],
    ["AIX", "AIX", "#8B5CF6", 77], ["DR Formula", "DRF", "#14B8A6", 76],
  ].map(([name, short, color, level]) => ({ series: "F3" as const, name: name as string, short: short as string, color: color as string, level: level as number })),
];
