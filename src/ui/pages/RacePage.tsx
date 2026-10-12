import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { COMPOUNDS } from "../../engine/race/model";
import { circuitOf } from "../../engine/season/season";
import { COUNTRY_FLAGS, gap, lapTime, raceTime } from "../../lib/format";
import { useGame } from "../../state/game";
import { RaceViewer } from "../race/RaceViewer";
import { DriverLink, Section, TeamBar, useMaps } from "../components/bits";

export function RacePage() {
  const { id = "", round = "" } = useParams();
  const [qs] = useSearchParams();
  const base = `/g/${id}`;
  const world = useGame((s) => s.world)!;
  const { drivers, team } = useMaps(world);
  const res = world.results.find((r) => r.round === Number(round));
  const replay = world.replays[Number(round)];
  const [tab, setTab] = useState<"watch" | "result" | "quali" | "strategy">(qs.get("watch") && replay ? "watch" : "result");
  if (!res) return <div className="text-slate-500">This race hasn't been run yet. <Link className="text-race" to={base}>Back</Link></div>;
  const c = circuitOf(world, res.circuitId);
  const tabs = [
    ["watch", "Watch"],
    ["result", "Result"],
    ["quali", "Qualifying"],
    ["strategy", "Strategy"],
  ] as const;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-400">Round {res.round} · {world.season}</div>
          <h1 className="font-display text-3xl font-black uppercase leading-none">{COUNTRY_FLAGS[c.country]} {c.gp}</h1>
        </div>
        <div className="ml-auto flex gap-1">
          {tabs.map(([k, label]) => (
            <button key={k} disabled={k === "watch" && !replay} onClick={() => setTab(k)} className={`btn !px-3 !py-1.5 ${tab === k ? "bg-race text-white" : "bg-ink-800 text-slate-300"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "watch" && replay && <RaceViewer world={world} replay={replay} />}

      {tab === "result" && (
        <Section title="Classification" right={<span className="text-xs text-slate-400">{res.overtakes} passes · {res.sc} SC · {res.vsc} VSC{res.red ? ` · ${res.red} red flag${res.red > 1 ? "s" : ""}` : ""}</span>}>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Pos</th>
                  <th>Driver</th>
                  <th>Team</th>
                  <th className="num">Grid</th>
                  <th className="num">Laps</th>
                  <th className="num">Time / gap</th>
                  <th className="num">Stops</th>
                  <th className="num">Best lap</th>
                  <th className="num">Pts</th>
                  <th>Stewards</th>
                </tr>
              </thead>
              <tbody>
                {res.classification.map((r) => {
                  const fin = r.status === "Finished" || r.status === "Lapped";
                  const fl = res.fastestLap.driverId === r.driverId;
                  return (
                    <tr key={r.driverId}>
                      <td className="num w-10">{fin ? r.pos : <span className="text-slate-500">-</span>}</td>
                      <td><DriverLink d={drivers.get(r.driverId)} base={base} full /></td>
                      <td>
                        <span className="flex items-center gap-2 text-slate-400">
                          <TeamBar color={team(r.teamId)?.color ?? "#888"} />
                          {team(r.teamId)?.name}
                        </span>
                      </td>
                      <td className="num text-slate-400">{r.grid}</td>
                      <td className="num">{r.laps}</td>
                      <td className="num">
                        {r.status === "Finished" ? (r.pos === 1 ? raceTime(r.time) : gap(r.gap)) : r.status === "Lapped" ? `+${c.laps - r.laps} lap${c.laps - r.laps > 1 ? "s" : ""}` : <span className="text-rose-400">{r.status}</span>}
                      </td>
                      <td className="num">{r.pits}</td>
                      <td className={`num ${fl ? "text-fuchsia-400 font-semibold" : "text-slate-400"}`}>{lapTime(r.fastest)}</td>
                      <td className="num font-semibold">{r.points || ""}</td>
                      <td className="text-xs text-amber-300">
                        {(r.pens ?? []).join(", ")}
                        {r.pp ? <span className="text-slate-400"> · {r.pp} licence pt{r.pp > 1 ? "s" : ""}</span> : null}
                        {res.stand_ins?.some((x) => x.driverId === r.driverId) ? <span className="text-slate-400">Stand-in for {drivers.get(res.stand_ins.find((x) => x.driverId === r.driverId)!.for)?.last}</span> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {tab === "quali" && (
        <Section title="Qualifying">
          <table className="tbl">
            <thead>
              <tr>
                <th>Pos</th>
                <th>Driver</th>
                <th className="num">Q1</th>
                <th className="num">Q2</th>
                <th className="num">Q3</th>
              </tr>
            </thead>
            <tbody>
              {res.quali.map((q) => {
                const d = drivers.get(q.driverId);
                return (
                  <tr key={q.driverId}>
                    <td className="num w-10">{q.pos}</td>
                    <td>
                      <span className="flex items-center gap-2">
                        <TeamBar color={team(d?.teamId)?.color ?? "#888"} />
                        <DriverLink d={d} base={base} full />
                      </span>
                    </td>
                    {q.q.map((t, i) => (
                      <td key={i} className="num text-slate-300">{t === null ? "" : lapTime(t)}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>
      )}

      {tab === "strategy" && replay && (
        <Section title="Tyre strategy">
          <div className="p-4 space-y-1.5">
            {res.classification.map((r) => {
              const k = replay.cars.findIndex((x) => x.driverId === r.driverId);
              const d = drivers.get(r.driverId);
              return (
                <div key={r.driverId} className="flex items-center gap-2 text-xs">
                  <span className="w-10 font-semibold">{d?.code}</span>
                  <div className="relative flex-1 h-4 bg-ink-800 rounded">
                    {replay.stints[k].map((s, i) => (
                      <div
                        key={i}
                        title={`${COMPOUNDS[s.c].name}: laps ${s.from}-${s.to}`}
                        className="absolute top-0 h-4 rounded-sm border border-ink-950 text-[9px] font-bold text-black grid place-items-center"
                        style={{ left: `${((s.from - 1) / replay.laps) * 100}%`, width: `${((s.to - s.from + 1) / replay.laps) * 100}%`, background: COMPOUNDS[s.c].color }}
                      >
                        {s.to - s.from >= 4 ? s.to - s.from + 1 : ""}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
}
