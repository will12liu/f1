// Generated drivers: junior grids (F2/F3), new prospects each winter, replacement drivers.
import { clampRating, ovrOf, RATING_KEYS } from "./ratings";
import type { Rng } from "./rng";
import type { Driver, DriverRatings, Series } from "./types";

const NAMES: Record<string, { first: string[]; last: string[] }> = {
  British: { first: ["Oliver", "Harry", "Jack", "Charlie", "Alfie", "Freddie", "Arthur", "Theo", "Luke", "Callum", "Zak", "Joe"], last: ["Hughes", "Bennett", "Walsh", "Turner", "Fletcher", "Barker", "Marsh", "Cole", "Haddon", "Price", "Rowe", "Shaw"] },
  Italian: { first: ["Luca", "Matteo", "Lorenzo", "Andrea", "Gabriele", "Tommaso", "Riccardo", "Nicola", "Pietro"], last: ["Rossi", "Ferri", "Bianchi", "Conti", "Marino", "Greco", "Fontana", "Moretti", "Leone"] },
  French: { first: ["Théo", "Hugo", "Louis", "Victor", "Sacha", "Jules", "Raphaël", "Enzo", "Arthur"], last: ["Martin", "Durand", "Lefèvre", "Moreau", "Girard", "Dupont", "Roux", "Blanc", "Garnier"] },
  German: { first: ["Leon", "Finn", "Lukas", "Jonas", "Felix", "Tim", "Niklas", "Paul", "Max"], last: ["Wagner", "Becker", "Hoffmann", "Krüger", "Schulz", "Richter", "Vogel", "Brandt", "Lang"] },
  Dutch: { first: ["Daan", "Sem", "Lars", "Thijs", "Ruben", "Jesse", "Bram", "Joost"], last: ["de Vries", "Bakker", "Visser", "Smit", "van Dijk", "Mulder", "de Boer", "Kok"] },
  Spanish: { first: ["Pablo", "Álvaro", "Hugo", "Mario", "Daniel", "Javier", "Sergio", "Marc"], last: ["García", "Navarro", "Ortega", "Ruiz", "Molina", "Serrano", "Vidal", "Castro"] },
  Brazilian: { first: ["Gabriel", "Rafael", "Enzo", "Pedro", "Lucas", "Felipe", "Caio", "Bruno"], last: ["Silva", "Souza", "Costa", "Barbosa", "Lima", "Araújo", "Teixeira", "Rocha"] },
  Japanese: { first: ["Ren", "Haruto", "Sota", "Kaito", "Riku", "Yuto", "Daiki"], last: ["Sato", "Takahashi", "Nakamura", "Kobayashi", "Yamamoto", "Ito", "Kato"] },
  Australian: { first: ["Jack", "Cooper", "Lachlan", "Hamish", "Kai", "Mitchell"], last: ["Walker", "Doyle", "Fraser", "Gibson", "Hayes", "Kerr"] },
  American: { first: ["Logan", "Mason", "Tyler", "Brody", "Colton", "Jake", "Ryan"], last: ["Miller", "Parker", "Hayes", "Brooks", "Carter", "Reed", "Sullivan"] },
  Chinese: { first: ["Wei", "Hao", "Yuchen", "Zihan", "Jun"], last: ["Chen", "Wang", "Li", "Zhang", "Liu"] },
  Indian: { first: ["Arjun", "Rohan", "Kush", "Vikram", "Aditya"], last: ["Rao", "Mehta", "Iyer", "Kapoor", "Nair"] },
  Swedish: { first: ["Oscar", "William", "Elias", "Hugo", "Linus"], last: ["Lindqvist", "Berg", "Holm", "Nyberg", "Ek"] },
  Argentine: { first: ["Mateo", "Santiago", "Tomás", "Joaquín", "Nicolás"], last: ["Fernández", "Romero", "Acosta", "Benítez", "Sosa"] },
  Mexican: { first: ["Diego", "Emiliano", "Santiago", "Rodrigo"], last: ["Hernández", "Ramírez", "Flores", "Vargas"] },
  Belgian: { first: ["Arne", "Wout", "Maxime", "Bastien"], last: ["Peeters", "Janssens", "Lambert", "Dubois"] },
  Danish: { first: ["Mads", "Frederik", "Magnus", "Noah"], last: ["Nielsen", "Jensen", "Larsen", "Kristensen"] },
  Polish: { first: ["Jakub", "Kacper", "Szymon"], last: ["Nowak", "Kowalski", "Zieliński"] },
  Estonian: { first: ["Karl", "Rasmus", "Robin"], last: ["Tamm", "Saar", "Kask"] },
  "New Zealander": { first: ["Liam", "Hunter", "Blake"], last: ["Tane", "Morrison", "Gray"] },
  Taiwanese: { first: ["Chen-Yu", "Wei-Ting", "Yu-Hsiang", "Po-Han", "Chia-Hao", "Tzu-Wei", "Kuan-Ting"], last: ["Lin", "Chen", "Huang", "Tsai", "Wu", "Hsu", "Cheng"] },
  "South Korean": { first: ["Min-jun", "Seo-jun", "Ji-ho", "Hyun-woo", "Do-yun"], last: ["Kim", "Lee", "Park", "Choi", "Jung"] },
  "Hong Konger": { first: ["Ka-Ho", "Chun-Kit", "Wing-Lok", "Tsz-Hin"], last: ["Wong", "Chan", "Leung", "Cheung"] },
  Singaporean: { first: ["Ethan", "Jun Jie", "Ryan", "Darren"], last: ["Tan", "Lim", "Ng", "Goh"] },
  Malaysian: { first: ["Adam", "Haziq", "Aiman", "Wei Jian"], last: ["Rahman", "Ismail", "Lee", "Hashim"] },
  Indonesian: { first: ["Rizky", "Dimas", "Aditya", "Bagas"], last: ["Santoso", "Wijaya", "Pratama", "Saputra"] },
  Filipino: { first: ["Miguel", "Paolo", "Joaquin", "Marco"], last: ["Reyes", "Santos", "Cruz", "Bautista"] },
  Vietnamese: { first: ["Minh", "Duc", "Quang", "Bao"], last: ["Nguyen", "Tran", "Le", "Pham"] },
  Thai: { first: ["Krit", "Phum", "Nattapong", "Tanin"], last: ["Suwan", "Chaiyaporn", "Wongsa", "Sutthi"] },
  Emirati: { first: ["Rashid", "Hamdan", "Saeed", "Khalid"], last: ["Al Mansoori", "Al Nuaimi", "Al Falasi", "Al Hashimi"] },
  Saudi: { first: ["Faisal", "Abdullah", "Turki", "Nasser"], last: ["Al Qahtani", "Al Otaibi", "Al Harbi", "Al Shehri"] },
  Israeli: { first: ["Noam", "Itai", "Omer", "Yonatan"], last: ["Cohen", "Levi", "Mizrahi", "Peretz"] },
  Turkish: { first: ["Emir", "Kerem", "Arda", "Can"], last: ["Yılmaz", "Kaya", "Demir", "Şahin"] },
  Russian: { first: ["Artem", "Daniil", "Nikita", "Ivan"], last: ["Smirnov", "Volkov", "Sokolov", "Morozov"] },
  Ukrainian: { first: ["Oleksandr", "Maksym", "Bohdan", "Andriy"], last: ["Shevchenko", "Bondarenko", "Kovalenko", "Tkachenko"] },
  Czech: { first: ["Jakub", "Tomáš", "Ondřej", "Matěj"], last: ["Novák", "Svoboda", "Dvořák", "Černý"] },
  Austrian: { first: ["Lukas", "Tobias", "Florian", "David"], last: ["Gruber", "Huber", "Bauer", "Steiner"] },
  Swiss: { first: ["Noah", "Luca", "Nico", "Jan"], last: ["Müller", "Meier", "Keller", "Frei"] },
  Portuguese: { first: ["Tiago", "Duarte", "Rodrigo", "Gonçalo"], last: ["Ferreira", "Santos", "Pereira", "Oliveira"] },
  Irish: { first: ["Conor", "Cian", "Darragh", "Seán"], last: ["Murphy", "Kelly", "O'Brien", "Byrne"] },
  Norwegian: { first: ["Jakob", "Sander", "Henrik", "Sindre"], last: ["Hansen", "Johansen", "Olsen", "Berg"] },
  Finnish: { first: ["Eero", "Aleksi", "Joonas", "Niko"], last: ["Virtanen", "Korhonen", "Mäkinen", "Nieminen"] },
  Hungarian: { first: ["Bence", "Máté", "Levente", "Ádám"], last: ["Nagy", "Kovács", "Tóth", "Szabó"] },
  Romanian: { first: ["Andrei", "Mihai", "Ștefan", "Radu"], last: ["Popescu", "Ionescu", "Dumitru", "Stan"] },
  Greek: { first: ["Giorgos", "Nikos", "Kostas", "Dimitris"], last: ["Papadopoulos", "Nikolaidis", "Georgiou", "Alexiou"] },
  Monegasque: { first: ["Louis", "Arthur", "Charles", "Hugo"], last: ["Rossi", "Grimaldi", "Bianchi", "Pastor"] },
  Canadian: { first: ["Liam", "Owen", "Nathan", "Alexandre"], last: ["Tremblay", "MacDonald", "Roy", "Campbell"] },
  Colombian: { first: ["Juan", "Sebastián", "Andrés", "Camilo"], last: ["Rodríguez", "Gómez", "Martínez", "Restrepo"] },
  Chilean: { first: ["Benjamín", "Vicente", "Agustín", "Martín"], last: ["González", "Muñoz", "Rojas", "Soto"] },
  Venezuelan: { first: ["Luis", "Carlos", "Daniel", "Gabriel"], last: ["Pérez", "Rivas", "Salazar", "Méndez"] },
  Uruguayan: { first: ["Facundo", "Bruno", "Thiago", "Lautaro"], last: ["Pereyra", "Silva", "Cabrera", "Núñez"] },
  Peruvian: { first: ["Renzo", "Sebastián", "Diego", "Matías"], last: ["Quispe", "Flores", "Vargas", "Chávez"] },
  "South African": { first: ["Liam", "Ruan", "Thabo", "Jaden"], last: ["van der Merwe", "Botha", "Nkosi", "Naidoo"] },
  Moroccan: { first: ["Youssef", "Amine", "Rayan", "Adam"], last: ["Benali", "El Idrissi", "Alaoui", "Bennani"] },
  Egyptian: { first: ["Omar", "Youssef", "Karim", "Ziad"], last: ["Hassan", "Mostafa", "Farouk", "Saleh"] },
  Nigerian: { first: ["Tobi", "Chidi", "Emeka", "Tunde"], last: ["Okafor", "Adeyemi", "Balogun", "Eze"] },
};
/** Every nationality with a name pool, A-Z (the career creator's list). */
export const NATIONALITIES = Object.keys(NAMES).sort((a, b) => a.localeCompare(b));
const NAT_WEIGHTS: [string, number][] = [
  ["British", 16], ["Italian", 9], ["French", 9], ["German", 6], ["Dutch", 6], ["Spanish", 6], ["Brazilian", 6], ["Japanese", 4],
  ["Australian", 4], ["American", 5], ["Chinese", 2], ["Indian", 2], ["Swedish", 3], ["Argentine", 3], ["Mexican", 2], ["Belgian", 3],
  ["Danish", 3], ["Polish", 2], ["Estonian", 2], ["New Zealander", 2],
  ["Taiwanese", 1], ["South Korean", 1], ["Hong Konger", 1], ["Singaporean", 1], ["Malaysian", 1], ["Indonesian", 1], ["Filipino", 1], ["Vietnamese", 1], ["Thai", 1], ["Emirati", 1], ["Saudi", 1], ["Israeli", 1], ["Turkish", 1], ["Russian", 1], ["Ukrainian", 1], ["Czech", 1], ["Austrian", 2], ["Swiss", 2], ["Portuguese", 1], ["Irish", 1], ["Norwegian", 1], ["Finnish", 2], ["Hungarian", 1], ["Romanian", 1], ["Greek", 1], ["Monegasque", 1], ["Canadian", 2], ["Colombian", 1], ["Chilean", 1], ["Venezuelan", 1], ["Uruguayan", 1], ["Peruvian", 1], ["South African", 1], ["Moroccan", 1], ["Egyptian", 1], ["Nigerian", 1],
];

export function pickNat(rng: Rng): string {
  const total = NAT_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let x = rng.next() * total;
  for (const [n, w] of NAT_WEIGHTS) if ((x -= w) < 0) return n;
  return "British";
}

/** Peak/decline ages: drivers peak late (roughly 26-34). */
export function peakProfile(rng: Rng): { peak: number; decline: number } {
  const peak = rng.int(26, 30);
  return { peak, decline: peak + rng.int(3, 6) };
}

/** Ratings around a level, with a random tilt so drivers differ (a qualifier, a tyre whisperer...). */
export function genRatings(rng: Rng, level: number): DriverRatings {
  const r = {} as DriverRatings;
  for (const k of RATING_KEYS) r[k] = clampRating(level + rng.normal(0, 4.5));
  const tilts: (keyof DriverRatings)[][] = [["quali", "starts"], ["pace", "tyres"], ["overtaking", "racecraft"], ["defending", "composure"], ["wet", "consistency"], ["energy", "feedback"]];
  const up = rng.pick(tilts);
  for (const k of up) r[k] = clampRating(r[k] + 5);
  const down = rng.pick(tilts);
  if (down !== up) for (const k of down) r[k] = clampRating(r[k] - 4);
  r.aggression = clampRating(rng.normal(62, 12));
  r.fitness = clampRating(Math.max(r.fitness, level + 2));
  return r;
}

/** A name and nationality (staff, generated people). */
export function personName(rng: Rng): { first: string; last: string; nat: string } {
  const nat = pickNat(rng);
  const pool = NAMES[nat] ?? NAMES.British;
  return { first: rng.pick(pool.first), last: rng.pick(pool.last), nat };
}

let counter = 0;
export function genDriver(rng: Rng, o: { series: Series; season: number; age: number; level: number; pot: number; idPrefix?: string }): Driver {
  const nat = pickNat(rng);
  const pool = NAMES[nat] ?? NAMES.British;
  const first = rng.pick(pool.first);
  const last = rng.pick(pool.last);
  const ratings = genRatings(rng, o.level);
  const ovr = ovrOf(ratings);
  const { peak, decline } = peakProfile(rng);
  const code = last.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase().padEnd(3, "X");
  return {
    id: `${o.idPrefix ?? "g"}${o.season}-${rng.int(0, 1e9).toString(36)}-${counter++}`,
    first,
    last,
    code,
    num: rng.int(2, 99),
    nat,
    born: o.season - o.age,
    series: o.series,
    teamId: null,
    ratings,
    ovr,
    pot: Math.max(ovr, Math.round(o.pot)),
    peak,
    decline,
    contract: null,
  };
}
