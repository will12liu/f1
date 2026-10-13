// The qualifying-lap mini-game, on the real circuit: an onboard chase camera follows your car around the track
// outline (the same file the race view uses). Steer (arrow keys / A-D, or hold the left or right half of the
// screen) to stay on the racing line: outside into a corner, the apex, back out. Slower through corners, flat on
// the straights. Three sectors (thirds of the lap) coloured like the TV graphics. Score 0-1 = time on the line.
import { useEffect, useRef, useState } from "react";
import { QUALI } from "../../engine/race/qualifying";
import { loadTrack } from "../components/bits";

const HALF = 9; // half the road width, in track units
const TOL = 0.26; // how far off the line (in half-widths) still counts as on it
const LAP_SEC = 34; // real seconds for a lap
const VIEW = 170; // track units across the shorter side of the screen

interface Geo {
  n: number;
  len: number;
  s: number[]; // distance at each point
  px: number[];
  py: number[];
  nx: number[]; // left normal
  ny: number[];
  line: number[]; // racing line offset, half-widths (+ = left)
  speed: number[]; // units per second
  kerb: boolean[];
  pts: [number, number][];
  w: number;
  h: number;
}

function blur(a: number[], r: number): number[] {
  const n = a.length;
  const out = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = 0;
    let w = 0;
    for (let k = -r; k <= r; k++) {
      const g = Math.exp(-(k * k) / (2 * (r / 2) ** 2));
      s += a[(i + k + n) % n] * g;
      w += g;
    }
    out[i] = s / w;
  }
  return out;
}

function build(pts: [number, number][], w: number, h: number): Geo {
  const n = pts.length;
  const px = pts.map((p) => p[0]);
  const py = pts.map((p) => p[1]);
  const s: number[] = [0];
  for (let i = 1; i < n; i++) s.push(s[i - 1] + Math.hypot(px[i] - px[i - 1], py[i] - py[i - 1]));
  const len = s[n - 1] + Math.hypot(px[0] - px[n - 1], py[0] - py[n - 1]);
  const nx: number[] = [];
  const ny: number[] = [];
  const turn: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n];
    const b = pts[(i + 1) % n];
    const tx = b[0] - a[0];
    const ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    nx.push(ty / l); // left of the direction of travel (screen y points down)
    ny.push(-tx / l);
    const h1 = Math.atan2(pts[i][1] - a[1], pts[i][0] - a[0]);
    const h2 = Math.atan2(b[1] - pts[i][1], b[0] - pts[i][0]);
    let d = h2 - h1;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    turn.push(d);
  }
  const c = blur(turn, 5);
  const cMax = Math.max(...c.map(Math.abs)) || 1;
  const ahead = Math.round(n * 0.018);
  // the line: inside at the apex (against the turn), outside on the way in (with the turn ahead)
  const raw = c.map((_, i) => (-1.6 * c[i] + 1.1 * c[(i + ahead) % n]) / cMax);
  const line = blur(raw, 4).map((v) => Math.max(-0.82, Math.min(0.82, v * 1.4)));
  // speed: slow where it turns, normalised so a lap takes LAP_SEC
  const rel = c.map((v) => 1 - 0.55 * Math.min(1, Math.abs(v) / (cMax * 0.6)));
  const relS = blur(rel, 6);
  let t = 0;
  for (let i = 0; i < n; i++) t += len / n / relS[i];
  const k = t / LAP_SEC;
  return { n, len, s, px, py, nx, ny, line, speed: relS.map((v) => v * k), kerb: c.map((v) => Math.abs(v) > cMax * 0.35), pts, w, h };
}

/** Interpolated value at distance d along the lap. */
function at(g: Geo, arr: number[], d: number) {
  const f = ((d % g.len) + g.len) % g.len / g.len * g.n;
  const i = Math.floor(f) % g.n;
  const j = (i + 1) % g.n;
  const u = f - Math.floor(f);
  return arr[i] * (1 - u) + arr[j] * u;
}

const sectorColor = (q: number) => (q >= 0.9 ? "#c084fc" : q >= 0.72 ? "#34d399" : "#facc15");

export function QualiLap({ session, trackId, color = "#e10600", onDone, onQuit }: { session: string; trackId: string; color?: string; onDone: (q: number) => void; onQuit: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [geo, setGeo] = useState<Geo | null>(null);
  const [sectors, setSectors] = useState<number[]>([]);
  const [started, setStarted] = useState(false);
  const steer = useRef(0);
  const done = sectors.length === 3;

  useEffect(() => {
    let live = true;
    loadTrack(trackId).then((t) => live && setGeo(build(t.pts as [number, number][], t.w, t.h)));
    return () => {
      live = false;
    };
  }, [trackId]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "ArrowLeft" || e.code === "KeyA") steer.current = -1;
      if (e.code === "ArrowRight" || e.code === "KeyD") steer.current = 1;
      if ((e.code === "Space" || e.code === "Enter") && !started && geo) setStarted(true);
      if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      if ((e.code === "ArrowLeft" || e.code === "KeyA") && steer.current < 0) steer.current = 0;
      if ((e.code === "ArrowRight" || e.code === "KeyD") && steer.current > 0) steer.current = 0;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [started, geo]);

  // draw the grid view before the start, then run the lap
  useEffect(() => {
    if (!geo) return;
    const g = geo;
    const cv = ref.current!;
    const ctx = cv.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    let W = 0;
    let H = 0;
    let d = 0;
    let x = at(g, g.line, 0);
    let vx = 0;
    let last = performance.now();
    let sum = 0;
    let cnt = 0;
    let sector = 0;
    let head = Math.atan2(at(g, g.py, 8) - at(g, g.py, 0), at(g, g.px, 8) - at(g, g.px, 0));
    const got: number[] = [];
    let raf = 0;
    const path = (off: number) => {
      ctx.beginPath();
      for (let i = 0; i <= g.n; i++) {
        const k = i % g.n;
        const X = g.px[k] + g.nx[k] * off * HALF;
        const Y = g.py[k] + g.ny[k] * off * HALF;
        if (i === 0) ctx.moveTo(X, Y);
        else ctx.lineTo(X, Y);
      }
    };
    const linePath = () => {
      ctx.beginPath();
      for (let i = 0; i <= g.n; i++) {
        const k = i % g.n;
        const X = g.px[k] + g.nx[k] * g.line[k] * HALF;
        const Y = g.py[k] + g.ny[k] * g.line[k] * HALF;
        if (i === 0) ctx.moveTo(X, Y);
        else ctx.lineTo(X, Y);
      }
    };
    const frame = (now: number) => {
      if (cv.clientWidth !== W || cv.clientHeight !== H) {
        W = cv.clientWidth;
        H = cv.clientHeight;
        cv.width = Math.round(W * dpr);
        cv.height = Math.round(H * dpr);
      }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      let off = Math.abs(x - at(g, g.line, d));
      if (started && sector < 3) {
        d += at(g, g.speed, d) * dt * (Math.abs(x) > 1.05 ? 0.75 : 1); // the grass is slow
        vx += (steer.current * 3.2 - vx * 4.5) * dt * 4;
        x = Math.max(-1.35, Math.min(1.35, x + vx * dt));
        off = Math.abs(x - at(g, g.line, d));
        sum += Math.max(0, 1 - off / (TOL * 1.6)) * (off <= TOL ? 1 : 0.6) * (Math.abs(x) > 1.05 ? 0.3 : 1);
        cnt++;
        if (d >= ((sector + 1) * g.len) / 3) {
          got.push(Math.min(1, sum / Math.max(1, cnt)));
          setSectors([...got]);
          sum = 0;
          cnt = 0;
          sector++;
        }
      }
      // camera: behind the car, the road ahead pointing up
      const ax = at(g, g.px, d + 14) - at(g, g.px, d - 4);
      const ay = at(g, g.py, d + 14) - at(g, g.py, d - 4);
      const want = Math.atan2(ay, ax);
      let dh = want - head;
      while (dh > Math.PI) dh -= 2 * Math.PI;
      while (dh < -Math.PI) dh += 2 * Math.PI;
      head += dh * Math.min(1, dt * 7);
      const carX = at(g, g.px, d) + at(g, g.nx, d) * x * HALF;
      const carY = at(g, g.py, d) + at(g, g.ny, d) * x * HALF;
      const scale = Math.min(W, H) / VIEW;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#183a24";
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.translate(W / 2, H * 0.74);
      ctx.scale(scale, scale);
      ctx.rotate(-head - Math.PI / 2);
      ctx.translate(-carX, -carY);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      // run-off, kerbs (corners only), tarmac
      path(0);
      ctx.strokeStyle = "#2c4a33";
      ctx.lineWidth = HALF * 2 + 16;
      ctx.stroke();
      for (let i = 0; i < g.n; i++) {
        if (!g.kerb[i]) continue;
        const j = (i + 1) % g.n;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(g.px[i] + g.nx[i] * side * (HALF + 1.2), g.py[i] + g.ny[i] * side * (HALF + 1.2));
          ctx.lineTo(g.px[j] + g.nx[j] * side * (HALF + 1.2), g.py[j] + g.ny[j] * side * (HALF + 1.2));
          ctx.strokeStyle = i % 2 ? "#e10600" : "#f8fafc";
          ctx.lineWidth = 2.4;
          ctx.lineCap = "butt";
          ctx.stroke();
        }
      }
      ctx.lineCap = "round";
      path(0);
      ctx.strokeStyle = "#3a3f4a";
      ctx.lineWidth = HALF * 2;
      ctx.stroke();
      for (const side of [-1, 1]) {
        path(side * 0.97);
        ctx.strokeStyle = "rgba(248,250,252,0.7)";
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
      // the racing line and how wide "on it" is
      linePath();
      ctx.strokeStyle = "rgba(52,211,153,0.2)";
      ctx.lineWidth = TOL * 2 * HALF;
      ctx.stroke();
      linePath();
      ctx.strokeStyle = "#34d399";
      ctx.lineWidth = 0.7;
      ctx.stroke();
      // start/finish and sector lines
      for (const [k, col] of [[0, "#f8fafc"], [1 / 3, "#facc15"], [2 / 3, "#facc15"]] as [number, string][]) {
        const dd = k * g.len;
        const cx = at(g, g.px, dd);
        const cy = at(g, g.py, dd);
        const nx = at(g, g.nx, dd);
        const ny = at(g, g.ny, dd);
        ctx.beginPath();
        ctx.moveTo(cx - nx * HALF, cy - ny * HALF);
        ctx.lineTo(cx + nx * HALF, cy + ny * HALF);
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.6;
        ctx.lineCap = "butt";
        ctx.stroke();
      }
      ctx.restore();
      // the car, always pointing up at the centre bottom
      ctx.save();
      ctx.translate(W / 2, H * 0.74);
      const u = Math.max(0.9, Math.min(2.2, scale / 4));
      ctx.scale(u, u);
      const offTrack = Math.abs(x) > 1.05;
      ctx.fillStyle = "#0b0d12";
      for (const [wx, wy] of [[-9, -13], [9, -13], [-9, 10], [9, 10]]) ctx.fillRect(wx - 3, wy - 5, 6, 10);
      ctx.fillStyle = offTrack ? "#fb7185" : color;
      ctx.fillRect(-4, -22, 8, 40); // body
      ctx.fillRect(-12, -24, 24, 4); // front wing
      ctx.fillRect(-10, 16, 20, 5); // rear wing
      ctx.fillStyle = "#f8fafc";
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2); // helmet
      ctx.fill();
      ctx.restore();
      // mini map: the whole circuit, your dot, the sectors done
      const mw = Math.min(220, W * 0.28);
      const ms = mw / g.w;
      const mh = g.h * ms;
      ctx.save();
      ctx.translate(W - mw - 18, 18);
      ctx.fillStyle = "rgba(9,11,15,0.82)";
      ctx.fillRect(-10, -10, mw + 20, mh + 20);
      ctx.scale(ms, ms);
      ctx.beginPath();
      g.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.closePath();
      ctx.strokeStyle = "#64748b";
      ctx.lineWidth = 3 / ms;
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(carX, carY, 6 / ms, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      if (sector < 3) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [geo, started, color]);

  const q = sectors.reduce((a, b) => a + b, 0) / Math.max(1, sectors.length);
  const gain = (v: number) => -(v - 0.55) * QUALI.lapSkill; // seconds vs a normal lap, as the engine counts it
  const fmt = (sec: number) => `${sec <= 0 ? "-" : "+"}${Math.abs(sec).toFixed(2)}s`;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink-950">
      <div className="flex shrink-0 flex-wrap items-center gap-4 px-6 py-4">
        <div>
          <div className="kicker">{session} · flying lap</div>
          <div className="font-display text-3xl font-black uppercase text-white">{trackId.replace(/_/g, " ")}</div>
        </div>
        <div className="ml-auto grid grid-cols-3 gap-2">
          {[0, 1, 2].map((k) => (
            <div key={k} className="w-28 rounded-md bg-ink-900 px-3 py-1.5">
              <div className="text-xs font-bold uppercase text-slate-400">Sector {k + 1}</div>
              <div className="font-display text-3xl font-black leading-none" style={{ color: sectors[k] !== undefined ? sectorColor(sectors[k]) : "#475569" }}>
                {sectors[k] !== undefined ? `${Math.round(sectors[k] * 100)}%` : "-"}
              </div>
            </div>
          ))}
        </div>
        <button className="text-lg text-slate-400 hover:text-white" onClick={onQuit}>
          Don't drive it
        </button>
      </div>
      <div
        className="relative min-h-0 flex-1 select-none overflow-hidden"
        style={{ touchAction: "none" }}
        onPointerDown={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          steer.current = e.clientX - r.left < r.width / 2 ? -1 : 1;
          if (!started && geo) setStarted(true);
        }}
        onPointerUp={() => (steer.current = 0)}
        onPointerLeave={() => (steer.current = 0)}
      >
        <canvas ref={ref} className="h-full w-full" />
        {!started && (
          <div className="absolute inset-x-0 bottom-0 bg-ink-950/90 p-6 text-center">
            <div className="headline text-5xl">Stay on the line</div>
            <p className="mt-2 text-lg text-slate-300">Steer with the arrow keys (or A and D), or hold the left or right half of the screen. Outside into the corner, clip the apex, out again. The grass is slow.</p>
            <button className="btn-xl mt-4 bg-race text-white hover:bg-red-500" disabled={!geo} onClick={() => setStarted(true)}>
              {geo ? "Start the lap ›" : "Loading the track…"}
            </button>
          </div>
        )}
        {done && (
          <div className="absolute inset-0 grid place-items-center bg-ink-950/85 p-6 text-center">
            <div>
              <div className="kicker">Against a normal lap</div>
              <div className="font-display text-8xl font-black leading-none" style={{ color: sectorColor(q) }}>
                {fmt(gain(q))}
              </div>
              <div className="mt-2 text-lg text-slate-400">On the line {Math.round(q * 100)}% of the lap{q >= 0.85 ? ", and a clean one: less chance of a scrappy lap" : q < 0.3 ? ": a scrappy lap is twice as likely" : ""}</div>
              <button autoFocus className="btn-xl mt-6 bg-race text-white hover:bg-red-500" onClick={() => onDone(q)}>
                Keep this lap ›
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
