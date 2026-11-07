import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { noise2, clamp } from './noise.js';
import {
  roadX, groundHeight, resolveCollisions, pushOut, colliders, NP, MP, heightAt, riverDist, WATER_Y, WATER, PLAY_RADIUS, layout, regionName, WF, RIVER_HALF, MARKET, TEA,
} from './world.js';
import { buildTerrain, buildGrassData } from './terrain.js';
import { buildGrass } from './grass.js';
import { buildVegetation, setFoliageGlow, setFoliageSeason } from './vegetation.js';
import { buildRiver, buildWaterfall } from './water.js';
import { buildVillage, setNightGlow } from './props.js';
import { buildRailway } from './rail.js';
import { buildPeople } from './people.js';
import { buildAnimals } from './animals.js';
import { LanternLights } from './gear.js';
import { Boy } from './boy.js';
import { Bicycle, Moped } from './bicycle.js';
import { AutoRickshaw, RowBoat, Scooter, SmallCar, MiniBus, ERickshaw, TakenVehicle } from './vehicles.js';
import { buildMela } from './mela.js';
import { Plane, Flight, buildAirstrip } from './plane.js';
import { Helicopter, HeliFlight, buildHelipad } from './heli.js';
import { buildStations, CAPACITY } from './station.js';
import { buildHerds } from './herds.js';
import { buildHamlets } from './hamlet.js';
import { buildShrineLife } from './shrine.js';
import { ALL_PEOPLE } from './people.js';
import { buildPassengers } from './passengers.js';
import { buildConstruction } from './construction.js';
import { buildKites } from './kites.js';
import { Crashes, shapeOf } from './crash.js';
import { buildFarm } from './farm.js';
import { buildFish } from './animals.js';
import { buildWildlife } from './wildlife.js';
import { MapUI } from './map.js';
import { Puffs } from './particles.js';
import { Flocks, GroundBirds, buildMotes } from './life.js';
import { buildNightSky, buildClouds, buildRain } from './atmosphere.js';
import { Ambience, THEMES } from './audio.js';
import { windUniforms } from './wind.js';

const $ = (id) => document.getElementById(id);
const status = (s) => { $('start').textContent = s; };
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

// ---------------- renderer ----------------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 5000);

// ---------------- sky & light ----------------
const sky = new Sky();
sky.scale.setScalar(4000);
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
const SH = 55;
Object.assign(sun.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH, near: 1, far: 320 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight('#cfe0f0', '#7a6440', 1.2);
scene.add(hemi);
scene.fog = new THREE.FogExp2('#d9c7a8', 0.005);

const M_DEFAULT = { color: '#fff0c8', i: 1, density: 1, height: 14, speed: 1, size: 1 };
const PRESETS = [
  { key: 'golden', name: 'Golden afternoon', elev: 20, az: 248, turb: 4.5, ray: 1.6, mie: 0.005, mieG: 0.83, sun: '#ffd09a', sunI: 4.2, sky: '#d2e3f2', ground: '#8a7048', hemiI: 1.6, fog: '#e2d2b4', fogD: 0.0026, exp: 0.66, wind: 0.8, clouds: 0.3, cLit: '#fff3e0', cShade: '#b9b2b2', sound: 'calm', motes: M_DEFAULT },
  { key: 'morning', name: 'Early morning', elev: 7, az: 100, turb: 9, ray: 1.3, mie: 0.009, mieG: 0.8, sun: '#ffdcb0', sunI: 3.0, sky: '#d6e2ea', ground: '#6f6650', hemiI: 1.6, fog: '#d3d9d4', fogD: 0.0072, exp: 0.62, wind: 0.45, clouds: 0.22, cLit: '#ffe8d0', cShade: '#a9aab5', sound: 'dawn', motes: { ...M_DEFAULT, i: 0.8 } },
  { key: 'noon', name: 'Bright noon', elev: 58, az: 165, turb: 3, ray: 1.1, mie: 0.004, mieG: 0.8, sun: '#fff3e2', sunI: 3.4, sky: '#bcd6ef', ground: '#7a6a48', hemiI: 1.3, fog: '#c8d8e4', fogD: 0.0024, exp: 0.52, wind: 0.7, clouds: 0.38, cLit: '#ffffff', cShade: '#aab4c0', sound: 'calm', motes: { ...M_DEFAULT, i: 0.6 } },
  { key: 'dusk', name: 'Dusk', elev: 3, az: 258, turb: 7, ray: 3, mie: 0.007, mieG: 0.87, sun: '#ff9a5a', sunI: 2.4, sky: '#9fadcc', ground: '#4d4038', hemiI: 1.15, fog: '#b9a093', fogD: 0.005, exp: 0.75, wind: 0.5, clouds: 0.3, cLit: '#ffb98a', cShade: '#6b5a6a', sound: 'insects', motes: { ...M_DEFAULT, i: 1.2 } },
  { key: 'night', name: 'Full-moon night', night: true, elev: 34, az: 140, sun: '#b4c6e8', sunI: 1.4, sky: '#4a6194', ground: '#1e2026', hemiI: 1.1, fog: '#142038', fogD: 0.004, exp: 1.3, wind: 0.35, clouds: 0.14, cLit: '#56637d', cShade: '#141a28', sound: 'insects', motes: { color: '#d8ff6a', i: 5, density: 0, height: 3.2, speed: 0.12, size: 1.5 } },
  { key: 'newmoon', name: 'Moonless night', night: true, dark: true, elev: 40, az: 140, sun: '#6070a0', sunI: 0.16, sky: '#1a2236', ground: '#08090c', hemiI: 0.5, fog: '#04060b', fogD: 0.0045, exp: 1.15, wind: 0.25, clouds: 0.04, cLit: '#1a2030', cShade: '#04060a', sound: 'insects', motes: { color: '#d8ff6a', i: 6.5, density: 0, height: 3, speed: 0.12, size: 1.6 } },
  { key: 'windy', name: 'Windy day', elev: 30, az: 220, turb: 7, ray: 1.2, mie: 0.006, mieG: 0.8, sun: '#fff0d8', sunI: 3.4, sky: '#c4d4e2', ground: '#7a6a50', hemiI: 1.5, fog: '#cfd5d6', fogD: 0.0034, exp: 0.6, wind: 1.9, clouds: 0.55, cloudSpeed: 4, cLit: '#ffffff', cShade: '#8f98a3', sound: 'wind', motes: { color: '#b8b060', i: 0.7, density: 0.4, height: 7, speed: 7, size: 1.8 } },
  { key: 'storm', name: 'Dry thunderstorm', storm: true, elev: 22, az: 230, turb: 12, ray: 0.5, mie: 0.012, mieG: 0.75, sun: '#aab0c4', sunI: 0.9, sky: '#69727f', ground: '#3a3832', hemiI: 1.4, fog: '#5f6672', fogD: 0.0062, exp: 0.78, wind: 2.3, clouds: 0.99, cloudSpeed: 3.5, cLit: '#7f8796', cShade: '#2f343e', sound: 'storm', motes: { color: '#a89a70', i: 0.6, density: 0.5, height: 6, speed: 8, size: 1.6 } },
  { key: 'rain', name: 'Monsoon rain', elev: 35, az: 200, turb: 10, ray: 0.4, mie: 0.01, mieG: 0.7, sun: '#d8dde2', sunI: 0.8, sky: '#a2adb7', ground: '#4a4a42', hemiI: 1.9, fog: '#8f989f', fogD: 0.0105, exp: 0.7, wind: 1.1, clouds: 0.95, cloudSpeed: 1.5, cLit: '#a3aab1', cShade: '#5d646b', rain: 1, sound: 'rain', motes: { ...M_DEFAULT, density: 0 } },
];
let presetIdx = 0;
let soundChoice = 'auto';
const WY = () => WATER_Y + WATER.off;
// only the river (and its ghat and pool) holds water: low dry hollows elsewhere are just ground
const wet = (x, z) => riverDist(x, z) < RIVER_HALF + 3;
let herds = null, birds = null, hamlets = null, shrineLife = null;
let stations = null, drv = null, drvLoco = null, drvView = 0;
let river, motes, train, flocks, people, animals, waterfall, lanterns, farm, fish, wild, map;
const scare = { shake: 0, cool: 0 };
let gearMode = 'none';
const storm = { on: false, next: 4, flash: 0, base: null, bolts: [] };
let windBase = 0.8;

function applyPreset(i) {
  const p = PRESETS[i];
  const night = !!p.night;
  sky.visible = !night;
  nightSky.visible = night;
  sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - p.elev), THREE.MathUtils.degToRad(p.az));
  if (!night) {
    const u = sky.material.uniforms;
    u.turbidity.value = p.turb;
    u.rayleigh.value = p.ray;
    u.mieCoefficient.value = p.mie;
    u.mieDirectionalG.value = p.mieG;
    u.sunPosition.value.copy(sunDir);
  } else {
    nightSky.material.uniforms.uMoonDir.value.copy(sunDir);
  }
  nightSky.material.uniforms.uCloud.value = p.clouds;
  nightSky.material.uniforms.uMoon.value = p.dark ? 0 : 1;
  sun.color.set(p.sun);
  sun.intensity = p.sunI;
  hemi.color.set(p.sky);
  hemi.groundColor.set(p.ground);
  hemi.intensity = p.hemiI;
  scene.fog.color.set(p.fog);
  scene.fog.density = p.fogD;
  renderer.toneMappingExposure = p.exp;
  windBase = p.wind;
  const cu = clouds.material.uniforms;
  cu.uCover.value = p.clouds;
  cu.uSpeed.value = p.cloudSpeed || 1;
  cu.uLit.value.set(p.cLit);
  cu.uShade.value.set(p.cShade);
  cu.uOpacity.value = p.rain ? 0.97 : 0.9;
  cu.uSunDir.value.copy(sunDir);
  rain.visible = !!p.rain;
  rain.material.uniforms.uAmount.value = p.rain ? 0.85 : 0;
  if (river) {
    const wu = river.material.uniforms;
    wu.uSunDir.value.copy(sunDir);
    wu.uSunColor.value.set(night ? '#c8d6f0' : p.sun);
    wu.uSky.value.set(p.sky).multiplyScalar(night ? 0.35 : 0.9);
    wu.uHorizon.value.set(p.fog);
    wu.uRain.value = p.rain ? 1 : 0;
    wu.uNight.value = night ? 0.85 : 0;
  }
  if (motes) {
    const mu = motes.material.uniforms, m = p.motes;
    mu.uColor.value.set(m.color);
    mu.uIntensity.value = m.i;
    mu.uDensity.value = m.density;
    mu.uHeight.value = m.height;
    mu.uSpeed.value = m.speed;
    mu.uSize.value = m.size;
  }
  setNightGlow(night ? 1 : p.key === 'dusk' ? 0.35 : 0);
  setFoliageGlow(night ? 0.05 : p.key === 'dusk' ? 0.4 : p.rain ? 0.6 : 1);
  if (train) train.setNight(night ? 1 : p.key === 'dusk' ? 0.4 : 0);
  if (flocks) flocks.enabled = !night && !p.rain && !p.storm;
  if (birds) birds.enabled = !p.storm && !p.rain;
  herds?.setNight(!!night);
  hamlets?.setNight(!!night);
  shrineLife?.setNight(!!night);
  helipad?.setNight(!!night);
  storm.on = !!p.storm;
  storm.base = { hemiI: p.hemiI, exp: p.exp, fog: new THREE.Color(p.fog), cLit: new THREE.Color(p.cLit), fogD: p.fogD };
  if (farm) farm.setTheme({ night, sky: p.sky });
  // weather & time-of-day touches: umbrellas in the rain, lanterns after dark, animals bedding down
  gearMode = p.rain ? 'umbrella' : night ? 'lantern' : 'none';
  if (people) people.setWeather({ rain: !!p.rain, night });
  site?.setWeather({ rain: !!p.rain, night }); kites?.setWeather({ rain: !!p.rain, night }); mela?.setWeather({ rain: !!p.rain, night });
  boy.setGear(gearMode);
  if (animals) animals.setNight(night);
  if (wild) wild.setNight(night || p.key === 'dusk');
  if (lanterns) lanterns.on = night ? 1 : 0;
  if (waterfall) waterfall.setTheme({ night, rain: !!p.rain, sky: p.sky, sun: p.sun });
  if (train) {
    if (night) train.setSmokeColors('#7d8496', '#23252b');
    else if (p.key === 'dusk') train.setSmokeColors('#c9a796', '#3a2f2c');
    else if (p.rain) train.setSmokeColors('#b4b7ba', '#3c3d3f');
    else train.setSmokeColors('#e2ddd4', '#3b3936');
    const w = p.wind * 1.6;
    train.setWind(w * 0.8, w * 0.5);
  }
  if (village) village.setSteamColor(night ? '#6c7488' : p.rain ? '#c9ccce' : '#f4f2ee');
  bloom.strength = night ? 0.5 : 0.28;
  applySeason(true);
  applySound();
  $('atmo').value = p.key;
}
// ---------------- seasons: a separate switch from time-of-day and weather ----------------
const SEASONS = {
  spring: { name: 'Spring — lush and in flower', base: '#2f4a19', tip: '#a8d05a', dry: '#c9b46a', crop: '#a9b85a', flowers: 0.07, crops: 1, water: 0, fog: 1 },
  summer: { name: 'Summer — dry, the river runs low', base: '#4a5220', tip: '#c8bc62', dry: '#dcc274', crop: '#d8bc58', flowers: 0.006, crops: 1, water: -0.6, fog: 0.85, light: '#fff0d0' },
  autumn: { name: 'Autumn — harvest, falling leaves', base: '#45451f', tip: '#b8a050', dry: '#c89a50', crop: '#b89a5a', flowers: 0.01, crops: 0, water: -0.2, fog: 1.1, leaves: true },
  winter: { name: 'Winter — bare trees, misty mornings', base: '#4a4a34', tip: '#b8ae86', dry: '#c4b896', crop: '#9a9070', flowers: 0, crops: 0, water: -0.1, fog: 1.9, light: '#dde6f2' },
};
let season = 'spring';
function applySeason(fromPreset = false) {
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
  const P = PRESETS[presetIdx];
  scene.fog.density = P.fogD * S.fog;
  if (storm.base) storm.base.fogD = scene.fog.density;
  if (S.light && !P.night) sun.color.set(P.sun).lerp(new THREE.Color(S.light), 0.35);
  // autumn: drifting leaves instead of pollen
  if (motes && S.leaves && !P.night && !P.rain) {
    const mu = motes.material.uniforms;
    mu.uColor.value.set('#e0862e'); mu.uIntensity.value = 0.9; mu.uDensity.value = 0.55; mu.uHeight.value = 7; mu.uSpeed.value = 2.2; mu.uSize.value = 2.6;
  }
  $('season').value = season;
  if (!fromPreset) toast(S.name);
}
function applySound() {
  const theme = soundChoice === 'auto' ? PRESETS[presetIdx].sound : soundChoice;
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
});

// ---------------- state ----------------
const boy = new Boy();
const audio = new Ambience();
boy.onStep = (run) => audio.footstep(run);
const startZ = 30;
const player = { x: roadX(startZ) + 0.5, z: startZ, y: 0, vy: 0, grounded: true, facing: Math.PI, speed: 0, dirX: 0, dirZ: -1 };
player.y = groundHeight(player.x, player.z);
let yaw = 0.25, pitch = 0.28, dist = 5.5, targetDist = 5.5;
const keys = {};
let grass, village, terrainObj;
let started = false;
let jumpQueued = false;
// rides: the bicycle parked by the road where the walk starts, and a battered old moped across the road
const vehicles = [
  { obj: new Bicycle(), name: 'bicycle', park: { x: roadX(25) + 2.3, z: 25, rot: 0.4 }, walk: 5.5, run: 8.5, boost: 12.5, accel: 1.3, reach: 2.2, rad: 0.4, lean: 1,
    on: 'On the bicycle', off: 'Off the bicycle', help: [['E', 'get off'], ['B', 'bell'], ['Shift', 'pedal harder']], ask: 'ride the bicycle' },
  { obj: new Moped(), name: 'moped', nitro: true, park: { x: layout.moped.x, z: layout.moped.z, rot: -0.6 }, walk: 9, run: 14, boost: 21, accel: 0.9, reach: 2.2, rad: 0.45, lean: 1,
    on: 'Phat-phat-phat… the old moped starts', off: 'Off the moped', help: [['E', 'get off'], ['B', 'horn'], ['Shift', 'faster'], ['N', 'nitro']], ask: 'ride the moped', flame: true },
  { obj: new AutoRickshaw(), name: 'auto', park: { x: layout.auto.x, z: layout.auto.z, rot: layout.auto.rot }, walk: 8.5, run: 13, boost: 19, accel: 0.8, reach: 2.8, rad: 0.75, lean: 0.2,
    four: true, wb: 1.6, rev: 3.5, probes: [-0.65, 0.6], exit: [-1.1, 0.2], box: [0, -0.1, 0.72, 1.3],
    on: 'Driving the auto rickshaw', off: 'Out of the auto', help: [['W', 'go'], ['S', 'brake / reverse'], ['A D', 'steer'], ['Shift', 'faster'], ['V', 'inside view'], ['E', 'get out'], ['B', 'horn']], ask: 'drive the auto rickshaw', flame: true },
  { obj: new Scooter(), name: 'scooter', nitro: true, park: { x: roadX(29) - 2.8, z: 29, rot: 2.6 }, walk: 8.5, run: 13, boost: 23, accel: 1.0, reach: 2.3, rad: 0.45, lean: 1, flame: true,
    on: 'On the scooter', off: 'Off the scooter', help: [['E', 'get off'], ['B', 'horn'], ['Shift', 'faster'], ['N', 'nitro']], ask: 'ride the scooter' },
  { obj: new SmallCar(), name: 'car', nitro: true, park: { x: roadX(100) + 5, z: 100, rot: 0.1 }, walk: 12, run: 18, boost: 28, accel: 0.9, reach: 3.0, rad: 0.82, lean: 0.1, flame: true,
    four: true, wb: 2.05, rev: 4.5, probes: [-1.05, 0, 1.05], exit: [-1.2, 0], box: [0.33, 0, 0.8, 1.68],
    on: 'In the little car — vroom!', off: 'Out of the car', help: [['W', 'go'], ['S', 'brake / reverse'], ['A D', 'steer'], ['V', 'inside view'], ['E', 'get out'], ['B', 'horn'], ['N', 'nitro']], ask: 'drive the little car' },
  { obj: new MiniBus(), name: 'minibus', park: { x: roadX(84) - 4.9, z: 84, rot: 0 }, walk: 13.9, run: 22.2, boost: 22.2, accel: 0.75, reach: 4.2, rad: 1.12, lean: 0.04, flame: false,
    four: true, wb: 4.1, rev: 3.2, probes: [-2.4, -0.8, 0.8, 2.4], exit: [2.6, 2.3], box: [0.55, 0, 1.15, 3.35],
    on: 'The village minibus — stop at a 🚏 to pick people up (Shift for full speed, 80 km/h)', off: 'Out of the minibus', help: [['W', 'go'], ['S', 'brake / reverse'], ['A D', 'steer'], ['Shift', 'faster (80 km/h)'], ['V', 'inside view'], ['E', 'get out'], ['B', 'horn']], ask: 'drive the minibus' },
  { obj: Object.assign(new ERickshaw(), { fare0: 10, fareK: 2 }), name: 'erick', park: { x: roadX(62) - 4.3, z: 62, rot: 0 }, walk: 6.5, run: 9, boost: 13, accel: 0.75, reach: 2.8, rad: 0.62, lean: 0.15, flame: false,
    four: true, wb: 1.8, rev: 3, probes: [-0.95, 0.05, 0.95], exit: [-1.05, 0.5], box: [0, -0.15, 0.62, 1.42],
    on: 'The e-rickshaw — pick up to 4 riders at a 🚏 bus stop', off: 'Out of the e-rickshaw', help: [['W', 'go'], ['S', 'brake / reverse'], ['A D', 'steer'], ['Shift', 'faster'], ['V', 'inside view'], ['E', 'get out'], ['B', 'horn']], ask: 'drive the e-rickshaw' },
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
  }
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
const nitro = { fuel: 1, on: false, locked: false };
const flames = new Puffs({ max: 160, color: '#9fd0ff', dark: '#ff7a1a', opacity: 0.9, additive: true, buoyancy: 0.3, drag: 3 });
scene.add(flames.mesh);
const dust = new Puffs({ max: 120, color: '#c8a77a', dark: '#a8875a', opacity: 0.45, buoyancy: 0.2, drag: 1.8 });
scene.add(dust.mesh);
let ridePromptT = 0, ridePitch = 0;
let ride = null, bikeRoll = 0, bikeSteer = 0, lastFacing = 0, autoYaw = 0;
const mopedSmoke = new Puffs({ max: 80, color: '#9a9690', dark: '#4a4744', opacity: 0.55, buoyancy: 0.4, drag: 1.2 });
scene.add(mopedSmoke.mesh);
let mopedAcc = 0;
function parkVehicle(v, x, z, rot) {
  scene.attach(v.obj.root);
  v.obj.root.position.set(x, v.water ? WY() : groundHeight(x, z), z);
  v.obj.root.rotation.set(0, rot, v.lean ? -0.1 : 0);
  v.park.x = x; v.park.z = z; v.park.rot = rot;
}
// what a parked vehicle blocks: a box for the four-wheelers, a small circle for the two-wheelers
function parkedShape(v) {
  if (v.box) {
    const [lx, lz, hw, hd] = v.box, r = v.park.rot;
    return { kind: 'b', x: v.park.x + lx * Math.cos(r) + lz * Math.sin(r), z: v.park.z - lx * Math.sin(r) + lz * Math.cos(r), rot: r, hw, hd };
  }
  return { kind: 'c', x: v.park.x, z: v.park.z, r: { moped: 0.45 }[v.name] ?? 0.3 };
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
    boy.root.add(v.obj.root);
    v.obj.root.position.set(0, 0, 0);
    v.obj.root.rotation.set(0, 0, 0);
    if (v.water) player.y = WY();
    drive.v = 0; drive.steer = 0;
    hornFor(v);
    ridePromptT = 4;
    toast(v.on);
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
function hornFor(v) {
  if (v.name === 'bicycle') audio.cycleBell();
  else if (v.name === 'moped') audio.mopedHorn();
  else if (v.name === 'scooter') audio.scooterHorn();
  else if (v.name === 'car') audio.carHorn();
  else if (v.name === 'auto') audio.bulbHorn();
  else if (v.name === 'minibus') audio.busHorn(1);
  else if (v.name === 'erick') audio.erickHorn();
  else if (v.name === 'bus') audio.busHorn(1);
  else if (v.name === 'jeep') audio.jeepHorn(1);
}

// ---------------- taking any vehicle off the road ----------------
// Every bicycle, moped, scooter, bus and jeep going along the roads can be taken: walk up to it, press E, and
// the rider climbs off (not very happily) and waits at the roadside. Park it back near him and walk off and he
// rides away again; leave it anywhere far away and it finds its own way home.
const TAKE_TPL = {
  bus: { walk: 13, run: 22.2, boost: 22.2, accel: 0.65, reach: 5, rad: 1.25, lean: 0.03, flame: false,
    four: true, wb: 5.5, rev: 3, probes: [0.4, -1.6, -3.6, -5.6, -7.6], exit: [-1.6, 0.3], box: [0.6, -3.6, 1.25, 4.55],
    shapeOver: { half: [1.25, 1.5, 4.5], com: [0.6, 1.6, -3.6] },
    off: 'Off the bus', help: [['W', 'go'], ['S', 'brake / reverse'], ['A D', 'steer'], ['Shift', 'faster (80 km/h)'], ['V', 'inside view'], ['E', 'get out'], ['B', 'horn']], ask: 'drive the bus' },
  jeep: { walk: 11, run: 16, boost: 24, accel: 0.8, reach: 3, rad: 0.92, lean: 0.08, flame: true,
    four: true, wb: 2.45, rev: 4, probes: [-1.6, 0.1, 1.7], exit: [-1.3, 0], box: [0.38, 0.13, 0.92, 2.15],
    shapeOver: { half: [0.9, 0.9, 2.1], com: [0.38, 1.0, 0.13] },
    off: 'Out of the jeep', help: [['W', 'go'], ['S', 'brake / reverse'], ['A D', 'steer'], ['Shift', 'faster'], ['V', 'inside view'], ['E', 'get out'], ['B', 'horn']], ask: 'drive the jeep' },
};
const TAKE_NAME = { bicycle: 'bicycle', moped: 'motorbike', scooter: 'scooter', bus: 'bus', jeep: 'jeep' };
const TAKE_SHOUT = {
  bicycle: [['अरे! मेरी साइकिल!', 'Arey! Meri cycle!'], ['ओ भाई, साइकिल वापस लाना!', 'O bhai, cycle vaapas laana!']],
  moped: [['अरे! मेरी गाड़ी!', 'Arey! Meri gaadi!'], ['ओए! धीरे चलाना!', 'Oye! Dheere chalaana!']],
  scooter: [['अरे! मेरा स्कूटर!', 'Arey! Mera scooter!'], ['संभाल के चलाना बेटा!', 'Sambhaal ke chalaana beta!']],
  bus: [['अरे! बस कहाँ ले जा रहे हो?', 'Arey! Bus kahaan le ja rahe ho?'], ['सवारियाँ बैठी हैं, ध्यान से!', 'Savaariyaan baithi hain, dhyaan se!']],
  jeep: [['ओ! मेरी जीप!', 'O! Meri jeep!'], ['अरे रुको! जीप मेरी है!', 'Arey ruko! Jeep meri hai!']],
};
const robbed = [];
const takeKind = (t) => (t.kind === 'bike' ? t.bike.kind : t.kind);
function nearTraffic() {
  if (!people || ride || swim.on) return null;
  let best = null, bd = 1e9;
  for (const t of people.travellers.list) {
    if (t.taken || t.crash || !t.holder.visible || !(t.kind === 'bike' || t.kind === 'bus' || t.kind === 'jeep')) continue;
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
    v = { ...TAKE_TPL[kind], name: kind, obj: new TakenVehicle(t.veh, t.riders), park: { x: seat.x, z: seat.z, rot: t.heading } };
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
const MASS = { bicycle: 60, moped: 130, scooter: 150, auto: 420, erick: 480, car: 900, jeep: 1800, minibus: 3600, bus: 7000 };
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
  if ((ride && ride.fly) || drv) return;
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
    if (v === ride || v.water || v.fly) continue;
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
    if (drv) { /* in the cab */ } else if (ride && ride.fly) {
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
  if (player.speed > 2.2) for (const h of hitList) {
    if (h.person.fallT > 0) continue;
    if (Math.abs(h.x - player.x) + Math.abs(h.z - player.z) > 12) continue;
    let hit = false;
    for (const [ax, az] of mine) if (Math.hypot(h.x - ax, h.z - az) < rP + 0.45) { hit = true; break; }
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
    let o = p.root, vis = true;
    while (o) { if (!o.visible) { vis = false; break; } o = o.parent; }
    if (!vis) continue;
    const e = p.root.matrixWorld.elements, x = e[12], y = e[13], z = e[14];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    if (!(Math.abs(x - player.x) + Math.abs(z - player.z) <= 160)) continue;
    if (y - groundHeight(x, z, y + 0.3) > 0.6) continue; // up on a ride, a cart or a seat
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

// ---------------- build ----------------
async function build() {
  status('Shaping the land and hills…');
  await nextFrame();
  terrainObj = buildTerrain();
  scene.add(terrainObj);
  status('Growing the grass…');
  await nextFrame();
  grass = buildGrass(buildGrassData());
  scene.add(grass);
  status('Planting neem, banyan and coconut trees…');
  await nextFrame();
  scene.add(buildVegetation());
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
  train.onChuff = (p) => {
    const d = Math.hypot(p.x - player.x, p.z - player.z);
    audio.chuff(clamp(1 - d / 230, 0, 1) ** 2);
  };
  stations = buildStations(scene, train, {
    sonpur: layout.sonpur,
    villageFor: (h) => h.village ?? (h.name.startsWith('Noorpur') ? NP : h.name === 'Mariapur' ? MP : null),
    onArrive: (st, n) => {
      const d = Math.hypot(player.x - st.h.yard.x, player.z - st.h.yard.z);
      if (st.train === drv) queueToast(`${st.h.name} — ${n} getting off, ${st.waiting()} waiting to board`);
      else if (d < 120) queueToast(`The ${st.train.name} is in at ${st.h.name}`);
    },
  });
  train.onStation = (type, tr) => {
    const d = Math.min(...tr.boxes.map((b) => Math.hypot(b.x - player.x, b.z - player.z)), 600);
    if (d < 500) audio.horn(clamp(1 - d / 480, 0.15, 1));
    if (type === 'arrive' && d < 60 && !drv && !ride) queueToast('Train standing at the platform — walk up to the engine cab and press E to drive it!');
  };
  // the crossing bell: a quick ding-ding while the barriers are down
  train.onCrossingBell = (X, closed) => { X.bellT = closed ? 0 : -1; };
  train.onEmerge = () => {
    const d = Math.min(...train.boxes.map((b) => Math.hypot(b.x - player.x, b.z - player.z)), 400);
    audio.horn(clamp(1 - d / 380, 0.15, 1));
  };
  status('Waking the village…');
  await nextFrame();
  people = buildPeople(scene, village, {
    started: () => started,
    onBell: (d) => audio.cycleBell(clamp(1 - d / 25, 0, 1) * 0.8),
    onHorn: (d, kind) => { const v = clamp(1 - d / 70, 0, 1); if (v > 0.05) ({ scooter: () => audio.scooterHorn(v), bus: () => audio.busHorn(v), jeep: () => audio.jeepHorn(v) }[kind] ?? (() => audio.mopedHorn(v)))(); },
    personAhead: (x, z, r) => hitList.some((h) => Math.abs(h.x - x) < r && Math.abs(h.z - z) < r),
    trainNear: (x, z) => train.closedBoxes().some((b) => Math.hypot(b.x - x, b.z - z) < 7) || train.boxes.some((b) => {
      const dx = x - b.x, dz = z - b.z, c = Math.cos(b.rot), sn = Math.sin(b.rot);
      return Math.abs(dx * c - dz * sn) < 6 && Math.abs(dx * sn + dz * c) < b.hd + 30;
    }),
    obstacles: () => vehicles.filter((v) => v !== ride && !v.water && !v.crash).map((v) => { const sh = parkedShape(v); return { x: sh.x, z: sh.z, r: (v.box ? Math.max(v.box[2], v.box[3]) : v.rad) + 0.3 }; }),
    onBat: (d) => { audio.tock(clamp(1 - d / 60, 0, 1)); if (d < 35 && Math.random() < 0.5) { const [hi, ro] = pick([['चौका!', 'Chauka!'], ['शाबाश!', 'Shaabaash!'], ['भागो!', 'Bhaago!']]); setTimeout(() => audio.say(hi, { roman: ro, pitch: 1.9, rate: 1.2, volume: 1 - d / 40 }), 250); } },
  });
  for (const v of vehicles) parkVehicle(v, v.park.x, v.park.z, v.park.rot);
  passengers = buildPassengers(scene);
  {
    const say = (hi, ro, d, pitch) => { if (d < 45) audio.say(hi, { roman: ro, pitch, rate: 1.1, volume: clamp(1 - d / 50, 0.2, 1) }); };
    site = buildConstruction(scene, layout.build, {
      tink: (v) => audio.tink(v), thud: (v) => audio.tock(v * 0.5),
      say: (hi, ro) => say(hi, ro, 0, 0.8),
    });
    kites = buildKites(scene, layout.kites, { say: (hi, ro, d) => say(hi, ro, d, 1.9) });
    airstrip = AS ? buildAirstrip(scene, AS, groundHeight) : null;
    helipad = AS?.pad ? buildHelipad(scene, AS.pad, groundHeight) : null;
    mela = buildMela(scene, layout.mela, { say: (hi, ro, d, pitch = 1) => say(hi, ro, d, pitch), pop: (v) => audio.tock(v * 0.6) });
  }
  farm = buildFarm(scene);
  wild = buildWildlife(scene);
  fish = buildFish(scene, (d) => audio.splash(clamp(1 - d / 45, 0, 1) * 0.8));
  animals = buildAnimals(scene);
  for (const pc of animals.peacocks) pc.onCall = (d) => audio.peacock(clamp(1 - d / 120, 0, 1));
  lanterns = new LanternLights(scene, 4);
  lanterns.add({ gear: boy.gear, weight: 1.1 });
  for (const v of people.villagers) lanterns.add({ gear: v.person.gear });
  lanterns.add({ point: village.teaLight, weight: 0.9 });
  flocks = new Flocks(scene);
  birds = new GroundBirds(scene, (x, z) => groundHeight(x, z), (x, z) => wet(x, z));
  birds.onCaw = (v) => audio.caw(v);
  birds.onChirp = (v) => audio.sparrow(v);
  herds = buildHerds(scene, layout.pasture, {
    say: (hi, ro, d, pitch) => { if (d < 45) audio.say(hi, { roman: ro, pitch, rate: 1.05, volume: clamp(1 - d / 50, 0.2, 1) }); },
    moo: (v) => audio.moo(v), cowbell: (v) => audio.cowbell(v), bleat: (v) => audio.bleat(v),
  });
  hamlets = buildHamlets(scene, layout.newVillages ?? []);
  shrineLife = buildShrineLife(scene);
  motes = buildMotes();
  scene.add(motes);
  boy.root.rotation.order = 'YXZ';
  scene.add(boy.root);
  status('Drawing the map…');
  await nextFrame();
  map = new MapUI();
  applyPreset(presetIdx);
  renderer.compile(scene, camera);
  status('Begin the walk');
  $('start').disabled = false;
  document.body.classList.add('ready');
  last = performance.now();
  requestAnimationFrame(loop);
}

// ---------------- input ----------------
const canvas = renderer.domElement;
window.addEventListener('keydown', (e) => {
  if (!e.shiftKey) keys.ShiftLeft = keys.ShiftRight = false;
  if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
  if (e.code === 'Tab' && started && map) { if (!e.repeat) map.toggleBig(); return; }
  if (e.code === 'Escape' && map?.open) { map.toggleBig(false); return; }
  if (e.target instanceof HTMLSelectElement) return;
  if (e.code === 'Space' && !keys.Space && !ride) jumpQueued = true;
  keys[e.code] = true;
  if (!started) return;
  if (e.code === 'KeyT') {
    presetIdx = (presetIdx + 1) % PRESETS.length;
    applyPreset(presetIdx);
    toast(PRESETS[presetIdx].name);
  }
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'KeyU' && !e.repeat) toggleFullscreen();
  if (e.code === 'KeyE') toggleRide();
  if (e.code === 'KeyH') toggleHelp();
  if (e.code === 'KeyC') cycleCamera();
  if (e.code === 'KeyY') { const k = Object.keys(SEASONS); season = k[(k.indexOf(season) + 1) % k.length]; applyPreset(presetIdx); applySeason(); }
  if (e.code === 'KeyB' && ride) hornFor(ride);
  if (ride && ride.fly && !e.repeat) planeKey(e.code);
  if (drv && !e.repeat) { if (e.code === 'KeyB') audio.horn(1); if (e.code === 'KeyV') { drvView = 1 - drvView; toast(drvView ? "Driver's view" : 'Outside view'); } }
  if (e.code === 'KeyV' && ride && ride.four) { inside = (inside + 1) % 3; yaw = player.facing + Math.PI; pitch = 0.28; toast(['Outside view', ride.name === 'minibus' || ride.name === 'bus' ? 'Inside the bus' : ride.name === 'erick' ? 'With the passengers' : 'Back seat view', "Driver's view"][inside]); }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; if (!e.shiftKey) keys.ShiftLeft = keys.ShiftRight = false; });
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
    yaw -= e.movementX * 0.0024;
    autoYaw = performance.now();
    pitch = clamp(pitch + e.movementY * 0.0022, -0.2, 1.25);
  }
});
window.addEventListener('wheel', (e) => { targetDist = clamp(targetDist + e.deltaY * 0.004, 2.2, 18); }, { passive: true });
document.addEventListener('pointerlockchange', () => {
  document.body.classList.toggle('locked', document.pointerLockElement === canvas);
});

function toggleHelp(force) {
  const h = $('help');
  h.classList.toggle('show', force ?? !h.classList.contains('show'));
}
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
for (const p of PRESETS) $('atmo').add(new Option(p.name, p.key));
for (const [k, v] of Object.entries(SEASONS)) $('season').add(new Option(v.name.split(' — ')[0], k));
$('season').addEventListener('change', (e) => { season = e.target.value; applyPreset(presetIdx); applySeason(); e.target.blur(); });
$('sound').add(new Option('Sound: match the weather', 'auto'));
for (const [k, t] of Object.entries(THEMES)) $('sound').add(new Option('Sound: ' + t.label, k));
$('atmo').addEventListener('change', (e) => {
  presetIdx = PRESETS.findIndex((p) => p.key === e.target.value);
  applyPreset(presetIdx);
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
  setTimeout(() => toggleHelp(true), 1600);
  setTimeout(() => toggleHelp(false), 9000);
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
    player.facing -= (v / ride.wb) * Math.tan(ang) * dt;
    player.speed = Math.abs(v);
  } else player.speed += (target - player.speed) * (1 - Math.exp(-dt * (riding ? (target > player.speed ? ride.accel : 2.5) : swim.on ? 3 : player.grounded ? 7 : 1.5)));
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
        for (const c of people.colliders()) pushOut(q, rad, c);
        p.x += q.x - q0x; p.z += q.z - q0z;
      }
    } else resolveCollisions(p, rad, player.y);
    for (const v of vehicles) if (v !== ride && !v.water && !v.crash) pushOut(p, rad, parkedShape(v));
    for (const b of crashes.bodies) if (b.state !== 'fly') pushOut(p, rad, { kind: 'c', x: b.p.x, z: b.p.z, r: b.radius });
    for (const c of farm.colliders()) pushOut(p, rad, c);
    for (const c of wild.colliders()) pushOut(p, rad, c);
    if (!(riding && ride.water)) {
      for (const c of people.colliders()) pushOut(p, rad, c);
      for (const c of animals.colliders()) pushOut(p, rad, c);
      if (herds) for (const c of herds.colliders()) pushOut(p, rad, c);
    }
    for (const b of train.boxes) pushOut(p, 0.3, b);
    for (const b of train.closedBoxes()) pushOut(p, rad, b);
    const blocked = (x, z) => {
      const g = groundHeight(x, z, player.y);
      // vehicles can't go into the river; on foot you can wade in and swim
      if (riding && ride.water) return g > WY() - 0.22 || !wet(x, z); // the boat needs water under it
      return (riding && g < WY() - 0.2 && wet(x, z)) || g > Math.max(player.y, swim.on ? WY() - 0.6 : player.y) + STEP_UP;
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
  if (player.grounded) {
    if (gy < player.y - 0.5) {
      player.grounded = false; // stepped off an edge
      player.vy = 0;
    } else {
      player.y += (gy - player.y) * (1 - Math.exp(-dt * (ride && !ride.water ? 9 : 16)));
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
    boy.root.rotation.z = bikeRoll;
    // pitch with the slope of the ground under the wheels
    if (!ride.water) {
      const fx = Math.sin(player.facing), fz = Math.cos(player.facing), hl = ride.name === 'minibus' ? 2.1 : ride.name === 'bus' ? 2.6 : 0.9;
      const hf = groundHeight(player.x + fx * hl, player.z + fz * hl), hb = groundHeight(player.x - fx * hl, player.z - fz * hl);
      ridePitch += (-Math.atan2(hf - hb, hl * 2) - ridePitch) * (1 - Math.exp(-dt * 6));
    } else ridePitch *= 0.9;
    boy.root.rotation.x = ridePitch;
    if (ride.water) {
      boy.setGear(gearMode === 'lantern' ? 'lantern' : 'none');
      bike.update(dt, player.speed, clamp(yawRate * 0.6, -1, 1), true);
      boy.row(dt, bike);
      for (const sx of bike.dips) { splashAround(3, 0.5); audio.splash(0.25); }
    } else {
      boy.setGear(['auto', 'car', 'minibus', 'erick', 'bus', 'jeep'].includes(ride.name) ? (gearMode === 'umbrella' ? 'none' : gearMode) : gearMode);
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
  for (const v of vehicles) if (!(v === ride && v.water)) v.obj.update(dt, v === ride ? (v.four ? drive.v : player.speed) : 0, bikeSteer, v === ride, PRESETS[presetIdx].night ? 1 : 0);
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
  hud.classList.toggle('show', !!ride && started);
  if (ride) {
    $('rh-speed').textContent = Math.round(player.speed * 3.6);
    $('rh-name').textContent = { auto: 'Auto rickshaw', car: 'Little car', minibus: 'Gaon minibus', erick: 'E-rickshaw', bus: 'Village bus', jeep: 'Jeep', moped: 'Motorbike' }[ride.name] ?? ride.name[0].toUpperCase() + ride.name.slice(1);
    hud.classList.toggle('four', !!ride.four);
    hud.classList.toggle('bus', !!ride.obj.seats);
    if (ride.four) {
      const g = drive.v < -0.15 ? 'r' : Math.abs(drive.v) < 0.15 && !f ? 'n' : 'd';
      for (const k of ['r', 'n', 'd']) $('g-' + k).classList.toggle('on', g === k);
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
  const fov = (camMode >= 3 || (inside && ride && ride.four) ? camera.fov : 55) + (camMode >= 3 || (inside && ride && ride.four) ? 0 : boostFx * 12);
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
  // the moped: engine note and blue-grey two-stroke smoke
  const onMoped = ride && ['moped', 'scooter', 'auto', 'car', 'minibus', 'jeep', 'bus'].includes(ride.name);
  audio.setRide(ride ? ride.name : null, player.speed, four ? f > 0 : len > 0, boosting);
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
  if (nv && swim.on && !nv.water) nv = null;
  const keyChips = (list) => list.map(([k, t]) => `<span class="chip"><kbd>${k}</kbd>${t}</span>`).join('');
  const html = ride ? keyChips(ride.help) : nv ? keyChips([['E', swim.on ? 'climb into the boat' : nv.ask]]) : swim.on ? keyChips([['W', 'swim'], ['Shift', 'swim faster']]) : '';
  if ($('prompt').dataset.html !== html) { $('prompt').innerHTML = html; $('prompt').dataset.html = html; }
  $('prompt').classList.toggle('show', started && (ride ? (player.speed < 0.5 && !(four && f)) || ridePromptT > 0 : !!nv || (swim.on && player.speed < 0.2)));
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
  drv = null;
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
  $('tunnel').classList.toggle('show', inTunnel && started);
  // HUD: speed, how hard she's working, passengers and the next stop
  const hud = $('ridehud');
  hud.classList.add('show', 'bus'); hud.classList.remove('four', 'boat', 'boost', 'empty');
  $('rh-name').textContent = 'Steam engine';
  $('rh-speed').textContent = Math.round(Math.abs(tr.v) * 3.6);
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
  for (const o of vehicles) if (!o.water) o.obj.update(dt, 0, 0, false, PRESETS[presetIdx].night ? 1 : 0);
}
function trainCamera(dt) {
  const lg = drvLoco.g;
  lg.updateMatrixWorld();
  if (drvView === 1) {
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
  if (Math.abs(camera.fov - 55) > 0.05) { camera.fov = 55; camera.updateProjectionMatrix(); }
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
  for (const o of colliders) {
    if (o.height !== undefined ? y > o.height : agl > 6.5) continue;
    if (o.minY !== undefined && y < o.minY) continue;
    pushOut(p, r, o);
  }
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
  const night = PRESETS[presetIdx].night ? 1 : 0;
  v.obj.animate(dt, { throttle: F.throttle, pitch: inp.pitch, roll: inp.roll, yaw: inp.yaw + (F.ground ? inp.roll * 0.7 : 0), flaps: F.flaps, gear: F.gear, night, speed: F.ground ? F.v : 0, engine: F.engine });
  for (const o of vehicles) if (o !== v && !o.water) o.obj.update(dt, 0, 0, false, night);
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
  const night = PRESETS[presetIdx].night ? 1 : 0;
  v.obj.animate(dt, { collective: F.collective, pitch: -inp.fwd, roll: inp.side, yaw: inp.yaw, night, engine: F.engine });
  for (const o of vehicles) if (o !== v && !o.water) o.obj.update(dt, 0, 0, false, night);
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
  boy.head.visible = !(inside === 2 && ride && ride.four) && !(ride && ride.fly && flyView === 1);
  if (ride && ride.fly && camMode < 3) { flightCamera(dt); return; }
  if (drv && camMode < 3) { trainCamera(dt); return; }
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
    if (Math.abs(camera.fov - 55) > 0.05) { camera.fov = 55; camera.updateProjectionMatrix(); }
    return;
  }
  const modeDist = camMode === 1 ? 2.4 : camMode === 2 ? 15 : null;
  canopyTimer -= dt;
  if (canopyTimer < 0) { canopyTimer = 0.4; refreshCanopies(); }
  dist += ((modeDist ?? targetDist) - dist) * (1 - Math.exp(-dt * 4));
  const pch = camMode === 1 ? Math.min(pitch, 0.25) : camMode === 2 ? Math.max(pitch, 0.5) : pitch;
  camTarget.set(player.x, player.y + (camMode === 1 ? 1.2 : 1.15), player.z);
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

function updateShadows() {
  const texel = (SH * 2) / sun.shadow.mapSize.x;
  lx.crossVectors(THREE.Object3D.DEFAULT_UP, sunDir).normalize();
  ly.crossVectors(sunDir, lx).normalize();
  tmp.set(player.x, ride && ride.fly ? Math.min(player.y, groundHeight(player.x, player.z) + 30) : player.y, player.z);
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
  if (ride && player.speed > 6) return;
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
const WARN = { leopard: 'A leopard! It springs at you — back away', elephant: 'The elephant charges — give the herd space!', crocodile: 'Careful! A mugger crocodile — stay away from the bank', tiger: 'The tiger roars — back away slowly!', wolf: 'The wolves snap at you — keep your distance' };
const wildEvents = {
  hiss: (d) => audio.hiss(d),
  growl: (d, k) => audio.growl(d, k),
  roar: (d) => { audio.roar(d); if (d < 40) scare.shake = Math.max(scare.shake, 0.5); },
  howl: (d) => audio.howl(d),
  trumpet: (d) => { audio.trumpet(d); if (d < 30) scare.shake = Math.max(scare.shake, 0.4); },
  snap: (x, z, kind) => {
    if ((ride && ride.fly) || drv) return;
    if (scare.cool > 0) return;
    scare.cool = 2.5;
    const dx = player.x - x, dz = player.z - z, d = Math.hypot(dx, dz) || 1;
    const push = kind === 'tiger' || kind === 'elephant' ? 4.5 : 2.6;
    const p = { x: player.x + (dx / d) * push, z: player.z + (dz / d) * push };
    resolveCollisions(p, 0.3, player.y);
    player.x = p.x; player.z = p.z;
    player.speed = 0;
    if (!ride && !swim.on) { player.vy = 3.2; player.grounded = false; }
    scare.shake = 1;
    if (kind === 'elephant') audio.trumpet(2);
    else if (kind === 'tiger') audio.roar(2); else if (kind === 'crocodile') audio.hiss(1);
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

function loop(now) {
  // schedule the next frame first: a bug in one frame must never freeze the whole game
  requestAnimationFrame(loop);
  try { frame(now); } catch (err) {
    if (!loop.errors || loop.errors < 5) console.error('frame error (game keeps running):', err);
    loop.errors = (loop.errors || 0) + 1;
  }
}
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000) || 0);
  last = now;
  time += dt;

  windUniforms.uTime.value = time;
  const gust = 0.5 + 0.5 * (noise2(time * 0.09, 3.7) * 0.7 + noise2(time * 0.31, 9.1) * 0.3);
  windUniforms.uWind.value = windBase * (0.55 + gust * 0.75);

  if (!started) yaw += dt * 0.04;
  collectHittables();
  people.update(dt, player);
  trafficHits();
  site.update(dt, player);
  kites.update(dt, player);
  mela?.update(dt, player);
  airstrip?.update(dt, windUniforms.uWind.value);
  updateRobbed(dt);
  pumpToasts(dt);
  {
    const carriers = vehicles.filter((v) => v.obj.seats);
    const act = carriers.includes(ride) && !ride.crash ? ride : null;
    const evs = passengers.update(dt, player, carriers.map((v) => v.obj), act?.obj ?? null, act ? drive.v : 0);
    busEvents(evs);
  }
  animals.update(dt, player);
  train.update(time);
  for (const X of train.crossings) {
    if (!X.closed) continue;
    X.bellT = (X.bellT ?? 0) - dt;
    if (X.bellT <= 0) { X.bellT = 0.45; const d = Math.hypot(player.x - X.cx, player.z - X.cz); if (d < 90) audio.tink(clamp(1 - d / 90, 0.1, 1) * 0.8); }
  }
  stations?.update(dt, player, !!PRESETS[presetIdx].night);
  updatePlayer(dt);
  crashCheck(dt);
  crashes.update(dt);
  updateCamera(dt);
  updateShadows();

  grass.userData.setCenter(player.x, player.z);
  river.material.uniforms.uTime.value = time;
  const mu = motes.material.uniforms;
  mu.uTime.value = time;
  mu.uCenter.value.set(player.x, player.y, player.z);
  mu.uScale.value = renderer.getPixelRatio();
  village.update(time, dt, player);
  waterfall.update(time, dt, Math.abs(player.x - WF.x) + Math.abs(player.z - WF.z) < 260);
  lanterns.update(player, time);
  farm.update(dt, time, player);
  fish.update(dt, time, player);
  wild.update(dt, player, wildEvents);
  scare.cool -= dt;
  updateStorm(dt);
  if (started) villageVoices(dt);
  if (started) map.update(player, yaw, vehicles.map((v) => ({ name: v.name, x: v === ride ? player.x : v.park.x, z: v === ride ? player.z : v.park.z, ridden: v === ride })));
  flocks.update(time, dt, player);
  birds.update(dt, player, !!PRESETS[presetIdx].night);
  herds?.update(dt, player);
  hamlets?.update(dt, player);
  shrineLife?.update(dt, player);
  clouds.material.uniforms.uTime.value = time;
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
    const meta = `${PRESETS[presetIdx].name} · ${SEASONS[season].name.split(' — ')[0]}${ride ? ' · ' + Math.round(player.speed * 3.6) + ' km/h' : ''}`;
    if ($('pl-meta').textContent !== meta) $('pl-meta').textContent = meta;
    audio.update(windUniforms.uWind.value, Math.min(riverDist(player.x, player.z), Math.hypot(player.x - WF.lipX, player.z - WF.z) * 0.8), {
      temple: Math.hypot(player.x - layout.temple.x, player.z - layout.temple.z),
      cow: nearest(layout.cows, player.x, player.z),
    }, { active: train.active, distance: train.distanceTo(player.x, player.z) });
    audio.setTractor(farm.tractorDistance(player.x, player.z));
    {
      // village life around you: how close the nearest village is, and the goats
      let dv = Infinity;
      for (const v of [{ x: 0, z: 10 }, layout.nv, layout.rv, layout.bv, layout.tv, layout.mh, layout.ne, layout.pg, layout.eh ?? { x: 131, z: 80 }]) if (v) dv = Math.min(dv, Math.hypot(player.x - v.x, player.z - v.z));
      audio.setVillageLife(dv, PRESETS[presetIdx], season, animals.goats ? nearest(animals.goats.filter((g) => g.species === 'goat').map((g) => g.p), player.x, player.z) : 999);
    }
    audio.setFolk(layout.rv ? Math.hypot(player.x - layout.rv.chhatri.x, player.z - layout.rv.chhatri.z) : 999);
    {
      const dMela = mela?.distTo(player.x, player.z) ?? 999;
      audio.setMarket(Math.min(dMela * 0.8, Math.abs(player.z - MARKET.z) < 12 && player.x > MARKET.x0 - 5 && player.x < MARKET.x1 + 5 ? 0 : Math.hypot(player.x - MARKET.x, player.z - MARKET.z) - 12));
      audio.setMela(dMela, !!PRESETS[presetIdx].night);
    }
  }

  composer.render();
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
  player,
  view(y, p, d) { yaw = y; pitch = p; targetDist = dist = d; },
  preset(i) { presetIdx = i; applyPreset(i); },
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
  get shrineLife() { return shrineLife; },
  allPeople: ALL_PEOPLE,
  get birds() { return birds; },
  get drv() { return drv; },
  nearCab: () => nearCab(),
  startDriving: (t) => startDriving(t),
  stopDriving: () => stopDriving(),
  get plane() { return planeV; },
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
};

build();
