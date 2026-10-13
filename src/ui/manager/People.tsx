// People: the six key staff roles (renew, release, hire, poach), our drivers (renew, release), the driver
// market (sign now into a free seat, or for next season when a rival's deal ends), and the reserve.
import { useState } from "react";
import { STAFF_ROLES } from "../../../data/manual/manager";
import { driverAsk, driverWilling } from "../../engine/manager/actions";
import { myTeam, prestigeOf, staffAsk } from "../../engine/manager/manager";
import { fmtM, ROLES, type StaffRole } from "../../engine/manager/state";
import { ageOf } from "../../engine/season/development";
import { useGame } from "../../state/game";
import { DriverLink, Ovr, Section, TeamBar, useMaps } from "../components/bits";
import { useParams } from "react-router-dom";
import { Answer, useAct } from "./kit";

export function People() {
  const { id = "" } = useParams();
  const base = `/g/${id}`;
  const world = useGame((s) => s.world);
  const { run, answer, busy } = useAct();
  const [role, setRole] = useState<StaffRole>("td");
  const [years, setYears] = useState(2);
  const [show, setShow] = useState<"free" | "rivals">("free");
  if (!world?.manager || world.manager.fired) return null;
  const m = world.manager;
  const me = myTeam(world)!;
  const { drivers, team } = useMaps(world);
  const staff = world.staff ?? [];
  const ours = staff.filter((s) => (s.teamId === me.id && !s.joins) || s.joins?.teamId === me.id);
  const market = staff
    .filter((s) => s.role === role && s.teamId !== me.id && !s.joins && (show === "free" ? !s.teamId : !!s.teamId))
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 12);
  const ourDrivers = me.drivers.map((d) => drivers.get(d)!).filter(Boolean);
  const season = world.season;
  const pool = world.drivers
    .filter((d) => !d.retired && d.teamId !== me.id && (d.series === "F1" || d.series === "F2"))
    .filter((d) => !d.teamId || d.series === "F2" || (d.contract && d.contract.until <= season))
    .sort((a, b) => b.ovr - a.ovr)
    .slice(0, 20);

  return (
    <div className="grid gap-4">
      <Answer a={answer} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Key staff" right={<span className="text-sm text-slate-400">prestige {prestigeOf(world, me.id).toFixed(2)}</span>}>
          <div className="divide-y divide-ink-800 text-sm">
            {ROLES.map((r) => {
              const s = ours.find((x) => x.role === r);
              return (
                <div key={r} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <div className="w-44">
                    <div className="text-xs uppercase tracking-wider text-slate-400">{STAFF_ROLES[r].label}</div>
                    <div className="font-semibold">{s ? `${s.first} ${s.last}` : <span className="text-rose-300">Empty</span>}</div>
                  </div>
                  {s && (
                    <>
                      <Ovr v={s.rating} />
                      <span className="text-sm text-slate-400">
                        {s.age} · {fmtM(s.salary)} · {s.joins ? `starts round ${s.joins.round}` : `until ${s.until}`}
                      </span>
                      {!s.joins && (
                        <span className="ml-auto flex gap-2 text-sm">
                          <button className="text-slate-300 hover:text-white" disabled={busy} onClick={() => run("renewStaff", s.id, 2)}>
                            Extend 2 yrs
                          </button>
                          <button className="text-slate-500 hover:text-rose-300" disabled={busy} onClick={() => confirm(`Release ${s.first} ${s.last}? You pay half of what's left on the contract.`) && run("fireStaff", s.id)}>
                            Release
                          </button>
                        </span>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        <Section title="Staff market">
          <div className="grid gap-3 p-4 text-sm">
            <div className="flex flex-wrap gap-1">
              {ROLES.map((r) => (
                <button key={r} onClick={() => setRole(r)} className={`btn !px-2 !py-1 text-sm ${role === r ? "bg-race text-white" : "bg-ink-800 text-slate-300 hover:bg-ink-700"}`}>
                  {STAFF_ROLES[r].label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {(
                [
                  ["free", "Free agents"],
                  ["rivals", "At other teams"],
                ] as const
              ).map(([k, label]) => (
                <button key={k} onClick={() => setShow(k)} className={`btn !px-2 !py-1 ${show === k ? "bg-white text-black" : "bg-ink-800 text-slate-300 hover:bg-ink-700"}`}>
                  {label}
                </button>
              ))}
              <span className="ml-auto text-slate-400">Contract</span>
              {[1, 2, 3].map((y) => (
                <button key={y} onClick={() => setYears(y)} className={`btn !px-2 !py-1 ${years === y ? "bg-white text-black" : "bg-ink-800 text-slate-300 hover:bg-ink-700"}`}>
                  {y} yr
                </button>
              ))}
            </div>
            {show === "rivals" && <p className="text-sm text-slate-500">Poaching costs about a third more, he may say no, and he serves four races of gardening leave. His old team loses some development pace.</p>}
          </div>
          <div className="divide-y divide-ink-800 text-sm">
            {market.map((s) => {
              const ask = staffAsk(s.role, s.rating) * (s.teamId ? 1.35 : 1);
              return (
                <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-2">
                  <Ovr v={s.rating} />
                  <div className="flex-1">
                    <div className="font-semibold">
                      {s.first} {s.last}
                    </div>
                    <div className="text-sm text-slate-400">
                      {s.nat} · {s.age}
                      {s.teamId ? ` · ${team(s.teamId)?.name}` : ""}
                    </div>
                  </div>
                  <button className="btn-ghost !px-3.5 !py-2 text-sm" disabled={busy} onClick={() => run("hireStaff", s.id, ask, years)}>
                    {s.teamId ? "Approach" : "Hire"} · {fmtM(ask)}
                  </button>
                </div>
              );
            })}
          </div>
        </Section>
      </div>

      <Section title="Drivers">
        <div className="divide-y divide-ink-800 text-sm">
          {ourDrivers.map((d) => {
            const ask = driverAsk(world, d);
            return (
              <div key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <Ovr v={d.ovr} />
                <div className="flex-1">
                  <DriverLink d={d} base={base} full />
                  <div className="text-sm text-slate-400">
                    {ageOf(d, season)} · {fmtM(d.contract?.salary ?? 0)} a season · until {d.contract?.until ?? season}
                  </div>
                </div>
                <button className="btn-ghost !px-3.5 !py-2 text-sm" disabled={busy} onClick={() => run("renewDriver", d.id, ask, 2)}>
                  Extend 2 yrs · {fmtM(ask)}
                </button>
                <button className="text-sm text-slate-500 hover:text-rose-300" disabled={busy} onClick={() => confirm(`Release ${d.first} ${d.last}? You pay half of what's left on his contract.`) && run("releaseDriver", d.id)}>
                  Release
                </button>
              </div>
            );
          })}
          {m.precontracts.map((p) => (
            <div key={p.driverId} className="px-4 py-2 text-sm text-sky-300">
              Signed for {season + 1}: {drivers.get(p.driverId)?.first} {drivers.get(p.driverId)?.last}, {fmtM(p.salary)} a season until {p.until}
            </div>
          ))}
          <div className="px-4 py-2 text-sm text-slate-400">
            Reserve: {me.reserve ? `${drivers.get(me.reserve)?.first} ${drivers.get(me.reserve)?.last}` : "none"} · races if a driver is banned or a seat is empty.
          </div>
        </div>
      </Section>

      <Section title="Driver market" right={<span className="text-sm text-slate-400">free agents, F2, and F1 drivers out of contract this year</span>}>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Driver</th>
                <th className="num">Ovr</th>
                <th className="num">Pot</th>
                <th className="num">Age</th>
                <th>Now</th>
                <th className="num">Asks</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pool.map((d) => {
                const ask = driverAsk(world, d);
                const willing = driverWilling(world, d);
                const f1 = d.series === "F1" && d.teamId;
                return (
                  <tr key={d.id}>
                    <td>
                      <DriverLink d={d} base={base} full />
                    </td>
                    <td className="num">{d.ovr}</td>
                    <td className="num text-slate-400">{d.pot}</td>
                    <td className="num">{ageOf(d, season)}</td>
                    <td className="text-slate-400">
                      <span className="flex items-center gap-1.5">
                        {d.teamId && <TeamBar color={team(d.teamId)?.color ?? "#888"} />}
                        {d.teamId ? `${team(d.teamId)?.name ?? ""}${f1 ? ` until ${d.contract?.until}` : ""}` : "free"}
                      </span>
                    </td>
                    <td className="num">{fmtM(ask)}</td>
                    <td className="text-right">
                      {willing ? (
                        <span className="flex justify-end gap-2">
                          <button className="btn-ghost !px-2 !py-1 text-sm" disabled={busy} onClick={() => run("signDriver", d.id, ask, 2)}>
                            {f1 ? "Sign for next year" : "Sign"}
                          </button>
                          {!f1 && (
                            <button className="text-sm text-slate-400 hover:text-white" disabled={busy} onClick={() => run("setReserve", d.id)}>
                              Reserve
                            </button>
                          )}
                        </span>
                      ) : (
                        <span className="text-sm text-slate-500">not interested</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
