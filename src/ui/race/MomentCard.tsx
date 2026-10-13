// The freeze-frame card for a key moment: what's happening, what you know of the other driver, the options,
// and "instinct" (let the driver decide, the plain AI path).
import type { PendingMoment } from "../../engine/race/moments";

export function MomentCard({ m, onPick, who }: { m: PendingMoment; onPick: (opt: string) => void; who?: string }) {
  const tone = m.kind === "attack" ? "border-sky-400" : m.kind === "defend" ? "border-amber-400" : "border-slate-400";
  return (
    <div className={`rounded-lg border-l-4 ${tone} bg-ink-900/95 p-3 shadow-xl`}>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Lap {m.lap} · {who ? `${who} · ` : ""}
          {m.kind === "attack" ? "Attack" : m.kind === "defend" ? "Defend" : "Pit wall"}
        </span>
        <h3 className="font-display text-xl font-bold uppercase leading-none text-white">{m.title}</h3>
      </div>
      <p className="mt-1 text-sm text-slate-300">{m.text}</p>
      {m.read && <p className="mt-1 text-xs text-sky-300">{m.read}</p>}
      <div className="mt-2 grid gap-1.5 sm:grid-cols-3">
        {m.opts.map((o) => (
          <button key={o.id} disabled={o.disabled} onClick={() => onPick(o.id)} className="rounded-md bg-ink-800 px-2.5 py-1.5 text-left hover:bg-ink-700 disabled:opacity-35">
            <div className="text-sm font-semibold text-white">{o.label}</div>
            <div className="text-[11px] leading-tight text-slate-400">{o.disabled ? "Not enough battery." : o.hint}</div>
          </button>
        ))}
        <button onClick={() => onPick("auto")} className="rounded-md border border-ink-700 px-2.5 py-1.5 text-left hover:bg-ink-800">
          <div className="text-sm font-semibold text-slate-300">Instinct</div>
          <div className="text-[11px] leading-tight text-slate-500">Let the driver decide.</div>
        </button>
      </div>
    </div>
  );
}
