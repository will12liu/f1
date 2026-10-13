// Finance: the bank balance, the season so far by category, the cost cap, and every transaction.
import { FINANCE } from "../../../data/manual/manager";
import { capForecast } from "../../engine/manager/manager";
import { fmtM, type LedgerCat } from "../../engine/manager/state";
import { useGame } from "../../state/game";
import { Section } from "../components/bits";
import { Meter, Stat } from "./kit";

const CAT: Record<LedgerCat, string> = {
  prize: "Prize fund",
  sponsor: "Partners",
  bonus: "Partner bonuses",
  owner: "Owner",
  merch: "Merchandise and hospitality",
  drivers: "Driver salaries",
  staff: "Staff",
  ops: "Race operations",
  engine: "Power unit supply",
  rnd: "R&D projects",
  facility: "Facilities",
  fine: "Fines",
  transfer: "Contract payouts",
};

export function Finance() {
  const world = useGame((s) => s.world);
  if (!world?.manager || world.manager.fired) return null;
  const m = world.manager;
  const season = m.ledger.filter((e) => e.season === world.season);
  const by = new Map<LedgerCat, { amount: number; capped: number }>();
  for (const e of season) {
    const x = by.get(e.cat) ?? { amount: 0, capped: 0 };
    x.amount += e.amount;
    if (e.capped) x.capped += e.amount;
    by.set(e.cat, x);
  }
  const income = [...by.entries()].filter(([, v]) => v.amount > 0).sort((a, b) => b[1].amount - a[1].amount);
  const spend = [...by.entries()].filter(([, v]) => v.amount < 0).sort((a, b) => a[1].amount - b[1].amount);
  const net = season.reduce((s, e) => s + e.amount, 0);
  const cap = capForecast(world, m);

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Bank" value={fmtM(m.cash)} tone={m.cash < 0 ? "bad" : undefined} />
        <Stat label={`${world.season} so far`} value={fmtM(net)} tone={net >= 0 ? "good" : "bad"} />
        <Stat label="Cap spent" value={fmtM(cap.spent)} sub={`of ${fmtM(FINANCE.costCap)}`} />
        <Stat label="Room for R&D" value={fmtM(cap.room)} sub="after running costs to come" tone={cap.room < 0 ? "bad" : undefined} />
      </div>

      <Section title="Cost cap">
        <div className="p-4 grid gap-2 text-sm">
          <Meter value={(cap.spent + cap.committed) / (FINANCE.costCap * 1.1)} mark={1 / 1.1} height={10} color={cap.room < 0 ? "#f43f5e" : "#e10600"} />
          <p className="text-sm text-slate-400">
            The line is the cap. The bar is what you've spent plus the running costs still to come this season (staff, operations, power units). Driver pay and your three best-paid staff are outside the cap, and so are facilities. Up to 5% over is a minor breach: a fine and less wind-tunnel time. More is a material breach: a big fine, less tunnel time and an angry board.
          </p>
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Income this season">
          <table className="tbl">
            <tbody>
              {income.map(([k, v]) => (
                <tr key={k}>
                  <td>{CAT[k]}</td>
                  <td className="num text-emerald-300">{fmtM(v.amount)}</td>
                </tr>
              ))}
              {!income.length && (
                <tr>
                  <td className="text-slate-500">Nothing yet: money comes in after each race.</td>
                </tr>
              )}
            </tbody>
          </table>
        </Section>
        <Section title="Spending this season">
          <table className="tbl">
            <thead>
              <tr>
                <th></th>
                <th className="num">Total</th>
                <th className="num">Under the cap</th>
              </tr>
            </thead>
            <tbody>
              {spend.map(([k, v]) => (
                <tr key={k}>
                  <td>{CAT[k]}</td>
                  <td className="num text-rose-300">{fmtM(v.amount)}</td>
                  <td className="num text-slate-400">{v.capped ? fmtM(-v.capped) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>

      <Section title="Transactions">
        <div className="max-h-96 overflow-y-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Round</th>
                <th>Category</th>
                <th>Detail</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {[...season].reverse().slice(0, 150).map((e, i) => (
                <tr key={i}>
                  <td className="num w-14 text-slate-400">{e.round || "-"}</td>
                  <td>{CAT[e.cat]}</td>
                  <td className="text-slate-400">{e.note ?? ""}</td>
                  <td className={`num ${e.amount >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{fmtM(e.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {m.history.length > 0 && (
        <Section title="Seasons">
          <table className="tbl">
            <thead>
              <tr>
                <th>Season</th>
                <th className="num">Position</th>
                <th className="num">Points</th>
                <th className="num">Result for the year</th>
                <th className="num">Board</th>
              </tr>
            </thead>
            <tbody>
              {m.history.map((h) => (
                <tr key={h.season}>
                  <td>{h.season}</td>
                  <td className="num">P{h.pos}</td>
                  <td className="num">{h.points}</td>
                  <td className={`num ${h.profit >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{fmtM(h.profit)}</td>
                  <td className="num">{h.confidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}
    </div>
  );
}
