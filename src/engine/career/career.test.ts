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

import { ensureLife, lifeBuy, lifeHome, lifeMeet, lifePerson, lifeSell, lifeTrade, netWorth, priceOf } from "./life";
describe("the phone", () => {
  it("markets move each weekend, homes rent and sell, people respond, and it's the same from the same seed", () => {
    const run = () => {
      const w = loadWorld(53);
      startCareer(w, { first: "Pat", last: "Phone", nat: "British", archetype: "racer", tier: "self", start: "F2", difficulty: "pro" });
      const c = careerOf(w)!;
      c.cash = 5e6;
      const L = ensureLife(w)!;
      expect(L.people.some((p) => p.role === "mum")).toBe(true);
      const p0 = priceOf(L, "P100");
      expect(lifeTrade(w, "P100", 100_000).ok).toBe(true);
      expect(lifeTrade(w, "DRS", 50_000).ok).toBe(true);
      expect(lifeBuy(w, "home", "flat").ok).toBe(true);
      expect(lifeBuy(w, "car", "hatch").ok).toBe(true);
      expect(lifeBuy(w, "biz", "kart").ok).toBe(true);
      const home = L.homes[0];
      expect(lifeHome(w, home.id, "rent").ok).toBe(true);
      expect(lifePerson(w, "mum", "talk").ok).toBe(true);
      expect(lifePerson(w, "mum", "talk").ok).toBe(false); // once a weekend
      lifeMeet(w);
      for (let i = 0; i < 4; i++) simNextRound(w);
      expect(priceOf(L, "P100")).not.toBe(p0);
      expect(L.ledger.some(([k]) => k.startsWith("Rent"))).toBe(true);
      expect(L.feed.length).toBeGreaterThan(0);
      const cash = c.cash;
      expect(lifeSell(w, "home", home.id).ok).toBe(true);
      expect(c.cash).toBeGreaterThan(cash);
      expect(lifeTrade(w, "P100", -1e15).ok).toBe(true);
      expect(L.hold.P100).toBeUndefined();
      expect(netWorth(c).total).toBeGreaterThan(0);
      return JSON.stringify([L.prices, L.homes, L.cars, L.people.map((p) => p.rel)]);
    };
    expect(run()).toBe(run());
  }, 60_000);
});

import { readFileSync } from "node:fs";
import { parseSheet } from "./sheet";
import { sheetModule } from "../../../scripts/eventSheetFile";
import { EVENT_SHEET } from "./eventSheet";
describe("the events sheet", () => {
  it("data/manual/events.csv reads cleanly and the game has the latest copy", () => {
    const csv = readFileSync("data/manual/events.csv", "utf8");
    expect(parseSheet(csv).errors).toEqual([]);
    expect(EVENT_SHEET).toBe(csv); // run `npm run events` after editing the sheet
    expect(sheetModule(csv)).toContain("EVENT_SHEET");
  });
  it("mistakes are reported by row and that event is skipped", () => {
    const bad = 'id,title,message,when,reply,effects\nok,Hi,Hello,fame>5,Yes,"fame +1"\nx,T,M,fmae>5,Yes,"fame +1"\ny,T,M,,Yes,"fame plus one"\n';
    const r = parseSheet(bad);
    expect(r.defs.map((d) => d.id)).toEqual(["ok"]);
    expect(r.errors.join("\n")).toMatch(/Row 3 \(x\).*fmae/);
    expect(r.errors.join("\n")).toMatch(/Row 4 \(y\)/);
  });
});

import { buildBudget, buildShape, buildSpent, presetBuild, ARCHETYPES, TIERS as TIERS_ } from "./career";
import { ovrOf } from "../ratings";
describe("the creator's build", () => {
  it("presets and custom builds spend the same budget and land on the background's overall", () => {
    for (const tier of ["academy", "mid", "self"] as const)
      for (const start of ["F3", "F2"] as const)
        for (const a of ARCHETYPES) {
          const b = presetBuild(a.id, tier, start);
          expect(buildSpent(b)).toBe(buildBudget(tier, start));
        }
    const w = loadWorld(57);
    // all in on race pace and qualifying, the rest at the floor
    const build = { pace: 90, quali: 90, aggression: 70 } as Record<string, number>;
    const left = buildBudget("mid", "F3") - buildSpent(build);
    expect(left).toBeGreaterThan(0);
    startCareer(w, { first: "Cus", last: "Tom", nat: "Taiwanese", archetype: "custom", tier: "mid", start: "F3", difficulty: "pro", build: { ...build, racecraft: 90, tyres: 90, consistency: 90, overtaking: 90 } });
    const c = careerOf(w)!;
    const d = w.drivers.find((x) => x.id === c.driverId)!;
    expect(d.ovr).toBeLessThanOrEqual(TIERS_.mid.ovr.F3); // over budget gets scaled back
    expect(c.archetype).toBe("custom");
    expect(Object.keys(c.caps).length).toBe(2);
    expect(buildShape(d.ratings).weak.every((k) => c.caps[k] === 84)).toBe(true);
    const w2 = loadWorld(57);
    startCareer(w2, { first: "Pre", last: "Set", nat: "British", archetype: "qualifier", tier: "mid", start: "F3", difficulty: "pro", build: presetBuild("qualifier", "mid", "F3") });
    const d2 = w2.drivers.find((x) => x.id === careerOf(w2)!.driverId)!;
    expect(ovrOf(d2.ratings)).toBe(TIERS_.mid.ovr.F3);
  });
});
