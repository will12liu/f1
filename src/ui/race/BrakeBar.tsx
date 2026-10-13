// The braking mini-game: your car runs at the corner, hit Space (or tap) inside the green zone. One shot,
// no second sweep: brake too early and you lose the run, too late and you're off the road. Used by duels in the
// live race and by the simulator hot lap. Returns a score 0-1 (dead centre of the zone = 1).
import { useEffect, useRef, useState } from "react";

export interface BrakeZone {
  center: number; // 0-1 along the strip
  half: number; // half-width of the zone
  time: number; // seconds to cross the whole strip
  label: string; // the button
  hint: string; // above the strip
}

/** Zones for each duel move (null = no execution needed). A little random each time so it's never rote. */
export function zoneFor(move: string, rand = Math.random): BrakeZone | null {
  const j = (rand() - 0.5) * 0.08;
  const z = (center: number, half: number, time: number, label: string, hint: string) => ({ center: center + j, half, time, label, hint });
  switch (move) {
    case "inside":
      return z(0.76, 0.07, 1.7, "Brake", "Dive up the inside: brake in the green");
    case "outside":
      return z(0.72, 0.06, 1.6, "Brake", "Round the outside: carry speed, brake in the green");
    case "late":
      return z(0.87, 0.045, 1.45, "Brake", "Latest of the late: a tiny window right before the corner");
    case "dummy":
      return z(0.66, 0.07, 1.7, "Switch", "Feint one way, switch in the green");
    case "ers":
      return z(0.55, 0.1, 1.8, "Deploy", "Overtake mode: deploy in the green");
    case "coverIn":
    case "coverOut":
      return z(0.62, 0.07, 1.55, "Cover", "Move when he moves: cover in the green");
    case "hold":
      return z(0.8, 0.08, 1.8, "Brake", "Hold your line: brake in the green");
    case "lateDef":
      return z(0.86, 0.045, 1.45, "Brake", "Brake late to keep him behind: tiny window");
    case "ersDef":
      return z(0.55, 0.1, 1.8, "Deploy", "Deploy to defend: hit the green");
    default:
      return null;
  }
}

export function zoneScore(pos: number, z: BrakeZone): number {
  const d = Math.abs(pos - z.center) / z.half;
  if (d <= 0.3) return 1;
  if (d <= 1) return 1 - 0.4 * ((d - 0.3) / 0.7);
  return Math.max(0, 0.6 - (0.6 * (d - 1)) / 1.2);
}

export const verdict = (q: number) => (q >= 0.95 ? "Perfect" : q >= 0.8 ? "Great" : q >= 0.6 ? "Good" : q >= 0.3 ? "Off" : "Miss");
export const verdictColor = (q: number) => (q >= 0.95 ? "text-amber-300" : q >= 0.6 ? "text-emerald-300" : q >= 0.3 ? "text-orange-300" : "text-rose-400");

export function BrakeBar({ zone, onResult, big }: { zone: BrakeZone; onResult: (q: number) => void; big?: boolean }) {
  const [pos, setPos] = useState(0);
  const [res, setRes] = useState<{ q: number; note: string } | null>(null);
  const posRef = useRef(0);
  const done = useRef(false);
  const finish = (q: number, note: string) => {
    if (done.current) return;
    done.current = true;
    setRes({ q, note });
    setTimeout(() => onResult(q), 750);
  };
  const press = () => {
    if (done.current) return;
    const p = posRef.current;
    const q = zoneScore(p, zone);
    finish(q, q >= 0.6 ? "" : p < zone.center ? "Too early" : "Too late");
  };
  useEffect(() => {
    done.current = false;
    setRes(null);
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = (now - t0) / 1000 / zone.time;
      const p = Math.min(1, t ** 1.25); // picks up speed into the braking zone
      posRef.current = p;
      setPos(p);
      if (p >= 1) finish(0, "Missed the braking point");
      else if (!done.current) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [zone]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.code === "Space" || e.code === "Enter") && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        press();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const h = big ? "h-28" : "h-20";
  return (
    <div className="select-none" onPointerDown={press} style={{ touchAction: "manipulation" }}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-base font-semibold text-slate-200">{zone.hint}</span>
        <span className="shrink-0 text-sm text-slate-500">Space or tap</span>
      </div>
      <div className={`relative ${h} overflow-hidden rounded-lg border border-ink-600 bg-[#1b1f27]`}>
        {/* braking boards: 3, 2, 1 before the zone */}
        {[3, 2, 1].map((n) => {
          const x = (zone.center - zone.half) * 100 - n * 7;
          return x > 2 ? (
            <div key={n} className="absolute top-1.5 -translate-x-1/2 rounded-sm bg-slate-200 px-1.5 font-display text-sm font-black leading-tight text-ink-950" style={{ left: `${x}%` }}>
              {n}
            </div>
          ) : null;
        })}
        <div className="absolute inset-y-0 bg-emerald-500/35" style={{ left: `${(zone.center - zone.half) * 100}%`, width: `${zone.half * 200}%` }} />
        <div className="absolute inset-y-0 bg-emerald-300/70" style={{ left: `${(zone.center - zone.half * 0.3) * 100}%`, width: `${zone.half * 60}%` }} />
        {/* the corner: kerb blocks */}
        <div className="absolute inset-y-0 right-0 flex w-3 flex-col">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className={`flex-1 ${i % 2 ? "bg-white" : "bg-race"}`} />
          ))}
        </div>
        {/* the car */}
        <div className="absolute top-1/2 h-5 w-10 -translate-x-full -translate-y-1/2 rounded-sm bg-white" style={{ left: `${pos * 100}%` }}>
          <div className="absolute inset-y-1 right-1 w-2 rounded-sm bg-race" />
        </div>
        {res && (
          <div className={`absolute inset-0 flex items-center justify-center gap-4 bg-ink-950/75 font-display text-4xl font-black uppercase ${verdictColor(res.q)}`}>
            {verdict(res.q)}
            {res.note && <span className="text-lg font-semibold normal-case text-slate-300">{res.note}</span>}
          </div>
        )}
      </div>
      <button className="mt-3 w-full rounded-lg bg-race py-4 font-display text-3xl font-black uppercase tracking-wider text-white hover:bg-red-500" disabled={!!res}>
        {zone.label}
      </button>
    </div>
  );
}
