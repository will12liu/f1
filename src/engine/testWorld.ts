// Loads the bundled world for tests and scripts (Node only).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { World } from "./types";

export function loadWorld(seed = 1): World {
  const w = JSON.parse(readFileSync(join(import.meta.dirname, "../../public/data/world-2026.json"), "utf8")) as World;
  w.seed = seed;
  return w;
}
