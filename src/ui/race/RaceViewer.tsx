// The 2D race: a canvas track with every car, a timing tower and an event feed, replayed from a
// Replay at a chosen speed. The engine already decided everything; this only asks `viewAt(t)`.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { COMPOUNDS } from "../../engine/race/model";
import { indexReplay, trackPoint, viewAt, type RaceView } from "../../engine/race/replay";
import type { Replay, World } from "../../engine/types";
import { gap as fmtGap, lapTime } from "../../lib/format";
import { useMaps, useTrack, type TrackFile } from "../components/bits";

const SPEEDS = [1, 2, 4, 8, 16];
const BASE_RATE = 6; // race seconds per real second at 1x

/** A race still being run: the viewer asks it to run far enough to show time `t`. */
export interface LiveSource {
  advance(t: number): number; // runs laps as needed, returns the latest time that can be shown
  finish(): void; // run to the flag at the current dials
}

export function RaceViewer({ world, replay, live, side, follow0 = null }: { world: World; replay: Replay; live?: LiveSource; side?: ReactNode; follow0?: number | null }) {
  const track = useTrack(replay.circuitId);
  const ix = useMemo(() => indexReplay(replay, !!live), [replay, live]);
  const { drivers, teams } = useMaps(world);
  const cars = useMemo(
    () =>
      replay.cars.map((c) => {
        const d = drivers.get(c.driverId);
        const t = teams.get(c.teamId);
        return { code: d?.code ?? "???", name: d ? `${d.first} ${d.last}` : c.driverId, color: t?.color ?? "#888", color2: t?.color2 ?? "#111" };
      }),
    [replay, drivers, teams],
  );
  const [t, setT] = useState(-3);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(4);
  const [showInterval, setShowInterval] = useState(false);
  const [follow, setFollow] = useState<number | null>(follow0);
  const tRef = useRef(t);
  tRef.current = t;

  // clock
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(1, (now - last) / 1000); // real time, so a slow or throttled frame rate keeps the right pace
      last = now;
      const v = viewAt(ix, Math.max(0, tRef.current));
      const slow = v.lap >= replay.laps - 1 && v.flag !== "chequered" ? 0.6 : 1; // the last laps play slower
      let next = Math.min(ix.end, tRef.current + dt * BASE_RATE * speed * slow);
      if (live) next = Math.min(next, live.advance(next));
      setT(next);
      if (next >= ix.end) setPlaying(false);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, ix, replay.laps, live]);
  useEffect(() => {
    if (t > ix.end) setT(ix.end); // a live race that just ran to the flag
  }, [t, ix.end]);

  const view = viewAt(ix, Math.max(0, t));
  const feed = useMemo(() => replay.events.filter((e) => e.t <= t && e.kind !== "mistake").slice(-7).reverse(), [replay.events, t]);
  const jumpLap = (dl: number) => {
    const lead = view.cars[0]?.idx ?? 0;
    const ends = replay.lapEnd[lead];
    const target = Math.max(1, Math.min(replay.laps, view.lap + dl - 1));
    if (live) {
      const want = (ends[target - 1] ?? t + (ends[1] ?? 90)) + 0.01;
      setT(Math.min(want, live.advance(want)));
      return;
    }
    setT(Math.min(ix.end, (ends[target - 1] ?? ix.finishT) + 0.01));
  };

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
      <div className="panel overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-ink-800">
          <div className="font-display text-xl font-bold tracking-wide">
            LAP {Math.max(1, view.lap)}
            <span className="text-slate-500">/{replay.laps}</span>
          </div>
          <FlagBadge flag={view.flag} />
          <div className="ml-auto flex items-center gap-1">
            <button className="btn-ghost !px-2.5 !py-1" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"}>
              {playing ? "❚❚" : "▶"}
            </button>
            {SPEEDS.map((s) => (
              <button key={s} onClick={() => setSpeed(s)} className={`btn !px-2 !py-1 ${speed === s ? "bg-race text-white" : "bg-ink-800 text-slate-300 hover:bg-ink-700"}`}>
                {s}x
              </button>
            ))}
            <button className="btn-ghost !px-2 !py-1" onClick={() => jumpLap(1)} title="Next lap">
              +1 lap
            </button>
            <button className="btn-ghost !px-2 !py-1" onClick={() => { if (live) { live.finish(); setT(Infinity); } else setT(ix.end); setPlaying(false); }} title={live ? "Sim the rest at the current dials" : "Skip to the flag"}>
              ⏭
            </button>
          </div>
        </div>
        <TrackCanvas track={track} view={view} cars={cars} follow={follow} />
        {!live && <div className="px-3 py-2 border-t border-ink-800">
          <input
            type="range"
            min={0}
            max={ix.end}
            step={0.5}
            value={Math.max(0, t)}
            onChange={(e) => setT(Number(e.target.value))}
            className="w-full accent-red-600"
            aria-label="Race time"
          />
        </div>}
      </div>

      <div className="grid gap-3 content-start">
        {side}
        <div className="panel overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-ink-800 text-[11px] uppercase tracking-wider text-slate-400">
            <span>Timing</span>
            <button className="hover:text-white" onClick={() => setShowInterval((x) => !x)}>
              {showInterval ? "Interval" : "Gap to leader"} ⇄
            </button>
          </div>
          <ol className="text-sm">
            {view.cars.map((c) => {
              const info = cars[c.idx];
              let right: string;
              if (c.out) right = "OUT";
              else if (c.pit) right = "PIT";
              else if (c.pos === 1) right = view.flag === "chequered" && c.done ? "WINNER" : "Leader";
              else if (c.lapsDown > 0) right = `+${c.lapsDown} lap${c.lapsDown > 1 ? "s" : ""}`;
              else {
                const g = showInterval ? c.interval : c.gap;
                right = g === null ? "-" : fmtGap(g);
              }
              return (
                <li
                  key={c.idx}
                  onClick={() => setFollow((f) => (f === c.idx ? null : c.idx))}
                  className={`flex items-center gap-2 px-2 py-[3px] border-b border-ink-800/60 cursor-pointer ${follow === c.idx ? "bg-ink-700/70" : "hover:bg-ink-800"} ${c.out ? "opacity-40" : ""}`}
                >
                  <span className="w-5 text-right font-mono text-xs text-slate-400">{c.pos}</span>
                  <span className="w-1 h-4 rounded-sm" style={{ background: info.color }} />
                  <span className="font-semibold w-10">{info.code}</span>
                  <span className="ml-auto font-mono text-xs text-slate-300">{right}</span>
                  <span className="w-4 h-4 rounded-full border-2 text-[8px] grid place-items-center font-bold" style={{ borderColor: COMPOUNDS[c.compound as keyof typeof COMPOUNDS]?.color ?? "#999" }} title={COMPOUNDS[c.compound as keyof typeof COMPOUNDS]?.name}>
                    {c.compound}
                  </span>
                  <span className="w-3 text-[10px] text-slate-500 font-mono">{c.pits || ""}</span>
                </li>
              );
            })}
          </ol>
        </div>
        <div className="panel p-3 text-xs space-y-1.5">
          {feed.length === 0 && <div className="text-slate-500">Lights out and away we go…</div>}
          {feed.map((e, i) => (
            <div key={i} className="flex gap-2">
              <span className="font-mono text-slate-500 w-8">L{e.lap}</span>
              <span>{describe(e, cars)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function describe(e: Replay["events"][number], cars: { code: string }[]): string {
  const a = cars[e.a]?.code;
  const b = e.b !== undefined ? cars[e.b]?.code : "";
  switch (e.kind) {
    case "pass":
      return `${a} passes ${b}`;
    case "pit":
      return `${a} pits for ${COMPOUNDS[e.info as keyof typeof COMPOUNDS]?.name ?? e.info} (${(e.x ?? 0).toFixed(1)}s)`;
    case "dnf":
      return `${a} retires (${e.info})`;
    case "sc":
      return "🟡 Safety car deployed";
    case "vsc":
      return "🟡 Virtual safety car";
    case "green":
      return "🟢 Green flag, racing resumes";
    case "fastest":
      return `🟣 ${a} fastest lap ${lapTime(Number(e.info))}`;
    case "contact":
      return `💥 Contact: ${a} and ${b}`;
    case "penalty":
      return `⚖️ ${a} gets a ${e.info} penalty`;
    case "slowstop":
      return `${a} slow stop (+${e.info}s)`;
    default:
      return `${e.kind} ${a}`;
  }
}

function FlagBadge({ flag }: { flag: RaceView["flag"] }) {
  if (flag === "green") return null;
  const map = {
    sc: ["SAFETY CAR", "bg-amber-400 text-black"],
    vsc: ["VIRTUAL SAFETY CAR", "bg-amber-400/80 text-black"],
    chequered: ["🏁 CHEQUERED FLAG", "bg-white text-black"],
  } as const;
  const [label, cls] = map[flag];
  return <span className={`chip !ring-0 !text-xs !px-2 ${cls}`}>{label}</span>;
}

function TrackCanvas({ track, view, cars, follow }: { track: TrackFile | null; view: RaceView; cars: { code: string; color: string; color2: string }[]; follow: number | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 520 });

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      setSize({ w, h: Math.round(Math.min(620, Math.max(300, w * 0.62))) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const cv = ref.current;
    if (!cv || !track) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = size.w * dpr;
    cv.height = size.h * dpr;
    const g = cv.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size.w, size.h);
    const pad = 28;
    const s = Math.min((size.w - pad * 2) / track.w, (size.h - pad * 2) / track.h);
    const ox = (size.w - track.w * s) / 2;
    const oy = (size.h - track.h * s) / 2;
    const P = (p: [number, number]): [number, number] => [ox + p[0] * s, oy + p[1] * s];
    const pts = track.pts;

    // which side is "inside" (for the pit lane): the side toward the centroid
    const n = pts.length;
    const normal = (i: number): [number, number] => {
      const a = pts[(i - 1 + n) % n];
      const b = pts[(i + 1) % n];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const L = Math.hypot(dx, dy) || 1;
      return [-dy / L, dx / L];
    };
    const cx = pts.reduce((q, p) => q + p[0], 0) / n;
    const cy = pts.reduce((q, p) => q + p[1], 0) / n;
    const n0 = normal(0);
    const inside = (pts[0][0] + n0[0] - cx) ** 2 + (pts[0][1] + n0[1] - cy) ** 2 < (pts[0][0] - cx) ** 2 + (pts[0][1] - cy) ** 2 ? 1 : -1;
    const offset = (frac: number, by: number): [number, number] => {
      const [x, y] = trackPoint(pts, frac);
      const i = Math.floor((((frac % 1) + 1) % 1) * n);
      const [nx, ny] = normal(i);
      return P([x + nx * by * inside, y + ny * by * inside]);
    };

    // tarmac
    g.lineJoin = "round";
    g.lineCap = "round";
    g.beginPath();
    pts.forEach((p, i) => {
      const [x, y] = P(p);
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    });
    g.closePath();
    g.strokeStyle = "#2a303b";
    g.lineWidth = Math.max(9, 16 * s * 1.6);
    g.stroke();
    g.strokeStyle = "#3a4250";
    g.lineWidth = 1.5;
    g.stroke();

    // pit lane along the end and start of the lap
    g.beginPath();
    for (let f = 0.955; f <= 1.035; f += 0.0025) {
      const [x, y] = offset(f, 26);
      if (f === 0.955) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.strokeStyle = "#1f242c";
    g.lineWidth = Math.max(5, 9 * s * 1.6);
    g.stroke();

    // start/finish line + sector ticks
    const line = (frac: number, color: string, w: number) => {
      const a = offset(frac, -12);
      const b = offset(frac, 12);
      g.beginPath();
      g.moveTo(a[0], a[1]);
      g.lineTo(b[0], b[1]);
      g.strokeStyle = color;
      g.lineWidth = w;
      g.stroke();
    };
    line(0, "#f8fafc", 3);
    line(1 / 3, "#e10600", 2);
    line(2 / 3, "#e10600", 2);

    // corner numbers
    g.font = "600 10px Inter, sans-serif";
    g.fillStyle = "#64748b";
    g.textAlign = "center";
    g.textBaseline = "middle";
    for (const c of track.corners) {
      const [x, y] = offset(c.f, -34);
      g.fillText(String(c.n), x, y);
    }

    // cars, back to front so the leader draws on top
    const drawn: { f: number }[] = [];
    const list = view.cars.slice().reverse();
    for (const c of list) {
      const info = cars[c.idx];
      let lateral = 0;
      // side by side: nudge cars that sit on top of each other
      const near = drawn.filter((d) => Math.abs(d.f - c.frac) < 0.0035).length;
      if (near) lateral = (near % 2 ? 1 : -1) * Math.ceil(near / 2) * 9;
      drawn.push({ f: c.frac });
      const [x, y] = c.pit ? offset(c.frac, 26) : offset(c.frac, lateral);
      const r = follow === c.idx ? 8 : 6.5;
      g.globalAlpha = c.out ? 0.35 : 1;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fillStyle = info.color;
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = follow === c.idx ? "#ffffff" : info.color2;
      g.stroke();
      if (c.out) {
        g.strokeStyle = "#f87171";
        g.beginPath();
        g.moveTo(x - 4, y - 4);
        g.lineTo(x + 4, y + 4);
        g.moveTo(x + 4, y - 4);
        g.lineTo(x - 4, y + 4);
        g.stroke();
      }
      if (c.pos <= 3 || follow === c.idx || c.pit) {
        g.font = "700 11px Inter, sans-serif";
        g.fillStyle = "#e2e8f0";
        g.textAlign = "left";
        g.fillText(`${c.pos} ${info.code}`, x + r + 3, y - r);
      }
      g.globalAlpha = 1;
    }
  }, [track, view, cars, size, follow]);

  return (
    <div ref={wrap} className="w-full bg-ink-950" style={{ height: size.h }}>
      {track ? <canvas ref={ref} style={{ width: size.w, height: size.h }} /> : <div className="grid h-full place-items-center text-slate-500 text-sm">Loading track…</div>}
    </div>
  );
}
