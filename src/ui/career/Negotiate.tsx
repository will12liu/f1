// Contract talks on one seat offer: money, length, a clause.
import { useState } from "react";
import type { SeatOffer } from "../../engine/career/career";

export function Negotiate({ o, onPropose, busy }: { o: SeatOffer; onPropose: (ask: number, years: number, clause?: "release" | "lead") => void; busy?: boolean }) {
  const [ask, setAsk] = useState(1.15);
  const [years, setYears] = useState(o.years);
  const [clause, setClause] = useState<"" | "release" | "lead">("");
  const done = (o.talks ?? 0) >= 2;
  const btn = (on: boolean) => `rounded-lg px-4 py-2.5 text-base font-semibold ${on ? "bg-white text-ink-950" : "bg-ink-800 text-slate-300 hover:bg-ink-700"}`;
  return (
    <div className="grid gap-3 rounded-lg border border-ink-700 bg-ink-850 p-5 text-base">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-24 kicker">{o.salary < 0 ? "Seat price" : "Money"}</span>
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
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-24 kicker">Years</span>
        {[1, 2, 3].map((y) => (
          <button key={y} className={btn(years === y)} onClick={() => setYears(y)}>
            {y}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-24 kicker">Clause</span>
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
      <div className="flex flex-wrap items-center gap-4">
        <button className="rounded-lg bg-race px-5 py-3 font-display text-lg font-bold uppercase text-white hover:bg-red-500 disabled:opacity-40" disabled={busy || done} onClick={() => onPropose(ask, years, clause || undefined)}>
          Propose
        </button>
        <span className="text-slate-500">{done ? "They've made their final offer." : `${2 - (o.talks ?? 0)} round${2 - (o.talks ?? 0) === 1 ? "" : "s"} of talks left. Push too hard and they walk.`}</span>
      </div>
    </div>
  );
}
