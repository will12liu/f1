// Car and R&D: where the car stands against the field, projects in the factory, a new project with a
// quote (cost, races, wind tunnel hours, expected gain), recent results, and the facilities.
import { useState } from "react";
import { FACILITIES } from "../../../data/manual/manager";
import { projectQuote } from "../../engine/manager/actions";
import { capForecast, efficiency, isWorks, MANAGER_RULES, myTeam } from "../../engine/manager/manager";
import { fmtM, type Area, type FacilityKey, type Size } from "../../engine/manager/state";
import { f1Teams } from "../../engine/season/season";
import { useGame } from "../../state/game";
import { Section, TeamBar } from "../components/bits";
import { Answer, AREA_LABEL, Meter, useAct } from "./kit";
import { PageHead } from "../components/hub";

const AREAS: Area[] = ["aero", "mech", "power", "reliability"];
const SIZES: [Size, string][] = [
  ["S", "Small"],
  ["M", "Medium"],
  ["L", "Major"],
];

export function Development() {
  const world = useGame((s) => s.world);
  const { run, answer, busy } = useAct();
  const [area, setArea] = useState<Area>("aero");
  const [size, setSize] = useState<Size>("M");
  const [target, setTarget] = useState<"now" | "next">("now");
  if (!world?.manager || world.manager.fired) return null;
  const m = world.manager;
  const me = myTeam(world)!;
  const q = projectQuote(world, area, size, target);
  const cap = capForecast(world, m);
  const hoursLeft = m.atr.hours - m.atr.used;
  const max = MANAGER_RULES.maxProjects(m.facilities.factory.level);
  const teams = f1Teams(world);

  return (
    <div className="grid gap-8">
    <PageHead title="Car & R&D" text="The car against the field, projects in the factory and next year's car." />
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <div className="grid gap-4 content-start">
        <Section title="The car against the field">
          <div className="p-4 grid gap-4">
            {(["aero", "mech", "power", "reliability"] as const).map((a) => {
              const sorted = [...teams].sort((x, y) => y.car[a] - x.car[a]);
              const rank = sorted.findIndex((t) => t.id === me.id) + 1;
              const best = sorted[0].car[a];
              const worst = sorted[sorted.length - 1].car[a];
              const span = Math.max(1, best - worst);
              return (
                <div key={a} className="grid gap-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-300">{AREA_LABEL[a]}</span>
                    <span className="font-mono text-slate-400">
                      {me.car[a].toFixed(1)} · #{rank} of {teams.length}
                      {m.nextCar[a] > 0 ? ` · +${m.nextCar[a].toFixed(1)} banked for next year` : ""}
                    </span>
                  </div>
                  <div className="relative h-4 rounded-sm bg-ink-800">
                    {sorted.map((t) => (
                      <span key={t.id} title={`${t.name} ${t.car[a].toFixed(1)}`} className={`absolute top-0 h-4 ${t.id === me.id ? "w-1.5 bg-white" : "w-1 opacity-70"}`} style={{ left: `calc(${((t.car[a] - worst) / span) * 100}% - 2px)`, background: t.id === me.id ? undefined : t.color }} />
                    ))}
                  </div>
                </div>
              );
            })}
            {!isWorks(me.id) && <p className="text-sm text-slate-500">{me.name} buys {me.engine} power units: power-unit work is limited to integration (half the effect).</p>}
          </div>
        </Section>

        <Section title="New project" right={<span className="text-sm text-slate-400">{m.projects.length}/{max} in the factory</span>}>
          <div className="p-4 grid gap-3 text-sm">
            <div className="grid grid-cols-[90px_1fr] items-center gap-2">
              <span className="text-sm text-slate-400">Area</span>
              <div className="flex flex-wrap gap-1">
                {AREAS.map((a) => (
                  <button key={a} onClick={() => setArea(a)} className={`btn !px-3.5 !py-2 ${area === a ? "bg-race text-white" : "bg-ink-800 text-slate-300 hover:bg-ink-700"}`}>
                    {AREA_LABEL[a]}
                  </button>
                ))}
              </div>
              <span className="text-sm text-slate-400">Size</span>
              <div className="flex gap-1">
                {SIZES.map(([s, label]) => (
                  <button key={s} onClick={() => setSize(s)} className={`btn !px-3.5 !py-2 ${size === s ? "bg-race text-white" : "bg-ink-800 text-slate-300 hover:bg-ink-700"}`}>
                    {label}
                  </button>
                ))}
              </div>
              <span className="text-sm text-slate-400">For</span>
              <div className="flex gap-1">
                {(
                  [
                    ["now", "This year's car"],
                    ["next", "Next year's car"],
                  ] as const
                ).map(([t, label]) => (
                  <button key={t} onClick={() => setTarget(t)} className={`btn !px-3.5 !py-2 ${target === t ? "bg-race text-white" : "bg-ink-800 text-slate-300 hover:bg-ink-700"}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-md bg-ink-850 p-3 font-mono text-sm">
              <div>
                <div className="text-slate-500">Cost</div>
                <div className="text-white">{fmtM(q.cost)}</div>
              </div>
              <div>
                <div className="text-slate-500">Ready in</div>
                <div className="text-white">{q.rounds} races</div>
              </div>
              <div>
                <div className="text-slate-500">Tunnel hours</div>
                <div className={q.hours > hoursLeft ? "text-rose-300" : "text-white"}>{q.hours || "-"}</div>
              </div>
              <div>
                <div className="text-slate-500">Expected gain</div>
                <div className="text-white">+{q.gain.toFixed(2)}</div>
              </div>
            </div>
            <div className="text-sm text-slate-400">
              Department efficiency {Math.round(efficiency(world, m, area) * 100)}% · R&D room under the cap {fmtM(Math.max(0, cap.room))} · results vary, and about one project in fourteen doesn't correlate.
            </div>
            <div>
              <button className="btn-primary" disabled={busy} onClick={() => run("startProject", area, size, target)}>
                Start project
              </button>
            </div>
            <Answer a={answer} />
          </div>
        </Section>
      </div>

      <div className="grid gap-4 content-start">
        <Section title="Wind tunnel and CFD" right={<span className="text-sm text-slate-400">{Math.round(m.atr.pct * 100)}% allocation</span>}>
          <div className="p-4 grid gap-2 text-sm">
            <Meter value={m.atr.used / Math.max(1, m.atr.hours)} color="#38bdf8" />
            <div className="text-sm text-slate-400">
              {Math.round(hoursLeft)} of {Math.round(m.atr.hours)} hours left this half of the season. The allocation follows the constructors' standings: lower teams get more.
            </div>
          </div>
        </Section>

        <Section title="In the factory">
          <div className="divide-y divide-ink-800 text-sm">
            {m.projects.length === 0 && <div className="p-4 text-slate-500">No projects running.</div>}
            {m.projects.map((p) => (
              <div key={p.id} className="grid grid-cols-[1fr_110px] items-center gap-3 px-5 py-3">
                <div>
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-sm text-slate-400">
                    {AREA_LABEL[p.area]} · {p.target === "next" ? "next year" : "this year"} · {p.roundsLeft} to go
                  </div>
                </div>
                <Meter value={1 - p.roundsLeft / p.rounds} color="#38bdf8" />
              </div>
            ))}
          </div>
        </Section>

        <Section title="Facilities">
          <div className="divide-y divide-ink-800 text-sm">
            {(Object.keys(FACILITIES) as FacilityKey[]).map((k) => {
              const f = m.facilities[k];
              const nextCost = FACILITIES[k].cost[f.level + 1];
              return (
                <div key={k} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <div className="min-w-40">
                    <div className="font-semibold">{FACILITIES[k].label}</div>
                    <div className="flex gap-1 pt-1">
                      {[1, 2, 3, 4, 5].map((l) => (
                        <span key={l} className={`h-1.5 w-5 rounded-sm ${l <= f.level ? "bg-white" : f.building && l === f.building.to ? "bg-sky-400" : "bg-ink-700"}`} />
                      ))}
                    </div>
                  </div>
                  <div className="ml-auto text-right text-sm text-slate-400">
                    {f.building ? (
                      `Level ${f.building.to} in ${f.building.roundsLeft} races`
                    ) : f.level >= 5 ? (
                      "Top level"
                    ) : (
                      <button className="btn-ghost !px-3.5 !py-2" disabled={busy} onClick={() => run("upgradeFacility", k)}>
                        Upgrade · {fmtM(nextCost)}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="px-4 pb-3 text-sm text-slate-500">Facilities are capital spending, outside the cost cap. Tunnel and CFD help aero; factory and simulator help mechanical, power and reliability, and the factory decides how many projects can run at once.</p>
        </Section>

        <Section title="Recent results">
          <div className="divide-y divide-ink-800 text-sm">
            {m.finished.length === 0 && <div className="p-4 text-slate-500">Nothing delivered yet.</div>}
            {m.finished.slice(0, 10).map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-5 py-3">
                <TeamBar color={p.outcome === "failed" ? "#f43f5e" : p.outcome === "good" ? "#34d399" : p.outcome === "poor" ? "#f59e0b" : "#94a3b8"} />
                <span className="flex-1">{p.name}</span>
                <span className="font-mono text-sm text-slate-400">
                  {p.outcome === "failed" ? "failed" : `+${(p.gain ?? 0).toFixed(2)} ${p.area}`}
                  {p.target === "next" ? " (next year)" : ""}
                </span>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
    </div>
  );
}
