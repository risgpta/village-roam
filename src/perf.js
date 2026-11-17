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
