// The open save: the world, plus actions that run the engine in the worker and save after each step.
import * as Comlink from "comlink";
import { create } from "zustand";
import { readSave, writeSave, type SaveMeta } from "../db/db";
import type { WorkerApi } from "../engine/worker";
import type { World } from "../engine/types";

let worker: Comlink.Remote<WorkerApi> | null = null;
const api = () => (worker ??= Comlink.wrap<WorkerApi>(new Worker(new URL("../engine/worker.ts", import.meta.url), { type: "module" })));

interface GameState {
  meta: SaveMeta | null;
  world: World | null;
  busy: string | null;
  error: string | null;
  open(id: string): Promise<boolean>;
  create(name: string): Promise<string>;
  simRounds(n: number): Promise<number>;
  nextSeason(): Promise<void>;
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
  async create(name) {
    set({ busy: "Loading the 2026 grid…" });
    try {
      const res = await fetch("/data/world-2026.json");
      const world = (await res.json()) as World;
      world.seed = Math.floor(Math.random() * 2 ** 31);
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
  async nextSeason() {
    const { world, meta } = get();
    if (!world || !meta) return;
    set({ busy: "Winter: driver market, new cars…" });
    const w = await api().nextSeason(world);
    const m = await persist(meta, w);
    set({ world: w, meta: m, busy: null });
  },
}));
