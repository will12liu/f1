// The tyre-saving mini-game for "Nurse them": the needle (how hard you're leaning on the tyres) wanders; hold it
// in the green for four seconds with Left/Right (A/D) or by holding either side. Score 0-1 = time in the green;
// it goes to the engine with the answer (wear for the next five laps), so replays match.
import { useEffect, useRef, useState } from "react";
import { verdict, verdictColor } from "./BrakeBar";

const TIME = 4;
const BAND = 0.24; // half-width of the green

export function TyreSave({ onResult, ease = 1 }: { onResult: (q: number) => void; ease?: number }) {
  const band = BAND * ease;
  const [view, setView] = useState({ p: 0, left: TIME });
  const [res, setRes] = useState<number | null>(null);
  const keys = useRef({ l: false, r: false });
  useEffect(() => {
    const set = (e: KeyboardEvent, v: boolean) => {
      if (e.code === "ArrowLeft" || e.code === "KeyA") keys.current.l = v;
      else if (e.code === "ArrowRight" || e.code === "KeyD") keys.current.r = v;
      else return;
      e.preventDefault();
    };
    const dn = (e: KeyboardEvent) => set(e, true);
    const up = (e: KeyboardEvent) => set(e, false);
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup", up);
    let p = 0;
    let v = 0;
    let push = (Math.random() - 0.5) * 2; // where the tyres want to go: changes now and then
    let inBand = 0;
    let t = 0;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      if (Math.random() < dt * 0.9) push = (Math.random() - 0.5) * 2.4;
      const input = (keys.current.r ? 1 : 0) - (keys.current.l ? 1 : 0);
      v += (push * 1.6 + input * 3.2 - v * 1.8) * dt;
      p = Math.max(-1, Math.min(1, p + v * dt));
      if (Math.abs(p) <= band) inBand += dt;
      setView({ p, left: Math.max(0, TIME - t) });
      if (t >= TIME) {
        const q = Math.max(0, Math.min(1, (inBand / TIME - 0.3) / 0.6));
        setRes(q);
        window.setTimeout(() => onResult(q), 900);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", dn);
      window.removeEventListener("keyup", up);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hold = (k: "l" | "r", v: boolean) => (keys.current[k] = v);
  const x = (view.p + 1) / 2;
  return (
    <div className="grid gap-3">
      <div className="text-lg text-slate-300">Keep the needle in the green: Left and Right (A, D), or hold a side.</div>
      <div className="relative h-14 overflow-hidden rounded-md bg-ink-950">
        <div className="absolute inset-y-0 bg-emerald-600" style={{ left: `${((1 - band) / 2) * 100}%`, width: `${band * 100}%` }} />
        <div className="absolute inset-y-0 left-0 w-[12%] bg-rose-700" />
        <div className="absolute inset-y-0 right-0 w-[12%] bg-rose-700" />
        <div className="absolute inset-y-0 w-1.5 -translate-x-1/2 bg-white" style={{ left: `${x * 100}%` }} />
      </div>
      <div className="flex items-center gap-3">
        <button className="h-14 flex-1 select-none rounded-md bg-ink-800 font-display text-2xl font-black text-white active:bg-white active:text-ink-950" onPointerDown={() => hold("l", true)} onPointerUp={() => hold("l", false)} onPointerLeave={() => hold("l", false)}>
          ‹ Ease
        </button>
        <div className="w-20 text-center font-display text-3xl font-black text-white">{view.left.toFixed(1)}</div>
        <button className="h-14 flex-1 select-none rounded-md bg-ink-800 font-display text-2xl font-black text-white active:bg-white active:text-ink-950" onPointerDown={() => hold("r", true)} onPointerUp={() => hold("r", false)} onPointerLeave={() => hold("r", false)}>
          Lean ›
        </button>
      </div>
      {res !== null && (
        <div className={`font-display text-4xl font-black uppercase ${verdictColor(res)}`}>
          {verdict(res)} <span className="text-xl text-slate-400">{Math.round(res * 100)}</span>
        </div>
      )}
    </div>
  );
}
