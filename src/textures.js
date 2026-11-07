// Procedurally painted canvas textures: mud walls with Warli art, thatch, roof tiles, jute weave, ground detail.
import * as THREE from 'three';
import { rng } from './noise.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}
export function toTexture(c, { srgb = true, repeat = [1, 1] } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  return t;
}

function warli(g, x, y, R) {
  g.beginPath(); g.arc(x, y - 20, 4.5, 0, 7); g.fill();
  g.beginPath(); g.moveTo(x - 8, y - 14); g.lineTo(x + 8, y - 14); g.lineTo(x, y - 3); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(x, y - 3); g.lineTo(x - 8, y + 9); g.lineTo(x + 8, y + 9); g.closePath(); g.fill();
  const a = R();
  g.beginPath();
  g.moveTo(x - 6, y - 12); g.lineTo(x - 14, y - 4 - a * 14);
  g.moveTo(x + 6, y - 12); g.lineTo(x + 14, y - 4 - (1 - a) * 14);
  g.moveTo(x - 4, y + 9); g.lineTo(x - 8, y + 21);
  g.moveTo(x + 4, y + 9); g.lineTo(x + 8, y + 21);
  g.stroke();
}

export function mudWallCanvas(base = '#c98f5c', seed = 11) {
  const [c, g] = canvas(512, 256);
  const R = rng(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 600; i++) {
    g.fillStyle = R() < 0.5 ? `rgba(90,50,20,${R() * 0.07})` : `rgba(255,232,195,${R() * 0.08})`;
    g.beginPath(); g.arc(R() * 512, R() * 256, 3 + R() * 28, 0, 7); g.fill();
  }
  const top = Math.floor(256 * 0.6);
  g.fillStyle = '#8c3f24';
  g.fillRect(0, top, 512, 256 - top);
  for (let i = 0; i < 200; i++) {
    g.fillStyle = `rgba(60,20,10,${R() * 0.12})`;
    g.beginPath(); g.arc(R() * 512, top + R() * (256 - top), 2 + R() * 10, 0, 7); g.fill();
  }
  g.fillStyle = '#f1e7d2';
  g.strokeStyle = '#f1e7d2';
  g.lineWidth = 2.2;
  g.fillRect(0, top, 512, 4);
  g.fillRect(0, top + 9, 512, 2);
  for (let x = 6; x < 512; x += 12) { g.beginPath(); g.arc(x, top + 18, 2.2, 0, 7); g.fill(); }
  for (let i = 0; i < 9; i++) warli(g, 28 + i * 56 + (R() - 0.5) * 8, top + 54, R);
  g.fillRect(0, 250, 512, 6);
  return c;
}

export function thatchCanvas() {
  const [c, g] = canvas(256, 256);
  const R = rng(5);
  g.fillStyle = '#a5844c';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3500; i++) {
    const x = R() * 256, y = R() * 256, l = 14 + R() * 40;
    const v = R();
    g.strokeStyle = v < 0.33 ? 'rgba(70,50,25,0.45)' : v < 0.66 ? 'rgba(215,185,120,0.5)' : 'rgba(160,125,70,0.6)';
    g.lineWidth = 0.6 + R() * 1.2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 5, y + l); g.stroke();
    if (y + l > 256) { g.beginPath(); g.moveTo(x, y - 256); g.lineTo(x, y + l - 256); g.stroke(); }
  }
  for (let y = 0; y < 256; y += 32) {
    g.fillStyle = 'rgba(50,35,15,0.25)';
    g.fillRect(0, y, 256, 3);
  }
  return c;
}

export function tileCanvas() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#6e2e1a';
  g.fillRect(0, 0, 256, 256);
  const rows = 8, cols = 8;
  const R = rng(9);
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const x = k * 32 + (r % 2) * 16, y = r * 32;
      const grd = g.createLinearGradient(x, 0, x + 32, 0);
      const b = 0.85 + R() * 0.3;
      grd.addColorStop(0, `rgb(${110 * b},${45 * b},${25 * b})`);
      grd.addColorStop(0.5, `rgb(${185 * b},${82 * b},${48 * b})`);
      grd.addColorStop(1, `rgb(${110 * b},${45 * b},${25 * b})`);
      g.fillStyle = grd;
      for (const dx of [0, -256, 256]) g.fillRect(x + 2 + dx, y + 2, 28, 30);
    }
    g.fillStyle = 'rgba(30,10,5,0.5)';
    g.fillRect(0, r * 32 + 28, 256, 4);
  }
  return c;
}

export function wovenCanvas() {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#c8ab76';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 128; i += 8) {
    g.fillStyle = 'rgba(120,90,50,0.6)';
    g.fillRect(i, 0, 3, 128);
    g.fillRect(0, i + 4, 128, 3);
  }
  return c;
}

export function detailCanvas() {
  const [c, g] = canvas(256, 256);
  const img = g.createImageData(256, 256);
  const R = rng(3);
  for (let i = 0; i < 256 * 256; i++) {
    const v = 110 + R() * 40;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 400; i++) {
    const v = R() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${v},${v},${v},${0.05 + R() * 0.08})`;
    const x = R() * 256, y = R() * 256, r = 2 + R() * 14;
    for (const dx of [0, -256, 256]) for (const dy of [0, -256, 256]) {
      g.beginPath(); g.arc(x + dx, y + dy, r, 0, 7); g.fill();
    }
  }
  return c;
}
