'use strict';
// Isometric renderer. The world is drawn 1:1 in art pixels onto a small canvas that CSS scales up crisply.

const R = {
  cv: null, ctx: null, ov: null, octx: null, ground: null, gctx: null,
  cam: { x: 0, y: 300, s: 3 }, ox: 0, oy: 0, cssW: 0, cssH: 0, dpr: 1,
  waterDist: null, fireflies: [], status: {},
};
const GROUND_OX = MAP * HTW; // ground cache x of world x = 0

function initRender() {
  R.cv = document.getElementById('view');
  R.ctx = R.cv.getContext('2d');
  R.ov = document.getElementById('overlay');
  R.octx = R.ov.getContext('2d');
  R.ground = document.createElement('canvas');
  R.ground.width = MAP * HTW * 2; R.ground.height = MAP * HTH * 2 + 12;
  R.gctx = R.ground.getContext('2d');
  // tile highlight sprites
  const diamond = (fill, edge) => {
    const b = new PixBuf(32, 16);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) {
      const t = screenToTile(x + 0.5 - 16, y + 0.5);
      if (t.x < 0 || t.y < 0 || t.x > 1 || t.y > 1) continue;
      const e = Math.min(t.x, t.y, 1 - t.x, 1 - t.y) < 0.07;
      b.set(x, y, e ? edge : fill);
    }
    return b.toCanvas();
  };
  R.hl = {
    ok: diamond(pack(120, 230, 120, 70), pack(170, 255, 170, 220)),
    bad: diamond(pack(240, 90, 80, 80), pack(255, 140, 120, 230)),
    hover: diamond(0, pack(255, 255, 255, 150)),
    chop: diamond(pack(230, 80, 60, 55), pack(255, 120, 90, 200)),
    plant: diamond(pack(140, 220, 110, 60), pack(170, 240, 140, 210)),
    range: diamond(pack(250, 210, 80, 34), 0),
    sel: diamond(0, pack(255, 214, 90, 255)),
  };
  const mk = (draw) => { const b = new PixBuf(11, 11); draw(b); b.outline(pack(20, 14, 14, 255)); return b.toCanvas(); };
  R.status.power = mk(b => { b.rect(1, 1, 9, 9, C('#e0b020')); b.poly([[6, 2], [3, 6], [5.5, 6], [4.5, 9.5], [8, 5], [5.5, 5]], C('#2b1d1c')); });
  R.status.broken = mk(b => { b.rect(1, 1, 9, 9, C('#d0453a')); b.line(3, 8, 7, 4, P.white); b.line(4, 8, 8, 4, P.white); b.rect(6, 2, 3, 2, P.white); });
  R.status.fuel = mk(b => { b.rect(1, 1, 9, 9, C('#c0702a')); b.rect(3, 4, 5, 3, C('#5e3f25')); b.rect(3, 4, 1, 3, C('#c99c66')); });
  R.status.idle = mk(b => { b.rect(1, 1, 9, 9, C('#6f6f78')); b.rect(3, 5, 1, 1, P.white); b.rect(5, 5, 1, 1, P.white); b.rect(7, 5, 1, 1, P.white); });
  R.status.rogue = mk(b => { b.rect(1, 1, 9, 9, C('#7a2fa0')); b.rect(5, 2, 1, 5, P.white); b.rect(5, 8, 1, 1, P.white); });
  computeWaterDist();
  resize();
}
function computeWaterDist() {
  R.waterDist = new Uint8Array(MAP * MAP).fill(255);
  const q = [];
  for (let i = 0; i < MAP * MAP; i++) if (G.tiles[i]) { R.waterDist[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % MAP, y = (i / MAP) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], ny = y + DY[d];
      if (!inMap(nx, ny)) continue;
      const ni = idx(nx, ny);
      if (R.waterDist[ni] > R.waterDist[i] + 1) { R.waterDist[ni] = R.waterDist[i] + 1; q.push(ni); }
    }
  }
}
function resize() {
  R.dpr = Math.min(2, window.devicePixelRatio || 1);
  R.cssW = window.innerWidth; R.cssH = window.innerHeight;
  const s = R.cam.s;
  R.cv.width = Math.ceil(R.cssW / s); R.cv.height = Math.ceil(R.cssH / s);
  R.cv.style.width = (R.cv.width * s) + 'px'; R.cv.style.height = (R.cv.height * s) + 'px';
  R.ov.width = Math.round(R.cssW * R.dpr); R.ov.height = Math.round(R.cssH * R.dpr);
  R.ov.style.width = R.cssW + 'px'; R.ov.style.height = R.cssH + 'px';
  R.ctx.imageSmoothingEnabled = false;
}

// ---------- ground cache ----------
// ground colours by season: spring, summer, autumn, winter (snow)
const GROUND = [
  { grass: '#4f8444', L: '#59914a', D: '#46773c', flowers: ['#f2a6c4', '#f4efe4', '#f0d264'], petal: '#e3bfd6' },
  { grass: '#4a7b3e', L: '#538746', D: '#426f38', flowers: ['#f0d264', '#f4efe4', '#f0d264'], petal: '#d9e3a2' },
  { grass: '#46703f', L: '#4c7844', D: '#40693a', flowers: ['#f0d264', '#dfe7f2', '#dfe7f2'], petal: '#a9bedf' },
  { grass: '#e1e8ef', L: '#f1f5f9', D: '#cdd9e4', flowers: [], petal: null, bare: '#5d7459' },
].map(g => ({ ...g, grass: C(g.grass), L: C(g.L), D: C(g.D), flowers: g.flowers.map(f => C(f)), petal: g.petal ? C(g.petal) : 0, bare: g.bare ? C(g.bare) : 0 }));
function landAt(x, y) { return inMap(x, y) && G.tiles[idx(x, y)] !== 0; }
function revAt(x, y) { return inMap(x, y) ? G.reveal[idx(x, y)] : 0; }
function groundPixel(wx, wy) {
  const t = screenToTile(wx + 0.5, wy + 0.5);
  const tx = Math.floor(t.x), ty = Math.floor(t.y);
  let c;
  if (landAt(tx, ty)) {
    const type = G.tiles[idx(tx, ty)];
    const h = hash2(wx, wy, 7);
    const pal = GROUND[R.season === undefined ? 2 : R.season];
    if (type === 2) {
      c = h < 0.12 ? P.dirtL : h > 0.9 ? P.dirtD : P.dirt;
      if (pal.bare && h > 0.78) c = pal.D; // snow trodden into the path
    } else {
      const n = vnoise(wx * 0.07, wy * 0.12, 3);
      c = n > 0.68 ? pal.L : n < 0.3 ? pal.D : pal.grass;
      if (pal.bare && vnoise(wx * 0.05, wy * 0.09, 8) < 0.2 && h < 0.8) c = pal.bare; // grass showing through the snow
      if (h < 0.05) c = shade(c, 1.08); else if (h > 0.96) c = shade(c, 0.92);
      // little four-petal flowers (in winter, the odd glint of frost)
      const fl = (x, y) => hash2(x, y, 11) < 0.0016;
      if (!pal.petal) { if (hash2(wx, wy, 13) < 0.003) c = P.white; }
      else if (fl(wx, wy)) c = pal.flowers[Math.floor(hash2(wx, wy, 12) * 3)];
      else if (fl(wx - 1, wy) || fl(wx + 1, wy) || fl(wx, wy - 1) || fl(wx, wy + 1)) c = pal.petal;
      // path edges blend softly into grass
      if (type === 1) {
        const fx = t.x - tx, fy = t.y - ty;
        const near = (fx < 0.18 && G.tiles[idx(Math.max(0, tx - 1), ty)] === 2) || (fx > 0.82 && G.tiles[idx(Math.min(MAP - 1, tx + 1), ty)] === 2) ||
          (fy < 0.18 && G.tiles[idx(tx, Math.max(0, ty - 1))] === 2) || (fy > 0.82 && G.tiles[idx(tx, Math.min(MAP - 1, ty + 1))] === 2);
        if (near && h < 0.55) c = mix(c, P.dirt, 0.6);
      }
    }
  } else {
    // cliff band under land edges
    let cliff = 0;
    for (let k = 1; k <= 6; k++) { const u = screenToTile(wx + 0.5, wy + 0.5 - k); if (landAt(Math.floor(u.x), Math.floor(u.y))) { cliff = k; break; } }
    if (cliff) c = cliff <= 1 ? C('#8f5a3c') : cliff >= 6 ? P.cliffD : (hash2(wx, wy, 2) < 0.15 ? P.cliffD : P.cliff);
    else {
      const wd = inMap(tx, ty) ? R.waterDist[idx(tx, ty)] : 9;
      const n = vnoise(wx * 0.05, wy * 0.1, 21);
      const ice = R.season === 3;
      c = wd <= 1 ? (ice ? C('#b7d3e3') : P.waterL) : (n > 0.75 && wd > 3 ? P.waterD : P.water);
      const u = screenToTile(wx + 0.5, wy + 0.5 - 7);
      if (wd <= 1 && landAt(Math.floor(u.x), Math.floor(u.y)) && hash2(wx, wy, 5) < 0.5) c = ice ? C('#e2eef5') : P.waterS;
      if (hash2(wx >> 2, wy, 31) < 0.012) c = P.waterL;
    }
  }
  // fog of war, bilinear between tile centres
  const fx = t.x - 0.5, fy = t.y - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
  const f = lerp(lerp(revAt(x0, y0), revAt(x0 + 1, y0), ax), lerp(revAt(x0, y0 + 1), revAt(x0 + 1, y0 + 1), ax), ay);
  if (f < 1) c = mix(mix(c, C('#0c1410'), 0.8), c, f * f);
  return c;
}
function rebuildGround() {
  const d = G.dirty; if (!d) return;
  G.dirty = null;
  const x0 = clamp(d.x0, 0, MAP - 1), y0 = clamp(d.y0, 0, MAP - 1), x1 = clamp(d.x1, 0, MAP - 1), y1 = clamp(d.y1, 0, MAP - 1);
  const px0 = Math.floor(isoX(x0, y1 + 1)) - 1, px1 = Math.ceil(isoX(x1 + 1, y0)) + 1;
  const py0 = Math.floor(isoY(x0, y0)) - 1, py1 = Math.ceil(isoY(x1 + 1, y1 + 1)) + 8;
  const gx0 = clamp(px0 + GROUND_OX, 0, R.ground.width), gx1 = clamp(px1 + GROUND_OX, 0, R.ground.width);
  const gy0 = clamp(py0, 0, R.ground.height), gy1 = clamp(py1, 0, R.ground.height);
  const w = gx1 - gx0, h = gy1 - gy0;
  if (w <= 0 || h <= 0) return;
  const id = R.gctx.createImageData(w, h), u = new Uint32Array(id.data.buffer);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) u[y * w + x] = groundPixel(gx0 + x - GROUND_OX, gy0 + y);
  R.gctx.putImageData(id, gx0, gy0);
}

// ---------- camera ----------
function worldToScreen(wx, wy) { return [wx + R.ox, wy + R.oy]; }
// from the camera itself rather than the last drawn frame, so a click right after the view moves lands where you aimed
function screenToWorld(cssX, cssY) { return [cssX / R.cam.s - Math.round(R.cv.width / 2 - R.cam.x), cssY / R.cam.s - Math.round(R.cv.height / 2 - R.cam.y)]; }
function tileAtCss(cssX, cssY) { const [wx, wy] = screenToWorld(cssX, cssY); const t = screenToTile(wx, wy); return { x: Math.floor(t.x), y: Math.floor(t.y), fx: t.x, fy: t.y }; }
// zoom levels: on high-density screens half steps stay crisp (1.5 art px = 3 device px), elsewhere whole steps only
function zoomLevels() { return R.dpr >= 2 ? [1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6] : [1, 2, 3, 4, 5, 6]; }
function nearestZoom(s) { return zoomLevels().reduce((a, b) => (Math.abs(b - s) < Math.abs(a - s) ? b : a)); }
function zoomStep(dir, cssX, cssY) {
  const L = zoomLevels(), i = L.indexOf(nearestZoom(R.cam.s));
  setZoom(L[clamp(i + dir, 0, L.length - 1)], cssX, cssY);
}
function setZoom(s, cssX = R.cssW / 2, cssY = R.cssH / 2) {
  s = nearestZoom(clamp(s, 1, 6));
  if (s === R.cam.s) return;
  if (G && G.tutor && typeof playing !== 'undefined' && playing) G.tutor.zoomed = true;
  const [wx, wy] = screenToWorld(cssX, cssY);
  R.cam.s = s; resize();
  // keep the point under the cursor fixed
  R.cam.x = wx - (cssX / s - R.cv.width / 2);
  R.cam.y = wy - (cssY / s - R.cv.height / 2);
  clampCam();
}
function clampCam() {
  R.cam.x = clamp(R.cam.x, -MAP * HTW, MAP * HTW);
  R.cam.y = clamp(R.cam.y, 0, MAP * HTH * 2);
}
function centerOn(tx, ty) { R.cam.x = isoX(tx, ty); R.cam.y = isoY(tx, ty); clampCam(); }

// ---------- drawing ----------
function spr(ctx, s, x, y) { ctx.drawImage(s.cv, Math.round(x - s.ax), Math.round(y - s.ay)); }
function tileTop(x, y) { return [isoX(x, y) + R.ox, isoY(x, y) + R.oy]; }

function render(now) {
  const se = seasonOf();
  if (se !== R.season) { R.season = se; G.dirty = { x0: 0, y0: 0, x1: MAP - 1, y1: MAP - 1 }; R.weather = []; }
  rebuildGround();
  const ctx = R.ctx, cw = R.cv.width, ch = R.cv.height;
  R.ox = Math.round(cw / 2 - R.cam.x); R.oy = Math.round(ch / 2 - R.cam.y);
  const ox = R.ox, oy = R.oy;
  ctx.fillStyle = '#0c1410'; ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(R.ground, ox - GROUND_OX, oy);
  const time = now / 1000;
  const fr = Math.floor(time * (has('rollers') ? 9 : 6)) % 4;

  // visible tile bounds
  const corners = [[0, 0], [cw, 0], [0, ch], [cw, ch]].map(([sx, sy]) => screenToTile(sx - ox, sy - oy));
  const tx0 = clamp(Math.floor(Math.min(...corners.map(c => c.x))) - 2, 0, MAP - 1), tx1 = clamp(Math.ceil(Math.max(...corners.map(c => c.x))) + 3, 0, MAP - 1);
  const ty0 = clamp(Math.floor(Math.min(...corners.map(c => c.y))) - 2, 0, MAP - 1), ty1 = clamp(Math.ceil(Math.max(...corners.map(c => c.y))) + 3, 0, MAP - 1);
  const onScreen = (sx, sy, m = 80) => sx > -m && sy > -m && sx < cw + m && sy < ch + m * 1.5;

  // flat layer: plant marks, conveyors and their cargo
  const list = [];
  for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
    const k = idx(x, y);
    const [sx, sy] = tileTop(x, y);
    if (!onScreen(sx, sy)) continue;
    if (G.plantMark[k]) ctx.drawImage(R.hl.plant, sx - 16, sy);
    const bl = G.belt[k];
    if (bl) { const i = beltInDir(bl); spr(ctx, i === bl.dir ? ART.belt[bl.dir][fr] : ART.beltCorner[i][bl.dir][fr], sx, sy); }
    const t = G.tree[k];
    if (t) list.push({ d: x + y + 1, k: 't', o: t, sx: sx, sy: sy + HTH, fog: !G.reveal[k] });
    if (G.stump[k] && G.reveal[k] && !t) list.push({ d: x + y + 1, k: 's', sx, sy: sy + HTH });
  }
  for (const bl of G.belts) {
    if (!bl.item) continue;
    const p = bl.p - 0.5, d = p < 0 ? beltInDir(bl) : bl.dir; // on a corner, the first half of the trip follows the incoming side
    const cx = bl.x + 0.5 + DX[d] * p, cy = bl.y + 0.5 + DY[d] * p;
    const [sx, sy] = tileTop(cx, cy);
    if (onScreen(sx, sy)) spr(ctx, ART.items[bl.item], sx, sy - 3);
  }
  // buildings, workers, secrets
  for (const b of G.buildings) {
    const [sx, sy] = tileTop(b.x, b.y);
    if (!onScreen(sx, sy + b.h * HTH, 140)) continue;
    list.push({ d: b.x + b.y + (b.w + b.h) / 2, k: 'b', o: b, sx, sy });
  }
  for (const w of G.workers) {
    if (w.hidden) continue;
    const [sx, sy] = tileTop(w.x, w.y);
    if (onScreen(sx, sy)) list.push({ d: w.x + w.y, k: 'w', o: w, sx, sy });
  }
  for (const s of G.secrets) {
    if (!s.found || s.done || s.kind === 'ancient') continue;
    const [sx, sy] = tileTop(s.x + 0.5, s.y + 0.5);
    list.push({ d: s.x + s.y + 1, k: 'x', o: s, sx, sy });
  }
  list.sort((a, b) => a.d - b.d);
  for (const e of list) {
    if (e.k === 't') drawTree(ctx, e.o, e.sx, e.sy, e.fog, time);
    else if (e.k === 's') spr(ctx, R.season === 3 ? winterOf(ART.stump) : ART.stump, e.sx, e.sy);
    else if (e.k === 'b') drawBuilding(ctx, e.o, e.sx, e.sy, time);
    else if (e.k === 'w') drawWorker(ctx, e.o, e.sx, e.sy, time);
    else if (e.k === 'x') {
      spr(ctx, ART.secret[e.o.kind], e.sx, e.sy);
      const tw = Math.sin(time * 4) > 0;
      ctx.fillStyle = '#fff6c0';
      ctx.fillRect(e.sx - 1, e.sy - 22 + (tw ? 0 : 1), 3, 1); ctx.fillRect(e.sx, e.sy - 23 + (tw ? 0 : 1), 1, 3);
    }
  }
  drawWires(ctx);
  drawTutorial(ctx, time);
  // particles
  for (const f of G.fx) {
    const sx = f.x + ox, sy = f.y + oy;
    if (f.k === 'puff') { const a = clamp(f.life / f.max, 0, 1) * 0.7; ctx.fillStyle = f.col + a + ')'; const r = (1 - f.life / f.max) * 3 + 1.5; ctx.fillRect(Math.round(sx - r), Math.round(sy - r), Math.round(r * 2), Math.round(r * 2)); }
    else if (f.k === 'chip') { ctx.fillStyle = f.col; ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1); }
    else if (f.k === 'spark') { ctx.fillStyle = '#ffe28a'; ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1); }
    else if (f.k === 'z') { ctx.fillStyle = 'rgba(230,236,255,' + clamp(f.life, 0, 1) + ')'; const x = Math.round(sx), y = Math.round(sy); ctx.fillRect(x, y, 3, 1); ctx.fillRect(x + 1, y + 1, 1, 1); ctx.fillRect(x, y + 2, 3, 1); }
  }
  drawWeather(ctx, time);
  drawToolPreview(ctx, time);
  drawNight(ctx, time, tx0, tx1, ty0, ty1);
  drawOverlay(time);
}

function drawTree(ctx, t, sx, sy, fog, time) {
  const st = treeStage(t);
  let s;
  const set = ART.seasons[R.season];
  if (t.dead) { s = t.fallen ? ART.fallen : (fog ? ART.deadFog : ART.dead)[t.v]; if (R.season === 3 && !fog) s = winterOf(s); }
  else s = (fog ? set.fog : t.sick ? set.sick : set.trees)[t.sp][st][t.sp === 'ancient' ? 0 : t.v];
  let x = sx;
  if (t.shake > 0) x += Math.sin(time * 60) > 0 ? 1 : -1;
  spr(ctx, s, x, sy);
  if (fog) return;
  if (t.mark) { // red ribbon on the trunk
    ctx.fillStyle = '#e04a3a'; ctx.fillRect(x - 2, sy - 6, 4, 2); ctx.fillStyle = '#ff9a80'; ctx.fillRect(x - 2, sy - 6, 1, 1);
  }
  if (t.sick && !t.dead) { ctx.fillStyle = '#c9a23a'; ctx.fillRect(x + 3, sy - 4, 1, 1); ctx.fillRect(x - 4, sy - 9, 1, 1); }
  if (UI.sel && UI.sel.kind === 'tree' && UI.sel.ref === t) ctx.drawImage(R.hl.sel, sx - 16, sy - HTH);
}
function drawBuilding(ctx, b, sx, sy, time) {
  let s;
  const lit = daylight() < 0.6;
  const B = R.season === 3 ? ART.bWinter : ART.b;
  switch (b.type) {
    case 'hq': s = lit ? B.hqLit : B.hq; break;
    case 'tent': s = B.tent[b.v]; break;
    case 'intake': s = B.intake[b.stock === 0 ? 0 : b.stock < 8 ? 1 : 2]; break;
    default: s = B[b.type];
  }
  if (R.season === 3) s = winterOf(s);
  if (UI.sel && UI.sel.kind === 'building' && UI.sel.ref === b) for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) { const [hx, hy] = tileTop(b.x + i, b.y + j); ctx.drawImage(R.hl.sel, hx - 16, hy); }
  spr(ctx, s, sx, sy);
  // animated bits
  if (b.type === 'campfire') drawFlame(ctx, ...tileTop(b.x + 0.5, b.y + 0.5), time, 1);
  if (b.type === 'sawmill' && b.active) {
    const [cx, cy] = tileTop(b.x + 0.95, b.y + 2); const a = time * 14;
    for (let i = 0; i < 6; i++) { const an = a + i * Math.PI / 3; ctx.fillStyle = i % 2 ? '#d7dde2' : '#9aa2a9'; ctx.fillRect(Math.round(cx + Math.cos(an) * 3), Math.round(cy - 7 + Math.sin(an) * 3), 1, 1); }
    ctx.fillStyle = '#e5e9ec'; ctx.fillRect(Math.round(cx), Math.round(cy - 7), 1, 1);
    if (Math.random() < 0.3) G.fx.push({ k: 'chip', x: cx - R.ox + rf(-3, 3), y: cy - R.oy - 5, vx: rf(-12, 12), vy: rf(-14, -4), life: 0.5, col: '#e5c08f' });
  }
  if (b.type === 'workshop' && b.active && Math.random() < 0.05) fxPuff(isoX(b.x + 0.6, b.y + 0.6), isoY(b.x + 0.6, b.y + 0.6) - 34, 'rgba(200,200,200,', 1, 1);
  if (b.type === 'steam' && b.gen > 0) drawFlame(ctx, ...tileTop(b.x + 0.95, b.y + 2), time, 0.5, -2);
  // status badge
  let badge = null;
  if (b.broken) badge = 'broken';
  else if (b.type === 'steam' && b.fuel <= 0) badge = 'fuel';
  else if (BDEF[b.type].power && b.wants && !(b.sat > 0)) badge = 'power';
  if (badge && Math.floor(time * 2) % 2 === 0) {
    const [cx, cy] = tileTop(b.x + b.w / 2, b.y + b.h / 2);
    ctx.drawImage(R.status[badge], Math.round(cx - 5), Math.round(cy - 46));
  }
}
function drawFlame(ctx, x, y, time, scale = 1, dy = 0) {
  x = Math.round(x); y = Math.round(y - 2 + dy);
  const h = Math.round((6 + Math.sin(time * 13) * 1.5 + Math.sin(time * 7.3)) * scale);
  ctx.fillStyle = '#d8461f'; ctx.fillRect(x - 2, y - h + 2, 5, h - 1);
  ctx.fillStyle = '#f28b22'; ctx.fillRect(x - 1, y - h + 1, 3, h - 2);
  ctx.fillStyle = '#ffd860'; ctx.fillRect(x, y - Math.round(h * 0.6), 1, Math.round(h * 0.5));
  if (Math.random() < 0.08) G.fx.push({ k: 'spark', x: x - R.ox, y: y - R.oy - h, vx: rf(-3, 3), vy: rf(-14, -8), life: 0.7 });
}
function drawWorker(ctx, w, sx, sy, time) {
  const moving = w.state === 'walk';
  const f = moving ? Math.floor(w.anim) % 4 : 0;
  const s = w.frames[(w.back ? 4 : 0) + f];
  const x = Math.round(sx), y = Math.round(sy);
  if (UI.sel && UI.sel.kind === 'worker' && UI.sel.ref === w) {
    ctx.fillStyle = '#ffd65a';
    ctx.fillRect(x - 5, y + 1, 11, 1); ctx.fillRect(x - 6, y, 1, 1); ctx.fillRect(x + 6, y, 1, 1);
  }
  if (w.flip) { ctx.save(); ctx.translate(x, 0); ctx.scale(-1, 1); ctx.drawImage(s.cv, -s.ax, y - s.ay); ctx.restore(); }
  else ctx.drawImage(s.cv, x - s.ax, y - s.ay);
  if (w.carry) spr(ctx, ART.items.log, x, y - 14);
  const t = w.task;
  if (w.state === 'act' && t && t.type === 'chop') { // axe swing
    const up = (w.swing || 0) < 0.4, dir = w.flip ? -1 : 1;
    ctx.fillStyle = '#94673f';
    if (up) { ctx.fillRect(x + dir * 4, y - 15, 1, 6); ctx.fillStyle = '#cfd4d8'; ctx.fillRect(x + dir * 4 - (dir < 0 ? 2 : 0), y - 16, 3, 2); }
    else { ctx.fillRect(dir > 0 ? x + 4 : x - 8, y - 9, 5, 1); ctx.fillStyle = '#cfd4d8'; ctx.fillRect(dir > 0 ? x + 8 : x - 9, y - 11, 2, 3); }
  }
  if ((w.state === 'act' && t && (t.type === 'plant' || t.type === 'treat')) && Math.sin(time * 8) > 0) { ctx.fillStyle = '#7ccf6a'; ctx.fillRect(x + (w.flip ? -6 : 5), y - 6, 2, 2); }
  if (w.rogue && Math.floor(time * 2) % 2 === 0) ctx.drawImage(R.status.rogue, x - 5, y - 32);
}
function drawWires(ctx) {
  ctx.fillStyle = 'rgba(30,24,22,0.85)';
  for (const [a, b] of G.wires) {
    const pa = wireAnchor(a), pb = wireAnchor(b);
    const len = Math.max(Math.abs(pb[0] - pa[0]), Math.abs(pb[1] - pa[1]));
    const sag = Math.min(8, len * 0.08);
    for (let i = 0; i <= len; i++) {
      const t = i / len;
      ctx.fillRect(Math.round(lerp(pa[0], pb[0], t)), Math.round(lerp(pa[1], pb[1], t) + sag * 4 * t * (1 - t)), 1, 1);
    }
  }
}
function wireAnchor(b) {
  const [x, y] = tileTop(b.x + b.w / 2, b.y + b.h / 2);
  if (b.type === 'pole') return [x, y - 25];
  if (b.type === 'steam') return [x, y - 22];
  return [x, y - (b.type === 'solar' ? 10 : 18)];
}

function drawToolPreview(ctx, time) {
  const tool = UI.tool, h = UI.hover;
  if (!h) return;
  if (tool === 'select') {
    if (inMap(h.x, h.y)) { const [sx, sy] = tileTop(h.x, h.y); ctx.drawImage(R.hl.hover, sx - 16, sy); }
    return;
  }
  if (BDEF[tool]) {
    const d = BDEF[tool];
    const bx = h.x - Math.floor((d.w - 1) / 2), by = h.y - Math.floor((d.h - 1) / 2);
    const ok = !canPlace(tool, bx, by);
    if (tool === 'pole' || BDEF[tool].power || tool === 'steam' || tool === 'solar') {
      const cx = bx + d.w / 2, cy = by + d.h / 2, r = tool === 'pole' ? 6.5 : 3.2;
      for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if (inMap(x, y) && dist(x + 0.5, y + 0.5, cx, cy) <= r) { const [sx, sy] = tileTop(x, y); ctx.drawImage(R.hl.range, sx - 16, sy); }
      for (const n of G.buildings) if (n.type === 'pole' || n.type === 'steam' || n.type === 'solar') {
        const nc = bCenter(n), nr = n.type === 'pole' ? 6.5 : 3.2;
        if (tool !== 'pole' && dist(nc.x, nc.y, cx, cy) <= nr + 1) { const [sx, sy] = tileTop(n.x + n.w / 2, n.y + n.h / 2); ctx.fillStyle = '#ffd65a'; ctx.fillRect(sx - 1, sy - 30, 3, 3); }
      }
    }
    for (let j = 0; j < d.h; j++) for (let i = 0; i < d.w; i++) { const [sx, sy] = tileTop(bx + i, by + j); ctx.drawImage(ok ? R.hl.ok : R.hl.bad, sx - 16, sy); }
    const s = tool === 'tent' ? ART.b.tent[0] : tool === 'intake' ? ART.b.intake[0] : ART.b[tool];
    ctx.globalAlpha = ok ? 0.8 : 0.45;
    const [sx, sy] = tileTop(bx, by);
    spr(ctx, s, sx, sy);
    ctx.globalAlpha = 1;
    return;
  }
  const tiles = UI.dragTiles();
  for (const [x, y, dir] of tiles) {
    if (!inMap(x, y)) continue;
    const [sx, sy] = tileTop(x, y);
    if (tool === 'belt') { ctx.globalAlpha = 0.75; spr(ctx, ART.belt[dir][Math.floor(time * 6) % 4], sx, sy); ctx.globalAlpha = 1; const k = idx(x, y); const ok = G.belt[k] || (G.reveal[k] && G.tiles[k] && !G.occ[k] && !G.tree[k]); if (!ok) ctx.drawImage(R.hl.bad, sx - 16, sy); }
    else if (tool === 'path') ctx.drawImage((G.tiles[idx(x, y)] && !G.occ[idx(x, y)] && G.reveal[idx(x, y)]) ? R.hl.ok : R.hl.bad, sx - 16, sy);
    else if (tool === 'chop') ctx.drawImage(R.hl.chop, sx - 16, sy);
    else if (tool === 'plant') ctx.drawImage(plantable(x, y) ? R.hl.plant : R.hl.bad, sx - 16, sy);
    else if (tool === 'bulldoze') ctx.drawImage(R.hl.bad, sx - 16, sy);
    else if (tool === 'survey') {
      for (let yy = -6; yy <= 6; yy++) for (let xx = -6; xx <= 6; xx++) if (xx * xx + yy * yy <= 36 && inMap(x + xx, y + yy)) { const [px, py] = tileTop(x + xx, y + yy); ctx.drawImage(R.hl.range, px - 16, py); }
      ctx.drawImage(R.hl.hover, sx - 16, sy);
    }
  }
}

function drawNight(ctx, time, tx0, tx1, ty0, ty1) {
  const dl = daylight();
  const dark = (1 - dl) * 0.52;
  if (dark <= 0.01) { R.fireflies.length = 0; return; }
  ctx.fillStyle = `rgba(14,20,58,${dark})`;
  ctx.fillRect(0, 0, R.cv.width, R.cv.height);
  ctx.globalCompositeOperation = 'lighter';
  const glow = (x, y, r, col, a) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  for (const b of G.buildings) {
    if (b.type === 'campfire') { const [x, y] = tileTop(b.x + 0.5, b.y + 0.5); glow(x, y - 4, 46 + Math.sin(time * 9) * 2, '255,140,50', dark * 0.75); }
    if (b.type === 'hq') { const [x, y] = tileTop(b.x + 1.5, b.y + 2.6); glow(x, y - 10, 34, '255,200,110', dark * 0.5); }
    if (b.type === 'steam' && b.gen > 0) { const [x, y] = tileTop(b.x + 1, b.y + 2); glow(x, y - 4, 22, '255,120,40', dark * 0.6); }
    if ((b.type === 'sawmill' || b.type === 'workshop') && b.active) { const [x, y] = tileTop(b.x + 1, b.y + 2); glow(x, y - 8, 20, '255,210,140', dark * 0.4); }
  }
  // fireflies drifting through the trees (none in winter)
  if (R.season === 3) R.fireflies.length = 0;
  else while (R.fireflies.length < 40) R.fireflies.push({ x: rf(tx0, tx1), y: rf(ty0, ty1), ph: rf(0, 6.28), sp: rf(0.6, 1.4) });
  ctx.fillStyle = `rgba(255,236,120,${Math.min(1, dark * 1.6)})`;
  for (const f of R.fireflies) {
    f.x += Math.sin(time * f.sp + f.ph) * 0.004; f.y += Math.cos(time * f.sp * 0.8 + f.ph) * 0.004;
    if (Math.sin(time * 2.2 * f.sp + f.ph) < 0.2) continue;
    if (!G.reveal[idx(clamp(f.x | 0, 0, MAP - 1), clamp(f.y | 0, 0, MAP - 1))]) continue;
    const [x, y] = tileTop(f.x, f.y);
    ctx.fillRect(Math.round(x), Math.round(y - 8 - Math.sin(time + f.ph) * 3), 1, 1);
  }
  if (Math.random() < 0.02) R.fireflies.shift();
  ctx.globalCompositeOperation = 'source-over';
}

// ---------- tutorial markers on the map ----------
function tutArrow(ctx, x, y, time) { // a bouncing gold arrow whose tip sits at (x, y)
  const b = Math.round(Math.abs(Math.sin(time * 4)) * 4);
  x = Math.round(x); y = Math.round(y) - b;
  ctx.fillStyle = '#2a1a19';
  ctx.fillRect(x - 3, y - 14, 7, 7); ctx.fillRect(x - 6, y - 8, 13, 2);
  for (let i = 0; i < 6; i++) ctx.fillRect(x - 6 + i, y - 7 + i, 13 - i * 2, 1);
  ctx.fillStyle = '#f5c518';
  ctx.fillRect(x - 2, y - 13, 5, 6);
  for (let i = 0; i < 5; i++) ctx.fillRect(x - 5 + i, y - 7 + i, 11 - i * 2, 1);
}
function tutRingTrees() { // a tight cluster of grown trees by camp, so one drag can mark them all
  const c = bCenter(G.hq), y = G.tutor.yard;
  const inYard = (t) => y && t.x >= y.x - 1 && t.x <= y.x + 9 && t.y >= y.y - 2 && t.y <= y.y + 3;
  const ok = (t) => !t.dead && t.sp !== 'ancient' && !inYard(t) && G.reveal[idx(t.x, t.y)] && (treeStage(t) === 'mature' || treeStage(t) === 'old');
  const live = () => (R.ring || []).map(([x, y]) => G.tree[idx(x, y)]).filter(t => t && ok(t) && !t.mark);
  if (live().length < Math.min(5, 5 - (G.tutor.marked || 0) + 1)) {
    const grown = G.trees.filter(ok);
    let best = null, bs = 1e9; // the anchor with the most grown trees within 2 tiles, close to camp
    for (const t of grown) {
      const near = grown.filter(o => Math.abs(o.x - t.x) <= 2 && Math.abs(o.y - t.y) <= 2).length;
      const sc = dist(t.x, t.y, c.x, c.y) - near * 2.5;
      if (sc < bs) { bs = sc; best = t; }
    }
    R.ring = best ? grown.filter(o => Math.abs(o.x - best.x) <= 2 && Math.abs(o.y - best.y) <= 2).slice(0, 8).map(t => [t.x, t.y]) : [];
  }
  return live();
}
function drawTutorial(ctx, time) {
  const step = playing ? currentStep() : null;
  if (!step || !step.marker) return;
  const pulse = 0.55 + 0.45 * Math.sin(time * 5);
  const yd = G.tutor.yard;
  const ghost = (type, dx, dy) => { // translucent building where we suggest putting it
    const d = BDEF[type], x = yd.x + dx, y = yd.y + dy;
    ctx.globalAlpha = 0.35 + pulse * 0.3;
    for (let j = 0; j < d.h; j++) for (let i = 0; i < d.w; i++) { const [sx, sy] = tileTop(x + i, y + j); ctx.drawImage(R.hl.ok, sx - 16, sy); }
    ctx.globalAlpha = 0.45;
    const [sx, sy] = tileTop(x, y);
    spr(ctx, type === 'intake' ? ART.b.intake[0] : ART.b[type], sx, sy);
    ctx.globalAlpha = 1;
    const [ax, ay] = tileTop(x + d.w / 2, y + d.h / 2);
    tutArrow(ctx, ax, ay - (type === 'intake' ? 14 : 36), time);
  };
  const ghostBelts = (tiles) => {
    let first = null;
    for (const [dx, dy] of tiles) {
      const x = yd.x + dx, y = yd.y + dy;
      if (G.belt[idx(x, y)]) continue;
      const [sx, sy] = tileTop(x, y);
      ctx.globalAlpha = 0.35 + pulse * 0.35; spr(ctx, ART.belt[0][Math.floor(time * 6) % 4], sx, sy); ctx.globalAlpha = 1;
      if (!first) first = [x, y];
    }
    if (first) { const [ax, ay] = tileTop(first[0] + 0.5, first[1] + 0.5); tutArrow(ctx, ax, ay - 4, time); }
    return !!first;
  };
  const m = step.marker;
  if (m === 'worker') {
    for (const w of G.workers) if (!w.hidden) { const [sx, sy] = tileTop(w.x, w.y); tutArrow(ctx, sx, sy - 20, time); }
  } else if (m === 'trees') {
    if (UI.tool === 'chop' || (G.tutor.marked || 0) > 0) {
      const trees = tutRingTrees();
      ctx.globalAlpha = pulse;
      for (const t of trees) { const [sx, sy] = tileTop(t.x, t.y); ctx.drawImage(R.hl.hover, sx - 16, sy); ctx.drawImage(R.hl.hover, sx - 16, sy); }
      ctx.globalAlpha = 1;
      if (trees[0]) { const [sx, sy] = tileTop(trees[0].x + 0.5, trees[0].y + 0.5); tutArrow(ctx, sx, sy - 34, time); }
    }
  } else if (yd && m === 'yard') {
    ctx.globalAlpha = 0.5 + pulse * 0.4;
    for (let y = yd.y - 1; y <= yd.y + 2; y++) for (let x = yd.x; x <= yd.x + 8; x++) { const [sx, sy] = tileTop(x, y); ctx.drawImage(R.hl.range, sx - 16, sy); ctx.drawImage(R.hl.range, sx - 16, sy); }
    ctx.globalAlpha = 1;
    const [ax, ay] = tileTop(yd.x + 4.5, yd.y + 0.5); tutArrow(ctx, ax, ay - 6, time);
  } else if (yd && BDEF[m]) {
    const built = G.buildings.some(b => b.type === m);
    if (!built) ghost(m, ...YARD[m]);
    else if (m === 'depot') ghostBelts(YARD.belt2);
  } else if (yd && m === 'belt1') ghostBelts(YARD.belt1);
}

// falling petals in spring, leaves in autumn, snow in winter; drawn in screen space
const WEATHER = [
  { n: 12, cols: ['#f6c3d6', '#fbe4ee'], vy: [7, 12], sway: 6, size: 1 },
  { n: 0 },
  { n: 26, cols: ['#e57a26', '#c9481d', '#f0b03c', '#b4572a'], vy: [9, 16], sway: 10, size: 2 },
  { n: 150, cols: ['#ffffff', '#e8f0f7'], vy: [7, 15], sway: 4, size: 1 },
];
function drawWeather(ctx, time) {
  const dt = Math.min(0.1, time - (R.wt || time)); R.wt = time;
  const kind = WEATHER[R.season], W = R.weather || (R.weather = []);
  const cw = R.cv.width, ch = R.cv.height;
  const spawn = (anywhere) => ({ x: rf(0, cw), y: anywhere ? rf(0, ch) : -4, vy: rf(...kind.vy), ph: rf(0, 6.28), col: pick(kind.cols), big: kind.size > 1 || chance(0.15) });
  while (W.length < kind.n) W.push(spawn(true));
  W.length = Math.min(W.length, kind.n);
  for (let i = 0; i < W.length; i++) {
    const f = W[i];
    f.y += f.vy * dt; f.ph += dt * 1.6;
    const x = Math.round(f.x + Math.sin(f.ph) * kind.sway), y = Math.round(f.y);
    if (y > ch + 4) { W[i] = spawn(false); continue; }
    if (x < -2) f.x += cw; else if (x > cw + 2) f.x -= cw;
    ctx.fillStyle = f.col;
    if (R.season === 2) ctx.fillRect(x, y, Math.sin(f.ph * 2) > 0 ? 2 : 1, Math.sin(f.ph * 2) > 0 ? 1 : 2);
    else ctx.fillRect(x, y, f.big ? 2 : 1, f.big ? 2 : 1);
  }
}

function drawOverlay(time) {
  const c = R.octx, s = R.cam.s * R.dpr;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, R.ov.width, R.ov.height);
  c.font = `${Math.round(12 * R.dpr * Math.max(1, R.cam.s / 3))}px "Jersey 10", "Pixelify Sans", ui-monospace, monospace`;
  c.textAlign = 'center';
  c.lineJoin = 'round';
  if ('fontVariantLigatures' in c) c.fontVariantLigatures = 'none';
  for (const f of G.fx) {
    if (f.k !== 'text') continue;
    const x = (f.x + R.ox) * s, y = (f.y + R.oy) * s;
    c.globalAlpha = clamp(f.life, 0, 1);
    c.lineWidth = 3 * R.dpr; c.strokeStyle = '#1e1414'; c.strokeText(f.text, x, y);
    c.fillStyle = f.color; c.fillText(f.text, x, y);
  }
  c.globalAlpha = 1;
  // name tag over the hovered or selected worker
  const tag = (w) => {
    const x = (isoX(w.x, w.y) + R.ox) * s, y = (isoY(w.x, w.y) + R.oy - 22) * s;
    c.lineWidth = 3 * R.dpr; c.strokeStyle = '#1e1414'; c.strokeText(w.name, x, y);
    c.fillStyle = '#efe4d0'; c.fillText(w.name, x, y);
  };
  if (UI.sel && UI.sel.kind === 'worker' && !UI.sel.ref.hidden) tag(UI.sel.ref);
  if (UI.hoverWorker && UI.hoverWorker !== (UI.sel && UI.sel.ref)) tag(UI.hoverWorker);
}

function updateFx(dt) {
  for (const f of G.fx) {
    f.life -= dt;
    if (f.vx) f.x += f.vx * dt;
    if (f.vy) f.y += f.vy * dt;
    if (f.k === 'chip') f.vy += 60 * dt;
  }
  G.fx = G.fx.filter(f => f.life > 0);
  if (G.fx.length > 400) G.fx.splice(0, G.fx.length - 400);
}
