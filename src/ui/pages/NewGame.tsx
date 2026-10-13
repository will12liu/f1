// New game, full screen: one page per mode with big choices, and the start button pinned at the bottom.
import { useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useGame } from "../../state/game";
import type { World } from "../../engine/types";

const TITLE = { manager: "Take over a team", sandbox: "New sandbox" } as const;

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-t border-ink-800 py-8 md:grid-cols-[220px_1fr] md:gap-8">
      <div className="flex items-baseline gap-3 md:block">
        <div className="font-display text-5xl font-black leading-none text-ink-600">{String(n).padStart(2, "0")}</div>
        <h2 className="font-display text-2xl font-extrabold uppercase text-white md:mt-2">{title}</h2>
      </div>
      <div>{children}</div>
    </section>
  );
}

export function Choice({ on, onClick, title, text, right }: { on: boolean; onClick: () => void; title: ReactNode; text?: ReactNode; right?: ReactNode }) {
  return (
    <button onClick={onClick} className={`flex items-start gap-3 rounded-lg border-2 p-5 text-left ${on ? "border-white bg-ink-800" : "border-ink-700 bg-ink-900 hover:border-ink-600 hover:bg-ink-850"}`}>
      <div className="min-w-0 flex-1">
        <div className="font-display text-2xl font-extrabold uppercase leading-none text-white">{title}</div>
        {text && <div className="mt-2 text-sm text-slate-400">{text}</div>}
      </div>
      {right}
    </button>
  );
}

const field = "rounded-lg border border-ink-700 bg-ink-900 px-4 py-3 text-lg text-white outline-none focus:border-white";

export function NewGame() {
  const { mode = "" } = useParams();
  const nav = useNavigate();
  const { create, busy, error } = useGame();
  const [name, setName] = useState("My F1 world");
  const [principal, setPrincipal] = useState("");
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teams, setTeams] = useState<{ id: string; name: string; color: string; budget: number; rank: number; drivers: string }[]>([]);
  useEffect(() => {
    fetch("/data/world-2026.json")
      .then((r) => r.json() as Promise<World>)
      .then((w) => {
        const f1 = w.teams.filter((t) => t.series === "F1");
        const score = (t: (typeof f1)[number]) => t.car.power + t.car.aero + t.car.mech;
        const order = [...f1].sort((a, b) => score(b) - score(a)).map((t) => t.id);
        const last = (id: string) => w.drivers.find((d) => d.id === id)?.last ?? "";
        setTeams(f1.map((t) => ({ id: t.id, name: t.name, color: t.color, budget: t.budget, rank: order.indexOf(t.id) + 1, drivers: t.drivers.map(last).join(" · ") })).sort((a, b) => a.rank - b.rank));
      })
      .catch(() => setTeams([]));
  }, []);
  if (mode !== "manager" && mode !== "sandbox") return <Navigate to="/" replace />;

  const ready = !!name.trim() && (mode !== "manager" || (!!teamId && !!principal.trim()));
  const start = async () => nav(`/g/${await create(name.trim(), mode === "manager" ? { teamId: teamId!, principal: principal.trim() } : undefined)}`);
  const team = teams.find((t) => t.id === teamId);
  const summary =
    mode === "manager"
        ? team
          ? `${principal || "You"} at ${team.name}`
          : "Pick a team"
        : "The 2026 grid, every team run by the AI";
  let n = 0;

  return (
    <div className="min-h-full bg-ink-950 pb-28">
      <header className="flex h-16 items-center gap-4 border-b border-ink-800 px-6 sm:px-10">
        <Link to="/" className="rounded-lg px-3 py-2 text-base font-semibold text-slate-300 hover:bg-ink-800 hover:text-white">
          ‹ Main menu
        </Link>
        <div className="ml-auto font-display text-2xl font-black tracking-wider text-white">
          PADDOCK<span className="text-race">.</span>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 sm:px-10">
        <h1 className="headline pb-8 pt-10 text-6xl sm:text-8xl">{TITLE[mode]}</h1>

        {mode === "manager" && (
          <>
            <Step n={++n} title="Your name">
              <input className={`${field} w-full max-w-md`} value={principal} placeholder="Team principal" onChange={(e) => setPrincipal(e.target.value)} />
            </Step>
            <Step n={++n} title="Team">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {teams.map((t) => (
                  <button key={t.id} onClick={() => setTeamId(t.id)} className={`overflow-hidden rounded-lg border-2 text-left ${teamId === t.id ? "border-white" : "border-ink-700 hover:border-ink-600"}`}>
                    <div className="h-3" style={{ background: t.color }} />
                    <div className={`p-5 ${teamId === t.id ? "bg-ink-800" : "bg-ink-900 hover:bg-ink-850"}`}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-display text-3xl font-extrabold uppercase leading-none text-white">{t.name}</span>
                        <span className="font-display text-2xl font-black text-slate-500">#{t.rank}</span>
                      </div>
                      <div className="mt-2 text-sm text-slate-400">{t.drivers}</div>
                      <div className="mt-1 text-sm text-slate-400">
                        Car #{t.rank} on paper · budget <span className="text-slate-200">{"$".repeat(t.budget)}</span>
                        <span className="text-ink-600">{"$".repeat(5 - t.budget)}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </Step>
          </>
        )}

        <Step n={++n} title="Save name">
          <input className={`${field} w-full max-w-md`} value={name} onChange={(e) => setName(e.target.value)} />
        </Step>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-ink-700 bg-ink-900">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-4 sm:px-10">
          <div className="min-w-0 flex-1">
            <div className="kicker">{mode === "manager" ? "Team principal" : "Sandbox"}</div>
            <div className="truncate text-lg font-semibold text-white">{summary}</div>
            {error && <div className="text-sm text-rose-400">{error}</div>}
          </div>
          <button className="btn-xl bg-race text-white hover:bg-red-500" disabled={!!busy || !ready} onClick={start}>
            {busy ?? "Start 2026 ›"}
          </button>
        </div>
      </div>
    </div>
  );
}
