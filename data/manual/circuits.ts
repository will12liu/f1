// Hand-maintained circuit facts. Real names, laps and lengths; the character numbers are our read.
// `key` = OpenF1/MultiViewer circuit_key (used to fetch the outline). `base` = a clean race lap for the
// fastest car on fresh tyres with no fuel (seconds). `overtake` 1 (easy) .. 5 (Monaco). `power/aero/mech`
// weight which car rating matters (sum 1). `deg` 1-5 tyre wear. `sc` = chance of a safety car in a race
// (blended from history), `rain` = chance of a wet race. Values marked approx are best guesses.

export interface CircuitDef {
  id: string; // Jolpica circuitId
  key: number;
  name: string;
  gp: string;
  country: string;
  laps: number;
  km: number;
  base: number;
  overtake: number;
  power: number;
  aero: number;
  mech: number;
  deg: number;
  sc: number;
  rain: number;
  street?: boolean;
  approx?: boolean;
}

export const CIRCUITS: CircuitDef[] = [
  { id: "albert_park", key: 10, name: "Albert Park", gp: "Australian GP", country: "Australia", laps: 58, km: 5.278, base: 80.5, overtake: 3, power: 0.3, aero: 0.4, mech: 0.3, deg: 2, sc: 0.6, rain: 0.15, street: true },
  { id: "shanghai", key: 49, name: "Shanghai", gp: "Chinese GP", country: "China", laps: 56, km: 5.451, base: 95.0, overtake: 2, power: 0.35, aero: 0.4, mech: 0.25, deg: 4, sc: 0.4, rain: 0.15 },
  { id: "suzuka", key: 46, name: "Suzuka", gp: "Japanese GP", country: "Japan", laps: 53, km: 5.807, base: 92.0, overtake: 4, power: 0.25, aero: 0.55, mech: 0.2, deg: 4, sc: 0.35, rain: 0.2 },
  { id: "bahrain", key: 63, name: "Sakhir", gp: "Bahrain GP", country: "Bahrain", laps: 57, km: 5.412, base: 95.5, overtake: 2, power: 0.35, aero: 0.3, mech: 0.35, deg: 5, sc: 0.3, rain: 0 },
  { id: "jeddah", key: 149, name: "Jeddah", gp: "Saudi Arabian GP", country: "Saudi Arabia", laps: 50, km: 6.174, base: 91.5, overtake: 2, power: 0.45, aero: 0.4, mech: 0.15, deg: 2, sc: 0.6, rain: 0, street: true },
  { id: "miami", key: 151, name: "Miami", gp: "Miami GP", country: "USA", laps: 57, km: 5.412, base: 90.5, overtake: 3, power: 0.4, aero: 0.3, mech: 0.3, deg: 3, sc: 0.45, rain: 0.1 },
  { id: "imola", key: 6, name: "Imola", gp: "Emilia Romagna GP", country: "Italy", laps: 63, km: 4.909, base: 78.5, overtake: 4, power: 0.3, aero: 0.4, mech: 0.3, deg: 2, sc: 0.35, rain: 0.15 },
  { id: "villeneuve", key: 23, name: "Montréal", gp: "Canadian GP", country: "Canada", laps: 70, km: 4.361, base: 75.0, overtake: 2, power: 0.45, aero: 0.15, mech: 0.4, deg: 2, sc: 0.65, rain: 0.25 },
  { id: "monaco", key: 22, name: "Monaco", gp: "Monaco GP", country: "Monaco", laps: 78, km: 3.337, base: 75.5, overtake: 5, power: 0.05, aero: 0.4, mech: 0.55, deg: 1, sc: 0.5, rain: 0.1, street: true },
  { id: "catalunya", key: 15, name: "Barcelona-Catalunya", gp: "Barcelona GP", country: "Spain", laps: 66, km: 4.657, base: 77.0, overtake: 3, power: 0.25, aero: 0.55, mech: 0.2, deg: 4, sc: 0.25, rain: 0.1 },
  { id: "red_bull_ring", key: 19, name: "Red Bull Ring", gp: "Austrian GP", country: "Austria", laps: 71, km: 4.318, base: 68.0, overtake: 2, power: 0.45, aero: 0.25, mech: 0.3, deg: 3, sc: 0.3, rain: 0.15 },
  { id: "silverstone", key: 2, name: "Silverstone", gp: "British GP", country: "UK", laps: 52, km: 5.891, base: 89.0, overtake: 2, power: 0.3, aero: 0.55, mech: 0.15, deg: 4, sc: 0.4, rain: 0.3 },
  { id: "spa", key: 7, name: "Spa-Francorchamps", gp: "Belgian GP", country: "Belgium", laps: 44, km: 7.004, base: 106.5, overtake: 1, power: 0.45, aero: 0.4, mech: 0.15, deg: 3, sc: 0.4, rain: 0.35 },
  { id: "hungaroring", key: 4, name: "Hungaroring", gp: "Hungarian GP", country: "Hungary", laps: 70, km: 4.381, base: 80.5, overtake: 4, power: 0.15, aero: 0.45, mech: 0.4, deg: 3, sc: 0.3, rain: 0.1 },
  { id: "zandvoort", key: 55, name: "Zandvoort", gp: "Dutch GP", country: "Netherlands", laps: 72, km: 4.259, base: 73.5, overtake: 4, power: 0.15, aero: 0.55, mech: 0.3, deg: 3, sc: 0.45, rain: 0.25 },
  { id: "monza", key: 39, name: "Monza", gp: "Italian GP", country: "Italy", laps: 53, km: 5.793, base: 83.5, overtake: 1, power: 0.65, aero: 0.1, mech: 0.25, deg: 2, sc: 0.35, rain: 0.1 },
  { id: "madring", key: 153, name: "Madring", gp: "Spanish GP", country: "Spain", laps: 57, km: 5.47, base: 88.0, overtake: 3, power: 0.35, aero: 0.35, mech: 0.3, deg: 3, sc: 0.5, rain: 0.1, street: true, approx: true },
  { id: "baku", key: 144, name: "Baku", gp: "Azerbaijan GP", country: "Azerbaijan", laps: 51, km: 6.003, base: 105.5, overtake: 1, power: 0.5, aero: 0.15, mech: 0.35, deg: 2, sc: 0.65, rain: 0.02, street: true },
  { id: "sepang", key: 12, name: "Sepang", gp: "Malaysian GP", country: "Malaysia", laps: 56, km: 5.543, base: 96.0, overtake: 2, power: 0.35, aero: 0.4, mech: 0.25, deg: 5, sc: 0.35, rain: 0.45, approx: true },
  { id: "marina_bay", key: 61, name: "Marina Bay", gp: "Singapore GP", country: "Singapore", laps: 62, km: 4.94, base: 95.0, overtake: 4, power: 0.1, aero: 0.45, mech: 0.45, deg: 3, sc: 0.8, rain: 0.2, street: true },
  { id: "americas", key: 9, name: "COTA", gp: "United States GP", country: "USA", laps: 56, km: 5.513, base: 98.5, overtake: 2, power: 0.3, aero: 0.4, mech: 0.3, deg: 4, sc: 0.35, rain: 0.05 },
  { id: "rodriguez", key: 65, name: "Hermanos Rodríguez", gp: "Mexico City GP", country: "Mexico", laps: 71, km: 4.304, base: 80.5, overtake: 3, power: 0.45, aero: 0.25, mech: 0.3, deg: 2, sc: 0.45, rain: 0.05 },
  { id: "interlagos", key: 14, name: "Interlagos", gp: "São Paulo GP", country: "Brazil", laps: 71, km: 4.309, base: 72.5, overtake: 1, power: 0.4, aero: 0.3, mech: 0.3, deg: 3, sc: 0.55, rain: 0.35 },
  { id: "vegas", key: 152, name: "Las Vegas", gp: "Las Vegas GP", country: "USA", laps: 50, km: 6.201, base: 96.0, overtake: 1, power: 0.6, aero: 0.1, mech: 0.3, deg: 2, sc: 0.45, rain: 0.02, street: true },
  { id: "losail", key: 150, name: "Lusail", gp: "Qatar GP", country: "Qatar", laps: 57, km: 5.419, base: 85.0, overtake: 3, power: 0.25, aero: 0.55, mech: 0.2, deg: 5, sc: 0.4, rain: 0 },
  { id: "yas_marina", key: 70, name: "Yas Marina", gp: "Abu Dhabi GP", country: "UAE", laps: 58, km: 5.281, base: 87.5, overtake: 3, power: 0.35, aero: 0.3, mech: 0.35, deg: 2, sc: 0.25, rain: 0 },
];
