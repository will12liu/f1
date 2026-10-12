// Seeded RNG so a league replays identically from the same seed.

export interface Rng {
  next(): number; // [0, 1)
  int(lo: number, hi: number): number; // inclusive
  normal(mean?: number, sd?: number): number;
  pick<T>(arr: readonly T[]): T;
  chance(p: number): boolean;
  state(): number;
}

export function makeRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = () => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    normal: (mean = 0, sd = 1) => {
      const u = Math.max(next(), 1e-12);
      const v = next();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    state: () => s,
  };
}

/** Stable 32-bit hash of a string (for deriving per-player seeds). */
export function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
