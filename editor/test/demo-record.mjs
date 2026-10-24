// Records the demo walkthrough of the local CapCut study copy as video (headed Chrome).
//   upload IMG_9617.mov -> colour adjust -> Flash ramp transition while the yak is in the air
//   -> title typed, shrunk and moved up -> whoosh SFX (Freesound) -> music trimmed to the clip
//   -> browse Coverr stock videos (not used) -> play -> Export (local renderer) -> rendered MP4 plays in the dialog
// Output: test/out/demo/demo-walkthrough.mp4 (boot frames trimmed) + screenshots per beat.
// Usage: node test/demo-record.mjs [--title="..."] [--file=IMG_9617.mov] [--ramp=1.15]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'test/out/demo');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `=${d}`).split('=').slice(1).join('=');
const TITLE = arg('title', 'Ladakh');
const FILE = arg('file', 'IMG_9617.mov');
const RAMP = Number(arg('ramp', '1.15')); // seconds: the yak leaves the ground
const W = 1600, H = 900;

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: false,
  args: ['--autoplay-policy=no-user-gesture-required', `--window-size=${W},${H + 120}`],
});
const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: OUT, size: { width: W, height: H } } });
// Visible cursor + click ripple (Playwright recordings have no cursor).
await ctx.addInitScript(() => {
  addEventListener('DOMContentLoaded', () => {
    const c = document.createElement('div');
    c.style.cssText = 'position:fixed;z-index:2147483647;width:22px;height:22px;margin:-3px 0 0 -3px;pointer-events:none;transition:transform .08s;left:-50px;top:-50px;background:url("data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 width=%2722%27 height=%2722%27><path d=%27M3 2l14 8-6 2-3 7z%27 fill=%27white%27 stroke=%27black%27 stroke-width=%271.5%27/></svg>") no-repeat';
    document.documentElement.appendChild(c);
    addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', (e) => {
      c.style.transform = 'scale(.85)';
      const r = document.createElement('div');
      r.style.cssText = `position:fixed;z-index:2147483646;left:${e.clientX - 18}px;top:${e.clientY - 18}px;width:36px;height:36px;border-radius:50%;border:3px solid #00c1cd;pointer-events:none;opacity:.9;transition:all .45s ease-out`;
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = 'scale(1.8)'; r.style.opacity = '0'; });
      setTimeout(() => r.remove(), 500);
    }, true);
    addEventListener('mouseup', () => { c.style.transform = ''; }, true);
  });
});
const page = await ctx.newPage();
const tStart = Date.now();
const beat = async (name) => page.screenshot({ path: path.join(OUT, `${String(++beat.n).padStart(2, '0')}-${name}.png`) });
beat.n = 0;
const wait = (ms) => page.waitForTimeout(ms);
const glide = async (x, y, steps = 22) => page.mouse.move(x, y, { steps });
const clickAt = async (x, y, pause = 300) => { await glide(x, y); await wait(pause); await page.mouse.click(x, y); };
const center = (b) => [b.x + b.width / 2, b.y + b.height / 2];
const clickLoc = async (loc, opts = {}) => {
  const b = await loc.boundingBox();
  await clickAt(b.x + (opts.dx ?? b.width / 2), b.y + (opts.dy ?? b.height / 2), opts.pause);
  return b;
};
const drag = async (x0, y0, x1, y1, steps = 24) => { await glide(x0, y0); await wait(250); await page.mouse.down(); await page.mouse.move(x1, y1, { steps }); await wait(120); await page.mouse.up(); };
const sdk = (fn, a) => page.evaluate(fn, a);
const segs = () => sdk(() => window.__renderManger._dataSDK.draftView.getAllSegments().map((s) => ({ id: s.id, type: String(s.material?.type), start: Number(s.targetTimerange.start), dur: Number(s.targetTimerange.duration) })));
const videoEnd = async () => Math.max(...(await segs()).filter((s) => s.type === 'video').map((s) => s.start + s.dur));
// The timeline is canvas-drawn, so seeking clicks the ruler and corrects from the timecode readout.
const RULER_Y = 731;
const readTime = () => page.evaluate(() => {
  const m = document.body.innerText.match(/(\d\d):(\d\d):(\d\d)\s*\n\s*\d\d:\d\d:\d\d/);
  return m ? (+m[1]) * 60 + (+m[2]) + (+m[3]) / 30 : null;
});
let scale = null; // { x0, pps }
async function calibrate() {
  await page.mouse.click(600, RULER_Y); await wait(250); const a = await readTime();
  await page.mouse.click(680, RULER_Y); await wait(250); const b = await readTime();
  const pps = 80 / (b - a);
  scale = { pps, x0: 600 - a * pps };
}
async function seek(sec) {
  if (!scale) await calibrate();
  let x = Math.max(scale.x0 + sec * scale.pps, scale.x0 + 2);
  for (let i = 0; i < 3; i++) {
    await clickAt(x, RULER_Y, 200); await wait(300);
    const t = await readTime();
    if (Math.abs(t - sec) < 0.05) break;
    x = Math.max(x + (sec - t) * scale.pps, scale.x0 + 2);
  }
}
async function clickClip(sec) { // main track row is marked by the cover box at its left
  if (!scale) await calibrate();
  const cover = await page.locator('.cover-entrance').first().boundingBox();
  await clickAt(scale.x0 + sec * scale.pps, cover.y + cover.height / 2);
}

// --- open editor (boot frames are trimmed from the final cut) ---
await page.goto('http://127.0.0.1:5174/editor', { waitUntil: 'commit' });
await page.waitForFunction(() => window.__renderManger, null, { timeout: 120000 });
await wait(4500);
const trimStart = (Date.now() - tStart) / 1000;
await glide(800, 450, 10);
await wait(800);
await beat('editor');

// --- upload ---
await clickLoc(page.locator('text="Upload"').first(), { dy: 10 }).catch(() => {});
await page.keyboard.press('Escape');
await page.locator('input[type=file][accept*=".mxf"]').first().setInputFiles([path.join(ROOT, 'media', FILE)]);
await page.waitForFunction(() => window.__renderManger._dataSDK.draftView.getAllSegments().length > 0, null, { timeout: 180000 });
await wait(2200);
await beat('uploaded');

// --- colour: select clip, Basic > Color adjustment ---
await clickClip(6);
await wait(700);
await clickLoc(page.locator('text="Basic"').last());
await wait(800);
{ const cb = await page.locator('text="Color adjustment"').first().boundingBox(); await clickAt(cb.x + 40, cb.y + 8); }
await wait(1300);
for (const [label, delta] of [['Saturation', 30], ['Brightness', -16]]) { // a touch more colour, slightly darker
  const lb = await page.locator(`text="${label}"`).first().boundingBox().catch(() => null);
  if (!lb) continue;
  await drag(lb.x + 56, lb.y + 40, lb.x + 56 + delta, lb.y + 40, 16);
  await wait(700);
}
await beat('color');
{ // close the colour panel (its × sits at the right end of the panel header)
  const hb = await page.locator('text="Color adjustment"').first().boundingBox();
  const close = await page.evaluate(({ y }) => { const xs = [...document.querySelectorAll('svg')].map((e) => e.getBoundingClientRect()).filter((r) => Math.abs(r.top + r.height / 2 - y) < 8 && r.left > 1400 && r.width < 24); xs.sort((a, b) => b.left - a.left); return xs[0] ? [xs[0].left + xs[0].width / 2, xs[0].top + xs[0].height / 2] : null; }, { y: hb.y + hb.height / 2 });
  if (close) { await clickAt(close[0], close[1]); await wait(600); }
}

// --- transition: playhead to the jump, Transitions > Plopcut FX > Flash ramp ---
await seek(RAMP);
await clickLoc(page.locator('text=/^Transitio/').first());
await wait(1200);
await page.waitForSelector('#plopfx [data-fx="flash-ramp"]', { state: 'visible', timeout: 8000 });
await glide(...center(await page.locator('#plopfx [data-fx="speed-ramp"]').boundingBox()));
await wait(1200);
await clickLoc(page.locator('#plopfx [data-fx="flash-ramp"]'), { pause: 900 });
await wait(1800);
const fxMsg = await page.locator('#plopfx [data-msg]').innerText();
const fxKeys = await sdk(() => {
  const v = window.__renderManger._dataSDK.draftView;
  return JSON.stringify(v.getAllSegments().filter((s) => s.commonKeyframes?.length).map((s) => [Number(s.targetTimerange.start) / 1e6, s.adjust?.brightness?.value, s.commonKeyframes.map((k) => [k.propertyType, k.keyframeList.map((x) => x.values[0])])]));
});
scale = null;
await beat('transition');

// --- title: add, type, shrink, move to the top ---
await seek(0);
await clickLoc(page.locator('text="Text"').first());
await wait(800);
await clickLoc(page.locator('text="Add heading"').first());
await wait(1600);
// The preview <canvas> is square and taller than what is shown; the visible frame is the canvas
// width at the draft's aspect ratio, centred on it.
const cvb = await page.locator('canvas').first().boundingBox();
const aspect = await sdk(() => { const c = window.__renderManger._dataSDK.draftView.getCanvasConfig(); return c.height / c.width; });
const [cx, cy] = center(cvb);
const frame = { x: cvb.x, y: cy - (cvb.width * aspect) / 2, width: cvb.width, height: cvb.width * aspect };
await page.mouse.dblclick(cx, cy);
await wait(500);
await page.keyboard.press('Meta+A');
await page.keyboard.type(TITLE, { delay: 65 });
await wait(500);
await clickAt(frame.x + 30, frame.y + frame.height - 25);
await wait(700);
await clickAt(cx, cy); // select the text box again to get its handles
await wait(700);
// bottom-left handle: the right-hand ones sit under the text inspector panel
const br = page.locator('.widget-control-point[class*="bottom-left"]').first();
if (await br.boundingBox().catch(() => null)) {
  const [hx, hy] = center(await br.boundingBox());
  await drag(hx, hy, hx - (hx - cx) * 0.42, hy - (hy - cy) * 0.42, 30); // shrink ~40%
  await wait(600);
}
{ // move up to top-centre, starting from the (shrunk) text box's own centre
  const pts = await page.locator('.widget-control-point').evaluateAll((els) => els.filter((e) => /point-(top|bottom)-(left|right)/.test(e.className)).map((e) => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }));
  const [tx, ty] = pts.length >= 4 ? [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length] : [cx, cy];
  await drag(tx, ty, frame.x + frame.width / 2, frame.y + frame.height * 0.14, 30);
}
await wait(700);
await clickAt(frame.x + 30, frame.y + frame.height - 25);
await wait(500);
{ // title runs for the whole video
  const text = (await segs()).find((s) => /text/i.test(s.type)), end = await videoEnd();
  if (text) await sdk(({ id, end }) => {
    const ds = window.__renderManger._dataSDK;
    ds.api.segment.setTimeRange({ segmentId: id, trackId: ds.draftView.getTrackBySegmentId(id).id, clipType: 1, clipTime: BigInt(end) });
  }, { id: text.id, end });
}
await wait(800);
await beat('title');

// --- whoosh SFX (Freesound) just before the jump ---
await seek(Math.max(0, RAMP - 0.35));
await clickLoc(page.locator('text="Audio"').first());
await wait(900);
await clickLoc(page.locator('text="Sound effects"').first());
await wait(1200);
const sfxSearch = page.locator('input[placeholder*="sound effects" i]').first();
await clickLoc(sfxSearch);
await page.keyboard.type('whoosh', { delay: 80 });
await page.keyboard.press('Enter');
await wait(3500);
{
  const t = await page.locator('text=/whoosh/i').nth(1).boundingBox();
  await glide(t.x + 100, t.y + 10); await wait(600);
  // the "+ Add to timeline" button sits 27px above the bottom of the hovered row
  const rowBottom = await page.evaluate(({ x, y }) => { let n = document.elementFromPoint(x, y); while (n && n.getBoundingClientRect().height < 60) n = n.parentElement; return n ? n.getBoundingClientRect().bottom : y + 50; }, { x: t.x + 20, y: t.y + 5 });
  await clickAt(383, rowBottom - 27);
}
await wait(2200);
await beat('sfx');

// --- music from 0, trimmed to the video ---
await seek(0);
await clickLoc(page.locator('text="Music"').first());
await wait(1500);
{
  const row = await page.locator('text="Monkeys Spinning Monkeys"').first().boundingBox();
  await glide(row.x + 100, row.y + 10); await wait(600);
  await clickAt(383, row.y + 22);
}
await wait(2500);
scale = null;
{
  const music = (await segs()).find((s) => /music/.test(s.type)), end = await videoEnd();
  if (music) await sdk(({ id, end }) => {
    const ds = window.__renderManger._dataSDK;
    ds.api.segment.setTimeRange({ segmentId: id, trackId: ds.draftView.getTrackBySegmentId(id).id, clipType: 1, clipTime: BigInt(end) });
  }, { id: music.id, end });
}
await wait(1200);
await beat('music');

// --- browse stock video (Coverr) and decide not to use it ---
await clickLoc(page.locator('text="Elements"').first());
await wait(2000);
{
  const thumbs = page.locator('img[src*="/content/stock/"]');
  for (const i of [0, 1]) {
    const b = await thumbs.nth(i).boundingBox().catch(() => null);
    if (!b) continue;
    await glide(...center(b), 28);
    await wait(2200); // hover preview plays
  }
  await glide(260, 600, 30); // move away: not this time
  await wait(900);
}
await beat('stock-browse');

// --- play through the ramp ---
await seek(0);
const tc = await page.locator('text=/^\\d\\d:\\d\\d:\\d\\d$/').first().boundingBox();
await clickAt(tc.x - 22, tc.y + tc.height / 2);
await wait(6500);
await page.mouse.click(tc.x - 22, tc.y + tc.height / 2);
await wait(700);
await beat('played');

// --- export locally ---
await clickLoc(page.locator('button:visible:has-text("Export")').first(), { pause: 500 });
await page.waitForSelector('[data-go]');
await wait(1000);
await page.selectOption('[data-res]', '720');
await clickLoc(page.locator('[data-go]'), { pause: 600 });
await page.waitForFunction(() => window.__lastLocalExport, null, { timeout: 1200000 });
await wait(9000); // rendered MP4 plays inside the dialog
await beat('exported');
const res = await page.evaluate(() => window.__lastLocalExport);
if (!res.error) { // keep the rendered file next to the recording
  const b64 = await page.evaluate(async (u) => { const buf = new Uint8Array(await (await fetch(u)).arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000)); return btoa(s); }, res.url);
  fs.writeFileSync(path.join(OUT, 'exported.mp4'), Buffer.from(b64, 'base64'));
}
console.log('fx:', fxMsg, fxKeys);
console.log('export:', JSON.stringify(res));
console.log('segments:', JSON.stringify((await segs()).map((s) => `${s.type}@${(s.start / 1e6).toFixed(2)}+${(s.dur / 1e6).toFixed(2)}`)));

await page.close();
await ctx.close();
await browser.close();
const webm = fs.readdirSync(OUT).find((f) => f.endsWith('.webm'));
const mp4 = path.join(OUT, 'demo-walkthrough.mp4');
execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', trimStart.toFixed(2), '-i', path.join(OUT, webm), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', mp4]);
console.log('recording:', mp4, `(trimmed first ${trimStart.toFixed(1)}s)`);
