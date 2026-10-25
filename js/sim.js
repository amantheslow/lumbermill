'use strict';
// Simulation: world generation, forest lifecycle, buildings, conveyors, power, staff AI and the business.

const MIN_PER_SEC = 20;            // game minutes per simulated second (1 day = 72 s at 1x)
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const ITEMS = {
  log: { name: 'Logs', one: 'log', base: 12 },
  plank: { name: 'Planks', one: 'plank', base: 8 },
  crate: { name: 'Crates', one: 'crate', base: 34 },
  chair: { name: 'Chairs', one: 'chair', base: 52 },
  table: { name: 'Tables', one: 'table', base: 120 },
};
const RECIPES = {
  plank: { name: 'Planks', in: { log: 1 }, out: 'plank', n: 3, time: 4 },
  crate: { name: 'Crate', in: { plank: 3 }, out: 'crate', n: 1, time: 5 },
  chair: { name: 'Chair', in: { plank: 4 }, out: 'chair', n: 1, time: 7 },
  table: { name: 'Table', in: { plank: 7 }, out: 'table', n: 1, time: 11, req: 'fine' },
};
const BDEF = {
  hq: { name: 'Mill Office', w: 3, h: 3, cost: 0, desc: 'Your office. Lumberjacks sell logs here if there is nowhere better to take them.' },
  tent: { name: 'Tent', cat: 'camp', w: 1, h: 1, cost: 120, beds: 2, desc: 'Sleeps two. Staff without a bed sleep rough and get grumpy.' },
  cabin: { name: 'Cabin', cat: 'camp', w: 2, h: 2, cost: 700, beds: 4, req: 'comforts', desc: 'Sleeps four in comfort. Better rest and morale than a tent.' },
  well: { name: 'Well', cat: 'camp', w: 1, h: 1, cost: 180, desc: 'Fresh water for thirsty staff.' },
  outhouse: { name: 'Outhouse', cat: 'camp', w: 1, h: 1, cost: 100, desc: 'Better than the bushes.' },
  campfire: { name: 'Campfire', cat: 'camp', w: 1, h: 1, cost: 60, desc: 'Staff gather here in the evening. Lifts morale and lights the night.' },
  flowers: { name: 'Flower Bed', cat: 'camp', w: 1, h: 1, cost: 80, req: 'comforts', desc: 'A little colour. Small morale boost for everyone.' },
  intake: { name: 'Log Drop', cat: 'factory', w: 1, h: 1, cost: 100, desc: 'Lumberjacks drop logs here. Pushes logs onto any conveyor leading away.' },
  sawmill: { name: 'Sawmill', cat: 'factory', w: 2, h: 2, cost: 900, power: 10, machine: true, recipes: ['plank'], desc: 'Saws 1 log into 3 planks. Needs power.' },
  workshop: { name: 'Workshop', cat: 'factory', w: 2, h: 2, cost: 1300, power: 6, machine: true, req: 'carpentry', recipes: ['crate', 'chair', 'table'], desc: 'Crafts planks into crates, chairs and tables. Needs power.' },
  depot: { name: 'Trade Depot', cat: 'factory', w: 2, h: 2, cost: 600, desc: 'Sells anything a conveyor brings it. Fills trade contracts first.' },
  steam: { name: 'Steam Engine', cat: 'power', w: 2, h: 2, cost: 1000, gen: 30, machine: true, desc: 'Burns logs to make 30 power. Feed it by conveyor or let lumberjacks top it up.' },
  solar: { name: 'Solar Array', cat: 'power', w: 2, h: 2, cost: 900, gen: 12, req: 'solar', desc: 'Up to 12 power in daylight. No fuel.' },
  pole: { name: 'Power Pole', cat: 'power', w: 1, h: 1, cost: 40, range: 6, desc: 'Carries power. Links to poles within 7 tiles and powers machines within 6.' },
};
const TOOLS = {
  belt: { name: 'Conveyor', cost: 12, desc: 'Drag to lay a conveyor. Items travel in the direction you drag. Press R to rotate.' },
  path: { name: 'Dirt Path', cost: 4, desc: 'Drag to lay paths. Staff walk faster on them.' },
  chop: { name: 'Mark for Felling', desc: 'Drag over trees to mark them for lumberjacks. Hold Shift (or toggle) to unmark.' },
  plant: { name: 'Plant Saplings', cost: 6, desc: 'Drag over open ground. Arborists plant a sapling on each marked tile.' },
  bulldoze: { name: 'Bulldoze', desc: 'Remove buildings (half refund), conveyors, paths, stumps or trees (15 each, no logs).' },
  survey: { name: 'Survey', cost: 60, desc: 'Send a survey crew into the unexplored forest.' },
};
const RESEARCH = [
  { id: 'carpentry', name: 'Carpentry', cost: 600, days: 1.5, desc: 'Unlocks the Workshop: planks into crates and chairs.' },
  { id: 'comforts', name: 'Campsite Comforts', cost: 450, days: 1, desc: 'Unlocks cabins and flower beds.' },
  { id: 'birch', name: 'Birch Saplings', cost: 300, days: 1, desc: 'Fast-growing birch for your arborists to plant.' },
  { id: 'pine', name: 'Pine Saplings', cost: 300, days: 1, desc: 'Slow-growing, long-lived pine.' },
  { id: 'rollers', name: 'Greased Rollers', cost: 550, days: 1.5, desc: 'Conveyors run 60% faster.' },
  { id: 'reinforced', name: 'Reinforced Machines', cost: 800, days: 2, desc: 'Machines wear out 40% slower.' },
  { id: 'solar', name: 'Solar Arrays', cost: 1100, days: 2.5, desc: 'Daytime power with no fuel.' },
  { id: 'trade', name: 'Advanced Trade', cost: 900, days: 2, desc: 'Negotiate trade offers and receive more of them.' },
  { id: 'fine', name: 'Fine Furniture', cost: 1400, days: 3, req: 'carpentry', desc: 'Workshop can craft tables.' },
];
const PERSONALITIES = {
  hardworking: { name: 'Hard-working', work: 1.25, desc: 'Works 25% faster.' },
  lazy: { name: 'Lazy', work: 0.8, desc: 'Works 20% slower.' },
  cheerful: { name: 'Cheerful', morale: 15, desc: 'Higher morale.' },
  grumpy: { name: 'Grumpy', morale: -10, desc: 'Lower morale, and brings colleagues down.' },
  thrifty: { name: 'Thrifty', payExp: 0.8, desc: 'Happy with less pay.' },
  greedy: { name: 'Greedy', payExp: 1.3, desc: 'Expects more pay.' },
  insomniac: { name: 'Insomniac', sleep: 0.6, desc: 'Needs less sleep.' },
  nightowl: { name: 'Night Owl', desc: 'Works faster at night, slower by day.' },
  dull: { name: 'Dull', desc: 'Nothing remarkable.' },
  sloppy: { name: 'Sloppy', work: 1.1, wear: 1.5, desc: 'Fast but careless.' },
};
const ROLES = {
  lumberjack: { name: 'Lumberjack', stat: 'Chop Speed', color: 'var(--role-lj)' },
  mechanic: { name: 'Mechanic', stat: 'Repair Rate', color: 'var(--role-me)' },
  arborist: { name: 'Arborist', stat: 'Green Thumb', color: 'var(--role-ar)' },
};
const FIRST = ['Ada', 'Bram', 'Cora', 'Dov', 'Elin', 'Fern', 'Gus', 'Hal', 'Ines', 'Juno', 'Kit', 'Lars', 'Mae', 'Nils', 'Odette', 'Pip', 'Quinn', 'Rosa', 'Sol', 'Tove', 'Uma', 'Vic', 'Wren', 'Yara', 'Zane', 'Arlo', 'Bea', 'Cyrus', 'Dagny', 'Emeka', 'Femi', 'Hana', 'Ivo', 'Jin', 'Kaia', 'Leif', 'Mira', 'Noor', 'Oren', 'Priya', 'Rafe', 'Saoirse', 'Teo', 'Ottilie', 'Marek', 'Ines', 'Bodhi'];
const LAST = ['Ashby', 'Birchall', 'Cobb', 'Dunmore', 'Ellery', 'Fairweather', 'Glenn', 'Hollis', 'Ingram', 'Juniper', 'Kettle', 'Larkin', 'Moss', 'Nettles', 'Oakes', 'Pike', 'Quarry', 'Rowan', 'Sawyer', 'Thorne', 'Underwood', 'Vale', 'Woodruff', 'Yarrow', 'Bramble', 'Hazel', 'Linden', 'Fell', 'Holt', 'Stack', 'Marsh', 'Crane'];
const COMPANIES = ['Carvewell Furniture', 'Hollowbrook Builders', 'Tinder & Twine', 'Northgate Crates', 'Fernside Homes', 'Maple Row Joinery', 'Ridgeway Rail Co.', 'Little Owl Toys'];
const RIVAL = 'Grindstone Timber Co.';
const SECRET_INFO = {
  chest: { name: 'Buried Strongbox' },
  ruin: { name: 'Old Ranger Station' },
  mushrooms: { name: 'Fairy Ring' },
  blueprint: { name: 'Surveyor\'s Cache' },
  ancient: { name: 'The Ancient Oak' },
};

let G = null;

// ---------- helpers ----------
function isNight() { const h = hourOf(); return h < 6 || h >= 20.5; }
function hourOf() { return (G.t % 1440) / 60; }
function dayOf() { return Math.floor(G.t / 1440); }
function daylight() {
  const h = hourOf();
  if (h < 5 || h > 21) return 0;
  if (h < 7) return (h - 5) / 2;
  if (h > 18.5) return 1 - (h - 18.5) / 2.5;
  return 1;
}
function dateParts(day = dayOf()) {
  let m = 8, d = 5 + day, y = 1; // starts 6 September, Year 1
  while (d >= MONTH_DAYS[m]) { d -= MONTH_DAYS[m]; m++; if (m > 11) { m = 0; y++; } }
  return { wd: WEEKDAYS[day % 7], d: d + 1, m: MONTHS[m], y };
}
function dateStr(day) { const p = dateParts(day); return `${p.d} ${p.m}, Year ${p.y}`; }
function has(r) { return G.research.done.includes(r); }
function treeStage(t) {
  if (t.sp === 'ancient') return 'mature';
  if (t.age < 3) return 'sapling';
  if (t.age < 10) return 'young';
  if (t.age < t.maxAge * 0.62) return 'mature';
  return 'old';
}
function treeYield(t) {
  if (t.dead) return 1;
  const st = treeStage(t);
  return st === 'sapling' ? 0 : st === 'young' ? 1 : st === 'mature' ? 2 : 3;
}
function bAt(x, y) { return inMap(x, y) ? G.bmap.get(G.occ[idx(x, y)]) : undefined; }
function isLand(x, y) { return inMap(x, y) && G.tiles[idx(x, y)] !== 0; }
function money(n, x, y) {
  G.money += n;
  if (n > 0) G.stats.revenue += n; else G.stats.spent -= n;
  if (x !== undefined) fxText(x, y, (n > 0 ? '+' : '') + fmt(n), n > 0 ? '#f3c11b' : '#ff8a7a');
}
function spend(n, why) {
  if (G.money < n) { toast(`Not enough money for ${why} (${fmt(n)} needed).`, 'bad'); return false; }
  G.money -= n; G.stats.spent += n; return true;
}
function letter(from, subject, body, kind = 'info') {
  G.letters.unshift({ id: ++G.uid, from, subject, body, day: dayOf(), read: false, kind });
  if (typeof onLetter === 'function') onLetter();
}
function marketPrice(item) { return Math.max(1, ITEMS[item].base * G.market[item].m); }

// ---------- effects (kept in sim so systems can spawn them) ----------
function fxText(tx, ty, text, color) { G.fx.push({ k: 'text', x: isoX(tx, ty), y: isoY(tx, ty) - 18, vy: -9, life: 1.8, text, color }); }
function fxPuff(px, py, col, n = 1, spread = 2) { for (let i = 0; i < n; i++) G.fx.push({ k: 'puff', x: px + rf(-spread, spread), y: py, vx: rf(-2, 2), vy: rf(-9, -5), life: rf(1.2, 2.2), max: 2.2, col }); }
function fxChips(tx, ty) { for (let i = 0; i < 3; i++) G.fx.push({ k: 'chip', x: isoX(tx, ty), y: isoY(tx, ty) - 6, vx: rf(-14, 14), vy: rf(-22, -10), life: 0.6, col: pick(['#d3a873', '#a87d50', '#e5c08f']) }); }

// ---------- world generation ----------
function blankState(seed) {
  const g = {
    seed, t: 6 * 60, speed: 1, money: 3000, uid: 0,
    tiles: new Uint8Array(MAP * MAP), reveal: new Uint8Array(MAP * MAP), occ: new Int32Array(MAP * MAP),
    tree: new Array(MAP * MAP).fill(null), trees: [], stump: new Uint8Array(MAP * MAP),
    plantMark: new Uint8Array(MAP * MAP), belt: new Array(MAP * MAP).fill(null), belts: [],
    buildings: [], bmap: new Map(), workers: [], candidates: [], secrets: [],
    letters: [], offers: [], contracts: [], fx: [], wires: [], nets: [],
    research: { done: [], active: null },
    market: {}, rep: 0, plantSpecies: 'spruce',
    policy: { autoChop: true, chopRadius: 14, replant: true, explore: true },
    stats: { logsCut: 0, made: {}, sold: {}, revenue: 0, spent: 0, planted: 0, secrets: 0, contracts: 0, history: [] },
    goals: [], dirty: { x0: 0, y0: 0, x1: MAP - 1, y1: MAP - 1 }, powerDirty: true, frame: 0, lastDay: 0,
    initialForest: 0, health: 100, warned: 100, rivalFlood: null, lowCash: 0, reserved: new Set(),
    hq: null, candDay: 0, fileSavedAt: null, autoSavedAt: null,
  };
  for (const k of Object.keys(ITEMS)) g.market[k] = { m: 1, phase: rand() * 6.28, hist: [] };
  return g;
}
function newGame(seed) {
  rand = makeRng(seed);
  G = blankState(seed);
  const S = seed % 10000;
  // island shape
  const c = MAP / 2;
  for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) {
    const wx = x + (fbm(x * 0.05, y * 0.05, S + 3) - 0.5) * 18, wy = y + (fbm(x * 0.05, y * 0.05, S + 4) - 0.5) * 18;
    const d = Math.hypot(wx - c, wy - c) / (MAP * 0.47);
    const h = fbm(x * 0.07, y * 0.07, S) * 0.55 + 0.62 - d * d * 0.95;
    let land = h > 0.42;
    // a few inland lakes
    if (land && fbm(x * 0.09 + 40, y * 0.09 + 40, S + 9) > 0.7 && Math.hypot(x - c, y - c) > 9) land = false;
    if (x < 2 || y < 2 || x >= MAP - 2 || y >= MAP - 2) land = false;
    G.tiles[idx(x, y)] = land ? 1 : 0;
  }
  // make sure the camp clearing is land
  for (let y = -7; y <= 7; y++) for (let x = -7; x <= 7; x++) if (x * x + y * y <= 52) G.tiles[idx(c + x, c + y)] = 1;
  // remove tiny islands not connected to the main land
  const seen = new Uint8Array(MAP * MAP), q = [idx(c, c)]; seen[q[0]] = 1;
  while (q.length) { const i = q.pop(), x = i % MAP, y = (i / MAP) | 0; for (let d = 0; d < 4; d++) { const nx = x + DX[d], ny = y + DY[d]; if (inMap(nx, ny) && !seen[idx(nx, ny)] && G.tiles[idx(nx, ny)]) { seen[idx(nx, ny)] = 1; q.push(idx(nx, ny)); } } }
  for (let i = 0; i < MAP * MAP; i++) if (!seen[i]) G.tiles[i] = 0;

  // forest
  for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) {
    if (!G.tiles[idx(x, y)]) continue;
    const dc = Math.hypot(x - c, y - c);
    if (dc < 5.5) continue;
    const dens = fbm(x * 0.09, y * 0.09, S + 5);
    let p = clamp((dens - 0.3) * 2.4, 0.08, 0.86);
    if (dc < 9) p *= (dc - 5.5) / 3.5 * 0.6;
    if (!chance(p)) continue;
    const sn = fbm(x * 0.11, y * 0.11, S + 6), pn = fbm(x * 0.08, y * 0.08, S + 8);
    const sp = sn > 0.6 ? 'maple' : pn > 0.62 ? 'pine' : (chance(0.06) ? 'maple' : 'spruce');
    addTree(x, y, sp, rf(2, TREE_SPECIES[sp].maxAge * 0.85));
  }
  G.initialForest = forestScore();

  // secrets in the unexplored woods
  const kinds = ['chest', 'chest', 'ruin', 'mushrooms', 'blueprint', 'ancient'];
  for (const kind of kinds) {
    for (let tries = 0; tries < 400; tries++) {
      const x = ri(4, MAP - 5), y = ri(4, MAP - 5);
      if (!G.tiles[idx(x, y)] || Math.hypot(x - c, y - c) < 15) continue;
      if (G.secrets.some(s => Math.hypot(s.x - x, s.y - y) < 10)) continue;
      removeTree(x, y);
      const s = { x, y, kind, found: false, done: false };
      if (kind === 'ancient') { for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) removeTree(x + xx, y + yy); const t = addTree(x, y, 'ancient', 999); t.secret = s; }
      G.secrets.push(s);
      break;
    }
  }

  // starting camp
  const hx = c - 1, hy = c - 1;
  placeBuilding('hq', hx, hy, true);
  placeBuilding('tent', hx - 4, hy + 3, true);
  placeBuilding('tent', hx - 4, hy + 5, true);
  placeBuilding('campfire', hx - 3, hy + 2, true);
  placeBuilding('well', hx + 4, hy + 4, true);
  placeBuilding('outhouse', hx + 1, hy + 6, true);
  const pathTiles = [];
  for (let i = -5; i <= 6; i++) pathTiles.push([hx + 1, hy + 3 + Math.max(0, i)], [hx + 1 + i, hy + 4]);
  for (const [x, y] of pathTiles) if (isLand(x, y) && !G.occ[idx(x, y)]) G.tiles[idx(x, y)] = 2;
  G.hq = G.buildings[0];
  revealCircle(c, c, 13);

  for (const role of ['lumberjack', 'lumberjack', 'arborist']) hireWorker(makeCandidate(role, 1), true);
  refreshCandidates();
  for (let i = 0; i < 2; i++) newOffer(true);
  setupGoals();
  letter('Forestry Board', 'Welcome to the valley',
    `Congratulations on your lease of the old mill site.\n\nThe forest here is yours to manage. Fell trees for timber, but replant what you take: we survey the woods every season, and a mill that strips its forest will be fined.\n\nYour crew of three is waiting by the campfire. Mark some trees for felling, set up a Log Drop, and get a sawmill turning.\n\nGood luck.`);
  letter('Mill Ledger', 'How the mill makes money',
    `Lumberjacks carry logs to the nearest Log Drop, Steam Engine or the Mill Office.\n\nLogs left at the office are sold to a passing hauler at a poor price. You earn far more by sawing them into planks and crafting furniture, then sending it by conveyor to a Trade Depot.\n\nTrade companies post contracts in the Trade tab. They pay above market if you deliver on time.`);
  return G;
}

function forestScore() {
  let s = 0;
  for (const t of G.trees) if (!t.dead && t.sp !== 'ancient') { const st = treeStage(t); s += st === 'sapling' ? 0.25 : st === 'young' ? 0.6 : 1; }
  return s;
}
function addTree(x, y, sp, age) {
  const t = { x, y, sp, age, maxAge: TREE_SPECIES[sp].maxAge * rf(0.8, 1.2), v: ri(0, 2), sick: 0, dead: false, fallen: false, deadDays: 0, mark: false, res: 0, shake: 0 };
  G.tree[idx(x, y)] = t; G.trees.push(t);
  return t;
}
function removeTree(x, y) {
  const t = G.tree[idx(x, y)];
  if (!t) return null;
  G.tree[idx(x, y)] = null;
  const i = G.trees.indexOf(t); if (i >= 0) G.trees.splice(i, 1);
  return t;
}
function markDirty(x0, y0, x1, y1) {
  const d = G.dirty;
  if (!d) G.dirty = { x0, y0, x1, y1 };
  else { d.x0 = Math.min(d.x0, x0); d.y0 = Math.min(d.y0, y0); d.x1 = Math.max(d.x1, x1); d.y1 = Math.max(d.y1, y1); }
}
function revealCircle(cx, cy, r) {
  let changed = false;
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(MAP - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(MAP - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > r * r) continue;
    const i = idx(x, y);
    if (!G.reveal[i]) { G.reveal[i] = 1; changed = true; }
  }
  if (changed) {
    markDirty(x0 - 1, y0 - 1, x1 + 1, y1 + 1);
    for (const s of G.secrets) if (!s.found && G.reveal[idx(s.x, s.y)]) discoverSecret(s);
  }
}

// ---------- secrets ----------
function discoverSecret(s) {
  s.found = true;
  sfx('secret', s.x + 0.5, s.y + 0.5);
  if (s.kind === 'ancient') {
    s.done = true; G.stats.secrets++;
    letter('Forestry Board', 'You found the Ancient Oak',
      `Your crew has come across an oak older than any record we hold. Trees near it seed twice as readily.\n\nIt cannot be felled. Please keep it that way.`, 'good');
    toast('Secret found: the Ancient Oak!', 'good');
  } else toast(`Something glints in the forest: ${SECRET_INFO[s.kind].name}. Click it to investigate.`, 'good');
}
function collectSecret(s) {
  if (s.done) return;
  s.done = true; G.stats.secrets++;
  sfx('secret');
  if (s.kind === 'chest') {
    const n = ri(350, 800); money(n, s.x, s.y);
    letter('Mill Ledger', 'A buried strongbox', `Your crew prised open a rusted strongbox and found ${fmt(n)} in old coins. Finders keepers.`, 'good');
  } else if (s.kind === 'ruin') {
    const n = ri(200, 400); money(n, s.x, s.y);
    revealCircle(s.x, s.y, 9);
    letter('Mill Ledger', 'The old ranger station', `Inside the ruined ranger station: a hand-drawn map of the surrounding woods, and ${fmt(n)} worth of salvageable tools.`, 'good');
  } else if (s.kind === 'mushrooms') {
    for (const w of G.workers) w.mood.morale = Math.min(100, w.mood.morale + 25);
    letter('Mill Ledger', 'A fairy ring', `A perfect ring of mushrooms. The crew can't stop talking about it. Everyone's morale is up.`, 'good');
  } else if (s.kind === 'blueprint') {
    const left = RESEARCH.filter(r => !has(r.id) && (!r.req || has(r.req)) && (!G.research.active || G.research.active.id !== r.id));
    if (left.length) {
      const r = pick(left); G.research.done.push(r.id);
      letter('Mill Ledger', 'A surveyor\'s cache', `A waterproof tin holding old plans. Your foreman says they explain ${r.name} perfectly. Research complete: ${r.name}.`, 'good');
    } else money(500, s.x, s.y);
  }
  toast(`${SECRET_INFO[s.kind].name} investigated.`, 'good');
}

// ---------- buildings ----------
function canPlace(type, x, y) {
  const d = BDEF[type];
  if (d.req && !has(d.req)) return 'Needs research';
  for (let j = 0; j < d.h; j++) for (let i = 0; i < d.w; i++) {
    const tx = x + i, ty = y + j;
    if (!inMap(tx, ty)) return 'Off the map';
    const k = idx(tx, ty);
    if (!G.reveal[k]) return 'Unexplored';
    if (!G.tiles[k]) return 'Water';
    if (G.occ[k]) return 'Occupied';
    if (G.belt[k]) return 'Conveyor in the way';
    const t = G.tree[k];
    if (t) return 'Trees in the way';
    if (G.secrets.some(s => !s.done && s.x === tx && s.y === ty)) return 'Something is here';
  }
  return null;
}
function placeBuilding(type, x, y, free = false) {
  const d = BDEF[type];
  if (!free) {
    const why = canPlace(type, x, y);
    if (why) { toast(why, 'bad'); return null; }
    if (!spend(d.cost, d.name)) return null;
  }
  const b = addBuilding(type, x, y, ++G.uid);
  if (type === 'steam') b.fuel = 4;
  for (let j = 0; j < d.h; j++) for (let i = 0; i < d.w; i++) {
    const k = idx(x + i, y + j); G.stump[k] = 0; G.plantMark[k] = 0;
    if (G.tiles[k] === 2) G.tiles[k] = 1;
  }
  markDirty(x - 1, y - 1, x + d.w, y + d.h);
  if (!free) { fxText(x + d.w / 2, y + d.h / 2, '-' + fmt(d.cost), '#ff8a7a'); sfx('build', x + d.w / 2, y + d.h / 2); }
  return b;
}
// create a building record, claim its tiles and work out the tiles around it
function addBuilding(type, x, y, id) {
  const d = BDEF[type];
  const b = { id, type, x, y, w: d.w, h: d.h, inv: {}, out: [], prog: 0, recipe: d.recipes ? d.recipes[0] : null, dur: 100, broken: false, sat: 0, fuel: 0, stock: 0, res: 0, v: ri(0, 2), outIdx: 0, active: false, made: 0 };
  G.buildings.push(b); G.bmap.set(b.id, b);
  for (let j = 0; j < d.h; j++) for (let i = 0; i < d.w; i++) G.occ[idx(x + i, y + j)] = b.id;
  b.perim = [];
  for (let i = -1; i <= d.w; i++) for (let j = -1; j <= d.h; j++) {
    const inside = i >= 0 && j >= 0 && i < d.w && j < d.h;
    const corner = (i === -1 || i === d.w) && (j === -1 || j === d.h);
    if (!inside && !corner && inMap(x + i, y + j)) b.perim.push([x + i, y + j]);
  }
  G.powerDirty = true;
  return b;
}
function removeBuilding(b) {
  if (b.type === 'hq') { toast('You cannot demolish the Mill Office.', 'bad'); return; }
  for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) G.occ[idx(b.x + i, b.y + j)] = 0;
  G.buildings.splice(G.buildings.indexOf(b), 1); G.bmap.delete(b.id);
  const refund = Math.floor(BDEF[b.type].cost / 2);
  if (refund) money(refund, b.x + b.w / 2, b.y + b.h / 2);
  for (const w of G.workers) if (w.task && w.task.b === b) cancelTask(w);
  markDirty(b.x - 1, b.y - 1, b.x + b.w, b.y + b.h);
  G.powerDirty = true;
}
function bCenter(b) { return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; }
function accepts(b, item) {
  if (b.broken && BDEF[b.type].machine) return false;
  switch (b.type) {
    case 'intake': return item === 'log' && b.stock < 30;
    case 'steam': return item === 'log' && b.fuel < 8;
    case 'sawmill': case 'workshop': { const r = RECIPES[b.recipe]; return !!r && r.in[item] !== undefined && (b.inv[item] || 0) < r.in[item] * 4; }
    case 'depot': return true;
    case 'hq': return item === 'log';
  }
  return false;
}
function receive(b, item, n = 1, from) {
  switch (b.type) {
    case 'intake': b.stock += n; break;
    case 'steam': b.fuel += n; break;
    case 'sawmill': case 'workshop': b.inv[item] = (b.inv[item] || 0) + n; break;
    case 'depot': sellItem(item, n, b); break;
    case 'hq': sellItem('log', n, b, 0.6); break; // haulers pay poorly, but log contracts still count
  }
}
function sellItem(item, n, b, priceFactor = 1) {
  for (const c of G.contracts) {
    if (c.item !== item || c.delivered >= c.qty) continue;
    const k = Math.min(n, c.qty - c.delivered);
    c.delivered += k; n -= k;
    fxText(b.x + 1, b.y + 1, `${c.delivered}/${c.qty}`, '#9fe39a');
    if (c.delivered >= c.qty) completeContract(c);
    if (n <= 0) return;
  }
  const v = marketPrice(item) * n * priceFactor;
  G.stats.sold[item] = (G.stats.sold[item] || 0) + n;
  G.money += v; G.stats.revenue += v;
  b.saleText = (b.saleText || 0) + v;
}

// ---------- conveyors ----------
function placeBelt(x, y, dir) {
  if (!inMap(x, y)) return false;
  const k = idx(x, y);
  const ex = G.belt[k];
  if (ex) { if (ex.dir !== dir) { ex.dir = dir; } return true; }
  if (!G.reveal[k] || !G.tiles[k] || G.occ[k] || G.tree[k]) return false;
  if (!spend(TOOLS.belt.cost, 'a conveyor')) return false;
  const b = { x, y, dir, item: null, p: 0, stamp: 0 };
  G.belt[k] = b; G.belts.push(b); G.stump[k] = 0; G.plantMark[k] = 0;
  sfx('place', x + 0.5, y + 0.5);
  return true;
}
function removeBelt(x, y) {
  const k = idx(x, y), b = G.belt[k];
  if (!b) return;
  G.belt[k] = null; G.belts.splice(G.belts.indexOf(b), 1);
}
function beltSpeed() { return has('rollers') ? 1.9 : 1.2; }
function updateBelts(dt) {
  const sp = beltSpeed() * dt;
  G.frame++;
  for (const b of G.belts) {
    if (!b.item || b.stamp === G.frame) continue;
    b.p = Math.min(1, b.p + sp);
    if (b.p < 1) continue;
    const nx = b.x + DX[b.dir], ny = b.y + DY[b.dir];
    if (!inMap(nx, ny)) continue;
    const nb = G.belt[idx(nx, ny)];
    if (nb) {
      if (!nb.item && (nb.x + DX[nb.dir] !== b.x || nb.y + DY[nb.dir] !== b.y)) {
        nb.item = b.item; nb.p = 0; nb.stamp = G.frame; b.item = null; b.p = 0;
      }
      continue;
    }
    const bd = bAt(nx, ny);
    if (bd && accepts(bd, b.item)) { receive(bd, b.item, 1); b.item = null; b.p = 0; }
  }
}
function pushOut(b, item) { // try to put an item onto an outgoing belt next to building b
  const n = b.perim.length;
  for (let k = 0; k < n; k++) {
    const [x, y] = b.perim[(b.outIdx + k) % n];
    const bl = G.belt[idx(x, y)];
    if (!bl || bl.item) continue;
    const tx = x + DX[bl.dir], ty = y + DY[bl.dir];
    if (G.occ[idx(tx, ty)] === b.id) continue; // points back into us
    bl.item = item; bl.p = 0; bl.stamp = G.frame;
    b.outIdx = (b.outIdx + k + 1) % n;
    return true;
  }
  return false;
}

// ---------- power ----------
function recomputePower() {
  G.powerDirty = false;
  const nodes = G.buildings.filter(b => b.type === 'pole' || b.type === 'steam' || b.type === 'solar');
  const parent = new Map(nodes.map(n => [n.id, n.id]));
  const find = (a) => { while (parent.get(a) !== a) { parent.set(a, parent.get(parent.get(a))); a = parent.get(a); } return a; };
  G.wires = [];
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j];
    if (a.type !== 'pole' && b.type !== 'pole') continue;
    const ca = bCenter(a), cb = bCenter(b);
    if (dist(ca.x, ca.y, cb.x, cb.y) <= 7.5) { parent.set(find(a.id), find(b.id)); G.wires.push([a, b]); }
  }
  const nets = new Map();
  for (const n of nodes) { const r = find(n.id); if (!nets.has(r)) nets.set(r, { sources: [], consumers: [], poles: [] }); const net = nets.get(r); (n.type === 'pole' ? net.poles : net.sources).push(n); n.net = net; }
  for (const b of G.buildings) {
    if (!BDEF[b.type].power) continue;
    b.net = null;
    const cb = bCenter(b);
    let best = null, bd = 1e9;
    for (const n of nodes) {
      const cn = bCenter(n), d = dist(cb.x, cb.y, cn.x, cn.y);
      const range = n.type === 'pole' ? 6.5 : 3.2;
      if (d <= range && d < bd) { bd = d; best = n; }
    }
    if (best) { b.net = best.net; best.net.consumers.push(b); if (best.type === 'pole') G.wires.push([best, b]); }
  }
  G.nets = [...nets.values()];
}
function updatePower(dt) {
  if (G.powerDirty) recomputePower();
  const dl = daylight();
  for (const net of G.nets) {
    let supply = 0, demand = 0;
    for (const s of net.sources) {
      s.gen = 0;
      if (s.broken) continue;
      if (s.type === 'steam' && s.fuel > 0) s.gen = BDEF.steam.gen;
      if (s.type === 'solar') s.gen = BDEF.solar.gen * dl;
      supply += s.gen;
    }
    for (const c of net.consumers) if (c.wants) demand += BDEF[c.type].power;
    const sat = demand > 0 ? Math.min(1, supply / demand) : (supply > 0 ? 1 : 0);
    net.supply = supply; net.demand = demand; net.sat = sat;
    for (const c of net.consumers) c.sat = sat;
    // burn fuel in proportion to load
    const load = supply > 0 ? Math.min(1, demand / supply) : 0;
    for (const s of net.sources) if (s.type === 'steam' && s.gen > 0) {
      s.burn = (s.burn || 0) + dt * (0.15 + load * 0.85) / 30;
      s.active = load > 0;
      if (s.burn >= 1) { s.burn -= 1; s.fuel--; }
      if (load > 0) wear(s, dt * 0.25);
    }
  }
  for (const b of G.buildings) if (BDEF[b.type].power && !b.net) b.sat = 0;
}
function wear(b, amt) {
  if (has('reinforced')) amt *= 0.6;
  b.dur = Math.max(0, b.dur - amt);
  if (!b.broken && (b.dur <= 0 || (b.dur < 25 && chance(0.0008)))) {
    b.broken = true;
    sfx('clank', b.x + b.w / 2, b.y + b.h / 2);
    toast(`${BDEF[b.type].name} has broken down. A mechanic needs to fix it.`, 'bad');
    if (!G.workers.some(w => w.role === 'mechanic')) letter('Mill Ledger', `Your ${BDEF[b.type].name.toLowerCase()} broke down`, `The machine has seized up and nobody on site knows how to fix it. Hire a Mechanic from the Staff tab, and they'll keep your machines running.`, 'bad');
  }
}

// ---------- machines ----------
function updateMachines(dt) {
  for (const b of G.buildings) {
    if (b.type === 'sawmill' || b.type === 'workshop') {
      const r = RECIPES[b.recipe];
      const hasIn = r && Object.entries(r.in).every(([k, n]) => (b.inv[k] || 0) >= n);
      b.wants = hasIn && b.out.length < 6 && !b.broken;
      b.active = b.wants && b.sat > 0;
      if (b.active) {
        b.prog += dt * b.sat / r.time;
        wear(b, dt * 0.9);
        if (b.prog >= 1) {
          b.prog = 0;
          for (const [k, n] of Object.entries(r.in)) b.inv[k] -= n;
          for (let i = 0; i < r.n; i++) b.out.push(r.out);
          G.stats.made[r.out] = (G.stats.made[r.out] || 0) + r.n;
          b.made += r.n;
        }
      }
    }
    if (b.type === 'intake' && b.stock > 0) { if (pushOut(b, 'log')) b.stock--; }
    if (b.out.length && pushOut(b, b.out[0])) b.out.shift();
    if (b.saleText && (b.saleT = (b.saleT || 0) + dt) > 1.2) { fxText(b.x + 1, b.y + 1, '+' + fmt(b.saleText), '#f3c11b'); sfx('coin', b.x + 1, b.y + 1); b.saleText = 0; b.saleT = 0; }
  }
}

// ---------- pathfinding ----------
function passable(x, y) {
  if (!inMap(x, y)) return false;
  const k = idx(x, y);
  return G.tiles[k] !== 0 && !G.occ[k];
}
function tileCost(x, y) {
  const k = idx(x, y);
  if (G.tiles[k] === 2) return 0.6;
  const t = G.tree[k];
  if (t && !t.dead && t.age > 3) return 1.7;
  if (G.belt[k]) return 1.4;
  return 1;
}
function findPath(sx, sy, tx, ty, maxNodes = 6000) {
  sx |= 0; sy |= 0;
  if (sx === tx && sy === ty) return [];
  if (!passable(tx, ty)) return null;
  const N = MAP * MAP, g = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const heap = [];
  const push = (i, f) => { heap.push([f, i]); let n = heap.length - 1; while (n > 0) { const p = (n - 1) >> 1; if (heap[p][0] <= heap[n][0]) break;[heap[p], heap[n]] = [heap[n], heap[p]]; n = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let n = 0; for (;;) { const l = n * 2 + 1, r = l + 1; let m = n; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === n) break;[heap[m], heap[n]] = [heap[n], heap[m]]; n = m; } } return top; };
  const s = idx(sx, sy), goal = idx(tx, ty);
  g[s] = 0; push(s, 0);
  let count = 0;
  while (heap.length && count++ < maxNodes) {
    const [, i] = pop();
    if (i === goal) break;
    if (closed[i]) continue;
    closed[i] = 1;
    const x = i % MAP, y = (i / MAP) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (!passable(nx, ny)) continue;
      if (dx && dy && (!passable(x + dx, y) || !passable(x, y + dy))) continue;
      const ni = idx(nx, ny);
      const ng = g[i] + tileCost(nx, ny) * (dx && dy ? 1.414 : 1);
      if (ng < g[ni]) { g[ni] = ng; from[ni] = i; push(ni, ng + Math.hypot(tx - nx, ty - ny) * 0.6); }
    }
  }
  if (from[goal] < 0) return null;
  const path = [];
  for (let i = goal; i !== s; i = from[i]) path.push([i % MAP, (i / MAP) | 0]);
  return path.reverse();
}
function nearestStand(b, wx, wy) { // passable tile next to building b nearest to (wx,wy)
  let best = null, bd = 1e9;
  for (const [x, y] of b.perim) if (passable(x, y)) { const d = dist(x, y, wx, wy); if (d < bd) { bd = d; best = [x, y]; } }
  return best;
}

// ---------- staff ----------
function makeAppearance(role) {
  return {
    role, skin: pick(SKIN), hair: pick(HAIR), style: ri(0, 5), beard: chance(0.3),
    hat: pick(['#c9483a', '#3f6fae', '#d8a33a', '#4f8a46', '#6b4a8a']),
    shirt: pick(SHIRTS[role]), pants: pick(['#3b3f5c', '#4a3b2f', '#2f3a33', '#5a4a3a']),
  };
}
function makeCandidate(role, levelCap = 4) {
  role = role || pick(['lumberjack', 'lumberjack', 'mechanic', 'arborist']);
  const level = Math.min(levelCap, chance(0.15) ? ri(3, 4) : ri(1, 2));
  const pers = pick(Object.keys(PERSONALITIES));
  const P_ = PERSONALITIES[pers];
  const expected = 45 + level * 15;
  const pay = Math.round(expected * (P_.payExp || 1) * rf(0.95, 1.08));
  return {
    id: ++G.uid, name: `${pick(FIRST)} ${pick(LAST)}`, role, pers, level, pay,
    skill: +(0.75 + level * 0.18 + rf(0, 0.15)).toFixed(2), ap: makeAppearance(role),
  };
}
function refreshCandidates() {
  G.candidates = [];
  const roles = ['lumberjack', 'mechanic', 'arborist', null, null];
  for (const r of roles) G.candidates.push(makeCandidate(r));
  G.candDay = dayOf();
}
function hireWorker(c, free = false) {
  const hq = G.hq;
  const w = {
    ...c, x: 0, y: 0, path: null, pi: 0, state: 'idle', task: null, timer: 0, carry: null,
    needs: { energy: rf(70, 95), hydration: rf(60, 95), bladder: rf(0, 30) },
    mood: { overall: 70, physical: 80, mental: 65, pay: 60, morale: 65, colleagues: 70 },
    low: 0, rogue: false, thought: 'Just arrived. Nice trees.', frames: makeWorkerFrames(c.ap), anim: 0, back: false, flip: false,
    cool: rf(0, 1), lastTile: -1, home: null, xp: XP_FOR_LEVEL[c.level] || 0, hidden: false,
  };
  if (hq) { const s = nearestStand(hq, hq.x + 1, hq.y + 4) || [hq.x + 1, hq.y + 3]; w.x = s[0] + 0.5; w.y = s[1] + 0.5; }
  G.workers.push(w);
  if (!free) { toast(`${w.name} joined as a ${ROLES[w.role].name}.`, 'good'); }
  return w;
}
// experience: staff level up with work, get better at it, and expect better pay
const XP_FOR_LEVEL = [0, 0, 14, 36, 66, 110];
function xpProgress(w) {
  if (w.level >= 5) return 1;
  const lo = XP_FOR_LEVEL[w.level], hi = XP_FOR_LEVEL[w.level + 1];
  return clamp((w.xp - lo) / (hi - lo), 0, 1);
}
function gainXp(w, n) {
  w.xp += n;
  if (w.level < 5 && w.xp < XP_FOR_LEVEL[w.level]) w.xp = XP_FOR_LEVEL[w.level]; // hires arrive with their level's experience
  while (w.level < 5 && w.xp >= XP_FOR_LEVEL[w.level + 1]) {
    w.level++; w.skill = +(w.skill + 0.12).toFixed(2);
    w.mood.morale = Math.min(100, w.mood.morale + 10);
    w.thought = 'I\'m getting good at this. A raise would be nice.';
    fxText(w.x, w.y, 'Level up!', '#9fe39a');
    toast(`${w.name} reached level ${w.level}. They work faster, and will expect better pay.`, 'good');
    sfx('level');
  }
}
function fireWorker(w) {
  cancelTask(w);
  G.workers.splice(G.workers.indexOf(w), 1);
  for (const o of G.workers) o.mood.morale = Math.max(0, o.mood.morale - 4);
}
function cancelTask(w) {
  if (w.task) {
    if (w.task.tree) w.task.tree.res = 0;
    if (w.task.b && w.task.b.res === w.id) w.task.b.res = 0;
    if (w.task.tile !== undefined) G.reserved.delete(w.task.tile);
  }
  w.task = null; w.path = null; w.state = 'idle'; w.hidden = false;
}
function workSpeed(w) {
  const p = PERSONALITIES[w.pers];
  let s = (p.work || 1) * w.skill * (0.55 + w.mood.overall / 100 * 0.65);
  if (w.pers === 'nightowl') s *= isNight() ? 1.3 : 0.9;
  if (w.rogue) s *= 0.4;
  return s;
}
function walkTo(w, tx, ty, task) {
  const p = findPath(Math.floor(w.x), Math.floor(w.y), tx, ty);
  if (!p) return false;
  w.path = p; w.pi = 0; w.state = 'walk'; w.task = task;
  return true;
}
function nearestBuilding(w, types, filter) {
  let best = null, bd = 1e9;
  for (const b of G.buildings) {
    if (!types.includes(b.type) || (filter && !filter(b))) continue;
    const c = bCenter(b), d = dist(c.x, c.y, w.x, w.y);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}
function goToBuilding(w, b, task) {
  const s = nearestStand(b, w.x, w.y);
  if (!s) return false;
  task.b = b;
  return walkTo(w, s[0], s[1], task);
}

function think(w) {
  const n = w.needs;
  // needs come first
  if (n.bladder > 82) {
    const o = nearestBuilding(w, ['outhouse']);
    if (o && goToBuilding(w, o, { type: 'use', what: 'outhouse', time: 2 })) { w.thought = 'Nature calls.'; return; }
    n.bladder = 0; w.mood.morale -= 6; w.thought = 'No outhouse. Off into the bushes, then.'; return;
  }
  if (n.hydration < 25) {
    const o = nearestBuilding(w, ['well']);
    if (o && goToBuilding(w, o, { type: 'use', what: 'well', time: 2.5 })) { w.thought = 'I could really use a drink.'; return; }
    n.hydration = 60; w.mood.morale -= 6; w.thought = 'No well here. Pond water it is.'; return;
  }
  const sleepy = n.energy < 15 || (isNight() && n.energy < (PERSONALITIES[w.pers].sleep ? 35 : 70));
  if (sleepy) {
    let bed = w.home && G.bmap.get(w.home);
    if (!bed) {
      bed = nearestBuilding(w, ['tent', 'cabin'], b => G.workers.filter(o => o.home === b.id).length < BDEF[b.type].beds);
      if (bed) w.home = bed.id;
    }
    if (bed && goToBuilding(w, bed, { type: 'sleep', bed: true })) { w.thought = 'Time to turn in.'; return; }
    const fire = nearestBuilding(w, ['campfire']) || G.hq;
    if (goToBuilding(w, fire, { type: 'sleep', bed: false })) { w.thought = 'No bed for me. Sleeping under the stars.'; return; }
  }
  if (w.rogue && chance(0.5)) { w.state = 'act'; w.task = { type: 'slack', time: rf(4, 8) }; w.timer = w.task.time; w.thought = pick(['Why should I bother?', 'They don\'t pay me enough for this.', 'I\'m on a break. A long one.']); return; }
  if (w.role === 'lumberjack' && thinkLumberjack(w)) return;
  if (w.role === 'mechanic' && thinkMechanic(w)) return;
  if (w.role === 'arborist' && thinkArborist(w)) return;
  // idle: drift towards the campfire in the evening, otherwise mill about
  const evening = hourOf() > 18 || hourOf() < 6;
  const spot = evening ? nearestBuilding(w, ['campfire']) : null;
  const base = spot || G.hq;
  const c = bCenter(base);
  for (let k = 0; k < 8; k++) {
    const tx = Math.floor(c.x + rf(-3.5, 3.5)), ty = Math.floor(c.y + rf(-3.5, 3.5));
    if (passable(tx, ty) && walkTo(w, tx, ty, { type: 'idle', time: rf(2, 5) })) break;
  }
  w.thought = evening ? pick(['Nice night for a fire.', 'Anyone got a story?', 'Smells like pine smoke.']) : pick(['Nothing to do right now.', 'Waiting for orders.', 'Lovely day for it.']);
  if (!w.path) { w.state = 'act'; w.task = { type: 'idle', time: 2 }; w.timer = 2; }
}

function thinkLumberjack(w) {
  // fell another tree close by before the long walk back, up to an armful of 4 logs
  if (w.carry && w.carry.n < 4) {
    let near = null, nd = 4.5;
    for (const t of G.trees) {
      if (t.res || t.sp === 'ancient' || t.unreach === dayOf()) continue;
      const d = dist(t.x, t.y, w.x, w.y);
      if (d >= nd) continue;
      const st = treeStage(t);
      if (t.mark || (G.policy.autoChop && (t.dead || st === 'mature' || st === 'old') && dist(t.x, t.y, G.hq.x + 1.5, G.hq.y + 1.5) <= G.policy.chopRadius)) { nd = d; near = t; }
    }
    if (near && chopTree(w, near)) return true;
  }
  if (w.carry) {
    const dest = nearestBuilding(w, ['steam'], b => b.fuel < 3 && !b.broken) || nearestBuilding(w, ['intake'], b => b.stock < 30) || G.hq;
    if (goToBuilding(w, dest, { type: 'deliver' })) { w.thought = dest.type === 'hq' ? 'Hauling these to the office. Wish we had a Log Drop.' : `Taking ${w.carry.n} logs to the ${BDEF[dest.type].name}.`; return true; }
    return false;
  }
  const c = bCenter(G.hq);
  let best = null, bs = 1e9;
  for (const t of G.trees) {
    if (t.res || t.sp === 'ancient' || t.unreach === dayOf() || !G.reveal[idx(t.x, t.y)]) continue;
    const d = dist(t.x, t.y, w.x, w.y);
    let score;
    if (t.mark) score = d - 100;
    else if (G.policy.autoChop) {
      if (dist(t.x, t.y, c.x, c.y) > G.policy.chopRadius) continue;
      const st = treeStage(t);
      if (!t.dead && st !== 'mature' && st !== 'old') continue;
      score = d - (t.dead ? 10 : st === 'old' ? 6 : 0);
    } else continue;
    if (score < bs) { bs = score; best = t; }
  }
  if (!best) { w.thought = G.policy.autoChop ? 'No grown trees near camp. Mark some for me?' : 'Mark some trees and I\'ll fell them.'; return false; }
  return chopTree(w, best);
}
function chopTree(w, best) {
  // stand on a free tile next to the tree
  let stand = null, sd = 1e9;
  for (let d = 0; d < 8; d++) {
    const ax = best.x + [1, 0, -1, 0, 1, 1, -1, -1][d], ay = best.y + [0, 1, 0, -1, 1, -1, 1, -1][d];
    if (passable(ax, ay)) { const dd = dist(ax, ay, w.x, w.y) + (G.tree[idx(ax, ay)] ? 1.5 : 0); if (dd < sd) { sd = dd; stand = [ax, ay]; } }
  }
  if (!stand) { best.unreach = dayOf(); return false; }
  best.res = w.id;
  if (walkTo(w, stand[0], stand[1], { type: 'chop', tree: best })) { w.thought = best.dead ? 'Clearing out deadwood.' : `That ${TREE_SPECIES[best.sp].name.toLowerCase()} looks ready.`; return true; }
  best.res = 0;
  return false;
}
function thinkMechanic(w) {
  let best = null, bs = 1e9;
  for (const b of G.buildings) {
    if (!BDEF[b.type].machine || (b.res && b.res !== w.id)) continue;
    if (!b.broken && b.dur > 60) continue;
    const c = bCenter(b), s = dist(c.x, c.y, w.x, w.y) - (b.broken ? 50 : 0) + b.dur * 0.3;
    if (s < bs) { bs = s; best = b; }
  }
  if (!best) { w.thought = 'All machines humming along.'; return false; }
  best.res = w.id;
  if (goToBuilding(w, best, { type: 'repair' })) { w.thought = best.broken ? `The ${BDEF[best.type].name.toLowerCase()} is down. On it.` : `The ${BDEF[best.type].name.toLowerCase()} needs some oil.`; return true; }
  best.res = 0;
  return false;
}
function plantable(x, y) {
  if (!inMap(x, y)) return false;
  const k = idx(x, y);
  return G.tiles[k] === 1 && !G.occ[k] && !G.tree[k] && !G.belt[k] && !G.stump[k] && !G.secrets.some(s => !s.done && s.x === x && s.y === y);
}
function thinkArborist(w) {
  // 1. treat sick trees
  let best = null, bs = 1e9;
  for (const t of G.trees) {
    if (!t.sick || t.dead || t.res || !G.reveal[idx(t.x, t.y)]) continue;
    const d = dist(t.x, t.y, w.x, w.y); if (d < bs) { bs = d; best = t; }
  }
  if (best) {
    best.res = w.id;
    if (walkTo(w, best.x, best.y, { type: 'treat', tree: best }) || walkNear(w, best.x, best.y, { type: 'treat', tree: best })) { w.thought = 'That tree has blight. I can save it.'; return true; }
    best.res = 0;
  }
  // 2. planting: marked tiles, then fresh stumps near camp
  let tile = null; bs = 1e9;
  const c = bCenter(G.hq);
  for (let k = 0; k < MAP * MAP; k++) {
    if (G.reserved.has(k)) continue;
    const x = k % MAP, y = (k / MAP) | 0;
    let s;
    if (G.plantMark[k]) { if (!plantable(x, y)) { G.plantMark[k] = 0; continue; } s = dist(x, y, w.x, w.y) - 60; }
    else if (G.policy.replant && G.stump[k] && G.tiles[k] === 1 && !G.occ[k] && !G.tree[k] && !G.belt[k] && dist(x, y, c.x, c.y) < G.policy.chopRadius + 4) s = dist(x, y, w.x, w.y);
    else continue;
    if (s < bs) { bs = s; tile = k; }
  }
  if (tile !== null) {
    const x = tile % MAP, y = (tile / MAP) | 0;
    G.reserved.add(tile);
    if (walkTo(w, x, y, { type: 'plant', tile })) { w.thought = 'Every stump deserves a successor.'; return true; }
    G.reserved.delete(tile);
  }
  // 3. explore the edge of the known forest
  if (G.policy.explore && chance(0.6)) {
    for (let k = 0; k < 30; k++) {
      const x = ri(2, MAP - 3), y = ri(2, MAP - 3);
      if (!passable(x, y) || !G.reveal[idx(x, y)] || dist(x, y, c.x, c.y) > 30) continue;
      let edge = false;
      for (let d = 0; d < 4 && !edge; d++) { const ex = x + DX[d] * 3, ey = y + DY[d] * 3; if (inMap(ex, ey) && !G.reveal[idx(ex, ey)] && G.tiles[idx(ex, ey)]) edge = true; }
      if (!edge) continue;
      if (walkTo(w, x, y, { type: 'idle', time: 1.5 })) { w.thought = 'Let\'s see what\'s out this way.'; return true; }
    }
  }
  return false;
}
function walkNear(w, x, y, task) {
  for (let d = 0; d < 8; d++) {
    const ax = x + [1, 0, -1, 0, 1, 1, -1, -1][d], ay = y + [0, 1, 0, -1, 1, -1, 1, -1][d];
    if (passable(ax, ay) && walkTo(w, ax, ay, task)) return true;
  }
  return false;
}

function arrive(w) {
  const t = w.task;
  if (!t) { w.state = 'idle'; return; }
  w.state = 'act';
  switch (t.type) {
    case 'use': w.timer = t.time; break;
    case 'sleep': w.timer = 0; w.state = 'sleep'; w.hidden = t.bed; w.thought = 'Zzz...'; break;
    case 'deliver': w.timer = 0.6; break;
    case 'chop': {
      if (!G.tree[idx(t.tree.x, t.tree.y)] || G.tree[idx(t.tree.x, t.tree.y)] !== t.tree) { cancelTask(w); return; }
      const base = t.tree.dead ? 2.2 : 3 + treeYield(t.tree) * 0.8;
      w.timer = base / workSpeed(w); t.total = w.timer;
      break;
    }
    case 'repair': w.timer = 0.1; break;
    case 'treat': w.timer = 4 / workSpeed(w); break;
    case 'plant': w.timer = 2.5 / workSpeed(w); break;
    case 'idle': w.timer = t.time || 2; break;
    default: w.timer = 1;
  }
}
function finishAct(w) {
  const t = w.task;
  switch (t && t.type) {
    case 'use':
      if (t.what === 'well') w.needs.hydration = 100;
      else w.needs.bladder = 0;
      break;
    case 'deliver': {
      const b = t.b;
      if (b && G.bmap.has(b.id) && w.carry) {
        let n = w.carry.n;
        while (n > 0 && accepts(b, 'log')) { receive(b, 'log', 1); n--; }
        if (n > 0 && b.type !== 'hq') { w.carry.n = n; break; }
        w.carry = null;
      }
      break;
    }
    case 'chop': {
      const tr = t.tree;
      if (G.tree[idx(tr.x, tr.y)] === tr) {
        const n = treeYield(tr);
        removeTree(tr.x, tr.y);
        G.stump[idx(tr.x, tr.y)] = tr.dead ? 0 : 1;
        if (n > 0) { w.carry = { type: 'log', n: (w.carry ? w.carry.n : 0) + n }; G.stats.logsCut += n; }
        for (let i = 0; i < 6; i++) fxChips(tr.x + 0.5, tr.y + 0.5);
        if (!tr.dead) sfx('fall', tr.x + 0.5, tr.y + 0.5);
        gainXp(w, 1);
      }
      break;
    }
    case 'treat': if (t.tree && !t.tree.dead) { t.tree.sick = 0; fxText(t.tree.x + 0.5, t.tree.y + 0.5, 'Cured', '#9fe39a'); gainXp(w, 2); } t.tree && (t.tree.res = 0); break;
    case 'plant': {
      const x = t.tile % MAP, y = (t.tile / MAP) | 0;
      G.reserved.delete(t.tile);
      G.stump[t.tile] = 0;
      if (plantable(x, y) && G.money >= TOOLS.plant.cost) {
        G.money -= TOOLS.plant.cost; G.stats.spent += TOOLS.plant.cost;
        addTree(x, y, G.plantSpecies, 0.2); G.plantMark[t.tile] = 0; G.stats.planted++; gainXp(w, 1); sfx('plant', x + 0.5, y + 0.5);
        markDirty(x, y, x, y);
      }
      break;
    }
  }
  w.task = null; w.state = 'idle'; w.cool = rf(0.2, 0.8);
}

function updateWorker(w, dt) {
  const n = w.needs, P_ = PERSONALITIES[w.pers];
  const hours = dt * MIN_PER_SEC / 60;
  if (w.state !== 'sleep') n.energy -= hours * 3.6 * (P_.sleep || 1);
  n.hydration -= hours * 3.5; n.bladder += hours * 4;
  n.energy = clamp(n.energy, 0, 100); n.hydration = clamp(n.hydration, 0, 100); n.bladder = clamp(n.bladder, 0, 100);

  if (w.state === 'idle') { w.cool -= dt; if (w.cool <= 0) think(w); }
  else if (w.state === 'walk') stepWalk(w, dt);
  else if (w.state === 'act') {
    const t = w.task;
    if (t && t.type === 'chop') {
      const tr = t.tree;
      if (G.tree[idx(tr.x, tr.y)] !== tr) { cancelTask(w); return; }
      tr.shake = 0.15;
      w.swing = (w.swing || 0) + dt;
      if (w.swing > 0.62) { w.swing = 0; sfx('chop', tr.x + 0.5, tr.y + 0.5); }
      w.flip = isoX(tr.x + 0.5, tr.y + 0.5) < isoX(w.x, w.y); w.back = (tr.x + tr.y) < (w.x + w.y - 1);
      if (Math.random() < dt * 3) fxChips(tr.x + 0.5, tr.y + 0.5);
    }
    if (t && t.type === 'repair') {
      const b = t.b;
      if (!G.bmap.has(b.id)) { cancelTask(w); return; }
      b.dur = Math.min(100, b.dur + dt * 14 * workSpeed(w) / (P_.wear || 1));
      if (Math.random() < dt * 2) G.fx.push({ k: 'spark', x: isoX(w.x, w.y) + rf(-4, 4), y: isoY(w.x, w.y) - 10, vx: rf(-10, 10), vy: rf(-20, -8), life: 0.4 });
      if (b.dur >= 100) { b.broken = false; b.res = 0; w.thought = 'Good as new.'; w.task = null; w.state = 'idle'; w.cool = 0.5; gainXp(w, 3); }
      return;
    }
    w.timer -= dt;
    if (w.timer <= 0) finishAct(w);
  } else if (w.state === 'sleep') {
    const rate = w.task && w.task.bed ? (G.bmap.get(w.home) && G.bmap.get(w.home).type === 'cabin' ? 16 : 12) : 7;
    n.energy = Math.min(100, n.energy + hours * rate);
    if (Math.random() < dt * 0.6) G.fx.push({ k: 'z', x: isoX(w.x, w.y) + 3, y: isoY(w.x, w.y) - 14, vx: 3, vy: -6, life: 1.6 });
    const h = hourOf();
    if (n.energy >= 99 || (n.energy > 60 && h > 6.5 && h < 19) || n.hydration < 10 || n.bladder > 92) {
      if (!(w.task && w.task.bed) && w.task) w.mood.morale -= 8;
      w.hidden = false; w.task = null; w.state = 'idle'; w.cool = 0.3; w.thought = 'Morning already?';
    }
  }
}
function stepWalk(w, dt) {
  if (!w.path || w.pi >= w.path.length) { w.path = null; arrive(w); return; }
  const [tx, ty] = w.path[w.pi];
  const gx = tx + 0.5, gy = ty + 0.5;
  const k = idx(Math.floor(w.x), Math.floor(w.y));
  const terrain = G.tiles[k] === 2 ? 1.5 : (G.tree[k] && !G.tree[k].dead ? 0.8 : 1);
  const sp = 2.1 * terrain * (0.8 + w.mood.overall / 100 * 0.35) * dt;
  const dx = gx - w.x, dy = gy - w.y, d = Math.hypot(dx, dy);
  if (!passable(tx, ty)) { cancelTask(w); w.cool = 0.5; return; }
  if (d <= sp) { w.x = gx; w.y = gy; w.pi++; }
  else { w.x += dx / d * sp; w.y += dy / d * sp; }
  w.anim += dt * 8;
  w.back = (dx + dy) < -0.01;
  w.flip = (dx - dy) < 0;
  const nk = idx(Math.floor(w.x), Math.floor(w.y));
  if (nk !== w.lastTile) { w.lastTile = nk; revealCircle(w.x, w.y, 3.5); }
}

function updateMood(w, dt) {
  const n = w.needs, m = w.mood, P_ = PERSONALITIES[w.pers];
  m.physical = (n.energy + n.hydration + (100 - n.bladder)) / 3;
  const expected = (45 + w.level * 15) * (P_.payExp || 1);
  m.pay = clamp(60 + (w.pay / expected - 1) * 220, 0, 100);
  const fires = G.buildings.filter(b => b.type === 'campfire').length;
  const flowers = G.buildings.filter(b => b.type === 'flowers').length;
  const hasBed = w.home && G.bmap.has(w.home);
  const cabin = hasBed && G.bmap.get(w.home).type === 'cabin';
  let target = 58 + (P_.morale || 0) + (fires ? 8 : -4) + Math.min(10, flowers * 2.5) + (hasBed ? (cabin ? 12 : 6) : -14) + (G.health - 85) * 0.35;
  m.morale = clamp(m.morale + (target - m.morale) * dt * 0.02, 0, 100);
  const grumps = G.workers.filter(o => o !== w && o.pers === 'grumpy').length;
  const cheer = G.workers.filter(o => o !== w && o.pers === 'cheerful').length;
  m.colleagues = clamp(72 - grumps * 9 + cheer * 6 + (G.workers.length < 2 ? -15 : 0), 0, 100);
  m.mental = (m.pay + m.morale + m.colleagues) / 3;
  m.overall = (m.physical + m.mental) / 2;
  if (m.overall < 30) w.low += dt; else w.low = Math.max(0, w.low - dt * 2);
  if (!w.rogue && w.low > 70) {
    w.rogue = true;
    letter('Mill Ledger', `${w.name} has gone rogue`, `${w.name} is fed up and has stopped pulling their weight. Unhappy staff may walk off the job or help themselves to the cash box.\n\nCheck their mood in the Staff tab. Better pay, a bed, a well and a campfire all help.`, 'bad');
  }
  if (w.rogue && m.overall > 50) { w.rogue = false; w.low = 0; toast(`${w.name} is back on side.`, 'good'); }
}

// ---------- daily cycle ----------
function newDay() {
  const day = dayOf();
  // forest lifecycle
  const ancient = G.trees.filter(t => t.sp === 'ancient');
  const births = [];
  for (const t of [...G.trees]) {
    if (t.sp === 'ancient') continue;
    if (t.dead) {
      t.deadDays++;
      if (!t.fallen && t.deadDays > 6) { t.fallen = true; }
      if (t.fallen && t.deadDays > 26 && !t.res) { removeTree(t.x, t.y); if (chance(0.5)) births.push([t.x, t.y, t.sp]); }
      continue;
    }
    t.age += TREE_SPECIES[t.sp].growth * (t.sick ? 0.3 : 1);
    if (t.sick) {
      t.sick++;
      for (let d = 0; d < 4; d++) { const o = G.tree[idx(t.x + DX[d], t.y + DY[d])]; if (o && !o.dead && !o.sick && o.sp !== 'ancient' && chance(0.18)) o.sick = 1; }
      if (t.sick > 8) { t.dead = true; t.sick = 0; continue; }
    }
    if (t.age > t.maxAge && chance(0.12)) { t.dead = true; continue; }
    const st = treeStage(t);
    let seedP = st === 'mature' ? 0.035 : st === 'old' ? 0.05 : 0;
    if (ancient.some(a => dist(a.x, a.y, t.x, t.y) < 9)) seedP *= 2;
    if (chance(seedP)) {
      const x = t.x + ri(-3, 3), y = t.y + ri(-3, 3);
      if (plantable(x, y) && !G.plantMark[idx(x, y)] && G.tiles[idx(x, y)] === 1) {
        let near = 0;
        for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) if (inMap(x + xx, y + yy) && G.tree[idx(x + xx, y + yy)]) near++;
        if (near < 5 && dist(x, y, G.hq.x + 1, G.hq.y + 1) > 4.5) births.push([x, y, t.sp]);
      }
    }
  }
  for (const [x, y, sp] of births) if (plantable(x, y)) addTree(x, y, sp, 0.1);
  for (let k = 0; k < MAP * MAP; k++) if (G.stump[k] && G.stump[k]++ > 14) G.stump[k] = 0;
  // blight outbreaks
  if (day > 3 && chance(0.12)) {
    const cands = G.trees.filter(t => !t.dead && t.sp !== 'ancient' && t.age > 8);
    if (cands.length) {
      const t = pick(cands); t.sick = 1;
      if (G.reveal[idx(t.x, t.y)]) {
        toast('Blight has been spotted in the forest.', 'bad');
        if (!G.workers.some(w => w.role === 'arborist')) letter('Forestry Board', 'Blight in your woods', `We've spotted blight on one of your trees. It spreads to neighbours and kills within a week.\n\nAn Arborist can treat infected trees. You don't currently employ one.`, 'bad');
      }
    }
  }
  // forest health
  const score = forestScore();
  G.health = Math.round(clamp(score / G.initialForest * 100, 0, 140));
  for (const th of [85, 70, 55]) {
    if (G.health < th && G.warned > th) {
      G.warned = th;
      letter('Forestry Board', th > 60 ? 'Concerns about your felling' : 'Final warning: deforestation', th > 60
        ? `Our survey shows your forest at ${G.health}% of its original cover. Please replant. Arborists will plant on stumps near camp, and on any ground you mark for planting.`
        : `Your forest is down to ${G.health}% of its original cover. Below 50% we will fine the mill every week until it recovers.`, 'bad');
    }
  }
  if (G.health >= 90 && G.warned < 90) G.warned = 100;
  if (G.health < 50 && day % 5 === 0) { money(-500); letter('Forestry Board', 'Deforestation fine', `Forest cover is at ${G.health}%. A fine of 500 has been taken from your account.`, 'bad'); }

  // wages
  const wages = G.workers.reduce((s, w) => s + w.pay, 0);
  if (wages) { G.money -= wages; G.stats.spent += wages; G.stats.wages = wages; }
  // rogue behaviour
  for (const w of [...G.workers]) {
    if (!w.rogue) continue;
    w.rogueDays = (w.rogueDays || 0) + 1;
    if (w.rogueDays > 2 && chance(0.35)) { fireWorker(w); letter('Mill Ledger', `${w.name} quit`, `${w.name} packed up their things and left in the night. They didn't say goodbye.`, 'bad'); }
    else if (chance(0.3) && G.money > 200) { const n = Math.min(350, Math.round(G.money * 0.06)); G.money -= n; letter('Mill Ledger', 'Money missing from the cash box', `${fmt(n)} is missing from the cash box. Nobody saw anything, but ${w.name} has been unusually cheerful today.`, 'bad'); }
  }
  // market
  for (const [k, m] of Object.entries(G.market)) {
    let v = 1 + 0.13 * Math.sin(day / 6 * Math.PI * 2 / 2 + m.phase) + rf(-0.05, 0.05);
    if (G.rivalFlood && G.rivalFlood.item === k && day < G.rivalFlood.until) v *= 0.68;
    m.m = Math.max(0.4, v);
    m.hist.push(+m.m.toFixed(3)); if (m.hist.length > 30) m.hist.shift();
  }
  if (G.rivalFlood && day >= G.rivalFlood.until) G.rivalFlood = null;
  if (!G.rivalFlood && day > 5 && chance(0.07)) {
    const item = pick(unlockedItems());
    G.rivalFlood = { item, until: day + ri(4, 7) };
    letter(RIVAL, `${ITEMS[item].name} at rock-bottom prices`, `${RIVAL} is pleased to announce a clearance of ${ITEMS[item].name.toLowerCase()} at prices no small mill can match. Our customers thank us.\n\n(Market prices for ${ITEMS[item].name.toLowerCase()} will be depressed for a few days.)`, 'bad');
  }
  // trade offers & contracts
  G.offers = G.offers.filter(o => o.expires > day);
  const maxOffers = has('trade') ? 4 : 3;
  if (G.offers.length < maxOffers && chance(has('trade') ? 0.7 : 0.45)) newOffer();
  for (const c of [...G.contracts]) {
    if (day > c.deadline && c.delivered < c.qty) {
      G.contracts.splice(G.contracts.indexOf(c), 1);
      const pen = Math.round(c.qty * c.price * 0.15);
      G.money -= pen; G.rep = Math.max(-5, G.rep - 1);
      letter(c.company, 'Contract cancelled', `We needed ${c.qty} ${ITEMS[c.item].name.toLowerCase()} by ${dateStr(c.deadline)} and received ${c.delivered}. Our lawyers have recovered a penalty of ${fmt(pen)}. We won't be in touch for a while.`, 'bad');
    }
  }
  if (day - G.candDay >= 4) refreshCandidates();
  if (G.money < 0) { G.lowCash++; if (G.lowCash === 1) letter('Mill Ledger', 'You are overdrawn', 'The mill account is in the red. Staff still expect their wages every evening. Sell some stock, or let some staff go.', 'bad'); } else G.lowCash = 0;
  G.stats.history.push({ day, money: Math.round(G.money), health: G.health, trees: G.trees.length });
  if (G.stats.history.length > 60) G.stats.history.shift();
}
function unlockedItems() {
  const l = ['log', 'plank'];
  if (has('carpentry')) l.push('crate', 'chair');
  if (has('fine')) l.push('table');
  return l;
}
function newOffer(first) {
  const items = unlockedItems();
  const item = first ? pick(['log', 'plank']) : pick(items.slice(-3).concat(items));
  const qty = { log: ri(15, 35), plank: ri(30, 80), crate: ri(8, 20), chair: ri(5, 14), table: ri(3, 7) }[item];
  const price = +(marketPrice(item) * rf(1.15, 1.45) * (1 + G.rep * 0.03)).toFixed(1);
  const day = dayOf();
  const free = COMPANIES.filter(c => !G.offers.some(o => o.company === c) && !G.contracts.some(o => o.company === c));
  G.offers.push({ id: ++G.uid, company: pick(free.length ? free : COMPANIES), item, qty, price, days: ri(4, 8) + Math.ceil(qty / 30), expires: day + 3, negotiated: false });
}
function acceptOffer(o) {
  G.offers.splice(G.offers.indexOf(o), 1);
  G.contracts.push({ ...o, deadline: dayOf() + o.days, delivered: 0 });
  toast(`Contract signed with ${o.company}.`, 'good');
}
function negotiate(o) {
  if (chance(0.62)) { o.price = +(o.price * 1.14).toFixed(1); o.negotiated = true; toast(`${o.company} agreed to ${o.price.toFixed(1)} each.`, 'good'); }
  else { G.offers.splice(G.offers.indexOf(o), 1); toast(`${o.company} walked away from the table.`, 'bad'); }
}
function completeContract(c) {
  G.contracts.splice(G.contracts.indexOf(c), 1);
  const v = Math.round(c.qty * c.price);
  money(v);
  G.rep = Math.min(10, G.rep + 1); G.stats.contracts++;
  letter(c.company, 'Delivery received, payment enclosed', `All ${c.qty} ${ITEMS[c.item].name.toLowerCase()} arrived in good order. Please find ${fmt(v)} enclosed. We'll think of you next time.`, 'good');
  toast(`Contract complete: +${fmt(v)}`, 'good');
  sfx('cash');
}
function startResearch(r) {
  if (G.research.active) { toast('Your foreman is already researching something.', 'bad'); return; }
  if (!spend(r.cost, r.name)) return;
  G.research.active = { id: r.id, prog: 0 };
}

// ---------- goals ----------
function setupGoals() {
  G.goals = [
    { id: 'fell', text: 'Fell 10 logs', reward: 200, done: false, test: () => G.stats.logsCut >= 10 },
    { id: 'drop', text: 'Build a Log Drop', reward: 150, test: () => G.buildings.some(b => b.type === 'intake') },
    { id: 'saw', text: 'Power a Sawmill with a Steam Engine', reward: 400, test: () => G.buildings.some(b => b.type === 'sawmill' && b.sat > 0) },
    { id: 'planks', text: 'Sell 30 planks at a Trade Depot', reward: 500, test: () => (G.stats.sold.plank || 0) >= 30 },
    { id: 'craft', text: 'Research Carpentry and craft a chair', reward: 600, test: () => (G.stats.made.chair || 0) >= 1 },
    { id: 'contract', text: 'Complete a trade contract', reward: 800, test: () => G.stats.contracts >= 1 },
    { id: 'secrets', text: 'Find 3 forest secrets', reward: 700, test: () => G.stats.secrets >= 3 },
    { id: 'green', text: 'Plant 25 saplings', reward: 500, test: () => G.stats.planted >= 25 },
  ];
}
function checkGoals() {
  for (const g of G.goals) if (!g.done && g.test()) {
    g.done = true; money(g.reward);
    toast(`Goal complete: ${g.text} (+${fmt(g.reward)})`, 'good');
  }
}

// ---------- main sim step ----------
function simStep(dt) {
  const prevDay = dayOf();
  G.t += dt * MIN_PER_SEC;
  if (dayOf() !== prevDay) newDay();
  if (G.research.active) {
    const r = RESEARCH.find(r => r.id === G.research.active.id);
    G.research.active.prog += dt * MIN_PER_SEC / 1440 / r.days;
    if (G.research.active.prog >= 1) {
      G.research.done.push(r.id); G.research.active = null;
      letter('Mill Ledger', `Research complete: ${r.name}`, `${r.desc}`, 'good');
      toast(`Research complete: ${r.name}`, 'good');
      sfx('level');
    }
  }
  updatePower(dt);
  updateMachines(dt);
  updateBelts(dt);
  for (const w of [...G.workers]) { updateWorker(w, dt); updateMood(w, dt); }
  for (const t of G.trees) if (t.shake > 0) t.shake -= dt;
  for (const b of G.buildings) if (b.type === 'steam' && b.gen > 0 && Math.random() < dt * 3) {
    const [x, y] = [isoX(b.x + 0.5 + rf(0, 0.9), b.y + 0.6), isoY(b.x + 1, b.y + 0.6)];
    fxPuff(x, y - 36, 'rgba(225,225,225,', 1, 1);
  }
  checkGoals();
}
