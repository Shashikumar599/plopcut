// Local export for the CapCut study copy.
// CapCut web exports by uploading the project to a cloud renderer (/lv/v1/render_task/create)
// and requires sign-in. We replace the Export button with a local render instead:
//   video: CapCut's own engine renders every frame (text, adjustments, overlays) via
//          getVideoFrames -> RGBA, encoded with WebCodecs H.264
//   audio: the timeline's audio segments (same placement/trim/volume/speed) mixed with
//          OfflineAudioContext, encoded with WebCodecs AAC
//   mux:   mp4-muxer (served from /lib)
(function () {
  if (new URLSearchParams(location.search).get('localexport') === '0') return;
  var busy = false;

  // ---------- UI ----------
  function el(tag, css, html) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (html != null) e.innerHTML = html; return e; }
  function openDialog() {
    var rm = window.__renderManger;
    var view = rm && rm._dataSDK && rm._dataSDK.draftView;
    var dur = view ? Number(view.getDuration()) / 1e6 : 0;
    var cv = (view && view.getCanvasConfig && view.getCanvasConfig()) || { width: 1920, height: 1080 };
    var mask = el('div', 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2147483646;display:flex;align-items:center;justify-content:center;font:14px/1.45 -apple-system,system-ui,sans-serif');
    var card = el('div', 'width:420px;background:#fff;color:#111;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.35);padding:22px 22px 18px');
    card.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:17px">Export</b><span data-x style="cursor:pointer;font-size:20px;color:#888">×</span></div>' +
      '<div style="color:#666;margin:6px 0 14px;font-size:12.5px">Rendered on this computer by the editor engine. Nothing is uploaded.</div>' +
      '<label style="display:block;margin:8px 0 4px;color:#444">Resolution</label>' +
      '<select data-res style="width:100%;padding:8px;border-radius:8px;border:1px solid #ddd"><option value="1080">1080p</option><option value="720" selected>720p</option><option value="480">480p</option></select>' +
      '<label style="display:block;margin:10px 0 4px;color:#444">Frame rate</label>' +
      '<select data-fps style="width:100%;padding:8px;border-radius:8px;border:1px solid #ddd"><option>24</option><option selected>30</option><option>60</option></select>' +
      '<div style="margin:12px 0 0;color:#666;font-size:12.5px">Length ' + dur.toFixed(1) + 's · Canvas ' + cv.width + '×' + cv.height + '</div>' +
      '<div data-prog style="display:none;margin-top:14px"><div style="height:8px;background:#eee;border-radius:6px;overflow:hidden"><div data-bar style="height:100%;width:0;background:#00c1cd;transition:width .2s"></div></div><div data-msg style="margin-top:6px;color:#555;font-size:12.5px"></div></div>' +
      '<div data-done style="display:none;margin-top:14px"></div>' +
      '<button data-go style="margin-top:16px;width:100%;padding:10px;border:0;border-radius:10px;background:#00c1cd;color:#fff;font-weight:600;font-size:14px;cursor:pointer">Export MP4</button>';
    mask.appendChild(card);
    document.body.appendChild(mask);
    var $ = function (s) { return card.querySelector(s); };
    $('[data-x]').onclick = function () { if (!busy) mask.remove(); };
    $('[data-go]').onclick = function () {
      if (busy || !dur) return;
      busy = true;
      $('[data-go]').disabled = true; $('[data-go]').style.opacity = '.5';
      $('[data-prog]').style.display = 'block';
      var height = Number($('[data-res]').value), fps = Number($('[data-fps]').value);
      var progress = function (p, msg) { $('[data-bar]').style.width = Math.round(p * 100) + '%'; $('[data-msg]').textContent = msg; };
      exportLocal({ height: height, fps: fps, onProgress: progress }).then(function (r) {
        busy = false;
        var url = URL.createObjectURL(r.blob);
        var name = (document.title.split('|')[0].trim() || 'export').replace(/[^\w.-]+/g, '_') + '_' + Date.now() + '.mp4';
        $('[data-prog]').style.display = 'none'; $('[data-go]').style.display = 'none';
        $('[data-done]').style.display = 'block';
        $('[data-done]').innerHTML = '<video src="' + url + '" controls autoplay style="width:100%;border-radius:8px;background:#000"></video>' +
          '<div style="margin-top:8px;color:#555;font-size:12.5px">' + r.width + '×' + r.height + ' · ' + r.fps + 'fps · ' + (r.blob.size / 1e6).toFixed(1) + ' MB · rendered in ' + r.seconds.toFixed(1) + 's' + (r.audio ? ' · audio ✓' : '') + '</div>' +
          '<a href="' + url + '" download="' + name + '" style="display:block;text-align:center;margin-top:10px;padding:10px;border-radius:10px;background:#111;color:#fff;text-decoration:none;font-weight:600">Download MP4</a>';
        window.__lastLocalExport = { url: url, name: name, size: r.blob.size, width: r.width, height: r.height, fps: r.fps, frames: r.frames, audio: r.audio, seconds: r.seconds };
      }, function (e) {
        busy = false;
        progress(0, 'Export failed: ' + (e && e.message || e));
        $('[data-go]').disabled = false; $('[data-go]').style.opacity = '1';
        window.__lastLocalExport = { error: String(e && e.message || e) };
      });
    };
  }

  // Take over the header Export button (capture phase, before CapCut's handlers).
  function isHeaderExport(t) {
    var b = t && t.closest && t.closest('button');
    if (!b || !/^\s*Export\s*$/.test(b.textContent || '')) return false;
    var r = b.getBoundingClientRect();
    return r.top < 120 && r.width > 0;
  }
  ['pointerdown', 'mousedown', 'click'].forEach(function (type) {
    window.addEventListener(type, function (e) {
      if (!isHeaderExport(e.target)) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (type === 'click' && !document.querySelector('[data-plop-export]')) openDialog();
    }, true);
  });
  window.__plopOpenExport = openDialog;
  window.__plopMixTest = async function () {
    var rm = window.__renderManger, view = rm._dataSDK.draftView, t0 = performance.now();
    var r = await mixAudio(rm, view, Number(view.getDuration()) / 1e6, 48000);
    return { clips: r.clips, seconds: (performance.now() - t0) / 1000, length: r.buffer.length };
  };
  window.__plopMixDebug = function () {
    var rm = window.__renderManger, view = rm._dataSDK.draftView;
    return view.getAllSegments().map(function (s) {
      var src = null; try { src = rm.getAudioPathAndSourceTimeRange(s); } catch (e) { src = { err: String(e) }; }
      var p = src && src.path;
      return { type: String(s.material && s.material.type), materialPath: s.material && s.material.path, materialKeys: s.material ? Object.keys(s.material).slice(0, 30) : [],
        audioPath: p, record: p && rm.resourceRecords.pathRecords.get(p), recordOfMaterial: s.material && rm.resourceRecords.pathRecords.get(s.material.path), stream: (function (r) { try { var v = rm.resourceRecords.streamRecords.get(r); return v && JSON.parse(JSON.stringify(v, function (k, x) { return typeof x === 'bigint' ? String(x) : x; })); } catch (e) { return 'ERR ' + e; } })(p && rm.resourceRecords.pathRecords.get(p)), volume: s.volume };
    });
  };

  // ---------- render ----------
  async function exportLocal(opts) {
    var t0 = performance.now();
    var rm = window.__renderManger, view = rm._dataSDK.draftView, preview = rm._renderSdk.preview;
    var FS = (rm._renderSdk._module && rm._renderSdk._module.FS) || window.Module.FS;
    var durUs = Number(view.getDuration());
    var cv = view.getCanvasConfig();
    // The engine's frame grabber stalls on widths that aren't 16-aligned (e.g. 854x480).
    var height = Math.min(opts.height, cv.height), width = Math.round((cv.width * height) / cv.height / 16) * 16;
    height = Math.round(height / 2) * 2;
    var fps = opts.fps, total = Math.floor((durUs / 1e6) * fps);
    var mod = await import('/lib/mp4-muxer.mjs');
    var sampleRate = 48000;
    var aacOk = (await AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2', sampleRate: sampleRate, numberOfChannels: 2, bitrate: 160000 }).catch(function () { return {}; })).supported;

    opts.onProgress(0, 'Mixing audio…');
    var mix = await mixAudio(rm, view, durUs / 1e6, sampleRate).catch(function (e) { console.warn('audio mix failed', e); return null; });
    var withAudio = !!(mix && mix.clips && aacOk);

    var muxer = new mod.Muxer({
      target: new mod.ArrayBufferTarget(),
      video: { codec: 'avc', width: width, height: height, frameRate: fps },
      audio: withAudio ? { codec: 'aac', numberOfChannels: 2, sampleRate: sampleRate } : undefined,
      fastStart: 'in-memory', firstTimestampBehavior: 'offset',
    });
    var encErr = null;
    var venc = new VideoEncoder({ output: function (c, m) { muxer.addVideoChunk(c, m); }, error: function (e) { encErr = e; } });
    var level = width * height > 2073600 ? '640033' : width * height > 921600 ? '640028' : '64001f';
    venc.configure({ codec: 'avc1.' + level, width: width, height: height, bitrate: Math.round(width * height * fps * 0.12), framerate: fps, avc: { format: 'avc' } });

    var BATCH = 15, done = 0;
    for (var start = 0; start < total; start += BATCH) {
      var idx = []; for (var i = start; i < Math.min(total, start + BATCH); i++) idx.push(i);
      var frames = await grabFrames(preview, FS, idx, fps, width, height);
      for (var k = 0; k < idx.length; k++) {
        var f = frames.get(idx[k]);
        var vf = new VideoFrame(f.bytes, { format: 'RGBA', codedWidth: f.w, codedHeight: f.h, timestamp: Math.round((idx[k] * 1e6) / fps), duration: Math.round(1e6 / fps) });
        while (venc.encodeQueueSize > 30) await new Promise(function (r) { setTimeout(r, 5); });
        venc.encode(vf, { keyFrame: idx[k] % (fps * 2) === 0 });
        vf.close();
        done++;
      }
      if (encErr) throw encErr;
      opts.onProgress(done / total * (withAudio ? 0.95 : 1), 'Rendering frames ' + done + ' / ' + total);
    }
    await venc.flush(); venc.close();

    if (withAudio) {
      opts.onProgress(0.97, 'Encoding audio…');
      var aenc = new AudioEncoder({ output: function (c, m) { muxer.addAudioChunk(c, m); }, error: function (e) { encErr = e; } });
      aenc.configure({ codec: 'mp4a.40.2', sampleRate: sampleRate, numberOfChannels: 2, bitrate: 160000 });
      var buf = mix.buffer, CH = 8192;
      for (var off = 0; off < buf.length; off += CH) {
        var n = Math.min(CH, buf.length - off), planar = new Float32Array(n * 2);
        planar.set(buf.getChannelData(0).subarray(off, off + n), 0);
        planar.set(buf.getChannelData(1).subarray(off, off + n), n);
        var ad = new AudioData({ format: 'f32-planar', sampleRate: sampleRate, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((off / sampleRate) * 1e6), data: planar });
        aenc.encode(ad); ad.close();
      }
      await aenc.flush(); aenc.close();
      if (encErr) throw encErr;
    }
    muxer.finalize();
    opts.onProgress(1, 'Done');
    return { blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), width: width, height: height, fps: fps, frames: done, audio: withAudio, seconds: (performance.now() - t0) / 1000 };
  }

  function grabFrames(preview, FS, idx, fps, w, h) {
    return new Promise(function (resolve, reject) {
      var got = new Map(), first = idx[0], last = idx[idx.length - 1];
      var timer = setTimeout(function () { sub && sub.dispose && sub.dispose(); reject(new Error('frame render timed out at frame ' + first)); }, 60000);
      // CapCut's render manager reads each rendered frame from its (OPFS-backed) FS, deletes
      // the file and re-emits it with imageData via onGetFrames — subscribe there.
      var sub = window.__renderManger.onGetFrames(function (f) {
        if (typeof f.callbackData !== 'number' || f.callbackData < first || f.callbackData > last || got.has(f.callbackData) || !f.imageData) return;
        got.set(f.callbackData, { bytes: f.imageData, w: f.width, h: f.height });
        if (got.size === idx.length) { clearTimeout(timer); sub && sub.dispose && sub.dispose(); resolve(got); }
      });
      preview.getVideoFrames(idx.map(function (i) { return { time: BigInt(Math.round((i * 1e6) / fps)), callbackData: i }; }), w, h);
    });
  }

  async function mixAudio(rm, view, durationSec, sampleRate) {
    var ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(durationSec * sampleRate)), sampleRate);
    var clips = 0, cache = new Map();
    var segs = view.getAllSegments().filter(function (s) { return s.material && /video|audio|music|sound|record|extract/i.test(String(s.material.type)) && s.visible !== false; });
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i], vol = typeof s.volume === 'number' ? s.volume : 1;
      if (vol <= 0) continue;
      var src;
      try { src = rm.getAudioPathAndSourceTimeRange(s); } catch (e) { src = { path: s.material.path, sourceTimeRange: s.sourceTimerange }; }
      var url = (rm.resourceRecords && rm.resourceRecords.pathRecords && rm.resourceRecords.pathRecords.get(src.path)) || src.path;
      // Library audio (music/sfx) is registered as a streamed asset: asset_id://… -> {url}
      if (/^asset_id:\/\//.test(url)) {
        var rec = rm.resourceRecords.streamRecords && rm.resourceRecords.streamRecords.get(url);
        url = rec && rec.url;
      }
      if (!url || !/^(blob:|https?:|\/)/.test(url)) continue;
      var audio = cache.get(url);
      if (audio === undefined) {
        try {
          var ab = await (await fetch(url)).arrayBuffer();
          audio = await ctx.decodeAudioData(ab);
        } catch (e) { audio = null; }
        cache.set(url, audio);
      }
      if (!audio) continue;
      var speed = (s.speed && s.speed.speed) || 1;
      var node = ctx.createBufferSource(); node.buffer = audio; node.playbackRate.value = speed;
      var gain = ctx.createGain(); gain.gain.value = vol;
      node.connect(gain).connect(ctx.destination);
      var when = Number(s.targetTimerange.start) / 1e6;
      var offset = Number((src.sourceTimeRange || s.sourceTimerange).start) / 1e6;
      var len = Number(s.targetTimerange.duration) / 1e6;
      node.start(when, offset, len * speed);
      clips++;
    }
    return { buffer: await ctx.startRendering(), clips: clips };
  }
})();
