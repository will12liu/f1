// Plays team-principal seasons headlessly with a simple automatic principal and prints how the team,
// its money and its car do against the AI. `npm run check:manager [team] [seasons] [seed]`
import { hireStaff, renewStaff, signSponsor, startProject, upgradeFacility } from "../src/engine/manager/actions";
import { capForecast, carRank, MANAGER_RULES, myTeam, staffAsk, startManager } from "../src/engine/manager/manager";
import { capSpend, fmtM, ROLES } from "../src/engine/manager/state";
import { endSeason } from "../src/engine/season/offseason";
import { f1Teams, seasonOver, simNextRound } from "../src/engine/season/season";
import { loadWorld } from "../src/engine/testWorld";
import type { World } from "../src/engine/types";

const team = process.argv[2] ?? "williams";
const seasons = Number(process.argv[3] ?? 4);
const seed = Number(process.argv[4] ?? 1);

function auto(w: World) {
  const m = w.manager!;
  if (m.fired) return;
  for (const o of [...m.offers].sort((a, b) => b.perSeason - a.perSeason)) signSponsor(w, o.id);
  // keep the people: renew late in the year, fill empty chairs with the best affordable free agent
  for (const st of w.staff ?? []) if (st.teamId === m.teamId && !st.joins && st.until <= w.season && w.results.length > w.calendar.length - 3) renewStaff(w, st.id, 2);
  for (const role of ROLES)
    if (!(w.staff ?? []).some((x) => x.teamId === m.teamId && x.role === role)) {
      const best = (w.staff ?? []).filter((x) => !x.teamId && x.role === role).sort((a, b) => b.rating - a.rating)[0];
      if (best) hireStaff(w, best.id, staffAsk(role, best.rating), 2);
    }
  if (m.cash > 80e6) for (const k of ["tunnel", "factory", "cfd", "sim"] as const) if (m.cash > 60e6) upgradeFacility(w, k);
  const left = w.calendar.length - w.results.length;
  while (m.projects.length < MANAGER_RULES.maxProjects(m.facilities.factory.level) && capForecast(w, m).room > 13e6 && m.cash > 5e6) {
    const area = (["aero", "mech", "power", "aero"] as const)[(w.results.length + m.projects.length) % 4];
    if (!startProject(w, area, "L", left > 9 ? "now" : "next").ok && !startProject(w, "mech", "M", left > 6 ? "now" : "next").ok) break;
  }
}

const w = loadWorld(seed);
startManager(w, team, "Auto");
const avg = (t: World["teams"][number]) => (t.car.power + t.car.aero + t.car.mech) / 3;
console.log(`${team}: car rank ${carRank(w, team)} of ${f1Teams(w).length}, car ${avg(myTeam(w)!).toFixed(1)} vs field ${(f1Teams(w).reduce((s, t) => s + avg(t), 0) / f1Teams(w).length).toFixed(1)}`);
for (let s = 0; s < seasons; s++) {
  auto(w);
  while (!seasonOver(w)) {
    simNextRound(w);
    auto(w);
  }
  const m = w.manager!;
  const spent = capSpend(w, m);
  const before = avg(myTeam(w)!);
  const season = w.season;
  endSeason(w);
  const h = m.history[m.history.length - 1];
  console.log(
    `${season}: P${h?.pos} (${h?.points} pts), target P${m.board.target}, confidence ${h?.confidence}, cap spend ${fmtM(spent)}, year ${fmtM(h?.profit ?? 0)}, cash ${fmtM(m.cash)}, car ${before.toFixed(1)} -> rank ${carRank(w, m.teamId)}${m.fired ? "  FIRED" : ""}`,
  );
  if (m.fired) break;
}
