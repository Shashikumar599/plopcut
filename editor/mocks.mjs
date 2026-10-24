// Local mock responses for CapCut API hosts (hot-reloaded on every request).
// Rules: never grant paid/VIP benefits; return the smallest valid shape that lets the
// editor continue. Unknown endpoints get a generic "ok, empty" envelope and are logged
// to test/out/api-log.jsonl so we can add specific handlers.
// Content we serve ourselves lives in ./content (see content/*/catalog.json).
import fs from 'node:fs';
import path from 'node:path';
import { coverrSearch, freesoundSearch, rememberLive } from './sources.mjs';

const ok = (data = {}) => ({ ret: '0', errmsg: 'success', log_id: 'local', data });
const js = (src = '') => ({ contentType: 'text/javascript', body: src });

// ---------- music (Audio panel) ----------
// Shapes reconstructed from services-dc4053b1: collections -> {id,name,cover_url{...}},
// songs -> {id,title,author,duration,preview_url,cover_url{thumb},is_commerce}.
function loadMusic(root) {
  const f = path.join(root, 'content', 'music', 'catalog.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : { collections: [] };
}
const enc = (p) => p.split('/').map(encodeURIComponent).join('/');
function musicCollections({ root, origin }) {
  return loadMusic(root).collections.map((c, i) => {
    const cover = `${origin}/content/music/covers/${c.id}_300x300.png`;
    return { id: String(9100 + i), key: c.id, name: c.name, cover_url: { thumb: cover, medium: cover, large: cover } };
  });
}
function musicSongs({ root, origin }) {
  const out = [];
  loadMusic(root).collections.forEach((c, ci) => c.songs.forEach((s, si) => {
    const cover = `${origin}/content/music/covers/${c.id}_300x300.png`;
    out.push({
      collection: String(9100 + ci),
      song: {
        id: String(910000 + ci * 1000 + si), title: s.title, author: s.author, duration: s.duration,
        preview_url: `${origin}/content/music/${enc(s.file)}`, is_commerce: false,
        cover_url: { thumb: cover, medium: cover, large: cover }, license: s.license, attribution: s.attribution,
      },
    });
  }));
  return out;
}
const page = (list, body) => {
  const offset = Number(body?.offset || body?.cursor || 0), count = Number(body?.count || 50);
  return { items: list.slice(offset, offset + count), has_more: offset + count < list.length, next: offset + count };
};

// ---------- effect-platform ("heycan") items ----------
// Envelope from services-dc4053b1 module 33138: common_attr.{id,effect_id,effect_type,title,md5,
// cover_url.small,item_urls[0],extra,requirements,...} + a type-specific payload.
function heycanItem({ id, effectType, title, cover, url, extraPayload }) {
  return {
    common_attr: {
      id: String(id), effect_id: String(id), effect_type: effectType, source: 1, title, description: '',
      md5: String(id), cover_url: { small: cover, medium: cover, static_img: cover }, item_urls: [url],
      is_business: false, has_favorited: false, requirements: [], extra: '{}', tag_list: [], create_time: 0,
    },
    ...extraPayload,
  };
}
const musicFeedItems = (ctx) => musicSongs(ctx).map(({ song }) => heycanItem({
  id: song.id, effectType: 4, title: song.title, cover: song.cover_url.thumb, url: song.preview_url,
  extraPayload: { song: { duration: song.duration, pgc_author_name: song.author } },
}));
// ---------- sound effects (Audio > Sound effects; Freesound CC0, see tools/fetch-sfx.mjs) ----------
// Albums: services-dc4053b1 class j (get_music_effect_collections -> collections[{id,name,cover_url}]).
// Album contents reuse get_collection_songs; feed/search items carry an `audio_effect` payload.
function loadSfx(root) {
  const f = path.join(root, 'content', 'sfx', 'catalog.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : { collections: [] };
}
const SFX_BASE = 9300;
function sfxCollections({ root, origin }) {
  return loadSfx(root).collections.map((c, i) => {
    const cover = `${origin}/content/sfx/${c.sounds[0]?.cover || ''}`;
    return { id: String(SFX_BASE + i), name: c.name, cover_url: { thumb: cover, medium: cover, large: cover } };
  });
}
function sfxSounds({ root, origin }) {
  const out = [];
  loadSfx(root).collections.forEach((c, ci) => c.sounds.forEach((s) => {
    const cover = `${origin}/content/sfx/${s.cover}`;
    out.push({
      collection: String(SFX_BASE + ci),
      song: { id: String(s.id), title: s.title, author: s.author, duration: s.duration, preview_url: `${origin}/content/sfx/${s.file}`,
        is_commerce: false, cover_url: { thumb: cover, medium: cover, large: cover }, license: s.license },
    });
  }));
  return out;
}
const sfxItem = (song) => heycanItem({
  id: song.id, effectType: 3, title: song.title, cover: song.cover_url.thumb, url: song.preview_url,
  extraPayload: { song: { duration: song.duration, pgc_author_name: song.author }, audio_effect: { duration: song.duration, pgc_author_name: song.author } },
});
async function sfxSearch(ctx, q) {
  const local = sfxSounds(ctx).map((x) => x.song).filter((s) => `${s.title} ${s.author}`.toLowerCase().includes(q));
  let live = [];
  try {
    live = (await freesoundSearch(q, { pageSize: 30 })).map((h) => {
      rememberLive('freesound', h.id, 'mp3', h.preview);
      rememberLive('freesound', h.id, 'png', h.waveform);
      const cover = `${ctx.origin}/content/live/freesound/${h.id}.png`;
      return { id: String(h.id), title: h.title, author: h.author, duration: h.duration, preview_url: `${ctx.origin}/content/live/freesound/${h.id}.mp3`, cover_url: { thumb: cover } };
    });
  } catch { /* offline: local results only */ }
  const seen = new Set(local.map((s) => s.id));
  return [...local, ...live.filter((s) => !seen.has(s.id))];
}

// ---------- stickers (Elements > Stickers/GIFs via the GIPHY slot; Noto animated emoji, CC BY 4.0) ----------
// Item shape from services-fe757b08 module 83256: {id,type,title,images{small,medium,large,static_img},author}.
function stickerItems({ root, origin }) {
  const f = path.join(root, 'content', 'stickers', 'catalog.json');
  if (!fs.existsSync(f)) return [];
  const u = (x) => `${origin}/content/stickers/${x}`;
  return JSON.parse(fs.readFileSync(f, 'utf8')).stickers.map((x) => {
    const big = { image_url: u(x.file), width: x.size, height: x.size };
    return {
      id: `noto_${x.id}`, type: 'sticker', title: x.name,
      images: { small: { image_url: u(x.small), width: x.smallSize, height: x.smallSize }, medium: big, large: big, static_img: { image_url: u(x.cover), width: x.size, height: x.size } },
      author: { name: 'Google Noto Emoji (CC BY 4.0)', description: '', avatar_url: '' },
    };
  });
}
const library = (items, body) => {
  const p = page(items, body);
  return { body: ok({ library_item_list: p.items, next_offset: p.next, has_more: p.has_more }) };
};

// ---------- stock video (Elements > Videos, panel "video_web", effect_type 5; Coverr) ----------
// Item payload from services-fe757b08 module 4171 (parser c): video{duration,duration_ms,origin_video{...,video_url},
// transcoded_video{<def>{video_url,...}},thumb}. Clips stream from our origin via /content/live/coverr/.
function loadStock(root) {
  const f = path.join(root, 'content', 'stock', 'catalog.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : { categories: [] };
}
const STOCK_BASE = 9500;
function stockItem(origin, c, liveThumb = false) {
  const cover = liveThumb ? c.thumbnail : `${origin}/content/stock/${c.id}.jpg`;
  const v = (file, def, w, h) => ({ definition: def, format: 'mp4', width: w, height: h, size: 0, video_url: `${origin}/content/live/coverr/${file}` });
  return {
    ...heycanItem({ id: `coverr_${c.id}`, effectType: 5, title: c.title, cover, url: `${origin}/content/live/coverr/${c.id}.mp4`, extraPayload: {} }),
    video: {
      duration: c.duration, duration_ms: Math.round(c.duration * 1000),
      origin_video: v(`${c.id}.mp4`, '1080p', c.width, c.height),
      // One rendition only: whatever is listed here is what the importer puts on the timeline.
      transcoded_video: { '720p': v(`${c.id}_720.mp4`, '720p', Math.round(c.width * 720 / c.height), 720) },
      thumb: { common_info: {}, detail_infos: [] },
    },
  };
}
const stockItems = ({ root, origin }, catId) => loadStock(root).categories
  .filter((c, i) => catId == null || String(STOCK_BASE + i) === String(catId))
  .flatMap((c) => c.clips.map((x) => stockItem(origin, x)));
function stockPanel(ctx) {
  const cats = loadStock(ctx.root).categories;
  const n = Number(ctx.body?.resource_count || 10);
  const category_resources = {};
  cats.forEach((c, i) => {
    const items = c.clips.map((x) => stockItem(ctx.origin, x));
    category_resources[String(STOCK_BASE + i)] = { effect_item_list: items.slice(0, n), has_more: items.length > n, next_offset: n };
  });
  return { body: ok({
    panel_source: 'heycan',
    categories: cats.map((c, i) => ({ category_id: STOCK_BASE + i, category_key: c.id, category_name: c.name, tags: [] })),
    category_resources,
  }) };
}
async function stockSearch(ctx, q) {
  const local = stockItems(ctx).filter((i) => i.common_attr.title.toLowerCase().includes(q));
  let live = [];
  try {
    live = (await coverrSearch(q, { pageSize: 24 })).filter((h) => !h.vertical).map((h) => {
      rememberLive('coverr', h.id, 'mp4', h.mp4);
      rememberLive('coverr', `${h.id}_360`, 'mp4', h.preview);
      rememberLive('coverr', `${h.id}_720`, 'mp4', h.mp4.replace(/1080p\.mp4$/, '720p.mp4'));
      return stockItem(ctx.origin, h, true);
    });
  } catch { /* offline: local only */ }
  const seen = new Set(local.map((i) => i.common_attr.id));
  return [...local, ...live.filter((i) => !seen.has(i.common_attr.id))];
}

const feed = (items, body) => {
  const p = page(items, body);
  return { body: ok({ effect_item_list: p.items, next_offset: p.next, has_more: p.has_more }) };
};

const routes = [
  // Effect-platform feeds: serve our own catalogs per effect_type (4 = music).
  [/^\/artist\/v1\/effect\/ccweb\/feed$/, (ctx) => {
    if (Number(ctx.body?.effect_type) === 4) return feed(musicFeedItems(ctx), ctx.body);
    if (Number(ctx.body?.effect_type) === 3) return feed(sfxSounds(ctx).map((x) => sfxItem(x.song)), ctx.body);
    if (Number(ctx.body?.effect_type) === 5) return feed(stockItems(ctx), ctx.body);
    return feed([], ctx.body);
  }],
  [/^\/artist\/v1\/effect\/search$/, async (ctx) => {
    const q = String(ctx.body?.keyword || ctx.body?.query || ctx.body?.search_word || '').toLowerCase().trim();
    if (Number(ctx.body?.effect_type) === 3) return feed((q ? await sfxSearch(ctx, q) : sfxSounds(ctx).map((x) => x.song)).map(sfxItem), ctx.body);
    if (Number(ctx.body?.effect_type) === 5) return feed(q ? await stockSearch(ctx, q) : stockItems(ctx), ctx.body);
    if (Number(ctx.body?.effect_type) !== 4) return feed([], ctx.body);
    return feed(musicFeedItems(ctx).filter((i) => !q || i.common_attr.title.toLowerCase().includes(q)), ctx.body);
  }],
  // Compliance popups (crashes the Audio panel's parent when missing).
  [/^\/lv\/v1\/sc\/compliance_popup\/fetch_all$/, () => ({ body: ok({ compliance_popups: [] }) })],
  // Effect-platform algorithm model registry. Built-in adjustments need no extra models;
  // effects that do require models will get an empty list (and stay unavailable).
  [/^\/model\/api\/arithmetics$/, () => ({ body: { status_code: 0, message: 'success', data: { arithmetics: { cakeCook: [] } } } })],

  // Music library
  [/^\/lv\/v1\/(music\/)?get_collections$/, (ctx) => ({ body: ok({ collections: musicCollections(ctx), has_more: false }) })],
  [/^\/lv\/v1\/music\/get_music_effect_collections$/, (ctx) => ({ body: ok({ collections: sfxCollections(ctx), has_more: false }) })],
  [/^\/lv\/v1\/(music\/)?get_collection_songs$/, (ctx) => {
    const all = [...musicSongs(ctx), ...sfxSounds(ctx)].filter((x) => x.collection === String(ctx.body?.id)).map((x) => x.song);
    const p = page(all, ctx.body);
    return { body: ok({ songs: p.items, has_more: p.has_more, offset: p.next }) };
  }],
  [/^\/lv\/v1\/music\/search\/songs$/, async (ctx) => {
    const q = String(ctx.body?.keyword || ctx.body?.query || ctx.body?.search_word || '').toLowerCase();
    if (Number(ctx.body?.search_song_type) === 1) { // 1 = audioEffect (services-dc4053b1 enum x)
      const p = page(q ? await sfxSearch(ctx, q) : sfxSounds(ctx).map((x) => x.song), ctx.body);
      return { body: ok({ songs: p.items, has_more: p.has_more, offset: p.next }) };
    }
    const all = musicSongs(ctx).map((x) => x.song).filter((s) => !q || `${s.title} ${s.author}`.toLowerCase().includes(q));
    const p = page(all, ctx.body);
    return { body: ok({ songs: p.items, has_more: p.has_more, offset: p.next }) };
  }],
  [/^\/lv\/v1\/music\/multi_get_songs$/, (ctx) => {
    const ids = new Set((ctx.body?.ids || ctx.body?.song_ids || []).map(String));
    return { body: ok({ songs: musicSongs(ctx).map((x) => x.song).filter((s) => ids.has(s.id)) }) };
  }],

  // Stock video panel (Elements > Videos).
  [/^\/artist\/v1\/panel\/get_panel_info$/, (ctx) => (ctx.body?.panel === 'video_web' ? stockPanel(ctx) : { body: ok() })],
  [/^\/artist\/v1\/effect\/get_resources_by_category_id$/, (ctx) => (ctx.body?.panel === 'video_web'
    ? feed(stockItems(ctx, ctx.body?.category_id), ctx.body) : { body: ok() })],

  // GIPHY slot -> our sticker library (both the "gif" and "sticker" tabs).
  [/^\/artist\/v1\/library\/giphy\/trending$/, (ctx) => library(stickerItems(ctx), ctx.body)],
  [/^\/artist\/v1\/library\/giphy\/search$/, (ctx) => {
    const q = String(ctx.body?.query || '').toLowerCase().trim();
    return library(stickerItems(ctx).filter((x) => !q || x.title.toLowerCase().includes(q)), ctx.body);
  }],
  [/^\/artist\/v1\/library\/giphy\/mget_by_ids$/, (ctx) => {
    const ids = new Set((ctx.body?.idList || []).map(String));
    return { body: ok({ library_item_list: stickerItems(ctx).filter((x) => ids.has(x.id)) }) };
  }],
  [/^\/artist\/v1\/library\/giphy\/search_words$/, () => ({ body: ok({ search_words: [], words: [] }) })],

  // Template feeds (services-fe757b08 "replicate" API). We have no templates; an empty-but-valid
  // shape stops `data.templates.map` throwing, which surfaced as "Something went wrong" toasts.
  [/^\/lv\/v1\/cc_web\/replicate\/(get_collections|get_collection_templates|get_recommended_templates|search_templates|multi_get_templates|get_search_words)$/,
    () => ({ body: ok({ collections: [], templates: [], video_templates: [], item_list: [], search_words: [], words: [], has_more: false, new_cursor: 0 }) })],

  // third-party scripts (Google sign-in etc.): empty script
  [/\.js$|^\/gsi\/client$/, () => js('/* blocked by local sandbox */')],
  // telemetry / monitoring sinks: accept and drop
  [/\/(monitor_browser|monitor_web|collect|service\/2\/|webid|list$|abtest_config|event\/report|stat\/report)/, () => ({ body: ok() })],
];

export async function handle(ctx) {
  for (const [re, fn] of routes) {
    if (re.test(ctx.path)) return { matched: true, ...(await fn(ctx)) };
  }
  return { matched: false, body: ok() };
}
