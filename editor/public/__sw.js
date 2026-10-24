// Network sandbox for the local CapCut editor study copy.
// Every cross-origin request is rerouted to our local server at /__x/<host>/<path>,
// which serves static CDN files from the local mirror and answers API calls with mocks.
// Nothing is sent to CapCut's API hosts.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin) return; // same-origin: normal handling
  if (!/^https?:$/.test(url.protocol)) return;
  event.respondWith(reroute(event.request, url));
});

async function reroute(req, url) {
  const target = `/__x/${url.host}${url.pathname}${url.search}`;
  const init = { method: req.method, headers: { 'x-orig-url': url.href, 'content-type': req.headers.get('content-type') || '' } };
  if (!['GET', 'HEAD'].includes(req.method)) init.body = await req.arrayBuffer();
  try {
    const res = await fetch(target, init);
    // Re-wrap so the response is usable for both cors and no-cors requests under COEP.
    const headers = new Headers(res.headers);
    headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
    headers.set('Access-Control-Allow-Origin', self.location.origin);
    headers.set('Access-Control-Allow-Credentials', 'true');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  } catch (e) {
    return new Response('sandbox error ' + e, { status: 502 });
  }
}
