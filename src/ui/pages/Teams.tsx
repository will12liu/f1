import { useParams } from "react-router-dom";
import { carOvr } from "../../engine/ratings";
import { ageOf } from "../../engine/season/development";
import { money } from "../../lib/format";
import { useGame } from "../../state/game";
import { DriverLink, Ovr, useMaps } from "../components/bits";
import { PageHead } from "../components/hub";

function Bar({ label, v, max = 100 }: { label: string; v: number; max?: number }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-20 text-slate-400">{label}</span>
      <div className="flex-1 h-1.5 rounded bg-ink-700 overflow-hidden">
        <div className="h-full bg-slate-300" style={{ width: `${Math.max(0, Math.min(100, ((v - 50) / (max - 50)) * 100))}%` }} />
      </div>
      <span className="w-7 text-right font-mono">{Math.round(v)}</span>
    </div>
  );
}

export function Teams() {
  const { id = "" } = useParams();
  const base = `/g/${id}`;
  const world = useGame((s) => s.world)!;
  const { drivers } = useMaps(world);
  const teams = world.teams.filter((t) => t.series === "F1").sort((a, b) => carOvr(b.car) - carOvr(a.car));
  return (
    <div className="grid gap-8">
    <PageHead kicker="Fastest car first" title="Teams" />
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {teams.map((t) => (
        <section key={t.id} className="panel overflow-hidden">
          <div className="h-3" style={{ background: t.color }} />
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-display text-2xl font-black uppercase leading-none">{t.name}</div>
                <div className="text-sm text-slate-500">{t.engine} power · budget {"$".repeat(t.budget)}</div>
              </div>
              <div className="text-right">
                <div className="text-xs uppercase text-slate-500">Car</div>
                <Ovr v={carOvr(t.car)} />
              </div>
            </div>
            <div className="space-y-1">
              <Bar label="Power unit" v={t.car.power} />
              <Bar label="Aero" v={t.car.aero} />
              <Bar label="Mechanical" v={t.car.mech} />
              <Bar label="Reliability" v={t.car.reliability} />
              <Bar label="Development" v={t.car.dev} />
            </div>
            <div className="divide-y divide-ink-800 text-sm">
              {t.drivers.map((did) => {
                const d = drivers.get(did);
                if (!d) return null;
                return (
                  <div key={did} className="flex items-center gap-2 py-1.5">
                    <span className="font-mono text-sm text-slate-500 w-6">#{d.num}</span>
                    <DriverLink d={d} base={base} full />
                    <span className="text-sm text-slate-500">{ageOf(d, world.season)}</span>
                    <span className="ml-auto text-sm text-slate-500">{d.contract ? `to ${d.contract.until} · ${money(d.contract.salary, 0)}` : ""}</span>
                    <Ovr v={d.ovr} />
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      ))}
    </div>
    </div>
  );
}
