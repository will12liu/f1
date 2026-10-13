import { Link, useParams } from "react-router-dom";
import { RATING_KEYS, RATING_LABELS } from "../../engine/ratings";
import { ageOf } from "../../engine/season/development";
import { circuitOf } from "../../engine/season/season";
import { barColor, FLAGS, money } from "../../lib/format";
import { useGame } from "../../state/game";
import { onColor, Section, useMaps } from "../components/bits";

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
  const color = t?.color ?? "#475569";
  return (
    <div className="grid gap-8">
      <section className="flex flex-wrap items-stretch overflow-hidden rounded-lg border border-ink-700 bg-ink-900">
        <div className="flex w-24 items-center justify-center font-display text-6xl font-black sm:w-36 sm:text-7xl" style={{ background: color, color: onColor(color) }}>
          {d.num}
        </div>
        <div className="min-w-0 flex-1 px-6 py-5">
          <div className="kicker">{d.retired ? `Retired after ${d.retired}` : t ? `${d.series} · ${t.name}` : `${d.series} · free agent`}</div>
          <h1 className="headline mt-2">
            <span className="block text-2xl tracking-[0.15em] text-slate-300">{d.first}</span>
            <span className="block text-5xl sm:text-6xl">{d.last}</span>
          </h1>
          <div className="mt-2 text-base text-slate-400">
            {FLAGS[d.nat]} {d.nat} · age {ageOf(d, world.season)}
            {d.contract && ` · contract to ${d.contract.until}, ${money(d.contract.salary)} a year`}
          </div>
          {titles.length > 0 && <div className="mt-1 text-base font-semibold text-amber-300">World champion {titles.join(", ")}</div>}
        </div>
        <div className="flex items-center gap-8 border-ink-700 px-6 py-5 max-sm:w-full max-sm:border-t sm:border-l">
          <div>
            <div className="kicker">Overall</div>
            <div className="font-display text-6xl font-black leading-none text-white">{d.ovr}</div>
          </div>
          <div>
            <div className="kicker">Potential</div>
            <div className="font-display text-6xl font-black leading-none text-slate-500">{d.pot}</div>
          </div>
        </div>
      </section>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <section className="grid content-start gap-3 rounded-lg border border-ink-700 bg-ink-900 p-6">
        <h2 className="font-display text-2xl font-extrabold uppercase text-white">Ratings</h2>
        <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {RATING_KEYS.map((k) => (
            <div key={k} className="grid gap-1.5">
              <div className="flex items-baseline justify-between">
                <span className="text-base text-slate-300">{RATING_LABELS[k]}</span>
                <span className="font-display text-2xl font-black text-white">{d.ratings[k]}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-sm bg-ink-700">
                <div className={`h-full ${k === "aggression" ? "bg-violet-400" : barColor(d.ratings[k])}`} style={{ width: `${d.ratings[k]}%` }} />
              </div>
            </div>
          ))}
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
    </div>
  );
}
