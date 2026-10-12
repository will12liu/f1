import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { deleteSave, listSaves, type SaveMeta } from "../../db/db";
import { useGame } from "../../state/game";

export function Home() {
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const [name, setName] = useState("My F1 world");
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
        <p className="text-slate-400 mt-1">A Formula 1 career sim. Start from the 2026 grid and race the season.</p>
      </div>
      <div className="panel p-4 space-y-3">
        <h2 className="font-display text-xl font-bold uppercase">New world</h2>
        <div className="flex gap-2">
          <input className="input flex-1" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn-primary" disabled={!!busy || !name.trim()} onClick={async () => nav(`/g/${await create(name.trim())}`)}>
            {busy ?? "Start 2026"}
          </button>
        </div>
        {error && <div className="text-sm text-rose-400">{error}</div>}
        <p className="text-xs text-slate-500">Driver career mode (F3 → F2 → F1) comes in a later phase. For now you run the whole grid.</p>
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
