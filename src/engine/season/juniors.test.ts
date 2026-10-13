import { describe, expect, it } from "vitest";
import { buyJuniorTeam, hireScout, placeDriver, potEstimate, scoutMarket, signAcademy } from "../manager/academy";
import { startManager } from "../manager/manager";
import { loadWorld } from "../testWorld";
import { hasLicence, juniorRounds, juniorStandings, licencePointsSL } from "./juniors";
import { endSeason } from "./offseason";
import { seasonOver, simNextRound } from "./season";

describe("junior ladder", () => {
  it("F2 and F3 race their own championships, award licence points and promote on results", () => {
    const w = loadWorld(31);
    expect(juniorRounds(w.calendar.length, "F2")).toHaveLength(14);
    expect(juniorRounds(w.calendar.length, "F3")).toHaveLength(10);
    while (!seasonOver(w)) simNextRound(w);
    expect(w.juniorResults!.filter((r) => r.series === "F2")).toHaveLength(14);
    expect(w.juniorResults!.filter((r) => r.series === "F3")).toHaveLength(10);
    const f3 = juniorStandings(w, "F3");
    const champ = w.drivers.find((d) => d.id === f3[0].driverId)!;
    expect(f3[0].points).toBeGreaterThan(f3[5].points);
    expect(w.drivers.some((d) => d.series === "F4")).toBe(true);
    endSeason(w);
    expect(w.history[0].f3Champion).toBe(champ.id);
    expect(licencePointsSL(champ, w.season)).toBeGreaterThanOrEqual(30);
    // the F3 champion moves up (unless he retired)
    if (!champ.retired) expect(champ.series === "F2" || champ.series === "F1").toBe(true);
    // every F1 driver after the market holds a licence
    for (const t of w.teams.filter((x) => x.series === "F1")) for (const id of t.drivers) expect(hasLicence(w, w.drivers.find((d) => d.id === id)!)).toBe(true);
  }, 60_000);

  it("academy: scouts narrow the potential estimate, drivers sign, own team takes them", () => {
    const w = loadWorld(33);
    startManager(w, "williams", "TP");
    const m = w.manager!;
    const sc = scoutMarket(w)[0];
    expect(hireScout(w, sc.id).ok).toBe(true);
    const prospect = w.drivers.find((d) => d.series === "F3")!;
    const before = potEstimate(w, prospect);
    sc.focus = "F3";
    for (let i = 0; i < 8; i++) simNextRound(w);
    const after = potEstimate(w, prospect);
    expect(after.hi - after.lo).toBeLessThanOrEqual(before.hi - before.lo);
    expect(signAcademy(w, prospect.id).ok || m.academy!.length === 0).toBe(true);
    const team = w.teams.find((t) => t.series === "F3")!;
    expect(buyJuniorTeam(w, team.id).ok).toBe(true);
    if (m.academy!.length) {
      const res = placeDriver(w, prospect.id, team.id);
      if (res.ok) expect(team.drivers).toContain(prospect.id);
    }
  }, 60_000);
});
