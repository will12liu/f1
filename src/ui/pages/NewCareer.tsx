// Career creator: full screen, one step at a time, your driver taking shape on the left (NBA GM's flow).
import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ARCHETYPES, DIFFICULTY, TIERS, type NewDriver } from "../../engine/career/career";
import { personName } from "../../engine/generate";
import { RATING_LABELS } from "../../engine/ratings";
import { makeRng } from "../../engine/rng";
import { useGame } from "../../state/game";
import { Helmet, HELMET_COLORS } from "../components/Helmet";

const NATS = ["British", "Italian", "French", "German", "Dutch", "Spanish", "Brazilian", "Japanese", "Australian", "American", "Chinese", "Indian", "Swedish", "Argentine", "Mexican", "Belgian", "Danish", "Polish", "Estonian", "New Zealander", "Canadian", "Finnish", "Monegasque", "Thai"];
const STEPS = ["Name", "Helmet", "Style", "Background", "Start", "Difficulty", "Review"] as const;
const DIFF_TEXT: Record<keyof typeof DIFFICULTY, string> = {
  rookie: "More XP, and your moves in duels work more often. Learn the game.",
  pro: "The game as it's balanced. Fair duels, normal XP.",
  champion: "Less XP, and rivals read your moves better.",
  legend: "The slow road. Every place is earned.",
};

function Choice({ on, onClick, title, tag, children }: { on: boolean; onClick: () => void; title: string; tag?: string; children?: ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-lg border-2 p-6 text-left ${on ? "border-race bg-ink-800" : "border-ink-700 bg-ink-900 hover:border-ink-600 hover:bg-ink-850"}`}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="font-display text-3xl font-extrabold uppercase leading-none text-white">{title}</div>
        {tag && <span className="text-sm font-bold uppercase tracking-widest text-race">{tag}</span>}
      </div>
      {children && <div className="mt-3 text-lg leading-snug text-slate-300">{children}</div>}
    </button>
  );
}

function Head({ title, text }: { title: string; text?: string }) {
  return (
    <div className="mb-8">
      <h1 className="headline text-6xl sm:text-7xl">{title}</h1>
      {text && <p className="mt-3 max-w-2xl text-xl text-slate-400">{text}</p>}
    </div>
  );
}

const field = "rounded-lg border-2 border-ink-700 bg-ink-900 px-5 py-4 text-2xl text-white outline-none focus:border-race";

export function NewCareer() {
  const nav = useNavigate();
  const { create, busy, error } = useGame();
  const [step, setStep] = useState(0);
  const [drv, setDrv] = useState<NewDriver>(() => ({ first: "", last: "", nat: "British", archetype: "racer", tier: "mid", start: "F3", difficulty: "pro", num: 2 + Math.floor(Math.random() * 97), helmet: HELMET_COLORS[0] }));
  const [save, setSave] = useState("");
  const set = (p: Partial<NewDriver>) => setDrv((d) => ({ ...d, ...p }));
  const arch = ARCHETYPES.find((a) => a.id === drv.archetype)!;
  const tier = TIERS[drv.tier];
  const canNext = step === 0 ? drv.first.trim().length >= 1 && drv.last.trim().length >= 2 : true;
  const last = step === STEPS.length - 1;
  const start = async () => {
    const d = { ...drv, first: drv.first.trim(), last: drv.last.trim() };
    nav(`/g/${await create(save.trim() || `${d.first} ${d.last}`, undefined, d)}`);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && canNext && !last) setStep((s) => s + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canNext, last]);
  const random = () => {
    const n = personName(makeRng(Math.floor(Math.random() * 2 ** 31)));
    set({ first: n.first, last: n.last, nat: NATS.includes(n.nat) ? n.nat : drv.nat });
  };

  let content: ReactNode;
  if (step === 0)
    content = (
      <>
        <Head title="Who are you?" text="Every champion starts with a name. Yours goes on the timing screens, the car and, one day, the trophy." />
        <div className="grid max-w-3xl gap-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <input autoFocus className={field} placeholder="First name" value={drv.first} onChange={(e) => set({ first: e.target.value })} />
            <input className={field} placeholder="Last name" value={drv.last} onChange={(e) => set({ last: e.target.value })} />
            <button onClick={random} className="rounded-lg border-2 border-ink-700 bg-ink-800 px-6 text-lg font-semibold text-white hover:border-slate-300">
              Random
            </button>
          </div>
          <label className="grid gap-2">
            <span className="kicker">Nationality</span>
            <select className={field} value={drv.nat} onChange={(e) => set({ nat: e.target.value })}>
              {NATS.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
        </div>
      </>
    );
  else if (step === 1)
    content = (
      <>
        <Head title="Your helmet" text="Your colour and your number. They follow you from F3 to the front of the grid." />
        <div className="grid max-w-3xl gap-8">
          <div>
            <div className="kicker mb-3">Colour</div>
            <div className="grid grid-cols-6 gap-3">
              {HELMET_COLORS.map((c) => (
                <button key={c} onClick={() => set({ helmet: c })} className={`h-16 rounded-lg border-4 ${drv.helmet === c ? "border-white" : "border-ink-800 hover:border-ink-600"}`} style={{ background: c }} aria-label={c} />
              ))}
            </div>
          </div>
          <div>
            <div className="kicker mb-3">Car number</div>
            <div className="flex items-center gap-4">
              <button className="h-16 w-16 rounded-lg bg-ink-800 text-3xl font-bold text-white hover:bg-ink-700" onClick={() => set({ num: Math.max(2, (drv.num ?? 2) - 1) })}>
                -
              </button>
              <div className="w-32 rounded-lg border-2 border-ink-700 bg-ink-900 py-3 text-center font-display text-6xl font-black text-white">{drv.num}</div>
              <button className="h-16 w-16 rounded-lg bg-ink-800 text-3xl font-bold text-white hover:bg-ink-700" onClick={() => set({ num: Math.min(99, (drv.num ?? 2) + 1) })}>
                +
              </button>
            </div>
          </div>
        </div>
      </>
    );
  else if (step === 2)
    content = (
      <>
        <Head title="Your style" text="Your style sets your strengths. The weak areas top out at 84 for good." />
        <div className="grid gap-4 xl:grid-cols-2">
          {ARCHETYPES.map((a) => (
            <Choice key={a.id} on={drv.archetype === a.id} onClick={() => set({ archetype: a.id })} title={a.label}>
              {a.blurb}
              <div className="mt-4 flex flex-wrap gap-2 text-base font-semibold">
                {a.primary.map((k) => (
                  <span key={k} className="rounded-md bg-emerald-500/15 px-2.5 py-1 text-emerald-300">
                    {RATING_LABELS[k]}
                  </span>
                ))}
                {a.weak.map((k) => (
                  <span key={k} className="rounded-md bg-rose-500/15 px-2.5 py-1 text-rose-300">
                    {RATING_LABELS[k]}
                  </span>
                ))}
              </div>
            </Choice>
          ))}
        </div>
      </>
    );
  else if (step === 3)
    content = (
      <>
        <Head title="Background" text="Where you come from: talent, money and how much the paddock knows your name." />
        <div className="grid gap-4">
          {(Object.keys(TIERS) as (keyof typeof TIERS)[]).map((k) => (
            <Choice key={k} on={drv.tier === k} onClick={() => set({ tier: k })} title={TIERS[k].label} tag={`Potential ${TIERS[k].pot}`}>
              {TIERS[k].blurb}
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-base text-slate-400">
                <span>
                  Starts at <b className="text-white">{TIERS[k].ovr[drv.start]}</b> overall
                </span>
                <span>
                  Bank <b className="text-white">${(TIERS[k].cash / 1e6).toFixed(1)}M</b>
                </span>
                <span>
                  Fame <b className="text-white">{TIERS[k].fame}</b>
                </span>
              </div>
            </Choice>
          ))}
        </div>
      </>
    );
  else if (step === 4)
    content = (
      <>
        <Head title="Where you start" text="F3 is the long road with time to grow. F2 is one step from Formula 1, and the paddock is watching." />
        <div className="grid gap-4 sm:grid-cols-2">
          {(["F3", "F2"] as const).map((k) => (
            <button key={k} onClick={() => set({ start: k })} className={`rounded-lg border-2 p-8 text-left ${drv.start === k ? "border-race bg-ink-800" : "border-ink-700 bg-ink-900 hover:border-ink-600 hover:bg-ink-850"}`}>
              <div className="font-display text-9xl font-black leading-none text-white">{k}</div>
              <div className="mt-4 text-xl text-slate-300">{k === "F3" ? "Formula 3 · age 17" : "Formula 2 · age 19"}</div>
              <div className="mt-1 text-base text-slate-400">Starts at {tier.ovr[k]} overall</div>
            </button>
          ))}
        </div>
      </>
    );
  else if (step === 5)
    content = (
      <>
        <Head title="Difficulty" />
        <div className="grid gap-4 sm:grid-cols-2">
          {(Object.keys(DIFFICULTY) as (keyof typeof DIFFICULTY)[]).map((k) => (
            <Choice key={k} on={drv.difficulty === k} onClick={() => set({ difficulty: k })} title={DIFFICULTY[k].label} tag={`${Math.round(DIFFICULTY[k].xp * 100)}% XP`}>
              {DIFF_TEXT[k]}
            </Choice>
          ))}
        </div>
      </>
    );
  else
    content = (
      <>
        <Head title="Ready?" text="The 2026 season starts in Melbourne." />
        <div className="grid max-w-3xl gap-px overflow-hidden rounded-lg border border-ink-700 bg-ink-700">
          {(
            [
              ["Driver", `${drv.first} ${drv.last} · #${drv.num}`, 0],
              ["Nationality", drv.nat, 0],
              ["Style", arch.label, 2],
              ["Background", tier.label, 3],
              ["Start", `${drv.start} · age ${drv.start === "F3" ? 17 : 19} · ${tier.ovr[drv.start]} overall, potential ${tier.pot}`, 4],
              ["Difficulty", DIFFICULTY[drv.difficulty].label, 5],
            ] as const
          ).map(([k, v, s]) => (
            <button key={k} onClick={() => setStep(s)} className="flex items-baseline gap-4 bg-ink-900 px-6 py-4 text-left hover:bg-ink-800">
              <span className="kicker w-32 shrink-0">{k}</span>
              <span className="flex-1 text-xl font-semibold text-white">{v}</span>
              <span className="text-sm text-slate-500">Change</span>
            </button>
          ))}
        </div>
        <label className="mt-6 grid max-w-3xl gap-2">
          <span className="kicker">Save name</span>
          <input className={field} placeholder={`${drv.first} ${drv.last}`} value={save} onChange={(e) => setSave(e.target.value)} />
        </label>
        {error && <div className="mt-3 text-base text-rose-400">{error}</div>}
      </>
    );

  return (
    <div className="flex min-h-full flex-col bg-ink-950">
      <header className="flex h-20 shrink-0 items-center gap-6 px-6 sm:px-10">
        <div className="hidden font-display text-lg font-bold uppercase tracking-[0.4em] text-slate-300 md:block">Create your driver</div>
        <div className="flex flex-1 justify-center gap-2">
          {STEPS.map((s, i) => (
            <button key={s} title={s} disabled={i > step && !canNext} onClick={() => i <= step && setStep(i)} className={`h-2 w-8 rounded-sm sm:w-12 ${i === step ? "bg-race" : i < step ? "bg-slate-400" : "bg-ink-700"}`} />
          ))}
        </div>
        <Link to="/" className="text-lg text-slate-400 hover:text-white">
          Menu
        </Link>
      </header>
      <div className="grid flex-1 lg:grid-cols-[minmax(340px,40%)_1fr]">
        <aside className="relative flex flex-col items-center justify-center overflow-hidden border-ink-800 px-6 py-8 max-lg:border-b lg:border-r">
          <div className="pointer-events-none absolute inset-x-0 top-6 select-none text-center font-display text-[13rem] font-black leading-none text-transparent sm:text-[17rem]" style={{ WebkitTextStroke: `3px ${drv.helmet}55` }}>
            {drv.num}
          </div>
          <Helmet color={drv.helmet ?? HELMET_COLORS[0]} num={drv.num} className="relative z-10 mt-24 w-64 sm:w-80" />
          <div className="relative z-10 mt-6 text-center">
            {drv.first && <div className="font-display text-2xl font-bold uppercase tracking-[0.2em] text-slate-400">{drv.first}</div>}
            <div className="headline text-6xl">{drv.last || "Your driver"}</div>
            <div className="mt-2 text-lg text-slate-400">
              {drv.nat}
              {step >= 2 ? ` · ${arch.label}` : ""}
              {step >= 4 ? ` · ${drv.start}` : ""}
            </div>
            {step >= 3 && (
              <div className="mt-5 flex justify-center gap-8">
                <div>
                  <div className="kicker">Overall</div>
                  <div className="font-display text-5xl font-black text-white">{tier.ovr[drv.start]}</div>
                </div>
                <div>
                  <div className="kicker">Potential</div>
                  <div className="font-display text-5xl font-black text-slate-500">{tier.pot}</div>
                </div>
              </div>
            )}
          </div>
        </aside>
        <main className="flex flex-col px-6 py-10 sm:px-12">
          <div className="flex-1">{content}</div>
          <div className="mt-10 flex items-center gap-6">
            {step > 0 && (
              <button className="text-lg text-slate-400 hover:text-white" onClick={() => setStep((s) => s - 1)}>
                ‹ Back
              </button>
            )}
            {last ? (
              <button className="btn-xl bg-race text-white hover:bg-red-500" disabled={!!busy} onClick={start}>
                {busy ?? "Start the career ›"}
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
