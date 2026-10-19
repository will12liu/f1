// Drive the session yourself: qualifying laps, or the whole race from the grid. The field runs on the
// same circuit (self.ts). Your car runs the qualifying lap's physics with the driving assists: hold W, S brakes,
// A and D steer.
import { useEffect, useRef, useState } from "react";
import type { DrivenRace } from "../../engine/race/driven";
import { lapTime, raceTime } from "../../lib/format";
import { loadTrack } from "../components/bits";
import { build, gearOf, type Geo } from "./drive";
import { ASSISTS, CAM_LABEL, nextAssist, nextCam, readAssist, readCam, saveAssist, saveCam, type Assist, type DriveCam } from "./assist";
import { createSelf, drivenResult, endQuali, qualiTimesOf, settling, stepSelf, type SelfSpec, type SelfState } from "./self";

const STEP = 1 / 120;

class Controls {
  keys = new Set<string>();
  pointers = new Map<number, { side: "throttle" | "brake"; x0: number; dx: number }>();
  steer = 0;
  throttle = 0;
  brake = 0;
  read() {
    const k = this.keys;
    let steerT = (k.has("ArrowLeft") || k.has("KeyA") ? 1 : 0) - (k.has("ArrowRight") || k.has("KeyD") ? 1 : 0);
    let brk = k.has("ArrowDown") || k.has("KeyS") ? 1 : 0;
    let gas = k.has("KeyW") || k.has("ArrowUp");
    for (const p of this.pointers.values()) {
      if (p.side === "throttle") gas = true;
      else brk = 1;
      steerT -= Math.max(-1, Math.min(1, p.dx / 90));
    }
    this.steer = Math.max(-1, Math.min(1, steerT));
    this.throttle = gas ? 1 : 0;
    this.brake = brk;
  }
}

export type SelfDone = { kind: "quali"; times: Record<string, number> } | { kind: "race"; race: DrivenRace };

interface Hud {
  phase: SelfState["phase"];
  lights: number;
  go: boolean;
  speed: number;
  gear: number;
  lap: string;
  pos: string;
  gap: string;
  drs: boolean;
  cue: boolean;
  best: string;
  tower: { code: string; gap: string; me: boolean; color: string }[];
  settling: boolean;
  jump: boolean;
}

const gapText = (g: Geo, ahead: number, me: number, v: number) => {
  const metres = (ahead - me) * g.m;
  if (metres > g.len * g.m * 0.85) return "+1 lap";
  const sec = v > 8 ? metres / v : metres / 40;
  return `+${sec.toFixed(2)}`;
};

function readHud(st: SelfState, g: Geo, cue: boolean): Hud {
  const me = st.cars.find((c) => c.player) ?? st.cars[0];
  const lap = st.mode === "quali" ? `Lap ${Math.min(3, me.lap + (me.lap >= 3 ? 0 : 1))} / 3` : me.finished ? "Flag" : `Lap ${Math.min(st.laps, me.lap + 1)} / ${st.laps}`;
  if (st.mode === "quali") {
    const ranked = st.cars.slice().sort((a, b) => (a.best || 1e9) - (b.best || 1e9) || a.code.localeCompare(b.code));
    const mine = Math.max(0, ranked.findIndex((c) => c === me));
    const shown = ranked.slice(0, 7);
    if (mine >= 7) shown.push(ranked[mine]);
    const pole = ranked.find((c) => c.best > 0);
    return {
      phase: st.phase,
      lights: st.lights,
      go: st.go,
      speed: Math.round(me.v * 3.6),
      gear: gearOf(me.v),
      lap,
      pos: me.best ? `P${mine + 1}` : "-",
      gap: me.best && pole ? (me === pole ? "Pole" : `+${(me.best - pole.best).toFixed(2)}`) : "Flying lap",
      drs: me.drsOpen,
      cue,
      best: me.best > 0 ? lapTime(me.best) : "",
      tower: shown.map((c) => ({
        code: c.code,
        me: c === me,
        color: c.color,
        gap: c.best > 0 ? (pole && c !== pole ? `+${(c.best - pole.best).toFixed(2)}` : lapTime(c.best)) : "--",
      })),
      settling: false,
      jump: me.hold > 0,
    };
  }
  const place = st.order.findIndex((i) => st.cars[i] === me);
  const leader = st.cars[st.order[0]];
  const ahead = place > 0 ? st.cars[st.order[place - 1]] : null;
  const tower = st.order.slice(0, 8).map((idx) => {
    const c = st.cars[idx];
    return { code: c.code, me: c === me, color: c.color, gap: c === leader ? "Leader" : gapText(g, leader.dist, c.dist, c.v || leader.v) };
  });
  return {
    phase: st.phase,
    lights: st.lights,
    go: st.go,
    speed: Math.round(me.v * 3.6),
    gear: gearOf(me.v),
    lap,
    pos: `P${place + 1}`,
    gap: ahead ? gapText(g, ahead.dist, me.dist, me.v) : "Leader",
    drs: me.drsOpen,
    cue,
    best: me.best > 0 ? lapTime(me.best) : "",
    tower,
    settling: settling(st),
    jump: me.hold > 0,
  };
}

export function SelfDrive({
  title,
  trackId,
  km,
  target,
  seed,
  specs,
  mode,
  laps,
  onDone,
  onQuit,
}: {
  title: string;
  trackId: string;
  km: number;
  target: number;
  seed: number;
  specs: SelfSpec[];
  mode: "race" | "quali";
  laps: number;
  onDone: (out: SelfDone) => void;
  onQuit: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<{ draw: (list: { idx: number; frac: number; x?: number; v?: number; drs?: boolean; head?: number; steer?: number }[], follow: number, cam: "chase" | "far" | "onboard", lights: number) => void; dispose: () => void } | null>(null);
  const sim = useRef<SelfState | null>(null);
  const specsRef = useRef(specs);
  const ctl = useRef(new Controls());
  const [geo, setGeo] = useState<Geo | null>(null);
  const [cam, setCam] = useState<DriveCam>(readCam);
  const camRef = useRef(cam);
  camRef.current = cam;
  const [assist, setAssist] = useState<Assist>(readAssist);
  const keepRef = useRef<() => void>(() => undefined);
  const [hud, setHud] = useState<Hud | null>(null);
  const [rows, setRows] = useState<DrivenRace["rows"] | null>(null);

  useEffect(() => {
    let live = true;
    loadTrack(trackId).then((t) => {
      if (!live) return;
      const g = build(t, km, target);
      sim.current = createSelf(seed, g, specsRef.current, mode, laps, readAssist());
      setGeo(g);
    });
    return () => {
      live = false;
    };
  }, [trackId, km, target, seed, mode, laps]);

  useEffect(() => {
    if (!geo || !host.current) return;
    let live = true;
    const el = host.current;
    const colors = specsRef.current.map((s) => ({ color: s.color, color2: s.color2 }));
    import("./look")
      .then(({ auroraView }) => {
        if (live && el.isConnected) view.current = auroraView(el, geo, title, colors);
      })
      .catch(() => undefined);
    return () => {
      live = false;
      view.current?.dispose();
      view.current = null;
    };
  }, [geo, title]);

  useEffect(() => {
    const c = ctl.current;
    const codeOf = (e: KeyboardEvent) => {
      if (e.code) return e.code;
      const k = e.key.toLowerCase();
      if (k === "w" || k === "arrowup") return k === "w" ? "KeyW" : "ArrowUp";
      if (k === "s" || k === "arrowdown") return k === "s" ? "KeyS" : "ArrowDown";
      if (k === "a" || k === "arrowleft") return k === "a" ? "KeyA" : "ArrowLeft";
      if (k === "d" || k === "arrowright") return k === "d" ? "KeyD" : "ArrowRight";
      if (k === " ") return "Space";
      return e.key;
    };
    const down = (e: KeyboardEvent) => {
      const code = codeOf(e);
      if (sim.current?.phase === "done") {
        if ((code === "Enter" || code === "Space") && !e.repeat) {
          e.preventDefault();
          keepRef.current();
        }
        return;
      }
      if (code === "KeyV" && !e.repeat) setCam((v) => saveCam(nextCam(v)));
      c.keys.add(code);
      if (code.startsWith("Arrow") || code === "KeyW" || code === "KeyA" || code === "KeyS" || code === "KeyD") e.preventDefault();
    };
    const up = (e: KeyboardEvent) => c.keys.delete(codeOf(e));
    const blur = () => {
      c.keys.clear();
      c.pointers.clear();
    };
    const pointerGone = (e: PointerEvent) => c.pointers.delete(e.pointerId);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    window.addEventListener("pointerup", pointerGone);
    window.addEventListener("pointercancel", pointerGone);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      window.removeEventListener("pointerup", pointerGone);
      window.removeEventListener("pointercancel", pointerGone);
    };
  }, []);

  useEffect(() => {
    if (!geo) return;
    const g = geo;
    let last = performance.now();
    let acc = 0;
    let shown = 0;
    let raf = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const st = sim.current;
      // stepSelf writes phase; read it back through a helper so the check stays honest
      const readPhase = (s: SelfState): SelfState["phase"] => s.phase;
      if (st && readPhase(st) !== "done") {
        const c = ctl.current;
        c.read();
        const fast = settling(st) ? 8 : 1;
        acc += dt * fast;
        let n = 0;
        const cap = fast > 1 ? 36 : 14;
        let phase = readPhase(st);
        while (acc >= STEP && n < cap && phase !== "done") {
          stepSelf(st, g, { throttle: c.throttle, brake: c.brake, steer: c.steer }, STEP);
          phase = readPhase(st);
          acc -= STEP;
          n++;
        }
        if (phase === "done") {
          setRows(mode === "race" ? drivenResult(st).rows : null);
          setHud(readHud(st, g, false));
        }
      }
      const drawSt = sim.current;
      if (drawSt && view.current) {
        const follow = Math.max(0, drawSt.cars.findIndex((car) => car.player));
        view.current.draw(
          drawSt.cars.map((car, idx) => ({ idx, frac: (car.lap * g.len + car.d) / g.len, x: car.x, v: car.v, drs: car.drsOpen, head: car.player ? car.head : undefined, steer: car.player ? car.steer : undefined })),
          follow,
          camRef.current,
          drawSt.phase === "lights" ? drawSt.lights : 0,
        );
      }
      if (drawSt && now - shown > 80) {
        shown = now;
        setHud(readHud(drawSt, g, drawSt.cars.find((c) => c.player)?.cue ?? false));
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [geo, mode]);

  const keep = () => {
    const st = sim.current;
    if (!st || !geo || st.phase !== "done") return;
    if (mode === "quali") onDone({ kind: "quali", times: qualiTimesOf(st, geo) });
    else onDone({ kind: "race", race: drivenResult(st) });
  };
  keepRef.current = keep;

  const pointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (sim.current?.phase === "done" || (e.target as HTMLElement).closest("button")) return;
    const r = e.currentTarget.getBoundingClientRect();
    const side = e.clientX - r.left < r.width / 2 ? "brake" : "throttle";
    ctl.current.pointers.set(e.pointerId, { side, x0: e.clientX, dx: 0 });
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const pointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = ctl.current.pointers.get(e.pointerId);
    if (p) p.dx = e.clientX - p.x0;
  };
  const pointerUp = (e: React.PointerEvent<HTMLDivElement>) => ctl.current.pointers.delete(e.pointerId);

  const meRow = rows?.find((r) => specsRef.current.some((s) => s.player && s.id === r.driverId));

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink-950">
      <div className="flex shrink-0 flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <div className="kicker">{mode === "quali" ? "Qualifying" : `${laps} laps`}</div>
          <div className="font-display text-2xl font-black uppercase leading-none text-white sm:text-3xl">{title}</div>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            className="btn bg-ink-800 text-white hover:bg-ink-700"
            title={ASSISTS.find((x) => x.id === assist)?.hint}
            onClick={() =>
              setAssist((a) => {
                const n = saveAssist(nextAssist(a));
                if (sim.current) sim.current.assist = n;
                return n;
              })
            }
          >
            Assists: {ASSISTS.find((x) => x.id === assist)?.label}
          </button>
          <button className="btn bg-ink-800 text-white hover:bg-ink-700" title="Change the camera (V)" onClick={() => setCam((v) => saveCam(nextCam(v)))}>
            {CAM_LABEL[cam]}
          </button>
          {mode === "quali" && hud?.phase === "green" && (
            <button className="btn bg-white text-ink-950 hover:bg-slate-200" onClick={() => sim.current && endQuali(sim.current)}>
              End session
            </button>
          )}
          <button className="btn-ghost" onClick={onQuit}>
            Quit
          </button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        <div ref={host} className="absolute inset-0 touch-none" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} />
        {hud && (
          <>
            <div className="pointer-events-none absolute left-3 top-3 w-52">
              <div className="flex items-baseline bg-white px-2 py-1 text-ink-950">
                <b className="font-display text-sm font-black uppercase">{mode === "quali" ? "Qualifying" : "Race"}</b>
                <span className="ml-auto text-[10px] font-bold uppercase tracking-wide">{hud.lap}</span>
              </div>
              <ol>
                {hud.tower.map((row, i) => (
                  <li key={row.code + i} className={`grid grid-cols-[16px_4px_42px_1fr] items-center gap-1.5 px-2 font-display text-xs font-bold uppercase ${row.me ? "bg-white text-ink-950" : i % 2 ? "bg-ink-900 text-white" : "bg-ink-950 text-white"}`} style={{ height: 22 }}>
                    <span>{i + 1}</span>
                    <i className="h-3 w-1" style={{ background: row.color }} />
                    <span>{row.code}</span>
                    <span className="text-right text-[11px] normal-case">{row.gap}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="pointer-events-none absolute right-3 top-3 flex bg-ink-950 text-white">
              <div className="flex flex-col items-center justify-center bg-white px-3 py-1 text-ink-950">
                <b className="font-display text-3xl font-black italic leading-none">{hud.pos}</b>
                <small className="text-[10px] font-bold uppercase">{hud.gap}</small>
              </div>
              <div className="w-1 bg-race" />
              <div className="px-3 py-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Speed</div>
                <div className="font-display text-2xl font-bold leading-none tabular-nums">{hud.speed} <span className="text-sm">km/h</span></div>
                <div className="mt-1 flex gap-4 text-[11px] font-bold tabular-nums text-slate-200">
                  <span>Gear {hud.gear}</span>
                  {hud.best ? <span>Best {hud.best}</span> : null}
                  {hud.drs ? <span className="text-emerald-400">DRS</span> : null}
                </div>
              </div>
            </div>
            {hud.cue && hud.phase === "green" && assist !== "off" && (
              <div className={`pointer-events-none absolute left-1/2 top-[18%] -translate-x-1/2 px-4 py-1 font-display text-4xl font-black uppercase ${assist === "full" ? "bg-ink-950/80 text-slate-300" : "bg-race text-white"}`}>{assist === "full" ? "Braking" : "Brake"}</div>
            )}
            {hud.settling && <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-lg bg-ink-950 px-4 py-2 font-display text-xl font-bold uppercase text-white">Field finishing</div>}
            {hud.phase === "lights" && (
              <div className="pointer-events-none absolute left-1/2 top-[28%] flex -translate-x-1/2 gap-3 rounded-lg bg-ink-950 px-4 py-3">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} className={`h-8 w-8 rounded-full ${i < hud.lights ? "bg-race" : "bg-ink-700"}`} />
                ))}
              </div>
            )}
            {hud.go && <div className="pointer-events-none absolute left-1/2 top-[26%] -translate-x-1/2 font-display text-7xl font-black uppercase text-white">Go</div>}
            {hud.jump && <div className="pointer-events-none absolute left-1/2 top-[18%] -translate-x-1/2 font-display text-5xl font-black uppercase text-white">Jump start</div>}
          </>
        )}
        {!geo && <div className="absolute inset-0 grid place-items-center font-display text-4xl font-black uppercase text-slate-500">Loading the track</div>}
        {hud?.phase === "done" && (
          <div className="absolute inset-0 z-20 grid place-items-center bg-ink-950/80 p-6">
            <div className="grid w-full max-w-lg gap-4 rounded-lg bg-ink-900 p-6">
              <div className="kicker">{mode === "quali" ? "Qualifying done" : "Chequered flag"}</div>
              <h2 className="font-display text-5xl font-black uppercase text-white">{mode === "quali" ? hud.best || "No time" : meRow ? `P${meRow.pos}` : hud.pos}</h2>
              {mode === "race" && meRow && <div className="text-lg text-slate-300">{meRow.status === "Finished" ? raceTime(meRow.time) : meRow.status}{meRow.gap > 0.05 ? ` · +${meRow.gap.toFixed(3)}` : ""}</div>}
              {mode === "quali" && <p className="text-lg text-slate-300">Your best clean lap, and a time for the rest of the field. This sets the grid.</p>}
              {rows && (
                <ol className="max-h-64 overflow-auto">
                  {rows.slice(0, 10).map((r) => (
                    <li key={r.driverId} className="flex gap-3 border-b border-ink-800 py-1.5 font-display text-xl font-bold uppercase text-white">
                      <span className="w-8 text-slate-500">{r.pos}</span>
                      <span>{specsRef.current.find((s) => s.id === r.driverId)?.code ?? r.driverId}</span>
                      <span className="ml-auto text-base normal-case text-slate-400">{r.status === "Finished" ? (r.gap < 0.05 ? raceTime(r.time) : `+${r.gap.toFixed(3)}`) : r.status}</span>
                    </li>
                  ))}
                </ol>
              )}
              <button className="btn-xl bg-race text-white hover:bg-red-500" onClick={keep} autoFocus>
                {mode === "quali" ? "Use these times" : "Save result"}
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="shrink-0 px-4 py-2 text-sm text-slate-500 sm:px-6">Hold W (or Up) for the throttle, S or Down brakes, A and D steer, V changes the camera. On a phone: hold the right side to accelerate, the left to brake, drag to steer. Assists: Full drives the pedals for you, Medium brakes if you are late. DRS opens on its own within a second.</div>
    </div>
  );
}
