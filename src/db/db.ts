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
  }
}

export const db = new GameDB();

export const listSaves = () => db.saves.orderBy("updatedAt").reverse().toArray();

export async function writeSave(meta: SaveMeta, world: World) {
  await db.transaction("rw", db.saves, db.worlds, async () => {
    await db.saves.put({ ...meta, updatedAt: Date.now() });
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
