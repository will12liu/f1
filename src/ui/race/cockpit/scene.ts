// The 3D pieces shared by the cockpit duel and the onboard qualifying lap: the road built from the track
// polyline (flat, real width, kerbs, lines, barriers, grandstands, braking boards), a low-poly F1 car, and a
// ready-made onboard view that follows a drive.ts car.
import * as THREE from "three";
import { at, HALF_M, type CarState, type Geo } from "../drive";
import { zones } from "./duel";

export function frame(g: Geo, d: number, x: number, slip = 0) {
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

// street circuits: walls at the edge, concrete, buildings
export const STREET = new Set(["monaco", "baku", "marina_bay", "vegas", "jeddah", "madring"]);
export const groundOf = (trackId: string) => (STREET.has(trackId) ? "#55595f" : "#3f7a36");

// races run under lights
const NIGHT = new Set(["bahrain", "jeddah", "marina_bay", "vegas", "losail", "yas_marina"]);

/** Sky, fog and light: day, or a floodlit night race. */
export function sky(scene: THREE.Scene, trackId: string): void {
  const night = NIGHT.has(trackId);
  const air = night ? "#0b1220" : "#9cc3e6";
  scene.background = new THREE.Color(air);
  scene.fog = new THREE.Fog(air, night ? 120 : 180, night ? 600 : 900);
  scene.add(new THREE.HemisphereLight(night ? "#c7d2fe" : "#ffffff", night ? "#1f2937" : "#4a6b3a", night ? 1.1 : 1.6));
  const sun = new THREE.DirectionalLight(night ? "#fef3c7" : "#ffffff", night ? 1.0 : 1.4);
  sun.position.set(80, 200, 40);
  scene.add(sun);
}

/** Turn a car's front wheels: steer -1 (right) .. 1 (left). */
export function steerWheels(c: THREE.Group, steer: number): void {
  for (const w of c.children) if (w.name === "front") w.rotation.y = steer * 0.35;
}

/** A low-poly F1 car facing -z. The halo's meshes are named "halo" so an onboard camera can hide its own. */
export function car(color: string, halo = true): THREE.Group {
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
  box(1.4, 0.05, 3.6, 0, 0.07, 0.2, dark); // floor
  box(0.04, 0.32, 1.3, 0, 1.0, 1.35, body); // engine cover fin
  box(0.05, 0.22, 0.6, 0.95, 0.2, -3.1, dark); // front wing endplates
  box(0.05, 0.22, 0.6, -0.95, 0.2, -3.1, dark);
  const light = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.04), new THREE.MeshBasicMaterial({ color: "#ff2a2a" }));
  light.position.set(0, 0.55, 2.5);
  grp.add(light);
  if (halo) {
    // the halo: a hoop over the cockpit and the centre pillar
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.045, 6, 18, Math.PI), dark);
    hoop.rotation.x = -Math.PI / 2;
    hoop.position.set(0, 0.92, -0.25);
    hoop.name = "halo";
    grp.add(hoop);
    box(0.07, 0.3, 0.07, 0, 0.78, -0.68, dark);
    grp.children[grp.children.length - 1].name = "halo";
  }
  for (const [x, z, r] of [[0.85, -1.75, 0.33], [-0.85, -1.75, 0.33], [0.85, 1.6, 0.36], [-0.85, 1.6, 0.36]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.4, 16), tyre);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, r, z);
    if (z < 0) w.name = "front"; // steered (rotation.y)
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
export function road(g: Geo, d0: number, d1: number, zs: { brakeD: number; turn: number }[], trackId = ""): THREE.Group {
  const street = STREET.has(trackId);
  const grp = new THREE.Group();
  const pos: number[] = [];
  const col: number[] = [];
  const C = (h: string) => new THREE.Color(h);
  const tar = C("#3b3f45"),
    line = C("#e5e7eb"),
    red = C("#d42a2a"),
    wht = C("#f1f5f9"),
    wall = C("#c9ced6"),
    top = C("#1d4ed8"),
    fence = C("#6b7280");
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
    // barriers: far back behind run-off on a circuit, right at the edge (with a debris fence) on the streets
    const B = street ? W + 4 : W + 14; // street: just past the track limit (the lap or duel ends there)
    strip(s * B, s * B, 0, 1.1, () => wall);
    strip(s * B, s * B, 1.1, street ? 3.6 : 1.3, () => (street ? fence : top));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  grp.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  // grandstands behind the barriers every so often for a sense of speed; buildings on the streets
  const seats = street ? ["#d6d3d1", "#a8a29e", "#e7e5e4", "#78716c"] : ["#1d4ed8", "#b91c1c", "#f8fafc", "#0f766e"];
  let k = 0;
  for (let d = d0; d < d1; d += (street ? 60 : 140) / g.m, k++) {
    if (!street && k % 3 === 2) continue;
    const sd = k % 2 ? 1 : -1;
    const hgt = street ? 14 + (k % 3) * 9 : 6;
    const deep = street ? 16 : 9;
    const f = frame(g, d, sd * (1 + ((street ? 4 : 16) + deep / 2) / HALF_M));
    const st = new THREE.Mesh(new THREE.BoxGeometry(deep, hgt, street ? 50 : 40), new THREE.MeshLambertMaterial({ color: seats[k % seats.length], side: THREE.DoubleSide }));
    st.position.set(f.px, hgt / 2, f.pz);
    st.rotation.y = f.yaw;
    grp.add(st);
  }
  // braking boards on the outside of the corner
  for (const { brakeD, turn } of zs)
    for (const m of [300, 200, 100, 50]) {
      const f = frame(g, brakeD - (m - 40) / g.m, turn * (1 + 6 / HALF_M));
      const b = board(String(m));
      b.position.set(f.px, 1.6, f.pz);
      b.rotation.y = f.yaw;
      grp.add(b);
    }
  return grp;
}

/** The guide for the qualifying lap: the racing line painted on the road, red where the reference lap brakes. */
function guideMesh(g: Geo): THREE.Mesh {
  const pos: number[] = [];
  const col: number[] = [];
  const red = new THREE.Color("#ef4444");
  const go = new THREE.Color("#a3e635");
  const step = 3 / g.m;
  for (let d = 0; d < g.len; d += step) {
    const a = frame(g, d, at(g, g.line, d));
    const b = frame(g, d + step, at(g, g.line, d + step));
    const w = 0.35;
    const v = [
      [a.px + a.nx * w, 0.02, a.pz + a.ny * w],
      [a.px - a.nx * w, 0.02, a.pz - a.ny * w],
      [b.px - b.nx * w, 0.02, b.pz - b.ny * w],
      [b.px + b.nx * w, 0.02, b.pz + b.ny * w],
    ];
    const i = Math.floor((d / g.len) * g.n) % g.n;
    const c = g.ref.brake[i] ? red : go;
    for (const k of [0, 1, 2, 0, 2, 3]) {
      pos.push(...v[k]);
      col.push(c.r, c.g, c.b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
}

/** An onboard view of a whole lap for the qualifying game: call draw() each frame with the car (and the
 *  ghost of your best lap, drawn see-through). */
export function onboard(el: HTMLElement, g: Geo, color: string, trackId = "") {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.domElement.style.position = "absolute";
  renderer.domElement.style.inset = "0";
  el.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  sky(scene, trackId);
  const size = Math.max(g.w, g.h) * g.m;
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(size * 3, size * 3), new THREE.MeshLambertMaterial({ color: groundOf(trackId) }));
  grass.rotation.x = -Math.PI / 2;
  grass.position.set((g.w / 2) * g.m, -0.03, (g.h / 2) * g.m);
  scene.add(grass);
  scene.add(road(g, -200 / g.m, g.len + 300 / g.m, zones(g), trackId));
  const mine = car(color, false);
  const ghost = car("#e2e8f0");
  ghost.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshLambertMaterial | undefined;
    if (m) {
      const c = m.clone();
      c.transparent = true;
      c.opacity = 0.35;
      (o as THREE.Mesh).material = c;
    }
  });
  scene.add(mine, ghost);
  const guide = guideMesh(g);
  scene.add(guide);
  const cam = new THREE.PerspectiveCamera(72, 1, 0.05, 1500);
  let w = 0;
  let h = 0;
  return {
    draw(s: CarState, gp: { d: number; x: number } | null, showGuide = true, steer = 0) {
      guide.visible = showGuide;
      steerWheels(mine, steer);
      if (el.clientWidth !== w || el.clientHeight !== h) {
        w = el.clientWidth;
        h = el.clientHeight;
        renderer.setSize(w, h);
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
      }
      const me = frame(g, s.d, s.x, s.v > 1 ? s.vlat / s.v : 0);
      mine.position.set(me.px, 0, me.pz);
      mine.rotation.y = me.yaw;
      ghost.visible = !!gp;
      if (gp) {
        const o = frame(g, gp.d, gp.x);
        ghost.position.set(o.px, 0, o.pz);
        ghost.rotation.y = o.yaw;
      }
      cam.position.set(me.px + me.dx * 0.35, 1.0, me.pz + me.dz * 0.35);
      cam.lookAt(me.px + me.dx * 30, 0.55, me.pz + me.dz * 30);
      renderer.render(scene, cam);
    },
    dispose() {
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

/** The whole race from one car (the race view's "Onboard"): every car placed from the replay (lap fraction,
 *  racing line, pairs that are close side by side), the camera in the followed car. */
export function raceOnboard(el: HTMLElement, g: Geo, trackId: string, colors: string[]) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.domElement.style.position = "absolute";
  renderer.domElement.style.inset = "0";
  el.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  sky(scene, trackId);
  const size = Math.max(g.w, g.h) * g.m;
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(size * 3, size * 3), new THREE.MeshLambertMaterial({ color: groundOf(trackId) }));
  grass.rotation.x = -Math.PI / 2;
  grass.position.set((g.w / 2) * g.m, -0.03, (g.h / 2) * g.m);
  scene.add(grass);
  scene.add(road(g, -200 / g.m, g.len + 300 / g.m, zones(g), trackId));
  const cars = colors.map((c) => {
    const m = car(c);
    scene.add(m);
    return m;
  });
  const cam = new THREE.PerspectiveCamera(72, 1, 0.05, 1500);
  let w = 0;
  let h = 0;
  let inside = -1;
  return {
    draw(list: { idx: number; frac: number; pit: boolean; out: boolean }[], follow: number) {
      if (el.clientWidth !== w || el.clientHeight !== h) {
        w = el.clientWidth;
        h = el.clientHeight;
        renderer.setSize(w, h);
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
      }
      if (inside !== follow) {
        for (const [i, m] of cars.entries()) for (const c of m.children) if (c.name === "halo") c.visible = i !== follow;
        inside = follow;
      }
      // along the lap, then cars within a car length or two of the one ahead move across
      const on = list.filter((c) => !c.pit).map((c) => ({ ...c, d: c.frac * g.len })).sort((a, b) => b.d - a.d);
      let side = 1;
      for (const [k, c] of on.entries()) {
        const near = k > 0 && (on[k - 1].d - c.d) * g.m < 7;
        side = near ? -side : 1;
        const x = at(g, g.line, c.d) * 0.6 + (near ? side * 0.45 : 0);
        const f = frame(g, c.d, Math.max(-1, Math.min(1, x)));
        const m = cars[c.idx];
        if (!m) continue;
        m.visible = true;
        m.position.set(f.px, 0, f.pz);
        m.rotation.y = f.yaw;
        if (c.idx === follow) {
          cam.position.set(f.px + f.dx * 0.35, 1.0, f.pz + f.dz * 0.35);
          cam.lookAt(f.px + f.dx * 30, 0.55, f.pz + f.dz * 30);
        }
      }
      for (const c of list) if (c.pit && cars[c.idx]) cars[c.idx].visible = false;
      renderer.render(scene, cam);
    },
    dispose() {
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
