// Runs the simulation off the main thread so the UI stays responsive.
import * as Comlink from "comlink";
import { endSeason } from "./season/offseason";
import * as Act from "./manager/actions";
import * as Acad from "./manager/academy";

const A = { ...Act, hireScout: Acad.hireScout, fireScout: Acad.fireScout, setScoutFocus: Acad.setScoutFocus, signAcademy: Acad.signAcademy, releaseAcademy: Acad.releaseAcademy, buyJuniorTeam: Acad.buyJuniorTeam, placeDriver: Acad.placeDriver, upgradeProgram: Acad.upgradeProgram, scoutMarket: (w: Parameters<typeof Acad.scoutMarket>[0]) => (Acad.scoutMarket(w), { ok: true, msg: "" }) };
import { startManager } from "./manager/manager";
import type { Command } from "./race/dials";
import { prepareNextRound, seasonOver, simNextRound } from "./season/season";
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
  prepareRound(world: World) {
    return prepareNextRound(world);
  },
  /** Records the next round as driven live: the same race replayed with the player's commands. */
  commitRound(world: World, commands: Command[], live?: Parameters<typeof simNextRound>[2]) {
    const summary = simNextRound(world, commands, live);
    return { world, summary };
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
