// Smooth organic primitives for characters and animals, so nothing reads as a stack of boxes.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// profile: [[radius, y], ...] from bottom to top, revolved round the Y axis
export function lathe(profile, segs = 16) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)), segs);
}

// A tapered capsule hanging down from the origin: radius r0 at y = 0, r1 at y = -len, both ends rounded.
export function limb(r0, r1, len, segs = 12) {
  const pts = [];
  const n = 5;
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (i / n) * (Math.PI / 2);
    pts.push([Math.cos(a) * r1, -len + Math.sin(a) * r1]);
  }
  for (let i = 1; i <= n; i++) {
    const a = (i / n) * (Math.PI / 2);
    pts.push([Math.cos(a) * r0, Math.sin(a) * r0]);
  }
  return lathe(pts, segs);
}

// same, but lying along +Z from the origin (snouts, tails, beaks)
export const limbZ = (r0, r1, len, segs = 12) => limb(r0, r1, len, segs).rotateX(-Math.PI / 2);

// An elongated body: profile [[radius, z], ...] from back (tail) to front (chest), revolved round Z.
export function bodyZ(profile, segs = 18) {
  return lathe(profile, segs).rotateX(Math.PI / 2);
}

export const ellipsoid = (rx, ry, rz, ws = 16, hs = 12) => new THREE.SphereGeometry(1, ws, hs).scale(rx, ry, rz);

// A tube along a list of points with a radius that tapers from r0 to r1 (horns, tails, tail feathers)
export function taperTube(points, r0, r1, radial = 7) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const tubular = Math.max(6, points.length * 4);
  const geo = new THREE.TubeGeometry(curve, tubular, 1, radial, false);
  const pos = geo.attributes.position;
  const c = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    curve.getPointAt(t, c);
    const r = r0 + (r1 - r0) * t;
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      const x = pos.getX(k) - c.x, y = pos.getY(k) - c.y, z = pos.getZ(k) - c.z;
      pos.setXYZ(k, c.x + x * r, c.y + y * r, c.z + z * r);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

// Soft lumpy boulder with baked moss / grime in vertex colours.
export function boulder(r, seed, { moss = 0.5, base = '#8e877b', mossCol = '#5d6b3a', detail = 2 } = {}) {
  const ico = new THREE.IcosahedronGeometry(r, detail);
  ico.deleteAttribute('normal');
  ico.deleteAttribute('uv');
  const g = mergeVertices(ico);
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const a = new THREE.Color(base), m = new THREE.Color(mossCol), c = new THREE.Color(), lichen = new THREE.Color('#c9c2a8');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.15 * Math.sin(x * 2.3 / r + seed) * Math.sin(y * 1.9 / r + seed * 1.7) + 0.08 * Math.sin(z * 4.1 / r - seed * 0.7) + 0.05 * Math.sin((x + z) * 7 / r + seed) + 0.025 * Math.sin((x - y) * 15 / r + seed * 2.3);
    const ny = y / r;
    p.setXYZ(i, x * k, y * k * (ny < 0 ? 0.75 : 0.92), z * k);
    // crevices darker, bumps lighter; streaks of lichen and grime; moss on the tops
    const grime = 0.5 + 0.5 * Math.sin(x * 9 / r + seed) * Math.sin(z * 8 / r - y * 3 / r);
    const shade = (0.62 + (k - 0.85) * 1.6) * (0.85 + 0.15 * grime) * (0.85 + 0.15 * Math.max(-1, Math.min(1, ny + 0.3)));
    c.copy(a).multiplyScalar(shade);
    if (grime > 0.85) c.lerp(lichen, (grime - 0.85) * 3);
    c.lerp(m, Math.min(1, Math.max(0, ny - 0.3) * 2.2 * moss * (0.6 + 0.4 * grime)));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// ---------------- fur ----------------
// A fine streaky texture (hair running along the body) used as both colour detail and bump, on a
// physical material with a soft sheen, so coats read as fur instead of painted plastic.
let furTex = null;
function furTexture() {
  if (furTex) return furTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#d8d8d8';
  g.fillRect(0, 0, 256, 256);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 9000; i++) {
    const x = rnd() * 256, y = rnd() * 256, l = 3 + rnd() * 9, v = rnd();
    g.strokeStyle = v < 0.5 ? `rgba(255,255,255,${0.15 + rnd() * 0.25})` : `rgba(40,40,40,${0.1 + rnd() * 0.22})`;
    g.lineWidth = 0.6 + rnd() * 0.8;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 2, y + l); g.stroke();
  }
  furTex = new THREE.CanvasTexture(c);
  furTex.wrapS = furTex.wrapT = THREE.RepeatWrapping;
  furTex.repeat.set(3, 3);
  furTex.colorSpace = THREE.SRGBColorSpace;
  furTex.anisotropy = 4;
  return furTex;
}
const furCache = new Map();
export function furMat(color, { rough = 0.9, sheen = 0.55, map = null, short = false } = {}) {
  const key = color + rough + sheen + (map ? map.uuid : '') + short;
  if (furCache.has(key)) return furCache.get(key);
  let t = furTexture();
  if (short) { t = t.clone(); t.repeat.set(9, 9); t.needsUpdate = true; }
  const sc = new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.35);
  const m = new THREE.MeshPhysicalMaterial({
    color, roughness: rough, map: map ?? t, bumpMap: t, bumpScale: short ? 0.1 : 0.35,
    sheen: short ? sheen * 0.6 : sheen, sheenRoughness: 0.75, sheenColor: sc,
  });
  // countershading: darker along the back, paler on the belly and inside the legs, as on most animals
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vUpN;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvUpN = normalize(mat3(modelMatrix) * objectNormal).y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vUpN;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(1.12, 0.84, smoothstep(-0.7, 0.9, vUpN));');
  };
  m.customProgramCacheKey = () => 'fur-cs';
  furCache.set(key, m);
  return m;
}
