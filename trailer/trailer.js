'use strict';
// Release trailer: one mill, from a woodlot to the Heartwood Company.
// Runs the real game (world, sprites, simulation and sound effects) one fixed frame at a time,
// grows the mill rank by rank between shots, and draws the titles in the game's own UI style.
// make-video.js loads this page headlessly, calls TR_API.frame(i) for every frame and
// TR_API.audio() for the soundtrack, and encodes the result with ffmpeg.

const VW = 1920, VH = 1080, FPS = 30;
const BAR = 2.4;                       // 100 bpm, four beats to a bar; every cut lands on a bar line
const BEAT = BAR / 4;
const SEED = 6;                        // an island with the sea a short walk east of camp
const BARS = 27, TOTAL = BARS * BAR;

// the trailer has no HUD: stand-ins for the parts of ui.js and main.js that the game code calls
const UI = { tool: 'select', sel: null, hover: null, hoverWorker: null, dragTiles: () => [], beltDir: 0 };
let playing = false;
function toast() {}
function setSpeed() {}

// game UI colours (the :root tokens in index.html)
const K = {
  sky: '#0c1410', panel: '#5b3f3c', panel2: '#4a3230', panel3: '#3a2625', edge: '#2a1a19',
  ink: '#efe4d0', inkDim: '#c2ae98', gold: '#f5c518', go: '#3f9a4a', goHi: '#52b35c', good: '#7cc96a', bad: '#d65a4f',
  paper: '#efe2c4', paperInk: '#3a2a1e',
};
const FONT = '"Pixelify Sans", ui-monospace, monospace';
const NUMFONT = '"Jersey 10", "Pixelify Sans", ui-monospace, monospace';

const TR = { clock: 0, mute: true, last: {}, sounds: [], img: {} };
let O = null; // the 1920x1080 output context

// ---------- sound: world effects are logged with their on-screen placement, then rendered offline ----------
sfx = function (name, tx, ty) {
  if (TR.mute) return;
  if (TR.clock - (TR.last[name] ?? -9) < (MIN_GAP[name] || 0.05)) return;
  const pl = placeSound(tx, ty);
  if (!pl || pl.vol < 0.02) return;
  TR.last[name] = TR.clock;
  TR.sounds.push({ t: TR.clock, name, vol: pl.vol, pan: pl.pan });
};

// ---------- helpers ----------
const ease = (t) => { t = clamp(t, 0, 1); return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };
const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const backOut = (t) => { t = clamp(t, 0, 1); const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const fade = (lt, a, b) => clamp((lt - a) / (b - a), 0, 1);
const inOut = (lt, a, b, len, out = 0.4) => fade(lt, a, a + 0.35) * (1 - fade(lt, b, b + out)) * (lt < len ? 1 : 0);
function hourAt(day, h) { return day * 1440 + h * 60; }
function camAt(tx, ty) { return { x: isoX(tx, ty), y: isoY(tx, ty) }; }
function camLerp(a, b, t) { return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) }; }

function camZoom(s) {
  R.cam.s = s;
  // two spare art pixels each way so the view can slide by fractions of a pixel
  R.cv.width = VW / s + 2; R.cv.height = VH / s + 2;
  R.ctx.imageSmoothingEnabled = false;
}
// draw the world with the camera centred on world point (x, y) at zoom s
function shoot(cam, s, time) {
  if (R.cam.s !== s) camZoom(s);
  const fx = Math.floor(cam.x), fy = Math.floor(cam.y);
  R.cam.x = fx; R.cam.y = fy;
  render(time * 1000);
  const ox = Math.round(-s - (cam.x - fx) * s), oy = Math.round(-s - (cam.y - fy) * s);
  O.imageSmoothingEnabled = false;
  O.drawImage(R.cv, ox, oy, R.cv.width * s, R.cv.height * s);
  O.drawImage(R.ov, ox, oy);
}

// ---------- the mill, grown one rank at a time ----------
const M = { rank: -1, patch: [] };
const clearArea = (x0, y0, x1, y1) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { removeTree(x, y); G.stump[idx(x, y)] = 0; G.secrets = G.secrets.filter(s => s.x !== x || s.y !== y); }
  markDirty(x0, y0, x1, y1);
};
function put(type, x, y) { const d = BDEF[type]; clearArea(x, y, x + d.w - 1, y + d.h - 1); return placeBuilding(type, x, y, true); }
function belts(list) {
  for (const [x, y, dir] of list) {
    const k = idx(x, y); if (G.belt[k]) { G.belt[k].dir = dir; continue; }
    clearArea(x, y, x, y); G.tiles[k] = 1;
    const b = { x, y, dir, item: null, p: 0, stamp: 0 }; G.belt[k] = b; G.belts.push(b);
  }
}
const run = (x0, x1, y, dir = 0) => { const a = []; for (let x = x0; x <= x1; x++) a.push([x, y, dir]); return a; };
function hire(role, n = 1) { for (let i = 0; i < n; i++) hireWorker(makeCandidate(role, 3), true); }
function path(x0, x1, y) { for (let x = x0; x <= x1; x++) { const k = idx(x, y); if (!G.occ[k] && !G.belt[k]) { removeTree(x, y); G.tiles[k] = 2; } } markDirty(x0, y, x1, y); }

function buildWorld() {
  newGame(SEED);
  G.tutorialOff = true; G.rank = RANKS.length - 1; // no walkthrough, and no rank-up letters from the sim itself
  G.research.done = RESEARCH.map(r => r.id);
  G.policy.chopRadius = 9; G.policy.explore = false;
  // shape the east shore so the line can run down to the sea
  for (let y = 29; y <= 41; y++) for (let x = 38; x <= 56; x++) G.tiles[idx(x, y)] = G.tiles[idx(x, y)] === 2 ? 2 : 1;
  for (let y = 29; y <= 41; y++) for (let x = 57; x <= 62; x++) { removeTree(x, y); G.tiles[idx(x, y)] = 0; }
  revealCircle(40, 36, 26);
  computeWaterDist();
  G.dirty = { x0: 0, y0: 0, x1: MAP - 1, y1: MAP - 1 };
}
// everything the mill has by each rank; ranks build on each other
const STAGES = [
  () => {},
  () => { // Sawmill: the walkthrough's starter line on the cleared yard
    const y = G.tutor.yard;
    M.yardIntake = put('intake', y.x + YARD.intake[0], y.y + YARD.intake[1]);
    put('sawmill', y.x + YARD.sawmill[0], y.y + YARD.sawmill[1]);
    M.yardSteam = put('steam', y.x + YARD.steam[0], y.y + YARD.steam[1]);
    put('depot', y.x + YARD.depot[0], y.y + YARD.depot[1]);
    belts([...YARD.belt1, ...YARD.belt2].map(([dx, dy]) => [y.x + dx, y.y + dy, 0]));
    put('well', 31, 36); put('outhouse', 30, 38);
    hire('arborist');
  },
  () => { // Timber Yard: a second line east of the office, sawmill into kiln, and a bigger camp
    put('intake', 39, 34); M.sawA = put('sawmill', 42, 33); M.kiln = put('kiln', 46, 33); M.depotA = put('depot', 50, 33);
    belts([...run(40, 41, 34), ...run(44, 45, 34), ...run(48, 49, 34)]);
    M.steamA = put('steam', 44, 31);
    put('pole', 45, 35); put('pole', 49, 35);
    put('solar', 40, 39); put('solar', 42, 39);
    path(38, 52, 35);
    put('cabin', 29, 40); put('tent', 29, 35); put('cookhouse', 33, 41);
    for (const [x, y] of [[31, 40], [34, 37], [28, 38]]) put('flowers', x, y);
    hire('lumberjack', 2); hire('mechanic');
  },
  () => { // Lumber Works: beam saws, a water wheel on the shore, pylons, tuned machines
    put('intake', 39, 37); M.beam = put('beamsaw', 42, 36); M.depotB = put('depot', 50, 36);
    belts([...run(40, 41, 37), ...run(44, 49, 37)]);
    put('wheel', 55, 37); put('pylon', 53, 40); put('pylon', 52, 31);
    put('bunkhouse', 37, 42); put('lookout', 31, 33); put('store', 46, 39); put('shed', 38, 39);
    for (const b of G.buildings) if (BDEF[b.type].recipes) b.lvl = 2;
    hire('lumberjack'); hire('arborist');
  },
  () => { // Heartwood Company: the joinery turns boards and beams into cabin kits for the harbour
    removeBuilding(M.depotA); removeBuilding(M.depotB);
    M.joinery = put('joinery', 50, 34); M.joinery.recipe = 'kit';
    belts([[50, 37, 0], [51, 37, 3], [51, 36, 3], ...run(53, 54, 34)]);
    M.dock = put('dock', 55, 33);
    put('nursery', 27, 41); put('pylon', 47, 30);
    for (const b of G.buildings) if (BDEF[b.type].recipes) b.lvl = 3;
    hire('mechanic'); hire('lumberjack');
  },
];
function growTo(rank, warm = 30) {
  if (rank <= M.rank) return;
  while (M.rank < rank) STAGES[++M.rank]();
  G.money = 1e6; // the building above is free; keep wages and planting from running dry
  if (!warm) return;
  const mute = TR.mute; TR.mute = true;
  for (let i = 0; i < warm * 20; i++) { feed(); simStep(0.05); }
  TR.mute = mute; G.fx = [];
  for (const b of G.buildings) { b.dur = 100; b.broken = false; }
}
// keep the lines busy whatever the lumberjacks get up to
function feed() {
  for (const b of G.buildings) {
    if (b.type === 'intake' && b.stock < 6) b.stock += 6;
    if (b.type === 'steam' && b.fuel < 4) b.fuel = 6;
    if (b.broken || b.dur < 40) { b.broken = false; b.dur = 100; }
  }
  G.money = Math.max(G.money, 5e5);
}
// put a worker straight to work on a task, skipping the walk there
function setTask(w, x, y, task, timer) {
  cancelTask(w);
  w.x = x + 0.5; w.y = y + 0.5; w.path = null;
  w.state = 'act'; w.task = task; w.timer = timer; w.hidden = false; w.carry = null;
}
function nearTrees(cx, cy, r, ok) {
  return G.trees.filter(t => !t.dead && t.sp !== 'ancient' && !t.fire && dist(t.x, t.y, cx, cy) <= r && (!ok || ok(t)))
    .sort((a, b) => dist(a.x, a.y, cx, cy) - dist(b.x, b.y, cx, cy));
}
function crew(role) { return G.workers.filter(w => w.role === role); }
function freeAll() { for (const w of G.workers) if (w.state === 'act' && w.timer > 50) cancelTask(w); }

// ---------- UI-style drawing ----------
function setFont(px, weight = 400, fam = FONT) { O.font = `${weight} ${px}px ${fam}`; O.letterSpacing = '0px'; }
// a .pnl box at 2x: 2px border, 2px inner highlight, 3px drop shadow
function panel(x, y, w, h, bg = K.panel) {
  x = Math.round(x); y = Math.round(y);
  O.fillStyle = 'rgba(0,0,0,0.35)'; O.fillRect(x, y + 6, w, h);
  O.fillStyle = K.edge; O.fillRect(x, y, w, h);
  O.fillStyle = bg; O.fillRect(x + 4, y + 4, w - 8, h - 8);
  O.fillStyle = 'rgba(255,255,255,0.05)';
  O.fillRect(x + 4, y + 4, w - 8, 4); O.fillRect(x + 4, y + h - 8, w - 8, 4);
  O.fillRect(x + 4, y + 8, 4, h - 16); O.fillRect(x + w - 8, y + 8, 4, h - 16);
}
function text(s, x, y, col, align = 'left') { O.textAlign = align; O.textBaseline = 'alphabetic'; O.fillStyle = col; O.fillText(s, x, y); }
// the title-screen logo: gold letters with a hard brown drop and a dark outline (CSS .logo-text at size px)
function logo(s, x, y, px, alpha = 1, scale = 1) {
  if (alpha <= 0) return;
  O.save(); O.globalAlpha = alpha; O.translate(x, y); O.scale(scale, scale);
  setFont(px, 700); O.textAlign = 'center'; O.textBaseline = 'alphabetic';
  const k = px / 74;
  const sh = [[0, 4, '#8a5a12'], [3, 0], [-3, 0], [0, -3], [0, 7], [3, 4], [-3, 4]].reverse();
  for (const [dx, dy, c] of sh) { O.fillStyle = c || K.edge; O.fillText(s, dx * k, dy * k); }
  O.fillStyle = K.gold; O.fillText(s, 0, 0);
  O.restore();
}
// outlined text like the game's floating numbers
function outlined(s, x, y, px, col, align = 'center', weight = 600) {
  setFont(px, weight); O.textAlign = align; O.lineJoin = 'round';
  O.lineWidth = px / 5; O.strokeStyle = '#1e1414'; O.strokeText(s, x, y);
  O.fillStyle = col; O.fillText(s, x, y);
}
function icon(img, x, y, size) { O.imageSmoothingEnabled = false; O.drawImage(img, Math.round(x), Math.round(y), size, size); }
function bar(x, y, w, h, v, col = K.gold) {
  O.fillStyle = K.edge; O.fillRect(x, y, w, h);
  O.fillStyle = K.panel3; O.fillRect(x + 2, y + 2, w - 4, h - 4);
  O.fillStyle = col; O.fillRect(x + 2, y + 2, Math.round((w - 4) * clamp(v, 0, 1)), h - 4);
}

// HUD: the money box and the mill's rank ladder (top left, at 2x)
const HUD = { money: 2000, sales: 0, rank: 0, rankAt: -9 };
function drawHud(alpha) {
  if (alpha <= 0) return;
  O.save(); O.globalAlpha = alpha;
  panel(20, 20, 400, 72);
  icon(TR.img.coin, 36, 32, 48);
  setFont(48, 600, NUMFONT); O.letterSpacing = '2px';
  text(fmt(HUD.money), 100, 74, K.gold);
  O.letterSpacing = '0px';
  const h = 64 + RANKS.length * 44 + 70;
  panel(20, 124, 560, h);
  O.fillStyle = K.panel3; O.fillRect(24, 128, 552, 52);
  setFont(28, 600); text('Mill rank', 44, 164, K.ink);
  setFont(24, 400, NUMFONT); text(`${HUD.rank + 1}/${RANKS.length}`, 548, 162, K.inkDim, 'right');
  RANKS.forEach((r, i) => {
    const y = 214 + i * 44, done = i < HUD.rank, now = i === HUD.rank;
    const pop = now ? 1 - fade(TR.clock, HUD.rankAt, HUD.rankAt + 0.3) : 0;
    O.strokeStyle = done ? K.good : now ? K.gold : K.inkDim; O.lineWidth = 4; O.strokeRect(46, y - 22, 22, 22);
    if (done || now) { O.fillStyle = done ? K.good : K.gold; O.fillRect(51 - pop * 5, y - 17 - pop * 5, 12 + pop * 10, 12 + pop * 10); }
    setFont(28, now ? 600 : 400); text(r.name, 88, y, now ? K.gold : done ? K.ink : K.inkDim);
  });
  const next = RANKS[HUD.rank + 1], y = 214 + RANKS.length * 44;
  setFont(22, 400); text(next ? `Sales to the next rank` : 'The Guild has run out of titles', 46, y, K.inkDim);
  setFont(22, 400, NUMFONT); if (next) text(`${fmt(HUD.sales)} / ${fmt(next.need)}`, 548, y, K.inkDim, 'right');
  bar(46, y + 12, 502, 18, next ? (HUD.sales - RANKS[HUD.rank].need) / (next.need - RANKS[HUD.rank].need) : 1, next ? K.gold : K.good);
  O.restore();
}
// date box, as at the top centre of the game
function drawDate(day, alpha) {
  if (alpha <= 0) return;
  const p = dateParts(day);
  O.save(); O.globalAlpha = alpha;
  setFont(30, 500);
  const parts = [[p.wd, K.goHi, K.panel2], [`${p.m} ${p.d}, Year ${p.y}`, K.ink, K.panel]];
  const ws = parts.map(([s]) => O.measureText(s).width + 40);
  const w = ws[0] + ws[1] + 8, x0 = VW / 2 - w / 2, y0 = 20;
  O.fillStyle = 'rgba(0,0,0,0.35)'; O.fillRect(x0, y0 + 6, w, 64);
  O.fillStyle = K.edge; O.fillRect(x0, y0, w, 64);
  let x = x0 + 4;
  parts.forEach(([s, col, bg], i) => { O.fillStyle = bg; O.fillRect(x, y0 + 4, ws[i], 56); text(s, x + ws[i] / 2, y0 + 44, col, 'center'); x += ws[i]; });
  O.restore();
}
// "Your mill is now a ..." banner, after the Guild's letter
function drawRankBanner(lt, r) {
  const a = fade(lt, 0.05, 0.25) * (1 - fade(lt, 2.6, 3.0));
  if (a <= 0) return;
  const s = 0.7 + 0.3 * backOut(fade(lt, 0.05, 0.4));
  setFont(104, 700);
  const px = Math.min(104, Math.floor(104 * 680 / O.measureText(RANKS[r].name).width)); // long names shrink to fit
  O.save(); O.globalAlpha = a; O.translate(VW / 2, 300); O.scale(s, s);
  panel(-390, -110, 780, 200);
  setFont(30, 400); text('Valley Timber Guild: your mill is now a', 0, -48, K.inkDim, 'center');
  O.restore();
  logo(RANKS[r].name, VW / 2, 300 + 52 * s, px, a, s);
  // a few gold sparks as it lands
  O.save(); O.globalAlpha = a * (1 - fade(lt, 0.2, 1.4));
  O.fillStyle = K.gold;
  for (let i = 0; i < 18; i++) {
    const an = i / 18 * Math.PI * 2, d = 300 + easeOut(fade(lt, 0.1, 1.2)) * 260 + (i % 3) * 30;
    O.fillRect(Math.round(VW / 2 + Math.cos(an) * d * 1.4), Math.round(300 + Math.sin(an) * d * 0.45), 10, 10);
  }
  O.restore();
}
// a contract like those in the Trade tab
function drawContract(a, company, subject, item, qty, price, done) {
  if (a <= 0) return;
  const w = 600, h = 196, x = VW - w - 24, y = VH - h - 30 + (1 - easeOut(a)) * 30;
  O.save(); O.globalAlpha = a;
  panel(x, y, w, h, K.panel2);
  O.fillStyle = K.gold; O.fillRect(x + 24, y + 22, 48, 48);
  setFont(34, 700); text(company[0], x + 48, y + 59, K.panel3, 'center');
  setFont(30, 600); text(company, x + 90, y + 46, K.ink);
  setFont(24, 400); text(subject, x + 90, y + 74, K.inkDim);
  icon(TR.img[item], x + 24, y + 98, 36);
  setFont(28, 500); text(`${qty} ${ITEMS[item].name}`, x + 72, y + 126, K.ink);
  setFont(28, 500, NUMFONT); text(`${fmt(price)} each`, x + w - 24, y + 126, K.gold, 'right');
  const n = Math.min(qty, Math.floor(done));
  bar(x + 24, y + 146, w - 170, 24, n / qty, n >= qty ? K.good : K.gold);
  setFont(26, 400, NUMFONT); text(n >= qty ? 'Delivered' : `${n}/${qty}`, x + w - 24, y + 168, n >= qty ? K.good : K.ink, 'right');
  O.restore();
}
// a toast under the date, as the game shows them
function drawToast(a, s, kind) {
  if (a <= 0) return;
  O.save(); O.globalAlpha = a;
  setFont(30, 500);
  const w = O.measureText(s).width + 64, x = VW / 2 - w / 2, y = 108;
  O.fillStyle = K.edge; O.fillRect(x, y, w, 64);
  O.fillStyle = K.panel3; O.fillRect(x + 4, y + 4, w - 8, 56);
  O.fillStyle = kind === 'bad' ? K.bad : K.good; O.fillRect(x + 4, y + 4, 12, 56);
  text(s, VW / 2 + 6, y + 43, K.ink, 'center');
  O.restore();
}
// a page from Edda Rowan's journal, on paper like the Letters tab
function drawJournal(lt, alpha) {
  if (alpha <= 0) return;
  const w = 900, h = 300, x = VW / 2 - w / 2, y = VH - h - 120 + (1 - easeOut(alpha)) * 30;
  O.save(); O.globalAlpha = alpha;
  O.fillStyle = 'rgba(0,0,0,0.3)'; O.fillRect(x + 6, y + 6, w, h);
  O.fillStyle = K.paper; O.fillRect(x, y, w, h);
  setFont(32, 600); text('Edda Rowan\'s journal', x + 40, y + 62, K.paperInk);
  setFont(24, 400); text(`Page ${JOURNAL.length} of ${JOURNAL.length}: ${JOURNAL[JOURNAL.length - 1][0]}`, x + w - 40, y + 60, '#6d5a44', 'right');
  O.fillStyle = '#b9a47f'; for (let i = x + 40; i < x + w - 40; i += 16) O.fillRect(i, y + 84, 8, 4);
  const body = 'I am letting the lease lapse so the Board can find someone better. Whoever reads this: build it again, but slower. Take only what grows back.';
  const n = Math.floor(clamp((lt - 1.1) * 44, 0, body.length));
  setFont(30, 400);
  wrap(body.slice(0, n), x + 40, y + 140, w - 80, 46, K.paperInk);
  O.restore();
}
function wrap(s, x, y, maxW, lh, col) {
  let line = '', yy = y;
  for (const word of s.split(' ')) {
    const test = line ? line + ' ' + word : word;
    if (O.measureText(test).width > maxW && line) { text(line, x, yy, col); line = word; yy += lh; }
    else line = test;
  }
  text(line, x, yy, col);
}
function vignette(a) {
  const g = O.createRadialGradient(VW / 2, VH / 2, VH * 0.2, VW / 2, VH / 2, VH * 1.05);
  g.addColorStop(0, `rgba(12,20,16,${0.25 * a})`); g.addColorStop(1, `rgba(12,20,16,${0.85 * a})`);
  O.fillStyle = g; O.fillRect(0, 0, VW, VH);
}
function black(a) { if (a > 0) { O.fillStyle = `rgba(12,20,16,${clamp(a, 0, 1)})`; O.fillRect(0, 0, VW, VH); } }
function button(s, cx, y, px, bg = K.go) {
  setFont(px, 600);
  const w = O.measureText(s).width + px * 1.6, h = px * 1.9, x = cx - w / 2;
  O.fillStyle = 'rgba(0,0,0,0.35)'; O.fillRect(x, y + 6, w, h);
  O.fillStyle = K.edge; O.fillRect(x, y, w, h);
  O.fillStyle = bg; O.fillRect(x + 4, y + 4, w - 8, h - 8);
  O.fillStyle = 'rgba(255,255,255,0.08)'; O.fillRect(x + 4, y + 4, w - 8, 4);
  text(s, cx, y + h / 2 + px * 0.35, K.ink, 'center');
}

// ---------- scenes ----------
// each scene: start bar, length in bars, the day it is set on, sim speed, camera, and what is drawn on top.
// rank: the HUD's rank during the scene (and the banner, if it is a rank-up). money/sales: HUD values, eased in.
const WIDE = camAt(41.5, 35.5);
const SCENES = [
  { // dawn on the empty site, with the last page of the old owner's journal
    bar: 0, bars: 3, day: 0, hour: 4.8, speed: 1.4, rank: 0,
    cam(lt) { return camLerp(camAt(40, 33), camAt(38, 35), ease(lt / this.len)); }, zoom: 3,
    over(lt) { vignette(1); drawJournal(lt, fade(lt, 0.6, 1.1) * (1 - fade(lt, this.len - 0.6, this.len - 0.1))); },
  },
  { // the logo over the camp
    bar: 3, bars: 2, day: 0, hour: 8.4, speed: 1, rank: 0,
    cam(lt) { return camLerp(camAt(34.5, 37.5), camAt(36.5, 35.5), lt / this.len); }, zoom: 4,
    over(lt) {
      vignette(1);
      logo('Heartwood Mill', VW / 2, VH / 2 - 10, 168, fade(lt, 0, 0.12), 0.6 + 0.4 * backOut(lt / 0.4));
      O.globalAlpha = fade(lt, BEAT, BEAT + 0.4);
      outlined('Start with two lumberjacks and a tent.', VW / 2, VH / 2 + 90, 40, K.ink, 'center', 500);
      O.globalAlpha = fade(lt, BEAT * 3, BEAT * 3 + 0.4);
      outlined('Build a timber company that feeds a valley.', VW / 2, VH / 2 + 146, 40, K.ink, 'center', 500);
      O.globalAlpha = 1;
    },
  },
  { // Woodlot: felling by hand, close up
    bar: 5, bars: 2, day: 1, hour: 10, speed: 1, rank: 0, money: [2000, 2410], sales: [0, 640],
    enter() {
      const [a, b] = crew('lumberjack');
      const ok = t => ['mature', 'old'].includes(treeStage(t)) && passable(t.x - 1, t.y) && passable(t.x, t.y - 1);
      const pool = nearTrees(31, 31, 5, ok);
      const t1 = pool[0], t2 = pool.find(t => dist(t.x, t.y, t1.x, t1.y) > 2.5 && dist(t.x, t.y, t1.x, t1.y) < 5) || pool[1];
      this.focus = { x: (t1.x + t2.x) / 2 + 0.5, y: (t1.y + t2.y) / 2 + 0.5 };
      t1.res = a.id; t2.res = b.id;
      setTask(a, t1.x - 1, t1.y, { type: 'chop', tree: t1 }, 2.6);
      setTask(b, t2.x, t2.y - 1, { type: 'chop', tree: t2 }, 4.0);
      b.swing = 0.3;
    },
    cam(lt) { const c = camAt(this.focus.x, this.focus.y); return { x: c.x - 8 + lt * 3, y: c.y - 12 }; }, zoom: 6,
    over(lt) { drawHud(fade(lt, 0.1, 0.5)); drawDate(this.day, fade(lt, 0.1, 0.5)); },
  },
  { // Sawmill: the starter line, in the first winter
    bar: 7, bars: 2, day: 16, hour: 12, speed: 1, rank: 1, money: [2410, 4180], sales: [2500, 4300], grow: 1,
    cam(lt) { return camLerp(camAt(35, 31.5), camAt(37, 31), ease(lt / this.len)); }, zoom: 4,
    over(lt) { drawHud(1); drawDate(this.day, 1); drawRankBanner(lt, 1); },
  },
  { // Timber Yard: the kiln line, spring of the second year, and the town's bridge
    bar: 9, bars: 3, day: 27, hour: 10, speed: 1, rank: 2, money: [4180, 9650], sales: [9000, 14800], grow: 2,
    cam(lt) { return camLerp(camAt(40, 36), camAt(50, 35), ease(lt / this.len)); }, zoom: 4,
    over(lt) {
      drawHud(1); drawDate(this.day, 1); drawRankBanner(lt, 2);
      drawContract(fade(lt, 2.2, 2.6), 'Fernhollow Town Council', 'A bridge, if you can spare the planks', 'plank', 60, 22, lerp(38, 60, fade(lt, 2.6, 6.4)));
    },
  },
  { // the dry summer: fire in the woods by the mill
    bar: 12, bars: 2, day: 40, hour: 19.5, speed: 1, rank: 2, money: [9650, 10900], sales: [14800, 17200],
    enter() {
      const c = { x: 49, y: 42 };
      const near = nearTrees(c.x, c.y, 3.6, t => treeStage(t) !== 'sapling');
      M.patch = near.slice(0, 14);
      M.patch.forEach((t, i) => { t.fire = 4 + (i % 5) * 2.5; });
      G.story.spotAt = G.t + 18;
      G.workers.forEach((w, i) => { cancelTask(w); w.x = 44.5 + (i % 4) * 0.7; w.y = 38.5 + (i >> 2) * 0.6; w.cool = 0.1 + i * 0.12; w.needs.energy = 90; });
    },
    cam(lt) { const c = camAt(48, 41); return { x: c.x - 30 + lt * 6, y: c.y - 20 }; }, zoom: 4,
    over(lt) {
      drawHud(1); drawDate(this.day, 1);
      drawToast(fade(lt, 0.3, 0.6) * (1 - fade(lt, this.len - 0.6, this.len - 0.2)), 'Fire in the forest! Your crew is heading for it.', 'bad');
    },
  },
  { // Lumber Works: beams, water power and the railway's commission
    bar: 14, bars: 3, day: 52, hour: 13, speed: 1, rank: 3, money: [10900, 21400], sales: [25000, 33600], grow: 3,
    enter() { for (const t of G.trees) if (t.fire > 0 || t.wet > 0) { t.fire = 0; t.wet = 0; if (M.patch.includes(t)) { t.dead = true; t.charred = true; t.deadDays = 0; } } },
    cam(lt) { return camLerp(camAt(43, 39), camAt(53.5, 37.5), ease(lt / this.len)); }, zoom: 4,
    over(lt) {
      drawHud(1); drawDate(this.day, 1); drawRankBanner(lt, 3);
      drawContract(fade(lt, 2.2, 2.6), 'Ridgeway Rail Co.', 'A station for Fernhollow', 'beam', 30, 58, lerp(9, 30, fade(lt, 2.6, 6.4)));
    },
  },
  { // spring: the burnt slope is replanted, in time-lapse
    bar: 17, bars: 2, day: 75, hour: 9.5, speed: 1, rank: 3, money: [21400, 24100], sales: [33600, 41000],
    enter() {
      this.spots = [];
      const burnt = G.trees.filter(t => t.charred);
      for (const t of burnt) { removeTree(t.x, t.y); G.stump[idx(t.x, t.y)] = 0; }
      const cx = 49, cy = 42;
      for (let y = cy - 3; y <= cy + 3; y++) for (let x = cx - 3; x <= cx + 3; x++) {
        if (!plantable(x, y) || dist(x, y, cx, cy) > 3.6) continue;
        this.spots.push({ x, y, at: 0.15 + (dist(x, y, cx - 3, cy - 3)) * 0.22 + rf(0, 0.1), tree: null });
      }
      markDirty(cx - 4, cy - 4, cx + 4, cy + 4);
      freeAll();
      crew('arborist').forEach((w, i) => { setTask(w, cx - 3 + i * 5, cy - 2 + i * 3, { type: 'plant' }, 99); w.flip = i === 1; });
    },
    update(lt, dt) {
      for (const p of this.spots) {
        if (!p.tree && lt >= p.at && plantable(p.x, p.y)) {
          p.tree = addTree(p.x, p.y, (p.x * 3 + p.y) % 4 === 0 ? 'birch' : (p.x + p.y) % 3 ? 'spruce' : 'maple', 0.2);
          p.tree.v = (p.x * 7 + p.y) % 3;
          sfx('plant', p.x + 0.5, p.y + 0.5);
          fxPuff(isoX(p.x + 0.5, p.y + 0.5), isoY(p.x + 0.5, p.y + 0.5) - 2, 'rgba(160,220,120,', 3, 4);
        }
        if (p.tree) p.tree.age = Math.min(14, p.tree.age + dt * (lt > 1.6 ? 6.5 : 1.2));
      }
    },
    cam(lt) { const c = camAt(49, 42); return { x: c.x, y: c.y - 16 - lt * 2 }; }, zoom: 5,
    over(lt) {
      drawHud(1); drawDate(this.day, 1);
      O.globalAlpha = fade(lt, 0.6, 1.0) * (1 - fade(lt, this.len - 0.5, this.len - 0.1));
      outlined('Take only what grows back.', VW / 2, VH - 120, 64, K.ink, 'center', 600);
      O.globalAlpha = 1;
    },
  },
  { // Heartwood Company: cabin kits from the joinery to the harbour
    bar: 19, bars: 3, day: 99, hour: 15.5, speed: 1, rank: 4, money: [24100, 52800], sales: [70000, 78400], grow: 4, warm: 60,
    enter() { freeAll(); },
    cam(lt) { return camLerp(camAt(47.5, 36.5), camAt(54, 35), ease(lt / this.len)); }, zoom: 4,
    over(lt) {
      drawHud(1); drawDate(this.day, 1); drawRankBanner(lt, 4);
      drawContract(fade(lt, 2.2, 2.6), 'Coastal Settlers\' Union', 'Homes on the coast', 'kit', 3, 980, lerp(1, 3, fade(lt, 3.0, 6.2)));
    },
  },
  { // the whole mill at dusk, then the end card
    bar: 22, bars: 5, day: 99, hour: 17.9, speed: 1.6, rank: 4, money: [52800, 56200], sales: [78400, 80100],
    cam(lt) { return camLerp(WIDE, camAt(40.5, 34.5), lt / this.len); }, zoom: 2,
    over(lt) {
      drawHud(1 - fade(lt, BAR - 0.4, BAR));
      vignette(fade(lt, BAR - 0.4, BAR + 0.4));
      const a = fade(lt, BAR, BAR + 0.4) * (1 - fade(lt, this.len - 1.2, this.len - 0.2));
      if (a <= 0) return;
      const w = 1080, h = 580, x = VW / 2 - w / 2, y = VH / 2 - h / 2 + (1 - easeOut(a)) * 24;
      O.save(); O.globalAlpha = a; panel(x, y, w, h); O.restore();
      logo('Heartwood Mill', VW / 2, y + 180, 148, a, 0.85 + 0.15 * backOut(fade(lt, BAR, BAR + 0.4)));
      O.save(); O.globalAlpha = a;
      setFont(38, 400); text('From a woodlot to the Heartwood Company.', VW / 2, y + 264, K.ink, 'center');
      O.globalAlpha = a * fade(lt, BAR + BEAT * 2, BAR + BEAT * 2 + 0.3);
      button('Play it now', VW / 2, y + 312, 44);
      O.globalAlpha = a * fade(lt, BAR + BEAT * 4, BAR + BEAT * 4 + 0.4);
      setFont(28, 400); text(`${RANKS.length} mill ranks. ${CHAPTERS.length} story chapters. One forest to look after.`, VW / 2, y + 464, K.inkDim, 'center');
      setFont(24, 400); text('Free in your browser. A tribute to Lumbermill by BWDev.', VW / 2, y + 510, K.inkDim, 'center');
      O.restore();
    },
  },
];
for (const s of SCENES) { s.at = s.bar * BAR; s.len = s.bars * BAR; }

// ---------- frame loop ----------
let current = null;
async function init() {
  await Promise.all([
    document.fonts.load('700 74px "Pixelify Sans"'), document.fonts.load('400 30px "Pixelify Sans"'),
    document.fonts.load('600 30px "Pixelify Sans"'), document.fonts.load('500 30px "Pixelify Sans"'),
    document.fonts.load('600 48px "Jersey 10"', '0123456789'),
  ]).catch(() => {});
  O = document.getElementById('out').getContext('2d');
  bakeArt();
  newGame(SEED);
  initRender();
  R.dpr = 1; R.cssW = VW; R.cssH = VH;
  R.ov.width = VW; R.ov.height = VH;
  buildWorld();
  const load = (url) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = url; });
  TR.img.coin = await load(ART.icons.coin);
  for (const t of Object.keys(ART.itemIcons)) TR.img[t] = await load(ART.itemIcons[t]);
  TR.mute = false;
  return { frames: Math.round(TOTAL * FPS), fps: FPS, width: VW, height: VH };
}

function frame(i, capture = true) {
  const t = i / FPS, dt = 1 / FPS;
  TR.clock = t;
  const sc = SCENES.findLast(s => t >= s.at - 1e-6);
  if (sc !== current) {
    current = sc;
    if (sc.grow !== undefined) growTo(sc.grow, sc.warm ?? 30);
    G.t = hourAt(sc.day, sc.hour);
    G.fx = []; R.weather = [];
    if (sc.enter) sc.enter();
    if (sc.rank !== HUD.rank) { HUD.rank = sc.rank; HUD.rankAt = t; }
  }
  const lt = t - sc.at;
  // simulate
  let rem = dt * sc.speed;
  while (rem > 1e-6) { const st = Math.min(rem, 0.05); feed(); simStep(st); rem -= st; }
  if (sc.update) sc.update(lt, dt);
  updateFx(dt);
  if (sc.money) { const k = ease(lt / sc.len); HUD.money = Math.round(lerp(...sc.money, k) / 10) * 10; HUD.sales = Math.round(lerp(...sc.sales, k) / 10) * 10; }
  // draw
  O.fillStyle = K.sky; O.fillRect(0, 0, VW, VH);
  shoot(sc.cam(lt), sc.zoom, t);
  sc.over(lt, t);
  // a quick dip at each cut, and fades at either end
  black(1 - fade(lt, 0, 0.12));
  black(1 - fade(t, 0, 1.2));
  black(fade(t, TOTAL - 0.9, TOTAL - 0.1));
  return capture ? document.getElementById('out').toDataURL('image/png') : null;
}

// ---------- soundtrack: the game's synthesised effects plus a little tune, rendered offline ----------
const NOTE = (m) => 440 * Math.pow(2, (m - 69) / 12);
const CHORDS = { G: [55, 59, 62, 67], D: [50, 54, 57, 62], Em: [52, 55, 59, 64], C: [48, 52, 55, 60], B: [47, 51, 54, 59] };
// bar by bar: verses on G D Em C, a darker turn for the fire, and a cadence to finish
const PROG = ['G', 'D', 'Em', 'C', 'G', 'D', 'Em', 'C', 'G', 'D', 'Em', 'C', 'Em', 'B', 'G', 'D', 'Em', 'C', 'G', 'D', 'Em', 'C', 'C', 'G', 'D', 'C', 'G'];
const MEL_A = { // a tune for each chord
  G: [[71, 1], [74, 0.5], [76, 0.5], [74, 1], [71, 1]],
  D: [[69, 1.5], [71, 0.5], [69, 1], [66, 1]],
  Em: [[67, 1], [71, 1], [76, 1], [74, 1]],
  C: [[76, 1], [74, 0.5], [71, 0.5], [67, 2]],
};
const MEL_B = {
  G: [[79, 0.5], [76, 0.5], [74, 0.5], [71, 0.5], [74, 0.5], [76, 0.5], [79, 1]],
  D: [[78, 1], [76, 0.5], [74, 0.5], [74, 1], [69, 1]],
  Em: [[76, 0.5], [79, 0.5], [83, 1], [81, 0.5], [79, 0.5], [76, 1]],
  C: [[79, 1], [76, 1], [74, 0.5], [72, 0.5], [71, 1]],
};
const END = { 25: [[76, 1], [74, 1], [72, 1], [74, 1]], 26: [[79, 4]] };
// which section each bar is in: tune, and how busy the drums are (0 none, 1 kick, 2 kick and hats, 3 and the axe)
function section(bar) {
  if (bar < 3) return { mel: null, drums: 0 };
  if (bar < 5) return { mel: MEL_A, drums: 0 };
  if (bar < 9) return { mel: MEL_A, drums: 1 };
  if (bar < 12) return { mel: MEL_B, drums: 3 };
  if (bar < 14) return { mel: null, drums: 0, fire: true };
  if (bar < 17) return { mel: MEL_B, drums: 2 };
  if (bar < 19) return { mel: MEL_A, drums: 0, quiet: true };
  if (bar < 22) return { mel: MEL_B, drums: 3 };
  if (bar < 23) return { mel: MEL_A, drums: 1 };
  return { mel: END[bar] ? null : MEL_A, end: END[bar], drums: 0 };
}

async function audio() {
  const SR = 44100, ctx = new OfflineAudioContext(2, Math.ceil((TOTAL + 0.5) * SR), SR);
  let T = 0;
  // the game's sound helpers schedule at ctx.currentTime: this view lets us move "now" along the timeline
  AUD.ctx = new Proxy(ctx, { get(o, k) { if (k === 'currentTime') return T; const v = o[k]; return typeof v === 'function' ? v.bind(o) : v; } });
  AUD.master = ctx.createGain(); AUD.master.gain.value = AUD.vol;
  const comp = ctx.createDynamicsCompressor();
  AUD.master.connect(comp); comp.connect(ctx.destination);
  AUD.noise = ctx.createBuffer(1, SR, SR);
  const nd = AUD.noise.getChannelData(0); for (let i = 0; i < SR; i++) nd[i] = Math.random() * 2 - 1;
  const at = (t, fn) => { T = t; fn(); };
  const scene = (bar) => SCENES.find(s => s.bar === bar);

  // world effects, as they happened on screen
  const level = { chop: 1.1, fall: 1.2, coin: 0.7, plant: 1.4 };
  for (const e of TR.sounds) at(e.t, () => SFX[e.name](out(e.vol * (level[e.name] || 1), e.pan)));

  // ambience beds
  const bed = (s, vol, build) => {
    const t0 = s.at, t1 = s.at + s.len, g = ctx.createGain();
    g.gain.setValueAtTime(0, 0); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.15);
    g.gain.setValueAtTime(vol, t1 - 0.15); g.gain.linearRampToValueAtTime(0, t1);
    g.connect(AUD.master); build(g, t0, t1);
  };
  const noiseSrc = (t0, t1) => { const s = ctx.createBufferSource(); s.buffer = AUD.noise; s.loop = true; s.start(t0); s.stop(t1); return s; };
  const filtered = (type, freq, q = 1) => (g, t0, t1) => { const s = noiseSrc(t0, t1), f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; s.connect(f); f.connect(g); };
  bed({ at: 0, len: TOTAL }, 0.045, filtered('lowpass', 450));                 // wind
  bed(scene(7), 0.08, filtered('bandpass', 900, 0.7));                         // winter gusts
  for (const b of [19, 22]) bed(scene(b), 0.05, filtered('bandpass', 650, 0.5)); // the sea
  bed(scene(14), 0.04, filtered('bandpass', 650, 0.5));
  for (const b of [7, 9, 14, 19]) {                                              // saws and steam
    bed(scene(b), 0.045, (g, t0, t1) => {
      const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = 196; f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 2;
      lfo.frequency.value = 0.7; lg.gain.value = 500; lfo.connect(lg); lg.connect(f.frequency);
      o.connect(f); f.connect(g); o.start(t0); o.stop(t1); lfo.start(t0); lfo.stop(t1);
    });
    bed(scene(b), 0.07, (g, t0, t1) => {
      const s = noiseSrc(t0, t1), f = ctx.createBiquadFilter(), am = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      f.type = 'lowpass'; f.frequency.value = 380; am.gain.value = 0.5; lfo.type = 'square'; lfo.frequency.value = 2.6; lg.gain.value = 0.5;
      lfo.connect(lg); lg.connect(am.gain); s.connect(f); f.connect(am); am.connect(g); lfo.start(t0); lfo.stop(t1);
    });
  }
  const fire = scene(12);
  bed(fire, 0.2, (g, t0, t1) => { // the forest fire: roar and crackle
    const s = noiseSrc(t0, t1), f = ctx.createBiquadFilter(), cr = ctx.createGain();
    f.type = 'highpass'; f.frequency.value = 2200; s.connect(f); f.connect(cr); cr.connect(g);
    for (let t = t0; t < t1; t += 0.06) cr.gain.setTargetAtTime(Math.random() < 0.35 ? 1 : 0.12, t, 0.01);
    const r = noiseSrc(t0, t1), rf_ = ctx.createBiquadFilter(), rg = ctx.createGain();
    rf_.type = 'lowpass'; rf_.frequency.value = 300; rg.gain.value = 0.9; r.connect(rf_); rf_.connect(rg); rg.connect(g);
  });
  for (const s of SCENES) {
    if (s === fire || s.bar === 7) continue;
    for (let t = s.at + rf(0.3, 1.2); t < s.at + s.len; t += rf(1.2, 3.2)) at(t, () => SFX.bird(out(0.8, rf(-0.8, 0.8))));
  }

  // music
  const mus = ctx.createGain(); mus.gain.value = 1; mus.connect(AUD.master);
  for (let bar = 0; bar < BARS; bar++) {
    const t0 = bar * BAR, name = PROG[bar], ch = CHORDS[name], sec = section(bar), last = bar === BARS - 1;
    // pad under the intro, the fire and the final chord
    if (bar < 3 || sec.fire || last) for (const m of ch) at(t0, () => tone(mus, { type: 'sine', f0: NOTE(m - (sec.fire ? 12 : 0)), dur: last ? 3.4 : BAR + 0.3, vol: sec.fire ? 0.07 : 0.05, attack: 0.5 }));
    // bass
    if (bar >= 3) at(t0, () => tone(mus, { type: 'triangle', f0: NOTE(ch[0] - 12), dur: last ? 3 : BAR * 0.48, vol: 0.32 }));
    if (bar >= 3 && !last) at(t0 + BAR / 2, () => tone(mus, { type: 'triangle', f0: NOTE(ch[2] - 12), dur: BAR * 0.45, vol: 0.26 }));
    // arpeggio: eighths, or nervous sixteenths in the fire
    if (bar >= 1 && !last) {
      const pat = sec.fire ? [0, 2, 1, 3, 0, 2, 1, 3, 0, 2, 1, 3, 0, 2, 1, 3] : [0, 1, 2, 3, 2, 1, 2, 1];
      const step = BAR / pat.length;
      pat.forEach((k, i) => at(t0 + i * step, () => tone(mus, { type: 'triangle', f0: NOTE(ch[k] + 12), dur: sec.fire ? 0.14 : 0.32, vol: bar < 3 ? 0.05 : sec.quiet ? 0.06 : sec.fire ? 0.06 : 0.08 })));
    }
    // melody, doubled an octave down for warmth
    const mel = sec.end || (sec.mel && sec.mel[name]);
    if (mel) {
      let b = 0;
      for (const [m0, len] of mel) {
        const m = m0, st = t0 + b * BEAT, d = last ? 3.2 : len * BEAT * 0.95;
        at(st, () => { tone(mus, { type: 'square', f0: NOTE(m), dur: d, vol: sec.quiet ? 0.035 : 0.05, attack: 0.01 }); tone(mus, { type: 'triangle', f0: NOTE(m - 12), dur: d, vol: 0.08, attack: 0.01 }); });
        b += len;
      }
    }
    // percussion
    if (sec.drums >= 1) for (const k of [0, 2]) at(t0 + k * BEAT, () => tone(mus, { f0: 140, f1: 45, dur: 0.25, vol: 0.4 }));
    if (sec.drums >= 2) for (let i = 0; i < 8; i++) at(t0 + i * BEAT / 2, () => noise(mus, { dur: 0.04, vol: i % 2 ? 0.05 : 0.03, filter: 'highpass', freq: 7000 }));
    if (sec.drums >= 3) for (const k of [1, 3]) at(t0 + k * BEAT, () => SFX.chop(out(0.35, 0)));
    if (sec.fire) for (let i = 0; i < 4; i++) at(t0 + i * BEAT, () => tone(mus, { f0: 110, f1: 55, dur: 0.35, vol: 0.45 })); // war drums
  }
  // stingers: a tree comes down on the logo, the Guild's fanfare on every rank, a chime on the end card
  at(3 * BAR - 0.55, () => SFX.fall(out(0.9, 0)));
  for (const s of SCENES) if (s.grow) at(s.at + 0.08, () => SFX.level(out(1.1, 0)));
  at(22 * BAR + BAR + 0.05, () => SFX.secret(out(0.9, 0)));
  at(22 * BAR + BAR + BEAT * 2, () => SFX.cash(out(0.8, 0)));

  const buf = await ctx.startRendering();
  return wavBase64(buf, Math.round(TOTAL * SR));
}
function wavBase64(buf, frames) {
  const ch = [buf.getChannelData(0), buf.getChannelData(1)], n = Math.min(frames, buf.length);
  const bytes = new Uint8Array(44 + n * 4), v = new DataView(bytes.buffer);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) bytes[o + i] = s.charCodeAt(i); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true); v.setUint32(24, buf.sampleRate, true);
  v.setUint32(28, buf.sampleRate * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) v.setInt16(44 + i * 4 + c * 2, clamp(ch[c][i], -1, 1) * 32767, true);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

window.TR_API = { init, frame, audio };
