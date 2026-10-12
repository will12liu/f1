// Rebuilds the race at any moment from a Replay: where each car is on the lap (0-1), who is in the pits,
// the timing order (laps completed, then the time they crossed the line) and gaps, the flag.
// Pure functions, so the viewer just asks "what does the race look like at time T".
import type { Replay } from "../types";

export interface CarView {
  idx: number;
  lap: number; // laps completed
  frac: number; // position on the current lap, 0-1 of the distance
  pit: boolean; // in the pit lane now
  out: boolean; // retired
  done: boolean; // took the flag
  pos: number; // timing position (1-based)
  gap: number | null; // to the leader (seconds), null = leader
  interval: number | null; // to the car ahead
  lapsDown: number;
  compound: string;
  pits: number;
}

export interface RaceView {
  t: number;
  lap: number; // leader's current lap (1-based, capped at laps)
  flag: "green" | "sc" | "vsc" | "chequered";
  cars: CarView[]; // in timing order
}

const PIT_FRAC = 0.985; // the pit lane runs along the last bit of the lap and the line

export interface ReplayIndex {
  r: Replay;
  finishT: number; // the leader took the flag
  pitLoss: Map<string, number>; // `${car}:${lap}` -> seconds in the pit lane
  outAt: Map<number, { t: number; lap: number }>;
  finalLap: number[]; // lap on which each car took the flag (or Infinity)
  end: number; // the replay can stop here
}

export function indexReplay(r: Replay): ReplayIndex {
  const pitLoss = new Map<string, number>();
  const outAt = new Map<number, { t: number; lap: number }>();
  for (const e of r.events) {
    if (e.kind === "pit") pitLoss.set(`${e.a}:${e.lap}`, e.x ?? 20);
    if (e.kind === "dnf") outAt.set(e.a, { t: e.t, lap: e.lap });
  }
  const leaderEnds = r.lapEnd.filter((a) => a.length === r.laps + 1).map((a) => a[r.laps]);
  const finishT = leaderEnds.length ? Math.min(...leaderEnds) : Math.max(...r.lapEnd.map((a) => a[a.length - 1]));
  const finalLap = r.lapEnd.map((a, k) => {
    if (outAt.has(k)) return Infinity;
    for (let l = 1; l < a.length; l++) if (a[l] >= finishT - 1e-9) return l;
    return Infinity;
  });
  const end = Math.max(...r.lapEnd.map((a, k) => (finalLap[k] < Infinity ? a[finalLap[k]] : 0)), finishT) + 4;
  return { r, finishT, pitLoss, outAt, finalLap, end };
}

/** Median time of lap `l` across the field (for cars that never finished it). */
function typicalLap(ix: ReplayIndex, l: number): number {
  const xs = ix.r.lapEnd.filter((a) => a.length > l).map((a) => a[l] - (l === 1 ? 0 : a[l - 1])).sort((x, y) => x - y);
  return xs.length ? xs[Math.floor(xs.length / 2)] : 90;
}

/** Laps completed by car k at time t, and the fraction of the lap in progress. */
function progress(ix: ReplayIndex, k: number, t: number): { lap: number; frac: number; pit: boolean } {
  const ends = ix.r.lapEnd[k];
  let l = 0;
  while (l + 1 < ends.length && ends[l + 1] <= t) l++;
  if (l + 1 >= ends.length) {
    // retired during this lap: keep him moving at the field's pace until the moment he stops
    const est = typicalLap(ix, l + 1);
    const t0 = l === 0 ? 0 : ends[l];
    return { lap: l, frac: Math.min(0.97, Math.max(0, (t - t0) / est)), pit: false };
  }
  const t0 = l === 0 ? Math.min(0, ends[0]) : ends[l];
  const t1 = ends[l + 1];
  const loss = ix.pitLoss.get(`${k}:${l + 1}`);
  // the first lap starts from the grid slot (behind the line)
  const start = l === 0 ? -Math.max(0, ends[0]) * 0.006 : 0;
  if (loss) {
    const drive = Math.max(1, t1 - t0 - loss);
    if (t - t0 < drive) return { lap: l, frac: start + ((t - t0) / drive) * (PIT_FRAC - start), pit: false };
    return { lap: l, frac: PIT_FRAC + ((t - t0 - drive) / loss) * (1 - PIT_FRAC), pit: true };
  }
  const tt = l === 0 ? t : t - t0;
  const dur = l === 0 ? t1 : t1 - t0;
  return { lap: l, frac: start + Math.max(0, tt / dur) * (1 - start), pit: false };
}

export function viewAt(ix: ReplayIndex, t: number): RaceView {
  const r = ix.r;
  const rows = r.lapEnd.map((ends, k) => {
    const out = ix.outAt.get(k);
    const finalLap = ix.finalLap[k];
    const done = finalLap < Infinity && ends[finalLap] <= t;
    let lap: number;
    let frac: number;
    let pit = false;
    if (done) {
      lap = finalLap;
      frac = Math.min(0.06, (t - ends[finalLap]) * 0.002); // rolls on after the line
    } else if (out && t >= out.t) {
      const last = ends.length - 1;
      lap = last;
      frac = Math.min(0.97, Math.max(0, (out.t - (last === 0 ? 0 : ends[last])) / typicalLap(ix, last + 1)));
    } else {
      ({ lap, frac, pit } = progress(ix, k, t));
    }
    // timing: laps completed, then when they crossed the line
    const crossed = done ? finalLap : Math.min(lap, ends.length - 1);
    const crossT = ends[crossed];
    const stint = r.stints[k].find((s) => lap + 1 >= s.from && lap + 1 <= s.to) ?? r.stints[k][r.stints[k].length - 1];
    const pits = r.events.filter((e) => e.kind === "pit" && e.a === k && e.t <= t).length;
    return { idx: k, lap, frac, pit, out: !!out && t >= out.t, done, crossed, crossT, compound: stint?.c ?? "M", pits };
  });
  const order = rows.slice().sort((a, b) => {
    if (a.out !== b.out) return a.out ? 1 : -1;
    if (a.out && b.out) return ix.outAt.get(b.idx)!.t - ix.outAt.get(a.idx)!.t;
    if (a.crossed !== b.crossed) return b.crossed - a.crossed;
    if (a.crossed === 0) return r.lapEnd[a.idx][0] - r.lapEnd[b.idx][0];
    return a.crossT - b.crossT;
  });
  const leader = order[0];
  const cars: CarView[] = order.map((x, i) => {
    let gap: number | null = null;
    let interval: number | null = null;
    let lapsDown = 0;
    if (i > 0 && !x.out && x.crossed > 0) {
      lapsDown = leader.crossed - x.crossed;
      gap = lapsDown > 0 ? null : x.crossT - r.lapEnd[leader.idx][x.crossed];
      const ahead = order[i - 1];
      interval = ahead.crossed === x.crossed ? x.crossT - ahead.crossT : null;
    }
    return { idx: x.idx, lap: x.lap, frac: x.frac, pit: x.pit, out: x.out, done: x.done, pos: i + 1, gap, interval, lapsDown, compound: x.compound, pits: x.pits };
  });
  const leadLap = Math.min(r.laps, leader.crossed + 1);
  const flagRec = r.flags.find((f) => f.lap === leadLap);
  const flag = t >= ix.finishT ? "chequered" : flagRec ? flagRec.flag : "green";
  return { t, lap: leadLap, flag, cars };
}

/** Index into the evenly spaced track polyline for a fraction of the lap (wraps). */
export function trackPoint(pts: [number, number][], frac: number): [number, number] {
  const n = pts.length;
  const f = (((frac % 1) + 1) % 1) * n;
  const i = Math.floor(f);
  const a = pts[i % n];
  const b = pts[(i + 1) % n];
  const u = f - i;
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
}
