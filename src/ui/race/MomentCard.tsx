// The freeze-frame card for a key moment: what's happening, what you know of the other driver, the options,
// and "instinct" (let the driver decide, the plain AI path).
import type { PendingMoment } from "../../engine/race/moments";

export function MomentCard({ m, onPick, who }: { m: PendingMoment; onPick: (opt: string) => void; who?: string }) {
  const tag = m.kind === "attack" ? "bg-sky-400 text-ink-950" : m.kind === "defend" ? "bg-amber-400 text-ink-950" : "bg-slate-300 text-ink-950";
  return (
    <div className="rounded-lg border border-ink-600 bg-ink-900 p-5 shadow-xl">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`rounded-md px-2.5 py-1 font-display text-base font-bold uppercase tracking-wide ${tag}`}>{m.kind === "attack" ? "Attack" : m.kind === "defend" ? "Defend" : "Pit wall"}</span>
        <span className="kicker">
          Lap {m.lap}
          {who ? ` · ${who}` : ""}
        </span>
      </div>
      <h3 className="headline mt-3 text-4xl">{m.title}</h3>
      <p className="mt-2 text-lg text-slate-300">{m.text}</p>
      {m.read && <p className="mt-1 text-base text-sky-300">{m.read}</p>}
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {m.opts.map((o) => (
          <button key={o.id} disabled={o.disabled} onClick={() => onPick(o.id)} className="rounded-lg border-2 border-ink-700 bg-ink-800 px-4 py-3 text-left hover:border-slate-300 hover:bg-ink-700 disabled:opacity-35">
            <div className="font-display text-xl font-bold uppercase leading-tight text-white">{o.label}</div>
            <div className="mt-0.5 text-sm leading-snug text-slate-400">{o.disabled ? "Not enough battery." : o.hint}</div>
          </button>
        ))}
        <button onClick={() => onPick("auto")} className="rounded-lg border-2 border-dashed border-ink-600 px-4 py-3 text-left hover:border-slate-300 hover:bg-ink-800">
          <div className="font-display text-xl font-bold uppercase leading-tight text-slate-300">Instinct</div>
          <div className="mt-0.5 text-sm leading-snug text-slate-500">Let the driver decide.</div>
        </button>
      </div>
    </div>
  );
}
