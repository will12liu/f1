import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { deleteSave, listSaves, type SaveMeta } from "../../db/db";
import { useGame } from "../../state/game";
import type { World } from "../../engine/types";
import { ARCHETYPES, DIFFICULTY, TIERS, type NewDriver } from "../../engine/career/career";

const NATS = ["British", "Italian", "French", "German", "Dutch", "Spanish", "Brazilian", "Japanese", "Australian", "American", "Chinese", "Indian", "Swedish", "Argentine", "Mexican", "Belgian", "Danish", "Polish", "Estonian", "New Zealander", "Canadian", "Finnish", "Monegasque", "Thai"];

export function Home() {
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const [name, setName] = useState("My F1 world");
  const [mode, setMode] = useState<"manager" | "sandbox" | "career">("career");
  const [drv, setDrv] = useState<NewDriver>({ first: "", last: "", nat: "British", archetype: "racer", tier: "mid", start: "F3", difficulty: "pro" });
  const [principal, setPrincipal] = useState("");
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teams, setTeams] = useState<{ id: string; name: string; color: string; budget: number; rank: number }[]>([]);
  useEffect(() => {
    fetch("/data/world-2026.json")
      .then((r) => r.json() as Promise<World>)
      .then((w) => {
        const f1 = w.teams.filter((t) => t.series === "F1");
        const score = (t: (typeof f1)[number]) => t.car.power + t.car.aero + t.car.mech;
        const order = [...f1].sort((a, b) => score(b) - score(a)).map((t) => t.id);
        setTeams(f1.map((t) => ({ id: t.id, name: t.name, color: t.color, budget: t.budget, rank: order.indexOf(t.id) + 1 })).sort((a, b) => a.rank - b.rank));
      })
      .catch(() => setTeams([]));
  }, []);
  const { create, busy, error } = useGame();
  const nav = useNavigate();
  const refresh = () => listSaves().then(setSaves);
  useEffect(() => {
    refresh();
  }, []);
  return (
    <div className="mx-auto max-w-2xl p-6 space-y-6">
      <div className="pt-8">
        <h1 className="font-display text-5xl font-black tracking-wider">
          PADDOCK<span className="text-race">.</span>
        </h1>
        <p className="text-slate-400 mt-1">Formula 1 on the 2026 grid. Run a team, or run the whole sport.</p>
      </div>
      <div className="panel p-4 grid gap-4">
        <h2 className="font-display text-xl font-bold uppercase">New game</h2>
        <div className="grid sm:grid-cols-3 gap-2">
          {(
            [
              ["career", "Driver career", "You are one driver. Start in F3 or F2, race your own races, train, sign deals, earn an F1 seat."],
              ["manager", "Team principal", "Run one team: drivers, staff, R&D, partners, money, the cost cap. The board judges you."],
              ["sandbox", "Sandbox", "Watch and sim the whole grid season after season. Drive any car live from the pit wall."],
            ] as const
          ).map(([k, title, text]) => (
            <button key={k} onClick={() => setMode(k)} className={`rounded-lg border p-3 text-left ${mode === k ? "border-white bg-ink-800" : "border-ink-700 hover:border-ink-600"}`}>
              <div className="font-semibold">{title}</div>
              <div className="mt-1 text-xs text-slate-400">{text}</div>
            </button>
          ))}
        </div>
        <label className="grid gap-1 text-xs text-slate-400">
          Save name
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        {mode === "career" && (
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1 text-xs text-slate-400">
                First name
                <input className="input" value={drv.first} onChange={(e) => setDrv({ ...drv, first: e.target.value })} />
              </label>
              <label className="grid gap-1 text-xs text-slate-400">
                Last name
                <input className="input" value={drv.last} onChange={(e) => setDrv({ ...drv, last: e.target.value })} />
              </label>
            </div>
            <label className="grid gap-1 text-xs text-slate-400">
              Nationality
              <select className="input" value={drv.nat} onChange={(e) => setDrv({ ...drv, nat: e.target.value })}>
                {NATS.map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <div className="grid gap-1">
              <div className="text-xs text-slate-400">Driving style</div>
              <div className="grid sm:grid-cols-2 gap-1">
                {ARCHETYPES.map((a) => (
                  <button key={a.id} onClick={() => setDrv({ ...drv, archetype: a.id })} className={`rounded-md px-2.5 py-2 text-left text-sm ${drv.archetype === a.id ? "bg-ink-700 text-white" : "bg-ink-850 hover:bg-ink-800"}`}>
                    <div className="font-semibold">{a.label}</div>
                    <div className="text-xs text-slate-400">{a.blurb}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-1">
              <div className="text-xs text-slate-400">Background</div>
              <div className="grid sm:grid-cols-3 gap-1">
                {(Object.keys(TIERS) as (keyof typeof TIERS)[]).map((k) => (
                  <button key={k} onClick={() => setDrv({ ...drv, tier: k })} className={`rounded-md px-2.5 py-2 text-left text-sm ${drv.tier === k ? "bg-ink-700 text-white" : "bg-ink-850 hover:bg-ink-800"}`}>
                    <div className="font-semibold">{TIERS[k].label}</div>
                    <div className="text-xs text-slate-400">{TIERS[k].blurb}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="grid gap-1">
                <div className="text-xs text-slate-400">Start in</div>
                <div className="flex gap-1">
                  {(["F3", "F2"] as const).map((k) => (
                    <button key={k} onClick={() => setDrv({ ...drv, start: k })} className={`btn !px-3 !py-1 ${drv.start === k ? "bg-race text-white" : "bg-ink-800 text-slate-300 hover:bg-ink-700"}`}>
                      {k} {k === "F3" ? "(age 17)" : "(age 19)"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-1">
                <div className="text-xs text-slate-400">Difficulty</div>
                <div className="flex gap-1">
                  {(Object.keys(DIFFICULTY) as (keyof typeof DIFFICULTY)[]).map((k) => (
                    <button key={k} onClick={() => setDrv({ ...drv, difficulty: k })} className={`btn !px-3 !py-1 ${drv.difficulty === k ? "bg-race text-white" : "bg-ink-800 text-slate-300 hover:bg-ink-700"}`}>
                      {DIFFICULTY[k].label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
        {mode === "manager" && (
          <>
            <label className="grid gap-1 text-xs text-slate-400">
              Your name
              <input className="input" value={principal} onChange={(e) => setPrincipal(e.target.value)} />
            </label>
            <div className="grid gap-1">
              <div className="text-xs text-slate-400">Team</div>
              <div className="grid sm:grid-cols-2 gap-1">
                {teams.map((t) => (
                  <button key={t.id} onClick={() => setTeamId(t.id)} className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm ${teamId === t.id ? "bg-ink-700 text-white" : "bg-ink-850 hover:bg-ink-800"}`}>
                    <span className="h-5 w-1 rounded-sm" style={{ background: t.color }} />
                    <span className="flex-1 font-semibold">{t.name}</span>
                    <span className="text-xs text-slate-400">
                      car #{t.rank} · budget {"$".repeat(t.budget)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        <div>
          <button
            className="btn-primary"
            disabled={!!busy || !name.trim() || (mode === "manager" && (!teamId || !principal.trim())) || (mode === "career" && (!drv.first.trim() || !drv.last.trim()))}
            onClick={async () =>
              nav(`/g/${await create(name.trim(), mode === "manager" ? { teamId: teamId!, principal: principal.trim() } : undefined, mode === "career" ? { ...drv, first: drv.first.trim(), last: drv.last.trim() } : undefined)}`)
            }
          >
            {busy ?? "Start 2026"}
          </button>
        </div>
        {error && <div className="text-sm text-rose-400">{error}</div>}
      </div>
      {saves.length > 0 && (
        <div className="panel divide-y divide-ink-800">
          {saves.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-3">
              <Link to={`/g/${s.id}`} className="flex-1">
                <div className="font-semibold">{s.name}</div>
                <div className="text-xs text-slate-500">
                  {s.season} season · round {s.round} · {new Date(s.updatedAt).toLocaleString()}
                </div>
              </Link>
              <button
                className="text-xs text-slate-500 hover:text-rose-400"
                onClick={async () => {
                  if (confirm(`Delete "${s.name}"?`)) {
                    await deleteSave(s.id);
                    refresh();
                  }
                }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
