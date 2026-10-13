// My career: the driver, the next race, the season so far, progression, money and fame, offers, mail.
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Negotiate } from "./Negotiate";
import { ARCHETYPES, careerOf, meOf, TIERS, XP_PER_POINT } from "../../engine/career/career";
import { fmtM } from "../../engine/manager/state";
import { ageOf } from "../../engine/season/development";
import { hasLicence, isJuniorRound, juniorStandings, licencePointsSL } from "../../engine/season/juniors";
import { circuitOf, driverStandings, nextRound } from "../../engine/season/season";
import { useGame } from "../../state/game";
import { Ovr, Section, TeamBar, TrackOutline, useMaps } from "../components/bits";
import { Answer, Meter, Stat, useAct } from "../manager/kit";

export function CareerHq() {
  const { id = "" } = useParams();
  const base = `/g/${id}`;
  const nav = useNavigate();
  const { world, busy, simRounds, nextSeason } = useGame();
  const { run, answer } = useAct();
  const [talk, setTalk] = useState<string | null>(null);
  if (!world) return null;
  const c = careerOf(world);
  const d = meOf(world);
  if (!c || !d) return null;
  const { team } = useMaps(world);
  const t = team(d.teamId) ?? (d.contract ? team(d.contract.teamId) : undefined);
  const next = nextRound(world);
  const circuit = next ? circuitOf(world, next.circuitId) : null;
  const junior = d.series === "F2" || d.series === "F3";
  const racesHere = next && (junior ? isJuniorRound(world, d.series as "F2" | "F3", next.round) : d.series === "F1" && !!d.teamId);
  const st = junior ? juniorStandings(world, d.series as "F2" | "F3") : driverStandings(world);
  const pos = st.findIndex((r) => r.driverId === d.id) + 1;
  const pts = st.find((r) => r.driverId === d.id)?.points ?? 0;
  const arch = ARCHETYPES.find((a) => a.id === c.archetype);
  const unread = c.inbox.filter((x) => !x.read).length;
  const role = d.teamId ? `${d.series} · ${t?.name}` : t ? `${t.name} reserve driver` : "No seat";

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <div className="grid gap-4 content-start">
        {c.event && (
          <section className="panel border-l-4 border-sky-400 p-4 grid gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">This week</div>
            <h2 className="font-display text-2xl font-bold uppercase leading-none">{c.event.title}</h2>
            <p className="text-sm text-slate-300">{c.event.text}</p>
            <div className="grid sm:grid-cols-3 gap-1.5">
              {c.event.opts.map((o, i) => (
                <button key={i} disabled={!!busy} onClick={() => run("answerEvent", i)} className="rounded-md bg-ink-800 px-2.5 py-1.5 text-left hover:bg-ink-700">
                  <div className="text-sm font-semibold text-white">{o.label}</div>
                  <div className="text-[11px] text-slate-400">{o.sub}</div>
                </button>
              ))}
            </div>
          </section>
        )}
        <section className="panel p-5 grid gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <TeamBar color={t?.color ?? "#888"} className="!h-10 !w-1.5" />
            <div className="flex-1">
              <h1 className="font-display text-4xl font-black uppercase leading-none">
                {d.first} {d.last}
              </h1>
              <div className="text-sm text-slate-400">
                {ageOf(d, world.season)} · {d.nat} · {arch?.label} · {TIERS[c.tier].label} · {role}
              </div>
            </div>
            <div className="text-right">
              <Ovr v={d.ovr} />
              <div className="text-[11px] text-slate-500">potential {d.pot}</div>
            </div>
          </div>
          {next && circuit ? (
            <div className="grid sm:grid-cols-[1fr_160px] items-center gap-3 rounded-md bg-ink-850 p-3">
              <div className="grid gap-2">
                <div className="text-xs uppercase tracking-wider text-slate-400">Round {next.round} · {circuit.gp}</div>
                <div className="text-sm text-slate-300">{racesHere ? `${d.series} races this weekend.` : junior ? `No ${d.series} race this weekend. You test in the simulator (XP).` : "You're not racing this weekend."}</div>
                <div className="flex flex-wrap gap-2">
                  {racesHere && !c.event && (
                    <Link className="btn-primary" to={`${base}/live`}>
                      Race it
                    </Link>
                  )}
                  <button
                    className="btn-ghost"
                    disabled={!!busy || !!c.event}
                    onClick={async () => {
                      await simRounds(1);
                      if (!junior && racesHere) nav(`${base}/race/${next.round}`);
                    }}
                  >
                    {racesHere ? "Sim the weekend" : "Next weekend"}
                  </button>
                </div>
              </div>
              <TrackOutline id={circuit.id} className="w-full h-28" />
            </div>
          ) : (
            <div className="grid gap-2 rounded-md bg-ink-850 p-3">
              <div className="text-sm text-slate-300">Season over. Pick your seat for next year, then go into the winter.</div>
              <div>
                <button className="btn-primary" disabled={!!busy} onClick={() => nextSeason()}>
                  Go into the winter
                </button>
              </div>
            </div>
          )}
        </section>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label={`${d.series} standings`} value={pos ? `P${pos}` : "-"} sub={`${pts} pts`} />
          <Stat label="Team trust" value={Math.round(c.trust)} tone={c.trust >= 60 ? "good" : c.trust < 30 ? "bad" : undefined} />
          <Stat label="Fame" value={Math.round(c.fame)} sub={`morale ${Math.round(c.morale ?? 60)}`} />
          <Stat label="Bank" value={fmtM(c.cash)} />
        </div>

        <Section title="Progression" right={<Link to={`${base}/training`} className="text-xs text-slate-400 hover:text-white">Training</Link>}>
          <div className="p-4 grid gap-2 text-sm">
            <Meter value={c.xp / XP_PER_POINT} color="#38bdf8" />
            <div className="flex justify-between text-xs text-slate-400">
              <span>{c.xp}/{XP_PER_POINT} XP to the next point</span>
              <span className={c.points ? "text-white" : ""}>{c.points} point{c.points === 1 ? "" : "s"} to spend</span>
            </div>
            <div className="text-xs text-slate-400">
              Super licence: {licencePointsSL(d, world.season)}/40 {hasLicence(world, d) ? "(you can race in F1)" : ""}
              {c.academyOf ? ` · ${team(c.academyOf)?.name} junior programme` : ""}
            </div>
          </div>
        </Section>

        {c.seatOffers.length > 0 && (
          <Section title="Offers for next season">
            <div className="divide-y divide-ink-800 text-sm">
              {c.seatOffers.map((o) => (
                <div key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <TeamBar color={team(o.teamId)?.color ?? "#888"} />
                  <div className="flex-1">
                    <div className="font-semibold">
                      {o.series} {team(o.teamId)?.name} {o.role === "reserve" ? "(reserve)" : ""}
                    </div>
                    <div className="text-xs text-slate-400">
                      {o.note} {o.salary > 0 ? `${fmtM(o.salary)} a season` : o.salary < 0 ? `You pay ${fmtM(-o.salary)}` : "No salary"} · {o.years} year{o.years > 1 ? "s" : ""}
                    </div>
                  </div>
                  {c.next?.id === o.id ? (
                    <span className="text-xs font-semibold text-emerald-300">Agreed</span>
                  ) : (
                    <>
                      <button className="text-xs text-slate-400 hover:text-white" onClick={() => setTalk(talk === o.id ? null : o.id)}>
                        Negotiate
                      </button>
                      <button className="btn-ghost !px-2.5 !py-1 text-xs" disabled={!!busy} onClick={() => run("acceptSeat", o.id)}>
                        Accept
                      </button>
                    </>
                  )}
                  {o.clauses && (o.clauses.release || o.clauses.lead) && (
                    <div className="w-full text-[11px] text-sky-300">
                      {[o.clauses.release ? "release clause" : "", o.clauses.lead ? "number-one driver" : ""].filter(Boolean).join(", ")}
                    </div>
                  )}
                  {talk === o.id && (
                    <div className="w-full">
                      <Negotiate o={o} busy={!!busy} onPropose={(ask, years, clause) => run("negotiateSeat", o.id, ask, years, clause)} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}
        <Answer a={answer} />

        <Section title="Races">
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Season</th>
                  <th>Race</th>
                  <th className="num">Grid</th>
                  <th className="num">Finish</th>
                  <th className="num">Rating</th>
                  <th className="num">XP</th>
                </tr>
              </thead>
              <tbody>
                {[...c.log].reverse().slice(0, 12).map((r, i) => (
                  <tr key={i}>
                    <td className="text-slate-400">
                      {r.season} {r.series}
                    </td>
                    <td>
                      {circuitOf(world, r.circuitId).gp}
                      {r.dotd && <span className="ml-2 text-[10px] font-bold text-amber-300">DRIVER OF THE DAY</span>}
                    </td>
                    <td className="num">{r.grid}</td>
                    <td className="num">{r.status === "Finished" || r.status === "Lapped" ? r.pos : r.status}</td>
                    <td className={`num font-semibold ${r.rating >= 8 ? "text-emerald-300" : r.rating < 5 ? "text-rose-300" : ""}`}>{r.rating.toFixed(1)}</td>
                    <td className="num text-slate-400">{r.xp}</td>
                  </tr>
                ))}
                {!c.log.length && (
                  <tr>
                    <td colSpan={6} className="text-slate-500">
                      No races yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Section>
      </div>

      <div className="grid gap-4 content-start">
        <Section title={`Messages${unread ? ` (${unread})` : ""}`} right={unread ? <button className="text-xs text-slate-400 hover:text-white" onClick={() => run("markCareerRead")}>Mark read</button> : undefined}>
          <div className="divide-y divide-ink-800 max-h-[520px] overflow-y-auto">
            {c.inbox.slice(0, 30).map((x) => (
              <div key={x.id} className="px-4 py-2.5">
                <div className="flex items-baseline gap-2">
                  {!x.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-race" />}
                  <span className={`text-sm ${x.read ? "text-slate-300" : "font-semibold text-white"}`}>{x.subject}</span>
                </div>
                <div className="text-xs text-slate-500">{x.from}</div>
                <p className="mt-0.5 text-xs text-slate-400">{x.body}</p>
              </div>
            ))}
          </div>
        </Section>
        <Section title="Contract and deals" right={<Link to={`${base}/deals`} className="text-xs text-slate-400 hover:text-white">Deals</Link>}>
          <div className="p-4 grid gap-1 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Contract</span>
              <span>{d.contract ? `${team(d.contract.teamId)?.name} until ${d.contract.until}` : "none"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Salary</span>
              <span>{fmtM(d.contract?.salary ?? 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Endorsements</span>
              <span>
                {c.deals.length} · {fmtM(c.deals.reduce((s, x) => s + x.pay, 0))} a season
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Offers waiting</span>
              <span>{c.dealOffers.length}</span>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
