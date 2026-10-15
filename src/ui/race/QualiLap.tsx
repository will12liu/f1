// The qualifying lap, driven: an onboard chase camera on the real circuit outline, throttle, brake and
// steering. Corner speed limits come from the track's curvature (drive.ts): carry too much speed and the car
// runs wide, all four wheels off the kerb and the lap is deleted. The clock is the score: your lap against a
// reference lap (a normal lap for this driver, from the same model tuned to the engine's pole time), live
// delta, sector times coloured like the TV, and a ghost of your best lap at this track. The time maps to the
// engine's 0-1 (CarPlan.laps) through lapScore, so the engine itself is unchanged. One try per session.
import { useEffect, useRef, useState } from "react";
import { QUALI } from "../../engine/race/qualifying";
import { lapTime } from "../../lib/format";
import { loadTrack } from "../components/bits";
import { at, build, EDGE, fmtDelta, gearOf, GHOST_DT, ghostAt, gripOf, HALF, lapScore, loadGhost, refAt, refLap, refSectors, saveGhost, sectorTone, startState, stepCar, TONE, type CarState, type Geo, type Ghost } from "./drive";

const STEP = 1 / 120; // physics step, seconds
const DISPLAY = '"Barlow Condensed", "IBM Plex Sans", sans-serif';

interface Result {
  time: number;
  deleted: boolean;
  corner?: number;
  sectors: number[];
  q: number;
  best: boolean;
}

/** Steering, throttle and brake from whatever is pressed: keys, screen halves, a drag, or the phone's tilt. */
class Controls {
  keys = new Set<string>();
  pointers = new Map<number, { side: "throttle" | "brake"; x0: number; dx: number }>();
  tilt = 0;
  steer = 0; // smoothed
  throttle = 0;
  brake = 0;
  read(dt: number) {
    const k = this.keys;
    let steerT = (k.has("ArrowLeft") || k.has("KeyA") ? 1 : 0) - (k.has("ArrowRight") || k.has("KeyD") ? 1 : 0);
    let thr = k.has("ArrowUp") || k.has("KeyW") ? 1 : 0;
    let brk = k.has("ArrowDown") || k.has("KeyS") || k.has("Space") ? 1 : 0;
    for (const p of this.pointers.values()) {
      if (p.side === "throttle") thr = 1;
      else brk = 1;
      steerT -= Math.max(-1, Math.min(1, p.dx / 70));
    }
    steerT += this.tilt;
    steerT = Math.max(-1, Math.min(1, steerT));
    const rate = dt * 9;
    this.steer += Math.max(-rate, Math.min(rate, steerT - this.steer));
    this.throttle += Math.max(-rate, Math.min(rate, thr - this.throttle));
    this.brake += Math.max(-rate * 1.5, Math.min(rate * 1.5, brk - this.brake));
  }
}

const VIEW_KEY = "paddock.qualiView";
const readOnboard = () => {
  try {
    return localStorage.getItem(VIEW_KEY) === "onboard";
  } catch {
    return false;
  }
};
const saveOnboard = (v: boolean) => {
  try {
    localStorage.setItem(VIEW_KEY, v ? "onboard" : "chase");
  } catch {
    /* private mode */
  }
  return v;
};

export function QualiLap({
  session,
  trackId,
  km,
  target,
  ratings,
  color = "#e10600",
  onDone,
  onQuit,
}: {
  session: string;
  trackId: string;
  km: number; // the real lap length
  target: number; // the pole time the perfect lap is tuned to (the engine's best quali lap here)
  ratings?: { quali: number; pace: number };
  color?: string;
  onDone: (q: number, label: string) => void;
  onQuit: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [geo, setGeo] = useState<Geo | null>(null);
  const [phase, setPhase] = useState<"wait" | "run" | "done">("wait");
  const [sectors, setSectors] = useState<number[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [guide, setGuide] = useState(true);
  const [onboard, setOnboard] = useState(readOnboard); // the 3D onboard view instead of the chase cam
  const onboardRef = useRef(onboard);
  onboardRef.current = onboard;
  const host = useRef<HTMLDivElement>(null);
  const w3d = useRef<{ draw: (s: CarState, gp: { d: number; x: number } | null) => void; dispose: () => void } | null>(null);
  const guideRef = useRef(true);
  guideRef.current = guide;
  const ctl = useRef(new Controls());
  // the onboard view loads three.js only when it's switched on
  useEffect(() => {
    if (!onboard || !geo || !host.current) return;
    let live = true;
    const el = host.current;
    import("./cockpit/scene")
      .then(({ onboard: make }) => {
        if (live) w3d.current = make(el, geo, color);
      })
      .catch(() => live && setOnboard(false));
    return () => {
      live = false;
      w3d.current?.dispose();
      w3d.current = null;
    };
  }, [onboard, geo]); // eslint-disable-line react-hooks/exhaustive-deps
  const ghostRef = useRef<Ghost | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const car = useRef<CarState | null>(null);
  const abort = useRef(false);
  const grip = gripOf(ratings);

  useEffect(() => {
    let live = true;
    const g = loadGhost(trackId);
    ghostRef.current = g;
    setGhost(g);
    loadTrack(trackId).then((t) => live && setGeo(build(t, km, target)));
    return () => {
      live = false;
    };
  }, [trackId, km, target]);

  const start = () => {
    if (!geo || phase !== "wait") return;
    car.current = startState(geo);
    abort.current = false;
    setSectors([]);
    setPhase("run");
    // tilt steering on phones (iOS asks first)
    const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
    if (DOE?.requestPermission && ctl.current.pointers.size) DOE.requestPermission().catch(() => undefined);
  };

  useEffect(() => {
    const c = ctl.current;
    const down = (e: KeyboardEvent) => {
      if (e.code === "KeyG" && !e.repeat) setGuide((v) => !v);
      if (e.code === "KeyV" && !e.repeat) setOnboard((v) => saveOnboard(!v));
      if ((e.code === "Enter" || e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") && phase === "wait" && geo) start();
      c.keys.add(e.code);
      if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
    };
    const up = (e: KeyboardEvent) => c.keys.delete(e.code);
    const blur = () => c.keys.clear();
    const tilt = (e: DeviceOrientationEvent) => {
      const landscape = window.innerWidth > window.innerHeight;
      const a = landscape ? e.beta : e.gamma;
      c.tilt = a === null ? 0 : Math.max(-1, Math.min(1, -(a ?? 0) / 22));
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    window.addEventListener("deviceorientation", tilt);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      window.removeEventListener("deviceorientation", tilt);
    };
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // the loop: physics while running, the picture always
  useEffect(() => {
    if (!geo) return;
    const g = geo;
    const cv = ref.current!;
    const ctx = cv.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    let W = 0;
    let H = 0;
    let last = performance.now();
    let acc = 0;
    let head = Math.atan2(at(g, g.py, 8) - at(g, g.py, 0), at(g, g.px, 8) - at(g, g.px, 0));
    let raf = 0;
    let sectorsShown = 0;
    let finished = false;
    const trace: { d: number[]; x: number[] } = { d: [], x: [] };
    const brakeStarts: number[] = [];
    for (let i = 0; i < g.n; i++) if (g.ref.brake[i] && !g.ref.brake[(i - 1 + g.n) % g.n]) brakeStarts.push(i);

    const finish = (s: CarState) => {
      const deleted = s.deleted;
      const time = s.t;
      const q = lapScore(g, time, deleted);
      const prev = ghostRef.current;
      const best = !deleted && (!prev || time < prev.time);
      if (best) {
        const gh: Ghost = { time, sectors: s.sectors, d: trace.d, x: trace.x };
        saveGhost(trackId, gh);
        ghostRef.current = gh;
        setGhost(gh);
      }
      let corner: number | undefined;
      if (deleted && s.deletedAt !== undefined && g.corners.length) {
        const f = (((s.deletedAt % g.len) + g.len) % g.len) / g.len;
        corner = g.corners.reduce((b, c) => (Math.abs(c.f - f) < Math.abs(b.f - f) ? c : b)).n;
      }
      setResult({ time, deleted, corner, sectors: s.sectors, q, best });
      setPhase("done");
    };

    const path = (off: number) => {
      ctx.beginPath();
      for (let i = 0; i <= g.n; i++) {
        const k = i % g.n;
        ctx.lineTo(g.px[k] + g.nx[k] * off * HALF, g.py[k] + g.ny[k] * off * HALF);
      }
    };
    const carSprite = (x: number, y: number, u: number, rot: number, fill: string, alpha = 1, braking = false) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.scale(u, u);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#0b0d12";
      for (const [wx, wy] of [[-9, -13], [9, -13], [-9, 10], [9, 10]]) ctx.fillRect(wx - 3, wy - 5, 6, 10);
      ctx.fillStyle = fill;
      ctx.fillRect(-4, -22, 8, 40);
      ctx.fillRect(-12, -24, 24, 4);
      ctx.fillRect(-10, 16, 20, 5);
      if (braking) {
        ctx.fillStyle = "#ef4444";
        ctx.fillRect(-10, 19, 6, 3);
        ctx.fillRect(4, 19, 6, 3);
      }
      ctx.fillStyle = "#f8fafc";
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const frame = (now: number) => {
      if (cv.clientWidth !== W || cv.clientHeight !== H) {
        W = cv.clientWidth;
        H = cv.clientHeight;
        cv.width = Math.round(W * dpr);
        cv.height = Math.round(H * dpr);
      }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = car.current ?? startState(g);
      const c = ctl.current;
      if (phase === "run" && car.current && !finished) {
        c.read(dt);
        acc += dt;
        while (acc >= STEP && !s.done && !s.deleted) {
          stepCar(g, s, { throttle: c.throttle, brake: c.brake, steer: c.steer }, STEP, grip);
          acc -= STEP;
          if (s.started && s.t >= trace.d.length * GHOST_DT) {
            trace.d.push(s.d);
            trace.x.push(s.x);
          }
        }
        if (s.sectors.length !== sectorsShown) {
          sectorsShown = s.sectors.length;
          setSectors([...s.sectors]);
        }
        if (abort.current) {
          s.deleted = true;
          s.deletedAt = s.d;
        }
        if (s.done || s.deleted) {
          finished = true;
          finish(s);
        }
      }

      // camera: behind the car, the road ahead pointing up, wider at speed
      const kmh = s.v * 3.6;
      const look = 10 + kmh * 0.06;
      const ax = at(g, g.px, s.d + look) - at(g, g.px, s.d - 4);
      const ay = at(g, g.py, s.d + look) - at(g, g.py, s.d - 4);
      const want = Math.atan2(ay, ax);
      let dh = want - head;
      while (dh > Math.PI) dh -= 2 * Math.PI;
      while (dh < -Math.PI) dh += 2 * Math.PI;
      head += dh * Math.min(1, dt * 6);
      const carX = at(g, g.px, s.d) + at(g, g.nx, s.d) * s.x * HALF;
      const carY = at(g, g.py, s.d) + at(g, g.ny, s.d) * s.x * HALF;
      const gh = ghostRef.current;
      const gp = gh && s.started ? ghostAt(gh, s.t) : null;
      const w3 = onboardRef.current ? w3d.current : null;
      if (w3) {
        // onboard: three.js draws the world underneath, this canvas only the HUD
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        w3.draw(s, gp);
      } else {
      const view = 130 + kmh * 0.36;
      const scale = Math.min(W, H) / view;
      const spriteU = Math.max(0.8, Math.min(1.7, scale * 0.24)); // car size on screen: about a third of the road wide
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#183a24";
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.translate(W / 2, H * 0.74);
      ctx.scale(scale, scale);
      ctx.rotate(-head - Math.PI / 2);
      ctx.translate(-carX, -carY);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      path(0);
      ctx.strokeStyle = "#2c4a33";
      ctx.lineWidth = HALF * 2 * EDGE.kerb + 14;
      ctx.stroke();
      ctx.lineCap = "butt";
      for (let i = 0; i < g.n; i++) {
        if (!g.kerb[i]) continue;
        const j = (i + 1) % g.n;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(g.px[i] + g.nx[i] * side * HALF * 1.1, g.py[i] + g.ny[i] * side * HALF * 1.1);
          ctx.lineTo(g.px[j] + g.nx[j] * side * HALF * 1.1, g.py[j] + g.ny[j] * side * HALF * 1.1);
          ctx.strokeStyle = i % 2 ? "#e10600" : "#f8fafc";
          ctx.lineWidth = HALF * (EDGE.kerb - 1);
          ctx.stroke();
        }
      }
      ctx.lineCap = "round";
      path(0);
      ctx.strokeStyle = "#3a3f4a";
      ctx.lineWidth = HALF * 2;
      ctx.stroke();
      for (const side of [-1, 1]) {
        path(side);
        ctx.strokeStyle = "rgba(248,250,252,0.8)";
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
      if (guideRef.current) {
        // the guide: a racing line, red where the reference lap brakes, yellow where it is at the limit
        ctx.lineCap = "butt";
        ctx.lineWidth = 1.1;
        for (let i = 0; i < g.n; i++) {
          const j = (i + 1) % g.n;
          ctx.beginPath();
          ctx.moveTo(g.px[i] + g.nx[i] * g.line[i] * HALF, g.py[i] + g.ny[i] * g.line[i] * HALF);
          ctx.lineTo(g.px[j] + g.nx[j] * g.line[j] * HALF, g.py[j] + g.ny[j] * g.line[j] * HALF);
          ctx.strokeStyle = g.ref.brake[i] ? "#ef4444" : Math.abs(g.kap[i]) > 0.0035 ? "#facc15" : "rgba(248,250,252,0.55)";
          ctx.stroke();
        }
        // braking boards: three, two, one before each braking zone, on the outside of the corner
        for (const i of brakeStarts) {
          const turn = at(g, g.kap, (i + 4) * (g.len / g.n));
          const side = turn > 0 ? 1 : -1; // right turn: boards on the left
          for (let n = 1; n <= 3; n++) {
            const dd = i * (g.len / g.n) - (n * 50) / g.m;
            const bx = at(g, g.px, dd) + at(g, g.nx, dd) * side * (HALF * EDGE.kerb + 3);
            const by = at(g, g.py, dd) + at(g, g.ny, dd) * side * (HALF * EDGE.kerb + 3);
            ctx.save();
            ctx.translate(bx, by);
            ctx.rotate(Math.atan2(at(g, g.py, dd + 2) - at(g, g.py, dd - 2), at(g, g.px, dd + 2) - at(g, g.px, dd - 2)));
            ctx.fillStyle = "#f8fafc";
            ctx.fillRect(-2.2, -3, 4.4, 6);
            ctx.fillStyle = "#0b0d12";
            for (let k = 0; k < n; k++) ctx.fillRect(-1.6 + k * 1.3 - (n - 1) * 0.4, -2.2, 0.7, 4.4);
            ctx.restore();
          }
        }
      }
      // start/finish and sector lines
      for (const [k, col] of [[0, "#f8fafc"], [1 / 3, "#facc15"], [2 / 3, "#facc15"]] as [number, string][]) {
        const dd = k * g.len;
        const cx = at(g, g.px, dd);
        const cy = at(g, g.py, dd);
        const nx = at(g, g.nx, dd);
        const ny = at(g, g.ny, dd);
        ctx.beginPath();
        ctx.moveTo(cx - nx * HALF, cy - ny * HALF);
        ctx.lineTo(cx + nx * HALF, cy + ny * HALF);
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.6;
        ctx.lineCap = "butt";
        ctx.stroke();
      }
      // the ghost: your best lap, where it was at this time (world space, same apparent size as the car)
      if (gp) {
        const gx = at(g, g.px, gp.d) + at(g, g.nx, gp.d) * gp.x * HALF;
        const gy = at(g, g.py, gp.d) + at(g, g.ny, gp.d) * gp.x * HALF;
        const rot = Math.atan2(at(g, g.py, gp.d + 3) - at(g, g.py, gp.d - 3), at(g, g.px, gp.d + 3) - at(g, g.px, gp.d - 3)) + Math.PI / 2;
        carSprite(gx, gy, spriteU / scale, rot, "#cbd5e1", 0.45);
      }
      ctx.restore();
      // the car: fixed on screen, pointing up, a little sideways when it slides
      const slip = Math.atan2(s.vlat, Math.max(5, s.v));
      const offTrack = s.surface !== "track";
      carSprite(W / 2, H * 0.74, spriteU, -slip, s.deleted ? "#fb7185" : offTrack ? "#fbbf24" : color, 1, c.brake > 0.3);
      }

      // HUD: speed and gear, the clock and the delta, pedals and grip
      const kick = (txt: string, x: number, y: number, size: number, col: string, align: CanvasTextAlign = "left", weight = 900) => {
        ctx.font = `${weight} ${size}px ${DISPLAY}`;
        ctx.fillStyle = col;
        ctx.textAlign = align;
        ctx.textBaseline = "alphabetic";
        ctx.fillText(txt, x, y);
      };
      const small = Math.min(W, H) < 520;
      const big = small ? 54 : 84;
      ctx.fillStyle = "rgba(9,11,15,0.78)";
      ctx.fillRect(16, H - (small ? 92 : 128), small ? 170 : 236, small ? 76 : 112);
      kick(String(Math.round(kmh)), 28, H - (small ? 40 : 52), big, "#ffffff");
      kick("km/h", 28 + (small ? 92 : 150), H - (small ? 40 : 52), small ? 16 : 20, "#94a3b8", "left", 700);
      kick(`Gear ${gearOf(s.v)}`, 28, H - (small ? 22 : 26), small ? 14 : 18, "#cbd5e1", "left", 700);
      if (s.started || s.done) {
        const dRef = s.t - refAt(g, s.d);
        ctx.fillStyle = "rgba(9,11,15,0.78)";
        const bw = small ? 230 : 320;
        ctx.fillRect(W / 2 - bw / 2, 14, bw, small ? 64 : 92);
        kick(lapTime(s.t).slice(0, -1), W / 2, small ? 44 : 60, small ? 30 : 42, "#ffffff", "center");
        const dCol = dRef <= 0 ? TONE.green : "#fb7185";
        kick(fmtDelta(dRef), W / 2, small ? 64 : 92, small ? 22 : 30, dCol, "center");
        if (gh) {
          // the ghost's time at this distance
          let gi = 0;
          while (gi < gh.d.length - 1 && gh.d[gi + 1] < s.d) gi++;
          const gT = gi * GHOST_DT;
          kick(`Best ${fmtDelta(s.t - gT)}`, W / 2 + bw / 2 - 10, small ? 64 : 92, small ? 14 : 18, "#cbd5e1", "right", 700);
        }
      }
      // pedals and grip
      const px0 = W - (small ? 70 : 92);
      const ph = small ? 90 : 130;
      const py0 = H - 16 - ph;
      ctx.fillStyle = "rgba(9,11,15,0.78)";
      ctx.fillRect(px0 - 10, py0 - 10, (small ? 60 : 78) + 20, ph + 20);
      const bar = (x: number, v: number, col: string, w: number) => {
        ctx.fillStyle = "#1f242e";
        ctx.fillRect(x, py0, w, ph);
        ctx.fillStyle = col;
        ctx.fillRect(x, py0 + ph * (1 - v), w, ph * v);
      };
      const bw2 = small ? 16 : 22;
      bar(px0, c.brake, "#ef4444", bw2);
      bar(px0 + bw2 + 6, c.throttle, "#34d399", bw2);
      bar(px0 + 2 * (bw2 + 6), s.use, s.use > 0.97 ? "#fb7185" : s.use > 0.8 ? "#facc15" : "#60a5fa", bw2);
      // steering
      ctx.fillStyle = "#1f242e";
      ctx.fillRect(px0 - 4, py0 - 26, (small ? 60 : 78) + 8, 8);
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(px0 - 4 + ((small ? 60 : 78) + 8) / 2 - 4 - c.steer * (((small ? 60 : 78) + 8) / 2 - 4), py0 - 26, 8, 8);
      // mini map: the circuit, your dot, the ghost
      const mw = Math.min(small ? 150 : 220, W * 0.26);
      const ms = mw / g.w;
      const mh = g.h * ms;
      ctx.save();
      ctx.translate(W - mw - 18, 18);
      ctx.fillStyle = "rgba(9,11,15,0.82)";
      ctx.fillRect(-10, -10, mw + 20, mh + 20);
      ctx.scale(ms, ms);
      ctx.beginPath();
      g.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.closePath();
      ctx.strokeStyle = "#64748b";
      ctx.lineWidth = 3 / ms;
      ctx.stroke();
      if (gp) {
        ctx.fillStyle = "#cbd5e1";
        ctx.beginPath();
        ctx.arc(at(g, g.px, gp.d), at(g, g.py, gp.d), 4 / ms, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(carX, carY, 6 / ms, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [geo, phase, color, grip, trackId]);

  const refSecs = geo ? refSectors(geo) : [];
  const gain = (v: number) => -(v - 0.55) * QUALI.lapSkill; // seconds vs a normal lap, as the engine counts it
  const fmt2 = (sec: number) => `${sec <= 0 ? "-" : "+"}${Math.abs(sec).toFixed(2)}s`;
  const toneOf = (k: number, t: number) => TONE[sectorTone(t, refSecs[k] ?? Infinity, ghost?.sectors[k])];

  const pointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const side = e.clientX - r.left < r.width / 2 ? "brake" : "throttle";
    ctl.current.pointers.set(e.pointerId, { side, x0: e.clientX, dx: 0 });
    e.currentTarget.setPointerCapture(e.pointerId);
    if (phase === "wait" && geo) start();
  };
  const pointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = ctl.current.pointers.get(e.pointerId);
    if (p) p.dx = e.clientX - p.x0;
  };
  const pointerUp = (e: React.PointerEvent<HTMLDivElement>) => ctl.current.pointers.delete(e.pointerId);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink-950">
      <div className="flex shrink-0 flex-wrap items-center gap-4 px-6 py-3">
        <div>
          <div className="kicker">{session} · flying lap</div>
          <div className="font-display text-3xl font-black uppercase leading-none text-white">{trackId.replace(/_/g, " ")}</div>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:ml-6">
          {[0, 1, 2].map((k) => (
            <div key={k} className="w-28 rounded-md bg-ink-900 px-3 py-1.5">
              <div className="text-xs font-bold uppercase text-slate-400">Sector {k + 1}</div>
              <div className="font-display text-2xl font-black leading-none" style={{ color: sectors[k] !== undefined ? toneOf(k, sectors[k]) : "#475569" }}>
                {sectors[k] !== undefined ? sectors[k].toFixed(2) : refSecs[k] !== undefined ? <span className="text-slate-600">{refSecs[k].toFixed(2)}</span> : "-"}
              </div>
            </div>
          ))}
        </div>
        <div className="grid gap-0.5 text-sm text-slate-400">
          <div>
            Reference <b className="font-display text-lg text-white">{geo ? lapTime(refLap(geo)).slice(0, -1) : "-"}</b>
          </div>
          <div>
            Your best <b className="font-display text-lg text-white">{ghost ? lapTime(ghost.time).slice(0, -1) : "none yet"}</b>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <button className={`rounded-md px-3 py-2 font-display text-base font-bold uppercase ${onboard ? "bg-white text-ink-950" : "bg-ink-800 text-slate-300"}`} onClick={() => setOnboard((v) => saveOnboard(!v))}>
            {onboard ? "Onboard" : "Chase cam"}
          </button>
          <button className={`rounded-md px-3 py-2 font-display text-base font-bold uppercase ${guide ? "bg-white text-ink-950" : "bg-ink-800 text-slate-300"}`} onClick={() => setGuide((v) => !v)}>
            Guide {guide ? "on" : "off"}
          </button>
          {phase === "run" ? (
            <button className="text-lg text-slate-400 hover:text-white" onClick={() => (abort.current = true)}>
              Abort lap
            </button>
          ) : phase === "wait" ? (
            <button className="text-lg text-slate-400 hover:text-white" onClick={onQuit}>
              Don't drive it
            </button>
          ) : null}
        </div>
      </div>
      <div className="relative min-h-0 flex-1 select-none overflow-hidden" style={{ touchAction: "none" }} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>
        <div ref={host} className="absolute inset-0" />
        <canvas ref={ref} className="relative h-full w-full" />
        {phase === "wait" && (
          <div className="absolute inset-x-0 bottom-0 bg-ink-950/90 p-6 text-center">
            <div className="headline text-5xl">Drive the lap</div>
            <p className="mx-auto mt-2 max-w-3xl text-lg text-slate-300">
              Up or W is the throttle, Down, S or Space the brake, Left and Right (or A and D) steer. On a phone: hold the right half to accelerate, the left half to brake, drag or tilt to steer. Brake for the red parts of the line, carry too much speed and you run wide. All four wheels off the kerb and the lap is deleted.
              Once you start, the lap counts.
            </p>
            <button className="btn-xl mt-4 bg-race text-white hover:bg-red-500" disabled={!geo} onClick={start}>
              {geo ? "Start the lap ›" : "Loading the track…"}
            </button>
          </div>
        )}
        {phase === "done" && result && (
          <div className="absolute inset-0 grid place-items-center bg-ink-950/85 p-6 text-center">
            <div>
              {result.deleted ? (
                <>
                  <div className="kicker">Track limits{result.corner ? ` · turn ${result.corner}` : ""}</div>
                  <div className="font-display text-8xl font-black leading-none text-rose-400">Lap deleted</div>
                  <div className="mt-2 text-lg text-slate-400">No time. The engine counts it as a mess: {fmt2(gain(result.q))} and a scrappy lap twice as likely.</div>
                </>
              ) : (
                <>
                  <div className="kicker">{result.best ? "Your best at this track" : "Lap time"}</div>
                  <div className="font-display text-8xl font-black leading-none text-white">{lapTime(result.time)}</div>
                  <div className="mt-2 font-display text-4xl font-black" style={{ color: result.time <= (geo ? refLap(geo) : 0) ? TONE.green : "#fb7185" }}>
                    {geo ? fmt2(result.time - refLap(geo)) : ""} <span className="text-2xl text-slate-400">vs the reference</span>
                  </div>
                  <div className="mt-4 flex justify-center gap-2">
                    {result.sectors.map((t, k) => (
                      <div key={k} className="rounded-md bg-ink-900 px-4 py-2">
                        <div className="text-xs font-bold uppercase text-slate-400">S{k + 1}</div>
                        <div className="font-display text-2xl font-black" style={{ color: toneOf(k, t) }}>
                          {t.toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 text-lg text-slate-400">
                    As the engine counts it: {fmt2(gain(result.q))} on your qualifying lap{result.q >= 0.85 ? ", and a clean one: less chance of a scrappy lap" : result.q < 0.3 ? ": a scrappy lap is twice as likely" : ""}.
                  </div>
                </>
              )}
              <button autoFocus className="btn-xl mt-6 bg-race text-white hover:bg-red-500" onClick={() => onDone(result.q, result.deleted ? "Deleted" : lapTime(result.time).slice(0, -1))}>
                Keep this lap ›
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
