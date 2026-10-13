// Training: spend upgrade points on ratings. Each +1 costs more as the rating rises; weak areas of your
// archetype have a ceiling, and the overall can't pass your potential.
import { ARCHETYPES, careerOf, meOf, pointCost, trainCap } from "../../engine/career/career";
import { RATING_KEYS, RATING_LABELS } from "../../engine/ratings";
import { useGame } from "../../state/game";
import { Section } from "../components/bits";
import { Answer, Meter, useAct } from "../manager/kit";

export function Training() {
  const world = useGame((s) => s.world);
  const { run, answer, busy } = useAct();
  if (!world) return null;
  const c = careerOf(world);
  const d = meOf(world);
  if (!c || !d) return null;
  const arch = ARCHETYPES.find((a) => a.id === c.archetype)!;
  return (
    <Section
      title={`Training · ${c.points} point${c.points === 1 ? "" : "s"}`}
      right={
        <button className="btn-ghost !px-2.5 !py-1 text-xs" disabled={busy || !c.points} onClick={() => run("autoSpend")}>
          Let the coach spend them
        </button>
      }
    >
      <div className="grid gap-1 p-4">
        <div className="mb-2 text-xs text-slate-400">
          Overall {d.ovr} of potential {d.pot}. {arch.label}: strong in {arch.primary.map((k) => RATING_LABELS[k].toLowerCase()).join(", ")}; {arch.weak.map((k) => RATING_LABELS[k].toLowerCase()).join(" and ")} top out at 84.
        </div>
        {RATING_KEYS.filter((k) => k !== "aggression").map((k) => {
          const v = Math.round(d.ratings[k]);
          const cap = trainCap(c, k);
          const cost = pointCost(v);
          return (
            <div key={k} className="grid grid-cols-[150px_36px_1fr_auto] items-center gap-3 text-sm">
              <span className={arch.primary.includes(k) ? "text-white" : arch.weak.includes(k) ? "text-slate-500" : "text-slate-300"}>{RATING_LABELS[k]}</span>
              <span className="text-right font-mono">{v}</span>
              <Meter value={v / 99} color={arch.primary.includes(k) ? "#38bdf8" : "#64748b"} mark={cap < 99 ? cap / 99 : undefined} height={6} />
              <button className="btn-ghost !px-2 !py-0.5 text-xs" disabled={busy || c.points < cost || v >= cap} onClick={() => run("spendPoint", k, 1)}>
                +1 · {cost}
              </button>
            </div>
          );
        })}
        <div className="mt-2 text-xs text-slate-500">Aggression is your style, not a skill: it isn't trained.</div>
        <Answer a={answer} />
      </div>
    </Section>
  );
}
