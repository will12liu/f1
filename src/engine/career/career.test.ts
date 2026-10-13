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

import { answerEvent, EVENT_COUNT } from "./events";
describe("life between races", () => {
  it("events come up, wait for an answer, and change the career", () => {
    expect(EVENT_COUNT()).toBeGreaterThan(20);
    const w = loadWorld(47);
    startCareer(w, { first: "Lee", last: "Life", nat: "Italian", archetype: "wet", tier: "mid", start: "F3", difficulty: "pro" });
    const c = careerOf(w)!;
    let seen = 0;
    for (let i = 0; i < 12; i++) {
      simNextRound(w);
      if (c.event) {
        seen++;
        const before = JSON.stringify([c.fame, c.trust, c.morale, c.xp, c.points, c.cash, c.rel]);
        answerEvent(w, 0);
        expect(c.event).toBeUndefined();
        expect(JSON.stringify([c.fame, c.trust, c.morale, c.xp, c.points, c.cash, c.rel])).not.toBe(before);
      }
    }
    expect(seen).toBeGreaterThan(1);
  }, 60_000);
});

import { buyItem, ITEMS } from "./shop";
import { negotiateSeat } from "./career";
describe("career money", () => {
  it("negotiation changes the offer or ends it; the shop costs money and gives perks", () => {
    const w = loadWorld(49);
    startCareer(w, { first: "Max", last: "Money", nat: "German", archetype: "racer", tier: "self", start: "F2", difficulty: "pro" });
    const c = careerOf(w)!;
    const cash0 = c.cash;
    expect(buyItem(w, "rig").ok).toBe(true);
    expect(c.cash).toBeLessThan(cash0);
    expect(buyItem(w, "rig").ok).toBe(false);
    expect(ITEMS.length).toBeGreaterThan(8);
    while (!seasonOver(w)) simNextRound(w);
    const o = c.seatOffers[0];
    const before = JSON.stringify(o);
    const res = negotiateSeat(w, o.id, 1.5, 3, "lead");
    const after = c.seatOffers.find((x) => x.id === o.id);
    if (res.ok) expect(after!.years).toBe(3);
    else expect(!after || JSON.stringify(after) !== before).toBe(true);
    expect(c.owned).toContain("rig");
  }, 60_000);
});
