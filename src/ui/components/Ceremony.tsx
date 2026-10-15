// Full-screen moments, shown once each: the debrief after one of your career races, and the season's
// champions when the last round is done (the debrief sits on top when both are due). Dismissed state lives in localStorage (a convenience, not game state).
import { useState, type ReactNode } from "react";
import { careerOf, meOf } from "../../engine/career/career";
import { juniorStandings } from "../../engine/season/juniors";
import { circuitOf, driverStandings, nextRound, teamStandings } from "../../engine/season/season";
import type { World } from "../../engine/types";
import { onColor } from "./bits";

const seen = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const mark = (key: string, v: string) => {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* private mode: it just shows again */
  }
};

function Screen({ children, onClose, cta }: { children: ReactNode; onClose: () => void; cta: string }) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink-950">
      <div className="mx-auto flex min-h-full max-w-5xl flex-col justify-center px-6 py-12 sm:px-10">
        {children}
        <div className="mt-12">
          <button autoFocus className="btn-xl bg-race text-white hover:bg-red-500" onClick={onClose}>
            {cta} ›
          </button>
        </div>
      </div>
    </div>
  );
}

const ratingTone = (r: number) => (r >= 8 ? "#34d399" : r >= 6.5 ? "#e2e8f0" : r >= 5 ? "#fbbf24" : "#fb7185");

type ResultKind = "won" | "podium" | "points" | "none" | "dnf";
const HOME_LINES: Record<ResultKind, { parent: string[]; partner: string[] }> = {
  won: {
    parent: ["We screamed at the TV!", "Your dad is crying. I am fine. Call us.", "That was beautiful. We are so proud."],
    partner: ["I knew it. I knew it. Call me.", "I am shaking. You won.", "Come home a winner this week."],
  },
  podium: {
    parent: ["A podium! We stood up in the living room.", "We do not mind which step. You were up there.", "Send us a photo with the trophy."],
    partner: ["You looked so happy up there.", "Podium. I am proud of you.", "Save me a sip of the champagne."],
  },
  points: {
    parent: ["Points! Your dad has told the neighbours already.", "We saw the flag. Well done, love.", "That is a proper result. Sleep well."],
    partner: ["Points in the bag. Dinner is on me when you are back.", "I watched the last ten laps standing up.", "Good day. Text me when you are out of the car."],
  },
  none: {
    parent: ["Are you alright? You looked cross at the end.", "Next week. We still love watching.", "Eat something. Then tell us about it."],
    partner: ["Rough one. I am here when you want to talk.", "Forget the result. Call me later.", "I saw it. You drove well anyway."],
  },
  dnf: {
    parent: ["We saw you get out. Are you hurt?", "Call us. We just need to hear your voice.", "The car stopped and we are worried. Phone home."],
    partner: ["Tell me you are okay. Please.", "I do not care about the race. Are you alright?", "Watching you walk away was horrible. Call me."],
  },
};

/** One text after the race, from a partner or a parent. The round picks the line, so a replay shows the same one. */
function homeText(world: World, kind: ResultKind): { name: string; text: string } | null {
  const people = careerOf(world)?.life?.people;
  if (!people) return null;
  const partner = people.find((p) => p.role === "partner");
  const parent = people.find((p) => p.role === "mum") ?? people.find((p) => p.role === "dad");
  const who = [partner, parent].filter((p) => !!p);
  if (!who.length) return null;
  const i = world.results.length;
  const person = who[i % who.length];
  const lines = HOME_LINES[kind][person.role === "partner" ? "partner" : "parent"];
  return { name: person.name, text: lines[i % lines.length] };
}

function Debrief({ world, saveId }: { world: World; saveId: string }) {
  const c = careerOf(world);
  const d = meOf(world);
  const r = c?.log[c.log.length - 1];
  const key = `paddock:debrief:${saveId}`;
  const tag = r ? `${r.season}:${r.round}:${r.series}` : "";
  const [open, setOpen] = useState(() => !!r && r.season === world.season && r.round === world.results.length && seen(key) !== tag);
  if (!open || !c || !d || !r) return null;
  const finished = r.status === "Finished" || r.status === "Lapped";
  const junior = r.series === "F2" || r.series === "F3";
  const st = junior ? juniorStandings(world, r.series as "F2" | "F3") : driverStandings(world);
  const pos = st.findIndex((x) => x.driverId === d.id) + 1;
  const gained = finished ? r.grid - r.pos : 0;
  return (
    <Screen
      cta="Continue"
      onClose={() => {
        mark(key, tag);
        setOpen(false);
      }}
    >
      <div className="kicker">
        {r.series} · round {r.round} · {circuitOf(world, r.circuitId).gp}
      </div>
      <div className="mt-6 flex flex-wrap items-end gap-x-12 gap-y-6">
        <div>
          <div className="kicker">Finish</div>
          <div className="font-display text-[10rem] font-black leading-[0.85] text-white sm:text-[13rem]">{finished ? `P${r.pos}` : "DNF"}</div>
        </div>
        <div className="grid gap-6 pb-4">
          <div>
            <div className="kicker">Rating</div>
            <div className="font-display text-7xl font-black leading-none" style={{ color: ratingTone(r.rating) }}>
              {r.rating.toFixed(1)}
            </div>
          </div>
          {r.dotd && <div className="rounded-md bg-amber-400 px-3 py-1.5 font-display text-2xl font-black uppercase text-ink-950">Driver of the Day</div>}
        </div>
      </div>
      <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ["Started", r.grid ? `P${r.grid}` : "Pit lane"],
            ["Places", finished ? (gained > 0 ? `+${gained}` : String(gained)) : r.status],
            ["XP", `+${r.xp}`],
            [`${r.series} standing`, pos ? `P${pos}` : "-"],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="rounded-lg border border-ink-700 bg-ink-900 px-5 py-4">
            <div className="kicker">{k}</div>
            <div className="mt-2 font-display text-4xl font-black text-white">{v}</div>
          </div>
        ))}
      </div>
      {(() => {
        const kind: ResultKind = !finished ? "dnf" : r.pos === 1 ? "won" : r.pos <= 3 ? "podium" : r.pos <= 10 ? "points" : "none";
        const note = homeText(world, kind);
        if (!note) return null;
        return (
          <div className="mt-8 max-w-md">
            <div className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-400">{note.name}</div>
            <div className="inline-block max-w-full rounded-3xl rounded-bl-md bg-ink-800 px-4 py-2.5 text-lg leading-snug text-slate-100">{note.text}</div>
          </div>
        );
      })()}
      {c.points > 0 && <p className="mt-6 text-lg text-slate-300">You have {c.points} upgrade point{c.points === 1 ? "" : "s"} to spend in Training.</p>}
    </Screen>
  );
}

function SeasonEnd({ world, saveId }: { world: World; saveId: string }) {
  const key = `paddock:season:${saveId}`;
  const done = !nextRound(world) && world.results.length === world.calendar.length && world.results.length > 0;
  const [open, setOpen] = useState(() => done && seen(key) !== String(world.season));
  if (!open || !done) return null;
  const ds = driverStandings(world);
  const ts = teamStandings(world);
  const champ = world.drivers.find((d) => d.id === ds[0]?.driverId);
  const ct = world.teams.find((t) => t.id === ts[0]?.teamId);
  const champTeam = world.teams.find((t) => t.id === ds[0]?.teamId);
  const color = champTeam?.color ?? "#e10600";
  const me = meOf(world);
  const myLine = (() => {
    if (me) {
      const junior = me.series === "F2" || me.series === "F3";
      const st = junior ? juniorStandings(world, me.series as "F2" | "F3") : driverStandings(world);
      const p = st.findIndex((x) => x.driverId === me.id) + 1;
      return p ? `You finished P${p} in ${me.series} with ${st[p - 1].points} points.` : null;
    }
    if (world.manager) {
      const p = ts.findIndex((x) => x.teamId === world.manager!.teamId) + 1;
      return `Your team finished P${p} in the constructors' championship. The board's target was P${world.manager.board.target}.`;
    }
    return null;
  })();
  return (
    <Screen
      cta="Into the winter"
      onClose={() => {
        mark(key, String(world.season));
        setOpen(false);
      }}
    >
      <div className="kicker">{world.season} Formula 1 World Championship</div>
      <div className="mt-6 flex flex-wrap items-stretch overflow-hidden rounded-lg border border-ink-700">
        <div className="flex w-32 items-center justify-center font-display text-7xl font-black sm:w-48 sm:text-8xl" style={{ background: color, color: onColor(color) }}>
          {champ?.num}
        </div>
        <div className="min-w-0 flex-1 bg-ink-900 px-8 py-8">
          <div className="kicker">World champion</div>
          <div className="headline mt-3">
            <span className="block text-3xl tracking-[0.15em] text-slate-300">{champ?.first}</span>
            <span className="block text-7xl sm:text-8xl">{champ?.last}</span>
          </div>
          <div className="mt-3 text-xl text-slate-400">
            {champTeam?.name} · {ds[0]?.points} points
          </div>
        </div>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-ink-700 bg-ink-900 px-5 py-4">
          <div className="kicker">Constructors</div>
          <div className="mt-2 font-display text-4xl font-black uppercase text-white">{ct?.name}</div>
        </div>
        {ds.slice(1, 3).map((r, i) => {
          const d = world.drivers.find((x) => x.id === r.driverId);
          return (
            <div key={r.driverId} className="rounded-lg border border-ink-700 bg-ink-900 px-5 py-4">
              <div className="kicker">P{i + 2}</div>
              <div className="mt-2 font-display text-4xl font-black uppercase text-white">{d?.last}</div>
              <div className="text-base text-slate-400">{r.points} points</div>
            </div>
          );
        })}
      </div>
      {myLine && <p className="mt-8 text-2xl text-slate-200">{myLine}</p>}
    </Screen>
  );
}

export function Ceremonies({ world, saveId }: { world: World; saveId: string }) {
  // the keys make each one re-check its "seen" state when the round or season changes
  return (
    <>
      <SeasonEnd key={`s${world.season}:${world.results.length}`} world={world} saveId={saveId} />
      <Debrief key={`d${world.season}:${world.results.length}:${careerOf(world)?.log.length ?? 0}`} world={world} saveId={saveId} />
    </>
  );
}
