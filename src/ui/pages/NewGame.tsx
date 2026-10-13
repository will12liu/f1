// New team-principal game or sandbox, full screen and one step at a time like the career creator:
// the team you pick takes over the left side.
import { useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { carOvr } from "../../engine/ratings";
import type { World } from "../../engine/types";
import { useGame } from "../../state/game";
import { onColor } from "../components/bits";

interface TeamCard {
  id: string;
  name: string;
  short: string;
  color: string;
  engine: string;
  budget: number;
  rank: number;
  car: number;
  drivers: string[];
}

const field = "rounded-lg border-2 border-ink-700 bg-ink-900 px-5 py-4 text-2xl text-white outline-none focus:border-race";

function Head({ title, text }: { title: string; text?: string }) {
  return (
    <div className="mb-8">
      <h1 className="headline text-6xl sm:text-7xl">{title}</h1>
      {text && <p className="mt-3 max-w-2xl text-xl text-slate-400">{text}</p>}
    </div>
  );
}

const EXPECT = (rank: number) => (rank <= 2 ? "Win the title. Nothing less." : rank <= 4 ? "Wins and podiums, and a title push." : rank <= 7 ? "Points every weekend, best of the rest." : "Beat the teams around you. Build for the future.");

export function NewGame() {
  const { mode = "" } = useParams();
  const nav = useNavigate();
  const { create, busy, error } = useGame();
  const [step, setStep] = useState(0);
  const [principal, setPrincipal] = useState("");
  const [teamId, setTeamId] = useState<string | null>(null);
  const [save, setSave] = useState("");
  const [teams, setTeams] = useState<TeamCard[]>([]);
  const [rounds, setRounds] = useState(0);
  useEffect(() => {
    fetch("/data/world-2026.json")
      .then((r) => r.json() as Promise<World>)
      .then((w) => {
        const f1 = w.teams.filter((t) => t.series === "F1");
        const order = [...f1].sort((a, b) => carOvr(b.car) - carOvr(a.car)).map((t) => t.id);
        const name = (id: string) => {
          const d = w.drivers.find((x) => x.id === id);
          return d ? `${d.first} ${d.last}` : "";
        };
        setTeams(f1.map((t) => ({ id: t.id, name: t.name, short: t.short, color: t.color, engine: t.engine, budget: t.budget, rank: order.indexOf(t.id) + 1, car: Math.round(carOvr(t.car)), drivers: t.drivers.map(name) })).sort((a, b) => a.rank - b.rank));
        setRounds(w.calendar.length);
      })
      .catch(() => setTeams([]));
  }, []);
  if (mode !== "manager" && mode !== "sandbox") return <Navigate to="/" replace />;

  const steps = mode === "manager" ? ["Name", "Team", "Ready"] : ["Ready"];
  const last = step === steps.length - 1;
  const canNext = mode === "manager" ? (step === 0 ? !!principal.trim() : step === 1 ? !!teamId : true) : true;
  const team = teams.find((t) => t.id === teamId);
  const start = async () => nav(`/g/${await create(save.trim() || (team ? team.name : "Sandbox"), mode === "manager" ? { teamId: teamId!, principal: principal.trim() } : undefined)}`);

  let content: ReactNode;
  if (mode === "manager" && step === 0)
    content = (
      <>
        <Head title="Who's in charge?" text="You run the team: drivers, staff, the factory, the partners and the money. The board judges you every season." />
        <input autoFocus className={`${field} w-full max-w-xl`} placeholder="Your name" value={principal} onChange={(e) => setPrincipal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && canNext && setStep(1)} />
      </>
    );
  else if (mode === "manager" && step === 1)
    content = (
      <>
        <Head title="Pick your team" text="Fastest car on paper first. A top team gives you a fast car and no patience; a backmarker gives you time." />
        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          {teams.map((t) => (
            <button key={t.id} onClick={() => setTeamId(t.id)} className={`overflow-hidden rounded-lg border-2 text-left ${teamId === t.id ? "border-white" : "border-ink-700 hover:border-ink-600"}`}>
              <div className="flex items-center justify-between px-5 py-3" style={{ background: t.color, color: onColor(t.color) }}>
                <span className="font-display text-3xl font-black uppercase leading-none">{t.name}</span>
                <span className="font-display text-2xl font-black">#{t.rank}</span>
              </div>
              <div className={`grid gap-1 px-5 py-4 ${teamId === t.id ? "bg-ink-800" : "bg-ink-900"}`}>
                <div className="text-base text-slate-300">{t.drivers.join(" · ")}</div>
                <div className="text-sm text-slate-500">
                  {t.engine} power · budget <span className="text-slate-200">{"$".repeat(t.budget)}</span>
                  <span className="text-ink-600">{"$".repeat(5 - t.budget)}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </>
    );
  else
    content = (
      <>
        <Head title="Ready?" text={mode === "manager" ? "The 2026 season starts in Melbourne." : `The 2026 grid, ${rounds || 23} rounds, every team run by the AI. Take any car live from the pit wall whenever you like.`} />
        {mode === "manager" && team && (
          <div className="grid max-w-3xl gap-px overflow-hidden rounded-lg border border-ink-700 bg-ink-700">
            {(
              [
                ["Principal", principal, 0],
                ["Team", `${team.name} · ${team.engine} power`, 1],
                ["Drivers", team.drivers.join(" and "), 1],
                ["The board wants", EXPECT(team.rank), 1],
              ] as const
            ).map(([k, v, s]) => (
              <button key={k} onClick={() => setStep(s)} className="flex items-baseline gap-4 bg-ink-900 px-6 py-4 text-left hover:bg-ink-800">
                <span className="kicker w-36 shrink-0">{k}</span>
                <span className="flex-1 text-xl font-semibold text-white">{v}</span>
                <span className="text-sm text-slate-500">Change</span>
              </button>
            ))}
          </div>
        )}
        <label className="mt-6 grid max-w-3xl gap-2">
          <span className="kicker">Save name</span>
          <input className={field} placeholder={team ? team.name : "Sandbox"} value={save} onChange={(e) => setSave(e.target.value)} />
        </label>
        {error && <div className="mt-3 text-base text-rose-400">{error}</div>}
      </>
    );

  const aside =
    mode === "manager" ? (
      team ? (
        <div className="w-full max-w-md text-center">
          <div className="rounded-lg px-6 py-10" style={{ background: team.color, color: onColor(team.color) }}>
            <div className="font-display text-8xl font-black leading-none">{team.short}</div>
          </div>
          <div className="headline mt-6 text-6xl">{team.name}</div>
          {principal && <div className="mt-2 text-lg text-slate-400">Team principal {principal}</div>}
          <div className="mt-6 flex justify-center gap-10">
            <div>
              <div className="kicker">Car</div>
              <div className="font-display text-5xl font-black text-white">#{team.rank}</div>
            </div>
            <div>
              <div className="kicker">Budget</div>
              <div className="font-display text-5xl font-black text-white">{team.budget}/5</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid w-full max-w-md grid-cols-4 gap-2" aria-hidden>
          {teams.map((t) => (
            <div key={t.id} className="h-20 rounded-md" style={{ background: t.color }} />
          ))}
        </div>
      )
    ) : (
      <div className="grid w-full max-w-md grid-cols-6 gap-2" aria-hidden>
        {Array.from({ length: rounds || 23 }, (_, i) => (
          <div key={i} className="flex h-14 items-center justify-center rounded-md bg-ink-700 font-display text-xl font-bold text-slate-400">
            {i + 1}
          </div>
        ))}
      </div>
    );

  return (
    <div className="flex min-h-full flex-col bg-ink-950">
      <header className="flex h-20 shrink-0 items-center gap-6 px-6 sm:px-10">
        <div className="hidden font-display text-lg font-bold uppercase tracking-[0.4em] text-slate-300 md:block">{mode === "manager" ? "Take over a team" : "New sandbox"}</div>
        <div className="flex flex-1 justify-center gap-2">
          {steps.length > 1 &&
            steps.map((s, i) => <button key={s} title={s} onClick={() => i <= step && setStep(i)} className={`h-2 w-12 rounded-sm ${i === step ? "bg-race" : i < step ? "bg-slate-400" : "bg-ink-700"}`} />)}
        </div>
        <Link to="/" className="text-lg text-slate-400 hover:text-white">
          Menu
        </Link>
      </header>
      <div className="grid flex-1 lg:grid-cols-[minmax(340px,40%)_1fr]">
        <aside className="flex items-center justify-center border-ink-800 px-6 py-10 max-lg:border-b lg:sticky lg:top-0 lg:h-screen lg:self-start lg:border-r">{aside}</aside>
        <main className="flex flex-col px-6 py-10 sm:px-12">
          <div className="flex-1">{content}</div>
          <div className="mt-10 flex items-center gap-6">
            {step > 0 && (
              <button className="text-lg text-slate-400 hover:text-white" onClick={() => setStep((s) => s - 1)}>
                ‹ Back
              </button>
            )}
            {last ? (
              <button className="btn-xl bg-race text-white hover:bg-red-500" disabled={!!busy || (mode === "manager" && (!team || !principal.trim()))} onClick={start}>
                {busy ?? "Start 2026 ›"}
              </button>
            ) : (
              <button className="btn-xl bg-race text-white hover:bg-red-500" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
                Next ›
              </button>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
