// Drive the next round live: pick a car, then the race runs lap by lap as you watch, with the pit wall for
// your car. Saving replays the race in the worker from the same input and your commands, so it comes out
// exactly as you saw it.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { createRace, type RaceRunner } from "../../engine/race/race";
import type { PreparedRound } from "../../engine/season/season";
import type { Replay } from "../../engine/types";
import { useGame } from "../../state/game";
import { PitWall } from "../race/PitWall";
import { RaceViewer, type LiveSource } from "../race/RaceViewer";
import { TeamBar, useMaps } from "../components/bits";

const PICK_KEY = "paddock.liveDriver";
const readPick = () => {
  try {
    return localStorage.getItem(PICK_KEY);
  } catch {
    return null;
  }
};
const savePick = (id: string) => {
  try {
    localStorage.setItem(PICK_KEY, id);
  } catch {
    /* private mode */
  }
};

function snapshot(r: RaceRunner, prep: PreparedRound, season: number): Replay {
  const s = r.state;
  return {
    season,
    round: prep.round,
    circuitId: prep.input.circuit.id,
    laps: s.laps,
    cars: prep.input.entries.map((e) => ({ driverId: e.driverId, teamId: e.teamId })),
    grid: prep.input.entries.map((e) => e.driverId),
    lapEnd: s.lapEnd.map((a) => a.slice()),
    events: s.events.slice(),
    flags: s.flagLog.filter((f) => f.flag !== "green") as Replay["flags"],
    stints: s.cars.map((c) => c.stints.map((x) => ({ ...x }))),
  };
}

export function LiveRace() {
  const { id = "" } = useParams();
  const base = `/g/${id}`;
  const nav = useNavigate();
  const { world, busy, prepareLive, commitLive } = useGame();
  const [prep, setPrep] = useState<PreparedRound | null | undefined>(undefined);
  const [pick, setPick] = useState<string | null>(readPick);
  const [runner, setRunner] = useState<RaceRunner | null>(null);
  const [replay, setReplay] = useState<Replay | null>(null);
  const runnerRef = useRef<RaceRunner | null>(null);

  useEffect(() => {
    let on = true;
    prepareLive().then((p) => on && setPrep(p));
    return () => {
      on = false;
    };
  }, [prepareLive, world?.results.length]);

  const { drivers, team } = useMaps(world!);
  const entries = prep?.input.entries ?? [];
  const chosen = entries.findIndex((e) => e.driverId === pick);
  const season = world?.season ?? 0;

  const start = () => {
    if (!prep || chosen < 0) return;
    const r = createRace(prep.input);
    runnerRef.current = r;
    setRunner(r);
    setReplay(snapshot(r, prep, season));
  };

  const refresh = useCallback(() => {
    const r = runnerRef.current;
    if (r && prep) setReplay(snapshot(r, prep, season));
  }, [prep, season]);

  const live: LiveSource | undefined = useMemo(() => {
    if (!runner) return undefined;
    const leadEnd = () => {
      const s = runner.state;
      return s.order.length ? s.cars[s.order[0]].cum : Infinity;
    };
    return {
      advance(t) {
        let stepped = false;
        // stay one lap ahead of what's on screen, so a dial change counts from the next lap
        while (!runner.done() && leadEnd() - 1 < t) {
          runner.step();
          stepped = true;
        }
        if (stepped) refresh();
        return runner.done() ? Infinity : leadEnd() - 0.5;
      },
      finish() {
        while (!runner.done()) runner.step();
        refresh();
      },
    };
  }, [runner, refresh]);

  if (!world) return null;
  if (prep === undefined) return <div className="text-slate-500">Qualifying…</div>;
  if (prep === null)
    return (
      <div className="text-slate-400">
        No race left this season. <Link className="text-white underline" to={base}>Back</Link>
      </div>
    );

  const circuit = prep.input.circuit;
  if (!runner || !replay) {
    return (
      <div className="grid gap-4 max-w-3xl">
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-400">Round {prep.round} · drive it live</div>
          <h1 className="font-display text-3xl font-black uppercase leading-none">{circuit.gp}</h1>
          <p className="mt-2 text-sm text-slate-400">Pick the car you run from the pit wall. Everyone else races on their own. Dial changes count from the next lap.</p>
        </div>
        <div className="panel overflow-hidden">
          <div className="px-3 py-2 border-b border-ink-800 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Grid</div>
          <ol className="grid sm:grid-cols-2 text-sm">
            {entries.map((e, i) => {
              const d = drivers.get(e.driverId);
              const sel = e.driverId === pick;
              return (
                <li key={e.driverId}>
                  <button
                    onClick={() => {
                      setPick(e.driverId);
                      savePick(e.driverId);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left border-b border-ink-800 ${sel ? "bg-ink-700 text-white" : "hover:bg-ink-800"}`}
                  >
                    <span className="w-6 text-right font-mono text-xs text-slate-400">{i + 1}</span>
                    <TeamBar color={team(e.teamId)?.color ?? "#888"} />
                    <span className="font-semibold">{d ? `${d.first} ${d.last}` : e.driverId}</span>
                    <span className="ml-auto text-xs text-slate-500">{team(e.teamId)?.name}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
        <div className="flex gap-2">
          <button className="btn-primary" disabled={chosen < 0} onClick={start}>
            Start the race{chosen >= 0 ? ` as ${drivers.get(pick!)?.last}` : ""}
          </button>
          <Link className="btn-ghost" to={base}>
            Back
          </Link>
        </div>
      </div>
    );
  }

  const finished = runner.done();
  const code = drivers.get(entries[chosen].driverId)?.code ?? "";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-400">Round {prep.round} · live</div>
          <h1 className="font-display text-3xl font-black uppercase leading-none">{circuit.gp}</h1>
        </div>
        <div className="ml-auto flex gap-2">
          {finished && (
            <button
              className="btn-primary"
              disabled={!!busy}
              onClick={async () => {
                const round = await commitLive(runner.state.commands);
                if (round) nav(`${base}/race/${round}`);
              }}
            >
              Save result
            </button>
          )}
          <Link className="btn-ghost" to={base}>
            {finished ? "Leave without saving" : "Abandon"}
          </Link>
        </div>
      </div>
      <RaceViewer world={world} replay={replay} live={live} follow0={chosen} side={<PitWall runner={runner} idx={chosen} code={code} />} />
    </div>
  );
}
