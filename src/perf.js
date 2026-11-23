// Keeping the frame light: world matrices only for what moved, distance culling, streaming by size, and
// leaving out what's too small to see.
import * as THREE from 'three';

// World matrices, worked out only when something moved. Stock three.js recomposes every object's matrix and
// multiplies it into its parent's every frame — all ~75k of them, though most never move — and it walks into
// hidden or frozen subtrees too. Here each object remembers the position/rotation/scale its matrix was made
// from (in one shared array, by object id) and is only recomposed when one of them changed; an object whose
// parent didn't change keeps its world matrix as it is; and a subtree marked matrixWorldAutoUpdate = false
// (hidden this frame, or frozen terrain) is skipped unless its parent moved. Same results, a fraction of the work.
{
  let tc = new Float64Array(10 * 131072).fill(NaN);
  const grow = (id) => { let n = tc.length; while (n <= id * 10 + 9) n *= 2; const t = new Float64Array(n).fill(NaN); t.set(tc); tc = t; };
  const O = THREE.Object3D.prototype;
  const stock = { updateMatrix: O.updateMatrix, updateMatrixWorld: O.updateMatrixWorld };
  // (testing) __gaonStockMatrices(true) puts three's own back, to compare
  globalThis.__gaonStockMatrices = (on) => { if (on) { mine.updateMatrix = O.updateMatrix; mine.updateMatrixWorld = O.updateMatrixWorld; Object.assign(O, stock); } else if (mine.updateMatrix) Object.assign(O, mine); tc.fill(NaN); };
  const mine = {};
  // (also what getWorldPosition and friends call on every ancestor up to the scene: stock, that marks the whole
  // scene as needing a new world matrix, every frame anyone asks where something is)
  O.updateMatrix = function () {
    const k = this.id * 10;
    if (k + 9 >= tc.length) grow(this.id);
    const p = this.position, q = this.quaternion, s = this.scale;
    if (tc[k] !== p.x || tc[k + 1] !== p.y || tc[k + 2] !== p.z || tc[k + 3] !== q._x || tc[k + 4] !== q._y || tc[k + 5] !== q._z || tc[k + 6] !== q._w || tc[k + 7] !== s.x || tc[k + 8] !== s.y || tc[k + 9] !== s.z) {
      tc[k] = p.x; tc[k + 1] = p.y; tc[k + 2] = p.z; tc[k + 3] = q._x; tc[k + 4] = q._y; tc[k + 5] = q._z; tc[k + 6] = q._w; tc[k + 7] = s.x; tc[k + 8] = s.y; tc[k + 9] = s.z;
      this.matrix.compose(p, q, s);
      this.matrixWorldNeedsUpdate = true;
    }
  };
  O.updateMatrixWorld = function (force) {
    // Called by the game itself on one thing (a coach, a cab) rather than walked into from the scene: then, as
    // stock, that thing and everything under it is worked out afresh from its parent — code that calls it
    // counts on that. (The walk below always passes true or false; the renderer's call on the scene passes
    // nothing, and the scene is the one place that mustn't force everything.)
    if (force === undefined && this.parent !== null) force = true;
    if (this.matrixAutoUpdate) this.updateMatrix();
    if (this.matrixWorldNeedsUpdate || force) {
      if (this.matrixWorldAutoUpdate === true) {
        if (this.parent === null) this.matrixWorld.copy(this.matrix);
        else this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
      }
      this.matrixWorldNeedsUpdate = false;
      force = true;
    }
    const ch = this.children;
    const f = force === true;
    for (let i = 0, l = ch.length; i < l; i++) { const c = ch[i]; if (f || c.matrixWorldAutoUpdate === true) c.updateMatrixWorld(f); }
  };
  // an object put under a new parent needs its world matrix made afresh, even if its own transform didn't change
  const add = O.add;
  O.add = function (...objs) {
    for (const o of objs) if (o && o.isObject3D) o.matrixWorldNeedsUpdate = true;
    return add.apply(this, objs);
  };
}

// Distance culling for big sets of small static things (sleepers, masts…): each is registered once with how far
// it can be seen from, and skipped beyond that. Things must sit still, in world space.
const items = [];
const _s = new THREE.Sphere();
const _b = new THREE.Box3();
export function cullBeyond(obj, dist) {
  obj.updateWorldMatrix(true, true);
  if (obj.isGroup || !obj.geometry) _b.setFromObject(obj).getBoundingSphere(_s); // a whole group (a lamp post…)
  else {
    const bs = obj.boundingSphere ?? (obj.geometry.boundingSphere ?? (obj.geometry.computeBoundingSphere(), obj.geometry.boundingSphere));
    _s.copy(bs).applyMatrix4(obj.matrixWorld);
  }
  items.push({ obj, c: _s.center.clone(), r: _s.radius, dist });
  return obj;
}
export function updateCull(camPos) {
  for (const it of items) it.obj.visible = camPos.distanceTo(it.c) - it.r < it.dist;
}

// Streaming by size: the pieces of a big static group (houses, stalls, platforms, masts…) are taken out of the
// scene beyond a distance that grows with their size — a 1 m pot by ~140 m, a house by ~400 m, a whole
// station much further — and put back as the camera comes near. Out of the scene they cost nothing at all:
// the renderer doesn't even visit them.
const streams = [];
const _box = new THREE.Box3(), _sph = new THREE.Sphere();
export function streamGroup(group) {
  group.updateMatrixWorld(true);
  for (const c of [...group.children]) {
    _box.setFromObject(c);
    if (_box.isEmpty()) continue;
    _box.getBoundingSphere(_sph);
    streams.push({ c, g: group, x: _sph.center.x, z: _sph.center.z, r: _sph.radius, maxD: Math.min(2400, 220 + _sph.radius * 90), on: true });
  }
}
let streamCursor = 0;
export function updateStream(camPos, haze = 2400) {
  const n = streams.length;
  for (let k = 0, per = Math.min(n, 1500); k < per; k++) {
    const s = streams[streamCursor]; streamCursor = (streamCursor + 1) % n;
    const d = Math.hypot(s.x - camPos.x, s.z - camPos.z) - s.r, on = d < Math.min(s.maxD, haze);
    if (on === s.on) continue;
    s.on = on;
    if (on) s.g.add(s.c); else s.g.remove(s.c);
  }
}

// Too small to see: every plain mesh smaller on screen than about a pixel is left out of the frame (and its
// shadow) — a villager's eyes and fingers at 60 m, the bunting at the far mela, the passengers in a bus across
// the fields. Each thing in the scene (a person, a bus, a stall, a coach) is one "root"; its meshes are sorted
// by size once, and each frame the root's distance says how many of the smallest are below a pixel. They're
// hidden by their layer mask, never by .visible, so whatever the game itself shows and hides is left alone.
// (A mesh is hidden below 1.2 px and only shown again above 1.5 px, so nothing flickers at the edge.)
const tinyRoots = [];
const _tv = new THREE.Vector3(), _tm = new THREE.Matrix4();
const TINY_MAX_R = 2; // (anything bigger is never under a pixel this side of the haze)
// every plain mesh under o, with its size and where it is, from the world matrices as they are (one pass, no
// bounding boxes: the bounding spheres are the ones the renderer needs anyway)
function meshesUnder(o) {
  const out = [];
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  o.traverse((m) => {
    if (!m.isMesh || m.isInstancedMesh || m.isBatchedMesh || m.isSkinnedMesh || !m.geometry) return;
    if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
    const bs = m.geometry.boundingSphere, e = m.matrixWorld.elements;
    const sc = Math.sqrt(Math.max(e[0] * e[0] + e[1] * e[1] + e[2] * e[2], e[4] * e[4] + e[5] * e[5] + e[6] * e[6], e[8] * e[8] + e[9] * e[9] + e[10] * e[10]));
    const r = bs.radius * sc;
    if (!(r < 1e6)) return; // (an empty or broken geometry)
    const c = bs.center, x = e[0] * c.x + e[4] * c.y + e[8] * c.z + e[12], y = e[1] * c.x + e[5] * c.y + e[9] * c.z + e[13], z = e[2] * c.x + e[6] * c.y + e[10] * c.z + e[14];
    x0 = Math.min(x0, x - r); x1 = Math.max(x1, x + r); y0 = Math.min(y0, y - r); y1 = Math.max(y1, y + r); z0 = Math.min(z0, z - r); z1 = Math.max(z1, z + r);
    out.push({ o: m, r });
  });
  if (!out.length) return null;
  return { list: out, c: new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), R: Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 };
}
function addTinyRoot(root, info, dynamic) {
  // (nothing that's scaled to almost nothing just now — a match flame before it's struck grows from zero)
  const meshes = info.list.filter((m) => m.r < TINY_MAX_R && m.r > 0.004).map((m) => ({ o: m.o, r: m.r, mask: m.o.layers.mask, cast: m.o.castShadow }));
  if (!meshes.length) return;
  meshes.sort((a, b) => a.r - b.r);
  // dynamic things are measured from where they are now: their centre kept in their own frame
  const local = dynamic ? info.c.clone().applyMatrix4(_tm.copy(root.matrixWorld).invert()) : null;
  tinyRoots.push({ root, c: info.c, local, R: info.R, rs: Float32Array.from(meshes, (m) => m.r), meshes, level: 0, slevel: 0 });
}
// once, when the world is built: every top-level thing small enough is a root; a big one at the origin (a
// whole train, all the stalls of a group) is looked inside instead, down to things that size
export function setupTinyCull(scene, { skip = [], streamed = [] } = {}) {
  scene.updateMatrixWorld(true);
  const visit = (o, depth, dynamic) => {
    const info = meshesUnder(o);
    if (!info) return;
    if (info.R <= 40 || depth >= 3 || !o.children.length || o.isMesh) {
      addTinyRoot(o, info, dynamic);
    } else for (const c of o.children) visit(c, depth + 1, dynamic);
  };
  for (const c of scene.children) {
    if (skip.includes(c) || c.isLight || c.isCamera) continue;
    // the streamed static groups: each piece is a root, fixed in place
    if (streamed.includes(c)) { for (const k of c.children) visit(k, 1, false); continue; }
    visit(c, 0, true);
  }
}
export function updateTinyCull(camera, heightPx) {
  const focal = (heightPx / 2) / Math.tan((camera.fov * Math.PI) / 360);
  const kHide = 1.2 / (2 * focal), kShow = 1.5 / (2 * focal); // a mesh of radius r at distance d is 2·r·focal/d px across
  // and a little bigger than that, still drawn but its shadow left out: a shadow under 3 px (a hand, an ear at
  // 30 m) is lost in the soft edge of the bigger ones round it
  const sHide = 3 / (2 * focal), sShow = 3.6 / (2 * focal);
  const cp = camera.getWorldPosition(_tv), cx = cp.x, cy = cp.y, cz = cp.z;
  // (testing: __gaonTinyOff = true shows everything again, to compare)
  const off = globalThis.__gaonTinyOff === true;
  for (let i = 0; i < tinyRoots.length; i++) {
    const t = tinyRoots[i];
    let x = t.c.x, y = t.c.y, z = t.c.z;
    if (t.local) {
      const e = t.root.matrixWorld.elements, l = t.local;
      x = e[0] * l.x + e[4] * l.y + e[8] * l.z + e[12]; y = e[1] * l.x + e[5] * l.y + e[9] * l.z + e[13]; z = e[2] * l.x + e[6] * l.y + e[10] * l.z + e[14];
    }
    const dx = x - cx, dy = y - cy, dz = z - cz;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) - t.R; // (from the nearest edge of the thing: never too eager)
    const rs = t.rs, n = rs.length;
    let lv = t.level, sl = t.slevel;
    if (d <= 0 || off) lv = sl = 0;
    else {
      const hideBelow = d * kHide, showAbove = d * kShow;
      while (lv < n && rs[lv] < hideBelow) lv++; // smaller than 1.2 px now: hide
      while (lv > 0 && rs[lv - 1] >= showAbove) lv--; // bigger than 1.5 px again: show
      const sBelow = d * sHide, sAbove = d * sShow;
      while (sl < n && rs[sl] < sBelow) sl++;
      while (sl > 0 && rs[sl - 1] >= sAbove) sl--;
    }
    const M = t.meshes;
    if (sl !== t.slevel) {
      if (sl > t.slevel) { for (let k = t.slevel; k < sl; k++) M[k].o.castShadow = false; }
      else for (let k = sl; k < t.slevel; k++) M[k].o.castShadow = M[k].cast;
      t.slevel = sl;
    }
    if (lv === t.level) continue;
    if (lv > t.level) for (let k = t.level; k < lv; k++) M[k].o.layers.mask = 0;
    else for (let k = lv; k < t.level; k++) M[k].o.layers.mask = M[k].mask;
    t.level = lv;
  }
}
