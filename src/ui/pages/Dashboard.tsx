import { Link, useNavigate, useParams } from "react-router-dom";
import { circuitOf, driverStandings, nextRound, teamStandings } from "../../engine/season/season";
import { useGame } from "../../state/game";
import { DriverLink, Section, TeamBar, useMaps } from "../components/bits";
import { HubButton, NextRace, Tile, TileGroup } from "../components/hub";
import { Hq } from "../manager/Hq";
import { CareerHq } from "../career/CareerHq";

export function Dashboard() {
  const { id = "" } = useParams();
  const base = `/g/${id}`;
  const nav = useNavigate();
  const { world, busy, simRounds, nextSeason } = useGame();
  if (!world) return null;
  if (world.mode === "career") return <CareerHq />;
  if (world.manager) return <Hq />;
  const { drivers, team } = useMaps(world);
  const next = nextRound(world);
  const circuit = next ? circuitOf(world, next.circuitId) : null;
  const ds = driverStandings(world).slice(0, 10);
  const ts = teamStandings(world);
  const last = world.results[world.results.length - 1];
  const champ = !next && ds[0];

  return (
    <div className="grid gap-8">
      {next && circuit ? (
        <NextRace world={world}>
          <Link className="btn-xl bg-race text-white hover:bg-red-500" to={`${base}/live`}>
            Drive it live ›
          </Link>
          <HubButton
            disabled={!!busy}
            onClick={async () => {
              await simRounds(1);
              nav(`${base}/race/${next.round}?watch=1`);
            }}
          >
            Watch the race
          </HubButton>
          <HubButton disabled={!!busy} onClick={() => simRounds(1)}>
            Sim race
          </HubButton>
          <HubButton disabled={!!busy} onClick={() => simRounds(99)}>
            Sim to season end
          </HubButton>
        </NextRace>
      ) : (
        <section className="grid gap-5 rounded-lg border border-ink-700 bg-ink-900 p-6 md:p-8">
          <div className="kicker">{world.season} season complete</div>
          {champ && (
            <h1 className="headline text-5xl sm:text-6xl">
              <DriverLink d={drivers.get(champ.driverId)} base={base} full /> is world champion
            </h1>
          )}
          <div className="text-lg text-slate-300">Constructors' champions: {team(ts[0]?.teamId)?.name}</div>
          <div>
            <button className="btn-xl bg-race text-white hover:bg-red-500" disabled={!!busy} onClick={() => nextSeason()}>
              Start the {world.season + 1} season ›
            </button>
          </div>
        </section>
      )}

      <TileGroup title="The season" cols={5}>
        <Tile to={`${base}/calendar`} title="Calendar" sub={`${world.results.length} of ${world.calendar.length} rounds run`} />
        <Tile to={`${base}/standings`} title="Standings" sub={ds[0] ? `${drivers.get(ds[0].driverId)?.last} leads on ${ds[0].points}` : "Before round 1"} />
        <Tile to={`${base}/drivers`} title="Drivers" sub="Every driver, every rating" />
        <Tile to={`${base}/teams`} title="Teams" sub="Cars and line-ups" />
        <Tile to={`${base}/juniors`} title="Juniors" sub="F2 and F3" />
      </TileGroup>

    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="grid gap-6 content-start">
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

      <div className="grid gap-6 content-start">
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
    </div>
  );
}
