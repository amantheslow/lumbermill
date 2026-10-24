'use strict';
// Save files: the whole mill as JSON in a file the player keeps, and loading one back.

const SAVE_FORMAT = 'heartwood-mill-save';
const SAVE_VERSION = 1;

function bytesToB64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function b64ToBytes(s) {
  const bin = atob(String(s));
  if (bin.length !== MAP * MAP) throw new SaveError('The map in this save is damaged.');
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
class SaveError extends Error {}

function serializeGame() {
  return {
    format: SAVE_FORMAT, version: SAVE_VERSION, savedAt: new Date().toISOString(),
    seed: G.seed, t: G.t, money: G.money, uid: G.uid, rep: G.rep, plantSpecies: G.plantSpecies,
    grids: { tiles: bytesToB64(G.tiles), reveal: bytesToB64(G.reveal), stump: bytesToB64(G.stump), plantMark: bytesToB64(G.plantMark) },
    secrets: G.secrets,
    trees: G.trees.map(t => ({ x: t.x, y: t.y, sp: t.sp, age: t.age, maxAge: t.maxAge, v: t.v, sick: t.sick, dead: t.dead, fallen: t.fallen, deadDays: t.deadDays, mark: t.mark, secret: t.secret ? G.secrets.indexOf(t.secret) : -1 })),
    buildings: G.buildings.map(b => ({ id: b.id, type: b.type, x: b.x, y: b.y, inv: b.inv, out: b.out, prog: b.prog, recipe: b.recipe, dur: b.dur, broken: b.broken, fuel: b.fuel, stock: b.stock, v: b.v, outIdx: b.outIdx, made: b.made, burn: b.burn || 0 })),
    belts: G.belts.map(b => ({ x: b.x, y: b.y, dir: b.dir, item: b.item, p: b.p })),
    workers: G.workers.map(w => ({ id: w.id, name: w.name, role: w.role, pers: w.pers, level: w.level, pay: w.pay, skill: w.skill, ap: w.ap, x: w.x, y: w.y, carry: w.carry, needs: w.needs, mood: w.mood, low: w.low, rogue: w.rogue, rogueDays: w.rogueDays || 0, thought: w.thought, home: w.home, xp: w.xp })),
    candidates: G.candidates, candDay: G.candDay,
    letters: G.letters, offers: G.offers, contracts: G.contracts,
    research: G.research, market: G.market, policy: G.policy, stats: G.stats,
    goals: G.goals.filter(g => g.done).map(g => g.id),
    initialForest: G.initialForest, health: G.health, warned: G.warned, rivalFlood: G.rivalFlood, lowCash: G.lowCash,
    camera: { x: R.cam.x, y: R.cam.y, s: R.cam.s },
  };
}

// ---------- loading (the file is the player's, so check everything) ----------
const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);
const int = (v, d = 0) => Math.round(num(v, d));
const str = (v, d = '', max = 2000) => (typeof v === 'string' ? v.slice(0, max) : d);
const arr = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const oneOf = (v, set, d) => (Object.prototype.hasOwnProperty.call(set, v) ? v : d);
const hex = (v, d) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : d);
function cleanCounts(v) { const o = {}; for (const [k, n] of Object.entries(obj(v))) if (ITEMS[k]) o[k] = Math.max(0, int(n)); return o; }
function cleanAppearance(ap, role) {
  const a = obj(ap), fresh = makeAppearance(role);
  const shirt = arr(a.shirt);
  return {
    role, skin: hex(a.skin, fresh.skin), hair: hex(a.hair, fresh.hair), style: clamp(int(a.style, fresh.style), 0, 5), beard: !!a.beard,
    hat: hex(a.hat, fresh.hat), shirt: [hex(shirt[0], fresh.shirt[0]), hex(shirt[1], fresh.shirt[1])], pants: hex(a.pants, fresh.pants),
  };
}
function cleanPerson(c) {
  const role = oneOf(c.role, ROLES, 'lumberjack');
  return {
    id: int(c.id), name: str(c.name, 'Nameless', 60), role, pers: oneOf(c.pers, PERSONALITIES, 'dull'),
    level: clamp(int(c.level, 1), 1, 5), pay: clamp(int(c.pay, 60), 0, 10000), skill: clamp(num(c.skill, 1), 0.1, 5), ap: cleanAppearance(c.ap, role),
  };
}
function cleanLetter(l) { return { id: int(l.id), from: str(l.from, '', 80), subject: str(l.subject, '', 160), body: str(l.body, '', 4000), day: int(l.day), read: !!l.read, kind: oneOf(l.kind, { info: 1, good: 1, bad: 1 }, 'info') }; }
function cleanDeal(o) { return { id: int(o.id), company: str(o.company, 'A customer', 60), item: oneOf(o.item, ITEMS, 'log'), qty: clamp(int(o.qty, 1), 1, 10000), price: Math.max(0, num(o.price)), days: Math.max(1, int(o.days, 5)), expires: int(o.expires), negotiated: !!o.negotiated, deadline: int(o.deadline), delivered: Math.max(0, int(o.delivered)) }; }

function restoreGame(d) {
  if (!d || typeof d !== 'object' || d.format !== SAVE_FORMAT) throw new SaveError('That file is not a Heartwood Mill save.');
  if (num(d.version) > SAVE_VERSION) throw new SaveError('That save comes from a newer version of the game.');
  const old = G;
  try {
    const g = obj(d.grids);
    const grids = { tiles: b64ToBytes(g.tiles), reveal: b64ToBytes(g.reveal), stump: b64ToBytes(g.stump), plantMark: b64ToBytes(g.plantMark) };
    const seed = int(d.seed) >>> 0;
    rand = makeRng((seed ^ int(d.t)) >>> 0);
    G = blankState(seed);
    Object.assign(G, grids);
    for (let i = 0; i < MAP * MAP; i++) if (G.tiles[i] > 2) G.tiles[i] = 1;
    G.t = Math.max(0, num(d.t, 360)); G.money = num(d.money); G.rep = clamp(int(d.rep), -5, 10);
    G.plantSpecies = oneOf(d.plantSpecies, TREE_SPECIES, 'spruce');
    if (G.plantSpecies === 'ancient') G.plantSpecies = 'spruce';

    G.secrets = arr(d.secrets).map(s => obj(s)).filter(s => inMap(int(s.x), int(s.y))).map(s => ({ x: int(s.x), y: int(s.y), kind: oneOf(s.kind, SECRET_INFO, 'chest'), found: !!s.found, done: !!s.done }));
    for (const t of arr(d.trees).map(obj)) {
      const x = int(t.x), y = int(t.y);
      if (!inMap(x, y) || !G.tiles[idx(x, y)] || G.tree[idx(x, y)]) continue;
      const tr = addTree(x, y, oneOf(t.sp, TREE_SPECIES, 'spruce'), Math.max(0, num(t.age)));
      Object.assign(tr, { maxAge: Math.max(1, num(t.maxAge, tr.maxAge)), v: clamp(int(t.v), 0, 2), sick: Math.max(0, int(t.sick)), dead: !!t.dead, fallen: !!t.fallen, deadDays: Math.max(0, int(t.deadDays)), mark: !!t.mark });
      if (tr.sp === 'ancient') { tr.v = 0; const s = G.secrets[int(t.secret, -1)]; if (s && s.kind === 'ancient') tr.secret = s; }
    }
    for (const b of arr(d.buildings).map(obj)) {
      const type = oneOf(b.type, BDEF, null), x = int(b.x), y = int(b.y), id = int(b.id);
      if (!type || id <= 0 || G.bmap.has(id)) continue;
      const def = BDEF[type];
      let ok = true;
      for (let j = 0; j < def.h; j++) for (let i = 0; i < def.w; i++) if (!inMap(x + i, y + j) || G.occ[idx(x + i, y + j)] || !G.tiles[idx(x + i, y + j)]) ok = false;
      if (!ok) continue;
      const nb = addBuilding(type, x, y, id);
      for (let j = 0; j < def.h; j++) for (let i = 0; i < def.w; i++) { const k = idx(x + i, y + j); if (G.tree[k]) removeTree(x + i, y + j); }
      Object.assign(nb, {
        inv: cleanCounts(b.inv), out: arr(b.out).filter(it => ITEMS[it]).slice(0, 20), prog: clamp(num(b.prog), 0, 1),
        recipe: def.recipes ? (def.recipes.includes(b.recipe) ? b.recipe : def.recipes[0]) : null,
        dur: clamp(num(b.dur, 100), 0, 100), broken: !!b.broken, fuel: clamp(int(b.fuel), 0, 50), stock: clamp(int(b.stock), 0, 30),
        v: clamp(int(b.v), 0, 2), outIdx: Math.max(0, int(b.outIdx)) % Math.max(1, nb.perim.length), made: Math.max(0, int(b.made)), burn: clamp(num(b.burn), 0, 1),
      });
    }
    G.hq = G.buildings.find(b => b.type === 'hq');
    if (!G.hq) throw new SaveError('That save has no Mill Office, so it cannot be loaded.');
    for (const b of arr(d.belts).map(obj)) {
      const x = int(b.x), y = int(b.y);
      if (!inMap(x, y) || !G.tiles[idx(x, y)] || G.occ[idx(x, y)] || G.belt[idx(x, y)]) continue;
      if (G.tree[idx(x, y)]) removeTree(x, y);
      const bl = { x, y, dir: clamp(int(b.dir), 0, 3), item: ITEMS[b.item] ? b.item : null, p: clamp(num(b.p), 0, 1), stamp: 0 };
      G.belt[idx(x, y)] = bl; G.belts.push(bl);
    }
    for (const w0 of arr(d.workers).map(obj).slice(0, 200)) {
      const c = cleanPerson(w0);
      if (c.id <= 0 || G.workers.some(o => o.id === c.id)) continue;
      const n = obj(w0.needs), m = obj(w0.mood), carry = obj(w0.carry);
      const w = hireWorker(c, true);
      let x = num(w0.x, w.x), y = num(w0.y, w.y);
      if (!passable(Math.floor(x), Math.floor(y))) { x = w.x; y = w.y; }
      Object.assign(w, {
        x, y, needs: { energy: clamp(num(n.energy, 80), 0, 100), hydration: clamp(num(n.hydration, 80), 0, 100), bladder: clamp(num(n.bladder, 10), 0, 100) },
        mood: { overall: 60, physical: 60, mental: 60, pay: clamp(num(m.pay, 60), 0, 100), morale: clamp(num(m.morale, 65), 0, 100), colleagues: clamp(num(m.colleagues, 70), 0, 100) },
        carry: carry.type === 'log' && int(carry.n) > 0 ? { type: 'log', n: clamp(int(carry.n), 1, 8) } : null,
        low: Math.max(0, num(w0.low)), rogue: !!w0.rogue, rogueDays: Math.max(0, int(w0.rogueDays)), thought: str(w0.thought, 'Back to work.', 200),
        home: G.bmap.has(int(w0.home)) && /^(tent|cabin)$/.test(G.bmap.get(int(w0.home)).type) ? int(w0.home) : null, xp: Math.max(0, int(w0.xp)),
      });
      updateMood(w, 0);
    }
    G.candidates = arr(d.candidates).map(obj).slice(0, 10).map(cleanPerson);
    G.candDay = int(d.candDay);
    G.letters = arr(d.letters).map(obj).slice(0, 300).map(cleanLetter);
    G.offers = arr(d.offers).map(obj).slice(0, 10).map(cleanDeal);
    G.contracts = arr(d.contracts).map(obj).slice(0, 20).map(cleanDeal);
    const r = obj(d.research);
    G.research.done = arr(r.done).filter(id => RESEARCH.some(x => x.id === id));
    const ra = obj(r.active);
    G.research.active = RESEARCH.some(x => x.id === ra.id) && !G.research.done.includes(ra.id) ? { id: ra.id, prog: clamp(num(ra.prog), 0, 1) } : null;
    for (const [k, m] of Object.entries(obj(d.market))) if (G.market[k]) { const mm = obj(m); G.market[k] = { m: clamp(num(mm.m, 1), 0.2, 3), phase: num(mm.phase), hist: arr(mm.hist).map(v => num(v, 1)).slice(-30) }; }
    const pol = obj(d.policy);
    G.policy = { autoChop: pol.autoChop !== false, chopRadius: clamp(int(pol.chopRadius, 14), 6, 30), replant: pol.replant !== false, explore: pol.explore !== false };
    const st = obj(d.stats);
    Object.assign(G.stats, {
      logsCut: int(st.logsCut), made: cleanCounts(st.made), sold: cleanCounts(st.sold), revenue: num(st.revenue), spent: num(st.spent),
      planted: int(st.planted), secrets: int(st.secrets), contracts: int(st.contracts), wages: int(st.wages),
      history: arr(st.history).map(obj).slice(-60).map(h => ({ day: int(h.day), money: int(h.money), health: int(h.health), trees: int(h.trees) })),
    });
    setupGoals();
    const doneGoals = arr(d.goals);
    for (const goal of G.goals) goal.done = doneGoals.includes(goal.id);
    G.initialForest = Math.max(1, num(d.initialForest, forestScore()));
    G.health = int(d.health, 100); G.warned = int(d.warned, 100); G.lowCash = int(d.lowCash);
    const rf_ = obj(d.rivalFlood);
    G.rivalFlood = ITEMS[rf_.item] ? { item: rf_.item, until: int(rf_.until) } : null;
    G.uid = Math.max(int(d.uid), ...G.buildings.map(b => b.id), ...G.workers.map(w => w.id), ...G.candidates.map(c => c.id), ...G.letters.map(l => l.id), ...G.offers.map(o => o.id), 0);
    G.savedAt = G.t;
    G.dirty = { x0: 0, y0: 0, x1: MAP - 1, y1: MAP - 1 };
    G.powerDirty = true;
    return obj(d.camera);
  } catch (e) {
    G = old;
    throw e instanceof SaveError ? e : new SaveError('That save file is damaged and could not be loaded.');
  }
}

// ---------- files ----------
async function saveToFile() {
  if (!G || !G.hq) return;
  const json = JSON.stringify(serializeGame());
  const p = dateParts();
  const filename = `heartwood-mill-year${p.y}-${p.m.slice(0, 3).toLowerCase()}-${p.d}.json`;
  if (window.claude && window.claude.use) {
    // inside the claude.ai viewer, files go through the downloads capability
    const dl = await window.claude.use('downloads').catch(() => null);
    if (!dl) { toast('Saving to a file is not available here.', 'bad'); return; }
    try {
      await dl.save({ filename, data: json });
      G.savedAt = G.t; toast('Mill saved.', 'good');
    } catch (e) {
      const code = e && e.code;
      if (code === 'declined') toast('Save cancelled.');
      else if (code === 'rate_limited') toast('A save prompt is already open.', 'bad');
      else toast('The save did not go through. Try again in a moment.', 'bad');
    }
    renderPanel();
    return;
  }
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  G.savedAt = G.t; toast('Mill saved.', 'good');
  renderPanel();
}
function openLoadDialog() {
  const input = $('#load-file');
  input.value = '';
  input.click();
}
async function loadFromFile(file) {
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) { toast('That file is too large to be a save.', 'bad'); return; }
  let data;
  try { data = JSON.parse(await file.text()); }
  catch { toast('That file is not a Heartwood Mill save.', 'bad'); return; }
  let cam;
  try { cam = restoreGame(data); }
  catch (e) { toast(e.message, 'bad'); return; }
  afterLoad(cam);
}
