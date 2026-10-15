// The duel from the cockpit (three.js, loaded only when a moment opens). The road is the real track outline
// around one braking zone, flat, at real width, with kerbs, barriers and the 300/200/100 boards; your car runs
// on drive.ts physics, the other car on the reference lap (duel.ts). Throttle is held for you until you first
// brake; then it's yours. The result (duelScore) is the same 0-1 the braking bar gives.
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useTrack } from "../../components/bits";
import { verdict, verdictColor } from "../BrakeBar";
import { at, build, GEARS, gearOf, HALF_M, type Geo } from "../drive";
import { startDuel, stepDuel, type Duel, type Side } from "./duel";

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
  onResult: (q: number) => void;
  onSimple: () => void; // fall back to the braking bar
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

function frame(g: Geo, d: number, x: number, slip = 0) {
  const nx = at(g, g.nx, d);
  const ny = at(g, g.ny, d);
  const px = at(g, g.px, d) * g.m + nx * x * HALF_M;
  const pz = at(g, g.py, d) * g.m + ny * x * HALF_M;
  const tx = at(g, g.px, d + 1) - at(g, g.px, d - 1);
  const tz = at(g, g.py, d + 1) - at(g, g.py, d - 1);
  const l = Math.hypot(tx, tz) || 1;
  const dx = tx / l + nx * slip;
  const dz = tz / l + ny * slip;
  return { px, pz, nx, ny, dx, dz, yaw: Math.atan2(-dx, -dz) };
}

function car(color: string): THREE.Group {
  const grp = new THREE.Group();
  // double-sided: the mirrors render through a flipped camera
  const body = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
  const dark = new THREE.MeshLambertMaterial({ color: "#16181c", side: THREE.DoubleSide });
  const tyre = new THREE.MeshLambertMaterial({ color: "#0a0a0a", side: THREE.DoubleSide });
  const box = (w: number, h: number, l: number, x: number, y: number, z: number, m: THREE.Material) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), m);
    b.position.set(x, y, z);
    grp.add(b);
  };
  box(0.8, 0.45, 4.4, 0, 0.42, 0, body); // tub
  box(0.34, 0.22, 1.3, 0, 0.32, -2.6, body); // nose
  box(1.5, 0.38, 1.8, 0, 0.36, 0.5, body); // sidepods
  box(0.42, 0.5, 1.1, 0, 0.85, 0.6, body); // airbox
  box(1.9, 0.06, 0.55, 0, 0.12, -3.1, dark); // front wing
  box(1.0, 0.07, 0.45, 0, 0.95, 2.25, dark); // rear wing
  box(0.05, 0.6, 0.55, 0.5, 0.7, 2.25, dark);
  box(0.05, 0.6, 0.55, -0.5, 0.7, 2.25, dark);
  for (const [x, z, r] of [[0.85, -1.75, 0.33], [-0.85, -1.75, 0.33], [0.85, 1.6, 0.36], [-0.85, 1.6, 0.36]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.4, 16), tyre);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, r, z);
    grp.add(w);
  }
  return grp;
}

function board(text: string): THREE.Mesh {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 96;
  const x = c.getContext("2d")!;
  x.fillStyle = "#f8fafc";
  x.fillRect(0, 0, 128, 96);
  x.fillStyle = "#111";
  x.font = "bold 64px sans-serif";
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillText(text, 64, 52);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.8), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), side: THREE.DoubleSide }));
  return m;
}

/** Road, kerbs, lines and barriers for d0..d1 (track units) as one vertex-coloured mesh. */
function road(g: Geo, d0: number, d1: number, turn: number, brakeD: number): THREE.Group {
  const grp = new THREE.Group();
  const pos: number[] = [];
  const col: number[] = [];
  const C = (h: string) => new THREE.Color(h);
  const tar = C("#3b3f45"),
    line = C("#e5e7eb"),
    red = C("#d42a2a"),
    wht = C("#f1f5f9"),
    wall = C("#c9ced6"),
    top = C("#1d4ed8");
  const step = 2 / g.m;
  const strip = (a: number, b: number, y0: number, y1: number, pick: (d: number, k: number) => THREE.Color | null) => {
    let k = 0;
    for (let d = d0; d < d1; d += step, k++) {
      const c = pick(d, k);
      if (!c) continue;
      const p = frame(g, d, 0);
      const q = frame(g, d + step, 0);
      const P = (f: typeof p, w: number, y: number) => [f.px + f.nx * w, y, f.pz + f.ny * w];
      const flat = y0 === y1;
      const v = flat
        ? [P(p, a, y0), P(p, b, y0), P(q, b, y0), P(q, a, y0)]
        : [P(p, a, y0), P(p, a, y1), P(q, a, y1), P(q, a, y0)];
      for (const i of [0, 1, 2, 0, 2, 3]) {
        pos.push(...v[i]);
        col.push(c.r, c.g, c.b);
      }
    }
  };
  const W = HALF_M;
  const kerbAt = (d: number) => g.kerb[Math.floor((((d % g.len) + g.len) % g.len) / g.len * g.n) % g.n];
  strip(-W, W, 0, 0, () => tar);
  for (const s of [1, -1]) {
    strip(s * (W - 0.35), s * (W - 0.1), 0.01, 0.01, () => line);
    strip(s * W, s * (W + 1.3), 0.03, 0.03, (d, k) => (kerbAt(d) ? (k % 4 < 2 ? red : wht) : null));
    strip(s * (W + 14), s * (W + 14), 0, 1.1, () => wall);
    strip(s * (W + 14), s * (W + 14), 1.1, 1.3, () => top);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  grp.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  // grandstands behind the barriers, every so often, for a sense of speed
  const seats = ["#1d4ed8", "#b91c1c", "#f8fafc", "#0f766e"];
  let k = 0;
  for (let d = d0; d < d1; d += 140 / g.m, k++) {
    if (k % 3 === 2) continue;
    const sd = k % 2 ? 1 : -1;
    const f = frame(g, d, sd * (1 + 22 / HALF_M));
    const st = new THREE.Mesh(new THREE.BoxGeometry(40, 7, 9), new THREE.MeshLambertMaterial({ color: seats[k % seats.length], side: THREE.DoubleSide }));
    st.position.set(f.px, 3.5, f.pz);
    st.rotation.y = f.yaw;
    grp.add(st);
  }
  // braking boards on the outside of the corner
  for (const m of [300, 200, 100, 50]) {
    const f = frame(g, brakeD - (m - 40) / g.m, turn * (1 + 6 / HALF_M));
    const b = board(String(m));
    b.position.set(f.px, 1.6, f.pz);
    b.rotation.y = f.yaw;
    grp.add(b);
  }
  return grp;
}

export default function Cockpit3D(p: CockpitProps) {
  const track = useTrack(p.trackId);
  const host = useRef<HTMLDivElement>(null);
  const keys = useRef(new Set<string>());
  const pads = useRef({ l: false, r: false, gas: false, brk: false });
  const [hud, setHud] = useState({ kmh: 0, gear: 1, gap: 0, steer: 0, braked: false, go: false });
  const [res, setRes] = useState<{ q: number; why: string } | null>(null);
  const done = useRef(false);
  const [sound, setSound] = useState(soundOn); // takes effect next duel

  useEffect(() => {
    if (!track || !host.current) return;
    const g = build(track, p.km, p.target);
    const s: Duel = startDuel(g, p.side, p.move, p.pick, p.habit);
    const el = host.current;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      p.onSimple();
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#9cc3e6");
    scene.fog = new THREE.Fog("#9cc3e6", 180, 900);
    scene.add(new THREE.HemisphereLight("#ffffff", "#4a6b3a", 1.6));
    const sun = new THREE.DirectionalLight("#ffffff", 1.4);
    sun.position.set(80, 200, 40);
    scene.add(sun);
    const f0 = frame(g, s.zone.brakeD, 0);
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshLambertMaterial({ color: "#3f7a36", side: THREE.DoubleSide }));
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(f0.px, -0.03, f0.pz);
    scene.add(grass);
    scene.add(road(g, s.me.d - 60 / g.m, s.endD + 500 / g.m, s.zone.turn, s.zone.brakeD));
    const mine = car(p.myColor);
    const opp = car(p.oppColor);
    scene.add(mine, opp);
    const cam = new THREE.PerspectiveCamera(72, 1, 0.05, 1500);
    const mirror = new THREE.PerspectiveCamera(40, 2, 0.5, 400);
    mirror.projectionMatrix.multiply(new THREE.Matrix4().makeScale(-1, 1, 1)); // a mirror, not a rear camera

    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer.setSize(w, h);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize);

    // engine note: a sawtooth through a low-pass, pitch from the revs in the current gear
    let audio: AudioContext | null = null;
    let osc: OscillatorNode | null = null;
    let vol: GainNode | null = null;
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
      } catch {
        audio = null;
      }
    }
    let steer = 0;
    let acc = 0;
    let last = performance.now();
    const t0 = last;
    let raf = 0;
    let hudAt = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const go = now - t0 > 1400;
      if (go && !s.result) {
        acc += dt;
        const k = keys.current;
        const pd = pads.current;
        const want = (k.has("ArrowLeft") || k.has("KeyA") || pd.l ? 1 : 0) - (k.has("ArrowRight") || k.has("KeyD") || pd.r ? 1 : 0);
        while (acc >= STEP) {
          acc -= STEP;
          steer += Math.max(-STEP * 4, Math.min(STEP * 4, want - steer));
          const brake = k.has("ArrowDown") || k.has("KeyS") || k.has("Space") || pd.brk ? 1 : 0;
          const throttle = !brake && (k.has("ArrowUp") || k.has("KeyW") || pd.gas) ? 1 : 0;
          stepDuel(s, { throttle, brake, steer }, STEP, p.grip ?? 1);
          if (s.result) break;
        }
        const r = s.result as Duel["result"]; // set inside stepDuel
        if (r && !done.current) {
          done.current = true;
          setRes(r);
          const q = r.q;
          window.setTimeout(() => p.onResult(q), 2200);
        }
      }
      const me = frame(g, s.me.d, s.me.x, s.me.v > 1 ? s.me.vlat / s.me.v : 0);
      mine.position.set(me.px, 0, me.pz);
      mine.rotation.y = me.yaw;
      const o = frame(g, s.opp.d, s.opp.x);
      opp.position.set(o.px, 0, o.pz);
      opp.rotation.y = o.yaw;
      // the driver's eyes: low, in front of the airbox, the nose and front wheels below
      cam.position.set(me.px + me.dx * 0.35, 1.0, me.pz + me.dz * 0.35);
      cam.lookAt(me.px + me.dx * 30, 0.55, me.pz + me.dz * 30);
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, w, h);
      renderer.render(scene, cam);
      // two mirrors on the sidepods
      renderer.setScissorTest(true);
      const mw = Math.round(w * 0.16);
      const mh = Math.round(mw / 2);
      for (const sd of [1, -1]) {
        const lx = me.px + me.nx * sd * 0.7;
        const lz = me.pz + me.ny * sd * 0.7;
        mirror.position.set(lx, 0.8, lz);
        mirror.lookAt(lx - me.dx * 30, 0.6, lz - me.dz * 30);
        const x0 = sd > 0 ? Math.round(w * 0.06) : Math.round(w * 0.94) - mw;
        const y0 = Math.round(h * 0.36);
        renderer.setViewport(x0, y0, mw, mh);
        renderer.setScissor(x0, y0, mw, mh);
        renderer.render(scene, mirror);
      }
      if (osc && audio) {
        const kmh = s.me.v * 3.6;
        const gr = gearOf(kmh);
        const lo = GEARS[gr - 1] ?? 0;
        const hi = GEARS[gr] ?? 345;
        const rev = Math.max(0, Math.min(1, (kmh - lo) / (hi - lo)));
        osc.frequency.setTargetAtTime(s.result ? 90 : 140 + 260 * rev + gr * 12, audio.currentTime, 0.03);
      }
      if (now - hudAt > 80) {
        hudAt = now;
        setHud({ kmh: s.me.v * 3.6, gear: gearOf(s.me.v * 3.6), gap: (s.me.d - s.opp.d) * g.m, steer, braked: s.braked, go });
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      audio?.close();
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [track]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const dn = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
      keys.current.add(e.code);
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", dn);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const pad = (k: keyof typeof pads.current, text: string, cls: string) => (
    <button
      className={`pointer-events-auto select-none rounded-lg bg-ink-950/80 font-display text-2xl font-black uppercase text-white active:bg-white active:text-ink-950 ${cls}`}
      onPointerDown={() => (pads.current[k] = true)}
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
      {/* halo */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 60" preserveAspectRatio="none">
        <path d="M50 -2 V13" stroke="#0b0d10" strokeWidth="2.4" />
        <path d="M2 62 C 8 26, 28 12, 50 12 C 72 12, 92 26, 98 62" fill="none" stroke="#0b0d10" strokeWidth="2.2" />
      </svg>
      {/* steering wheel */}
      <div className="pointer-events-none absolute bottom-[-4%] left-1/2 w-[min(46vw,520px)] -translate-x-1/2" style={{ transform: `translateX(-50%) rotate(${-hud.steer * 80}deg)` }}>
        <svg viewBox="0 0 200 110" className="w-full">
          <path d="M20 40 Q20 8 52 8 H148 Q180 8 180 40 V96 Q180 108 166 108 H140 L128 80 H72 L60 108 H34 Q20 108 20 96 Z" fill="#141619" stroke="#2a2e34" strokeWidth="3" />
          <rect x="68" y="18" width="64" height="40" rx="4" fill="#05070a" />
          <text x="100" y="40" textAnchor="middle" fill="#f8fafc" fontSize="18" fontWeight="900" fontFamily="sans-serif">
            {Math.round(hud.kmh)}
          </text>
          <text x="100" y="54" textAnchor="middle" fill="#94a3b8" fontSize="9" fontFamily="sans-serif">
            KM/H · GEAR {hud.gear}
          </text>
          <text x="46" y="44" textAnchor="middle" fill={gap > 0 ? "#34d399" : "#fbbf24"} fontSize="13" fontWeight="900" fontFamily="sans-serif">
            {gap > 0 ? "+" : ""}
            {gap.toFixed(0)}m
          </text>
          <circle cx="154" cy="40" r="7" fill={hud.braked ? "#ef4444" : "#334155"} />
        </svg>
      </div>
      <div className="pointer-events-none absolute left-4 top-4 max-w-md rounded-md bg-ink-950/85 px-4 py-3">
        <div className="font-display text-3xl font-black uppercase text-race">{p.label}</div>
        <div className="mt-1 text-base text-white">
          {p.side === "attack" ? "Get past him. " : "Keep him behind (mirrors). "}
          {hud.braked ? "Throttle is yours now: W / Up." : "Brake at the boards: S / Down / Space."}
        </div>
        <div className="mt-1 text-sm text-slate-400">Steer with A D or the arrows. Off the road or into him and it's over.</div>
      </div>
      <div className="absolute right-4 top-4 flex gap-2">
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
          Simple controls
        </button>
      </div>
      {!hud.go && track && <div className="pointer-events-none absolute inset-x-0 top-[38%] text-center font-display text-7xl font-black uppercase text-white">Ready</div>}
      <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-between gap-3 md:hidden">
        <div className="flex gap-2">
          {pad("l", "‹", "h-20 w-20")}
          {pad("r", "›", "h-20 w-20")}
        </div>
        <div className="flex gap-2">
          {pad("brk", "Brake", "h-20 w-24")}
          {pad("gas", "Gas", "h-20 w-20")}
        </div>
      </div>
      {res && (
        <div className="absolute inset-x-0 top-[30%] mx-auto w-fit rounded-lg bg-ink-950/95 px-10 py-6 text-center">
          <div className={`font-display text-6xl font-black uppercase ${verdictColor(res.q)}`}>{verdict(res.q)}</div>
          <div className="mt-2 text-2xl font-bold text-white">{res.why}</div>
          <div className="mt-1 text-base text-slate-400">Score {Math.round(res.q * 100)}</div>
        </div>
      )}
    </div>
  );
}
