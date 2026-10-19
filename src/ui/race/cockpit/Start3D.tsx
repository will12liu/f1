// The lights-out start from the cockpit: you sit in your grid slot on the real track, the field around you in
// team colours, the gantry ahead. Five reds, then out after a random wait: Space or tap to launch. Same score
// as the flat Reaction game (reactionScore), so the engine's launch is unchanged. Display only: Math.random
// here never touches the race.
import { useEffect, useRef, useState } from "react";
import { reactionScore } from "../../career/SimGames";
import { readCam } from "../assist";
import { useTrack } from "../../components/bits";
import { verdictColor } from "../BrakeBar";
import { build } from "../drive";
import { auroraView } from "../look";

export interface Start3DProps {
  trackId: string;
  km: number;
  target: number;
  grid: { slot: number; color: string; color2?: string; num?: number }[]; // the field, 1-based slots
  mySlot: number;
  myColor: string;
  onDone: (score: number, jumped: boolean) => void;
  onSimple: () => void;
}

const SLOT = 8; // metres between grid slots (16 m between rows, staggered)

export default function Start3D(p: Start3DProps) {
  const [cam] = useState(readCam); // the saved camera; the halo is drawn only from the cockpit
  const track = useTrack(p.trackId);
  const host = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<"ready" | "lights" | "out" | "done" | "jump">("ready");
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const [ms, setMs] = useState(0);
  const lit = useRef(0);
  const [litN, setLitN] = useState(0); // the same, for the light strip on screen
  const outAt = useRef(0);
  const goAt = useRef(0); // when you launched (performance.now), for the getaway
  const timers = useRef<number[]>([]);
  const clear = () => {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current = [];
  };

  useEffect(() => {
    if (!track || !host.current) return;
    const g = build(track, p.km, p.target);
    const el = host.current;
    const slotAt = (slot: number) => ({ d: -(6 + (slot - 1) * SLOT) / g.m, x: (slot % 2 === 0 ? 1 : -1) * (2.6 / 7.5) });
    let view: ReturnType<typeof auroraView>;
    try {
      view = auroraView(
        el,
        g,
        "",
        p.grid.map((e) => ({ color: e.slot === p.mySlot ? p.myColor : e.color, color2: e.color2 })),
        { map: false },
      );
    } catch {
      p.onSimple();
      return;
    }
    const cars = p.grid.map((e, idx) => ({ idx, slot: e.slot, react: 0.18 + ((e.slot * 37) % 17) / 100, d: slotAt(e.slot).d, x: slotAt(e.slot).x, v: 0 }));
    const follow = Math.max(0, cars.findIndex((e) => e.slot === p.mySlot));
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const ph = phaseRef.current;
      const out = outAt.current;
      for (const e of cars) {
        const mine = e.slot === p.mySlot;
        const t0 = mine ? goAt.current : out ? out + e.react * 1000 : 0;
        if (t0 && now > t0 && (ph === "out" || ph === "done" || ph === "jump" || mine)) e.v = Math.min(70, e.v + 11 * dt);
        e.d += (e.v * dt) / g.m;
      }
      view.draw(
        cars.map((e) => ({ idx: e.idx, d: e.d, x: e.x, v: e.v })),
        follow,
        cam,
        ph === "lights" ? lit.current : 0,
      );
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      view.dispose();
    };
  }, [track]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = () => {
    clear();
    lit.current = 0;
    setPhase("lights");
    for (let k = 1; k <= 5; k++) timers.current.push(window.setTimeout(() => setLitN((lit.current = k)), k * 900));
    timers.current.push(
      window.setTimeout(() => {
        lit.current = 0;
        setLitN(0);
        outAt.current = performance.now();
        setPhase("out");
      }, 5 * 900 + 500 + Math.random() * 2200),
    );
  };
  const go = () => {
    const ph = phaseRef.current;
    if (ph === "lights") {
      clear();
      goAt.current = performance.now();
      lit.current = 0;
      setLitN(0);
      setPhase("jump");
    } else if (ph === "out") {
      goAt.current = performance.now();
      setMs(Math.round(goAt.current - outAt.current));
      setPhase("done");
    } else if (ph === "ready") start();
  };
  useEffect(() => clear, []);
  // once you've launched (or jumped it), watch the getaway for a moment, then back to the race on its own
  useEffect(() => {
    if (phase !== "done" && phase !== "jump") return;
    const q = phase === "done" ? reactionScore(ms) : 0;
    const id = window.setTimeout(() => p.onDone(q, phase === "jump"), 2400);
    return () => clearTimeout(id);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.code === "Space" || e.code === "Enter" || e.code === "KeyW" || e.code === "ArrowUp") && !e.repeat) {
        e.preventDefault();
        go();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const score = phase === "done" ? reactionScore(ms) : 0;
  return (
    <div className="fixed inset-0 z-[60] select-none bg-ink-950" onPointerDown={phase === "lights" || phase === "out" ? go : undefined} style={{ touchAction: "manipulation" }}>
      <div ref={host} className="absolute inset-0" />
      {cam === "onboard" && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 60" preserveAspectRatio="none">
        <path d="M50 -2 V13" stroke="#0b0d10" strokeWidth="2.4" />
        <path d="M2 62 C 8 26, 28 12, 50 12 C 72 12, 92 26, 98 62" fill="none" stroke="#0b0d10" strokeWidth="2.2" />
      </svg>
      )}
      <div className="absolute left-4 top-4 rounded-md bg-ink-950/85 px-4 py-3">
        <div className="kicker">The start · P{p.mySlot} on the grid</div>
        <div className="mt-1 text-lg text-white">Five red lights. When they all go out, launch: W (throttle), Space or tap. Go early and it's five seconds.</div>
      </div>
      {/* the lights, repeated on screen like the TV onboard graphic */}
      <div className="pointer-events-none absolute left-1/2 top-[16%] flex -translate-x-1/2 gap-2 rounded-md bg-ink-950/85 p-2">
        {[1, 2, 3, 4, 5].map((k) => (
          <div key={k} className={`h-8 w-8 rounded-full sm:h-10 sm:w-10 ${litN >= k ? "bg-red-500" : "bg-ink-800"}`} />
        ))}
      </div>
      <button onPointerDown={(e) => e.stopPropagation()} onClick={p.onSimple} className="absolute right-4 top-4 rounded-md bg-ink-900/90 px-3 py-1.5 text-base font-bold text-white hover:bg-ink-800">
        Simple view
      </button>
      <div className="absolute inset-x-0 bottom-8 flex flex-col items-center gap-4 text-center">
        {phase === "ready" && track && (
          <button autoFocus className="btn-xl bg-race text-white hover:bg-red-500" onClick={start}>
            Formation lap done ›
          </button>
        )}
        {phase === "lights" && <div className="rounded-md bg-ink-950/80 px-6 py-2 font-display text-5xl font-black uppercase text-slate-300">Wait for it</div>}
        {phase === "out" && <div className="rounded-md bg-ink-950/80 px-6 py-2 font-display text-6xl font-black uppercase text-white">Go!</div>}
        {phase === "jump" && (
          <div className="rounded-lg bg-ink-950/95 px-10 py-6">
            <div className="font-display text-7xl font-black uppercase text-rose-400">Jump start</div>
            <button autoFocus className="btn-xl mt-4 bg-ink-800 text-white hover:bg-ink-700" onClick={() => p.onDone(0, true)}>
              Race ›
            </button>
          </div>
        )}
        {phase === "done" && (
          <div className="rounded-lg bg-ink-950/95 px-10 py-6">
            <div className="kicker">Reaction</div>
            <div className={`font-display text-8xl font-black leading-none ${verdictColor(score)}`}>
              {ms}
              <span className="text-4xl"> ms</span>
            </div>
            <button autoFocus className="btn-xl mt-4 bg-race text-white hover:bg-red-500" onClick={() => p.onDone(score, false)}>
              Race ›
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
