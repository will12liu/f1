// Practice and qualifying calls for the player's cars, before qualifying runs. Three big steps:
// the practice programme, the setup (with the engineer's range on the slider), then each qualifying session.
import { useState, type ReactNode } from "react";
import { PROGRAMS, setupEstimate, type CarPlan, type Program } from "../../engine/race/weekend";
import type { CircuitDef } from "../../engine/types";

const SESSIONS = ["Q1", "Q2", "Q3"];
const RISK: [string, string][] = [
  ["Safe lap", "Bank a time"],
  ["Normal", "The usual push"],
  ["All in", "Faster, riskier"],
];

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: ReactNode }) {
  return (
    <section className="grid gap-5 rounded-lg border border-ink-700 bg-ink-900 p-6 md:p-8">
      <div className="flex items-baseline gap-4">
        <span className={`font-display text-5xl font-black leading-none ${done ? "text-race" : "text-ink-600"}`}>{String(n).padStart(2, "0")}</span>
        <h2 className="font-display text-3xl font-extrabold uppercase text-white">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export function Weekend({ seed, circuit, driverId, engineer, onRun, busy }: { seed: number; circuit: CircuitDef; driverId: string; engineer: number; onRun: (p: CarPlan) => void; busy?: boolean }) {
  const [program, setProgram] = useState<Program | null>(null);
  const [setup, setSetup] = useState(0.5);
  const [risk, setRisk] = useState<[number, number, number]>([2, 2, 2]);
  const [late, setLate] = useState<[boolean, boolean, boolean]>([false, false, false]);
  const est = program ? setupEstimate(seed, circuit, driverId, program, engineer) : null;
  const pct = (x: number) => Math.round(x * 100);

  return (
    <div className="grid gap-6">
      <Step n={1} title="Practice" done={!!program}>
        <p className="text-lg text-slate-400">What do you work on in the practice sessions?</p>
        <div className="grid gap-3 md:grid-cols-3">
          {(Object.keys(PROGRAMS) as Program[]).map((k) => (
            <button
              key={k}
              onClick={() => {
                setProgram(k);
                const e = setupEstimate(seed, circuit, driverId, k, engineer);
                setSetup(Math.round(e.mid * 20) / 20);
              }}
              className={`rounded-lg border-2 p-6 text-left ${program === k ? "border-race bg-ink-800" : "border-ink-700 bg-ink-850 hover:border-ink-600 hover:bg-ink-800"}`}
            >
              <div className="font-display text-3xl font-extrabold uppercase leading-none text-white">{PROGRAMS[k][0]}</div>
              <div className="mt-3 text-base text-slate-300">{PROGRAMS[k][1]}</div>
            </button>
          ))}
        </div>
      </Step>

      {est && (
        <Step n={2} title="Setup" done>
          <p className="text-lg text-slate-300">
            Your engineer: about <b className="text-white">{pct(est.mid)}% downforce</b>, give or take {pct(est.spread)}. {circuit.power > circuit.aero ? "A power track: less wing is faster on the straights." : "Lots of corners: downforce pays."}
          </p>
          <div className="grid gap-3">
            <div className="flex items-end justify-between">
              <span className="kicker">Low drag</span>
              <span className="font-display text-6xl font-black leading-none text-white">{pct(setup)}%</span>
              <span className="kicker">High downforce</span>
            </div>
            <div className="relative">
              <div className="pointer-events-none absolute top-1/2 h-6 -translate-y-1/2 rounded-sm bg-sky-400/25" style={{ left: `${pct(Math.max(0, est.mid - est.spread))}%`, width: `${pct(Math.min(1, est.mid + est.spread) - Math.max(0, est.mid - est.spread))}%` }} />
              <input type="range" min={0} max={1} step={0.05} value={setup} onChange={(e) => setSetup(Number(e.target.value))} className="relative h-6 w-full accent-red-600" aria-label="Downforce" />
            </div>
            <div className="text-sm text-slate-500">The blue band is where the engineer thinks the ideal is. Setup work narrows it.</div>
          </div>
        </Step>
      )}

      {est && (
        <Step n={3} title="Qualifying" done>
          <div className="grid gap-3">
            {SESSIONS.map((s, i) => (
              <div key={s} className="grid grid-cols-[56px_1fr] items-stretch gap-3 sm:grid-cols-[56px_1fr_150px]">
                <span className="flex items-center font-display text-3xl font-black text-slate-400">{s}</span>
                <div className="grid grid-cols-3 gap-2">
                  {RISK.map(([label, sub], r) => (
                    <button
                      key={label}
                      onClick={() => setRisk((x) => x.map((v, k) => (k === i ? r + 1 : v)) as [number, number, number])}
                      className={`rounded-lg px-4 py-3 text-left ${risk[i] === r + 1 ? "bg-race text-white" : "bg-ink-800 text-slate-300 hover:bg-ink-700"}`}
                    >
                      <div className="font-display text-xl font-bold uppercase leading-tight">{label}</div>
                      <div className={`text-sm ${risk[i] === r + 1 ? "text-white/80" : "text-slate-500"}`}>{sub}</div>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setLate((x) => x.map((v, k) => (k === i ? !v : v)) as [boolean, boolean, boolean])}
                  className={`rounded-lg px-4 py-3 text-left max-sm:col-start-2 ${late[i] ? "bg-white text-ink-950" : "bg-ink-800 text-slate-300 hover:bg-ink-700"}`}
                >
                  <div className="font-display text-xl font-bold uppercase leading-tight">{late[i] ? "Late run" : "Early run"}</div>
                  <div className={`text-sm ${late[i] ? "text-ink-700" : "text-slate-500"}`}>{late[i] ? "Fast track, traffic" : "Clear track"}</div>
                </button>
              </div>
            ))}
          </div>
          <p className="text-base text-slate-500">All in: faster, but a mistake or a deleted lap is twice as likely. A late run gets the fastest track, with a risk of traffic.</p>
        </Step>
      )}

      <div>
        <button className="btn-xl bg-race text-white hover:bg-red-500" disabled={!est || busy} onClick={() => onRun({ program: program!, setup, risk, late })}>
          Run qualifying ›
        </button>
      </div>
    </div>
  );
}
