// Downloads a starter music library (Kevin MacLeod / incompetech.com, CC BY 4.0) into
// content/music/<collection>/ and writes content/music/catalog.json for the mock API.
// Attribution is kept per track: "<Title> Kevin MacLeod (incompetech.com) Licensed under CC BY 4.0".
// Usage: node tools/fetch-music.mjs   (re-run safe: skips files already present)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MUSIC = path.join(ROOT, 'content', 'music');
const SRC = 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/';
const COLLECTIONS = {
  upbeat: { name: 'Upbeat & Fun', tracks: ['Carefree', 'Sneaky Snitch', 'Monkeys Spinning Monkeys', 'Fluffing a Duck', 'Wallpaper', 'Local Forecast - Elevator', 'Investigations', 'Happy Alley', 'Life of Riley', 'Hyperfun', 'Pixel Peeker Polka - faster', 'Merry Go'] },
  calm: { name: 'Calm & Cinematic', tracks: ['Clear Air', 'Dreamy Flashback', 'Dreams Become Real', 'Healing', 'Meditation Impromptu 01', 'Inspired', 'Fluidscape', 'Ether Vox', 'Long Note One', 'Heartwarming'] },
};

const probe = (f) => {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', f]).toString().trim();
  return Math.round(Number(out) || 0);
};

const catalog = { source: 'incompetech.com (Kevin MacLeod)', license: 'CC BY 4.0', collections: [] };
for (const [id, col] of Object.entries(COLLECTIONS)) {
  const dir = path.join(MUSIC, id);
  fs.mkdirSync(dir, { recursive: true });
  const songs = [];
  for (const title of col.tracks) {
    const file = path.join(dir, `${title}.mp3`);
    if (!fs.existsSync(file)) {
      const r = await fetch(SRC + encodeURIComponent(title) + '.mp3');
      if (!r.ok) { console.log(`skip ${title}: HTTP ${r.status}`); continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 50_000) { console.log(`skip ${title}: too small`); continue; }
      fs.writeFileSync(file, buf);
    }
    songs.push({
      title,
      author: 'Kevin MacLeod',
      file: `${id}/${title}.mp3`,
      duration: probe(file),
      license: 'CC BY 4.0',
      attribution: `"${title}" Kevin MacLeod (incompetech.com) Licensed under Creative Commons: By Attribution 4.0 License http://creativecommons.org/licenses/by/4.0/`,
    });
    console.log(`ok   ${id}/${title} (${songs.at(-1).duration}s)`);
  }
  catalog.collections.push({ id, name: col.name, songs });
}
fs.writeFileSync(path.join(MUSIC, 'catalog.json'), JSON.stringify(catalog, null, 1));
console.log('catalog:', catalog.collections.map((c) => `${c.name}=${c.songs.length}`).join(', '));
