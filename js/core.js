'use strict';
// Core constants, randomness, noise, isometric math and a tiny pixel rasteriser.

const GAME_NAME = 'Heartwood Mill';
const MAP = 72;                 // map is MAP x MAP tiles
const HTW = 16, HTH = 8;        // half tile width / height in art pixels (2:1 isometric)
const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
const DIR_NAMES = ['south-east', 'south-west', 'north-west', 'north-east'];

// ---------- randomness ----------
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rand = makeRng((Date.now() ^ 0x5eed) >>> 0);
function ri(a, b, r = rand) { return a + Math.floor(r() * (b - a + 1)); }
function rf(a, b, r = rand) { return a + r() * (b - a); }
function pick(arr, r = rand) { return arr[Math.floor(r() * arr.length)]; }
function chance(p, r = rand) { return r() < p; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function idx(x, y) { return y * MAP + x; }
function inMap(x, y) { return x >= 0 && y >= 0 && x < MAP && y < MAP; }
function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
function fmt(n) { return Math.round(n).toLocaleString('en-US'); }

// ---------- value noise ----------
function hash2(x, y, s) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, s, oct = 4) {
  let t = 0, amp = 1, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { t += vnoise(x * f, y * f, s + i * 17) * amp; n += amp; amp *= 0.5; f *= 2; }
  return t / n;
}

// ---------- isometric math (tile coords -> art pixels) ----------
function isoX(x, y) { return (x - y) * HTW; }
function isoY(x, y) { return (x + y) * HTH; }
function screenToTile(px, py) { return { x: (px / HTW + py / HTH) / 2, y: (py / HTH - px / HTW) / 2 }; }

// ---------- colours ----------
const _colCache = new Map();
function C(hex, a = 255) {
  const key = hex + a;
  let c = _colCache.get(key);
  if (c === undefined) {
    const n = parseInt(hex.slice(1), 16);
    c = ((a << 24) | ((n & 255) << 16) | (n & 0xff00) | (n >> 16)) >>> 0;
    _colCache.set(key, c);
  }
  return c;
}
function unpack(c) { return [c & 255, (c >> 8) & 255, (c >> 16) & 255, (c >>> 24)]; }
function pack(r, g, b, a = 255) { return ((a << 24) | (clamp(b | 0, 0, 255) << 16) | (clamp(g | 0, 0, 255) << 8) | clamp(r | 0, 0, 255)) >>> 0; }
function shade(c, f) { const [r, g, b, a] = unpack(c); return pack(r * f, g * f, b * f, a); }
function mix(c1, c2, t) { const a = unpack(c1), b = unpack(c2); return pack(lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)); }

// ---------- pixel buffer ----------
class PixBuf {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Uint32Array(w * h); }
  set(x, y, c) {
    x |= 0; y |= 0;
    if (!c || x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.d[y * this.w + x] = c;
  }
  get(x, y) { x |= 0; y |= 0; return (x < 0 || y < 0 || x >= this.w || y >= this.h) ? 0 : this.d[y * this.w + x]; }
  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, typeof c === 'function' ? c(x + i, y + j) : c);
  }
  line(x0, y0, x1, y1, c) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  // scanline polygon fill sampled at pixel centres; c may be a colour or (x,y)=>colour
  poly(pts, c) {
    let minY = Infinity, maxY = -Infinity;
    for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    const fn = typeof c === 'function';
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const sy = y + 0.5, xs = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= sy && b[1] > sy) || (b[1] <= sy && a[1] > sy)) xs.push(a[0] + (sy - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.ceil(xs[k] - 0.5); x <= Math.floor(xs[k + 1] - 0.5); x++) this.set(x, y, fn ? c(x, y) : c);
      }
    }
  }
  ellipse(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, typeof c === 'function' ? c(x, y, dx, dy) : c);
      }
  }
  outline(c) { // 1px outline around opaque pixels
    const src = this.d.slice();
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (src[y * this.w + x]) continue;
      const n = (xx, yy) => xx >= 0 && yy >= 0 && xx < this.w && yy < this.h && src[yy * this.w + xx];
      if (n(x - 1, y) || n(x + 1, y) || n(x, y - 1) || n(x, y + 1)) this.d[y * this.w + x] = c;
    }
  }
  toCanvas() {
    const cv = document.createElement('canvas');
    cv.width = this.w; cv.height = this.h;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const id = ctx.createImageData(this.w, this.h);
    new Uint32Array(id.data.buffer).set(this.d);
    ctx.putImageData(id, 0, 0);
    return cv;
  }
}

// map every opaque pixel of a canvas through fn(colour) -> colour
function recolour(cv, fn) {
  const ctx = cv.getContext('2d');
  const id = ctx.getImageData(0, 0, cv.width, cv.height);
  const u = new Uint32Array(id.data.buffer);
  for (let i = 0; i < u.length; i++) if (u[i] >>> 24) u[i] = fn(u[i]);
  const out = document.createElement('canvas');
  out.width = cv.width; out.height = cv.height;
  out.getContext('2d').putImageData(id, 0, 0);
  return out;
}
