// The summit shrine and the pilgrims on their way to it. Up top a priest sits by the temple door and a couple
// of devotees stand with folded hands. On the way, a few pilgrims climb: some up the stone stairway, some along
// the winding hill road. They pray a while at the top, walk back down, rest at the foot, and go up again.
import { Person } from './people.js';
import { PEAK, STAIRS, SHRINE_ROAD, groundHeight } from './world.js';
import { rng } from './noise.js';

const damp = (dt, r) => 1 - Math.exp(-dt * r);
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const SKIN = ['#8a5a3c', '#7a4c33', '#6e4530', '#a06a48', '#93613f', '#7f5238'];
const SAREE = [['#f2a41a', '#c4241c'], ['#e85fc8', '#7a2b6e'], ['#2eb84a', '#f2b705'], ['#c4241c', '#f2c21a'], ['#1e6fa8', '#e0612b']];
const KURTA = ['#f4f2ec', '#e9dcc3', '#f2a41a', '#c9d8e8', '#f6e6c8'];

function polyline(pts) {
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  const at = (s) => {
    s = Math.max(0, Math.min(L[L.length - 1], s));
    let i = 1; while (i < L.length - 1 && L[i] < s) i++;
    const a = pts[i - 1], b = pts[i], t = (s - L[i - 1]) / Math.max(1e-6, L[i] - L[i - 1]);
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, dir: Math.atan2(b.x - a.x, b.z - a.z) };
  };
  return { at, L: L[L.length - 1] };
}

export function buildShrineLife(scene) {
  const R = rng(9137);
  const people = [];
  const peakY = () => groundHeight(PEAK.x, PEAK.z);
  // the side of the summit platform that faces the stairs (where the temple door is)
  const top = STAIRS.pts[STAIRS.pts.length - 1];
  const openA = Math.atan2(top.z - PEAK.z, top.x - PEAK.x);
  const plat = (a, r) => ({ x: PEAK.x + Math.cos(openA + a) * r, z: PEAK.z + Math.sin(openA + a) * r });
  const faceTemple = (p) => Math.atan2(PEAK.x - p.x, PEAK.z - p.z);

  // --- at the shrine: the pujari by the door, two devotees praying ---
  const resident = [];
  {
    const p = new Person({ dress: 'dhoti', top: '#f2a41a', bottom: '#f2a41a', skin: SKIN[2], beard: true, mustache: true, tilak: true });
    const at = plat(0, 3.6);
    resident.push({ p, x: at.x, z: at.z, face: faceTemple(at) + Math.PI, action: 'sit', bob: 0 });
  }
  {
    const p = new Person({ dress: 'saree', top: '#c4241c', bottom: '#f2c21a', veil: true, skin: SKIN[3] });
    const at = plat(0.45, 5.6);
    resident.push({ p, x: at.x, z: at.z, face: faceTemple(at), action: 'pray' });
  }
  {
    const p = new Person({ dress: 'kurta', top: '#f6e6c8', bottom: '#f4f1e8', skin: SKIN[1], mustache: true });
    const at = plat(-0.5, 5.8);
    resident.push({ p, x: at.x, z: at.z, face: faceTemple(at), action: 'pray' });
  }
  for (const r of resident) { scene.add(r.p.root); people.push(r.p); }

  // --- the pilgrims: 5 on the stairway, 4 on the hill road, spread out along the way ---
  const stairPath = polyline(STAIRS.pts);
  const roadPath = polyline(SHRINE_ROAD.pts);
  const pilgrims = [];
  const mk = (i) => {
    const female = i % 2 === 0;
    const o = female
      ? { dress: 'saree', top: SAREE[i % 5][0], bottom: SAREE[i % 5][1], veil: true, skin: SKIN[i % 6] }
      : { dress: i % 3 ? 'kurta' : 'dhoti', top: KURTA[i % 5], bottom: '#f4f1e8', skin: SKIN[(i + 2) % 6], mustache: true, headwear: i % 4 === 1 ? 'turban' : undefined, turban: '#f2a41a' };
    const p = new Person(o);
    scene.add(p.root); people.push(p);
    return p;
  };
  for (let i = 0; i < 9; i++) {
    const onStairs = i < 5;
    const path = onStairs ? stairPath : roadPath;
    const p = mk(i);
    if (i === 3) p.prop('stick', true); // an old pilgrim with a stick
    if (i === 0 || i === 6) p.prop('potHead', true); // carrying an offering on her head
    const f = {
      p, path, onStairs,
      s: path.L * ((onStairs ? i / 5 : (i - 5) / 4) * 0.85 + 0.05 + R() * 0.05),
      dir: R() < 0.75 ? 1 : -1, // most are on the way up
      speed: (onStairs ? 0.55 : 0.95) * (0.85 + R() * 0.3) * (i === 3 ? 0.65 : 1),
      state: 'go', timer: 0, x: 0, z: 0, face: 0, prayAt: null,
    };
    pilgrims.push(f);
  }

  let night = false;
  return {
    people,
    setNight(n) { night = n; },
    update(dt, player) {
      const d = Math.hypot(player.x - PEAK.x, player.z - PEAK.z);
      const vis = d < 520;
      for (const p of people) p.root.visible = vis;
      if (!vis) return;
      const py = peakY();
      for (const r of resident) {
        if (r.p.fallT > 0) { r.p.update(dt, 0, 'idle'); continue; }
        r.p.root.position.set(r.x, Math.max(py, groundHeight(r.x, r.z)), r.z);
        r.p.root.rotation.y = r.face;
        r.p.update(dt, 0, r.action);
      }
      for (const f of pilgrims) {
        if (f.p.fallT > 0) { f.p.update(dt, 0, 'idle'); continue; }
        let speed = 0, action = 'idle';
        if (f.state === 'go') {
          // at night fewer are about: they slow to a rest where they are
          if (!night) {
            f.s += f.dir * f.speed * dt;
            speed = f.speed;
            action = f.p.props.potHead?.visible ? 'carry' : 'walk';
          }
          if (f.s >= f.path.L) { // arrived: find a spot on the platform and pray
            f.s = f.path.L; f.state = 'pray'; f.timer = 25 + R() * 30;
            const a = (R() - 0.5) * 1.6, rr = 5 + R() * 2;
            f.prayAt = plat(a, rr);
          } else if (f.s <= 0) { f.s = 0; f.state = 'rest'; f.timer = 20 + R() * 30; }
          const q = f.path.at(f.s);
          f.x = q.x; f.z = q.z;
          f.face += wrapA((f.dir > 0 ? q.dir : q.dir + Math.PI) - f.face) * damp(dt, 5);
        } else if (f.state === 'pray') {
          // walk the last few steps over to the spot, then stand praying toward the temple
          const dx = f.prayAt.x - f.x, dz = f.prayAt.z - f.z, dd = Math.hypot(dx, dz);
          if (dd > 0.25) {
            const k = Math.min(1, (0.8 * dt) / dd); f.x += dx * k; f.z += dz * k; speed = 0.8; action = 'walk';
            f.face += wrapA(Math.atan2(dx, dz) - f.face) * damp(dt, 5);
          } else {
            action = 'pray';
            f.face += wrapA(faceTemple(f) - f.face) * damp(dt, 4);
            f.timer -= dt;
            if (f.timer <= 0) { // back to the head of the path, and down
              const q = f.path.at(f.path.L);
              f.state = 'back'; f.prayAt = { x: q.x, z: q.z };
            }
          }
        } else if (f.state === 'back') {
          const dx = f.prayAt.x - f.x, dz = f.prayAt.z - f.z, dd = Math.hypot(dx, dz);
          if (dd > 0.25) { const k = Math.min(1, (0.8 * dt) / dd); f.x += dx * k; f.z += dz * k; speed = 0.8; action = 'walk'; f.face += wrapA(Math.atan2(dx, dz) - f.face) * damp(dt, 5); }
          else { f.state = 'go'; f.dir = -1; }
        } else { // resting at the foot, then up again
          f.timer -= dt;
          if (f.timer <= 0 && !night) { f.state = 'go'; f.dir = 1; }
        }
        const gy = groundHeight(f.x, f.z);
        f.p.root.position.set(f.x, Math.hypot(f.x - PEAK.x, f.z - PEAK.z) < 9 ? Math.max(gy, py) : gy, f.z);
        f.p.root.rotation.y = f.face;
        f.p.update(dt, speed, action);
      }
    },
  };
}
