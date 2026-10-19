// The drive-it-yourself picture. Cars, asphalt, kerbs, sponsor boards, catch fence, grandstand,
// pit building and start gantry are the generated look from the MIT game
// https://github.com/hirosichen/ai-f1-racing-game, laid along our circuit (drive.ts) instead of theirs.
import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { at, HALF_M, type Geo } from "./drive";
import { frame, guideMesh } from "./cockpit/scene";

const WHEEL_R = 0.36;
const DS2 = THREE.DoubleSide;

function mulberry(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const rnd = mulberry(20260925);

function tex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, nearest = false) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (nearest) t.magFilter = THREE.NearestFilter;
  return t;
}

function speckle(g: CanvasRenderingContext2D, w: number, h: number, n: number, cols: string[], size = 2) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = cols[(rnd() * cols.length) | 0];
    g.globalAlpha = 0.2 + rnd() * 0.5;
    g.fillRect(rnd() * w, rnd() * h, size * rnd() + 0.6, size * rnd() + 0.6);
  }
  g.globalAlpha = 1;
}

const asphaltTex = tex(512, 512, (g, w, h) => {
  g.fillStyle = "#55575c";
  g.fillRect(0, 0, w, h);
  speckle(g, w, h, 70000, ["#3e4044", "#62656b", "#2f3134", "#707379"], 2.2);
  const gr = g.createLinearGradient(0, 0, w, 0);
  gr.addColorStop(0, "rgba(0,0,0,0)");
  gr.addColorStop(0.3, "rgba(16,16,18,.16)");
  gr.addColorStop(0.7, "rgba(16,16,18,.16)");
  gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
});
const grassTex = tex(256, 256, (g, w, h) => {
  g.fillStyle = "#4b8b3a";
  g.fillRect(0, 0, w, h);
  g.fillStyle = "rgba(255,255,255,.055)";
  g.fillRect(0, 0, w / 2, h);
  speckle(g, w, h, 22000, ["#3d7a2f", "#5a9a45", "#355f28", "#6aa850"], 2);
});
const kerbTex = tex(64, 64, (g) => {
  g.fillStyle = "#d4202c";
  g.fillRect(0, 0, 64, 32);
  g.fillStyle = "#f2f2f2";
  g.fillRect(0, 32, 64, 32);
});
const SPONSORS: [string, string, string, string][] = [
  ["VOLTEX", "#1c3faa", "#fff", "ENERGY"],
  ["ORBITA", "#ececec", "#0a2a6a", "AIRWAYS"],
  ["KAIROS", "#111", "#ffd400", "SWISS TIMING"],
  ["HALCYON", "#d0102a", "#fff", "BANK"],
  ["ZENTH", "#0d7a5a", "#fff", "TELECOM"],
  ["PRISMA", "#ffd400", "#111", "TYRES"],
  ["NORDA", "#5a2bd0", "#fff", "CLOUD"],
  ["LUMEN", "#ff7a1a", "#111", "OIL"],
];
const boardTex = tex(2048, 128, (g, _w, h) => {
  void _w;
  SPONSORS.forEach(([name, bg, fg, sub], k) => {
    const x = k * 256;
    g.fillStyle = bg;
    g.fillRect(x, 0, 256, h);
    g.fillStyle = fg;
    g.textAlign = "center";
    g.font = 'italic 900 60px "Titillium Web", Arial Black, sans-serif';
    g.fillText(name, x + 128, 74);
    g.font = '700 18px "Titillium Web", Arial, sans-serif';
    g.fillText(sub, x + 128, 104);
    g.fillStyle = "rgba(0,0,0,.3)";
    g.fillRect(x + 253, 0, 3, h);
  });
});
const fenceTex = tex(64, 64, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.strokeStyle = "rgba(205,210,215,1)";
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(w, h);
  g.moveTo(w, 0);
  g.lineTo(0, h);
  g.stroke();
});
const crowdTex = tex(
  256,
  256,
  (g, w, h) => {
    g.fillStyle = "#2a2e38";
    g.fillRect(0, 0, w, h);
    const cols = ["#e53935", "#fdd835", "#1e88e5", "#fafafa", "#43a047", "#fb8c00", "#8e24aa", "#f06292", "#00acc1", "#6d4c41", "#212121", "#ff7a1a"];
    for (let y = 0; y < h; y += 8) {
      for (let x = 0; x < w; x += 5) {
        if (rnd() >= 0.9) continue;
        const jy = rnd() * 2;
        g.fillStyle = cols[(rnd() * cols.length) | 0];
        g.fillRect(x + 1, y + 3 + jy, 3, 4);
        g.fillStyle = "#e2b996";
        g.fillRect(x + 1.5, y + 1 + jy, 2, 2);
      }
    }
  },
  true,
);
const facadeTex = tex(512, 256, (g, w, h) => {
  g.fillStyle = "#1d2027";
  g.fillRect(0, 0, w, h);
  const gr = g.createLinearGradient(0, 20, 0, 110);
  gr.addColorStop(0, "#7d9cbd");
  gr.addColorStop(1, "#2b3c52");
  g.fillStyle = gr;
  g.fillRect(0, 24, w, 86);
  g.fillStyle = "#1d2027";
  for (let x = 0; x < w; x += 64) g.fillRect(x, 24, 4, 86);
  for (let x = 8; x < w; x += 128) {
    g.fillStyle = "#0c0d10";
    g.fillRect(x, 140, 112, 116);
    g.fillStyle = "#d8d8d8";
    g.fillRect(x, 134, 112, 4);
  }
});
const checkerTex = tex(
  64,
  16,
  (g) => {
    for (let x = 0; x < 16; x++) {
      for (let y = 0; y < 4; y++) {
        g.fillStyle = (x + y) % 2 ? "#111" : "#f4f4f4";
        g.fillRect(x * 4, y * 4, 4, 4);
      }
    }
  },
  true,
);
const blobTex = tex(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  gr.addColorStop(0, "rgba(0,0,0,.55)");
  gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
});

function prep(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const o = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(o.attributes)) if (k !== "position") o.deleteAttribute(k);
  o.computeVertexNormals();
  return o;
}
function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(list.map(prep));
  if (!g) throw new Error("merge");
  return g;
}
function loft(sec: number[][], seg = 20, pw = 2.8) {
  const pos: number[] = [];
  const ind: number[] = [];
  for (const [z, hw, yb, yt] of sec) {
    const yc = (yb + yt) / 2;
    const hh = (yt - yb) / 2;
    for (let j = 0; j < seg; j++) {
      const t = (j / seg) * Math.PI * 2;
      const c = Math.cos(t);
      const s = Math.sin(t);
      pos.push(hw * Math.sign(c) * Math.abs(c) ** (2 / pw), yc + hh * Math.sign(s) * Math.abs(s) ** (2 / pw), z);
    }
  }
  for (let r = 0; r < sec.length - 1; r++) {
    for (let j = 0; j < seg; j++) {
      const a = r * seg + j;
      const b = r * seg + ((j + 1) % seg);
      ind.push(a, b, a + seg, b, b + seg, a + seg);
    }
  }
  const caps: [number, boolean][] = [
    [0, true],
    [sec.length - 1, false],
  ];
  for (const [r, flip] of caps) {
    const ci = pos.length / 3;
    const row = sec[r];
    pos.push(0, (row[2] + row[3]) / 2, row[0]);
    for (let j = 0; j < seg; j++) {
      const a = r * seg + j;
      const b = r * seg + ((j + 1) % seg);
      if (flip) ind.push(ci, b, a);
      else ind.push(ci, a, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(ind);
  g.computeVertexNormals();
  return g;
}
const box = (w: number, h: number, d: number, x: number, y: number, z: number, rx = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  return g.translate(x, y, z);
};
function rod(a: number[], b: number[], r = 0.022) {
  const va = new THREE.Vector3(a[0], a[1], a[2]);
  const vb = new THREE.Vector3(b[0], b[1], b[2]);
  const len = va.distanceTo(vb);
  const g = new THREE.CylinderGeometry(r, r, len, 6).translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.sub(va).normalize()));
  return g.translate(va.x, va.y, va.z);
}
const FW = [1.75, 0.82];
const RW = [-1.6, 0.8];
const CG = {
  paint: merge([
    loft([
      [2.95, 0.05, 0.22, 0.3],
      [2.6, 0.12, 0.18, 0.38],
      [1.8, 0.22, 0.14, 0.5],
      [1.0, 0.35, 0.12, 0.62],
      [0.4, 0.42, 0.12, 0.66],
      [-0.1, 0.42, 0.12, 0.72],
      [-0.4, 0.3, 0.12, 0.98],
      [-0.9, 0.3, 0.12, 0.88],
      [-1.6, 0.24, 0.12, 0.66],
      [-2.2, 0.14, 0.14, 0.48],
      [-2.45, 0.04, 0.2, 0.36],
    ]),
    loft([
      [0.55, 0.45, 0.12, 0.3],
      [0.35, 0.84, 0.12, 0.52],
      [-0.3, 0.84, 0.12, 0.55],
      [-1.2, 0.56, 0.12, 0.45],
      [-1.9, 0.25, 0.14, 0.35],
    ]),
    box(0.02, 0.3, 1.1, 0, 0.9, -1.15),
    box(0.035, 0.52, 0.62, 0.52, 0.8, -2.2),
    box(0.035, 0.52, 0.62, -0.52, 0.8, -2.2),
  ]),
  accent: merge([
    box(0.03, 0.24, 0.6, 0.96, 0.18, 2.6),
    box(0.03, 0.24, 0.6, -0.96, 0.18, 2.6),
    box(1.72, 0.025, 0.24, 0, 0.2, 2.5, -0.35),
    new THREE.SphereGeometry(0.15, 16, 12).translate(0, 0.78, 0.18),
    loft(
      [
        [0.32, 0.24, 0.3, 0.52],
        [0.0, 0.84, 0.46, 0.54],
        [-0.6, 0.8, 0.48, 0.55],
        [-1.2, 0.5, 0.42, 0.47],
      ],
      16,
    ),
  ]),
  carbon: merge([
    box(1.5, 0.04, 3.9, 0, 0.08, 0.1),
    box(1.1, 0.22, 0.35, 0, 0.18, -2.2),
    box(1.92, 0.03, 0.44, 0, 0.1, 2.64),
    box(1.04, 0.035, 0.34, 0, 0.9, -2.26),
    box(0.92, 0.03, 0.2, 0, 0.46, -2.32),
    box(0.05, 0.48, 0.12, 0, 0.66, -2.15),
    box(0.48, 0.03, 0.78, 0, 0.665, 0.3),
    new THREE.TorusGeometry(0.36, 0.03, 8, 22, Math.PI).rotateX(Math.PI / 2).translate(0, 0.92, 0.16),
    rod([0.36, 0.92, 0.16], [0.36, 0.66, 0.05], 0.03),
    rod([-0.36, 0.92, 0.16], [-0.36, 0.66, 0.05], 0.03),
    rod([0, 0.92, 0.52], [0, 0.6, 0.98], 0.03),
    box(0.16, 0.07, 0.04, 0.58, 0.74, 0.55),
    box(0.16, 0.07, 0.04, -0.58, 0.74, 0.55),
    rod([0.3, 0.6, 0.55], [0.54, 0.73, 0.55], 0.012),
    rod([-0.3, 0.6, 0.55], [-0.54, 0.73, 0.55], 0.012),
    ...[FW, RW].flatMap(([z, x]) =>
      [1, -1].flatMap((sg) => [
        rod([sg * 0.25, 0.46, z + 0.18], [sg * (x - 0.12), 0.44, z]),
        rod([sg * 0.25, 0.46, z - 0.18], [sg * (x - 0.12), 0.44, z]),
        rod([sg * 0.22, 0.22, z + 0.15], [sg * (x - 0.12), 0.26, z]),
        rod([sg * 0.22, 0.22, z - 0.15], [sg * (x - 0.12), 0.26, z]),
      ]),
    ),
  ]),
  flap: prep(box(1.04, 0.03, 0.24, 0, 0, -0.12)),
  light: new THREE.BoxGeometry(0.12, 0.08, 0.03).translate(0, 0.3, -2.47),
};
function wheelGeo(w: number) {
  const tire = prep(new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, w, 32, 1).rotateZ(Math.PI / 2));
  const rim = [prep(new THREE.CylinderGeometry(0.25, 0.25, w + 0.012, 24).rotateZ(Math.PI / 2))];
  for (const sg of [1, -1]) {
    for (let k = 0; k < 5; k++) rim.push(prep(new THREE.BoxGeometry(0.02, 0.44, 0.045).rotateX((k * Math.PI) / 5).translate(sg * (w / 2 + 0.012), 0, 0)));
  }
  const stripe = [1, -1].map((sg) => prep(new THREE.TorusGeometry(WHEEL_R * 0.83, 0.016, 6, 32).rotateY(Math.PI / 2).translate(sg * (w / 2 + 0.004), 0, 0)));
  const g = mergeGeometries([tire, merge(rim), merge(stripe)], true);
  if (!g) throw new Error("wheel");
  return g;
}
const WG = { f: wheelGeo(0.36), r: wheelGeo(0.42) };
const WMATS = [
  new THREE.MeshStandardMaterial({ color: 0x161618, roughness: 0.85 }),
  new THREE.MeshStandardMaterial({ color: 0x2c2c30, metalness: 0.85, roughness: 0.35 }),
  new THREE.MeshStandardMaterial({ color: 0xffd400, roughness: 0.6 }),
];
const CARBON = new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.42, metalness: 0.35, side: DS2 });
const TAIL = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff1010, emissiveIntensity: 1.5 });
const BLOB = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
const blobG = new THREE.PlaneGeometry(2.6, 6.2).rotateX(-Math.PI / 2);

const paintOf = (c: string) => new THREE.MeshPhysicalMaterial({ color: c, metalness: 0.05, roughness: 0.45, clearcoat: 0.8, clearcoatRoughness: 0.12, envMapIntensity: 0.6, side: DS2 });

type Rig = { group: THREE.Group; wheels: THREE.Mesh[]; steer: THREE.Object3D[]; flap: THREE.Mesh; spin: number; flapA: number; mats: THREE.Material[] };

function makeRig(color: string, color2: string): Rig {
  const g = new THREE.Group();
  const paint = paintOf(color);
  const accent = paintOf(color2 || color);
  const mats = [paint, accent];
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D = g) => {
    const x = new THREE.Mesh(geo, mat);
    x.receiveShadow = true;
    parent.add(x);
    return x;
  };
  add(CG.paint, paint);
  add(CG.accent, accent);
  add(CG.carbon, CARBON);
  add(CG.light, TAIL);
  const flap = add(CG.flap, accent);
  flap.position.set(0, 1.02, -2.1);
  const wheels: THREE.Mesh[] = [];
  const steer: THREE.Object3D[] = [];
  for (const [[z, x], geo, front] of [
    [FW, WG.f, true],
    [RW, WG.r, false],
  ] as [[number, number], THREE.BufferGeometry, boolean][]) {
    for (const sg of [1, -1]) {
      const piv = new THREE.Group();
      piv.position.set(sg * x, WHEEL_R, z);
      g.add(piv);
      const w = new THREE.Mesh(geo, WMATS);
      piv.add(w);
      wheels.push(w);
      if (front) steer.push(piv);
    }
  }
  const blob = new THREE.Mesh(blobG, BLOB);
  blob.position.y = 0.03;
  blob.renderOrder = 1;
  g.add(blob);
  return { group: g, wheels, steer, flap, spin: 0, flapA: 0, mats };
}

type Sample = { x: number; z: number; lx: number; lz: number; dx: number; dz: number; kap: number; h: number };

function samplesOf(g: Geo): Sample[] {
  const n = Math.max(120, Math.round((g.len * g.m) / 2));
  const out: Sample[] = [];
  for (let i = 0; i < n; i++) {
    const d = (i / n) * g.len;
    const c = frame(g, d, 0);
    const left = frame(g, d, 1);
    const len = Math.hypot(c.dx, c.dz) || 1;
    out.push({
      x: c.px,
      z: c.pz,
      lx: left.px - c.px,
      lz: left.pz - c.pz,
      dx: c.dx / len,
      dz: c.dz / len,
      kap: at(g, g.kap, d),
      h: Math.atan2(c.dx, c.dz),
    });
  }
  return out;
}

export type LookCam = "chase" | "far" | "onboard" | "tv";
export interface LookCar {
  idx: number;
  /** Lap fraction. Omit when `d` is the track distance. */
  frac?: number;
  /** Track distance in the same units as the centreline. Negative sits on the grid. */
  d?: number;
  x?: number;
  v?: number;
  slip?: number;
  /** Nose heading, atan2(dx, dz). Omit and the car points along the racing line. */
  head?: number;
  /** Front wheels, -1 right .. 1 left. Omit and they follow the corner. */
  steer?: number;
  drs?: boolean;
  hide?: boolean;
  ghost?: boolean;
}

export function auroraView(el: HTMLElement, g: Geo, title: string, colors: { color: string; color2?: string }[], opts?: { map?: boolean }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.8;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.position = "absolute";
  renderer.domElement.style.inset = "0";
  el.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.4, 12000);
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(50), THREE.MathUtils.degToRad(205));
  const makeSky = () => {
    const s = new Sky();
    s.scale.setScalar(5000);
    const u = (s.material as THREE.ShaderMaterial).uniforms;
    u.turbidity.value = 3.2;
    u.rayleigh.value = 1.25;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.8;
    u.sunPosition.value.copy(sunDir);
    return s;
  };
  scene.add(makeSky());
  try {
    const pm = new THREE.PMREMGenerator(renderer);
    const es = new THREE.Scene();
    es.add(makeSky());
    scene.environment = pm.fromScene(es, 0.02, 1, 10000).texture;
    scene.environmentIntensity = 0.5;
    pm.dispose();
  } catch {
    /* clearcoat still reads without an environment map */
  }
  scene.fog = new THREE.Fog(0xbfd0e0, 700, 4200);
  scene.add(new THREE.HemisphereLight(0xdfeaff, 0x4f6d3c, 0.45));
  const sun = new THREE.DirectionalLight(0xfff0dc, 2.7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -95, right: 95, top: 95, bottom: -95, near: 10, far: 700 });
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  const samp = samplesOf(g);
  const n = samp.length;
  const step = (g.len * g.m) / n;
  const lapM = g.len * g.m;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const s of samp) {
    minX = Math.min(minX, s.x);
    maxX = Math.max(maxX, s.x);
    minZ = Math.min(minZ, s.z);
    maxZ = Math.max(maxZ, s.z);
  }
  const owned: THREE.BufferGeometry[] = [];
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ side: DS2, ...o });
  const addMesh = (geo: THREE.BufferGeometry, mat: THREE.Material, cast = false, recv = true) => {
    owned.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = recv;
    scene.add(m);
    return m;
  };
  const pt = (s: Sample, lat: number, y: number): [number, number, number] => {
    const u = lat / HALF_M;
    return [s.x + s.lx * u, y, s.z + s.lz * u];
  };
  const wrap = (i: number) => ((i % n) + n) % n;
  function strip(i0: number, count: number, fn: (s: Sample, i: number) => [[number, number, number], [number, number, number]], vLen: number, uA = 0, uB = 1, swap = false) {
    const pos: number[] = [];
    const uv: number[] = [];
    const ind: number[] = [];
    for (let k = 0; k <= count; k++) {
      const i = wrap(i0 + k);
      const [a, b] = fn(samp[i], i);
      const v = (k * step) / vLen;
      pos.push(...a, ...b);
      if (swap) uv.push(v, uA, v, uB);
      else uv.push(uA, v, uB, v);
    }
    for (let k = 0; k < count; k++) {
      const a = 2 * k;
      ind.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(ind);
    geo.computeVertexNormals();
    return geo;
  }

  const span = Math.max(maxX - minX, maxZ - minZ) + 1800;
  grassTex.repeat.set(span / 22, span / 22);
  addMesh(new THREE.PlaneGeometry(span, span).rotateX(-Math.PI / 2).translate((minX + maxX) / 2, -0.02, (minZ + maxZ) / 2), std({ map: grassTex, roughness: 1, side: THREE.FrontSide }));
  addMesh(strip(0, n, (s) => [pt(s, HALF_M, 0.02), pt(s, -HALF_M, 0.02)], 14), std({ map: asphaltTex, roughness: 0.88, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
  const lineMat = std({ color: 0xf2f2f2, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  addMesh(strip(0, n, (s) => [pt(s, HALF_M - 0.1, 0.03), pt(s, HALF_M - 0.5, 0.03)], 10), lineMat);
  addMesh(strip(0, n, (s) => [pt(s, -HALF_M + 0.5, 0.03), pt(s, -HALF_M + 0.1, 0.03)], 10), lineMat);
  {
    const kerbMat = std({ map: kerbTex, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    const hot = (i: number) => Math.abs(samp[wrap(i)].kap) > 1 / 230;
    let start = 0;
    while (start < n && hot(start)) start++;
    if (start === n) {
      addMesh(strip(0, n, (s) => [pt(s, HALF_M + 1.5, 0.04), pt(s, HALF_M, 0.04)], 3), kerbMat);
      addMesh(strip(0, n, (s) => [pt(s, -HALF_M, 0.04), pt(s, -HALF_M - 1.5, 0.04)], 3), kerbMat);
    } else {
      for (let k = 0; k < n; ) {
        const i = wrap(start + k);
        if (!hot(i)) {
          k++;
          continue;
        }
        let len = 0;
        while (len < n && hot(i + len)) len++;
        addMesh(strip(i - 6, len + 12, (s) => [pt(s, HALF_M + 1.5, 0.04), pt(s, HALF_M, 0.04)], 3), kerbMat);
        addMesh(strip(i - 6, len + 12, (s) => [pt(s, -HALF_M, 0.04), pt(s, -HALF_M - 1.5, 0.04)], 3), kerbMat);
        k += len + 1;
      }
    }
  }
  const line = frame(g, 0, 0);
  const checker = new THREE.Mesh(new THREE.PlaneGeometry(2 * HALF_M, 1.2).rotateX(-Math.PI / 2), std({ map: checkerTex, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }));
  checker.position.set(line.px, 0.045, line.pz);
  checker.rotation.y = Math.atan2(line.dx, line.dz);
  checker.receiveShadow = true;
  scene.add(checker);
  owned.push(checker.geometry);
  const slotG = new THREE.PlaneGeometry(3.2, 0.3).rotateX(-Math.PI / 2);
  owned.push(slotG);
  for (let i = 0; i < Math.min(22, Math.max(colors.length, 20)); i++) {
    const back = (10 + i * 8 - 3.1) / g.m;
    const lat = (i % 2 ? 2.6 : -2.6) / HALF_M;
    const f = frame(g, -back, lat);
    const m = new THREE.Mesh(slotG, lineMat);
    m.position.set(f.px, 0.045, f.pz);
    m.rotation.y = Math.atan2(f.dx, f.dz);
    m.receiveShadow = true;
    scene.add(m);
  }

  const bl = (i: number) => 11.4 + Math.sin(i * 0.11) * 1.3 + Math.sin(i * 0.027) * 0.8;
  const br = (i: number) => 11.0 + Math.sin(i * 0.09 + 2) * 1.2 + Math.sin(i * 0.021) * 0.7;
  const boardMat = std({ map: boardTex, roughness: 0.55 });
  addMesh(strip(0, n, (s, i) => [pt(s, bl(i), 1.15), pt(s, bl(i), 0)], 48, 1, 0, true), boardMat);
  addMesh(strip(0, n, (s, i) => [pt(s, -br(i), 1.15), pt(s, -br(i), 0)], -48, 1, 0, true), boardMat);
  const fenceMat = std({ map: fenceTex, alphaTest: 0.4, alphaToCoverage: true, metalness: 0.5, roughness: 0.5 });
  addMesh(strip(0, n, (s, i) => [pt(s, bl(i) + 0.15, 4.6), pt(s, bl(i) + 0.15, 1.15)], 1.3, 3.45 / 1.3, 0, true), fenceMat, false, false);
  addMesh(strip(0, n, (s, i) => [pt(s, -br(i) - 0.15, 4.6), pt(s, -br(i) - 0.15, 1.15)], 1.3, 3.45 / 1.3, 0, true), fenceMat, false, false);
  {
    const postG = new THREE.BoxGeometry(0.14, 4.8, 0.14).translate(0, 2.4, 0);
    owned.push(postG);
    const count = Math.floor(n / 8) * 2;
    const im = new THREE.InstancedMesh(postG, std({ color: 0x8a8f96, metalness: 0.7, roughness: 0.4 }), count);
    const m4 = new THREE.Matrix4();
    let c = 0;
    for (let i = 0; i < n && c < count; i += 8) {
      im.setMatrixAt(c++, m4.makeTranslation(...pt(samp[i], bl(i) + 0.3, 0)));
      im.setMatrixAt(c++, m4.makeTranslation(...pt(samp[i], -br(i) - 0.3, 0)));
    }
    im.count = c;
    scene.add(im);
  }

  const calm = (i: number) => Math.abs(samp[wrap(i)].kap) < 0.0022;
  let back = 0;
  let fwd = 0;
  const cap = Math.round(700 / step);
  while (back < cap && calm(-back - 1)) back++;
  while (fwd < cap && calm(fwd + 1)) fwd++;
  // The stand starts at the line and runs forward, so the grid camera is not inside the roof.
  const i0 = 0;
  const standLen = Math.max(12, Math.min(n - 2, fwd));
  const crowdMat = std({ map: crowdTex, roughness: 0.9 });
  addMesh(strip(i0, standLen, (s, i) => [pt(s, bl(i) + 24, 15), pt(s, bl(i) + 3.5, 1.8)], 25, 2.4, 0, true), crowdMat, true);
  addMesh(strip(i0, standLen, (s, i) => [pt(s, bl(i) + 3.5, 1.8), pt(s, bl(i) + 3.5, 0)], 10), std({ color: 0x9a9da3, roughness: 0.9 }));
  addMesh(strip(i0, standLen, (s, i) => [pt(s, bl(i) + 24, 16), pt(s, bl(i) + 24, 0)], 10), std({ color: 0x2b2f38, roughness: 0.9 }), true);
  const pitLen = Math.max(8, Math.min(back + Math.min(fwd, Math.round(280 / step)), Math.round(420 / step)));
  const p0 = wrap(-back);
  const signTex = tex(1024, 128, (ctx, w, h) => {
    ctx.fillStyle = "#0b0b0f";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#fff";
    ctx.font = 'italic 900 72px "Titillium Web", Arial Black, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(title.toUpperCase().slice(0, 28), w / 2, h / 2 + 4);
  });
  addMesh(strip(p0, pitLen, (s, i) => [pt(s, -br(i) - 8, 11), pt(s, -br(i) - 8, 0)], 22, 1, 0, true), std({ map: facadeTex, roughness: 0.4, metalness: 0.2 }), true);
  addMesh(strip(p0, pitLen, (s, i) => [pt(s, -br(i) - 7, 11.3), pt(s, -br(i) - 32, 11.3)], 10), std({ color: 0x30343d, roughness: 0.8 }), true);
  addMesh(strip(p0, pitLen, (s, i) => [pt(s, -br(i) - 32, 11.3), pt(s, -br(i) - 32, 0)], 10), std({ color: 0x30343d, roughness: 0.8 }));
  const s0 = wrap(-back + Math.min(back, Math.round(24 / step)));
  const signLen = Math.max(6, Math.min(Math.round(90 / step), Math.max(6, standLen - 8)));
  addMesh(strip(s0, signLen, (s, i) => [pt(s, -br(i) - 12, 17.5), pt(s, -br(i) - 12, 11.3)], 50, 1, 0, true), std({ map: signTex, roughness: 0.5, emissive: 0x222222 }), true);
  addMesh(strip(p0, pitLen, (s, i) => [pt(s, -br(i) - 1, 0.015), pt(s, -br(i) - 8, 0.015)], 14), std({ map: asphaltTex, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
  {
    let best = 0;
    let bi = Math.floor(n / 2);
    for (let i = 0; i < n; i++) {
      const a = Math.abs(samp[i].kap);
      const along = i * step;
      if (a > best && Math.abs(along - lapM / 2) < lapM / 3) {
        best = a;
        bi = i;
      }
    }
    const side = samp[bi].kap >= 0 ? 1 : -1;
    const c0 = wrap(bi - 24);
    const cnt = Math.min(48, n - 1);
    const off = (i: number) => (side > 0 ? bl(i) : br(i));
    addMesh(strip(c0, cnt, (s, i) => [pt(s, side * (off(i) + 14), 9), pt(s, side * (off(i) + 4), 1.5)], 25, 1.8, 0, true), crowdMat, true);
    addMesh(strip(c0, cnt, (s, i) => [pt(s, side * (off(i) + 14), 9), pt(s, side * (off(i) + 14), 0)], 10), std({ color: 0x2b2f38 }), true);
  }

  const gantryLights: THREE.Mesh[][] = [];
  {
    const gantry = new THREE.Group();
    const p = frame(g, 14 / g.m, 0);
    gantry.position.set(p.px, 0, p.pz);
    gantry.rotation.y = Math.atan2(p.dx, p.dz);
    const steel = std({ color: 0x2a2d33, metalness: 0.6, roughness: 0.4 });
    const w = 2 * HALF_M + 5;
    for (const x of [-w / 2, w / 2]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.8, 9, 0.8), steel);
      m.position.set(x, 4.5, 0);
      m.castShadow = true;
      gantry.add(m);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 2, 0.7), steel);
    beam.position.y = 8.2;
    beam.castShadow = true;
    gantry.add(beam);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w - 2, 16), 1.45), std({ map: signTex, roughness: 0.5, emissive: 0x222222 }));
    face.position.set(0, 8.2, -0.46);
    face.rotation.y = Math.PI;
    gantry.add(face);
    owned.push(face.geometry);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.7, 0.5), std({ color: 0x080808, roughness: 0.6 }));
    panel.position.set(0, 6.3, -0.1);
    gantry.add(panel);
    const discG = new THREE.CircleGeometry(0.28, 20).rotateY(Math.PI);
    owned.push(discG);
    for (let c = 0; c < 5; c++) {
      const col: THREE.Mesh[] = [];
      for (let r = 0; r < 2; r++) {
        const m = new THREE.Mesh(discG, new THREE.MeshBasicMaterial({ color: 0x300505 }));
        m.position.set(-2 + c, 6.7 - r * 0.75, -0.36);
        gantry.add(m);
        col.push(m);
      }
      gantryLights.push(col);
    }
    scene.add(gantry);
  }

  {
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    const c1 = new THREE.Color(0x4c7a44);
    const c2 = new THREE.Color(0x8d968c);
    const tc = new THREE.Color();
    const hillRnd = mulberry(n * 17 + Math.round(lapM));
    for (let k = 0; k < 10; k++) {
      const ang = (k / 10) * Math.PI * 2 + hillRnd() * 0.4;
      const dist = 1700 + hillRnd() * 900;
      const r = 380 + hillRnd() * 420;
      let hill: THREE.BufferGeometry = new THREE.IcosahedronGeometry(r, 4);
      hill.deleteAttribute("normal");
      hill.deleteAttribute("uv");
      hill = mergeVertices(hill);
      const p = hill.attributes.position;
      const col: number[] = [];
      for (let i = 0; i < p.count; i++) {
        let x = p.getX(i);
        let y = p.getY(i);
        let z = p.getZ(i);
        const kn = 1 + 0.2 * Math.sin(x * 0.011 + k) * Math.cos(z * 0.012 - k) + 0.08 * Math.sin(x * 0.03 + y * 0.025);
        x *= kn;
        y *= kn;
        z *= kn;
        p.setXYZ(i, x, y, z);
        const hh = Math.max(0, Math.min(1, (y / r) * 1.2));
        tc.copy(c1).lerp(c2, hh * hh);
        col.push(tc.r, tc.g, tc.b);
      }
      hill.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
      hill.computeVertexNormals();
      owned.push(hill);
      const m = new THREE.Mesh(hill, mat);
      m.scale.y = 0.35 + hillRnd() * 0.4;
      m.position.set(cx + Math.cos(ang) * dist, -r * 0.12, cz + Math.sin(ang) * dist);
      scene.add(m);
    }
    const cell = 60;
    const hash = new Map<string, number[]>();
    for (let i = 0; i < n; i += 2) {
      const key = `${Math.floor(samp[i].x / cell)},${Math.floor(samp[i].z / cell)}`;
      const list = hash.get(key);
      if (list) list.push(i);
      else hash.set(key, [i]);
    }
    const near = (x: number, z: number, r: number) => {
      const cx0 = Math.floor(x / cell);
      const cz0 = Math.floor(z / cell);
      for (let a = -1; a <= 1; a++) {
        for (let b = -1; b <= 1; b++) {
          const list = hash.get(`${cx0 + a},${cz0 + b}`);
          if (!list) continue;
          for (const i of list) if ((samp[i].x - x) ** 2 + (samp[i].z - z) ** 2 < r * r) return true;
        }
      }
      return false;
    };
    const COUNT = 900;
    const cone = new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0);
    const trunk = new THREE.CylinderGeometry(0.14, 0.2, 1, 5).translate(0, 0.5, 0);
    owned.push(cone, trunk);
    const im = new THREE.InstancedMesh(cone, new THREE.MeshStandardMaterial({ roughness: 1 }), COUNT);
    const it = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: 0x4a3526, roughness: 1 }), COUNT);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const ps = new THREE.Vector3();
    const col = new THREE.Color();
    let placed = 0;
    for (let t = 0; t < COUNT * 20 && placed < COUNT; t++) {
      const x = minX - 400 + hillRnd() * (maxX - minX + 800);
      const z = minZ - 400 + hillRnd() * (maxZ - minZ + 800);
      if (near(x, z, 58)) continue;
      const h = 9 + hillRnd() * 11;
      const w = 2.6 + hillRnd() * 2.2;
      im.setMatrixAt(placed, m4.compose(ps.set(x, 2, z), q, sc.set(w, h, w)));
      it.setMatrixAt(placed, m4.compose(ps.set(x, 0, z), q, sc.set(1, 2.4, 1)));
      im.setColorAt(placed, col.setHSL(0.27 + hillRnd() * 0.06, 0.42 + hillRnd() * 0.2, 0.15 + hillRnd() * 0.08));
      placed++;
    }
    im.count = it.count = placed;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    scene.add(im, it);
  }

  const rigs = colors.map((c) => {
    const rig = makeRig(c.color, c.color2 ?? "#111111");
    scene.add(rig.group);
    return rig;
  });
  const guide = guideMesh(g);
  guide.visible = false;
  scene.add(guide);

  const mapOn = opts?.map !== false;
  const map = mapOn ? document.createElement("canvas") : null;
  if (map) {
    map.width = 200;
    map.height = 130;
    map.style.cssText = "position:absolute;left:14px;bottom:14px;width:200px;height:130px;z-index:2;pointer-events:none;background:#0b0d13";
    el.appendChild(map);
  }
  const mctx = map?.getContext("2d") ?? null;
  const msc = map ? Math.min((map.width - 16) / Math.max(1, maxX - minX), (map.height - 16) / Math.max(1, maxZ - minZ)) : 1;
  const mx = (x: number) => 8 + (x - minX) * msc;
  const mz = (z: number) => 8 + (z - minZ) * msc;
  const mapPath = new Path2D();
  if (map) samp.forEach((s, i) => (i ? mapPath.lineTo(mx(s.x), mz(s.z)) : mapPath.moveTo(mx(s.x), mz(s.z))));
  if (map) mapPath.closePath();
  let mapAt = 0;

  let vw = 0;
  let vh = 0;
  let camH = 0;
  let aimed = false;
  let last = performance.now();
  const wrapA = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

  return {
    draw(list: LookCar[], follow: number, cam: LookCam, lights: number) {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (el.clientWidth !== vw || el.clientHeight !== vh) {
        vw = el.clientWidth;
        vh = el.clientHeight;
        renderer.setSize(vw, vh);
        camera.aspect = vw / Math.max(1, vh);
      }
      gantryLights.forEach((col, k) => {
        const hex = k < lights ? 0xff2020 : 0x300505;
        for (const bulb of col) (bulb.material as THREE.MeshBasicMaterial).color.setHex(hex);
      });
      let fx = 0;
      let fz = 1;
      let px = 0;
      let pz = 0;
      let fnx = 0;
      let fny = 0;
      let speed = 0;
      let heading = 0;
      const drawn = list.map((c) => ({ ...c, d: c.d !== undefined ? c.d : (c.frac ?? 0) * g.len }));
      drawn.sort((a, b) => b.d - a.d);
      let side = 1;
      const lane = new Map<LookCar, number>();
      for (const [k, c] of drawn.entries()) {
        const prev = k > 0 ? drawn[k - 1] : null;
        const near = !!prev && !prev.hide && !c.hide && (prev.d - c.d) * g.m < 7;
        side = near ? -side : 1;
        const x = c.x !== undefined ? c.x : at(g, g.line, c.d) * 0.6 + (near ? side * 0.45 : 0);
        lane.set(c, x);
      }
      for (const c of drawn) {
        const rig = rigs[c.idx];
        if (!rig) continue;
        rig.group.visible = !c.hide;
        for (const m of rig.mats) {
          m.transparent = !!c.ghost;
          m.opacity = c.ghost ? 0.35 : 1;
        }
        if (c.hide) continue;
        const x = lane.get(c) ?? 0;
        const f = frame(g, c.d, Math.max(-1.85, Math.min(1.85, x)), c.slip ?? 0); // the physics allows 1.8 half-widths
        const len = Math.hypot(f.dx, f.dz) || 1;
        const dx = f.dx / len;
        const dz = f.dz / len;
        rig.group.position.set(f.px, 0, f.pz);
        rig.group.rotation.y = c.head !== undefined ? c.head : Math.atan2(dx, dz);
        const v = c.v ?? 0;
        rig.spin += (v * dt) / WHEEL_R;
        for (const w of rig.wheels) w.rotation.x = rig.spin;
        const k = at(g, g.kap, c.d);
        const st = c.steer !== undefined ? c.steer * 0.4 : Math.max(-0.35, Math.min(0.35, -k * 22));
        for (const piv of rig.steer) piv.rotation.y = st;
        const flap = c.drs ? -0.75 : 0;
        rig.flapA += (flap - rig.flapA) * Math.min(1, dt * 10);
        rig.flap.rotation.x = rig.flapA;
        if (c.idx === follow) {
          px = f.px;
          pz = f.pz;
          fnx = f.nx;
          fny = f.ny;
          if (c.head !== undefined) {
            fx = Math.sin(c.head);
            fz = Math.cos(c.head);
            heading = c.head;
          } else {
            heading = Math.atan2(dx, dz);
            fx = dx;
            fz = dz;
          }
          speed = v;
        }
      }
      if (!aimed) {
        camH = heading;
        aimed = true;
      }
      camH += wrapA(heading - camH) * Math.min(1, dt * (cam === "onboard" ? 20 : 6));
      const sx = Math.sin(camH);
      const sz = Math.cos(camH);
      if (cam === "onboard") {
        camera.position.set(px + fx * 0.36, 0.98, pz + fz * 0.36);
        camera.lookAt(px + sx * 30, 0.7, pz + sz * 30);
        camera.fov = 75;
      } else if (cam === "tv") {
        camera.position.set(px - fx * 18 + fnx * 14, 9, pz - fz * 18 + fny * 14);
        camera.lookAt(px + fx * 6, 0.8, pz + fz * 6);
        camera.fov = 48;
      } else {
        const dist = cam === "far" ? 11 : 7.2;
        const up = cam === "far" ? 3.6 : 2.3;
        camera.position.set(px - sx * dist, up, pz - sz * dist);
        camera.lookAt(px + sx * 7, 0.9, pz + sz * 7);
        camera.fov = 58 + Math.max(0, Math.min(12, Math.abs(speed) * 0.13));
      }
      camera.updateProjectionMatrix();
      sun.position.set(px + sunDir.x * 300, sunDir.y * 300, pz + sunDir.z * 300);
      sun.target.position.set(px, 0, pz);
      renderer.render(scene, camera);

      if (!mctx || !map || now - mapAt < 100) return;
      mapAt = now;
      mctx.clearRect(0, 0, map.width, map.height);
      mctx.lineJoin = "round";
      mctx.strokeStyle = "#0a0b0f";
      mctx.lineWidth = 7;
      mctx.stroke(mapPath);
      mctx.strokeStyle = "#e8ebf0";
      mctx.lineWidth = 3;
      mctx.stroke(mapPath);
      const ordered = list.slice().sort((a, b) => (a.idx === follow ? 1 : 0) - (b.idx === follow ? 1 : 0));
      for (const c of ordered) {
        const rig = rigs[c.idx];
        if (!rig) continue;
        const me = c.idx === follow;
        mctx.beginPath();
        mctx.arc(mx(rig.group.position.x), mz(rig.group.position.z), me ? 4.5 : 2.6, 0, 7);
        mctx.fillStyle = me ? "#e10600" : colors[c.idx]?.color || "#fff";
        mctx.fill();
        if (me) {
          mctx.lineWidth = 1.5;
          mctx.strokeStyle = "#fff";
          mctx.stroke();
        }
      }
    },
    setGuide(on: boolean) {
      guide.visible = on;
    },
    dispose() {
      for (const geo of owned) geo.dispose();
      for (const rig of rigs) for (const m of rig.mats) m.dispose();
      guide.geometry.dispose();
      if (!Array.isArray(guide.material)) guide.material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      map?.remove();
    },
  };
}
