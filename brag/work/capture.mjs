// Renders index.html frame by frame (render(t) is a pure function of time).
//   node capture.mjs stills 0.4 1.0 ...   -> stills/t_<t>.jpg
//   node capture.mjs all                   -> frames/%05d.jpg (30 fps, 30 s)
import { chromium } from '../../editor/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const [mode, ...rest] = process.argv.slice(2);
const FPS = 30, DUR = 30;
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--allow-file-access-from-files'] });
const page = await (await browser.newContext({ viewport: { width: 1080, height: 1080 }, deviceScaleFactor: 1 })).newPage();
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.goto('file://' + path.join(HERE, 'index.html'));
await page.evaluate(() => window.preload());
const shot = async (t, file) => {
  await page.evaluate((t) => window.render(t), t);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: file, type: 'jpeg', quality: 93 });
};
if (mode === 'stills') {
  fs.mkdirSync(path.join(HERE, 'stills'), { recursive: true });
  for (const t of rest.map(Number)) await shot(t, path.join(HERE, 'stills', `t_${t.toFixed(2)}.jpg`));
} else {
  const dir = path.join(HERE, 'frames');
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
  const n = FPS * DUR;
  for (let i = 0; i < n; i++) {
    await shot(i / FPS, path.join(dir, `${String(i).padStart(5, '0')}.jpg`));
    if (i % 150 === 0) console.log('frame', i, '/', n);
  }
}
await browser.close();
