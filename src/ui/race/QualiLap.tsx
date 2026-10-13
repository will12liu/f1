// The qualifying-lap mini-game: the track scrolls toward you, steer (arrow keys / A-D, or hold the left or right
// half of the screen) to stay on the racing line through three sectors, each quicker than the last. Score 0-1
// from how close you stayed; sector times are coloured like the TV graphics (purple, green, yellow).
import { useEffect, useRef, useState } from "react";
import { QUALI } from "../../engine/race/qualifying";

const SECTOR_LEN = 9; // distance units per sector
const SPEED = [2.6, 3.0, 3.4]; // units per second, by sector
const TOL = 0.11; // how far off the line still counts as on it

type Line = (d: number) => number;
function makeLine(): Line {
  const a = [0.55 + Math.random() * 0.3, 1.3 + Math.random() * 0.5, 2.6 + Math.random() * 0.8];
  const p = [Math.random() * 6, Math.random() * 6, Math.random() * 6];
  return (d) => Math.max(0.12, Math.min(0.88, 0.5 + 0.26 * Math.sin(d * a[0] + p[0]) + 0.1 * Math.sin(d * a[1] + p[1]) + 0.04 * Math.sin(d * a[2] + p[2])));
}

const sectorColor = (q: number) => (q >= 0.9 ? "#c084fc" : q >= 0.72 ? "#34d399" : "#facc15");

export function QualiLap({ session, onDone, onQuit }: { session: string; onDone: (q: number) => void; onQuit: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [sectors, setSectors] = useState<number[]>([]);
  const [started, setStarted] = useState(false);
  const steer = useRef(0); // -1 left, 0, 1 right
  const done = sectors.length === 3;

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "ArrowLeft" || e.code === "KeyA") steer.current = -1;
      if (e.code === "ArrowRight" || e.code === "KeyD") steer.current = 1;
      if ((e.code === "Space" || e.code === "Enter") && !started) setStarted(true);
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
  }, [started]);

  useEffect(() => {
    if (!started) return;
    const cv = ref.current!;
    const g = cv.getContext("2d")!;
    const line = makeLine();
    const dpr = window.devicePixelRatio || 1;
    let W = 0;
    let H = 0;
    let d = 0;
    let x = line(0);
    let vx = 0;
    let last = performance.now();
    let sum = 0;
    let n = 0;
    let sector = 0;
    const got: number[] = [];
    let raf = 0;
    const view = 4.2; // distance visible on screen
    let carY = 0;
    const toY = (dd: number) => carY - ((dd - d) / view) * H;
    const tick = (now: number) => {
      // size from the layout every frame (it can be 0 on the first frame)
      if (cv.clientWidth !== W || cv.clientHeight !== H) {
        W = cv.clientWidth;
        H = cv.clientHeight;
        cv.width = Math.round(W * dpr);
        cv.height = Math.round(H * dpr);
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        carY = H * 0.8;
      }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const sp = SPEED[Math.min(2, sector)];
      d += sp * dt;
      vx += (steer.current * 2.4 - vx * 4) * dt * 4;
      x = Math.max(0.04, Math.min(0.96, x + vx * dt));
      const off = Math.abs(x - line(d));
      sum += Math.max(0, 1 - off / (TOL * 1.6)) * (off <= TOL ? 1 : 0.6);
      n++;
      if (d >= (sector + 1) * SECTOR_LEN) {
        got.push(Math.min(1, sum / Math.max(1, n)));
        setSectors([...got]);
        sum = 0;
        n = 0;
        sector++;
        if (sector >= 3) return;
      }
      // draw: grass, the road along the line, the racing line, the car
      g.fillStyle = "#14331f";
      g.fillRect(0, 0, W, H);
      const road = (w: number, color: string) => {
        g.beginPath();
        for (let k = 0; k <= 60; k++) {
          const dd = d - 1 + (k / 60) * (view + 1.5);
          const px = line(dd) * W;
          const py = toY(dd);
          if (k === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
        g.strokeStyle = color;
        g.lineWidth = w;
        g.lineCap = "round";
        g.lineJoin = "round";
        g.stroke();
      };
      road(W * 0.42, "#e10600");
      road(W * 0.38, "#2a2f3a");
      road(W * TOL * 2, "rgba(52,211,153,0.22)");
      road(3, "#34d399");
      // sector boards
      for (let s2 = 1; s2 <= 3; s2++) {
        const y = toY(s2 * SECTOR_LEN);
        if (y > -20 && y < H + 20) {
          g.fillStyle = "#f8fafc";
          g.fillRect(0, y - 2, W, 4);
        }
      }
      // car
      const cx = x * W;
      g.fillStyle = off <= TOL ? "#ffffff" : "#fb7185";
      g.fillRect(cx - 9, carY - 22, 18, 44);
      g.fillStyle = "#e10600";
      g.fillRect(cx - 12, carY - 26, 24, 6);
      g.fillRect(cx - 12, carY + 18, 24, 6);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [started]);

  const q = sectors.reduce((a, b) => a + b, 0) / Math.max(1, sectors.length);
  const gain = (x: number) => -(x - 0.55) * QUALI.lapSkill; // seconds vs a normal lap, as the engine counts it
  const fmt = (sec: number) => `${sec <= 0 ? "-" : "+"}${Math.abs(sec).toFixed(2)}s`;
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink-950">
      <div className="mx-auto flex min-h-full max-w-5xl flex-col px-6 py-6">
        <div className="flex items-center justify-between">
          <div className="kicker">{session} · flying lap</div>
          <button className="text-lg text-slate-400 hover:text-white" onClick={onQuit}>
            Don't drive it
          </button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[0, 1, 2].map((k) => (
            <div key={k} className="rounded-md bg-ink-900 px-4 py-2">
              <div className="kicker">Sector {k + 1}</div>
              <div className="font-display text-3xl font-black" style={{ color: sectors[k] !== undefined ? sectorColor(sectors[k]) : "#475569" }}>
                {sectors[k] !== undefined ? `${Math.round(sectors[k] * 100)}%` : "-"}
              </div>
            </div>
          ))}
        </div>
        <div
          className="relative mt-4 h-[60vh] min-h-80 select-none overflow-hidden rounded-lg border border-ink-700"
          style={{ touchAction: "none" }}
          onPointerDown={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            steer.current = e.clientX - r.left < r.width / 2 ? -1 : 1;
            if (!started) setStarted(true);
          }}
          onPointerUp={() => (steer.current = 0)}
          onPointerLeave={() => (steer.current = 0)}
        >
          <canvas ref={ref} className="h-full w-full" />
          {!started && (
            <div className="absolute inset-0 grid place-items-center bg-ink-950/80 p-6 text-center">
              <div>
                <div className="headline text-5xl">Stay on the line</div>
                <p className="mt-3 text-lg text-slate-300">Steer with the arrow keys (or A and D), or hold the left or right half of the screen. Three sectors, each faster.</p>
                <button className="btn-xl mt-6 bg-race text-white hover:bg-red-500" onClick={() => setStarted(true)}>
                  Start the lap ›
                </button>
              </div>
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
    </div>
  );
}
