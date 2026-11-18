// Distance culling for big sets of small static things (sleepers, masts…): each is registered once with how far
// it can be seen from, and skipped beyond that. Things must sit still, in world space.
import * as THREE from 'three';

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
    streams.push({ c, g: group, x: _sph.center.x, z: _sph.center.z, r: _sph.radius, maxD: Math.min(2400, 110 + _sph.radius * 60), on: true });
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
