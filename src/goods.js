// Goods platforms: at every station the goods trains stop at, a heap of grain sacks and a few crates at one end
// of the platform, a flat hand-cart, and two porters (coolies in red, a brass armband) who sit by the heap
// till a goods train comes in. Then they carry sacks on their heads between the heap and the open vans: off
// the train where it is dropping its loads (the heap grows), onto it where it is picking up (the heap shrinks).
import * as THREE from 'three';
import { RING, TRACK5, TRACK_Y, groundHeight } from './world.js';
import { Person } from './people.js';

const RAIL_TOP = TRACK_Y + 0.42, TOP = RAIL_TOP + 0.45, EDGE = 1.75;
const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, ...o });

export function buildGoodsYards(scene, railway) {
  const goodsTrains = railway.trains.filter((t) => t.goods);
  if (!goodsTrains.length) return { update() {} };
  const sackGeo = new THREE.SphereGeometry(1, 10, 6).scale(0.42, 0.17, 0.27);
  const sackMat = std('#e4d9bf');
  const crateMat = std('#9a7448', { roughness: 0.85 });
  const yards = [];
  const seen = new Set();
  for (const T of [RING, TRACK5]) for (const h of T.halts ?? []) {
    if (h.noStation || seen.has(h.name)) continue;
    seen.add(h.name);
    const L = h.L ?? 100, W = h.W ?? 4.2, side = h.side;
    const frame = (u, v) => { const q = T.path.at(h.s + u); return { x: q.x - q.tz * side * v, z: q.z + q.tx * side * v, rot: Math.atan2(q.tx, q.tz) }; };
    const c = frame(-L / 2 + 13, EDGE + W - 1.4);
    const g = new THREE.Group();
    g.position.set(c.x, TOP, c.z); g.rotation.y = c.rot;
    scene.add(g);
    // the heap: sacks stacked in layers, a pyramid; how many show depends on how much is waiting
    const MAX = 36;
    const sacks = new THREE.InstancedMesh(sackGeo, sackMat, MAX);
    const d = new THREE.Object3D();
    let k = 0;
    for (let layer = 0; layer < 4 && k < MAX; layer++) for (let i = 0; i < 4 - layer && k < MAX; i++) for (let j = 0; j < 3 && k < MAX; j++) {
      d.position.set((j - 1) * 0.56 + (layer % 2) * 0.1, 0.17 + layer * 0.3, (i - (3 - layer) / 2) * 0.86);
      d.rotation.set(0, (Math.sin(k * 7.1) * 0.2), 0); d.updateMatrix();
      sacks.setMatrixAt(k++, d.matrix);
    }
    sacks.count = 14; sacks.castShadow = true; sacks.receiveShadow = true;
    g.add(sacks);
    for (const [x, z, s] of [[0.2, 3.1, 0.6], [-0.5, 3.4, 0.5], [0.1, -3.2, 0.55]]) {
      const cr = new THREE.Mesh(new THREE.BoxGeometry(s * 1.4, s, s), crateMat); cr.position.set(x, s / 2, z); cr.castShadow = true; g.add(cr);
    }
    // a flat hand-cart with iron wheels
    const cart = new THREE.Group(); cart.position.set(-0.9, 0, -4.6); g.add(cart);
    { const b = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 1.8), std('#6a4a2c')); b.position.y = 0.42; cart.add(b);
      for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.06, 14).rotateZ(Math.PI / 2), std('#2a2826', { metalness: 0.5 })); w.position.set(sx * 0.55, 0.34, 0.2); cart.add(w); }
      const hd = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.2, 6).rotateX(Math.PI / 2 - 0.4), std('#6a4a2c')); hd.position.set(0, 0.7, -1.3); cart.add(hd); }
    const pile = new THREE.Vector3(c.x, TOP, c.z);
    const porters = [0, 1].map((i) => {
      const p = new Person({ dress: 'pants', top: '#c4241c', bottom: i ? '#3a3a42' : '#f4f1e8', headwear: 'turban', turban: '#c4241c', mustache: true, skin: ['#6e4530', '#7a4c33'][i], sleeves: 'short' });
      p.noHit = true;
      // the porter's brass armband
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 14), std('#d8b04a', { metalness: 0.9, roughness: 0.3 }));
      band.rotation.x = Math.PI / 2; band.position.y = -0.08; p.arms[0].shoulder.add(band);
      scene.add(p.root);
      const home = frame(-L / 2 + 13 + (i ? 2.2 : -2.4), EDGE + W - 0.6);
      return { p, x: home.x, z: home.z, home, face: c.rot, leg: 0, carry: false, sp: 0 };
    });
    yards.push({ h, g, sacks, pile, porters, n: 14, n0: 14, job: null, frame });
  }
  const _v = new THREE.Vector3();
  return {
    update(dt, player) {
      for (const Y of yards) {
        const dP = Math.abs(player.x - Y.pile.x) + Math.abs(player.z - Y.pile.z);
        Y.g.visible = dP < 700;
        // a goods train standing here and working?
        const tr = goodsTrains.find((t) => t.goodsJob && t.at && t.at.name === Y.h.name && t.mode === 'dwell');
        const J = tr?.goodsJob;
        if (J && Y.job !== J) { Y.job = J; Y.n0 = Y.n; }
        if (!J && Y.job) Y.job = null;
        if (J) {
          const k = THREE.MathUtils.smoothstep(J.t, 6, J.T - 8), amount = J.cars.length * 6;
          Y.n = Math.max(3, Math.min(36, Math.round(Y.n0 + (J.drop ? amount : -amount) * k)));
        } else Y.n += (14 - Y.n) * Math.min(1, dt * 0.004); // carted away (or brought in) bit by bit
        Y.sacks.count = Math.max(0, Math.min(36, Math.round(Y.n)));
        const near = dP < 260;
        for (const q of Y.porters) q.p.root.visible = dP < 330;
        if (!near) continue;
        // the porters: back and forth between the heap and the nearest van door while a train works, sitting
        // by the heap otherwise
        let doors = [];
        if (J) { const a = tr.goodsDoors(1), b = tr.goodsDoors(-1), dd = (l) => (l.length ? Math.min(...l.map((p) => Math.hypot(p.x - Y.pile.x, p.z - Y.pile.z))) : 1e9); doors = dd(a) < dd(b) ? a : b; }
        Y.porters.forEach((q, i) => {
          let tx = q.home.x, tz = q.home.z;
          if (J && doors.length && J.t > 3 && J.t < J.T - 6) {
            const door = doors.slice().sort((a, b) => Math.hypot(a.x - Y.pile.x, a.z - Y.pile.z) - Math.hypot(b.x - Y.pile.x, b.z - Y.pile.z))[Math.min(doors.length - 1, i)];
            // the platform edge in front of that door
            const toPile = Math.hypot(Y.pile.x - door.x, Y.pile.z - door.z) || 1;
            const ex = door.x + ((Y.pile.x - door.x) / toPile) * 1.6, ez = door.z + ((Y.pile.z - door.z) / toPile) * 1.6;
            if (q.leg === 0) { tx = ex; tz = ez; } else { tx = Y.pile.x + (i ? 0.9 : -0.9); tz = Y.pile.z + (i ? 0.6 : -0.6); }
            const d = Math.hypot(tx - q.x, tz - q.z);
            if (d < 0.35) {
              q.leg = 1 - q.leg;
              // dropping: they carry from the train to the heap; picking up: from the heap to the train
              q.carry = J.drop ? q.leg === 1 : q.leg === 0;
            }
          } else { q.leg = 0; q.carry = false; }
          const dx = tx - q.x, dz = tz - q.z, d = Math.hypot(dx, dz);
          q.sp = d > 0.2 ? (q.carry ? 1.1 : 1.4) : 0;
          if (q.sp) { const s = Math.min(d, q.sp * dt); q.x += (dx / d) * s; q.z += (dz / d) * s; q.face = Math.atan2(dx, dz); }
          else if (!J) q.face = Math.atan2(Y.pile.x - q.x, Y.pile.z - q.z);
          q.p.root.position.set(q.x, Math.max(TOP, groundHeight(q.x, q.z, TOP + 0.3)), q.z);
          q.p.root.rotation.y += Math.atan2(Math.sin(q.face - q.p.root.rotation.y), Math.cos(q.face - q.p.root.rotation.y)) * Math.min(1, dt * 6);
          q.p.prop('bundle', q.carry);
          q.p.update(dt, q.sp, q.carry ? 'carry' : q.sp ? 'walk' : J ? 'idle' : 'sit');
        });
        void _v;
      }
    },
  };
}
