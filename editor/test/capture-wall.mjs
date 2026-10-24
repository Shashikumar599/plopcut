// Brag-video resource: records what capcut.com returns from this network (one ordinary page load,
// no API calls). Output: brag/source/recorded/capcut-wall.{webm,png} + response status.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '../brag/source/recorded');
const URL_ = process.argv[2] || 'https://www.capcut.com/';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: false });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: OUT, size: { width: 1280, height: 800 } } });
const page = await ctx.newPage();
await page.goto('about:blank');
await page.waitForTimeout(800);
const resp = await page.goto(URL_, { waitUntil: 'load', timeout: 60000 }).catch((e) => ({ status: () => 'ERR ' + e.message }));
await page.waitForTimeout(2500);
await page.screenshot({ path: path.join(OUT, 'capcut-home.png') });
// the natural path: "Try online for free" -> the web editor
const editorResp = page.waitForResponse((r) => r.request().isNavigationRequest() && /\/editor/.test(r.url()), { timeout: 30000 }).catch(() => null);
await page.locator('text="Try online for free"').first().click();
await page.waitForTimeout(3500);
await page.screenshot({ path: path.join(OUT, 'capcut-login-notfound.png') });
const direct = await page.goto('https://www.capcut.com/editor', { waitUntil: 'load', timeout: 60000 }).catch(() => null);
console.log('direct /editor status:', direct && direct.status());
const er = await editorResp;
console.log('editor status:', er ? er.status() : 'n/a', er ? er.url() : '');
await page.waitForTimeout(4000);
await page.screenshot({ path: path.join(OUT, 'capcut-wall.png') });
console.log('status:', resp.status(), 'final url:', page.url());
console.log('text:', (await page.evaluate(() => document.body?.innerText || '')).replace(/\s+/g, ' ').slice(0, 300));
await page.close(); await ctx.close(); await browser.close();
const webm = fs.readdirSync(OUT).filter((f) => f.endsWith('.webm')).map((f) => path.join(OUT, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
fs.renameSync(webm, path.join(OUT, 'capcut-wall.webm'));
console.log('saved', path.join(OUT, 'capcut-wall.webm'));
