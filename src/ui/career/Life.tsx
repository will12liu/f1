// Paddock life: what you own, and what you could buy (perks every weekend, upkeep every season).
import { careerOf } from "../../engine/career/career";
import { ITEMS } from "../../engine/career/shop";
import { fmtM } from "../../engine/manager/state";
import { useGame } from "../../state/game";
import { bigGhost, bigRed, Card, HeadStat, PageHead } from "../components/hub";
import { Answer, useAct } from "../manager/kit";

const perks = (p: { xp?: number; morale?: number; fame?: number }) => [p.xp ? `+${p.xp} XP` : "", p.morale ? `+${p.morale} morale` : "", p.fame ? `+${p.fame} fame` : ""].filter(Boolean);

export function Life() {
  const world = useGame((s) => s.world);
  const { run, answer, busy } = useAct();
  if (!world) return null;
  const c = careerOf(world);
  if (!c) return null;
  const owned = new Set(c.owned ?? []);
  const items = [...ITEMS].sort((a, b) => Number(owned.has(b.id)) - Number(owned.has(a.id)));
  return (
    <div className="grid gap-8">
      <PageHead
        title="Paddock life"
        text="People and things that help every weekend. Each has a yearly upkeep; some need fame first."
        right={
          <>
            <HeadStat label="Bank" value={fmtM(c.cash)} tone={c.cash < 0 ? "bad" : undefined} />
            <HeadStat label="Morale" value={Math.round(c.morale ?? 60)} />
            <HeadStat label="Fame" value={Math.round(c.fame)} />
          </>
        }
      />
      <Answer a={answer} />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((it) => {
          const have = owned.has(it.id);
          const locked = !!it.needs && c.fame < it.needs;
          return (
            <Card key={it.id} title={it.name} sub={it.blurb} dim={locked} tag={have ? <span className="rounded-md bg-emerald-400 px-2 py-0.5 font-display text-base font-bold uppercase text-ink-950">Yours</span> : undefined}>
              <div className="flex flex-wrap gap-2">
                {perks(it.perks).map((p) => (
                  <span key={p} className="rounded-md bg-sky-500/15 px-2.5 py-1 text-base font-semibold text-sky-300">
                    {p}
                  </span>
                ))}
                <span className="px-1 py-1 text-base text-slate-500">a weekend</span>
              </div>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
                <div className="text-base text-slate-300">
                  {it.price ? <b className="font-display text-2xl text-white">{fmtM(it.price)}</b> : null}
                  <span className="text-slate-400">
                    {it.price ? " + " : ""}
                    {fmtM(it.upkeep)} a season
                  </span>
                  {locked && <div className="text-sm text-amber-300">Needs fame {it.needs}</div>}
                </div>
                {have ? (
                  <button className={bigGhost} disabled={busy} onClick={() => run("sellItem", it.id)}>
                    {it.price ? "Sell" : "Stop"}
                  </button>
                ) : (
                  <button className={bigRed} disabled={busy || locked} onClick={() => run("buyItem", it.id)}>
                    {it.price ? "Buy" : "Hire"}
                  </button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
