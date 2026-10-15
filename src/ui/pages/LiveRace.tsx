// Drive the next round live: pick a car, then the race runs lap by lap as you watch, with the pit wall for
// your car. Saving replays the race in the worker from the same input and your commands, so it comes out
// exactly as you saw it.
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { createRace, type RaceRunner } from "../../engine/race/race";
import type { RaceInput } from "../../engine/race/race";
import { careerOf, DIFFICULTY } from "../../engine/career/career";
import { Weekend } from "../race/Weekend";
import type { CarPlan, WeekendPlan } from "../../engine/race/weekend";
import { circuitOf, nextRound, roundSeed } from "../../engine/season/season";
import { hashString } from "../../engine/rng";
import { isJuniorRound } from "../../engine/season/juniors";
import { teamStaff } from "../../engine/manager/manager";

/** What the live page races: the F1 race, or the player's junior race in career mode. */
type PreparedRound = { round: number; input: RaceInput; series?: "F2" | "F3" };
import type { Replay } from "../../engine/types";
import { useGame } from "../../state/game";
import { PitWall } from "../race/PitWall";
import { MomentCard } from "../race/MomentCard";
import { MomentsViewPicker, readMomentsView, type MomentsView } from "../race/MomentsView";
import { verdict, verdictColor } from "../race/BrakeBar";
import { Reaction } from "../career/SimGames";
import { tendencies, type PendingMoment } from "../../engine/race/moments";
import { gripOf } from "../race/drive";

import { RaceViewer, type LiveSource } from "../race/RaceViewer";
import { TeamBar, TrackOutline, useMaps } from "../components/bits";

const Start3D = lazy(() => import("../race/cockpit/Start3D")); // three.js only when the start opens in 3D
const PICK_KEY = "paddock.liveDriver";
const topHabit = (w: Record<string, number>) => Object.entries(w).sort((a, b) => b[1] - a[1])[0]?.[0];
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
  const [view, setView] = useState<MomentsView>(readMomentsView);
  const [flatStart, setFlatStart] = useState(false); // the 3D start's "Simple view"
  const [pend, setPend] = useState<PendingMoment | null>(null);
  const [zoomAt, setZoomAt] = useState<{ t: number; cars: number[]; until?: number } | null>(null); // the last moment: 1x + zoom
  const [banner, setBanner] = useState<{ t: number; node: ReactNode } | null>(null); // how it went
  const focus = career ? [entries.findIndex((e) => e.driverId === meId)].filter((i) => i >= 0) : myTeamId ? mine : [entries.findIndex((e) => e.driverId === pick)].filter((i) => i >= 0);
  const chosen = career ? entries.findIndex((e) => e.driverId === meId) : myTeamId ? (mine[0] ?? -1) : entries.findIndex((e) => e.driverId === pick);
  const season = world?.season ?? 0;

  const [startGame, setStartGame] = useState(false);
  const start = (launch?: Record<number, number>) => {
    if (!prep || chosen < 0) return;
    try {
      localStorage.setItem(MOMENTS_KEY, mode);
    } catch {
      /* private mode */
    }
    const r = createRace({ ...prep.input, focus, moments: mode, reads: world?.reads, duelEdge: career ? DIFFICULTY[career.difficulty].duel : undefined, launch });
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
        if (m) setZoomAt((f) => (f?.t === m.t ? f : { t: m.t, cars: m.vs !== undefined ? [m.car, m.vs] : [m.car] }));
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
    if (career && (meSeries === "F2" || meSeries === "F3") && !isJuniorRound(world, meSeries, r.round))
      return (
        <div className="text-lg text-slate-400">
          No {meSeries} race this weekend. <Link className="text-white underline" to={base}>Back</Link>
        </div>
      );
    const circuit = circuitOf(world, r.circuitId);
    const junior = career && (meSeries === "F2" || meSeries === "F3");
    const seed = junior ? hashString(`${world.seed}:${world.season}:${r.round}:${meSeries}`) : roundSeed(world, r.round);
    const engineer = career ? 40 + (career.rel?.engineer ?? 50) * 0.4 : (teamStaff(world, world.manager!.teamId).engineer?.rating ?? 50);
    return (
      <div className="mx-auto grid max-w-6xl gap-6">
        <div className="flex flex-wrap items-center gap-6">
          <div className="min-w-0 flex-1">
            <Link className="text-base text-slate-400 hover:text-white" to={base}>
              ‹ Back
            </Link>
            <div className="kicker mt-4">
              Round {r.round} · {junior ? `${meSeries} weekend` : "race weekend"} · {circuit.name}
            </div>
            <h1 className="headline mt-2 text-6xl sm:text-7xl">{circuit.gp}</h1>
          </div>
          <TrackOutline id={circuit.id} className="h-36 w-56" stroke="#e2e8f0" />
        </div>
        <Weekend
          seed={seed}
          circuit={circuit}
          driverId={planIds[0] ?? ""}
          engineer={engineer}
          onRun={runQuali}
          busy={!!busy}
          ratings={drivers.get(planIds[0] ?? "")?.ratings}
          color={world.teams.find((t) => t.drivers.includes(planIds[0] ?? ""))?.color}
        />
      </div>
    );
  }
  if (prep === undefined) return <div className="grid h-96 place-items-center font-display text-4xl font-black uppercase text-slate-500">Qualifying…</div>;
  if (prep === null)
    return (
      <div className="text-slate-400">
        No race left this season. <Link className="text-white underline" to={base}>Back</Link>
      </div>
    );

  const circuit = prep.input.circuit;
  if (!runner || !replay) {
    return (
      <div className="mx-auto grid max-w-6xl gap-6">
        <div>
          <Link className="text-base text-slate-400 hover:text-white" to={base}>
            ‹ Back
          </Link>
          <div className="kicker mt-4">Round {prep.round} · {prep.series ? `${prep.series} feature race` : "drive it live"}</div>
          <h1 className="headline mt-2 text-6xl sm:text-7xl">{circuit.gp}</h1>
          <p className="mt-3 max-w-3xl text-lg text-slate-400">
            {career ? "You drive. Set your dials, call your stops, and fight when it's close." : myTeamId ? `You run both ${team(myTeamId)?.name} cars from the pit wall: dials, stops and team orders.` : "Pick the car you run from the pit wall."} Everyone else races on their own. Dial changes count from the next lap.
          </p>
        </div>
        <div className="overflow-hidden rounded-lg border border-ink-700 bg-ink-900">
          <div className="border-b border-ink-700 px-5 py-3 font-display text-2xl font-extrabold uppercase text-white">Starting grid</div>
          <ol className="grid text-base sm:grid-cols-2">
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
                    className={`flex w-full items-center gap-3 border-b border-ink-800 px-5 py-2.5 text-left ${sel ? "bg-race/20 text-white" : "hover:bg-ink-800"}`}
                  >
                    <span className="w-8 text-right font-display text-xl font-black text-slate-500">{i + 1}</span>
                    <TeamBar color={team(e.teamId)?.color ?? "#888"} />
                    <span className="font-semibold">{d ? `${d.first} ${d.last}` : e.driverId}</span>
                    <span className="ml-auto text-sm text-slate-500">{team(e.teamId)?.name}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
        <div className="grid gap-3 rounded-lg border border-ink-700 bg-ink-900 p-6">
          <div className="font-display text-2xl font-extrabold uppercase text-white">Key moments</div>
          <div className="text-base text-slate-400">The race stops for duels within a second and for strategy calls.</div>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["off", "Off"],
                ["key", "Key moments"],
                ["all", "Every fight"],
              ] as const
            ).map(([k, label]) => (
              <button key={k} onClick={() => setMode(k)} className={`rounded-lg px-4 py-4 font-display text-xl font-bold uppercase ${mode === k ? "bg-race text-white" : "bg-ink-800 text-slate-300 hover:bg-ink-700"}`}>
                {label}
              </button>
            ))}
          </div>
          {mode !== "off" && (
            <>
              <div className="mt-2 text-base text-slate-400">How you fight a duel:</div>
              <MomentsViewPicker value={view} onChange={setView} />
            </>
          )}
        </div>
        <div>
          {startGame && view === "cockpit" && !flatStart && (
            <Suspense fallback={null}>
              <Start3D
                trackId={circuit.id}
                km={circuit.km}
                target={circuit.base - 0.4}
                grid={entries.filter((e) => e.grid > 0).map((e) => ({ slot: e.grid, color: team(e.teamId)?.color ?? "#94a3b8" }))}
                mySlot={entries[chosen]?.grid || entries.length}
                myColor={team(entries[chosen]?.teamId ?? "")?.color ?? "#e10600"}
                onSimple={() => setFlatStart(true)}
                onDone={(q, jumped) => (setStartGame(false), start({ [chosen]: jumped ? -1 : q }))}
              />
            </Suspense>
          )}
          {startGame && (view !== "cockpit" || flatStart) && (
            <Reaction
              kicker={`${circuit.gp} · the start`}
              cta="Race ›"
              intro="Five red lights. When they go out, launch: Space or tap. A great start gains places; jump it and it's five seconds."
              onQuit={() => (setStartGame(false), start())}
              onDone={(q, jumped) => (setStartGame(false), start({ [chosen]: jumped ? -1 : q }))}
            />
          )}
          <button className="btn-xl bg-race text-white hover:bg-red-500" disabled={chosen < 0} onClick={() => (career ? setStartGame(true) : start())}>
            Lights out{myTeamId || career ? "" : chosen >= 0 ? ` as ${drivers.get(pick!)?.last}` : ""} ›
          </button>
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
          <div className="kicker">Round {prep.round} · {prep.series ? `${prep.series} feature race · ` : ""}live</div>
          <h1 className="headline mt-1 text-4xl sm:text-5xl">{circuit.gp}</h1>
        </div>
        <div className="ml-auto flex gap-2">
          {finished && (
            <button
              className="btn-xl bg-race !py-3 !text-xl text-white hover:bg-red-500"
              disabled={!!busy}
              onClick={async () => {
                const live = { choices: runner.state.choices, focus: runner.input.focus ?? [], moments: runner.input.moments ?? "off", duelEdge: runner.input.duelEdge, launch: runner.input.launch };
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
        focus={zoomAt}
        banner={banner}
        radio={{ car: mine.length === 2 ? mine[tab] : chosen, engineer: career ? "Engineer" : "Race engineer", forecast: () => (runner && (mine.length === 2 ? mine[tab] : chosen) >= 0 ? runner.forecast(mine.length === 2 ? mine[tab] : chosen) : null) }}
        overlay={
          pend ? (
            <MomentCard
              m={pend}
              who={codeOf(pend.car)}
              ease={career ? DIFFICULTY[career.difficulty].window : 1}
              cockpit={{
                trackId: prep.input.circuit.id,
                km: prep.input.circuit.km,
                target: prep.input.circuit.base - 0.4,
                myColor: team(entries[pend.car].teamId)?.color ?? "#e10600",
                oppColor: pend.vs !== undefined ? (team(entries[pend.vs].teamId)?.color ?? "#94a3b8") : "#94a3b8",
                // the other car drives his favourite move; your grip comes from your one-lap and race pace
                habit: pend.vs !== undefined ? topHabit(tendencies(entries[pend.vs].driverId, entries[pend.vs].r.aggression)[pend.kind === "attack" ? "def" : "att"]) : undefined,
                grip: gripOf(entries[pend.car].r),
              }}
              onPick={(opt, q) => {
                const m = pend;
                const before = runner.state.order.indexOf(m.car) + 1;
                runner.choose(opt, q);
                runner.step();
                const after = runner.state.order.indexOf(m.car) + 1;
                const duel = runner.state.duels.find((x) => x.lap === m.lap && x.player === m.car);
                const label = opt === "auto" ? "Instinct" : (m.opts.find((o) => o.id === opt)?.label ?? opt);
                const dEv = runner.state.events.find((e) => e.kind === "duel" && e.lap === m.lap && (e.a === m.car || e.b === m.car));
                const showAt = dEv ? dEv.t + 2 : runner.state.cars[m.car].cum;
                setZoomAt((z) => (z ? { ...z, until: Math.max(z.t + 20, showAt + 10) } : z));
                setBanner({ t: showAt, node: <Outcome m={m} label={label} q={q} before={before} after={after} duel={duel} other={m.vs !== undefined ? codeOf(m.vs) : undefined} /> });
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

/** How a key moment went, big and plain: did the move work, how well you executed it, places gained or lost. */
function Outcome({ m, label, q, before, after, duel, other }: { m: PendingMoment; label: string; q?: number; before: number; after: number; duel?: { passed: boolean; contact: boolean }; other?: string }) {
  const attack = m.kind !== "defend";
  const [title, tone, line] = duel
    ? duel.contact
      ? ["Contact", "bg-rose-600", attack ? `You and ${other} touched.` : `${other} hit you.`]
      : attack
        ? duel.passed
          ? ["Overtake done", "bg-emerald-500", `Past ${other}.`]
          : ["Held up", "bg-amber-400", `${other} kept you behind.`]
        : duel.passed
          ? ["Passed", "bg-amber-400", `${other} got by.`]
          : ["Defended", "bg-emerald-500", `${other} stays behind.`]
    : after < before
      ? ["It worked", "bg-emerald-500", `Up ${before - after} place${before - after > 1 ? "s" : ""} this lap.`]
      : after > before
        ? ["It cost you", "bg-rose-600", `Down ${after - before} place${after - before > 1 ? "s" : ""} this lap.`]
        : ["Done", "bg-slate-300", "Position held this lap."];
  return (
    <div className="flex flex-wrap items-stretch overflow-hidden rounded-lg border border-ink-600 bg-ink-900">
      <div className={`flex items-center px-6 py-4 ${tone}`}>
        <div className="font-display text-4xl font-black uppercase leading-none text-ink-950 sm:text-5xl">{title}</div>
      </div>
      <div className="flex flex-1 flex-wrap items-center gap-x-8 gap-y-2 px-6 py-3">
        <div>
          <div className="kicker">{label}</div>
          <div className="text-lg text-white">{line}</div>
        </div>
        {q !== undefined && (
          <div>
            <div className="kicker">Your drive</div>
            <div className={`font-display text-3xl font-black ${verdictColor(q)}`}>
              {verdict(q)} {Math.round(q * 100)}%
            </div>
          </div>
        )}
        <div>
          <div className="kicker">Position</div>
          <div className="font-display text-3xl font-black text-white">
            P{before} <span className="text-slate-500">›</span> <span className={after < before ? "text-emerald-300" : after > before ? "text-rose-300" : ""}>P{after}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
