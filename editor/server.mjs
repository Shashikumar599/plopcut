// plopcut local server: serves CapCut's web editor client (study copy) with our plugins and local API mocks.
//  /                 -> redirects to /editor; ./public holds our injected plugins (__*.js) and lib/
//  /editor           -> ./public/editor/index.html (rewritten CapCut editor shell)
//  /static-resource/ -> ./vendor (downloaded CapCut client; same prefix CapCut's loader uses)
//  /media/           -> ./media (test media)
//  /__x/<host>/<path> (via service worker):
//      static CDN hosts -> local mirror, filled once from the public CDN when missing
//      everything else  -> local mocks (mocks.mjs); never forwarded to CapCut APIs
// Sends COOP/COEP so SharedArrayBuffer (WASM pthreads) is available.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadEnv, resolveLive } from './sources.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 5174);
const VENDOR = path.join(ROOT, 'vendor');
const CDN_CACHE = path.join(ROOT, 'vendor-cdn');
const API_LOG = path.join(ROOT, 'test', 'out', 'api-log.jsonl');
fs.mkdirSync(path.dirname(API_LOG), { recursive: true });
loadEnv(ROOT);

const MOUNTS = [
  ['/static-resource/', VENDOR],
  ['/media/', path.join(ROOT, 'media')],
  ['/content/', path.join(ROOT, 'content')],
  ['/', path.join(ROOT, 'public')],
];
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm',
  '.zip': 'application/zip', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.model': 'application/octet-stream',
};
// Static asset hosts we may mirror (public CDN files only).
const STATIC_HOSTS = /(^|\.)(capcutstatic\.com|capcutcdn-us\.com|ttwstatic\.com|ibyteimg\.com|ibytedtos\.com|byteimg\.com|bytednsdoc\.com|tiktokcdn\.com|fonts\.gstatic\.com|byteeffecttos-g\.com|byteeffecttos\.com|effectcdn[^/]*|cdn\.coverr\.co|cdn\.freesound\.org)$/;
const CDN_ROOT_PREFIX = '/obj/capcut-web-login-static/';

// Extensionless CDN objects (e.g. effect packages named by md5): sniff the real type,
// because CapCut's loader only unzips responses whose Content-Type is application/zip.
function sniffType(file) {
  const fd = fs.openSync(file, 'r');
  const b = Buffer.alloc(12);
  fs.readSync(fd, b, 0, 12, 0);
  fs.closeSync(fd);
  if (b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5 || b[2] === 7)) return 'application/zip';
  if (b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (b.toString('latin1', 4, 8) === 'ftyp') return 'video/mp4';
  if (b[0] === 0x7b || b[0] === 0x5b) return 'application/json';
  return 'application/octet-stream';
}

function sendFile(req, res, file, extraHeaders = {}) {
  const stat = fs.statSync(file);
  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] || (ext.length <= 1 || /^\.[0-9a-f]{8,}$/.test(ext) ? sniffType(file) : 'application/octet-stream');
  const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Number(range[2]) : stat.size - 1;
    res.writeHead(206, { ...extraHeaders, 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 });
    fs.createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { ...extraHeaders, 'Content-Type': type, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes' });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

function resolveMount(urlPath) {
  if (urlPath === '/editor' || urlPath.startsWith('/editor/')) return path.join(ROOT, 'public', 'editor', 'index.html');
  for (const [prefix, dir] of MOUNTS) {
    if (!urlPath.startsWith(prefix)) continue;
    const rel = decodeURIComponent(urlPath.slice(prefix.length)) || 'index.html';
    const file = path.normalize(path.join(dir, rel));
    if (!file.startsWith(dir)) return null;
    return file;
  }
  return null;
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

async function serveStaticHost(req, res, host, pathname) {
  // CapCut's own CDN root maps onto ./vendor (already downloaded files).
  let local = null;
  if (pathname.startsWith(CDN_ROOT_PREFIX)) {
    const cand = path.normalize(path.join(VENDOR, decodeURIComponent(pathname.slice(CDN_ROOT_PREFIX.length))));
    if (cand.startsWith(VENDOR) && fs.existsSync(cand) && fs.statSync(cand).isFile()) local = cand;
  }
  const cached = path.normalize(path.join(CDN_CACHE, host, decodeURIComponent(pathname)));
  if (!cached.startsWith(CDN_CACHE)) return res.writeHead(400).end();
  if (!local && fs.existsSync(cached) && fs.statSync(cached).isFile()) local = cached;
  if (local && /effect/.test(host)) log({ kind: 'cdn-hit', host, path: pathname });
  if (!local) {
    const upstream = `https://${host}${pathname}`;
    try {
      const r = await fetch(upstream);
      if (!r.ok) { log({ kind: 'cdn-miss', host, path: pathname, status: r.status }); return res.writeHead(r.status).end(); }
      fs.mkdirSync(path.dirname(cached), { recursive: true });
      fs.writeFileSync(cached, Buffer.from(await r.arrayBuffer()));
      log({ kind: 'cdn-mirrored', host, path: pathname });
      local = cached;
    } catch (e) {
      log({ kind: 'cdn-error', host, path: pathname, error: String(e) });
      return res.writeHead(502).end();
    }
  }
  if (local.endsWith('.js') && req.method === 'GET') {
    const patched = await applyPatches(local);
    if (patched !== null) {
      res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cross-Origin-Resource-Policy': 'cross-origin', 'Content-Length': Buffer.byteLength(patched) });
      return res.end(patched);
    }
  }
  sendFile(req, res, local, { 'Cross-Origin-Resource-Policy': 'cross-origin' });
}

async function applyPatches(file) {
  const p = path.join(ROOT, 'patches.mjs');
  const { patches } = await import(pathToFileURL(p).href + '?v=' + fs.statSync(p).mtimeMs);
  const mine = patches.filter((x) => x.file.test(file.split(path.sep).join('/')));
  if (!mine.length) return null;
  let src = fs.readFileSync(file, 'utf8');
  for (const x of mine) {
    if (x.find instanceof RegExp) { src = src.replace(x.find, x.replace); continue; }
    const n = src.split(x.find).length - 1;
    if (x.all && n > 0) { src = src.split(x.find).join(x.replace); continue; }
    if (x.all) continue;
    if (n !== 1) { log({ kind: 'patch-mismatch', file: path.basename(file), why: x.why, matches: n }); continue; }
    src = src.replace(x.find, () => x.replace);
  }
  return src;
}

function log(entry) {
  fs.appendFileSync(API_LOG, JSON.stringify({ t: new Date().toISOString(), ...entry }) + '\n');
}

async function serveMock(req, res, host, pathname, search) {
  const body = await readBody(req);
  const mocks = await import(pathToFileURL(path.join(ROOT, 'mocks.mjs')).href + '?v=' + fs.statSync(path.join(ROOT, 'mocks.mjs')).mtimeMs);
  let parsed = null;
  try { parsed = body.length ? JSON.parse(body.toString()) : null; } catch { parsed = body.toString().slice(0, 300); }
  const origin = `http://${req.headers.host || '127.0.0.1:' + PORT}`;
  const result = await mocks.handle({ method: req.method, host, path: pathname, query: new URLSearchParams(search), body: parsed, origin, root: ROOT });
  log({ kind: 'api', method: req.method, host, path: pathname, mocked: result.matched, status: result.status ?? 200, body: typeof parsed === 'string' ? parsed : parsed && JSON.stringify(parsed).slice(0, 1500) });
  res.writeHead(result.status ?? 200, {
    'Content-Type': result.contentType || 'application/json',
    'Cross-Origin-Resource-Policy': 'cross-origin',
  });
  res.end(typeof result.body === 'string' ? result.body : JSON.stringify(result.body));
}

// ---- Local ingest: our stand-in for CapCut's cloud transcode ----
// POST /__ingest?name=<file name> with the file bytes.
//  204 -> already editable locally (H.264 video, or not a video): use the original file
//  200 -> body is an H.264/AAC MP4 transcode; x-new-name has the suggested file name
import { spawn } from 'node:child_process';
import os from 'node:os';

const run = (cmd, args) => new Promise((resolve) => {
  const p = spawn(cmd, args);
  let out = '', err = '';
  p.stdout.on('data', (d) => (out += d));
  p.stderr.on('data', (d) => (err += d));
  p.on('close', (code) => resolve({ code, out, err }));
});

async function ingest(req, res, search) {
  const name = new URLSearchParams(search).get('name') || 'upload';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plop-ingest-'));
  const src = path.join(dir, 'src' + (path.extname(name) || '.bin'));
  const t0 = Date.now();
  try {
    await new Promise((resolve, reject) => { const w = fs.createWriteStream(src); req.pipe(w); w.on('finish', resolve); w.on('error', reject); });
    const probe = await run('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,pix_fmt,color_transfer,bit_rate,avg_frame_rate', '-of', 'json', src]);
    const streams = probe.code === 0 ? JSON.parse(probe.out).streams || [] : [];
    const v = streams.find((s) => s.codec_type === 'video' && s.codec_name !== 'mjpeg' && s.codec_name !== 'png');
    const a = streams.find((s) => s.codec_type === 'audio');
    // CapCut's local quick-import gate (src-editor-2 _videoChecker): engine test-decode must work
    // (H.264 8-bit yes, HEVC no), fps <= 60, GOP <= 250, <= 4096px. Otherwise it falls back to a
    // cloud upload we don't have. iPhone slow-mo (120/240 fps) and HDR HEVC fail it.
    const [fn, fd] = String(v?.avg_frame_rate || '0/1').split('/').map(Number);
    const fps = fd ? fn / fd : 0;
    const editable = !v || (v.codec_name === 'h264' && (v.pix_fmt || '').startsWith('yuv420p') && !/10/.test(v.pix_fmt || '') && fps <= 60.5);
    log({ kind: 'ingest', name, bytes: fs.statSync(src).size, video: v?.codec_name, pix_fmt: v?.pix_fmt, fps: Math.round(fps * 100) / 100, transfer: v?.color_transfer, action: editable ? 'keep' : 'transcode' });
    if (editable) return res.writeHead(204).end();

    const out = path.join(dir, 'out.mp4');
    const outFps = fps > 60.5 ? 60 : fps > 0 ? fps : 30;
    const kbps = Math.min(20000, Math.max(4000, Math.round(Number(v.bit_rate || 10e6) / 1000)));
    const args = ['-v', 'error', '-y', '-i', src,
      '-map', '0:v:0', '-map', '0:a:0?',
      '-vf', `${fps > 60.5 ? 'fps=60,' : ''}scale=out_color_matrix=bt709:out_range=tv,format=yuv420p`,
      '-c:v', 'h264_videotoolbox', '-b:v', `${kbps}k`, '-profile:v', 'high', '-g', String(Math.round(outFps)),
      '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
      ...(a ? (a.codec_name === 'aac' ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '192k']) : []),
      '-movflags', '+faststart', out];
    let r = await run('ffmpeg', args);
    if (r.code !== 0) { // fall back to software x264
      args[args.indexOf('h264_videotoolbox')] = 'libx264';
      r = await run('ffmpeg', args);
    }
    if (r.code !== 0) throw new Error('ffmpeg failed: ' + r.err.slice(-500));
    const outName = name.replace(/\.[^.]+$/, '') + '.mp4';
    log({ kind: 'ingest-done', name, outName, bytes: fs.statSync(out).size, ms: Date.now() - t0 });
    res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': fs.statSync(out).size, 'x-new-name': encodeURIComponent(outName) });
    await new Promise((resolve) => fs.createReadStream(out).pipe(res).on('finish', resolve));
  } catch (e) {
    log({ kind: 'ingest-error', name, error: String(e) });
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' }).end(String(e));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Third-party media found by live search (Freesound, Coverr): fetched once, cached in content/live/.
async function serveLive(req, res, source, file) {
  const dest = path.join(ROOT, 'content', 'live', source, file);
  if (!fs.existsSync(dest)) {
    try {
      const url = await resolveLive(source, file);
      if (!url) return res.writeHead(404).end('unknown live asset');
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
      log({ kind: 'live-fetch', source, file });
    } catch (e) {
      log({ kind: 'live-error', source, file, error: String(e) });
      return res.writeHead(502).end();
    }
  }
  sendFile(req, res, dest);
}

http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/__ingest')) {
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    return ingest(req, res, new URL(req.url, 'http://localhost').search);
  }
  const { pathname: urlPath, search } = new URL(req.url, 'http://localhost');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cache-Control', 'no-store');

  let pathname = urlPath;
  if (pathname.startsWith('/__x/')) {
    const rest = pathname.slice(5);
    const host = rest.split('/')[0];
    const p = '/' + rest.split('/').slice(1).join('/');
    // Their fetch helper upgrades http->https, so our own origin can arrive here as "foreign".
    if (/^(127\.0\.0\.1|localhost):\d+$/.test(host)) pathname = p;
  }
  if (pathname.startsWith('/__x/')) {
    const rest = pathname.slice(5);
    const host = rest.split('/')[0];
    const p = '/' + rest.split('/').slice(1).join('/');
    if (STATIC_HOSTS.test(host) && (req.method === 'GET' || req.method === 'HEAD')) return serveStaticHost(req, res, host, p);
    return serveMock(req, res, host, p, search);
  }

  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (pathname === '/__sw.js') res.setHeader('Service-Worker-Allowed', '/');
  if (pathname.startsWith('/static-resource/')) {
    // Same mirror as the CDN root; fills missing files from the public CDN once.
    return serveStaticHost(req, res, 'sf16-web-login-neutral.capcutstatic.com', CDN_ROOT_PREFIX + pathname.slice('/static-resource/'.length));
  }
  // Same-origin API calls (their code calls `${location.origin}/model/api/...` etc.) -> mocks.
  if (/^\/(model|lv|api|cc|artist|commerce|service|web)\//.test(pathname)) {
    return serveMock(req, res, 'www.capcut.com', pathname, search);
  }
  if (pathname === '/' || pathname === '/index.html') { res.writeHead(302, { Location: '/editor' }); return res.end(); }
  const live = pathname.match(/^\/content\/live\/(\w+)\/([\w.-]+)$/);
  if (live) return serveLive(req, res, live[1], live[2]);
  const file = resolveMount(pathname);
  if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    console.log('404', pathname);
    res.writeHead(404).end('not found');
    return;
  }
  sendFile(req, res, file);
}).listen(PORT, '127.0.0.1', () => console.log(`harness on http://127.0.0.1:${PORT}  (editor study copy: /editor)`));
