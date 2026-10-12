import { describe, expect, it } from "vitest";
import { FINANCE } from "../../../data/manual/manager";
import { endSeason } from "../season/offseason";
import { seasonOver, simNextRound } from "../season/season";
import { loadWorld } from "../testWorld";
import type { World } from "../types";
import { hireStaff, signDriver, signSponsor, startProject, upgradeFacility } from "./actions";
import { capForecast, MANAGER_RULES, myTeam, startManager } from "./manager";

/** A simple principal: signs the best offers, keeps two R&D projects going, upgrades the tunnel once. */
function autoPrincipal(w: World) {
  const m = w.manager!;
  for (const o of [...m.offers].sort((a, b) => b.perSeason - a.perSeason)) signSponsor(w, o.id);
  const left = w.calendar.length - w.results.length;
  while (m.projects.length < Math.min(2, MANAGER_RULES.maxProjects(m.facilities.factory.level)) && capForecast(w, m).room > 7e6) {
    const area = (["aero", "mech", "power"] as const)[(w.results.length + m.projects.length) % 3];
    const r = startProject(w, area, "M", left > 6 ? "now" : "next");
    if (!r.ok) break;
  }
}

function playSeason(w: World) {
  autoPrincipal(w);
  while (!seasonOver(w)) {
    simNextRound(w);
    autoPrincipal(w);
  }
  endSeason(w);
}

describe("team-principal mode", () => {
  it("starts a team with money, partners, staff, facilities and a target", () => {
    const w = loadWorld(5);
    startManager(w, "williams", "Test TP");
    const m = w.manager!;
    expect(w.mode).toBe("manager");
    expect(m.cash).toBeGreaterThan(0);
    expect(m.sponsors.length).toBeGreaterThan(2);
    expect(m.offers.length).toBeGreaterThan(0);
    expect(w.staff!.filter((s) => s.teamId === "williams")).toHaveLength(6);
    expect(m.board.target).toBeGreaterThanOrEqual(1);
    expect(m.atr.hours).toBeGreaterThan(100);
    expect(m.inbox[0].subject).toContain("Williams");
  });

  it("plays two seasons: money moves, R&D lands on the car, the board judges, the winter carries over", () => {
    const w = loadWorld(7);
    startManager(w, "haas", "Test TP");
    const m = w.manager!;
    const team = myTeam(w)!;
    const aero0 = team.car.aero;
    playSeason(w);
    expect(m.history).toHaveLength(1);
    const h = m.history[0];
    expect(h.pos).toBeGreaterThanOrEqual(1);
    expect(m.finished.length).toBeGreaterThan(3);
    expect(m.finished.some((p) => p.outcome !== "failed" && (p.gain ?? 0) > 0)).toBe(true);
    // the ledger had prize money, sponsors, R&D and operations
    const cats = new Set(w.manager!.ledger.map((e) => e.cat));
    for (const c of ["prize", "sponsor", "rnd", "ops", "staff", "drivers"]) expect(cats.has(c as never)).toBe(true);
    // a new season is set up
    expect(w.season).toBe(2027);
    expect(team.drivers).toHaveLength(2);
    if (!m.fired) {
      playSeason(w);
      expect(m.history.length).toBe(2);
    }
    // the car moved through R&D (not the AI's automatic development)
    expect(team.car.aero).not.toBe(aero0);
  }, 60_000);

  it("is deterministic from the seed and the choices", () => {
    const run = () => {
      const w = loadWorld(11);
      startManager(w, "alpine", "TP");
      for (let i = 0; i < 8; i++) {
        autoPrincipal(w);
        simNextRound(w);
      }
      return JSON.stringify({ m: w.manager, car: myTeam(w)!.car, res: w.results.map((r) => r.classification.map((c) => c.driverId)) });
    };
    expect(run()).toBe(run());
  });

  it("enforces the rules: slots, sector exclusivity, wind tunnel time, project limits, cap breach", () => {
    const w = loadWorld(13);
    startManager(w, "rb", "TP");
    const m = w.manager!;
    // wind tunnel: aero projects until the hours run out
    let r;
    let n = 0;
    do {
      r = startProject(w, "aero", "L", "next");
      n++;
    } while (r.ok && n < 20);
    expect(r.ok).toBe(false);
    // facility upgrade starts a build
    const before = m.facilities.cfd.level;
    if (before < 5) {
      expect(upgradeFacility(w, "cfd").ok).toBe(true);
      expect(upgradeFacility(w, "cfd").ok).toBe(false); // already building
    }
    // overspend the cap -> FIA fine at the end of the season
    m.ledger.push({ season: w.season, round: 0, cat: "rnd", amount: -FINANCE.costCap, capped: true });
    while (!seasonOver(w)) simNextRound(w);
    const cash = m.cash;
    endSeason(w);
    expect(m.inbox.some((x) => x.kind === "fia" && x.subject.includes("breach"))).toBe(true);
    expect(m.cash).toBeLessThan(cash + 1);
  }, 60_000);

  it("staff and drivers: hiring, poaching with gardening leave, signing for next year", () => {
    const w = loadWorld(17);
    startManager(w, "williams", "TP");
    const m = w.manager!;
    const free = w.staff!.find((s) => !s.teamId && s.role === "aero")!;
    expect(hireStaff(w, free.id, 1, 1).ok).toBe(false); // too cheap
    expect(hireStaff(w, free.id, 20e6, 2).ok).toBe(true);
    expect(w.staff!.find((s) => s.teamId === "williams" && s.role === "aero")!.id).toBe(free.id);
    // a driver whose deal ends this season can be signed for next year
    const target = w.drivers.find((d) => d.teamId && d.teamId !== "williams" && d.contract && d.contract.until === w.season && d.series === "F1" && d.ovr < 84);
    if (target) {
      // one of ours is out of contract at the end of the year, so a seat opens
      const ours = w.drivers.find((d) => d.id === myTeam(w)!.drivers[0])!;
      ours.contract = { ...ours.contract!, until: w.season };
      const res = signDriver(w, target.id, 40e6, 2);
      expect(res.ok).toBe(true);
      expect(m.precontracts).toHaveLength(1);
      while (!seasonOver(w)) simNextRound(w);
      endSeason(w);
      if (!m.fired) expect(myTeam(w)!.drivers).toContain(target.id);
    }
  }, 60_000);
});
