// The academy: your junior drivers, the prospects your scouts are watching (potential as an estimate that
// narrows with scouting), the scouts, junior teams you own, and the programme level.
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ACADEMY, potEstimate } from "../../engine/manager/academy";
import { fmtM } from "../../engine/manager/state";
import { ageOf } from "../../engine/season/development";
import { hasLicence, juniorStandings, licencePointsSL } from "../../engine/season/juniors";
import { useGame } from "../../state/game";
import { DriverLink, Section, TeamBar, useMaps } from "../components/bits";
import { Answer, Meter, useAct } from "./kit";

export function Academy() {
  const { id = "" } = useParams();
  const base = `/g/${id}`;
  const world = useGame((s) => s.world);
  const { run, answer, busy } = useAct();
  const [series, setSeries] = useState<"F4" | "F3" | "F2">("F3");
  const [placeFor, setPlaceFor] = useState<string | null>(null);
  const m = world?.manager;
  const freeScouts = m?.scouts?.filter((s) => !s.hired).length ?? 0;
  useEffect(() => {
    if (m && !m.fired && freeScouts < 5) run("scoutMarket");
  }, [freeScouts]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!world || !m || m.fired) return null;
  const { drivers, team } = useMaps(world);
  const academy = m.academy ?? [];
  const inAcad = new Set(academy.map((a) => a.driverId));
  const standing = (dId: string, s: string) => {
    if (s !== "F2" && s !== "F3") return null;
    const st = juniorStandings(world, s);
    const i = st.findIndex((r) => r.driverId === dId);
    return i >= 0 ? `P${i + 1} (${st[i].points} pts)` : null;
  };
  const prospects = world.drivers
    .filter((d) => d.series === series && !d.retired && !inAcad.has(d.id))
    .map((d) => ({ d, est: potEstimate(world, d) }))
    .sort((a, b) => b.est.mid - a.est.mid)
    .slice(0, 25);
  const juniorTeams = world.teams.filter((t) => t.series === "F2" || t.series === "F3");
  const owned = new Set(m.juniorTeams ?? []);

  return (
    <div className="grid gap-4">
      <Answer a={answer} />
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Section title={`Academy · ${academy.length}/${ACADEMY.max}`} right={<span className="text-sm text-slate-400">programme level {m.program ?? 2}</span>}>
          <div className="divide-y divide-ink-800 text-sm">
            {academy.length === 0 && <div className="p-4 text-slate-500">No drivers yet. Sign prospects below.</div>}
            {academy.map((a) => {
              const d = drivers.get(a.driverId);
              if (!d) return null;
              const est = potEstimate(world, d);
              return (
                <div key={a.driverId} className="grid gap-2 px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex-1">
                      <DriverLink d={d} base={base} full />
                      <div className="text-sm text-slate-400">
                        {ageOf(d, world.season)} · {d.series}
                        {d.teamId ? ` · ${team(d.teamId)?.name}` : " · no seat"} · ovr {d.ovr} · potential {est.lo}-{est.hi}
                        {standing(d.id, d.series) ? ` · ${standing(d.id, d.series)}` : ""} · licence {licencePointsSL(d, world.season)}
                        {hasLicence(world, d) ? " (ready for F1)" : ""}
                      </div>
                    </div>
                    <button className="btn-ghost !px-2 !py-1 text-sm" onClick={() => setPlaceFor(placeFor === d.id ? null : d.id)}>
                      Place in a team
                    </button>
                    <button className="text-sm text-slate-500 hover:text-rose-300" disabled={busy} onClick={() => run("releaseAcademy", d.id)}>
                      Release
                    </button>
                  </div>
                  {placeFor === d.id && (
                    <div className="flex flex-wrap gap-1">
                      {juniorTeams
                        .filter((t) => (d.series === "F4" ? t.series === "F3" : true))
                        .map((t) => (
                          <button key={t.id} disabled={busy} onClick={() => run("placeDriver", d.id, t.id).then(() => setPlaceFor(null))} className="btn bg-ink-800 !px-2 !py-1 text-sm text-slate-200 hover:bg-ink-700">
                            <TeamBar color={t.color} />
                            {t.series} {t.name} {owned.has(t.id) ? "(yours)" : `· ${fmtM(ACADEMY.seatFee[t.series])}`}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-3 border-t border-ink-800 px-4 py-2.5 text-sm text-slate-400">
            Coaching and simulator time make academy drivers improve faster every winter.
            {(m.program ?? 2) < 5 && (
              <button className="btn-ghost ml-auto !px-2 !py-1 text-sm" disabled={busy} onClick={() => run("upgradeProgram")}>
                Programme level {(m.program ?? 2) + 1} · {fmtM(ACADEMY.program[(m.program ?? 2) + 1])}
              </button>
            )}
          </div>
        </Section>

        <Section title="Scouts">
          <div className="divide-y divide-ink-800 text-sm">
            {(m.scouts ?? [])
              .filter((s) => s.hired)
              .map((s) => (
                <div key={s.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                  <span className="flex-1">
                    {s.first} {s.last} <span className="text-sm text-slate-400">· {s.rating} · {fmtM(s.salary)}</span>
                  </span>
                  {(["F4", "F3", "F2"] as const).map((f) => (
                    <button key={f} disabled={busy} onClick={() => run("setScoutFocus", s.id, f)} className={`btn !px-3 !py-1.5 text-sm ${s.focus === f ? "bg-white text-black" : "bg-ink-800 text-slate-300 hover:bg-ink-700"}`}>
                      {f}
                    </button>
                  ))}
                  <button className="text-sm text-slate-500 hover:text-rose-300" disabled={busy} onClick={() => run("fireScout", s.id)}>
                    Release
                  </button>
                </div>
              ))}
            <div className="px-4 py-2 text-xs uppercase tracking-wider text-slate-500">Available</div>
            {(m.scouts ?? [])
              .filter((s) => !s.hired)
              .map((s) => (
                <div key={s.id} className="flex items-center gap-2 px-4 py-2">
                  <span className="flex-1">
                    {s.first} {s.last} <span className="text-sm text-slate-400">· {s.nat} · rating {s.rating}</span>
                  </span>
                  <button className="btn-ghost !px-2 !py-1 text-sm" disabled={busy} onClick={() => run("hireScout", s.id)}>
                    Hire · {fmtM(s.salary)}
                  </button>
                </div>
              ))}
          </div>
        </Section>
      </div>

      <Section
        title="Prospects"
        right={
          <div className="flex gap-1">
            {(["F4", "F3", "F2"] as const).map((k) => (
              <button key={k} onClick={() => setSeries(k)} className={`btn !px-3.5 !py-2 text-sm ${series === k ? "bg-race text-white" : "bg-ink-800 text-slate-300 hover:bg-ink-700"}`}>
                {k}
              </button>
            ))}
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Driver</th>
                <th className="num">Age</th>
                <th className="num">Ovr</th>
                <th>Potential (estimate)</th>
                <th>Scouted</th>
                <th>Season</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {prospects.map(({ d, est }) => (
                <tr key={d.id}>
                  <td>
                    <DriverLink d={d} base={base} full />
                    <div className="text-xs text-slate-500">{d.teamId ? team(d.teamId)?.name : d.nat}</div>
                  </td>
                  <td className="num">{ageOf(d, world.season)}</td>
                  <td className="num">{d.ovr}</td>
                  <td className="font-mono text-sm">{est.lo === est.hi ? est.mid : `${est.lo}-${est.hi}`}</td>
                  <td className="w-28">
                    <Meter value={est.k / 100} color="#38bdf8" height={6} />
                  </td>
                  <td className="text-sm text-slate-400">{standing(d.id, d.series) ?? "-"}</td>
                  <td className="text-right">
                    <button className="btn-ghost !px-2 !py-1 text-sm" disabled={busy} onClick={() => run("signAcademy", d.id)}>
                      Sign · {fmtM(ACADEMY.fee[d.series] ?? 0)}/yr
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Junior teams">
        <div className="grid sm:grid-cols-2 gap-px bg-ink-800">
          {juniorTeams.map((t) => (
            <div key={t.id} className="flex items-center gap-2 bg-ink-900 px-4 py-2 text-sm">
              <TeamBar color={t.color} />
              <span className="flex-1">
                {t.series} {t.name}
                <span className="block text-xs text-slate-500">{t.drivers.map((x) => drivers.get(x)?.last).join(", ")}</span>
              </span>
              {owned.has(t.id) ? (
                <span className="text-sm text-emerald-300">Yours · {fmtM(ACADEMY.running[t.series])}/yr to run</span>
              ) : (
                <button className="btn-ghost !px-2 !py-1 text-sm" disabled={busy} onClick={() => confirm(`Buy ${t.name}?`) && run("buyJuniorTeam", t.id)}>
                  Buy · {fmtM(ACADEMY.buy[t.series])}
                </button>
              )}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
