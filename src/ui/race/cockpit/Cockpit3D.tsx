// The duel from the cockpit (three.js, loaded only when a moment opens). The road is the real track outline
// around one braking zone, flat, at real width, with kerbs, barriers and the 300/200/100 boards; your car runs
// on drive.ts physics, the other car on the reference lap (duel.ts). Throttle is held for you until you first
// brake; then it's yours. The result (duelScore) is the same 0-1 the braking bar gives.
import { useEffect, useRef, useState } from "react";
import { useTrack } from "../../components/bits";
import { verdict, verdictColor } from "../BrakeBar";
import { build, GEARS, gearOf } from "../drive";
import { ASSIST_CAP, ASSIST_GRIP, ASSISTS, assisted, nextAssist, readAssist, saveAssist, type Assist } from "../assist";
import { auroraView } from "../look";
import { aheadOf, inferMove, startDuel, stepDuel, type Duel, type Side } from "./duel";

export interface CockpitProps {
  trackId: string;
  km: number;
  target: number; // pole time the reference lap is tuned to
  side: Side;
  move: string;
  label: string;
  pick: number; // which of the heaviest braking zones (the lap number)
  myColor: string;
  oppColor: string;
  myColor2?: string;
  oppColor2?: string;
  myNum?: number;
  oppNum?: number;
  onResult: (q: number, move: string) => void; // move: what your driving amounted to (inferMove)
  onSimple: () => void; // fall back to the braking bar
  simpleLabel?: string; // that button's text ("Quit" in practice)
  habit?: string; // the other driver's favourite duel move
  grip?: number; // from your driver's ratings (drive.ts gripOf)
}

const STEP = 1 / 120;
const SOUND = "paddock.cockpitSound";
const soundOn = () => {
  try {
    return localStorage.getItem(SOUND) !== "off";
  } catch {
    return true;
  }
};

export default function Cockpit3D(p: CockpitProps) {
  const track = useTrack(p.trackId);
  const host = useRef<HTMLDivElement>(null);
  const keys = useRef(new Set<string>());
  const pads = useRef({ l: false, r: false, gas: false, brk: false });
  const tilt = useRef(0); // phone tilt steering, -1..1 (+ = left)
  const [hud, setHud] = useState({ kmh: 0, gear: 1, gap: 0, steer: 0, braked: false, go: false, cue: false });
  const [assist, setAssist] = useState<Assist>(readAssist);
  const assistRef = useRef(assist);
  assistRef.current = assist;
  const [res, setRes] = useState<{ q: number; why: string } | null>(null);
  const done = useRef(false);
  const finished = useRef(false); // onResult sent
  const moveRef = useRef("inside");
  const replaying = useRef(false);
  const [replay, setReplay] = useState(false);
  const [sound, setSound] = useState(soundOn); // takes effect next duel

  useEffect(() => {
    if (!track || !host.current) return;
    const g = build(track, p.km, p.target);
    const s: Duel = startDuel(g, p.side, p.move, p.pick, p.habit);
    const el = host.current;
    let view: ReturnType<typeof auroraView>;
    try {
      view = auroraView(el, g, "", [
        { color: p.myColor, color2: p.myColor2 },
        { color: p.oppColor, color2: p.oppColor2 },
      ], { map: false });
    } catch {
      p.onSimple();
      return;
    }

    // engine note: a sawtooth through a low-pass, pitch from the revs in the current gear
    let audio: AudioContext | null = null;
    let osc: OscillatorNode | null = null;
    let vol: GainNode | null = null;
    let squeal: OscillatorNode | null = null;
    let squealVol: GainNode | null = null;
    let rumble: OscillatorNode | null = null;
    let rumbleVol: GainNode | null = null;
    if (soundOn()) {
      try {
        audio = new AudioContext();
        osc = audio.createOscillator();
        osc.type = "sawtooth";
        const lp = audio.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 900;
        vol = audio.createGain();
        vol.gain.value = 0.04;
        osc.connect(lp).connect(vol).connect(audio.destination);
        osc.start();
        // the limit, heard: tyres squeal near the edge of grip, the kerbs rumble
        squeal = audio.createOscillator();
        squeal.type = "triangle";
        squeal.frequency.value = 1150;
        squealVol = audio.createGain();
        squealVol.gain.value = 0;
        squeal.connect(squealVol).connect(audio.destination);
        squeal.start();
        rumble = audio.createOscillator();
        rumble.type = "square";
        rumble.frequency.value = 38;
        rumbleVol = audio.createGain();
        rumbleVol.gain.value = 0;
        rumble.connect(rumbleVol).connect(audio.destination);
        rumble.start();
      } catch {
        audio = null;
      }
    }
    let steer = 0;
    let cue = false; // the brake cue (assists)
    let acc = 0;
    let last = performance.now();
    const t0 = last;
    let raf = 0;
    let hudAt = 0;
    // a recording of both cars (60 a second) for the TV replay once it's decided
    const rec: number[][] = [];
    let n = 0;
    let replayAt = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const go = now - t0 > 1400;
      if (go && !s.result) {
        acc += dt;
        const k = keys.current;
        const pd = pads.current;
        const want = Math.max(-1, Math.min(1, (k.has("ArrowLeft") || k.has("KeyA") || pd.l ? 1 : 0) - (k.has("ArrowRight") || k.has("KeyD") || pd.r ? 1 : 0) + tilt.current));
        while (acc >= STEP) {
          acc -= STEP;
          steer += Math.max(-STEP * 4, Math.min(STEP * 4, want - steer));
          const brake = k.has("ArrowDown") || k.has("KeyS") || k.has("Space") || pd.brk ? 1 : 0;
          const throttle = !brake && (k.has("ArrowUp") || k.has("KeyW") || pd.gas) ? 1 : 0;
          const lvl = assistRef.current;
          const a = assisted(g, s.me, { throttle, brake, steer }, lvl, p.grip ?? 1, aheadOf(s));
          cue = a.cue;
          stepDuel(s, a.inp, STEP, (p.grip ?? 1) * ASSIST_GRIP[lvl]);
          if (n++ % 2 === 0) rec.push([s.me.d, s.me.x, s.me.v > 1 ? s.me.vlat / s.me.v : 0, s.opp.d, s.opp.x]);
          if (s.result) break;
        }
        const r0 = s.result as Duel["result"]; // set inside stepDuel
        const r = r0 && { ...r0, q: Math.min(r0.q, ASSIST_CAP[assistRef.current]) }; // assists cap the score
        if (r) s.result = r;
        if (r && !done.current) {
          done.current = true;
          moveRef.current = inferMove(s);
          setRes(r);
          replayAt = now + 900; // a beat on the result, then the replay
        }
      }
      // the replay: the last five seconds from a TV camera at the corner, then back to the race
      const rp = replayAt && now >= replayAt ? Math.floor(((now - replayAt) / 1000) * 60) : -1;
      const from = Math.max(0, rec.length - 300);
      if (rp >= 0 && from + rp >= rec.length + 60 && !finished.current) {
        finished.current = true;
        p.onResult(s.result!.q, inferMove(s));
      }
      const at_ = rp >= 0 ? rec[Math.min(rec.length - 1, from + rp)] : null;
      if (rp >= 0 && !replaying.current) {
        replaying.current = true;
        setReplay(true);
      }
      const meD = at_ ? at_[0] : s.me.d;
      const meX = at_ ? at_[1] : s.me.x;
      const slip = at_ ? at_[2] : s.me.v > 1 ? s.me.vlat / s.me.v : 0;
      const oppD = at_ ? at_[3] : s.opp.d;
      const oppX = at_ ? at_[4] : s.opp.x;
      view.draw(
        [
          { idx: 0, d: meD, x: meX, v: at_ ? 0 : s.me.v, slip },
          { idx: 1, d: oppD, x: oppX },
        ],
        0,
        at_ ? "tv" : "chase",
        0,
      );
      if (at_) {
        osc?.frequency.setTargetAtTime(60, audio!.currentTime, 0.1);
        squealVol?.gain.setTargetAtTime(0, audio!.currentTime, 0.05);
        rumbleVol?.gain.setTargetAtTime(0, audio!.currentTime, 0.05);
        return;
      }
      if (osc && audio) {
        const kmh = s.me.v * 3.6;
        const gr = gearOf(s.me.v);
        const lo = GEARS[gr - 1] ?? 0;
        const hi = GEARS[gr] ?? 345;
        const rev = Math.max(0, Math.min(1, (kmh - lo) / (hi - lo)));
        osc.frequency.setTargetAtTime(s.result ? 90 : 140 + 260 * rev + gr * 12, audio.currentTime, 0.03);
        const live = !s.result && s.me.v > 8;
        squealVol?.gain.setTargetAtTime(live ? Math.max(0, Math.min(1, (s.me.use - 0.88) / 0.12)) * 0.025 : 0, audio.currentTime, 0.05);
        rumbleVol?.gain.setTargetAtTime(live && s.me.surface !== "track" ? 0.05 : 0, audio.currentTime, 0.03);
      }
      if (now - hudAt > 80) {
        hudAt = now;
        setHud({ kmh: s.me.v * 3.6, gear: gearOf(s.me.v), gap: (s.me.d - s.opp.d) * g.m, steer, braked: s.braked, go, cue: cue && !s.result });
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      audio?.close();
      view.dispose();
    };
  }, [track]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const dn = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
      keys.current.add(e.code);
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    // tilt steering on phones, as in the qualifying lap (iOS asks once, on the first touch of a pad)
    const onTilt = (e: DeviceOrientationEvent) => {
      const landscape = window.innerWidth > window.innerHeight;
      const a = landscape ? e.beta : e.gamma;
      tilt.current = a === null ? 0 : Math.max(-1, Math.min(1, -(a ?? 0) / 22));
    };
    window.addEventListener("deviceorientation", onTilt);
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", dn);
      window.removeEventListener("keyup", up);
      window.removeEventListener("deviceorientation", onTilt);
    };
  }, []);

  const pad = (k: keyof typeof pads.current, text: string, cls: string) => (
    <button
      className={`pointer-events-auto select-none rounded-lg bg-ink-950/80 font-display text-2xl font-black uppercase text-white active:bg-white active:text-ink-950 ${cls}`}
      onPointerDown={() => {
        pads.current[k] = true;
        const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
        DOE?.requestPermission?.().catch(() => undefined);
      }}
      onPointerUp={() => (pads.current[k] = false)}
      onPointerLeave={() => (pads.current[k] = false)}
    >
      {text}
    </button>
  );
  const gap = hud.gap;
  return (
    <div className="fixed inset-0 z-[60] bg-ink-950">
      <div ref={host} className="absolute inset-0" />
      {!track && <div className="absolute inset-0 grid place-items-center text-2xl text-slate-400">Loading the track...</div>}
      {!replay && (
        <>
      <div className="pointer-events-none absolute left-4 top-4 max-w-md bg-ink-950 px-4 py-3">
        <div className="font-display text-3xl font-black uppercase text-race">{p.label}</div>
        <div className="mt-1 text-base text-white">
          {p.side === "attack" ? "Get past him. " : "Keep him behind. "}
          {assist === "full"
            ? "The car brakes and accelerates: steer left or right to pick your side."
            : assist === "medium"
              ? "Brake when it says BRAKE (it brakes for you if you're late). Steer to pick your side."
              : hud.braked
                ? "Throttle is yours now: W / Up."
                : "Brake near the 50 board (later is braver): S / Down / Space."}
        </div>
        <div className="mt-2 font-display text-2xl font-black text-white">{Math.round(hud.kmh)} km/h · gear {hud.gear} · {gap > 0 ? "+" : ""}{gap.toFixed(0)} m</div>
        <div className="mt-1 text-sm text-slate-400">W throttle. S, Down or Space brakes. A and D steer. Off the road or into him and it's over.</div>
      </div>
        </>
      )}
      {hud.cue && !replay && assist !== "off" && (
        <div className="pointer-events-none absolute inset-x-0 top-[24%] text-center">
          <span className={`rounded-md px-5 py-1.5 font-display text-5xl font-black uppercase ${assist === "full" ? "bg-ink-950/80 text-slate-300" : "bg-race text-white"}`}>{assist === "full" ? "Braking" : "Brake"}</span>
        </div>
      )}
      <div className="absolute right-4 top-4 flex gap-2">
        <button
          onClick={() => setAssist((a) => saveAssist(nextAssist(a)))}
          title={ASSISTS.find((x) => x.id === assist)?.hint}
          className="rounded-md bg-ink-900/90 px-3 py-1.5 text-base font-bold text-white hover:bg-ink-800"
        >
          Assists: {ASSISTS.find((x) => x.id === assist)?.label}
        </button>
        <button
          onClick={() => {
            try {
              localStorage.setItem(SOUND, soundOn() ? "off" : "on");
            } catch {
              /* private mode */
            }
            setSound(soundOn());
          }}
          className="rounded-md bg-ink-900/90 px-3 py-1.5 text-base font-bold text-white hover:bg-ink-800"
        >
          {sound ? "Sound on" : "Sound off"}
        </button>
        <button onClick={p.onSimple} className="rounded-md bg-ink-900/90 px-3 py-1.5 text-base font-bold text-white hover:bg-ink-800">
          {p.simpleLabel ?? "Simple controls"}
        </button>
      </div>
      {!hud.go && track && <div className="pointer-events-none absolute inset-x-0 top-[38%] text-center font-display text-7xl font-black uppercase text-white">Ready</div>}
      <div className={`pointer-events-none absolute inset-x-3 bottom-3 justify-between gap-3 md:hidden ${replay ? "hidden" : "flex"}`}>
        <div className="flex gap-2">
          {pad("l", "‹", "h-20 w-20")}
          {pad("r", "›", "h-20 w-20")}
        </div>
        <div className="flex gap-2">
          {pad("brk", "Brake", "h-20 w-24")}
          {pad("gas", "Gas", "h-20 w-20")}
        </div>
      </div>
      {replay && (
        <div className="absolute left-4 top-4 rounded-md bg-white px-3 py-1 font-display text-2xl font-black uppercase text-ink-950">Replay</div>
      )}
      {res && (
        <div className={`absolute w-fit rounded-lg bg-ink-950/95 px-10 py-6 text-center ${replay ? "bottom-6 right-6" : "inset-x-0 top-[30%] mx-auto"}`}>
          <div className={`font-display text-6xl font-black uppercase ${verdictColor(res.q)}`}>{verdict(res.q)}</div>
          <div className="mt-2 text-2xl font-bold text-white">{res.why}</div>
          <div className="mt-1 text-base text-slate-400">Score {Math.round(res.q * 100)}</div>
          {replay && (
            <button
              className="btn-xl mt-4 bg-race text-white hover:bg-red-500"
              onClick={() => {
                if (finished.current) return;
                finished.current = true;
                p.onResult(res.q, moveRef.current);
              }}
            >
              Back to the race ›
            </button>
          )}
        </div>
      )}
    </div>
  );
}
