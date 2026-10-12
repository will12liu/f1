// The pit wall for the car you drive: dials (applied from the next lap), gauges, the forecast and the
// engineer's calls. Reads the live runner; every change goes in as a command so the race can be replayed.
import { useState } from "react";
import type { Dials, EngineMode, ErsMode, FuelMix } from "../../engine/race/dials";
import { engineerAccepts, engineerCalls } from "../../engine/race/engineer";
import { COMPOUNDS } from "../../engine/race/model";
import type { RaceRunner } from "../../engine/race/race";

export function PitWall({ runner, idx, code, mate }: { runner: RaceRunner; idx: number; code: string; mate?: { idx: number; code: string } }) {
  const car = runner.state.cars[idx];
  const [want, setWant] = useState<Dials>(car.dials);
  const [req, setReq] = useState<{ lap: number; c: "S" | "M" | "H" | null; text: string } | null>(null);
  const s = runner.state;
  const f = runner.forecast(idx);
  const calls = engineerCalls(s, idx, f);
  const left = s.laps - s.lap;
  const nextLap = Math.min(s.laps, s.lap + 1);
  const pending = (Object.keys(want) as (keyof Dials)[]).some((k) => want[k] !== car.dials[k]);
  const over = car.out !== null || s.lap >= s.laps;

  const set = <K extends keyof Dials>(k: K, v: Dials[K]) => {
    if (over) return;
    setWant((w) => ({ ...w, [k]: v }));
    runner.command({ car: idx, dials: { [k]: v } });
  };
  const box = (c: "S" | "M" | "H") => {
    if (over || !engineerAccepts()) return;
    runner.command({ car: idx, pit: "box", compound: c });
    setReq({ lap: nextLap, c, text: `Box, box: ${COMPOUNDS[c].name.toLowerCase()}s at the end of lap ${nextLap}.` });
  };
  const stay = () => {
    if (over || !engineerAccepts()) return;
    runner.command({ car: idx, pit: "stay" });
    setReq({ lap: nextLap, c: null, text: `Staying out on lap ${nextLap}.` });
  };
  const orders = () => {
    if (over || !mate) return;
    runner.command({ car: idx, letBy: true });
    setReq({ lap: nextLap, c: null, text: `${code}, let ${mate.code} through this lap.` });
  };
  const myPos = s.order.indexOf(idx);
  const mateBehind = mate && myPos >= 0 && s.order[myPos + 1] === mate.idx && s.cars[mate.idx].cum - car.cum < 2.5 && !s.cars[mate.idx].out;
  // a request lasts until its lap has been run
  const active = req && req.lap > s.lap ? req : null;
  const boxFor = active?.c ?? null;

  const tyreLeft = Math.max(0, Math.min(1, 1 - f.tyreWear));
  const stopNext = f.nextStop && f.nextStop.lap === s.lap + 1;

  return (
    <div className="panel text-sm">
      <div className="flex items-center justify-between px-3 py-2 border-b border-ink-800">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Pit wall · {code}</span>
        <span className="font-mono text-xs text-slate-400">{over ? (car.out ? car.out : "Finished") : pending ? `Changes from lap ${nextLap}` : `Lap ${nextLap}/${s.laps}`}</span>
      </div>

      <div className="grid gap-3 p-3">
        <Gauge label="Tyres" value={tyreLeft} color={COMPOUNDS[car.compound].color} right={`${COMPOUNDS[car.compound].name}, ${car.age} laps · ${f.tyreLapsLeft >= 60 ? "60+" : Math.floor(f.tyreLapsLeft)} left`} warn={f.tyreLapsLeft < 3} />
        <Gauge label="Battery" value={f.battery} color="#38bdf8" right={`${Math.round(f.battery * 100)}%${f.batteryEmptyLap ? ` · empty lap ${f.batteryEmptyLap}` : ""}`} warn={f.battery < 0.1} />
        <Gauge
          label="Fuel"
          value={Math.min(1, f.fuel / Math.max(1, s.laps * 1.6))}
          color="#a3a3a3"
          right={`${f.fuel.toFixed(1)} kg · ${f.fuelMargin >= 0 ? `${f.fuelMargin.toFixed(1)} spare` : `${(-f.fuelMargin).toFixed(1)} short`}`}
          warn={f.fuelMargin < 0}
        />

        <div className="grid gap-2">
          <Seg label="Pace" value={want.pace} options={[1, 2, 3, 4, 5].map((v) => [v, String(v)] as const)} onPick={(v) => set("pace", v)} />
          <Seg label="Tyre care" value={want.tyres} options={[1, 2, 3, 4, 5].map((v) => [v, String(v)] as const)} onPick={(v) => set("tyres", v)} />
          <Seg<FuelMix> label="Fuel mix" value={want.fuel} options={[["lean", "Lean"], ["std", "Std"], ["rich", "Rich"]]} onPick={(v) => set("fuel", v)} />
          <Seg<ErsMode> label="ERS" value={want.ers} options={[["harvest", "Harvest"], ["balanced", "Bal"], ["attack", "Attack"], ["defend", "Defend"]]} onPick={(v) => set("ers", v)} />
          <Seg<EngineMode> label="Engine" value={want.engine} options={[["low", "Low"], ["std", "Std"], ["high", "High"]]} onPick={(v) => set("engine", v)} />
        </div>

        <div className="font-mono text-xs text-slate-400">
          {f.lapDelta === 0 ? "Neutral settings." : `${f.lapDelta < 0 ? "" : "+"}${f.lapDelta.toFixed(2)}s a lap vs neutral.`}
        </div>

        {!over && (
          <div className="grid gap-2 border-t border-ink-800 pt-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Engineer</div>
            {calls.length === 0 && <div className="text-slate-500">Nothing from the engineer.</div>}
            {calls.map((c) => (
              <div key={c.id} className={c.tone === "warn" ? "text-amber-300" : c.tone === "plan" ? "text-white" : "text-slate-300"}>
                {c.text}
              </div>
            ))}
            {active && <div className="text-sky-300">{active.text}</div>}
            {left > 1 && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-xs text-slate-400">Box for</span>
                {(["S", "M", "H"] as const).map((c) => (
                  <button key={c} className={`btn !px-2.5 !py-1 ${boxFor === c ? "bg-white text-black" : "bg-ink-800 text-slate-200 hover:bg-ink-700"}`} onClick={() => box(c)}>
                    <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: COMPOUNDS[c].color }} />
                    {COMPOUNDS[c].name}
                  </button>
                ))}
                {mateBehind && !active && (
                  <button className="btn bg-ink-800 text-slate-200 hover:bg-ink-700 !px-2.5 !py-1" onClick={orders}>
                    Let {mate!.code} through
                  </button>
                )}
                {stopNext && !active && (
                  <button className="btn bg-ink-800 text-slate-200 hover:bg-ink-700 !px-2.5 !py-1" onClick={stay}>
                    Stay out a lap
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Gauge({ label, value, color, right, warn }: { label: string; value: number; color: string; right: string; warn?: boolean }) {
  return (
    <div className="grid gap-1">
      <div className="flex justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className={`font-mono ${warn ? "text-amber-300" : "text-slate-300"}`}>{right}</span>
      </div>
      <div className="h-2 rounded-sm bg-ink-800">
        <div className="h-2 rounded-sm" style={{ width: `${Math.round(value * 100)}%`, background: warn ? "#f59e0b" : color }} />
      </div>
    </div>
  );
}

function Seg<T extends string | number>({ label, value, options, onPick }: { label: string; value: T; options: readonly (readonly [T, string])[]; onPick: (v: T) => void }) {
  return (
    <div className="grid grid-cols-[72px_1fr] items-center gap-2">
      <span className="text-xs text-slate-400">{label}</span>
      <div className="flex rounded-md bg-ink-850 p-0.5">
        {options.map(([v, text]) => (
          <button key={String(v)} onClick={() => onPick(v)} className={`flex-1 rounded px-1 py-1 text-xs font-semibold ${v === value ? "bg-race text-white" : "text-slate-300 hover:bg-ink-700"}`}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
