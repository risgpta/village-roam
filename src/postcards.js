// Postcards to find: eighteen of the finest spots in the country each have a picture postcard waiting on a little
// wooden stand, a soft glowing card above it you can spot from a way off. Walk (or ride) up to one and it's
// yours: the moment is snapped as the card's picture and it goes into the album (O). The album shows the ones
// still out there as a hint of where to look — it's the nudge to see the whole map. (Nothing is saved: a new
// visit starts a fresh album.)
import * as THREE from 'three';
import { layout, groundHeight, isFree, riverDist, RIVER_HALF, WF, PEAK, RING_SIGHTS, RV, NE, CANAL, NEW_VILLAGES, MP, HILLTOP, TRIB, TRACKS, canalDist, tribDist, trackDist } from './world.js';

function cardTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#fbf3e2'; g.fillRect(0, 0, 128, 96);
  g.strokeStyle = '#c4241c'; g.lineWidth = 5; g.setLineDash([9, 6]); g.strokeRect(4, 4, 120, 88); g.setLineDash([]);
  g.fillStyle = '#e8b04a'; g.fillRect(84, 12, 30, 34); g.fillStyle = '#c4241c'; g.fillRect(88, 16, 22, 26);
  g.fillStyle = '#7a5a3a'; for (let i = 0; i < 4; i++) g.fillRect(16, 56 + i * 9, 92 - i * 10, 3);
  g.fillStyle = '#2a6a8a'; g.font = 'bold 22px serif'; g.fillText('✉', 22, 40);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,236,170,0.9)'); gr.addColorStop(0.4, 'rgba(255,210,120,0.35)'); gr.addColorStop(1, 'rgba(255,200,100,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildPostcards(scene, hooks = {}) {
  const L = layout;
  const station = (name) => { for (const T of TRACKS) for (const h of T.halts ?? []) if (h.name === name && h.yard) return h.yard; return null; };
  const V = (n) => NEW_VILLAGES.find((v) => v.name === n);
  const mouth = TRIB.path.at(TRIB.path.L - 30);
  const canalHead = CANAL.path.at(20);
  const list = [
    ['falls', 'Jharna — the waterfall', 'झरना', 'Where a stream drops off the high rocks, out in the hills south of the village', { x: WF.x - 26, z: WF.z + 15 }],
    ['summit', 'Shikhar — the summit', 'शिखर', 'The very top of the great mountain in the north', PEAK],
    ['viaduct', 'The viaduct', 'पुल', 'Where the ring line strides across a deep valley, out in the south-east', RING_SIGHTS.dip],
    ['banyan', 'The old banyan', 'बरगद', 'The great tree at the heart of Gaon', L.banyan],
    ['stepwell', 'Marudhar’s stepwell', 'बावड़ी', 'The desert village across the river', RV],
    ['tea', 'The tea garden', 'चाय बागान', 'Terraces of tea in the north-east hills', NE?.tea && { x: (NE.tea.x0 + NE.tea.x1) / 2, z: (NE.tea.z0 + NE.tea.z1) / 2 }],
    ['canalhead', 'Where the canal begins', 'नहर का मुहाना', 'The head of the long canal, far out east beyond the ring', canalHead],
    ['canalshrine', 'The canal shrine', 'नहर वाला मंदिर', 'A little shrine under a shade tree, between Naharpur and the canal', L.naharShrine],
    ['sunflowers', 'Kheri Kalan', 'खेड़ी कलां', 'The village across the canal at its far end, sunflowers all round', V('Kheri Kalan')],
    ['ghat', 'Choti Nadi ghat', 'छोटी नदी घाट', 'A bathing ghat on the little river, by a Bengali village', L.tribGhat],
    ['pathargaon', 'Pathargaon', 'पत्थरगाँव', 'A stone village far out along the outer line, in the west', V('Pathargaon')],
    ['sonpur', 'Sonpur station', 'सोनपुर', 'The old country station beyond the western tunnel', station('Sonpur')],
    ['junction', 'Noorpur Junction', 'नूरपुर जंक्शन', 'Where the lines meet, east of the river', station('Noorpur Junction')],
    ['church', 'Mariapur church', 'मरियापुर', 'A whitewashed church in a village of pastel cottages', MP.church],
    ['mela', 'Gaon ka mela', 'मेला', 'The fair with the big wheel', L.mela],
    ['airstrip', 'The airstrip', 'हवाई पट्टी', 'A grass strip out in the open country, a plane waiting by the hangar', L.airstrip],
    ['hilltop', 'The hilltop shrine', 'पहाड़ी मंदिर', 'Where the main road climbs into the hills and ends', HILLTOP],
    ['sangam', 'Sangam — where the rivers meet', 'संगम', 'Where the little river runs into the big one, far to the north', mouth],
  ].filter((e) => e[4]);
  // a dry, open spot a few metres from the landmark for the stand
  const spots = [];
  for (const [key, title, hi, hint, at] of list) {
    let p = null;
    for (let d = 3; d < 40 && !p; d += 2) for (let a = 0; a < Math.PI * 2 && !p; a += 0.5) {
      const x = at.x + Math.cos(a) * d, z = at.z + Math.sin(a) * d;
      if (!isFree(x, z, 1.0) || riverDist(x, z) < RIVER_HALF + 2 || canalDist(x, z) < CANAL.half + 2 || tribDist(x, z) < TRIB.half + 2 || trackDist(x, z) < 5) continue;
      p = { x, z };
    }
    if (!p) p = { x: at.x + 4, z: at.z + 4 };
    spots.push({ key, title, hi, hint, x: p.x, z: p.z, got: false, img: null });
  }
  // the stands: a little post with a slanted board and the card pinned to it, and the glowing card above
  const post = new THREE.MeshStandardMaterial({ color: '#7a5434', roughness: 0.8 });
  const board = new THREE.MeshStandardMaterial({ color: '#a8352a', roughness: 0.7 });
  const cardMat = new THREE.MeshStandardMaterial({ map: cardTexture(), roughness: 0.6, emissive: '#fff2d0', emissiveIntensity: 0.25 });
  const spriteMat = new THREE.SpriteMaterial({ map: cardTexture(), transparent: true, depthWrite: false, fog: false });
  const glowMat = new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  for (const s of spots) {
    const g = new THREE.Group();
    g.position.set(s.x, groundHeight(s.x, s.z), s.z);
    g.rotation.y = (s.x * 13 + s.z * 7) % 6.28;
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.1, 8), post); p.position.y = 0.55; p.castShadow = true; g.add(p);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.46, 0.05), board); b.position.set(0, 1.18, 0); b.rotation.x = -0.35; b.castShadow = true; g.add(b);
    const c = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.36), cardMat); c.position.set(0, 1.19, 0.035); c.rotation.x = -0.35; g.add(c);
    const sp = new THREE.Sprite(spriteMat); sp.scale.set(0.9, 0.68, 1); sp.position.y = 2.4; g.add(sp);
    const gl = new THREE.Sprite(glowMat); gl.scale.setScalar(3.2); gl.position.y = 2.4; g.add(gl);
    scene.add(g);
    s.g = g; s.sprite = sp; s.glow = gl; s.card = c;
  }
  // ---- the album ----
  const $ = (id) => document.getElementById(id);
  const grid = $('pc-grid'), chip = $('pc-count');
  const n = spots.length;
  const render = () => {
    const got = spots.filter((s) => s.got).length;
    chip.innerHTML = `✉ <b>${got}</b>/${n} postcards <kbd>O</kbd>`;
    $('pc-sub').textContent = got === n ? 'Every postcard found — you have seen the whole country!' : `${got} of ${n} found · walk or ride up to a glowing card to collect it`;
    grid.innerHTML = '';
    for (const s of spots) {
      const d = document.createElement('div');
      d.className = 'pc-card' + (s.got ? ' got' : '');
      if (s.got) d.innerHTML = `<div class="pc-img" style="background-image:url(${s.img ?? ''})"></div><div class="pc-t">${s.title}</div><div class="pc-hi">${s.hi}</div>`;
      else d.innerHTML = `<div class="pc-img q">?</div><div class="pc-t">Still to find</div><div class="pc-hint">${s.hint}</div>`;
      grid.append(d);
    }
  };
  render();
  let pending = null;
  return {
    spots,
    get open() { return $('album').classList.contains('show'); },
    toggle(v) { $('album').classList.toggle('show', v ?? !this.open); if (this.open && document.pointerLockElement) document.exitPointerLock(); render(); },
    // for the map: found ones as stamps, the rest as a soft circle round roughly where they are
    marks() { return spots.map((s) => ({ x: s.x, z: s.z, got: s.got, title: s.title, ox: Math.sin(s.x * 0.37) * 60, oz: Math.cos(s.z * 0.41) * 60 })); },
    get wantGrab() { return !!pending; },
    // the frame just drawn becomes the card's picture
    grab(canvas) {
      if (!pending) return;
      const s = pending; pending = null;
      const c = document.createElement('canvas'); c.width = 320; c.height = 200;
      const g = c.getContext('2d');
      const sw = canvas.width, sh = canvas.height, r = Math.min(sw / 320, sh / 200);
      g.drawImage(canvas, (sw - 320 * r) / 2, (sh - 200 * r) / 2, 320 * r, 200 * r, 0, 0, 320, 200);
      s.img = c.toDataURL('image/jpeg', 0.8);
      render();
    },
    update(dt, player, t, riding) {
      glowMat.opacity = 0.6 + Math.sin(t * 2.2) * 0.25;
      for (const s of spots) {
        const d = Math.abs(player.x - s.x) + Math.abs(player.z - s.z);
        s.g.visible = d < 900;
        s.sprite.visible = s.glow.visible = !s.got;
        if (!s.g.visible || s.got) continue;
        s.sprite.position.y = 2.4 + Math.sin(t * 1.6 + s.x) * 0.12;
        s.glow.position.y = s.sprite.position.y;
        if (Math.hypot(player.x - s.x, player.z - s.z) < (riding ? 6 : 3.5)) {
          s.got = true; pending = s;
          const got = spots.filter((o) => o.got).length;
          hooks.onCollect?.(s, got, n);
          render();
        }
      }
    },
  };
}
