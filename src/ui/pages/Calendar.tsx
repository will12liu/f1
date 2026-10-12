import { Link, useParams } from "react-router-dom";
import { circuitOf } from "../../engine/season/season";
import { COUNTRY_FLAGS } from "../../lib/format";
import { useGame } from "../../state/game";
import { DriverLink, Section, TeamBar, TrackOutline, useMaps } from "../components/bits";

export function Calendar() {
  const { id = "" } = useParams();
  const base = `/g/${id}`;
  const world = useGame((s) => s.world)!;
  const { drivers, team } = useMaps(world);
  return (
    <Section title={`${world.season} calendar`}>
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Rd</th>
              <th></th>
              <th>Grand Prix</th>
              <th>Date</th>
              <th className="num">Laps</th>
              <th>Pole</th>
              <th>Winner</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {world.calendar.map((r) => {
              const c = circuitOf(world, r.circuitId);
              const res = world.results.find((x) => x.round === r.round);
              const w = res && drivers.get(res.winner);
              return (
                <tr key={r.round}>
                  <td className="num text-slate-500">{r.round}</td>
                  <td className="w-12"><TrackOutline id={c.id} className="w-10 h-7" /></td>
                  <td>
                    <div className="font-semibold">{COUNTRY_FLAGS[c.country]} {c.gp}</div>
                    <div className="text-xs text-slate-500">{c.name}</div>
                  </td>
                  <td className="text-slate-400">{new Date(r.date + "T12:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric" })}</td>
                  <td className="num">{c.laps}</td>
                  <td>{res ? <DriverLink d={drivers.get(res.pole)} base={base} /> : ""}</td>
                  <td>
                    {w && (
                      <span className="flex items-center gap-2">
                        <TeamBar color={team(w.teamId)?.color ?? "#888"} />
                        <DriverLink d={w} base={base} />
                      </span>
                    )}
                  </td>
                  <td>{res && <Link className="text-xs text-race hover:underline" to={`${base}/race/${r.round}`}>Result</Link>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
