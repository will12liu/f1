// Runs the simulation off the main thread so the UI stays responsive.
import * as Comlink from "comlink";
import { endSeason } from "./season/offseason";
import * as Act from "./manager/actions";
import * as Acad from "./manager/academy";

const A = { ...Act, answerEvent: Ev.answerEvent, negotiateSeat: Car.negotiateSeat, buyItem: Shop.buyItem, lifeInit: Life.lifeInit, lifeTrade: Life.lifeTrade, lifeBuy: Life.lifeBuy, lifeSell: Life.lifeSell, lifeHome: Life.lifeHome, lifeCarDrive: Life.lifeCarDrive, lifeBizUp: Life.lifeBizUp, lifePerson: Life.lifePerson, lifeMeet: Life.lifeMeet, lifeRead: Life.lifeRead, lifeReply: Life.lifeReply, lifePost: Life.lifePost, sellItem: Shop.sellItem, spendPoint: Car.spendPoint, simSession: Car.simSession, autoSpend: Car.autoSpend, signDeal: Car.signDeal, acceptSeat: Car.acceptSeat, markCareerRead: (w: World) => { for (const m of w.careerState?.inbox ?? []) m.read = true; return { ok: true, msg: "" }; }, hireScout: Acad.hireScout, fireScout: Acad.fireScout, setScoutFocus: Acad.setScoutFocus, signAcademy: Acad.signAcademy, releaseAcademy: Acad.releaseAcademy, buyJuniorTeam: Acad.buyJuniorTeam, placeDriver: Acad.placeDriver, upgradeProgram: Acad.upgradeProgram, scoutMarket: (w: Parameters<typeof Acad.scoutMarket>[0]) => (Acad.scoutMarket(w), { ok: true, msg: "" }) };
import { startManager } from "./manager/manager";
import type { Command } from "./race/dials";
import type { DrivenRound } from "./race/driven";
import { circuitOf, nextRound, prepareNextRound, seasonOver, simNextRound } from "./season/season";
import * as Car from "./career/career";
import * as Ev from "./career/events";
import * as Shop from "./career/shop";
import * as Life from "./career/life";
import { meOf, startCareer, type NewDriver } from "./career/career";
import { isJuniorRound, juniorInput } from "./season/juniors";
import type { WeekendPlan } from "./race/weekend";
import type { World } from "./types";

const api = {
  /** Sims up to `n` rounds (stops at the end of the season). */
  simRounds(world: World, n: number) {
    let done = 0;
    while (done < n && !seasonOver(world)) {
      simNextRound(world);
      done++;
    }
    return { world, done };
  },
  /** Qualifying and the race input for the next round, to drive it live. */
  prepareRound(world: World, plan?: WeekendPlan, qualiTimes?: Record<string, number>) {
    return prepareNextRound(world, plan, qualiTimes);
  },
  /** Records the next round. A driven race is the classification the player just drove; otherwise the lap engine replays their commands. */
  commitRound(world: World, commands: Command[], live?: Parameters<typeof simNextRound>[2], junior?: Parameters<typeof simNextRound>[3], plan?: WeekendPlan, qualiTimes?: Record<string, number>, driven?: DrivenRound) {
    const summary = simNextRound(world, commands, live, junior, plan, qualiTimes, driven);
    return { world, summary };
  },
  /** Driver career: create the driver and his first seat. */
  startCareer(world: World, o: NewDriver) {
    startCareer(world, o);
    return world;
  },
  /** The player's junior race this round (if his series races), to drive it live. */
  prepareJunior(world: World, plan?: WeekendPlan, qualiTimes?: Record<string, number>) {
    const d = meOf(world);
    const r = nextRound(world);
    if (!d || !r || (d.series !== "F2" && d.series !== "F3") || !isJuniorRound(world, d.series, r.round)) return null;
    const circuit = circuitOf(world, r.circuitId);
    return { round: r.round, series: d.series as "F2" | "F3", input: juniorInput(world, d.series, r.round, circuit, plan, qualiTimes) };
  },
  /** Team-principal mode: take over a team. */
  startManager(world: World, teamId: string, name: string) {
    startManager(world, teamId, name);
    return world;
  },
  /** Any team-principal action by name (see manager/actions.ts). */
  act<K extends keyof typeof A>(world: World, name: K, args: unknown[]) {
    const fn = A[name] as unknown as (w: World, ...a: unknown[]) => Act.Answer;
    const answer = fn(world, ...args);
    return { world, answer };
  },
  /** Winter: champions recorded, drivers develop, market, juniors, cars reshuffle, new calendar. */
  nextSeason(world: World) {
    endSeason(world);
    return world;
  },
};

export type WorkerApi = typeof api;
Comlink.expose(api);
