// The day and the weather as two separate things, both chosen by the player (nothing drifts by itself).
//  - the day: an hour on a clock (0–24 h). The sun rises behind the eastern hills, climbs, and sets behind the western
//    ones; every light, colour and haze value is blended between the painted looks below as the hours pass.
//  - the weather: a layer over whatever hour it is (clear, breeze, mist, overcast, drizzle, rain, storm),
//    faded in and out, so rain can fall at dusk and a storm can break at night.
import * as THREE from 'three';

const M_DEFAULT = { color: '#fff0c8', i: 1, density: 1, height: 14, speed: 1, size: 1 };
// nights are clear of drifting specks: no fireflies, no pollen
const FIREFLY = { color: '#d8ff6a', i: 0, density: 0, height: 3.2, speed: 0.12, size: 1.5 };
// the painted looks of a clear day
const LOOKS = {
  morning: { name: 'Early morning', turb: 3, ray: 1.8, mie: 0.0016, mieG: 0.8, sun: '#ffdcb0', sunI: 3.0, sky: '#d6e2ea', ground: '#6f6650', hemiI: 1.6, fog: '#d3d9d4', fogD: 0.0062, exp: 0.62, wind: 0.45, clouds: 0.22, cLit: '#ffe8d0', cShade: '#a9aab5', sound: 'dawn', motes: { ...M_DEFAULT, i: 0.8 } },
  noon: { name: 'Bright noon', turb: 3, ray: 1.1, mie: 0.004, mieG: 0.8, sun: '#fff3e2', sunI: 3.4, sky: '#bcd6ef', ground: '#7a6a48', hemiI: 1.3, fog: '#c8d8e4', fogD: 0.0024, exp: 0.52, wind: 0.7, clouds: 0.38, cLit: '#ffffff', cShade: '#aab4c0', sound: 'calm', motes: { ...M_DEFAULT, i: 0.6 } },
  golden: { name: 'Golden afternoon', turb: 4.5, ray: 1.6, mie: 0.005, mieG: 0.83, sun: '#ffd09a', sunI: 4.2, sky: '#d2e3f2', ground: '#8a7048', hemiI: 1.6, fog: '#e2d2b4', fogD: 0.0026, exp: 0.66, wind: 0.8, clouds: 0.3, cLit: '#fff3e0', cShade: '#b9b2b2', sound: 'calm', motes: M_DEFAULT },
  dusk: { name: 'Dusk', turb: 3, ray: 3, mie: 0.0016, mieG: 0.8, sun: '#ff9a5a', sunI: 2.4, sky: '#9fadcc', ground: '#4d4038', hemiI: 1.15, fog: '#b9a093', fogD: 0.005, exp: 0.75, wind: 0.5, clouds: 0.3, cLit: '#ffb98a', cShade: '#6b5a6a', sound: 'insects', motes: { ...M_DEFAULT, i: 1.2 } },
  night: { name: 'Full-moon night', turb: 7, ray: 3, mie: 0.007, mieG: 0.87, sun: '#b4c6e8', sunI: 1.4, sky: '#4a6194', ground: '#1e2026', hemiI: 1.1, fog: '#142038', fogD: 0.004, exp: 1.3, wind: 0.35, clouds: 0.14, cLit: '#56637d', cShade: '#141a28', sound: 'insects', motes: FIREFLY },
  newmoon: { name: 'Moonless night', turb: 7, ray: 3, mie: 0.007, mieG: 0.87, sun: '#6070a0', sunI: 0.16, sky: '#1a2236', ground: '#08090c', hemiI: 0.5, fog: '#04060b', fogD: 0.0045, exp: 1.15, wind: 0.25, clouds: 0.04, cLit: '#1a2030', cShade: '#04060a', sound: 'insects', motes: FIREFLY },
};
// the weathers, painted as they look around midday; applied to any hour as a change relative to a clear noon
export const WEATHERS = {
  clear: { name: 'Clear' },
  windy: { name: 'Windy', sun: '#fff0d8', sunI: 3.4, sky: '#c4d4e2', ground: '#7a6a50', hemiI: 1.5, fog: '#cfd5d6', fogD: 0.0034, exp: 0.6, wind: 1.9, clouds: 0.55, cloudSpeed: 4, cLit: '#ffffff', cShade: '#8f98a3', sound: 'wind', motes: { color: '#b8b060', i: 0.7, density: 0.4, height: 7, speed: 7, size: 1.8 } },
  mist: { name: 'Morning mist', sun: '#fff2e4', sunI: 2.3, sky: '#d0d9df', ground: '#7a6f58', hemiI: 1.55, fog: '#d5dbd8', fogD: 0.0135, exp: 0.55, wind: 0.2, clouds: 0.18, cLit: '#f4f1ea', cShade: '#aeb3b8' },
  overcast: { name: 'Overcast', sun: '#e6e9ec', sunI: 1.2, sky: '#b6bec6', ground: '#5e5b50', hemiI: 1.75, fog: '#b4bcc1', fogD: 0.0042, exp: 0.6, wind: 0.6, clouds: 0.93, cloudSpeed: 1.4, cLit: '#c6ccd1', cShade: '#7b838b', turb: 9, ray: 0.6 },
  drizzle: { name: 'Light drizzle', sun: '#dfe3e6', sunI: 1.1, sky: '#aab4bd', ground: '#52524a', hemiI: 1.8, fog: '#9ea7ad', fogD: 0.0064, exp: 0.66, wind: 0.7, clouds: 0.9, cloudSpeed: 1.4, cLit: '#b2b9bf', cShade: '#697077', rain: 0.38, sound: 'rain', turb: 10, ray: 0.5, motes: { ...M_DEFAULT, density: 0 } },
  rain: { name: 'Monsoon rain', sun: '#d8dde2', sunI: 0.8, sky: '#a2adb7', ground: '#4a4a42', hemiI: 1.9, fog: '#8f989f', fogD: 0.0105, exp: 0.7, wind: 1.1, clouds: 0.95, cloudSpeed: 1.5, cLit: '#a3aab1', cShade: '#5d646b', rain: 1, sound: 'rain', turb: 10, ray: 0.4, motes: { ...M_DEFAULT, density: 0 } },
  storm: { name: 'Dry thunderstorm', storm: true, sun: '#aab0c4', sunI: 0.9, sky: '#69727f', ground: '#3a3832', hemiI: 1.4, fog: '#5f6672', fogD: 0.0062, exp: 0.78, wind: 2.3, clouds: 0.99, cloudSpeed: 3.5, cLit: '#7f8796', cShade: '#2f343e', sound: 'storm', turb: 12, ray: 0.5, motes: { color: '#a89a70', i: 0.6, density: 0.5, height: 6, speed: 8, size: 1.6 } },
};
// the hours T steps through, and where the old presets sit on the clock
export const TIMES = [
  { key: 'morning', name: 'Early morning', hour: 6.3 }, { key: 'noon', name: 'Bright noon', hour: 12.3 }, { key: 'golden', name: 'Golden afternoon', hour: 17.35 },
  { key: 'dusk', name: 'Dusk', hour: 18.55 }, { key: 'night', name: 'Full-moon night', hour: 22 }, { key: 'newmoon', name: 'Moonless night', hour: 0.5, dark: true },
];

const NUM = ['turb', 'ray', 'mie', 'mieG', 'sunI', 'hemiI', 'fogD', 'exp', 'wind', 'clouds'];
const COL = ['sun', 'sky', 'ground', 'fog', 'cLit', 'cShade'];
const MNUM = ['i', 'density', 'height', 'speed', 'size'];
const resolve = (p) => {
  const o = { ...p, motes: p.motes ? { ...p.motes, color: new THREE.Color(p.motes.color) } : null };
  for (const k of COL) if (p[k]) o[k] = new THREE.Color(p[k]);
  return o;
};
const L = Object.fromEntries(Object.entries(LOOKS).map(([k, v]) => [k, { key: k, ...resolve(v) }]));
const W = Object.fromEntries(Object.entries(WEATHERS).map(([k, v]) => [k, { key: k, ...resolve(v) }]));
const blank = () => { const o = { motes: { color: new THREE.Color() } }; for (const k of COL) o[k] = new THREE.Color(); return o; };
function mix(a, b, t, out) {
  for (const k of NUM) out[k] = a[k] + (b[k] - a[k]) * t;
  for (const k of COL) out[k].copy(a[k]).lerp(b[k], t);
  for (const k of MNUM) out.motes[k] = a.motes[k] + (b.motes[k] - a.motes[k]) * t;
  out.motes.color.copy(a.motes.color).lerp(b.motes.color, t);
  return out;
}
// twilight: between the last light and the night, either end of the day
const twilight = (day, night) => { const o = mix(day, night, 0.55, blank()); o.sunI = 0.06; o.key = 'dusk'; o.sound = night.sound; o.name = 'Twilight'; return o; };
const TW = { dawn: [twilight(L.morning, L.night), twilight(L.morning, L.newmoon)], dusk: [twilight(L.dusk, L.night), twilight(L.dusk, L.newmoon)] };
TW.dawn.forEach((o) => { o.name = 'First light'; o.sound = 'dawn'; });

export const DAWN = 5.5, NIGHTFALL = 19.1; // between these the sun is the light; outside them, the moon
const sunElev = (h) => 60 * Math.sin((Math.PI * (h - 5.8)) / 13); // degrees; below the horizon at night
const sunAz = (h) => 96 + ((262 - 96) * (h - 5.8)) / 13; // rises a little south of east, sets a little south of west
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const out = blank(), ref = L.noon;
out.sunDir = new THREE.Vector3(); out.lightDir = new THREE.Vector3();
const _c = new THREE.Color();
// The look of this moment. hour 0–24; dark: a moonless night; weather + w (0–1): the weather layer and how far in it is.
export function sampleAtmo(hour, dark, weather, w) {
  const N = dark ? L.newmoon : L.night, d = dark ? 1 : 0;
  const keys = [[0, N], [4.7, N], [DAWN, TW.dawn[d]], [6.3, L.morning], [10.5, L.noon], [14.5, L.noon], [17.35, L.golden], [18.55, L.dusk], [NIGHTFALL, TW.dusk[d]], [19.9, N], [24, N]];
  let i = 0;
  while (i < keys.length - 2 && hour >= keys[i + 1][0]) i++;
  const [h0, a] = keys[i], [h1, b] = keys[i + 1], t = smooth(h0, h1, hour);
  mix(a, b, t, out);
  const lead = t < 0.5 ? a : b;
  out.key = lead.key; out.name = lead.name; out.sound = lead.sound;
  out.night = hour < DAWN || hour >= NIGHTFALL;
  out.dark = out.night && dark;
  // lamps and lanterns: fully lit by night, coming on through the dusk, lingering a little at first light
  out.glow = Math.max(smooth(18.1, 19.4, hour), 1 - smooth(5.2, 6.2, hour));
  out.cloudSpeed = 1; out.rain = 0; out.storm = false; out.weather = 'clear'; out.weatherName = 'Clear';
  // the sun's place in the sky (it keeps moving below the horizon, which is what darkens the sky at dusk)
  const el = sunElev(hour);
  out.sunElev = el;
  out.sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - el), THREE.MathUtils.degToRad(sunAz(hour)));
  if (out.night) out.lightDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - (dark ? 40 : 34)), THREE.MathUtils.degToRad(140));
  else out.lightDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - Math.max(el, 2.5)), THREE.MathUtils.degToRad(sunAz(hour)));
  // a low sun is redder and weaker than the painted keys alone make it
  // the weather over it: light and colour change by the same proportion they would at noon; haze, wind, cloud and rain go to the weather's own
  const X = W[weather];
  if (X && X.sun && w > 0.001) {
    const day = 1 - out.glow * 0.75; // by night the clouds hide the moon but don't brighten anything
    out.sunI *= 1 + (X.sunI / ref.sunI - 1) * w;
    out.hemiI *= 1 + (X.hemiI / ref.hemiI - 1) * w * day;
    out.exp *= 1 + (X.exp / ref.exp - 1) * w * day;
    for (const k of COL) {
      const c = out[k], x = X[k], r = ref[k];
      _c.setRGB(c.r * Math.min(2.5, x.r / Math.max(r.r, 0.02)), c.g * Math.min(2.5, x.g / Math.max(r.g, 0.02)), c.b * Math.min(2.5, x.b / Math.max(r.b, 0.02)));
      c.lerp(_c, w * (k === 'sun' ? 1 : day * 0.9 + 0.1));
    }
    for (const k of ['fogD', 'wind', 'clouds']) out[k] += (X[k] - out[k]) * w;
    for (const k of ['turb', 'ray']) if (X[k] !== undefined) out[k] += (X[k] - out[k]) * w;
    out.cloudSpeed = 1 + ((X.cloudSpeed ?? 1) - 1) * w;
    out.rain = (X.rain ?? 0) * w;
    out.storm = !!X.storm && w > 0.6;
    if (X.motes) { for (const k of MNUM) out.motes[k] += (X.motes[k] - out.motes[k]) * w; if (!out.night) out.motes.color.lerp(X.motes.color, w); }
    if (w > 0.5) { out.weather = weather; out.weatherName = X.name; if (X.sound) out.sound = X.sound; }
  }
  out.rainy = out.rain > 0.2;
  return out;
}
export function clockText(hour) {
  const h = Math.floor(hour) % 24, m = Math.floor((hour % 1) * 60);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}
