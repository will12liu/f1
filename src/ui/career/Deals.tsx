// Endorsements: personal deals that follow your fame. Sign, or let your agent push for more (it can fail).
import { careerOf } from "../../engine/career/career";
import { fmtM } from "../../engine/manager/state";
import { useGame } from "../../state/game";
import { Section } from "../components/bits";
import { Answer, useAct } from "../manager/kit";

export function Deals() {
  const world = useGame((s) => s.world);
  const { run, answer, busy } = useAct();
  if (!world) return null;
  const c = careerOf(world);
  if (!c) return null;
  return (
    <div className="grid gap-4">
      <Answer a={answer} />
      <Section title="Offers" right={<span className="text-xs text-slate-400">fame {Math.round(c.fame)}: more fame, bigger offers</span>}>
        <div className="divide-y divide-ink-800 text-sm">
          {c.dealOffers.length === 0 && <div className="p-4 text-slate-500">No offers. Win races, get on the podium, and brands will call.</div>}
          {c.dealOffers.map((o) => (
            <div key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <div className="flex-1">
                <div className="font-semibold">{o.brand}</div>
                <div className="text-xs text-slate-400">
                  {o.sector} · {fmtM(o.pay)} a season for {o.years} year{o.years > 1 ? "s" : ""} · open until round {o.expires}
                </div>
              </div>
              <button className="btn-primary !px-2.5 !py-1 text-xs" disabled={busy} onClick={() => run("signDeal", o.id, false)}>
                Sign
              </button>
              <button className="btn-ghost !px-2.5 !py-1 text-xs" disabled={busy} onClick={() => run("signDeal", o.id, true)}>
                Agent pushes for more
              </button>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Your deals">
        <div className="divide-y divide-ink-800 text-sm">
          {c.deals.length === 0 && <div className="p-4 text-slate-500">None yet.</div>}
          {c.deals.map((x) => (
            <div key={x.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="flex-1 font-semibold">{x.brand}</span>
              <span className="text-xs text-slate-400">
                {x.sector} · {fmtM(x.pay)} a season until {x.until}
              </span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
