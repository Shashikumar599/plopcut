// plopcut branding for the local editor: tab title, favicon and the sidebar logo.
// The editor UI itself is unchanged. Disable with ?brand=0.
(function () {
  if (new URLSearchParams(location.search).get('brand') === '0') return;
  var TITLE = 'plopcut';
  var MARK = '<svg viewBox="0 0 32 32" width="28" height="28" xmlns="http://www.w3.org/2000/svg"><rect width="32" height="32" rx="9" fill="#00c1cd"/>' +
    '<circle cx="16.5" cy="13.5" r="6.2" fill="none" stroke="#fff" stroke-width="3.4"/><rect x="10.3" y="13.5" width="3.4" height="11.5" rx="1.7" fill="#fff"/></svg>';

  function apply() {
    if (document.title !== TITLE) document.title = TITLE;
    var icon = document.querySelector('link[rel~="icon"]');
    var href = 'data:image/svg+xml,' + encodeURIComponent(MARK);
    if (!icon) { icon = document.createElement('link'); icon.rel = 'icon'; document.head.appendChild(icon); }
    if (icon.href !== href) icon.href = href;
    var logo = document.querySelector('.menu-list-head .logo');
    if (logo && !logo.dataset.plop) {
      logo.dataset.plop = '1';
      logo.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;gap:3px">' + MARK +
        '<span style="font:600 10px/1 -apple-system,system-ui,sans-serif;color:#e8e8ea;letter-spacing:.2px">plopcut</span></div>';
    }
  }
  document.addEventListener('DOMContentLoaded', apply);
  setInterval(apply, 500);
})();
