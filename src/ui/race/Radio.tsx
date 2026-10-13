// Team radio, for fun: the engineer talks when something happens to your car (a pass, a stop, a penalty, the
// flag), and you can key the radio to ask about tyres, gaps, fuel or the plan. Display only: it reads the replay
// and the forecast, never the race RNG, so it can't change a result.
import { useEffect, useRef, useState } from "react";
import type { Forecast } from "../../engine/race/dials";
import { COMPOUNDS } from "../../engine/race/model";
import type { RaceView } from "../../engine/race/replay";
import type { Replay } from "../../engine/types";

type Line = { who: "eng" | "me"; text: string };
const pick = (arr: string[], k: number) => arr[Math.abs(k) % arr.length];
const gap = (x: number | null | undefined) => (x === null || x === undefined ? "-" : x >= 60 ? "over a minute" : `${x.toFixed(1)}`);

export function Radio({ replay, view, t, car, code, engineer = "Engineer", forecast }: { replay: Replay; view: RaceView; t: number; car: number; code: string; engineer?: string; forecast?: () => Forecast | null }) {
  const [lines, setLines] = useState<{ l: Line[]; at: number } | null>(null);
  const [open, setOpen] = useState(false);
  const lastT = useRef(t);
  const finished = useRef(false);
  const me = view.cars.find((c) => c.idx === car);
  const say = (l: Line[]) => setLines({ l, at: performance.now() });

  // the engineer reacts to what just happened to your car
  useEffect(() => {
    const from = lastT.current;
    lastT.current = t;
    if (t < from || !me) return; // a jump back on the scrubber
    const pos = me.pos;
    const evs = replay.events.filter((e) => e.t > from && e.t <= t && (e.a === car || e.b === car));
    const e = evs[evs.length - 1];
    if (view.flag === "chequered" && !finished.current && me.lap >= replay.laps) {
      finished.current = true;
      say([{ who: "eng", text: pos === 1 ? "YES! P1! You won it! Unbelievable job, mate!" : pos <= 3 ? `That's P${pos}! Podium! Get up there and enjoy it.` : pos <= 10 ? `P${pos}. Points on the board. Good job.` : `P${pos}. Tough one. We'll go through it and come back stronger.` }]);
      return;
    }
    if (!e) return;
    const k = Math.round(e.t);
    let text: string | null = null;
    if (e.kind === "pass" && e.a === car) text = pick([`Good move! That's P${pos}.`, `Mega. P${pos}, keep it clean.`, "Lovely. Now the next one."], k);
    else if (e.kind === "pass" && e.b === car) text = pick([`He's through. P${pos}. Let's get him back.`, "Lost one. Head down, it's a long race.", "Okay, okay. Reset. Go again."], k);
    else if (e.kind === "pit" && e.a === car) text = pick(["Box, box. Box, box.", "Good stop. Push now, push.", "Tyres on, go go go."], k);
    else if (e.kind === "fastest" && e.a === car) text = "Purple! Fastest lap. Lovely.";
    else if (e.kind === "penalty" && e.a === car) text = `We've got a ${e.info ?? ""} penalty. Sorry mate. Keep pushing.`;
    else if (e.kind === "contact") text = pick(["Contact! Are you okay? Check the car.", "Ooh. Talk to me, any damage?"], k);
    else if (e.kind === "dnf" && e.a === car) text = "Stop the car, stop the car. Sorry. It's over.";
    else if (e.kind === "limits" && e.a === car && e.info === "3") text = "That's three for track limits. One more and it's a penalty.";
    else if (e.kind === "slowstop" && e.a === car) text = "Sorry, slow stop. Problem on the front left.";
    else if (e.kind === "blue" && e.a === car) text = "Blue flags. Let him by.";
    if (text) say([{ who: "eng", text }]);
  }, [t]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!lines) return;
    const id = window.setTimeout(() => setLines(null), 6500);
    return () => clearTimeout(id);
  }, [lines]);

  const ask = (q: string) => {
    setOpen(false);
    if (!me) return;
    const f = forecast?.() ?? null;
    const ahead = view.cars.find((c) => c.pos === me.pos - 1);
    const behind = view.cars.find((c) => c.pos === me.pos + 1);
    const tyre = COMPOUNDS[me.compound as keyof typeof COMPOUNDS]?.name.toLowerCase() ?? "tyres";
    const k = Math.round(t);
    const answers: Record<string, [string, string]> = {
      tyres: ["How are the tyres looking?", f ? `About ${Math.max(0, Math.round(f.tyreLapsLeft))} laps left in these ${tyre}s. ${f.tyreLapsLeft < 4 ? "They're nearly done." : "Look after them."}` : "They look fine from here."],
      gap: ["Gaps?", me.pos === 1 ? `You're leading. ${behind ? `${gap(behind.interval)} back to P2.` : ""}` : `${gap(me.interval)} to the car ahead${behind ? `, ${gap(behind.interval)} behind` : ""}.`],
      fuel: ["Fuel okay?", f ? (f.fuelMargin >= 0 ? "Fuel's fine, we're on target. Just drive." : "We're a bit short. The car's on lean, you'll feel it.") : "Fuel's fine."],
      plan: ["What's the plan?", f?.nextStop ? `Plan is box lap ${f.nextStop.lap}${f.nextStop.compound !== "?" ? ` for ${COMPOUNDS[f.nextStop.compound as keyof typeof COMPOUNDS]?.name.toLowerCase() ?? "new tyres"}` : ""}.` : "No more stops. Bring it home."],
      faster: ["I'm faster than him!", ahead ? pick(["Copy. Use the battery on the straight.", "Understood. Be patient, he'll make a mistake.", "We know. Get it done then."], k) : "Mate, you're leading."],
      alone: ["Leave me alone, I know what I'm doing.", pick(["...Understood.", "Copy. Radio silence.", "Okay, okay."], k)],
    };
    const [mine, reply] = answers[q];
    say([
      { who: "me", text: mine },
      { who: "eng", text: reply },
    ]);
  };

  return (
    <>
      {lines && (
        <div className="pointer-events-none absolute left-4 top-14 z-10 w-[min(440px,80%)] overflow-hidden rounded-md border border-ink-600 bg-ink-950/95">
          {lines.l.map((x, i) => (
            <div key={i} className="flex gap-3 border-b border-ink-800 px-4 py-2.5 last:border-0">
              <span className={`mt-0.5 shrink-0 rounded-sm px-1.5 font-display text-sm font-black uppercase leading-5 ${x.who === "eng" ? "bg-white text-ink-950" : "bg-race text-white"}`}>{x.who === "eng" ? engineer : code}</span>
              <span className="text-base leading-snug text-white">"{x.text}"</span>
            </div>
          ))}
          <div className="flex items-center gap-1 bg-ink-900 px-4 py-1">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Team radio</span>
            <span className="ml-auto flex items-end gap-0.5">
              {[6, 10, 4, 12, 8, 5, 11].map((h, i) => (
                <span key={i} className="w-1 rounded-sm bg-race" style={{ height: h }} />
              ))}
            </span>
          </div>
        </div>
      )}
      <div className="absolute right-4 top-4 z-10">
        <button onClick={() => setOpen((v) => !v)} className={`rounded-md px-3 py-1.5 font-display text-lg font-black uppercase tracking-wider ${open ? "bg-white text-ink-950" : "bg-ink-900/95 text-white hover:bg-ink-800"}`}>
          Radio
        </button>
        {open && (
          <div className="mt-2 grid w-64 gap-1 rounded-md border border-ink-600 bg-ink-950/95 p-2">
            {[
              ["tyres", "How are the tyres?"],
              ["gap", "Gaps?"],
              ["fuel", "Fuel okay?"],
              ["plan", "What's the plan?"],
              ["faster", "I'm faster than him!"],
              ["alone", "Leave me alone..."],
            ].map(([k, label]) => (
              <button key={k} onClick={() => ask(k)} className="rounded px-3 py-2 text-left text-base text-white hover:bg-ink-800">
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
