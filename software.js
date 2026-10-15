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

  // ----- Fachbereiche: Menue mit Filter, Tastatur und Direktlinks (#fb-<bereich>) -----
  var fbTabs = Array.prototype.slice.call(document.querySelectorAll('.fb-tab'));
  if (fbTabs.length) {
    var goalBtns = Array.prototype.slice.call(document.querySelectorAll('.fb-goal'));
    var panelOf = function (t) { return document.getElementById(t.getAttribute('aria-controls')); };
    var visibleTabs = function () { return fbTabs.filter(function (t) { return !t.hidden; }); };
    var currentTab = function () { return fbTabs.filter(function (t) { return t.getAttribute('aria-selected') === 'true'; })[0]; };

    var fbSelect = function (tab, o) {
      o = o || {};
      fbTabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        var p = panelOf(t);
        if (p) p.classList.toggle('on', on);
      });
      if (o.focus) tab.focus();
      if (o.center && window.innerWidth <= 900) {
        var list = tab.parentNode;
        list.scrollTo({ left: tab.offsetLeft - (list.clientWidth - tab.offsetWidth) / 2, behavior: reduce ? 'auto' : 'smooth' });
      }
      if (o.hash !== false) { try { history.replaceState(null, '', '#' + panelOf(tab).id); } catch (e) { /* egal */ } }
      if (o.reveal) {
        var sec = document.getElementById('fachbereiche');
        if (sec) sec.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      }
    };

    var setGoal = function (g) {
      goalBtns.forEach(function (b) {
        var on = b.getAttribute('data-goal') === g;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      fbTabs.forEach(function (t) {
        var goals = (t.getAttribute('data-goals') || '').split(' ');
        t.hidden = !(g === 'alle' || goals.indexOf(g) >= 0);
      });
      var cur = currentTab();
      if (!cur || cur.hidden) {
        var v = visibleTabs();
        if (v.length) fbSelect(v[0], { hash: false });
      }
    };

    fbTabs.forEach(function (t) {
      t.addEventListener('click', function () { fbSelect(t, { center: true }); });
      t.addEventListener('keydown', function (e) {
        var v = visibleTabs(), i = v.indexOf(t), n = null;
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') n = v[(i + 1) % v.length];
        else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') n = v[(i - 1 + v.length) % v.length];
        else if (e.key === 'Home') n = v[0];
        else if (e.key === 'End') n = v[v.length - 1];
        if (n) { e.preventDefault(); fbSelect(n, { focus: true, center: true }); }
      });
    });
    goalBtns.forEach(function (b) { b.addEventListener('click', function () { setGoal(b.getAttribute('data-goal')); }); });
    Array.prototype.forEach.call(document.querySelectorAll('.fb-next'), function (b) {
      b.addEventListener('click', function () {
        var t = document.getElementById('fbt-' + b.getAttribute('data-next'));
        if (!t) return;
        if (t.hidden) setGoal('alle');
        fbSelect(t, { center: true, reveal: true });
      });
    });

    var fbFromHash = function () {
      var h = (location.hash || '').replace('#', '');
      if (h.indexOf('fb-') !== 0) return;
      var t = document.getElementById('fbt-' + h.slice(3));
      if (!t) return;
      if (t.hidden) setGoal('alle');
      fbSelect(t, { hash: false, center: true, reveal: true });
    };
    fbFromHash();
    window.addEventListener('hashchange', fbFromHash);
  }

  // ----- Navigation auf der Seite: aktiven Abschnitt hervorheben -----
  var subBar = document.querySelector('.sw-subnav .wrap');
  var subLinks = Array.prototype.slice.call(document.querySelectorAll('.sw-subnav a[href^="#"]:not(.cta)'));
  if (subBar && subLinks.length && 'IntersectionObserver' in window) {
    var subMap = {};
    subLinks.forEach(function (a) {
      var el = document.getElementById(a.getAttribute('href').slice(1));
      if (el) subMap[el.id] = a;
    });
    var sio = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        subLinks.forEach(function (l) { l.classList.remove('on'); });
        var a = subMap[e.target.id];
        a.classList.add('on');
        subBar.scrollLeft = a.offsetLeft - 40;
      });
    }, { rootMargin: '-30% 0px -60% 0px' });
    Object.keys(subMap).forEach(function (id) { sio.observe(document.getElementById(id)); });
  }

  // ----- Umsatzrechner -----
  var uO = document.getElementById('uO');
  if (uO) {
    var uW = document.getElementById('uW'), uQ = document.getElementById('uQ'), uD = document.getElementById('uD');
    var oUO = document.getElementById('oUO'), oUW = document.getElementById('oUW'), oUQ = document.getElementById('oUQ'), oUD = document.getElementById('oUD');
    var uJahr = document.getElementById('uJahr'), uAuf = document.getElementById('uAuf'), uQneu = document.getElementById('uQneu'), uQalt = document.getElementById('uQalt');
    var apostroph = function (v) {
      var n = String(Math.round(v)), out = '', i;
      for (i = 0; i < n.length; i++) { if (i > 0 && (n.length - i) % 3 === 0) out += '’'; out += n.charAt(i); }
      return out;
    };
    var chfU = function (v) { return 'CHF ' + apostroph(v); };
    var eine = function (v) { return (Math.round(v * 10) / 10).toFixed(1).replace('.', ','); };
    var uFirst = true;
    var rechneU = function () {
      var o = Number(uO.value), w = Number(uW.value), q = Number(uQ.value), d = Number(uD.value);
      oUO.textContent = o; oUW.textContent = apostroph(w); oUQ.textContent = q; oUD.textContent = d;
      uQalt.textContent = q; uQneu.textContent = Math.min(100, q + d);
      var auf = o * 12 * (d / 100), umsatz = auf * w;
      uAuf.textContent = eine(auf);
      if (uFirst) { uFirst = false; uJahr.textContent = chfU(umsatz); uJahr.setAttribute('data-v', String(umsatz)); return; }
      animate(uJahr, umsatz, chfU, 350);
    };
    [uO, uW, uQ, uD].forEach(function (el) { el.addEventListener('input', rechneU); });
    rechneU();
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
