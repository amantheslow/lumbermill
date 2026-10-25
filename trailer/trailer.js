'use strict';
// Release trailer. Runs the real game (world, sprites, simulation and sound effects) one fixed
// frame at a time, and draws the titles in the game's own UI style on top.
// make-video.js loads this page headlessly, calls TR.frame(i) for every frame and TR.audio()
// for the soundtrack, and encodes the result with ffmpeg.

const VW = 1920, VH = 1080, FPS = 30;
const BAR = 2.4;                       // 100 bpm, four beats to a bar; every cut lands on a bar line
const BEAT = BAR / 4;
const SEED = 1;
const TOTAL = 23 * BAR;

// the trailer has no HUD: stand-ins for the parts of ui.js that the renderer and simulation call
const UI = { tool: 'select', sel: null, hover: null, hoverWorker: null, dragTiles: () => [] };
function toast() {}

// game UI colours (the :root tokens in index.html)
const K = {
  sky: '#0c1410', panel: '#5b3f3c', panel2: '#4a3230', panel3: '#3a2625', edge: '#2a1a19',
  ink: '#efe4d0', inkDim: '#c2ae98', gold: '#f5c518', go: '#3f9a4a', goHi: '#52b35c', good: '#7cc96a',
  paper: '#efe2c4', paperInk: '#3a2a1e',
};
const FONT = '"Pixelify Sans", ui-monospace, monospace';
const NUMFONT = '"Jersey 10", "Pixelify Sans", ui-monospace, monospace';

const TR = { clock: 0, mute: true, last: {}, sounds: [], money: 2000, cam: null, ready: null };
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
const ease = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const backOut = (t) => { t = clamp(t, 0, 1); const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const fade = (lt, a, b) => clamp((lt - a) / (b - a), 0, 1);
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

// ---------- the mill used in every shot ----------
const M = {};
function buildMill() {
  newGame(SEED);
  G.research.done = RESEARCH.map(r => r.id);
  G.policy.chopRadius = 9; G.policy.explore = false;
  const clear = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { removeTree(x, y); G.stump[idx(x, y)] = 0; } };
  clear(38, 31, 54, 39); clear(28, 31, 34, 41);
  // camp
  for (const [x, y] of [[31, 36], [30, 39]]) placeBuilding('tent', x, y, true);
  placeBuilding('cabin', 31, 32, true);
  placeBuilding('well', 34, 33, true);
  placeBuilding('outhouse', 29, 35, true);
  for (const [x, y] of [[34, 31], [33, 34], [30, 34]]) placeBuilding('flowers', x, y, true);
  for (let x = 38; x <= 53; x++) G.tiles[idx(x, 35)] = 2;
  for (let y = 32; y <= 38; y++) if (!G.occ[idx(33, y)]) G.tiles[idx(33, y)] = 2;
  // factory: Log Drop -> Sawmill -> Workshop -> Trade Depot, along the row above the path
  M.intake = placeBuilding('intake', 40, 34, true);
  M.saw = placeBuilding('sawmill', 43, 33, true);
  M.shop = placeBuilding('workshop', 47, 33, true); M.shop.recipe = 'chair';
  M.depot = placeBuilding('depot', 51, 33, true);
  for (const x of [41, 42, 45, 46, 49, 50]) { const b = { x, y: 34, dir: 0, item: null, p: 0, stamp: 0 }; G.belt[idx(x, 34)] = b; G.belts.push(b); }
  // power south of the path
  M.steam = placeBuilding('steam', 43, 36, true);
  placeBuilding('pole', 46, 36, true);
  placeBuilding('solar', 48, 36, true);
  placeBuilding('solar', 50, 36, true);
  placeBuilding('pole', 52, 37, true);
  // crew
  for (const role of ['lumberjack', 'lumberjack', 'mechanic', 'arborist', 'arborist']) hireWorker(makeCandidate(role, 3), true);
  revealCircle(36, 36, 30);
  G.dirty = { x0: 0, y0: 0, x1: MAP - 1, y1: MAP - 1 };
  computeWaterDist();
  // let the line fill up before the cameras roll
  for (let i = 0; i < 900; i++) { feed(); simStep(0.05); updateFx(0.05); }
  for (const b of G.buildings) { b.dur = 100; b.broken = false; }
  G.fx = [];
}
// keep the line busy whatever the lumberjacks get up to
function feed() {
  if (M.intake.stock < 6) M.intake.stock += 6;
  if (M.steam.fuel < 4) M.steam.fuel = 6;
  for (const b of G.buildings) if (b.broken || b.dur < 40) { b.broken = false; b.dur = 100; }
}
// put a worker straight to work on a task, skipping the walk there
function setTask(w, x, y, task, timer) {
  cancelTask(w);
  w.x = x + 0.5; w.y = y + 0.5; w.path = null;
  w.state = 'act'; w.task = task; w.timer = timer; w.hidden = false; w.carry = null;
}
function nearTrees(cx, cy, r, ok) {
  return G.trees.filter(t => !t.dead && t.sp !== 'ancient' && dist(t.x, t.y, cx, cy) <= r && (!ok || ok(t)))
    .sort((a, b) => dist(a.x, a.y, cx, cy) - dist(b.x, b.y, cx, cy));
}
function crew(role) { return G.workers.filter(w => w.role === role); }

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

// HUD: money box and the goals list, as in the game's top-left corner, drawn at 2x
const GOALS = [
  { text: 'Fell timber', at: 12.0 + 3.6 },
  { text: 'Saw logs into planks', at: 19.2 + 2.4 },
  { text: 'Ship furniture to market', at: 19.2 + 6.6 },
  { text: 'See out all four seasons', at: 28.8 + 6.6 },
  { text: 'Keep your crew happy', at: 36.0 + 3.0 },
  { text: 'Replant what you take', at: 40.8 + 3.6 },
];
function drawHud(t, alpha) {
  if (alpha <= 0) return;
  O.save(); O.globalAlpha = alpha;
  // money
  panel(20, 20, 400, 72);
  O.imageSmoothingEnabled = false; O.drawImage(ART.coinIcon, 36, 32, 48, 48);
  setFont(48, 600, NUMFONT); O.letterSpacing = '2px';
  text(fmt(TR.money), 100, 74, K.gold);
  O.letterSpacing = '0px';
  // goals: lines appear as their scene starts, and tick when done
  const shown = GOALS.filter(g => t >= g.at - 2.4 - 0.001);
  if (shown.length) {
    const done = shown.filter(g => t >= g.at).length;
    const h = 64 + shown.length * 44 + 12;
    panel(20, 124, 560, h);
    O.fillStyle = K.panel3; O.fillRect(24, 128, 552, 52);
    setFont(28, 600); text('Goals', 44, 164, K.ink);
    setFont(24, 400, NUMFONT); text(`${done}/${GOALS.length}`, 548, 162, K.inkDim, 'right');
    shown.forEach((g, i) => {
      const y = 214 + i * 44, ok = t >= g.at;
      const pop = ok ? 1 - fade(t, g.at, g.at + 0.25) : 0;
      O.strokeStyle = ok ? K.good : K.inkDim; O.lineWidth = 4; O.strokeRect(46, y - 22, 22, 22);
      if (ok) { O.fillStyle = K.good; O.fillRect(51 - pop * 4, y - 17 - pop * 4, 12 + pop * 8, 12 + pop * 8); }
      setFont(28, ok ? 400 : 600); text(g.text, 88, y, ok ? K.inkDim : K.gold);
    });
  }
  O.restore();
}
// date box, as at the top centre of the game
function drawDate(t, day, alpha) {
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
// a letter on paper, like the Letters tab
function drawLetter(lt, alpha) {
  if (alpha <= 0) return;
  const w = 860, h = 330, x = VW / 2 - w / 2, y = VH - h - 110 + (1 - easeOut(alpha)) * 30;
  O.save(); O.globalAlpha = alpha;
  O.fillStyle = 'rgba(0,0,0,0.3)'; O.fillRect(x + 6, y + 6, w, h);
  O.fillStyle = K.paper; O.fillRect(x, y, w, h);
  setFont(32, 600); text('Forestry Board', x + 40, y + 62, K.paperInk);
  setFont(24, 400); text('Autumn 1, Year 1', x + w - 40, y + 60, '#6d5a44', 'right');
  O.fillStyle = '#b9a47f'; for (let i = x + 40; i < x + w - 40; i += 16) O.fillRect(i, y + 84, 8, 4);
  const body = 'Congratulations on your lease of the old mill site. The forest here is yours to manage.\nFell trees for timber, but replant what you take.';
  const n = Math.floor(clamp((lt - 1.4) * 42, 0, body.length));
  setFont(30, 400);
  wrap(body.slice(0, n), x + 40, y + 140, w - 80, 46, K.paperInk);
  O.restore();
}
function wrap(s, x, y, maxW, lh, col) {
  let line = '', yy = y;
  for (const para of s.split('\n')) {
    for (const word of para.split(' ')) {
      const test = line ? line + ' ' + word : word;
      if (O.measureText(test).width > maxW && line) { text(line, x, yy, col); line = word; yy += lh; }
      else line = test;
    }
    text(line, x, yy, col); line = ''; yy += lh + 10;
  }
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
// each scene: start time, length, what the sim does (speed), the camera, and what is drawn on top
const SCENES = [
  { // dawn over the forest, with the Forestry Board's welcome letter
    at: 0, len: 3 * BAR,
    enter() { G.t = hourAt(0, 4.9); },
    speed: 1.2,
    cam(lt) { return camLerp(camAt(24, 22), camAt(31, 31), ease(lt / this.len)); }, zoom: 3,
    over(lt) { vignette(1); drawLetter(lt, fade(lt, 0.9, 1.5) * (1 - fade(lt, this.len - 0.6, this.len - 0.1))); },
  },
  { // the logo over the camp
    at: 3 * BAR, len: 2 * BAR,
    enter() { G.t = hourAt(1, 8.5); },
    speed: 1,
    cam(lt) { return camLerp(camAt(34.5, 37.5), camAt(36.5, 35.5), lt / this.len); }, zoom: 4,
    over(lt) {
      vignette(1);
      const a = fade(lt, 0, 0.12);
      logo('Heartwood Mill', VW / 2, VH / 2 - 10, 168, a, 0.6 + 0.4 * backOut(lt / 0.4));
      setFont(40, 400); O.globalAlpha = fade(lt, BEAT, BEAT + 0.4);
      outlined('Run a lumber mill deep in the forest.', VW / 2, VH / 2 + 90, 40, K.ink, 'center', 500);
      O.globalAlpha = fade(lt, BEAT * 3, BEAT * 3 + 0.4);
      outlined('Keep the forest alive while you do.', VW / 2, VH / 2 + 146, 40, K.ink, 'center', 500);
      O.globalAlpha = 1;
    },
  },
  { // lumberjacks at work, close up
    at: 5 * BAR, len: 3 * BAR,
    enter() {
      G.t = hourAt(2, 10);
      const [a, b] = crew('lumberjack');
      const pool = nearTrees(32, 44, 6, t => ['mature', 'old'].includes(treeStage(t)) && passable(t.x - 1, t.y) && passable(t.x, t.y - 1));
      const t1 = pool[0], t2 = pool.find(t => dist(t.x, t.y, t1.x, t1.y) > 2.5 && dist(t.x, t.y, t1.x, t1.y) < 5) || pool[1];
      this.focus = { x: (t1.x + t2.x) / 2 + 0.5, y: (t1.y + t2.y) / 2 + 0.5 };
      t1.res = a.id; t2.res = b.id;
      setTask(a, t1.x - 1, t1.y, { type: 'chop', tree: t1 }, 3.6);
      setTask(b, t2.x, t2.y - 1, { type: 'chop', tree: t2 }, 5.2);
      b.swing = 0.3;
      for (const w of [...crew('arborist'), ...crew('mechanic')]) setTask(w, 37, 41, { type: 'idle' }, 99);
    },
    speed: 1,
    cam(lt) { const c = camAt(this.focus.x, this.focus.y); return { x: c.x - 12 + lt * 3, y: c.y - 14 }; }, zoom: 6,
    over(lt, t) { drawHud(t, fade(lt, 0.2, 0.6)); },
  },
  { // the factory line, panning from the Log Drop to the Trade Depot
    id: 'factory', at: 8 * BAR, len: 4 * BAR,
    enter() {
      G.t = hourAt(2, 13);
      for (const w of G.workers) cancelTask(w);
      const [a, b] = crew('lumberjack');
      a.carry = { type: 'log', n: 3 }; a.x = 37.5; a.y = 35.5; goToBuilding(a, M.intake, { type: 'deliver' });
      setTask(crew('mechanic')[0], 45, 35, { type: 'repair', b: M.saw }, 99);
      M.saw.dur = 70;
    },
    speed: 1,
    cam(lt) { return camLerp(camAt(41, 36), camAt(50.5, 36), ease(lt / this.len)); }, zoom: 4,
    over(lt, t) { drawHud(t, 1); },
  },
  ...['Spring', 'Summer', 'Autumn', 'Winter'].map((name, i) => ({ // the same view through the year, three beats per season
    at: 12 * BAR + i * BAR * 0.75, len: BAR * 0.75,
    day: [27, 39, 51, 63][i],
    enter() { G.t = hourAt(this.day, 11.5); for (const w of G.workers) if (w.state === 'act' && w.timer > 50) cancelTask(w); },
    speed: 1,
    cam(lt) { return camLerp(camAt(36, 40.5), camAt(41, 38.5), (i * this.len + lt) / (4 * this.len)); }, zoom: 3,
    over(lt, t) { drawHud(t, 1); drawDate(t, this.day, 1); },
  })),
  { // a night by the campfire
    id: 'night', at: 15 * BAR, len: 2 * BAR,
    enter() {
      G.t = hourAt(3, 21.6);
      const fire = G.buildings.find(b => b.type === 'campfire');
      this.fire = fire;
      const spots = [[-1, 0, false], [1, 0, true], [0, 1, true], [-1, 1, false]];
      G.workers.slice(0, 4).forEach((w, i) => {
        const [dx, dy, flip] = spots[i];
        setTask(w, fire.x + dx, fire.y + dy, { type: 'idle' }, 99);
        w.flip = flip; w.back = dy < 0;
      });
      const s = G.workers[4]; cancelTask(s); s.x = fire.x - 0.6; s.y = fire.y + 2.4; s.state = 'sleep'; s.task = { type: 'sleep', bed: false };
      s.needs.energy = 10;
    },
    speed: 0.5,
    cam(lt) { const c = camAt(this.fire.x + 0.5, this.fire.y + 1); return { x: c.x - 8 + lt * 4, y: c.y - 16 }; }, zoom: 5,
    over(lt, t) { drawHud(t, 1); },
  },
  { // spring replanting, in time-lapse
    at: 17 * BAR, len: 2 * BAR,
    enter() {
      G.t = hourAt(28, 9.5);
      this.patch = [];
      for (let y = 42; y <= 45; y++) for (let x = 39; x <= 44; x++) {
        if (!isLand(x, y) || G.occ[idx(x, y)] || G.belt[idx(x, y)]) continue;
        removeTree(x, y); G.stump[idx(x, y)] = 1; this.patch.push({ x, y, at: 0.15 + ((x - 39) + (y - 42) * 0.5) * 0.28 + rf(0, 0.1), tree: null });
      }
      markDirty(38, 41, 45, 46);
      for (const w of G.workers) cancelTask(w);
      crew('arborist').forEach((w, i) => { setTask(w, 39 + i * 4, 43 + i, { type: 'plant' }, 99); w.flip = i === 1; });
    },
    speed: 1,
    update(lt, dt) {
      for (const p of this.patch) {
        if (!p.tree && lt >= p.at) {
          G.stump[idx(p.x, p.y)] = 0;
          p.tree = addTree(p.x, p.y, (p.x + p.y) % 3 === 0 ? 'birch' : 'spruce', 0.2);
          p.tree.v = (p.x * 7 + p.y) % 3;
          sfx('plant', p.x + 0.5, p.y + 0.5);
          fxPuff(isoX(p.x + 0.5, p.y + 0.5), isoY(p.x + 0.5, p.y + 0.5) - 2, 'rgba(160,220,120,', 3, 4);
        }
        if (p.tree) p.tree.age = Math.min(14, p.tree.age + dt * (lt > 1.6 ? 7 : 1.2));
      }
    },
    cam(lt) { const c = camAt(41.5, 43.5); return { x: c.x, y: c.y - 18 - lt * 2 }; }, zoom: 5,
    over(lt, t) { drawHud(t, 1); },
  },
  { // the end card over the whole mill at dusk
    at: 19 * BAR, len: 4 * BAR,
    enter() { G.t = hourAt(4, 18.2); for (const w of G.workers) if (w.state !== 'walk') cancelTask(w); },
    speed: 1.6,
    cam(lt) { return camLerp(camAt(38, 39), camAt(42, 35), lt / this.len); }, zoom: 2,
    over(lt) {
      vignette(fade(lt, 0, 0.6));
      const a = fade(lt, 0.1, 0.5) * (1 - fade(lt, this.len - 1.2, this.len - 0.2));
      if (a <= 0) return;
      O.save(); O.globalAlpha = a;
      const w = 1060, h = 560, x = VW / 2 - w / 2, y = VH / 2 - h / 2 + (1 - easeOut(a)) * 24;
      panel(x, y, w, h);
      O.restore();
      logo('Heartwood Mill', VW / 2, y + 180, 148, a, 0.85 + 0.15 * backOut(fade(lt, 0.1, 0.5)));
      O.save(); O.globalAlpha = a;
      setFont(36, 400); text('A forest factory-builder that runs in your browser.', VW / 2, y + 262, K.ink, 'center');
      O.globalAlpha = a * fade(lt, BEAT * 2, BEAT * 2 + 0.3);
      button('Play it now', VW / 2, y + 310, 44);
      O.globalAlpha = a * fade(lt, BEAT * 4, BEAT * 4 + 0.4);
      setFont(28, 400); text('Every sprite and sound is made by code. No downloads, no installs.', VW / 2, y + 460, K.inkDim, 'center');
      setFont(24, 400); text('A tribute to Lumbermill by BWDev.', VW / 2, y + 504, K.inkDim, 'center');
      O.restore();
    },
  },
];

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
  buildMill();
  ART.coinIcon = await iconImage(ART.icons.coin);
  TR.mute = false;
  return { frames: Math.round(TOTAL * FPS), fps: FPS, width: VW, height: VH };
}
function iconImage(url) { return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = url; }); }

function frame(i, capture = true) {
  const t = i / FPS, dt = 1 / FPS;
  TR.clock = t;
  const sc = SCENES.findLast(s => t >= s.at - 1e-6);
  if (sc !== current) { current = sc; G.fx = []; R.weather = []; sc.enter(); }
  const lt = t - sc.at;
  // simulate
  let rem = dt * sc.speed;
  while (rem > 1e-6) { const st = Math.min(rem, 0.05); feed(); simStep(st); rem -= st; }
  if (sc.update) sc.update(lt, dt);
  updateFx(dt);
  // money climbs as the mill gets going
  TR.money = Math.round(lerp(2000, 48260, Math.pow(fade(t, 8 * BAR, 19 * BAR), 1.6)) / 10) * 10;
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
const CHORDS = { G: [55, 59, 62, 67], D: [50, 54, 57, 62], Em: [52, 55, 59, 64], C: [48, 52, 55, 60] };
const PROG = [...Array(19)].map((_, i) => ['G', 'D', 'Em', 'C'][i % 4]).concat(['G', 'D', 'C', 'G']);
const MEL_A = [
  [[71, 1], [74, 0.5], [76, 0.5], [74, 1], [71, 1]],
  [[69, 1.5], [71, 0.5], [69, 1], [66, 1]],
  [[67, 1], [71, 1], [76, 1], [74, 1]],
  [[76, 1], [74, 0.5], [71, 0.5], [67, 2]],
];
const MEL_B = [
  [[79, 0.5], [76, 0.5], [74, 0.5], [71, 0.5], [74, 0.5], [76, 0.5], [79, 1]],
  [[78, 1], [76, 0.5], [74, 0.5], [74, 1], [69, 1]],
  [[76, 0.5], [79, 0.5], [83, 1], [81, 0.5], [79, 0.5], [76, 1]],
  [[79, 1], [76, 1], [74, 0.5], [72, 0.5], [71, 1]],
];
const MEL_END = [MEL_A[0], MEL_A[1], [[76, 1], [74, 1], [72, 1], [74, 1]], [[79, 4]]];
function melodyFor(bar) {
  if (bar < 3) return null;
  if (bar < 8) return MEL_A[(bar - 3) % 4];
  if (bar < 12) return MEL_B[bar - 8];
  if (bar < 15) return MEL_A[(bar - 12) % 4].map(([m, b]) => [m + 12, b]);
  if (bar < 17) return MEL_A[(bar - 15) % 4];
  if (bar < 19) return MEL_B[(bar - 17) % 4];
  return MEL_END[bar - 19];
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

  // world effects, as they happened on screen
  const level = { chop: 1.1, fall: 1.2, coin: 0.8, plant: 1.4 };
  for (const e of TR.sounds) at(e.t, () => SFX[e.name](out(e.vol * (level[e.name] || 1), e.pan)));

  // ambience: wind throughout, birds by day, saws in the factory, crickets and fire at night
  const bed = (t0, t1, vol, build) => {
    const g = ctx.createGain(); g.gain.setValueAtTime(0, 0);
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.15);
    g.gain.setValueAtTime(vol, t1 - 0.15); g.gain.linearRampToValueAtTime(0, t1);
    g.connect(AUD.master); build(g, t0, t1);
  };
  const noiseSrc = (t0, t1) => { const s = ctx.createBufferSource(); s.buffer = AUD.noise; s.loop = true; s.start(t0); s.stop(t1); return s; };
  bed(0, TOTAL, 0.05, (g, t0, t1) => { const s = noiseSrc(t0, t1), f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 450; s.connect(f); f.connect(g); });
  const winter = SCENES.find(s => s.day === 63);
  bed(winter.at, winter.at + winter.len, 0.08, (g, t0, t1) => { const s = noiseSrc(t0, t1), f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.7; s.connect(f); f.connect(g); });
  const fac = SCENES.find(s => s.id === 'factory');
  bed(fac.at, fac.at + fac.len, 0.05, (g, t0, t1) => {
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = 196; f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 2;
    lfo.frequency.value = 0.7; lg.gain.value = 500; lfo.connect(lg); lg.connect(f.frequency);
    o.connect(f); f.connect(g); o.start(t0); o.stop(t1); lfo.start(t0); lfo.stop(t1);
  });
  bed(fac.at, fac.at + fac.len, 0.08, (g, t0, t1) => {
    const s = noiseSrc(t0, t1), f = ctx.createBiquadFilter(), am = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    f.type = 'lowpass'; f.frequency.value = 380; am.gain.value = 0.5; lfo.type = 'square'; lfo.frequency.value = 2.6; lg.gain.value = 0.5;
    lfo.connect(lg); lg.connect(am.gain); s.connect(f); f.connect(am); am.connect(g); lfo.start(t0); lfo.stop(t1);
  });
  const night = SCENES.find(s => s.id === 'night');
  bed(night.at, night.at + night.len, 0.1, (g, t0, t1) => {
    const s = noiseSrc(t0, t1), f = ctx.createBiquadFilter(), cr = ctx.createGain();
    f.type = 'highpass'; f.frequency.value = 2500; s.connect(f); f.connect(cr); cr.connect(g);
    for (let t = t0; t < t1; t += 0.07) cr.gain.setTargetAtTime(Math.random() < 0.3 ? 1 : 0.15, t, 0.01);
  });
  for (let t = night.at + 0.2; t < night.at + night.len; t += rf(0.25, 0.8)) at(t, () => SFX.cricket(out(0.9, rf(-0.8, 0.8))));
  for (const s of SCENES) {
    if (s === night || s.day === 63) continue;
    for (let t = s.at + rf(0.3, 1.2); t < s.at + s.len; t += rf(1.2, 3.2)) at(t, () => SFX.bird(out(0.8, rf(-0.8, 0.8))));
  }

  // music
  const mus = ctx.createGain(); mus.gain.value = 1; mus.connect(AUD.master);
  for (let bar = 0; bar < PROG.length; bar++) {
    const t0 = bar * BAR, ch = CHORDS[PROG[bar]], last = bar === PROG.length - 1;
    const quiet = bar >= 15 && bar < 17;
    // pad
    if (bar < 3 || last) for (const m of ch) at(t0, () => tone(mus, { type: 'sine', f0: NOTE(m), dur: last ? 3.4 : BAR + 0.3, vol: 0.05, attack: 0.5 }));
    // bass
    if (bar >= 3) at(t0, () => tone(mus, { type: 'triangle', f0: NOTE(ch[0] - 12), dur: last ? 3 : BAR * 0.48, vol: 0.32 }));
    if (bar >= 3 && !last) at(t0 + BAR / 2, () => tone(mus, { type: 'triangle', f0: NOTE(ch[2] - 12), dur: BAR * 0.45, vol: 0.26 }));
    // arpeggio
    if (bar >= 1 && !last) [0, 1, 2, 3, 2, 1, 2, 1].forEach((k, i) => at(t0 + i * BEAT / 2, () => tone(mus, { type: 'triangle', f0: NOTE(ch[k] + 12), dur: 0.32, vol: bar < 3 ? 0.05 : quiet ? 0.06 : 0.08 })));
    // melody, doubled an octave down for warmth
    const mel = melodyFor(bar);
    if (mel) {
      let b = 0;
      for (const [m, len] of mel) {
        const st = t0 + b * BEAT, d = last ? 3.2 : len * BEAT * 0.95;
        at(st, () => { tone(mus, { type: 'square', f0: NOTE(m), dur: d, vol: quiet ? 0.035 : 0.05, attack: 0.01 }); tone(mus, { type: 'triangle', f0: NOTE(m - 12), dur: d, vol: 0.08, attack: 0.01 }); });
        b += len;
      }
    }
    // percussion: a soft kick, hats, and an axe on the backbeat while the mill is running
    if (bar >= 5 && !quiet && !last) {
      for (const k of [0, 2]) at(t0 + k * BEAT, () => tone(mus, { f0: 140, f1: 45, dur: 0.25, vol: 0.4 }));
      if (bar >= 8) for (let i = 0; i < 8; i++) at(t0 + i * BEAT / 2, () => noise(mus, { dur: 0.04, vol: i % 2 ? 0.05 : 0.03, filter: 'highpass', freq: 7000 }));
      if (bar >= 8 && bar < 12 || bar >= 17) for (const k of [1, 3]) at(t0 + k * BEAT, () => SFX.chop(out(0.35, 0)));
    }
  }
  // stingers: a tree comes down on the logo, coins at the factory, a chime on the end card
  at(3 * BAR - 0.55, () => SFX.fall(out(0.9, 0)));
  at(19 * BAR + 0.1, () => SFX.secret(out(0.9, 0)));
  at(19 * BAR + BEAT * 2, () => SFX.cash(out(0.8, 0)));

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
