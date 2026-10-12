// Sims whole seasons + winters headlessly. Prints champions, the car order through the years, grid
// changes, development by age. Usage: npm run check:season [seed] [seasons]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { carOvr } from "../src/engine/ratings";
import { ageOf } from "../src/engine/season/development";
import { endSeason } from "../src/engine/season/offseason";
import { driverStandings, lineup, seasonOver, simNextRound, teamStandings } from "../src/engine/season/season";
import type { World } from "../src/engine/types";

const seed = Number(process.argv[2] ?? 7);
const seasons = Number(process.argv[3] ?? 6);
const world = JSON.parse(readFileSync(join(import.meta.dirname, "../public/data/world-2026.json"), "utf8")) as World;
world.seed = seed;
const name = (id: string) => {
  const d = world.drivers.find((x) => x.id === id);
  return d ? `${d.first[0]}. ${d.last}` : id;
};
const t0 = Date.now();
const champs: Record<string, number> = {};
const teamTitles: Record<string, number> = {};

for (let s = 0; s < seasons; s++) {
  const f1 = world.teams.filter((t) => t.series === "F1");
  const carsBefore = new Map(f1.map((t) => [t.id, carOvr(t.car)]));
  const gridBefore = new Set(lineup(world).map((x) => x.driver.id));
  const ovrBefore = new Map(world.drivers.map((d) => [d.id, d.ovr]));
  while (!seasonOver(world)) simNextRound(world);
  const ds = driverStandings(world);
  const ts = teamStandings(world);
  const wins = new Map<string, number>();
  for (const r of world.results) wins.set(r.winner, (wins.get(r.winner) ?? 0) + 1);
  console.log(`\n=== ${world.season} ===`);
  console.log(
    "Drivers: " +
      ds
        .slice(0, 6)
        .map((r, i) => `${i + 1}. ${name(r.driverId)} ${r.points}${r.wins ? ` (${r.wins}w)` : ""}`)
        .join("  "),
  );
  console.log("Teams:   " + ts.map((r) => `${r.teamId} ${r.points}`).join(", "));
  console.log(`Winners: ${wins.size} different · DNF/race ${(world.results.reduce((n, r) => n + r.classification.filter((c) => c.status !== "Finished" && c.status !== "Lapped").length, 0) / world.results.length).toFixed(2)}`);
  console.log("Cars:    " + f1.map((t) => `${t.short} ${carsBefore.get(t.id)}->${carOvr(t.car)}`).join("  "));
  champs[name(ds[0].driverId)] = (champs[name(ds[0].driverId)] ?? 0) + 1;
  teamTitles[ts[0].teamId] = (teamTitles[ts[0].teamId] ?? 0) + 1;

  endSeason(world);
  const gridAfter = lineup(world);
  const newcomers = gridAfter.filter((x) => !gridBefore.has(x.driver.id)).map((x) => `${name(x.driver.id)} (${x.team.short}, ${x.driver.series === "F1" ? "" : x.driver.series + " "}${ageOf(x.driver, world.season)}, ${x.driver.ovr})`);
  const gone = [...gridBefore].filter((id) => !gridAfter.some((x) => x.driver.id === id)).map((id) => {
    const d = world.drivers.find((x) => x.id === id)!;
    return `${name(id)}${d.retired ? " (retired)" : " (dropped)"}`;
  });
  console.log(`Winter:  in ${newcomers.join(", ") || "-"}`);
  console.log(`         out ${gone.join(", ") || "-"}`);
  // development by age band
  const bands: Record<string, number[]> = {};
  for (const d of world.drivers) {
    if (d.retired || !ovrBefore.has(d.id)) continue;
    const a = ageOf(d, world.season - 1);
    const band = a < 20 ? "<20" : a < 23 ? "20-22" : a < 27 ? "23-26" : a < 31 ? "27-30" : a < 35 ? "31-34" : "35+";
    (bands[band] ??= []).push(d.ovr - ovrBefore.get(d.id)!);
  }
  console.log(
    "Dev:     " +
      ["<20", "20-22", "23-26", "27-30", "31-34", "35+"]
        .filter((b) => bands[b])
        .map((b) => `${b} ${(bands[b].reduce((x, y) => x + y, 0) / bands[b].length).toFixed(1)} (n${bands[b].length})`)
        .join("  "),
  );
  const f1Ovr = gridAfter.map((x) => x.driver.ovr).sort((a, b) => b - a);
  console.log(`Grid ovr: top ${f1Ovr[0]} median ${f1Ovr[Math.floor(f1Ovr.length / 2)]} bottom ${f1Ovr[f1Ovr.length - 1]} · drivers in world ${world.drivers.length}`);
}
console.log(`\nTitles: ${Object.entries(champs).map(([k, v]) => `${k} ${v}`).join(", ")}`);
console.log(`Constructors: ${Object.entries(teamTitles).map(([k, v]) => `${k} ${v}`).join(", ")}`);
console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s`);
