// Local ingest hook for the CapCut editor study copy.
// CapCut's web engine cannot decode HEVC/ProRes/etc. locally; their uploader sends those
// files to a cloud transcoder we don't have. We intercept file picks and drops before the
// app sees them, convert non-H.264 video via the local server (/__ingest, ffmpeg), and hand
// the converted file to CapCut's own handlers.
(function () {
  var VIDEO_EXT = /\.(mov|mp4|m4v|mkv|avi|webm|mts|m2ts|ts|3gp|wmv|flv|mxf|hevc|qt|mpg|mpeg)$/i;
  var isVideo = function (f) { return (f.type || '').indexOf('video/') === 0 || VIDEO_EXT.test(f.name); };

  var toast = (function () {
    var el;
    return function (msg) {
      if (!el) {
        el = document.createElement('div');
        el.style.cssText = 'position:fixed;left:50%;top:64px;transform:translateX(-50%);z-index:2147483647;background:#111;color:#fff;font:13px/1.4 system-ui,sans-serif;padding:10px 16px;border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.35);pointer-events:none;transition:opacity .3s';
        document.documentElement.appendChild(el);
      }
      el.textContent = msg || '';
      el.style.opacity = msg ? '1' : '0';
    };
  })();

  function normalize(file) {
    if (!isVideo(file)) return Promise.resolve(file);
    return fetch('/__ingest?name=' + encodeURIComponent(file.name), { method: 'POST', body: file }).then(function (r) {
      if (r.status === 204) return file;
      if (!r.ok) return r.text().then(function (t) { throw new Error(t || ('ingest failed ' + r.status)); });
      var name = decodeURIComponent(r.headers.get('x-new-name') || file.name.replace(/\.[^.]+$/, '') + '.mp4');
      return r.blob().then(function (b) { return new File([b], name, { type: 'video/mp4', lastModified: Date.now() }); });
    });
  }

  function normalizeAll(files) {
    var vids = files.filter(isVideo);
    if (!vids.length) return null;
    toast('Preparing ' + vids.length + ' video' + (vids.length > 1 ? 's' : '') + ' locally (converting HEVC/other codecs to H.264 if needed)…');
    return Promise.all(files.map(normalize)).then(function (out) {
      toast('');
      var dt = new DataTransfer();
      out.forEach(function (f) { dt.items.add(f); });
      return dt;
    }, function (e) {
      toast('Could not convert video: ' + e.message);
      setTimeout(function () { toast(''); }, 6000);
      throw e;
    });
  }

  // File pickers: run before React's root listener, then re-fire with converted files.
  window.addEventListener('change', function (e) {
    var inp = e.target;
    if (!(inp instanceof HTMLInputElement) || inp.type !== 'file' || inp.__plopNormalized || !inp.files || !inp.files.length) return;
    var p = normalizeAll(Array.prototype.slice.call(inp.files));
    if (!p) return;
    e.stopImmediatePropagation();
    p.then(function (dt) {
      inp.files = dt.files;
      inp.__plopNormalized = true;
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      inp.__plopNormalized = false;
    });
  }, true);

  // Drag and drop onto the media panel / timeline / canvas.
  window.addEventListener('drop', function (e) {
    if (e.__plopNormalized || !e.dataTransfer || !e.dataTransfer.files.length) return;
    var p = normalizeAll(Array.prototype.slice.call(e.dataTransfer.files));
    if (!p) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    var target = e.target, init = { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY, screenX: e.screenX, screenY: e.screenY };
    p.then(function (dt) {
      init.dataTransfer = dt;
      ['dragenter', 'dragover', 'drop'].forEach(function (type) {
        var ev = new DragEvent(type, init);
        ev.__plopNormalized = true;
        target.dispatchEvent(ev);
      });
    });
  }, true);
})();
