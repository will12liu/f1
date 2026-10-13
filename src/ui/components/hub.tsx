// Big-menu pieces shared by the three home screens (career, team principal, sandbox): the next-race
// banner, menu tiles and the stat strip. The detailed pages stay one click away in the top nav.
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { World } from "../../engine/types";
import { circuitOf, nextRound } from "../../engine/season/season";
import { TrackOutline } from "./bits";

export function Tile({ to, onClick, title, sub, badge, disabled }: { to?: string; onClick?: () => void; title: string; sub?: ReactNode; badge?: ReactNode; disabled?: boolean }) {
  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="font-display text-3xl font-extrabold uppercase leading-none text-white">{title}</span>
        {badge !== undefined && badge !== null && badge !== 0 && <span className="rounded-md bg-race px-2 py-0.5 font-display text-lg font-bold leading-tight text-white">{badge}</span>}
      </div>
      {sub && <div className="mt-auto pt-4 pr-6 text-sm text-slate-400">{sub}</div>}
      <span className="absolute bottom-4 right-5 font-display text-3xl leading-none text-slate-600" aria-hidden>
        ›
      </span>
    </>
  );
  return to ? (
    <Link to={to} className="tile">
      {inner}
    </Link>
  ) : (
    <button onClick={onClick} disabled={disabled} className="tile">
      {inner}
    </button>
  );
}

/** A labelled group of tiles. */
export function TileGroup({ title, children, cols = 4 }: { title: string; children: ReactNode; cols?: 3 | 4 | 5 }) {
  const grid = cols === 5 ? "lg:grid-cols-5" : cols === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4";
  return (
    <section className="grid gap-3">
      <h2 className="kicker">{title}</h2>
      <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${grid}`}>{children}</div>
    </section>
  );
}

export function BigStat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-900 px-5 py-4">
      <div className="kicker">{label}</div>
      <div className={`mt-2 font-display text-4xl font-black leading-none ${tone === "good" ? "text-emerald-300" : tone === "bad" ? "text-rose-300" : "text-white"}`}>{value}</div>
      {sub && <div className="mt-1.5 text-sm text-slate-400">{sub}</div>}
    </div>
  );
}

/** The next race, big: round, Grand Prix name, circuit facts, the track, and whatever buttons the mode needs. */
export function NextRace({ world, note, children }: { world: World; note?: ReactNode; children?: ReactNode }) {
  const next = nextRound(world);
  if (!next) return null;
  const c = circuitOf(world, next.circuitId);
  const date = new Date(next.date + "T12:00:00Z").toLocaleDateString(undefined, { month: "long", day: "numeric" });
  return (
    <section className="grid overflow-hidden rounded-lg border border-ink-700 bg-ink-900 md:grid-cols-[1fr_minmax(220px,38%)]">
      <div className="grid content-between gap-6 p-6 md:p-8">
        <div>
          <div className="kicker">
            Round {next.round} of {world.calendar.length} · {date}
          </div>
          <h1 className="headline mt-3 text-5xl sm:text-6xl xl:text-7xl">{c.gp}</h1>
          <div className="mt-3 text-base text-slate-300">
            {c.name} · {c.laps} laps · {(c.laps * c.km).toFixed(0)} km · overtaking {["easy", "fair", "average", "hard", "very hard"][c.overtake - 1]}
          </div>
          {note && <div className="mt-2 text-base text-slate-400">{note}</div>}
        </div>
        {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
      </div>
      <div className="grid place-items-center border-t border-ink-700 bg-ink-850 p-6 md:border-l md:border-t-0">
        <TrackOutline id={c.id} className="h-48 w-full md:h-64" stroke="#e2e8f0" />
      </div>
    </section>
  );
}

/** Secondary hub buttons (sim, next weekend). */
export function HubButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="rounded-lg border border-ink-600 bg-ink-800 px-5 py-3.5 text-base font-semibold text-slate-100 hover:border-slate-300 hover:bg-ink-700 disabled:opacity-40">
      {children}
    </button>
  );
}

/** The top of an inner page: kicker, big title, a line of text, and anything on the right (stats, buttons). */
export function PageHead({ kicker, title, text, right }: { kicker?: string; title: string; text?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-6">
      <div className="min-w-0 flex-1">
        {kicker && <div className="kicker">{kicker}</div>}
        <h1 className="headline mt-2 text-5xl sm:text-6xl">{title}</h1>
        {text && <p className="mt-3 max-w-3xl text-lg text-slate-400">{text}</p>}
      </div>
      {right && <div className="flex flex-wrap items-end gap-4">{right}</div>}
    </div>
  );
}

/** A big number with a label, for page headers. */
export function HeadStat({ label, value, tone }: { label: string; value: ReactNode; tone?: "good" | "bad" }) {
  return (
    <div className="text-right">
      <div className="kicker">{label}</div>
      <div className={`font-display text-5xl font-black leading-none ${tone === "good" ? "text-emerald-300" : tone === "bad" ? "text-rose-300" : "text-white"}`}>{value}</div>
    </div>
  );
}

/** A big card for lists of things you act on (offers, items, people). */
export function Card({ title, sub, tag, children, dim }: { title: ReactNode; sub?: ReactNode; tag?: ReactNode; children?: ReactNode; dim?: boolean }) {
  return (
    <div className={`flex flex-col gap-4 rounded-lg border border-ink-700 bg-ink-900 p-6 ${dim ? "opacity-50" : ""}`}>
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="font-display text-3xl font-extrabold uppercase leading-none text-white">{title}</div>
          {tag}
        </div>
        {sub && <div className="mt-2 text-base text-slate-400">{sub}</div>}
      </div>
      {children}
    </div>
  );
}

export const bigBtn = "rounded-lg px-5 py-3 font-display text-lg font-bold uppercase tracking-wide disabled:opacity-40";
export const bigRed = `${bigBtn} bg-race text-white hover:bg-red-500`;
export const bigGhost = `${bigBtn} border border-ink-600 bg-ink-800 text-slate-100 hover:border-slate-300 hover:bg-ink-700`;
