// The 3D pieces shared by the cockpit duel and the onboard qualifying lap: the road built from the track
// polyline (asphalt, rubber line, kerbs, runoff, gravel, grass, armco, hoardings, trees), a low-poly F1 car, and a
// ready-made onboard view that follows a drive.ts car.
import * as THREE from "three";
import { at, HALF_M, type CarState, type Geo } from "../drive";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { zones } from "./duel";

// ── the car model (public/models, CC-BY, see CREDITS.txt): loaded once, cloned per car, painted per team ──
const SCALE = 0.1; // the model is in tenths of a metre: 2.1 m wide
type Tmpl = { car: THREE.Group; driver: THREE.Group };
let tmpl: Tmpl | null = null;
let loading: Promise<Tmpl | null> | null = null;
/** Start loading the models (cars made before it lands are swapped in when it does). */
export function loadModels(): Promise<Tmpl | null> {
  if (!loading) {
    const L = new GLTFLoader();
    loading = Promise.all([L.loadAsync("/models/car.gltf"), L.loadAsync("/models/driver.gltf")])
      .then(([c, d]) => {
        // car: nose to -z, centred, wheels on the ground
        const body = c.scene;
        body.rotation.y = Math.PI;
        body.scale.setScalar(SCALE);
        const car = new THREE.Group();
        car.add(body);
        car.updateMatrixWorld(true);
        const b = new THREE.Box3().setFromObject(car);
        body.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
        body.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const name = (m.material as THREE.Material).name;
          if (/steeringWheel|leather|green_button|Tach/.test(name) || /pCylinder51/.test(m.name)) m.userData.tag = "cockpitWheel";
          (m.material as THREE.Material).side = THREE.DoubleSide; // the mirrors render through a flipped camera
        });
        const driver = new THREE.Group();
        driver.add(d.scene);
        return (tmpl = { car, driver });
      })
      .catch(() => null);
  }
  return loading;
}

const paints = new Map<string, THREE.Material>();
const paint = (base: THREE.Material, color: string) => {
  const k = `${base.uuid}:${color}`;
  let m = paints.get(k);
  if (!m) {
    m = (base as THREE.MeshStandardMaterial).clone();
    (m as THREE.MeshStandardMaterial).color.set(color);
    paints.set(k, m);
  }
  return m;
};
const numbers = new Map<string, THREE.Material>();
function numberDecal(num: number, color: string): THREE.Mesh {
  const k = `${num}:${color}`;
  let m = numbers.get(k);
  if (!m) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const x = c.getContext("2d")!;
    x.fillStyle = "#f8fafc";
    x.beginPath();
    x.arc(64, 64, 60, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = color;
    x.font = "900 78px sans-serif";
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillText(String(num), 64, 70);
    m = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, side: THREE.DoubleSide });
    numbers.set(k, m);
  }
  return new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), m);
}

function fillModel(grp: THREE.Group, t: Tmpl, color: string, color2: string, num?: number, halo = true) {
  const c = t.car.clone(true);
  c.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const name = (m.material as THREE.Material).name;
    // the team's colours where McLaren had red and white
    if (name === "BodyTexture" || name === "BodyworkWhite") m.material = paint(m.material as THREE.Material, color);
    else if (name === "BodyworkRed") m.material = paint(m.material as THREE.Material, color2);
  });
  grp.add(c);
  const drv = t.driver.clone(true);
  drv.userData.tag = "driver";
  drv.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.material = paint(m.material as THREE.Material, color2);
  });
  drv.position.set(DRIVER.x, DRIVER.y, DRIVER.z);
  drv.rotation.y = DRIVER.rot;
  drv.scale.setScalar(DRIVER.s);
  grp.add(drv);
  if (num !== undefined) {
    // the number on the nose and on both sides of the engine cover
    const top = numberDecal(num, color === "#f8fafc" ? "#111" : color);
    top.rotation.x = -Math.PI / 2 + 0.12;
    top.position.set(0, NUMBER.noseY, NUMBER.noseZ);
    grp.add(top);
    for (const sd of [1, -1]) {
      const side = numberDecal(num, color === "#f8fafc" ? "#111" : color);
      side.rotation.y = sd * Math.PI / 2;
      side.position.set(sd * NUMBER.sideX, NUMBER.sideY, NUMBER.sideZ);
      grp.add(side);
    }
  }
  if (halo) {
    const dark = new THREE.MeshLambertMaterial({ color: "#16181c", side: THREE.DoubleSide });
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.04, 6, 18, Math.PI), dark);
    hoop.rotation.x = -Math.PI / 2;
    hoop.position.set(0, EYE.y + 0.12, EYE.z - 0.05);
    hoop.userData.tag = "halo";
    grp.add(hoop);
  }
}
// where things sit on the scaled model (local metres, nose toward -z); tuned by eye
export const EYE = { y: 0.86, z: 0.05 };
const DRIVER = { x: -0.34, y: -0.12, z: 0.2, rot: 0, s: 0.55 };
const NUMBER = { noseY: 0.42, noseZ: -1.55, sideX: 0.42, sideY: 0.62, sideZ: 0.75 };

/** Hide (or show) what the onboard camera would sit inside: the driver, the halo, the model's wheel. */
export function inside(c: THREE.Group, on: boolean): void {
  c.traverse((o) => {
    if (o.userData.tag === "driver" || o.userData.tag === "halo" || o.userData.tag === "cockpitWheel" || o.name === "halo") o.visible = !on;
  });
  c.userData.inside = on;
}

/** A car in team colours (the model once loaded, the block car until then), facing -z. */
export function car(color: string, halo = true, color2 = "#111827", num?: number): THREE.Group {
  const grp = new THREE.Group();
  const build = (t: Tmpl | null) => {
    grp.clear();
    if (t) fillModel(grp, t, color, color2, num, halo);
    else for (const ch of [...blockCar(color, halo).children]) grp.add(ch);
    if (grp.userData.inside) inside(grp, true);
  };
  build(tmpl);
  if (!tmpl) loadModels().then((t) => t && build(t));
  return grp;
}

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
const DESERT = new Set(["bahrain", "losail"]);
export const groundOf = (trackId: string) => (STREET.has(trackId) ? "#55595f" : DESERT.has(trackId) ? "#c2a36b" : "#3f7a36");

// races run under lights
const NIGHT = new Set(["bahrain", "jeddah", "marina_bay", "vegas", "losail", "yas_marina"]);

/** Sky, fog and light: day, or a floodlit night race. A sphere so the horizon is a different colour from overhead. */
export function sky(scene: THREE.Scene, trackId: string): void {
  const night = NIGHT.has(trackId);
  const air = night ? "#0b1220" : "#9cc3e6";
  scene.background = new THREE.Color(air);
  scene.fog = new THREE.Fog(air, night ? 140 : 220, night ? 700 : 1100);
  scene.add(new THREE.HemisphereLight(night ? "#c7d2fe" : "#ffffff", night ? "#1f2937" : DESERT.has(trackId) ? "#c2a36b" : "#4a6b3a", night ? 1.7 : 1.6));
  const sun = new THREE.DirectionalLight(night ? "#fef3c7" : "#fff7ed", night ? 1.5 : 1.35);
  sun.position.set(80, 200, 40);
  scene.add(sun);
  const dome = new THREE.SphereGeometry(4000, 18, 12);
  const attr = dome.attributes.position;
  const top = new THREE.Color(night ? "#020617" : "#2563eb");
  const hor = new THREE.Color(night ? "#1e293b" : "#e0f2fe");
  const cols = new Float32Array(attr.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < attr.count; i++) {
    const t = Math.max(0, Math.min(1, attr.getY(i) / 4000 + 0.15));
    tmp.copy(hor).lerp(top, t);
    cols[i * 3] = tmp.r;
    cols[i * 3 + 1] = tmp.g;
    cols[i * 3 + 2] = tmp.b;
  }
  dome.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  const shell = new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
  shell.frustumCulled = false;
  scene.add(shell);
}

/** Turn a car's front wheels: steer -1 (right) .. 1 (left). */
export function steerWheels(c: THREE.Group, steer: number): void {
  for (const w of c.children) if (w.name === "front") w.rotation.y = steer * 0.35;
}

/** A low-poly F1 car facing -z. The halo's meshes are named "halo" so an onboard camera can hide its own. */
function blockCar(color: string, halo = true): THREE.Group {
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

type Spot = { x: number; y: number; z: number; yaw: number; sc: number };

/** One mesh, many copies. `sc` scales the whole prop. */
function scatter(geo: THREE.BufferGeometry, mat: THREE.Material, spots: Spot[]): THREE.InstancedMesh | null {
  if (!spots.length) return null;
  const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
  const o = new THREE.Object3D();
  for (const [i, p] of spots.entries()) {
    o.position.set(p.x, p.y, p.z);
    o.rotation.set(0, p.yaw, 0);
    o.scale.setScalar(p.sc);
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false; // copies sit all around the circuit, not at the mesh origin
  return mesh;
}

/** Road, kerbs, runoff, gravel, grass, armco and boards for d0..d1 (track units). */
export function road(g: Geo, d0: number, d1: number, zs: { brakeD: number; turn: number }[], trackId = ""): THREE.Group {
  const street = STREET.has(trackId);
  const night = NIGHT.has(trackId);
  const grp = new THREE.Group();
  const pos: number[] = [];
  const col: number[] = [];
  const C = (h: string) => new THREE.Color(h);
  const slabs = [C("#3c4148"), C("#353a41"), C("#43484f"), C("#383d44")];
  const rubber = C("#2a2e34");
  const line = C("#f8fafc");
  const red = C("#e10600");
  const wht = C("#f4f6f8");
  const sausage = C("#f5c518");
  const turf = C("#1f9d4a");
  const runoff = C("#6d737c");
  const gravelA = C("#c4a36a");
  const gravelB = C("#b08d58");
  const desert = DESERT.has(trackId);
  const grassA = desert ? C("#c6a56e") : C("#3d7c38");
  const grassB = desert ? C("#b8956a") : C("#4f9444");
  const mark = C("#1a1d22");
  const water = C("#1d4e89");
  const walk = C("#9aa1ab");
  const rail = C("#d5dae1");
  const rail2 = C("#b7bec8");
  const wall = C("#c5cad3");
  const fence = C("#8b93a0");
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
  // street walls sit just past the white line; a road course keeps run-off, gravel and a fence
  const B = street ? W + 4 : W + 16;
  const kerbAt = (d: number) => g.kerb[Math.floor((((d % g.len) + g.len) % g.len) / g.len * g.n) % g.n];
  // left is the outside of a right-hander (kap > 0)
  const outside = (d: number) => (at(g, g.kap, d) >= 0 ? 1 : -1);
  const lapD = (d: number) => ((d % g.len) + g.len) % g.len;
  const heavy = (d: number) => {
    const u = lapD(d);
    for (const z of zs) {
      let dd = Math.abs(u - lapD(z.brakeD));
      if (dd > g.len / 2) dd = g.len - dd;
      if (dd * g.m < 150) return true;
    }
    return false;
  };
  const brakeAt = (d: number) => g.ref.brake[Math.floor((lapD(d) / g.len) * g.n) % g.n];
  // worn slabs, then the dark rubber the cars lay down on the racing line
  strip(-W, -2.4, 0, 0, (_d, k) => slabs[k % 4]);
  strip(2.4, W, 0, 0, (_d, k) => slabs[(k + 1) % 4]);
  strip(-2.4, 2.4, 0.004, 0.004, () => rubber);
  {
    for (let d = d0; d < d1; d += step) {
      const braking = brakeAt(d);
      const rw = braking ? 1.7 : 0.85;
      const ink = braking ? mark : rubber;
      const a = frame(g, d, at(g, g.line, d));
      const b = frame(g, d + step, at(g, g.line, d + step));
      const v = [
        [a.px + a.nx * rw, 0.008, a.pz + a.ny * rw],
        [a.px - a.nx * rw, 0.008, a.pz - a.ny * rw],
        [b.px - b.nx * rw, 0.008, b.pz - b.ny * rw],
        [b.px + b.nx * rw, 0.008, b.pz + b.ny * rw],
      ];
      for (const i of [0, 1, 2, 0, 2, 3]) {
        pos.push(...v[i]);
        col.push(ink.r, ink.g, ink.b);
      }
    }
  }
  for (const s of [1, -1]) {
    strip(s * (W - 0.42), s * (W - 0.08), 0.016, 0.016, () => line);
    // red-white rumble, with a little vertical face so it reads as raised
    strip(s * W, s * (W + 1.45), 0.045, 0.045, (d, k) => (kerbAt(d) ? (k % 2 ? red : wht) : null));
    strip(s * (W + 1.45), s * (W + 1.45), 0, 0.045, (d, k) => (kerbAt(d) ? (k % 2 ? red : wht) : null));
    // yellow sausage kerbs just past the rumble, a bump every few metres
    strip(s * (W + 1.55), s * (W + 1.95), 0.09, 0.09, (d, k) => (kerbAt(d) && outside(d) === s && k % 6 === 0 ? sausage : null));
    if (street) {
      strip(s * (W + 0.15), s * (B - 0.3), 0.012, 0.012, (d) => (kerbAt(d) ? null : walk));
      if (trackId === "monaco" && s === 1) strip(s * (B + 6), s * (B + 55), -0.6, -0.6, () => water);
    } else {
      strip(s * (W + 0.05), s * (B - 0.6), 0.002, 0.002, (_d, k) => (k % 8 < 4 ? grassA : grassB));
      strip(s * W, s * (W + 2.3), 0.02, 0.02, (d, k) => (kerbAt(d) ? null : k % 4 < 2 ? turf : wht));
      strip(s * (W + 1.7), s * (W + 3.1), 0.022, 0.022, (d, k) => (kerbAt(d) ? (k % 4 < 2 ? turf : wht) : null));
      // striped tarmac on the big stops, gravel on the outside of the other corners
      strip(s * (W + 3.0), s * (W + 9.5), 0.028, 0.028, (d, k) => (heavy(d) && outside(d) === s ? (k % 3 === 0 ? wht : runoff) : null));
      strip(s * (W + 6.5), s * (W + 13.2), 0.034, 0.034, (d, k) => (kerbAt(d) && !heavy(d) && outside(d) === s ? (k % 2 ? gravelA : gravelB) : null));
      // armco: two rails. the catch fence is a see-through sheet added after this mesh
      strip(s * B, s * B, 0.32, 0.46, () => rail);
      strip(s * B, s * B, 0.66, 0.8, () => rail2);
      strip(s * B, s * B, 2.4, 2.55, () => rail);
    }
    if (street) {
      strip(s * B, s * B, 0, 1.15, () => wall);
      strip(s * B, s * B, 1.15, 3.5, () => fence);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  grp.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  if (!street) {
    const fPos: number[] = [];
    for (const s of [1, -1]) {
      for (let d = d0; d < d1; d += step * 2) {
        const p = frame(g, d, 0);
        const q = frame(g, d + step * 2, 0);
        const a = s * B;
        const v = [
          [p.px + p.nx * a, 1.05, p.pz + p.ny * a],
          [p.px + p.nx * a, 2.45, p.pz + p.ny * a],
          [q.px + q.nx * a, 2.45, q.pz + q.ny * a],
          [q.px + q.nx * a, 1.05, q.pz + q.ny * a],
        ];
        for (const i of [0, 1, 2, 0, 2, 3]) fPos.push(...v[i]);
      }
    }
    const fenceGeo = new THREE.BufferGeometry();
    fenceGeo.setAttribute("position", new THREE.Float32BufferAttribute(fPos, 3));
    grp.add(new THREE.Mesh(fenceGeo, new THREE.MeshBasicMaterial({ color: "#dbe3ee", transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })));
  }

  const covers = (d: number) => d >= d0 && d <= d1;
  const lay = (mesh: THREE.Mesh, d: number, x = 0, y = 0.03) => {
    const f = frame(g, d, x);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = f.yaw;
    mesh.position.set(f.px, y, f.pz);
    grp.add(mesh);
  };
  // the start line and the grid, when this stretch crosses the line
  if (covers(0) || covers(g.len)) {
    lay(new THREE.Mesh(new THREE.PlaneGeometry(W * 2.05, 0.55), new THREE.MeshBasicMaterial({ color: "#f8fafc" })), 0);
    const cheq = document.createElement("canvas");
    cheq.width = 64;
    cheq.height = 8;
    const cx = cheq.getContext("2d")!;
    for (let i = 0; i < 16; i++) {
      cx.fillStyle = i % 2 ? "#111827" : "#f8fafc";
      cx.fillRect(i * 4, 0, 4, 8);
    }
    lay(new THREE.Mesh(new THREE.PlaneGeometry(W * 2.05, 1.15), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cheq) })), 2.2 / g.m, 0, 0.032);
    for (let slot = 1; slot <= 22; slot++) {
      const d = g.len - ((slot - 1) * 8 + 6) / g.m;
      if (!covers(d)) continue;
      lay(new THREE.Mesh(new THREE.PlaneGeometry(1.15, 2.2), new THREE.MeshBasicMaterial({ color: "#f8fafc" })), d, slot % 2 ? 0.32 : -0.32, 0.026);
    }
    // pit building on the right of the straight, just before the line
    const pitD = g.len - 50 / g.m;
    if (covers(pitD)) {
      const f = frame(g, pitD, 0);
      const pit = new THREE.Group();
      pit.position.set(f.px, 0, f.pz);
      pit.rotation.y = f.yaw;
      const shell = new THREE.Mesh(new THREE.BoxGeometry(9, 5.5, 70), new THREE.MeshLambertMaterial({ color: "#e7e5e4", side: THREE.DoubleSide }));
      shell.position.set(-(B + 5), 2.75, 0);
      pit.add(shell);
      const door = new THREE.MeshLambertMaterial({ color: "#1f2937", side: THREE.DoubleSide });
      for (let i = -3; i <= 3; i++) {
        const gar = new THREE.Mesh(new THREE.BoxGeometry(0.35, 2.8, 5.5), door);
        gar.position.set(-(B + 0.7), 1.6, i * 9);
        pit.add(gar);
      }
      grp.add(pit);
    }
  }
  // one footbridge, clear of the cars. Suzuka gets a wheel by the start; Abu Dhabi a hotel over the track
  const bridgeD = trackId === "yas_marina" ? g.len * 0.55 : g.len * 0.42;
  if (!street && covers(bridgeD)) {
    const f = frame(g, bridgeD, 0);
    const br = new THREE.Group();
    br.position.set(f.px, 0, f.pz);
    br.rotation.y = f.yaw;
    const dark = new THREE.MeshLambertMaterial({ color: trackId === "yas_marina" ? "#e7e5e4" : "#334155", side: THREE.DoubleSide });
    const deckY = trackId === "yas_marina" ? 14 : 7.4;
    const deck = new THREE.Mesh(new THREE.BoxGeometry((B + 4) * 2, trackId === "yas_marina" ? 8 : 0.45, trackId === "yas_marina" ? 16 : 3.2), dark);
    deck.position.y = deckY;
    br.add(deck);
    for (const s of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.7, deckY, 0.7), dark);
      pillar.position.set(s * (B + 1.2), deckY / 2, 0);
      br.add(pillar);
    }
    grp.add(br);
  }
  if (trackId === "suzuka" && covers(180 / g.m)) {
    const f = frame(g, 180 / g.m, 0);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(14, 0.6, 6, 18), new THREE.MeshLambertMaterial({ color: "#ef4444", side: THREE.DoubleSide }));
    wheel.position.set(f.px + f.nx * (B + 22), 16, f.pz + f.ny * (B + 22));
    grp.add(wheel);
  }

  const posts: Spot[] = [];
  const boards: Spot[][] = [[], [], [], [], [], []];
  const boardCol = ["#e10600", "#1d4ed8", "#f8fafc", "#facc15", "#111827", "#0f766e"];
  const trunks: Spot[] = [];
  const crowns: Spot[][] = [[], []];
  const tyres: Spot[] = [];
  const belts: Spot[] = [];
  const poles: Spot[] = [];
  const lamps: Spot[] = [];
  const huts: Spot[] = [];
  const boats: Spot[] = [];
  const dense = trackId === "spa" || trackId === "monza" || trackId === "suzuka";
  const treeEvery = dense ? 6 : 14;
  let k = 0;
  for (let d = d0; d < d1; d += step, k++) {
    if (!street && k % 3 === 0) {
      for (const s of [1, -1]) {
        const f = frame(g, d, 0);
        const w = s * B;
        posts.push({ x: f.px + f.nx * w, y: 0.42, z: f.pz + f.ny * w, yaw: f.yaw, sc: 1 });
      }
    }
    // colour hoardings along the fence, long side down the track
    if (k % 8 === 2) {
      const s = k % 16 === 2 ? 1 : -1;
      const f = frame(g, d, 0);
      const w = s * (B - (street ? 0.15 : 0.35));
      boards[Math.floor(k / 8) % 6].push({ x: f.px + f.nx * w, y: street ? 0.7 : 0.55, z: f.pz + f.ny * w, yaw: f.yaw, sc: 1 });
    }
    if (!street && !desert && k % treeEvery === 4) {
      const s = k % 20 === 4 ? 1 : -1;
      const f = frame(g, d, 0);
      const w = s * (B + 8);
      const sc = 0.85 + (k % 5) * 0.08;
      const spot = { x: f.px + f.nx * w, y: 0, z: f.pz + f.ny * w, yaw: 0, sc };
      trunks.push({ ...spot, y: 1.15 * sc });
      crowns[k % 2].push({ ...spot, y: 3.35 * sc });
    }
    if (!street && kerbAt(d) && k % 36 === 0) {
      const s = outside(d);
      const f = frame(g, d, 0);
      const w = s * (B - 1.4);
      for (let h = 0; h < 3; h++) tyres.push({ x: f.px + f.nx * w, y: 0.38 + h * 0.72, z: f.pz + f.ny * w, yaw: f.yaw, sc: 1 });
      belts.push({ x: f.px + f.nx * w, y: 1.15, z: f.pz + f.ny * w, yaw: f.yaw, sc: 1 });
    }
    if (k % 160 === 20) {
      const s = street ? 1 : outside(d);
      const f = frame(g, d, 0);
      const w = s * (street ? B + 0.8 : B + 1.6);
      huts.push({ x: f.px + f.nx * w, y: 1.1, z: f.pz + f.ny * w, yaw: f.yaw, sc: 1 });
    }
    if (trackId === "monaco" && k % 46 === 8) {
      const f = frame(g, d, 0);
      const w = B + 18;
      boats.push({ x: f.px + f.nx * w, y: 0.4, z: f.pz + f.ny * w, yaw: f.yaw, sc: 1 });
    }
    if (k % 18 === 6) {
      const s = street ? (k % 36 === 6 ? 1 : -1) : outside(d + 40 / g.m);
      const f = frame(g, d, 0);
      const w = s * (street ? B - 1.1 : B + 0.8);
      poles.push({ x: f.px + f.nx * w, y: 4.2, z: f.pz + f.ny * w, yaw: f.yaw, sc: 1 });
      if (night) lamps.push({ x: f.px + f.nx * w, y: 8.5, z: f.pz + f.ny * w, yaw: f.yaw, sc: 1 });
    }
  }
  const add = (m: THREE.Object3D | null) => m && grp.add(m);
  add(scatter(new THREE.BoxGeometry(0.1, 0.86, 0.1), new THREE.MeshLambertMaterial({ color: "#8e97a3" }), posts));
  boardCol.forEach((hex, i) => add(scatter(new THREE.BoxGeometry(0.18, 1.15, 10), new THREE.MeshLambertMaterial({ color: hex, side: THREE.DoubleSide }), boards[i])));
  add(scatter(new THREE.CylinderGeometry(0.18, 0.26, 2.3, 5), new THREE.MeshLambertMaterial({ color: "#6b4f32" }), trunks));
  add(scatter(new THREE.ConeGeometry(1.7, 3.4, 6), new THREE.MeshLambertMaterial({ color: night ? "#14532d" : "#226b32" }), crowns[0]));
  add(scatter(new THREE.ConeGeometry(1.7, 3.4, 6), new THREE.MeshLambertMaterial({ color: night ? "#166534" : "#2f8a3e" }), crowns[1]));
  add(scatter(new THREE.CylinderGeometry(0.42, 0.42, 0.7, 8), new THREE.MeshLambertMaterial({ color: "#141414" }), tyres));
  add(scatter(new THREE.BoxGeometry(0.95, 0.18, 0.5), new THREE.MeshLambertMaterial({ color: "#e10600" }), belts));
  add(scatter(new THREE.BoxGeometry(1.3, 2.2, 1.3), new THREE.MeshLambertMaterial({ color: "#f97316" }), huts));
  add(scatter(new THREE.BoxGeometry(2.4, 0.7, 7), new THREE.MeshLambertMaterial({ color: "#f8fafc" }), boats));
  add(scatter(new THREE.BoxGeometry(0.16, 8.4, 0.16), new THREE.MeshLambertMaterial({ color: "#4b5563" }), poles));
  add(scatter(new THREE.BoxGeometry(1.4, 0.16, 0.45), new THREE.MeshBasicMaterial({ color: "#fff4cc" }), lamps));

  // grandstands behind the fence; buildings tight to the wall on the streets
  const seats = street ? ["#d6d3d1", "#a8a29e", "#e7e5e4", "#78716c"] : ["#1d4ed8", "#b91c1c", "#f8fafc", "#0f766e"];
  let n = 0;
  for (let d = d0; d < d1; d += (street ? 70 : 170) / g.m, n++) {
    if (!street && n % 4 === 3) continue;
    const sd = n % 2 ? 1 : -1;
    const anchor = street ? W + 14 : B + 4;
    const f = frame(g, d, (sd * anchor) / HALF_M);
    const stand = new THREE.Group();
    stand.position.set(f.px, 0, f.pz);
    stand.rotation.y = f.yaw;
    if (street) {
      const city = trackId === "marina_bay" || trackId === "vegas" || trackId === "baku";
      const h = (city ? 36 : 16) + (n % 3) * (city ? 16 : 10);
      const body = new THREE.Mesh(new THREE.BoxGeometry(14, h, 40), new THREE.MeshLambertMaterial({ color: seats[n % seats.length], side: THREE.DoubleSide }));
      body.position.set(sd * 8, h / 2, 0);
      stand.add(body);
      const glass = new THREE.MeshLambertMaterial({ color: "#1f2937", side: THREE.DoubleSide });
      for (const wy of [0.32, 0.52, 0.72]) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(14.3, 1.15, 40.2), glass);
        win.position.set(sd * 8, h * wy, 0);
        stand.add(win);
      }
    } else {
      const mat = new THREE.MeshLambertMaterial({ color: seats[n % seats.length], side: THREE.DoubleSide });
      const dark = new THREE.MeshLambertMaterial({ color: "#111827", side: THREE.DoubleSide });
      for (let i = 0; i < 5; i++) {
        const tier = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.55, 46), mat);
        tier.position.set(sd * (1.1 + i * 2.1), 0.75 + i * 0.74, 0);
        stand.add(tier);
      }
      const roof = new THREE.Mesh(new THREE.BoxGeometry(11.2, 0.22, 48), dark);
      roof.position.set(sd * 5.4, 4.7, 0);
      stand.add(roof);
    }
    grp.add(stand);
  }
  // braking boards on the outside of the corner, by the fence
  for (const { brakeD, turn } of zs)
    for (const m of [300, 200, 100, 50]) {
      const f = frame(g, brakeD - (m - 40) / g.m, turn * ((street ? W + 2.6 : B - 1.2) / HALF_M));
      const b = board(String(m));
      b.position.set(f.px, 1.5, f.pz);
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
  const mine = car(color);
  inside(mine, true);
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
      cam.position.set(me.px - me.dx * EYE.z, EYE.y, me.pz - me.dz * EYE.z);
      cam.lookAt(me.px + me.dx * 30, EYE.y - 0.35, me.pz + me.dz * 30);
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
export function raceOnboard(el: HTMLElement, g: Geo, trackId: string, colors: { color: string; color2?: string; num?: number }[]) {
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
    const m = car(c.color, true, c.color2, c.num);
    scene.add(m);
    return m;
  });
  const cam = new THREE.PerspectiveCamera(72, 1, 0.05, 1500);
  let w = 0;
  let h = 0;
  let rider = -1;
  return {
    draw(list: { idx: number; frac: number; pit: boolean; out: boolean }[], follow: number) {
      if (el.clientWidth !== w || el.clientHeight !== h) {
        w = el.clientWidth;
        h = el.clientHeight;
        renderer.setSize(w, h);
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
      }
      if (rider !== follow) {
        for (const [i, m] of cars.entries()) inside(m, i === follow);
        rider = follow;
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
          cam.position.set(f.px - f.dx * EYE.z, EYE.y, f.pz - f.dz * EYE.z);
          cam.lookAt(f.px + f.dx * 30, EYE.y - 0.35, f.pz + f.dz * 30);
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
