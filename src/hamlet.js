// Life in the two villages out by the ring line. Khetpura: Punjabi farmers in bright turbans, cows by the
// haystacks. Rannvas: Kutchi herders, women in deep red and black, goats and a camel among the round huts.
// A handful of people in each go about the day: women fetching water in pots on their heads, men talking on
// charpais, an old man leaning on his stick, children chasing about, a farmer bringing in hay.
import { Person } from './people.js';
import { Goat } from './animals.js';
import { groundHeight, resolveCollisions } from './world.js';
import { rng } from './noise.js';

const damp = (dt, r) => 1 - Math.exp(-dt * r);
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const SKIN = ['#8a5a3c', '#7a4c33', '#6e4530', '#a06a48', '#93613f', '#7f5238'];
const LOOKS = {
  punjab: {
    man: (i) => ({ dress: 'kurta', top: ['#f4f2ec', '#e9dcc3', '#c9d8e8'][i % 3], bottom: '#f4f1e8', skin: SKIN[i % 6], beard: i % 2 === 0, mustache: true, headwear: 'turban', turban: ['#f2a41a', '#1e6fa8', '#c2185b', '#2e8b57'][i % 4] }),
    woman: (i) => ({ dress: 'saree', top: ['#e85fc8', '#f2b705', '#2eb84a'][i % 3], bottom: ['#7a2b6e', '#c4241c', '#1e6fa8'][i % 3], veil: true, skin: SKIN[(i + 2) % 6] }),
  },
  kutch: {
    man: (i) => ({ dress: 'dhoti', top: '#f4f1e8', bottom: '#f4f1e8', skin: SKIN[(i + 1) % 6], mustache: true, headwear: 'turban', turban: ['#ffffff', '#c4241c', '#f2efe6'][i % 3] }),
    woman: (i) => ({ dress: 'saree', top: ['#1a1a1a', '#c4241c', '#2a2a6a'][i % 3], bottom: ['#c4241c', '#1a1a1a', '#e0612b'][i % 3], veil: true, skin: SKIN[(i + 3) % 6] }),
  },
};
const kid = (i) => ({ dress: i % 2 ? 'saree' : 'shorts', k: 0.66, headScale: 1.22, top: ['#f2c21a', '#e0612b', '#2e8b57'][i % 3], bottom: ['#2a3a6a', '#c2185b'][i % 2], pallu: false, braids: i % 2 === 1, veil: false, skin: SKIN[(i + 4) % 6], sleeves: 'short' });

export function buildHamlets(scene, villages) {
  const R = rng(4417);
  const all = [];
  for (const v of villages) {
    const L = LOOKS[v.style] ?? LOOKS.punjab;
    const homes = v.homes.length ? v.homes : [{ x: v.x + 10, z: v.z, rot: 0 }];
    const doorOf = (h) => ({ x: h.x + Math.sin(h.rot) * 4.2, z: h.z + Math.cos(h.rot) * 4.2 });
    const centre = { x: v.x, z: v.z };
    const folk = [];
    const add = (o, role, extra = {}) => {
      const p = new Person(o);
      scene.add(p.root);
      const h = homes[Math.floor(R() * homes.length)], d = doorOf(h);
      const f = { p, role, x: d.x, z: d.z, tx: d.x, tz: d.z, face: R() * 6.28, timer: R() * 8, speed: 0, ...extra };
      folk.push(f);
      return f;
    };
    // women fetching water, a woman at her door, men on a charpai, an old man with his stick, children, a farmer
    for (let i = 0; i < 2; i++) { const f = add(L.woman(i), 'water'); f.p.prop('potHead', true); }
    add(L.woman(2), 'door');
    for (let i = 0; i < 2; i++) { const f = add(L.man(i), 'talk'); f.x = centre.x + (i ? 1.6 : -1.6); f.z = centre.z + 3; f.face = i ? -Math.PI / 2 : Math.PI / 2; }
    { const f = add(L.man(2), 'elder'); f.p.prop('stick', true); }
    for (let i = 0; i < 2; i++) add(kid(i + (v.style === 'kutch' ? 2 : 0)), 'kid');
    { const f = add(L.man(3), 'farmer'); f.p.prop('hay', true); }
    // the animals: cows at Khetpura; goats and a decorated camel at Rannvas
    const animals = [];
    const pen = { x: v.x + Math.cos(v.th + Math.PI) * 44, z: v.z + Math.sin(v.th + Math.PI) * 44, r: 14 };
    if (v.style === 'kutch') {
      for (let i = 0; i < 5; i++) animals.push(new Goat([['#1d1a19', '#2a2524'], ['#5a3a26', '#e8e0d2'], ['#efe9dd', '#d9cdb8']][i % 3], 0.95 + R() * 0.1, pen, R));
      animals.push(new Goat(['#c49a62', '#e2c89a', 1], 1, { ...pen, r: 10 }, R, null, 'camel'));
    } else for (let i = 0; i < 2; i++) animals.push(new Goat([['#ece6da'], ['#b98e64']][i], 0.95, pen, R, null, 'cow'));
    for (const a of animals) scene.add(a.root);
    all.push({ v, folk, animals, homes, doorOf, centre });
  }

  const pickTarget = (H, f) => {
    if (f.role === 'water') { // to the village centre (the well) and back to a door
      f.toCentre = !f.toCentre;
      if (f.toCentre) { f.tx = H.centre.x + (R() - 0.5) * 4; f.tz = H.centre.z - 4 + (R() - 0.5) * 2; }
      else { const d = H.doorOf(H.homes[Math.floor(R() * H.homes.length)]); f.tx = d.x; f.tz = d.z; }
      f.timer = 6 + R() * 6;
    } else if (f.role === 'kid') { const a = R() * 6.28, d = 4 + R() * 14; f.tx = H.centre.x + Math.cos(a) * d; f.tz = H.centre.z + Math.sin(a) * d; f.timer = 1 + R() * 3; }
    else if (f.role === 'farmer') {
      f.out = !f.out;
      const a = H.v.th + Math.PI + (R() - 0.5), d = f.out ? 42 : 8;
      f.tx = H.centre.x + Math.cos(a) * d; f.tz = H.centre.z + Math.sin(a) * d; f.timer = 8 + R() * 8;
    } else if (f.role === 'elder') { const d = H.doorOf(H.homes[Math.floor(R() * H.homes.length)]); f.tx = (d.x + H.centre.x) / 2; f.tz = (d.z + H.centre.z) / 2; f.timer = 20 + R() * 20; }
  };
  let night = false;
  return {
    hamlets: all,
    setNight(n) { night = n; },
    update(dt, player) {
      for (const H of all) {
        const d = Math.hypot(player.x - H.v.x, player.z - H.v.z);
        const vis = d < 360;
        for (const f of H.folk) f.p.root.visible = vis;
        for (const a of H.animals) a.root.visible = vis;
        if (d > 230) continue;
        for (const a of H.animals) { a.night = night; a.update(dt, player); }
        for (const f of H.folk) {
          if (f.p.fallT > 0) { f.p.update(dt, 0, 'idle'); continue; }
          const moves = f.role === 'water' || f.role === 'kid' || f.role === 'farmer' || f.role === 'elder';
          let speed = 0, action = 'idle';
          if (moves && !night) {
            const dx = f.tx - f.x, dz = f.tz - f.z, dd = Math.hypot(dx, dz);
            if (dd > 0.3) {
              speed = f.role === 'kid' ? 2.4 : f.role === 'elder' ? 0.7 : 1.1;
              const k = Math.min(1, (speed * dt) / dd);
              const q = { x: f.x + dx * k, z: f.z + dz * k };
              resolveCollisions(q, 0.3, undefined, true);
              f.x = q.x; f.z = q.z;
              f.face += wrapA(Math.atan2(dx, dz) - f.face) * damp(dt, 6);
            } else { f.timer -= dt; if (f.timer <= 0) pickTarget(H, f); }
          }
          if (f.role === 'talk') action = 'sit';
          else if (f.role === 'door') action = night ? 'idle' : 'sit';
          else if (f.role === 'elder' && speed === 0) action = 'lean';
          else if (speed > 0) action = f.role === 'water' || f.role === 'farmer' ? 'carry' : 'walk';
          f.p.root.position.set(f.x, groundHeight(f.x, f.z) + (action === 'sit' ? 0 : 0), f.z);
          f.p.root.rotation.y = f.face;
          f.p.update(dt, speed, action);
        }
      }
    },
  };
}
