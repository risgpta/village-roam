// Life along the lines: little groups of cattle and goats grazing beside the track, and people walking the
// footpath that runs alongside it. When a train comes by the cattle lift their heads and trot off away
// from the line, and the walkers stop and step back to watch it pass. Something to see from the train.
import { Goat } from './animals.js';
import { Person } from './people.js';
import { TRACK, TRACK3, RING, TRACK_Y, heightAt, groundHeight, riverDist, RIVER_HALF, CROSSING, CROSSING3, jungleMask, RING_SIGHTS, resolveCollisions } from './world.js';
import { rng } from './noise.js';

const damp = (dt, r) => 1 - Math.exp(-dt * r);
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const COW_COATS = [['#ece6da'], ['#b98e64'], ['#f2ede4'], ['#8a6a4a'], ['#d8cfc0'], ['#3a302a']];
const GOAT_COATS = [['#1d1a19', '#2a2524'], ['#5a3a26', '#e8e0d2'], ['#efe9dd', '#d9cdb8'], ['#7a5236', '#2a1f1a']];
const SKIN = ['#8a5a3c', '#7a4c33', '#6e4530', '#a06a48', '#93613f'];
const WALKERS = [
  { dress: 'dhoti', top: '#f4f1e8', bottom: '#f4f1e8', headwear: 'turban', turban: '#e07a1e', mustache: true, carry: 'stick' },
  { dress: 'saree', top: '#c4241c', bottom: '#f2b705', veil: true, carry: 'potHead' },
  { dress: 'pants', top: '#8fa6c4', bottom: '#3a3a42', sleeves: 'short' },
  { dress: 'saree', top: '#2e8b57', bottom: '#7a2b6e', veil: true, carry: 'bundle' },
  { dress: 'kurta', top: '#e9dcc3', bottom: '#f4f1e8', headwear: 'topi', beard: true, carry: 'stick' },
  { dress: 'shorts', k: 0.7, headScale: 1.2, top: '#e0612b', bottom: '#2a3a6a', sleeves: 'short' },
  { dress: 'dhoti', top: '#dfe6ea', bottom: '#efece4', headwear: 'cap', mustache: true, carry: 'hay' },
  { dress: 'saree', top: '#1e6fa8', bottom: '#f2b705', veil: false, carry: 'bundle' },
  { dress: 'kurta', top: '#f4f2ec', bottom: '#f4f1e8', headwear: 'turban', turban: '#c4241c', mustache: true },
  { dress: 'saree', top: '#e85fc8', bottom: '#7a2b6e', veil: true, carry: 'potHead' },
];

export function buildTrackside(scene, railway, hooks = {}) {
  const R = rng(5150);
  // places along the open lines, well away from stations, crossings, bridges, tunnels, rivers and the jungle
  const yards = [];
  for (const T of [TRACK, TRACK3, RING]) for (const h of T.halts ?? []) if (h.yard) yards.push(h.yard);
  const spots = [];
  for (const T of [TRACK, TRACK3, RING]) {
    const P = T.path, q = {};
    for (let s = 40; s < P.L - 40; s += 55) {
      if (!T.openS(s, 40) || T.bridges.some(([a, b]) => s > a - 40 && s < b + 40)) continue;
      P.at(s, q);
      if (yards.some((y) => Math.hypot(y.x - q.x, y.z - q.z) < 150)) continue;
      if (Math.hypot(q.x - CROSSING.x, q.z - CROSSING.z) < 70 || Math.hypot(q.x - CROSSING3.x, q.z - CROSSING3.z) < 70) continue;
      spots.push({ T, s, x: q.x, z: q.z, tx: q.tx, tz: q.tz });
    }
  }
  const side = (sp, v) => ({ x: sp.x - sp.tz * v, z: sp.z + sp.tx * v });
  const okGround = (p) => Math.abs(heightAt(p.x, p.z) - TRACK_Y) < 3.5 && riverDist(p.x, p.z) > RIVER_HALF + 8 && jungleMask(p.x, p.z) === 0;

  // the cattle: a dozen little groups spread round the network, and one down in the meadow under the viaduct
  const herds = [];
  const stride = Math.max(1, Math.floor(spots.length / 12));
  for (let i = 0; i < spots.length && herds.length < 12; i += stride) {
    const sp = spots[(i + 3) % spots.length], sd = R() < 0.5 ? 1 : -1;
    const c = side(sp, sd * (16 + R() * 10));
    if (!okGround(c)) continue;
    herds.push({ home: { x: c.x, z: c.z, r: 9 }, sp, sd });
  }
  { const D = RING_SIGHTS.dip; herds.push({ home: { x: D.x - D.tz * 30, z: D.z + D.tx * 30, r: 12 }, sp: null, sd: 1, low: true }); }
  const animals = [];
  herds.forEach((H, k) => {
    const goats = k % 4 === 2;
    const n = goats ? 4 + Math.floor(R() * 3) : 2 + Math.floor(R() * 3);
    for (let j = 0; j < n; j++) {
      const a = goats ? new Goat(GOAT_COATS[(k + j) % GOAT_COATS.length], 0.9 + R() * 0.15, H.home, R)
        : new Goat(COW_COATS[(k * 2 + j) % COW_COATS.length], j === n - 1 && n > 2 ? 0.6 : 0.95, H.home, R, null, 'cow');
      a.H = H; a.spook = 0; a.away = null;
      scene.add(a.root);
      animals.push(a);
    }
  });

  // people on the footpath beside the line, each walking up and down a stretch of it
  const walkers = [];
  const wStride = Math.max(1, Math.floor(spots.length / WALKERS.length));
  for (let i = 0, k = 0; i < spots.length && k < WALKERS.length; i += wStride) {
    const sp = spots[(i + Math.floor(wStride / 2)) % spots.length], sd = k % 2 ? 1 : -1;
    if (!okGround(side(sp, sd * 6))) continue;
    const o = { ...WALKERS[k], skin: SKIN[k % SKIN.length] };
    const p = new Person(o);
    if (o.carry) p.prop(o.carry, true);
    scene.add(p.root);
    const span = 70 + R() * 60;
    walkers.push({ p, T: sp.T, s0: sp.s - span / 2, s1: sp.s + span / 2, s: sp.s + (R() - 0.5) * span, dir: R() < 0.5 ? 1 : -1, sd, off: 5.6 + R() * 0.8, step: 0, pause: 0, x: 0, z: 0, face: 0, carry: o.carry });
    k++;
  }

  // the nearest moving train car, and whether it's coming close
  const trainNear = (x, z) => {
    let best = Infinity, bx = 0, bz = 0;
    for (const tr of railway.trains) {
      if (Math.abs(tr.v) < 2) continue;
      for (const b of tr.boxes) { const d = Math.hypot(b.x - x, b.z - z); if (d < best) { best = d; bx = b.x; bz = b.z; } }
    }
    return { d: best, x: bx, z: bz };
  };
  let mooCool = 0;
  const q = {};
  return {
    animals, walkers,
    update(dt, player, night) {
      mooCool -= dt;
      for (const a of animals) {
        const d = Math.hypot(a.p.x - player.x, a.p.z - player.z);
        a.root.visible = d < 320;
        if (d > 260) continue;
        a.night = night;
        // a train thundering past: up and away from the line at a trot
        const tn = trainNear(a.p.x, a.p.z);
        if (tn.d < 38 && a.spook <= 0 && !night) {
          a.spook = 4 + Math.random() * 2;
          const ax = a.p.x - tn.x, az = a.p.z - tn.z, ad = Math.hypot(ax, az) || 1;
          a.away = { x: a.p.x + (ax / ad) * 18, z: a.p.z + (az / ad) * 18 };
          if (a.species === 'cow' && mooCool < 0 && d < 90) { hooks.moo?.(Math.max(0.2, 1 - d / 90)); mooCool = 6; }
        }
        if (a.spook > 0) {
          a.spook -= dt;
          a.state = 'walk'; a.target = a.away; a.stuck = 0;
          a.speed = a.species === 'cow' ? 2.6 : 3.2;
          if (a.spook <= 0) { a.state = 'graze'; a.timer = 4; }
        }
        // drift back home if spooked too far
        if (a.spook <= 0 && Math.hypot(a.p.x - a.H.home.x, a.p.z - a.H.home.z) > a.H.home.r * 2.5 && a.state === 'graze') { a.state = 'walk'; a.target = { x: a.H.home.x, z: a.H.home.z }; a.stuck = 0; }
        a.update(dt, player);
      }
      for (const w of walkers) {
        const P = w.T.path;
        P.at(w.s, q);
        const dP = Math.hypot(q.x - player.x, q.z - player.z);
        w.p.root.visible = dP < 300;
        if (dP > 240) continue;
        if (w.p.fallT > 0) { w.p.update(dt, 0, 'idle'); continue; }
        let speed = 0;
        const tn = trainNear(w.x || q.x, w.z || q.z);
        const watch = tn.d < 45; // a train coming: stop, step back a little, and turn to watch it go by
        w.step += ((watch ? 1.6 : 0) - w.step) * damp(dt, 3);
        if (!watch && !night) {
          if (w.pause > 0) w.pause -= dt;
          else {
            speed = w.carry === 'stick' ? 0.8 : 1.05;
            w.s += w.dir * speed * dt;
            if (w.s > w.s1 || w.s < w.s0) { w.dir = -w.dir; w.s = Math.max(w.s0, Math.min(w.s1, w.s)); w.pause = 3 + Math.random() * 6; }
          }
        }
        P.at(w.s, q);
        const v = w.sd * (w.off + w.step);
        const nx = q.x - q.tz * v, nz = q.z + q.tx * v;
        const pos = { x: nx, z: nz };
        resolveCollisions(pos, 0.3, undefined, true);
        w.x = pos.x; w.z = pos.z;
        const want = watch ? Math.atan2(tn.x - w.x, tn.z - w.z) : Math.atan2(q.tx * w.dir, q.tz * w.dir);
        w.face += wrapA(want - w.face) * damp(dt, 5);
        w.p.root.position.set(w.x, groundHeight(w.x, w.z), w.z);
        w.p.root.rotation.y = w.face;
        w.p.update(dt, speed, speed > 0 ? (w.carry === 'potHead' || w.carry === 'hay' || w.carry === 'bundle' ? 'carry' : 'walk') : w.carry === 'stick' ? 'lean' : 'idle');
      }
    },
  };
}
