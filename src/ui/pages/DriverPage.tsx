import { Link, useParams } from "react-router-dom";
import { RATING_KEYS, RATING_LABELS } from "../../engine/ratings";
import { ageOf } from "../../engine/season/development";
import { circuitOf } from "../../engine/season/season";
import { barColor, FLAGS, money } from "../../lib/format";
import { useGame } from "../../state/game";
import { Ovr, Section, useMaps } from "../components/bits";

export function DriverPage() {
  const { id = "", did = "" } = useParams();
  const base = `/g/${id}`;
  const world = useGame((s) => s.world)!;
  const { drivers, team } = useMaps(world);
  const d = drivers.get(did);
  if (!d) return <div className="text-slate-500">Unknown driver.</div>;
  const t = team(d.teamId);
  const results = world.results.map((r) => ({ r, c: r.classification.find((x) => x.driverId === d.id) })).filter((x) => x.c);
  const titles = world.history.filter((h) => h.champion === d.id).map((h) => h.season);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <section className="panel overflow-hidden">
        <div className="h-2" style={{ background: t ? `linear-gradient(90deg, ${t.color}, ${t.color2})` : "#333" }} />
        <div className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm text-slate-400">{FLAGS[d.nat]} {d.nat} · age {ageOf(d, world.season)} · #{d.num}</div>
              <h1 className="font-display text-4xl font-black uppercase leading-none">
                {d.first} <span className="text-white">{d.last}</span>
              </h1>
              <div className="text-sm text-slate-400 mt-1">
                {d.retired ? `Retired after ${d.retired}` : t ? `${t.name} (${d.series})` : `Free agent (${d.series})`}
                {d.contract && ` · contract to ${d.contract.until}, ${money(d.contract.salary)} a year`}
              </div>
              {titles.length > 0 && <div className="text-sm text-amber-300 mt-1">World champion {titles.join(", ")}</div>}
            </div>
            <div className="text-center">
              <Ovr v={d.ovr} />
              <div className="text-[10px] text-slate-500 mt-1">POT {d.pot}</div>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
            {RATING_KEYS.map((k) => (
              <div key={k} className="flex items-center gap-2 text-xs">
                <span className="w-32 text-slate-400">{RATING_LABELS[k]}</span>
                <div className="flex-1 h-1.5 rounded bg-ink-700 overflow-hidden">
                  <div className={`h-full ${k === "aggression" ? "bg-violet-400" : barColor(d.ratings[k])}`} style={{ width: `${d.ratings[k]}%` }} />
                </div>
                <span className="w-6 text-right font-mono">{d.ratings[k]}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
      <Section title={`${world.season} results`}>
        {results.length === 0 ? (
          <div className="p-4 text-sm text-slate-500">No races yet.</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Rd</th>
                <th>Grand Prix</th>
                <th className="num">Grid</th>
                <th className="num">Finish</th>
                <th className="num">Pts</th>
              </tr>
            </thead>
            <tbody>
              {results.map(({ r, c }) => (
                <tr key={r.round}>
                  <td className="num text-slate-500">{r.round}</td>
                  <td>
                    <Link className="hover:underline" to={`${base}/race/${r.round}`}>{circuitOf(world, r.circuitId).gp}</Link>
                  </td>
                  <td className="num">{c!.grid}</td>
                  <td className="num">{c!.status === "Finished" || c!.status === "Lapped" ? c!.pos : <span className="text-rose-400">{c!.status}</span>}</td>
                  <td className="num">{c!.points || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}
