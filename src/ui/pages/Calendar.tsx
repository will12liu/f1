// The season as a month calendar (NBA GM's): race weekends on their Sundays with the track, the winner or your
// result. Click a race day for what you can do with it: race it live, sim to it, or look back at it.
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { careerOf, meOf } from "../../engine/career/career";
import { isJuniorRound } from "../../engine/season/juniors";
import { circuitOf, nextRound } from "../../engine/season/season";
import { useGame } from "../../state/game";
import { TrackOutline, useMaps } from "../components/bits";
import { PageHead } from "../components/hub";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export function Calendar() {
  const { id = "" } = useParams();
  const base = `/g/${id}`;
  const nav = useNavigate();
  const world = useGame((s) => s.world)!;
  const { busy, simRounds } = useGame();
  const { drivers } = useMaps(world);
  const next = nextRound(world);
  const c = careerOf(world);
  const me = meOf(world);
  const junior = me && me.series !== "F1" ? (me.series as "F2" | "F3") : null;
  const months = [...new Set(world.calendar.map((r) => r.date.slice(0, 7)))];
  const [month, setMonth] = useState(() => (next ?? world.calendar[world.calendar.length - 1]).date.slice(0, 7));
  const [sel, setSel] = useState<number | null>(next?.round ?? null);
  const mi = months.indexOf(month);
  const first = new Date(`${month}-01T12:00:00Z`);
  const lead = (first.getUTCDay() + 6) % 7; // Monday first
  const daysIn = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const byDate = new Map(world.calendar.map((r) => [r.date, r]));
  const mine = (round: number) => c?.log.find((l) => l.season === world.season && l.round === round);
  const races = (round: number) => (junior ? isJuniorRound(world, junior, round) : !c || !!me?.teamId);
  const cells: (Date | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), i + 1, 12)))];
  while (cells.length % 7) cells.push(null);
  const r = sel ? world.calendar.find((x) => x.round === sel) : null;
  const rc = r ? circuitOf(world, r.circuitId) : null;
  const res = r ? world.results.find((x) => x.round === r.round) : null;
  const ahead = r && next ? r.round - next.round : -1;

  return (
    <div className="grid gap-6">
      <PageHead kicker={`${world.results.length} of ${world.calendar.length} rounds run`} title={`${world.season} calendar`} />
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-ghost !px-4 !py-2 !text-xl" disabled={mi <= 0} onClick={() => setMonth(months[mi - 1])} aria-label="Previous month">
          ‹
        </button>
        <h2 className="w-60 text-center font-display text-4xl font-black uppercase text-white">{first.toLocaleDateString(undefined, { month: "long", timeZone: "UTC" })}</h2>
        <button className="btn-ghost !px-4 !py-2 !text-xl" disabled={mi >= months.length - 1} onClick={() => setMonth(months[mi + 1])} aria-label="Next month">
          ›
        </button>
        <div className="ml-2 flex flex-wrap gap-1">
          {months.map((m) => (
            <button key={m} onClick={() => setMonth(m)} className={`rounded px-2.5 py-1 font-display text-lg font-bold uppercase ${m === month ? "bg-white text-ink-950" : "text-slate-400 hover:bg-ink-800"}`}>
              {new Date(`${m}-01T12:00:00Z`).toLocaleDateString(undefined, { month: "short", timeZone: "UTC" })}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {DAYS.map((d) => (
          <div key={d} className="pb-1 text-center text-sm font-bold uppercase tracking-widest text-slate-500">
            {d}
          </div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const round = byDate.get(ymd(d));
          if (!round)
            return (
              <div key={i} className="aspect-square rounded-md bg-ink-900/60 p-2 text-sm font-bold text-slate-600 sm:aspect-[4/3]">
                {d.getUTCDate()}
              </div>
            );
          const done = world.results.some((x) => x.round === round.round);
          const isNext = next?.round === round.round;
          const log = mine(round.round);
          const win = drivers.get(world.results.find((x) => x.round === round.round)?.winner ?? "");
          const here = races(round.round);
          return (
            <button
              key={i}
              onClick={() => setSel(round.round)}
              className={`relative flex aspect-square flex-col overflow-hidden rounded-md border-2 p-2 text-left sm:aspect-[4/3] ${sel === round.round ? "border-white" : isNext ? "border-race" : "border-ink-700"} ${done ? "bg-ink-850" : "bg-ink-800"} hover:border-slate-300`}
            >
              <div className="flex items-start justify-between gap-1">
                <span className="text-sm font-bold text-white">{d.getUTCDate()}</span>
                <span className="font-display text-sm font-bold uppercase text-slate-400">R{round.round}</span>
              </div>
              <TrackOutline id={round.circuitId} className="pointer-events-none absolute inset-x-3 bottom-7 top-6" stroke={done ? "#475569" : "#cbd5e1"} />
              <span className="relative mt-auto truncate font-display text-base font-extrabold uppercase leading-none text-white">{circuitOf(world, round.circuitId).gp.replace(" GP", "")}</span>
              {log ? (
                <span className={`absolute inset-x-0 bottom-0 py-0.5 text-center font-display text-base font-black ${log.pos <= 3 && (log.status === "Finished" || log.status === "Lapped") ? "bg-emerald-500 text-ink-950" : log.status === "Finished" || log.status === "Lapped" ? "bg-ink-600 text-white" : "bg-rose-600 text-white"}`}>
                  {log.status === "Finished" || log.status === "Lapped" ? `P${log.pos}` : "DNF"}
                </span>
              ) : done && win && !c ? (
                <span className="absolute inset-x-0 bottom-0 bg-ink-600 py-0.5 text-center text-sm font-bold text-white">{win.last}</span>
              ) : c && !here ? (
                <span className="absolute inset-x-0 bottom-0 bg-ink-900 py-0.5 text-center text-xs font-bold uppercase text-slate-500">No {junior ?? "race"}</span>
              ) : isNext ? (
                <span className="absolute inset-x-0 bottom-0 bg-race py-0.5 text-center text-xs font-black uppercase text-white">Next</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {r && rc && (
        <section className="flex flex-wrap items-center gap-6 rounded-lg border border-ink-700 bg-ink-900 p-6">
          <TrackOutline id={rc.id} className="h-28 w-44" />
          <div className="min-w-0 flex-1">
            <div className="kicker">
              Round {r.round} · {new Date(r.date + "T12:00:00Z").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}
            </div>
            <div className="headline mt-1 text-5xl">{rc.gp}</div>
            <div className="mt-1 text-lg text-slate-400">
              {rc.name}
              {mine(r.round) ? ` · you: ${mine(r.round)!.status === "Finished" || mine(r.round)!.status === "Lapped" ? `P${mine(r.round)!.pos} from P${mine(r.round)!.grid}` : "DNF"}` : ""}
              {res && drivers.get(res.winner) ? ` · ${drivers.get(res.winner)!.last} won` : ""}
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {res && (
              <Link to={`${base}/race/${r.round}`} className="btn-xl bg-ink-800 text-white hover:bg-ink-700">
                View race ›
              </Link>
            )}
            {ahead === 0 && races(r.round) && (c || world.manager) && (
              <Link to={`${base}/live`} className="btn-xl bg-race text-white hover:bg-red-500">
                Race it live ›
              </Link>
            )}
            {ahead >= 0 && (
              <button
                className="btn-xl bg-ink-800 text-white hover:bg-ink-700"
                disabled={!!busy || !!c?.event}
                title={c?.event ? "Answer your message first" : undefined}
                onClick={async () => {
                  await simRounds(ahead + 1);
                  if (!junior) nav(`${base}/race/${r.round}`);
                }}
              >
                {ahead === 0 ? "Sim it" : `Sim to here (${ahead + 1} rounds)`}
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
