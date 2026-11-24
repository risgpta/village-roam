// The ponds along the railway (see world.js: TRACK_PONDS): still water — the line crossing some of them on a
// bridge — with lotus leaves and a few pink flowers on it, reeds round the edge, and white egrets standing in
// the shallows. Everything here is static and drawn in a handful of draws for all the ponds together.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TRACK_PONDS, heightAt } from './world.js';
import { rng } from './noise.js';

export function buildTrackPonds(scene) {
  const g = new THREE.Group();
  if (!TRACK_PONDS.length) return g;
  const R = rng(9091), dummy = new THREE.Object3D();
  // the water: one mesh for every pond
  const discs = TRACK_PONDS.map((P) => new THREE.CircleGeometry(P.r + 0.6, 48).rotateX(-Math.PI / 2).translate(P.x, P.level, P.z));
  const water = new THREE.Mesh(mergeGeometries(discs), new THREE.MeshStandardMaterial({ color: '#33605c', roughness: 0.06, metalness: 0.15, transparent: true, opacity: 0.9, depthWrite: false }));
  water.receiveShadow = true; water.renderOrder = 1;
  g.add(water);
  // lotus leaves floating, and their flowers
  const pads = [], flowers = [], reeds = [], birds = [];
  for (const P of TRACK_PONDS) {
    const n = Math.round(P.r * 2.2);
    for (let i = 0; i < n; i++) {
      const a = R() * 6.28, d = P.r * (0.35 + R() * 0.55);
      pads.push({ x: P.x + Math.cos(a) * d, y: P.level + 0.02, z: P.z + Math.sin(a) * d, s: 0.25 + R() * 0.25, r: R() * 6.28 });
      if (R() < 0.18) flowers.push({ x: P.x + Math.cos(a) * d, y: P.level + 0.12, z: P.z + Math.sin(a) * d, s: 0.8 + R() * 0.4 });
    }
    // reeds in clumps round the bank
    for (let c = 0; c < Math.round(P.r * 0.9); c++) {
      const a = R() * 6.28, d = P.r * (0.92 + R() * 0.12);
      for (let k = 0; k < 7; k++) {
        const x = P.x + Math.cos(a) * d + (R() - 0.5) * 1.2, z = P.z + Math.sin(a) * d + (R() - 0.5) * 1.2;
        reeds.push({ x, y: Math.min(heightAt(x, z), P.level), z, s: 0.7 + R() * 0.7, tx: (R() - 0.5) * 0.25, tz: (R() - 0.5) * 0.25 });
      }
    }
    // a pair of egrets wading at the edge
    for (let k = 0; k < (P.r > 13 ? 3 : 2); k++) {
      const a = R() * 6.28, d = P.r * 0.82;
      birds.push({ x: P.x + Math.cos(a) * d, y: P.level - 0.12, z: P.z + Math.sin(a) * d, r: R() * 6.28, s: 0.9 + R() * 0.2 });
    }
  }
  const inst = (geo, mat, items, set, shadow = false) => {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
    items.forEach((it, i) => { set(it); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); });
    m.castShadow = shadow; m.receiveShadow = true; m.computeBoundingSphere();
    g.add(m);
    return m;
  };
  // a lotus leaf: a disc with a notch cut in it
  const padGeo = new THREE.CircleGeometry(1, 18, 0.25, Math.PI * 2 - 0.25).rotateX(-Math.PI / 2);
  inst(padGeo, new THREE.MeshStandardMaterial({ color: '#4a7d2e', roughness: 0.55, side: THREE.DoubleSide }), pads, (it) => { dummy.position.set(it.x, it.y, it.z); dummy.rotation.set(0, it.r, 0); dummy.scale.setScalar(it.s); });
  const petal = mergeGeometries([0, 1, 2, 3, 4, 5].map((k) => new THREE.SphereGeometry(0.05, 6, 4).scale(0.6, 1.4, 0.35).translate(0, 0.06, 0.03).rotateX(0.5).rotateY((k / 6) * Math.PI * 2)));
  inst(petal, new THREE.MeshStandardMaterial({ color: '#f2a6c4', roughness: 0.5, emissive: '#4a1a2a', emissiveIntensity: 0.2 }), flowers, (it) => { dummy.position.set(it.x, it.y, it.z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(it.s); });
  const reedGeo = new THREE.ConeGeometry(0.025, 1.6, 4).translate(0, 0.8, 0);
  inst(reedGeo, new THREE.MeshStandardMaterial({ color: '#7a8a3a', roughness: 0.8 }), reeds, (it) => { dummy.position.set(it.x, it.y, it.z); dummy.rotation.set(it.tx, 0, it.tz); dummy.scale.set(1, it.s, 1); });
  // an egret: a slim white body, an S of a neck, a yellow bill, long dark legs
  const egret = mergeGeometries([
    new THREE.SphereGeometry(0.13, 10, 8).scale(0.7, 0.75, 1.4).translate(0, 0.62, 0),
    new THREE.CylinderGeometry(0.03, 0.04, 0.34, 6).rotateX(-0.5).translate(0, 0.84, 0.12),
    new THREE.SphereGeometry(0.05, 8, 6).translate(0, 1.0, 0.2),
    new THREE.ConeGeometry(0.014, 0.14, 5).rotateX(Math.PI / 2).translate(0, 0.99, 0.31),
    new THREE.CylinderGeometry(0.01, 0.01, 0.55, 4).translate(-0.04, 0.28, 0),
    new THREE.CylinderGeometry(0.01, 0.01, 0.55, 4).translate(0.04, 0.28, 0),
  ].map((q) => (q.index ? q.toNonIndexed() : q)));
  const eg = inst(egret, new THREE.MeshStandardMaterial({ color: '#f4f2ec', roughness: 0.7 }), birds, (it) => { dummy.position.set(it.x, it.y, it.z); dummy.rotation.set(0, it.r, 0); dummy.scale.setScalar(it.s); }, true);
  void eg;
  scene.add(g);
  return g;
}
