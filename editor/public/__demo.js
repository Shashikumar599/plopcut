// Demo polish for the local CapCut study copy (cosmetic only):
//  - closes the sign-in modal (guest mode is allowed by CapCut itself)
//  - steps through onboarding tooltips
//  - hides the "Projects will not be saved… sign in" banner
// Disable with ?demo=0
(function () {
  if (new URLSearchParams(location.search).get('demo') === '0') return;

  var css = document.createElement('style');
  css.textContent = '[data-plop-hidden]{display:none!important}';
  document.documentElement.appendChild(css);

  var GUIDE_BUTTONS = /^(Next|OK|Got it|Done|Skip)$/;
  function tidy() {
    // sign-in modal close (×)
    var close = document.querySelector('svg.lv_sign_in_panel_wide-close');
    if (close) close.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    // onboarding tooltips: they render a small yellow card with Next/OK buttons
    document.querySelectorAll('button').forEach(function (b) {
      if (GUIDE_BUTTONS.test((b.textContent || '').trim()) && b.offsetParent && b.closest('[class*="guide"],[class*="Guide"],[class*="tour"],[class*="onboard"],[class*="popover"],[class*="Popover"]')) b.click();
    });
    // guest banner
    document.querySelectorAll('body *').forEach(function (el) {
      if (el.childElementCount < 6 && !el.hasAttribute('data-plop-hidden') && /^Projects will not be saved permanently/.test((el.textContent || '').trim())) {
        var bar = el;
        while (bar.parentElement && bar.parentElement !== document.body && bar.parentElement.getBoundingClientRect().height < 80) bar = bar.parentElement;
        // Prefer CapCut's own dismiss (×) so its layout reflows; hide only as a fallback.
        var r = bar.getBoundingClientRect();
        var x = Array.prototype.slice.call(bar.querySelectorAll('svg, [class*="close"], [role="button"]')).filter(function (n) {
          var b = n.getBoundingClientRect(); return b.width > 0 && b.width < 40 && b.left > r.right - 80;
        })[0];
        if (x) { (x.closest('[role="button"],button,span,div') || x).dispatchEvent(new MouseEvent('click', { bubbles: true })); el.setAttribute('data-plop-tried', ''); }
        if (!x || el.hasAttribute('data-plop-tried-twice')) { bar.setAttribute('data-plop-hidden', ''); window.dispatchEvent(new Event('resize')); }
        if (el.hasAttribute('data-plop-tried')) el.setAttribute('data-plop-tried-twice', '');
      }
    });
  }
  var pending = false;
  new MutationObserver(function () {
    if (pending) return;
    pending = true;
    setTimeout(function () { pending = false; tidy(); }, 250);
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
