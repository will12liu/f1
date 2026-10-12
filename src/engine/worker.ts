// Runs the simulation off the main thread so the UI stays responsive.
import * as Comlink from "comlink";
import { endSeason } from "./season/offseason";
import { seasonOver, simNextRound } from "./season/season";
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
  /** Winter: champions recorded, drivers develop, market, juniors, cars reshuffle, new calendar. */
  nextSeason(world: World) {
    endSeason(world);
    return world;
  },
};

export type WorkerApi = typeof api;
Comlink.expose(api);
