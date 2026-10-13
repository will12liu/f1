// My career: the driver, the next race, the season so far, progression, money and fame, offers, mail.
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Negotiate } from "./Negotiate";
import { archOf, careerOf, meOf, TIERS } from "../../engine/career/career";
import { fmtM } from "../../engine/manager/state";
import { ageOf } from "../../engine/season/development";
import { hasLicence, isJuniorRound, juniorStandings, licencePointsSL } from "../../engine/season/juniors";
import { circuitOf, driverStandings, nextRound } from "../../engine/season/season";
import { useGame } from "../../state/game";
import { Section, TeamBar, TrackOutline, useMaps } from "../components/bits";
import { Helmet } from "../components/Helmet";
import { BigStat, HubButton, NextRace } from "../components/hub";
import { Answer, useAct } from "../manager/kit";

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
  const arch = archOf(c);
  const unread = c.inbox.filter((x) => !x.read).length;
  const role = d.teamId ? `${d.series} · ${t?.name}` : t ? `${t.name} reserve driver` : "No seat";

  const color = t?.color ?? "#475569";
  const raceButtons = next && (
    <>
      {racesHere && !c.event && (
        <Link className="btn-xl bg-race text-white hover:bg-red-500" to={`${base}/live`}>
          Race the weekend ›
        </Link>
      )}
      <HubButton
        disabled={!!busy || !!c.event}
        onClick={async () => {
          await simRounds(1);
          if (!junior && racesHere) nav(`${base}/race/${next.round}`);
        }}
      >
        {racesHere ? "Sim the weekend" : "Next weekend"}
      </HubButton>
    </>
  );

  return (
    <div className="grid gap-8">
      {c.event && (
        <section className="grid gap-4 rounded-lg border border-ink-600 bg-ink-850 p-6 md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="kicker text-sky-300">Text from {c.event.from ?? "the paddock"} · answer before the next race</div>
            <Link to={`${base}/life?app=messages`} className="font-display text-lg font-bold uppercase text-sky-300 hover:text-white">
              Open phone ›
            </Link>
          </div>
          <h2 className="headline text-4xl sm:text-5xl">{c.event.title}</h2>
          <p className="max-w-3xl text-lg text-slate-300">{c.event.text}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {c.event.opts.map((o, i) => (
              <button key={i} disabled={!!busy} onClick={() => run("answerEvent", i)} className="tile !min-h-0">
                <div className="font-display text-2xl font-extrabold uppercase leading-tight text-white">{o.label}</div>
                <div className="mt-2 text-sm text-slate-400">{o.sub}</div>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-wrap items-stretch overflow-hidden rounded-lg border border-ink-700 bg-ink-900">
        <div className="relative flex w-32 items-center justify-center bg-ink-850 px-3 pb-3 sm:w-48">
          <Helmet color={c.helmet ?? color} num={d.num} className="w-full" />
          <span className="absolute inset-x-0 bottom-0 h-2" style={{ background: color }} />
        </div>
        <div className="min-w-0 flex-1 px-6 py-5">
          <div className="kicker">{role}</div>
          <h1 className="headline mt-2">
            <span className="block text-2xl tracking-[0.15em] text-slate-300">{d.first}</span>
            <span className="block text-5xl sm:text-6xl">{d.last}</span>
          </h1>
          <div className="mt-2 text-base text-slate-400">
            Age {ageOf(d, world.season)} · {d.nat} · {arch?.label} · {TIERS[c.tier].label}
          </div>
        </div>
        <div className="flex items-center gap-8 border-ink-700 px-6 py-5 max-sm:w-full max-sm:border-t sm:border-l">
          <div>
            <div className="kicker">Overall</div>
            <div className="font-display text-6xl font-black leading-none text-white">{d.ovr}</div>
          </div>
          <div>
            <div className="kicker">Potential</div>
            <div className="font-display text-6xl font-black leading-none text-slate-500">{d.pot}</div>
          </div>
        </div>
      </section>

      {next && circuit ? (
        <NextRace world={world} note={racesHere ? `${d.series} races this weekend.` : junior ? `No ${d.series} race this weekend. You test in the simulator (XP).` : "You're not racing this weekend."}>
          {raceButtons}
        </NextRace>
      ) : (
        <section className="grid gap-5 rounded-lg border border-ink-700 bg-ink-900 p-6 md:p-8">
          <div className="kicker">{world.season} season complete</div>
          <h1 className="headline text-5xl sm:text-6xl">Season over</h1>
          <p className="text-lg text-slate-300">Pick your seat for next year from the offers below, then go into the winter.</p>
          <div>
            <button className="btn-xl bg-race text-white hover:bg-red-500" disabled={!!busy} onClick={() => nextSeason()}>
              Go into the winter ›
            </button>
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <BigStat label={`${d.series} standing`} value={pos ? `P${pos}` : "-"} sub={`${pts} pts`} />
        <BigStat label="Team trust" value={Math.round(c.trust)} tone={c.trust >= 60 ? "good" : c.trust < 30 ? "bad" : undefined} />
        <BigStat label="Fame" value={Math.round(c.fame)} sub={`morale ${Math.round(c.morale ?? 60)}`} />
        <BigStat label="Bank" value={fmtM(c.cash)} />
        <BigStat label="Super licence" value={`${licencePointsSL(d, world.season)}/40`} sub={hasLicence(world, d) ? "F1 eligible" : "40 needed for F1"} tone={hasLicence(world, d) ? "good" : undefined} />
      </div>

        {c.seatOffers.length > 0 && (
          <Section title="Offers for next season">
            <div className="divide-y divide-ink-800 text-base">
              {c.seatOffers.map((o) => (
                <div key={o.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <TeamBar color={team(o.teamId)?.color ?? "#888"} />
                  <div className="flex-1">
                    <div className="font-semibold">
                      {o.series} {team(o.teamId)?.name} {o.role === "reserve" ? "(reserve)" : ""}
                    </div>
                    <div className="text-sm text-slate-400">
                      {o.note} {o.salary > 0 ? `${fmtM(o.salary)} a season` : o.salary < 0 ? `You pay ${fmtM(-o.salary)}` : "No salary"} · {o.years} year{o.years > 1 ? "s" : ""}
                    </div>
                  </div>
                  {c.next?.id === o.id ? (
                    <span className="text-xs font-semibold text-emerald-300">Agreed</span>
                  ) : (
                    <>
                      <button className="text-sm font-semibold text-slate-300 hover:text-white" onClick={() => setTalk(talk === o.id ? null : o.id)}>
                        Negotiate
                      </button>
                      <button className="btn-primary" disabled={!!busy} onClick={() => run("acceptSeat", o.id)}>
                        Accept
                      </button>
                    </>
                  )}
                  {o.clauses && (o.clauses.release || o.clauses.lead) && (
                    <div className="w-full text-sm text-sky-300">
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

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Section title="Coming up" right={<Link to={`${base}/calendar`} className="text-sm font-semibold text-slate-300 hover:text-white">Calendar ›</Link>}>
          <div className="grid grid-cols-2 gap-px bg-ink-800 sm:grid-cols-4">
            {world.calendar.slice(world.results.length, world.results.length + 4).map((r) => {
              const here = junior ? isJuniorRound(world, d.series as "F2" | "F3", r.round) : d.series === "F1";
              return (
                <Link key={r.round} to={`${base}/calendar`} className="bg-ink-900 p-4 hover:bg-ink-800">
                  <div className="flex justify-between text-sm text-slate-400">
                    <span className="font-display font-bold uppercase">R{r.round}</span>
                    <span>{new Date(r.date + "T12:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}</span>
                  </div>
                  <TrackOutline id={r.circuitId} className="my-2 h-16 w-full" />
                  <div className="truncate font-display text-xl font-extrabold uppercase text-white">{circuitOf(world, r.circuitId).gp.replace(" GP", "")}</div>
                  <div className={`text-sm ${here ? "text-emerald-300" : "text-slate-500"}`}>{here ? `${d.series} races` : "No race for you"}</div>
                </Link>
              );
            })}
          </div>
        </Section>
      <div className="grid gap-6 content-start" id="messages">
        <Section title={`Messages${unread ? ` (${unread})` : ""}`} right={unread ? <button className="text-xs text-slate-400 hover:text-white" onClick={() => run("markCareerRead")}>Mark read</button> : undefined}>
          <div className="divide-y divide-ink-800 max-h-[520px] overflow-y-auto">
            {c.inbox.slice(0, 30).map((x) => (
              <div key={x.id} className="px-5 py-3">
                <div className="flex items-baseline gap-2">
                  {!x.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-race" />}
                  <span className={`text-base ${x.read ? "text-slate-300" : "font-semibold text-white"}`}>{x.subject}</span>
                </div>
                <div className="text-sm text-slate-500">{x.from}</div>
                <p className="mt-1 text-sm text-slate-400">{x.body}</p>
              </div>
            ))}
          </div>
        </Section>
      </div>
      </div>
    </div>
  );
}
