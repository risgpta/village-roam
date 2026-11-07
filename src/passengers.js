// Passengers for the boy's minibus and e-rickshaw: people wait at the bus stop in every village. Pull up beside a stop and
// stand still: the door folds open, anyone with somewhere to go walks over and climbs in, and anyone riding
// who wanted this stop gets off and pays. Stops slowly fill up again while you're away.
import * as THREE from 'three';
import { Person } from './people.js';
import { layout, heightAt, localToWorld } from './world.js';

const SAREE = [['#d4a017', '#b3202c'], ['#3c6e47', '#2e8b57'], ['#7a2b6e', '#c2185b'], ['#c4241c', '#f6f2e8'], ['#1e6fa8', '#f2b705'], ['#e0612b', '#2e3fa8']];
const SHIRT = ['#efe8d6', '#dfe6ea', '#b9c7a5', '#8fa6c4', '#e9dcc3', '#c9b27a', '#f4f1e8', '#d8c0a0'];
const SKIN = ['#7d4f33', '#6e4530', '#83553a', '#5f3a26', '#8a5a3c', '#80523a'];
const pick = (a, i) => a[i % a.length];

// how people dress depends on the village the stop is in
export function lookFor(village, i) {
  const female = i % 2 === 0, skin = pick(SKIN, i * 7 + 3);
  if (village === 'Noorpur') {
    return female
      ? { dress: 'saree', pallu: false, k: 0.9, top: pick(['#2e6b5a', '#5a3a6a', '#3a4a7a', '#7a3a3a'], i), bottom: pick(['#2e6b5a', '#4a2a5a', '#2a3a6a', '#5a2a2a'], i), hijab: pick(['#1a1a1a', '#e8e4dc', '#2a4a3a', '#5a4a6a'], i), skin }
      : { dress: 'kurta', top: pick(['#f4f2ec', '#e8e4d8', '#dfe8e4', '#efe6d0'], i), bottom: '#f4f2ec', headwear: 'topi', beard: i % 3 !== 1, mustache: i % 3 === 1, skin };
  }
  if (village === 'Mariapur') {
    return female
      ? { dress: 'saree', pallu: i % 4 === 0, k: 0.9, top: pick(['#f4f2ec', '#e88aa0', '#7ab0d8', '#f2d46a'], i), bottom: pick(['#f4f2ec', '#c0392b', '#2e6aa8', '#e8e0cc'], i), skin }
      : { dress: i % 3 ? 'pants' : 'dhoti', top: pick(['#f4f2ec', '#8fb8d8', '#e8d8a8', '#c8d8c0'], i), bottom: i % 3 ? '#4a4a52' : '#f4f2ec', mustache: i % 2 === 0, sleeves: i % 2 ? 'short' : undefined, skin };
  }
  return female
    ? { dress: 'saree', k: 0.9 + (i % 3) * 0.02, top: pick(SAREE, i)[0], bottom: pick(SAREE, i)[1], veil: i % 3 === 0, skin }
    : { dress: pick(['dhoti', 'pants', 'kurta'], i), top: pick(SHIRT, i), bottom: pick(['#f4f1e8', '#4a4a52', '#efece4'], i), headwear: pick(['turban', 'cap', undefined], i), turban: pick(['#e07a1e', '#f2efe6', '#c0392b'], i), mustache: i % 3 !== 2, skin };
}

const V3 = new THREE.Vector3();
export function buildPassengers(scene, hooks = {}) {
  const stops = (layout.busStops || []).map((b, i) => ({ ...b, idx: i, waiting: [], refill: 15 + Math.random() * 25 }));
  let nextLook = 0;
  const spots = [-1.0, 0.0, 1.0, -0.5, 0.5];
  const spotFor = (stop, k) => localToWorld(stop, spots[k % spots.length], k < 3 ? 0.1 : 0.9);
  const spawn = (stop) => {
    const k = stop.waiting.length;
    const person = new Person(lookFor(stop.en, nextLook++));
    person.root.rotation.y = stop.rot;
    const p = spotFor(stop, k);
    person.root.position.set(p.x, heightAt(p.x, p.z), p.z);
    person.root.visible = false;
    if (nextLook % 4 === 1) person.prop('bundle', true);
    scene.add(person.root);
    stop.waiting.push({ person, home: p, state: 'wait', delay: 0 });
  };
  for (const s of stops) { const n = 2 + (s.idx % 2); for (let i = 0; i < n; i++) spawn(s); }

  const aboard = []; // { person, seat, dest, from }
  const walkers = []; // people stepping off and walking away
  let fare = 0, stopT = 0, atStop = null, doorOpen = false;

  function freeSeat(bus) {
    const used = new Set(aboard.filter((a) => a.bus === bus).map((a) => a.seat));
    for (let i = 0; i < bus.seats.length; i++) if (!used.has(i)) return i;
    return -1;
  }
  // the way in, in the bus's own space: up the steps, along the gangway, sideways into the seat
  function pathIn(bus, seat) {
    if (bus.pathIn) return bus.pathIn(seat);
    const S = bus.seats[seat], F = bus.floorY, D = bus.doorPos;
    return [
      new THREE.Vector3(D.x - 0.45, F * 0.45, D.z),
      new THREE.Vector3(D.x - 0.9, F, D.z),
      new THREE.Vector3(0.6, F, D.z - 0.35),
      new THREE.Vector3(0.6, F, S.z + 0.06),
      new THREE.Vector3(S.x, F, S.z + 0.06),
      new THREE.Vector3(S.x, S.y, S.z),
    ];
  }
  let crew = null;
  const doorWorld = (bus, out) => { out.copy(bus.doorPos); bus.root.localToWorld(out); return out; };

  // carriers: every vehicle that takes passengers; bus: the one the boy is driving (or null)
  let doorBus = null;
  function update(dt, player, carriers, active, speed) {
    const events = [];
    const driving = !!active, bus = active;
    if (!crew) { const mb = carriers.find((c) => c.kind === 'minibus'); if (mb) crew = makeConductor(mb); }
    // the people at the stops: shown and animated when the boy is anywhere near
    for (const s of stops) {
      const near = Math.abs(s.x - player.x) + Math.abs(s.z - player.z) < 170;
      for (const w of s.waiting) {
        w.person.root.visible = near;
        if (!near) continue;
        if (w.state === 'wait') { w.person.update(dt, 0, 'idle'); continue; }
        if (w.state === 'board') {
          w.delay -= dt;
          if (w.delay > 0) { w.person.update(dt, 0, 'idle'); continue; }
          const d = doorWorld(w.bus, V3);
          const r = w.person.root.position;
          const dx = d.x - r.x, dz = d.z - r.z, l = Math.hypot(dx, dz);
          if (l < 0.35) {
            // climb the steps and walk down the gangway to a free seat
            const B = w.bus;
            const seat = freeSeat(B);
            s.waiting.splice(s.waiting.indexOf(w), 1);
            if (seat < 0) { scene.remove(w.person.root); continue; }
            B.root.attach(w.person.root);
            w.person.seatH = 0;
            w.person.prop('bundle', false);
            const choices = stops.filter((q) => q !== s);
            const dest = choices[Math.floor(Math.random() * choices.length)];
            aboard.push({ person: w.person, bus: B, seat, dest: dest.idx, from: s.idx, state: 'move', path: pathIn(B, seat) });
            events.push({ type: 'board', dest: dest.en, destHi: dest.hi, veh: B.kind });
            continue;
          }
          const sp = Math.min(1.5, l * 3);
          r.x += (dx / l) * sp * dt; r.z += (dz / l) * sp * dt; r.y = heightAt(r.x, r.z);
          w.person.root.rotation.y = Math.atan2(dx, dz);
          w.person.update(dt, sp, 'walk');
        }
      }
    }
    // riders: walking in or out along the gangway, or sitting and looking out of the window
    for (let i = aboard.length - 1; i >= 0; i--) {
      const a = aboard[i];
      if (a.state === 'sit') { a.person.update(dt, 0, 'sit'); continue; }
      const r = a.person.root.position, tgt = a.path[0];
      const dx = tgt.x - r.x, dz = tgt.z - r.z, l = Math.hypot(dx, dz);
      if (l < 0.06) {
        r.y = tgt.y;
        a.path.shift();
        if (a.path.length) continue;
        if (a.state === 'move') { a.state = 'sit'; a.person.root.position.copy(a.bus.seats[a.seat]); a.person.root.rotation.set(0, a.bus.seatRot?.[a.seat] ?? 0, 0); continue; }
        // stepped down out of the door: back in the world, off to the shelter
        aboard.splice(i, 1);
        scene.attach(a.person.root);
        a.person.root.rotation.set(0, a.person.root.rotation.y, 0);
        const st = stops[a.dest];
        a.person.root.position.y = heightAt(a.person.root.position.x, a.person.root.position.z);
        a.person.seatH = 0.55;
        if (Math.hypot(st.x - a.person.root.position.x, st.z - a.person.root.position.z) > 30) { scene.remove(a.person.root); continue; }
        walkers.push({ person: a.person, stop: st, to: spotFor(st, st.waiting.length + walkers.length) });
        continue;
      }
      const sp = 1.1, k = Math.min(1, (sp * dt) / l);
      r.x += dx * k; r.z += dz * k; r.y += (tgt.y - r.y) * k;
      a.person.root.rotation.set(0, Math.atan2(dx, dz), 0);
      a.person.update(dt, sp, 'walk');
    }
    if (crew) crew.update(dt, doorOpen && doorBus?.kind === 'minibus');
    // people who got off walk to the shelter, then join those waiting there (or wander off)
    for (let i = walkers.length - 1; i >= 0; i--) {
      const w = walkers[i];
      const r = w.person.root.position;
      const dx = w.to.x - r.x, dz = w.to.z - r.z, l = Math.hypot(dx, dz);
      if (l < 0.3) {
        walkers.splice(i, 1);
        if (w.stop.waiting.length < 3 && Math.random() < 0.5) { w.person.root.rotation.y = w.stop.rot; w.stop.waiting.push({ person: w.person, home: w.to, state: 'wait', delay: 0 }); }
        else scene.remove(w.person.root);
        continue;
      }
      r.x += (dx / l) * 1.3 * dt; r.z += (dz / l) * 1.3 * dt; r.y = heightAt(r.x, r.z);
      w.person.root.rotation.y = Math.atan2(dx, dz);
      w.person.update(dt, 1.3, 'walk');
    }

    // the bus at a stop?
    if (driving) {
      bus.root.getWorldPosition(V3);
      let best = null, bd = 16;
      for (const s of stops) { const d = Math.hypot(s.x - V3.x, s.z - V3.z); if (d < bd) { bd = d; best = s; } }
      if (best && Math.abs(speed) < 0.4) {
        stopT += dt;
        if (stopT > 0.5 && (!doorOpen || atStop !== best)) {
          doorOpen = true; atStop = best;
          bus.doorWant = 1; doorBus = bus;
          events.push({ type: 'door', stop: best.en, veh: bus.kind });
          // first everyone for this stop gets off and pays
          const off = aboard.filter((a) => a.bus === bus && a.dest === best.idx && a.state === 'sit');
          let paid = 0;
          off.forEach((a) => {
            if (a.state !== 'sit') return;
            a.state = 'out';
            a.path = pathIn(bus, a.seat).reverse().slice(1);
            a.path.push(bus.doorPos.clone().setY(0));
            const from = stops[a.from];
            const km = Math.hypot(from.x - best.x, from.z - best.z) / 1000;
            paid += (bus.fare0 ?? 10) + Math.round(km * 20) * (bus.fareK ?? 5);
          });
          if (off.length) { fare += paid; events.push({ type: 'alight', n: off.length, stop: best.en, paid, veh: bus.kind }); }
          // then the waiting people walk over, one after another
          let k = 0;
          const room = bus.seats.length - aboard.filter((a) => a.bus === bus).length + off.length;
          for (const w of best.waiting) if (w.state === 'wait' && k < room) { w.state = 'board'; w.bus = bus; w.delay = 0.6 + k * 0.9; k++; }
          if (!k && !off.length) events.push({ type: 'empty', stop: best.en, full: room <= 0, veh: bus.kind });
        }
      } else {
        stopT = 0;
        if (doorOpen && Math.abs(speed) > 0.6) {
          doorOpen = false; bus.doorWant = 0; doorBus = null;
          // anyone still walking up gives up and goes back to the shelter
          if (atStop) for (const w of atStop.waiting) if (w.state === 'board') { w.state = 'wait'; w.person.root.position.set(w.home.x, heightAt(w.home.x, w.home.z), w.home.z); w.person.root.rotation.y = atStop.rot; }
          atStop = null;
        }
      }
    }
    if (doorOpen && (!driving || doorBus !== bus)) {
      doorOpen = false; if (doorBus) doorBus.doorWant = 0; doorBus = null;
      if (atStop) for (const w of atStop.waiting) if (w.state === 'board') { w.state = 'wait'; w.person.root.position.set(w.home.x, heightAt(w.home.x, w.home.z), w.home.z); w.person.root.rotation.y = atStop.rot; }
      atStop = null;
    }

    // stops fill up again slowly while the bus is elsewhere
    for (const s of stops) {
      if (s.waiting.length >= 3 || s === atStop) continue;
      s.refill -= dt;
      if (s.refill < 0) { s.refill = 25 + Math.random() * 35; if (Math.hypot(s.x - player.x, s.z - player.z) > 40) spawn(s); }
    }
    return events;
  }
  return {
    stops, update,
    get aboard() { return aboard; },
    aboardOf: (bus) => aboard.filter((a) => a.bus === bus),
    get crew() { return crew; },
    get fare() { return fare; },
    nextDrops(bus) {
      const m = new Map();
      for (const a of aboard) {
        if (bus && a.bus !== bus) continue;
        const n = stops[a.dest].en; m.set(n, (m.get(n) || 0) + 1);
      }
      return [...m.entries()];
    },
    villagers: () => stops.flatMap((s) => s.waiting.map((w) => w.person)),
  };
}

// the conductor: khaki uniform, a leather cash bag and a whistle, standing in the gangway by the door holding
// the pole; at a stop he leans out and waves people in
function makeConductor(bus) {
  const p = new Person({ dress: 'pants', top: '#b8a27a', bottom: '#6a5a40', mustache: true, skin: '#6e4530', sleeves: 'short', headwear: 'cap', turban: '#b8a27a' });
  p.root.position.set(1.15, bus.floorY, 1.35);
  p.root.rotation.y = Math.PI / 2 + 0.5;
  bus.root.add(p.root);
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.07), new THREE.MeshStandardMaterial({ color: '#5a3a1e', roughness: 0.6 }));
  bag.position.set(0.12, 0.08, 0.14);
  p.torso.add(bag);
  let t = 0, lean = 0;
  p.poseHook = (P) => {
    P.sh1 = -2.7 + lean * 1.2; P.el1 = -0.2; P.shz1 = -0.15;
    if (lean > 0.05) { P.sh0 = -1.6 - Math.sin(t * 7) * 0.4 * lean; P.el0 = -0.5; P.shz0 = 0.3; P.torsoY = -0.3 * lean; P.headY = -0.4 * lean; }
  };
  return {
    person: p,
    update(dt, open) {
      t += dt;
      lean += ((open ? 1 : 0) - lean) * (1 - Math.exp(-dt * 3));
      p.update(dt, 0, 'idle');
    },
  };
}
