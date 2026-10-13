import { useParams } from "react-router-dom";
import { driverStandings, teamStandings } from "../../engine/season/season";
import { useGame } from "../../state/game";
import { DriverLink, Section, TeamBar, useMaps } from "../components/bits";
import { PageHead } from "../components/hub";

const cellClass = (pos: number | undefined, out: boolean) => {
  if (pos === undefined) return "text-slate-600";
  if (out) return "text-rose-400/80";
  if (pos === 1) return "bg-amber-400/25 text-amber-200 font-bold";
  if (pos <= 3) return "bg-slate-300/15 text-slate-100 font-semibold";
  if (pos <= 10) return "text-emerald-300";
  return "text-slate-400";
};

export function Standings() {
  const { id = "" } = useParams();
  const base = `/g/${id}`;
  const world = useGame((s) => s.world)!;
  const { drivers, team } = useMaps(world);
  const ds = driverStandings(world);
  const ts = teamStandings(world);
  return (
    <div className="grid gap-8">
      <PageHead kicker={`After ${world.results.length} of ${world.calendar.length} rounds`} title="Standings" />
      <Section title={`${world.season} drivers' championship`}>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Pos</th>
                <th>Driver</th>
                <th className="num">Pts</th>
                <th className="num">Wins</th>
                <th className="num">Pod</th>
                {world.results.map((r) => (
                  <th key={r.round} className="!px-1 text-center">{r.round}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ds.map((r, i) => (
                <tr key={r.driverId}>
                  <td className="num text-slate-500 w-8">{i + 1}</td>
                  <td>
                    <span className="flex items-center gap-2">
                      <TeamBar color={team(r.teamId)?.color ?? "#888"} />
                      <DriverLink d={drivers.get(r.driverId)} base={base} full />
                    </span>
                  </td>
                  <td className="num font-bold">{r.points}</td>
                  <td className="num">{r.wins}</td>
                  <td className="num">{r.podiums}</td>
                  {world.results.map((res) => {
                    const c = res.classification.find((x) => x.driverId === r.driverId);
                    const out = !!c && c.status !== "Finished" && c.status !== "Lapped";
                    return (
                      <td key={res.round} className={`!px-1 text-center font-mono text-sm ${cellClass(c?.pos, out)}`}>
                        {c ? (out ? "R" : c.pos) : ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <Section title="Constructors">
        <table className="tbl">
          <thead>
            <tr>
              <th>Pos</th>
              <th>Team</th>
              <th className="num">Pts</th>
              <th className="num">Wins</th>
            </tr>
          </thead>
          <tbody>
            {ts.map((r, i) => (
              <tr key={r.teamId}>
                <td className="num text-slate-500 w-8">{i + 1}</td>
                <td>
                  <span className="flex items-center gap-2">
                    <TeamBar color={team(r.teamId)?.color ?? "#888"} />
                    {team(r.teamId)?.name}
                  </span>
                </td>
                <td className="num font-bold">{r.points}</td>
                <td className="num">{r.wins}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
