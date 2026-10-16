// The lights-out start from the cockpit: you sit in your grid slot on the real track, the field around you in
// team colours, the gantry ahead. Five reds, then out after a random wait: Space or tap to launch. Same score
// as the flat Reaction game (reactionScore), so the engine's launch is unchanged. Display only: Math.random
// here never touches the race.
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { reactionScore } from "../../career/SimGames";
import { useTrack } from "../../components/bits";
import { verdictColor } from "../BrakeBar";
import { build, HALF_M } from "../drive";
import { car, EYE, frame, groundOf, inside, road, sky } from "./scene";
import { zones } from "./duel";

export interface Start3DProps {
  trackId: string;
  km: number;
  target: number;
  grid: { slot: number; color: string; color2?: string; num?: number }[]; // the field, 1-based slots
  mySlot: number;
  myColor: string;
  onDone: (score: number, jumped: boolean) => void;
  onSimple: () => void;
}

const SLOT = 8; // metres between grid slots (16 m between rows, staggered)

export default function Start3D(p: Start3DProps) {
  const track = useTrack(p.trackId);
  const host = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<"ready" | "lights" | "out" | "done" | "jump">("ready");
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const [ms, setMs] = useState(0);
  const lit = useRef(0);
  const [litN, setLitN] = useState(0); // the same, for the light strip on screen
  const outAt = useRef(0);
  const goAt = useRef(0); // when you launched (performance.now), for the getaway
  const timers = useRef<number[]>([]);
  const clear = () => {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current = [];
  };

  useEffect(() => {
    if (!track || !host.current) return;
    const g = build(track, p.km, p.target);
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
    sky(scene, p.trackId);
    const slotAt = (slot: number) => ({ d: g.len - ((slot - 1) * SLOT + 6) / g.m, x: slot % 2 ? 0.35 : -0.35 }); // pole on the left of the road
    const back = slotAt(Math.max(22, p.mySlot) + 2).d;
    const f0 = frame(g, 0, 0);
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshLambertMaterial({ color: groundOf(p.trackId), side: THREE.DoubleSide }));
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(f0.px, -0.03, f0.pz);
    scene.add(grass);
    scene.add(road(g, back - 40 / g.m, g.len + 600 / g.m, zones(g).filter((z) => z.brakeD < 600 / g.m).map((z) => ({ ...z, brakeD: z.brakeD + g.len })), p.trackId));
    // the grid boxes and the field
    const cars = p.grid.map((e) => {
      const c = car(e.slot === p.mySlot ? p.myColor : e.color, true, e.color2, e.num);
      if (e.slot === p.mySlot) inside(c, true);
      scene.add(c);
      return { c, slot: e.slot, react: 0.18 + ((e.slot * 37) % 17) / 100, d: slotAt(e.slot).d, x: slotAt(e.slot).x, v: 0 };
    });
    const white = new THREE.MeshBasicMaterial({ color: "#f1f5f9" });
    for (const e of cars) {
      const f = frame(g, e.d - 2.2 / g.m, e.x);
      const line = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.25), white);
      line.rotation.x = -Math.PI / 2;
      line.rotation.z = f.yaw;
      line.position.set(f.px, 0.02, f.pz);
      scene.add(line);
    }
    // the gantry over the line, five pairs of lights facing the grid
    const gf = frame(g, g.len + 4 / g.m, 0);
    const gantry = new THREE.Group();
    const dark = new THREE.MeshLambertMaterial({ color: "#111318", side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.BoxGeometry(HALF_M * 2 + 4, 2.2, 0.6), dark);
    gantry.add(beam);
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 0.5), dark);
      post.position.set(s * (HALF_M + 2), -3.5, 0);
      gantry.add(post);
    }
    const off = new THREE.MeshBasicMaterial({ color: "#2a1215" });
    const on = new THREE.MeshBasicMaterial({ color: "#ff1a1a" });
    const lamps: THREE.Mesh[][] = [];
    for (let k = 0; k < 5; k++) {
      const col: THREE.Mesh[] = [];
      for (const y of [0.35, -0.35]) {
        const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.42, 18), off);
        lamp.position.set((k - 2) * 1.35, y * 1.4, 0.31);
        gantry.add(lamp);
        col.push(lamp);
      }
      lamps.push(col);
    }
    gantry.position.set(gf.px, 6.5, gf.pz);
    gantry.rotation.y = gf.yaw; // local +z points back down the grid, where the lamps face
    scene.add(gantry);
    const cam = new THREE.PerspectiveCamera(70, 1, 0.05, 1500);
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
      lamps.forEach((col, k) => col.forEach((m) => (m.material = lit.current > k ? on : off)));
      // after lights out everyone launches; you go when you went (a jump start: early)
      const ph = phaseRef.current;
      const out = outAt.current;
      for (const e of cars) {
        const mine = e.slot === p.mySlot;
        const t0 = mine ? goAt.current : out ? out + e.react * 1000 : 0;
        if (t0 && now > t0 && (ph === "out" || ph === "done" || ph === "jump" || mine)) e.v = Math.min(70, e.v + 11 * dt);
        e.d += (e.v * dt) / g.m;
        const f = frame(g, e.d, e.x);
        e.c.position.set(f.px, 0, f.pz);
        e.c.rotation.y = f.yaw;
      }
      const me = cars.find((e) => e.slot === p.mySlot)!;
      const f = frame(g, me.d, me.x);
      cam.position.set(f.px - f.dx * EYE.z, EYE.y, f.pz - f.dz * EYE.z);
      cam.lookAt(f.px + f.dx * 40, 2.2, f.pz + f.dz * 40);
      renderer.render(scene, cam);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [track]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = () => {
    clear();
    lit.current = 0;
    setPhase("lights");
    for (let k = 1; k <= 5; k++) timers.current.push(window.setTimeout(() => setLitN((lit.current = k)), k * 900));
    timers.current.push(
      window.setTimeout(() => {
        lit.current = 0;
        setLitN(0);
        outAt.current = performance.now();
        setPhase("out");
      }, 5 * 900 + 500 + Math.random() * 2200),
    );
  };
  const go = () => {
    const ph = phaseRef.current;
    if (ph === "lights") {
      clear();
      goAt.current = performance.now();
      lit.current = 0;
      setLitN(0);
      setPhase("jump");
    } else if (ph === "out") {
      goAt.current = performance.now();
      setMs(Math.round(goAt.current - outAt.current));
      setPhase("done");
    } else if (ph === "ready") start();
  };
  useEffect(() => clear, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.code === "Space" || e.code === "Enter") && !e.repeat) {
        e.preventDefault();
        go();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const score = phase === "done" ? reactionScore(ms) : 0;
  return (
    <div className="fixed inset-0 z-[60] select-none bg-ink-950" onPointerDown={phase === "lights" || phase === "out" ? go : undefined} style={{ touchAction: "manipulation" }}>
      <div ref={host} className="absolute inset-0" />
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 60" preserveAspectRatio="none">
        <path d="M50 -2 V13" stroke="#0b0d10" strokeWidth="2.4" />
        <path d="M2 62 C 8 26, 28 12, 50 12 C 72 12, 92 26, 98 62" fill="none" stroke="#0b0d10" strokeWidth="2.2" />
      </svg>
      <div className="absolute left-4 top-4 rounded-md bg-ink-950/85 px-4 py-3">
        <div className="kicker">The start · P{p.mySlot} on the grid</div>
        <div className="mt-1 text-lg text-white">Five red lights. When they all go out, launch: Space or tap. Go early and it's five seconds.</div>
      </div>
      {/* the lights, repeated on screen like the TV onboard graphic */}
      <div className="pointer-events-none absolute left-1/2 top-[16%] flex -translate-x-1/2 gap-2 rounded-md bg-ink-950/85 p-2">
        {[1, 2, 3, 4, 5].map((k) => (
          <div key={k} className={`h-8 w-8 rounded-full sm:h-10 sm:w-10 ${litN >= k ? "bg-red-500" : "bg-ink-800"}`} />
        ))}
      </div>
      <button onPointerDown={(e) => e.stopPropagation()} onClick={p.onSimple} className="absolute right-4 top-4 rounded-md bg-ink-900/90 px-3 py-1.5 text-base font-bold text-white hover:bg-ink-800">
        Simple view
      </button>
      <div className="absolute inset-x-0 bottom-8 flex flex-col items-center gap-4 text-center">
        {phase === "ready" && track && (
          <button autoFocus className="btn-xl bg-race text-white hover:bg-red-500" onClick={start}>
            Formation lap done ›
          </button>
        )}
        {phase === "lights" && <div className="rounded-md bg-ink-950/80 px-6 py-2 font-display text-5xl font-black uppercase text-slate-300">Wait for it</div>}
        {phase === "out" && <div className="rounded-md bg-ink-950/80 px-6 py-2 font-display text-6xl font-black uppercase text-white">Go!</div>}
        {phase === "jump" && (
          <div className="rounded-lg bg-ink-950/95 px-10 py-6">
            <div className="font-display text-7xl font-black uppercase text-rose-400">Jump start</div>
            <button autoFocus className="btn-xl mt-4 bg-ink-800 text-white hover:bg-ink-700" onClick={() => p.onDone(0, true)}>
              Race ›
            </button>
          </div>
        )}
        {phase === "done" && (
          <div className="rounded-lg bg-ink-950/95 px-10 py-6">
            <div className="kicker">Reaction</div>
            <div className={`font-display text-8xl font-black leading-none ${verdictColor(score)}`}>
              {ms}
              <span className="text-4xl"> ms</span>
            </div>
            <button autoFocus className="btn-xl mt-4 bg-race text-white hover:bg-red-500" onClick={() => p.onDone(score, false)}>
              Race ›
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
