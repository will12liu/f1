// Team HQ: the team principal's home page. Next race, the money, the cost cap, the board, R&D in
// progress and the latest mail. After the sack: the job offers.
import { Link, useNavigate, useParams } from "react-router-dom";
import { FINANCE } from "../../../data/manual/manager";
import { capForecast, carRank, myTeam } from "../../engine/manager/manager";
import { fmtM } from "../../engine/manager/state";
import { circuitOf, nextRound, teamStandings } from "../../engine/season/season";
import { useGame } from "../../state/game";
import { Section, TeamBar, TrackOutline, useMaps } from "../components/bits";
import { Answer, AREA_LABEL, Meter, Stat, useAct } from "./kit";

export function Hq() {
  const { id = "" } = useParams();
  const base = `/g/${id}`;
  const nav = useNavigate();
  const { world, busy, simRounds, nextSeason } = useGame();
  const { run, answer } = useAct();
  if (!world?.manager) return null;
  const m = world.manager;
  const { team, drivers } = useMaps(world);
  const me = myTeam(world)!;

  if (m.fired) {
    return (
      <div className="grid gap-4 max-w-2xl">
        <Section title="Sacked">
          <div className="p-4 grid gap-3 text-sm">
            <p className="text-slate-300">The {me.name} board let you go after the {m.fired.season} season. {m.fired.offers.length ? "These teams want to talk:" : "Nobody is calling yet. Any team will take a meeting:"}</p>
            <div className="grid gap-2">
              {(m.fired.offers.length ? m.fired.offers : world.teams.filter((t) => t.series === "F1" && t.id !== me.id).map((t) => t.id)).map((tid) => (
                <button key={tid} className="btn-ghost justify-start" onClick={async () => (await run("takeJob", tid)).ok && nav(base)}>
                  <TeamBar color={team(tid)?.color ?? "#888"} />
                  Take the {team(tid)?.name} job
                </button>
              ))}
            </div>
            <Answer a={answer} />
          </div>
        </Section>
      </div>
    );
  }

  const next = nextRound(world);
  const circuit = next ? circuitOf(world, next.circuitId) : null;
  const cap = capForecast(world, m);
  const pos = teamStandings(world).findIndex((x) => x.teamId === m.teamId) + 1;
  const pts = teamStandings(world).find((x) => x.teamId === m.teamId)?.points ?? 0;
  const unread = m.inbox.filter((x) => !x.read).length;
  const conf = m.board.confidence;
  const ours = me.drivers.map((d) => drivers.get(d)).filter(Boolean);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <div className="grid gap-4 content-start">
        <section className="panel p-5 grid sm:grid-cols-[1fr_180px] gap-4 items-center">
          <div className="grid gap-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-400">
              <TeamBar color={me.color} />
              {me.name} · team principal {m.name}
            </div>
            {next && circuit ? (
              <>
                <h1 className="font-display text-4xl font-black uppercase leading-none">{circuit.gp}</h1>
                <div className="text-sm text-slate-400">
                  Round {next.round} of {world.calendar.length} · {circuit.laps} laps · {ours.map((d) => d!.last).join(" and ")}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Link className="btn-primary" to={`${base}/live`}>
                    Run the race from the pit wall
                  </Link>
                  <button
                    className="btn-ghost"
                    disabled={!!busy}
                    onClick={async () => {
                      await simRounds(1);
                      nav(`${base}/race/${next.round}`);
                    }}
                  >
                    Sim the weekend
                  </button>
                </div>
              </>
            ) : (
              <>
                <h1 className="font-display text-4xl font-black uppercase leading-none">Season over</h1>
                <div className="text-sm text-slate-400">P{pos} in the constructors' championship with {pts} points.</div>
                <div>
                  <button className="btn-primary" disabled={!!busy} onClick={() => nextSeason()}>
                    Go into the winter
                  </button>
                </div>
              </>
            )}
          </div>
          {circuit && <TrackOutline id={circuit.id} className="w-full h-36" />}
        </section>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat
            label="Constructors"
            value={world.results.length ? `P${pos}` : "-"}
            sub={`${pts} pts · target P${m.board.target}`}
            tone={!world.results.length ? undefined : pos <= m.board.target ? "good" : pos > m.board.target + 1 ? "bad" : undefined}
          />
          <Stat label="Bank" value={fmtM(m.cash)} tone={m.cash < 0 ? "bad" : undefined} sub={m.cash < 0 ? "overdrawn" : undefined} />
          <Stat label="Car" value={`#${carRank(world, m.teamId)}`} sub="fastest on paper" />
          <Stat label="Board" value={`${Math.round(conf)}`} sub={conf >= 60 ? "happy" : conf >= 35 ? "watching" : "losing patience"} tone={conf >= 60 ? "good" : conf < 35 ? "bad" : undefined} />
        </div>

        <Section title="Cost cap" right={<Link to={`${base}/finance`} className="text-xs text-slate-400 hover:text-white">Finance</Link>}>
          <div className="p-4 grid gap-2 text-sm">
            <Meter value={(cap.spent + cap.committed) / (FINANCE.costCap * 1.1)} mark={1 / 1.1} color={cap.room < 0 ? "#f43f5e" : "#e10600"} />
            <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-400">
              <span>Spent {fmtM(cap.spent)} · running costs to come {fmtM(cap.committed)}</span>
              <span className={cap.room < 0 ? "text-rose-300" : "text-slate-200"}>{cap.room >= 0 ? `${fmtM(cap.room)} left for R&D` : `${fmtM(-cap.room)} over the cap`}</span>
            </div>
          </div>
        </Section>

        <Section title="Development" right={<Link to={`${base}/rnd`} className="text-xs text-slate-400 hover:text-white">Car and R&D</Link>}>
          <div className="divide-y divide-ink-800 text-sm">
            {m.projects.length === 0 && <div className="p-4 text-slate-500">Nothing in the factory. Start a project.</div>}
            {m.projects.map((p) => (
              <div key={p.id} className="grid grid-cols-[1fr_120px] items-center gap-3 px-4 py-2">
                <div>
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-xs text-slate-400">
                    {AREA_LABEL[p.area]} · {p.target === "next" ? "next year's car" : "this year"} · {p.roundsLeft} race{p.roundsLeft > 1 ? "s" : ""} to go
                  </div>
                </div>
                <Meter value={1 - p.roundsLeft / p.rounds} color="#38bdf8" />
              </div>
            ))}
          </div>
        </Section>
      </div>

      <div className="grid gap-4 content-start">
        <Section title={`Inbox${unread ? ` (${unread})` : ""}`} right={<Link to={`${base}/inbox`} className="text-xs text-slate-400 hover:text-white">All mail</Link>}>
          <div className="divide-y divide-ink-800">
            {m.inbox.slice(0, 6).map((x) => (
              <Link key={x.id} to={`${base}/inbox#${x.id}`} className="block px-4 py-2.5 hover:bg-ink-800">
                <div className="flex items-baseline gap-2">
                  {!x.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-race" />}
                  <span className={`text-sm ${x.read ? "text-slate-300" : "font-semibold text-white"}`}>{x.subject}</span>
                </div>
                <div className="text-xs text-slate-500">
                  {x.from} · {x.round ? `after round ${x.round}` : "pre-season"}
                </div>
              </Link>
            ))}
          </div>
        </Section>
        <Section title="Partners">
          <div className="p-4 grid gap-1 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Signed</span>
              <span>{m.sponsors.length} · {fmtM(m.sponsors.reduce((s, x) => s + x.perSeason, 0))} a season</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Offers on the table</span>
              <Link to={`${base}/partners`} className="text-white hover:underline">{m.offers.length}</Link>
            </div>
          </div>
        </Section>
        <Answer a={answer} />
      </div>
    </div>
  );
}
