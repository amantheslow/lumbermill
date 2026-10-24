'use strict';
// Boot, title screen and the main loop.

let lastFrame = 0, uiAcc = 0, playing = false, lastAutoDay = 0;

function newWorld(seed) {
  newGame(seed);
  computeWaterDist();
  G.dirty = { x0: 0, y0: 0, x1: MAP - 1, y1: MAP - 1 };
  UI.sel = null; UI.letterSel = null;
  const c = bCenter(G.hq);
  centerOn(c.x + 1, c.y + 1);
  lastHud = '';
  $('#seed').textContent = seed;
  if (UI.panelOpen) renderPanel();
  renderInspector();
}

function afterLoad(cam, msg) {
  computeWaterDist();
  UI.sel = null; UI.letterSel = null; UI.drag = null; UI.confirm = null;
  lastHud = '';
  $('#seed').textContent = G.seed;
  closePanel(); closeFlyout(); setTool('select'); renderInspector();
  if (typeof cam.s === 'number' && isFinite(cam.x) && isFinite(cam.y)) {
    R.cam.s = clamp(Math.round(cam.s), 1, 6); resize();
    R.cam.x = cam.x; R.cam.y = cam.y; clampCam();
  } else { const c = bCenter(G.hq); centerOn(c.x + 1, c.y + 1); }
  $('#title').hidden = true; playing = true;
  setSpeed(1);
  lastAutoDay = dayOf();
  autoSave();
  toast(msg || `Mill loaded: ${dateStr()}.`, 'good');
}

// the title screen offers to continue from this browser's autosave
function setupTitle() {
  const sum = autoSaveSummary(readAutoSave());
  $('#btn-continue').hidden = !sum;
  $('#continue-info').hidden = !sum;
  if (sum) $('#continue-info').textContent = `Autosave: ${sum}`;
  $('#btn-start').classList.toggle('go', !sum);
  $('#btn-start').textContent = sum ? 'Start a new mill' : 'Start the mill';
}
function startNew() {
  const b = $('#btn-start');
  if (!$('#btn-continue').hidden && !b.dataset.sure) {
    b.dataset.sure = '1'; b.textContent = 'Click again to replace your autosave';
    setTimeout(() => { delete b.dataset.sure; setupTitle(); }, 4000);
    return;
  }
  $('#title').hidden = true; playing = true;
  setSpeed(1);
  lastAutoDay = dayOf();
  const c = bCenter(G.hq); centerOn(c.x + 1, c.y + 1);
  toast('Your crew is ready. Work through the goals to learn the ropes.', 'good');
}

function boot() {
  bakeArt();
  newGame((Math.random() * 1e9) >>> 0);
  initRender();
  buildHud();
  initInput();
  newWorld(G.seed);
  R.cam.s = window.innerWidth < 700 ? 2 : 3; resize();
  if (window.innerWidth < 700) { $('#goals').classList.add('collapsed'); $('#goals-toggle').textContent = '+'; }
  setSpeed(0);
  $('#btn-start').addEventListener('click', startNew);
  $('#btn-continue').addEventListener('click', continueFromAutoSave);
  setupTitle();
  // autosave when the player leaves or switches away
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') autoSave(); });
  window.addEventListener('pagehide', autoSave);
  $('#btn-reroll').addEventListener('click', () => newWorld((Math.random() * 1e9) >>> 0));
  $('#btn-load').addEventListener('click', openLoadDialog);
  requestAnimationFrame(frame);
}

function frame(now) {
  const dt = Math.min(0.1, lastFrame ? (now - lastFrame) / 1000 : 0);
  lastFrame = now;
  if (playing && G.speed > 0) {
    let tot = dt * G.speed;
    while (tot > 1e-6) { const st = Math.min(tot, 0.05); simStep(st); tot -= st; }
    if (dayOf() !== lastAutoDay) { lastAutoDay = dayOf(); autoSave(); }
  }
  if (!playing) { R.cam.x += dt * 5; if (R.cam.x > MAP * HTW * 0.6) R.cam.x = -MAP * HTW * 0.6; }
  if (G.speed) UI.lastSpeed = G.speed;
  updateFx(dt);
  panKeys(dt);
  render(now);
  uiAcc += dt;
  if (uiAcc > 0.25) { uiAcc = 0; uiTick(); }
  requestAnimationFrame(frame);
}

window.addEventListener('DOMContentLoaded', boot);
