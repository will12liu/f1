import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { Ceremonies } from "./components/Ceremony";
import { useGame } from "../state/game";

const NAV = [
  ["", "Home"],
  ["calendar", "Calendar"],
  ["standings", "Standings"],
  ["teams", "Teams"],
  ["drivers", "Drivers"],
  ["juniors", "Juniors"],
  ["history", "History"],
] as const;

const CAREER_NAV = [
  ["", "My career"],
  ["training", "Training"],
  ["deals", "Deals"],
  ["life", "Life"],
  ["juniors", "Juniors"],
  ["calendar", "Calendar"],
  ["standings", "Standings"],
  ["teams", "Teams"],
  ["drivers", "Drivers"],
  ["history", "History"],
] as const;

const TEAM_NAV = [
  ["", "HQ"],
  ["rnd", "Car & R&D"],
  ["people", "People"],
  ["academy", "Academy"],
  ["partners", "Partners"],
  ["finance", "Finance"],
  ["inbox", "Inbox"],
  ["calendar", "Calendar"],
  ["standings", "Standings"],
  ["teams", "Teams"],
  ["drivers", "Drivers"],
  ["juniors", "Juniors"],
  ["history", "History"],
] as const;

export function GameLayout() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { world, meta, busy, open } = useGame();
  const [missing, setMissing] = useState(false);
  const loc = useLocation();
  useEffect(() => {
    open(id).then((ok) => setMissing(!ok));
  }, [id, open]);

  if (missing)
    return (
      <div className="grid h-full place-items-center">
        <div className="panel p-6 text-center space-y-3">
          <div>That save doesn't exist in this browser.</div>
          <button className="btn-primary" onClick={() => nav("/")}>Back</button>
        </div>
      </div>
    );
  if (!world || !meta || meta.id !== id) return <div className="grid h-full place-items-center text-slate-500">Loading…</div>;
  const base = `/g/${id}`;
  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-30 border-b border-ink-700 bg-ink-950">
        <div className="mx-auto flex h-16 max-w-[1600px] items-stretch gap-6 px-4 sm:px-6">
          <NavLink to="/" className="flex shrink-0 items-center font-display text-2xl font-black tracking-wider text-white" title="Main menu">
            PADDOCK<span className="text-race">.</span>
          </NavLink>
          <div className="hidden shrink-0 flex-col justify-center border-l border-ink-800 pl-4 2xl:flex">
            <span className="max-w-48 truncate text-sm font-semibold text-slate-200">{meta.name}</span>
            <span className="text-xs text-slate-500">{world.season} season · round {world.results.length}/{world.calendar.length}</span>
          </div>
          <nav className="-mb-px ml-auto flex items-stretch overflow-x-auto">
            {(world.mode === "career" ? CAREER_NAV : world.manager ? TEAM_NAV : NAV).map(([to, label]) => (
              <NavLink
                key={to}
                to={to ? `${base}/${to}` : base}
                end={!to}
                className={({ isActive }) =>
                  `flex items-center whitespace-nowrap border-b-[3px] px-2.5 font-display text-lg font-bold uppercase tracking-wide ${isActive ? "border-race text-white" : "border-transparent text-slate-400 hover:text-white"}`
                }
              >
                {label}
                {to === "inbox" && world.manager && world.manager.inbox.some((x) => !x.read) ? <span className="ml-1.5 rounded-sm bg-race px-1.5 text-sm font-bold leading-snug text-white">{world.manager.inbox.filter((x) => !x.read).length}</span> : null}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      {busy && (
        <div className="pointer-events-none fixed inset-x-0 top-16 z-40 flex justify-center">
          <div className="mt-3 rounded-lg bg-race px-5 py-2 text-base font-semibold text-white shadow-lg">{busy}</div>
        </div>
      )}
      {!loc.pathname.endsWith("/live") && <Ceremonies world={world} saveId={meta.id} />}
      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
