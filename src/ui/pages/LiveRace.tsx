// Drive the next round live: pick a car, then the race runs lap by lap as you watch, with the pit wall for
// your car. Saving replays the race in the worker from the same input and your commands, so it comes out
// exactly as you saw it.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { createRace, type RaceRunner } from "../../engine/race/race";
import type { RaceInput } from "../../engine/race/race";
import { careerOf, DIFFICULTY } from "../../engine/career/career";
import { Weekend } from "../race/Weekend";
import type { CarPlan, WeekendPlan } from "../../engine/race/weekend";
import { circuitOf, nextRound, roundSeed } from "../../engine/season/season";
import { hashString } from "../../engine/rng";
import { teamStaff } from "../../engine/manager/manager";

/** What the live page races: the F1 race, or the player's junior race in career mode. */
type PreparedRound = { round: number; input: RaceInput; series?: "F2" | "F3" };
import type { Replay } from "../../engine/types";
import { useGame } from "../../state/game";
import { PitWall } from "../race/PitWall";
import { MomentCard } from "../race/MomentCard";
import type { PendingMoment } from "../../engine/race/moments";
import { RaceViewer, type LiveSource } from "../race/RaceViewer";
import { TeamBar, useMaps } from "../components/bits";

const PICK_KEY = "paddock.liveDriver";
const MOMENTS_KEY = "paddock.moments";
type MomentMode = "off" | "key" | "all";
const readMode = (): MomentMode => {
  try {
    const v = localStorage.getItem(MOMENTS_KEY);
    return v === "off" || v === "all" ? v : "key";
  } catch {
    return "key";
  }
};
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
  const { world, busy, prepareLive, prepareJunior, commitLive } = useGame();
  const career = world ? careerOf(world) : null;
  const meId = career?.driverId;
  const meSeries = world?.drivers.find((d) => d.id === meId)?.series;
  const [prep, setPrep] = useState<PreparedRound | null | undefined>(undefined);
  const [pick, setPick] = useState<string | null>(readPick);
  const [runner, setRunner] = useState<RaceRunner | null>(null);
  const [replay, setReplay] = useState<Replay | null>(null);
  const runnerRef = useRef<RaceRunner | null>(null);

  // career and team-principal: practice and qualifying calls first; sandbox goes straight to the grid
  const planned = !!career || !!(world?.manager && !world.manager.fired);
  const [plan, setPlan] = useState<WeekendPlan | null>(null);
  const planIds = career ? [meId!] : world?.manager ? (world.teams.find((t) => t.id === world.manager!.teamId)?.drivers ?? []) : [];
  const runQuali = (p: CarPlan) => setPlan(Object.fromEntries(planIds.map((id) => [id, p])));
  useEffect(() => {
    if (planned && !plan) {
      setPrep(undefined);
      return;
    }
    let on = true;
    const junior = career && (meSeries === "F2" || meSeries === "F3");
    (junior ? prepareJunior(plan ?? undefined) : prepareLive(plan ?? undefined)).then((p) => on && setPrep(p));
    return () => {
      on = false;
    };
  }, [prepareLive, prepareJunior, world?.results.length, plan]); // eslint-disable-line react-hooks/exhaustive-deps

  const { drivers, team } = useMaps(world!);
  const entries = prep?.input.entries ?? [];
  // team principal: you run both of your cars; sandbox: pick any car
  const myTeamId = world?.manager && !world.manager.fired ? world.manager.teamId : null;
  const mine = myTeamId ? entries.map((e, i) => (e.teamId === myTeamId ? i : -1)).filter((i) => i >= 0) : [];
  const [tab, setTab] = useState(0);
  const [mode, setMode] = useState<MomentMode>(readMode);
  const [pend, setPend] = useState<PendingMoment | null>(null);
  const focus = career ? [entries.findIndex((e) => e.driverId === meId)].filter((i) => i >= 0) : myTeamId ? mine : [entries.findIndex((e) => e.driverId === pick)].filter((i) => i >= 0);
  const chosen = career ? entries.findIndex((e) => e.driverId === meId) : myTeamId ? (mine[0] ?? -1) : entries.findIndex((e) => e.driverId === pick);
  const season = world?.season ?? 0;

  const start = () => {
    if (!prep || chosen < 0) return;
    try {
      localStorage.setItem(MOMENTS_KEY, mode);
    } catch {
      /* private mode */
    }
    const r = createRace({ ...prep.input, focus, moments: mode, reads: world?.reads, duelEdge: career ? DIFFICULTY[career.difficulty].duel : undefined });
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
        // stop at a key moment: the picture freezes until the player answers
        while (!runner.done() && !runner.pending() && leadEnd() - 1 < t) {
          runner.step();
          stepped = true;
        }
        const m = runner.pending();
        setPend((p) => (p?.id === m?.id ? p : m));
        if (stepped) refresh();
        return runner.done() ? Infinity : leadEnd() - 0.5;
      },
      finish() {
        while (!runner.done()) {
          runner.step();
          if (runner.pending()) runner.choose("auto");
        }
        setPend(null);
        refresh();
      },
    };
  }, [runner, refresh]);

  if (!world) return null;
  if (planned && !plan && world) {
    const r = nextRound(world);
    if (!r) return <div className="text-slate-400">No race left this season.</div>;
    const circuit = circuitOf(world, r.circuitId);
    const junior = career && (meSeries === "F2" || meSeries === "F3");
    const seed = junior ? hashString(`${world.seed}:${world.season}:${r.round}:${meSeries}`) : roundSeed(world, r.round);
    const engineer = career ? 40 + (career.rel?.engineer ?? 50) * 0.4 : (teamStaff(world, world.manager!.teamId).engineer?.rating ?? 50);
    return (
      <div className="grid gap-4 max-w-3xl">
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-400">Round {r.round} · {junior ? `${meSeries} weekend` : "race weekend"}</div>
          <h1 className="font-display text-3xl font-black uppercase leading-none">{circuit.gp}</h1>
        </div>
        <Weekend seed={seed} circuit={circuit} driverId={planIds[0] ?? ""} engineer={engineer} onRun={runQuali} busy={!!busy} />
        <div>
          <Link className="btn-ghost" to={base}>
            Back
          </Link>
        </div>
      </div>
    );
  }
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
          <div className="text-xs uppercase tracking-wider text-slate-400">Round {prep.round} · {prep.series ? `${prep.series} feature race` : "drive it live"}</div>
          <h1 className="font-display text-3xl font-black uppercase leading-none">{circuit.gp}</h1>
          <p className="mt-2 text-sm text-slate-400">
            {career ? "You drive. Set your dials, call your stops, and fight when it's close." : myTeamId ? `You run both ${team(myTeamId)?.name} cars from the pit wall: dials, stops and team orders.` : "Pick the car you run from the pit wall."} Everyone else races on their own. Dial changes count from the next lap.
          </p>
        </div>
        <div className="panel overflow-hidden">
          <div className="px-3 py-2 border-b border-ink-800 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Grid</div>
          <ol className="grid sm:grid-cols-2 text-sm">
            {entries.map((e, i) => {
              const d = drivers.get(e.driverId);
              const sel = career ? e.driverId === meId : myTeamId ? e.teamId === myTeamId : e.driverId === pick;
              return (
                <li key={e.driverId}>
                  <button
                    disabled={!!myTeamId || !!career}
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
        <div className="grid gap-1">
          <div className="text-xs text-slate-400">Key moments (duels within a second, strategy calls)</div>
          <div className="flex gap-1">
            {(
              [
                ["off", "Off"],
                ["key", "Key moments"],
                ["all", "Every fight"],
              ] as const
            ).map(([k, label]) => (
              <button key={k} onClick={() => setMode(k)} className={`btn !px-2.5 !py-1 ${mode === k ? "bg-race text-white" : "bg-ink-800 text-slate-300 hover:bg-ink-700"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn-primary" disabled={chosen < 0} onClick={start}>
            Start the race{myTeamId || career ? "" : chosen >= 0 ? ` as ${drivers.get(pick!)?.last}` : ""}
          </button>
          <Link className="btn-ghost" to={base}>
            Back
          </Link>
        </div>
      </div>
    );
  }

  const finished = runner.done();
  const codeOf = (i: number) => drivers.get(entries[i].driverId)?.code ?? "";
  const code = codeOf(chosen);
  const wall =
    mine.length === 2 ? (
      <div className="grid gap-2">
        <div className="flex gap-1">
          {mine.map((i, k) => (
            <button key={i} onClick={() => setTab(k)} className={`btn flex-1 !py-1 ${tab === k ? "bg-race text-white" : "bg-ink-800 text-slate-300 hover:bg-ink-700"}`}>
              {codeOf(i)}
            </button>
          ))}
        </div>
        {mine.map((i, k) => (
          <div key={i} className={tab === k ? "" : "hidden"}>
            <PitWall runner={runner} idx={i} code={codeOf(i)} mate={{ idx: mine[1 - k], code: codeOf(mine[1 - k]) }} />
          </div>
        ))}
      </div>
    ) : (
      <PitWall runner={runner} idx={chosen} code={code} />
    );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-400">Round {prep.round} · {prep.series ? `${prep.series} feature race · ` : ""}live</div>
          <h1 className="font-display text-3xl font-black uppercase leading-none">{circuit.gp}</h1>
        </div>
        <div className="ml-auto flex gap-2">
          {finished && (
            <button
              className="btn-primary"
              disabled={!!busy}
              onClick={async () => {
                const live = { choices: runner.state.choices, focus: runner.input.focus ?? [], moments: runner.input.moments ?? "off" };
                if (prep.series) {
                  await commitLive([], undefined, { series: prep.series, commands: runner.state.commands, ...live, plan: plan ?? undefined });
                  nav(base);
                } else {
                  const round = await commitLive(runner.state.commands, live, undefined, plan ?? undefined);
                  if (round) nav(`${base}/race/${round}`);
                }
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
      <RaceViewer
        world={world}
        replay={replay}
        live={live}
        follow0={mine.length === 2 ? mine[tab] : chosen}
        side={wall}
        marks={pend ? { a: pend.car, b: pend.vs, role: pend.kind === "defend" ? "defend" : "attack" } : null}
        overlay={
          pend ? (
            <MomentCard
              m={pend}
              who={codeOf(pend.car)}
              onPick={(opt) => {
                runner.choose(opt);
                runner.step();
                refresh();
                setPend(runner.pending());
              }}
            />
          ) : null
        }
      />
    </div>
  );
}
