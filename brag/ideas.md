# Brag video — ideas (do not start until user says go)

The brag video is a layer **on top of** the screen-recorded demo
(`editor/test/out/demo/demo-walkthrough.mp4`), not a replacement for it.

## Structure (user's plan)

1. **Cold open — hype everything (suspense).** Starts on a sound effect, then
   punchy lines, one at a time:
   1. "Software is dead"
   2. "Adobe Photoshop"
   3. "Everything is free now"
   4. "I reverse engineered Netflix"
   5. "…wait, let's try CapCut"
2. **India: no access.** capcut.com/editor: real "Not Found" page + "451 · Unavailable For Legal Reasons".
3. **What we pulled from the public CDN.** The archived editor HTML, JS
   chunks, the 36 MB WASM engine; files appearing / the network log.
4. **Demo begins.** The recorded walkthrough (next section).
3. **Demo (aura farming, high energy).** The recorded walkthrough:
   - upload the iPhone clip (IMG_9617, Changthang)
   - add a title, then show it being made smaller and moved up
   - colour adjustment
   - add music
   - play
   - export, rendered locally
4. **Ending — the limitation.** Why it's only client side. Anything that needs
   CapCut's servers is missing:
   - cloud export
   - AI features
   - their content libraries
   - login / sync

   We stubbed or replaced those parts, and that's where REA stops being
   enough on a real system.

## 30 s timeline (user's version, 2026-10-19) — LOCKED unless changed

| Time | Beat | On screen | Audio |
|---|---|---|---|
| 0–0.8 | Hook 1 | "Software is dead" | bass hit |
| 0.8–1.3 | Hook 2 | "Adobe Photoshop" (flash) | hit |
| 1.3–2.1 | Hook 3 | "Everything is free now" | hit, rise starts |
| 2.1–3.1 | Hook 4 | "I reverse engineered Netflix" | rise builds |
| 3.1–4.1 | REA | "All thanks to REA" + ⭐ star badge (live count: 334k on 2026-10-19, not 252k) | rise peaks |
| 4.1–5.3 | Turn | record scratch → "…wait. Let's try CapCut" | scratch, silence |
| 5.3–6.8 | Wall | typing capcut.com/editor → real "Not Found" page → stamp "451 · Unavailable For Legal Reasons" | low thud |
| 6.8–9.3 | Break-in | editor page → files → 36 MB engine → running on localhost | music kicks in (Monkeys Spinning Monkeys) |
| 9.3–20.3 | Demo | 11 s aura cut | music, whoosh on the yak |
| 20.3–26.5 | Reality | "But it's only the client" → export rebuilt locally → AI, templates, transitions are server-only → no login or sync (one line at a time) | music drops low |
| 26.5–27.6 | Close 1 | "The client was always public." | music cuts |
| 27.6–28.8 | Close 2 | "The backend never will be." | one low hit |
| 28.8–29.4 | Outro | plopcut pops in | "plop" |
| 29.4–30 | (tail) | plopcut → the p flips to f: **flopcut** (it flopped) | ring-out |

Reference material: brag/source/ (YouTube thumbnails + transcript of an
REA video; transcript timestamps are irrelevant). User OK'd using the thumbnails and original logos as-is.

## Demo recording changes requested

- Title sits higher on the canvas.
- Show the title being resized smaller on camera.
- No "Something went wrong" toasts.
- Make the demo itself cool. Add a transition at about 2 s, when the yak is
  in the air.

## Notes / open points (Claude)

- **"I reverse engineered Netflix" is not true as stated.** Posting it as
  fact is a false claim about a real company and invites scrutiny.
  Options:
  - frame it as the bait in a joke that the next beat corrects
    ("…ok not Netflix. CapCut.")
  - or drop it
- **"Entire CapCut in 2 hrs" overclaims.** It's the client side, and it took
  the session, not two hours. Suggested framing: "CapCut's whole editor
  engine, running on my laptop". Let the ending carry the honest scope.
- **"Everything is free" / "software is dead"** work as hooks, as long as the
  ending answers them. The real answer: the client is free to read, the
  servers are the product.
- **Must keep in the video/post:**
  - not affiliated with CapCut
  - local study only, nothing redistributed
  - no how-to for getting around the 451 block

## Decisions (2026-10-19)

- Format **1:1 (1080×1080)**. No voiceover. No disclaimer line on screen.
- Reality beat: keep it short and terse; do not stretch lines to fill time.
- Original logos and the brag/source thumbnails may be used as-is.
- Branding: once "CapCut" is introduced, everything we show is **plopcut** (local editor tab, logo,
  favicon, export file names). The outro flips plopcut → **flopcut** because it flopped.
- REA badge uses the live GitHub count (334k stars, 84k forks on 2026-10-19), not 252k.
- Wall beat uses the real capture: capcut.com loads, "Try online" → login popup "Not Found",
  capcut.com/editor → **HTTP 451** with a bare "Not Found" body. Wall beat shows BOTH: the real
  "Not Found" page, then the stamp "451 · Unavailable For Legal Reasons".
- No music credit line in the video.

## Prepared resources (brag/source/)

- recorded/capcut-home.png, capcut-login-notfound.png, capcut-wall.png, capcut-wall.webm (test/capture-wall.mjs)
- sfx/*.mp3 + candidates.json: bass_hit, riser, record_scratch, low_thud, plop, whoosh (Freesound CC0, 3 each)
- demo: test/out/demo/demo-walkthrough.mp4 (+ exported.mp4 for the hero yak shot)
- music: content/music/upbeat/Monkeys Spinning Monkeys.mp3 (Kevin MacLeod, CC BY 4.0)
