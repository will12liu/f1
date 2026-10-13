// Paddock life: what you own, and what you could buy (perks every weekend, upkeep every season).
import { careerOf } from "../../engine/career/career";
import { ITEMS } from "../../engine/career/shop";
import { fmtM } from "../../engine/manager/state";
import { useGame } from "../../state/game";
import { Section } from "../components/bits";
import { Answer, useAct } from "../manager/kit";

const perkText = (p: { xp?: number; morale?: number; fame?: number }) =>
  [p.xp ? `+${p.xp} XP` : "", p.morale ? `+${p.morale} morale` : "", p.fame ? `+${p.fame} fame` : ""].filter(Boolean).join(", ") + " a weekend";

export function Life() {
  const world = useGame((s) => s.world);
  const { run, answer, busy } = useAct();
  if (!world) return null;
  const c = careerOf(world);
  if (!c) return null;
  const owned = new Set(c.owned ?? []);
  return (
    <div className="grid gap-4">
      <Answer a={answer} />
      <Section title="Paddock life" right={<span className="text-xs text-slate-400">bank {fmtM(c.cash)} · fame {Math.round(c.fame)}</span>}>
        <div className="divide-y divide-ink-800 text-sm">
          {ITEMS.map((it) => {
            const have = owned.has(it.id);
            const locked = !!it.needs && c.fame < it.needs;
            return (
              <div key={it.id} className={`flex flex-wrap items-center gap-3 px-4 py-2.5 ${locked ? "opacity-50" : ""}`}>
                <div className="flex-1">
                  <div className="font-semibold">{it.name}</div>
                  <div className="text-xs text-slate-400">
                    {it.blurb} {perkText(it.perks)} · {it.price ? `${fmtM(it.price)}, ` : ""}
                    {fmtM(it.upkeep)} a season{locked ? ` · needs fame ${it.needs}` : ""}
                  </div>
                </div>
                {have ? (
                  <button className="text-xs text-slate-400 hover:text-rose-300" disabled={busy} onClick={() => run("sellItem", it.id)}>
                    {it.price ? "Sell" : "Stop"}
                  </button>
                ) : (
                  <button className="btn-ghost !px-2.5 !py-1 text-xs" disabled={busy || locked} onClick={() => run("buyItem", it.id)}>
                    {it.price ? "Buy" : "Hire"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
