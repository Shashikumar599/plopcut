// Builds public/editor/index.html from CapCut's archived editor HTML:
//  - installs the network-sandbox service worker before anything else runs
//  - removes telemetry, fingerprinting, security-SDK and captcha scripts
// Re-run after changing the rules: node tools/make-editor.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let html = fs.readFileSync(path.join(ROOT, 'vendor', 'editor.archived.html'), 'utf8');

const DROP = [
  'tiktok_privacy_protection_framework', // consent/privacy loader (also installs its own SW)
  'secsdk_runtime_bundler',             // request-signing security SDK
  'uifid-fingerprint-init',             // device fingerprinting
  'initSlardar',                        // monitoring
  'reportBlank',                        // monitoring
  'webmssdk',                           // security SDK
  'captcha',                            // captcha
];
let dropped = 0;
html = html.replace(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>\s*<\/script>/g, (tag, src) => {
  if (DROP.some((d) => src.includes(d))) { dropped++; return `<!-- dropped: ${src.split('/').pop()} -->`; }
  return tag;
});

// Serve CapCut's own CDN root from our same-origin mirror (what their loader does with /static-resource).
html = html.replace(/(https:)?\/\/sf16-web-login-neutral\.capcutstatic\.com\/obj\/capcut-web-login-static\//g, '/static-resource/');

const BOOT = `<script>
(function(){
  // Network sandbox: all cross-origin traffic goes through /__sw.js -> local mirror/mocks.
  if (!navigator.serviceWorker.controller) {
    navigator.serviceWorker.register('/__sw.js', { scope: '/' })
      .then(function(){ return navigator.serviceWorker.ready; })
      .then(function(){ location.reload(); });
    window.stop();
  }
  // No-op stand-ins for the telemetry/security SDKs we removed. Calls are swallowed.
  var noop = function () { return noopProxy; };
  var noopProxy = new Proxy(noop, {
    get: function (t, k) { return k === 'then' ? undefined : k === Symbol.toPrimitive ? function () { return ''; } : noopProxy; },
    apply: function () { return noopProxy; },
    set: function () { return true; },
    defineProperty: function () { return true; }
  });
  window.ccWebSlardar = noopProxy;
  window.Slardar = noopProxy;
})();
</script>`;
html = html.replace(/<head([^>]*)>/i, (m) => `${m}\n${BOOT}\n<script src="/__ingest.js"></script>\n<script src="/__demo.js"></script>\n<script src="/__export.js"></script>\n<script src="/__fx.js"></script>\n<script src="/__brand.js"></script>`);

html = html.replace(/<title>[^<]*<\/title>/i, '<title>plopcut</title>');
fs.mkdirSync(path.join(ROOT, 'public', 'editor'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'public', 'editor', 'index.html'), html);
console.log(`wrote public/editor/index.html (${html.length} bytes), dropped ${dropped} scripts`);
