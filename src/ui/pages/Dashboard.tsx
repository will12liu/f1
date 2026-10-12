import { Link, useNavigate, useParams } from "react-router-dom";
import { circuitOf, driverStandings, nextRound, teamStandings } from "../../engine/season/season";
import { COUNTRY_FLAGS } from "../../lib/format";
import { useGame } from "../../state/game";
import { DriverLink, Section, TeamBar, TrackOutline, useMaps } from "../components/bits";

export function Dashboard() {
  const { id = "" } = useParams();
  const base = `/g/${id}`;
  const nav = useNavigate();
  const { world, busy, simRounds, nextSeason } = useGame();
  if (!world) return null;
  const { drivers, team } = useMaps(world);
  const next = nextRound(world);
  const circuit = next ? circuitOf(world, next.circuitId) : null;
  const ds = driverStandings(world).slice(0, 10);
  const ts = teamStandings(world);
  const last = world.results[world.results.length - 1];
  const champ = !next && ds[0];

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-4">
        {next && circuit ? (
          <section className="panel p-5 grid sm:grid-cols-[1fr_200px] gap-4 items-center">
            <div className="space-y-3">
              <div className="text-xs uppercase tracking-wider text-slate-400">
                Round {next.round} of {world.calendar.length} · {new Date(next.date + "T12:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </div>
              <h1 className="font-display text-4xl font-black uppercase leading-none">
                {COUNTRY_FLAGS[circuit.country] ?? ""} {circuit.gp}
              </h1>
              <div className="text-sm text-slate-400">
                {circuit.name} · {circuit.laps} laps · {(circuit.laps * circuit.km).toFixed(1)} km · overtaking {["easy", "fair", "average", "hard", "very hard"][circuit.overtake - 1]}
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Link className="btn-primary" to={`${base}/live`}>
                  Drive it live
                </Link>
                <button
                  className="btn-ghost"
                  disabled={!!busy}
                  onClick={async () => {
                    await simRounds(1);
                    nav(`${base}/race/${next.round}?watch=1`);
                  }}
                >
                  Watch the race
                </button>
                <button className="btn-ghost" disabled={!!busy} onClick={() => simRounds(1)}>
                  Sim race
                </button>
                <button className="btn-ghost" disabled={!!busy} onClick={() => simRounds(99)}>
                  Sim to season end
                </button>
              </div>
            </div>
            <TrackOutline id={circuit.id} className="w-full h-40" />
          </section>
        ) : (
          <section className="panel p-5 space-y-3">
            <div className="text-xs uppercase tracking-wider text-slate-400">{world.season} season complete</div>
            {champ && (
              <h1 className="font-display text-4xl font-black uppercase">
                🏆 <DriverLink d={drivers.get(champ.driverId)} base={base} full /> is world champion
              </h1>
            )}
            <div className="text-sm text-slate-400">Constructors' champions: {team(ts[0]?.teamId)?.name}</div>
            <button className="btn-primary" disabled={!!busy} onClick={() => nextSeason()}>
              Start the {world.season + 1} season →
            </button>
          </section>
        )}

        {last && (
          <Section title={`Last race · ${circuitOf(world, last.circuitId).gp}`} right={<Link className="text-xs text-slate-400 hover:text-white" to={`${base}/race/${last.round}`}>Full result →</Link>}>
            <div className="grid grid-cols-3 gap-px bg-ink-800">
              {last.classification.slice(0, 3).map((c) => (
                <div key={c.driverId} className="bg-ink-900 p-3">
                  <div className="font-display text-3xl font-black text-slate-500">P{c.pos}</div>
                  <div className="flex items-center gap-2 font-semibold">
                    <TeamBar color={team(c.teamId)?.color ?? "#888"} />
                    <DriverLink d={drivers.get(c.driverId)} base={base} />
                  </div>
                  <div className="text-xs text-slate-500">from P{c.grid}</div>
                </div>
              ))}
            </div>
            <div className="px-4 py-2 text-xs text-slate-400 flex gap-4">
              <Link to={`${base}/race/${last.round}?watch=1`} className="text-race hover:underline">▶ Watch replay</Link>
              <span>{last.overtakes} passes</span>
              {last.sc > 0 && <span>{last.sc} safety car{last.sc > 1 ? "s" : ""}</span>}
              <span>{last.classification.filter((c) => !["Finished", "Lapped"].includes(c.status)).length} DNF</span>
            </div>
          </Section>
        )}
      </div>

      <div className="space-y-4">
        <Section title="Drivers" right={<Link className="text-xs text-slate-400 hover:text-white" to={`${base}/standings`}>All →</Link>}>
          <table className="tbl">
            <tbody>
              {ds.map((r, i) => (
                <tr key={r.driverId}>
                  <td className="w-6 num text-slate-500">{i + 1}</td>
                  <td>
                    <span className="flex items-center gap-2">
                      <TeamBar color={team(r.teamId)?.color ?? "#888"} />
                      <DriverLink d={drivers.get(r.driverId)} base={base} full />
                    </span>
                  </td>
                  <td className="num font-semibold">{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
        <Section title="Constructors">
          <table className="tbl">
            <tbody>
              {ts.map((r, i) => (
                <tr key={r.teamId}>
                  <td className="w-6 num text-slate-500">{i + 1}</td>
                  <td>
                    <span className="flex items-center gap-2">
                      <TeamBar color={team(r.teamId)?.color ?? "#888"} />
                      {team(r.teamId)?.name}
                    </span>
                  </td>
                  <td className="num font-semibold">{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>
    </div>
  );
}
