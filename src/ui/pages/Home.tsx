// The start menu: three full-height panels, one per mode, each with its own saves. Creating a game is
// its own full-screen page (NewGame).
import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { deleteSave, exportSave, importSave, listSaves, type SaveMeta } from "../../db/db";
import type { World } from "../../engine/types";

type Mode = "career" | "manager" | "sandbox";

function SaveRow({ s, onChange }: { s: SaveMeta; onChange: () => void }) {
  return (
    <div className="flex items-stretch overflow-hidden rounded-lg border border-ink-700 bg-ink-950">
      <span className="w-1.5 shrink-0" style={{ background: s.color ?? "#475569" }} />
      <Link to={`/g/${s.id}`} className="min-w-0 flex-1 px-4 py-3 hover:bg-ink-800">
        <div className="truncate text-base font-semibold text-white">{s.who ?? s.name}</div>
        <div className="truncate text-sm text-slate-400">
          {s.who ? `${s.name} · ` : ""}
          {s.season} · round {s.round}
        </div>
      </Link>
      <div className="flex shrink-0 flex-col justify-center border-l border-ink-800 text-xs">
        <button
          className="px-3 py-1.5 text-slate-400 hover:bg-ink-800 hover:text-white"
          onClick={async () => {
            const blob = await exportSave(s.id);
            if (!blob) return;
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `${s.name.replace(/[^\w-]+/g, "-")}-${s.season}.paddock.json`;
            a.click();
            URL.revokeObjectURL(a.href);
          }}
        >
          Export
        </button>
        <button
          className="px-3 py-1.5 text-slate-500 hover:bg-ink-800 hover:text-rose-300"
          onClick={async () => {
            if (confirm(`Delete "${s.name}"? This can't be undone.`)) {
              await deleteSave(s.id);
              onChange();
            }
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function ModePanel({ mode, kicker, title, cta, text, art, saves, onChange, primary }: { mode: Mode; kicker: string; title: string; cta: string; text: string; art: ReactNode; saves: SaveMeta[]; onChange: () => void; primary?: boolean }) {
  const nav = useNavigate();
  return (
    <section className="flex min-h-[640px] flex-col border-ink-800 bg-ink-900 hover:bg-[#11141a] max-lg:border-b lg:min-h-0 lg:border-r lg:last:border-r-0">
      <button onClick={() => nav(`/new/${mode}`)} className="relative flex min-h-56 flex-1 items-center justify-center overflow-hidden px-8 pt-8" aria-label={`New ${title}`}>
        {art}
      </button>
      <div className="grid gap-5 px-6 pb-8 pt-4 sm:px-10">
        <div>
          <div className="kicker">{kicker}</div>
          <h2 className="headline mt-2 text-6xl xl:text-7xl">{title}</h2>
          <p className="mt-3 max-w-md text-base text-slate-300">{text}</p>
        </div>
        <div>
          <button onClick={() => nav(`/new/${mode}`)} className={`btn-xl w-full sm:w-auto ${primary ? "bg-race text-white hover:bg-red-500" : "bg-white text-ink-950 hover:bg-slate-200"}`}>
            {cta}
          </button>
        </div>
        {saves.length > 0 && (
          <div className="grid gap-2">
            <div className="kicker">Continue</div>
            {saves.slice(0, 3).map((s) => (
              <SaveRow key={s.id} s={s} onChange={onChange} />
            ))}
            {saves.length > 3 && <div className="text-sm text-slate-500">and {saves.length - 3} older</div>}
          </div>
        )}
      </div>
    </section>
  );
}

/** Career art: the ladder, F3 to F1. */
function Ladder() {
  return (
    <div className="flex items-end gap-3 select-none" aria-hidden>
      {(
        [
          ["F3", "h-24", "bg-ink-700 text-slate-400"],
          ["F2", "h-40", "bg-ink-600 text-slate-200"],
          ["F1", "h-60", "bg-race text-white"],
        ] as const
      ).map(([k, h, cls]) => (
        <div key={k} className={`flex w-24 items-start justify-center rounded-t-md pt-3 font-display text-5xl font-black sm:w-28 ${h} ${cls}`}>
          {k}
        </div>
      ))}
    </div>
  );
}

/** Team-principal art: the grid's colours, a row of garages. */
function Garages({ teams }: { teams: { id: string; short: string; color: string }[] }) {
  if (!teams.length) return <div className="h-60" />;
  return (
    <div className="grid w-full max-w-md grid-cols-4 gap-2 select-none" aria-hidden>
      {teams.slice(0, 12).map((t) => (
        <div key={t.id} className="flex h-16 items-end rounded-md px-2 pb-1.5 font-display text-sm font-bold uppercase tracking-wide text-white/90" style={{ background: t.color }}>
          <span className="rounded-sm bg-black/45 px-1">{t.short}</span>
        </div>
      ))}
    </div>
  );
}

/** Sandbox art: the season as a strip of rounds. */
function Season({ rounds }: { rounds: number }) {
  return (
    <div className="grid w-full max-w-md grid-cols-6 gap-2 select-none" aria-hidden>
      {Array.from({ length: rounds || 24 }, (_, i) => (
        <div key={i} className={`flex h-12 items-center justify-center rounded-md font-display text-lg font-bold ${i < 4 ? "bg-slate-200 text-ink-950" : "bg-ink-700 text-slate-400"}`}>
          {i + 1}
        </div>
      ))}
    </div>
  );
}

export function Home() {
  const [saves, setSaves] = useState<SaveMeta[] | null>(null);
  const [teams, setTeams] = useState<{ id: string; short: string; color: string }[]>([]);
  const [rounds, setRounds] = useState(0);
  const refresh = () => listSaves().then(setSaves);
  useEffect(() => {
    refresh();
    fetch("/data/world-2026.json")
      .then((r) => r.json() as Promise<World>)
      .then((w) => {
        setTeams(w.teams.filter((t) => t.series === "F1").map((t) => ({ id: t.id, short: t.short, color: t.color })));
        setRounds(w.calendar.length);
      })
      .catch(() => {});
  }, []);
  const of = (m: Mode) => (saves ?? []).filter((s) => (s.mode ?? "sandbox") === m);

  return (
    <div className="flex min-h-full flex-col bg-ink-950 lg:h-full">
      <header className="flex h-16 shrink-0 items-center gap-4 border-b border-ink-800 px-6 sm:px-10">
        <div className="font-display text-3xl font-black tracking-wider text-white">
          PADDOCK<span className="text-race">.</span>
        </div>
        <div className="hidden text-sm text-slate-400 sm:block">Formula 1 on the 2026 grid</div>
        <label className="ml-auto cursor-pointer rounded-lg border border-ink-600 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-slate-300 hover:bg-ink-800">
          Import a save
          <input
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                await importSave(await f.text());
                refresh();
              } catch (err) {
                alert((err as Error).message);
              }
              e.target.value = "";
            }}
          />
        </label>
      </header>
      <div className="grid flex-1 lg:min-h-0 lg:grid-cols-3">
        <ModePanel
          mode="career"
          kicker="One driver"
          title="Career"
          cta="New career"
          text="Start in F3 or F2. Race your own races, train, sign deals, and earn a seat in Formula 1."
          art={<Ladder />}
          saves={of("career")}
          onChange={refresh}
          primary
        />
        <ModePanel
          mode="manager"
          kicker="One team"
          title="Principal"
          cta="Take over a team"
          text="Run a team: drivers, staff, R&D, partners and the cost cap. The board judges every season."
          art={<Garages teams={teams} />}
          saves={of("manager")}
          onChange={refresh}
        />
        <ModePanel
          mode="sandbox"
          kicker="The whole grid"
          title="Sandbox"
          cta="New sandbox"
          text="Sim and watch every season. Take any car live from the pit wall whenever you like."
          art={<Season rounds={rounds} />}
          saves={of("sandbox")}
          onChange={refresh}
        />
      </div>
    </div>
  );
}
