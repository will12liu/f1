// Training: spend upgrade points on ratings. Each +1 costs more as the rating rises; weak areas of your
// archetype have a ceiling, and the overall can't pass your potential.
import { lazy, Suspense, useState } from "react";
import { archOf, careerOf, meOf, pointCost, SIM_SESSIONS, simTag, trainCap, XP_PER_POINT, type SimKind } from "../../engine/career/career";
import { DIFFICULTY } from "../../engine/career/career";
import { HotLap, Reaction } from "./SimGames";
import { circuitOf, nextRound } from "../../engine/season/season";
import { gripOf } from "../race/drive";

const Cockpit3D = lazy(() => import("../race/cockpit/Cockpit3D"));
import { RATING_KEYS, RATING_LABELS } from "../../engine/ratings";
import { useGame } from "../../state/game";
import { bigGhost, HeadStat, PageHead } from "../components/hub";
import { Answer, Meter, useAct } from "../manager/kit";

export function Training() {
  const world = useGame((s) => s.world);
  const { run, answer, busy } = useAct();
  const [game, setGame] = useState<SimKind | null>(null);
  const [duel, setDuel] = useState<{ side: "attack" | "defend"; n: number } | null>(null);
  const [duelBest, setDuelBest] = useState<number | null>(null);
  if (!world) return null;
  const c = careerOf(world);
  const d = meOf(world);
  if (!c || !d) return null;
  const arch = archOf(c);
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
      {(() => {
        // duel practice in the 3D cockpit at the next circuit: as often as you like, no XP
        const r = nextRound(world) ?? world.calendar[world.calendar.length - 1];
        const ci = circuitOf(world, r.circuitId);
        const color = world.teams.find((t) => t.id === d.teamId)?.color ?? "#e10600";
        return (
          <section className="grid gap-3">
            <h2 className="kicker">Duel practice · 3D cockpit · {ci.gp} · no XP, as often as you like</h2>
            <div className="flex flex-wrap items-center gap-3">
              <button className="btn-xl bg-race text-white hover:bg-red-500" onClick={() => setDuel({ side: "attack", n: (duel?.n ?? 0) + 1 })}>
                Practice an attack
              </button>
              <button className="btn-xl bg-ink-800 text-white hover:bg-ink-700" onClick={() => setDuel({ side: "defend", n: (duel?.n ?? 0) + 1 })}>
                Practice defending
              </button>
              {duelBest !== null && <span className="text-lg text-slate-400">Last score {Math.round(duelBest * 100)}</span>}
            </div>
            {duel && (
              <Suspense fallback={null}>
                <Cockpit3D
                  key={duel.n}
                  trackId={ci.id}
                  km={ci.km}
                  target={ci.base - 0.4}
                  side={duel.side}
                  move={duel.side === "attack" ? "inside" : "coverIn"}
                  label={duel.side === "attack" ? "Practice: get past" : "Practice: keep him behind"}
                  pick={duel.n}
                  myColor={color}
                  oppColor="#94a3b8"
                  habit={duel.side === "attack" ? (["coverIn", "coverOut", "hold", "lateDef"] as const)[duel.n % 4] : (["inside", "outside", "late", "dummy"] as const)[duel.n % 4]}
                  grip={gripOf(d.ratings)}
                  onResult={(q) => (setDuelBest(q), setDuel(null))}
                  onSimple={() => setDuel(null)}
                  simpleLabel="Quit"
                />
              </Suspense>
            )}
          </section>
        );
      })()}
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
