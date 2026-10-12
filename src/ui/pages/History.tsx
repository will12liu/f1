import { useParams } from "react-router-dom";
import { useGame } from "../../state/game";
import { DriverLink, Section, TeamBar, useMaps } from "../components/bits";

export function History() {
  const { id = "" } = useParams();
  const base = `/g/${id}`;
  const world = useGame((s) => s.world)!;
  const { drivers, team } = useMaps(world);
  return (
    <Section title="Champions">
      {world.history.length === 0 ? (
        <div className="p-4 text-sm text-slate-500">Finish a season to see it here.</div>
      ) : (
        <table className="tbl">
          <thead>
            <tr>
              <th>Season</th>
              <th>Drivers' champion</th>
              <th className="num">Pts</th>
              <th>Runner-up</th>
              <th>Constructors</th>
            </tr>
          </thead>
          <tbody>
            {world.history.slice().reverse().map((h) => (
              <tr key={h.season}>
                <td className="font-mono">{h.season}</td>
                <td>
                  <span className="flex items-center gap-2">
                    <TeamBar color={team(h.championTeam)?.color ?? "#888"} />
                    <DriverLink d={drivers.get(h.champion)} base={base} full />
                  </span>
                </td>
                <td className="num">{h.standings[0]?.points}</td>
                <td><DriverLink d={drivers.get(h.standings[1]?.driverId ?? "")} base={base} full /></td>
                <td>{team(h.constructors)?.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}
