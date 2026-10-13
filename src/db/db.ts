// Saves live in the browser's IndexedDB. The small `saves` table drives the load screen; the full
// world lives in `worlds` so listing saves never loads the whole thing.
import Dexie, { type Table } from "dexie";
import type { World } from "../engine/types";

export interface SaveMeta {
  id: string;
  name: string;
  season: number;
  round: number; // rounds completed this season
  createdAt: number;
  updatedAt: number;
  // For the start menu (filled from the world on every save; older saves get it from the v2 upgrade).
  mode?: "sandbox" | "manager" | "career";
  who?: string; // your driver or your team
  color?: string; // their team colour
}

/** What the start menu shows about a save, read from its world. */
export function summarize(world: World): Pick<SaveMeta, "mode" | "who" | "color"> {
  const mode = world.mode ?? (world.manager ? "manager" : "sandbox");
  const team = (id: string | null | undefined) => (id ? world.teams.find((t) => t.id === id) : undefined);
  if (mode === "career" && world.careerState) {
    const d = world.drivers.find((x) => x.id === world.careerState!.driverId);
    const t = team(d?.teamId ?? d?.contract?.teamId);
    return { mode, who: d ? `${d.first} ${d.last}${d.series ? ` · ${d.series}` : ""}` : undefined, color: t?.color };
  }
  if (mode === "manager" && world.manager) {
    const t = team(world.manager.teamId);
    return { mode, who: t?.name, color: t?.color };
  }
  return { mode: "sandbox" };
}

interface SaveData {
  id: string;
  world: World;
}

class GameDB extends Dexie {
  saves!: Table<SaveMeta, string>;
  worlds!: Table<SaveData, string>;
  constructor() {
    super("f1-career");
    this.version(1).stores({ saves: "id, updatedAt", worlds: "id" });
    this.version(2)
      .stores({ saves: "id, updatedAt", worlds: "id" })
      .upgrade(async (tx) => {
        const worlds = await tx.table<SaveData, string>("worlds").toArray();
        for (const w of worlds) await tx.table<SaveMeta, string>("saves").update(w.id, summarize(w.world));
      });
  }
}

export const db = new GameDB();

export const listSaves = () => db.saves.orderBy("updatedAt").reverse().toArray();

export async function writeSave(meta: SaveMeta, world: World) {
  await db.transaction("rw", db.saves, db.worlds, async () => {
    await db.saves.put({ ...meta, ...summarize(world), updatedAt: Date.now() });
    await db.worlds.put({ id: meta.id, world });
  });
}

export async function readSave(id: string): Promise<{ meta: SaveMeta; world: World } | null> {
  const [meta, data] = await Promise.all([db.saves.get(id), db.worlds.get(id)]);
  return meta && data ? { meta, world: data.world } : null;
}

export async function deleteSave(id: string) {
  await db.transaction("rw", db.saves, db.worlds, async () => {
    await db.saves.delete(id);
    await db.worlds.delete(id);
  });
}

/** A save as a file (JSON), for backups or moving to another browser. */
export async function exportSave(id: string): Promise<Blob | null> {
  const s = await readSave(id);
  if (!s) return null;
  return new Blob([JSON.stringify({ format: "paddock-save", version: 1, meta: s.meta, world: s.world })], { type: "application/json" });
}

/** Load a save file as a new save (new id, so it never overwrites one). */
export async function importSave(text: string): Promise<SaveMeta> {
  const data = JSON.parse(text) as { format?: string; meta?: SaveMeta; world?: World };
  if (data.format !== "paddock-save" || !data.meta || !data.world) throw new Error("That isn't a Paddock save file.");
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const meta: SaveMeta = { ...data.meta, id, name: `${data.meta.name} (imported)`, updatedAt: Date.now() };
  await writeSave(meta, data.world);
  return meta;
}
