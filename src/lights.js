// Street lights: a tall pole with a curved arm and a lamp head. By day just a pole; at night the lamp glows
// warm, with a soft halo round it and a pool of light spread on the ground below. No real light sources:
// everything is emissive or additive, so dozens of them cost next to nothing.
import * as THREE from 'three';

let shared = null;
function radial(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [t, col] of stops) gr.addColorStop(t, col);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function mats() {
  if (shared) return shared;
  shared = {
    pole: new THREE.MeshStandardMaterial({ color: '#5d6a72', metalness: 0.5, roughness: 0.45 }),
    band: new THREE.MeshStandardMaterial({ color: '#f2efe6', roughness: 0.7 }),
    base: new THREE.MeshStandardMaterial({ color: '#8f887c', roughness: 0.95 }),
    head: new THREE.MeshStandardMaterial({ color: '#3a4248', metalness: 0.4, roughness: 0.5 }),
    bulb: new THREE.MeshStandardMaterial({ color: '#fff6e0', emissive: '#ffd58a', emissiveIntensity: 0.05 }),
    pool: new THREE.MeshBasicMaterial({ map: radial([[0, 'rgba(255,214,140,0.55)'], [0.45, 'rgba(255,200,120,0.22)'], [1, 'rgba(255,190,110,0)']]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, polygonOffset: true, polygonOffsetFactor: -4 }),
    halo: new THREE.SpriteMaterial({ map: radial([[0, 'rgba(255,236,190,1)'], [0.25, 'rgba(255,210,140,0.5)'], [1, 'rgba(255,190,110,0)']]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }),
    level: 0,
  };
  return shared;
}

// A street light standing at the group's origin, its arm reaching out along local +x.
// `ground(dx, dz)` gives the ground height under a point relative to the base, so the light pool sits on it.
export function streetLight({ height = 5.2, reach = 1.3, base = true } = {}) {
  const M = mats();
  const g = new THREE.Group();
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  if (base) add(new THREE.CylinderGeometry(0.2, 0.24, 0.5, 10), M.base, 0, 0.25, 0);
  add(new THREE.CylinderGeometry(0.055, 0.09, height, 8), M.pole, 0, height / 2, 0);
  add(new THREE.CylinderGeometry(0.095, 0.095, 0.5, 8), M.band, 0, 1.0, 0); // the painted band low on the pole
  // the arm: a gentle curve out and down to the lamp
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, height - 0.35, 0), new THREE.Vector3(0.1, height + 0.25, 0), new THREE.Vector3(reach, height + 0.08, 0));
  const arm = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.04, 6), M.pole); arm.castShadow = true; g.add(arm);
  // a small support strut under the arm
  const strut = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, height - 0.9, 0), new THREE.Vector3(0.25, height - 0.5, 0), new THREE.Vector3(reach * 0.55, height + 0.12, 0));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(strut, 8, 0.022, 5), M.pole));
  // the lamp head: a shallow hood with the bulb under it
  const hood = add(new THREE.ConeGeometry(0.34, 0.2, 14, 1, true), M.head, reach, height - 0.02, 0);
  hood.material.side = THREE.DoubleSide;
  add(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 8), M.head, reach, height + 0.1, 0);
  add(new THREE.SphereGeometry(0.13, 12, 8), M.bulb, reach, height - 0.13, 0).castShadow = false;
  const halo = new THREE.Sprite(M.halo); halo.scale.setScalar(2.4); halo.position.set(reach, height - 0.15, 0); halo.userData.dynamic = true; g.add(halo);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(height * 1.15, 28).rotateX(-Math.PI / 2), M.pool);
  pool.position.set(reach, 0.06, 0); pool.renderOrder = 2; pool.userData.dynamic = true; g.add(pool);
  g.userData.pool = pool;
  return g;
}

// 0 by day, 1 at night (dusk in between)
export function setStreetLights(v) {
  const M = mats();
  M.level = v;
  M.bulb.emissiveIntensity = 0.05 + v * 4;
  M.pool.opacity = v;
  M.halo.opacity = v * 0.9;
}
