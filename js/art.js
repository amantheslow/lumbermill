'use strict';
// Procedural pixel art. Every sprite is { cv, ax, ay }: draw it at (screenX - ax, screenY - ay)
// where screenX/Y is the sprite's anchor (tile centre for small things, footprint top corner for buildings).

const ART = {};
const SHADOW = pack(8, 26, 14, 96);

// ---------- palette ----------
const P = {
  grass: C('#46703f'), grassL: C('#4c7844'), grassD: C('#40693a'),
  dirt: C('#8a5038'), dirtL: C('#955a3f'), dirtD: C('#7b4632'),
  cliff: C('#7a4a33'), cliffD: C('#5b3626'),
  water: C('#156b93'), waterL: C('#2a80a6'), waterS: C('#3c93b4'), waterD: C('#0f5a80'),
  sand: C('#b49563'),
  flowerW: C('#dfe7f2'), flowerB: C('#a9bedf'), flowerY: C('#f0d264'),
  wood: C('#7b5435'), woodL: C('#94673f'), woodD: C('#5c3d27'), woodDD: C('#43291a'),
  log: C('#86603c'), logL: C('#c99c66'), logD: C('#5e3f25'),
  roof: C('#5b5a61'), roofL: C('#6f6e76'), roofD: C('#45444b'), roofDD: C('#36353b'),
  red: C('#b84545'), redL: C('#cc5c57'), redD: C('#8d3434'), redP: C('#d97d70'),
  stone: C('#8b8d94'), stoneL: C('#a7a9ae'), stoneD: C('#696b73'),
  metal: C('#8e949a'), metalL: C('#b2b7bb'), metalD: C('#666c73'),
  belt: C('#2d2a2d'), beltL: C('#3a363a'), chev: C('#b9403a'),
  glass: C('#2d4f9a'), glassL: C('#5577c4'),
  plaster: C('#d8c6a0'), plasterD: C('#b9a682'),
  teal: C('#2f6e6a'), tealL: C('#3c8781'), tealD: C('#245452'),
  black: C('#1b1414'), white: C('#f4efe4'), gold: C('#f3c11b'), window: C('#2a3140'), windowLit: C('#ffd36a'),
};

// ---------- iso box helpers ----------
// corner (tx,ty,z) of a footprint whose top corner sits at buffer (ox,oy)
function cp(ox, oy, tx, ty, z = 0) { return [ox + (tx - ty) * HTW, oy + (tx + ty) * HTH - z]; }

function faceLeft(b, ox, oy, x0, y1, x1, z0, z1, c) { // face at y = y1 spanning x0..x1 (south-west face)
  b.poly([cp(ox, oy, x0, y1, z0), cp(ox, oy, x1, y1, z0), cp(ox, oy, x1, y1, z1), cp(ox, oy, x0, y1, z1)], c);
}
function faceRight(b, ox, oy, x1, y0, y1, z0, z1, c) { // face at x = x1 spanning y0..y1 (south-east face)
  b.poly([cp(ox, oy, x1, y1, z0), cp(ox, oy, x1, y0, z0), cp(ox, oy, x1, y0, z1), cp(ox, oy, x1, y1, z1)], c);
}
function faceTop(b, ox, oy, x0, y0, x1, y1, z, c) {
  b.poly([cp(ox, oy, x0, y0, z), cp(ox, oy, x1, y0, z), cp(ox, oy, x1, y1, z), cp(ox, oy, x0, y1, z)], c);
}
function box(b, ox, oy, x0, y0, x1, y1, z0, z1, cl, cr, ct) {
  faceLeft(b, ox, oy, x0, y1, x1, z0, z1, cl);
  faceRight(b, ox, oy, x1, y0, y1, z0, z1, cr);
  if (ct) faceTop(b, ox, oy, x0, y0, x1, y1, z1, ct);
}
// gable roof with ridge along x
function gableX(b, ox, oy, x0, y0, x1, y1, z, rise, cFront, cBack, cGable, ov = 0.12) {
  const ym = (y0 + y1) / 2;
  b.poly([cp(ox, oy, x0 - ov, y0 - ov, z - 1), cp(ox, oy, x1 + ov, y0 - ov, z - 1), cp(ox, oy, x1 + ov, ym, z + rise), cp(ox, oy, x0 - ov, ym, z + rise)], cBack);
  b.poly([cp(ox, oy, x1, y1, z), cp(ox, oy, x1, y0, z), cp(ox, oy, x1, ym, z + rise)], cGable);
  b.poly([cp(ox, oy, x0 - ov, y1 + ov, z - 1), cp(ox, oy, x1 + ov, y1 + ov, z - 1), cp(ox, oy, x1 + ov, ym, z + rise), cp(ox, oy, x0 - ov, ym, z + rise)], cFront);
}
// gable roof with ridge along y
function gableY(b, ox, oy, x0, y0, x1, y1, z, rise, cFront, cBack, cGable, ov = 0.12) {
  const xm = (x0 + x1) / 2;
  b.poly([cp(ox, oy, x0 - ov, y0 - ov, z - 1), cp(ox, oy, x0 - ov, y1 + ov, z - 1), cp(ox, oy, xm, y1 + ov, z + rise), cp(ox, oy, xm, y0 - ov, z + rise)], cBack);
  b.poly([cp(ox, oy, x0, y1, z), cp(ox, oy, x1, y1, z), cp(ox, oy, xm, y1, z + rise)], cGable);
  b.poly([cp(ox, oy, x1 + ov, y0 - ov, z - 1), cp(ox, oy, x1 + ov, y1 + ov, z - 1), cp(ox, oy, xm, y1 + ov, z + rise), cp(ox, oy, xm, y0 - ov, z + rise)], cFront);
}
function dither(c1, c2, seed = 1, p = 0.5) { return (x, y) => hash2(x, y, seed) < p ? c1 : c2; }
function stripesL(c1, c2, period = 3) { return (x, y) => (Math.floor((y - x * 0.5) / period) & 1) ? c1 : c2; }
function stripesR(c1, c2, period = 3) { return (x, y) => (Math.floor((y + x * 0.5) / period) & 1) ? c1 : c2; }
function logWallL(base) { return (x, y) => { const v = (y - x * 0.5) % 3; const r = v < 0 ? v + 3 : v; return r < 0.9 ? shade(base, 0.72) : (hash2(x, y, 4) < 0.08 ? shade(base, 1.12) : base); }; }
function logWallR(base) { return (x, y) => { const v = (y + x * 0.5) % 3; const r = v < 0 ? v + 3 : v; return r < 0.9 ? shade(base, 0.72) : (hash2(x, y, 5) < 0.08 ? shade(base, 1.12) : base); }; }
function plankL(base) { return (x) => (x % 4 === 0 ? shade(base, 0.75) : base); }
function metalRoof(base) { return (x, y) => ((x + 2 * y) % 6 < 1 ? shade(base, 0.8) : hash2(x, y, 9) < 0.05 ? shade(base, 1.15) : base); }
function tileRoof(base) { return (x, y) => { const r = ((y - x * 0.5) % 3 + 3) % 3; return r < 1 ? shade(base, 0.75) : (x % 5 === 0 ? shade(base, 0.88) : base); }; }

function newBuildingBuf(w, h, H) {
  const b = new PixBuf((w + h) * HTW + 2, (w + h) * HTH + H + 2);
  return { b, ox: h * HTW + 1, oy: H + 1 };
}
function finishBuilding(o) { return { cv: o.b.toCanvas(), ax: o.ox, ay: o.oy }; }
function groundShadow(b, ox, oy, x0, y0, x1, y1) { // soft shadow toward south-east
  b.poly([cp(ox, oy, x0, y0 + 0.2), cp(ox, oy, x1 + 0.25, y0 + 0.2), cp(ox, oy, x1 + 0.25, y1 + 0.2), cp(ox, oy, x0, y1 + 0.2)], SHADOW);
}

// ---------- trees ----------
const TREE_SPECIES = {
  spruce: { name: 'Spruce', kind: 'conifer', growth: 1.0, maxAge: 110, value: 1, cols: ['#5bb75f', '#3f9b49', '#2f8240', '#24683a', '#1b4f2d'] },
  pine: { name: 'Pine', kind: 'conifer', growth: 0.85, maxAge: 140, value: 1.2, cols: ['#5aa776', '#3e8a5c', '#2f7350', '#235c42', '#183f30'] },
  maple: { name: 'Maple', kind: 'round', growth: 0.9, maxAge: 120, value: 1.3, cols: ['#f6b04a', '#ea8a2c', '#d2671f', '#ae461b', '#7d2f16'] },
  birch: { name: 'Birch', kind: 'round', growth: 1.6, maxAge: 80, value: 0.9, trunk: 'birch', cols: ['#f3dc6a', '#e3be45', '#c99d33', '#a77b28', '#77551c'] },
  ancient: { name: 'Ancient Oak', kind: 'round', growth: 0, maxAge: 1e9, value: 0, cols: ['#7fcf6a', '#58ad52', '#3f8f45', '#2d7139', '#1d4f29'] },
};
const STAGE_SCALE = { sapling: 0.36, young: 0.62, mature: 1.0, old: 1.12 };

function drawConifer(b, cx, base, s, cols, seed) {
  const [hi, li, mi, dk, ed] = cols.map(c => C(c));
  const trunkH = Math.max(2, Math.round(4 * s));
  b.rect(cx - 1, base - trunkH - 1, 2, trunkH + 1, (x) => x < cx ? P.wood : P.woodD);
  const tiers = s < 0.5 ? 2 : 3;
  const totalH = Math.round(30 * s), w0 = 9.5 * s;
  let bottom = base - trunkH;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const w = w0 * (1 - t * 0.55), h = totalH / tiers * 1.35;
    const top = bottom - h;
    b.poly([[cx, top], [cx + w, bottom], [cx - w, bottom]], (x, y) => {
      const edge = y >= bottom - 1.2;
      const left = x < cx;
      const n = hash2(x, y, seed + i);
      if (edge) return left ? mi : ed;
      if (left) return n < 0.12 ? hi : li;
      return n < 0.1 ? mi : dk;
    });
    bottom = bottom - h * 0.6;
  }
}
function drawRound(b, cx, base, s, cols, seed, birch, big) {
  const [hi, li, mi, dk, ed] = cols.map(c => C(c));
  const trunkH = Math.max(2, Math.round((big ? 9 : 6) * s));
  const tw = big ? 4 : 2;
  b.rect(cx - tw / 2, base - trunkH - 2, tw, trunkH + 2, (x, y) => birch ? ((hash2(x, y, 3) < 0.25) ? P.black : P.white) : (x < cx ? P.wood : P.woodD));
  const rx = (big ? 17 : 9) * s, ry = (big ? 16 : 10) * s;
  const cy = base - trunkH - ry + 2;
  for (let y = Math.floor(cy - ry - 2); y <= Math.ceil(cy + ry + 2); y++)
    for (let x = Math.floor(cx - rx - 2); x <= Math.ceil(cx + rx + 2); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      const ang = Math.atan2(dy, dx);
      const r = 1 + 0.1 * Math.sin(ang * 5 + seed) + 0.06 * Math.sin(ang * 9 + seed * 2);
      const d = Math.sqrt(dx * dx + dy * dy) / r;
      if (d > 1) continue;
      const l = -dx * 0.55 - dy * 0.75 + (hash2(x, y, seed) - 0.5) * 0.35;
      let c = l > 0.55 ? hi : l > 0.05 ? li : l > -0.45 ? mi : dk;
      if (d > 0.9 && dy > 0.2) c = ed;
      // little clumps
      if (hash2(x >> 1, y >> 1, seed + 7) < 0.08 && l > -0.2) c = hi;
      b.set(x, y, c);
    }
}
function makeTree(species, stage, variant) {
  const sp = TREE_SPECIES[species];
  const big = species === 'ancient';
  const W = big ? 52 : 30, H = big ? 70 : 48;
  const b = new PixBuf(W, H);
  const cx = W / 2, base = H - 6;
  const s = big ? 1 : STAGE_SCALE[stage];
  b.ellipse(cx + 1, base, (big ? 16 : 8) * Math.max(s, 0.5), (big ? 7 : 3.6) * Math.max(s, 0.5), SHADOW);
  const seed = variant * 13 + 5;
  if (sp.kind === 'conifer') drawConifer(b, cx, base, s, sp.cols, seed);
  else drawRound(b, cx, base, s, sp.cols, seed, sp.trunk === 'birch', big);
  return { cv: b.toCanvas(), ax: cx, ay: base };
}
function makeDeadTree(variant) {
  const b = new PixBuf(24, 40), cx = 12, base = 34;
  b.ellipse(cx + 1, base, 5, 2.5, SHADOW);
  const c1 = C('#776657'), c2 = C('#5d4f43');
  b.rect(cx - 1, base - 26, 2, 27, (x) => x < cx ? c1 : c2);
  const r = makeRng(variant + 11);
  for (let i = 0; i < 4; i++) {
    const y = base - 8 - i * 5, dir = i % 2 ? 1 : -1, len = 3 + Math.floor(r() * 4);
    b.line(cx, y, cx + dir * len, y - len + 1, c2);
  }
  return { cv: b.toCanvas(), ax: cx, ay: base };
}
function makeFallenLog() {
  const b = new PixBuf(22, 14), cx = 11, base = 9;
  b.ellipse(cx + 1, base + 1, 8, 3, SHADOW);
  for (let i = -7; i <= 6; i++) for (let t = -1; t <= 1; t++) b.set(cx + i, base + Math.round(i * 0.5) + t, t < 0 ? P.logL : t === 0 ? P.log : P.logD);
  b.ellipse(cx + 7, base + 3.6, 1.6, 1.8, C('#d8b07a'));
  return { cv: b.toCanvas(), ax: cx, ay: base };
}
function makeStump() {
  const b = new PixBuf(12, 10), cx = 6, base = 7;
  b.ellipse(cx + 1, base, 4, 2, SHADOW);
  b.rect(cx - 2, base - 4, 4, 4, (x) => x < cx ? P.wood : P.woodD);
  b.ellipse(cx, base - 4.5, 2.4, 1.3, C('#d3a873'));
  b.set(cx, base - 5, C('#a87d50'));
  return { cv: b.toCanvas(), ax: cx, ay: base };
}

// ---------- workers ----------
const SKIN = ['#f1c9a5', '#e0ac7e', '#c98d5e', '#a56a43', '#7a4b2e', '#5a3720'];
const HAIR = ['#2b1d16', '#4a2f1d', '#7a4a24', '#b0702e', '#d8a650', '#e9d6a0', '#8a8a8a', '#c4472a', '#1d1d24'];
const SHIRTS = {
  lumberjack: [['#b8403a', '#7f2622'], ['#3f6fae', '#26446e'], ['#d0812e', '#8c4f17'], ['#4f8a46', '#2f5a2a']],
  mechanic: [['#3d6fb0', '#a8c3df'], ['#4b5a6e', '#9fb0c4'], ['#335f8f', '#e0d6b8']],
  arborist: [['#4e8b3a', '#d9c49a'], ['#6a8f2e', '#e2d3a6'], ['#3d7a52', '#cbb27f']],
};

function drawPerson(b, ap, ox, oy, back, frame) {
  const skin = C(ap.skin), hair = C(ap.hair), hairD = shade(hair, 0.75);
  const pants = C(ap.pants), boots = C('#2d211b');
  const [s1, s2] = ap.shirt.map(c => C(c));
  const bob = (frame === 1 || frame === 3) ? 1 : 0;
  const y0 = oy + bob;
  // legs
  const legL = frame === 1 ? 1 : 0, legR = frame === 3 ? 1 : 0;
  b.rect(ox + 2, y0 + 10, 2, 3 - legL, pants); b.rect(ox + 5, y0 + 10, 2, 3 - legR, pants);
  b.rect(ox + 2, y0 + 13 - legL, 2, 1, boots); b.rect(ox + 5, y0 + 13 - legR, 2, 1, boots);
  // torso
  for (let y = 0; y < 5; y++) for (let x = 1; x < 8; x++) {
    let c;
    if (ap.role === 'lumberjack') c = ((x + (y >> 0)) & 1) && (y & 1) ? s2 : ((x & 1) ? s1 : shade(s1, 0.85));
    else if (ap.role === 'mechanic') c = (x === 1 || x === 7) ? s1 : (y < 2 && x > 2 && x < 6 ? s2 : s1);
    else c = (x === 1 || x === 7) ? s2 : (x === 4 ? shade(s1, 0.8) : s1);
    b.set(ox + x, y0 + 5 + y, c);
  }
  b.set(ox + 1, y0 + 9, skin); b.set(ox + 7, y0 + 9, skin);
  // head
  b.rect(ox + 2, y0, 5, 5, skin);
  const st = ap.style;
  if (back) {
    b.rect(ox + 2, y0, 5, 5, hair);
    if (st === 2) b.rect(ox + 2, y0, 5, 4, skin);
  } else {
    b.set(ox + 3, y0 + 2, P.black); b.set(ox + 5, y0 + 2, P.black);
    if (st !== 2) { b.rect(ox + 2, y0, 5, 1, hair); b.set(ox + 2, y0 + 1, hair); b.set(ox + 6, y0 + 1, hair); }
    if (ap.beard) { b.rect(ox + 2, y0 + 3, 5, 2, hair); b.set(ox + 4, y0 + 3, skin); b.set(ox + 3, y0 + 3, skin); b.set(ox + 5, y0 + 3, skin); b.rect(ox + 3, y0 + 4, 3, 1, hairD); }
  }
  if (st === 1) { b.rect(ox + 1, y0, 1, 6, hair); b.rect(ox + 7, y0, 1, 6, hair); b.rect(ox + 2, y0 - 1, 5, 1, hair); }
  if (st === 3) { b.rect(ox + 3, y0 - 2, 3, 2, hair); b.rect(ox + 2, y0 - 1, 5, 1, hair); }
  if (st === 4) { b.rect(ox + 1, y0 - 2, 7, 3, hair); b.rect(ox + 1, y0 + 1, 1, 3, hair); b.rect(ox + 7, y0 + 1, 1, 3, hair); }
  if (st === 5) { const hat = C(ap.hat); b.rect(ox + 2, y0 - 2, 5, 3, hat); b.rect(ox + 1, y0, 7, 1, shade(hat, 0.75)); }
  if (st === 0 || st === 2) b.rect(ox + 2, y0 - 1, 5, 1, st === 2 ? 0 : hair);
}
function makeWorkerFrames(ap) {
  const frames = [];
  for (let back = 0; back < 2; back++) for (let f = 0; f < 4; f++) {
    const b = new PixBuf(11, 18);
    b.ellipse(5.5, 16.5, 3.5, 1.5, SHADOW);
    drawPerson(b, ap, 1, 3, back === 1, f);
    frames.push({ cv: b.toCanvas(), ax: 5, ay: 16 });
  }
  return frames;
}
function makePortrait(ap) {
  const b = new PixBuf(14, 14);
  const big = new PixBuf(11, 18);
  drawPerson(big, ap, 1, 3, false, 0);
  for (let y = 0; y < 14; y++) for (let x = 0; x < 11; x++) b.set(x + 1, y, big.get(x, y + 1));
  return b.toCanvas();
}

// ---------- buildings ----------
function spriteHQ(lit) {
  const o = newBuildingBuf(3, 3, 44), { b, ox, oy } = o;
  groundShadow(b, ox, oy, 0.3, 0.3, 2.7, 2.7);
  // porch deck
  faceTop(b, ox, oy, 0.2, 2.3, 2.8, 2.9, 2, P.woodL);
  faceLeft(b, ox, oy, 0.2, 2.9, 2.8, 0, 2, P.woodD);
  faceRight(b, ox, oy, 2.8, 2.3, 2.9, 0, 2, P.woodDD);
  box(b, ox, oy, 0.3, 0.3, 2.7, 2.3, 0, 20, logWallL(P.wood), logWallR(shade(P.wood, 0.8)), null);
  // door + windows
  faceLeft(b, ox, oy, 1.3, 2.3, 1.75, 2, 13, P.woodDD);
  faceLeft(b, ox, oy, 0.55, 2.3, 1.0, 9, 15, lit ? P.windowLit : P.window);
  faceLeft(b, ox, oy, 2.05, 2.3, 2.5, 9, 15, lit ? P.windowLit : P.window);
  faceRight(b, ox, oy, 2.7, 0.8, 1.6, 9, 15, lit ? shade(P.windowLit, 0.9) : P.window);
  gableX(b, ox, oy, 0.3, 0.3, 2.7, 2.3, 20, 14, metalRoof(P.roof), P.roofD, logWallR(shade(P.wood, 0.75)), 0.2);
  // chimney stacks with red caps
  for (let i = 0; i < 2; i++) {
    const [x, y] = cp(ox, oy, 2.1 + i * 0.35, 0.6, 30);
    b.rect(x, y - 6, 3, 9, (xx) => xx === x ? P.metalL : P.metalD);
    b.rect(x - 1, y - 7, 5, 2, P.redD);
  }
  // sign post by the porch
  const [sx, sy] = cp(ox, oy, 0.15, 2.95, 0);
  b.rect(sx - 1, sy - 9, 1, 9, P.woodDD);
  b.rect(sx - 5, sy - 13, 9, 5, P.woodDD); b.rect(sx - 4, sy - 12, 7, 3, P.woodL);
  b.rect(sx - 3, sy - 11, 2, 1, P.gold); b.rect(sx, sy - 11, 2, 1, P.gold);
  return finishBuilding(o);
}
function spriteTent(v) {
  const o = newBuildingBuf(1, 1, 18), { b, ox, oy } = o;
  const r = makeRng(v + 3);
  groundShadow(b, ox, oy, 0.15, 0.15, 0.85, 0.85);
  const patches = [];
  for (let i = 0; i < 6; i++) patches.push([Math.floor(r() * 30), Math.floor(r() * 18)]);
  const patch = (base) => (x, y) => patches.some(([px, py]) => x >= px && x < px + 3 && y >= py && y < py + 2) ? P.redP : base;
  gableX(b, ox, oy, 0.02, 0.18, 0.98, 0.86, 0, 10, patch(P.red), P.redL, P.redD, 0);
  b.poly([cp(ox, oy, 0.98, 0.7, 0), cp(ox, oy, 0.98, 0.34, 0), cp(ox, oy, 0.98, 0.52, 7)], P.black);
  return finishBuilding(o);
}
function spriteWell() {
  const o = newBuildingBuf(1, 1, 26), { b, ox, oy } = o;
  const [cx, cy] = cp(ox, oy, 0.5, 0.5, 0);
  b.ellipse(cx + 2, cy + 1, 10, 5, SHADOW);
  b.rect(cx - 8, cy - 7, 16, 7, (x, y) => hash2(x >> 1, y >> 1, 2) < 0.4 ? P.stoneL : P.stone);
  b.ellipse(cx, cy, 8, 3.5, (x, y) => hash2(x >> 1, y, 2) < 0.4 ? P.stone : P.stoneD);
  b.ellipse(cx, cy - 7, 8, 3.5, P.stoneL);
  b.ellipse(cx, cy - 7, 6, 2.5, C('#24343f'));
  b.rect(cx - 7, cy - 20, 1, 14, P.woodD); b.rect(cx + 6, cy - 20, 1, 14, P.woodD);
  b.line(cx - 7, cy - 17, cx + 6, cy - 17, P.woodDD);
  b.poly([[cx - 10, cy - 18], [cx, cy - 25], [cx + 10, cy - 18], [cx, cy - 15]], (x) => x < cx ? P.redL : P.redD);
  b.rect(cx, cy - 16, 1, 6, C('#9a9a9a'));
  b.rect(cx - 1, cy - 10, 3, 2, P.woodL);
  return finishBuilding(o);
}
function spriteOuthouse() {
  const o = newBuildingBuf(1, 1, 30), { b, ox, oy } = o;
  groundShadow(b, ox, oy, 0.2, 0.2, 0.8, 0.8);
  box(b, ox, oy, 0.2, 0.2, 0.8, 0.8, 0, 22, plankL(P.woodL), plankL(P.wood), null);
  faceLeft(b, ox, oy, 0.32, 0.8, 0.68, 1, 17, plankL(P.wood));
  const [mx, my] = cp(ox, oy, 0.5, 0.8, 13);
  b.set(mx, my, P.black); b.set(mx + 1, my - 1, P.black); b.set(mx + 1, my + 1, P.black); b.set(mx, my - 2, P.black); b.set(mx, my + 2, P.black);
  faceTop(b, ox, oy, 0.12, 0.12, 0.88, 0.88, 23, P.woodD);
  faceLeft(b, ox, oy, 0.12, 0.88, 0.88, 22, 23, P.woodDD);
  faceRight(b, ox, oy, 0.88, 0.12, 0.88, 22, 23, P.woodDD);
  return finishBuilding(o);
}
function spriteCampfire() {
  const o = newBuildingBuf(1, 1, 8), { b, ox, oy } = o;
  const [cx, cy] = cp(ox, oy, 0.5, 0.5, 0);
  b.ellipse(cx, cy, 9, 4.5, C('#3b4a35'));
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2;
    const x = cx + Math.cos(a) * 8, y = cy + Math.sin(a) * 4;
    b.rect(x - 1, y - 1, 3, 2, hash2(i, 0, 1) < 0.5 ? P.stone : P.stoneD);
    b.set(x, y - 2, P.stoneL);
  }
  b.line(cx - 4, cy + 1, cx + 3, cy - 2, P.logD); b.line(cx - 3, cy - 2, cx + 4, cy + 1, P.log);
  return finishBuilding(o);
}
function spriteIntake(level) {
  const o = newBuildingBuf(1, 1, 16), { b, ox, oy } = o;
  groundShadow(b, ox, oy, 0.12, 0.12, 0.88, 0.88);
  box(b, ox, oy, 0.12, 0.12, 0.88, 0.88, 0, 6, plankL(P.woodL), plankL(P.wood), P.woodDD);
  // log ends on the pile
  const n = level === 0 ? 0 : level === 1 ? 4 : 9;
  const spots = [[0.3, 0.3], [0.5, 0.35], [0.7, 0.3], [0.35, 0.55], [0.6, 0.6], [0.45, 0.45], [0.3, 0.7], [0.65, 0.45], [0.5, 0.65]];
  for (let i = 0; i < n; i++) {
    const [x, y] = cp(ox, oy, spots[i][0], spots[i][1], 7 + (i > 5 ? 3 : 0));
    b.ellipse(x, y, 2.4, 1.8, P.logD); b.ellipse(x, y - 0.5, 1.6, 1.2, P.logL);
  }
  return finishBuilding(o);
}
function spriteSawmill() {
  const o = newBuildingBuf(2, 2, 40), { b, ox, oy } = o;
  groundShadow(b, ox, oy, 0.15, 0.15, 1.85, 1.85);
  box(b, ox, oy, 0.15, 0.15, 1.85, 1.85, 0, 16, plankL(P.woodL), plankL(P.wood), null);
  // big opening on left face with saw blade housing
  faceLeft(b, ox, oy, 0.5, 1.85, 1.4, 0, 11, P.woodDD);
  faceRight(b, ox, oy, 1.85, 0.6, 1.2, 7, 12, P.window);
  gableY(b, ox, oy, 0.15, 0.15, 1.85, 1.85, 16, 12, metalRoof(P.roof), P.roofD, plankL(shade(P.wood, 0.9)), 0.15);
  // log chute in front
  faceTop(b, ox, oy, 0.6, 1.85, 1.3, 2.05, 3, P.metalD);
  return finishBuilding(o);
}
function spriteWorkshop() {
  const o = newBuildingBuf(2, 2, 40), { b, ox, oy } = o;
  groundShadow(b, ox, oy, 0.15, 0.15, 1.85, 1.85);
  const beamL = (x, y) => (x % 9 === 0 || ((y - x * 0.5) % 12 + 12) % 12 < 1) ? P.woodD : P.plaster;
  const beamR = (x, y) => (x % 9 === 0 || ((y + x * 0.5) % 12 + 12) % 12 < 1) ? P.woodDD : P.plasterD;
  box(b, ox, oy, 0.15, 0.15, 1.85, 1.85, 0, 15, beamL, beamR, null);
  faceLeft(b, ox, oy, 0.8, 1.85, 1.2, 0, 10, P.woodD);
  faceLeft(b, ox, oy, 0.3, 1.85, 0.6, 6, 11, P.window); faceLeft(b, ox, oy, 1.4, 1.85, 1.7, 6, 11, P.window);
  faceRight(b, ox, oy, 1.85, 0.6, 1.3, 6, 11, P.window);
  gableX(b, ox, oy, 0.15, 0.15, 1.85, 1.85, 15, 13, tileRoof(C('#9a3f35')), C('#7b2f28'), beamR, 0.15);
  const [x, y] = cp(ox, oy, 1.45, 0.55, 22);
  b.rect(x, y - 9, 4, 11, (xx) => xx < x + 2 ? P.stoneL : P.stoneD);
  b.rect(x - 1, y - 10, 6, 2, P.stoneD);
  return finishBuilding(o);
}
function spriteDepot() {
  const o = newBuildingBuf(2, 2, 34), { b, ox, oy } = o;
  groundShadow(b, ox, oy, 0.1, 0.1, 1.9, 1.9);
  faceTop(b, ox, oy, 0.1, 0.1, 1.9, 1.9, 2, (x) => x % 3 === 0 ? P.woodD : P.woodL);
  faceLeft(b, ox, oy, 0.1, 1.9, 1.9, 0, 2, P.woodD); faceRight(b, ox, oy, 1.9, 0.1, 1.9, 0, 2, P.woodDD);
  // crates
  const crate = (tx, ty, z) => box(b, ox, oy, tx, ty, tx + 0.4, ty + 0.4, z, z + 7, plankL(C('#c9995d')), plankL(C('#a87b45')), C('#dcb27a'));
  crate(0.25, 0.25, 2); crate(0.7, 0.25, 2); crate(0.25, 0.7, 2); crate(0.25, 0.25, 9);
  // posts + flat roof
  for (const [tx, ty] of [[0.15, 0.15], [1.85, 0.15], [0.15, 1.85], [1.85, 1.85]]) {
    const [x, y] = cp(ox, oy, tx, ty, 2);
    b.rect(x - 1, y - 18, 2, 18, P.woodD);
  }
  faceTop(b, ox, oy, 0, 0, 2, 2, 22, (x, y) => (x % 4 === 0 ? P.tealD : hash2(x, y, 3) < 0.05 ? P.tealL : P.teal));
  faceLeft(b, ox, oy, 0, 2, 2, 20, 22, P.tealD); faceRight(b, ox, oy, 2, 0, 2, 20, 22, shade(P.tealD, 0.8));
  const [sx, sy] = cp(ox, oy, 1.0, 2.0, 21);
  b.ellipse(sx, sy - 6, 4, 4, P.gold); b.ellipse(sx, sy - 6, 2.5, 2.5, C('#d9a10f'));
  return finishBuilding(o);
}
function spriteSteam() {
  const o = newBuildingBuf(2, 2, 46), { b, ox, oy } = o;
  groundShadow(b, ox, oy, 0.15, 0.15, 1.85, 1.85);
  const brickL = (x, y) => ((((y - x * 0.5) % 3) + 3) % 3 < 1 || ((x + (Math.floor((y - x * 0.5) / 3) & 1) * 2) % 5 === 0)) ? C('#6d3a2c') : C('#8d4b37');
  box(b, ox, oy, 0.15, 0.15, 1.85, 1.85, 0, 6, brickL, (x, y) => shade(brickL(x, y), 0.8), null);
  const rivet = (base) => (x, y) => (x % 6 === 0 && y % 4 === 0) ? P.metalL : ((x + y) % 11 === 0 ? shade(base, 0.85) : base);
  box(b, ox, oy, 0.3, 0.3, 1.7, 1.7, 6, 20, rivet(P.metal), rivet(P.metalD), rivet(P.metalL));
  // stacks
  const stacks = [[0.6, 0.6], [1.0, 0.55], [1.35, 0.7]];
  for (const [tx, ty] of stacks) {
    const [x, y] = cp(ox, oy, tx, ty, 20);
    b.rect(x - 1, y - 12, 4, 13, (xx) => xx < x + 1 ? P.metalL : P.metalD);
    b.rect(x - 2, y - 14, 6, 3, (xx) => xx < x + 1 ? P.redL : P.redD);
  }
  // firebox glow
  faceLeft(b, ox, oy, 0.7, 1.85, 1.2, 1, 5, C('#2a1a14'));
  const [gx, gy] = cp(ox, oy, 1.7, 1.2, 14);
  b.ellipse(gx, gy, 2.5, 2.5, P.white); b.set(gx, gy - 1, P.black); b.set(gx + 1, gy - 1, P.redD);
  return finishBuilding(o);
}
function spriteSolar() {
  const o = newBuildingBuf(2, 2, 24), { b, ox, oy } = o;
  groundShadow(b, ox, oy, 0.2, 0.3, 1.8, 1.8);
  for (const [tx, ty] of [[0.35, 0.4], [1.65, 0.4], [0.35, 1.6], [1.65, 1.6]]) {
    const [x, y] = cp(ox, oy, tx, ty, 0);
    b.rect(x, y - (ty > 1 ? 5 : 11), 1, ty > 1 ? 5 : 11, P.metalD);
  }
  const pts = [cp(ox, oy, 0.1, 0.25, 13), cp(ox, oy, 1.9, 0.25, 13), cp(ox, oy, 1.9, 1.75, 4), cp(ox, oy, 0.1, 1.75, 4)];
  b.poly(pts, (x, y) => {
    const t = screenToTile(x - ox, y - oy + 8);
    const gx = (t.x * 4) % 1, gy = (t.y * 4) % 1;
    if (gx < 0.12 || gy < 0.12) return P.glassL;
    return hash2(x, y, 6) < 0.06 ? C('#7d9ae0') : P.glass;
  });
  b.line(pts[0][0], pts[0][1], pts[1][0], pts[1][1], P.metalL);
  b.line(pts[3][0], pts[3][1], pts[2][0], pts[2][1], P.metalD);
  return finishBuilding(o);
}
function spritePole() {
  const b = new PixBuf(14, 34), cx = 7, base = 31;
  b.ellipse(cx + 1, base, 3, 1.5, SHADOW);
  b.rect(cx - 1, base - 26, 2, 27, (x) => x < cx ? P.woodL : P.woodD);
  b.rect(cx - 5, base - 24, 11, 1, P.woodD);
  b.set(cx - 5, base - 25, C('#9fd1d6')); b.set(cx + 5, base - 25, C('#9fd1d6'));
  return { cv: b.toCanvas(), ax: cx, ay: base };
}
function spriteCabin() {
  const o = newBuildingBuf(2, 2, 36), { b, ox, oy } = o;
  groundShadow(b, ox, oy, 0.2, 0.2, 1.8, 1.8);
  box(b, ox, oy, 0.2, 0.2, 1.8, 1.8, 0, 13, logWallL(P.woodL), logWallR(P.wood), null);
  faceLeft(b, ox, oy, 0.85, 1.8, 1.2, 0, 9, P.woodDD);
  faceLeft(b, ox, oy, 0.35, 1.8, 0.65, 5, 9, P.window); faceRight(b, ox, oy, 1.8, 0.7, 1.2, 5, 9, P.window);
  gableX(b, ox, oy, 0.2, 0.2, 1.8, 1.8, 13, 11, tileRoof(P.red), P.redD, logWallR(shade(P.wood, 0.85)), 0.15);
  return finishBuilding(o);
}
function spriteFlowers() {
  const o = newBuildingBuf(1, 1, 8), { b, ox, oy } = o;
  faceTop(b, ox, oy, 0.15, 0.15, 0.85, 0.85, 2, C('#5a3a28'));
  faceLeft(b, ox, oy, 0.15, 0.85, 0.85, 0, 2, P.stoneD); faceRight(b, ox, oy, 0.85, 0.15, 0.85, 0, 2, P.stone);
  const cols = ['#e05a7a', '#f3d15a', '#f4efe4', '#9b6ad8', '#ef8a3a'].map(c => C(c));
  const r = makeRng(42);
  for (let i = 0; i < 14; i++) {
    const [x, y] = cp(ox, oy, 0.25 + r() * 0.5, 0.25 + r() * 0.5, 3);
    b.set(x, y + 1, C('#3f8a3a')); b.set(x, y, pick(cols, r));
  }
  return finishBuilding(o);
}
function spriteBelt(dir, frame) {
  const b = new PixBuf(32, 20);
  const surf = new PixBuf(32, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) {
    const t = screenToTile(x + 0.5 - 16, y + 0.5);
    if (t.x < 0 || t.y < 0 || t.x > 1 || t.y > 1) continue;
    let a, c; // a: along travel, c: across
    if (dir === 0) { a = t.x; c = t.y; } else if (dir === 1) { a = t.y; c = 1 - t.x; } else if (dir === 2) { a = 1 - t.x; c = 1 - t.y; } else { a = 1 - t.y; c = t.x; }
    const off = Math.abs(c - 0.5);
    if (off > 0.4) continue;
    let col;
    if (off > 0.31) col = off > 0.37 ? P.woodD : P.woodL;
    else {
      const ph = ((a * 2 - off * 1.6 - frame / 4) % 1 + 1) % 1;
      col = ph < 0.16 ? P.chev : ((x + y) % 7 === 0 ? P.beltL : P.belt);
    }
    surf.set(x, y, col);
  }
  for (let x = 0; x < 32; x++) {
    let bottom = -1;
    for (let y = 15; y >= 0; y--) if (surf.get(x, y)) { bottom = y; break; }
    for (let y = 0; y < 16; y++) if (surf.get(x, y)) b.set(x, y, surf.get(x, y));
    if (bottom >= 0) for (let k = 1; k <= 3; k++) b.set(x, bottom + k, k === 3 ? P.woodDD : (x % 6 === 0 ? P.woodDD : P.woodD));
  }
  return { cv: b.toCanvas(), ax: 16, ay: 3 };
}

// ---------- items ----------
function spriteItem(type) {
  const b = new PixBuf(12, 10);
  if (type === 'log') {
    for (let i = -4; i <= 3; i++) for (let t = -1; t <= 1; t++) b.set(6 + i, 5 + Math.round(i * 0.5) + t, t < 0 ? P.logL : t === 0 ? P.log : P.logD);
    b.ellipse(9.6, 6.4, 1.3, 1.6, C('#d8b07a'));
  } else if (type === 'plank') {
    for (let k = 0; k < 3; k++) for (let i = -4; i <= 3; i++) { b.set(6 + i, 6 + Math.round(i * 0.5) - k * 2, C('#e3be86')); b.set(6 + i, 7 + Math.round(i * 0.5) - k * 2, C('#b98d55')); }
  } else if (type === 'crate') {
    const ox = 6, oy = 4;
    box(b, ox, oy, 0, 0, 0.35, 0.35, 0, 5, plankL(C('#c9995d')), plankL(C('#a87b45')), C('#e0b67d'));
  } else if (type === 'chair') {
    b.rect(3, 1, 1, 8, P.woodD); b.rect(4, 1, 4, 1, P.woodL); b.rect(4, 3, 4, 1, P.woodL);
    b.rect(3, 5, 6, 2, P.woodL); b.rect(8, 7, 1, 2, P.woodD); b.rect(5, 7, 1, 2, P.woodD);
  } else if (type === 'table') {
    b.rect(1, 3, 10, 2, C('#b07a48')); b.rect(1, 5, 10, 1, P.woodD); b.rect(2, 6, 1, 3, P.woodD); b.rect(9, 6, 1, 3, P.woodD);
  }
  return { cv: b.toCanvas(), ax: 6, ay: 8 };
}

// ---------- secrets ----------
function spriteSecret(kind) {
  if (kind === 'chest') {
    const b = new PixBuf(16, 14);
    b.ellipse(8, 11, 6, 2.5, SHADOW);
    b.rect(3, 5, 10, 6, (x) => x % 3 === 0 ? P.woodD : P.wood); b.rect(3, 3, 10, 3, P.woodL);
    b.rect(3, 6, 10, 1, P.gold); b.rect(7, 5, 2, 3, P.gold);
    return { cv: b.toCanvas(), ax: 8, ay: 11 };
  }
  if (kind === 'ruin') {
    const b = new PixBuf(30, 30);
    b.ellipse(15, 24, 12, 5, SHADOW);
    b.rect(5, 8, 5, 16, (x, y) => hash2(x, y >> 1, 3) < 0.3 ? P.stoneD : P.stone);
    b.rect(20, 14, 5, 10, (x, y) => hash2(x, y >> 1, 4) < 0.3 ? P.stoneD : P.stoneL);
    b.rect(11, 20, 8, 4, P.stoneD); b.rect(5, 7, 5, 2, C('#4f8a46')); b.rect(20, 13, 5, 2, C('#4f8a46'));
    return { cv: b.toCanvas(), ax: 15, ay: 24 };
  }
  if (kind === 'mushrooms') {
    const b = new PixBuf(28, 16);
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * Math.PI * 2, x = 14 + Math.cos(a) * 10, y = 8 + Math.sin(a) * 5;
      b.rect(x, y, 1, 2, P.white); b.rect(x - 1, y - 1, 3, 1, i % 3 ? C('#d0403a') : C('#e0a040')); b.set(x, y - 1, P.white);
    }
    return { cv: b.toCanvas(), ax: 14, ay: 9 };
  }
  // blueprint cache: a wooden lockbox with paper
  const b = new PixBuf(16, 14);
  b.ellipse(8, 11, 6, 2.5, SHADOW);
  b.rect(3, 6, 10, 5, P.stoneD); b.rect(4, 4, 8, 3, C('#7fa6d8')); b.rect(5, 5, 6, 1, P.white);
  return { cv: b.toCanvas(), ax: 8, ay: 11 };
}

// ---------- UI icons (rendered as data URLs) ----------
function iconCanvas(draw) { const b = new PixBuf(16, 16); draw(b); return b.toCanvas().toDataURL(); }
function buildIcons() {
  const I = {};
  const cream = C('#efe4d0'), red = C('#d65a4f'), dk = C('#2b1d1c');
  I.select = iconCanvas(b => { for (let i = 0; i < 10; i++) b.rect(4, 2 + i, Math.min(i + 1, 7 - Math.max(0, i - 6)), 1, cream); b.rect(7, 10, 2, 4, cream); });
  I.camp = iconCanvas(b => { b.poly([[8, 2], [15, 13], [1, 13]], red); b.poly([[8, 6], [11, 13], [5, 13]], dk); b.rect(0, 13, 16, 1, cream); });
  I.factory = iconCanvas(b => { b.rect(1, 7, 14, 7, cream); b.poly([[1, 7], [5, 4], [5, 7]], cream); b.poly([[5, 7], [9, 4], [9, 7]], cream); b.rect(11, 2, 3, 6, cream); b.rect(3, 10, 2, 2, dk); b.rect(7, 10, 2, 2, dk); b.rect(11, 10, 2, 2, dk); });
  I.belt = iconCanvas(b => { for (let k = 0; k < 2; k++) for (let i = 0; i < 5; i++) { b.rect(3 + k * 6 + i, 3 + i, 2, 1, cream); b.rect(3 + k * 6 + i, 12 - i, 2, 1, cream); } });
  I.power = iconCanvas(b => b.poly([[10, 1], [3, 9], [8, 9], [6, 15], [13, 6], [8, 6]], C('#f3c11b')));
  I.chop = iconCanvas(b => { b.line(3, 14, 11, 4, C('#b98d55')); b.line(4, 14, 12, 4, C('#94673f')); b.poly([[9, 1], [15, 3], [13, 9], [10, 6]], C('#c9ced2')); });
  I.plant = iconCanvas(b => { b.rect(7, 7, 2, 7, C('#7a5a3a')); b.ellipse(5, 6, 3.5, 2.5, C('#5bb75f')); b.ellipse(11, 5, 3.5, 2.5, C('#3f9b49')); b.rect(3, 13, 10, 2, C('#8a5038')); });
  I.path = iconCanvas(b => { b.poly([[8, 2], [15, 8], [8, 14], [1, 8]], C('#955a3f')); b.set(6, 7, C('#7b4632')); b.set(10, 9, C('#7b4632')); });
  I.bulldoze = iconCanvas(b => { b.rect(4, 5, 8, 5, red); b.rect(6, 2, 4, 3, red); b.rect(7, 3, 2, 2, C('#9fd1d6')); b.rect(3, 10, 10, 3, dk); b.rect(0, 6, 2, 7, C('#c9ced2')); b.rect(2, 9, 2, 1, C('#c9ced2')); });
  I.survey = iconCanvas(b => { b.ellipse(6, 6, 4.5, 4.5, cream); b.ellipse(6, 6, 3, 3, C('#5577c4')); b.line(9, 9, 14, 14, cream); b.line(10, 9, 15, 14, cream); });
  I.mill = iconCanvas(b => { b.poly([[8, 1], [15, 7], [1, 7]], C('#8e949a')); b.rect(3, 7, 10, 7, C('#94673f')); b.rect(7, 10, 2, 4, dk); });
  I.letter = iconCanvas(b => { b.rect(1, 4, 14, 9, cream); b.line(1, 4, 8, 9, C('#8a7a66')); b.line(15, 4, 8, 9, C('#8a7a66')); });
  I.tree = iconCanvas(b => { b.poly([[8, 1], [13, 9], [3, 9]], C('#5bb75f')); b.poly([[8, 4], [14, 13], [2, 13]], C('#3f9b49')); b.rect(7, 13, 2, 2, C('#7a5a3a')); });
  I.people = iconCanvas(b => { b.ellipse(5, 5, 2.5, 2.5, cream); b.rect(2, 9, 6, 5, cream); b.ellipse(11, 4, 2.5, 2.5, C('#c9b9a0')); b.rect(8, 8, 6, 6, C('#c9b9a0')); });
  I.coin = iconCanvas(b => { b.ellipse(8, 8, 6.5, 6.5, C('#f3c11b')); b.ellipse(8, 8, 4.5, 4.5, C('#d9a10f')); b.rect(7, 5, 2, 6, C('#f6d65a')); });
  const speaker = (b) => { b.rect(2, 6, 3, 4, cream); b.poly([[5, 6], [9, 2], [9, 14], [5, 10]], cream); };
  I.soundOn = iconCanvas(b => { speaker(b); b.rect(11, 5, 1, 6, cream); b.rect(13, 3, 1, 10, cream); });
  I.soundOff = iconCanvas(b => { speaker(b); b.line(11, 5, 15, 10, red); b.line(15, 5, 11, 10, red); });
  I.research = iconCanvas(b => { b.rect(6, 1, 4, 5, cream); b.poly([[6, 6], [10, 6], [14, 14], [2, 14]], cream); b.poly([[4.5, 10], [11.5, 10], [14, 14], [2, 14]], C('#5bb75f')); });
  return I;
}

// ---------- bake everything ----------
function bakeArt() {
  ART.trees = {}; ART.treesSick = {}; ART.treesFog = {};
  const fogify = (s) => ({ cv: recolour(s.cv, c => { const [r, g, bl, a] = unpack(c); const l = (r + g + bl) / 3; return a < 200 ? c : pack(12 + l * 0.12, 22 + l * 0.14, 18 + l * 0.12, a); }), ax: s.ax, ay: s.ay });
  const sicken = (s) => ({ cv: recolour(s.cv, c => { const [r, g, bl, a] = unpack(c); return a < 200 ? c : mix(c, pack(150, 120, 60), 0.5); }), ax: s.ax, ay: s.ay });
  for (const sp of Object.keys(TREE_SPECIES)) {
    ART.trees[sp] = {}; ART.treesSick[sp] = {}; ART.treesFog[sp] = {};
    const stages = sp === 'ancient' ? ['mature'] : ['sapling', 'young', 'mature', 'old'];
    for (const st of stages) {
      ART.trees[sp][st] = []; ART.treesSick[sp][st] = []; ART.treesFog[sp][st] = [];
      for (let v = 0; v < 3; v++) {
        const s = makeTree(sp, st, v);
        ART.trees[sp][st].push(s); ART.treesSick[sp][st].push(sicken(s)); ART.treesFog[sp][st].push(fogify(s));
      }
    }
  }
  ART.dead = [0, 1, 2].map(makeDeadTree);
  ART.deadFog = ART.dead.map(fogify);
  ART.fallen = makeFallenLog(); ART.stump = makeStump();
  ART.b = {
    hq: spriteHQ(false), hqLit: spriteHQ(true),
    tent: [0, 1, 2].map(spriteTent), well: spriteWell(), outhouse: spriteOuthouse(), campfire: spriteCampfire(),
    intake: [0, 1, 2].map(spriteIntake), sawmill: spriteSawmill(), workshop: spriteWorkshop(), depot: spriteDepot(),
    steam: spriteSteam(), solar: spriteSolar(), pole: spritePole(), cabin: spriteCabin(), flowers: spriteFlowers(),
  };
  ART.belt = [0, 1, 2, 3].map(d => [0, 1, 2, 3].map(f => spriteBelt(d, f)));
  ART.items = {}; for (const t of ['log', 'plank', 'crate', 'chair', 'table']) ART.items[t] = spriteItem(t);
  ART.secret = {}; for (const k of ['chest', 'ruin', 'mushrooms', 'blueprint']) ART.secret[k] = spriteSecret(k);
  ART.icons = buildIcons();
  ART.itemIcons = {}; for (const t of Object.keys(ART.items)) ART.itemIcons[t] = ART.items[t].cv.toDataURL();
}
