import { describe, expect, it } from "vitest";
import { endSeason } from "../season/offseason";
import { seasonOver, simNextRound } from "../season/season";
import { loadWorld } from "../testWorld";
import { acceptSeat, autoSpend, careerOf, meOf, signDeal, spendPoint, startCareer } from "./career";

describe("driver career", () => {
  it("creates a driver with a junior seat, races his series, earns XP and spends it", () => {
    const w = loadWorld(41);
    startCareer(w, { first: "Alex", last: "Tester", nat: "British", archetype: "racer", tier: "mid", start: "F3", difficulty: "pro" });
    const c = careerOf(w)!;
    const d = meOf(w)!;
    expect(d.series).toBe("F3");
    expect(w.teams.find((t) => t.id === d.teamId)!.drivers).toContain(d.id);
    const ovr0 = d.ovr;
    for (let i = 0; i < 8; i++) simNextRound(w);
    expect(c.log.length).toBeGreaterThan(0); // he raced (F3 runs 10 of the 23 weekends)
    expect(c.points).toBeGreaterThan(0);
    autoSpend(w);
    expect(d.ovr).toBeGreaterThanOrEqual(ovr0);
    expect(spendPoint(w, "aggression").ok).toBe(false);
  });

  it("plays a full season: offers come, a seat is taken, the AI never moves him", () => {
    const w = loadWorld(43);
    startCareer(w, { first: "Sam", last: "Driver", nat: "Dutch", archetype: "qualifier", tier: "academy", start: "F2", difficulty: "rookie" });
    const c = careerOf(w)!;
    const d = meOf(w)!;
    while (!seasonOver(w)) {
      simNextRound(w);
      for (const o of [...c.dealOffers]) signDeal(w, o.id, false);
    }
    expect(c.seatOffers.length).toBeGreaterThan(0);
    const pick = c.seatOffers[0];
    expect(acceptSeat(w, pick.id).ok).toBe(true);
    endSeason(w);
    expect(c.seasons).toHaveLength(1);
    if (pick.role === "race") expect(d.teamId).toBe(pick.teamId);
    else expect(w.teams.find((t) => t.id === pick.teamId)!.reserve).toBe(d.id);
    expect(d.retired).toBeUndefined();
  }, 60_000);
});
