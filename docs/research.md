# plopcut: reverse engineering CapCut's web editor

What we set out to do, how it went, and why we made the calls we made. Written October 2026.

## 1. Goal

plopcut started as "a web video editing tool". The question became: how much of a real, production
editor can you get by reverse engineering its web client, with REA (Reverse Engineer Anything) and an AI
agent doing the digging?

The target was CapCut's web editor, for three reasons:

- it is a full editor running in the browser
- its engine is a large C++ codebase compiled to WebAssembly
- it depends heavily on its own servers

The end goal was a working demo with our own footage, then a short video and post about where reverse
engineering works and where it stops.

## 2. Ground rules

These were set early and held throughout.

- **Local study copy only.** CapCut's client files are cached on the machine that uses them and are never
  committed (see `.gitignore`). The single exception is the editor entry page,
  `editor/vendor/editor.archived.html`, kept with a header comment so a fresh clone can boot.
- **Nothing is sent to CapCut's APIs.** Every API call from the editor is answered locally by
  `editor/mocks.mjs`. Only public static files (JS, CSS, WASM, effect packages) are fetched from CapCut's
  CDN, once each, and cached.
- **No fake login, no fake VIP, no paywall bypass, no decrypting protected effect packages.** Mocks
  return the smallest valid "empty" answer, and never grant paid benefits.
- **Content we plug in must be ours to use:**
  - CC0 sound effects
  - CC BY music and emoji
  - Coverr's free licence for stock video
  - our own footage
- **Public write-ups explain the method, not a bypass recipe.**

## 3. Process

### 3.1 First contact: the 451 wall

From India, `capcut.com` loads, but:
- "Try online" opens a login popup that just says "Not Found"
- `capcut.com/editor` returns **HTTP 451 Unavailable For Legal Reasons**

A HAR file captured in the browser had the wrong page and no response bodies, so it didn't help.

The editor page itself is public on the Internet Archive, and every file it loads is on CapCut's public
CDN. From those we put together a local snapshot of the client (HTML, around 305 JS files, CSS, and the
WASM engine) on our own machine.

### 3.2 What REA found

| Piece | Finding |
|---|---|
| App | React app; code split into webpack/rspack chunks loaded through `__LOADABLE_LOADED_CHUNKS__` |
| Engine | "VESDK / lvapi": Emscripten C++ → WASM, about 36 MB (SIMD and non-SIMD builds), pthreads, 76 embind classes, an FFmpeg side module |
| Media | WebGL2 rendering, WebCodecs `VideoDecoder`, AudioWorklet, OPFS-backed file system |
| API | every engine call is async, resolved through `Module.lv_api_wait_init` |
| Project model | CapCut `draft_content`: tracks → segments → materials, times in BigInt microseconds |
| Render facade | the render manager is exposed as `window.__renderManger`; it holds `_dataSDK` (draft view and edit API) and `_renderSdk.preview` |
| Export | cloud only: `/lv/v1/render_task/create`, behind login |
| Effects | "AmazingFeature" ZIP packages on a public CDN, unencrypted, loaded by md5 |

**Where REA helped:**
- `capture_browser_scenario` gave reliable runtime evidence.
- Its structure for observation, inference and unknowns kept the agent honest about what was proven and
  what was assumed.

**Where it hit limits:**
- The HAR inspector rejected the capture over an IPv6 server address.
- JS analysis timed out on a 27 MB bundle.
- WASM inspection needed WABT, which wasn't installed.
- Large results overflowed the agent's context.

Most of the real mapping was done with targeted searches over the code, a JS beautifier, and the
browser's own runtime. In other words, the things Chrome DevTools has always offered. That observation
became the punchline of the video.

### 3.3 Booting the engine alone

We first built a small harness page that loaded the engine and SDK, added clips, played, seeked and
exported, with a 10-check test. It proved the engine runs locally. It was removed once CapCut's own UI
was running, along with the regression tests and investigation probes, to keep the repo lean.

Problems fixed along the way:
- side modules had to be passed to the WASM factory
- the WASM MIME type was wrong
- COOP/COEP headers were needed for SharedArrayBuffer

### 3.4 Booting CapCut's own UI

At this point we had a choice: build our own UI on top of the engine, or boot CapCut's real UI. We chose
**CapCut's own UI**. It's the stronger proof, and it's what the demo needed to show.

| Problem | Fix |
|---|---|
| Cross-origin calls everywhere | A service worker (`public/__sw.js`) routes every cross-origin request to the local server. Static hosts go to the local cache; everything else goes to the mocks. |
| Workers failed cross-origin | Rewrote webpack `publicPath` to same-origin (`patches.mjs`, applied as files are served) |
| Their fetch upgrades http→https | The server recognises its own host inside `/__x/<host>/…` |
| Telemetry and anti-bot scripts | Dropped from the HTML (`tools/make-editor.mjs`); no-op stub for their monitoring SDK |
| Startup failures were invisible (their runtime swallows console output) | Diagnostic patches push to `self.__patchLog` |
| Sign-in modal, onboarding tours, "projects won't be saved" banner | `public/__demo.js` dismisses them using CapCut's own close buttons (guest mode is something CapCut itself allows) |

Result: the real editor at `http://127.0.0.1:5174/editor` in guest mode, with import, timeline,
playback, text, colour adjustment and audio all working.

### 3.5 iPhone uploads

The user's clip (`IMG_9617.mov`: 1080p, about 120 fps, HEVC 10-bit Dolby Vision) stalled at 0%.

We traced this through the code to CapCut's quick-import gate. Local import requires:
- the engine can test-decode it (HEVC returns −1)
- fps ≤ 60
- GOP ≤ 250
- ≤ 4096 px and ≤ 8.3 MP

Anything else goes to a cloud upload, which can never finish here.

**Fix:** `public/__ingest.js` intercepts file inputs and drops, and posts video to `/__ingest`. There,
ffmpeg keeps files that already qualify. Anything else is transcoded to H.264 8-bit 4:2:0 BT.709 at no
more than 60 fps, with a GOP of one second, using VideoToolbox with a libx264 fallback. The file is then
handed back to CapCut's own uploader. HDR is converted, not tone-mapped.

### 3.6 Colour and effects

Colour adjustments did nothing at first. There were two causes:
- a model-registry call (`/model/api/arithmetics`) needed a mock
- effect ZIPs were served as `octet-stream`, and the loader only unzips `application/zip`

The server now detects file types by their first bytes, so extensionless CDN files get the right type.

### 3.7 Export

CapCut's export is a cloud render behind login. `public/__export.js` takes over the Export button and
renders locally instead:

1. Frames come from the engine itself. We tried reading the engine's file system first; it fails because
   the storage is OPFS-backed. Instead we use `preview.getVideoFrames` batches with the `onGetFrames`
   callback.
2. Frames are encoded with WebCodecs H.264.
3. Audio is rebuilt from the draft: every audio, music, sound or extracted segment, placed with its trim,
   speed and volume, mixed in an `OfflineAudioContext`, then encoded as AAC. Streamed library audio (an
   `asset_id://` path) is resolved through the render manager's stream records.
4. `mp4-muxer` packs it all into an MP4.

Bugs found and fixed:
- 480p hung because width 854 wasn't a multiple of 16
- 1080p came out as 1088 tall; the fix rounds height to even only
- music was silent until streamed assets were resolved

Verified at 1080p, 720p and 480p, with audio. The 11.6 s demo exports at 720p in about 6 s.

### 3.8 Filling the panels CapCut's servers fill

Each panel's request and response shape was rebuilt from the code that parses it, then fed our own
content.

| Panel | How it's served | Content |
|---|---|---|
| Audio → Music | `get_collections` / `collection_songs`; ccweb feed `effect_type` 4 | 22 Kevin MacLeod tracks, CC BY 4.0 |
| Audio → Sound effects | `get_music_effect_collections`; feed `effect_type` 3 (needs both the `song` and `audio_effect` payloads); search via `search_song_type: 1` | Freesound CC0: 118 cached in 10 categories, plus live search through the API key |
| Elements → Giphy | `/artist/v1/library/giphy/*` (`library_item_list`) | 43 Google Noto animated emoji, CC BY 4.0 |
| Elements → Stock videos | panel `video_web`: categories plus `category_resources`; items `effect_type` 5 with `video{origin_video, transcoded_video}` | Coverr: 8 categories, 720p clips fetched on first use, plus live search |
| Transitions | (server catalogue, empty offline) | Plopcut FX, see 3.9 |

Live third-party files are served from our own origin as `/content/live/<source>/<file>`, and cached.
That way the editor never talks to the third parties directly.

**Source decisions:**
- Pexels has paused new API keys, and Pixabay wasn't available, so we went with **Coverr**.
- Freesound searches are limited to CC0 so no credit tracking is needed.

**"Something went wrong" toasts.**

Timing them against network calls didn't identify a culprit, because dozens of calls fire together. What
worked:
1. A diagnostic patch (`TOAST_TRACE=1 node server.mjs`) tags every error string in the locale file with its key.
2. It also records a stack trace whenever the generic network-error toast is shown.
3. And it logs failing "recommend" feeds.

The causes found:
- template feeds expected `templates` / `item_list` arrays
- sound effects expected a `song` payload
- GIPHY expected `library_item_list`

All fixed. One toast remains, inside the Templates panel, which the demo never opens.

### 3.9 Transitions: Plopcut FX

CapCut's transitions, effects, filters and animations are server-hosted packages, and the user ruled
building our own out of scope. But the demo needed one great moment: the yak leaving the ground at
about 1.1 s.

`public/__fx.js` adds four cards to the Transitions panel. Each one is a recipe built from the engine's
own edit API, applied at the playhead as a single undo step:

| Card | Recipe |
|---|---|
| Flash ramp | split + `video.setSpeed` 0.35× + scale keyframes 1→1.3 + a brightness keyframe flash |
| Speed ramp | the same, without the flash |
| Flash cut | a flash on a cut |
| Zoom punch | a quick zoom-in |

Two quirks found while building it:
- The brightness keyframe only renders once the clip has a colour-adjust layer. The flash now also
  settles back to the clip's own brightness instead of 0.
- CapCut's first-run "drag a transition" tip sat exactly under our first card. Its "OK" click was landing
  on Speed ramp. The tip is now dismissed before the cards appear.

### 3.10 The scripted demo

`test/demo-record.mjs` records the whole walkthrough in headed Chrome, with a visible cursor and click
ripples. The steps:

1. upload the iPhone clip
2. Saturation +37, Brightness −10
3. **Flash ramp** at the jump
4. type "Ladakh", shrink it and move it to the top, extended over the full clip
5. search Freesound for "whoosh" and add it
6. add "Monkeys Spinning Monkeys", trimmed to the clip
7. browse Coverr stock clips and *decide not to use one*
8. play, then export at 720p

The timeline is drawn on an OffscreenCanvas, so there are no DOM elements to click. Seeking clicks the
ruler and corrects against the timecode readout. The main track is located from its cover box.

### 3.11 Branding

Once "CapCut" has been introduced, everything shown is **plopcut**: the tab title, favicon, sidebar logo
and export file names. The editor UI itself is unchanged. The video's ending flips plopcut to
**flopcut**.

## 4. The video (`brag/`)

The script is in `brag/ideas.md`; the build is in `brag/work/`.

The format is 1080×1080, 30 s, no voiceover. Every frame is rendered by a pure `render(t)` in
`index.html`, captured with headless Chrome, and mixed in `mix.py`: Freesound CC0 effects plus the
music, at about −15.5 LUFS.

| Time | Beat |
|---|---|
| 0–3.1 s | Hype: "Software is dead" · "Adobe Photoshop" · "Everything is free now" · "I reverse engineered Netflix" (over YouTube REA thumbnails) |
| 3.1–4.1 s | "All thanks to REA", with the live GitHub count: ★ 334K, 84K forks |
| 4.1–6.8 s | Record scratch, "…wait. Let's try CapCut", then the real "Not Found" page with **451 · Unavailable For Legal Reasons** |
| 6.8–9.3 s | Break-in: archived editor HTML → 305 JS files → 36.2 MB engine → localhost plopcut |
| 9.3–20.3 s | Demo, with the yak Flash ramp as the hero shot |
| 20.3–26.5 s | "I got the whole editor. 36 MB." · "Half of it is buttons that call home." (server-only UI greyed out) · "REA didn't unlock this. DevTools always could." (a Network panel of the real files; REA wraps Chrome DevTools 2008, Ghidra 2019, IDA 1991) |
| 26.5–30 s | "Software isn't dead." · "You just cloned the part that was free." · plopcut → flopcut, cut to black |

## 5. What works and what doesn't

**Works locally:**
- CapCut's UI and engine
- import, including 120 fps HEVC
- timeline, playback, text, colour, keyframes and speed
- music, sound effects, stickers and stock video from our own sources
- our transitions
- export to MP4 with audio

**Doesn't, and can't without CapCut's servers:**
- login, sync and cloud projects
- AI features: captions, the AI prompt, smart tools, model downloads
- templates and the CapCut content catalogues
- server-hosted effects, transitions, filters and animations
- cloud export

## 6. Takeaways

1. **The client was always public.** Everything we used was shipped to every browser: the UI, a 36 MB
   engine, the effect packages. Reverse engineering it is reading, not breaking in.
2. **The value is in the backend.** About half the visible UI is buttons that call home. Rebuilding
   export took real work; rebuilding AI, templates and catalogues means rebuilding the business.
3. **REA is a convenience layer, not a new capability.** It wraps DevTools, Ghidra, IDA and friends for
   an agent. In practice, browser runtime evidence and targeted code search did most of the work, and
   REA's own tools hit size and environment limits on a real bundle.
4. **Where it does pay off:** fast, honest exploration. An agent with good runtime evidence went from a
   451 error to a working editor with local export and plugged-in content in a few sessions.

## 7. Repo map

| Path | Contents |
|---|---|
| `editor/server.mjs` | Static server and CDN cache; mock routing; magic-byte content types; `/__ingest` transcoder; live content proxy |
| `editor/mocks.mjs` | All API replies (music, sound effects, stickers, stock, templates, compliance, telemetry sinks) |
| `editor/patches.mjs` | Minimal, documented text patches to CapCut's JS as served: publicPath, diagnostics |
| `editor/sources.mjs` | Freesound and Coverr clients, and the live-asset cache |
| `editor/public/__*.js` | Injected plugins: service worker, ingest, export, FX, demo polish, branding |
| `editor/vendor/editor.archived.html` | CapCut's editor page (the only CapCut file in the repo) |
| `editor/tools/` | `make-editor.mjs` and the content fetchers |
| `editor/test/` | The demo recorder (`demo-record.mjs`) and the capcut.com capture for the video (`capture-wall.mjs`) |
| `brag/` | Video plan, ideas, composition source, render scripts |
