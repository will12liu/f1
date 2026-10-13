// The junior ladder: F2 and F3 championships (they race on F1 weekends), super licence points, and the F4
// prospect pool below them.
import { useState } from "react";
import { useParams } from "react-router-dom";
import { potEstimate } from "../../engine/manager/academy";
import { ageOf } from "../../engine/season/development";
import { hasLicence, juniorRounds, juniorStandings, licencePointsSL, type Junior } from "../../engine/season/juniors";
import { circuitOf } from "../../engine/season/season";
import { useGame } from "../../state/game";
import { DriverLink, Ovr, Section, TeamBar, useMaps } from "../components/bits";

export function Juniors() {
  const { id = "" } = useParams();
  const base = `/g/${id}`;
  const world = useGame((s) => s.world);
  const [tab, setTab] = useState<Junior | "F4">("F2");
  if (!world) return null;
  const { drivers, team } = useMaps(world);
  const acad = new Set(world.manager?.academy?.map((a) => a.driverId) ?? []);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <h1 className="headline text-5xl sm:text-6xl">Junior ladder</h1>
        <div className="ml-auto flex gap-1">
          {(["F2", "F3", "F4"] as const).map((k) => (
            <button key={k} onClick={() => setTab(k)} className={`btn !px-3 !py-1.5 ${tab === k ? "bg-race text-white" : "bg-ink-800 text-slate-300 hover:bg-ink-700"}`}>
              {k === "F4" ? "F4 prospects" : k}
            </button>
          ))}
        </div>
      </div>

      {tab !== "F4" ? (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Section title={`${tab} championship`} right={<span className="text-sm text-slate-400">{(world.juniorResults ?? []).filter((r) => r.series === tab).length} of {juniorRounds(world.calendar.length, tab).length} rounds</span>}>
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Pos</th>
                    <th>Driver</th>
                    <th>Team</th>
                    <th className="num">Age</th>
                    <th className="num">Ovr</th>
                    <th className="num">Pts</th>
                    <th className="num">Wins</th>
                    <th className="num">Licence</th>
                  </tr>
                </thead>
                <tbody>
                  {(juniorStandings(world, tab).length
                    ? juniorStandings(world, tab).map((r) => ({ d: drivers.get(r.driverId)!, r }))
                    : world.drivers.filter((d) => d.series === tab && !d.retired).sort((a, b) => b.ovr - a.ovr).map((d) => ({ d, r: null }))
                  )
                    .filter((x) => x.d)
                    .map(({ d, r }, i) => (
                      <tr key={d.id} className={acad.has(d.id) ? "bg-sky-950/40" : ""}>
                        <td className="num w-10">{r ? i + 1 : "-"}</td>
                        <td>
                          <DriverLink d={d} base={base} full />
                          {acad.has(d.id) && <span className="ml-2 text-xs font-bold text-sky-300">ACADEMY</span>}
                        </td>
                        <td>
                          <span className="flex items-center gap-2 text-slate-400">
                            <TeamBar color={team(d.teamId)?.color ?? "#888"} />
                            {team(d.teamId)?.name ?? "-"}
                          </span>
                        </td>
                        <td className="num">{ageOf(d, world.season)}</td>
                        <td className="num">
                          <Ovr v={d.ovr} />
                        </td>
                        <td className="num font-semibold">{r?.points ?? 0}</td>
                        <td className="num">{r?.wins ?? 0}</td>
                        <td className={`num ${hasLicence(world, d) ? "text-emerald-300" : "text-slate-400"}`}>{licencePointsSL(d, world.season)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Section>
          <Section title="Results">
            <div className="divide-y divide-ink-800 text-sm">
              {[...(world.juniorResults ?? [])]
                .filter((r) => r.series === tab)
                .reverse()
                .map((r) => (
                  <div key={r.round} className="px-4 py-2">
                    <div className="text-sm text-slate-400">Round {r.round} · {circuitOf(world, r.circuitId).name}</div>
                    <div className="flex flex-wrap gap-x-3">
                      {r.rows.slice(0, 3).map((x) => (
                        <span key={x.driverId}>
                          {x.pos}. {drivers.get(x.driverId)?.last}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              {!(world.juniorResults ?? []).some((r) => r.series === tab) && <div className="p-4 text-slate-500">No races yet this season.</div>}
            </div>
            <p className="px-4 pb-3 text-sm text-slate-500">An F1 seat needs 40 super licence points over three seasons (F2 champion: 40, F3 champion: 30).</p>
          </Section>
        </div>
      ) : (
        <Section title="F4 prospects" right={<span className="text-sm text-slate-400">15-18 year-olds; the best move up to F3 each winter</span>}>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Driver</th>
                  <th>Nationality</th>
                  <th className="num">Age</th>
                  <th className="num">Ovr</th>
                  <th className="num">Potential</th>
                </tr>
              </thead>
              <tbody>
                {world.drivers
                  .filter((d) => d.series === "F4" && !d.retired)
                  .sort((a, b) => b.ovr - a.ovr)
                  .map((d) => {
                    const est = potEstimate(world, d);
                    return (
                      <tr key={d.id}>
                        <td>
                          <DriverLink d={d} base={base} full />
                        </td>
                        <td className="text-slate-400">{d.nat}</td>
                        <td className="num">{ageOf(d, world.season)}</td>
                        <td className="num">{d.ovr}</td>
                        <td className="num text-slate-300">{est.lo === est.hi ? est.mid : `${est.lo}-${est.hi}`}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}
