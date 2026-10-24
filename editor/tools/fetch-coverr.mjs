// Builds the stock-video catalog (Elements > Videos) from Coverr (free license) into
// content/stock/catalog.json + thumbnails. Clips themselves are fetched on first use through
// /content/live/coverr/<id>.mp4 (see server.mjs serveLive). Needs COVERR_KEY in ./.env.
// Usage: node tools/fetch-coverr.mjs [perCategory=12]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { coverrSearch, loadEnv } from '../sources.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'content', 'stock');
const PER = Number(process.argv[2] || 12);
const CATEGORIES = {
  mountains: { name: 'Mountains', query: 'mountains' },
  travel: { name: 'Travel', query: 'road trip travel' },
  sky: { name: 'Sky & Clouds', query: 'clouds sky timelapse' },
  nature: { name: 'Nature', query: 'nature landscape' },
  animals: { name: 'Animals', query: 'animals' },
  city: { name: 'City', query: 'city night' },
  people: { name: 'People', query: 'people happy' },
  abstract: { name: 'Abstract & Light', query: 'abstract light' },
};

loadEnv(ROOT);
fs.mkdirSync(DIR, { recursive: true });
const catalog = { source: 'coverr.co', license: 'Coverr license (free for commercial and personal use)', categories: [] };
for (const [id, cat] of Object.entries(CATEGORIES)) {
  const hits = (await coverrSearch(cat.query, { pageSize: PER + 6 })).filter((h) => !h.vertical).slice(0, PER);
  const clips = [];
  for (const h of hits) {
    const thumb = path.join(DIR, `${h.id}.jpg`);
    if (!fs.existsSync(thumb)) {
      const r = await fetch(h.thumbnail);
      if (!r.ok) continue;
      fs.writeFileSync(thumb, Buffer.from(await r.arrayBuffer()));
    }
    clips.push(h);
  }
  catalog.categories.push({ id, name: cat.name, clips });
  console.log(`${id}: ${clips.length}`);
}
fs.writeFileSync(path.join(DIR, 'catalog.json'), JSON.stringify(catalog, null, 1));
console.log('wrote content/stock/catalog.json');
