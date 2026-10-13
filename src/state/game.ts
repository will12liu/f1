// The open save: the world, plus actions that run the engine in the worker and save after each step.
import * as Comlink from "comlink";
import { create } from "zustand";
import { readSave, writeSave, type SaveMeta } from "../db/db";
import type { WorkerApi } from "../engine/worker";
import type { Command } from "../engine/race/dials";
import type { WeekendPlan } from "../engine/race/weekend";
import type { LiveAnswers, PreparedRound } from "../engine/season/season";
import type * as Actions from "../engine/manager/actions";
import type * as Academy from "../engine/manager/academy";
import type * as Career from "../engine/career/career";
import type * as Events from "../engine/career/events";
import type * as ShopT from "../engine/career/shop";
import type * as LifeT from "../engine/career/life";
import type { NewDriver } from "../engine/career/career";
import type { World } from "../engine/types";

/** Team-principal actions the UI can call: name + the arguments after `world`. */
type AllActions = typeof Actions & Pick<typeof Career, "spendPoint" | "simSession" | "autoSpend" | "signDeal" | "acceptSeat" | "negotiateSeat"> & Pick<typeof Events, "answerEvent"> & Pick<typeof ShopT, "buyItem" | "sellItem"> & Pick<typeof LifeT, "lifeInit" | "lifeTrade" | "lifeBuy" | "lifeSell" | "lifeHome" | "lifeCarDrive" | "lifeBizUp" | "lifePerson" | "lifeMeet" | "lifeRead" | "lifePost"> & { markCareerRead: (w: World) => { ok: boolean; msg: string } } & Pick<typeof Academy, "hireScout" | "fireScout" | "setScoutFocus" | "signAcademy" | "releaseAcademy" | "buyJuniorTeam" | "placeDriver" | "upgradeProgram" | "scoutMarket">;
export type ActName = Exclude<keyof AllActions, "Answer" | "projectQuote" | "driverAsk" | "driverWilling">;
type ActArgs<K extends ActName> = AllActions[K] extends (w: World, ...a: infer P) => unknown ? P : never;

let worker: Comlink.Remote<WorkerApi> | null = null;
const api = () => (worker ??= Comlink.wrap<WorkerApi>(new Worker(new URL("../engine/worker.ts", import.meta.url), { type: "module" })));

interface GameState {
  meta: SaveMeta | null;
  world: World | null;
  busy: string | null;
  error: string | null;
  open(id: string): Promise<boolean>;
  create(name: string, manager?: { teamId: string; principal: string }, driver?: NewDriver): Promise<string>;
  /** Driver career: the junior race this round, to drive it live. */
  prepareJunior(plan?: WeekendPlan): Promise<{ round: number; series: "F2" | "F3"; input: import("../engine/race/race").RaceInput } | null>;
  /** Run a team-principal action in the worker and save. */
  act<K extends ActName>(name: K, ...args: ActArgs<K>): Promise<{ ok: boolean; msg: string }>;
  simRounds(n: number): Promise<number>;
  nextSeason(): Promise<void>;
  /** Qualifying and the race input for the next round, to drive it live. */
  prepareLive(plan?: WeekendPlan): Promise<PreparedRound | null>;
  /** Saves the live race (replayed from its commands, so it comes out the same). */
  commitLive(commands: Command[], live?: LiveAnswers, junior?: import("../engine/season/juniors").JuniorLive, plan?: WeekendPlan): Promise<number | null>;
}

async function persist(meta: SaveMeta, world: World) {
  const next = { ...meta, season: world.season, round: world.results.length, updatedAt: Date.now() };
  await writeSave(next, world);
  return next;
}

export const useGame = create<GameState>((set, get) => ({
  meta: null,
  world: null,
  busy: null,
  error: null,
  async open(id) {
    if (get().meta?.id === id && get().world) return true;
    const s = await readSave(id);
    if (!s) return false;
    set({ meta: s.meta, world: s.world });
    return true;
  },
  async act(name, ...args) {
    const { world, meta } = get();
    if (!world || !meta) return { ok: false, msg: "No save open." };
    const res = await api().act(world, name, args as unknown[]);
    const m = await persist(meta, res.world);
    set({ world: res.world, meta: m });
    return res.answer;
  },
  async prepareJunior(plan) {
    const { world } = get();
    if (!world) return null;
    return api().prepareJunior(world, plan);
  },
  async create(name, manager, driver) {
    set({ busy: "Loading the 2026 grid…" });
    try {
      const res = await fetch("/data/world-2026.json");
      let world = (await res.json()) as World;
      world.seed = Math.floor(Math.random() * 2 ** 31);
      world.mode = "sandbox";
      if (manager) world = await api().startManager(world, manager.teamId, manager.principal);
      if (driver) world = await api().startCareer(world, driver);
      const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const meta: SaveMeta = { id, name, season: world.season, round: 0, createdAt: Date.now(), updatedAt: Date.now() };
      await writeSave(meta, world);
      set({ meta, world, busy: null });
      return id;
    } catch (e) {
      set({ busy: null, error: (e as Error).message });
      throw e;
    }
  },
  async simRounds(n) {
    const { world, meta } = get();
    if (!world || !meta) return 0;
    set({ busy: n === 1 ? "Racing…" : "Simulating the season…" });
    const res = await api().simRounds(world, n);
    const m = await persist(meta, res.world);
    set({ world: res.world, meta: m, busy: null });
    return res.done;
  },
  async prepareLive(plan) {
    const { world } = get();
    if (!world) return null;
    return api().prepareRound(world, plan);
  },
  async commitLive(commands, live, junior, plan) {
    const { world, meta } = get();
    if (!world || !meta) return null;
    set({ busy: "Saving the race…" });
    const res = await api().commitRound(world, commands, live, junior, plan);
    const m = await persist(meta, res.world);
    set({ world: res.world, meta: m, busy: null });
    return res.summary?.round ?? null;
  },
  async nextSeason() {
    const { world, meta } = get();
    if (!world || !meta) return;
    set({ busy: "Winter: driver market, new cars…" });
    const w = await api().nextSeason(world);
    const m = await persist(meta, w);
    set({ world: w, meta: m, busy: null });
  },
}));
