'use strict';
// DOM interface: HUD, toolbar, inspector, the mill ledger panel, and pointer/keyboard input.

const UI = {
  tool: 'select', hover: null, sel: null, drag: null, beltDir: 0, unmark: false, hoverWorker: null,
  tab: 'overview', insTab: 'summary', letterSel: null, flyout: null, panelOpen: false, pointerInPanel: false,
  dragTiles() {
    const h = this.hover; if (!h) return [];
    const d = this.drag;
    if (this.tool === 'belt') {
      if (!d) return [[h.x, h.y, this.beltDir]];
      const out = [];
      let x = d.x, y = d.y;
      const ex = h.x, ey = h.y;
      const horizFirst = Math.abs(ex - x) >= Math.abs(ey - y);
      const steps = [];
      const sx = Math.sign(ex - x), sy = Math.sign(ey - y);
      if (horizFirst) { for (let i = 0; i < Math.abs(ex - x); i++) steps.push(sx > 0 ? 0 : 2); for (let i = 0; i < Math.abs(ey - y); i++) steps.push(sy > 0 ? 1 : 3); }
      else { for (let i = 0; i < Math.abs(ey - y); i++) steps.push(sy > 0 ? 1 : 3); for (let i = 0; i < Math.abs(ex - x); i++) steps.push(sx > 0 ? 0 : 2); }
      if (!steps.length) return [[x, y, this.beltDir]];
      for (let i = 0; i <= steps.length && out.length < 200; i++) {
        const dir = i < steps.length ? steps[i] : steps[steps.length - 1];
        out.push([x, y, dir]);
        if (i < steps.length) { x += DX[steps[i]]; y += DY[steps[i]]; }
      }
      return out;
    }
    if (this.tool === 'survey' || !d) return [[h.x, h.y, 0]];
    const out = [];
    const x0 = Math.min(d.x, h.x), x1 = Math.max(d.x, h.x), y0 = Math.min(d.y, h.y), y1 = Math.max(d.y, h.y);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (out.length < 900) out.push([x, y, 0]);
    return out;
  },
};
const $ = (s) => document.querySelector(s);
function confirming(key) { return UI.confirm && UI.confirm.key === key && performance.now() < UI.confirm.until; }
function askConfirm(key) { if (confirming(key)) { UI.confirm = null; return true; } UI.confirm = { key, until: performance.now() + 3000 }; return false; }
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- toasts ----------
function toast(msg, kind = 'info') {
  if (G && G.goals && tutorialActive() && kind !== 'bad') return; // the coach card does the talking during the walkthrough
  if (kind === 'bad') sfx('bad');
  const el = document.createElement('div');
  el.className = 'toast ' + kind; el.textContent = msg;
  const box = $('#toasts'); box.prepend(el);
  while (box.children.length > 4) box.lastChild.remove();
  setTimeout(() => el.classList.add('out'), 4200);
  setTimeout(() => el.remove(), 4800);
}
function onLetter() { updateHud(); if (!tutorialActive()) sfx('letter'); }

// ---------- helpers ----------
function face(v) { return v >= 66 ? 'good' : v >= 36 ? 'ok' : 'bad'; }
function faceSvg(v) {
  const f = face(v);
  const mouth = f === 'good' ? 'M4 9.5 Q7 12 10 9.5' : f === 'ok' ? 'M4.5 10 L9.5 10' : 'M4 11 Q7 8.5 10 11';
  return `<svg class="face ${f}" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="6.5"/><rect x="4" y="4.5" width="1.6" height="2" fill="#2b1d1c"/><rect x="8.4" y="4.5" width="1.6" height="2" fill="#2b1d1c"/><path d="${mouth}" stroke="#2b1d1c" stroke-width="1.4" fill="none"/></svg>`;
}
function bar(v, label, inv) {
  const f = face(inv ? 100 - v : v);
  return `<div class="stat"><span>${label}</span>${faceSvg(inv ? 100 - v : v)}<div class="bar"><i class="${f}" style="width:${clamp(inv ? 100 - v : v, 0, 100).toFixed(0)}%"></i></div></div>`;
}
function portraitURL(w) { if (!w._portrait) { const c = makePortrait(w.ap); w._portrait = c.toDataURL(); } return w._portrait; }
function coin(n) { return `<span class="coin">${fmt(n)}</span>`; }
function itemImg(t) { return `<img class="itm" src="${ART.itemIcons[t]}" alt="">`; }
function spriteThumb(type) {
  const s = type === 'tent' ? ART.b.tent[0] : type === 'intake' ? ART.b.intake[2] : ART.b[type];
  if (!s._url) s._url = s.cv.toDataURL();
  return s._url;
}

// ---------- HUD ----------
function buildHud() {
  const I = ART.icons;
  $('#money-ico').src = I.coin;
  const soundIcon = () => { $('#chip-sound img').src = AUD.muted ? I.soundOff : I.soundOn; $('#chip-sound').setAttribute('aria-label', AUD.muted ? 'Turn sound on' : 'Turn sound off'); $('#chip-sound').title = (AUD.muted ? 'Sound is off' : 'Sound is on') + ' (N)'; };
  UI.toggleSound = () => { audioStart(); setMuted(!AUD.muted); soundIcon(); };
  $('#chip-sound').addEventListener('click', UI.toggleSound);
  soundIcon();
  // soft click for interface buttons
  document.addEventListener('click', e => { if (e.target.closest('button')) sfx('click'); }, true);
  $('#chip-forest img').src = I.tree; $('#chip-power img').src = I.power; $('#chip-staff img').src = I.people; $('#chip-letters img').src = I.letter;
  $('#chip-research img').src = I.research;
  $('#chip-fire img').src = I.fire;
  $('#chip-fire').addEventListener('click', () => { const t = G.trees.find(t => t.fire > 0); if (t) centerOn(t.x, t.y); });
  $('#ending').addEventListener('click', e => { if (e.target.closest('[data-end]')) $('#ending').hidden = true; });
  const tb = $('#toolbar');
  const tools = [
    ['select', 'Select', 'Select and inspect', I.select, 'V'], ['camp', 'Camp', 'Camp buildings', I.camp, '1'], ['factory', 'Factory', 'Factory buildings', I.factory, '2'],
    ['belt', 'Conveyor', 'Conveyor', I.belt, 'C'], ['logi', 'Logistics', 'Logistics buildings', I.logi, '4'], ['power', 'Power', 'Power buildings', I.power, '3'], ['chop', 'Fell', 'Mark trees for felling', I.chop, 'F'],
    ['plant', 'Plant', 'Mark ground for planting', I.plant, 'P'], ['path', 'Path', 'Dirt path', I.path, 'T'], ['bulldoze', 'Remove', 'Remove things', I.bulldoze, 'B'],
    ['survey', 'Survey', 'Survey the forest', I.survey, 'X'], ['mill', 'Ledger', 'Mill Ledger', I.mill, 'M'],
  ];
  tb.innerHTML = tools.map(([id, label, name, ico, key]) => `<button class="tbtn" data-tool="${id}" title="${name} (${key})" aria-label="${name}"><img src="${ico}" alt=""><span class="lbl">${label}</span><span class="key">${key}</span></button>`).join('');
  // zoom, home and help
  $('#zoom').addEventListener('click', e => {
    const b = e.target.closest('[data-zoom]'); if (!b) return;
    if (b.dataset.zoom === 'home') { const c = bCenter(G.hq); centerOn(c.x + 1, c.y + 1); }
    else zoomStep(+b.dataset.zoom);
  });
  $('#chip-help').addEventListener('click', () => { $('#help').hidden = !$('#help').hidden; renderHelp(); });
  $('#help').addEventListener('click', e => {
    const b = e.target.closest('[data-help]'); if (!b) return;
    if (b.dataset.help === 'close') $('#help').hidden = true;
    if (b.dataset.help === 'tutorial') { G.tutorialOff = false; $('#help').hidden = true; coachKey = ''; lastHud = ''; updateHud(); }
    if (b.dataset.help === 'fresh') { if (askConfirm('fresh')) startFresh(); else renderHelp(); }
  });
  $('#coach').addEventListener('click', e => {
    const b = e.target.closest('[data-coach]'); if (!b) return;
    if (b.dataset.coach === 'next') { const st = currentStep(); if (st) { G.tutor.ack[st.id] = true; checkGoals(); } }
    if (b.dataset.coach === 'skip' && askConfirm('skip')) {
      G.tutorialOff = true; finishTutorial();
      if (!G.speed) setSpeed(1);
      toast('Tutorial skipped. You can reopen it from the ? button.');
    }
    coachKey = ''; lastHud = ''; updateHud();
  });
  tb.addEventListener('click', e => { const b = e.target.closest('[data-tool]'); if (b) pickTool(b.dataset.tool); });
  $('#speed').addEventListener('click', e => { const b = e.target.closest('[data-speed]'); if (b) setSpeed(+b.dataset.speed); });
  $('#chip-letters').addEventListener('click', () => openPanel('letters'));
  $('#chip-staff').addEventListener('click', () => openPanel('staff'));
  $('#chip-forest').addEventListener('click', () => openPanel('overview'));
  $('#chip-power').addEventListener('click', () => openPanel('overview'));
  $('#chip-research').addEventListener('click', () => openPanel('research'));
  $('#goals-toggle').addEventListener('click', () => { const c = $('#goals').classList.toggle('collapsed'); $('#goals-toggle').textContent = c ? '+' : '–'; });
  $('#flyout').addEventListener('click', e => { const b = e.target.closest('[data-build]'); if (b && !b.disabled) { setTool(b.dataset.build); closeFlyout(); } });
  $('#hint').addEventListener('click', e => {
    const b = e.target.closest('[data-hint]'); if (!b) return;
    if (b.dataset.hint === 'rotate') UI.beltDir = (UI.beltDir + 1) % 4;
    if (b.dataset.hint === 'unmark') UI.unmark = !UI.unmark;
    if (b.dataset.hint === 'cancel') setTool('select');
    updateHint();
  });
  // panel + inspector use delegated actions
  for (const el of [$('#panel'), $('#inspector')]) {
    el.addEventListener('click', onAction);
    el.addEventListener('change', onAction);
    el.addEventListener('pointerdown', () => UI.pointerInPanel = true);
  }
  window.addEventListener('pointerup', () => setTimeout(() => UI.pointerInPanel = false, 0));
  $('#panel-close').addEventListener('click', closePanel);
  initMinimap();
  $('#load-file').addEventListener('change', e => loadFromFile(e.target.files[0]));
  $('#panel-tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { UI.tab = b.dataset.tab; renderPanel(); } });
}
function setSpeed(s) {
  G.speed = s;
  for (const b of document.querySelectorAll('#speed [data-speed]')) b.classList.toggle('on', +b.dataset.speed === s);
}
function pickTool(id) {
  if (!toolShown(id)) return;
  if (id === 'mill') { UI.panelOpen ? closePanel() : openPanel(UI.tab); return; }
  if (MENUS[id]) { UI.flyout === id ? closeFlyout() : openFlyout(id); return; }
  closeFlyout();
  setTool(id);
}
function setTool(id) {
  UI.tool = id; UI.drag = null; UI.unmark = false;
  if (id !== 'select') { UI.sel = null; renderInspector(); }
  for (const b of document.querySelectorAll('.tbtn')) {
    const t = b.dataset.tool;
    const cat = BDEF[id] && BDEF[id].cat;
    b.classList.toggle('on', t === id || t === cat);
  }
  updateHint();
}
function updateHint() {
  const h = $('#hint');
  const t = UI.tool;
  if (t === 'select') { h.hidden = true; return; }
  h.hidden = false;
  let name, desc, cost, extra = '';
  if (BDEF[t]) { name = BDEF[t].name; desc = BDEF[t].desc + ' Click to place it. Hold Shift to place several.'; cost = BDEF[t].cost; }
  else { name = TOOLS[t].name; desc = TOOLS[t].desc; cost = TOOLS[t].cost; }
  if (t === 'belt' || (BDEF[t] && BDEF[t].dir)) extra = `<button data-hint="rotate">${t === 'belt' ? 'Rotate' : 'Facing'}: ${DIR_NAMES[UI.beltDir]} (R)</button>`;
  if (t === 'chop' || t === 'plant') extra = `<button data-hint="unmark" class="${UI.unmark ? 'on' : ''}">${UI.unmark ? 'Unmarking' : 'Marking'} (Shift)</button>`;
  h.innerHTML = `<div><b>${esc(name)}</b>${cost ? ` ${coin(cost)}${t === 'belt' || t === 'path' || t === 'plant' ? ' per tile' : ''}` : ''}<p>${esc(desc)}</p></div><div class="hint-btns">${extra}<button data-hint="cancel">Done (Esc)</button></div>`;
}
// ---------- the walkthrough: coach card, pointer arrow, and revealing the interface bit by bit ----------
const REVEAL_PARTS = { zoom: ['#zoom'], map: ['#minimap'], date: ['#datebox'], chips: ['#chip-forest', '#chip-power', '#chip-staff'], letters: ['#chip-letters'] };
const ALL_TOOLS = ['select', 'camp', 'factory', 'belt', 'logi', 'power', 'chop', 'plant', 'path', 'bulldoze', 'survey', 'mill'];
const MENUS = { camp: 'Campsite', factory: 'Factory', logi: 'Logistics', power: 'Power' };
function revealedSet(step) {
  if (!step) return null; // everything
  const set = new Set();
  for (const g of G.goals) { if (!g.tut) continue; for (const r of g.reveal || []) set.add(r); if (g === step) break; }
  return set;
}
function applyReveal(step) {
  const set = revealedSet(step);
  const show = (sel, on) => { for (const el of document.querySelectorAll(sel)) el.classList.toggle('tut-hide', !on); };
  for (const [k, sels] of Object.entries(REVEAL_PARTS)) for (const sel of sels) show(sel, !set || set.has(k));
  for (const t of ALL_TOOLS) show(`.tbtn[data-tool="${t}"]`, !set || set.has(t));
  show('#toolbar', !set || ALL_TOOLS.some(t => set.has(t)));
  show('#goals', !set);
  show('#chip-research', !set || set.has('mill'));
  document.body.classList.toggle('in-tutorial', !!set);
  const mapOn = (!set || set.has('map')) && !$('#minimap').classList.contains('collapsed');
  document.body.classList.toggle('has-map', mapOn);
}
function toolShown(t) { const el = document.querySelector(`.tbtn[data-tool="${t}"]`); return !!el && !el.closest('.tut-hide'); }
let coachKey = '';
function renderCoach(step) {
  const el = $('#coach');
  if (!step) { el.hidden = true; coachKey = ''; return; }
  const tut = G.goals.filter(g => g.tut), n = tut.indexOf(step) + 1;
  const key = step.id + confirming('skip');
  if (key === coachKey) return;
  const isNew = !coachKey.startsWith(step.id);
  coachKey = key;
  el.hidden = false;
  el.innerHTML = `<div class="coach-top"><span>Step ${n} of ${tut.length}</span><div class="coach-bar"><i style="width:${((n - 1) / tut.length * 100).toFixed(0)}%"></i></div></div>
    <h3>${esc(step.text)}</h3><p>${esc(step.hint)}</p>
    <div class="coach-btns"><button class="coach-skip" data-coach="skip">${confirming('skip') ? 'Click again to skip the tutorial' : 'Skip tutorial'}</button>${step.info ? `<button class="go" data-coach="next">${esc(step.button || 'Next')}</button>` : step.reward ? `<span class="coach-reward">Reward ${coin(step.reward)}</span>` : ''}</div>`;
  if (isNew) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
}
function onStepDone() { coachKey = ''; updateHud(); }
// which element the bouncing arrow should point at right now, if any
function pointerTarget(step) {
  if (step.id === 'fell' && G.speed > 1) return null; // already found fast-forward
  const vis = (el) => (el && el.getClientRects().length && !el.closest('.tut-hide') ? el : null);
  if (step.tab && UI.panelOpen) return UI.tab === step.tab ? vis(document.querySelector(step.inner)) : vis(document.querySelector(`#panel-tabs [data-tab="${step.tab}"]`));
  if (step.cards) {
    const card = step.cards.find(c => !G.buildings.some(b => b.type === c));
    if (!card || UI.tool === card) return null; // placing it: the marker on the map takes over
    if (UI.flyout) { const el = vis(document.querySelector(`.bcard[data-build="${card}"]`)); if (el) return el; }
  }
  if (step.target && step.target.startsWith('.tbtn')) { const t = step.target.match(/data-tool=(\w+)/)[1]; if (UI.tool === t) return null; }
  return step.target ? vis(document.querySelector(step.target)) : null;
}
function updatePointer() {
  // with the ledger open the coach sits at the bottom, just right of the toolbar
  const coach = $('#coach');
  if (document.body.classList.contains('in-tutorial') && UI.panelOpen && window.innerWidth > 700) {
    const tb = $('#toolbar').getBoundingClientRect();
    const right = document.body.classList.contains('has-map') ? 300 : 60;
    coach.style.left = Math.round(tb.right + 12) + 'px';
    coach.style.transform = 'none';
    coach.style.width = Math.max(280, Math.min(460, window.innerWidth - tb.right - 24 - right)) + 'px';
  } else if (coach.style.left) { coach.style.left = ''; coach.style.transform = ''; coach.style.width = ''; }
  const p = $('#pointer');
  const step = G && playing ? currentStep() : null;
  const el = step && !step.info ? pointerTarget(step) : null;
  if (!el) { p.hidden = true; return; }
  const r = el.getBoundingClientRect();
  const below = r.top < 70 || !!el.closest('#panel'); // inside the ledger, point up from below so card text stays readable
  p.hidden = false;
  p.classList.toggle('up', below);
  p.style.left = Math.round(r.left + r.width / 2 - 13) + 'px';
  p.style.top = Math.round(below ? r.bottom + 4 : r.top - 38) + 'px';
}
// point at whatever the current tutorial step needs clicking
function applyHighlights(step) {
  const want = new Set();
  if (step) {
    if (step.target) for (const el of document.querySelectorAll(step.target)) want.add(el);
    if (step.cards) for (const c of step.cards) { // skip what is already built (a pole only matters until there is a link)
      if (c !== 'pole' && G.buildings.some(b => b.type === c)) continue;
      const el = document.querySelector(`.bcard[data-build="${c}"]`); if (el) want.add(el);
    }
    if (step.tab && UI.panelOpen) { const el = document.querySelector(`#panel-tabs [data-tab="${step.tab}"]`); if (el && UI.tab !== step.tab) want.add(el); }
    if (step.tab && UI.panelOpen && UI.tab === step.tab) want.delete(document.querySelector('.tbtn[data-tool=mill]'));
  }
  for (const el of document.querySelectorAll('.tut-glow')) if (!want.has(el)) el.classList.remove('tut-glow');
  for (const el of want) el.classList.add('tut-glow');
}
function renderHelp() {
  $('#help').innerHTML = `<h2>Controls <button class="x" data-help="close" aria-label="Close">×</button></h2>
    <dl class="controls">
      <dt>Move</dt><dd>Drag the map, or use WASD or the arrow keys. Click the minimap to jump. The house button returns to your mill.</dd>
      <dt>Zoom</dt><dd>Mouse wheel, trackpad pinch, two-finger pinch, + and − buttons, or Q and E.</dd>
      <dt>Inspect</dt><dd>With Select on (V), click staff, buildings and trees. Hover to see what something is.</dd>
      <dt>Build</dt><dd>Pick a building from Camp, Factory, Logistics or Power (keys 1 to 4), then click the ground. Hold Shift to place several. R turns a Sorter before you place it.</dd>
      <dt>Grow</dt><dd>Sales raise your mill's rank, shown under your goals. Each rank opens new research, and new research opens new buildings.</dd>
      <dt>Drag tools</dt><dd>Conveyor, Fell, Plant, Path and Remove work by dragging. Conveyors run the way you drag; R rotates one.</dd>
      <dt>Cancel</dt><dd>Esc or right-click goes back to Select.</dd>
      <dt>Time</dt><dd>Space pauses. The arrows by the date speed time up.</dd>
      <dt>Ledger</dt><dd>M opens staff, hiring, research, trade, letters and saving.</dd>
      <dt>Phones</dt><dd>One finger uses the current tool, two fingers move and zoom.</dd>
    </dl>
    <div class="row-btns">${freshButton('data-help="fresh"')}${G.tutorialOff || !currentStep() ? '<button data-help="tutorial">Show the tutorial</button>' : ''}<button class="go" data-help="close">Close</button></div>`;
}
function freshButton(attr) {
  return `<button class="danger" ${attr}>${confirming('fresh') ? 'Click again: this mill will be lost' : 'Start a new mill'}</button>`;
}
function openFlyout(cat) {
  UI.flyout = cat;
  const f = $('#flyout');
  const items = Object.entries(BDEF).filter(([, d]) => d.cat === cat);
  f.innerHTML = `<h3>${MENUS[cat]}</h3><div class="cards">` + items.map(([id, d]) => {
    const locked = d.req && !has(d.req);
    const rname = locked ? researchName(d.req) : '';
    return `<button class="bcard" data-build="${id}" ${locked ? 'disabled' : ''} title="${esc(d.desc)}"><img src="${spriteThumb(id)}" alt=""><span class="nm">${esc(d.name)}</span>${locked ? `<span class="lock">Research ${esc(rname)}</span>` : `<span class="cost">${coin(d.cost)}</span>`}</button>`;
  }).join('') + '</div>';
  f.hidden = false; $('#hint').hidden = true;
  applyHighlights(currentStep());
  for (const b of document.querySelectorAll('.tbtn')) b.classList.toggle('on', b.dataset.tool === cat);
}
function closeFlyout() { const was = UI.flyout; UI.flyout = null; $('#flyout').hidden = true; setToolButtons(); if (was) updateHint(); }
function setToolButtons() { for (const b of document.querySelectorAll('.tbtn')) { const cat = BDEF[UI.tool] && BDEF[UI.tool].cat; b.classList.toggle('on', b.dataset.tool === UI.tool || b.dataset.tool === cat); } }

let lastHud = '';
function updateHud() {
  const p = dateParts();
  const h = hourOf();
  $('#money').textContent = fmt(G.money);
  $('#money').classList.toggle('neg', G.money < 0);
  $('#dow').textContent = p.wd;
  $('#date').textContent = `${p.m} ${p.d}, Year ${p.y}`;
  $('#clock').textContent = `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 6) * 10).padStart(2, '0')}`;
  let sup = 0, dem = 0;
  for (const n of G.nets) { sup += n.supply || 0; dem += n.demand || 0; }
  $('#chip-forest span').textContent = G.health + '%';
  $('#chip-forest').className = 'chip ' + (G.health >= 85 ? '' : G.health >= 65 ? 'warn' : 'bad');
  $('#chip-power span').textContent = `${Math.round(dem)}/${Math.round(sup)}`;
  $('#chip-power').className = 'chip ' + (dem > sup + 0.5 ? 'bad' : '');
  $('#chip-staff span').textContent = G.workers.length;
  const fires = G.trees.filter(t => t.fire > 0).length;
  $('#chip-fire').hidden = !fires;
  if (fires) $('#chip-fire span').textContent = fires;
  const unread = G.letters.filter(l => !l.read).length;
  $('#chip-letters span').textContent = unread;
  $('#chip-letters').classList.toggle('pulse', unread > 0);
  const ra = G.research.active;
  $('#chip-research').hidden = !ra;
  if (ra) { const r = RESEARCH.find(r => r.id === ra.id); $('#chip-research span').textContent = `${Math.floor(ra.prog * 100)}%`; $('#chip-research').title = `Researching ${r.name}`; }
  // goals
  const step = currentStep();
  applyReveal(step);
  renderCoach(step);
  if (!step) {
    const st = G.story, goals = storyGoals(), c = chapterDef();
    $('#goals-title').textContent = st.ended ? 'Free play' : st.chapter >= 2 ? `Chapter ${st.chapter}: ${c.title}` : 'Goals';
    $('#goal-count').textContent = `${goals.filter(g => st.done.includes(g.id)).length}/${goals.length}`;
    const rp = rankProgress();
    const rank = `<li class="rank" title="${rp.next ? `Sell ${fmt(rp.next.need)} in all to become a ${esc(rp.next.name)}. Each rank opens new research.` : 'The top rank'}"><span>${esc(RANKS[rp.r].name)}</span><div class="bar"><i class="good" style="width:${(rp.frac * 100).toFixed(0)}%"></i></div><em>${rp.next ? esc(rp.next.name) : 'Top'}</em></li>`;
    const html = (goals.map(g => { const ok = st.done.includes(g.id); return `<li class="${ok ? 'ok' : ''}"><span class="box"></span>${esc(g.text)}${g.reward && !ok ? ` <em>${coin(g.reward)}</em>` : ''}</li>`; }).join('') || '<li>Finish the walkthrough to begin the story.</li>') + rank;
    if (html !== lastHud) { $('#goal-list').innerHTML = html; lastHud = html; }
  }
  applyHighlights(step);
}

// ---------- inspector ----------
function renderInspector() {
  const el = $('#inspector');
  const s = UI.sel;
  if (!s) { el.hidden = true; return; }
  if (s.kind === 'worker' && !G.workers.includes(s.ref)) { UI.sel = null; el.hidden = true; return; }
  if (s.kind === 'building' && !G.bmap.has(s.ref.id)) { UI.sel = null; el.hidden = true; return; }
  if (s.kind === 'tree' && G.tree[idx(s.ref.x, s.ref.y)] !== s.ref) { UI.sel = null; el.hidden = true; return; }
  el.hidden = false;
  let html = '';
  if (s.kind === 'worker') html = inspectWorker(s.ref);
  else if (s.kind === 'building') html = inspectBuilding(s.ref);
  else if (s.kind === 'tree') html = inspectTree(s.ref);
  else if (s.kind === 'belt') html = inspectBelt(s.ref);
  if (el._html !== html) { el.innerHTML = html; el._html = html; }
}
function inspectWorker(w) {
  const m = w.mood, n = w.needs, role = ROLES[w.role], P_ = PERSONALITIES[w.pers];
  const tabs = ['summary', 'mood', 'crew'].map(t => `<button data-act="instab" data-v="${t}" class="${UI.insTab === t ? 'on' : ''}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('');
  let body = '';
  if (UI.insTab === 'summary') {
    body = `<div class="wsum"><img class="portrait" src="${portraitURL(w)}" alt=""><div>
      <span class="role" style="background:${role.color}">${role.name}</span>
      <div class="kv"><span>Level</span><b>${w.level}/5</b></div>
      <div class="kv" title="Experience towards the next level"><span>Experience</span><div class="bar"><i class="good" style="width:${(xpProgress(w) * 100).toFixed(0)}%"></i></div></div>
      <div class="kv"><span>${role.stat}</span><b>${w.skill.toFixed(2)}</b></div>
      <div class="kv"><span>Personality</span><b title="${esc(P_.desc)}">${P_.name}</b></div></div></div>
      <div class="kv"><span>Pay per day</span><span class="pay"><button data-act="pay" data-v="-5" aria-label="Lower pay">-</button>${coin(w.pay)}<button data-act="pay" data-v="5" aria-label="Raise pay">+</button></span></div>
      <div class="thought">${faceSvg(m.overall)} ${esc(w.thought)}</div>
      ${w.rogue ? '<div class="warn-line">Gone rogue: unhappy and slacking off.</div>' : ''}
      <div class="row-btns"><button data-act="follow">Find</button><button data-act="fire" class="danger">${confirming('fire' + w.id) ? 'Click again to fire' : 'Fire'}</button></div>`;
  } else if (UI.insTab === 'mood') {
    body = bar(m.overall, 'Overall') + bar(m.physical, 'Physical') + bar(m.mental, 'Mental') +
      `<h4>Physical</h4>` + bar(n.energy, 'Energy') + bar(n.hydration, 'Hydration') + bar(n.bladder, 'Bladder', true) +
      `<h4>Mental</h4>` + bar(m.pay, 'Pay') + bar(m.morale, 'Morale') + bar(m.colleagues, 'Colleagues');
  } else {
    body = '<div class="crew">' + G.workers.filter(o => o !== w).map(o => `<button data-act="selw" data-v="${o.id}"><img src="${portraitURL(o)}" alt="">${esc(o.name)}<span>${ROLES[o.role].name}</span>${faceSvg(o.mood.overall)}</button>`).join('') + '</div>';
  }
  return `<h3>${esc(w.name)}<button class="x" data-act="close" aria-label="Close">×</button></h3><div class="tabs small">${tabs}</div><div class="ins-body">${body}</div>`;
}
function itemCounts(list) {
  const n = {};
  for (const it of list) n[it] = (n[it] || 0) + 1;
  return Object.entries(n).map(([k, c]) => `${c} ${itemImg(k)}`).join(' ') || 'Empty';
}
function inspectBuilding(b) {
  const d = BDEF[b.type];
  let st = '', body = '';
  if (d.machine) {
    let state;
    if (b.broken) state = ['Broken down', 'bad'];
    else if (b.type === 'steam') state = b.gen > 0 ? (b.active ? ['Supplying power', 'good'] : ['Idling, no demand', 'ok']) : ['Out of fuel', 'bad'];
    else if (b.type === 'wheel') state = b.active ? ['Turning', 'good'] : ['Not connected', 'ok'];
    else state = b.active ? ['Running', 'good'] : b.wants ? ['No power', 'bad'] : ['Waiting for materials', 'ok'];
    st = `<div class="state ${state[1]}">${state[0]}</div>`;
    body += `<div class="stat"><span>Condition</span><div class="bar"><i class="${face(b.dur)}" style="width:${b.dur.toFixed(0)}%"></i></div></div>`;
  }
  if (d.power) {
    const n = b.net;
    body += `<div class="kv"><span>Power</span><b>${n ? `Needs ${Math.round(powerUse(b))}. Network: ${Math.round(n.demand)} used / ${Math.round(n.supply)} made` : 'Not connected. Build a power pole nearby.'}</b></div>`;
  }
  if (b.type === 'steam') body += `<div class="kv"><span>Fuel</span><b>${b.fuel} ${itemImg('log')}</b></div><div class="kv"><span>Output</span><b>${steamGen()} power</b></div><p class="note">Feed logs or fuel pellets by conveyor. A bag of pellets burns as long as 3 logs. Lumberjacks top it up when it runs low.</p>`;
  if (b.type === 'solar' || b.type === 'wheel') body += `<div class="kv"><span>Output</span><b>${(b.gen || 0).toFixed(1)} power</b></div>`;
  if (d.recipes) {
    const r = RECIPES[b.recipe];
    body += `<h4>Recipe</h4><div class="recipes">` + d.recipes.map(id => {
      const rr = RECIPES[id], locked = rr.req && !has(rr.req);
      const ins = Object.entries(rr.in).map(([k, n]) => `${n} ${itemImg(k)}`).join(' ');
      const by = rr.by && has(rr.byReq) && b.byOn ? ` + 1 ${itemImg(rr.by)}` : '';
      return `<button data-act="recipe" data-v="${id}" class="${b.recipe === id ? 'on' : ''}" ${locked ? 'disabled' : ''}>${ins} → ${rr.n} ${itemImg(rr.out)}${by}<span>${locked ? `Needs ${esc(researchName(rr.req))}` : rr.name}</span></button>`;
    }).join('') + '</div>';
    body += `<div class="kv"><span>Progress</span><div class="bar"><i class="good" style="width:${(b.prog * 100).toFixed(0)}%"></i></div></div>`;
    body += `<div class="kv"><span>Input</span><b>${Object.keys(r.in).map(k => `${b.inv[k] || 0} ${itemImg(k)}`).join(' ')}</b></div><div class="kv"><span>Made</span><b>${b.made}</b></div>`;
    if (r.by && has(r.byReq)) body += `<div class="kv"><span>Bag ${ITEMS[r.by].name.toLowerCase()}</span><b><button data-act="byp" class="${b.byOn ? 'on' : ''}">${b.byOn ? 'On' : 'Off'}</button></b></div><p class="note">${b.byOn ? `${ITEMS[r.by].name} leaves on the same conveyors as the ${ITEMS[r.out].name.toLowerCase()}. A Sorter can split it off towards a Pellet Press.` : `Switch this on to send out a sack of ${ITEMS[r.by].name.toLowerCase()} with every log sawn.`}</p>`;
    if (Object.keys(r.in).length > 1) body += `<p class="note">This recipe needs more than one kind of input. Bring each in on its own conveyor, or mix them on one line: anything the machine can't take yet waits on the belt.</p>`;
    else if (!b.net) body += `<p class="note">Bring materials in on a conveyor pointing into the building. Finished goods leave on any conveyor pointing away from it.</p>`;
    // tuning
    const lvl = b.lvl || 1;
    body += `<h4>Tuning: ${MK[lvl]}</h4><div class="kv"><span>Speed</span><b>${Math.round(MK_SPEED[lvl] * 100)}%</b></div>`;
    if (canUpgrade(b)) body += `<div class="row-btns"><button class="go" data-act="upgrade">Tune to ${MK[lvl + 1]} ${coin(upgradeCost(b))}</button></div><p class="note">${MK[lvl + 1]} runs at ${Math.round(MK_SPEED[lvl + 1] * 100)}% speed and needs ${Math.round(d.power * MK_POWER[lvl + 1])} power.</p>`;
    else if (lvl < 3) body += `<p class="note">Research ${lvl === 1 ? 'Machine Tuning' : 'Precision Tuning'} to tune this machine to ${MK[lvl + 1]}.</p>`;
  }
  if (b.type === 'intake' || b.type === 'lcamp') body += `<div class="kv"><span>Logs stored</span><b>${b.stock}/${b.type === 'lcamp' ? 40 : 30}</b></div><p class="note">Lay a conveyor leading away and logs will roll out onto it.${b.type === 'lcamp' ? ' Whatever is left in the evening goes to a hauler at 70% of the market price.' : ''}</p>`;
  if (b.type === 'depot' || b.type === 'dock') {
    body += `<h4>Prices here</h4>` + unlockedItems().map(k => `<div class="kv"><span>${itemImg(k)} ${ITEMS[k].name}</span><b>${(marketPrice(k) * (b.type === 'dock' ? 1.25 : 1)).toFixed(1)}</b></div>`).join('');
  }
  if (d.cap) {
    body += `<div class="kv"><span>Holding</span><b>${b.out.length}/${d.cap}</b></div><div class="kv"><span>Contents</span><b>${itemCounts(b.out)}</b></div>`;
    if (b.type === 'store') body += `<div class="bar"><i class="good" style="width:${(b.out.length / d.cap * 100).toFixed(0)}%"></i></div>`;
  }
  if (b.type === 'sorter') {
    const opts = [['', 'Nothing'], ...unlockedItems().concat(has('sawdust') ? ['sawdust'] : []).map(k => [k, ITEMS[k].name])];
    body += `<div class="kv"><span>Facing</span><b>${DIR_NAMES[b.dir]}</b></div><h4>Send straight ahead</h4><div class="seg wrap">` +
      opts.map(([k, n]) => `<button data-act="filter" data-v="${k}" class="${(b.filter || '') === k ? 'on' : ''}" title="${esc(n)}">${k ? itemImg(k) : ''} ${esc(n)}</button>`).join('') +
      `</div><p class="note">${b.filter ? `${esc(ITEMS[b.filter].name)} go straight ahead; everything else leaves by the sides.` : 'With nothing chosen, everything goes straight ahead.'}</p><div class="row-btns"><button data-act="rotb">Turn</button></div>`;
  }
  if (d.beds) {
    const occ = G.workers.filter(w => w.home === b.id);
    body += `<div class="kv"><span>Beds</span><b>${occ.length}/${d.beds}</b></div>` + occ.map(w => `<div class="kv"><span>${esc(w.name)}</span><b>${w.hidden ? 'Asleep' : 'Out'}</b></div>`).join('');
  }
  if (b.type === 'hq') {
    body += `<div class="kv"><span>Mill rank</span><b>${RANKS[rankOf()].name}</b></div><p class="note">Open the Mill Ledger to hire staff, research, trade and read your letters.</p><div class="row-btns"><button data-act="open" data-v="overview">Open ledger</button></div>`;
  }
  const demo = b.type !== 'hq' ? `<div class="row-btns"><button data-act="demolish" class="danger">${confirming('demo' + b.id) ? 'Click again to demolish' : `Demolish (+${fmt(Math.floor(d.cost / 2))})`}</button></div>` : '';
  return `<h3>${esc(d.name)}${(b.lvl || 1) > 1 ? ` <small>${MK[b.lvl]}</small>` : ''}<button class="x" data-act="close" aria-label="Close">×</button></h3><div class="ins-body">${st}<p class="desc">${esc(d.desc)}</p>${body}${demo}</div>`;
}
function inspectTree(t) {
  const sp = TREE_SPECIES[t.sp];
  if (t.sp === 'ancient') return `<h3>The Ancient Oak<button class="x" data-act="close" aria-label="Close">×</button></h3><div class="ins-body"><p class="desc">Older than any record. Trees near it seed twice as readily. It cannot be felled.</p></div>`;
  const st = t.dead ? (t.fallen ? 'Fallen log' : 'Dead') : treeStage(t);
  return `<h3>${sp.name}<button class="x" data-act="close" aria-label="Close">×</button></h3><div class="ins-body">
    <div class="kv"><span>Stage</span><b>${st[0].toUpperCase() + st.slice(1)}</b></div>
    <div class="kv"><span>Age</span><b>${Math.floor(t.age)} days</b></div>
    <div class="kv"><span>Health</span><b class="${t.sick ? 'badt' : ''}">${t.dead ? 'Dead' : t.sick ? `Blighted (day ${t.sick})` : 'Healthy'}</b></div>
    <div class="kv"><span>Timber</span><b>${treeYield(t)} ${itemImg('log')}</b></div>
    <div class="row-btns"><button data-act="marktree">${t.mark ? 'Unmark' : 'Mark for felling'}</button></div></div>`;
}
function inspectBelt(b) {
  return `<h3>Conveyor<button class="x" data-act="close" aria-label="Close">×</button></h3><div class="ins-body">
    <div class="kv"><span>Direction</span><b>${DIR_NAMES[b.dir]}</b></div>
    <div class="kv"><span>Carrying</span><b>${b.item ? itemImg(b.item) + ' ' + ITEMS[b.item].one : 'Nothing'}</b></div>
    <div class="row-btns"><button data-act="rotbelt">Rotate</button><button data-act="rmbelt" class="danger">Remove</button></div></div>`;
}

// ---------- the mill ledger panel ----------
function openPanel(tab) {
  UI.tab = tab || UI.tab; UI.panelOpen = true;
  document.body.classList.add('panel-open');
  $('#panel').hidden = false;
  renderPanel();
}
function closePanel() { UI.panelOpen = false; $('#panel').hidden = true; document.body.classList.remove('panel-open'); }
function renderPanel() {
  if (!UI.panelOpen) return;
  const tabs = [['overview', 'Overview'], ['staff', 'Staff'], ['hire', 'Hire'], ['research', 'Research'], ['trade', 'Trade'], ['letters', 'Letters'], ['story', 'Story'], ['policies', 'Policies'], ['game', 'Save']];
  const unread = G.letters.filter(l => !l.read).length;
  const th = tabs.map(([id, n]) => `<button data-tab="${id}" class="${UI.tab === id ? 'on' : ''}">${n}${id === 'letters' && unread ? ` <i class="badge">${unread}</i>` : ''}${id === 'trade' && G.offers.length ? ` <i class="badge soft">${G.offers.length}</i>` : ''}</button>`).join('');
  const tabEl = $('#panel-tabs');
  if (tabEl._html !== th) { tabEl.innerHTML = th; tabEl._html = th; }
  const fn = { overview: panelOverview, staff: panelStaff, hire: panelHire, research: panelResearch, trade: panelTrade, letters: panelLetters, story: panelStory, policies: panelPolicies, game: panelGame }[UI.tab];
  const html = fn();
  applyHighlights(currentStep());
  const body = $('#panel-body');
  if (body._html !== html) { body.innerHTML = html; body._html = html; if (UI.tab === 'overview') drawCharts(); }
}
function panelOverview() {
  let sup = 0, dem = 0;
  for (const n of G.nets) { sup += n.supply || 0; dem += n.demand || 0; }
  const wages = G.workers.reduce((s, w) => s + w.pay, 0);
  const trend = (k) => { const h = G.market[k].hist; if (h.length < 2) return ''; const d = h[h.length - 1] - h[h.length - 2]; return d > 0.01 ? '<span class="up">▲</span>' : d < -0.01 ? '<span class="down">▼</span>' : '<span class="flat">■</span>'; };
  return `<div class="grid2">
    <section><h4>Business</h4>
      <div class="kv"><span>Cash</span><b>${coin(G.money)}</b></div>
      <div class="kv"><span>Earned to date</span><b>${coin(G.stats.revenue)}</b></div>
      <div class="kv"><span>Spent to date</span><b>${coin(G.stats.spent)}</b></div>
      <div class="kv"><span>Wages per day</span><b>${coin(wages)}</b></div>
      <div class="kv"><span>Reputation</span><b>${G.rep >= 0 ? '+' : ''}${G.rep}</b></div>
      <div class="kv"><span>Mill rank</span><b>${RANKS[rankOf()].name}</b></div>
      <canvas id="chart-money" width="300" height="70" aria-label="Cash over recent days"></canvas>
    </section>
    <section><h4>Forest</h4>
      <div class="kv"><span>Forest cover</span><b class="${G.health < 70 ? 'badt' : ''}">${G.health}%</b></div>
      <div class="kv"><span>Trees standing</span><b>${G.trees.filter(t => !t.dead).length}</b></div>
      <div class="kv"><span>Blighted</span><b>${G.trees.filter(t => t.sick && !t.dead).length}</b></div>
      <div class="kv"><span>Logs felled</span><b>${G.stats.logsCut}</b></div>
      <div class="kv"><span>Saplings planted</span><b>${G.stats.planted}</b></div>
      <canvas id="chart-forest" width="300" height="70" aria-label="Forest cover over recent days"></canvas>
    </section>
    <section><h4>Market prices</h4>
      ${shownItems().map(k => `<div class="kv"><span>${itemImg(k)} ${ITEMS[k].name}</span><b>${marketPrice(k).toFixed(1)} ${trend(k)}</b></div>`).join('')}
      ${G.rivalFlood ? `<p class="note bad">${RIVAL} is undercutting ${ITEMS[G.rivalFlood.item].name.toLowerCase()}.</p>` : ''}
    </section>
    <section><h4>Production</h4>
      <div class="kv"><span>Power</span><b>${Math.round(dem)} used / ${Math.round(sup)} made</b></div>
      ${shownItems().filter(k => k !== 'log').map(k => `<div class="kv"><span>${itemImg(k)} ${ITEMS[k].name} made</span><b>${G.stats.made[k] || 0}</b></div>`).join('')}
      <div class="kv"><span>Buildings</span><b>${G.buildings.length}</b></div>
      <div class="kv"><span>Secrets found</span><b>${G.stats.secrets}/${G.secrets.length}</b></div>
    </section></div>`;
}
// goods the player can make or has made, in the order ITEMS lists them
function shownItems() { const u = unlockedItems(); return Object.keys(ITEMS).filter(k => u.includes(k) || G.stats.made[k] || G.stats.sold[k]); }
function drawCharts() {
  const h = G.stats.history;
  const draw = (id, key, col, fixedMax) => {
    const c = document.getElementById(id); if (!c) return;
    const x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height);
    x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(0, 0, c.width, c.height);
    if (h.length < 2) { x.fillStyle = '#b9a894'; x.font = '12px "Jersey 10", "Pixelify Sans", monospace'; x.fillText('Chart fills in day by day', 10, 40); return; }
    const vals = h.map(e => e[key]);
    const lo = Math.min(0, ...vals), hi = fixedMax || Math.max(...vals, 1);
    x.strokeStyle = 'rgba(239,228,208,0.12)'; x.beginPath(); for (let i = 1; i < 4; i++) { x.moveTo(0, i * c.height / 4); x.lineTo(c.width, i * c.height / 4); } x.stroke();
    x.beginPath();
    vals.forEach((v, i) => { const px = i / (vals.length - 1) * (c.width - 8) + 4, py = c.height - 6 - (v - lo) / (hi - lo || 1) * (c.height - 14); i ? x.lineTo(px, py) : x.moveTo(px, py); });
    x.strokeStyle = col; x.lineWidth = 2; x.stroke();
    x.lineTo(c.width - 4, c.height); x.lineTo(4, c.height); x.closePath(); x.fillStyle = col.replace(')', ',0.15)').replace('rgb', 'rgba'); x.fill();
  };
  draw('chart-money', 'money', 'rgb(243,193,27)');
  draw('chart-forest', 'health', 'rgb(110,200,100)', 120);
}
function panelStaff() {
  if (!G.workers.length) return '<p class="empty">Nobody works here yet. Hire staff from the Hire tab.</p>';
  return `<div class="staff">` + G.workers.map(w => `<div class="srow">
    <img class="portrait sm" src="${portraitURL(w)}" alt="">
    <div class="sname"><b>${esc(w.name)}</b><span class="role" style="background:${ROLES[w.role].color}">${ROLES[w.role].name}</span> <small>${PERSONALITIES[w.pers].name}, level ${w.level}</small><div class="thought sm">${esc(w.thought)}</div></div>
    <div class="smood">${faceSvg(w.mood.overall)}${w.rogue ? '<span class="rogue">Rogue</span>' : ''}</div>
    <div class="pay"><button data-act="payw" data-id="${w.id}" data-v="-5" aria-label="Lower pay">-</button>${coin(w.pay)}<button data-act="payw" data-id="${w.id}" data-v="5" aria-label="Raise pay">+</button></div>
    <div class="row-btns"><button data-act="selw" data-v="${w.id}">View</button><button class="danger" data-act="firew" data-id="${w.id}">${confirming('fire' + w.id) ? 'Confirm' : 'Fire'}</button></div></div>`).join('') + '</div>';
}
function panelHire() {
  const days = 4 - (dayOf() - G.candDay);
  return `<p class="note">Wages are paid every evening. New applicants arrive in ${days} day${days === 1 ? '' : 's'}. <button data-act="refreshcand">Advertise now (${fmt(60)})</button></p><div class="hire">` + G.candidates.map(c => {
    const r = ROLES[c.role];
    return `<div class="hcard" data-role="${c.role}"><div class="hrole" style="background:${r.color}">${r.name}</div>
      <img class="portrait lg" src="${makePortrait(c.ap).toDataURL()}" alt="">
      <div class="hname">${esc(c.name)}</div>
      <dl><dt>Level</dt><dd>${c.level}/5</dd><dt>${r.stat}</dt><dd>${c.skill.toFixed(2)}</dd><dt>Personality</dt><dd title="${esc(PERSONALITIES[c.pers].desc)}">${PERSONALITIES[c.pers].name}</dd><dt>Pay</dt><dd>${coin(c.pay)}</dd></dl>
      <button class="go" data-act="hire" data-id="${c.id}">Hire</button></div>`;
  }).join('') + '</div>';
}
function rankProgress() {
  const r = rankOf(), next = RANKS[r + 1], rev = G.stats.revenue;
  if (!next) return { r, frac: 1, text: 'The top rank' };
  const lo = RANKS[r].need;
  return { r, next, frac: clamp((rev - lo) / (next.need - lo), 0, 1), text: `${fmt(rev)} / ${fmt(next.need)} sold` };
}
function panelResearch() {
  const a = G.research.active, rp = rankProgress();
  const card = (r) => {
    const done = has(r.id), active = a && a.id === r.id, missing = reqList(r).filter(x => !has(x)), low = rankOf() < (r.rank || 0);
    let ctl;
    if (done) ctl = '<span class="done">Researched</span>';
    else if (active) ctl = `<div class="bar"><i class="good" style="width:${(a.prog * 100).toFixed(0)}%"></i></div>`;
    else if (low) ctl = `<span class="lock">Needs the rank of ${esc(RANKS[r.rank].name)}</span>`;
    else if (missing.length) ctl = `<span class="lock">Needs ${missing.map(x => esc(researchName(x))).join(' and ')}</span>`;
    else ctl = `<button class="go" data-act="research" data-v="${r.id}" ${a ? 'disabled' : ''}>Research ${coin(r.cost)}</button>`;
    return `<div class="rcard ${done ? 'is-done' : ''} ${low ? 'is-locked' : ''}"><b>${esc(r.name)}</b><p>${esc(r.desc)}</p><small>${r.days} day${r.days === 1 ? '' : 's'}</small>${ctl}</div>`;
  };
  const head = `<div class="rankbox"><div><b>${esc(RANKS[rp.r].name)}</b> <span>Mill rank ${rp.r + 1} of ${RANKS.length}</span></div>
    <div class="bar"><i class="good" style="width:${(rp.frac * 100).toFixed(0)}%"></i></div>
    <small>${rp.next ? `${rp.text} to become a ${esc(rp.next.name)}` : 'Your mill has reached the top rank.'}</small></div>`;
  return head + RANKS.map((k, i) => {
    const list = RESEARCH.filter(r => (r.rank || 0) === i);
    return list.length ? `<h4 class="rhead">${esc(k.name)}${i ? ` <small>${fmt(k.need)} sold</small>` : ''}</h4><div class="research">${list.map(card).join('')}</div>` : '';
  }).join('');
}
function panelTrade() {
  const offers = G.offers.map(o => {
    const mk = marketPrice(o.item);
    return `<div class="offer"><div class="co"><span class="logo">${esc(o.company[0])}</span><b>${esc(o.company)}</b></div>
      <div class="kv"><span>${itemImg(o.item)} ${o.qty} ${ITEMS[o.item].name}</span><b class="gold">${o.price.toFixed(1)} each</b></div>
      <div class="kv"><span>Market price</span><b>${mk.toFixed(1)}</b></div>
      <div class="kv"><span>Total</span><b>${coin(o.qty * o.price)}</b></div>
      <div class="kv"><span>Deliver within</span><b>${o.days} days</b></div>
      <div class="row-btns"><button class="go" data-act="accept" data-id="${o.id}">Accept</button>${has('trade') && !o.negotiated ? `<button data-act="negotiate" data-id="${o.id}">Negotiate</button>` : ''}</div></div>`;
  }).join('') || '<p class="empty">No offers right now. Companies write in every few days.</p>';
  const contracts = G.contracts.map(c => `<div class="offer active"><div class="co"><span class="logo">${esc(c.company[0])}</span><b>${esc(c.company)}</b></div>
      <div class="kv"><span>${itemImg(c.item)} ${c.delivered}/${c.qty} ${ITEMS[c.item].name}</span><b class="gold">${coin(c.qty * c.price)}</b></div>
      <div class="bar"><i class="good" style="width:${(c.delivered / c.qty * 100).toFixed(0)}%"></i></div>
      <div class="kv"><span>Due</span><b class="${c.deadline - dayOf() <= 1 ? 'badt' : ''}">${dateStr(c.deadline)} (${Math.max(0, c.deadline - dayOf())} days)</b></div></div>`).join('') || '<p class="empty">No active contracts. Goods sent to a Trade Depot fill contracts before they are sold at market price.</p>';
  return `<div class="grid2"><section><h4>Offers</h4>${offers}</section><section><h4>Active contracts</h4>${contracts}</section></div>`;
}
function panelLetters() {
  if (!G.letters.length) return '<p class="empty">No letters.</p>';
  const sel = G.letters.find(l => l.id === UI.letterSel) || G.letters[0];
  sel.read = true;
  return `<div class="letters"><ul>` + G.letters.map(l => `<li><button data-act="letter" data-v="${l.id}" class="${l === sel ? 'on' : ''} ${l.read ? '' : 'unread'} ${l.kind}"><b>${esc(l.subject)}</b><span>${esc(l.from)}, ${dateStr(l.day)}</span></button></li>`).join('') +
    `</ul><article class="paper ${sel.kind === 'journal' ? 'journal' : ''}"><header><b>${esc(sel.subject)}</b><span>From ${esc(sel.from)}<br>${dateStr(sel.day)}</span></header>${sel.body.split('\n\n').map(p => `<p>${esc(p)}</p>`).join('')}${answerHtml(sel)}</article></div>`;
}
function answerHtml(l) {
  if (!l.choices) return '';
  if (l.chosen) { const c = l.choices.find(c => c[0] === l.chosen); return `<p class="answered">You answered: ${esc(c ? c[1] : l.chosen)}</p>`; }
  return `<div class="answers">${l.choices.map(([id, label]) => `<button class="go" data-act="answer" data-id="${l.id}" data-v="${esc(id)}">${esc(label)}</button>`).join('')}</div>`;
}
function panelStory() {
  const st = G.story;
  const chapters = CHAPTERS.map(c => {
    const state = c.n < st.chapter || st.ended ? 'done' : c.n === st.chapter ? 'now' : 'later';
    const goals = state === 'now' && c.goals.length ? `<ul>${c.goals.map(g => `<li class="${st.done.includes(g.id) ? 'ok' : ''}"><span class="box"></span>${esc(g.text)}</li>`).join('')}</ul>` : '';
    return `<li class="ch ${state}"><b>Chapter ${c.n}: ${state === 'later' ? '???' : esc(c.title)}</b>${state === 'done' ? '<span>Complete</span>' : state === 'now' ? '<span>In progress</span>' : ''}${goals}</li>`;
  }).join('');
  const pages = JOURNAL.map(([when, text], i) => i < st.journal ? `<article class="paper journal"><header><b>${esc(when)}</b><span>Page ${i + 1}</span></header><p>${esc(text)}</p></article>` : `<p class="missing">Page ${i + 1}: still somewhere in the forest</p>`).join('');
  return `<div class="grid2"><section><h4>Chapters</h4><ol class="chapters">${chapters}</ol>${st.flags.rival ? `<p class="note">Grindstone: ${st.flags.rival === 'truce' ? 'truce, they take a tenth of depot sales' : 'you refused them, so expect price cuts'}.</p>` : ''}</section>
    <section><h4>Edda Rowan's journal (${st.journal} of ${JOURNAL.length})</h4>${pages}<p class="note">Pages turn up in the old ranger station, under the Ancient Oak, and lying loose in the forest. Explore with your arborists or the Survey tool.</p></section></div>`;
}
// a story letter that needs a decision opens itself and pauses the game
function onAskAnswer() {
  const l = G.letters.find(l => l.choices && !l.chosen);
  if (!l) return;
  UI.letterSel = l.id; UI.resumeSpeed = G.speed || 1;
  setSpeed(0);
  openPanel('letters');
}
function onStoryEnd() {
  const s = G.stats;
  $('#ending').innerHTML = `<h2>The Heartwood Award</h2><div class="end-body">
    <p>You built a mill that feeds a town, kept your crew together, and left the forest thicker than you found it. Edda Rowan would have been proud.</p>
    <dl><dt>Logs felled</dt><dd>${fmt(s.logsCut)}</dd><dt>Saplings planted</dt><dd>${fmt(s.planted)}</dd><dt>Planks made</dt><dd>${fmt(s.made.plank || 0)}</dd><dt>Furniture made</dt><dd>${fmt((s.made.chair || 0) + (s.made.table || 0) + (s.made.crate || 0))}</dd><dt>Contracts filled</dt><dd>${fmt(s.contracts)}</dd><dt>Forest cover</dt><dd>${G.health}%</dd><dt>Days in the valley</dt><dd>${dayOf() + 1}</dd></dl>
    <p class="note">The story is over, but the mill is yours. A few free-play goals are waiting in the corner.</p>
    <div class="row-btns"><button class="go" data-end>Keep playing</button></div></div>`;
  $('#ending').hidden = false;
}
function panelPolicies() {
  const sp = ['spruce', 'maple'].concat(has('birch') ? ['birch'] : [], has('pine') ? ['pine'] : []);
  const p = G.policy;
  return `<div class="policies">
    <label class="pol"><input type="checkbox" id="pol-autochop" data-act="pol" data-v="autoChop" ${p.autoChop ? 'checked' : ''}><span><b>Fell grown trees near camp</b>Lumberjacks fell mature and old trees by themselves when nothing is marked.</span></label>
    <label class="pol"><span><b>Felling radius: ${p.chopRadius} tiles</b>How far from the Mill Office lumberjacks will go. Logging camps add up to 11 tiles around themselves.</span><input type="range" id="pol-radius" min="6" max="30" value="${p.chopRadius}" data-act="radius"></label>
    <label class="pol"><input type="checkbox" id="pol-replant" data-act="pol" data-v="replant" ${p.replant ? 'checked' : ''}><span><b>Replant stumps</b>Arborists plant a sapling on each fresh stump near camp and your logging camps (${fmt(plantCost())} each).</span></label>
    <label class="pol"><input type="checkbox" id="pol-explore" data-act="pol" data-v="explore" ${p.explore ? 'checked' : ''}><span><b>Arborists explore</b>Idle arborists wander to the edge of the known forest.</span></label>
    <div class="pol"><span><b>Sapling species</b>What arborists plant.</span><div class="seg">${sp.map(s => `<button data-act="species" data-v="${s}" class="${G.plantSpecies === s ? 'on' : ''}">${TREE_SPECIES[s].name}</button>`).join('')}</div></div>
  </div>`;
}

function panelGame() {
  const clock = (t) => { const h = (t % 1440) / 60; return `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 6) * 10).padStart(2, '0')}`; };
  const when = (t) => `${dateStr(Math.floor(t / 1440))} at ${clock(t)}, game time`;
  const auto = !autoSaveAvailable()
    ? 'This browser is blocking storage, so autosave is off. Save to a file to keep your progress.'
    : G.autoSavedAt === null ? 'Not autosaved yet. It will save at the end of the day.' : `Autosaved on ${when(G.autoSavedAt)}.`;
  const file = G.fileSavedAt === null ? 'Not saved to a file this session.' : `Saved to a file on ${when(G.fileSavedAt)}.`;
  return `<div class="savetab">
    <h4>Autosave</h4>
    <p>The game saves itself in this browser at the end of every in-game day, and whenever you leave the page. Pick up where you left off with Continue on the title screen.</p>
    <p class="savestate">${auto}</p>
    <h4>Save file</h4>
    <p>Keep a copy on your device as a backup, or to carry on in another browser or on another device. Saving to a file also updates the autosave, and loading a file makes it your autosave.</p>
    <p class="savestate">${file}</p>
    <div class="row-btns"><button class="go" data-act="save">Save to file</button><button data-act="load">Load from file</button></div>
    <p class="note">Ctrl+S (or Cmd+S) saves to a file at any time. Loading replaces the mill you are playing, so save it first if you want to keep it.</p>
    <h4>Start over</h4>
    <p>Begin a new mill on a fresh island, walkthrough and all. This replaces your autosave, so save this mill to a file first if you want to keep it.</p>
    <div class="row-btns">${freshButton('data-act="fresh"')}</div>
  </div>`;
}

function onAction(e) {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  if (e.type === 'click' && (b.tagName === 'INPUT')) return;
  if (e.type === 'change' && b.tagName !== 'INPUT') return;
  const a = b.dataset.act, v = b.dataset.v, id = +b.dataset.id;
  const w = UI.sel && UI.sel.kind === 'worker' ? UI.sel.ref : null;
  const bd = UI.sel && UI.sel.kind === 'building' ? UI.sel.ref : null;
  switch (a) {
    case 'close': UI.sel = null; break;
    case 'instab': UI.insTab = v; break;
    case 'pay': w.pay = Math.max(20, w.pay + +v); break;
    case 'payw': { const x = G.workers.find(o => o.id === id); if (x) x.pay = Math.max(20, x.pay + +v); break; }
    case 'follow': centerOn(w.x, w.y); break;
    case 'fire': if (askConfirm('fire' + w.id)) { fireWorker(w); toast(`${w.name} has left the mill.`); UI.sel = null; } break;
    case 'firew': if (askConfirm('fire' + id)) { const x = G.workers.find(o => o.id === id); if (x) { fireWorker(x); toast(`${x.name} has left the mill.`); } } break;
    case 'selw': { const x = G.workers.find(o => o.id === +v); if (x) { G.tutor.selected = true; UI.sel = { kind: 'worker', ref: x }; UI.insTab = 'summary'; centerOn(x.x, x.y); } break; }
    case 'recipe': bd.recipe = v; bd.prog = 0; break;
    case 'upgrade': upgradeMachine(bd); break;
    case 'byp': bd.byOn = !bd.byOn; break;
    case 'filter': bd.filter = ITEMS[v] ? v : null; break;
    case 'rotb': bd.dir = (bd.dir + 1) % 4; break;
    case 'demolish': if (askConfirm('demo' + bd.id)) { removeBuilding(bd); UI.sel = null; } break;
    case 'marktree': UI.sel.ref.mark = !UI.sel.ref.mark; break;
    case 'rotbelt': UI.sel.ref.dir = (UI.sel.ref.dir + 1) % 4; break;
    case 'rmbelt': removeBelt(UI.sel.ref.x, UI.sel.ref.y); UI.sel = null; break;
    case 'open': openPanel(v); break;
    case 'hire': { const c = G.candidates.find(c => c.id === id); if (c) { G.candidates.splice(G.candidates.indexOf(c), 1); hireWorker(c); } break; }
    case 'refreshcand': if (spend(60, 'advertising')) refreshCandidates(); break;
    case 'research': startResearch(RESEARCH.find(r => r.id === v)); break;
    case 'accept': { const o = G.offers.find(o => o.id === id); if (o) acceptOffer(o); break; }
    case 'negotiate': { const o = G.offers.find(o => o.id === id); if (o) negotiate(o); break; }
    case 'letter': UI.letterSel = +v; break;
    case 'answer': { const l = G.letters.find(l => l.id === id); if (l) { answerLetter(l, v); if (!G.speed) setSpeed(UI.resumeSpeed || 1); } break; }
    case 'pol': G.policy[v] = b.checked; break;
    case 'radius': G.policy.chopRadius = +b.value; break;
    case 'species': G.plantSpecies = v; break;
    case 'save': saveToFile(); return;
    case 'fresh': if (askConfirm('fresh')) { startFresh(); return; } break;
    case 'load': openLoadDialog(); return;
  }
  renderInspector(); renderPanel(); updateHud();
}

// ---------- world input ----------
const pointers = new Map();
let pan = null, pinch = null;
function initInput() {
  const cv = R.cv;
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    closeFlyout();
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: R.cam.s, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      UI.drag = null; pan = null; return;
    }
    const right = e.button === 2 || e.button === 1;
    if (right && UI.tool !== 'select' && e.button === 2) { pan = { x: e.clientX, y: e.clientY, moved: 0, cancelTool: true }; return; }
    if (right || UI.tool === 'select') { pan = { x: e.clientX, y: e.clientY, moved: 0 }; return; }
    const t = tileAtCss(e.clientX, e.clientY);
    UI.hover = t;
    if (e.shiftKey) UI.unmark = true;
    UI.drag = { x: t.x, y: t.y };
  });
  cv.addEventListener('pointermove', e => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      R.cam.x -= (cx - pinch.cx) / R.cam.s; R.cam.y -= (cy - pinch.cy) / R.cam.s; pinch.cx = cx; pinch.cy = cy;
      const ns = nearestZoom(pinch.s * d / pinch.d);
      if (ns !== R.cam.s) setZoom(ns, cx, cy);
      clampCam();
      return;
    }
    const t = tileAtCss(e.clientX, e.clientY);
    UI.hover = t;
    UI.hoverWorker = workerAt(e.clientX, e.clientY);
    if (pan) {
      const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
      pan.moved += Math.abs(dx) + Math.abs(dy);
      if (pan.moved > 6) { R.cam.x -= dx / R.cam.s; R.cam.y -= dy / R.cam.s; clampCam(); if (playing) G.tutor.panned = true; }
      pan.x = e.clientX; pan.y = e.clientY;
    }
    showTip(e, t);
    cv.style.cursor = pan && pan.moved > 6 ? 'grabbing' : UI.tool === 'select' ? (UI.hoverWorker || hoverClickable(t) ? 'pointer' : 'default') : 'crosshair';
  });
  const up = (e) => {
    pointers.delete(e.pointerId);
    if (pinch) { if (pointers.size < 2) pinch = null; return; }
    if (pan) {
      if (pan.moved <= 6) { if (pan.cancelTool) setTool('select'); else if (UI.tool === 'select') clickSelect(e.clientX, e.clientY); }
      pan = null; return;
    }
    if (UI.drag) { applyTool(e.shiftKey); UI.drag = null; if (!e.shiftKey && UI.tool !== 'chop' && UI.tool !== 'plant') UI.unmark = false; }
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', e => { pointers.delete(e.pointerId); pinch = null; pan = null; UI.drag = null; });
  cv.addEventListener('pointerleave', () => { $('#tip').hidden = true; if (!pan && !UI.drag) { UI.hover = null; UI.hoverWorker = null; } });
  // wheel: add up scroll distance so one zoom step needs about two notches of a mouse wheel
  let wheelAcc = 0, wheelT = 0;
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    const now = performance.now();
    if (now - wheelT > 350 || Math.sign(dy) !== Math.sign(wheelAcc)) wheelAcc = 0;
    wheelT = now; wheelAcc += dy;
    const need = e.ctrlKey ? 60 : 200; // trackpad pinches arrive as small ctrl+wheel steps
    if (Math.abs(wheelAcc) >= need) { zoomStep(wheelAcc < 0 ? 1 : -1, e.clientX, e.clientY); wheelAcc = 0; }
  }, { passive: false });
  const keys = new Set();
  window.addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    if (!G || !$('#title').hidden) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); saveToFile(); return; }
    keys.add(k);
    if (k === 'escape') { if (UI.tool !== 'select') setTool('select'); else if (UI.panelOpen) closePanel(); else { UI.sel = null; renderInspector(); } closeFlyout(); }
    if (k === 'r' && (UI.tool === 'belt' || (BDEF[UI.tool] && BDEF[UI.tool].dir))) { UI.beltDir = (UI.beltDir + (e.shiftKey ? 3 : 1)) % 4; updateHint(); }
    if (k === ' ') { e.preventDefault(); setSpeed(G.speed ? 0 : (UI.lastSpeed || 1)); }
    if (k === 'shift' && (UI.tool === 'chop' || UI.tool === 'plant')) { UI.unmark = true; updateHint(); }
    const map = { v: 'select', '1': 'camp', '2': 'factory', '3': 'power', '4': 'logi', c: 'belt', f: 'chop', p: 'plant', t: 'path', b: 'bulldoze', x: 'survey', m: 'mill' };
    if (map[k] && !e.ctrlKey && !e.metaKey) pickTool(map[k]);
    if (k === 'n' && !e.ctrlKey && !e.metaKey) UI.toggleSound();
    if (k === '=' || k === '+' || k === 'e') zoomStep(1);
    if (k === '-' || k === 'q') zoomStep(-1);
  });
  window.addEventListener('keyup', e => {
    const k = e.key.toLowerCase(); keys.delete(k);
    if (k === 'shift' && (UI.tool === 'chop' || UI.tool === 'plant')) { UI.unmark = false; updateHint(); }
  });
  window.addEventListener('blur', () => keys.clear());
  UI.keys = keys;
  window.addEventListener('resize', () => { resize(); });
}
function panKeys(dt) {
  const k = UI.keys; if (!k || !k.size) return;
  const sp = 420 * dt / R.cam.s;
  if (playing && ['w', 's', 'a', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].some(x => k.has(x))) G.tutor.panned = true;
  if (k.has('w') || k.has('arrowup')) R.cam.y -= sp;
  if (k.has('s') || k.has('arrowdown')) R.cam.y += sp;
  if (k.has('a') || k.has('arrowleft')) R.cam.x -= sp;
  if (k.has('d') || k.has('arrowright')) R.cam.x += sp;
  clampCam();
}
function workerAt(cssX, cssY) {
  const [wx, wy] = screenToWorld(cssX, cssY);
  let best = null, bd = 1e9;
  for (const w of G.workers) {
    if (w.hidden) continue;
    const x = isoX(w.x, w.y), y = isoY(w.x, w.y);
    if (Math.abs(wx - x) <= 5 && wy <= y + 2 && wy >= y - 17) { const d = Math.abs(wy - (y - 8)); if (d < bd) { bd = d; best = w; } }
  }
  return best;
}
function hoverClickable(t) {
  if (!inMap(t.x, t.y)) return false;
  const k = idx(t.x, t.y);
  return !!(G.occ[k] || G.tree[k] || G.belt[k] || G.secrets.some(s => s.found && !s.done && s.x === t.x && s.y === t.y));
}
function clickSelect(cssX, cssY) {
  const w = workerAt(cssX, cssY);
  if (w) { UI.sel = { kind: 'worker', ref: w }; UI.insTab = 'summary'; G.tutor.selected = true; renderInspector(); return; }
  const t = tileAtCss(cssX, cssY);
  if (!inMap(t.x, t.y)) { UI.sel = null; renderInspector(); return; }
  const s = G.secrets.find(s => s.found && !s.done && Math.abs(s.x - t.x) <= 1 && Math.abs(s.y - t.y) <= 1 && (s.x === t.x && s.y === t.y || s.kind === 'ruin'));
  if (s) { collectSecret(s); return; }
  const b = bAt(t.x, t.y);
  if (b) { UI.sel = { kind: 'building', ref: b }; renderInspector(); return; }
  // trees are tall: also try the tiles just in front of the cursor
  for (const [dx, dy] of [[0, 0], [1, 1], [1, 0], [0, 1], [2, 2]]) {
    const x = t.x + dx, y = t.y + dy;
    if (!inMap(x, y)) continue;
    const tr = G.tree[idx(x, y)];
    if (tr && G.reveal[idx(x, y)]) { UI.sel = { kind: 'tree', ref: tr }; renderInspector(); return; }
    if (dx === 0 && G.belt[idx(x, y)]) { UI.sel = { kind: 'belt', ref: G.belt[idx(x, y)] }; renderInspector(); return; }
  }
  UI.sel = null; renderInspector();
}
// a label that follows the cursor and names what is under it
function showTip(e, t) {
  const tip = $('#tip');
  let text = '';
  if (UI.tool === 'select' && !(pan && pan.moved > 6) && !UI.hoverWorker && inMap(t.x, t.y) && e.pointerType === 'mouse') {
    const k = idx(t.x, t.y), b = bAt(t.x, t.y);
    const s = G.secrets.find(s => s.found && !s.done && s.x === t.x && s.y === t.y);
    if (s) text = `${SECRET_INFO[s.kind].name}: click to investigate`;
    else if (b) {
      const d = BDEF[b.type];
      const state = b.broken ? 'broken down' : b.type === 'steam' ? (b.gen > 0 ? 'running' : 'out of fuel') : b.type === 'wheel' ? (b.active ? 'turning' : 'not connected') : d.recipes ? (b.active ? 'working' : b.wants ? 'no power' : 'waiting for materials') : d.cap ? `holding ${b.out.length}` : '';
      text = d.name + ((b.lvl || 1) > 1 ? ` ${MK[b.lvl]}` : '') + (state ? `: ${state}` : '');
    } else if (G.tree[k] && G.reveal[k]) {
      const tr = G.tree[k];
      text = tr.sp === 'ancient' ? 'The Ancient Oak' : `${TREE_SPECIES[tr.sp].name}, ${tr.dead ? 'dead' : treeStage(tr)}${tr.sick ? ', blighted' : ''}${tr.mark ? ', marked' : ''}`;
    } else if (G.belt[k]) text = 'Conveyor';
  }
  tip.hidden = !text;
  if (text) { tip.textContent = text; tip.style.left = (e.clientX + 16) + 'px'; tip.style.top = (e.clientY + 18) + 'px'; }
}
function applyTool(keepTool) {
  const tool = UI.tool, h = UI.hover;
  if (!h) return;
  if (BDEF[tool]) {
    const d = BDEF[tool];
    const b = placeBuilding(tool, h.x - Math.floor((d.w - 1) / 2), h.y - Math.floor((d.h - 1) / 2), false, UI.beltDir);
    if (b && !keepTool) setTool('select'); // one building per pick; Shift keeps the tool for more
    return;
  }
  const tiles = UI.dragTiles();
  let n = 0;
  if (tool === 'belt') {
    for (const [x, y, dir] of tiles) if (placeBelt(x, y, dir)) n++;
    if (tiles.length && UI.drag) UI.beltDir = tiles[tiles.length - 1][2];
  } else if (tool === 'path') {
    for (const [x, y] of tiles) {
      if (!inMap(x, y)) continue;
      const k = idx(x, y);
      if (G.tiles[k] !== 1 || G.occ[k] || !G.reveal[k]) continue;
      if (G.tree[k]) continue;
      if (!spend(TOOLS.path.cost, 'a path')) break;
      G.tiles[k] = 2; G.stump[k] = 0; G.plantMark[k] = 0; markDirty(x, y, x, y); n++;
      sfx('place', x + 0.5, y + 0.5);
    }
  } else if (tool === 'chop') {
    for (const [x, y] of tiles) { if (!inMap(x, y)) continue; const t = G.tree[idx(x, y)]; if (t && t.sp !== 'ancient' && G.reveal[idx(x, y)] && treeStage(t) !== 'sapling') { t.mark = !UI.unmark; n++; } }
    if (n) toast(`${n} tree${n > 1 ? 's' : ''} ${UI.unmark ? 'unmarked' : 'marked for felling'}.`);
    if (!UI.unmark) G.tutor.marked = (G.tutor.marked || 0) + n;
  } else if (tool === 'plant') {
    for (const [x, y] of tiles) { if (!inMap(x, y)) continue; const k = idx(x, y); if (UI.unmark) { if (G.plantMark[k]) { G.plantMark[k] = 0; n++; } } else if (plantable(x, y) && G.reveal[k]) { G.plantMark[k] = 1; n++; } }
    if (n && !UI.unmark && !G.workers.some(w => w.role === 'arborist')) toast('Marked. Hire an Arborist to plant these.', 'bad');
  } else if (tool === 'bulldoze') {
    const seen = new Set();
    for (const [x, y] of tiles) {
      if (!inMap(x, y)) continue;
      const k = idx(x, y);
      const b = bAt(x, y);
      if (b && !seen.has(b.id)) { seen.add(b.id); removeBuilding(b); continue; }
      if (G.belt[k]) { removeBelt(x, y); continue; }
      if (G.plantMark[k]) { G.plantMark[k] = 0; continue; }
      if (G.stump[k]) { G.stump[k] = 0; continue; }
      const t = G.tree[k];
      if (t && t.sp !== 'ancient' && !t.res && G.reveal[k]) { if (!spend(15, 'clearing a tree')) break; removeTree(x, y); continue; }
      if (G.tiles[k] === 2) { G.tiles[k] = 1; markDirty(x, y, x, y); }
    }
  } else if (tool === 'survey') {
    if (inMap(h.x, h.y) && spend(TOOLS.survey.cost, 'a survey')) { revealCircle(h.x + 0.5, h.y + 0.5, 6.5); toast('The survey crew maps a new stretch of forest.'); }
  }
}

// ---------- minimap: the island drawn as a small diamond, 1.5 px per tile ----------
const MINI = { w: 216, h: 110, s: 1.5, img: null, tick: 0 };
const MINI_TREE = {
  spruce: ['#2f7a3c', '#2f7a3c', '#2f7a3c', '#e6edf2'], pine: ['#2a6a48', '#2a6a48', '#2a6a48', '#e6edf2'],
  maple: ['#86c95a', '#468c3b', '#d2671f', '#6e5442'], birch: ['#b0dc6a', '#619b44', '#e3be45', '#8a7a6a'], ancient: ['#58ad52', '#58ad52', '#58ad52', '#58ad52'],
};
const MINI_GRASS = ['#4f8444', '#4a7b3e', '#46703f', '#dfe7ee'];
function initMinimap() {
  const cv = $('#mini');
  MINI.ctx = cv.getContext('2d');
  const jump = (e) => {
    const r = cv.getBoundingClientRect();
    const mx = (e.clientX - r.left) / r.width * MINI.w, my = (e.clientY - r.top) / r.height * MINI.h;
    R.cam.x = (mx - MINI.w / 2) / MINI.s * HTW; R.cam.y = my / (MINI.s / 2) * HTH; clampCam();
    if (playing) G.tutor.panned = true;
    drawMinimap(false);
  };
  let down = false;
  cv.addEventListener('pointerdown', e => { down = true; cv.setPointerCapture(e.pointerId); jump(e); });
  cv.addEventListener('pointermove', e => { if (down) jump(e); });
  cv.addEventListener('pointerup', () => { down = false; });
  $('#map-toggle').addEventListener('click', () => {
    const c = $('#minimap').classList.toggle('collapsed');
    applyReveal(currentStep());
    $('#map-toggle').textContent = c ? 'Map' : '–';
    $('#map-toggle').setAttribute('aria-label', c ? 'Show map' : 'Hide map');
  });
}
function drawMinimap(full) {
  const c = MINI.ctx;
  if (!c || !G) return;
  if (full || !MINI.img) {
    const id = c.createImageData(MINI.w, MINI.h), u = new Uint32Array(id.data.buffer);
    const se = seasonOf();
    const grass = C(MINI_GRASS[se]), path = P.dirt, water = C('#1d6d93'), fogL = C('#1f2c22'), fogW = C('#0f1a20'), dead = C('#776657'), belt = C('#2d2a2d'), bld = C('#ead9b4'), hq = C('#f3c11b');
    for (let my = 0; my < MINI.h; my++) for (let mx = 0; mx < MINI.w; mx++) {
      const a = (mx + 0.5 - MINI.w / 2) / MINI.s, b = (my + 0.5) / (MINI.s / 2); // a = x - y, b = x + y
      const x = Math.floor((a + b) / 2), y = Math.floor((b - a) / 2);
      if (!inMap(x, y)) continue;
      const k = idx(x, y), land = G.tiles[k] !== 0;
      let col;
      if (!G.reveal[k]) col = land ? fogL : fogW;
      else if (!land) col = water;
      else if (G.occ[k]) col = G.occ[k] === G.hq.id ? hq : bld;
      else if (G.belt[k]) col = belt;
      else if (G.tree[k] && G.tree[k].fire > 0) col = C('#ff5a2a');
      else if (G.tree[k] && G.tree[k].age > 3) col = G.tree[k].dead ? dead : C(MINI_TREE[G.tree[k].sp][se]);
      else col = G.tiles[k] === 2 ? path : grass;
      u[my * MINI.w + mx] = col;
    }
    MINI.img = id;
  }
  c.putImageData(MINI.img, 0, 0);
  const pt = (x, y) => [(x - y) * MINI.s + MINI.w / 2, (x + y) * MINI.s / 2];
  for (const w of G.workers) { if (w.hidden) continue; const [x, y] = pt(w.x, w.y); c.fillStyle = '#ffffff'; c.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2); }
  for (const s of G.secrets) if (s.found && !s.done && s.kind !== 'ancient') { const [x, y] = pt(s.x + 0.5, s.y + 0.5); c.fillStyle = (MINI.tick & 2) ? '#f3c11b' : '#fff6c0'; c.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3); }
  // the part of the island in view
  // world pixels map to the minimap as x / HTW * s across and y / HTH * s / 2 down
  const vw = R.cv.width / HTW * MINI.s, vh = R.cv.height / HTH * MINI.s / 2;
  const cx = R.cam.x / HTW * MINI.s + MINI.w / 2, cy = R.cam.y / HTH * MINI.s / 2;
  c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 1;
  c.strokeRect(Math.round(cx - vw / 2) + 0.5, Math.round(cy - vh / 2) + 0.5, Math.round(vw), Math.round(vh));
}

function uiTick() {
  if (playing) checkGoals(); // also while paused, so tutorial steps tick over
  updateHud();
  const mm = $('#minimap'); // skip drawing while hidden (collapsed, or on a phone)
  if (!mm.classList.contains('collapsed') && mm.getClientRects().length && getComputedStyle(mm).display !== 'none') drawMinimap(MINI.tick++ % 4 === 0);
  if (!UI.pointerInPanel) { renderInspector(); renderPanel(); }
}
