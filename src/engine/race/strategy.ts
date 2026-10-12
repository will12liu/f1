// Pit strategy: the cheapest stint plans for a race, from the same tyre model the engine uses.
import type { Compound } from "../types";
import { DRY, tyreCost } from "./model";

export interface Stint {
  c: Compound;
  until: number; // pit at the end of this lap (the last stint runs to the flag)
}

export interface Plan {
  stints: Stint[];
  cost: number; // expected seconds lost to tyres + stops
}

/** wear per lap for each compound at this track for this driver */
export type WearRate = Record<Compound, number>;

/** prefix[n] = seconds lost over the first n laps of a set */
function prefix(c: Compound, n: number, wpl: number, base: number): number[] {
  const out = [0];
  for (let a = 0; a < n; a++) out.push(out[a] + tyreCost(c, (a + 0.5) * wpl, base));
  return out;
}

/** All sensible plans from lap `from` (laps done) to `laps`, cheapest first. `first` fixes the compound now fitted. */
export function plans(opts: {
  from: number;
  laps: number;
  wear: WearRate;
  base: number;
  pitLoss: number;
  used: Compound[];
  first?: { c: Compound; age: number }; // continuing on the current set
  maxStops?: number;
}): Plan[] {
  const { from, laps, wear, base, pitLoss, used } = opts;
  const left = laps - from;
  const out: Plan[] = [];
  const mustTwo = (cs: Compound[]) => new Set([...used, ...cs]).size >= 2;
  const firsts: Compound[] = opts.first ? [opts.first.c] : DRY;
  const age0 = opts.first?.age ?? 0;
  // cost of a stint, continuing from age0 if it's the first and we keep the fitted set
  const pre = Object.fromEntries(DRY.map((c) => [c, prefix(c, age0 + left + 1, wear[c], base)])) as Record<Compound, number[]>;
  const cost = (c: Compound, n: number, cont: boolean) => (cont ? pre[c][age0 + n] - pre[c][age0] : pre[c][n]);
  const maxStops = opts.maxStops ?? 2;
  const step = left > 40 ? 2 : 1;
  for (const c1 of firsts) {
    if (mustTwo([c1])) out.push({ stints: [{ c: c1, until: laps }], cost: cost(c1, left, !!opts.first) });
    if (maxStops < 1) continue;
    for (const c2 of DRY) {
      if (!mustTwo([c1, c2])) continue;
      for (let s = 3; s <= left - 3; s += step) {
        const k = cost(c1, s, !!opts.first) + cost(c2, left - s, false) + pitLoss;
        out.push({ stints: [{ c: c1, until: from + s }, { c: c2, until: laps }], cost: k });
      }
      if (maxStops < 2 || left < 24) continue;
      for (const c3 of DRY) {
        if (!mustTwo([c1, c2, c3])) continue;
        for (let s1 = 6; s1 <= left - 12; s1 += 2) {
          const k1 = cost(c1, s1, !!opts.first);
          for (let s2 = 6; s1 + s2 <= left - 6; s2 += 2) {
            const k = k1 + cost(c2, s2, false) + cost(c3, left - s1 - s2, false) + 2 * pitLoss;
            out.push({ stints: [{ c: c1, until: from + s1 }, { c: c2, until: from + s1 + s2 }, { c: c3, until: laps }], cost: k });
          }
        }
      }
    }
  }
  out.sort((a, b) => a.cost - b.cost);
  // keep the best of each compound sequence (so the list is real alternatives, not tiny shifts)
  const seen = new Set<string>();
  return out.filter((p) => {
    const key = p.stints.map((s) => s.c).join("");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
