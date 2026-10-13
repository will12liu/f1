// data/manual/events.csv -> src/engine/career/eventSheet.ts (the CSV text as a module, so the browser, the worker,
// the tests and the tsx scripts all read the same sheet). Used by `npm run events` and the Vite plugin.
import { readFileSync, writeFileSync } from "node:fs";

export const CSV = "data/manual/events.csv";
export const OUT = "src/engine/career/eventSheet.ts";
export const sheetModule = (csv: string) => `// Generated from ${CSV} by \`npm run events\` (and the dev server on save). Edit the CSV, not this file.\nexport const EVENT_SHEET = ${JSON.stringify(csv)};\n`;

/** Rewrite the module if the CSV changed. Returns true when it wrote. */
export function writeEventSheet(root = "."): boolean {
  const csv = readFileSync(`${root}/${CSV}`, "utf8");
  const next = sheetModule(csv);
  let cur = "";
  try {
    cur = readFileSync(`${root}/${OUT}`, "utf8");
  } catch {
    /* first run */
  }
  if (cur === next) return false;
  writeFileSync(`${root}/${OUT}`, next);
  return true;
}
