// Circuit outlines -> public/data/tracks/<id>.json: rotated like the TV graphics, resampled to even
// spacing (so a fraction of the lap is a fraction of the distance), normalised to a 1000-wide box.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CIRCUITS } from "../../data/manual/circuits";
import type { PitLoss } from "../../src/engine/types";
import { readRaw } from "./cache";

interface RawTrack {
  x: number[];
  y: number[];
  rotation?: number;
  pitLoss?: { normal: string; sc: string; vsc: string };
  corners?: { number: number; trackPosition: { x: number; y: number } }[];
}

export interface TrackFile {
  id: string;
  w: number;
  h: number;
  pts: [number, number][]; // evenly spaced, index 0 = start/finish, in driving order
  corners: { n: number; f: number }[]; // corner number and its fraction of the lap
}

const N = 480;
const OUT = join(import.meta.dirname, "../../public/data/tracks");

export function buildTracks(): Record<string, PitLoss> {
  mkdirSync(OUT, { recursive: true });
  const pitLoss: Record<string, PitLoss> = {};
  for (const c of CIRCUITS) {
    const raw = readRaw<RawTrack>(`tracks/${c.id}.json`);
    if (!raw) {
      console.warn(`no outline for ${c.id} (run npm run data:fetch tracks)`);
      continue;
    }
    if (raw.pitLoss) pitLoss[c.id] = { normal: Number(raw.pitLoss.normal), sc: Number(raw.pitLoss.sc), vsc: Number(raw.pitLoss.vsc) };
    const rot = ((raw.rotation ?? 0) * Math.PI) / 180;
    const rotate = (x: number, y: number): [number, number] => [x * Math.cos(rot) - y * Math.sin(rot), x * Math.sin(rot) + y * Math.cos(rot)];
    let pts = raw.x.map((x, i) => rotate(x, raw.y[i]));
    // drop repeated points, close the loop
    pts = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-6);
    const loop = [...pts, pts[0]];
    const cum = [0];
    for (let i = 1; i < loop.length; i++) cum.push(cum[i - 1] + Math.hypot(loop[i][0] - loop[i - 1][0], loop[i][1] - loop[i - 1][1]));
    const total = cum[cum.length - 1];
    const at = (d: number): [number, number] => {
      let lo = 0;
      let hi = cum.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] <= d) lo = mid;
        else hi = mid;
      }
      const f = (d - cum[lo]) / Math.max(1e-9, cum[hi] - cum[lo]);
      return [loop[lo][0] + (loop[hi][0] - loop[lo][0]) * f, loop[lo][1] + (loop[hi][1] - loop[lo][1]) * f];
    };
    const even = Array.from({ length: N }, (_, i) => at((i / N) * total));
    // screen space: y down
    const xs = even.map((p) => p[0]);
    const ys = even.map((p) => -p[1]);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY);
    const s = 1000 / span;
    const out: [number, number][] = even.map((_, i) => [Math.round((xs[i] - minX) * s * 10) / 10, Math.round((ys[i] - minY) * s * 10) / 10]);
    const corners = (raw.corners ?? []).map((k) => {
      const [cx, cy] = rotate(k.trackPosition.x, k.trackPosition.y);
      let best = 0;
      let bd = Infinity;
      even.forEach((p, i) => {
        const d = Math.hypot(p[0] - cx, p[1] - cy);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      return { n: k.number, f: Math.round((best / N) * 1000) / 1000 };
    });
    const file: TrackFile = {
      id: c.id,
      w: Math.round((Math.max(...xs) - minX) * s),
      h: Math.round((Math.max(...ys) - minY) * s),
      pts: out,
      corners,
    };
    writeFileSync(join(OUT, `${c.id}.json`), JSON.stringify(file));
  }
  return pitLoss;
}
