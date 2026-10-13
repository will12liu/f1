// Training: spend upgrade points on ratings. Each +1 costs more as the rating rises; weak areas of your
// archetype have a ceiling, and the overall can't pass your potential.
import { useState } from "react";
import { ARCHETYPES, careerOf, meOf, pointCost, SIM_SESSIONS, simTag, trainCap, XP_PER_POINT, type SimKind } from "../../engine/career/career";
import { DIFFICULTY } from "../../engine/career/career";
import { HotLap, Reaction } from "./SimGames";
import { RATING_KEYS, RATING_LABELS } from "../../engine/ratings";
import { useGame } from "../../state/game";
import { bigGhost, HeadStat, PageHead } from "../components/hub";
import { Answer, Meter, useAct } from "../manager/kit";

export function Training() {
  const world = useGame((s) => s.world);
  const { run, answer, busy } = useAct();
  const [game, setGame] = useState<SimKind | null>(null);
  if (!world) return null;
  const c = careerOf(world);
  const d = meOf(world);
  if (!c || !d) return null;
  const arch = ARCHETYPES.find((a) => a.id === c.archetype)!;
  return (
    <div className="grid gap-8">
      <PageHead
        kicker={`${arch.label} · ${c.xp}/${XP_PER_POINT} XP to the next point`}
        title="Training"
        text={`Strong in ${arch.primary.map((k) => RATING_LABELS[k].toLowerCase()).join(", ")}. ${arch.weak.map((k) => RATING_LABELS[k]).join(" and ")} top out at 84. Your overall can't pass your potential.`}
        right={
          <>
            <HeadStat label="Overall" value={d.ovr} />
            <HeadStat label="Potential" value={<span className="text-slate-500">{d.pot}</span>} />
            <HeadStat label="Points" value={<span className={c.points ? "text-race" : ""}>{c.points}</span>} />
          </>
        }
      />
      {game && (game === "lap" ? <HotLap onQuit={() => setGame(null)} onDone={(q) => (setGame(null), run("simSession", "lap", q))} /> : <Reaction onQuit={() => setGame(null)} onDone={(q) => (setGame(null), run("simSession", "reaction", q))} />)}
      <section className="grid gap-3">
        <h2 className="kicker">Simulator · once each per race weekend</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {(Object.keys(SIM_SESSIONS) as SimKind[]).map((k) => {
            const done = c.sims?.[k] === simTag(world);
            const best = c.simBest?.[k];
            const [lo, hi] = SIM_SESSIONS[k].xp.map((x) => Math.round(x * DIFFICULTY[c.difficulty].xp));
            return (
              <button key={k} disabled={done || busy} onClick={() => setGame(k)} className="tile !min-h-40">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-display text-3xl font-extrabold uppercase leading-none text-white">{SIM_SESSIONS[k].label}</span>
                  {done ? <span className="rounded-md bg-emerald-400 px-2 py-0.5 font-display text-base font-bold uppercase text-ink-950">Done</span> : <span className="rounded-md bg-race px-2 py-0.5 font-display text-base font-bold uppercase text-white">Play</span>}
                </div>
                <div className="mt-2 text-base text-slate-300">{k === "lap" ? "Six braking zones, each one tighter. The same skill as the duels in a race." : "Five red lights. React when they go out. Don't jump the start."}</div>
                <div className="mt-auto pt-4 text-sm text-slate-400">
                  {lo}-{hi} XP{best !== undefined ? ` · best ${Math.round(best * 100)}` : ""}
                  {done ? " · back next race weekend" : ""}
                </div>
              </button>
            );
          })}
        </div>
      </section>
      <div className="flex flex-wrap items-center gap-4">
        <button className={bigGhost} disabled={busy || !c.points} onClick={() => run("autoSpend")}>
          Let the coach spend them
        </button>
        <Answer a={answer} />
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {RATING_KEYS.filter((k) => k !== "aggression").map((k) => {
          const v = Math.round(d.ratings[k]);
          const cap = trainCap(c, k);
          const cost = pointCost(v);
          const strong = arch.primary.includes(k);
          const weak = arch.weak.includes(k);
          return (
            <div key={k} className="grid gap-3 rounded-lg border border-ink-700 bg-ink-900 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-display text-2xl font-extrabold uppercase leading-none text-white">{RATING_LABELS[k]}</div>
                  <div className={`mt-1 text-sm ${strong ? "text-emerald-300" : weak ? "text-rose-300" : "text-slate-500"}`}>{strong ? "Strength" : weak ? `Weak area · max ${cap}` : cap < 99 ? `Max ${cap}` : " "}</div>
                </div>
                <div className="font-display text-5xl font-black leading-none text-white">{v}</div>
              </div>
              <Meter value={v / 99} color={strong ? "#34d399" : weak ? "#fb7185" : "#94a3b8"} mark={cap < 99 ? cap / 99 : undefined} height={10} />
              <button className="rounded-lg bg-ink-800 px-4 py-2.5 text-left font-display text-lg font-bold uppercase text-white hover:bg-ink-700 disabled:opacity-35" disabled={busy || c.points < cost || v >= cap} onClick={() => run("spendPoint", k, 1)}>
                +1 <span className="text-slate-400">· {cost} point{cost === 1 ? "" : "s"}</span>
              </button>
            </div>
          );
        })}
      </div>
      <div className="text-base text-slate-500">Aggression is your style, not a skill: it isn't trained.</div>
    </div>
  );
}
