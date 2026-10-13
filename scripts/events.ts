// npm run events: check data/manual/events.csv and rebuild the module the game reads. Prints each event with
// its replies, or the mistakes (by spreadsheet row) when there are any.
import { readFileSync } from "node:fs";
import { parseSheet, WHEN_WORDS } from "../src/engine/career/sheet";
import { CSV, writeEventSheet } from "./eventSheetFile";

const { defs, errors } = parseSheet(readFileSync(CSV, "utf8"));
const wrote = writeEventSheet();
console.log(`${defs.length} events, ${defs.reduce((s, d) => s + d.opts.length, 0)} replies${wrote ? " (game updated)" : ""}`);
if (process.argv.includes("--list")) for (const d of defs) console.log(`  ${d.id.padEnd(16)} ${d.from ?? ""}: ${d.title} [${d.opts.map((o) => o.label).join(" / ")}]`);
if (errors.length) {
  console.log(`\n${errors.length} problem${errors.length > 1 ? "s" : ""}:`);
  for (const e of errors) console.log(`  ${e}`);
  console.log(`\nwhen can use: ${WHEN_WORDS.flags.join(", ")}\n  or compare: ${WHEN_WORDS.numbers.join(", ")} (e.g. fame>10)`);
  process.exit(1);
}
