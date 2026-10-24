// Downloads CC0 sound effects for the brag video into brag/source/sfx/<cue>_<n>.mp3
// (3 candidates per cue to pick from) + candidates.json. Needs FREESOUND_KEY in ./.env.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freesoundSearch, loadEnv } from '../sources.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, '..', 'brag', 'source', 'sfx');
const CUES = {
  bass_hit: ['cinematic boom hit', 3], riser: ['riser tension build', 6], record_scratch: ['record scratch', 3],
  low_thud: ['low thud', 3], plop: ['plop', 2], whoosh: ['fast whoosh', 2],
};
loadEnv(ROOT);
fs.mkdirSync(DIR, { recursive: true });
const out = {};
for (const [cue, [q, maxDur]] of Object.entries(CUES)) {
  const hits = (await freesoundSearch(q, { pageSize: 6, maxDuration: maxDur })).slice(0, 3);
  out[cue] = [];
  for (const [i, h] of hits.entries()) {
    const f = `${cue}_${i + 1}.mp3`;
    const r = await fetch(h.preview);
    if (!r.ok) continue;
    fs.writeFileSync(path.join(DIR, f), Buffer.from(await r.arrayBuffer()));
    out[cue].push({ file: f, title: h.title, author: h.author, duration: h.duration, source: `https://freesound.org/s/${h.id}/`, license: 'CC0 1.0' });
  }
  console.log(cue, out[cue].map((x) => `${x.file} "${x.title}" ${x.duration}s`).join(' | '));
}
fs.writeFileSync(path.join(DIR, 'candidates.json'), JSON.stringify(out, null, 1));
