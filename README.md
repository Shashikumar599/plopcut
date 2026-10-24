# plopcut

A web video editor experiment: CapCut's web editor (its own UI and its C++/WebAssembly engine) running
on localhost, with our own pieces plugged in where CapCut needs its servers: local export, upload
transcoding, music, sound effects, stickers, stock video and transitions.

> Personal research project, not affiliated with CapCut or ByteDance. Apart from the editor entry page
> (`editor/vendor/editor.archived.html`), CapCut's client files aren't committed or redistributed (see
> `.gitignore`); they're cached on the machine that fetched them.

## Layout

| Path | What |
|---|---|
| `editor/` | Local server and plugins that run the editor as **plopcut** on `http://127.0.0.1:5174/editor` |
| `docs/research.md` | The full process: what we tried, what worked, what didn't, and the decisions behind it |

## Editor

```bash
cd editor
npm install
cp .env.example .env          # optional: FREESOUND_KEY, COVERR_KEY (see below)
npm run fetch:content         # music, sound effects, stickers, stock catalog -> content/
npm run build                 # builds public/editor/index.html from vendor/editor.archived.html
npm start                     # http://127.0.0.1:5174/editor
```

Requirements: macOS, Node 20+, ffmpeg/ffprobe (upload transcoding), Google Chrome (demo recording).

The repo carries one CapCut file, `editor/vendor/editor.archived.html` (the editor page; see its header
comment). Everything that page loads (about 75 MB of JS, CSS and the WASM engine) is downloaded from
CapCut's public CDN on first load and cached in `editor/vendor-cdn/`, which is gitignored. The first
start takes a little longer; later starts work offline.

### What it adds on top of CapCut's client

| Area | CapCut needs | plopcut uses |
|---|---|---|
| Server calls | CapCut API hosts | `mocks.mjs`: local replies only, nothing is sent to CapCut |
| Upload | cloud transcode for HEVC/HDR/120 fps | `/__ingest`: ffmpeg to H.264 ≤60 fps on this machine |
| Export | cloud render, login | `public/__export.js`: engine frames → WebCodecs H.264 + AAC → MP4, in the browser |
| Music | CapCut library | 22 Kevin MacLeod tracks (CC BY 4.0) |
| Sound effects | CapCut library | Freesound, CC0 only: 118 cached + live search |
| Stickers | GIPHY via CapCut | Google Noto animated emoji (CC BY 4.0) |
| Stock video | CapCut library | Coverr: 8 categories + live search |
| Transitions | server effect packages | `public/__fx.js` "Plopcut FX": split + speed + keyframes (Flash ramp, Speed ramp, Flash cut, Zoom punch) |
| Branding | | `public/__brand.js`: plopcut title, favicon, logo |

Keys live in `editor/.env` (gitignored): `FREESOUND_KEY` (freesound.org API), `COVERR_KEY` (coverr.co API).
Without them, `fetch:content` still builds music and stickers, but Sound effects and Stock videos stay
empty. The editor itself runs without any of this content.


