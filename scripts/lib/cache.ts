// Cached JSON downloads into data/raw (gitignored). A file that exists is never refetched unless --force.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const RAW = join(import.meta.dirname, "../../data/raw");
const force = process.argv.includes("--force");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let last = 0;
/** `empty404`: a 404 means "no data" (OpenF1): cache an empty list instead of failing. */
export async function getJson<T = unknown>(url: string, file: string, gapMs = 350, empty404 = false): Promise<T> {
  const path = join(RAW, file);
  if (!force && existsSync(path)) return JSON.parse(readFileSync(path, "utf8")) as T;
  for (let attempt = 0; ; attempt++) {
    const wait = last + gapMs - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    let res: Response;
    let data: T;
    try {
      res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (f1-career data script)" }, signal: AbortSignal.timeout(45000) });
      data = res.ok ? ((await res.json()) as T) : res.status === 404 && empty404 ? ([] as T) : (null as T);
    } catch (e) {
      if (attempt < 5) {
        await sleep(3000 * (attempt + 1));
        continue;
      }
      throw e;
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 6) {
      await sleep(4000 * (attempt + 1));
      continue;
    }
    if (!res.ok && !(res.status === 404 && empty404)) throw new Error(`${res.status} ${url}`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(data));
    return data;
  }
}

export function readRaw<T = unknown>(file: string): T | null {
  const path = join(RAW, file);
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : null;
}
