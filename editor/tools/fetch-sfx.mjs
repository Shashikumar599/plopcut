// Builds the Sound effects library from Freesound (CC0 only) into content/sfx/<category>/ and
// writes content/sfx/catalog.json for the mock API. Needs FREESOUND_KEY in ./.env.
// Usage: node tools/fetch-sfx.mjs [perCategory=12]   (re-run safe: skips files already present)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freesoundSearch, loadEnv } from '../sources.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SFX = path.join(ROOT, 'content', 'sfx');
const PER = Number(process.argv[2] || 12);
const CATEGORIES = {
  whoosh: { name: 'Whoosh & Transitions', query: 'whoosh transition' },
  impact: { name: 'Impacts & Hits', query: 'cinematic impact hit' },
  riser: { name: 'Risers & Build-ups', query: 'riser build up' },
  pop: { name: 'Pops & Clicks', query: 'pop click' },
  glitch: { name: 'Glitch & Digital', query: 'glitch digital' },
  camera: { name: 'Camera & Shutter', query: 'camera shutter' },
  nature: { name: 'Wind & Nature', query: 'wind' },
  animals: { name: 'Animals', query: 'animal' },
  crowd: { name: 'Crowd & Applause', query: 'applause cheering crowd' },
  funny: { name: 'Funny & Cartoon', query: 'cartoon boing funny' },
};

loadEnv(ROOT);
const catalog = { source: 'freesound.org', license: 'CC0 1.0', collections: [] };
for (const [id, cat] of Object.entries(CATEGORIES)) {
  const dir = path.join(SFX, id);
  fs.mkdirSync(dir, { recursive: true });
  const hits = await freesoundSearch(cat.query, { pageSize: PER, maxDuration: id === 'nature' ? 30 : 10 });
  const sounds = [];
  for (const h of hits) {
    const file = path.join(dir, `${h.id}.mp3`), wave = path.join(dir, `${h.id}.png`);
    for (const [url, dest] of [[h.preview, file], [h.waveform, wave]]) {
      if (fs.existsSync(dest) || !url) continue;
      const r = await fetch(url);
      if (!r.ok) { console.warn('skip', url, r.status); continue; }
      fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
    }
    if (!fs.existsSync(file)) continue;
    sounds.push({ id: h.id, title: h.title, author: h.author, duration: h.duration, file: `${id}/${h.id}.mp3`, cover: `${id}/${h.id}.png`, license: 'CC0 1.0', source: `https://freesound.org/s/${h.id}/` });
  }
  catalog.collections.push({ id, name: cat.name, sounds });
  console.log(`${id}: ${sounds.length}`);
}
fs.writeFileSync(path.join(SFX, 'catalog.json'), JSON.stringify(catalog, null, 1));
console.log('wrote content/sfx/catalog.json');
