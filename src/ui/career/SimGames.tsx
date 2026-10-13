// Training mini-games, full screen: a simulator hot lap (a run of braking zones, each a little faster) and a
// lights-out reaction test. Each returns a score 0-1; the Training page turns it into XP once per weekend.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BrakeBar, verdict, verdictColor, type BrakeZone } from "../race/BrakeBar";

function Shell({ title, onQuit, children, kicker = "Simulator" }: { title: string; onQuit: () => void; children: ReactNode; kicker?: string }) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink-950">
      <div className="mx-auto flex min-h-full max-w-4xl flex-col px-6 py-8 sm:px-10">
        <div className="flex items-center justify-between">
          <div className="kicker">{kicker}</div>
          <button className="text-lg text-slate-400 hover:text-white" onClick={onQuit}>
            Quit
          </button>
        </div>
        <h1 className="headline mt-4 text-6xl sm:text-7xl">{title}</h1>
        <div className="mt-10 flex-1">{children}</div>
      </div>
    </div>
  );
}

const CORNERS = ["Turn 1", "Turn 4", "The chicane", "Hairpin", "Turn 11", "Last corner"];

export function HotLap({ onDone, onQuit }: { onDone: (score: number) => void; onQuit: () => void }) {
  const [i, setI] = useState(0);
  const [scores, setScores] = useState<number[]>([]);
  const [zones] = useState<BrakeZone[]>(() =>
    CORNERS.map((name, k) => {
      const half = 0.075 - k * 0.006;
      return { center: 0.62 + Math.random() * 0.26, half, time: 1.75 - k * 0.07, label: "Brake", hint: `${name}: brake in the green` };
    }),
  );
  const finished = scores.length === CORNERS.length;
  const avg = scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length);
  return (
    <Shell title="Hot lap" onQuit={onQuit}>
      <div className="mb-6 grid grid-cols-6 gap-2">
        {CORNERS.map((c, k) => (
          <div key={c} className={`rounded-md px-2 py-2 text-center ${k === i && !finished ? "bg-race text-white" : k < scores.length ? "bg-ink-800" : "bg-ink-900 text-slate-600"}`}>
            <div className="truncate text-xs font-semibold uppercase">{c}</div>
            <div className={`font-display text-xl font-black ${k < scores.length ? verdictColor(scores[k]) : ""}`}>{k < scores.length ? verdict(scores[k]) : "-"}</div>
          </div>
        ))}
      </div>
      {!finished ? (
        <BrakeBar
          key={i}
          big
          zone={zones[i]}
          onResult={(q) => {
            setScores((s) => [...s, q]);
            setI((x) => x + 1);
          }}
        />
      ) : (
        <div className="grid gap-6">
          <div>
            <div className="kicker">Lap score</div>
            <div className={`font-display text-9xl font-black leading-none ${verdictColor(avg)}`}>{Math.round(avg * 100)}</div>
          </div>
          <div>
            <button autoFocus className="btn-xl bg-race text-white hover:bg-red-500" onClick={() => onDone(avg)}>
              Save the session ›
            </button>
          </div>
        </div>
      )}
    </Shell>
  );
}

/** Reaction: five red lights come on one by one, then go out after a random wait. Go before = jump start. */
export const reactionScore = (ms: number) => Math.max(0, Math.min(1, (420 - ms) / 240));

export function Reaction({ onDone, onQuit, kicker, cta = "Save the session ›", intro }: { onDone: (score: number, jumped: boolean) => void; onQuit: () => void; kicker?: string; cta?: string; intro?: string }) {
  const [lit, setLit] = useState(0);
  const [phase, setPhase] = useState<"ready" | "lights" | "out" | "done" | "jump">("ready");
  const [ms, setMs] = useState(0);
  const outAt = useRef(0);
  const timers = useRef<number[]>([]);
  const clear = () => {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current = [];
  };
  const start = () => {
    clear();
    setLit(0);
    setPhase("lights");
    for (let k = 1; k <= 5; k++) timers.current.push(window.setTimeout(() => setLit(k), k * 900));
    timers.current.push(
      window.setTimeout(() => {
        setLit(0);
        setPhase("out");
        outAt.current = performance.now();
      }, 5 * 900 + 500 + Math.random() * 2200),
    );
  };
  const go = () => {
    if (phase === "lights") {
      clear();
      setPhase("jump");
    } else if (phase === "out") {
      setMs(Math.round(performance.now() - outAt.current));
      setPhase("done");
    } else if (phase === "ready") start();
  };
  useEffect(() => clear, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.code === "Space" || e.code === "Enter") && !e.repeat) {
        e.preventDefault();
        go();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const score = phase === "done" ? reactionScore(ms) : 0;
  return (
    <Shell title="Lights out" onQuit={onQuit} kicker={kicker}>
      <div className="select-none" onPointerDown={phase === "lights" || phase === "out" ? go : undefined} style={{ touchAction: "manipulation" }}>
        <div className="grid grid-cols-5 gap-3 rounded-lg border border-ink-700 bg-ink-900 p-6">
          {[1, 2, 3, 4, 5].map((k) => (
            <div key={k} className="grid gap-3 rounded-md bg-ink-950 p-3">
              {[0, 1].map((r) => (
                <div key={r} className={`aspect-square rounded-full ${lit >= k ? "bg-race" : "bg-ink-800"}`} />
              ))}
            </div>
          ))}
        </div>
        <div className="mt-8 min-h-40">
          {phase === "ready" && (
            <>
              <p className="text-xl text-slate-300">{intro ?? "Five red lights. When they all go out, go: Space or tap. Go early and it's a jump start."}</p>
              <button autoFocus className="btn-xl mt-6 bg-race text-white hover:bg-red-500" onClick={start}>
                Start ›
              </button>
            </>
          )}
          {(phase === "lights" || phase === "out") && <div className="font-display text-5xl font-black uppercase text-slate-500">{phase === "out" ? "Go!" : "Wait for it"}</div>}
          {phase === "jump" && (
            <>
              <div className="font-display text-7xl font-black uppercase text-rose-400">Jump start</div>
              {!intro && <p className="mt-3 text-lg text-slate-400">No time this week. The minimum XP still counts.</p>}
              <div className="mt-6">
                <button autoFocus className="btn-xl bg-ink-800 text-white hover:bg-ink-700" onClick={() => onDone(0, true)}>
                  {cta}
                </button>
              </div>
            </>
          )}
          {phase === "done" && (
            <>
              <div className="kicker">Reaction</div>
              <div className={`font-display text-9xl font-black leading-none ${verdictColor(score)}`}>
                {ms}
                <span className="text-4xl"> ms</span>
              </div>
              <div className="mt-6">
                <button autoFocus className="btn-xl bg-race text-white hover:bg-red-500" onClick={() => onDone(score, false)}>
                  {cta}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </Shell>
  );
}
