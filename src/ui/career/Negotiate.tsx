// Contract talks on one seat offer: money, length, a clause.
import { useState } from "react";
import type { SeatOffer } from "../../engine/career/career";

export function Negotiate({ o, onPropose, busy }: { o: SeatOffer; onPropose: (ask: number, years: number, clause?: "release" | "lead") => void; busy?: boolean }) {
  const [ask, setAsk] = useState(1.15);
  const [years, setYears] = useState(o.years);
  const [clause, setClause] = useState<"" | "release" | "lead">("");
  const done = (o.talks ?? 0) >= 2;
  const btn = (on: boolean) => `btn !px-2 !py-0.5 text-xs ${on ? "bg-white text-black" : "bg-ink-800 text-slate-300 hover:bg-ink-700"}`;
  return (
    <div className="grid gap-2 rounded-md bg-ink-850 p-2.5 text-xs">
      <div className="flex flex-wrap items-center gap-1">
        <span className="w-16 text-slate-400">{o.salary < 0 ? "Seat price" : "Money"}</span>
        {[
          [1, "As offered"],
          [1.15, o.salary < 0 ? "-13%" : "+15%"],
          [1.3, o.salary < 0 ? "-23%" : "+30%"],
          [1.5, o.salary < 0 ? "-33%" : "+50%"],
        ].map(([v, label]) => (
          <button key={label} className={btn(ask === v)} onClick={() => setAsk(v as number)}>
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="w-16 text-slate-400">Years</span>
        {[1, 2, 3].map((y) => (
          <button key={y} className={btn(years === y)} onClick={() => setYears(y)}>
            {y}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="w-16 text-slate-400">Clause</span>
        {(
          [
            ["", "None"],
            ["release", "Release if a top team calls"],
            ["lead", "Number-one driver"],
          ] as const
        ).map(([v, label]) => (
          <button key={v} className={btn(clause === v)} onClick={() => setClause(v)}>
            {label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button className="btn-primary !px-2.5 !py-1 text-xs" disabled={busy || done} onClick={() => onPropose(ask, years, clause || undefined)}>
          Propose
        </button>
        <span className="text-slate-500">{done ? "They've made their final offer." : `${2 - (o.talks ?? 0)} round${2 - (o.talks ?? 0) === 1 ? "" : "s"} of talks left. Push too hard and they walk.`}</span>
      </div>
    </div>
  );
}
