// Plays driver careers headlessly (auto training, best seat each winter, every deal) and prints the path:
// series, team, standings, overall, licence. `npm run check:career [seasons] [seed]`
import { acceptSeat, autoSpend, careerOf, meOf, signDeal, startCareer, type Tier } from "../src/engine/career/career";
import { answerEvent } from "../src/engine/career/events";
import { licencePointsSL } from "../src/engine/season/juniors";
import { endSeason } from "../src/engine/season/offseason";
import { seasonOver, simNextRound } from "../src/engine/season/season";
import { loadWorld } from "../src/engine/testWorld";

const seasons = Number(process.argv[2] ?? 6);
const seed = Number(process.argv[3] ?? 1);

for (const tier of ["academy", "mid", "self"] as Tier[]) {
  for (const start of ["F3", "F2"] as const) {
    const w = loadWorld(seed * 10 + (tier === "academy" ? 1 : tier === "mid" ? 2 : 3) + (start === "F2" ? 5 : 0));
    startCareer(w, { first: "Auto", last: "Driver", nat: "British", archetype: "racer", tier, start, difficulty: "pro" });
    const c = careerOf(w)!;
    const d = meOf(w)!;
    const line: string[] = [];
    let firstF1 = 0;
    for (let s = 0; s < seasons; s++) {
      while (!seasonOver(w)) {
        simNextRound(w);
        if (c.event) answerEvent(w, 0);
        autoSpend(w);
        for (const o of [...c.dealOffers]) signDeal(w, o.id, false);
      }
      const rank = (o: (typeof c.seatOffers)[number]) => (o.series === "F1" && o.role === "race" ? 0 : o.series === "F1" ? 3 : o.series === "F2" ? 1 : 2) + (o.salary < 0 ? 0.5 : 0);
      const best = [...c.seatOffers].filter((o) => o.salary >= 0 || c.cash > -o.salary).sort((a, b) => rank(a) - rank(b))[0];
      if (best) acceptSeat(w, best.id);
      const season = w.season;
      endSeason(w);
      const rec = c.seasons[c.seasons.length - 1];
      if (!firstF1 && d.series === "F1" && d.teamId) firstF1 = w.season;
      line.push(`${season} ${rec.series} P${rec.pos} ovr ${d.ovr} sl ${licencePointsSL(d, season)}`);
    }
    console.log(`${tier.padEnd(7)} ${start}: ${line.join(" | ")}${firstF1 ? `  -> F1 race seat from ${firstF1}` : "  -> no F1 race seat"} (fame ${Math.round(c.fame)}, cash $${(c.cash / 1e6).toFixed(1)}M)`);
  }
}
