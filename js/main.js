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
  beginPlay();
}
function beginPlay() {
  $('#title').hidden = true; playing = true;
  setSpeed(tutorialActive() ? 0 : 1); // the walkthrough starts with the clock stopped
  lastAutoDay = dayOf();
  const c = bCenter(G.hq); centerOn(c.x + 1, c.y + 1);
  if (tutorialActive()) R.cam.y -= 40; // keep the camp clear of the coach card
  updateHud();
}
// throw away the current mill and begin again on a new island, walkthrough and all
function startFresh() {
  newWorld((Math.random() * 1e9) >>> 0);
  closePanel(); closeFlyout(); setTool('select');
  $('#help').hidden = true; $('#ending').hidden = true;
  UI.confirm = null; UI.letterSel = null; coachKey = ''; R.ring = null; R.fireflies.length = 0;
  beginPlay();
  autoSave(); // the new mill becomes what Continue loads
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
  // browsers only allow sound after the player interacts with the page
  window.addEventListener('pointerdown', audioStart, true);
  window.addEventListener('keydown', audioStart, true);
  // autosave when the player leaves or switches away
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') autoSave(); });
  window.addEventListener('pagehide', autoSave);
  $('#btn-reroll').addEventListener('click', () => newWorld((Math.random() * 1e9) >>> 0));
  $('#btn-load').addEventListener('click', openLoadDialog);
  requestAnimationFrame(frame);
}

function frame(now) {
  requestAnimationFrame(frame); // scheduled first, so an error in one frame can't stop the game
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
  updateAmbience(dt, playing);
  panKeys(dt);
  render(now);
  updatePointer();
  uiAcc += dt;
  if (uiAcc > 0.25) { uiAcc = 0; uiTick(); }
}

window.addEventListener('DOMContentLoaded', boot);
