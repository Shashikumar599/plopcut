// Builds the Stickers library from Google's Noto animated emoji (CC BY 4.0) into content/stickers/
// and writes content/stickers/catalog.json. CapCut's GIPHY sticker slot takes animated GIFs.
// Each sticker: <cp>.gif (512px), <cp>_s.gif (200px, panel preview), <cp>.png (first frame cover).
// Usage: node tools/fetch-stickers.mjs   (re-run safe)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'content', 'stickers');
const SRC = (cp) => `https://fonts.gstatic.com/s/e/notoemoji/latest/${cp}/512.gif`;
const EMOJI = {
  '1f525': 'Fire', '1f92f': 'Mind blown', '1f680': 'Rocket', '2728': 'Sparkles', '1f389': 'Party popper', '1f4af': 'Hundred',
  '1f60d': 'Heart eyes', '1f929': 'Star-struck', '1f923': 'Rolling on the floor laughing', '1f480': 'Skull', '1f60e': 'Sunglasses',
  '1f44f': 'Clapping', '1f64c': 'Raised hands', '1f4aa': 'Flexed biceps', '1f402': 'Ox', '1f403': 'Water buffalo', '1f3d4_fe0f': 'Snow-capped mountain',
  '1f31e': 'Sun with face', '1f308': 'Rainbow', '26a1': 'High voltage', '1f4a5': 'Collision', '1f440': 'Eyes', '1f914': 'Thinking',
  '1f4ab': 'Dizzy', '1f31f': 'Glowing star', '1f4f8': 'Camera with flash', '1f3ac': 'Clapper board', '1f3c6': 'Trophy', '1f451': 'Crown',
  '1f4b0': 'Money bag', '1f48e': 'Gem', '2764_fe0f': 'Red heart', '2705': 'Check mark', '274c': 'Cross mark', '1f6a8': 'Police light',
  '1f6ab': 'Prohibited', '1f30f': 'Globe Asia-Australia', '1f631': 'Screaming', '1f62d': 'Loudly crying', '1f973': 'Partying face',
  '1f911': 'Money-mouth', '1f47b': 'Ghost', '1f916': 'Robot', '1f47d': 'Alien', '1f4a1': 'Light bulb', '1f9e0': 'Brain', '1f40e': 'Horse',
};

fs.mkdirSync(DIR, { recursive: true });
const stickers = [];
for (const [cp, name] of Object.entries(EMOJI)) {
  const gif = path.join(DIR, `${cp}.gif`), small = path.join(DIR, `${cp}_s.gif`), png = path.join(DIR, `${cp}.png`);
  if (!fs.existsSync(gif)) {
    const r = await fetch(SRC(cp));
    if (!r.ok) { console.warn('skip (not animated?)', cp, name, r.status); continue; }
    fs.writeFileSync(gif, Buffer.from(await r.arrayBuffer()));
  }
  if (!fs.existsSync(small)) execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', gif, '-vf', 'scale=200:-1:flags=lanczos,split[a][b];[a]palettegen=reserve_transparent=1[p];[b][p]paletteuse', small]);
  if (!fs.existsSync(png)) execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', gif, '-frames:v', '1', png]);
  stickers.push({ id: cp, name, file: `${cp}.gif`, small: `${cp}_s.gif`, cover: `${cp}.png`, size: 512, smallSize: 200 });
}
fs.writeFileSync(path.join(DIR, 'catalog.json'), JSON.stringify({
  source: 'Noto Emoji animations (Google), https://googlefonts.github.io/noto-emoji-animation/',
  license: 'CC BY 4.0', attribution: 'Animated emoji by Google, Noto Emoji, CC BY 4.0', stickers,
}, null, 1));
console.log(`stickers: ${stickers.length}`);
