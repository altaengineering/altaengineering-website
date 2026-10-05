/* Interaktionen der Seite software.html: Tabs, Rechner, Hochzaehlen, Dauer-Schaltflaeche. */
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ----- Tabs (ARIA, Pfeiltasten, Autoplay mit Pause) -----
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.sw-tab'));
  var tabsBar = document.querySelector('.sw-tabs');
  var auto = null;
  var userTouched = false;

  function select(i, focus) {
    tabs.forEach(function (t, j) {
      var on = i === j;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      var p = document.getElementById(t.getAttribute('aria-controls'));
      if (p) {
        p.classList.toggle('on', on);
        if (on) p.removeAttribute('hidden'); else p.setAttribute('hidden', '');
      }
    });
    if (focus) tabs[i].focus();
  }
  function current() {
    for (var i = 0; i < tabs.length; i++) if (tabs[i].getAttribute('aria-selected') === 'true') return i;
    return 0;
  }
  function stopAuto() { if (auto) { clearInterval(auto); auto = null; } }

  if (tabs.length) {
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { userTouched = true; stopAuto(); select(i, false); });
      t.addEventListener('keydown', function (e) {
        var k = e.key, n = tabs.length, c = current(), to = -1;
        if (k === 'ArrowRight') to = (c + 1) % n;
        else if (k === 'ArrowLeft') to = (c - 1 + n) % n;
        else if (k === 'Home') to = 0;
        else if (k === 'End') to = n - 1;
        if (to >= 0) { e.preventDefault(); userTouched = true; stopAuto(); select(to, true); }
      });
    });
    var tour = document.getElementById('tour');
    if (tour && !reduce && 'IntersectionObserver' in window) {
      var visible = false;
      var start = function () {
        if (auto || userTouched || !visible) return;
        auto = setInterval(function () { select((current() + 1) % tabs.length, false); }, 6500);
      };
      new IntersectionObserver(function (es) {
        visible = es[0].isIntersecting;
        if (visible) start(); else stopAuto();
      }, { threshold: 0.35 }).observe(tour);
      tour.addEventListener('mouseenter', stopAuto);
      tour.addEventListener('focusin', stopAuto);
    }
  }

  // ----- Zahlen animieren -----
  function animate(el, to, fmt, dur) {
    if (reduce) { el.textContent = fmt(to); return; }
    var from = parseFloat(el.getAttribute('data-v')) || 0;
    var t0 = null;
    function step(t) {
      if (t0 === null) t0 = t;
      var p = Math.min(1, (t - t0) / dur);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(step); else el.setAttribute('data-v', String(to));
    }
    requestAnimationFrame(step);
  }

  // ----- Kennzahl hochzaehlen -----
  var counters = document.querySelectorAll('[data-count]');
  if (counters.length && 'IntersectionObserver' in window && !reduce) {
    var cio = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        cio.unobserve(e.target);
        animate(e.target, Number(e.target.getAttribute('data-count')), function (v) { return String(Math.round(v)); }, 1200);
      });
    }, { threshold: 0.6 });
    counters.forEach(function (c) { c.textContent = '0'; cio.observe(c); });
  }

  // ----- Rechner -----
  var cP = document.getElementById('cP');
  if (cP) {
    var cM = document.getElementById('cM'), cS = document.getElementById('cS');
    var oP = document.getElementById('oP'), oM = document.getElementById('oM'), oS = document.getElementById('oS');
    var rJahr = document.getElementById('rJahr'), rStd = document.getElementById('rStd'), rSpar = document.getElementById('rSpar');
    var TAGE = 220;
    var chf = function (v) {
      var n = String(Math.round(v)), out = '';
      for (var i = 0; i < n.length; i++) {
        if (i > 0 && (n.length - i) % 3 === 0) out += '’';
        out += n.charAt(i);
      }
      return 'CHF ' + out;
    };
    var plain = function (v) {
      var n = String(Math.round(v)), out = '';
      for (var i = 0; i < n.length; i++) {
        if (i > 0 && (n.length - i) % 3 === 0) out += '’';
        out += n.charAt(i);
      }
      return out;
    };
    var first = true;
    var rechne = function () {
      var p = Number(cP.value), m = Number(cM.value), s = Number(cS.value);
      oP.textContent = p; oM.textContent = m; oS.textContent = s;
      var std = p * m / 60 * TAGE;
      var jahr = std * s;
      if (first) {
        first = false;
        rJahr.textContent = chf(jahr); rStd.textContent = plain(std); rSpar.textContent = chf(jahr / 2);
        rJahr.setAttribute('data-v', String(jahr)); rStd.setAttribute('data-v', String(std)); rSpar.setAttribute('data-v', String(jahr / 2));
        return;
      }
      animate(rJahr, jahr, chf, 350);
      animate(rStd, std, plain, 350);
      animate(rSpar, jahr / 2, chf, 350);
    };
    [cP, cM, cS].forEach(function (el) { el.addEventListener('input', rechne); });
    rechne();
  }

  // ----- Dauer-Schaltflaeche (nur Mobil, CSS blendet sie sonst aus) -----
  var sticky = document.getElementById('swSticky');
  if (sticky && 'IntersectionObserver' in window) {
    var hero = document.querySelector('.phero');
    var fin = document.getElementById('kontakt-final');
    var heroOut = false, finIn = false;
    var upd = function () { sticky.classList.toggle('show', heroOut && !finIn); };
    if (hero) new IntersectionObserver(function (es) { heroOut = !es[0].isIntersecting; upd(); }).observe(hero);
    if (fin) new IntersectionObserver(function (es) { finIn = es[0].isIntersecting; upd(); }).observe(fin);
  }
})();
