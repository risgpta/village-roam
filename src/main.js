import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { noise2, clamp } from './noise.js';
import {
  isFree, fieldType, trackDist, TANK, TRACKS, CANAL, canalDist, RAPID, rapidLevel, rapidDist, roadX, groundHeight, resolveCollisions, pushOut, colliders, forColliders, NP, MP, heightAt, riverDist, WATER_Y, WATER, PLAY_RADIUS, layout, jungleMask, TRACK_PONDS, regionName, WF, RIVER_HALF, MARKET, TEA, tunnelAt, LID_W, TRACK_Y, CRICKET, localToWorld, lanes,
} from './world.js';
import { buildTerrain, buildGrassData } from './terrain.js';
import { startBakes } from './bakepool.js';
import { buildGrass } from './grass.js';
import { buildVegetation, setFoliageGlow, setFoliageSeason, updateVegetation } from './vegetation.js';
import { buildRiver, buildWaterfall, streamDist } from './water.js';
import { buildVillage, setNightGlow } from './props.js';
import { buildRailway } from './rail.js';
import { buildPeople, makeBullockCart, makeTonga } from './people.js';
import { AnimalMount } from './mounts.js';
import { buildFriends } from './friends.js';
import { buildFire } from './fire.js';
import { buildAnimals } from './animals.js';
import { LanternLights } from './gear.js';
import { Boy } from './boy.js';
import { Bicycle, Moped } from './bicycle.js';
import { AutoRickshaw, RowBoat, Scooter, SmallCar, MiniBus, ERickshaw, TakenVehicle, PoliceJeep, makeTractor } from './vehicles.js';
import { buildGoodsYards } from './goods.js';
import { buildWorkers } from './workers.js';
import { buildPostcards } from './postcards.js';
import { buildMela } from './mela.js';
import { Plane, Flight, buildAirstrip } from './plane.js';
import { Helicopter, HeliFlight, buildHelipad } from './heli.js';
import { buildStations, CAPACITY } from './station.js';
import { buildHerds } from './herds.js';
import { buildHamlets } from './hamlet.js';
import { buildShrineLife } from './shrine.js';
import { buildTrackside } from './trackside.js';
import { buildTrackScenery } from './trackscene.js';
import { ALL_PEOPLE, EYE } from './people.js';
import { buildPassengers } from './passengers.js';
import { buildConstruction } from './construction.js';
import { buildKites } from './kites.js';
import { Crashes, shapeOf } from './crash.js';
import { buildFarm } from './farm.js';
import { buildFish, consolidate } from './animals.js';
import { buildWildlife } from './wildlife.js';
import { MapUI } from './map.js';
import { Puffs } from './particles.js';
import { Flocks, GroundBirds, buildMotes } from './life.js';
import { buildNightSky, buildClouds, buildRain } from './atmosphere.js';
import { Ambience, THEMES } from './audio.js';
import { buildCoachInside, FLOOR as COACH_FLOOR, WALL_X as COACH_WALL } from './coachinside.js';
import './audio2.js';
import { Ambulance, FireTruck } from './emergency.js'; // lifelike horns, whistle, brakes, helicopter and animal voices
import { windUniforms } from './wind.js';
import { createEnvironment, addSurfaceGrain } from './realism.js';
import { sampleAtmo, WEATHERS, TIMES, clockText } from './daycycle.js';
import { updateCull, streamGroup, updateStream, setupTinyCull, updateTinyCull } from './perf.js';
import { wheelRig, groundPose, settleWheels } from './suspension.js';
import { WaterJet } from './waterjet.js';
import { buildTrackPonds } from './trackponds.js';
import { buildBuffaloes } from './buffalo.js';
import { buildShops } from './shops.js';

const $ = (id) => document.getElementById(id);
// the riding panel's speedometer: ticks round the arc once, then the arc filled toward the top speed
{
  const g = $('rh-ticks'), cx = 60, cy = 64.6;
  if (g) for (let i = 0; i <= 10; i++) {
    const a = ((215.9 - (251.8 * i) / 10) * Math.PI) / 180, r0 = i % 5 ? 37 : 34, r1 = 40;
    const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    l.setAttribute('x1', (cx + Math.cos(a) * r0).toFixed(1)); l.setAttribute('y1', (cy - Math.sin(a) * r0).toFixed(1));
    l.setAttribute('x2', (cx + Math.cos(a) * r1).toFixed(1)); l.setAttribute('y2', (cy - Math.sin(a) * r1).toFixed(1));
    g.appendChild(l);
  }
}
let dialShown = -1;
function setDial(kmh, max) {
  const k = Math.round(Math.max(0, Math.min(1, kmh / Math.max(1, max))) * 200) / 2;
  if (k !== dialShown) { dialShown = k; $('rh-arc').style.strokeDashoffset = String(100 - k); }
}
// ?prof: time each loading step and each part of the frame (read with __gaon.prof())
const PROF = new URLSearchParams(location.search).has('prof');
const loadTimes = [['page start → modules loaded (incl. layout generation)', Math.round(performance.now())]]; let loadMark = performance.now();
// The loading bar on the start card: each step of the build, as it's reached, sends the bar on toward the
// next one, timed to how long that step usually takes (measured), so it keeps moving smoothly even while the
// page is too busy to draw anything else (the bar is a transform the browser animates on its own).
const LOAD_PLAN = [['modules', 1.9], ['Planting', 2.45], ['Letting', 2.62], ['Raising', 2.68], ['Laying', 3.28], ['railway', 3.68], ['Waking', 4.45],
  ['people', 7.3], ['passengers', 7.39], ['site/', 7.59], ['farm', 7.69], ['wildlife', 7.79], ['fish/', 7.9], ['lanterns/', 7.9], ['herds/', 8.0], ['hamlets', 8.33],
  ['shops', 8.53], ['shrine/', 8.83], ['Drawing', 8.83], ['Shaping', 8.88], ['terrain', 13.7], ['season', 13.85], ['freeze', 14.3], ['tiny-mesh', 15.05],
  ['shaders', 15.1], ['Almost', 15.1], ['first frames', 16.4], ['Begin', 16.4]];
const LOAD_T = LOAD_PLAN.at(-1)[1];
let loadStep = -1;
function loadProgress(name) {
  const i = LOAD_PLAN.findIndex(([k], j) => j > loadStep && name.startsWith(k));
  if (i < 0) return;
  loadStep = i;
  const fill = document.querySelector('.lb-fill'), rider = document.querySelector('.lb-rider');
  if (!fill) return;
  const last = i === LOAD_PLAN.length - 1;
  const next = last ? 1 : LOAD_PLAN[i + 1][1] / LOAD_T, dur = last ? 0.35 : Math.max(0.2, LOAD_PLAN[i + 1][1] - LOAD_PLAN[i][1]);
  for (const el of [fill, rider]) {
    if (el.style.animationName !== 'none') {
      // (taking over from the opening animation: hold it where it got to, then carry on from there)
      const m = new DOMMatrix(getComputedStyle(el).transform);
      el.style.animation = 'none';
      el.style.transform = el === fill ? `scaleX(${m.a})` : `translateX(${m.e}px)`;
      void el.offsetWidth;
    }
    el.style.transition = `transform ${dur}s linear`;
  }
  fill.style.transform = `scaleX(${next})`;
  rider.style.transform = `translateX(${(next * 100).toFixed(2)}%)`;
  // the number follows the bar itself, whenever the page has a moment to draw it
  if (!loadProgress.ticking) {
    loadProgress.ticking = true;
    const pct = document.querySelector('.lb-pct');
    const tick = () => {
      pct.textContent = `${Math.round(new DOMMatrix(getComputedStyle(fill).transform).a * 100)}%`;
      if (!document.body.classList.contains('ready')) requestAnimationFrame(tick); else pct.textContent = '100%';
    };
    requestAnimationFrame(tick);
  }
}
const status = (s) => {
  const t = performance.now(); loadTimes.push([s, Math.round(t - loadMark)]); loadMark = t;
  // the step under the bar; the button just says it's getting ready, till it is
  if (s === 'Begin the walk') $('start').textContent = s;
  else { const el = document.querySelector('.lb-step'); if (el) el.textContent = s; }
  loadProgress(s);
};
const lap = (name) => { const t = performance.now(); loadTimes.push(['  · ' + name, Math.round(t - loadMark)]); loadMark = t; loadProgress(name); };
loadProgress('modules');
const profAcc = new Map(); let profT = 0, profFrames = 0;
// (and the slowest frames, part by part: __gaon.prof().long)
const profCur = {}, profLong = [];
const mark = PROF ? (name) => { const t = performance.now(); profAcc.set(name, (profAcc.get(name) ?? 0) + (t - profT)); profCur[name] = +(t - profT).toFixed(1); profT = t; } : () => {};
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

// ---------------- renderer ----------------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false; // redrawn when needed (see the frame loop)
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 5000);

// ---------------- sky & light ----------------
const sky = new Sky();
sky.scale.setScalar(4000);
// the sky goes wherever the camera goes (out at the edge of the land you'd otherwise be outside it) and is
// always drawn first, behind everything, so its size never hides the far hills
sky.material.depthTest = false; sky.material.depthWrite = false; sky.renderOrder = -10; sky.frustumCulled = false;
// near a low sun the stock sky shader blows out into a flat white patch with a hard edge: roll the highlights
// off smoothly instead, and leave the white-hot core to the sun's own disc
sky.material.fragmentShader = sky.material.fragmentShader.replace('gl_FragColor = vec4( retColor, 1.0 );',
  'float skyPeak = max( retColor.r, max( retColor.g, retColor.b ) );\n\t\t\tretColor *= 1.0 / ( 1.0 + max( skyPeak - 0.62, 0.0 ) * 1.1 );\n\t\t\tgl_FragColor = vec4( retColor, 1.0 );');
scene.add(sky);
const nightSky = buildNightSky();
nightSky.visible = false;
scene.add(nightSky);
const clouds = buildClouds();
scene.add(clouds);
const rain = buildRain();
scene.add(rain);

const sunDir = new THREE.Vector3();
const sun = new THREE.DirectionalLight('#ffffff', 3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
// the shadowed square: 96 m across, its centre 12 m ahead of the boy toward where the camera looks — 60 m of
// shadows ahead (a bit more than the old 110 m square round him gave), sharper, and a quarter fewer things to draw
const SH = 48, SH_AHEAD = 12;
Object.assign(sun.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH, near: 1, far: 320 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight('#cfe0f0', '#7a6440', 1.2);
scene.add(hemi);
scene.fog = new THREE.FogExp2('#d9c7a8', 0.005);
// the sky lights the scene too (see realism.js), so the flat hemisphere fill is turned down to match
// (add ?plain to the address to switch the sky lighting and surface grain off, to compare or for a slow machine)
const REAL = !new URLSearchParams(location.search).has('plain');
const skyEnv = REAL ? createEnvironment(renderer, scene) : null;
const HEMI_K = REAL ? 0.85 : 1;

// ---------------- the day and the weather (see daycycle.js) ----------------
// Nothing changes by itself: the hour, the weather and the season stay exactly as chosen. T steps to the next
// time of day, J to the next weather, Y to the next season (or use the menus in the corner).
const clock = { hour: 17.35, dark: false, wx: 'clear', wxW: 0, wxWant: 'clear', wxChoice: 'clear', sig: '', envT: 0, envDir: new THREE.Vector3(), glow: -1 };
let ATMO = sampleAtmo(clock.hour, false, 'clear', 0);
let timeIdx = 2;
let soundChoice = 'auto';
const WY = () => WATER_Y + WATER.off;
// only the river (and its ghat and pool) holds water: low dry hollows elsewhere are just ground
const wet = (x, z) => riverDist(x, z) < RIVER_HALF + 3;
let tunnelK = 1;
let trackScene = null;
let herds = null, birds = null, hamlets = null, shrineLife = null, trackside = null, buffs = null, shops = null;
let stations = null, drv = null, drvLoco = null, drvView = 0;
let river, motes, train, flocks, people, animals, waterfall, lanterns, farm, fish, wild, map;
const scare = { shake: 0, cool: 0 };
let gearMode = 'none';
const storm = { on: false, next: 4, flash: 0, bolts: [], base: { hemiI: 1.3, exp: 0.6, fog: new THREE.Color('#d9c7a8'), cLit: new THREE.Color('#ffffff'), fogD: 0.003 } };
let windBase = 0.8;

// the sun itself: a soft glowing disc far off, so it rises from behind the hills and sinks behind them
const sunDisc = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.1, 'rgba(255,248,230,1)'); gr.addColorStop(0.125, 'rgba(255,215,160,0.3)');
  gr.addColorStop(0.3, 'rgba(255,180,110,0.07)'); gr.addColorStop(1, 'rgba(255,160,90,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
  sp.scale.setScalar(1500); sp.renderOrder = -1;
  scene.add(sp);
  return sp;
})();
const _tint = new THREE.Color();

function setTimeOfDay(t, say = true) {
  clock.hour = t.hour; clock.dark = !!t.dark; clock.envT = 0;
  if (say) toast(t.name);
}
function setWeatherChoice(c, say = true) {
  clock.wxChoice = clock.wxWant = c;
  $('wx').value = c;
  for (const b of document.querySelectorAll('#wxbar button')) b.classList.toggle('on', b.dataset.wx === c);
  if (say) toast(WEATHERS[c].name);
}
function tickClock(dt) {
  if (clock.wx !== clock.wxWant) { clock.wxW -= dt / 7; if (clock.wxW <= 0) { clock.wxW = 0; clock.wx = clock.wxWant; } }
  else clock.wxW = clock.wx === 'clear' ? 0 : Math.min(1, clock.wxW + dt / 12);
  ATMO = sampleAtmo(clock.hour, clock.dark, clock.wx, clock.wxW);
  applyAtmo(ATMO);
}
// every frame: the light, the sky, the haze — all the things that change smoothly
function applyAtmo(p) {
  const night = p.night, S = SEASONS[season] ?? SEASONS.spring;
  sky.visible = !night;
  nightSky.visible = night;
  sunDir.copy(p.lightDir);
  if (!night) {
    const u = sky.material.uniforms;
    u.turbidity.value = p.turb;
    u.rayleigh.value = p.ray;
    u.mieCoefficient.value = p.mie;
    u.mieDirectionalG.value = p.mieG;
    u.sunPosition.value.copy(p.sunDir);
  } else nightSky.material.uniforms.uMoonDir.value.copy(p.lightDir);
  nightSky.material.uniforms.uCloud.value = p.clouds;
  nightSky.material.uniforms.uMoon.value = p.dark ? 0 : 1;
  // the sun's disc: big and warm near the horizon, lost in the glare when high, hidden by heavy cloud
  {
    const el = p.sunElev, low = 1 - THREE.MathUtils.smoothstep(el, 10, 30);
    const op = THREE.MathUtils.smoothstep(el, -5, -1.5) * (0.35 + 0.65 * low) * Math.max(0, 1 - Math.max(0, p.clouds - 0.45) * 2.2);
    sunDisc.visible = op > 0.01;
    sunDisc.material.opacity = op;
    sunDisc.material.color.copy(p.sun).lerp(_tint.set('#ff5a1e'), low * (1 - THREE.MathUtils.smoothstep(el, 1, 12)) * 0.85).multiplyScalar(1.6);
    sunDisc.position.copy(camera.position).addScaledVector(p.sunDir, 4700);
    sunDisc.scale.setScalar(900 + low * 500);
  }
  sun.color.copy(p.sun);
  if (S.light && !night) sun.color.lerp(_tint.set(S.light), 0.35);
  hemi.color.copy(p.sky);
  hemi.groundColor.copy(p.ground);
  storm.base.hemiI = p.hemiI * HEMI_K; storm.base.exp = p.exp; storm.base.fog.copy(p.fog); storm.base.cLit.copy(p.cLit);
  storm.base.fogD = scene.fog.density = p.fogD * S.fog;
  windBase = p.wind;
  const cu = clouds.material.uniforms;
  cu.uCover.value = p.clouds;
  cu.uSpeed.value = p.cloudSpeed;
  cu.uShade.value.copy(p.cShade);
  cu.uOpacity.value = 0.9 + p.rain * 0.07;
  cu.uSunDir.value.copy(p.lightDir);
  rain.visible = p.rain > 0.02;
  rain.material.uniforms.uAmount.value = p.rain * 0.85;
  if (river) {
    const wu = river.material.uniforms;
    wu.uSunDir.value.copy(p.lightDir);
    wu.uSunColor.value.copy(night ? _tint.set('#c8d6f0') : p.sun);
    wu.uSky.value.copy(p.sky).multiplyScalar(0.9 - 0.55 * p.glow);
    wu.uHorizon.value.copy(p.fog);
    wu.uRain.value = p.rain;
    wu.uNight.value = p.glow * 0.85;
  }
  if (motes) {
    const mu = motes.material.uniforms, m = p.motes;
    if (S.leaves && !night && !p.rainy) {
      // autumn: drifting leaves instead of pollen
      mu.uColor.value.set('#e0862e'); mu.uIntensity.value = 0.9; mu.uDensity.value = 0.55; mu.uHeight.value = 7; mu.uSpeed.value = 2.2; mu.uSize.value = 2.6;
    } else {
      mu.uColor.value.copy(m.color);
      mu.uIntensity.value = m.i; mu.uDensity.value = m.density; mu.uHeight.value = m.height; mu.uSpeed.value = m.speed; mu.uSize.value = m.size;
    }
  }
  if (Math.abs(p.glow - clock.glow) > 0.02) {
    clock.glow = p.glow;
    setNightGlow(p.glow);
    if (lanterns) lanterns.on = p.glow > 0.6 ? 1 : 0;
  }
  setFoliageGlow((1 - 0.95 * p.glow) * (1 - 0.4 * Math.min(1, p.rain * 2)));
  bloom.strength = 0.28 + 0.22 * p.glow;
  // the sky's own light is re-baked when the sun has moved on a bit (or the look has drifted for a while)
  clock.envT -= 1 / 60;
  if (skyEnv && (clock.envT <= 0 || clock.envDir.angleTo(p.lightDir) > 0.06)) {
    clock.envT = 6; clock.envDir.copy(p.lightDir);
    skyEnv.update(p, p.lightDir);
    if (farm) farm.setTheme({ night, sky: p.sky });
    if (waterfall) waterfall.setTheme({ night, rain: p.rainy, sky: p.sky, sun: p.sun });
  }
  const dusky = p.glow > 0.3 && !night;
  const sig = `${night}|${dusky}|${p.rainy}|${p.storm}|${p.dark}|${p.sound}|${p.wind > 1.4}`;
  if (sig !== clock.sig) { clock.sig = sig; applyMoment(p, night, dusky); }
}
// only when something flips: night falls, the rain starts, a storm breaks
function applyMoment(p, night, dusky) {
  const rainy = p.rainy;
  if (train) train.setNight(night ? 1 : dusky ? 0.4 : 0);
  if (flocks) flocks.enabled = !night && !rainy && !p.storm;
  if (birds) birds.enabled = !p.storm && !rainy;
  herds?.setNight(night);
  buffs?.setNight(night);
  hamlets?.setNight(night);
  shops?.setNight(night);
  shrineLife?.setNight(night);
  helipad?.setNight(night);
  storm.on = p.storm;
  // weather & time-of-day touches: umbrellas in the rain, lanterns after dark, animals bedding down
  gearMode = rainy ? 'umbrella' : night ? 'lantern' : 'none';
  if (people) people.setWeather({ rain: rainy, night });
  workers?.setNight(night);
  site?.setWeather({ rain: rainy, night }); kites?.setWeather({ rain: rainy, night }); mela?.setWeather({ rain: rainy, night });
  boy.setGear(gearMode);
  if (animals) animals.setNight(night);
  if (wild) wild.setNight(night || dusky);
  if (train) {
    if (night) train.setSmokeColors('#7d8496', '#23252b');
    else if (dusky) train.setSmokeColors('#c9a796', '#3a2f2c');
    else if (rainy) train.setSmokeColors('#b4b7ba', '#3c3d3f');
    else train.setSmokeColors('#e2ddd4', '#3b3936');
    const w = p.wind * 1.6;
    train.setWind(w * 0.8, w * 0.5);
  }
  if (village) village.setSteamColor(night ? '#6c7488' : rainy ? '#c9ccce' : '#f4f2ee');
  applySound();
  $('atmo').value = p.key;
}
// ---------------- seasons: a separate switch from time-of-day and weather ----------------
const SEASONS = {
  spring: { name: 'Spring — lush and in flower', base: '#2f4a19', tip: '#a8d05a', dry: '#c9b46a', crop: '#a9b85a', flowers: 0.07, crops: 1, water: 0, fog: 1 },
  summer: { name: 'Summer — dry, the river runs low', base: '#4a5220', tip: '#c8bc62', dry: '#dcc274', crop: '#d8bc58', flowers: 0.006, crops: 1, water: -0.6, fog: 0.85, light: '#fff0d0' },
  monsoon: { name: 'Monsoon — rain, deep green, the river runs high', base: '#24451a', tip: '#7fbe44', dry: '#9fbe58', crop: '#86b84c', flowers: 0.02, crops: 1, water: 0.26, fog: 1.25, light: '#eef2f0' },
  autumn: { name: 'Autumn — harvest, falling leaves', base: '#45451f', tip: '#b8a050', dry: '#c89a50', crop: '#b89a5a', flowers: 0.01, crops: 0, water: -0.2, fog: 1.1, leaves: true },
  winter: { name: 'Winter — bare trees, misty mornings', base: '#4a4a34', tip: '#b8ae86', dry: '#c4b896', crop: '#9a9070', flowers: 0, crops: 0, water: -0.1, fog: 1.9, light: '#dde6f2' },
};
let season = 'spring';
function applySeason(quiet = false) {
  if (!SEASONS[season]) season = 'spring';
  const S = SEASONS[season];
  if (grass) {
    const u = grass.userData.uniforms;
    u.uBase.value.set(S.base); u.uTip.value.set(S.tip); u.uDry.value.set(S.dry); u.uCrop.value.set(S.crop);
    u.uFlowers.value = S.flowers; u.uCropOn.value = S.crops;
  }
  setFoliageSeason(season);
  if (farm) farm.setSeason(season);
  WATER.off = S.water;
  if (river) river.position.y = S.water;
  waterfall?.setRiverLevel(WATER_Y + S.water);
  $('season').value = season;
  if (!quiet) toast(S.name);
}
function applySound() {
  const theme = soundChoice === 'auto' ? ATMO.sound : soundChoice;
  audio.setTheme(theme);
}

// ---------------- post ----------------
const rt = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(renderer.getPixelRatio());
composer.addPass(new RenderPass(scene, camera));
// Scrub NaN/Inf pixels before bloom — a single bad pixel (degenerate normal,
// specular blow-out) otherwise smears through the bloom mip chain into a big
// black rectangle.
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0);
      gl_FragColor = vec4(clamp(c.rgb, 0.0, 60.0), clamp(c.a, 0.0, 1.0));
    }`,
}));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.28, 0.55, 0.92);
composer.addPass(bloom);
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5;
      float v = smoothstep(0.85, 0.25, length(d * vec2(1.1, 1.0)));
      c.rgb *= mix(0.72, 1.0, v);
      c.rgb *= vec3(1.03, 1.0, 0.95);
      gl_FragColor = c;
    }`,
}));
composer.addPass(new OutputPass());

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  dyn.ema = 16;
});

// ---------------- state ----------------
const boy = new Boy();
const audio = new Ambience();
boy.onStep = (run) => audio.footstep(run);
// what people call out appears as a quiet caption (there are no spoken voices)
let captionT = 0, captionTimer;
audio.onSay = (hi, roman) => {
  const now = performance.now();
  if (!started || now - captionT < 1800) return;
  captionT = now;
  const el = $('caption');
  el.innerHTML = '';
  const a = document.createElement('span'); a.className = 'cap-hi'; a.textContent = hi; el.append(a);
  if (roman) { const b = document.createElement('span'); b.className = 'cap-ro'; b.textContent = roman; el.append(b); }
  el.classList.add('show');
  clearTimeout(captionTimer);
  captionTimer = setTimeout(() => el.classList.remove('show'), 2600);
};
const startZ = 205; // out on the main road, short of the village: a quiet start, the village up ahead
const player = { x: roadX(startZ) + 4.6, z: startZ, y: 0, vy: 0, grounded: true, facing: Math.PI, speed: 0, dirX: 0, dirZ: -1 };
player.y = groundHeight(player.x, player.z);
let yaw = 0.25, pitch = 0.28, dist = 5.5, targetDist = 5.5;
const keys = {};
let grass, village, terrainObj;
let started = false;
let jumpQueued = false;
// rides: the bicycle parked by the road where the walk starts, and a battered old moped across the road
// a clear, level spot for a parked emergency vehicle near where it lives
function emergencySpot(kind) {
  const H = layout.hospital;
  const at = kind === 'ambulance' && H ? { x: H.x + Math.sin(H.rot) * 8, z: H.z + Math.cos(H.rot) * 8, rot: H.rot + Math.PI / 2 } : { x: TANK.x + 9, z: TANK.z + 6, rot: 0 };
  for (let d = 0; d < 46; d += 2) for (let a = 0; a < 6.28; a += 0.45) {
    const x = at.x + Math.cos(a) * d, z = at.z + Math.sin(a) * d;
    if (isFree(x, z, kind === 'firetruck' ? 4.4 : 3.2) && Math.abs(x - roadX(z)) > 6 && !fieldType(x, z) && trackDist(x, z) > 9 && riverDist(x, z) > RIVER_HALF + 6) return { x, z, rot: at.rot };
  }
  return at;
}
const vehicles = [
  { obj: new Bicycle(), name: 'bicycle', park: { x: roadX(startZ + 4) + 8, z: startZ + 4, rot: 0.4 }, walk: 5.5, run: 8.5, boost: 12.5, accel: 1.3, reach: 2.2, rad: 0.4, lean: 1,
    on: 'On the bicycle', off: 'Off the bicycle', help: [['E', 'get off'], ['B', 'bell'], ['L', 'lamp'], ['Shift', 'pedal harder']], ask: 'ride the bicycle' },
  { obj: new Moped(), name: 'moped', nitro: true, park: { x: layout.moped.x, z: layout.moped.z, rot: -0.6 }, walk: 9, run: 14, boost: 21, accel: 0.9, reach: 2.2, rad: 0.45, lean: 1,
    on: 'Phat-phat-phat… the old moped starts', off: 'Off the moped', help: [['E', 'get off'], ['B', 'horn'], ['Shift', 'faster'], ['N', 'nitro'], ['L', 'lights']], ask: 'ride the moped', flame: true },
  { obj: new AutoRickshaw(), name: 'auto', park: { x: layout.auto.x, z: layout.auto.z, rot: layout.auto.rot }, walk: 8.5, run: 13, boost: 19, accel: 0.8, reach: 2.8, rad: 0.75, lean: 0.2,
    four: true, wb: 1.6, rev: 3.5, probes: [-0.65, 0.6], exit: [-1.1, 0.2], box: [0, -0.1, 0.72, 1.3],
    on: 'Driving the auto rickshaw', off: 'Out of the auto', help: [['W', 'go'], ['S', 'brake / reverse'], ['A D', 'steer'], ['Shift', 'faster'], ['V', 'inside view'], ['E', 'get out'], ['B', 'horn'], ['L', 'lights']], ask: 'drive the auto rickshaw', flame: true },
  { obj: new Scooter(), name: 'scooter', park: { x: roadX(29) - 2.8, z: 29, rot: 2.6 }, walk: 8.5, run: 13, boost: 13, accel: 1.0, reach: 2.3, rad: 0.45, lean: 1, flame: false,
    on: 'On the scooter', off: 'Off the scooter', help: [['E', 'get off'], ['B', 'horn'], ['Shift', 'faster'], ['L', 'lights']], ask: 'ride the scooter' },
  { obj: new SmallCar(), name: 'car', nitro: true, park: { x: roadX(100) + 5, z: 100, rot: 0.1 }, walk: 12, run: 18, boost: 28, accel: 0.9, reach: 3.0, rad: 0.82, lean: 0.1, flame: true,
    four: true, wb: 2.05, rev: 4.5, probes: [-1.05, 0, 1.05], exit: [-1.2, 0], box: [0.33, 0, 0.8, 1.68],
    on: 'In the little car — vroom!', off: 'Out of the car', help: [['W', 'go'], ['S', 'brake / reverse'], ['A D', 'steer'], ['V', 'inside view'], ['E', 'get out'], ['B', 'horn'], ['N', 'nitro'], ['L', 'lights']], ask: 'drive the little car' },
  { obj: new MiniBus(), name: 'minibus', park: { x: roadX(84) - 4.9, z: 84, rot: 0 }, walk: 13.9, run: 22.2, boost: 22.2, accel: 0.75, reach: 4.2, rad: 1.12, lean: 0.04, flame: false,
    four: true, wb: 4.1, rev: 3.2, probes: [-2.4, -0.8, 0.8, 2.4], exit: [2.6, 2.3], box: [0.55, 0, 1.15, 3.35],
    on: 'The village minibus — stop at a 🚏 to pick people up (Shift for full speed, 80 km/h)', off: 'Out of the minibus', help: [['W', 'go'], ['S', 'brake / reverse'], ['A D', 'steer'], ['Shift', 'faster (80 km/h)'], ['V', 'inside view'], ['E', 'get out'], ['B', 'horn'], ['L', 'lights']], ask: 'drive the minibus' },
  { obj: Object.assign(new ERickshaw(), { fare0: 10, fareK: 2 }), name: 'erick', park: { x: roadX(62) - 4.3, z: 62, rot: 0 }, walk: 6.5, run: 9, boost: 13, accel: 0.75, reach: 2.8, rad: 0.62, lean: 0.15, flame: false,
    four: true, wb: 1.8, rev: 3, probes: [-0.95, 0.05, 0.95], exit: [-1.05, 0.5], box: [0, -0.15, 0.62, 1.42],
    on: 'The e-rickshaw — pick up to 4 riders at a 🚏 bus stop', off: 'Out of the e-rickshaw', help: [['W', 'go'], ['S', 'brake / reverse'], ['A D', 'steer'], ['Shift', 'faster'], ['V', 'inside view'], ['E', 'get out'], ['B', 'horn'], ['L', 'lights']], ask: 'drive the e-rickshaw' },
  // the emergency services: the 108 ambulance outside Chhota Gaon's hospital, the 101 fire tender by the
  // village water tank. B sets the siren going (the traffic ahead pulls over); B again stops it.
  { obj: new Ambulance(), name: 'ambulance', park: emergencySpot('ambulance'), walk: 11, run: 17, boost: 22, accel: 0.75, reach: 3.6, rad: 1.0, lean: 0.04, flame: false,
    four: true, wb: 3.3, rev: 3.5, probes: [-2.2, -0.8, 0.8, 2.2], exit: [-1.3, 0.9], box: [0.45, 0, 1.0, 2.6], sound: 'minibus', siren: true,
    shapeOver: { half: [1.0, 1.15, 2.6], com: [0.45, 1.2, 0], mass: 2600 },
    on: 'The 108 ambulance — B for the siren, and everyone makes way', off: 'Out of the ambulance', help: [['W', 'go'], ['S', 'brake / reverse'], ['A D', 'steer'], ['Shift', 'faster'], ['B', 'siren on / off'], ['L', 'lights'], ['E', 'get out']], ask: 'drive the ambulance' },
  { obj: new FireTruck(), name: 'firetruck', park: emergencySpot('firetruck'), walk: 10, run: 15, boost: 19, accel: 0.6, reach: 4.4, rad: 1.2, lean: 0.03, flame: false,
    four: true, wb: 4.65, rev: 3, probes: [-3.3, -1.2, 1.2, 3.3], exit: [-1.4, 2.2], box: [0.55, 0, 1.2, 3.75], sound: 'bus', siren: true,
    shapeOver: { half: [1.2, 1.45, 3.75], com: [0.55, 1.5, 0], mass: 9000 },
    on: 'The 101 fire tender — B for the siren and bell, hold K for the water cannon', off: 'Down from the fire tender', help: [['W', 'go'], ['S', 'brake / reverse'], ['A D', 'steer'], ['K', 'water cannon (hold)'], ['B', 'siren on / off'], ['L', 'lights'], ['E', 'climb down']], ask: 'drive the fire tender' },
  { obj: new RowBoat(), name: 'boat', water: true, park: { x: layout.boat.x, z: layout.boat.z, rot: layout.boat.rot }, walk: 1.8, run: 2.8, boost: 3.6, accel: 0.6, reach: 3.4, rad: 0.9, lean: 0,
    on: 'In the boat — row with W, A, D', off: 'Back on the bank', help: [['E', 'get out at a bank'], ['Shift', 'row harder']], ask: 'row the boat' },
];
// more autos and bikes parked about to pick from: a row in the mela's parking lot, and a few by the road
{
  const tpl = (name) => vehicles.find((v) => v.name === name);
  const add = (name, obj, x, z, rot) => vehicles.push({ ...tpl(name), obj, park: { x, z, rot } });
  const paint = (o, part, c) => { o.mats[part].color.set(c); return o; };
  const M = layout.mela;
  if (M) {
    const at = (lx, lz) => ({ x: M.x + lx * Math.cos(M.rot) + lz * Math.sin(M.rot), z: M.z - lx * Math.sin(M.rot) + lz * Math.cos(M.rot) });
    const nose = M.rot + Math.PI; // parked nose-in, toward the gate
    for (const [name, mk, lx, lz] of [
      ['auto', () => new AutoRickshaw(), -5.4, 28],
      ['auto', () => new AutoRickshaw({ body: '#1a1a1a', top: '#f0c419' }), -2.6, 28],
      ['car', () => new SmallCar('#e8e6e0'), 0.6, 28.3],
      ['auto', () => new AutoRickshaw({ body: '#2a6ad0', top: '#f2efe6' }), 4.2, 28],
      ['moped', () => paint(new Moped(), 'paint', '#2a5aa8'), -5.6, 32.8],
      ['scooter', () => new Scooter('#d8407a'), -4.3, 32.8],
      ['bicycle', () => new Bicycle(), -3.0, 32.8],
      ['moped', () => new Moped(), -1.7, 32.8],
      ['scooter', () => new Scooter('#f2efe6'), -0.4, 32.8],
      ['bicycle', () => paint(new Bicycle(), 'frame', '#2e6b4a'), 0.9, 32.8],
      ['scooter', () => new Scooter('#e8b020'), 2.2, 32.8],
    ]) { const p = at(lx, lz); add(name, mk(), p.x, p.z, nose); }
  }
  // a moped and a bicycle left by the square in each of the two ring-line villages
  for (const v of layout.newVillages ?? []) {
    const a = v.th + Math.PI * 0.5, cx = v.x + Math.cos(v.th) * 9, cz = v.z + Math.sin(v.th) * 9;
    add('moped', paint(new Moped(), 'paint', v.style === 'kutch' ? '#c4241c' : '#2a5aa8'), cx + Math.cos(a) * 1.2, cz + Math.sin(a) * 1.2, -v.th);
    add('bicycle', new Bicycle(), cx - Math.cos(a) * 1.2, cz - Math.sin(a) * 1.2, -v.th);
    // the canal villages have a row of them by the square
    // Naharpur, the bigger of the two, has a car, an auto and an e-rickshaw about the square too
    // the big villages out on the Seemant line: a car, an auto, a scooter and an e-rickshaw by the square
    if (v.big) {
      const bx = v.x - Math.cos(v.th) * 12, bz = v.z - Math.sin(v.th) * 12;
      add('car', new SmallCar(['#8a2a2a', '#2a6a8a', '#e8e4da'][Math.round(v.th * 10) % 3]), bx + Math.cos(a) * 3, bz + Math.sin(a) * 3, -v.th + Math.PI / 2);
      add('auto', new AutoRickshaw(), bx - Math.cos(a) * 3, bz - Math.sin(a) * 3, -v.th + Math.PI / 2);
      add('scooter', new Scooter(['#d8407a', '#e8b020', '#2a8a6a'][Math.round(v.th * 10) % 3]), cx + Math.cos(a) * 3.4, cz + Math.sin(a) * 3.4, -v.th);
      add('erick', Object.assign(new ERickshaw(), { fare0: 10, fareK: 2 }), bx + Math.cos(a) * 8, bz + Math.sin(a) * 8, -v.th + Math.PI / 2);
    }
    if (v.name === 'Naharpur') {
      const bx = v.x - Math.cos(v.th) * 9, bz = v.z - Math.sin(v.th) * 9;
      add('car', new SmallCar('#2a6a8a'), bx + Math.cos(a) * 2.5, bz + Math.sin(a) * 2.5, -v.th + Math.PI / 2);
      add('auto', new AutoRickshaw(), bx - Math.cos(a) * 2.5, bz - Math.sin(a) * 2.5, -v.th + Math.PI / 2);
    }
    if (v.canal) for (const [k, name, mk] of [[2.4, 'bicycle', () => paint(new Bicycle(), 'frame', '#2e6b4a')], [3.6, 'scooter', () => new Scooter('#e8b020')], [-2.4, 'moped', () => paint(new Moped(), 'paint', '#c4241c')], [-3.6, 'bicycle', () => new Bicycle()]])
      add(name, mk(), cx + Math.cos(a) * k, cz + Math.sin(a) * k, -v.th);
  }
  // an auto and an e-rickshaw waiting for fares at Naharpur station
  { const h = TRACKS.flatMap((T) => T.halts).find((o) => o.name === 'Naharpur' && o.yard); if (h) { const Y = h.yard; add('auto', new AutoRickshaw(), Y.x + 5, Y.z + 4, 0.6); add('erick', Object.assign(new ERickshaw(), { fare0: 10, fareK: 2 }), Y.x - 5, Y.z + 4, -0.6); } }
  // by the roadside, wherever the verge is clear
  for (const [name, mk, z, side] of [
    ['auto', () => new AutoRickshaw({ body: '#1a1a1a', top: '#f0c419' }), -42, 1],
    ['moped', () => paint(new Moped(), 'paint', '#3a3a3e'), 118, -1],
    ['scooter', () => new Scooter('#c8323a'), -64, -1],
    ['bicycle', () => new Bicycle(), 132, 1],
    ['auto', () => new AutoRickshaw({ body: '#2e8b57', top: '#f2efe6' }), 156, -1],
    ['scooter', () => new Scooter('#4a7ad0'), 6, -1],
  ]) {
    let ok = null;
    for (const dz of [0, 4, -4, 8, -8, 12]) {
      const zz = z + dz, x = roadX(zz) + side * 4.4;
      const p = { x, z: zz };
      resolveCollisions(p, 1.3, groundHeight(x, zz));
      if (Math.hypot(p.x - x, p.z - zz) > 0.01) continue;
      if (vehicles.some((v) => Math.hypot(v.park.x - x, v.park.z - zz) < 5)) continue;
      if ((layout.busStops || []).some((b) => Math.hypot(b.x - x, b.z - zz) < 8)) continue;
      ok = { x, z: zz }; break;
    }
    if (ok) add(name, mk(), ok.x, ok.z, Math.atan2(roadX(ok.z + 1) - roadX(ok.z), 1) + (side > 0 ? Math.PI : 0));
  }
}
// animals to ride: a decorated camel at Marudhar, and a temple elephant at Thennoor
{
  const rv = layout.rv, tv = layout.tv;
  if (rv) vehicles.push({ obj: new AnimalMount('camel'), name: 'camel', mount: true, park: { x: rv.x + 40.6, z: rv.z + 49.5, rot: 0.8 }, walk: 1.5, run: 3.0, boost: 4.6, accel: 0.45, reach: 2.4, rad: 0.7, lean: 0, flame: false,
    on: 'Up on the camel — W to walk on, Shift to trot', off: 'Down off the camel', ask: 'ride the camel', help: [['W', 'walk on'], ['Shift', 'trot'], ['A D', 'turn'], ['B', 'click to it'], ['E', 'climb down']] });
  if (tv) vehicles.push({ obj: new AnimalMount('elephant'), name: 'elephant', mount: true, park: { x: tv.x + 1, z: tv.z + 14, rot: -0.6 }, walk: 1.3, run: 2.4, boost: 3.2, accel: 0.35, reach: 3.2, rad: 1.15, lean: 0, flame: false,
    on: 'Up on the temple elephant — W to walk on, B for a trumpet', off: 'Down off the elephant', ask: 'ride the elephant', help: [['W', 'walk on'], ['Shift', 'a bit faster'], ['A D', 'turn'], ['B', 'trumpet'], ['E', 'climb down']] });
}
// nothing parked on the roadway: every ride left by a road or lane (the bikes, the scooter, the minibus, the
// e-rickshaw…) is moved back onto clear ground at the side, so the traffic has the whole road to itself
{
  const segD = (x, z, q) => { const vx = q.bx - q.ax, vz = q.bz - q.az, t = Math.max(0, Math.min(1, ((x - q.ax) * vx + (z - q.az) * vz) / (vx * vx + vz * vz || 1))); return Math.hypot(x - q.ax - vx * t, z - q.az - vz * t); };
  // how far inside the clear margin of the nearest road a spot is (≤ 0: clear), and the way out of it
  const intrude = (x, z, rad) => {
    let worst = -1e9, out = null;
    const need = rad + 1.6;
    const dm = 3.2 + need - Math.abs(x - roadX(z)); // the main road (about 6 m of roadway)
    if (dm > worst) { worst = dm; out = { x: Math.sign(x - roadX(z)) || 1, z: 0 }; }
    for (const q of lanes) {
      if (Math.abs(x - q.ax) > 80 && Math.abs(x - q.bx) > 80) continue;
      const d = q.w / 2 + 0.4 + need - segD(x, z, q);
      if (d > worst) { const vx = q.bx - q.ax, vz = q.bz - q.az, l = Math.hypot(vx, vz) || 1; let nx = -vz / l, nz = vx / l; if ((x - q.ax) * nx + (z - q.az) * nz < 0) { nx = -nx; nz = -nz; } worst = d; out = { x: nx, z: nz }; }
    }
    return { d: worst, out };
  };
  const okAt = (v, x, z) => {
    if (trackDist(x, z) < 7 || riverDist(x, z) < RIVER_HALF + 3 || canalDist(x, z) < CANAL.half + 3) return false;
    if (intrude(x, z, v.rad ?? 1).d > 0) return false;
    const p = { x, z }; resolveCollisions(p, (v.rad ?? 1) + 0.4, groundHeight(x, z));
    if (Math.hypot(p.x - x, p.z - z) > 0.01) return false;
    if (Math.abs(groundHeight(x + 1.5, z) - groundHeight(x - 1.5, z)) > 0.9 || Math.abs(groundHeight(x, z + 1.5) - groundHeight(x, z - 1.5)) > 0.9) return false;
    return !vehicles.some((o) => o !== v && Math.hypot(o.park.x - x, o.park.z - z) < (o.rad ?? 1) + (v.rad ?? 1) + 1.2);
  };
  for (const v of vehicles) {
    if (v.water || v.fly || !v.park) continue;
    const P = v.park, I = intrude(P.x, P.z, v.rad ?? 1);
    if (I.d <= 0) continue;
    // step straight back from the road first, then a little up or down it as well
    let best = null;
    for (let k = 1; k <= 14 && !best; k++) for (const along of [0, 3, -3, 6, -6]) {
      const ax = -I.out.z, az = I.out.x;
      const x = P.x + I.out.x * k + ax * along, z = P.z + I.out.z * k + az * along;
      if (okAt(v, x, z)) { best = { x, z }; break; }
    }
    if (best) { P.x = best.x; P.z = best.z; }
  }
}
// the little plane, parked at the near end of the airstrip with its nose down the runway
const AS = layout.airstrip;
const planeFlight = new Flight(), heliFlight = new HeliFlight();
let flight = planeFlight; // whichever flying machine the boy is in
let planeV = null, heliV = null, helipad = null;
if (AS) {
  const end = AS.home ?? -1, lz = end * (AS.len / 2 - 16);
  const home = { x: AS.x + lz * Math.sin(AS.rot), z: AS.z + lz * Math.cos(AS.rot), rot: AS.rot + (end > 0 ? Math.PI : 0) };
  planeV = { obj: new Plane(), name: 'plane', fly: true, home, park: { ...home }, walk: 0, run: 0, boost: 0, accel: 1, reach: 3.4, rad: 1.0, lean: 0,
    box: [-0.3, -1.3, 0.72, 4.0], exit: [1.3, 0.9],
    on: 'In the cockpit ✈  Hold R for power, then S to lift off — H shows all the controls', off: 'Out of the plane',
    help: [['R F', 'power'], ['S W', 'nose up · down'], ['A D', 'bank · steer'], ['Z X', 'rudder'], ['G', 'gear'], ['L', 'flaps'], ['Space', 'brakes'], ['P', 'autopilot'], ['B', 'smoke'], ['V', 'cockpit'], ['E', 'get out']],
    ask: 'fly the plane ✈' };
  vehicles.push(planeV);
  // the helicopter on its pad across the strip
  if (AS.pad) {
    const home = { x: AS.pad.x, z: AS.pad.z, rot: AS.rot + (end > 0 ? Math.PI : 0) };
    heliV = { obj: new Helicopter(), name: 'heli', fly: true, heli: true, home, park: { ...home }, walk: 0, run: 0, boost: 0, accel: 1, reach: 3.0, rad: 1.0, lean: 0,
      box: [-0.32, -1.6, 0.95, 3.6], exit: [1.5, 0.7],
      on: 'In the helicopter 🚁  The rotor is spinning up — then hold R to lift off', off: 'Out of the helicopter',
      help: [['R', 'up'], ['F', 'down'], ['W S', 'forward · back'], ['A D', 'turn'], ['Z X', 'slide sideways'], ['V', 'cockpit'], ['K', 'hover assist'], ['E', 'get out']],
      ask: 'fly the helicopter 🚁' };
    vehicles.push(heliV);
  }
}
let airstrip = null;
let boostFx = 0;
// four-wheelers drive like real ones: W throttle, S brake then reverse, A/D turn the front wheels
const drive = { v: 0, steer: 0, brake: false };
let passengers = null;
let site = null, kites = null, mela = null;
let goodsYards = null, workers = null, postcards = null, cricket = null, shrineBusSeen = false, boatHudT = 0, fire = null;
const nitro = { fuel: 1, on: false, locked: false };
const flames = new Puffs({ max: 160, color: '#9fd0ff', dark: '#ff7a1a', opacity: 0.9, additive: true, buoyancy: 0.3, drag: 3 });
scene.add(flames.mesh);
const dust = new Puffs({ max: 120, color: '#c8a77a', dark: '#a8875a', opacity: 0.45, buoyancy: 0.2, drag: 1.8 });
scene.add(dust.mesh);
let sirenT = 0;
let ridePromptT = 0, ridePitch = 0, rideRoll = 0;
// headlights: L switches them on and off on anything with wheels. The lamps glow, and a real beam lights the road.
const lamps = { on: false };
const headlight = new THREE.SpotLight('#fff0cf', 0, 80, 0.5, 0.75, 1.3);
headlight.position.set(0, 0.8, 0.9);
headlight.target.position.set(0, -0.6, 16);
boy.root.add(headlight, headlight.target);
function toggleLamps() {
  if (!ride || ride.fly || ride.water) return;
  lamps.on = !lamps.on;
  audio.tink(0.4);
  toast(lamps.on ? 'Headlights on' : 'Headlights off');
}
let ride = null, bikeRoll = 0, bikeSteer = 0, lastFacing = 0, autoYaw = 0;
const mopedSmoke = new Puffs({ max: 80, color: '#9a9690', dark: '#4a4744', opacity: 0.55, buoyancy: 0.4, drag: 1.2 });
scene.add(mopedSmoke.mesh);
let mopedAcc = 0;
// a vehicle's wheels, measured once (three or more: the two-wheelers lean on their stand instead)
const rigOf = (v) => (v.rig === undefined ? (v.rig = v.water || v.fly ? null : wheelRig(v.obj.root, v.obj.wheels ?? v.obj.veh?.wheels)) : v.rig);
const _pose = { y: 0, pitch: 0, roll: 0 };
function parkVehicle(v, x, z, rot) {
  scene.attach(v.obj.root);
  v.obj.root.position.set(x, v.water ? WY() : groundHeight(x, z), z);
  v.obj.root.rotation.set(0, rot, v.lean ? -0.1 : 0);
  v.park.x = x; v.park.z = z; v.park.rot = rot;
  // standing on a slope: tilted to the ground, every wheel down on it
  const rig = rigOf(v);
  if (rig) {
    const y0 = v.obj.root.position.y;
    groundPose(rig, x, z, rot, (gx, gz) => groundHeight(gx, gz, y0 + 1), _pose);
    v.obj.root.rotation.set(_pose.pitch, rot, _pose.roll, 'YXZ');
    v.obj.root.position.y = _pose.y + settleWheels(rig, _pose.y, _pose.pitch, _pose.roll);
  }
}
// what a parked vehicle blocks: a box for the four-wheelers, a small circle for the two-wheelers
function parkedShape(v) {
  if (v.box) {
    const [lx, lz, hw, hd] = v.box, r = v.park.rot;
    return { kind: 'b', x: v.park.x + lx * Math.cos(r) + lz * Math.sin(r), z: v.park.z - lx * Math.sin(r) + lz * Math.cos(r), rot: r, hw, hd };
  }
  return { kind: 'c', x: v.park.x, z: v.park.z, r: { moped: 0.45 }[v.name] ?? 0.3 };
}
// the vehicles nearest the boy, as boxes on the ground, for the grass to lie flat under (see grass.js)
const _press = [];
function grassPressers() {
  _press.length = 0;
  const near = (x, z) => Math.abs(x - player.x) + Math.abs(z - player.z) < 70;
  if (ride && ride.box && !ride.water && !ride.fly) {
    const [lx, lz, hw, hd] = ride.box, r = player.facing;
    _press.push({ x: player.x + lx * Math.cos(r) + lz * Math.sin(r), z: player.z - lx * Math.sin(r) + lz * Math.cos(r), rot: r, hw, hd, d: 0 });
  }
  for (const v of vehicles) if (v !== ride && v.box && !v.water && !v.fly && !v.crash && near(v.park.x, v.park.z)) { const b = parkedShape(v); b.d = Math.hypot(b.x - player.x, b.z - player.z); _press.push(b); }
  for (const t of people.travellers.list) {
    if (t.taken || t.crash || !t.holder.visible || !(t.veh || t.kind === 'cart') || !near(t.p.x, t.p.z)) continue;
    _press.push({ x: t.p.x, z: t.p.z, rot: t.heading, hw: t.veh ? t.veh.half : 0.9, hd: t.veh ? t.veh.len / 2 : 2.6, d: Math.hypot(t.p.x - player.x, t.p.z - player.z) });
  }
  return _press.sort((a, b) => a.d - b.d);
}
const nearVehicle = () => vehicles.find((v) => v !== ride && !v.crash && Math.hypot(player.x - v.park.x, player.z - v.park.z) < v.reach);
// stepping out of the boat: find a bit of dry bank close by
function bankNear() {
  for (const r of [1.6, 2.4, 3.2, 4.2, 5.4, 6.8]) for (let i = 0; i < 16; i++) {
    const a = (i / 12) * Math.PI * 2, x = player.x + Math.sin(a) * r, z = player.z + Math.cos(a) * r;
    const g = groundHeight(x, z);
    if (g > WY() + 0.05 && g < WY() + 1.6) return { x, z, a };
  }
  return null;
}
function toggleRide() {
  if (drv) { stopDriving(); return; }
  if (!ride && !swim.on) { const ct = !nearVehicle() ? nearCab() : null; if (ct) { startDriving(ct); return; } }
  if (ride) {
    const v = ride;
    if (v.fly) {
      if (flight.crashed) return;
      if (!flight.ground || Math.abs(flight.v) > 2.5) { toast('Land and stop first — no jumping out up here!'); return; }
      if (flight.gear < 0.9) { toast('Put the wheels down first (G)'); return; }
      flight.engine = false; flyView = 0; flyFx.ap = false;
      audio.setPlane(false); audio.setHeli(false, 0);
    }
    if (v.water) {
      const b = bankNear();
      if (!b) { toast('Row closer to the bank to get out'); return; }
      ride = null;
      parkVehicle(v, player.x, player.z, player.facing);
      player.x = b.x; player.z = b.z; player.y = groundHeight(b.x, b.z);
      player.facing = b.a;
    } else {
      ride = null;
      if (v.siren && v.obj.siren) { v.obj.siren = false; audio.setSiren(v.name, false); }
      const [ex, ez] = v.exit ?? [-0.6, 0];
      const lx = Math.cos(player.facing), lz = -Math.sin(player.facing), fx = Math.sin(player.facing), fz = Math.cos(player.facing);
      parkVehicle(v, player.x, player.z, player.facing);
      player.x += lx * ex + fx * ez; player.z += lz * ex + fz * ez;
      drive.v = 0; drive.steer = 0;
    }
    boy.root.rotation.z = 0;
    boy.root.rotation.x = 0;
    ridePitch = 0;
    player.speed = 0;
    toast(v.off);
  } else {
    let v = nearVehicle();
    if (!v && !swim.on) { const t = nearTraffic(); if (t) v = takeTraffic(t); }
    if (!v || (swim.on && !v.water)) return;
    swim.on = false;
    ride = v;
    player.x = v.park.x; player.z = v.park.z;
    player.facing = v.obj.root.rotation.y;
    lastFacing = player.facing;
    // (carrying on from how it stood: no jolt as you climb in)
    if (rigOf(v)) { ridePitch = v.obj.root.rotation.x; rideRoll = v.obj.root.rotation.z; player.y = v.obj.root.position.y; }
    boy.root.add(v.obj.root);
    v.obj.root.position.set(0, 0, 0);
    v.obj.root.rotation.set(0, 0, 0);
    if (v.water) player.y = WY();
    drive.v = 0; drive.steer = 0;
    if (v.siren) audio.busHorn(0.5); else hornFor(v); // (a toot on climbing in; the siren waits for B)
    ridePromptT = 4;
    toast(v.on);
    lamps.on = !v.fly && !v.water && ATMO.glow > 0.5; // getting in after dark, the lights come on with the engine
    if (v.fly) {
      flight = v.heli ? heliFlight : planeFlight;
      flight.reset(player.x, groundHeight(player.x, player.z), player.z, player.facing);
      flight.engine = true;
      yaw = player.facing + Math.PI; pitch = 0.22;
      // the engine coughs into life
      const ex = v.obj.root.localToWorld(tmp.copy(v.obj.exhaust));
      for (let i = 0; i < 10; i++) mopedSmoke.emit(ex.x, ex.y, ex.z, (Math.random() - 0.5) * 0.8, 0.4 + Math.random() * 0.4, (Math.random() - 0.5) * 0.8, 2, 0.2, 1.4, 0.7, 0.2);
    }
  }
}
// Honk, and whoever is on the road ahead gets out of the way: people step off to the nearer side, and traffic
// going either way pulls over to its edge and slows to let the boy through.
let wayCool = 0;
let friends = null; // (the people walking with the boy, see friends.js)
let drvBlockT = 0;
function makeWay() {
  if (!started || performance.now() - wayCool < 600) return;
  wayCool = performance.now();
  const fx = Math.sin(player.facing), fz = Math.cos(player.facing);
  const reach = 14 + player.speed * 2.5, half = (ride?.box ? ride.box[2] : 0.6) + 1.4;
  for (const h of hitList) {
    const dx = h.x - player.x, dz = h.z - player.z, along = dx * fx + dz * fz, side = dx * fz - dz * fx;
    if (along < 1 || along > reach || Math.abs(side) > half + 0.8) continue;
    if (h.person.atStop || h.person.friend) continue; // waiting under the bus shelter (or walking with the boy): they stay put
    const sd = side >= 0 ? 1 : -1, need = half + 1.2 - Math.abs(side);
    h.person.dodge(fz * sd * need, -fx * sd * need, 3.5 + along / 10);
  }
  for (const t of people.travellers.list) {
    if (t.taken || t.crash || !t.holder.visible || t.kind === 'walker') continue;
    const dx = t.p.x - player.x, dz = t.p.z - player.z, along = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
    if (along > 0 && along < reach + 15 && side < 6) t.yieldT = 6;
  }
}
// a vehicle's footprint relative to its driver: how far it reaches forward and back, and its half-width
function reachOf(v) {
  if (v.probes) return { fr: Math.max(...v.probes) + v.rad * 0.6, bk: Math.min(...v.probes) - v.rad * 0.6, w: v.box ? v.box[2] : v.rad };
  return { fr: 0.9, bk: -0.9, w: 0.25 };
}
// how steep a slope each kind can climb (rise over run)
const CLIMB = { camel: 0.5, elephant: 0.45, police: 0.65, cart: 0.32, tonga: 0.36, tractor: 0.6, bus: 0.38, minibus: 0.4, erick: 0.38, auto: 0.45, car: 0.5, jeep: 0.65, bicycle: 0.42, moped: 0.6, scooter: 0.55 };
function hornFor(v) {
  if (v.siren) {
    v.obj.siren = !v.obj.siren;
    audio.setSiren(v.name, v.obj.siren);
    if (v.obj.siren) { makeWay(); if (v.name === 'firetruck') audio.bell(0.7); toast(v.name === 'ambulance' ? 'Siren on — make way! 🚑' : v.name === 'police' ? 'Siren on — police coming through! 🚓' : 'Siren on — the fire tender is coming through! 🚒'); }
    else toast('Siren off');
    return;
  }
  if (v.name === 'bicycle') audio.cycleBell();
  else if (v.name === 'moped') audio.mopedHorn();
  else if (v.name === 'scooter') audio.scooterHorn();
  else if (v.name === 'car') audio.carHorn();
  else if (v.name === 'auto') audio.bulbHorn();
  else if (v.name === 'minibus') audio.busHorn(1);
  else if (v.name === 'erick') audio.erickHorn();
  else if (v.name === 'bus') audio.busHorn(1);
  else if (v.name === 'jeep') audio.jeepHorn(1);
  else if (v.name === 'cart') audio.cowbell(1);
  else if (v.name === 'tonga') audio.cowbell(0.7);
  else if (v.name === 'tractor') audio.jeepHorn(0.9);
  else if (v.name === 'camel') audio.camel(0.8);
  else if (v.name === 'elephant') audio.trumpet(0);
  if (v.name !== 'boat') makeWay();
}

// ---------------- taking any vehicle off the road ----------------
// Every bicycle, moped, scooter, bus and jeep going along the roads can be taken: walk up to it, press E, and
// the rider climbs off (not very happily) and waits at the roadside. Park it back near him and walk off and he
// rides away again; leave it anywhere far away and it finds its own way home.
const TAKE_TPL = {
  bus: { walk: 13, run: 22.2, boost: 22.2, accel: 0.65, reach: 5, rad: 1.25, lean: 0.03, flame: false,
    four: true, wb: 5.5, rev: 3, probes: [0.4, -1.6, -3.6, -5.6, -7.6], exit: [-1.6, 0.3], box: [0.6, -3.6, 1.25, 4.55],
    shapeOver: { half: [1.25, 1.5, 4.5], com: [0.6, 1.6, -3.6] },
    off: 'Off the bus', help: [['W', 'go'], ['S', 'brake / reverse'], ['A D', 'steer'], ['Shift', 'faster (80 km/h)'], ['V', 'inside view'], ['E', 'get out'], ['B', 'horn'], ['L', 'lights']], ask: 'drive the bus' },
  jeep: { walk: 11, run: 16, boost: 24, accel: 0.8, reach: 3, rad: 0.92, lean: 0.08, flame: true,
    four: true, wb: 2.45, rev: 4, probes: [-1.6, 0.1, 1.7], exit: [-1.3, 0], box: [0.38, 0.13, 0.92, 2.15],
    shapeOver: { half: [0.9, 0.9, 2.1], com: [0.38, 1.0, 0.13] },
    off: 'Out of the jeep', help: [['W', 'go'], ['S', 'brake / reverse'], ['A D', 'steer'], ['Shift', 'faster'], ['V', 'inside view'], ['E', 'get out'], ['B', 'horn'], ['L', 'lights']], ask: 'drive the jeep' },
};
// the bullock cart: slow, wide-turning, the bullocks' pace; and a car taken from the road
TAKE_TPL.cart = { walk: 1.5, run: 2.3, boost: 2.3, accel: 0.45, reach: 3.6, rad: 0.95, lean: 0.02, flame: false,
  four: true, wb: 3.8, rev: 0.8, probes: [3.3, 1.6, 0, -1.4], exit: [-1.3, 0.2], box: [0, 0.5, 0.95, 3.4],
  shapeOver: { half: [0.95, 0.9, 3.3], com: [0, 0.9, 0.5] },
  off: 'Off the bullock cart', help: [['W', 'gee up'], ['S', 'whoa · back'], ['A D', 'steer'], ['V', 'view'], ['E', 'get down'], ['B', 'bell']], ask: 'drive the bullock cart' };
TAKE_TPL.car = { walk: 12, run: 18, boost: 28, accel: 0.9, reach: 3.0, rad: 0.82, lean: 0.1, flame: true, nitro: true,
  four: true, wb: 2.05, rev: 4.5, probes: [-0.9, 0.15, 1.2], exit: [-1.2, 0], box: [0.33, 0.15, 0.8, 1.68],
  shapeOver: { half: [0.78, 0.7, 1.65], com: [0.33, 0.7, 0.15] },
  off: 'Out of the car', help: [['W', 'go'], ['S', 'brake / reverse'], ['A D', 'steer'], ['V', 'inside view'], ['E', 'get out'], ['B', 'horn'], ['N', 'nitro'], ['L', 'lights']], ask: 'drive the car' };
// the tonga: a horse cart, light and quick — a brisk trot, a canter with Shift (much faster than the bullocks)
TAKE_TPL.tonga = { walk: 3.6, run: 6.5, boost: 6.5, accel: 0.7, reach: 3.2, rad: 0.85, lean: 0.03, flame: false, sound: 'cart',
  four: true, wb: 2.4, rev: 1.2, probes: [3.1, 1.6, 0, -1.1], exit: [-1.2, 0.3], box: [0, 1.05, 0.88, 2.45],
  shapeOver: { half: [0.88, 1.0, 2.4], com: [0, 0.9, 1.05], mass: 520 },
  off: 'Down from the tonga', help: [['W', 'trot on'], ['Shift', 'canter'], ['S', 'whoa · back'], ['A D', 'steer'], ['V', 'view'], ['E', 'get down'], ['B', 'bell']], ask: 'drive the tonga' };
// tractors: slow and strong, a deep diesel thump, and with a trolley behind a long load to steer round the bends
function tractorTpl(veh) {
  const fr = 1.55 + 0.62, bk = (veh.trolley ? -5.4 : -1.4) + 0.62, ps = [fr - 0.3, 0.6, -0.8];
  if (veh.trolley) ps.push(-2.3, -3.6, bk + 0.5);
  return { walk: 4.5, run: 7.5, boost: 7.5, accel: 0.55, reach: 3.2, rad: 1.0, lean: 0.03, flame: false, sound: 'bus',
    four: true, wb: 2.2, rev: 2.5, probes: ps, exit: [-1.25, 0.2], box: [0, (fr + bk) / 2, 1.05, (fr - bk) / 2], tractor: true,
    shapeOver: { half: [1.05, 1.1, (fr - bk) / 2], com: [0, 1.0, (fr + bk) / 2], mass: veh.trolley ? 4200 : 2600 },
    off: 'Down from the tractor', help: [['W', 'go'], ['S', 'brake / reverse'], ['A D', 'steer'], ['Shift', 'faster'], ['V', 'view'], ['L', 'lights'], ['E', 'get down'], ['B', 'horn']], ask: veh.trolley ? 'drive the tractor and trolley' : 'drive the tractor' };
}
TAKE_TPL.tractor = tractorTpl({ trolley: true });
// a bullock cart standing by the road just short of the village, where the walk starts
vehicles.push({ ...TAKE_TPL.cart, name: 'cart', obj: new TakenVehicle(makeBullockCart('#d8cfc0')), park: { x: roadX(startZ - 16) - 11, z: startZ - 16, rot: Math.PI },
  on: 'Up on the bullock cart — W to gee up, S to whoa', off: 'Off the bullock cart', ask: 'drive the bullock cart' });
// tractors to drive: one by the village fields, one with a trolley of hay by the road; more out in the farming
// villages (see below)
{
  const addTr = (o, x, z, rot, on) => { const veh = makeTractor(o); vehicles.push({ ...tractorTpl(veh), name: 'tractor', obj: new TakenVehicle(veh), park: { x, z, rot }, on }); };
  addTr({ color: '#c0281e' }, roadX(startZ + 18) - 4.8, startZ + 18, Math.PI, 'On the tractor — W to go, it pulls anything (Shift for its top gear)');
  addTr({ color: '#2a5a9a', trolley: true, load: 'hay', trolleyColor: '#c4241c' }, roadX(startZ + 40) - 4.8, startZ + 40, Math.PI, 'Tractor and trolley, loaded with hay — swing wide round the bends!');
  for (const v of layout.newVillages ?? []) {
    if (!(v.big || v.style === 'punjab' || v.canal)) continue;
    const a = v.th + Math.PI * 0.5, d = v.big ? 22 : 16, x = v.x + Math.cos(v.th + Math.PI) * d + Math.cos(a) * 5, z = v.z + Math.sin(v.th + Math.PI) * d + Math.sin(a) * 5;
    addTr({ color: ['#c0281e', '#2a5a9a', '#2e7a3a', '#e07a1e'][Math.round(v.th * 7) % 4], trolley: v.big, load: ['hay', 'cane', 'bricks'][Math.round(v.th * 5) % 3], trolleyColor: '#3a5a3a' }, x, z, -v.th, 'On the tractor — W to go');
  }
}
// and a tonga waiting a little further along, its horse swishing its tail
vehicles.push({ ...TAKE_TPL.tonga, name: 'tonga', obj: new TakenVehicle(makeTonga('#7a4a2a', '#2a2a2a')), park: { x: roadX(startZ - 34) - 4.6, z: startZ - 34, rot: Math.PI },
  on: 'Up on the tonga — W to trot, Shift to canter, S to whoa', off: 'Down from the tonga', ask: 'drive the tonga' });
// the police jeep at each thana, ready to drive (B: siren and lights, and the traffic makes way)
for (const B of layout.police ?? []) {
  vehicles.push({ ...TAKE_TPL.jeep, name: 'police', obj: new TakenVehicle(new PoliceJeep()), park: { x: B.jeep.x, z: B.jeep.z, rot: B.jeep.rot }, siren: true, sound: 'jeep',
    on: `The ${B.name} police jeep — B for the siren and lights`, off: 'Out of the police jeep', ask: 'drive the police jeep',
    help: [['W', 'go'], ['S', 'brake / reverse'], ['A D', 'steer'], ['Shift', 'faster'], ['B', 'siren on / off'], ['V', 'inside view'], ['L', 'lights'], ['E', 'get out']] });
}
const TAKE_NAME = { bicycle: 'bicycle', moped: 'motorbike', scooter: 'scooter', bus: 'bus', jeep: 'jeep', cart: 'bullock cart', car: 'car', tonga: 'tonga', tractor: 'tractor' };
const TAKE_SHOUT = {
  bicycle: [['अरे! मेरी साइकिल!', 'Arey! Meri cycle!'], ['ओ भाई, साइकिल वापस लाना!', 'O bhai, cycle vaapas laana!']],
  moped: [['अरे! मेरी गाड़ी!', 'Arey! Meri gaadi!'], ['ओए! धीरे चलाना!', 'Oye! Dheere chalaana!']],
  scooter: [['अरे! मेरा स्कूटर!', 'Arey! Mera scooter!'], ['संभाल के चलाना बेटा!', 'Sambhaal ke chalaana beta!']],
  bus: [['अरे! बस कहाँ ले जा रहे हो?', 'Arey! Bus kahaan le ja rahe ho?'], ['सवारियाँ बैठी हैं, ध्यान से!', 'Savaariyaan baithi hain, dhyaan se!']],
  jeep: [['ओ! मेरी जीप!', 'O! Meri jeep!'], ['अरे रुको! जीप मेरी है!', 'Arey ruko! Jeep meri hai!']],
  car: [['अरे! मेरी गाड़ी!', 'Arey! Meri gaadi!'], ['रुको! गाड़ी मेरी है!', 'Ruko! Gaadi meri hai!']],
  cart: [['अरे! मेरे बैल!', 'Arey! Mere bail!'], ['धीरे हाँकना, बैल थके हैं!', 'Dheere haankna, bail thake hain!']],
  tonga: [['अरे! मेरा ताँगा!', 'Arey! Mera taanga!'], ['घोड़ा तेज़ है, संभाल के!', 'Ghoda tez hai, sambhaal ke!']],
  tractor: [['अरे! मेरा ट्रैक्टर!', 'Arey! Mera tractor!'], ['ट्रॉली भरी है, धीरे!', 'Trolley bhari hai, dheere!']],
};
const robbed = [];
const takeKind = (t) => (t.kind === 'bike' ? t.bike.kind : t.veh?.kind === 'car' ? 'car' : t.tonga ? 'tonga' : t.tractor ? 'tractor' : t.kind);
function nearTraffic() {
  if (!people || ride || swim.on) return null;
  let best = null, bd = 1e9;
  for (const t of people.travellers.list) {
    if (t.taken || t.crash || !t.holder.visible || !(t.kind === 'bike' || t.kind === 'bus' || t.kind === 'jeep' || t.kind === 'cart')) continue;
    const dx = player.x - t.p.x, dz = player.z - t.p.z;
    if (Math.abs(dx) + Math.abs(dz) > 12) continue;
    const c = Math.cos(t.heading), sn = Math.sin(t.heading);
    const ax = dx * sn + dz * c, lat = Math.abs(dx * c - dz * sn); // along and across the vehicle
    const hl = t.veh ? t.veh.len / 2 + 0.8 : 1.4, hw = t.veh ? t.veh.half + 1.3 : 1.3;
    if (Math.abs(ax) > hl || lat > hw) continue;
    const d = Math.hypot(dx, dz);
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}
// what the boy can get on right now: a parked ride, or else something on the road
function nearRide() {
  const v = nearVehicle();
  if (v) return v;
  const t = nearTraffic();
  return t ? { ask: `take the ${TAKE_NAME[takeKind(t)]}`, traffic: t } : null;
}
function takeTraffic(t) {
  const kind = takeKind(t), name = TAKE_NAME[kind];
  t.holder.updateMatrixWorld(true);
  let v;
  if (t.kind === 'bike') {
    v = { ...vehicles.find((o) => o.name === kind), obj: t.bike, park: { x: t.p.x, z: t.p.z, rot: t.heading } };
  } else {
    const seat = t.holder.localToWorld(t.veh.driverSeat.clone());
    v = { ...(kind === 'tractor' ? tractorTpl(t.veh) : TAKE_TPL[kind]), name: kind, obj: new TakenVehicle(t.veh, t.riders), park: { x: seat.x, z: seat.z, rot: t.heading } };
    if (t.riders.length) v.on = `You took the ${name} — ${t.riders.length} passengers still aboard!`;
  }
  v.on = v.on && t.kind !== 'bike' ? v.on : `You took the ${name}! The owner waits by the road — bring it back to him`;
  v.crash = null; v.taken = t;
  // the rider climbs off and stands at the roadside, cross
  const owner = t.person;
  const fx = Math.sin(t.heading), fz = Math.cos(t.heading), lx = Math.cos(t.heading), lz = -Math.sin(t.heading);
  const out = t.veh ? t.veh.half + 0.9 : 1.1, ahead = t.veh ? t.veh.len * 0.3 : 0.4;
  const ox = t.p.x + lx * out + fx * ahead, oz = t.p.z + lz * out + fz * ahead;
  scene.attach(owner.root);
  owner.root.position.set(ox, groundHeight(ox, oz), oz);
  owner.root.rotation.set(0, Math.atan2(player.x - ox, player.z - oz), 0);
  owner.body.position.z = 0; owner.torso.rotation.y = 0;
  const r = { t, v, owner, angry: 7, prevHook: owner.poseHook, home: { x: ox, z: oz } };
  owner.poseHook = (P, tt) => {
    if (r.angry > 0) { P.sh1 = -2.5 + Math.sin(tt * 9) * 0.35; P.el1 = -0.5; P.shz1 = -0.15; P.sh0 = -0.3; P.el0 = -1.5; P.shz0 = 0.55; P.headX = -0.1; }
    else { P.sh0 = P.sh1 = -0.2; P.el0 = P.el1 = -1.5; P.shz0 = 0.6; P.shz1 = -0.6; } // hands on hips, waiting
  };
  for (let i = 0; i < 4; i++) owner.update(0.4, 0, 'idle');
  t.taken = true; t.holder.visible = false; t.speed = 0;
  vehicles.push(v);
  parkVehicle(v, v.park.x, v.park.z, v.park.rot);
  robbed.push(r);
  const [hi, ro] = pick(TAKE_SHOUT[kind]);
  setTimeout(() => audio.say(hi, { roman: ro, pitch: 1.0 + Math.random() * 0.3, rate: 1.15 }), 350);
  return v;
}
function giveBack(r, nearOwner) {
  const { t, v, owner } = r;
  vehicles.splice(vehicles.indexOf(v), 1);
  if (t.kind === 'bike') {
    t.holder.add(t.bike.root); t.bike.root.position.set(0, 0, 0); t.bike.root.rotation.set(0, 0, 0);
    t.holder.add(owner.root); owner.root.position.set(0, 0, 0);
  } else {
    t.holder.add(t.veh.root); t.veh.root.position.set(0, 0, 0); t.veh.root.rotation.set(0, 0, 0);
    for (const q of t.riders) t.holder.add(q.root);
    t.holder.add(owner.root); owner.root.position.copy(t.veh.driverSeat);
  }
  owner.root.rotation.set(0, 0, 0);
  owner.poseHook = r.prevHook;
  // brought back close by: carry on from the nearest point of the road, so nothing jumps far
  if (nearOwner) {
    const q = { x: 0, z: 0 };
    let bs = t.s, bd = 1e9;
    for (let ds = -20; ds <= 20; ds += 0.5) { t.loop.at(t.s + ds, q); const d = Math.hypot(q.x - v.park.x, q.z - v.park.z); if (d < bd) { bd = d; bs = t.s + ds; } }
    t.s = bs;
    t.heading = v.park.rot;
    const [hi, ro] = pick([['धन्यवाद बेटा!', 'Dhanyavaad beta!'], ['शाबाश, वापस ले आए!', 'Shaabaash, vaapas le aaye!'], ['चलो, अब मैं चलूँ', 'Chalo, ab main chaloon']]);
    audio.say(hi, { roman: ro, pitch: 1.1, rate: 1.1 });
    toast(`You gave the ${TAKE_NAME[takeKind(t)]} back`);
  }
  t.taken = false; t.holder.visible = true; t.speed = 0;
  robbed.splice(robbed.indexOf(r), 1);
}
function updateRobbed(dt) {
  for (const r of robbed.slice()) {
    const { v, owner } = r;
    r.angry -= dt;
    const o = owner.root.position;
    const dPO = Math.hypot(player.x - o.x, player.z - o.z);
    if (dPO < 120) {
      const want = Math.atan2(player.x - o.x, player.z - o.z);
      owner.root.rotation.y = lerpAngle(owner.root.rotation.y, want, 1 - Math.exp(-dt * 3));
      owner.update(dt, 0, 'idle');
    }
    owner.root.visible = dPO < 200;
    if (v === ride || v.crash) continue;
    const dP = Math.hypot(player.x - v.park.x, player.z - v.park.z), dO = Math.hypot(o.x - v.park.x, o.z - v.park.z);
    if (dO < 10 && dP > 4) giveBack(r, true);
    else if (dP > 90 && dPO > 70) giveBack(r, false);
  }
}

// ---------------- crashes ----------------
// Bump into something with a vehicle and it reacts by weight: a cyclist clipped by the minibus goes over,
// a parked scooter shoved by the car falls on its side, the car hits a bus and stops dead, and anything
// the train catches on the line is thrown clear — further and higher the faster the train is going.
const crashes = new Crashes();
const MASS = { camel: 500, elephant: 4000, police: 1800, bicycle: 60, moped: 130, scooter: 150, auto: 420, erick: 480, car: 900, jeep: 1800, minibus: 3600, bus: 7000, cart: 700, tonga: 520, tractor: 3000, ambulance: 2600, firetruck: 9000 };
const UPV = new THREE.Vector3(0, 1, 0);
function obbDist(x, z, b) {
  const dx = x - b.x, dz = z - b.z, c = Math.cos(b.rot), sn = Math.sin(b.rot);
  const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
  const ex = Math.max(0, Math.abs(lx) - b.hw), ez = Math.max(0, Math.abs(lz) - b.hd);
  return Math.hypot(ex, ez);
}
// circles along something's length, for overlap tests
function circles(x, z, heading, halfLen, r) {
  const n = Math.max(1, Math.round(halfLen / r)), out = [], fx = Math.sin(heading), fz = Math.cos(heading);
  for (let i = 0; i < n; i++) { const o = n === 1 ? 0 : -halfLen + r + (i / (n - 1)) * (halfLen - r) * 2; out.push([x + fx * o, z + fz * o]); }
  return out;
}
// a little spin that tips a thing over away from the hit, a yaw twist, and for two-wheelers a fall sideways
function tipSpin(dir, amount, heading, twoWheel) {
  const axis = new THREE.Vector3().crossVectors(UPV, dir).normalize();
  const w = axis.multiplyScalar(amount);
  w.y += (Math.random() - 0.5) * amount * 0.8;
  if (twoWheel) { const side = Math.random() < 0.5 ? -1 : 1; w.addScaledVector(new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading)), side * (2.2 + amount * 0.4)); }
  return w;
}
function knockParked(v, dv, spin) {
  if (v.crash) { v.crash.kick(dv, spin); return v.crash; }
  scene.attach(v.obj.root);
  const b = crashes.add(v.obj.root, { ...shapeOf(v.name, v.shapeOver), hold: 3.5, kind: v.name, onDone: (b) => { v.crash = null; parkVehicle(v, b.obj.position.x, b.obj.position.z, b.yaw); } });
  v.crash = b;
  b.kick(dv, spin);
  return b;
}
// the boy comes off whatever he was riding; it carries on with its own momentum
function ejectRide(dv, spin) {
  const v = ride;
  if (!v || v.water) return;
  const vel = new THREE.Vector3(player.dirX * player.speed, 0, player.dirZ * player.speed);
  ride = null;
  boy.root.updateWorldMatrix(true, true);
  knockParked(v, vel.add(dv), spin);
  v.park.x = player.x; v.park.z = player.z;
  drive.v = 0; drive.steer = 0; player.speed = 0; ridePitch = 0;
  boy.root.rotation.set(0, player.facing, 0);
  inside = 0;
}
const knock = { on: false, vx: 0, vz: 0, down: 0 };
function startKnock(vx, vy, vz) {
  if ((ride && ride.fly) || drv || pax) return;
  if (sit.on) standUp();
  if (ride && !ride.water) ejectRide(new THREE.Vector3(vx * 0.5, vy * 0.3, vz * 0.5), tipSpin(new THREE.Vector3(vx, 0, vz).normalize(), 2, player.facing, !ride.four));
  if (ride) return; // in the boat: nothing to do
  knock.on = true; knock.vx = vx; knock.vz = vz; knock.down = 0;
  player.vy = vy; player.grounded = false; player.speed = 0;
  swim.on = false;
  scare.shake = Math.max(scare.shake, 1);
  $('ridehud').classList.remove('show');
  audio.setRide(null, 0, false, false); audio.setReverse(false);
  setTimeout(() => audio.say(pick(['अरे बाप रे!', 'आह!', 'उफ़!']), { roman: 'Arre!', pitch: 1.7, rate: 1.1 }), 150);
}
function updateKnock(dt) {
  const p = { x: player.x + knock.vx * dt, z: player.z + knock.vz * dt };
  resolveCollisions(p, 0.28, player.y);
  const d = Math.hypot(p.x, p.z);
  if (d > PLAY_RADIUS) { p.x *= PLAY_RADIUS / d; p.z *= PLAY_RADIUS / d; }
  player.x = p.x; player.z = p.z;
  const gy = groundHeight(player.x, player.z, player.y);
  if (!player.grounded) {
    player.vy -= GRAVITY * dt; player.y += player.vy * dt;
    if (player.y <= gy) { player.y = gy; player.grounded = true; player.vy = 0; audio.footstep(1, true); audio.crash(0.25, 0); }
  } else {
    player.y = gy;
    const f = Math.exp(-dt * 5); knock.vx *= f; knock.vz *= f;
    knock.down += dt;
  }
  // thrown back, flat on the ground for a moment, then up again
  const want = !player.grounded ? -1.1 : knock.down < 1.5 ? -Math.PI / 2 : 0;
  boy.root.rotation.x += (want - boy.root.rotation.x) * (1 - Math.exp(-dt * (knock.down < 1.5 ? 9 : 5)));
  boy.root.rotation.z = 0;
  boy.root.position.set(player.x, player.y + (player.grounded && knock.down < 1.5 ? 0.12 : 0), player.z);
  boy.root.rotation.y = player.facing;
  boy.setGear('none');
  boy.update(dt, 0, !player.grounded, player.vy);
  if (knock.down > 2.3) { knock.on = false; boy.root.rotation.x = 0; }
}
// everything that can be hit this frame
function knockables() {
  const out = [];
  for (const v of vehicles) {
    if (v === ride || v.water || v.fly || v.mount) continue; // (the camel and the elephant aren't knocked about)
    const sh = shapeOf(v.name, v.shapeOver);
    const x = v.crash ? v.crash.p.x : v.park.x, z = v.crash ? v.crash.p.z : v.park.z;
    if (Math.abs(x - player.x) + Math.abs(z - player.z) > 60) continue;
    const ps = v.crash ? { x: v.crash.p.x, z: v.crash.p.z } : parkedShape(v);
    out.push({ x: ps.x, z: ps.z, heading: v.crash ? v.crash.yaw ?? v.park.rot : v.park.rot, halfLen: sh.half.z, r: Math.max(0.35, sh.half.x + 0.05), mass: sh.mass, vel: v.crash ? v.crash.v : null, two: !v.four, id: v,
      hit: (dv, spin) => knockParked(v, dv, spin), kind: v.name });
  }
  for (const t of people.travellers.list) {
    if (t.crash || !t.holder.visible) continue;
    if (Math.abs(t.p.x - player.x) + Math.abs(t.p.z - player.z) > 80 && !train.active) continue;
    const fx = Math.sin(t.heading) * t.speed, fz = Math.cos(t.heading) * t.speed;
    if (t.kind === 'bike') out.push({ x: t.p.x, z: t.p.z, heading: t.heading, halfLen: 0.8, r: 0.35, mass: t.motor ? 150 : 80, vel: { x: fx, y: 0, z: fz }, two: true, id: t, hit: (dv, spin) => knockTraveller(t, dv, spin), kind: 'rider' });
    else if (t.kind === 'bus' || t.kind === 'jeep') out.push({ x: t.p.x, z: t.p.z, heading: t.heading, halfLen: t.veh.len / 2, r: t.veh.half + 0.05, mass: t.kind === 'bus' ? 7000 : 1800, vel: { x: fx, y: 0, z: fz }, fixed: true, id: t, hit: (dv, spin) => knockTraveller(t, dv, spin), kind: t.kind });
  }
  return out;
}
// a cyclist or motorbike rider knocked off: the bike and the rider go their own ways, lie there a moment,
// pick themselves up and carry on along the road
function knockTraveller(t, dv, spin) {
  t.crash = true;
  const parts = [];
  const finish = () => {
    if (parts.some((b) => b.state !== 'done')) return;
    if (t.person && t.kind === 'bike') { t.holder.attach(t.person.root); t.person.root.position.set(0, 0, 0); t.person.root.rotation.set(0, 0, 0); }
    t.holder.rotation.set(0, t.heading, 0);
    t.speed = 0;
    t.crash = false;
  };
  const big = t.kind === 'bus' || t.kind === 'jeep';
  const sh = big ? shapeOf(t.kind, { half: [t.veh.half, t.kind === 'bus' ? 1.5 : 0.9, t.veh.len / 2], com: [0, t.kind === 'bus' ? 1.6 : 1.0, 0] }) : shapeOf(t.bike.kind);
  const vb = crashes.add(t.holder, { ...sh, hold: big ? 4 : 2.6, kind: t.kind, onDone: finish });
  vb.v.set(Math.sin(t.heading) * t.speed, 0, Math.cos(t.heading) * t.speed);
  vb.kick(dv, spin);
  parts.push(vb);
  if (t.kind === 'bike') {
    const pr = t.person;
    scene.attach(pr.root);
    for (let i = 0; i < 4; i++) pr.update(0.4, 0, 'idle');
    pr.body.position.z = 0;
    const rb = crashes.add(pr.root, { ...shapeOf('person'), hold: 2.0, kind: 'person', onDone: finish,
      onStep: (b, dt) => { if (b.state === 'right') pr.update(dt, 0, 'idle'); } });
    rb.v.copy(vb.v);
    rb.kick(dv.clone().multiplyScalar(1.15).add(new THREE.Vector3(0, 1.2, 0)), spin.clone().multiplyScalar(0.8));
    parts.push(rb);
    setTimeout(() => audio.say(pick(['अरे! देख के चलाओ!', 'अरे भाई!', 'हे भगवान!', 'ओ हो!']), { roman: 'Arre!', pitch: 1.2, rate: 1.1, volume: 0.9 }), 400);
  }
}
let crashCool = 0;
function crashCheck(dt) {
  crashCool -= dt;
  const list = knockables();
  // 1. the train: nothing stands in its way
  for (const b of train.boxes) {
    const sp = Math.hypot(b.vx, b.vz);
    if (sp < 0.5) continue;
    const tdx = b.vx / sp, tdz = b.vz / sp;
    const side = (x, z) => { const s = (x - b.x) * tdz - (z - b.z) * tdx; return s >= 0 ? 1 : -1; };
    const launch = (x, z, mass, vel) => {
      const sd = side(x, z), mf = Math.sqrt(THREE.MathUtils.clamp(1000 / mass, 0.4, 2.2));
      // carried along with the engine and flung off to the side it was standing on
      const fwd = 0.85 + Math.random() * 0.2, out = 3 + sp * 0.55;
      const dv = new THREE.Vector3(b.vx * fwd - (vel?.x ?? 0), (2 + sp * 0.3) * mf, b.vz * fwd - (vel?.z ?? 0));
      dv.x += tdz * sd * out; dv.z -= tdx * sd * out;
      const spin = new THREE.Vector3(tdx, 0, tdz).multiplyScalar(-sd * sp * 0.22 * mf).add(new THREE.Vector3(0, (Math.random() - 0.5) * sp * 0.15, 0));
      return [dv, spin];
    };
    for (const k of list) {
      let hit = false;
      for (const [cx, cz] of circles(k.x, k.z, k.heading, k.halfLen, k.r)) if (obbDist(cx, cz, b) < k.r) { hit = true; break; }
      if (!hit) continue;
      if (k.id.crash && k.id.crash.state === 'fly' && k.id.crash.t < 0.4) continue;
      const [dv, spin] = launch(k.x, k.z, k.mass, k.vel);
      k.hit(dv, spin);
      audio.crash(THREE.MathUtils.clamp(1 - Math.hypot(k.x - player.x, k.z - player.z) / 120, 0.1, 1), 1);
      if (Math.hypot(k.x - player.x, k.z - player.z) < 80) queueToast(`The train hit the ${{ rider: 'cyclist', bus: 'bus', jeep: 'jeep' }[k.kind] ?? k.kind}!`);
    }
    // loose things already tumbling get swept along too
    for (const body of crashes.bodies) if (body.state !== 'right' && obbDist(body.p.x, body.p.z, b) < body.radius && (body.v.x * tdx + body.v.z * tdz) < sp * 0.8) {
      const [dv, spin] = launch(body.p.x, body.p.z, body.mass, body.v); body.kick(dv, spin);
    }
    // anyone standing on the line is thrown aside
    for (const h of hitList) {
      if (h.person.fallT > 0 || !(obbDist(h.x, h.z, b) <= 0.35)) continue;
      const sd = side(h.x, h.z);
      knockPerson(h, tdz * sd * 3 + b.vx * 0.3, -tdx * sd * 3 + b.vz * 0.3, sp * 1.5);
    }
    // and the boy, on foot or riding
    if (drv || pax) { /* aboard */ } else if (ride && ride.fly) {
      if (flight.ground && !flight.crashed && obbDist(player.x, player.z, b) < 2) { const ev = []; flight.crash('hit', ev); planeEvent({ ...ev[0], why: 'train' }); }
    } else if (!knock.on && obbDist(player.x, player.z, b) < (ride ? ride.rad : 0.3)) {
      const m = ride ? MASS[ride.name] ?? 300 : 45;
      const [dv] = launch(player.x, player.z, m, { x: player.dirX * player.speed, z: player.dirZ * player.speed });
      audio.crash(1, 1);
      toast(ride ? 'Hit by the train!' : 'Knocked down by the train!');
      startKnock(dv.x * 0.7, Math.min(9, dv.y * 0.8), dv.z * 0.7);
    }
  }
  // 2. what the boy's vehicle runs into
  if (ride && ride.fly && !flight.crashed && player.speed > 2 && (flight.ground || flight.agl < 2.5)) {
    // taxiing (or skimming the ground): anyone under the wings or the rotor goes flying
    const c = Math.cos(flight.heading), sn = Math.sin(flight.heading);
    for (const h of hitList) {
      if (h.person.fallT > 0) continue;
      const dx = h.x - player.x, dz = h.z - player.z;
      const along = dx * sn + dz * c, across = dx * c - dz * sn;
      if (ride.heli ? Math.hypot(dx, dz) < 4.4 : Math.abs(along) < 3 && Math.abs(across) < 5.3) knockPerson(h, player.dirX * player.speed + dx, player.dirZ * player.speed + dz, player.speed);
    }
  }
  if (!ride || ride.water || ride.fly || knock.on || player.speed < 0.8) return;
  const four = !!ride.four;
  const vP = new THREE.Vector3(player.dirX * player.speed, 0, player.dirZ * player.speed);
  const mP = MASS[ride.name] ?? 300;
  const mine = ride.probes ? ride.probes.map((o) => [player.x + Math.sin(player.facing) * o, player.z + Math.cos(player.facing) * o]) : [[player.x + Math.sin(player.facing) * 0.45, player.z + Math.cos(player.facing) * 0.45], [player.x, player.z]];
  const rP = ride.probes ? ride.rad : 0.35;
  // people: anyone in the way of the boy's vehicle is knocked flat (and gets up again, cross)
  if (player.speed > 1.2) for (const h of hitList) {
    if (h.person.fallT > 0) continue;
    if (Math.abs(h.x - player.x) + Math.abs(h.z - player.z) > 12) continue;
    let hit = false;
    if (ride.box) {
      // four-wheelers: the whole body, in the vehicle's own frame (the bus sits beside its driver's seat, so
      // a line of circles down the seat's line missed people walking into the other side of it)
      const [bx, bz, hw, hd] = ride.box, c = Math.cos(player.facing), sn = Math.sin(player.facing);
      const dx = h.x - player.x, dz = h.z - player.z, lx = dx * c - dz * sn, lz = dx * sn + dz * c;
      hit = Math.abs(lx - bx) < hw + 0.4 && Math.abs(lz - bz) < hd + 0.4;
    } else for (const [ax, az] of mine) if (Math.hypot(h.x - ax, h.z - az) < rP + 0.45) { hit = true; break; }
    if (!hit) continue;
    knockPerson(h, player.dirX * player.speed + (h.x - player.x) * 0.5, player.dirZ * player.speed + (h.z - player.z) * 0.5, player.speed);
    if (four) drive.v *= 0.75; else player.speed *= 0.7;
    if (!four && player.speed > 7) { startKnock(player.dirX * 3, 3, player.dirZ * 3); toast('Crash! You both went flying'); }
  }
  for (const k of list) {
    if (k.cool > 0) continue;
    let best = null;
    for (const [ax, az] of mine) for (const [bx, bz] of circles(k.x, k.z, k.heading, k.halfLen, k.r)) {
      const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz);
      if (d < rP + k.r + 0.12 && (!best || d < best.d)) best = { d, nx: dx / (d || 1), nz: dz / (d || 1) };
    }
    if (!best) continue;
    const rel = (vP.x - (k.vel?.x ?? 0)) * best.nx + (vP.z - (k.vel?.z ?? 0)) * best.nz;
    if (rel < 1.3 || crashCool > 0) continue;
    crashCool = 0.35;
    const loud = THREE.MathUtils.clamp(rel / 9, 0.2, 1);
    if (k.fixed || k.mass > mP * 4) {
      // like hitting a wall: you stop, a two-wheeler rider goes over the handlebars
      audio.crash(loud, 1);
      if (!four && rel > 4.5) { startKnock(vP.x * 0.5 - best.nx * 2, 3.5, vP.z * 0.5 - best.nz * 2); toast('Ouch! Thrown off!'); }
      else if (four) drive.v = -drive.v * 0.2; else player.speed = 0;
      continue;
    }
    const e = 0.3;
    const J = ((1 + e) * rel) / (1 / mP + 1 / k.mass);
    const dvT = J / k.mass, dvP = J / mP;
    const dir = new THREE.Vector3(best.nx * 0.6 + player.dirX * 0.4, 0, best.nz * 0.6 + player.dirZ * 0.4).normalize();
    const dv = dir.clone().multiplyScalar(dvT).add(new THREE.Vector3(0, 0.6 + Math.min(4, dvT * (k.mass < 200 ? 0.2 : 0.1)), 0));
    k.hit(dv, tipSpin(dir, Math.min(8, dvT * 0.9), k.heading, k.two));
    audio.crash(loud, k.kind === 'rider' ? 0.6 : 1);
    if (four) drive.v = Math.sign(drive.v) * Math.max(0, Math.abs(drive.v) - dvP);
    else player.speed = Math.max(0, player.speed - dvP);
    if (!four && dvP > 3.5) { startKnock(vP.x * 0.4, 3, vP.z * 0.4); toast('Crash! Off the ' + (ride ? ride.name : 'bike')); }
    else if (k.kind === 'rider') queueToast('Oops! You knocked a cyclist over');
  }
}

// everyone on foot near the boy (not riding or sitting up in anything), gathered once a frame for collisions
let hitList = [];
function collectHittables() {
  hitList = [];
  for (const p of ALL_PEOPLE) {
    if (p.noHit || p.fallT > 0) continue;
    // the cheap test first: most people are far away
    const e = p.root.matrixWorld.elements, x = e[12], y = e[13], z = e[14];
    if (!(Math.abs(x - player.x) + Math.abs(z - player.z) <= 160)) continue;
    if (!Number.isFinite(y)) continue;
    let o = p.root, vis = true;
    while (o) { if (!o.visible) { vis = false; break; } o = o.parent; }
    if (!vis) continue;
    // up on a ride, a cart or a seat? (the ground under them is looked up again only once they've moved a little)
    let gc = p._hitG;
    if (!gc || Math.abs(gc.x - x) + Math.abs(gc.z - z) > 0.5 || Math.abs(gc.y - y) > 0.3) { gc = p._hitG = { x, y, z, g: groundHeight(x, z, y + 0.3) }; }
    if (y - gc.g > 0.6) continue;
    hitList.push({ x, z, person: p });
  }
}
// traffic that can't stop in time
function trafficHits() {
  for (const t of people.travellers.list) {
    if (t.kind === 'walker' || t.crash || t.taken || !t.holder.visible || (t.speed ?? 0) < 2.5) continue;
    const c = Math.cos(t.heading), sn = Math.sin(t.heading), hl = t.veh ? t.veh.len / 2 : t.kind === 'cart' ? 2.6 : 0.9, hw = t.veh ? t.veh.half : t.kind === 'cart' ? 0.9 : 0.35;
    for (const h of hitList) {
      if (h.person.fallT > 0) continue;
      const dx = h.x - t.p.x, dz = h.z - t.p.z;
      if (Math.abs(dx) + Math.abs(dz) > hl + 4) continue;
      const along = dx * sn + dz * c, across = dx * c - dz * sn;
      if (Math.abs(along) < hl + 0.25 && Math.abs(across) < hw + 0.3) knockPerson(h, sn * t.speed + across * c * 2, c * t.speed - across * sn * 2, t.speed);
    }
  }
}
// someone knocked over by a vehicle or the train: they go down with a cry
let personToastT = 0;
function knockPerson(h, dx, dz, speed) {
  const d = Math.hypot(h.x - player.x, h.z - player.z);
  if (!Number.isFinite(d) || !Number.isFinite(dx) || !Number.isFinite(dz)) return;
  if (!h.person.knockDown(dx, dz, Number.isFinite(speed) ? speed / 8 : 1)) return;
  audio.crash(clamp(0.5 - d / 120, 0.08, 0.4), 0.15);
  const [hi, ro] = pick([['अरे!', 'Arre!'], ['आह!', 'Aah!'], ['बचाओ!', 'Bachao!'], ['अरे बाप रे!', 'Arre baap re!']]);
  if (d < 60) audio.say(hi, { roman: ro, pitch: h.person.female ? 1.6 : 0.95, rate: 1.15, volume: clamp(1 - d / 60, 0.3, 1) });
  if (performance.now() - personToastT > 4000 && d < 40) { personToastT = performance.now(); queueToast(ride ? 'Oops! You knocked someone down — slow down near people!' : 'Someone got knocked down!'); }
  // they mutter at the boy as they get up
  if (d < 40) setTimeout(() => { const [h2, r2] = pick([['देख के चलाओ!', 'Dekh ke chalao!'], ['अंधे हो क्या?', 'Andhe ho kya?'], ['धीरे चलाओ बेटा!', 'Dheere chalao beta!']]); audio.say(h2, { roman: r2, pitch: h.person.female ? 1.5 : 0.9, rate: 1.1 }); }, 3800);
}

// swimming
const swim = { on: false, b: 0, stroke: 0, splash: new Puffs({ max: 100, color: '#eef5f5', opacity: 0.5, buoyancy: -5, drag: 0.5 }) };
scene.add(swim.splash.mesh);
function splashAround(n, sp = 1) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.28;
    swim.splash.emit(player.x + Math.sin(player.facing) * 0.5 + Math.cos(a) * 0.3, WY() + 0.05, player.z + Math.cos(player.facing) * 0.5 + Math.sin(a) * 0.3,
      Math.cos(a) * sp, 1.2 + Math.random() * sp, Math.sin(a) * sp, 0.6, 0.05, 0.22, 0.85);
  }
}

// ---------------- being still: sitting, chai, small kindnesses ----------------
// Q sits the boy down wherever he is: the corner clutter fades and the camera drifts slowly round. E does the small thing at hand: a cup of chai at the stall, the temple bell, a pat for the
// dog, puffed rice for the fish, a diya set on the river at dusk.
const sit = { on: false, t: 0, chai: 0 };
// the struck match in the boy's right hand: a little teardrop of flame on a matchstick
const matchFlame = new THREE.Group();
{
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.06, 5), new THREE.MeshStandardMaterial({ color: '#e8d8b0', roughness: 0.8 }));
  stick.rotation.x = Math.PI / 2; matchFlame.add(stick);
  const fl = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6).scale(1, 1.9, 1), new THREE.MeshBasicMaterial({ color: '#ffc45a' }));
  fl.position.set(0, 0.016, 0.03); matchFlame.add(fl);
  matchFlame.position.set(0, -0.06, 0.04); matchFlame.visible = false;
  boy.arms[1].hand.add(matchFlame);
}
const purse = { spent: 0 };
const wallet = () => (passengers?.fare ?? 0) - purse.spent;
const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.024, 0.07, 10), new THREE.MeshStandardMaterial({ color: '#b8683c', roughness: 0.8 }));
cup.position.set(0, -0.07, 0.03); cup.visible = false;
boy.arms[1].hand.add(cup);
try { localStorage.removeItem('gaon-diary'); } catch { /* nothing stored */ }
function sitDown(msg) {
  if (sit.on || ride || drv || pax || swim.on || knock.on || !player.grounded) return;
  sit.on = true; sit.t = 0; player.speed = 0;
  document.body.classList.add('sitting');
  toast(msg ?? 'Sitting a while');
}
function standUp() {
  if (sit.perch) { const P = sit.perch; player.x = P.x + Math.sin(P.face) * 0.9; player.z = P.z + Math.cos(P.face) * 0.9; player.y = groundHeight(player.x, player.z); sit.perch = null; }
  sit.on = false; sit.chai = 0; cup.visible = false;
  if (fishing.on) { fishing.on = false; fishRod.visible = false; if (fishing.n) toast(`Rod over the shoulder — ${fishing.n} fish today 🎣`); }
  document.body.classList.remove('sitting');
}
function updateSit(dt) {
  sit.t += dt;
  const moving = keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD || keys.ArrowUp || keys.ArrowDown || keys.ArrowLeft || keys.ArrowRight || jumpQueued;
  jumpQueued = false;
  if (sit.t > 0.5 && started && moving) { standUp(); return; }
  sit.chai = Math.max(0, sit.chai - dt);
  cup.visible = sit.chai > 0;
  if (fishing.on) fishTick(dt);
  player.speed = 0;
  if (sit.perch) {
    // perched on the bench: feet hanging, the cup coming up to the lips now and then
    const P = sit.perch;
    boy.root.position.set(P.x, P.y, P.z);
    boy.root.rotation.set(0, P.face, 0);
    player.x = P.x; player.z = P.z; player.y = P.y - 0.38; player.facing = P.face;
    boy.setGear('none');
    boy.sit(dt, sit.chai > 0, true);
  } else {
    player.y = groundHeight(player.x, player.z, player.y);
    boy.root.position.set(player.x, player.y, player.z);
    boy.root.rotation.set(0, player.facing, 0);
    boy.setGear('none');
    boy.sit(dt, sit.chai > 0);
  }
  if (!dragging && performance.now() - autoYaw > 3500) yaw += dt * 0.03; // the view drifts slowly round him
  for (const v of vehicles) if (!v.water) v.obj.update(dt, 0, 0, false, 0);
  flames.update(dt); dust.update(dt); mopedSmoke.update(dt); swim.splash.update(dt);
  audio.setRide(null, 0, false, false); audio.setReverse(false);
  $('ridehud').classList.remove('show'); $('flyhud').classList.remove('show');
  const html = '<span class="chip"><kbd>W</kbd>get up</span>';
  if ($('prompt').dataset.html !== html) { $('prompt').innerHTML = html; $('prompt').dataset.html = html; }
  $('prompt').classList.toggle('show', sit.t < 5);
}
// diyas set afloat: little clay lamps that drift away down the river
const diyas = [];
const diyaGeo = new THREE.CylinderGeometry(0.07, 0.04, 0.035, 10), flameGeo = new THREE.SphereGeometry(0.03, 8, 6).scale(1, 1.7, 1);
const diyaMat = new THREE.MeshStandardMaterial({ color: '#a6512e', roughness: 0.8 }), flameMat = new THREE.MeshBasicMaterial({ color: '#ffb648' });
function floatDiya() {
  const side = Math.sign(player.x - riverX(player.z)) || 1;
  const g = new THREE.Group();
  g.add(new THREE.Mesh(diyaGeo, diyaMat));
  const fl = new THREE.Mesh(flameGeo, flameMat); fl.position.y = 0.06; g.add(fl);
  scene.add(g);
  if (diyas.length >= 14) { const old = diyas.shift(); scene.remove(old.g); }
  diyas.push({ g, fl, z: player.z, off: side * (RIVER_HALF - 0.6), want: side * RIVER_HALF * (0.15 + Math.random() * 0.45), ph: Math.random() * 6, life: 300 });
  boy.greetT = 2.2;
  audio.splash(0.12);
  toast('A diya, set afloat 🪔');
}
function updateDiyas(dt) {
  for (let i = diyas.length - 1; i >= 0; i--) {
    const d = diyas[i];
    d.life -= dt; d.z -= dt * 0.32; d.off += (d.want - d.off) * (1 - Math.exp(-dt * 0.08));
    d.g.position.set(riverX(d.z) + d.off, WY() + 0.02 + Math.sin(time * 1.7 + d.ph) * 0.012, d.z);
    d.g.rotation.y += dt * 0.15;
    d.fl.scale.setScalar(Math.min(1, d.life / 20) * (0.85 + Math.sin(time * 13 + d.ph) * 0.15));
    if (d.life <= 0 || Math.abs(d.z) > PLAY_RADIUS) { scene.remove(d.g); diyas.splice(i, 1); }
  }
}
function feedFish() {
  const side = Math.sign(player.x - riverX(player.z)) || 1;
  boy.greetT = 0.8;
  for (let k = 0; k < 6; k++) setTimeout(() => {
    const x = riverX(player.z) + side * (RIVER_HALF - 1.2 - Math.random() * 2.2), z = player.z + (Math.random() - 0.5) * 3;
    for (let i = 0; i < 4; i++) { const a = Math.random() * 6.28; swim.splash.emit(x, WY() + 0.04, z, Math.cos(a) * 0.5, 0.9 + Math.random() * 0.6, Math.sin(a) * 0.5, 0.5, 0.04, 0.16, 0.8); }
    audio.splash(0.16 + Math.random() * 0.12);
  }, 500 + k * 420 + Math.random() * 200);
  toast('The fish come up for the puffed rice');
}
function haveChai() {
  if (wallet() >= 10) { purse.spent += 10; toast('A hot cup of chai ☕ · ₹10'); }
  else toast('“Pay me later, beta” — a hot cup of chai ☕');
  audio.tink(0.5);
  // up onto the customers' bench, between the two regulars, facing the stall
  const seat = localToWorld(TEA, 0, 2.55);
  sitDown('');
  if (!sit.on) return;
  sit.perch = { x: seat.x, z: seat.z, y: groundHeight(seat.x, seat.z) + 0.38, face: TEA.rot + Math.PI };
  player.facing = sit.perch.face;
  sit.chai = 40;
}
// ---- fishing from the bank: sit with a rod; now and then the float bobs under and something comes up
const FISH = [['rohu', 'a silvery rohu'], ['catla', 'a fat catla'], ['magur', 'a whiskery magur'], ['singhi', 'a little singhi'], ['puthi', 'a handful-sized puthi'], ['mrigal', 'a mrigal'], ['tilapia', 'a tilapia']];
const fishing = { on: false, t: 0, next: 0, bite: 0, n: 0, wx: 0, wz: 0, wy: 0 };
const fishRod = (() => {
  const g = new THREE.Group();
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.016, 2.6, 6).translate(0, 1.3, 0), new THREE.MeshStandardMaterial({ color: '#8a6a3a', roughness: 0.6 }));
  rod.rotation.x = 0.95; rod.position.set(0.12, 0.62, 0.15); rod.castShadow = true;
  g.add(rod);
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#e8e8e8', transparent: true, opacity: 0.7 }));
  line.frustumCulled = false;
  g.add(line);
  const float = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshStandardMaterial({ color: '#e0301e', roughness: 0.5 }));
  g.add(float);
  g.userData = { rod, line, float };
  g.visible = false;
  return g;
})();
function startFishing(wx, wz, wy) {
  const want = Math.atan2(wx - player.x, wz - player.z);
  player.facing = want;
  sitDown('Fishing from the bank 🎣 — wait for a bite');
  if (!sit.on) return;
  Object.assign(fishing, { on: true, t: 0, next: 4 + Math.random() * 8, bite: 0, wx, wz, wy });
  if (!fishRod.parent) scene.add(fishRod);
  fishRod.visible = true;
}
function fishTick(dt) {
  fishing.t += dt;
  const R = fishRod.userData;
  fishRod.position.copy(boy.root.position); fishRod.rotation.y = player.facing;
  fishRod.updateMatrixWorld(true);
  // the rod tip, the float out on the water, the line between
  const tip = R.rod.localToWorld(new THREE.Vector3(0, 2.6, 0));
  const fx = player.x + Math.sin(player.facing) * 3.6, fz = player.z + Math.cos(player.facing) * 3.6;
  const bob = fishing.bite > 0 ? -0.06 - Math.max(0, Math.sin(fishing.t * 18)) * 0.05 : Math.sin(fishing.t * 2.2) * 0.012;
  const fl = new THREE.Vector3(fx, fishing.wy + 0.02 + bob, fz);
  R.float.position.copy(fishRod.worldToLocal(fl.clone()));
  R.line.geometry.setFromPoints([fishRod.worldToLocal(tip.clone()), R.float.position.clone()]);
  R.rod.rotation.x = 0.95 + (fishing.bite > 0 ? Math.sin(fishing.t * 14) * 0.08 : 0);
  if (fishing.bite > 0) {
    fishing.bite -= dt;
    if (fishing.bite <= 0) {
      // up it comes
      const [, name] = FISH[Math.floor(Math.random() * FISH.length)];
      fishing.n++;
      for (let i = 0; i < 10; i++) { const a = Math.random() * 6.28; swim.splash.emit(fx, fishing.wy + 0.05, fz, Math.cos(a) * 0.9, 1.2 + Math.random(), Math.sin(a) * 0.9, 0.6, 0.05, 0.2, 0.85); }
      audio.splash(0.35); boy.greetT = 1.2;
      toast(`You caught ${name}! 🐟 (${fishing.n} today) — and let it go`);
      fishing.next = fishing.t + 6 + Math.random() * 12;
    }
  } else if (fishing.t > fishing.next) {
    fishing.bite = 1.4;
    audio.splash(0.12);
    toast('A bite! The float bobs under…');
  }
}
// ---- the hand pump: the boy takes the handle and works it up and down; each stroke down pushes a gush of
// cold water out of the spout, falling into the bucket (which fills, and then spills over the platform) ----
const pumpS = { on: false, t: 0, phase: 0, strokes: 0, target: 0, flow: 0, bucket: 0, P: null, surf: null, _v: new THREE.Vector3(), _d: new THREE.Vector3() };
// a point on the pump, from its own frame (x across, y up, z toward the spout) to the world
function pumpPt(P, lx, ly, lz, out) { const c = Math.cos(P.rot ?? 0), s = Math.sin(P.rot ?? 0); return out.set(P.x + lx * c + lz * s, heightAt(P.x, P.z) + ly, P.z - lx * s + lz * c); }
function pumpWater(P) {
  if (pumpS.on) { pumpS.target += 5; return; }
  Object.assign(pumpS, { on: true, t: 0, phase: -Math.PI / 2, strokes: 0, target: 6, P });
  P.boyPumping = true;
  if (!pumpS.surf) {
    // the water in the bucket: a disc that rises as it fills
    pumpS.surf = new THREE.Mesh(new THREE.CircleGeometry(0.185, 24).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#4d7f95', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.85 }));
    scene.add(pumpS.surf);
  }
  toast('You take the handle — creak, creak… and cold water gushes out 💧 (E to keep pumping)');
}
function stopPumping() {
  pumpS.on = false;
  if (pumpS.P) { pumpS.P.boyPumping = false; if (pumpS.P.handle) pumpS.P.handle.rotation.x = 0.1; }
}
function updatePump(dt) {
  const P = pumpS.P;
  const moving = keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD || keys.ArrowUp || keys.ArrowDown || keys.ArrowLeft || keys.ArrowRight || jumpQueued;
  jumpQueued = false;
  pumpS.t += dt;
  if ((pumpS.t > 0.4 && moving) || pumpS.strokes >= pumpS.target) { stopPumping(); return; }
  // the stroke: the handle's end goes up, then is pulled down; water comes as it goes down
  const prev = pumpS.phase;
  pumpS.phase += dt * (Math.PI * 2 / 1.15);
  if (Math.floor((pumpS.phase + Math.PI / 2) / (Math.PI * 2)) > Math.floor((prev + Math.PI / 2) / (Math.PI * 2))) { pumpS.strokes++; audio.tock?.(0.32); }
  const th = 0.12 + 0.36 * Math.sin(pumpS.phase);
  if (P.handle) P.handle.rotation.x = th;
  // water: a moment after the down stroke starts, gushing, then easing off
  const want = Math.max(0, -Math.cos(pumpS.phase - 0.35));
  pumpS.flow += (want - pumpS.flow) * (1 - Math.exp(-dt * 10));
  if (pumpS.flow > 0.08) {
    const o = pumpPt(P, 0, 0.86, -0.04, pumpS._v), d = pumpPt(P, 0, 0.86 - 0.8, -0.04 + 0.35, pumpS._d).sub(o);
    hose.emit(o.x, o.y, o.z, d.x, d.y, d.z, 0.6 + pumpS.flow * 0.6, Math.round(pumpS.flow * 650 * dt + Math.random() * 0.6), 0.035, heightAt(P.x, P.z), 0.38);
  }
  // the boy at the end of the handle, gripping it, his arms and body going with it
  const stand = pumpPt(P, 0, 0, -1.35 - 0.3, pumpS._v);
  player.x = stand.x; player.z = stand.z; player.y = groundHeight(stand.x, stand.z, player.y); player.speed = 0; player.facing = P.rot ?? 0;
  boy.root.position.set(player.x, player.y, player.z);
  boy.root.rotation.set(0, player.facing, 0);
  boy.setGear('none');
  boy.update(dt, 0, false, 0);
  const endY = 1.05 + Math.sin(th) * 1.0, shoulderY = 1.0, reach = 0.3 + (1 - Math.cos(th));
  const a = -Math.atan2(reach, -(endY - shoulderY));
  for (const [i, A] of boy.arms.entries()) { A.shoulder.rotation.set(a, 0, (i ? -1 : 1) * 0.16); A.elbow.rotation.set(-0.2, 0, 0); }
  boy.torso.rotation.x = 0.12 + 0.12 * Math.max(0, -Math.sin(pumpS.phase));
  for (const L of boy.legs) L.knee.rotation.x = 0.1 + 0.18 * Math.max(0, -Math.sin(pumpS.phase));
}
// the bucket under the spout (in the world), filling as water lands in it and slowly going down again
function pumpBucket(dt) {
  const P = layout.pump;
  if (!P || !pumpS.surf) return;
  pumpS.bucket = Math.max(0, pumpS.bucket - dt / 400);
  const c = pumpPt(P, 0, 0.27 - 0.115 + pumpS.bucket * 0.225, 0.05, pumpS._d);
  pumpS.surf.position.copy(c);
  pumpS.surf.visible = pumpS.bucket > 0.02;
}
// is a drop in flight inside the bucket? (it lands on the water there, or on its bottom)
function inBucket(x, y, z) {
  const P = layout.pump;
  if (!P) return false;
  const c = pumpPt(P, 0, 0, 0.05, pumpS._d);
  if (Math.hypot(x - c.x, z - c.z) > 0.19) return false;
  const top = c.y + 0.395, water = c.y + 0.155 + pumpS.bucket * 0.225;
  if (y < top && y < water + 0.02) { pumpS.bucket = Math.min(1, pumpS.bucket + 0.0006); return pumpS.bucket < 1; } // (full: it spills over)
  return false;
}
// the small thing at hand, if the boy is standing somewhere that has one
function nearAct() {
  if (ride || drv || pax || swim.on || sit.on || knock.on || joy) return null;
  const px = player.x, pz = player.z;
  // the mela's giant wheel and swinging boat
  { const mr = mela?.rideAt(px, pz); if (mr) return { ask: mr === 'wheel' ? 'ride the giant wheel · ₹20' : 'ride the swinging boat · ₹20', run: () => startJoy(mr) }; }
  // the tame elephant by the line: she raises her trunk and blesses you
  const ele = trackScene?.elephants.find((e) => e.mahout && Math.hypot(e.p.x - px, e.p.z - pz) < 6.5);
  if (ele) return { ask: 'offer the elephant a banana', run: () => { ele.bless = 3.2; audio.trumpet(4); boy.greetT = 2.5; toast('She takes the banana, lifts her trunk and touches your head — a blessing! 🐘'); } };
  // Naharpur's shrine: ring its bell
  const SH = trackScene?.shrine;
  if (SH && Math.hypot(px - SH.front.x, pz - SH.front.z) < 4.5) return { ask: 'ring the shrine bell', run: () => { audio.bell(0.9); boy.greetT = 2.4; toast('The bell rings out over the canal; the pujari smiles 🔔'); } };
  // the hand pump
  const P = layout.pump;
  if (P && Math.hypot(px - P.x, pz - P.z) < 2.6) return { ask: 'pump some water', run: () => pumpWater(P) };
  // a cow: offer her a roti
  const cow = layout.cows.find((c) => Math.hypot(c.x - px, c.z - pz) < 3.2);
  if (cow) return { ask: 'feed the cow a roti', run: () => { audio.moo(0.9); boy.greetT = 1.5; toast('She takes the roti gently from your hand, and lows 🐄'); } };
  // a shop: something sweet
  const shop = layout.shops?.find((S) => Math.hypot(S.x - px, S.z - pz) < 5.5);
  if (shop) {
    const what = ['a packet of Parle-G', 'two hot samosas', 'a jalebi, dripping syrup', 'an orange ice lolly', 'a bottle of cold Gold Spot', 'a handful of toffees'][Math.floor((shop.x * 7 + shop.z) % 6 + 6) % 6];
    return { ask: `buy ${what} · ₹20`, run: () => { if (wallet() >= 20) { purse.spent += 20; toast(`${what[0].toUpperCase() + what.slice(1)} 🍬 · ₹20`); } else toast(`“Take it, beta — pay next time” · ${what} 🍬`); audio.tink(0.5); boy.greetT = 1; } };
  }
  // fishing: from the canal's bank
  { const n = CANAL.path.near(px, pz); if (n && n.d > CANAL.half + 0.6 && n.d < CANAL.half + 3.4) { const q = CANAL.path.at(n.s); return { ask: 'sit and fish in the canal', run: () => startFishing(q.x, q.z, CANAL.level) }; } }
  if (cricket && Math.hypot(px - CRICKET.x, pz - CRICKET.z) < 16 && !ATMO.night && !ATMO.rainy) return { ask: 'play gully cricket with the kids', run: startCricket };
  if (Math.hypot(px - TEA.x, pz - TEA.z) < 6.5) {
    const T = village?.tea;
    if (T && !T.lit) return { ask: 'have a cup of chai (light the chulha first: F)', run: () => toast('The chulha is cold — strike a match (F) by it to light it 🔥') };
    if (T && T.boil > 0) return null;
    return { ask: wallet() >= 10 ? 'make a pan of chai · ₹10' : 'make a pan of chai', run: () => { if (!T) { haveChai(); return; } T.boil = 10; audio.tink(0.4); toast('Milk, tea leaves, a bit of ginger and sugar go in the pan — it comes to the boil…'); } };
  }
  const T = layout.temple;
  if (T && Math.hypot(px - T.x, pz - T.z) < 8) return { ask: 'ring the temple bell', run: () => { audio.bell(1); boy.greetT = 2.4; toast('The bell rings out over the village 🔔'); } };
  const dog = people?.dogs.find((d) => d.follower && Math.hypot(d.p.x - px, d.p.z - pz) < 1.9);
  if (dog) return { ask: 'pat the dog', run: () => { dog.bark(); audio.bark(0.35); boy.greetT = 1; toast('The dog leans in, tail going'); } };
  const rd = riverDist(px, pz);
  if (rd < RIVER_HALF + 2.6 && rd > RIVER_HALF - 2.5) {
    if (ATMO.glow > 0.3) return { ask: 'float a diya on the river', run: floatDiya };
    // (on alternate visits: feed the fish, or sit down and catch one)
    return nearAct.fishNext ? { ask: 'sit and fish (or E again later to feed them)', run: () => { nearAct.fishNext = false; startFishing(riverX(pz), pz, WY()); } }
      : { ask: 'scatter puffed rice for the fish (E again: fish)', run: () => { nearAct.fishNext = true; feedFish(); } };
  }
  return null;
}

// ---------------- gully cricket with the kids ----------------
// E at the cricket ground: the boy takes the bat (the kid batsman goes out to field). Space swings as the ball
// comes (time it just after it pitches), A / D place the shot; then he bowls — Space when the marker is in the
// middle of the bar — and the kids chase his score. X swaps over, E leaves the game.
let cricketOn = false;
function startCricket() {
  if (!cricket || cricketOn) return;
  cricketOn = true; player.speed = 0;
  cricket.start();
  boy.setGear('none');
  $('cricket').classList.add('show');
  yaw = cricket.boy.face + Math.PI + 0.35; pitch = 0.22; targetDist = 6;
}
function stopCricket(say = false) {
  if (!cricketOn) return;
  cricketOn = false;
  cricket.stop();
  $('cricket').classList.remove('show');
  if (say) toast(cricket.runs || cricket.kRuns ? `Stumps! You scored ${cricket.runs}; the kids ${cricket.kRuns}` : 'Back from the cricket ground');
  boy.body.rotation.set(0, 0, 0);
}
function updateCricket(dt) {
  const H = cricket, B = H.boy;
  H.aim = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  player.x = B.x; player.z = B.z; player.y = groundHeight(B.x, B.z); player.facing = B.face; player.speed = B.speed;
  boy.root.position.set(B.x, player.y, B.z);
  boy.root.rotation.set(0, B.face, 0);
  boy.update(dt, B.speed, false, 0);
  cricket.bat.visible = H.mode === 'bat';
  // the batting stance and the swing; the bowling arm coming over
  if (H.mode === 'bat') {
    const s = B.swing >= 0 ? Math.min(1, B.swing / 0.3) : 0, k = Math.sin(s * Math.PI);
    const [L, Rr] = boy.arms;
    Rr.shoulder.rotation.set(-0.55 - k * 1.5, 0, -0.35 + s * 0.7); Rr.elbow.rotation.x = -0.45;
    L.shoulder.rotation.set(-0.75 - k * 1.3, 0, 0.5); L.elbow.rotation.x = -0.6;
    boy.torso.rotation.y = -0.45 + s * 1.4; boy.torso.rotation.x = 0.25;
    for (const l of boy.legs) l.knee.rotation.x = 0.25;
  } else if (H.mode === 'bowl' && B.bowl >= 0) {
    const a = Math.min(1, B.bowl / 0.35);
    boy.arms[1].shoulder.rotation.set(-0.5 - a * 3.6, 0, 0.1); boy.arms[1].elbow.rotation.x = -0.1;
    boy.arms[0].shoulder.rotation.set(-1.4 + a * 1.2, 0, -0.2);
    boy.torso.rotation.x = 0.1 + a * 0.4;
  }
  // the scoreboard
  const sc = H.mode === 'bat' ? `You: <b>${H.runs}/${H.wkts}</b> <span>${Math.floor(H.balls / 6)}.${H.balls % 6} ov</span>` : `You made <b>${H.runs}</b> · Kids: <b>${H.kRuns}/${H.kWkts}</b> <span>${Math.floor(H.kBalls / 6)}.${H.kBalls % 6} ov · need ${Math.max(0, H.runs + 1 - H.kRuns)}</span>`;
  if ($('ck-score').dataset.v !== sc) { $('ck-score').innerHTML = sc; $('ck-score').dataset.v = sc; }
  const hint = H.mode === 'bat' ? '<kbd>Space</kbd> swing as it pitches · <kbd>A</kbd><kbd>D</kbd> place the shot · <kbd>X</kbd> bowl instead · <kbd>E</kbd> stop' : '<kbd>Space</kbd> bowl when the marker is in the middle · <kbd>X</kbd> bat instead · <kbd>E</kbd> stop';
  if ($('ck-hint').dataset.v !== hint) { $('ck-hint').innerHTML = hint; $('ck-hint').dataset.v = hint; }
  $('ck-meter').classList.toggle('show', H.mode === 'bowl' && H.phase === 'wait' && !H.go);
  $('ck-mark').style.left = `${50 + H.meter * 46}%`;
  $('ridehud').classList.remove('show');
  $('prompt').classList.remove('show');
}

// ---------------- sharing a spot ----------------
// K copies a link to exactly this view — where the boy stands, which way the camera looks, the hour, the weather
// and the season — so a friend opening it starts right here. (Nothing is stored anywhere: it's all in the link.)
function shareSpot() {
  const q = new URLSearchParams();
  q.set('at', `${Math.round(player.x)},${Math.round(player.z)},${player.facing.toFixed(2)}`);
  q.set('cam', `${yaw.toFixed(2)},${pitch.toFixed(2)}`);
  q.set('h', clock.hour.toFixed(2));
  if (clock.dark) q.set('dark', '1');
  if (clock.wxChoice !== 'clear') q.set('wx', clock.wxChoice);
  q.set('s', season);
  const url = `${location.origin}${location.pathname}?${q}`;
  const done = () => toast('🔗 Link to this spot copied — share it!');
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(done, () => window.prompt('Copy this link:', url));
  else window.prompt('Copy this link:', url);
  history.replaceState(null, '', `?${q}`);
}
// a shared link: start where it says, at its hour, in its weather and season
function applySharedLink() {
  const q = new URLSearchParams(location.search);
  const at = q.get('at')?.split(',').map(Number);
  if (at && at.length >= 2 && at.every(Number.isFinite) && Math.hypot(at[0], at[1]) < PLAY_RADIUS) {
    player.x = at[0]; player.z = at[1]; player.facing = at[2] ?? 0;
    resolveCollisions(player, 0.4, groundHeight(player.x, player.z));
    player.y = groundHeight(player.x, player.z);
  }
  const cam = q.get('cam')?.split(',').map(Number);
  if (cam && cam.every(Number.isFinite)) { yaw = cam[0]; pitch = clamp(cam[1], -0.4, 1.2); }
  const h = Number(q.get('h'));
  if (q.has('h') && Number.isFinite(h)) { clock.hour = ((h % 24) + 24) % 24; clock.dark = q.get('dark') === '1'; clock.envT = 0; }
  const wx = q.get('wx');
  if (wx && WEATHERS[wx]) { setWeatherChoice(wx, false); clock.wx = wx; clock.wxW = 1; }
  const se = q.get('s');
  if (se && SEASONS[se] && se !== season) { season = se; applySeason(); }
}

// ---------------- riding the train as a passenger ----------------
// At a station, walk up to a coach and press E: the boy sits in the open doorway with his legs out, and the
// train carries him off on its own. V changes the view; E again at any station to step down.
let pax = null;
function nearCoach() {
  if (!train || ride || drv || pax || knock.on || swim.on) return null;
  for (const tr of train.trains) {
    if (tr.mode !== 'dwell' || !tr.at || tr.at.noStation) continue;
    for (const c of tr.cars) {
      if (!c.coach || !c.g.visible) continue;
      c.g.updateMatrixWorld();
      for (const sx of [-1, 1]) {
        const q = c.g.localToWorld(_cw.set(sx * 2.7, 0, -6.4));
        if (Math.hypot(q.x - player.x, q.z - player.z) < 3.4) return { tr, car: c, sx, view: 0 };
      }
    }
  }
  return null;
}
// one coach interior, moved into whichever coach you board: you take a window seat
let coachIn = null;
const PAX_WIN = -4.5; // the window you sit at (coach-local z)
function boardTrain(pc) {
  pax = pc;
  pc.tr.occupied = true;
  coachIn ??= buildCoachInside();
  pc.car.g.add(coachIn.group);
  pc.car.g.add(coachIn.lamp); coachIn.lamp.intensity = coachIn.lamp.userData.on;
  coachIn.seat(PAX_WIN, pc.sx);
  coachIn.group.visible = true;
  pc.car.g.add(boy.root);
  // on the bench by the window, facing along the coach with the window at his shoulder
  boy.root.position.set(pc.sx * (COACH_WALL - 0.27), COACH_FLOOR + 0.45 - 0.1, PAX_WIN + 0.47);
  boy.root.rotation.set(0, Math.PI, 0);
  boy.setGear('none');
  pc.yaw0 = yaw; pitch = 0.3;
  toast(`Aboard the ${pc.tr.name} — a window seat! Sit back, it leaves soon`);
}
function leaveTrain() {
  const { tr, car, sx } = pax;
  if (Math.abs(tr.v) > 0.05) { toast('Wait for the next station to step down'); return; }
  tr.occupied = false;
  car.g.updateMatrixWorld();
  let best = null;
  for (const s2 of [sx, -sx]) {
    const q = car.g.localToWorld(new THREE.Vector3(s2 * 3.0, 0, -6.4)), g = groundHeight(q.x, q.z, 3);
    if (!best || g > best.g + 0.2) best = { x: q.x, z: q.z, g };
  }
  pax = null;
  if (coachIn) { coachIn.group.visible = false; coachIn.group.removeFromParent(); scene.add(coachIn.lamp); coachIn.lamp.intensity = 0; }
  scene.add(boy.root);
  player.x = best.x; player.z = best.z; player.y = best.g + 0.05; player.vy = 0; player.grounded = true; player.speed = 0;
  player.facing = car.g.rotation.y;
  boy.root.rotation.set(0, player.facing, 0);
  $('ridehud').classList.remove('show', 'bus', 'four');
  toast(tr.at ? `Stepped down at ${tr.at.name}` : 'Stepped down from the train');
}
function updatePassenger(dt) {
  const { tr } = pax;
  boy.sit(dt, false, true);
  coachIn?.update(dt, Math.abs(tr.v));
  boy.root.updateWorldMatrix(true, false);
  boy.root.getWorldPosition(_cw);
  player.x = _cw.x; player.z = _cw.z; player.y = _cw.y;
  player.facing = pax.car.g.rotation.y; player.speed = Math.abs(tr.v);
  player.dirX = Math.sin(player.facing); player.dirZ = Math.cos(player.facing);
  player.grounded = true; player.vy = 0;
  const hud = $('ridehud');
  hud.classList.add('show', 'bus', 'nonitro'); hud.classList.remove('four', 'boat', 'boost', 'empty');
  $('rh-name').textContent = 'Passenger';
  $('rh-speed').textContent = Math.round(Math.abs(tr.v) * 3.6);
  setDial(Math.abs(tr.v) * 3.6, 80);
  $('px-count').textContent = `🧍 ${tr.aboard} aboard`;
  $('px-fare').textContent = tr.name;
  let nxt = null, nd = Infinity;
  for (const h of tr.halts) { const d = Math.abs(tr.stopFor(h) - tr.head); if (d < nd) { nd = d; nxt = h; } }
  $('px-next').textContent = tr.at ? `Standing at ${tr.at.name}` : nxt ? `${nxt.name}: ${Math.round(nd)} m` : 'Open line';
  const html = [['E', 'step down (at a station)'], ['V', 'change view']].map(([k, t]) => `<span class="chip"><kbd>${k}</kbd>${t}</span>`).join('');
  if ($('prompt').dataset.html !== html) { $('prompt').innerHTML = html; $('prompt').dataset.html = html; }
  $('prompt').classList.toggle('show', started && Math.abs(tr.v) < 0.3);
  audio.setRide(null, 0, false, false); audio.setReverse(false);
  flames.update(dt); dust.update(dt); mopedSmoke.update(dt); swim.splash.update(dt);
  for (const o of vehicles) if (!o.water) o.obj.update(dt, 0, 0, false, 0);
}
function paxCamera(dt) {
  const lg = pax.car.g, sx = pax.sx;
  if (pax.view === 1) { trainCamera(dt, lg, 0); return; }
  lg.updateMatrixWorld();
  // at the window seat, eyes level with the window: looking out across the country through the bars, the
  // mouse turns the head (round to the rest of the coach, too)
  const a = clamp(-(yaw - pax.yaw0) * sx, -2.6, 2.6);
  camIn.set(sx * (COACH_WALL - 0.5), COACH_FLOOR + 1.25, PAX_WIN + 0.3);
  lookIn.set(camIn.x + sx * Math.cos(a) * 20, camIn.y + (0.3 - pitch) * 16, camIn.z + Math.sin(a) * 20);
  lg.localToWorld(camIn); lg.localToWorld(lookIn);
  camera.position.copy(camIn);
  camera.lookAt(lookIn);
  if (Math.abs(camera.fov - 64) > 0.05) { camera.fov = 64; camera.updateProjectionMatrix(); }
}

// ---------------- build ----------------
async function build() {
  // the heavy bakes (terrain heights and colours, grass, the map) start at once on the other CPU cores, while
  // this thread builds the trees, the village, the railway and the people
  const bakes = startBakes(['height', 'color', 'ringA', 'ringB', 'grass', 'map']);
  status('Planting neem, banyan and coconut trees…');
  await nextFrame();
  const vegGroup = buildVegetation();
  scene.add(vegGroup);
  status('Letting the river flow…');
  await nextFrame();
  river = buildRiver();
  scene.add(river);
  waterfall = buildWaterfall();
  scene.add(waterfall.group);
  status('Raising mud houses…');
  await nextFrame();
  village = buildVillage();
  scene.add(village.group);
  status('Laying the railway line…');
  await nextFrame();
  train = buildRailway(scene);
  train.onChuff = (p, sp = 5, n = 0) => {
    const d = Math.hypot(p.x - player.x, p.z - player.z);
    audio.chuff(clamp(1 - d / 230, 0, 1) ** 2, sp, n);
  };
  lap('railway');
  stations = buildStations(scene, train, {
    sonpur: layout.sonpur,
    villageFor: (h) => h.village ?? (h.name.startsWith('Noorpur') ? NP : h.name === 'Mariapur' ? MP : null),
    onArrive: (st, n) => {
      const d = Math.hypot(player.x - st.h.yard.x, player.z - st.h.yard.z);
      if (st.train === drv || st.train === pax?.tr) queueToast(`${st.h.name} — ${n} getting off, ${st.waiting()} waiting to board`);
      else if (d < 120) queueToast(`The ${st.train.name} is in at ${st.h.name}`);
    },
  });
  train.onStation = (type, tr) => {
    const d = Math.min(...tr.boxes.map((b) => Math.hypot(b.x - player.x, b.z - player.z)), 600);
    if (d < 420) audio.horn(clamp(1 - d / 420, 0.08, 1));
    if (type === 'arrive' && d < 60 && !drv && !ride) queueToast('Train standing at the platform — walk up to the engine cab and press E to drive it!');
  };
  goodsYards = buildGoodsYards(scene, train);
  // the crossing bell: a quick ding-ding while the barriers are down
  train.onCrossingBell = (X, closed) => { X.bellT = closed ? 0 : -1; };
  // a whistle as an engine comes out of a tunnel: only that train's, and only if it's within earshot
  train.onEmerge = (tr) => {
    const d = Math.min(...(tr?.boxes ?? []).map((b) => Math.hypot(b.x - player.x, b.z - player.z)), 999);
    if (d < 380) audio.horn(clamp(1 - d / 380, 0.1, 1));
  };
  status('Waking the village…');
  await nextFrame();
  friends = buildFriends(scene, {
    player, boy, camera,
    ride: () => ride,
    onFoot: () => !ride && !drv && !pax && !joy && !knock.on,
    toast: (t) => toast(t),
    say: ([hi, ro], female) => audio.say(hi, { roman: ro, pitch: female ? 1.55 : 0.95, rate: 1.1 }),
  });
  people = buildPeople(scene, village, {
    started: () => started,
    onBell: (d) => audio.cycleBell(clamp(1 - d / 25, 0, 1) * 0.8),
    onHorn: (d, kind) => { const v = clamp(1 - d / 70, 0, 1); if (v > 0.05) ({ scooter: () => audio.scooterHorn(v), bus: () => audio.busHorn(v), jeep: () => audio.jeepHorn(v) }[kind] ?? (() => audio.mopedHorn(v)))(); },
    personAhead: (x, z, r) => hitList.some((h) => Math.abs(h.x - x) < r && Math.abs(h.z - z) < r),
    // road traffic honking at someone in its way: they step off to the side of its path
    clearWay: (t, at) => {
      const fx = Math.sin(t.heading), fz = Math.cos(t.heading), half = (t.veh ? t.veh.half : 0.5) + 1.3;
      for (const h of hitList) {
        const dx = h.x - t.p.x, dz = h.z - t.p.z, along = dx * fx + dz * fz, side = dx * fz - dz * fx;
        if (along < 0 || along > Math.hypot(at.x - t.p.x, at.z - t.p.z) + 4 || Math.abs(side) > half + 0.6) continue;
        if (h.person.atStop || h.person.friend) continue;
        const sd = side >= 0 ? 1 : -1, need = half + 1 - Math.abs(side);
        h.person.dodge(fz * sd * need, -fx * sd * need, 4);
      }
    },
    trainNear: (x, z) => train.closedBoxes().some((b) => Math.hypot(b.x - x, b.z - z) < 7) || train.boxes.some((b) => {
      const dx = x - b.x, dz = z - b.z, c = Math.cos(b.rot), sn = Math.sin(b.rot);
      return Math.abs(dx * c - dz * sn) < 6 && Math.abs(dx * sn + dz * c) < b.hd + 30;
    }),
    obstacles: () => vehicles.filter((v) => v !== ride && !v.water && !v.crash).map((v) => { const sh = parkedShape(v); return { x: sh.x, z: sh.z, r: (v.box ? Math.max(v.box[2], v.box[3]) : v.rad) + 0.3 }; }),
    onCricket: (kind, text) => { if (!cricketOn) return; $('ck-msg').textContent = text; $('ck-msg').classList.remove('pop'); void $('ck-msg').offsetWidth; $('ck-msg').classList.add('pop'); if (kind === 'boundary' || kind === 'wicket' || kind === 'result') audio.tink(0.7); if (kind === 'stop') stopCricket(); },
    onStumps: (d) => { audio.tock(clamp(1 - d / 40, 0, 1)); setTimeout(() => audio.tock(clamp(1 - d / 40, 0, 1) * 0.7), 90); },
    onBat: (d) => { audio.tock(clamp(1 - d / 60, 0, 1)); if (d < 35 && Math.random() < 0.5) { const [hi, ro] = pick([['चौका!', 'Chauka!'], ['शाबाश!', 'Shaabaash!'], ['भागो!', 'Bhaago!']]); setTimeout(() => audio.say(hi, { roman: ro, pitch: 1.9, rate: 1.2, volume: 1 - d / 40 }), 250); } },
  });
  workers = buildWorkers(scene, { onThwack: (d) => audio.tock(clamp(1 - d / 60, 0, 1) * 0.5) });
  fire = buildFire(scene, village, { onStrike: () => audio.matchStrike(), onSound: (roar, crackle) => audio.setFire(roar, crackle) });
  postcards = buildPostcards(scene, {
    onCollect: (s, got, n) => {
      toast(got === n ? `📮 The last postcard — ${s.title}! You've seen the whole country 🎉` : `📮 Postcard ${got} of ${n} — ${s.title}`);
      audio.tink(0.6); setTimeout(() => audio.tink(0.8), 180); setTimeout(() => audio.tink(1), 360);
    },
  });
  cricket = people.cricket;
  if (cricket) { boy.arms[1].hand.add(cricket.bat); cricket.bat.visible = false; }
  // every vehicle's fixed parts merged material by material (moving parts and gauges are left alone)
  for (const v of vehicles) if (!v.fly && !v.water) consolidate(v.obj.root); // (the plane, helicopter and boat move their own parts)
  for (const v of vehicles) parkVehicle(v, v.park.x, v.park.z, v.park.rot);
  lap('people');
  passengers = buildPassengers(scene);
  {
    const say = (hi, ro, d, pitch) => { if (d < 45) audio.say(hi, { roman: ro, pitch, rate: 1.1, volume: clamp(1 - d / 50, 0.2, 1) }); };
  lap('passengers');
    site = buildConstruction(scene, layout.build, {
      tink: (v) => audio.tink(v), thud: (v) => audio.tock(v * 0.5),
      say: (hi, ro) => say(hi, ro, 0, 0.8),
    });
    kites = buildKites(scene, layout.kites, { say: (hi, ro, d) => say(hi, ro, d, 1.9) });
    airstrip = AS ? buildAirstrip(scene, AS, groundHeight) : null;
    helipad = AS?.pad ? buildHelipad(scene, AS.pad, groundHeight) : null;
    mela = buildMela(scene, layout.mela, { say: (hi, ro, d, pitch = 1) => say(hi, ro, d, pitch), pop: () => {} });
  }
  lap('site/kites/airstrip/mela');
  farm = buildFarm(scene);
  lap('farm');
  wild = buildWildlife(scene);
  lap('wildlife');
  fish = buildFish(scene, (d) => audio.splash(clamp(1 - d / 45, 0, 1) * 0.8));
  animals = buildAnimals(scene);
  for (const pc of animals.peacocks) pc.onCall = (d) => audio.peacock(clamp(1 - d / 120, 0, 1));
  lap('fish/animals');
  lanterns = new LanternLights(scene, 4);
  lanterns.add({ gear: boy.gear, weight: 1.1 });
  for (const v of people.villagers) lanterns.add({ gear: v.person.gear });
  lanterns.add({ point: village.teaLight, weight: 0.9 });
  flocks = new Flocks(scene);
  birds = new GroundBirds(scene, (x, z) => groundHeight(x, z), (x, z) => wet(x, z));
  birds.onCaw = (v) => audio.caw(v);
  birds.onChirp = (v) => audio.sparrow(v);
  lap('lanterns/birds');
  herds = buildHerds(scene, layout.pasture, {
    say: (hi, ro, d, pitch) => { if (d < 45) audio.say(hi, { roman: ro, pitch, rate: 1.05, volume: clamp(1 - d / 50, 0.2, 1) }); },
    moo: (v) => audio.moo(v), cowbell: (v) => audio.cowbell(v), bleat: (v) => (Math.random() < 0.5 ? audio.baa(v) : audio.bleat(v)),
  });
  buffs = buildBuffaloes(scene, {
    grunt: (v, calf) => audio.buffalo(v, calf),
    ripple: (x, y, z, d) => { const a = Math.random() * 6.28; swim.splash.emit(x, y + 0.03, z, Math.cos(a) * 0.4, 0.5 + Math.random() * 0.4, Math.sin(a) * 0.4, 0.7, 0.05, 0.3, 0.6); if (d < 40 && Math.random() < 0.04) audio.splash(0.25 * (1 - d / 40)); },
  });
  lap('herds/buffaloes');
  hamlets = buildHamlets(scene, layout.newVillages ?? []);
  lap('hamlets');
  shops = buildShops(scene);
  lap('shops');
  shrineLife = buildShrineLife(scene);
  trackside = buildTrackside(scene, train, { moo: (v) => audio.moo(v) });
  buildTrackPonds(scene); // (ponds along the line, some of them crossed on a bridge)
  trackScene = buildTrackScenery(scene, train, { peacock: (d) => audio.peacock(clamp(1 - d / 140, 0, 1)), bark: (d) => audio.bark(clamp(1.1 - d / 45, 0, 1)) });
  lap('shrine/trackside');
  motes = buildMotes();
  scene.add(motes);
  boy.root.rotation.order = 'YXZ';
  scene.add(boy.root);
  status('Drawing the map…');
  await nextFrame();
  status('Shaping the land and hills…');
  await nextFrame();
  terrainObj = buildTerrain(await bakes.height, await bakes.color, { a: await bakes.ringA, b: await bakes.ringB });
  scene.add(terrainObj);
  lap('terrain (and waiting for its bakes)');
  // the grass comes in when its bake is done: the walk can start without waiting for it (it's usually there
  // before anyone has clicked Begin)
  bakes.grass.then((data) => {
    grass = buildGrass(buildGrassData(data));
    grass?.userData.setCenter(player.x, player.z);
    // its shader built in the background first (for the composer's target, like everything else), so it
    // never stalls a frame when it appears
    renderer.setRenderTarget(composer.readBuffer);
    const ready = grass ? renderer.compileAsync(grass, camera, scene) : Promise.resolve();
    renderer.setRenderTarget(null);
    ready.catch(() => {}).then(() => { if (grass) scene.add(grass); applySeason(true); });
  });
  map = new MapUI(bakes.map); // the map fills in by itself once its bake is done
  applySeason(true);
  applySharedLink();
  {
    // grain on every plain surface — walls, wood, tin, and the weave of people's clothes (skin is left smooth)
    if (REAL) addSurfaceGrain(scene);
  }
  tickClock(0);
  lap('season, grain');
  // ---- performance ----
  // things that never move: work out their matrices once and stop updating them every frame
  for (const o of [terrainObj, vegGroup]) { o.updateMatrixWorld(true); o.matrixWorldAutoUpdate = false; o.userData.frozen = true; }
  // only the tiniest pieces (buttons, eyes) make no shadow worth drawing into the map
  {
    const _s = new THREE.Vector3();
    scene.traverse((o) => {
      if (!o.isMesh || !o.castShadow || o.isInstancedMesh || o.isBatchedMesh || !o.geometry) return;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      o.getWorldScale(_s);
      if (o.geometry.boundingSphere.radius * Math.max(_s.x, _s.y, _s.z) < 0.05) o.castShadow = false;
    });
  }
  // the big static clusters (the village's props, the railway, the stations, the mela) stream by distance
  for (const c of scene.children) if (c.userData.stream || c === village.group) streamGroup(c);
  // the coach you can ride in, made now (its lamp waits in the scene, dark) so boarding a train never stalls
  coachIn = buildCoachInside();
  scene.add(coachIn.lamp);
  // Every shader made now, before the walk begins — into the same kind of target the frame is drawn into
  // (the composer's: linear colour, tone mapping left to the last pass), or these would be the wrong ones and
  // each would be built again, mid-game, the first time its thing came into view
  lap('freeze, shadows, streams, coach');
  // (and waited for: the GPU builds them in the background, and the first frame would otherwise sit frozen
  // until they're all done, just as the Begin button appears)
  renderer.setRenderTarget(composer.readBuffer);
  const shadersReady = Promise.all([renderer.compileAsync(scene, camera), renderer.compileAsync(coachIn.group, camera, scene)]);
  renderer.setRenderTarget(null);
  // meshes too small to see left out of each frame (see perf.js)
  setupTinyCull(scene, { skip: [terrainObj, vegGroup], streamed: scene.children.filter((c) => c.userData.stream || c === village.group) });
  lap('tiny-mesh culling');
  await shadersReady.catch(() => {});
  lap('shaders');
  // the first frames send everything in sight to the GPU (a long one): drawn before the button is ready, not
  // just after it appears
  status('Almost there…');
  last = performance.now();
  requestAnimationFrame(loop);
  await nextFrame(); await nextFrame();
  lap('first frames');
  status('Begin the walk');
  $('start').disabled = false;
  document.body.classList.add('ready');
}

// ---------------- input ----------------
const canvas = renderer.domElement;
window.addEventListener('keydown', (e) => {
  if (!e.shiftKey) keys.ShiftLeft = keys.ShiftRight = false;
  if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
  if (e.code === 'Tab' && started && map) { if (!e.repeat) map.toggleBig(); return; }
  if (e.code === 'Escape' && map?.open) { map.toggleBig(false); return; }
  if (map?.open && /^Digit[123]$/.test(e.code)) { map.setMode(['places', 'trains', 'roads'][+e.code.slice(5) - 1]); return; }
  if (e.code === 'Escape' && $('help').classList.contains('show')) { toggleHelp(false); return; }
  if (e.code === 'Escape' && $('settings').classList.contains('show')) { toggleSettings(false); return; }
  if (e.target instanceof HTMLSelectElement) return;
  if (e.code === 'Space' && !keys.Space && !ride) jumpQueued = true;
  keys[e.code] = true;
  if (!started) return;
  if (e.code === 'KeyT') {
    timeIdx = (Math.max(0, TIMES.findIndex((t) => t.key === ATMO.key)) + 1) % TIMES.length;
    setTimeOfDay(TIMES[timeIdx]);
  }
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'KeyU' && !e.repeat) toggleFullscreen();
  if (e.code === 'KeyO' && !e.repeat && postcards) { postcards.toggle(); return; }
  if (e.code === 'Escape' && postcards?.open) { postcards.toggle(false); return; }
  if (e.code === 'KeyK' && !e.repeat && !(ride && ride.fly) && ride?.name !== 'firetruck') shareSpot(); // (on the fire tender, K is the water cannon)
  if (e.code === 'KeyF' && !e.repeat && friends?.marking) { friends.keyF(); return; } // (holding P: make a friend)
  if (e.code === 'KeyF' && !e.repeat && fire && !ride && !drv && !pax && !swim.on && !cricketOn) { const r = fire.strike(player.x, player.z); boy.greetT = 1.2; if (r.text) toast(r.text); }
  if (cricketOn) {
    if (e.code === 'Space' && !e.repeat) cricket.action();
    if (e.code === 'KeyX' && !e.repeat) cricket.swap();
    if ((e.code === 'KeyE' || e.code === 'KeyQ' || e.code === 'Escape') && !e.repeat) stopCricket(true);
    return;
  }
  if (e.code === 'KeyE' && !e.repeat) {
    if (joy) { wantOffJoy(); return; }
    if (pumpS.on) { pumpS.target += 5; return; }
    if (sit.on) standUp();
    else if (pax) leaveTrain();
    else if (!ride && !drv && !nearRide() && !nearCab()) { const pc = nearCoach(), act = pc ? null : nearAct(); if (pc) boardTrain(pc); else if (act) act.run(); }
    else toggleRide();
  }
  if (e.code === 'KeyQ' && !e.repeat && !ride && !drv && !pax && !joy) { if (sit.on) standUp(); else sitDown(); }
  if (e.code === 'KeyP' && !e.repeat && !(ride && ride.fly)) { if (friends) friends.keyP(true); else wantShot = true; }
  if (e.code === 'KeyV' && pax && !e.repeat) { pax.view = 1 - pax.view; pax.yaw0 = yaw; toast(pax.view ? 'Outside view' : 'At the window'); }
  if (e.code === 'KeyH') toggleHelp();
  if (e.code === 'KeyC') cycleCamera();
  if (e.code === 'KeyY') { const k = Object.keys(SEASONS); season = k[(k.indexOf(season) + 1) % k.length]; applySeason(); }
  if (e.code === 'KeyJ' && !e.repeat) { const k = Object.keys(WEATHERS); setWeatherChoice(k[(k.indexOf(clock.wxChoice) + 1) % k.length]); }
  if (e.code === 'KeyB' && ride) hornFor(ride);
  if (e.code === 'KeyL' && !e.repeat) toggleLamps();
  if (ride && ride.fly && !e.repeat) planeKey(e.code);
  if (drv && !e.repeat) { if (e.code === 'KeyB') audio.horn(1); if (e.code === 'KeyV') { drvView = 1 - drvView; toast(drvView ? "Driver's view" : 'Outside view'); } }
  if (e.code === 'KeyV' && ride && ride.four) { inside = (inside + 1) % 3; yaw = player.facing + Math.PI; pitch = 0.28; toast(['Outside view', ride.name === 'minibus' || ride.name === 'bus' ? 'Inside the bus' : ride.name === 'erick' ? 'With the passengers' : 'Back seat view', "Driver's view"][inside]); }
});
window.addEventListener('keyup', (e) => { if (e.code === 'KeyP' && friends?.keyP(false)) wantShot = true; keys[e.code] = false; if (!e.shiftKey) keys.ShiftLeft = keys.ShiftRight = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

let dragging = false;
canvas.addEventListener('mousedown', () => {
  if (!started) return;
  if (document.pointerLockElement !== canvas) {
    canvas.requestPointerLock?.();
    dragging = true;
  }
});
window.addEventListener('mouseup', () => { dragging = false; });
window.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas || dragging) {
    yaw -= e.movementX * 0.0024 * settings.sens;
    autoYaw = performance.now();
    pitch = clamp(pitch + e.movementY * 0.0022 * settings.sens * (settings.invertY ? -1 : 1), -0.2, 1.25);
  }
});
window.addEventListener('wheel', (e) => { targetDist = clamp(targetDist + e.deltaY * 0.004, 2.2, 18); }, { passive: true });
document.addEventListener('pointerlockchange', () => {
  document.body.classList.toggle('locked', document.pointerLockElement === canvas);
});

function toggleHelp(force) {
  const h = $('help');
  const show = force ?? !h.classList.contains('show');
  h.classList.toggle('show', show);
  if (show) document.exitPointerLock?.(); // free the cursor so the tabs can be clicked and the panel scrolled
}
for (const b of document.querySelectorAll('.hp-tabs button')) b.addEventListener('click', () => {
  for (const o of document.querySelectorAll('.hp-tabs button')) o.classList.toggle('on', o === b);
  for (const pane of document.querySelectorAll('.hp-pane')) pane.classList.toggle('on', pane.dataset.pane === b.dataset.tab);
  document.querySelector('.hp-body').scrollTop = 0;
});
$('hp-close').addEventListener('click', () => toggleHelp(false));
$('help').addEventListener('click', (e) => { if (e.target.id === 'help') toggleHelp(false); }); // a click outside the card closes it
$('hintchip').addEventListener('click', () => toggleHelp());
function toggleMute() {
  audio.setMuted(!audio.muted);
  $('mute').textContent = audio.muted ? 'Sound off' : 'Sound on';
}
$('mute').addEventListener('click', toggleMute);

// full screen: the whole page fills the screen (Esc or U again to leave)
function toggleFullscreen() {
  const d = document, el = d.documentElement;
  if (!(d.fullscreenElement || d.webkitFullscreenElement)) {
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req) Promise.resolve(req.call(el, { navigationUI: 'hide' })).then(() => { if (started) canvas.requestPointerLock?.(); }).catch(() => {});
  } else (d.exitFullscreen || d.webkitExitFullscreen)?.call(d);
}
$('fullscreen').addEventListener('click', (e) => { toggleFullscreen(); e.currentTarget.blur(); });
for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(ev, () => {
  const on = !!(document.fullscreenElement || document.webkitFullscreenElement);
  $('fullscreen').textContent = on ? '⤡ Exit full screen' : '⛶ Full screen';
  window.dispatchEvent(new Event('resize'));
});
for (const t of TIMES) $('atmo').add(new Option(t.name, t.key));
for (const [k, w] of Object.entries(WEATHERS)) $('wx').add(new Option(w.name, k));
$('pc-count').addEventListener('click', (e) => { e.stopPropagation(); postcards?.toggle(); });
$('al-close').addEventListener('click', (e) => { e.stopPropagation(); postcards?.toggle(false); });
$('album').addEventListener('click', (e) => { if (e.target === $('album')) postcards?.toggle(false); });
$('sharebtn').addEventListener('click', (e) => { e.stopPropagation(); if (started) shareSpot(); $('sharebtn').blur(); });
// the weather switches: one button per weather, always to hand along the top of the screen
{
  const ICON = { clear: '☀️', windy: '🌬️', mist: '🌫️', overcast: '☁️', drizzle: '🌦️', rain: '🌧️', monsoon: '⛈️', storm: '🌩️' };
  for (const [k, w] of Object.entries(WEATHERS)) {
    const b = document.createElement('button');
    b.dataset.wx = k; b.title = w.name; b.textContent = ICON[k] ?? '•';
    b.addEventListener('click', (e) => { e.stopPropagation(); setWeatherChoice(k); b.blur(); });
    $('wxbar').append(b);
  }
}
$('wx').addEventListener('change', (e) => { setWeatherChoice(e.target.value); e.target.blur(); });
for (const [k, v] of Object.entries(SEASONS)) $('season').add(new Option(v.name.split(' — ')[0], k));
$('season').addEventListener('change', (e) => { season = e.target.value; applySeason(); e.target.blur(); });
$('sound').add(new Option('Sound: match the weather', 'auto'));
for (const [k, t] of Object.entries(THEMES)) $('sound').add(new Option('Sound: ' + t.label, k));
$('atmo').addEventListener('change', (e) => {
  setTimeOfDay(TIMES.find((t) => t.key === e.target.value));
  e.target.blur();
});
$('sound').addEventListener('change', (e) => {
  soundChoice = e.target.value;
  applySound();
  e.target.blur();
});

$('start').addEventListener('click', () => {
  started = true;
  audio.start();
  applySound();
  document.body.classList.add('started');
  canvas.requestPointerLock?.();
  setTimeout(() => toast('Gaon'), 900);
});

let toastTimer;
// event messages queue up so one doesn't wipe out the next
const toastQ = [];
let toastBusy = 0;
function queueToast(text) { toastQ.push(text); }
function pumpToasts(dt) {
  toastBusy -= dt;
  if (toastBusy <= 0 && toastQ.length) { toast(toastQ.shift()); toastBusy = 1.8; }
}
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ---------------- loop ----------------
let last = 0, time = 0, regionTimer = 0, currentRegion = '';
let shadowTick = 0;
// Dynamic resolution: if frames start taking too long the picture renders at a lower resolution (and is
// scaled up), and goes back up when there is time to spare — so the frame rate stays smooth.
// (never far below full sharpness: a blurry picture is worse than a few dropped frames)
let MAX_PR = Math.min(window.devicePixelRatio, 1.5), MIN_PR = MAX_PR * 0.85;
const dyn = { pr: MAX_PR, ema: 16, slowT: 0, fastT: 0, cpu: 8 };
function setPixelRatio(pr) {
  dyn.pr = pr;
  renderer.setPixelRatio(pr);
  composer.setPixelRatio(pr);
  composer.setSize(window.innerWidth, window.innerHeight);
}
// ---------------- settings ----------------
// Picture quality, the mouse and the field of view, kept in this browser (nothing is sent anywhere).
//  high: as built — sharp, soft sun shadows, a gentle bloom, trees and houses far out
//  medium: a little less sharp, lighter shadows, not quite so far
//  low: for older machines — no sun shadows, no bloom, a shorter view
const QUALITY = {
  high: { pr: 1.5, shadow: 2048, shadows: true, bloom: true, view: 1 },
  medium: { pr: 1.15, shadow: 1024, shadows: true, bloom: true, view: 0.8 },
  low: { pr: 0.9, shadow: 1024, shadows: false, bloom: false, view: 0.6 },
};
const settings = { quality: 'high', sens: 1, invertY: false, fov: 55 };
try { Object.assign(settings, JSON.parse(localStorage.getItem('gaon.settings') || '{}')); } catch { /* defaults */ }
const settingsView = () => (QUALITY[settings.quality] ?? QUALITY.high).view;
function applySettings(save = true) {
  const Q = QUALITY[settings.quality] ?? QUALITY.high;
  MAX_PR = Math.min(window.devicePixelRatio, Q.pr); MIN_PR = MAX_PR * 0.85;
  setPixelRatio(MAX_PR);
  if (sun.castShadow !== Q.shadows) sun.castShadow = Q.shadows;
  if (sun.shadow.mapSize.x !== Q.shadow) { sun.shadow.mapSize.set(Q.shadow, Q.shadow); sun.shadow.map?.dispose(); sun.shadow.map = null; }
  renderer.shadowMap.needsUpdate = true;
  bloom.enabled = Q.bloom;
  if (save) try { localStorage.setItem('gaon.settings', JSON.stringify(settings)); } catch { /* fine */ }
  // the panel shows what's set
  for (const b of document.querySelectorAll('#set-quality button')) b.classList.toggle('on', b.dataset.q === settings.quality);
  $('set-sens').value = settings.sens; $('set-sens-v').textContent = settings.sens.toFixed(1) + '×';
  $('set-fov').value = settings.fov; $('set-fov-v').textContent = settings.fov + '°';
  $('set-invert').checked = settings.invertY;
}
function toggleSettings(v) {
  const el = $('settings'), on = v ?? !el.classList.contains('show');
  el.classList.toggle('show', on);
  if (on && document.pointerLockElement) document.exitPointerLock();
}
{
  $('set-quality').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { settings.quality = b.dataset.q; applySettings(); } });
  $('set-sens').addEventListener('input', (e) => { settings.sens = +e.target.value; applySettings(); });
  $('set-fov').addEventListener('input', (e) => { settings.fov = +e.target.value; applySettings(); });
  $('set-invert').addEventListener('change', (e) => { settings.invertY = e.target.checked; applySettings(); });
  $('set-reset').addEventListener('click', () => { Object.assign(settings, { quality: 'high', sens: 1, invertY: false, fov: 55 }); applySettings(); });
  $('set-close').addEventListener('click', (e) => { e.stopPropagation(); toggleSettings(false); });
  $('settingsbtn').addEventListener('click', (e) => { e.stopPropagation(); toggleSettings(); });
  $('settings').addEventListener('click', (e) => { if (e.target.id === 'settings') toggleSettings(false); });
  for (const el of document.querySelectorAll('#settings, #settingsbtn')) for (const ev of ['mousedown', 'pointerdown']) el.addEventListener(ev, (e) => e.stopPropagation());
  applySettings(false);
}
function dynamicResolution(frameMs) {
  if (!started || document.hidden) return;
  dyn.ema += (Math.min(frameMs, 100) - dyn.ema) * 0.05;
  // lowering the resolution only helps when the GPU is the bottleneck: when the frame's own work (the CPU)
  // takes nearly the whole frame, leave the resolution alone
  const gpuBound = dyn.cpu < dyn.ema * 0.7;
  if (dyn.ema > 21 && gpuBound) { dyn.slowT += frameMs / 1000; dyn.fastT = 0; } else if (dyn.ema < 14) { dyn.fastT += frameMs / 1000; dyn.slowT = 0; } else { dyn.slowT = 0; dyn.fastT = 0; }
  if (dyn.slowT > 1 && dyn.pr > MIN_PR + 0.01) { setPixelRatio(Math.max(MIN_PR, dyn.pr - 0.15)); dyn.slowT = 0; }
  else if (dyn.fastT > 4 && dyn.pr < MAX_PR - 0.01) { setPixelRatio(Math.min(MAX_PR, dyn.pr + 0.1)); dyn.fastT = 0; }
}
const camPos = new THREE.Vector3();
const camTarget = new THREE.Vector3();
const tmp = new THREE.Vector3();
const lx = new THREE.Vector3(), ly = new THREE.Vector3();
const STEP_UP = 0.62;
const GRAVITY = 15;

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function updatePlayer(dt) {
  if (knock.on) { updateKnock(dt); return; }
  if (drv) { updateTrainDrive(dt); return; }
  if (pax) { updatePassenger(dt); return; }
  if (joy) { updateJoy(dt); return; }
  if (pumpS.on) { updatePump(dt); return; }
  if (sit.on) { updateSit(dt); return; }
  if (cricketOn) { updateCricket(dt); return; }
  if (ride && ride.fly) { if (ride.heli) updateHeli(dt); else updateFlight(dt); return; }
  $('tunnel').classList.remove('show');
  if (planeSound) { planeSound = false; audio.setPlane(false); audio.setHeli(false, 0); }
  $('flyhud').classList.remove('show');
  let f = 0, r = 0;
  if (started) {
    f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    r = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  }
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  let mx = f * fx + r * rx, mz = f * fz + r * rz;
  const len = Math.hypot(mx, mz);
  const running = keys.ShiftLeft || keys.ShiftRight;
  const riding = !!ride;
  const depthHere = wet(player.x, player.z) ? WY() - groundHeight(player.x, player.z, player.y) : -9;
  const four = riding && !!ride.four;
  const wantNitro = riding && !ride.water && ride.nitro && (keys.KeyN || keys.Space) && (four ? f > 0 && drive.v > 0 : len > 0);
  if (wantNitro && nitro.fuel > 0.02 && !nitro.locked) {
    if (!nitro.on) { nitro.on = true; audio.whoosh(); }
    nitro.fuel = Math.max(0, nitro.fuel - dt * 0.28);
    if (nitro.fuel <= 0.02) nitro.locked = true; // empty: must let it refill a bit
  } else {
    nitro.on = false;
    nitro.fuel = Math.min(1, nitro.fuel + dt * (riding ? 0.12 : 0.2));
    if (nitro.fuel > 0.3) nitro.locked = false;
  }
  const boosting = nitro.on;
  let target = len > 0 ? (riding ? (boosting ? ride.boost : running ? ride.run : ride.walk) : swim.on ? (running ? 2.4 : 1.4) : running ? 4.2 : 1.9) : 0;
  boostFx += ((boosting ? 1 : 0) - boostFx) * (1 - Math.exp(-dt * 3));
  if (!riding && !swim.on && depthHere > 0.15) target *= 0.6; // wading
  // climbing a steep hill slows you down a little
  if (len > 0) {
    const ahead = heightAt(player.x + (mx / len) * 0.8, player.z + (mz / len) * 0.8) - heightAt(player.x, player.z);
    target *= clamp(1 - Math.max(0, ahead / 0.8 - 0.25) * 0.8, 0.45, 1);
  }
  if (four) {
    // throttle / brake / reverse, and a bicycle-model turn: yaw rate = v / wheelbase * tan(steer angle)
    const top = boosting ? ride.boost : running ? ride.run : ride.walk;
    const slope = heightAt(player.x + Math.sin(player.facing) * 1.5, player.z + Math.cos(player.facing) * 1.5) - heightAt(player.x, player.z);
    const hill = clamp(1 - Math.max(0, slope / 1.5 - 0.2) * 0.9, 0.4, 1);
    let v = drive.v;
    drive.brake = false;
    if (f > 0) {
      if (v < -0.2) { v = Math.min(0, v + dt * 10); drive.brake = true; }
      else v += (top * hill - v) * (1 - Math.exp(-dt * ride.accel * (v < top * hill ? 1 : 3)));
    } else if (f < 0) {
      if (v > 0.2) { v = Math.max(0, v - dt * (8 + v * 0.3)); drive.brake = true; }
      else v = Math.max(-ride.rev, v - dt * 2.8);
    } else {
      const drag = dt * (0.9 + Math.abs(v) * 0.09);
      v = Math.abs(v) <= drag ? 0 : v - Math.sign(v) * drag;
    }
    drive.v = v;
    drive.steer += (r - drive.steer) * (1 - Math.exp(-dt * 4.5));
    const ang = drive.steer * 0.6 / (1 + Math.abs(v) * 0.045);
    const f0 = player.facing;
    player.facing -= (v / ride.wb) * Math.tan(ang) * dt;
    // it turns about its back axle, the way a real car or bus does — the back wheels follow, the front swings
    // into the turn — not about the driver's seat (a bus pivoting on its driver slides its tail sideways)
    const rg = rigOf(ride);
    if (rg) {
      rg.zr ??= (() => { const zs = rg.list.map((q) => q.z), zmin = Math.min(...zs); const back = rg.list.filter((q) => q.z < zmin + 0.4); return back.reduce((a, q) => a + q.z, 0) / back.length; })();
      player.x += rg.zr * (Math.sin(f0) - Math.sin(player.facing));
      player.z += rg.zr * (Math.cos(f0) - Math.cos(player.facing));
    }
    player.speed = Math.abs(v);
  } else player.speed += (target - player.speed) * (1 - Math.exp(-dt * (riding ? (target > player.speed ? ride.accel : ride.water ? 0.32 : 2.5) : swim.on ? 3 : player.grounded ? 7 : 1.5))); // (a boat glides on when you stop rowing)
  if (len > 0 && !four) {
    mx /= len; mz /= len;
    if (!riding) { player.dirX = mx; player.dirZ = mz; }
    player.facing = lerpAngle(player.facing, Math.atan2(mx, mz), 1 - Math.exp(-dt * (riding ? ({ moped: 1.8, auto: 1.5, boat: 0.9 }[ride.name] ?? 2.2) / (1 + boostFx * 0.4) : swim.on ? 4 : 10)));
  }

  if (riding) { const sg = four && drive.v < 0 ? -1 : 1; player.dirX = Math.sin(player.facing) * sg; player.dirZ = Math.cos(player.facing) * sg; }
  if (jumpQueued && player.grounded && started && !riding && !swim.on) {
    player.vy = 5.2;
    player.grounded = false;
  }
  jumpQueued = false;

  if (player.speed > 0.01) {
    const p = { x: player.x + player.dirX * player.speed * dt, z: player.z + player.dirZ * player.speed * dt };
    const rad = riding ? ride.rad : 0.28;
    const want = { x: p.x, z: p.z };
    if (riding && ride.probes) {
      const fx = Math.sin(player.facing), fz = Math.cos(player.facing);
      for (const o of ride.probes) {
        const q = { x: p.x + fx * o, z: p.z + fz * o };
        const q0x = q.x, q0z = q.z;
        resolveCollisions(q, rad, player.y);
        for (const v of vehicles) if (v !== ride && !v.water && !v.crash) pushOut(q, rad, parkedShape(v));
        for (const c of people.colliders()) if (!c.person) pushOut(q, rad, c);
        p.x += q.x - q0x; p.z += q.z - q0z;
      }
    } else resolveCollisions(p, rad, player.y);
    for (const v of vehicles) if (v !== ride && !v.water && !v.crash) pushOut(p, rad, parkedShape(v));
    for (const b of crashes.bodies) if (b.state !== 'fly') pushOut(p, rad, { kind: 'c', x: b.p.x, z: b.p.z, r: b.radius });
    for (const c of farm.colliders()) pushOut(p, rad, c);
    for (const c of wild.colliders()) pushOut(p, rad, c);
    if (trackScene) for (const c of trackScene.bodies()) pushOut(p, rad, c);
    if (!(riding && ride.water)) {
      for (const c of people.colliders()) if (!(c.person && riding)) pushOut(p, rad, c);
      for (const c of animals.colliders()) pushOut(p, rad, c);
      if (herds) for (const c of herds.colliders()) if (!(c.person && riding)) pushOut(p, rad, c); // (a herder in the way is knocked over, not a wall)
      if (buffs) for (const c of buffs.colliders()) pushOut(p, rad, c);
    }
    for (const b of train.boxes) pushOut(p, 0.3, b);
    for (const b of train.closedBoxes()) pushOut(p, rad, b);
    const blocked = (x, z) => {
      const g = groundHeight(x, z, player.y);
      // vehicles can't go into the river; on foot you can wade in and swim
      if (riding && ride.water) return g > WY() - 0.22 || !wet(x, z); // the boat needs water under it
      if ((riding && g < WY() - 0.2 && wet(x, z)) || g > Math.max(player.y, swim.on ? WY() - 0.6 : player.y) + STEP_UP) return true;
      // a slope too steep for this vehicle, ahead of it in the way it's going (its nose would dig in)
      if (riding && !ride.fly) {
        const R = reachOf(ride), ext = (four && drive.v < 0) ? -R.bk : R.fr;
        const ga = groundHeight(x + player.dirX * ext, z + player.dirZ * ext, player.y + 1);
        if ((ga - g) / Math.max(0.5, ext) > (CLIMB[ride.name] ?? 0.5) && ga > player.y) return true;
      }
      return false;
    };
    if (blocked(p.x, p.z)) {
      if (!blocked(p.x, player.z)) p.z = player.z;
      else if (!blocked(player.x, p.z)) p.x = player.x;
      else { p.x = player.x; p.z = player.z; }
    }
    const d = Math.hypot(p.x, p.z);
    if (d > PLAY_RADIUS) { p.x *= PLAY_RADIUS / d; p.z *= PLAY_RADIUS / d; }
    // a four-wheeler that runs into something stops, it doesn't slide along at full speed
    if (four) {
      const moved = (p.x - player.x) * player.dirX + (p.z - player.z) * player.dirZ, meant = player.speed * dt;
      if (meant > 0.02 && moved < meant * 0.5) drive.v *= Math.exp(-dt * 6);
    }
    void want;
    player.x = p.x; player.z = p.z;
  } else {
    // still get nudged by a passing train
    const p = { x: player.x, z: player.z };
    for (const b of train.boxes) pushOut(p, 0.3, b);
    player.x = p.x; player.z = p.z;
  }

  // in the boat: the river's current carries you gently downstream (more so when you're not rowing), and a wake
  // spreads out behind the stern
  if (ride?.water) {
    const drift = 0.32 * (1 - Math.min(1, player.speed / 2.5) * 0.6), q2 = { x: player.x, z: player.z + drift * dt };
    if (groundHeight(q2.x, q2.z, player.y) < WY() - 0.22 && wet(q2.x, q2.z)) player.z = q2.z;
    if (player.speed > 0.4 && Math.random() < dt * (4 + player.speed * 5)) {
      const fx = Math.sin(player.facing), fz = Math.cos(player.facing), lx = Math.cos(player.facing), lz = -Math.sin(player.facing), sd = Math.random() < 0.5 ? -1 : 1;
      swim.splash.emit(player.x - fx * 2.3 + lx * sd * 0.3, WY() + 0.03, player.z - fz * 2.3 + lz * sd * 0.3, -fx * 0.3 + lx * sd * 0.5, 0.15 + Math.random() * 0.2, -fz * 0.3 + lz * sd * 0.5, 0.9, 0.04, 0.25, 0.55);
      swim.splash.emit(player.x + fx * 2.25, WY() + 0.03, player.z + fz * 2.25, lx * sd * 0.7, 0.2, lz * sd * 0.7, 0.6, 0.04, 0.2, 0.5); // the bow wave
    }
  }
  // Tez Nadi's current: wade into it and it pushes you downstream (harder in the middle)
  if (!ride) {
    const n = RAPID.path.near(player.x, player.z);
    if (n && n.d < RAPID.half && player.y < rapidLevel(n.s) + 0.25) {
      const q = RAPID.path.at(n.s), k = RAPID.speed * 0.55 * (1 - (n.d / RAPID.half) ** 2) * dt;
      const p2 = { x: player.x + q.tx * k, z: player.z + q.tz * k };
      resolveCollisions(p2, 0.28, player.y);
      player.x = p2.x; player.z = p2.z;
      if (Math.random() < dt * 3) splashAround(3, 0.7);
    }
  }
  let gy = groundHeight(player.x, player.z, player.y);
  if (riding && ride.water) { gy = WY(); player.grounded = true; player.vy = 0; }
  // into deep water: float and swim; climb out where it gets shallow
  const depth = wet(player.x, player.z) ? WY() - gy : -9;
  const wasSwim = swim.on;
  if (!riding) swim.on = swim.on ? depth > 0.5 : depth > 0.66;
  if (swim.on !== wasSwim) { splashAround(14, 1.4); audio.splash(1); }
  if (swim.on) {
    swim.b += ((player.speed > 0.3 ? 1 : 0) - swim.b) * (1 - Math.exp(-dt * 3));
    gy = Math.max(gy, WY() - (0.95 - swim.b * 0.8));
    player.grounded = true;
    player.vy = 0;
    swim.stroke += dt * (1.6 + player.speed * 1.4);
    if (swim.stroke > Math.PI) { swim.stroke -= Math.PI; if (player.speed > 0.3) { splashAround(5, 0.8); audio.splash(0.45); } }
  }
  const rig = riding && !ride.water && !ride.fly ? rigOf(ride) : null;
  if (rig) {
    // on its wheels: the height, pitch and roll of the ground under all of them
    const y1 = player.y + 1;
    groundPose(rig, player.x, player.z, player.facing, (x, z) => groundHeight(x, z, y1), _pose);
    gy = _pose.y;
  } else if (riding && !ride.water && !ride.fly) {
    const R = reachOf(ride), fx = Math.sin(player.facing), fz = Math.cos(player.facing);
    const hf = groundHeight(player.x + fx * R.fr, player.z + fz * R.fr, player.y + 1), hb = groundHeight(player.x + fx * R.bk, player.z + fz * R.bk, player.y + 1);
    gy = Math.max(gy, hb + (hf - hb) * (-R.bk / (R.fr - R.bk)));
  }
  if (player.grounded) {
    if (gy < player.y - 0.5) {
      player.grounded = false; // stepped off an edge
      player.vy = 0;
    } else {
      player.y += (gy - player.y) * (1 - Math.exp(-dt * (ride && !ride.water ? 9 : 16)));
      // easing is only for settling down onto the ground: going uphill it would trail behind the slope (half a metre
      // at speed) and the wheels and nose would sink into the hill, so never sit below the ground
      if (player.y < gy - 0.02) player.y = gy - 0.02;
    }
  }
  if (!player.grounded) {
    player.vy -= GRAVITY * dt;
    player.y += player.vy * dt;
    if (player.y <= gy) {
      player.y = gy;
      if (player.vy < -1) audio.footstep(0.5, true);
      player.vy = 0;
      player.grounded = true;
    }
  }
  boy.root.position.set(player.x, player.y, player.z);
  boy.root.rotation.y = player.facing;
  if (riding) {
    const bike = ride.obj;
    // lean into turns, steer the fork, and let the camera swing round behind
    let yawRate = (player.facing - lastFacing) / Math.max(dt, 1e-3);
    if (yawRate > 20 || yawRate < -20) yawRate = 0;
    if (four) bikeSteer = -drive.steer * 0.45;
    else bikeSteer += (clamp(yawRate * 0.25, -0.5, 0.5) - bikeSteer) * (1 - Math.exp(-dt * 8));
    bikeRoll += (clamp(-yawRate * player.speed * 0.05 * ride.lean, -0.32, 0.32) - bikeRoll) * (1 - Math.exp(-dt * 5));
    boy.root.rotation.z = bikeRoll + rideRoll;
    // pitch with the slope of the ground under the wheels
    if (rig) {
      // the body follows the ground's slope like a sprung chassis: smoothly, never snapping over every bump
      ridePitch += (_pose.pitch - ridePitch) * (1 - Math.exp(-dt * 8));
      rideRoll += (_pose.roll - rideRoll) * (1 - Math.exp(-dt * 8));
    } else if (!ride.water) {
      // tilt along the ground under its real front and back (a bullock cart reaches 4.5 m ahead of its driver)
      const fx = Math.sin(player.facing), fz = Math.cos(player.facing), R = reachOf(ride);
      const hf = groundHeight(player.x + fx * R.fr, player.z + fz * R.fr, player.y + 1), hb = groundHeight(player.x + fx * R.bk, player.z + fz * R.bk, player.y + 1);
      ridePitch += (-Math.atan2(hf - hb, R.fr - R.bk) - ridePitch) * (1 - Math.exp(-dt * 11));
      // and sideways, on a slope across the way it's going (local +x is the left side)
      if (four) {
        const lx = Math.cos(player.facing), lz = -Math.sin(player.facing);
        const hL = groundHeight(player.x + lx * R.w, player.z + lz * R.w, player.y + 1), hR = groundHeight(player.x - lx * R.w, player.z - lz * R.w, player.y + 1);
        rideRoll += (Math.atan2(hL - hR, 2 * R.w) - rideRoll) * (1 - Math.exp(-dt * 11));
      } else rideRoll *= 0.9;
    } else ridePitch *= 0.9;
    // the body squats back under power and dips its nose under the brakes
    const vNow = four ? drive.v : player.speed;
    const acc = clamp((vNow - (drive.lastV ?? vNow)) / Math.max(dt, 1e-3), -12, 12);
    drive.lastV = vNow;
    drive.squat = (drive.squat ?? 0) + (clamp(-acc * (four ? 0.006 : 0.004), -0.05, 0.05) - (drive.squat ?? 0)) * (1 - Math.exp(-dt * 5));
    boy.root.rotation.x = ridePitch + (ride.water ? 0 : drive.squat);
    // then each wheel down onto the ground under it (and the body lifted if a spring can't reach)
    if (rig && player.grounded) {
      const lift = settleWheels(rig, player.y, boy.root.rotation.x, boy.root.rotation.z);
      if (lift > 0) { player.y += lift; boy.root.position.y = player.y; }
    }
    // wheels on dry earth raise a little dust
    if (!ride.water && player.speed > 4 && !ATMO.rainy && Math.random() < dt * player.speed * 1.2) {
      const side = (Math.random() - 0.5) * (four ? 1.3 : 0.2);
      dust.emit(player.x - player.dirX * (four ? 1.2 : 0.6) + Math.cos(player.facing) * side, player.y + 0.08, player.z - player.dirZ * (four ? 1.2 : 0.6) - Math.sin(player.facing) * side,
        -player.dirX * 0.6 + (Math.random() - 0.5) * 0.5, 0.25 + Math.random() * 0.35, -player.dirZ * 0.6 + (Math.random() - 0.5) * 0.5, 1.1 + Math.random() * 0.6, 0.15, 1.1, 0.28, 0.6);
    }
    if (ride.water) {
      boy.setGear(gearMode === 'lantern' ? 'lantern' : 'none');
      bike.update(dt, player.speed, clamp(yawRate * 0.6, -1, 1), true, ATMO.glow > 0.5 ? 1 : 0);
      boy.row(dt, bike);
      for (const sx of bike.dips) { splashAround(3, 0.5); audio.splash(0.25); }
    } else {
      boy.setGear(['auto', 'car', 'minibus', 'erick', 'bus', 'jeep'].includes(ride.name) ? 'none' : gearMode); // nobody holds an umbrella or a lantern at the wheel
      boy.ride(dt, bike, player.speed);
    }
    if (player.speed > 1.5 && !dragging && performance.now() - autoYaw > 1500) yaw = lerpAngle(yaw, player.facing + Math.PI, 1 - Math.exp(-dt * 1.4));
  } else if (swim.on) {
    boy.setGear('none');
    boy.swim(dt, player.speed, swim.b);
  } else {
    boy.setGear(gearMode);
    boy.update(dt, player.grounded ? player.speed : player.speed * 0.3, !player.grounded, player.vy);
  }
  lastFacing = player.facing;
  if (ride && ride.four) ride.obj.brake = drive.brake || (drive.v === 0 && keys.KeyS);
  for (const v of vehicles) if (!(v === ride && v.water)) v.obj.update(dt, v === ride ? (v.four ? drive.v : player.speed) : 0, bikeSteer, v === ride, v === ride && lamps.on ? 1 : 0);
  // nitro: exhaust flames on motor vehicles, a dust-and-wind trail behind the bicycle
  if (ride && boosting) {
    const o = ride.obj;
    if (ride.flame && o.exhaust) {
      const ex = o.root.localToWorld(tmp.copy(o.exhaust));
      for (let i = 0; i < 6; i++) flames.emit(ex.x, ex.y, ex.z, -player.dirX * (3 + Math.random() * 3) + (Math.random() - 0.5), (Math.random() - 0.3) * 0.8, -player.dirZ * (3 + Math.random() * 3) + (Math.random() - 0.5), 0.18 + Math.random() * 0.12, 0.25, 0.05, 1, Math.random() * 0.5);
    }
    for (let i = 0; i < 3; i++) dust.emit(player.x - player.dirX * 0.6 + (Math.random() - 0.5) * 0.6, player.y + 0.1, player.z - player.dirZ * 0.6 + (Math.random() - 0.5) * 0.6, -player.dirX * 1.5, 0.5 + Math.random() * 0.5, -player.dirZ * 1.5, 0.8 + Math.random() * 0.5, 0.2, 1.4, 0.7, 0.6);
  }
  flames.update(dt);
  dust.update(dt);
  // the riding HUD: speed, nitro gauge, key hints
  const hud = $('ridehud');
  hud.classList.toggle('show', !!ride && started && !ride.water);
  document.body.classList.toggle('driving', !!ride && started && player.speed > 1.5);
  // the boat has its own little panel: the oars dipping with each stroke, the pace, and how far the bank is
  $('boathud').classList.toggle('show', !!ride?.water && started);
  if (ride?.water) {
    const ph = ride.obj.phase ?? 0, pull = Math.min(1, player.speed / ride.run);
    const turn = (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0);
    // each oar sweeps with the stroke; turning, only the outside oar pulls
    const sweep = (side) => { const on = turn === 0 ? 1 : (side === turn ? 0.25 : 1.2); return Math.sin(ph) * 22 * on * Math.max(pull, keys.KeyW || keys.ArrowUp ? 0.6 : 0); };
    $('bh-oarL').setAttribute('transform', `rotate(${(-sweep(-1)).toFixed(1)} 46 27)`);
    $('bh-oarR').setAttribute('transform', `rotate(${sweep(1).toFixed(1)} 74 27)`);
    const kmh = player.speed * 3.6;
    $('bh-speed').textContent = kmh < 0.5 ? '0' : kmh.toFixed(1);
    $('bh-pace').textContent = kmh < 0.6 ? 'drifting' : kmh < 4 ? 'gliding along' : kmh < 7.5 ? 'rowing steady' : 'rowing hard';
    boatHudT -= dt;
    if (boatHudT <= 0) {
      boatHudT = 0.4;
      const b = bankNear(), el = $('bh-bank');
      el.classList.toggle('near', !!b);
      el.innerHTML = b ? `The bank is right here — <kbd>E</kbd> to step ashore` : '<kbd>W</kbd> row · <kbd>A</kbd><kbd>D</kbd> turn · <kbd>Shift</kbd> pull harder';
    }
  }
  if (ride && !ride.water) {
    $('rh-speed').textContent = Math.round(player.speed * 3.6);
    setDial(player.speed * 3.6, (ride.boost || ride.run || 10) * 3.6);
    $('rh-name').textContent = { auto: 'Auto rickshaw', car: 'Little car', minibus: 'Gaon minibus', erick: 'E-rickshaw', bus: 'Village bus', jeep: 'Jeep', moped: 'Motorbike', cart: 'Bullock cart', firetruck: 'Fire tender 101', ambulance: 'Ambulance 108', police: 'Police jeep' }[ride.name] ?? ride.name[0].toUpperCase() + ride.name.slice(1);
    hud.classList.toggle('four', !!ride.four);
    hud.classList.toggle('bus', !!ride.obj.seats);
    if (ride.four) {
      const g = drive.v < -0.15 ? 'r' : Math.abs(drive.v) < 0.15 && !f ? 'n' : 'd';
      for (const k of ['r', 'n', 'd']) $('g-' + k).classList.toggle('on', g === k);
      $('rh-wheel').style.transform = `rotate(${(drive.steer * 120).toFixed(1)}deg)`; // the wheel in the corner turns as you steer
    }
    if (ride.obj.seats && passengers) {
      const n = passengers.aboardOf(ride.obj).length, cap = ride.obj.seats.length;
      $('px-count').textContent = `🧍 ${n} / ${cap} aboard`;
      $('px-fare').textContent = `₹${passengers.fare}`;
      const drops = passengers.nextDrops(ride.obj);
      $('px-next').textContent = drops.length ? 'Drop: ' + drops.map(([k, c]) => `${k}${c > 1 ? ' ×' + c : ''}`).join(', ') : 'Stop at a 🚏 bus stop to pick people up';
    }
    const boat = !!ride.water;
    $('rh-name').textContent = boat ? 'Rowing boat' : $('rh-name').textContent;
    $('rh-label').textContent = boat ? 'STROKE' : nitro.locked ? 'REFILL' : 'NITRO';
    // in the boat the bar pulses with each pull of the oars
    const stroke = boat ? Math.max(0, Math.sin(ride.obj.phase)) * Math.min(1, player.speed / ride.run) : 0;
    $('rh-nitro').style.width = `${Math.round((boat ? stroke : nitro.fuel) * 100)}%`;
    $('rh-key').textContent = boat ? 'W' : 'N';
    hud.classList.toggle('boost', boosting);
    hud.classList.toggle('empty', nitro.locked && !boat);
    hud.classList.toggle('boat', boat);
    hud.classList.toggle('nonitro', !boat && !ride.nitro);
  }
  document.body.classList.toggle('nitro', boosting);
  const fov = (camMode >= 3 || (inside && ride && ride.four) ? camera.fov : settings.fov) + (camMode >= 3 || (inside && ride && ride.four) ? 0 : boostFx * 12);
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
  // the moped: engine note and blue-grey two-stroke smoke
  const onMoped = ride && ['moped', 'scooter', 'auto', 'car', 'minibus', 'jeep', 'bus'].includes(ride.name);
  audio.setRide(ride ? ride.sound ?? ride.name : null, player.speed, four ? f > 0 : len > 0, boosting);
  // with the siren going, the road keeps clearing ahead
  if (ride?.siren && ride.obj.siren) { sirenT -= dt; if (sirenT < 0) { sirenT = 1.1; makeWay(); } }
  audio.setReverse(!!(four && drive.v < -0.1 && ride.name !== 'bicycle'));
  if (onMoped) {
    mopedAcc += dt * (4 + player.speed * 1.2);
    const ex = ride.obj.root.localToWorld(tmp.copy(ride.obj.exhaust));
    while (mopedAcc > 1) {
      mopedAcc -= 1;
      mopedSmoke.emit(ex.x, ex.y, ex.z, -player.dirX * 0.6 + (Math.random() - 0.5) * 0.3, 0.3 + Math.random() * 0.3, -player.dirZ * 0.6 + (Math.random() - 0.5) * 0.3, 1.6, 0.08, 0.7, 0.45, 0.3);
    }
  }
  mopedSmoke.update(dt);
  swim.splash.update(dt);
  let nv = !ride ? nearRide() : null;
  if (!nv && !ride && !swim.on) { const ct = nearCab(); if (ct) nv = { ask: 'drive the train 🚂', cab: ct }; }
  if (!nv && !ride && !swim.on) { if (nearCoach()) nv = { ask: 'ride the train as a passenger 🚃' }; else { const act = nearAct(); if (act) nv = { ask: act.ask }; } }
  if (nv && swim.on && !nv.water) nv = null;
  const keyChips = (list) => list.map(([k, t]) => `<span class="chip"><kbd>${k}</kbd>${t}</span>`).join('');
  const fp = !ride && !swim.on && !drv && !pax && fire ? fire.prompt(player.x, player.z) : null;
  const html = ride ? keyChips(ride.help) : nv || fp ? keyChips([...(nv ? [['E', swim.on ? 'climb into the boat' : nv.ask]] : []), ...(fp ? [['F', fp]] : [])]) : swim.on ? keyChips([['W', 'swim'], ['Shift', 'swim faster']]) : '';
  if ($('prompt').dataset.html !== html) { $('prompt').innerHTML = html; $('prompt').dataset.html = html; }
  $('prompt').classList.toggle('show', started && (ride ? (player.speed < 0.5 && !(four && f)) || ridePromptT > 0 : !!nv || !!fp || (swim.on && player.speed < 0.2)));
  ridePromptT -= dt;
}

// ---------------- driving the train ----------------
// Walk up to the engine's cab while a train stands at a station and press E: W opens the regulator, S brakes
// (and once stopped, backs it up), Space is the brake, B the whistle, V the driver's view. Stop at a platform
// and the passengers get on and off; press E again (stopped) to climb down and hand it back to its crew.
const CAB = new THREE.Vector3(0.75, 2.17, -4.55);
const _cw = new THREE.Vector3(), _cf = new THREE.Vector3();
function nearCab() {
  if (!train || ride || drv || knock.on) return null;
  for (const tr of train.trains) {
    if (tr.mode !== 'dwell') continue;
    for (const L of tr.locos) {
      if (!L.g.visible) continue;
      L.g.updateMatrixWorld();
      const c = L.g.localToWorld(_cw.copy(CAB));
      if (Math.hypot(c.x - player.x, c.z - player.z) < 4.6) { tr.cabLoco = L; return tr; }
    }
  }
  return null;
}
function startDriving(tr) {
  drv = tr;
  tr.occupied = true;
  tr.takeControl();
  const L = tr.cabLoco ?? tr.loco;
  tr.cabSign = L.rev ? -1 : 1;
  drvLoco = L;
  L.g.add(boy.root);
  boy.root.position.copy(CAB);
  boy.root.rotation.set(0, 0, 0);
  boy.setGear('none');
  drvView = 0;
  yaw = L.g.rotation.y + Math.PI; pitch = 0.3;
  audio.horn(1);
  ridePromptT = 5;
  toast(`Driving the ${tr.name}! W to go, S to brake — stop at a platform to pick people up`);
}
function stopDriving() {
  const tr = drv;
  if (Math.abs(tr.v) > 0.05) { toast('Stop the train first (S or Space)'); return; }
  const L = drvLoco;
  L.g.updateMatrixWorld();
  // climb down on the platform side if there is one, else beside the line
  let best = null;
  for (const sx of [1, -1]) {
    const p = L.g.localToWorld(new THREE.Vector3(sx * 3.0, 0, -4.2));
    const g = groundHeight(p.x, p.z, 3);
    if (!best || g > best.g) best = { x: p.x, z: p.z, g };
  }
  drv = null; tr.occupied = false;
  tr.release();
  scene.add(boy.root);
  player.x = best.x; player.z = best.z; player.y = best.g + 0.05; player.vy = 0; player.grounded = true; player.speed = 0;
  player.facing = L.g.rotation.y;
  boy.root.rotation.set(0, player.facing, 0);
  $('tunnel').classList.remove('show');
  $('ridehud').classList.remove('show', 'bus', 'four');
  toast(tr.at ? `You climbed down at ${tr.at.name}` : 'You climbed down from the engine');
}
function updateTrainDrive(dt) {
  const tr = drv;
  const w = started && (keys.KeyW || keys.ArrowUp), sk = started && (keys.KeyS || keys.ArrowDown), brake = started && keys.Space;
  tr.drive.throttle = 0; tr.drive.brake = 0;
  if (brake) tr.drive.brake = 1;
  const vc = tr.v * (tr.termini ? tr.cabSign : 1); // speed as seen from this cab: + is forward
  if (brake) { /* braking */ }
  else if (w) { if (vc < -0.2) tr.drive.brake = 1; else tr.drive.throttle = 1; }
  else if (sk) { if (vc > 0.2) tr.drive.brake = 1; else tr.drive.throttle = -1; }
  if (tr.bumped) { tr.bumped = false; toast('End of the line — the buffers! Back up with S'); }
  if (tr.blockedAhead) { tr.blockedAhead = false; if (performance.now() - (drvBlockT ?? 0) > 4000) { drvBlockT = performance.now(); toast('A train is standing on the line ahead — wait for it to move on'); } }
  // the boy stands at the controls; the player is wherever the cab is
  boy.update(dt, 0, false, 0);
  boy.root.updateWorldMatrix(true, false);
  boy.root.getWorldPosition(_cw);
  player.x = _cw.x; player.z = _cw.z; player.y = _cw.y;
  player.facing = drvLoco.g.rotation.y;
  player.speed = Math.abs(tr.v); player.dirX = Math.sin(player.facing); player.dirZ = Math.cos(player.facing);
  player.grounded = true; player.vy = 0;
  if (!dragging && performance.now() - autoYaw > 1500) yaw = lerpAngle(yaw, drvLoco.g.rotation.y + Math.PI, 1 - Math.exp(-dt * 2));
  // in a tunnel: dark, with the beat of the engine
  const inTunnel = !tr.openAt(drvLoco.s ?? tr.head);
  $('tunnel').classList.toggle('show', false); void inTunnel; // the tunnels are real now: you see the walls and lamps go by
  // HUD: speed, how hard she's working, passengers and the next stop
  const hud = $('ridehud');
  hud.classList.add('show', 'bus'); hud.classList.remove('four', 'boat', 'boost', 'empty');
  $('rh-name').textContent = 'Steam engine';
  $('rh-speed').textContent = Math.round(Math.abs(tr.v) * 3.6);
  setDial(Math.abs(tr.v) * 3.6, 80);
  $('rh-label').textContent = vc < -0.1 ? 'REVERSE' : 'STEAM';
  $('rh-nitro').style.width = `${Math.round(Math.min(1, Math.abs(tr.v) / 22) * 100)}%`;
  $('rh-key').textContent = 'W';
  $('px-count').textContent = `🧍 ${tr.aboard} / ${CAPACITY} aboard`;
  $('px-fare').textContent = tr.name;
  let nxt = null, nd = Infinity;
  for (const h of tr.halts) { const d = Math.abs(tr.stopFor(h) - tr.head); if (d < nd) { nd = d; nxt = h; } }
  $('px-next').textContent = tr.at ? `At ${tr.at.name} — passengers getting on and off` : nxt ? `${nxt.name} station: ${Math.round(nd)} m` : 'Open line';
  // key hints while stopped
  const keyChips = (list) => list.map(([k, t]) => `<span class="chip"><kbd>${k}</kbd>${t}</span>`).join('');
  const html = keyChips([['W', 'go'], ['S', 'brake · reverse'], ['Space', 'brake'], ['B', 'whistle'], ['V', 'view'], ['E', 'climb down']]);
  if ($('prompt').dataset.html !== html) { $('prompt').innerHTML = html; $('prompt').dataset.html = html; }
  $('prompt').classList.toggle('show', started && (Math.abs(tr.v) < 0.3 || ridePromptT > 0));
  ridePromptT -= dt;
  audio.setRide(null, 0, false, false); audio.setReverse(false);
  flames.update(dt); dust.update(dt); mopedSmoke.update(dt);
  for (const o of vehicles) if (!o.water) o.obj.update(dt, 0, 0, false, 0);
}
function trainCamera(dt, lg = drvLoco.g, view = drvView) {
  lg.updateMatrixWorld();
  if (view === 1) {
    const off = Math.atan2(Math.sin(yaw - lg.rotation.y - Math.PI), Math.cos(yaw - lg.rotation.y - Math.PI));
    camIn.set(1.05, 3.8, -3.9);
    lookIn.set(1.05 + Math.sin(-off) * 20, 3.5 + (0.3 - pitch) * 14, -3.9 + Math.cos(-off) * 20);
    lg.localToWorld(camIn); lg.localToWorld(lookIn);
    camera.position.copy(camIn);
    camera.lookAt(lookIn);
    if (Math.abs(camera.fov - 66) > 0.05) { camera.fov = 66; camera.updateProjectionMatrix(); }
    return;
  }
  const c = lg.localToWorld(_cf.set(0, 3, -2));
  const d = 13 + targetDist * 1.5, el = clamp(pitch, -0.05, 1.2);
  camPos.set(c.x + Math.sin(yaw) * Math.cos(el) * d, c.y + Math.sin(el) * d + 1, c.z + Math.cos(yaw) * Math.cos(el) * d);
  const minY = heightAt(camPos.x, camPos.z) + 1;
  if (camPos.y < minY) camPos.y = minY;
  camera.position.lerp(camPos, 1 - Math.exp(-dt * 6));
  camTarget.set(c.x + Math.sin(lg.rotation.y) * 6, c.y, c.z + Math.cos(lg.rotation.y) * 6);
  camera.lookAt(camTarget);
  if (Math.abs(camera.fov - settings.fov) > 0.05) { camera.fov = settings.fov; camera.updateProjectionMatrix(); }
}

// ---------------- flying the plane ----------------
// R/F power, S/W pull up / push down, A/D bank (and steer on the ground), Z/X rudder, G gear, L flaps,
// Space brakes, P autopilot (wings level, hold height), B tricolour smoke, V cockpit view, I invert pitch.
let flyView = 0, planeSound = false;
const flyFx = { smoke: false, invert: false, ap: false, apAlt: 0, edgeT: 0, crashT: 0, stallT: 0, dustAcc: 0, smokeAcc: 0, warnT: 0 };
const stick = { p: 0, r: 0, y: 0 };
const smokeTri = ['#ff9a2e', '#ffffff', '#16924a'].map((c) => { const p = new Puffs({ max: 360, color: c, dark: c, opacity: 0.8, buoyancy: 0.12, drag: 0.4 }); scene.add(p.mesh); return p; });
const SMOKE_AT = [new THREE.Vector3(0.55, 1.45, -5.0), new THREE.Vector3(-0.3, 1.45, -5.1), new THREE.Vector3(-1.15, 1.45, -5.0)];
const _pw = new THREE.Vector3(), _pf = new THREE.Vector3(), _pu = new THREE.Vector3();
// what the plane can run into: anything with a height it is below, anything without one when it's low
function planeHit(p, r, y, agl = 0) {
  const x0 = p.x, z0 = p.z;
  forColliders(p.x, p.z, r, (o) => {
    if (o.height !== undefined ? y > o.height : agl > 6.5) return;
    if (o.minY !== undefined && y < o.minY) return;
    pushOut(p, r, o);
  });
  if (agl < 2.5) for (const v of vehicles) if (v !== ride && !v.water && !v.crash) pushOut(p, r, parkedShape(v));
  return Math.hypot(p.x - x0, p.z - z0) > 0.002;
}
const planeEnv = { ground: (x, z) => groundHeight(x, z), wet, get waterY() { return WY(); }, hit: planeHit };
function planeKey(code) {
  const F = flight;
  if (ride.heli) { heliKey(code); return; }
  if (F.crashed) return;
  if (code === 'KeyG') {
    if (F.ground && !F.belly && F.gearDown) { toast("Not on the ground — you'd sit on your belly!"); return; }
    F.gearDown = !F.gearDown;
    if (F.belly && F.gearDown) { F.belly = false; toast('Wheels down — the plane lifts back onto its gear'); return; }
    toast(F.gearDown ? 'Gear down ↓ — ready to land' : 'Gear up ↑ — sleek and fast');
  }
  if (code === 'KeyL') { F.flaps = (F.flaps + 1) % 3; toast(['Flaps up', 'Flaps 1 — for take-off', 'Flaps full — for a slow landing'][F.flaps]); }
  if (code === 'KeyB') { flyFx.smoke = !flyFx.smoke; toast(flyFx.smoke ? 'Tricolour smoke on 🇮🇳' : 'Smoke off'); }
  if (code === 'KeyP') {
    if (F.ground) { toast('Autopilot works once you are flying'); return; }
    flyFx.ap = !flyFx.ap; flyFx.apAlt = Math.max(F.pos.y, groundHeight(F.pos.x, F.pos.z) + 40);
    toast(flyFx.ap ? `Autopilot on — wings level, holding ${Math.round(flyFx.apAlt - groundHeight(F.pos.x, F.pos.z))} m` : 'Autopilot off');
  }
  if (code === 'KeyK') { F.assist = !F.assist; toast(F.assist ? 'Flying assist on — wings level themselves, bank stops at 45°' : 'Stunt mode! No limits — loops and rolls (careful!)'); }
  if (code === 'KeyI') { flyFx.invert = !flyFx.invert; toast(flyFx.invert ? 'Pitch inverted: W pulls up' : 'Pitch normal: S pulls up, like a real yoke'); }
  if (code === 'KeyV') { flyView = 1 - flyView; yaw = F.heading + Math.PI; pitch = 0.22; toast(flyView ? 'Cockpit view' : 'Chase view'); }
}
function planeEvent(e) {
  const F = flight;
  if (e.type === 'liftoff') { toast(ride?.heli ? 'Lift-off! 🚁' : 'Airborne! 🛫'); audio.whoosh(); }
  else if (e.type === 'touchdown') {
    if (e.air > 2.5) toast(e.sink < 1.2 ? 'Butter-smooth landing! ⭐⭐⭐' : e.sink < 2.6 ? 'Nice landing! ⭐⭐' : 'Thump! A firm landing ⭐');
    audio.crash(clamp(e.sink / 10, 0.04, 0.3), 0.2);
    for (let i = 0; i < 14; i++) dust.emit(F.pos.x + (Math.random() - 0.5) * 3, F.pos.y + 0.1, F.pos.z + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2, 0.5 + Math.random(), (Math.random() - 0.5) * 2, 1.2, 0.3, 1.8, 0.6, 0.6);
  } else if (e.type === 'belly') {
    toast('Belly landing! Scraaape… stop, then press G to drop the wheels');
    audio.crash(0.6, 1); scare.shake = Math.max(scare.shake, 0.7);
  } else if (e.type === 'bump') audio.crash(0.25, 1);
  else if (e.type === 'crash') {
    const why = { rotor: 'The rotor blades struck something!', hard: 'Too hard! The undercarriage gave way', wing: 'A wingtip caught the ground!', nose: 'Nose first into the ground!', tail: 'Tail strike!', hit: 'Crashed into something!', water: 'Splash! Down in the river', train: 'Hit by the train!' }[e.why] ?? 'Crash!';
    toast('💥 ' + why);
    audio.crash(1, 1);
    if (e.why === 'water') { audio.splash(1.6); for (let i = 0; i < 40; i++) swim.splash.emit(F.pos.x + (Math.random() - 0.5) * 6, WY() + 0.1, F.pos.z + (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4, 2 + Math.random() * 4, (Math.random() - 0.5) * 4, 1.2, 0.3, 0.8, 0.9); }
    scare.shake = 1.5;
    flyFx.crashT = 4.5; flyFx.crashWhy = e.why; flyFx.ap = false;
    // the wreck settles crooked on the ground
    const gy = groundHeight(F.pos.x, F.pos.z);
    F.q.setFromEuler(new THREE.Euler(e.why === 'nose' ? 0.3 : 0.1, F.heading, e.why === 'wing' ? 0.35 : (Math.random() - 0.5) * 0.3, 'YXZ'));
    F.pos.y = e.why === 'water' ? WY() - 0.9 : gy - 0.3;
    setTimeout(() => audio.say('अरे बाप रे!', { roman: 'Arre baap re!', pitch: 1.7, rate: 1.1 }), 400);
  }
}
// after a crash the mechanics fix the plane and park it back at the airstrip, the boy beside it
function rescuePlane() {
  const v = ride;
  ride = null;
  flight.reset(v.home.x, groundHeight(v.home.x, v.home.z), v.home.z, v.home.rot);
  parkVehicle(v, v.home.x, v.home.z, v.home.rot);
  const c = Math.cos(v.home.rot), sn = Math.sin(v.home.rot);
  player.x = v.home.x + c * 2.6 + sn * 2; player.z = v.home.z - sn * 2.6 + c * 2;
  player.y = groundHeight(player.x, player.z);
  player.facing = Math.atan2(v.home.x - player.x, v.home.z - player.z);
  player.speed = 0; player.vy = 0; player.grounded = true;
  boy.root.quaternion.identity();
  boy.root.rotation.set(0, player.facing, 0);
  flyView = 0; flyFx.smoke = false;
  audio.setPlane(false); planeSound = false;
  $('flyhud').classList.remove('show');
  audio.setHeli(false, 0);
  toast(`The mechanics patched the ${v.heli ? 'helicopter' : 'plane'} up and parked it back at the airstrip — try again!`);
}
function updateFlight(dt) {
  const F = flight, v = ride;
  let pIn = 0, rIn = 0, yIn = 0;
  if (started && !F.crashed) {
    pIn = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
    if (flyFx.invert) pIn = -pIn;
    rIn = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    yIn = (keys.KeyX ? 1 : 0) - (keys.KeyZ ? 1 : 0);
    const thr = keys.KeyF ? -1 : keys.KeyR || keys.ShiftLeft || keys.ShiftRight ? 1 : 0;
    F.throttle = clamp(F.throttle + thr * dt * 1.1, 0, 1);
    // the ground crew push the plane back only if S is held alone, stopped, at zero power, for a moment
    flyFx.pbT = keys.KeyS && !thr && F.ground && F.throttle < 0.02 && Math.abs(F.v) < 1 ? (flyFx.pbT ?? 0) + dt : 0;
  }
  const k = 1 - Math.exp(-dt * 7);
  stick.p += (pIn - stick.p) * k; stick.r += (rIn - stick.r) * k; stick.y += (yIn - stick.y) * k;
  const inp = { pitch: stick.p, roll: stick.r, yaw: stick.y, brake: keys.Space && started ? 1 : 0, pushback: (flyFx.pbT ?? 0) > 1 };
  // autopilot: wings level, and climb or sink gently to the height it was switched on at
  if (flyFx.ap && !F.ground) {
    if (pIn || rIn) { flyFx.ap = false; toast('Autopilot off — you have control'); }
    else {
      inp.roll = clamp(-F.bank * 1.8 - F.rate.z * 0.5, -1, 1);
      const vsT = clamp((flyFx.apAlt - F.pos.y) * 0.2, -3, 3);
      inp.pitch = clamp((vsT - F.vs) * 0.25 + (F.alpha - 0.06) * 1.5, -0.7, 0.7);
    }
  }
  // near the edge of the map the plane banks round for home by itself
  const dC = Math.hypot(F.pos.x, F.pos.z);
  if (!F.ground && dC > PLAY_RADIUS - 90) {
    let d = Math.atan2(-F.pos.x, -F.pos.z) - F.heading;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const bankT = Math.abs(d) < 0.25 ? 0 : -Math.sign(d) * 0.55;
    inp.roll = clamp((bankT - F.bank) * 2.2, -1, 1);
    if (flyFx.edgeT <= 0) { toast('The edge of the map — turning back'); flyFx.edgeT = 8; }
  }
  flyFx.edgeT -= dt;
  const evs = F.update(dt, inp, planeEnv);
  for (const e of evs) planeEvent(e);
  if (dC > PLAY_RADIUS + 140) { const f = (PLAY_RADIUS + 140) / dC; F.pos.x *= f; F.pos.z *= f; }
  // the boy goes where the plane goes
  player.x = F.pos.x; player.z = F.pos.z; player.y = F.pos.y;
  player.facing = F.heading; player.speed = F.airspeed;
  const hs = Math.hypot(F.vel.x, F.vel.z);
  player.dirX = hs > 0.2 ? F.vel.x / hs : Math.sin(F.heading); player.dirZ = hs > 0.2 ? F.vel.z / hs : Math.cos(F.heading);
  player.grounded = F.ground; player.vy = 0;
  boy.root.position.copy(F.pos);
  boy.root.quaternion.copy(F.q);
  boy.setGear('none');
  boy.ride(dt, v.obj, 0);
  const night = ATMO.night ? 1 : 0;
  v.obj.animate(dt, { throttle: F.throttle, pitch: inp.pitch, roll: inp.roll, yaw: inp.yaw + (F.ground ? inp.roll * 0.7 : 0), flaps: F.flaps, gear: F.gear, night, speed: F.ground ? F.v : 0, engine: F.engine });
  for (const o of vehicles) if (o !== v && !o.water) o.obj.update(dt, 0, 0, false, 0);
  // effects: the smoke trail, prop-wash dust on the ground, fire and smoke from a wreck
  if (flyFx.smoke && !F.ground && F.airspeed > 8) {
    flyFx.smokeAcc += dt * 34;
    while (flyFx.smokeAcc > 1) {
      flyFx.smokeAcc -= 1;
      SMOKE_AT.forEach((o, i) => { const w = F.world(o, _pw); smokeTri[i].emit(w.x, w.y, w.z, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.4, 7, 0.7, 4.2, 0.85, 1); });
    }
  }
  if (F.ground && !F.crashed && F.engine && (F.throttle > 0.35 || F.v > 8)) {
    flyFx.dustAcc += dt * (6 + F.v * 0.8);
    const f = F.fwd(_pf);
    while (flyFx.dustAcc > 1) { flyFx.dustAcc -= 1; dust.emit(F.pos.x - f.x * 3 + (Math.random() - 0.5) * 3, F.pos.y + 0.15, F.pos.z - f.z * 3 + (Math.random() - 0.5) * 3, -f.x * (3 + F.throttle * 6), 0.4 + Math.random() * 0.6, -f.z * (3 + F.throttle * 6), 1.4, 0.4, 2.2, 0.55, 0.6); }
  }
  if (F.crashed) {
    const w = F.world(_pw.set(-0.3, 1.1, 1.8), _pw);
    if (flyFx.crashWhy !== 'water') {
      for (let i = 0; i < 3; i++) flames.emit(w.x + (Math.random() - 0.5) * 0.8, w.y, w.z + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.6, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 0.6, 0.5 + Math.random() * 0.4, 0.5, 0.15, 1, Math.random() * 0.5);
    }
    if (Math.random() < 0.6) mopedSmoke.emit(w.x, w.y + 0.6, w.z, (Math.random() - 0.5) * 0.6, 1.5 + Math.random(), (Math.random() - 0.5) * 0.6, 3.5, 0.6, 3.2, 0.8, 0.15);
    flyFx.crashT -= dt;
    if (flyFx.crashT <= 0) { rescuePlane(); return; }
  }
  flames.update(dt); dust.update(dt); mopedSmoke.update(dt); swim.splash.update(dt);
  for (const s of smokeTri) s.update(dt);
  // the camera swings round behind unless the mouse is looking about
  if (!dragging && performance.now() - autoYaw > 1500) {
    yaw = lerpAngle(yaw, F.heading + Math.PI, 1 - Math.exp(-dt * 2.2));
    pitch += (0.2 - pitch) * (1 - Math.exp(-dt * 1.2));
  }
  // HUD
  $('ridehud').classList.remove('show');
  document.body.classList.remove('nitro');
  const hud = $('flyhud');
  $('fh-title').textContent = '✈ VT-GAON'; $('fh-ap').textContent = 'AUTOPILOT';
  $('fh-brk').style.display = $('fh-smk').style.display = '';
  hud.classList.toggle('show', started && !F.crashed);
  const gy = groundHeight(F.pos.x, F.pos.z);
  $('fh-spd').textContent = Math.round(F.airspeed * 3.6);
  $('fh-alt').textContent = Math.max(0, Math.round(F.pos.y - gy - (F.ground ? F.pos.y - gy : 0)));
  $('fh-vs').textContent = (F.ground ? 0 : F.vs).toFixed(1);
  $('fh-hdg').textContent = String(Math.round(((-F.heading * 180) / Math.PI + 360 * 2) % 360)).padStart(3, '0');
  $('fh-thr').style.width = `${Math.round(F.throttle * 100)}%`;
  hud.querySelector('.rh-label').textContent = 'POWER';
  $('fh-thrp').textContent = `${Math.round(F.throttle * 100)}%`;
  $('fh-hz').style.transform = `rotate(${-F.bank}rad) translateY(${clamp(F.pitch, -0.6, 0.6) * 70}px)`;
  $('fh-ap').classList.toggle('on', flyFx.ap);
  $('fh-gear').textContent = F.gear > 0.95 ? 'GEAR ↓' : F.gear < 0.05 ? 'GEAR ↑' : 'GEAR …';
  $('fh-gear').classList.toggle('on', F.gear > 0.95);
  $('fh-flaps').textContent = `FLAPS ${F.flaps}`; $('fh-flaps').classList.toggle('on', F.flaps > 0);
  $('fh-brk').classList.toggle('on', !!inp.brake && F.ground);
  $('fh-smk').classList.toggle('on', flyFx.smoke);
  const sinkFast = !F.ground && F.agl < 40 && F.vs < -6;
  const warn = F.stall && !F.ground ? 'TOO STEEP — LET GO OF S, HOLD R FOR POWER' : sinkFast ? 'PULL UP!' : !F.ground && F.agl < 25 && F.gear < 0.5 && F.vs < -1 ? 'GEAR UP — PRESS G TO LAND' : F.pushback ? 'PUSHING BACK' : '';
  $('fh-warn').textContent = warn; $('fh-warn').classList.toggle('show', !!warn);
  if (F.stall && !F.ground) { flyFx.stallT -= dt; if (flyFx.stallT <= 0) { flyFx.stallT = 6; queueToast('Too steep and slow! Let go of S and hold R — the nose drops and it speeds up'); } }
  // sound
  audio.setRide(null, 0, false, false); audio.setReverse(false);
  audio.setPlane(F.engine, v.obj.rpm, F.airspeed, F.ground, F.stall && !F.ground);
  planeSound = true;
  // key hints while stopped, or for a few seconds after getting in
  const keyChips = (list) => list.map(([kk, t]) => `<span class="chip"><kbd>${kk}</kbd>${t}</span>`).join('');
  const show = started && !F.crashed && (ridePromptT > 0 || (F.ground && Math.abs(F.v) < 0.5));
  const html = F.ground && Math.abs(F.v) < 0.5 && F.throttle < 0.05 ? keyChips([['R', 'hold for full power'], ['S', 'gently pull up past 70 km/h'], ['A D', 'steer'], ['E', 'get out'], ['H', 'all controls']]) : keyChips(v.help.slice(0, 7));
  if ($('prompt').dataset.html !== html) { $('prompt').innerHTML = html; $('prompt').dataset.html = html; }
  $('prompt').classList.toggle('show', show);
  ridePromptT -= dt;
}
// ---------------- flying the helicopter ----------------
function heliKey(code) {
  const F = flight;
  if (code === 'KeyV') { flyView = 1 - flyView; yaw = F.heading + Math.PI; pitch = 0.22; toast(flyView ? 'Cockpit view' : 'Chase view'); }
  if (code === 'KeyK') { F.assist = !F.assist; toast(F.assist ? 'Hover assist on — let go and it stops and hovers' : 'Hover assist off — it keeps drifting'); }
  if (code === 'KeyG' || code === 'KeyL') toast('The helicopter has fixed skids — nothing to put down');
  if (code === 'KeyB') toast('No smoke on the helicopter — try the plane!');
  if (code === 'KeyI') { flyFx.invert = !flyFx.invert; toast(flyFx.invert ? 'W / S swapped' : 'W forward, S back'); }
}
const hstick = { f: 0, s: 0, y: 0, l: 0 };
function updateHeli(dt) {
  const F = flight, v = ride;
  let lift = 0, fwd = 0, side = 0, yw = 0;
  if (started && !F.crashed) {
    // down wins over up, so a key that's stuck (or held by mistake) can never stop the boy coming down
    lift = keys.KeyF || keys.KeyQ ? -1 : keys.KeyR || keys.Space ? 1 : 0;
    fwd = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    if (flyFx.invert) fwd = -fwd;
    yw = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    side = (keys.KeyX ? 1 : 0) - (keys.KeyZ ? 1 : 0);
  }
  const k = 1 - Math.exp(-dt * 6);
  hstick.f += (fwd - hstick.f) * k; hstick.s += (side - hstick.s) * k; hstick.y += (yw - hstick.y) * k; hstick.l += (lift - hstick.l) * k;
  const inp = { lift: Math.abs(hstick.l) < 0.05 ? 0 : hstick.l, fwd: hstick.f, side: hstick.s, yaw: hstick.y };
  // near the edge of the map it turns itself for home
  const dC = Math.hypot(F.pos.x, F.pos.z);
  if (!F.ground && dC > PLAY_RADIUS - 90) {
    let d = Math.atan2(-F.pos.x, -F.pos.z) - F.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
    inp.yaw = clamp(-d * 1.5, -1, 1); inp.fwd = Math.max(inp.fwd, 0.4);
    if (flyFx.edgeT <= 0) { toast('The edge of the map — turning back'); flyFx.edgeT = 8; }
  }
  flyFx.edgeT -= dt;
  const evs = F.update(dt, inp, planeEnv);
  for (const e of evs) planeEvent(e);
  if (dC > PLAY_RADIUS + 140) { const f = (PLAY_RADIUS + 140) / dC; F.pos.x *= f; F.pos.z *= f; }
  // the boy goes where the helicopter goes
  player.x = F.pos.x; player.z = F.pos.z; player.y = F.pos.y;
  player.facing = F.heading; player.speed = F.airspeed;
  const hs = Math.hypot(F.vel.x, F.vel.z);
  player.dirX = hs > 0.2 ? F.vel.x / hs : Math.sin(F.heading); player.dirZ = hs > 0.2 ? F.vel.z / hs : Math.cos(F.heading);
  player.grounded = F.ground; player.vy = 0;
  boy.root.position.copy(F.pos);
  boy.root.quaternion.copy(F.q);
  boy.setGear('none');
  boy.ride(dt, v.obj, 0);
  const night = ATMO.night ? 1 : 0;
  v.obj.animate(dt, { collective: F.collective, pitch: -inp.fwd, roll: inp.side, yaw: inp.yaw, night, engine: F.engine });
  for (const o of vehicles) if (o !== v && !o.water) o.obj.update(dt, 0, 0, false, 0);
  // the downwash kicks up dust when it's low
  if (!F.crashed && F.rotorRpm > 0.5 && F.agl < 9) {
    flyFx.dustAcc += dt * 26 * (1 - F.agl / 9) * F.rotorRpm;
    const gy = groundHeight(F.pos.x, F.pos.z);
    while (flyFx.dustAcc > 1) {
      flyFx.dustAcc -= 1;
      const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 3;
      dust.emit(F.pos.x + Math.cos(a) * r, gy + 0.15, F.pos.z + Math.sin(a) * r, Math.cos(a) * 5, 0.3 + Math.random() * 0.6, Math.sin(a) * 5, 1.3, 0.4, 2.4, 0.5, 0.6);
    }
  }
  if (F.crashed) {
    const w = F.world(_pw.set(-0.3, 1.9, -0.8), _pw);
    if (flyFx.crashWhy !== 'water') for (let i = 0; i < 3; i++) flames.emit(w.x + (Math.random() - 0.5) * 0.8, w.y, w.z + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.6, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 0.6, 0.5 + Math.random() * 0.4, 0.5, 0.15, 1, Math.random() * 0.5);
    if (Math.random() < 0.6) mopedSmoke.emit(w.x, w.y + 0.6, w.z, (Math.random() - 0.5) * 0.6, 1.5 + Math.random(), (Math.random() - 0.5) * 0.6, 3.5, 0.6, 3.2, 0.8, 0.15);
    flyFx.crashT -= dt;
    if (flyFx.crashT <= 0) { rescuePlane(); return; }
  }
  flames.update(dt); dust.update(dt); mopedSmoke.update(dt); swim.splash.update(dt);
  for (const sm of smokeTri) sm.update(dt);
  if (!dragging && performance.now() - autoYaw > 1500) {
    yaw = lerpAngle(yaw, F.heading + Math.PI, 1 - Math.exp(-dt * 2.2));
    pitch += (0.24 - pitch) * (1 - Math.exp(-dt * 1.2));
  }
  // the panel
  $('ridehud').classList.remove('show');
  document.body.classList.remove('nitro');
  const hud = $('flyhud');
  $('fh-title').textContent = '🚁 VT-HELI'; $('fh-ap').textContent = 'HOVER ASSIST';
  $('fh-brk').style.display = $('fh-smk').style.display = 'none';
  hud.classList.toggle('show', started && !F.crashed);
  $('fh-spd').textContent = Math.round(hs * 3.6);
  $('fh-alt').textContent = Math.max(0, Math.round(F.agl));
  $('fh-vs').textContent = (F.ground ? 0 : F.vs).toFixed(1);
  $('fh-hdg').textContent = String(Math.round(((-F.heading * 180) / Math.PI + 720) % 360)).padStart(3, '0');
  $('fh-thr').style.width = `${Math.round(F.rotorRpm * 100)}%`;
  hud.querySelector('.rh-label').textContent = 'ROTOR';
  $('fh-thrp').textContent = `${Math.round(F.rotorRpm * 100)}%`;
  $('fh-hz').style.transform = `rotate(${-F.bank}rad) translateY(${clamp(F.pitch, -0.6, 0.6) * 70}px)`;
  $('fh-ap').classList.toggle('on', F.assist);
  $('fh-gear').textContent = 'SKIDS'; $('fh-gear').classList.add('on');
  $('fh-flaps').textContent = F.ground ? 'ON GROUND' : 'HOVER'; $('fh-flaps').classList.toggle('on', !F.ground && hs < 2);
  $('fh-brk').classList.remove('on'); $('fh-smk').classList.remove('on');
  const warn = !F.ground ? (F.agl < 30 && F.vs < -5 ? 'PULL UP — HOLD R!' : keys.KeyF && F.agl < 15 ? 'LANDING…' : '') : F.rotorRpm < 0.88 && F.engine ? 'ROTOR SPINNING UP…' : '';
  $('fh-warn').textContent = warn; $('fh-warn').classList.toggle('show', !!warn);
  // sound
  audio.setRide(null, 0, false, false); audio.setReverse(false); audio.setPlane(false);
  audio.setHeli(F.engine, F.rotorRpm, F.ground ? 0.2 : 0.5 + Math.max(0, inp.lift) * 0.4 + Math.abs(inp.fwd) * 0.2);
  planeSound = true;
  const keyChips = (list) => list.map(([kk, t]) => `<span class="chip"><kbd>${kk}</kbd>${t}</span>`).join('');
  const show = started && !F.crashed && (ridePromptT > 0 || F.ground);
  const html = F.ground ? keyChips([['R', F.rotorRpm < 0.88 ? 'wait for the rotor…' : 'hold to lift off'], ['F', 'down'], ['W S', 'forward · back'], ['A D', 'turn'], ['Z X', 'slide'], ['E', 'get out'], ['H', 'all controls']]) : keyChips(v.help.slice(0, 6));
  if ($('prompt').dataset.html !== html) { $('prompt').innerHTML = html; $('prompt').dataset.html = html; }
  $('prompt').classList.toggle('show', show);
  ridePromptT -= dt;
}

// chase camera behind and a little above, banking a touch with the plane; V puts you in the pilot's seat
const fcOff = new THREE.Vector3(0, 4, -14), fcWant = new THREE.Vector3(), fcLook = new THREE.Vector3();
function flightCamera(dt) {
  const F = flight, o = ride.obj;
  const fwd = F.fwd(_pf), up = F.up(_pu);
  if (flyView === 1) {
    o.root.updateWorldMatrix(true, false);
    const off = Math.atan2(Math.sin(yaw - F.heading - Math.PI), Math.cos(yaw - F.heading - Math.PI));
    camIn.set(0, 1.6, 0.06);
    lookIn.set(Math.sin(-off) * 8, 1.45 + (0.22 - pitch) * 8, Math.cos(-off) * 8);
    o.root.localToWorld(camIn); o.root.localToWorld(lookIn);
    camera.position.copy(camIn);
    camera.up.copy(up);
    camera.lookAt(lookIn);
    camera.up.set(0, 1, 0);
    if (Math.abs(camera.fov - 72) > 0.05) { camera.fov = 72; camera.updateProjectionMatrix(); }
    return;
  }
  const d = 8 + targetDist * 1.6;
  const hc = yaw, el = clamp(pitch * 0.9 - F.pitch * 0.4, -0.25, 1.2);
  fcWant.set(Math.sin(hc) * Math.cos(el) * d, Math.sin(el) * d + 1.6, Math.cos(hc) * Math.cos(el) * d);
  fcOff.lerp(fcWant, 1 - Math.exp(-dt * 4));
  camera.position.copy(F.pos).add(fcOff);
  const minY = Math.max(heightAt(camera.position.x, camera.position.z), riverDist(camera.position.x, camera.position.z) < RIVER_HALF + 1 ? WY() : -99) + 0.8;
  if (camera.position.y < minY) camera.position.y = minY;
  fcLook.copy(F.pos).addScaledVector(fwd, 5).add(tmp.set(0, 1.5, 0));
  camera.up.set(0, 1, 0).lerp(up, F.ground ? 0 : 0.28).normalize();
  camera.lookAt(fcLook);
  camera.up.set(0, 1, 0);
  if (scare.shake > 0) {
    scare.shake = Math.max(0, scare.shake - dt * 1.6);
    const kk = scare.shake * scare.shake * 0.35;
    camera.position.x += (Math.random() - 0.5) * kk; camera.position.y += (Math.random() - 0.5) * kk;
  }
  const fov = 58 + Math.min(12, F.airspeed * 0.14);
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * (1 - Math.exp(-dt * 3)); camera.updateProjectionMatrix(); }
}

// canopy volumes near the player, so the camera never ends up inside a tree crown
let canopies = [], canopyTimer = 0;
function refreshCanopies() {
  canopies = [];
  const near = (o) => Math.abs(o.x - player.x) < 30 && Math.abs(o.z - player.z) < 30;
  for (const t of layout.trees) if (near(t)) canopies.push({ x: t.x, z: t.z, y: heightAt(t.x, t.z) + 4.6 * t.s, r: 3.8 * t.s, ry: 3.3 * t.s });
  for (const t of layout.palms) if (near(t)) canopies.push({ x: t.x, z: t.z, y: heightAt(t.x, t.z) + 7.5 * t.s, r: 5.5 * t.s, ry: 2.8 * t.s });
  const b = layout.banyan;
  if (near(b)) canopies.push({ x: b.x, z: b.z, y: b.y + 9.5, r: 16.5, ry: 3.6 });
}
function cameraClear(x, y, z) {
  for (const c of canopies) {
    const dx = (x - c.x) / c.r, dz = (z - c.z) / c.r, dy = (y - c.y) / c.ry;
    if (dx * dx + dy * dy + dz * dz < 1) return false;
  }
  return true;
}

// camera modes: C cycles follow → close-up → wide → cinematic drone → bird's-eye
const CAM_MODES = ['Follow camera', 'Close-up', 'Wide view', 'Cinematic', "Bird's-eye"];
let camMode = 0;
const cine = { shot: 0, t: 0, a: 0, pos: new THREE.Vector3(), look: new THREE.Vector3() };
function cycleCamera() {
  camMode = (camMode + 1) % CAM_MODES.length;
  document.body.classList.toggle('cine', camMode === 3);
  if (camMode === 3) { cine.t = 99; cine.pos.copy(camera.position); cine.look.set(player.x, player.y + 1, player.z); }
  toast(CAM_MODES[camMode]);
}
function cinematicCamera(dt) {
  // a slow drone: every few seconds it picks a new shot — a wide orbit, a low tracking shot beside the boy,
  // a high crane looking down, or a long lens from far ahead — and glides there
  cine.t += dt;
  if (cine.t > 9) { cine.t = 0; cine.shot = (cine.shot + 1 + Math.floor(Math.random() * 2)) % 4; cine.a = player.facing + (Math.random() - 0.5) * 2.5; }
  cine.a += dt * (cine.shot === 0 ? 0.12 : 0.04);
  const fx = Math.sin(player.facing), fz = Math.cos(player.facing);
  const want = new THREE.Vector3();
  let fov = 40;
  if (cine.shot === 0) want.set(player.x + Math.sin(cine.a) * 16, player.y + 5, player.z + Math.cos(cine.a) * 16);
  else if (cine.shot === 1) { want.set(player.x + fz * 4.5 - fx * 1.5, player.y + 0.9, player.z - fx * 4.5 - fz * 1.5); fov = 46; }
  else if (cine.shot === 2) { want.set(player.x - fx * 9 + Math.sin(cine.a) * 3, player.y + 14, player.z - fz * 9 + Math.cos(cine.a) * 3); fov = 50; }
  else { want.set(player.x + fx * 26, player.y + 2.2, player.z + fz * 26); fov = 18; }
  const minY = Math.max(heightAt(want.x, want.z), riverDist(want.x, want.z) < RIVER_HALF + 1 ? WY() : -99) + 0.6;
  if (want.y < minY) want.y = minY;
  cine.pos.lerp(want, 1 - Math.exp(-dt * 0.9));
  cine.look.lerp(tmp.set(player.x, player.y + 1.0, player.z), 1 - Math.exp(-dt * 2.5));
  camera.position.copy(cine.pos);
  camera.lookAt(cine.look);
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * (1 - Math.exp(-dt * 1.2)); camera.updateProjectionMatrix(); }
}

// inside a four-wheeler: V switches to a view from the back of the cabin, or the driver's own eyes;
// drag the mouse to look around
let inside = 0;
const camIn = new THREE.Vector3(), lookIn = new THREE.Vector3();
function insideCamera(dt) {
  const o = ride.obj, S = o.L.saddle;
  o.root.updateWorldMatrix(true, false);
  if (ride.name === 'minibus') {
    if (inside === 1) { camIn.set(0.55, 2.2, -3.05); lookIn.set(0.4, 1.55, 2.6); }
    else { camIn.set(0, S.y + 0.88, S.z + 0.1); lookIn.set(0, S.y + 0.25, S.z + 6); }
  } else if (ride.name === 'bus' && o.veh) {
    // the big bus: from the back of the aisle past the passengers to the driver, or high behind the wheel
    const d = o.veh.driverSeat, fy = o.veh.floorY ?? 1.42;
    if (inside === 1) { camIn.set(0.15 - d.x, fy + 1.18, -3.9 - d.z); lookIn.set(-0.3 - d.x, fy + 0.9, 4.4 - d.z); }
    else { camIn.set(0, d.y + 0.8, 0.14); lookIn.set(0, d.y + 0.35, 6); }
  } else if (ride.name === 'auto') {
    // on the passenger bench looking over the boy's shoulder, or the driver's own eyes above the handlebar
    if (inside === 1) { camIn.set(0.3, 1.46, -0.62); lookIn.set(-0.05, 1.12, 3.0); }
    else { camIn.set(0, 1.52, 0.36); lookIn.set(0, 1.3, 6); }
  } else if (ride.name === 'car') {
    // from the middle of the back seat, or the driver's own eyes
    if (inside === 1) { camIn.set(0.36, 1.16, -0.72); lookIn.set(0.2, 1.02, 3.0); }
    else { camIn.set(0, 1.18, -0.12); lookIn.set(0, 1.04, 6); }
  } else if (ride.name === 'erick' && inside === 1) { camIn.set(0.3, 1.52, -1.22); lookIn.set(0.05, 1.05, 1.6); }
  else if (inside === 1) { camIn.set(0.25, S.y + 0.95, S.z - 1.0); lookIn.set(0, S.y + 0.55, S.z + 3); }
  else { camIn.set(0, S.y + 0.7, S.z + 0.02); lookIn.set(0, S.y + 0.1, S.z + 6); }
  // look around with the mouse: the camera's yaw away from straight behind the boy turns the head
  const off = Math.atan2(Math.sin(yaw - player.facing - Math.PI), Math.cos(yaw - player.facing - Math.PI));
  const dx = lookIn.x - camIn.x, dz = lookIn.z - camIn.z, c = Math.cos(-off), sn = Math.sin(-off);
  lookIn.x = camIn.x + dx * c + dz * sn; lookIn.z = camIn.z - dx * sn + dz * c;
  lookIn.y += (0.28 - pitch) * 3;
  o.root.localToWorld(camIn); o.root.localToWorld(lookIn);
  camera.position.copy(camIn);
  camera.lookAt(lookIn);
  const fov = inside === 2 ? 70 : 66;
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
}

function updateCamera(dt) {
  boy.head.visible = !(inside === 2 && ride && ride.four) && !(ride && ride.fly && flyView === 1) && !(pax && pax.view === 0 && camMode < 3);
  if (ride && ride.fly && camMode < 3) { flightCamera(dt); return; }
  if (drv && camMode < 3) { trainCamera(dt); return; }
  if (pax && camMode < 3) { paxCamera(dt); return; }
  if (inside && ride && ride.four) { insideCamera(dt); return; }
  if (camMode === 3) { cinematicCamera(dt); return; }
  if (camMode === 4) {
    if (!dragging && document.pointerLockElement !== canvas) yaw = lerpAngle(yaw, 0, 0.05);
    // bird's-eye: straight down, north up, following smoothly
    camPos.set(player.x, player.y + 48, player.z + 0.01);
    camera.position.lerp(camPos, 1 - Math.exp(-dt * 5));
    camera.up.set(0, 0, -1);
    camera.lookAt(camera.position.x, player.y, camera.position.z - 0.01);
    camera.up.set(0, 1, 0);
    if (Math.abs(camera.fov - settings.fov) > 0.05) { camera.fov = settings.fov; camera.updateProjectionMatrix(); }
    return;
  }
  const modeDist = camMode === 1 ? 2.4 : camMode === 2 ? 15 : null;
  canopyTimer -= dt;
  if (canopyTimer < 0) { canopyTimer = 0.4; refreshCanopies(); }
  dist += (Math.max(modeDist ?? targetDist, (!modeDist && ride?.obj?.camDist) || 0) - dist) * (1 - Math.exp(-dt * 4));
  const pch = camMode === 1 ? Math.min(pitch, 0.25) : camMode === 2 ? Math.max(pitch, 0.5) : pitch;
  camTarget.set(player.x, player.y + (camMode === 1 ? 1.2 : 1.15) + (ride?.obj?.camLift ?? 0), player.z);
  if (camMode === 1) { camTarget.x += Math.cos(yaw) * 0.45; camTarget.z -= Math.sin(yaw) * 0.45; } // over the shoulder
  const cp = Math.cos(pch);
  const ox = Math.sin(yaw) * cp, oy = Math.sin(pch), oz = Math.cos(yaw) * cp;
  let d = dist;
  for (let s = 1.5; s <= dist; s += 0.5) {
    if (!cameraClear(camTarget.x + ox * s, camTarget.y + oy * s, camTarget.z + oz * s)) { d = Math.max(1.6, s - 0.5); break; }
  }
  camPos.set(camTarget.x + ox * d, camTarget.y + oy * d, camTarget.z + oz * d);
  const minY = Math.max(heightAt(camPos.x, camPos.z), riverDist(camPos.x, camPos.z) < RIVER_HALF + 1 ? WY() : -99) + 0.45;
  if (camPos.y < minY) camPos.y = minY;
  camera.position.lerp(camPos, 1 - Math.exp(-dt * (ride ? 7 : 12)));
  camera.lookAt(camTarget);
  if (scare.shake > 0) {
    scare.shake = Math.max(0, scare.shake - dt * 1.6);
    const k = scare.shake * scare.shake * 0.25;
    camera.position.x += (Math.random() - 0.5) * k; camera.position.y += (Math.random() - 0.5) * k;
  }
}

const _shF = new THREE.Vector3();
function updateShadows() {
  const texel = (SH * 2) / sun.shadow.mapSize.x;
  lx.crossVectors(THREE.Object3D.DEFAULT_UP, sunDir).normalize();
  ly.crossVectors(sunDir, lx).normalize();
  tmp.set(player.x, ride && ride.fly ? Math.min(player.y, groundHeight(player.x, player.z) + 30) : player.y, player.z);
  // the shadowed square sits a little ahead, over the ground the camera sees, rather than half of it behind the
  // camera where nothing shows (anything whose shadow falls on that ground is inside it, wherever it stands)
  camera.getWorldDirection(_shF); _shF.y = 0;
  const fl = _shF.length();
  if (fl > 0.2) tmp.addScaledVector(_shF, SH_AHEAD / fl);
  const px = Math.round(tmp.dot(lx) / texel) * texel;
  const py = Math.round(tmp.dot(ly) / texel) * texel;
  const pz = tmp.dot(sunDir);
  tmp.copy(lx).multiplyScalar(px).addScaledVector(ly, py).addScaledVector(sunDir, pz);
  sun.target.position.copy(tmp);
  sun.position.copy(tmp).addScaledVector(sunDir, 160);
}

function nearest(list, x, z) {
  let m = Infinity;
  for (const o of list) m = Math.min(m, Math.hypot(o.x - x, o.z - z));
  return m;
}

// ---------------- village voices: namaste as you pass, the chaiwala and the market calling out ----------------
const voiceState = { chai: 4, market: 6, greetCool: 0 };
const CHAI_CALLS = [['चाय! गरम चाय!', 'Chai! Garam chai!'], ['चाय पी लो!', 'Chai pi lo!'], ['आइए, कड़क चाय!', 'Aaiye, kadak chai!'], ['गरमा गरम चाय!', 'Garma garam chai!'], ['एक कप चाय, बस दस रुपये!', 'Ek cup chai, bas das rupaye!']];
const MARKET_CALLS = [['आलू ले लो, प्याज़ ले लो!', 'Aaloo le lo, pyaaz le lo!'], ['ताज़ी सब्ज़ी!', 'Taazi sabzi!'], ['आम, केले, मीठे संतरे!', 'Aam, kele, meethe santre!'], ['गरम जलेबी!', 'Garam jalebi!'], ['सस्ता, बढ़िया!', 'Sasta, badhiya!'], ['मटके ले लो!', 'Matke le lo!']];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
function villageVoices(dt) {
  voiceState.chai -= dt; voiceState.market -= dt; voiceState.greetCool -= dt;
  const dTea = Math.hypot(player.x - TEA.x, player.z - TEA.z);
  if (dTea < 32 && voiceState.chai < 0) {
    voiceState.chai = 9 + Math.random() * 3;
    const [hi, ro] = pick(CHAI_CALLS);
    audio.say(hi, { roman: ro, pitch: 0.85, rate: 1.05, volume: 1 - dTea / 34 });
  }
  const dMk = Math.hypot(player.x - MARKET.x, player.z - MARKET.z);
  if (dMk < 30 && voiceState.market < 0) {
    voiceState.market = 6 + Math.random() * 5;
    const [hi, ro] = pick(MARKET_CALLS);
    audio.say(hi, { roman: ro, pitch: 0.8 + Math.random() * 0.6, rate: 1.1, volume: 1 - dMk / 32 });
  }
  // namaste: anyone the boy walks past greets him (once a minute each), and he greets them back
  if ((ride && player.speed > 6) || pax) return;
  for (const v of people.villagers) {
    if (!v.person.root.visible) continue;
    const d = Math.hypot(v.p.x - player.x, v.p.z - player.z);
    if (d < 2.6 && time - (v.lastGreet ?? -999) > 60 && voiceState.greetCool < 0) {
      v.lastGreet = time;
      v.greetT = 2.4;
      voiceState.greetCool = 3;
      boy.greetT = ride ? 0 : 2.0;
      audio.say('नमस्ते', { roman: 'Namaste', pitch: v.person.female ? 1.25 : 0.8, rate: 0.95 });
      setTimeout(() => audio.say('नमस्ते', { roman: 'Namaste', pitch: 1.7, rate: 1.05 }), 900);
      if (!ride) toast('Namaste 🙏');
      break;
    }
  }
}

// ---------------- the wild: warnings, and a shove back when an animal gets too close ----------------
const WARN = { leopard: 'A leopard! It springs at you — back away', elephant: 'The elephant charges — give the herd space!', crocodile: 'Careful! A mugger crocodile — stay away from the bank', tiger: 'The tiger roars — back away slowly!', wolf: 'The wolves snap at you — keep your distance', lion: 'The lion roars and lunges — back away from the pride!', hyena: 'The hyenas snap at you — keep your distance', rhino: 'The rhino charges! Get out of its way', buffalo: 'The wild buffalo charges — leave the herd alone', snake: 'A cobra rears and strikes — step back!', monkey: 'A monkey snatches at you and scampers off' };
const wildEvents = {
  hiss: (d) => audio.hiss(d),
  growl: (d, k) => audio.growl(d, k),
  roar: (d) => { audio.roar(d); if (d < 40) scare.shake = Math.max(scare.shake, 0.5); },
  howl: (d) => audio.howl(d),
  hoot: (d) => audio.hoot?.(d),
  screech: (d) => audio.screech?.(d),
  cackle: (d) => audio.cackle(d),
  chatter: (d) => audio.chatter(d),
  snort: (d) => audio.snort(d),
  trumpet: (d) => { audio.trumpet(d); if (d < 30) scare.shake = Math.max(scare.shake, 0.4); },
  snap: (x, z, kind) => {
    if ((ride && ride.fly) || drv || pax) return;
    if (scare.cool > 0) return;
    scare.cool = 2.5;
    const dx = player.x - x, dz = player.z - z, d = Math.hypot(dx, dz) || 1;
    const push = kind === 'tiger' || kind === 'elephant' || kind === 'lion' || kind === 'rhino' || kind === 'buffalo' ? 4.5 : kind === 'monkey' || kind === 'snake' ? 1.6 : 2.6;
    const p = { x: player.x + (dx / d) * push, z: player.z + (dz / d) * push };
    resolveCollisions(p, 0.3, player.y);
    player.x = p.x; player.z = p.z;
    player.speed = 0;
    if (!ride && !swim.on) { player.vy = 3.2; player.grounded = false; }
    scare.shake = 1;
    if (kind === 'elephant') audio.trumpet(2);
    else if (kind === 'tiger' || kind === 'lion') audio.roar(2); else if (kind === 'crocodile' || kind === 'snake') audio.hiss(1);
    else if (kind === 'rhino' || kind === 'buffalo') audio.snort(1); else if (kind === 'monkey') audio.chatter(1); else if (kind === 'hyena') audio.cackle(1);
    else audio.growl(1, 'wolf');
    toast(WARN[kind]);
  },
};

// ---------------- dry thunderstorm: lightning bolts, flashes and thunder ----------------
const boltMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
function makeBolt(top, bottom) {
  const toCam = new THREE.Vector3().subVectors(camera.position, bottom).setY(0).normalize();
  const right = new THREE.Vector3(-toCam.z, 0, toCam.x);
  const pos = [];
  const strand = (a, b, w, depth) => {
    const n = 14;
    let prev = a.clone();
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const p = a.clone().lerp(b, t);
      if (i < n) p.addScaledVector(right, (Math.random() - 0.5) * 60 * (depth ? 0.5 : 1)).add(new THREE.Vector3(0, (Math.random() - 0.5) * 12, 0));
      const ww = w * (1 - t * 0.6);
      for (const [q0, q1] of [[prev, p]]) {
        const o0 = right.clone().multiplyScalar(ww), o1 = right.clone().multiplyScalar(ww * 0.9);
        pos.push(q0.x - o0.x, q0.y, q0.z - o0.z, q0.x + o0.x, q0.y, q0.z + o0.z, q1.x + o1.x, q1.y, q1.z + o1.z);
        pos.push(q0.x - o0.x, q0.y, q0.z - o0.z, q1.x + o1.x, q1.y, q1.z + o1.z, q1.x - o1.x, q1.y, q1.z - o1.z);
      }
      if (!depth && i > 2 && i < n - 3 && Math.random() < 0.25) {
        const end = p.clone().addScaledVector(right, (Math.random() - 0.5) * 160).add(new THREE.Vector3(0, -60 - Math.random() * 80, 0));
        strand(p, end, w * 0.5, 1);
      }
      prev = p;
    }
  };
  strand(top, bottom, 5.5, 0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const m = new THREE.Mesh(g, boltMat.clone());
  m.frustumCulled = false;
  scene.add(m);
  return m;
}
const _fl = new THREE.Color('#dfe6ff');
function updateStorm(dt) {
  for (const b of storm.bolts) {
    b.life -= dt;
    b.mesh.material.opacity = b.life > 0 ? (Math.random() < 0.7 ? 1 : 0.3) * Math.min(1, b.life * 5) : 0;
    if (b.life <= 0) { scene.remove(b.mesh); b.mesh.geometry.dispose(); }
  }
  storm.bolts = storm.bolts.filter((b) => b.life > 0);
  if (storm.on && started) {
    storm.next -= dt;
    if (storm.next < 0) {
      storm.next = 3 + Math.random() * 9;
      const a = yaw + (Math.random() - 0.5) * 1.4; // mostly somewhere ahead of the camera
      const d = 220 + Math.random() * 520;
      const bx = player.x - Math.sin(a) * d, bz = player.z - Math.cos(a) * d;
      const ground = new THREE.Vector3(bx, heightAt(bx, bz), bz);
      if (Math.random() < 0.75) storm.bolts.push({ mesh: makeBolt(new THREE.Vector3(bx + (Math.random() - 0.5) * 80, 340, bz + (Math.random() - 0.5) * 80), ground), life: 0.25 + Math.random() * 0.25 });
      storm.flash = 1;
      storm.flicker = 2 + Math.floor(Math.random() * 3);
      audio.thunder(d);
    }
  }
  // flash: a few flickers fading out
  if (storm.flash > 0) {
    storm.flash = Math.max(0, storm.flash - dt * 3.2);
    if (storm.flicker > 0 && storm.flash < 0.55) { storm.flash = 0.85; storm.flicker--; }
  }
  if (storm.base) {
    const f = storm.on ? storm.flash * storm.flash : 0;
    hemi.intensity = storm.base.hemiI + f * 7;
    renderer.toneMappingExposure = storm.base.exp + f * 0.45;
    scene.fog.color.copy(storm.base.fog).lerp(_fl, f * 0.6);
    clouds.material.uniforms.uLit.value.copy(storm.base.cLit).lerp(_fl, f);
  }
}

// the trains as the map draws them: where each coach is, the engine, speed, and the station it's at or bound for
// train brakes: the loudest braking train near you squeals and grinds; once one stops, its brakes hiss off
function trainBrakes(dt) {
  if (!started || dt <= 0) return;
  let lvl = 0, sp = 0;
  for (const tr of train.trains) {
    const v = Math.abs(tr.v ?? 0), pv = tr._pv ?? v;
    tr._pv = v;
    const dec = (pv - v) / dt;
    tr._dec = (tr._dec ?? 0) + (dec - (tr._dec ?? 0)) * (1 - Math.exp(-dt * 5));
    const mine = tr === drv || tr === pax?.tr;
    const d = mine ? 0 : tr.distanceTo(player.x, player.z);
    if (d > 420) { tr._braking = 0; continue; }
    const near = mine ? 1 : clamp(1 - d / 400, 0, 1) ** 2;
    const braking = v > 0.25 && tr._dec > 0.18 ? clamp((tr._dec - 0.18) / 1.2, 0.15, 1) : 0;
    if (braking) tr._braking = 2.5; else tr._braking = Math.max(0, (tr._braking ?? 0) - dt);
    if (braking * near > lvl) { lvl = braking * near; sp = v; }
    // came to a stand after a proper stop: let the brakes off
    if (pv > 0.12 && v <= 0.12 && tr._braking > 0) { audio.brakeHiss(near * (mine ? 1 : 0.85)); tr._braking = 0; }
  }
  audio.setTrainBrake(lvl, sp);
}
// the buses and jeeps on the roads, for the map: the shrine buses and the police patrol are pinned (shown on the
// minimap too); the rest show on the map's buses & jeeps view. Ones waiting in a village for the night (or not
// out yet) aren't on the road.
function liveMarks() {
  const out = [], T = people?.travellers;
  for (const t of T?.list ?? []) {
    if (!t.track || t.taken || t.hold > 0 || t.crash) continue;
    if ((t.nightOff || t.nightHide) && T.night) continue;
    out.push({ id: t.idx, x: t.p.x, z: t.p.z, icon: t.icon ?? (t.kind === 'bus' ? '🚌' : '🚙'), label: t.label, color: t.color, pin: !!t.icon, shrine: t.icon === '🛕', speed: t.speed, wait: t.wait, route: t.loop.pts });
  }
  return out;
}
function mapTrains() {
  const out = [];
  for (const tr of train.trains) {
    if (!tr.boxes.length) continue;
    const cars = tr.boxes.map((b) => ({ x: b.x, z: b.z }));
    const lb = tr.boxes.find((b) => b.loco) ?? tr.boxes[0];
    // the engine that leads in the direction it's moving (the station trains have one at each end)
    let head = lb;
    if (tr.locos?.length > 1 && tr.v !== 0) { const ends = [tr.boxes[0], tr.boxes[tr.boxes.length - 1]]; head = (tr.termini ? Math.sign(tr.v) : 1) > 0 ? ends[0] : ends[1]; }
    const nh = tr.loopLine ? tr.nextLoopStop?.() : tr.termini ? tr.nextStop?.(tr.m) : tr.nextHalt?.();
    const at = tr.at && !tr.at.noStation ? tr.at.name : null;
    out.push({ name: tr.name, color: tr.color, cars, head: { x: head.x, z: head.z }, v: tr.v, at, next: nh && !nh.h.noStation ? nh.h.name : null, driven: tr === drv });
  }
  return out;
}

// ---- riding the mela's giant wheel or its swinging boat: up over the whole village, or swung high ----
let joy = null;
function startJoy(kind) {
  const r = mela?.board(kind);
  if (!r) { toast('Every gondola is full — wait for the next turn'); return; }
  const paid = wallet() >= 20; if (paid) purse.spent += 20;
  joy = { kind, ...r, t: 0, wantOff: false, saidTop: false };
  r.anchor.add(boy.root);
  boy.root.position.copy(r.pos); boy.root.rotation.set(0, r.face, 0);
  boy.setGear('none');
  audio.tink(0.6);
  targetDist = Math.max(targetDist, 7);
  toast(kind === 'wheel' ? `Up into a gondola of the giant wheel 🎡${paid ? ' · ₹20' : ''} — E to get down when it comes round` : `Onto the swinging boat ⛵${paid ? ' · ₹20' : ''} — hold on! E to get off when it slows`);
}
function wantOffJoy() {
  if (!joy) return;
  joy.wantOff = true;
  if (joy.kind === 'wheel' && !mela.rideState('wheel').bottom) toast("You'll step out when your gondola comes down to the bottom");
  if (joy.kind === 'boat' && mela.rideState('boat').amp > 0.25) toast('Hold on till the boat slows down…');
}
function leaveJoy() {
  if (joy.kind === 'wheel') mela.wheelStopForBoy(false);
  scene.add(boy.root);
  const x = joy.exit.x, z = joy.exit.z;
  player.x = x; player.z = z; player.y = groundHeight(x, z); player.vy = 0; player.grounded = true; player.speed = 0;
  boy.root.position.set(x, player.y, z); boy.root.rotation.set(0, player.facing, 0);
  toast(joy.kind === 'wheel' ? 'Down from the giant wheel — what a view!' : 'Off the swinging boat, legs a little wobbly 😄');
  joy = null;
}
function updateJoy(dt) {
  joy.t += dt;
  {
    const html = [['E', joy.wantOff ? 'getting down…' : joy.kind === 'wheel' ? 'get down at the bottom' : 'get off when it slows'], ['Mouse', 'look round']].map(([k, t]) => `<span class="chip"><kbd>${k}</kbd>${t}</span>`).join('');
    if ($('prompt').dataset.html !== html) { $('prompt').innerHTML = html; $('prompt').dataset.html = html; }
    $('prompt').classList.add('show');
  }
  jumpQueued = false;
  boy.sit(dt, false, true);
  // everything that follows the boy (the camera, the map, the sounds) follows him round on the ride
  boy.root.getWorldPosition(tmp);
  player.x = tmp.x; player.z = tmp.z; player.y = tmp.y - 0.38; player.speed = 0; player.vy = 0;
  if (!dragging && performance.now() - autoYaw > 3500) yaw += dt * 0.05; // the view turns slowly over the country
  if (joy.kind === 'wheel') {
    const st = mela.rideState('wheel');
    if (!joy.saidTop && st.height > mela.wheel.position.y + 4) { joy.saidTop = true; toast('From the top you can see the whole village — the river, the fields, the train far off 🎡'); }
    // two turns, then it lets him out at the bottom (or sooner, if he asked)
    if ((joy.wantOff || st.laps >= 2) && joy.t > 4 && mela.wheelStopForBoy(true)) leaveJoy();
  } else {
    const st = mela.rideState('boat');
    if (joy.wantOff && st.amp < 0.25 && st.swing < 0.2) leaveJoy();
  }
}

// ---- the fire tender's water cannon: hold K; it points where you look, and its water puts fires out ----
const hose = new WaterJet(scene);
const hoseState = { yaw: 0, pitch: 0.3, on: 0, toastT: 0, _o: new THREE.Vector3(), _d: new THREE.Vector3(), _q: new THREE.Quaternion() };
function updateHose(dt) {
  const truck = ride?.name === 'firetruck' && !ride.crash ? ride.obj : null;
  const spraying = !!truck && started && !!keys.KeyK;
  hoseState.on += ((spraying ? 1 : 0) - hoseState.on) * (1 - Math.exp(-dt * (spraying ? 6 : 10)));
  if (truck?.monitor) {
    // where the camera looks, as an angle from the truck's nose; the lower the camera, the higher it aims
    const look = Math.atan2(-Math.sin(yaw), -Math.cos(yaw));
    const wantYaw = Math.atan2(Math.sin(look - player.facing), Math.cos(look - player.facing));
    const wantPitch = clamp(0.62 - pitch * 0.85, 0.04, 0.8);
    const dy = Math.atan2(Math.sin(wantYaw - hoseState.yaw), Math.cos(wantYaw - hoseState.yaw));
    hoseState.yaw += clamp(dy, -dt * 2.2, dt * 2.2); // (the turret swings round at its own pace)
    hoseState.pitch += (wantPitch - hoseState.pitch) * (1 - Math.exp(-dt * 4));
    truck.aim(hoseState.yaw, hoseState.pitch);
    if (hoseState.on > 0.05) {
      truck.barrel.updateWorldMatrix(true, false);
      const o = truck.barrel.localToWorld(hoseState._o.copy(truck.nozzleTip));
      truck.barrel.getWorldQuaternion(hoseState._q);
      const d = hoseState._d.set(0, 0, 1).applyQuaternion(hoseState._q);
      hose.emit(o.x, o.y, o.z, d.x, d.y, d.z, 22 * (0.6 + 0.4 * hoseState.on), Math.round(1100 * dt * hoseState.on + Math.random()), 0.025, player.y, 1);
    }
  }
  audio.setHose?.(Math.max(hoseState.on, pumpS.flow * 0.35));
  pumpBucket(dt);
  if (!hose.active) return;
  hoseState.toastT -= dt;
  hose.update(dt, (x, z) => groundHeight(x, z, 50), (x, y, z) => {
    const out = fire?.douse(x, z);
    if (out && hoseState.toastT <= 0) { hoseState.toastT = 4; toast(`Hssss… ${out} is out 💧`); }
  }, ATMO.night ? 0.45 : 1, (x, y, z) => inBucket(x, y, z) || (!!fire && fire.solidAt(x, y, z)));
}

function loop(now) {
  // schedule the next frame first: a bug in one frame must never freeze the whole game
  requestAnimationFrame(loop);
  try { frame(now); } catch (err) {
    if (!loop.errors || loop.errors < 5) console.error('frame error (game keeps running):', err);
    loop.errors = (loop.errors || 0) + 1;
  }
}
function frame(now) {
  const cpu0 = performance.now();
  if (PROF) { profT = performance.now(); profFrames++; }
  if (last) dynamicResolution(now - last);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000) || 0);
  last = now;
  time += dt;

  windUniforms.uTime.value = time;
  const gust = 0.5 + 0.5 * (noise2(time * 0.09, 3.7) * 0.7 + noise2(time * 0.31, 9.1) * 0.3);
  windUniforms.uWind.value = windBase * (0.55 + gust * 0.75);

  tickClock(dt);
  {
    const want = lamps.on && ride && !ride.fly && !ride.water ? (ride.four ? 260 : ride.name === 'bicycle' ? 60 : 150) : 0;
    headlight.intensity += (want - headlight.intensity) * (1 - Math.exp(-dt * 10));
    headlight.position.x = ride?.box ? ride.box[0] : 0;
    headlight.position.z = ride?.probes ? Math.max(...ride.probes) + 0.7 : 0.9; // just ahead of the nose
    headlight.target.position.x = headlight.position.x;
    headlight.target.position.z = headlight.position.z + 15;
    // (it stays in the scene even when off, at no brightness: switching a light in or out makes every
    // material in sight rebuild its shader — a long freeze)
  }
  if (!started) yaw += dt * 0.04;
  mark('pre');
  collectHittables();
  if (friends && started) friends.update(dt, time);
  mark('hittables');
  people.update(dt, player);
  mark('people');
  trafficHits();
  site.update(dt, player);
  kites.update(dt, player);
  mela?.update(dt, player);
  airstrip?.update(dt, windUniforms.uWind.value);
  updateRobbed(dt);
  updateDiyas(dt);
  pumpToasts(dt);
  mark('site/kites/mela');
  {
    const carriers = vehicles.filter((v) => v.obj.seats);
    const act = carriers.includes(ride) && !ride.crash ? ride : null;
    const evs = passengers.update(dt, player, carriers.map((v) => v.obj), act?.obj ?? null, act ? drive.v : 0);
    busEvents(evs);
  }
  mark('passengers');
  animals.update(dt, player);
  mark('animals');
  train.update(time);
  trainBrakes(dt);
  mark('train');
  for (const X of train.crossings) {
    if (!X.closed) continue;
    X.bellT = (X.bellT ?? 0) - dt;
    if (X.bellT <= 0) { X.bellT = 0.45; const d = Math.hypot(player.x - X.cx, player.z - X.cz); if (d < 90) audio.tink(clamp(1 - d / 90, 0.1, 1) * 0.8); }
  }
  stations?.update(dt, player, !!ATMO.night);
  goodsYards?.update(dt, player);
  mark('stations');
  updatePlayer(dt);
  mark('player');
  crashCheck(dt);
  crashes.update(dt);
  mark('crash');
  updateCamera(dt);
  // the shadow map is redrawn every frame, so moving people and vehicles never leave a stuttering shadow
  shadowTick++;
  updateShadows(); renderer.shadowMap.needsUpdate = true;

  updateVegetation(camera.position, scene.fog.density / settingsView());
  terrainObj.userData.update(camera.position);
  updateCull(camera.position);
  updateStream(camera.position, (2.6 / Math.max(scene.fog.density, 0.0012)) * settingsView());
  grass?.userData.setCenter(player.x, player.z);
  if (grass) grass.userData.setPress(grassPressers());
  river.material.uniforms.uTime.value = time;
  const mu = motes.material.uniforms;
  mu.uTime.value = time;
  mu.uCenter.value.set(player.x, player.y, player.z);
  mu.uScale.value = renderer.getPixelRatio();
  mark('camera/lod');
  village.update(time, dt, player);
  mark('village');
  waterfall.update(time, dt, Math.abs(player.x - WF.x) + Math.abs(player.z - WF.z) < 260);
  lanterns.update(player, time);
  farm.update(dt, time, player);
  fish.update(dt, time, player);
  wild.update(dt, player, wildEvents);
  scare.cool -= dt;
  updateStorm(dt);
  if (started) villageVoices(dt);
  mark('wild/farm/etc');
  if (started) {
    map.live = liveMarks(); map.cards = postcards?.marks();
    // the first time the boy is near one of the shrine buses, say what it is
    if (!shrineBusSeen) for (const m of map.live) if (m.icon === '🛕' && Math.hypot(m.x - player.x, m.z - player.z) < 28) { shrineBusSeen = true; toast('🛕 Mandir Seva — the shrine bus, up the hill road to the summit temple and back. Track it on the map: Tab, then 3.'); break; }
  }
  if (started) map.update(player, yaw, vehicles.map((v) => ({ name: v.name, x: v === ride ? player.x : v.park.x, z: v === ride ? player.z : v.park.z, ridden: v === ride })), mapTrains());
  mark('map');
  flocks.update(time, dt, player);
  birds.update(dt, player, !!ATMO.night);
  herds?.update(dt, player);
  buffs?.update(dt, player, time);
  hamlets?.update(dt, player);
  workers?.update(dt, player, time);
  fire?.update(dt, { player, t: time, rain: ATMO.rain ?? 0, night: !!ATMO.night, dusk: !!ATMO.night || (ATMO.sunElev ?? 30) < 7, season, wind: windUniforms.uWind.value });
  updateHose(dt);
  matchFlame.visible = (fire?.matchT ?? 0) > 0;
  if (matchFlame.visible) { const k = fire.matchT; matchFlame.scale.setScalar(Math.min(1, k * 2) * (0.85 + 0.15 * Math.sin(time * 30))); }
  // a pan of chai on the boil at the stall: when it's ready, up onto the bench with a glass
  if (village?.tea?.boil > 0) {
    village.tea.boil -= dt;
    if (village.tea.boil <= 0) { if (Math.hypot(player.x - TEA.x, player.z - TEA.z) < 9 && !ride && !sit.on) haveChai(); else toast('The chai is ready at the stall ☕'); }
  }
  if (started) postcards?.update(dt, player, time, !!ride);
  shops?.update(dt, player);
  shrineLife?.update(dt, player);
  trackside?.update(dt, player, !!ATMO.night);
  trackScene?.update(dt, player, !!ATMO.night, 2.6 / Math.max(scene.fog.density, 0.0012));
  mark('herds/hamlets/shops');
  clouds.material.uniforms.uTime.value = time;
  sky.position.copy(camera.position);
  clouds.position.x = camera.position.x;
  clouds.position.z = camera.position.z;
  nightSky.position.copy(camera.position);
  nightSky.material.uniforms.uTime.value = time;
  rain.material.uniforms.uTime.value = time;
  rain.material.uniforms.uCenter.value.set(player.x, player.y, player.z);

  // dogs bark if you get too close (the friendly one that follows you only when startled)
  for (const d of people.dogs) {
    d.barkCool -= dt;
    const dd = Math.hypot(d.p.x - player.x, d.p.z - player.z);
    // the stray barks at anyone who comes close; the friendly one barks a greeting when you come back
    if (dd > 18) d.greeted = false;
    const greet = d.follower && !d.greeted && dd < 7;
    const close = d.follower ? (player.speed > 3 ? 2.5 : 0) : 5.5;
    if (started && d.barkCool <= 0 && (dd < close || greet)) {
      if (greet) d.greeted = true;
      d.bark();
      audio.bark(clamp(1.1 - dd / 8, 0.4, 1));
    }
  }

  regionTimer -= dt;
  if (regionTimer < 0 && started) {
    regionTimer = 0.25;
    const r = regionName(player.x, player.z);
    if (r !== currentRegion) {
      if (currentRegion) toast(r);
      currentRegion = r;
      $('pl-name').textContent = r;
    }
    const meta = `${clockText(clock.hour)} · ${ATMO.weather === 'clear' ? ATMO.name : ATMO.weatherName} · ${SEASONS[season].name.split(' — ')[0]}${ride ? ' · ' + Math.round(player.speed * 3.6) + ' km/h' : ''}`;
    if ($('pl-meta').textContent !== meta) $('pl-meta').textContent = meta;
    audio.update(windUniforms.uWind.value, Math.min(riverDist(player.x, player.z), streamDist(player.x, player.z) * 1.3, rapidDist(player.x, player.z) * 0.6), {
      temple: Math.hypot(player.x - layout.temple.x, player.z - layout.temple.z),
      cow: nearest(layout.cows, player.x, player.z),
    }, (() => { const n = train.nearest(player.x, player.z); return { active: train.active, distance: n.d, speed: n.v, dwell: n.dwell }; })());
    audio.setTractor(farm.tractorDistance(player.x, player.z));
    // up in the plane or the helicopter, the sounds of the ground (the mela, the river, the village) fade away
    { const F = ride?.fly ? flight : null, agl = F && !F.ground ? F.pos.y - groundHeight(F.pos.x, F.pos.z) : 0; audio.setAloft?.(Math.round(clamp((agl - 6) / 30, 0, 1) * 20) / 20); }
    audio.setJungle?.(jungleMask(player.x, player.z), !!ATMO.night); // (insects, birds and monkeys in the jungle)
    audio.setFalls(waterfall ? Math.hypot(player.x - waterfall.impact.x, player.y - waterfall.impact.y, player.z - waterfall.impact.z) : 999);
    {
      // village life around you: how close the nearest village is, and the goats
      let dv = Infinity;
      for (const v of [{ x: 0, z: 10 }, layout.nv, layout.rv, layout.bv, layout.tv, layout.mh, layout.ne, layout.pg, layout.eh ?? { x: 131, z: 80 }]) if (v) dv = Math.min(dv, Math.hypot(player.x - v.x, player.z - v.z));
      audio.setVillageLife(dv, ATMO, season, animals.goats ? nearest(animals.goats.filter((g) => g.species === 'goat').map((g) => g.p), player.x, player.z) : 999);
    }
    {
      const dMela = mela?.distTo(player.x, player.z) ?? 999;
    }
  }

  // in a tunnel: keep the camera inside the bore with the boy (or his train), and let the daylight fall away
  {
    const cp = camera.position;
    const tp = tunnelAt(player.x, player.z), pin = !!tp && player.y < heightAt(player.x, player.z, false) - 2.5;
    if (pin) {
      const T = tp.T, n = T.path.near(cp.x, cp.z);
      if (n && T.tunnelS(n.s) && n.d < LID_W + 6) {
        const q = T.path.at(n.s), nx = -q.tz, nz = q.tx;
        const lat = clamp((cp.x - q.x) * nx + (cp.z - q.z) * nz, -3.3, 3.3);
        cp.set(q.x + nx * lat, clamp(cp.y, TRACK_Y + 1.0, TRACK_Y + 6.0), q.z + nz * lat);
      }
    }
    const tc = tunnelAt(cp.x, cp.z), camIn = !!tc && cp.y < heightAt(cp.x, cp.z, false) - 0.5;
    tunnelK += ((pin || camIn ? 0.22 : 1) - tunnelK) * (1 - Math.exp(-dt * 3));
    sun.intensity = ATMO.sunI * tunnelK;
    hemi.intensity *= 0.35 + 0.65 * tunnelK; // (the storm code sets it afresh every frame)
  }
  mark('rest');
  EYE.x = camera.position.x; EYE.z = camera.position.z;
  // people more than 260 m off are a few pixels tall: leave them out of this frame's drawing (and its shadows).
  // Done just around the render, so every system's own showing and hiding of its people is left untouched.
  // (One standing straight in the scene is measured by its own position — its world matrix isn't kept up
  // while it's out of sight; one riding in something by its world matrix.)
  const farFolk = [];
  for (const q of ALL_PEOPLE) {
    const r = q.root;
    if (!r.visible) continue;
    let x, z;
    if (r.parent === scene) { x = r.position.x; z = r.position.z; } else { const e = r.matrixWorld.elements; x = e[12]; z = e[14]; }
    const dx = x - camera.position.x, dz = z - camera.position.z;
    if (dx * dx + dz * dz > 67600) { r.visible = false; farFolk.push(r); }
  }
  // whatever is hidden this frame needs no matrix update (it picks up again the frame it shows)
  for (const c of scene.children) if (!c.userData.frozen) c.matrixWorldAutoUpdate = c.visible;
  updateTinyCull(camera, renderer.domElement.height);
  composer.render();
  for (const r of farFolk) r.visible = true;
  mark('render');
  if (PROF) { const ms = performance.now() - cpu0; if (ms > 50) { profLong.push({ t: +time.toFixed(1), ms: +ms.toFixed(0), ...profCur }); if (profLong.length > 60) profLong.shift(); } }
  dyn.cpu += (performance.now() - cpu0 - dyn.cpu) * 0.05;
  if (wantShot) { wantShot = false; postcard(); }
  if (postcards?.wantGrab) postcards.grab(renderer.domElement);
}
// P: a postcard of what the boy is looking at, with the place and the hour written along the bottom
let wantShot = false;
function postcard() {
  const src = renderer.domElement, c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const g = c.getContext('2d'), w = c.width, h = c.height, u = h / 100;
  g.drawImage(src, 0, 0);
  const gr = g.createLinearGradient(0, h - 18 * u, 0, h);
  gr.addColorStop(0, 'rgba(15,11,8,0)'); gr.addColorStop(1, 'rgba(15,11,8,0.72)');
  g.fillStyle = gr; g.fillRect(0, h - 18 * u, w, 18 * u);
  g.fillStyle = '#fbf3e4'; g.textBaseline = 'alphabetic';
  g.font = `italic ${4.6 * u}px 'Cormorant Garamond', serif`;
  g.fillText((currentRegion || 'Gaon').split(' — ')[0], 4 * u, h - 6.4 * u);
  g.font = `${2.1 * u}px Inter, sans-serif`; g.fillStyle = 'rgba(251,243,228,0.78)';
  g.fillText(`${SEASONS[season].name.split(' — ')[0]} · ${clockText(clock.hour)} · ${ATMO.weather === 'clear' ? ATMO.name : ATMO.weatherName}`, 4 * u, h - 3.2 * u);
  g.textAlign = 'right'; g.fillStyle = '#f2b544'; g.font = `${4.4 * u}px 'Tiro Devanagari Hindi', serif`;
  g.fillText('गाँव', w - 4 * u, h - 4 * u);
  c.toBlob((b) => {
    if (!b) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = `gaon-${(currentRegion || 'gaon').split(' — ')[0].toLowerCase().replace(/[^a-z0-9]+/g, '-')}.jpg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, 'image/jpeg', 0.92);
  toast('Postcard saved 📷');
}

// the minibus: toasts, the conductor's bell, and what the passengers say
function busEvents(evs) {
  if (!evs.length) return;
  const boarded = evs.filter((e) => e.type === 'board');
  for (const e of evs) {
    if (e.type === 'door' && e.veh === 'erick') { audio.erickHorn(); queueToast(`Stopped at ${e.stop} — riders hop in`); }
    if (e.type === 'door' && e.veh !== 'erick') { audio.busDoor(); setTimeout(() => { audio.cycleBell(0.9); setTimeout(() => audio.cycleBell(0.9), 260); }, 300); }
    if (e.type === 'alight') {
      queueToast(`${e.n} got off at ${e.stop} · +₹${e.paid}`);
      const [hi, ro] = e.stop === 'Noorpur' ? ['शुक्रिया भाईजान', 'Shukriya bhaijaan'] : e.stop === 'Mariapur' ? ['थैंक यू, गॉड ब्लेस', 'Thank you, God bless'] : pick([['धन्यवाद भैया', 'Dhanyavaad bhaiya'], ['जीते रहो बेटा', 'Jeete raho beta']]);
      setTimeout(() => audio.say(hi, { roman: ro, pitch: 1.0, rate: 1.05, volume: 0.9 }), 500);
    }
    if (e.type === 'empty') queueToast(e.full ? (e.veh === 'erick' ? 'The e-rickshaw is full — 4 riders max' : 'The bus is full') + ' — drop someone off first' : `Nobody waiting at ${e.stop} right now`);
  }
  if (boarded.length) {
    const names = [...new Set(boarded.map((b) => b.dest))];
    queueToast(`${boarded.length === 1 ? 'A passenger' : boarded.length + ' passengers'} aboard — for ${names.join(', ')}`);
    const b = boarded[0];
    audio.say(`भैया, ${b.destHi} चलोगे?`, { roman: `Bhaiya, ${b.dest} chaloge`, pitch: 0.9 + Math.random() * 0.5, rate: 1.05, volume: 0.9 });
  }
}

// small debug hook for screenshots / tinkering from the console
window.__gaon = {
  prof: () => ({ long: profLong, load: loadTimes, bakes: globalThis.__bakeTimes, frames: profFrames, ms: Object.fromEntries([...profAcc].map(([k, v]) => [k, +(v / Math.max(1, profFrames)).toFixed(2)])), calls: renderer.info.render.calls, tris: renderer.info.render.triangles, objects: (() => { let n = 0; scene.traverse(() => n++); return n; })() }),
  profReset: () => { profAcc.clear(); profFrames = 0; },
  player,
  view(y, p, d) { yaw = y; pitch = p; targetDist = dist = d; },
  // the old preset numbers still work: 0 golden, 1 morning, 2 noon, 3 dusk, 4 night, 5 moonless, 6 windy, 7 storm, 8 rain
  preset(i) { const k = ['golden', 'morning', 'noon', 'dusk', 'night', 'newmoon'][i]; if (k) { setTimeOfDay(TIMES.find((t) => t.key === k), false); setWeatherChoice('clear', false); } else setWeatherChoice(['windy', 'storm', 'rain'][i - 6], false); },
  clock, get atmo() { return ATMO; },
  hour(h) { clock.hour = h; clock.envT = 0; }, weather(k) { setWeatherChoice(k, false); clock.wx = k; clock.wxW = 1; },
  setTime(t) { time = t; },
  keys,
  get train() { return train; },
  get people() { return people; },
  get animals() { return animals; },
  get tractor() { return farm.tractor.pos; },
  get boatPark() { return vehicles.find((v) => v.water).park; },
  get wild() { return wild; },
  get passengers() { return passengers; },
  get site() { return site; },
  get kites() { return kites; },
  get mela() { return mela; },
  get robbed() { return robbed; },
  get flight() { return flight; },
  get heli() { return heliV; },
  get stations() { return stations; },
  get herds() { return herds; },
  get hamlets() { return hamlets; },
  get friends() { return friends; },
  heightAt, groundHeight, // (testing: the ground)
  get hose() { return hose; }, get joy() { return joy; }, layout, pumpS, TRACK_PONDS, jungleMask, RAPID, rapidLevel,
  get shrineLife() { return shrineLife; },
  get trackside() { return trackside; },
  allPeople: ALL_PEOPLE,
  get birds() { return birds; },
  get drv() { return drv; },
  nearCab: () => nearCab(),
  startDriving: (t) => startDriving(t),
  stopDriving: () => stopDriving(),
  get plane() { return planeV; },
  // (testing) board the first coach of a train, wherever it is
  paxBoard: (i = 0, sx = 1) => { const tr = train.trains[i]; const car = tr.cars.find((c) => c.coach); if (car) boardTrain({ tr, car, sx, view: 0 }); return !!car; },
  get trackScene() { return trackScene; },
  get flyView() { return flyView; }, set flyView(v) { flyView = v; },
  takeNear: () => { const t = nearTraffic(); return t ? takeTraffic(t) : null; },
  vehicles,
  drive,
  toggleRide: () => toggleRide(),
  audio,
  renderer,
  scene,
  camera,
  THREE,
  park: (v, x, z, r) => parkVehicle(v, x, z, r),
  crashes,
  knock,
  get inside() { return inside; }, set inside(v) { inside = v; },
  get scanHide() { return [terrainObj, grass, river, waterfall && waterfall.group].filter(Boolean); },
  get postcards() { return postcards; }, get cricket() { return cricket; }, get workers() { return workers; }, get goodsYards() { return goodsYards; },
  startCricket, stopCricket, shareSpot, haveChai, liveMarks, map: () => map,
  get fire() { return fire; }, setSeason(k) { season = k; applySeason(true); }, act() { const a = nearAct(); a?.run(); return a?.ask; }, get sitOn() { return sit.on; }, tea: () => village?.tea,
  begin() { started = true; audio.start(); applySound(); document.body.classList.add('started'); },
};

build();
