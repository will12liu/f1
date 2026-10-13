// Practice and qualifying calls for the player's cars, before qualifying runs.
import { useState } from "react";
import { PROGRAMS, setupEstimate, type CarPlan, type Program } from "../../engine/race/weekend";
import type { CircuitDef } from "../../engine/types";

const SESSIONS = ["Q1", "Q2", "Q3"];
const RISK = ["Safe lap", "Normal", "All in"];

export function Weekend({ seed, circuit, driverId, engineer, onRun, busy }: { seed: number; circuit: CircuitDef; driverId: string; engineer: number; onRun: (p: CarPlan) => void; busy?: boolean }) {
  const [program, setProgram] = useState<Program | null>(null);
  const [setup, setSetup] = useState(0.5);
  const [risk, setRisk] = useState<[number, number, number]>([2, 2, 2]);
  const [late, setLate] = useState<[boolean, boolean, boolean]>([false, false, false]);
  const est = program ? setupEstimate(seed, circuit, driverId, program, engineer) : null;
  const pct = (x: number) => Math.round(x * 100);

  return (
    <div className="panel grid gap-4 p-4 text-sm">
      <div className="grid gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Practice</div>
        <div className="grid sm:grid-cols-3 gap-1.5">
          {(Object.keys(PROGRAMS) as Program[]).map((k) => (
            <button
              key={k}
              onClick={() => {
                setProgram(k);
                const e = setupEstimate(seed, circuit, driverId, k, engineer);
                setSetup(Math.round(e.mid * 20) / 20);
              }}
              className={`rounded-md px-2.5 py-2 text-left ${program === k ? "bg-ink-700 text-white" : "bg-ink-850 hover:bg-ink-800"}`}
            >
              <div className="font-semibold">{PROGRAMS[k][0]}</div>
              <div className="text-xs text-slate-400">{PROGRAMS[k][1]}</div>
            </button>
          ))}
        </div>
      </div>

      {est && (
        <div className="grid gap-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Setup</div>
          <div className="text-xs text-slate-300">
            Engineer: about {pct(est.mid)}% downforce, give or take {pct(est.spread)}. {circuit.power > circuit.aero ? "A power track: less wing is faster on the straights." : "Lots of corners: downforce pays."}
          </div>
          <div className="flex items-center gap-3">
            <span className="w-16 text-xs text-slate-400">Low drag</span>
            <input type="range" min={0} max={1} step={0.05} value={setup} onChange={(e) => setSetup(Number(e.target.value))} className="flex-1 accent-red-600" aria-label="Downforce" />
            <span className="w-24 text-right text-xs text-slate-400">High downforce</span>
            <span className="w-10 text-right font-mono">{pct(setup)}%</span>
          </div>
        </div>
      )}

      {est && (
        <div className="grid gap-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Qualifying</div>
          {SESSIONS.map((s, i) => (
            <div key={s} className="grid grid-cols-[32px_1fr_auto] items-center gap-2">
              <span className="font-mono text-xs text-slate-400">{s}</span>
              <div className="flex gap-1">
                {RISK.map((label, r) => (
                  <button
                    key={label}
                    onClick={() => setRisk((x) => x.map((v, k) => (k === i ? r + 1 : v)) as [number, number, number])}
                    className={`btn flex-1 !px-2 !py-1 text-xs ${risk[i] === r + 1 ? "bg-race text-white" : "bg-ink-800 text-slate-300 hover:bg-ink-700"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button onClick={() => setLate((x) => x.map((v, k) => (k === i ? !v : v)) as [boolean, boolean, boolean])} className={`btn !px-2 !py-1 text-xs ${late[i] ? "bg-white text-black" : "bg-ink-800 text-slate-300 hover:bg-ink-700"}`}>
                {late[i] ? "Late run" : "Early run"}
              </button>
            </div>
          ))}
          <p className="text-xs text-slate-500">All in: faster, but a mistake or a deleted lap is twice as likely. A late run gets the fastest track, with a risk of traffic.</p>
        </div>
      )}

      <div>
        <button className="btn-primary" disabled={!est || busy} onClick={() => onRun({ program: program!, setup, risk, late })}>
          Run qualifying
        </button>
      </div>
    </div>
  );
}
