// Career creator: full screen, one step at a time, your driver taking shape on the left (NBA GM's flow).
import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ARCHETYPES, BUILD_FLOOR, BUILD_KEYS, BUILD_MAX, buildBudget, buildCost, buildShape, buildSpent, DIFFICULTY, fitBuild, presetBuild, TIERS, type Build, type NewDriver } from "../../engine/career/career";
import { NATIONALITIES, personName } from "../../engine/generate";
import { RATING_LABELS } from "../../engine/ratings";
import { makeRng } from "../../engine/rng";
import { useGame } from "../../state/game";
import { Helmet, HELMET_COLORS } from "../components/Helmet";

const NATS = NATIONALITIES;
const STEPS = ["Name", "Helmet", "Background", "Start", "Style", "Difficulty", "Review"] as const;
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
  const [numText, setNumText] = useState<string | null>(null); // the car number while you type it
  const [build, setBuild] = useState<Build>(() => presetBuild("racer", "mid", "F3"));
  const set = (p: Partial<NewDriver>) => {
    const n = { ...drv, ...p };
    // background and start set the budget: a preset is rebuilt, your own build is rescaled
    if (n.tier !== drv.tier || n.start !== drv.start) setBuild(n.archetype === "custom" ? fitBuild(build, buildBudget(n.tier, n.start)) : presetBuild(n.archetype, n.tier, n.start));
    setDrv(n);
  };
  const arch = ARCHETYPES.find((a) => a.id === drv.archetype);
  const archLabel = arch?.label ?? "Custom build";
  const tier = TIERS[drv.tier];
  const budget = buildBudget(drv.tier, drv.start);
  const spent = buildSpent(build);
  const overall = BUILD_FLOOR + Math.floor(spent / 100);
  const shape = buildShape(build);
  const bump = (k: (typeof BUILD_KEYS)[number], by: number) => {
    const v = (build[k] ?? BUILD_FLOOR) + by;
    if (v < BUILD_FLOOR || v > BUILD_MAX || spent + buildCost(k) * by > budget) return;
    setBuild({ ...build, [k]: v });
    if (drv.archetype !== "custom") setDrv((d) => ({ ...d, archetype: "custom" }));
  };
  const canNext = step === 0 ? drv.first.trim().length >= 1 && drv.last.trim().length >= 2 : true;
  const last = step === STEPS.length - 1;
  const start = async () => {
    const d = { ...drv, first: drv.first.trim(), last: drv.last.trim(), build };
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
            <div className="kicker mb-3">Car number · type it or use the buttons (2-99)</div>
            <div className="flex items-center gap-4">
              <button className="h-16 w-16 rounded-lg bg-ink-800 text-3xl font-bold text-white hover:bg-ink-700" onClick={() => set({ num: Math.max(2, (drv.num ?? 2) - 1) })}>
                -
              </button>
              <input
                inputMode="numeric"
                aria-label="Car number"
                className="w-36 rounded-lg border-2 border-ink-700 bg-ink-900 py-3 text-center font-display text-6xl font-black text-white outline-none focus:border-race"
                value={numText ?? String(drv.num)}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => {
                  const t = e.target.value.replace(/\D/g, "").slice(0, 2);
                  setNumText(t);
                  if (Number(t) >= 2) set({ num: Number(t) });
                }}
                onBlur={() => setNumText(null)}
              />
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
  else if (step === 3)
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
  else if (step === 4)
    content = (
      <>
        <Head title="Your style" text={`Pick a preset, or build your own. Every skill starts at ${BUILD_FLOOR}; spend the points where you want them. Spending them all lands on the same overall either way.`} />
        <div className="grid gap-6">
          <div className="flex flex-wrap gap-2">
            {ARCHETYPES.map((a) => (
              <button
                key={a.id}
                onClick={() => {
                  setDrv((d) => ({ ...d, archetype: a.id }));
                  setBuild(presetBuild(a.id, drv.tier, drv.start));
                }}
                className={`rounded-lg border-2 px-4 py-2.5 text-left ${drv.archetype === a.id ? "border-race bg-ink-800" : "border-ink-700 bg-ink-900 hover:border-ink-600"}`}
                title={a.blurb}
              >
                <div className="font-display text-xl font-extrabold uppercase leading-none text-white">{a.label}</div>
              </button>
            ))}
            <span className={`rounded-lg border-2 px-4 py-2.5 font-display text-xl font-extrabold uppercase leading-none ${drv.archetype === "custom" ? "border-race bg-ink-800 text-white" : "border-dashed border-ink-700 text-slate-500"}`}>Custom</span>
          </div>
          <div className="text-lg text-slate-300">{arch ? arch.blurb : "Your own mix. Your two lowest skills are your weak areas."}</div>
          <div className="flex flex-wrap items-end gap-x-10 gap-y-3 rounded-lg border border-ink-700 bg-ink-900 px-6 py-4">
            <div>
              <div className="kicker">Points left</div>
              <div className={`font-display text-6xl font-black leading-none ${budget - spent > 0 ? "text-amber-300" : "text-white"}`}>{(budget - spent).toLocaleString()}</div>
            </div>
            <div>
              <div className="kicker">Overall</div>
              <div className="font-display text-6xl font-black leading-none text-white">
                {overall}
                <span className="text-3xl text-slate-500"> / {tier.ovr[drv.start]}</span>
              </div>
            </div>
            <div className="min-w-60 flex-1 text-base text-slate-400">
              Weak areas, top out at 84: <b className="text-rose-300">{shape.weak.map((k) => RATING_LABELS[k]).join(", ")}</b>
              <br />
              Strongest: <b className="text-emerald-300">{shape.primary.map((k) => RATING_LABELS[k]).join(", ")}</b>
            </div>
            <button className="rounded-lg bg-ink-800 px-4 py-2 text-base font-semibold text-white hover:bg-ink-700" onClick={() => setBuild(fitBuild(build, budget))}>
              Use all points
            </button>
          </div>
          <div className="grid gap-x-8 gap-y-2 xl:grid-cols-2">
            {BUILD_KEYS.map((k) => {
              const v = build[k] ?? BUILD_FLOOR;
              const weak = shape.weak.includes(k);
              const strong = shape.primary.includes(k);
              const btn = "h-11 w-11 rounded-md bg-ink-800 text-xl font-bold text-white hover:bg-ink-700 disabled:opacity-30";
              return (
                <div key={k} className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-ink-800 py-2">
                  <div className="min-w-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className={`text-lg font-semibold ${weak ? "text-rose-300" : strong ? "text-emerald-300" : "text-white"}`}>{RATING_LABELS[k]}</span>
                      <span className="text-sm text-slate-500">+1 costs {buildCost(k)}</span>
                    </div>
                    <div className="mt-1.5 h-2.5 rounded-full bg-ink-800">
                      <div className="h-full rounded-full" style={{ width: `${((v - BUILD_FLOOR) / (BUILD_MAX - BUILD_FLOOR)) * 100}%`, background: weak ? "#fb7185" : strong ? "#34d399" : "#94a3b8" }} />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button className={btn} disabled={v - 5 < BUILD_FLOOR} onClick={() => bump(k, -5)}>
                      «
                    </button>
                    <button className={btn} disabled={v <= BUILD_FLOOR} onClick={() => bump(k, -1)}>
                      -
                    </button>
                    <span className="w-12 text-center font-display text-3xl font-black text-white">{v}</span>
                    <button className={btn} disabled={v >= BUILD_MAX || spent + buildCost(k) > budget} onClick={() => bump(k, 1)}>
                      +
                    </button>
                    <button className={btn} disabled={v + 5 > BUILD_MAX || spent + buildCost(k) * 5 > budget} onClick={() => bump(k, 5)}>
                      »
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <label className="grid max-w-xl gap-2">
            <span className="flex justify-between">
              <span className="kicker">Aggression (style, free)</span>
              <span className="font-display text-2xl font-black text-white">{build.aggression ?? 60}</span>
            </span>
            <input type="range" min={30} max={90} value={build.aggression ?? 60} onChange={(e) => setBuild({ ...build, aggression: Number(e.target.value) })} className="accent-red-600" />
            <span className="text-sm text-slate-500">Higher: braver moves, more contact and more penalties.</span>
          </label>
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
              ["Style", `${archLabel} · ${shape.primary.map((k) => RATING_LABELS[k]).join(", ")}`, 4],
              ["Background", tier.label, 2],
              ["Start", `${drv.start} · age ${drv.start === "F3" ? 17 : 19} · ${overall} overall, potential ${tier.pot}`, 3],
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
        <aside className="relative flex flex-col items-center justify-center overflow-hidden border-ink-800 px-6 py-8 max-lg:border-b lg:sticky lg:top-0 lg:h-screen lg:self-start lg:border-r">
          <div className="pointer-events-none absolute inset-x-0 top-6 select-none text-center font-display text-[13rem] font-black leading-none text-transparent sm:text-[17rem]" style={{ WebkitTextStroke: `3px ${drv.helmet}55` }}>
            {drv.num}
          </div>
          <Helmet color={drv.helmet ?? HELMET_COLORS[0]} num={drv.num} className="relative z-10 mt-24 w-64 sm:w-80" />
          <div className="relative z-10 mt-6 text-center">
            {drv.first && <div className="font-display text-2xl font-bold uppercase tracking-[0.2em] text-slate-400">{drv.first}</div>}
            <div className="headline text-6xl">{drv.last || "Your driver"}</div>
            <div className="mt-2 text-lg text-slate-400">
              {drv.nat}
              {step >= 3 ? ` · ${drv.start}` : ""}
              {step >= 4 ? ` · ${archLabel}` : ""}
            </div>
            {step >= 2 && (
              <div className="mt-5 flex justify-center gap-8">
                <div>
                  <div className="kicker">Overall</div>
                  <div className="font-display text-5xl font-black text-white">{step >= 4 ? overall : tier.ovr[drv.start]}</div>
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
