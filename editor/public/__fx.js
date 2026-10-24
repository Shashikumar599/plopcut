// Plopcut FX: transitions for the CapCut study copy, built from the editor engine's own primitives.
// CapCut's Transitions panel lists server-hosted effect packages (empty offline). These cards render
// into that panel and apply a recipe at the playhead through the draft API (one undo step):
//   split -> speed (slow-mo) -> keyframes (scale zoom, brightness flash)
// The brightness flash needs a colour-adjust layer on the clip (set any Basic > Color adjustment value).
// Disable with ?fx=0.
(function () {
  if (new URLSearchParams(location.search).get('fx') === '0') return;
  var US = 1e6;
  var FX = [
    { id: 'flash-ramp', name: 'Flash ramp', sub: 'flash · slow-mo · zoom', flash: true, slow: 0.35, zoom: 1.3, span: 0.8 },
    { id: 'speed-ramp', name: 'Speed ramp', sub: 'slow-mo · zoom', flash: false, slow: 0.35, zoom: 1.25, span: 0.8 },
    { id: 'flash-cut', name: 'Flash cut', sub: 'white flash on a cut', flash: true, slow: 1, zoom: 1, span: 0 },
    { id: 'zoom-punch', name: 'Zoom punch', sub: 'snap zoom in', flash: false, slow: 1, zoom: 1.35, span: 0.5 },
  ];

  // ---------- engine recipe ----------
  function sdk() { return window.__renderManger && window.__renderManger._dataSDK; }
  function playheadUs() {
    // Player timecode "current\ntotal", each mm:ss:ff at 30 fps (e.g. 00:01:05 = 1 s + 5 frames).
    var m = (document.body.innerText.match(/(\d\d):(\d\d):(\d\d)\s*\n\s*\d\d:\d\d:\d\d/) || []);
    return m.length ? Math.round(((+m[1]) * 60 + (+m[2]) + (+m[3]) / 30) * US) : 0;
  }
  function videosOnMainTrack() {
    var v = sdk().draftView;
    return v.getAllSegments().filter(function (s) { return String(s.material && s.material.type) === 'video'; })
      .sort(function (a, b) { return Number(a.targetTimerange.start) - Number(b.targetTimerange.start); });
  }
  function segAt(t) {
    return videosOnMainTrack().find(function (s) { var a = Number(s.targetTimerange.start); return t > a && t < a + Number(s.targetTimerange.duration); });
  }
  function ok(r) { if (r && r.ok === false) throw new Error(r.msg || 'engine refused'); return r; }

  function apply(fx, atUs) {
    var ds = sdk(); if (!ds) throw new Error('editor not ready');
    var api = ds.api, t = atUs != null ? atUs : playheadUs();
    var seg = segAt(t);
    if (!seg) {
      var cut = videosOnMainTrack().find(function (s) { return Math.abs(Number(s.targetTimerange.start) - t) < 40000; });
      if (cut) return { at: t / US, segment: cut.id, duration: Number(cut.targetTimerange.duration) / US, already: true };
      throw new Error('move the playhead over a video clip');
    }
    var b = ds.api.batch.batchStart();
    try {
      ok(api.segment.split([{ segmentId: seg.id, splitTime: BigInt(t) }]));
      var mid = segAt(t + 1);
      if (fx.span) {
        var end = t + Math.round(fx.span * US);
        if (end < Number(mid.targetTimerange.start) + Number(mid.targetTimerange.duration)) {
          ok(api.segment.split([{ segmentId: mid.id, splitTime: BigInt(end) }]));
          mid = segAt(t + 1);
        }
      }
      if (fx.slow !== 1) { ok(api.video.setSpeed({ segId: mid.id, value: fx.slow })); mid = segAt(t + 1); }
      var s0 = mid.targetTimerange.start, d = mid.targetTimerange.duration;
      var kf = function (type, at, val) { ok(api.keyframe.add({ segmentId: mid.id, keyframeType: type, dataParam: { playHead: at, datas: [val] } })); };
      if (fx.zoom !== 1) {
        var zEnd = fx.slow === 1 ? s0 + BigInt(Math.round(0.18 * US)) : s0 + d - 1000n;
        ['KFTypeScaleX', 'KFTypeScaleY'].forEach(function (k) { kf(k, s0, 1); kf(k, zEnd, fx.zoom); });
      }
      if (fx.flash) { // flash up, then settle back to the clip's own brightness
        var base = 0;
        try { base = Number((ds.draftView.getMultiplePropertyValues(mid.id, ['KFTypeBrightness'], s0)[0] || [0])[0]) || 0; } catch (e) { /* default 0 */ }
        kf('KFTypeBrightness', s0, 1); kf('KFTypeBrightness', s0 + BigInt(Math.round(0.3 * US)), base);
      }
    } finally { ds.api.batch.batchEnd(b, { canUndoRedo: true }); }
    return { at: t / US, segment: mid.id, duration: Number(mid.targetTimerange.duration) / US };
  }
  window.__plopFx = { list: FX, apply: function (id, atSec) { return apply(FX.find(function (f) { return f.id === id; }), atSec == null ? null : Math.round(atSec * US)); } };

  // ---------- panel UI (inside CapCut's Transitions panel) ----------
  var css = document.createElement('style');
  css.textContent =
    '#plopfx{position:fixed;z-index:1000;background:#101012;color:#e8e8ea;font:13px/1.4 -apple-system,system-ui,sans-serif;padding:14px 14px 0;box-sizing:border-box;overflow:auto}' +
    '#plopfx h4{margin:2px 2px 4px;font-size:14px;font-weight:600}#plopfx .s{color:#8a8a90;font-size:11.5px;margin:0 2px 12px}' +
    '#plopfx .g{display:grid;grid-template-columns:1fr 1fr;gap:10px}' +
    '#plopfx .c{cursor:pointer;border-radius:10px;overflow:hidden;background:#1c1c20;border:1px solid #26262b;transition:border-color .15s,transform .15s}' +
    '#plopfx .c:hover{border-color:#00c1cd;transform:translateY(-1px)}#plopfx .c.done{border-color:#00c1cd}' +
    '#plopfx .p{height:78px;position:relative;overflow:hidden;background:linear-gradient(135deg,#3a6ea5,#c9d6df 55%,#7a8b5a)}' +
    '#plopfx .p i{position:absolute;inset:0;background:#fff;opacity:0}#plopfx .c:hover .p.flash i{animation:pfFlash 1.1s infinite}' +
    '#plopfx .p b{position:absolute;left:38%;top:30%;width:26%;height:40%;border-radius:40% 40% 30% 30%;background:#2d241e}' +
    '#plopfx .c:hover .p.zoom{animation:pfZoom 1.1s infinite}#plopfx .c:hover .p.slow b{animation:pfJump 1.6s infinite}' +
    '#plopfx .n{padding:7px 9px 8px}#plopfx .n div{font-weight:600}#plopfx .n span{color:#8a8a90;font-size:11px}' +
    '#plopfx .t{margin:12px 2px;color:#8a8a90;font-size:11.5px;min-height:32px}' +
    '@keyframes pfFlash{0%,100%{opacity:0}12%{opacity:.95}40%{opacity:0}}@keyframes pfZoom{0%,100%{transform:scale(1)}50%{transform:scale(1.3)}}' +
    '@keyframes pfJump{0%,100%{transform:translateY(0)}40%{transform:translateY(-22px)}70%{transform:translateY(-24px)}}';
  document.head.appendChild(css);

  var box = null, open = false;
  function render() {
    box = document.createElement('div'); box.id = 'plopfx';
    box.innerHTML = '<h4>Plopcut FX</h4><div class="s">Engine-native transitions · applied at the playhead · rendered locally</div><div class="g">' +
      FX.map(function (f) {
        var cls = (f.flash ? ' flash' : '') + (f.zoom !== 1 ? ' zoom' : '') + (f.slow !== 1 ? ' slow' : '');
        return '<div class="c" data-fx="' + f.id + '"><div class="p' + cls + '"><b></b><i></i></div><div class="n"><div>' + f.name + '</div><span>' + f.sub + '</span></div></div>';
      }).join('') + '</div><div class="t" data-msg>Move the playhead to the moment, then pick a transition.</div>';
    box.addEventListener('click', function (e) {
      var c = e.target.closest('[data-fx]'); if (!c) return;
      if (Date.now() - (box.lastApply || 0) < 1000) return; // one apply per click burst
      box.lastApply = Date.now();
      var msg = box.querySelector('[data-msg]');
      try {
        var r = window.__plopFx.apply(c.getAttribute('data-fx'));
        c.classList.add('done'); setTimeout(function () { c.classList.remove('done'); }, 1500);
        msg.textContent = '✓ ' + c.querySelector('.n div').textContent + ' at ' + r.at.toFixed(2) + 's';
      } catch (err) { msg.textContent = '⚠ ' + err.message; }
    });
    document.body.appendChild(box);
  }
  function place() {
    var host = document.querySelector('.workbench-sider-menu-panel-container');
    var r = host && host.getBoundingClientRect();
    var visible = open && r && r.width > 200;
    if (!visible) { if (box) box.style.display = 'none'; return; }
    // CapCut's first-run tip ("Drag and drop a transition…") sits where our cards go: dismiss it first
    // so a click meant for the tip can never land on a card.
    var tip = [].find.call(host.querySelectorAll('button'), function (b) { return /^OK$/.test(b.innerText.trim()) && b.getBoundingClientRect().width > 0; });
    if (tip) { tip.click(); if (box) box.style.display = 'none'; return; }
    if (!box) render();
    box.style.display = 'block';
    box.style.left = r.left + 'px'; box.style.top = r.top + 'px'; box.style.width = r.width + 'px'; box.style.height = r.height + 'px';
  }
  // Track which sidebar entry is open (CapCut toggles the panel when the active entry is clicked again).
  document.addEventListener('click', function (e) {
    var item = e.target.closest && e.target.closest('.menu-inner-box, [class*=workbench-menu-item]');
    if (!item) return;
    var isTr = /^Transitio/.test((item.innerText || '').trim());
    open = isTr ? !open || !box || box.style.display === 'none' : false;
  }, true);
  setInterval(place, 250);
})();
