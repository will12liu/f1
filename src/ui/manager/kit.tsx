// Small shared pieces for the team-principal pages.
import { useState } from "react";
import { useGame, type ActName } from "../../state/game";

/** Runs an action and keeps its answer to show under the controls. */
export function useAct() {
  const act = useGame((s) => s.act);
  const [answer, setAnswer] = useState<{ ok: boolean; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (name: ActName, ...args: unknown[]) => {
    setBusy(true);
    try {
      const a = await (act as unknown as (n: ActName, ...x: unknown[]) => Promise<{ ok: boolean; msg: string }>)(name, ...args);
      setAnswer(a);
      return a;
    } finally {
      setBusy(false);
    }
  };
  return { run, answer, busy, clear: () => setAnswer(null) };
}

export function Answer({ a }: { a: { ok: boolean; msg: string } | null }) {
  if (!a || !a.msg) return null;
  return <div className={`text-sm ${a.ok ? "text-emerald-300" : "text-amber-300"}`}>{a.msg}</div>;
}

/** A horizontal meter: value 0-1 of the bar; `mark` draws a thin line (a limit). */
export function Meter({ value, color = "#e10600", mark, height = 8 }: { value: number; color?: string; mark?: number; height?: number }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="relative w-full rounded-sm bg-ink-800" style={{ height }}>
      <div className="rounded-sm" style={{ width: `${v * 100}%`, height, background: color }} />
      {mark !== undefined && <div className="absolute top-[-3px] w-0.5 bg-white" style={{ left: `${Math.max(0, Math.min(1, mark)) * 100}%`, height: height + 6 }} />}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "good" | "bad" }) {
  return (
    <div className="panel px-5 py-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`mt-1.5 font-display text-3xl font-bold leading-none ${tone === "good" ? "text-emerald-300" : tone === "bad" ? "text-rose-300" : "text-white"}`}>{value}</div>
      {sub && <div className="mt-1 text-sm text-slate-400">{sub}</div>}
    </div>
  );
}

export const AREA_LABEL = { aero: "Aerodynamics", mech: "Mechanical", power: "Power unit", reliability: "Reliability" } as const;
