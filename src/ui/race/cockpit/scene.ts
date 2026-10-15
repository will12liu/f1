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

export function car(color: string): THREE.Group {
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
export function road(g: Geo, d0: number, d1: number, zs: { brakeD: number; turn: number }[]): THREE.Group {
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
    const f = frame(g, d, sd * (1 + 30 / HALF_M));
    const st = new THREE.Mesh(new THREE.BoxGeometry(40, 6, 9), new THREE.MeshLambertMaterial({ color: seats[k % seats.length], side: THREE.DoubleSide }));
    st.position.set(f.px, 3, f.pz);
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

/** An onboard view of a whole lap for the qualifying game: call draw() each frame with the car (and the
 *  ghost of your best lap, drawn see-through). */
export function onboard(el: HTMLElement, g: Geo, color: string) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.domElement.style.position = "absolute";
  renderer.domElement.style.inset = "0";
  el.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#9cc3e6");
  scene.fog = new THREE.Fog("#9cc3e6", 180, 900);
  scene.add(new THREE.HemisphereLight("#ffffff", "#4a6b3a", 1.6));
  const sun = new THREE.DirectionalLight("#ffffff", 1.4);
  sun.position.set(80, 200, 40);
  scene.add(sun);
  const size = Math.max(g.w, g.h) * g.m;
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(size * 3, size * 3), new THREE.MeshLambertMaterial({ color: "#3f7a36" }));
  grass.rotation.x = -Math.PI / 2;
  grass.position.set((g.w / 2) * g.m, -0.03, (g.h / 2) * g.m);
  scene.add(grass);
  scene.add(road(g, -200 / g.m, g.len + 300 / g.m, zones(g)));
  const mine = car(color);
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
  const cam = new THREE.PerspectiveCamera(72, 1, 0.05, 1500);
  let w = 0;
  let h = 0;
  return {
    draw(s: CarState, gp: { d: number; x: number } | null) {
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
