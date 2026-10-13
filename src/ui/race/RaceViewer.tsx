// The 2D race: a canvas track with every car, a timing tower and an event feed, replayed from a
// Replay at a chosen speed. The engine already decided everything; this only asks `viewAt(t)`.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { COMPOUNDS } from "../../engine/race/model";
import { ATTACK_LABEL, DEFEND_LABEL } from "../../engine/race/moments";
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

export function RaceViewer({
  world,
  replay,
  live,
  side,
  follow0 = null,
  overlay,
  marks,
}: {
  world: World;
  replay: Replay;
  live?: LiveSource;
  side?: ReactNode;
  follow0?: number | null;
  overlay?: ReactNode; // a moment card over the track (the race is frozen while it shows)
  marks?: { a: number; b?: number; role?: "attack" | "defend" } | null;
}) {
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
  const feed = useMemo(() => replay.events.filter((e) => e.t <= t && e.kind !== "mistake" && e.kind !== "blue" && !(e.kind === "limits" && e.info !== "3")).slice(-7).reverse(), [replay.events, t]);
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
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <div className="panel overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-ink-800">
          <div className="font-display text-3xl font-black tracking-wide">
            LAP {Math.max(1, view.lap)}
            <span className="text-slate-500">/{replay.laps}</span>
          </div>
          <FlagBadge flag={view.flag} />
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <button className="btn-ghost !px-4 !py-2 !text-base" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"}>
              {playing ? "❚❚" : "▶"}
            </button>
            {SPEEDS.map((s) => (
              <button key={s} onClick={() => setSpeed(s)} className={`btn !px-3 !py-2 !text-base ${speed === s ? "bg-race text-white" : "bg-ink-800 text-slate-300 hover:bg-ink-700"}`}>
                {s}x
              </button>
            ))}
            <button className="btn-ghost !px-3 !py-2 !text-base" onClick={() => jumpLap(1)} title="Next lap">
              +1 lap
            </button>
            <button className="btn-ghost !px-3 !py-2 !text-base" onClick={() => { if (live) { live.finish(); setT(Infinity); } else setT(ix.end); setPlaying(false); }} title={live ? "Sim the rest at the current dials" : "Skip to the flag"}>
              Flag
            </button>
          </div>
        </div>
        <div className="relative">
          <TrackCanvas track={track} view={view} cars={cars} follow={follow} marks={marks ?? null} />
        </div>
        {overlay && <div className="border-t border-ink-800 p-3">{overlay}</div>}
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

      <div className="grid gap-4 content-start">
        {side}
        <div className="panel overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-ink-800 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <span>Timing</span>
            <button className="hover:text-white" onClick={() => setShowInterval((x) => !x)}>
              {showInterval ? "Interval" : "Gap to leader"} ⇄
            </button>
          </div>
          <ol className="text-base">
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
                  className={`flex items-center gap-2.5 px-3 py-1 border-b border-ink-800/60 cursor-pointer ${follow === c.idx ? "bg-ink-700/70" : "hover:bg-ink-800"} ${c.out ? "opacity-40" : ""}`}
                >
                  <span className="w-6 text-right font-mono text-sm text-slate-400">{c.pos}</span>
                  <span className="w-1 h-4 rounded-sm" style={{ background: info.color }} />
                  <span className="font-display text-lg font-bold w-12">{info.code}</span>
                  {c.pen > 0 && !c.out && <span className="rounded-sm bg-amber-400 px-1 text-xs font-bold text-black">+{c.pen}</span>}
                  {c.bw && !c.out && <span className="h-3 w-3 border border-slate-500" style={{ background: "linear-gradient(135deg,#fff 50%,#000 50%)" }} title="Black-and-white flag" />}
                  {c.blue && !c.out && <span className="h-3 w-1.5 bg-blue-500" title="Blue flags" />}
                  <span className="ml-auto font-mono text-sm text-slate-300">{right}</span>
                  <span className="w-5 h-5 rounded-full border-2 text-[10px] grid place-items-center font-bold" style={{ borderColor: COMPOUNDS[c.compound as keyof typeof COMPOUNDS]?.color ?? "#999" }} title={COMPOUNDS[c.compound as keyof typeof COMPOUNDS]?.name}>
                    {c.compound}
                  </span>
                  <span className="w-3 text-xs text-slate-500 font-mono">{c.pits || ""}</span>
                </li>
              );
            })}
          </ol>
        </div>
        <div className="panel p-4 text-sm space-y-2">
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
      return "Safety car deployed";
    case "vsc":
      return "Virtual safety car";
    case "red":
      return "Red flag. The race is suspended";
    case "restart":
      return "Standing restart";
    case "green":
      return "Green flag, racing resumes";
    case "fastest":
      return `${a} fastest lap ${lapTime(Number(e.info))}`;
    case "contact":
      return `Contact: ${a} and ${b}, under investigation`;
    case "penalty": {
      const [what, why, pp] = (e.info ?? "").split("|");
      return `${a}: ${what} penalty, ${why}${pp ? ` (${pp} licence point${pp === "1" ? "" : "s"})` : ""}`;
    }
    case "limits":
      return `${a} track limits, strike ${e.info}`;
    case "bw":
      return `Black-and-white flag for ${a}`;
    case "blue":
      return `Blue flags for ${a}, ${b} coming through`;
    case "yellow":
      return `Yellow flag in sector ${e.info}`;
    case "served":
      return `${a} serves a ${e.info}`;
    case "slowstop":
      return `${a} slow stop (+${e.info}s)`;
    case "teamorder":
      return `Team orders: ${a} lets ${b} through`;
    case "duel": {
      const [am, dm, ok] = (e.info ?? "").split("|");
      const att = ATTACK_LABEL[am as keyof typeof ATTACK_LABEL]?.[0].toLowerCase() ?? am;
      const def = DEFEND_LABEL[dm as keyof typeof DEFEND_LABEL]?.[0].toLowerCase() ?? dm;
      return `Duel: ${a} (${att}) against ${b} (${def}). ${ok === "1" ? `${a} is through` : `${b} keeps it`}`;
    }
    default:
      return `${e.kind} ${a}`;
  }
}

function FlagBadge({ flag }: { flag: RaceView["flag"] }) {
  if (flag === "green") return null;
  const map = {
    sc: ["SAFETY CAR", "bg-amber-400 text-black"],
    vsc: ["VIRTUAL SAFETY CAR", "bg-amber-400 text-black"],
    red: ["RED FLAG", "bg-red-600 text-white"],
    chequered: ["CHEQUERED FLAG", "bg-white text-black"],
  } as const;
  const [label, cls] = map[flag];
  return <span className={`chip !ring-0 !text-xs !px-2 ${cls}`}>{label}</span>;
}

/** A top-down F1 car pointing along `ang`: tyres, floor, tapered body in the team colour, wings in the second colour. */
function drawCar(g: CanvasRenderingContext2D, x: number, y: number, ang: number, scale: number, body: string, accent: string, outline: boolean) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.scale(scale, scale);
  g.fillStyle = "#0a0b0d";
  g.fillRect(-9, -5.4, 4.6, 2.4); // rear tyres
  g.fillRect(-9, 3, 4.6, 2.4);
  g.fillRect(4.2, -5, 3.8, 2.1); // front tyres
  g.fillRect(4.2, 2.9, 3.8, 2.1);
  g.fillStyle = "#1c1f24";
  g.fillRect(-8, -3.4, 13, 6.8); // floor
  g.fillStyle = body;
  g.beginPath();
  g.moveTo(-10, -2.2);
  g.lineTo(-3, -3.6);
  g.lineTo(2.5, -2.6);
  g.lineTo(11.5, -0.8);
  g.lineTo(11.5, 0.8);
  g.lineTo(2.5, 2.6);
  g.lineTo(-3, 3.6);
  g.lineTo(-10, 2.2);
  g.closePath();
  g.fill();
  if (outline) {
    g.strokeStyle = "#ffffff";
    g.lineWidth = 1.4;
    g.stroke();
  }
  g.fillStyle = accent;
  g.fillRect(-12.2, -4.2, 2.4, 8.4); // rear wing
  g.fillRect(10.6, -4.8, 1.9, 9.6); // front wing
  g.fillStyle = "#0a0b0d";
  g.beginPath();
  g.ellipse(-1, 0, 2, 1.25, 0, 0, Math.PI * 2); // cockpit and halo
  g.fill();
  g.restore();
}

function TrackCanvas({
  track,
  view,
  cars,
  follow,
  marks,
}: {
  track: TrackFile | null;
  view: RaceView;
  cars: { code: string; color: string; color2: string }[];
  follow: number | null;
  marks: { a: number; b?: number; role?: "attack" | "defend" } | null;
}) {
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
    g.font = "600 13px 'IBM Plex Sans', sans-serif";
    g.fillStyle = "#64748b";
    g.textAlign = "center";
    g.textBaseline = "middle";
    for (const c of track.corners) {
      const [x, y] = offset(c.f, -34);
      g.fillText(String(c.n), x, y);
    }

    // local yellows (and the whole lap under a red flag)
    const paint = (f0: number, f1: number, color: string) => {
      g.beginPath();
      for (let f = f0; f <= f1 + 1e-9; f += 0.004) {
        const [x, y] = P(trackPoint(pts, f));
        if (f === f0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.strokeStyle = color;
      g.lineWidth = 3;
      g.stroke();
    };
    if (view.flag === "red") paint(0, 1, "#ef4444");
    else for (const sct of view.yellows) paint((sct - 1) / 3, sct / 3, "#facc15");

    const heading = (frac: number, by: number) => {
      const a = offset(frac, by);
      const b = offset(frac + 0.003, by);
      return Math.atan2(b[1] - a[1], b[0] - a[0]);
    };
    const carScale = Math.max(0.75, Math.min(1.35, size.w / 620));

    // safety car ahead of the leader
    if (view.flag === "sc" && view.cars[0]) {
      const f = view.cars[0].frac + 0.012;
      const [x, y] = offset(f, 0);
      drawCar(g, x, y, heading(f, 0), carScale, "#d4d4d8", "#facc15", false);
      g.font = "700 13px ui-sans-serif, system-ui, sans-serif";
      g.fillStyle = "#facc15";
      g.textAlign = "left";
      g.fillText("SC", x + 10, y - 8);
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
      const by = c.pit ? 26 : lateral;
      const [x, y] = offset(c.frac, by);
      const mine = follow === c.idx;
      g.globalAlpha = c.out ? 0.35 : 1;
      drawCar(g, x, y, heading(c.frac, by), carScale * (mine ? 1.2 : 1), c.out ? "#52525b" : info.color, c.out ? "#3f3f46" : info.color2, mine);
      if (c.out) {
        g.strokeStyle = "#f87171";
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x - 4, y - 4);
        g.lineTo(x + 4, y + 4);
        g.moveTo(x + 4, y - 4);
        g.lineTo(x - 4, y + 4);
        g.stroke();
      }
      if (c.blue && !c.out) {
        g.fillStyle = "#3b82f6";
        g.fillRect(x - 3, y - 14, 6, 4);
      }
      if (c.pos <= 3 || mine || c.pit) {
        g.font = "700 14px ui-sans-serif, system-ui, sans-serif";
        g.fillStyle = mine ? "#ffffff" : "#e2e8f0";
        g.textAlign = "left";
        g.fillText(`${c.pos} ${info.code}`, x + 11, y - 7);
      }
      g.globalAlpha = 1;
    }

    // a duel: rings on both cars, and the two lines (inside / outside) ahead of the attacker
    if (marks) {
      const at = (idx: number) => view.cars.find((c) => c.idx === idx);
      const ca = at(marks.a);
      const cb = marks.b !== undefined ? at(marks.b) : undefined;
      for (const c of [ca, cb]) {
        if (!c) continue;
        const [x, y] = offset(c.frac, 0);
        g.beginPath();
        g.arc(x, y, 15, 0, Math.PI * 2);
        g.strokeStyle = c === ca ? "#ffffff" : "#f59e0b";
        g.lineWidth = 2;
        g.stroke();
      }
      if (ca && cb) {
        const attacker = marks.role === "defend" ? cb : ca;
        const f0 = attacker.frac;
        for (const [side, label] of [
          [-14, "IN"],
          [14, "OUT"],
        ] as const) {
          g.beginPath();
          for (let k = 0; k <= 10; k++) {
            const [x, y] = offset(f0 + 0.004 + k * 0.0018, side * (k / 10));
            if (k === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
          }
          g.strokeStyle = side < 0 ? "#38bdf8" : "#a3e635";
          g.lineWidth = 2.5;
          g.stroke();
          const [lx, ly] = offset(f0 + 0.024, side * 1.4);
          g.font = "700 13px ui-sans-serif, system-ui, sans-serif";
          g.fillStyle = side < 0 ? "#38bdf8" : "#a3e635";
          g.textAlign = "center";
          g.fillText(label, lx, ly);
        }
      }
    }
  }, [track, view, cars, size, follow, marks]);

  return (
    <div ref={wrap} className="w-full bg-ink-950" style={{ height: size.h }}>
      {track ? <canvas ref={ref} style={{ width: size.w, height: size.h }} /> : <div className="grid h-full place-items-center text-slate-500 text-sm">Loading track…</div>}
    </div>
  );
}
