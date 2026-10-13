// Endorsements: personal deals that follow your fame. Sign, or let your agent push for more (it can fail).
import { careerOf } from "../../engine/career/career";
import { fmtM } from "../../engine/manager/state";
import { useGame } from "../../state/game";
import { bigGhost, bigRed, Card, HeadStat, PageHead } from "../components/hub";
import { Answer, useAct } from "../manager/kit";

export function Deals() {
  const world = useGame((s) => s.world);
  const { run, answer, busy } = useAct();
  if (!world) return null;
  const c = careerOf(world);
  if (!c) return null;
  return (
    <div className="grid gap-8">
      <PageHead
        title="Deals"
        text="Brands follow fame. Win, get on the podium and get noticed, and the offers get bigger."
        right={
          <>
            <HeadStat label="Fame" value={Math.round(c.fame)} />
            <HeadStat label="A season" value={fmtM(c.deals.reduce((s, x) => s + x.pay, 0))} />
          </>
        }
      />
      <Answer a={answer} />
      <section className="grid gap-3">
        <h2 className="kicker">Offers</h2>
        {c.dealOffers.length === 0 && <div className="rounded-lg border border-ink-700 bg-ink-900 p-6 text-lg text-slate-400">No offers right now.</div>}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {c.dealOffers.map((o) => (
            <Card key={o.id} title={o.brand} sub={`${o.sector} · open until round ${o.expires}`}>
              <div className="font-display text-4xl font-black text-white">
                {fmtM(o.pay)} <span className="text-xl text-slate-400">a season · {o.years} yr</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className={bigRed} disabled={busy} onClick={() => run("signDeal", o.id, false)}>
                  Sign
                </button>
                <button className={bigGhost} disabled={busy} onClick={() => run("signDeal", o.id, true)}>
                  Agent pushes for more
                </button>
              </div>
            </Card>
          ))}
        </div>
      </section>
      <section className="grid gap-3">
        <h2 className="kicker">Your deals</h2>
        {c.deals.length === 0 && <div className="rounded-lg border border-ink-700 bg-ink-900 p-6 text-lg text-slate-400">None yet.</div>}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {c.deals.map((x) => (
            <Card key={x.id} title={x.brand} sub={`${x.sector} · until ${x.until}`}>
              <div className="font-display text-3xl font-black text-white">{fmtM(x.pay)} <span className="text-lg text-slate-400">a season</span></div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
