// Partners: who pays to be on the car, what they expect, how happy they are, and the offers on the table.
import { SPONSOR_TIERS } from "../../../data/manual/manager";
import { slotsFree } from "../../engine/manager/manager";
import { fmtM, type Bonus, type Tier } from "../../engine/manager/state";
import { useGame } from "../../state/game";
import { Section } from "../components/bits";
import { Answer, Meter, useAct } from "./kit";

const bonusText = (b: Bonus) =>
  b.kind === "position" ? `${fmtM(b.amount)} if the team finishes P${b.target} or better` : `${fmtM(b.amount)} per ${b.kind === "points" ? "points finish" : b.kind === "podium" ? "podium" : "win"}`;

const TIERS: Tier[] = ["title", "major", "minor"];

export function Partners() {
  const world = useGame((s) => s.world);
  const { run, answer, busy } = useAct();
  if (!world?.manager || world.manager.fired) return null;
  const m = world.manager;
  const total = m.sponsors.reduce((s, x) => s + x.perSeason, 0);

  return (
    <div className="grid gap-4">
      <Answer a={answer} />
      <Section title="Partners" right={<span className="text-xs text-slate-400">{fmtM(total)} a season</span>}>
        <div className="divide-y divide-ink-800">
          {TIERS.map((tier) => (
            <div key={tier} className="grid gap-2 px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {SPONSOR_TIERS[tier].label} · {SPONSOR_TIERS[tier].slots - slotsFree(m, tier)}/{SPONSOR_TIERS[tier].slots}
              </div>
              {m.sponsors.filter((s) => s.tier === tier).length === 0 && <div className="text-sm text-slate-500">Empty.</div>}
              {m.sponsors
                .filter((s) => s.tier === tier)
                .map((s) => (
                  <div key={s.id} className="grid sm:grid-cols-[1fr_160px_auto] items-center gap-3 text-sm">
                    <div>
                      <div className="font-semibold">{s.brand}</div>
                      <div className="text-xs text-slate-400">
                        {s.sector} · {fmtM(s.perSeason)} a season until {s.until} · {bonusText(s.bonus)} · hopes for P{s.expects}
                      </div>
                    </div>
                    <div className="grid gap-1">
                      <Meter value={s.satisfaction / 100} color={s.satisfaction >= 55 ? "#34d399" : s.satisfaction >= 30 ? "#f59e0b" : "#f43f5e"} />
                      <span className="text-[11px] text-slate-500">satisfaction {Math.round(s.satisfaction)}</span>
                    </div>
                    <button className="text-xs text-slate-500 hover:text-rose-300" disabled={busy} onClick={() => confirm(`End the ${s.brand} deal? It costs a quarter of a season's money.`) && run("dropSponsor", s.id)}>
                      End deal
                    </button>
                  </div>
                ))}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Offers">
        <div className="divide-y divide-ink-800">
          {m.offers.length === 0 && <div className="p-4 text-sm text-slate-500">No offers right now. Brands come calling during the season, more when results are good.</div>}
          {m.offers.map((o) => {
            const clash = m.sponsors.some((s) => s.sector === o.sector);
            const full = slotsFree(m, o.tier) <= 0;
            return (
              <div key={o.id} className="grid sm:grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 text-sm">
                <div>
                  <div className="font-semibold">
                    {o.brand} <span className="font-normal text-slate-400">· {SPONSOR_TIERS[o.tier].label.toLowerCase()}{o.renewal ? " · renewal" : ""}</span>
                  </div>
                  <div className="text-xs text-slate-400">
                    {o.sector} · {fmtM(o.perSeason)} a season for {o.years} year{o.years > 1 ? "s" : ""} · {bonusText(o.bonus)} · hopes for P{o.expects}
                    {o.expiresRound ? ` · open until round ${o.expiresRound}` : ""}
                  </div>
                  {(clash || full) && <div className="text-xs text-amber-300">{clash ? `Clashes with your ${o.sector.toLowerCase()} partner.` : "No free slot in this tier."}</div>}
                </div>
                <button className="btn-primary !py-1.5" disabled={busy || clash || full} onClick={() => run("signSponsor", o.id)}>
                  Sign
                </button>
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
