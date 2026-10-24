'use strict';
// Boot, title screen and the main loop.

let lastFrame = 0, uiAcc = 0, playing = false;

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
  $('#btn-start').addEventListener('click', () => {
    $('#title').hidden = true; playing = true;
    setSpeed(1);
    const c = bCenter(G.hq); centerOn(c.x + 1, c.y + 1);
    toast('Your crew is ready. Work through the goals to learn the ropes.', 'good');
  });
  $('#btn-reroll').addEventListener('click', () => newWorld((Math.random() * 1e9) >>> 0));
  requestAnimationFrame(frame);
}

function frame(now) {
  const dt = Math.min(0.1, lastFrame ? (now - lastFrame) / 1000 : 0);
  lastFrame = now;
  if (playing && G.speed > 0) {
    let tot = dt * G.speed;
    while (tot > 1e-6) { const st = Math.min(tot, 0.05); simStep(st); tot -= st; }
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
