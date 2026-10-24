// Third-party content sources we plug into CapCut's panels (never CapCut's own servers).
// Keys come from ./.env (gitignored): FREESOUND_KEY, COVERR_KEY.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export function loadEnv(root) {
  const f = path.join(root, '.env');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// ---------- Freesound (CC0 only) ----------
const FS_API = 'https://freesound.org/apiv2';
async function fetchRetry(url, tries = 3, headers = {}) {
  for (let i = 1; ; i++) {
    try { return await fetch(url, { headers, signal: AbortSignal.timeout(20000) }); } catch (e) { if (i >= tries) throw e; await new Promise((r) => setTimeout(r, 1500 * i)); }
  }
}
export async function freesoundSearch(query, { pageSize = 30, maxDuration = 15 } = {}) {
  const key = process.env.FREESOUND_KEY;
  if (!key) return [];
  const u = new URL(`${FS_API}/search/text/`);
  u.searchParams.set('query', query);
  u.searchParams.set('filter', `license:"Creative Commons 0" duration:[0.1 TO ${maxDuration}]`);
  u.searchParams.set('fields', 'id,name,duration,username,previews,images');
  u.searchParams.set('sort', 'rating_desc');
  u.searchParams.set('page_size', String(pageSize));
  u.searchParams.set('token', key);
  const r = await fetchRetry(u);
  if (!r.ok) throw new Error(`freesound ${r.status}`);
  const j = await r.json();
  return j.results.map((s) => ({
    id: s.id, title: s.name.replace(/\.(wav|mp3|aiff?|flac|ogg)$/i, '').replace(/[_-]+/g, ' ').trim(),
    author: s.username, duration: Math.max(1, Math.round(s.duration)),
    preview: s.previews?.['preview-hq-mp3'], waveform: s.images?.waveform_m,
  }));
}
export async function freesoundPreviewUrl(id) {
  const key = process.env.FREESOUND_KEY;
  const r = await fetchRetry(`${FS_API}/sounds/${id}/?fields=previews&token=${key}`);
  if (!r.ok) throw new Error(`freesound ${r.status}`);
  return (await r.json()).previews['preview-hq-mp3'];
}

// ---------- Coverr (stock video, free license) ----------
export async function coverrSearch(query, { pageSize = 20 } = {}) {
  const key = process.env.COVERR_KEY;
  if (!key) return [];
  const u = new URL('https://api.coverr.co/videos');
  u.searchParams.set('query', query);
  u.searchParams.set('page_size', String(pageSize));
  u.searchParams.set('urls', 'true');
  const r = await fetchRetry(u, 3, { Authorization: `Bearer ${key}` });
  if (!r.ok) throw new Error(`coverr ${r.status}`);
  return (await r.json()).hits.filter((h) => !h.is_premium && h.urls?.mp4).map((h) => ({
    id: h.id, title: (h.title || '').trim(), duration: Number(h.duration) || 0, width: h.max_width || 1920, height: h.max_height || 1080,
    fps: h.fps || 30, vertical: !!h.is_vertical, mp4: h.urls.mp4, preview: h.urls.mp4_preview, thumbnail: h.thumbnail,
  }));
}

// Live search results are served from our origin as /content/live/<source>/<id>.<ext>; the server
// downloads each file once into content/live/ (see resolveLive) so the editor never talks to them.
const liveUrls = new Map();
export const rememberLive = (source, id, ext, url) => url && liveUrls.set(`${source}/${id}.${ext}`, url);
export async function resolveLive(source, file) {
  const known = liveUrls.get(`${source}/${file}`);
  if (known) return known;
  const m = file.match(/^(\d+)\.mp3$/);
  if (source === 'freesound' && m) return freesoundPreviewUrl(m[1]);
  if (source === 'coverr') { // <id>.mp4 (1080p), <id>_720.mp4 (timeline), <id>_360.mp4 (preview), from the saved catalog
    const cm = file.match(/^([\w-]+?)(_360|_720)?\.mp4$/);
    const cat = path.join(HERE, 'content', 'stock', 'catalog.json');
    if (cm && fs.existsSync(cat)) {
      const clip = JSON.parse(fs.readFileSync(cat, 'utf8')).categories.flatMap((c) => c.clips).find((c) => c.id === cm[1]);
      if (clip) return cm[2] === '_360' ? clip.preview : cm[2] === '_720' ? clip.mp4.replace(/1080p\.mp4$/, '720p.mp4') : clip.mp4;
    }
  }
  return null;
}
