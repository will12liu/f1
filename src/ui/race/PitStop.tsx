// The pit-stop mini-game: four wheel guns, then the release. Each wheel's ring fills (nut off, new tyre, nut
// on); hit that wheel (key 1-4 or tap) as it fills into the green. Then the light: release on green, but not
// into a car coming down the pit lane (that's an unsafe release). Returns a score 0-1 and the stop time shown.
import { useEffect, useRef, useState } from "react";
import { RACE } from "../../engine/race/model";
import { verdict, verdictColor } from "./BrakeBar";

const WHEELS = ["Front left", "Front right", "Rear left", "Rear right"];
interface Wheel {
  delay: number;
  dur: number;
  q: number | null;
}

const wheelScore = (p: number) => (p >= 0.93 && p <= 1.04 ? 1 : p >= 0.86 && p <= 1.12 ? 0.7 : p < 0.86 ? 0.25 : 0.15);

export function PitStop({ title, onDone, onSkip }: { title: string; onDone: (q: number, unsafe: boolean) => void; onSkip: () => void }) {
  const [wheels, setWheels] = useState<Wheel[]>(() => WHEELS.map(() => ({ delay: 0.25 + Math.random() * 0.5, dur: 0.9 + Math.random() * 0.45, q: null })));
  const [now, setNow] = useState(0);
  const [phase, setPhase] = useState<"wheels" | "release" | "done">("wheels");
  const [rel, setRel] = useState<{ green: number; car: number | null; at: number | null; q: number; unsafe: boolean; note: string } | null>(null);
  const t0 = useRef(performance.now());
  const relT0 = useRef(0);
  const wheelsRef = useRef(wheels);
  wheelsRef.current = wheels;

  useEffect(() => {
    let raf = 0;
    const tick = (n: number) => {
      const t = (n - t0.current) / 1000;
      setNow(t);
      // a wheel nobody hit is late: the crew finishes it slowly
      const ws = wheelsRef.current;
      if (ws.some((w) => w.q === null && (t - w.delay) / w.dur > 1.3)) setWheels((x) => x.map((w) => (w.q === null && (t - w.delay) / w.dur > 1.3 ? { ...w, q: 0.1 } : w)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (phase === "wheels" && wheels.every((w) => w.q !== null)) {
      setPhase("release");
      relT0.current = now;
      setRel({ green: 0.35 + Math.random() * 0.6, car: Math.random() < 0.55 ? 0.1 + Math.random() * 0.9 : null, at: null, q: 0, unsafe: false, note: "" });
    }
  }, [wheels, phase, now]);

  const hit = (i: number) => {
    if (phase !== "wheels") return;
    setWheels((x) => x.map((w, k) => (k === i && w.q === null ? { ...w, q: wheelScore((now - w.delay) / w.dur) } : w)));
  };
  // the car in the pit lane: crosses the strip in 0.9s, passing our box at the middle
  const carPos = (rt: number) => (rel?.car === null || !rel ? null : (rt - rel.car) / 0.9);
  const release = () => {
    if (phase !== "release" || !rel || rel.at !== null) return;
    const rt = now - relT0.current;
    const cp = carPos(rt);
    const inWay = cp !== null && cp > 0.3 && cp < 0.62;
    let q: number;
    let note: string;
    if (rt < rel.green) (q = 0.2), (note = "Released on red");
    else if (inWay) (q = 0.05), (note = "Unsafe release");
    else {
      const wait = rt - Math.max(rel.green, rel.car !== null && cp !== null && cp < 0.62 && cp > -0.2 ? rel.car + 0.9 * 0.62 : 0);
      q = Math.max(0, Math.min(1, 1 - (wait - 0.25) / 0.9));
      note = wait < 0.35 ? "Sharp" : "Slow off the jacks";
    }
    setRel({ ...rel, at: rt, q, unsafe: inWay, note });
    setPhase("done");
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const i = Number(e.key) - 1;
      if (i >= 0 && i < 4) hit(i);
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        release();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const wq = wheels.reduce((a, w) => a + (w.q ?? 0), 0) / 4;
  const score = rel ? 0.7 * wq + 0.3 * rel.q : 0;
  const stopTime = 2.4 + (RACE.crewMid - score) * RACE.crewSpread; // the same sum the engine uses
  const rt = phase === "release" ? now - relT0.current : rel?.at ?? 0;
  const cp = carPos(rt);
  const green = rel ? rt >= rel.green : false;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink-950/95">
      <div className="mx-auto flex min-h-full max-w-4xl flex-col justify-center px-6 py-8">
        <div className="flex items-center justify-between">
          <div className="kicker">Pit stop</div>
          {phase === "wheels" && (
            <button className="text-base text-slate-400 hover:text-white" onClick={onSkip}>
              Let the crew do it
            </button>
          )}
        </div>
        <h2 className="headline mt-3 text-5xl sm:text-6xl">{title}</h2>
        <p className="mt-2 text-lg text-slate-400">{phase === "wheels" ? "Hit each wheel (keys 1-4 or tap) as its ring fills into the green." : phase === "release" ? "Release on green (Space or tap). Not into a car coming down the lane." : ""}</p>

        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {wheels.map((w, i) => {
            const p = Math.max(0, (now - w.delay) / w.dur);
            const fill = Math.min(1.15, p);
            const r = 52;
            const circ = 2 * Math.PI * r;
            return (
              <button key={i} onPointerDown={() => hit(i)} className="grid place-items-center rounded-lg border border-ink-700 bg-ink-900 p-4" style={{ touchAction: "manipulation" }}>
                <svg viewBox="0 0 120 120" className="h-32 w-32">
                  <circle cx="60" cy="60" r={r} fill="none" stroke="#252b36" strokeWidth="12" />
                  <circle cx="60" cy="60" r={r} fill="none" stroke="#34d399" strokeOpacity="0.35" strokeWidth="12" strokeDasharray={`${circ * 0.11} ${circ}`} strokeDashoffset={-circ * 0.93} transform="rotate(-90 60 60)" />
                  {w.q === null && <circle cx="60" cy="60" r={r} fill="none" stroke={p > 1.12 ? "#fb7185" : p >= 0.86 ? "#34d399" : "#e2e8f0"} strokeWidth="12" strokeDasharray={`${circ * Math.min(1, fill)} ${circ}`} transform="rotate(-90 60 60)" />}
                  <text x="60" y="70" textAnchor="middle" fontFamily="Barlow Condensed, sans-serif" fontWeight="900" fontSize="30" fill="#fff">
                    {i + 1}
                  </text>
                </svg>
                <div className="mt-2 text-sm font-semibold uppercase text-slate-400">{WHEELS[i]}</div>
                <div className={`font-display text-2xl font-black uppercase ${w.q === null ? "text-slate-600" : verdictColor(w.q)}`}>{w.q === null ? "-" : verdict(w.q)}</div>
              </button>
            );
          })}
        </div>

        {phase !== "wheels" && rel && (
          <div className="mt-6 grid gap-4" onPointerDown={release} style={{ touchAction: "manipulation" }}>
            <div className="relative h-20 overflow-hidden rounded-lg border border-ink-600 bg-[#1b1f27]">
              <div className="absolute inset-y-0 left-[30%] w-[32%] bg-amber-400/15" />
              <div className="absolute bottom-1 left-[46%] -translate-x-1/2 text-xs font-bold uppercase text-amber-300">Our box</div>
              {cp !== null && cp > -0.2 && cp < 1.2 && (
                <div className="absolute top-3 h-5 w-12 -translate-x-1/2 rounded-sm bg-sky-400" style={{ left: `${cp * 100}%` }}>
                  <div className="absolute inset-y-1 right-1 w-2 rounded-sm bg-ink-950" />
                </div>
              )}
            </div>
            <div className="flex items-center gap-6">
              <div className={`h-20 w-20 rounded-full border-4 border-ink-700 ${green ? "bg-emerald-400" : "bg-race"}`} />
              {phase === "release" ? (
                <button className="flex-1 rounded-lg bg-white py-5 font-display text-3xl font-black uppercase tracking-wider text-ink-950 hover:bg-slate-200">Release</button>
              ) : (
                <div className="flex-1">
                  <div className={`font-display text-4xl font-black uppercase ${rel.unsafe ? "text-rose-400" : verdictColor(rel.q)}`}>{rel.note}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {phase === "done" && rel && (
          <div className="mt-8 flex flex-wrap items-end gap-8">
            <div>
              <div className="kicker">Stationary</div>
              <div className={`font-display text-8xl font-black leading-none ${verdictColor(score)}`}>
                {stopTime.toFixed(1)}
                <span className="text-3xl">s</span>
              </div>
              {rel.unsafe && <div className="mt-2 text-lg font-semibold text-rose-300">The stewards will look at that: five seconds.</div>}
            </div>
            <button autoFocus className="btn-xl bg-race text-white hover:bg-red-500" onClick={() => onDone(score, rel.unsafe)}>
              Go, go, go ›
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
