// The season as big round cards: the track, the date, and the winner once it's run. The next round stands out.
import { Link, useParams } from "react-router-dom";
import { circuitOf, nextRound } from "../../engine/season/season";
import { useGame } from "../../state/game";
import { TeamBar, TrackOutline, useMaps } from "../components/bits";
import { PageHead } from "../components/hub";

export function Calendar() {
  const { id = "" } = useParams();
  const base = `/g/${id}`;
  const world = useGame((s) => s.world)!;
  const { drivers, team } = useMaps(world);
  const next = nextRound(world);
  return (
    <div className="grid gap-8">
      <PageHead kicker={`${world.results.length} of ${world.calendar.length} rounds run`} title={`${world.season} calendar`} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {world.calendar.map((r) => {
          const c = circuitOf(world, r.circuitId);
          const res = world.results.find((x) => x.round === r.round);
          const w = res && drivers.get(res.winner);
          const isNext = next?.round === r.round;
          const body = (
            <>
              <div className="flex items-start justify-between gap-2">
                <span className={`font-display text-4xl font-black leading-none ${isNext ? "text-race" : res ? "text-slate-600" : "text-slate-400"}`}>{String(r.round).padStart(2, "0")}</span>
                <span className="text-sm text-slate-400">{new Date(r.date + "T12:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
              </div>
              <TrackOutline id={c.id} className="my-3 h-24 w-full" stroke={res ? "#475569" : "#cbd5e1"} />
              <div className="font-display text-2xl font-extrabold uppercase leading-none text-white">{c.gp}</div>
              <div className="mt-1 truncate text-sm text-slate-500">{c.name}</div>
              <div className="mt-3 flex min-h-6 items-center gap-2 text-base">
                {w ? (
                  <>
                    <TeamBar color={team(w.teamId)?.color ?? "#888"} />
                    <span className="font-semibold text-slate-200">{w.last}</span>
                    <span className="text-slate-500">won</span>
                  </>
                ) : isNext ? (
                  <span className="font-display text-lg font-bold uppercase text-race">Next race</span>
                ) : null}
              </div>
            </>
          );
          const cls = `flex flex-col rounded-lg border-2 bg-ink-900 p-5 ${isNext ? "border-race" : "border-ink-700"}`;
          return res ? (
            <Link key={r.round} to={`${base}/race/${r.round}`} className={`${cls} hover:border-slate-300 hover:bg-ink-800`}>
              {body}
            </Link>
          ) : (
            <div key={r.round} className={cls}>
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}
