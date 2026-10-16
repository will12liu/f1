// The freeze-frame card for a key moment: what's happening, what you know of the other driver, the options,
// and "instinct" (let the driver decide, the plain AI path). A duel move is then executed through the braking
// mini-game (BrakeBar); its score goes to the engine with the answer. Keys 1-n pick an option.
import { lazy, Suspense, useEffect, useState } from "react";
import type { PendingMoment } from "../../engine/race/moments";
import { BrakeBar, zoneFor, type BrakeZone } from "./BrakeBar";
import { readMomentsView } from "./MomentsView";
import { TyreSave } from "./TyreSave";

// the 3D cockpit (three.js) loads only when a duel opens in it
const Cockpit3D = lazy(() => import("./cockpit/Cockpit3D"));
export interface CockpitTrack {
  trackId: string;
  km: number;
  target: number;
  myColor: string;
  oppColor: string;
  habit?: string;
  grip?: number;
  myColor2?: string;
  oppColor2?: string;
  myNum?: number;
  oppNum?: number;
}

export function MomentCard({ m, onPick, who, cockpit, ease = 1 }: { m: PendingMoment; onPick: (opt: string, q?: number) => void; who?: string; cockpit?: CockpitTrack; ease?: number }) {
  const [exec, setExec] = useState<{ id: string; label: string; zone: BrakeZone | null } | null>(null);
  const [simple, setSimple] = useState(false);
  useEffect(() => {
    setExec(null);
    setSimple(false);
  }, [m.id]);
  const in3d = !!exec && !!cockpit && !simple && m.kind !== "call" && readMomentsView() === "cockpit";
  // cockpit mode: no list of moves, a countdown and straight into the car; your driving decides the move
  const direct = !!cockpit && !simple && m.kind !== "call" && readMomentsView() === "cockpit";
  const [count, setCount] = useState(3);
  useEffect(() => {
    setCount(3);
  }, [m.id]);
  useEffect(() => {
    if (!direct || count <= 0) return;
    const id = window.setTimeout(() => setCount((c) => c - 1), 700);
    return () => clearTimeout(id);
  }, [direct, count]);
  const legal = (move: string) => {
    const ok = (id: string) => m.opts.some((o) => o.id === id && !o.disabled);
    return ok(move) ? move : (m.opts.find((o) => !o.disabled && o.id !== "wait" && o.id !== "yield")?.id ?? "auto");
  };
  const pick = (id: string) => {
    const o = m.opts.find((x) => x.id === id);
    if (!o || o.disabled) return;
    const z0 = m.kind === "call" ? (m.sit === "restart" ? zoneFor("restart") : null) : zoneFor(id);
    const zone = z0 && { ...z0, half: z0.half * ease }; // difficulty: wider or tighter green
    if (zone) setExec({ id, label: o.label, zone });
    else if (m.sit === "tyres-gone" && id === "nurse") setExec({ id, label: o.label, zone: null }); // the needle game
    else onPick(id);
  };
  useEffect(() => {
    if (exec || direct) return;
    const onKey = (e: KeyboardEvent) => {
      const i = Number(e.key) - 1;
      if (i >= 0 && i < m.opts.length) pick(m.opts[i].id);
      else if (i === m.opts.length) onPick("auto");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  if (direct)
    return (
      <div className="rounded-lg border border-ink-600 bg-ink-900 p-5 shadow-xl">
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-md bg-race px-2.5 py-1 font-display text-base font-bold uppercase tracking-wide text-white">Key moment</span>
          <span className="kicker">
            Lap {m.lap}
            {who ? ` · ${who}` : ""}
          </span>
        </div>
        <h3 className="headline mt-3 text-4xl">{m.title}</h3>
        <p className="mt-2 text-lg text-slate-300">{m.text}</p>
        {m.read && <p className="mt-1 text-base text-sky-300">{m.read}</p>}
        {count > 0 ? (
          <div className="mt-4 flex items-center gap-6">
            <span className="font-display text-8xl font-black leading-none text-white">{count}</span>
            <button className="text-base text-slate-400 underline hover:text-white" onClick={() => setSimple(true)}>
              Pick a move instead
            </button>
          </div>
        ) : (
          <Suspense fallback={<div className="mt-4 text-lg text-slate-400">Loading the cockpit...</div>}>
            <Cockpit3D
              {...cockpit!}
              grip={(cockpit!.grip ?? 1) * (1 + (ease - 1) * 0.06)}
              side={m.kind === "defend" ? "defend" : "attack"}
              move="free"
              label={m.kind === "defend" ? "Defend" : "Attack"}
              pick={m.lap}
              onResult={(q, move) => onPick(legal(move), q)}
              onSimple={() => setSimple(true)}
            />
          </Suspense>
        )}
      </div>
    );
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
      {exec ? (
        <div className="mt-4">
          <div className="mb-3 font-display text-2xl font-black uppercase text-race">{exec.label}</div>
          {in3d ? (
            <Suspense fallback={<div className="text-lg text-slate-400">Loading the cockpit...</div>}>
              <Cockpit3D {...cockpit!} grip={(cockpit!.grip ?? 1) * (1 + (ease - 1) * 0.06)} side={m.kind === "defend" ? "defend" : "attack"} move={exec.id} label={exec.label} pick={m.lap} onResult={(q) => onPick(exec.id, q)} onSimple={() => setSimple(true)} />
            </Suspense>
          ) : exec.zone ? (
            <BrakeBar zone={exec.zone} onResult={(q) => onPick(exec.id, q)} />
          ) : (
            <TyreSave ease={ease} onResult={(q) => onPick(exec.id, q)} />
          )}
        </div>
      ) : (
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {m.opts.map((o, i) => (
          <button key={o.id} disabled={o.disabled} onClick={() => pick(o.id)} className="rounded-lg border-2 border-ink-700 bg-ink-800 px-4 py-3 text-left hover:border-slate-300 hover:bg-ink-700 disabled:opacity-35">
            <div className="font-display text-xl font-bold uppercase leading-tight text-white">
              <span className="mr-2 text-slate-500">{i + 1}</span>
              {o.label}
            </div>
            <div className="mt-0.5 text-sm leading-snug text-slate-400">{o.disabled ? "Not enough battery." : o.hint}</div>
          </button>
        ))}
        <button onClick={() => onPick("auto")} className="rounded-lg border-2 border-dashed border-ink-600 px-4 py-3 text-left hover:border-slate-300 hover:bg-ink-800">
          <div className="font-display text-xl font-bold uppercase leading-tight text-slate-300">Instinct</div>
          <div className="mt-0.5 text-sm leading-snug text-slate-500">Let the driver decide.</div>
        </button>
      </div>
      )}
    </div>
  );
}
