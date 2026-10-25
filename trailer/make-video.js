#!/usr/bin/env node
'use strict';
// Renders the release trailer to an MP4.
//   node trailer/make-video.js [out.mp4] [--from=seconds --to=seconds]
// Needs Node, Playwright with Chromium, and ffmpeg (with libx264) on the PATH.
// Every frame is rendered by the game's own code in trailer/index.html and piped to ffmpeg as PNG.

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const opt = (k) => { const a = args.find(s => s.startsWith(`--${k}=`)); return a ? parseFloat(a.split('=')[1]) : null; };
const OUT = path.resolve(args.find(a => !a.startsWith('--')) || path.join(__dirname, 'heartwood-mill-trailer.mp4'));

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
function serve() {
  const server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

// Google Fonts are fetched with curl, which picks up the system proxy and CA settings
function fetchFont(route) {
  const req = route.request();
  try {
    const body = execFileSync('curl', ['-sSfL', '-A', req.headers()['user-agent'] || 'Mozilla/5.0', req.url()], { maxBuffer: 1 << 26 });
    const type = req.url().includes('/css') ? 'text/css' : req.url().endsWith('.woff2') ? 'font/woff2' : 'font/ttf';
    return route.fulfill({ status: 200, contentType: type, body, headers: { 'Access-Control-Allow-Origin': '*' } });
  } catch {
    console.warn(`Could not fetch ${req.url()}; titles will use a fallback font.`);
    return route.abort();
  }
}

(async () => {
  const server = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => { console.error('Page error:', e.message); process.exitCode = 1; });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, fetchFont);
  await page.goto(`http://127.0.0.1:${server.address().port}/trailer/index.html`);
  const info = await page.evaluate(() => window.TR_API.init());
  const first = Math.round((opt('from') || 0) * info.fps), last = Math.min(info.frames, Math.round((opt('to') || 1e9) * info.fps));

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'trailer-'));
  const video = path.join(tmp, 'video.mp4');
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(info.fps), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-tune', 'animation', '-pix_fmt', 'yuv420p', video], { stdio: ['pipe', 'inherit', 'inherit'] });
  const ffDone = new Promise((res, rej) => ff.on('close', c => (c ? rej(new Error(`ffmpeg exited with ${c}`)) : res())));

  // frames before the requested range still run, so the simulation reaches the same state
  for (let i = 0; i < last; i++) {
    const url = await page.evaluate(([n, cap]) => window.TR_API.frame(n, cap), [i, i >= first]);
    if (i < first) continue;
    const png = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
    if (!ff.stdin.write(png)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % info.fps === 0) process.stdout.write(`\rframe ${i}/${last}`);
  }
  ff.stdin.end();
  await ffDone;
  console.log('\nRendering soundtrack...');
  const wav = path.join(tmp, 'audio.wav');
  fs.writeFileSync(wav, Buffer.from(await page.evaluate(() => window.TR_API.audio()), 'base64'));
  await browser.close();
  server.close();

  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', video, '-ss', String(first / info.fps), '-i', wav,
    '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', OUT]);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`Wrote ${OUT}`);
})().catch(e => { console.error(e); process.exit(1); });
