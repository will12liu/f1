import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import { useGame } from "../state/game";

const NAV = [
  ["", "Home"],
  ["calendar", "Calendar"],
  ["standings", "Standings"],
  ["teams", "Teams"],
  ["drivers", "Drivers"],
  ["history", "History"],
] as const;

export function GameLayout() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { world, meta, busy, open } = useGame();
  const [missing, setMissing] = useState(false);
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
      <header className="sticky top-0 z-30 bg-ink-950/95 backdrop-blur border-b border-ink-800">
        <div className="mx-auto max-w-7xl px-4 flex items-center gap-4 h-12">
          <NavLink to="/" className="font-display text-xl font-black tracking-wider text-white">
            PADDOCK<span className="text-race">.</span>
          </NavLink>
          <span className="hidden sm:inline text-xs text-slate-500">{meta.name} · {world.season}</span>
          <nav className="flex gap-1 overflow-x-auto text-sm ml-auto">
            {NAV.map(([to, label]) => (
              <NavLink
                key={to}
                to={to ? `${base}/${to}` : base}
                end={!to}
                className={({ isActive }) => `px-2.5 py-1.5 rounded-md whitespace-nowrap ${isActive ? "bg-ink-800 text-white" : "text-slate-400 hover:text-white"}`}
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      {busy && (
        <div className="fixed inset-x-0 top-12 z-40 flex justify-center pointer-events-none">
          <div className="mt-3 rounded-full bg-race px-4 py-1.5 text-sm font-semibold text-white shadow-lg">{busy}</div>
        </div>
      )}
      <main className="mx-auto max-w-7xl p-4">
        <Outlet />
      </main>
    </div>
  );
}
