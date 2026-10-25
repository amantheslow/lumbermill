'use strict';
// Sound: everything is synthesised with Web Audio, so there are no audio files.
// Sounds in the world are placed by where they happen on screen; ambience follows the time of day.

const AUD = { ctx: null, master: null, noise: null, muted: false, last: {}, loops: {}, birdT: 2, cricketT: 1, vol: 0.55 };
try { AUD.muted = localStorage.getItem('heartwood-mill-sound') === 'off'; } catch { /* storage blocked: default on */ }

function audioStart() { // must run inside a user gesture
  if (AUD.ctx) { if (AUD.ctx.state === 'suspended') AUD.ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try { AUD.ctx = new AC(); } catch { return; }
  const c = AUD.ctx;
  AUD.master = c.createGain();
  AUD.master.gain.value = AUD.muted ? 0 : AUD.vol;
  const comp = c.createDynamicsCompressor();
  AUD.master.connect(comp); comp.connect(c.destination);
  const len = c.sampleRate;
  AUD.noise = c.createBuffer(1, len, c.sampleRate);
  const d = AUD.noise.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
}
function setMuted(m) {
  AUD.muted = m;
  try { localStorage.setItem('heartwood-mill-sound', m ? 'off' : 'on'); } catch { /* ignore */ }
  if (AUD.master) AUD.master.gain.setTargetAtTime(m ? 0 : AUD.vol, AUD.ctx.currentTime, 0.05);
}

// ---------- building blocks ----------
function out(vol, pan) {
  const c = AUD.ctx, g = c.createGain();
  g.gain.value = vol;
  if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); g.connect(p); p.connect(AUD.master); }
  else g.connect(AUD.master);
  return g;
}
function tone(dest, { type = 'sine', f0, f1, t = 0, dur, vol = 1, attack = 0.005 }) {
  const c = AUD.ctx, o = c.createOscillator(), g = c.createGain(), now = c.currentTime + t;
  o.type = type; o.frequency.setValueAtTime(f0, now);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, now + dur);
  g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(vol, now + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.connect(g); g.connect(dest); o.start(now); o.stop(now + dur + 0.05);
}
function noise(dest, { t = 0, dur, vol = 1, filter = 'bandpass', freq = 1000, q = 1, f1, attack = 0.002 }) {
  const c = AUD.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), now = c.currentTime + t;
  s.buffer = AUD.noise; s.loop = true;
  f.type = filter; f.frequency.setValueAtTime(freq, now); f.Q.value = q;
  if (f1) f.frequency.exponentialRampToValueAtTime(f1, now + dur);
  g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(vol, now + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  s.connect(f); f.connect(g); g.connect(dest);
  s.start(now, Math.random() * 0.5); s.stop(now + dur + 0.05);
}

// where a world sound sits relative to the view: volume and stereo pan, or null when far off screen
function placeSound(tx, ty) {
  if (tx === undefined || !R.cv) return { vol: 1, pan: 0 };
  const sx = isoX(tx, ty) + R.ox, sy = isoY(tx, ty) + R.oy, w = R.cv.width, h = R.cv.height;
  const dx = Math.max(0, -sx, sx - w) / w, dy = Math.max(0, -sy, sy - h) / h;
  const off = Math.hypot(dx, dy);
  if (off > 0.35) return null;
  const zoom = clamp(R.cam.s / 3, 0.55, 1.25);
  return { vol: (1 - off / 0.35) * zoom, pan: (sx / w) * 1.4 - 0.7 };
}

// ---------- one-shot effects ----------
const SFX = {
  chop(d) { noise(d, { dur: 0.09, vol: 0.5, freq: 900, q: 1.4 }); tone(d, { type: 'triangle', f0: 170, f1: 70, dur: 0.12, vol: 0.55 }); },
  fall(d) {
    tone(d, { type: 'sawtooth', f0: 220, f1: 70, dur: 0.7, vol: 0.06, attack: 0.15 });
    noise(d, { t: 0.55, dur: 0.6, vol: 0.55, filter: 'lowpass', freq: 900, f1: 150 });
    tone(d, { t: 0.55, f0: 90, f1: 40, dur: 0.4, vol: 0.5 });
    for (let i = 0; i < 4; i++) noise(d, { t: 0.62 + i * 0.07, dur: 0.05, vol: 0.18, freq: 2500 + i * 400, q: 3 });
  },
  build(d) { tone(d, { type: 'triangle', f0: 140, f1: 60, dur: 0.18, vol: 0.6 }); noise(d, { dur: 0.15, vol: 0.3, filter: 'lowpass', freq: 600 }); tone(d, { t: 0.12, type: 'triangle', f0: 180, f1: 80, dur: 0.12, vol: 0.4 }); },
  place(d) { tone(d, { type: 'square', f0: 420, f1: 300, dur: 0.05, vol: 0.08 }); },
  coin(d) { tone(d, { type: 'square', f0: 1320, dur: 0.07, vol: 0.06 }); tone(d, { type: 'square', f0: 1760, t: 0.07, dur: 0.16, vol: 0.06 }); },
  cash(d) { [784, 988, 1175, 1568].forEach((f, i) => tone(d, { type: 'square', f0: f, t: i * 0.07, dur: 0.18, vol: 0.06 })); },
  clank(d) { [310, 467, 733].forEach(f => tone(d, { type: 'square', f0: f, f1: f * 0.7, dur: 0.35, vol: 0.07 })); noise(d, { dur: 0.25, vol: 0.4, freq: 3000, q: 2 }); },
  level(d) { [523, 659, 784, 1047].forEach((f, i) => tone(d, { type: 'triangle', f0: f, t: i * 0.09, dur: 0.22, vol: 0.25 })); },
  letter(d) { noise(d, { dur: 0.18, vol: 0.25, filter: 'highpass', freq: 3000, f1: 6000 }); tone(d, { t: 0.1, f0: 1046, dur: 0.3, vol: 0.12 }); },
  bad(d) { tone(d, { type: 'square', f0: 330, t: 0, dur: 0.14, vol: 0.06 }); tone(d, { type: 'square', f0: 247, t: 0.14, dur: 0.22, vol: 0.06 }); },
  click(d) { tone(d, { type: 'square', f0: 900, f1: 600, dur: 0.03, vol: 0.05 }); },
  plant(d) { noise(d, { dur: 0.12, vol: 0.3, filter: 'lowpass', freq: 500 }); tone(d, { t: 0.05, f0: 660, f1: 990, dur: 0.12, vol: 0.08 }); },
  secret(d) { [659, 784, 988, 1319, 1568].forEach((f, i) => tone(d, { type: 'sine', f0: f, t: i * 0.08, dur: 0.4, vol: 0.15 })); },
  bird(d) { const f = rf(2600, 3800); for (let i = 0, n = ri(2, 4); i < n; i++) tone(d, { f0: f * rf(0.9, 1.1), f1: f * rf(1.2, 1.5), t: i * rf(0.09, 0.14), dur: 0.08, vol: 0.05 }); },
  cricket(d) { const f = rf(4200, 4700); for (let i = 0; i < 3; i++) tone(d, { type: 'triangle', f0: f, t: i * 0.05, dur: 0.035, vol: 0.02 }); },
};
const MIN_GAP = { chop: 0.07, coin: 0.12, place: 0.04, click: 0.03, plant: 0.1, fall: 0.15, build: 0.1 };

function sfx(name, tx, ty) {
  if (!AUD.ctx || AUD.muted || AUD.ctx.state !== 'running') return;
  const now = AUD.ctx.currentTime;
  if (now - (AUD.last[name] || 0) < (MIN_GAP[name] || 0.05)) return;
  const pl = placeSound(tx, ty);
  if (!pl || pl.vol < 0.02) return;
  AUD.last[name] = now;
  SFX[name](out(pl.vol, pl.pan));
}

// ---------- loops and ambience ----------
function loopNode(name, build) {
  if (!AUD.loops[name]) { const g = AUD.ctx.createGain(); g.gain.value = 0; g.connect(AUD.master); build(g); AUD.loops[name] = g; }
  return AUD.loops[name];
}
function setLoop(name, vol, build) {
  if (vol <= 0.001 && !AUD.loops[name]) return;
  loopNode(name, build).gain.setTargetAtTime(vol, AUD.ctx.currentTime, 0.25);
}
function updateAmbience(dt, playing) {
  if (!AUD.ctx || AUD.ctx.state !== 'running') return;
  const live = playing && G && G.speed > 0;
  // machines heard on screen
  let saw = 0, steam = 0, fire = 0;
  if (live) for (const b of G.buildings) {
    const pl = (b.type === 'sawmill' && b.active) || (b.type === 'workshop' && b.active) || (b.type === 'steam' && b.gen > 0) || b.type === 'campfire' ? placeSound(b.x + b.w / 2, b.y + b.h / 2) : null;
    if (!pl) continue;
    if (b.type === 'sawmill') saw += pl.vol; else if (b.type === 'workshop') saw += pl.vol * 0.4;
    else if (b.type === 'steam') steam += pl.vol; else fire += pl.vol;
  }
  setLoop('saw', Math.min(0.09, saw * 0.05), g => {
    const c = AUD.ctx, o = c.createOscillator(), f = c.createBiquadFilter(), lfo = c.createOscillator(), lg = c.createGain();
    o.type = 'sawtooth'; o.frequency.value = 196; f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 2;
    lfo.frequency.value = 0.7; lg.gain.value = 500; lfo.connect(lg); lg.connect(f.frequency);
    o.connect(f); f.connect(g); o.start(); lfo.start();
  });
  setLoop('steam', Math.min(0.16, steam * 0.09), g => {
    const c = AUD.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), am = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
    s.buffer = AUD.noise; s.loop = true; f.type = 'lowpass'; f.frequency.value = 380;
    am.gain.value = 0.5; lfo.type = 'square'; lfo.frequency.value = 2.6; lg.gain.value = 0.5; lfo.connect(lg); lg.connect(am.gain);
    s.connect(f); f.connect(am); am.connect(g); s.start(); lfo.start();
  });
  const night = live ? 1 - daylight() : 0;
  setLoop('fire', Math.min(0.12, fire * 0.06 * (0.4 + night)), g => {
    const c = AUD.ctx, s = c.createBufferSource(), f = c.createBiquadFilter();
    s.buffer = AUD.noise; s.loop = true; f.type = 'highpass'; f.frequency.value = 2500;
    const crackle = c.createGain(); crackle.gain.value = 0.4;
    s.connect(f); f.connect(crackle); crackle.connect(g); s.start();
    setInterval(() => { if (AUD.ctx) crackle.gain.setTargetAtTime(Math.random() < 0.3 ? 1 : 0.15, AUD.ctx.currentTime, 0.01); }, 70);
  });
  setLoop('wind', !playing ? 0.03 : G && seasonOf() === 3 ? 0.09 : 0.05, g => {
    const c = AUD.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), lfo = c.createOscillator(), lg = c.createGain();
    s.buffer = AUD.noise; s.loop = true; f.type = 'lowpass'; f.frequency.value = 500;
    lfo.frequency.value = 0.08; lg.gain.value = 250; lfo.connect(lg); lg.connect(f.frequency);
    s.connect(f); f.connect(g); s.start(); lfo.start();
  });
  if (!live) return;
  const day = daylight(), winter = seasonOf() === 3;
  AUD.birdT -= dt; AUD.cricketT -= dt;
  if (day > 0.5 && AUD.birdT <= 0) { AUD.birdT = rf(1.5, 5) * (winter ? 4 : 1); SFX.bird(out(day * 0.9, rf(-0.8, 0.8))); }
  if (day < 0.3 && !winter && AUD.cricketT <= 0) { AUD.cricketT = rf(0.25, 0.9); SFX.cricket(out(1 - day, rf(-0.8, 0.8))); }
}
