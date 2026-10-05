// Alta Engineering AG — shared scripts
(function(){
  var root = document.documentElement;

  // ----- Theme toggle (manual override, persisted) -----
  var toggle = document.getElementById('themeToggle');
  function currentTheme(){
    var set = root.getAttribute('data-theme');
    if (set) return set;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function applyLabel(){
    if (!toggle) return;
    var isDark = currentTheme() === 'dark';
    toggle.setAttribute('aria-label', isDark ? 'Zu Hellmodus wechseln' : 'Zu Dunkelmodus wechseln');
    toggle.setAttribute('title', isDark ? 'Hellmodus' : 'Dunkelmodus');
  }
  if (toggle){
    applyLabel();
    toggle.addEventListener('click', function(){
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch(e){}
      applyLabel();
    });
  }
  // Follow system changes only while the user hasn't chosen manually
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(){
      var saved = null;
      try { saved = localStorage.getItem('theme'); } catch(e){}
      if (!saved) applyLabel();
    });
  } catch(e){}

  // ----- Leiterplatten-Hintergrund (siehe .app-bg in style.css) -----
  if (!document.querySelector('.app-bg')){
    document.body.insertAdjacentHTML('afterbegin',
      '<div class="app-bg" aria-hidden="true"><svg class="app-bg-traces" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><defs>' +
      '<pattern id="pcb-pattern" width="400" height="400" patternUnits="userSpaceOnUse">' +
      '<path class="pcb-trace" d="M0 40 H50 L60 50 V90 H130"/><path class="pcb-trace" d="M100 0 V30 L110 40 H160"/>' +
      '<path class="pcb-trace" d="M20 160 V120 L30 110 H90 L100 120 V160"/><path class="pcb-trace" d="M160 100 H140 L130 90 V60"/>' +
      '<path class="pcb-trace" d="M0 130 H30"/>' +
      '<circle class="pcb-via" cx="60" cy="50" r="2.2"/><circle class="pcb-via" cx="130" cy="90" r="2.2"/>' +
      '<circle class="pcb-via" cx="110" cy="40" r="2.2"/><circle class="pcb-via" cx="30" cy="110" r="2.2"/>' +
      '<circle class="pcb-via" cx="100" cy="120" r="2.2"/>' +
      '<circle class="pcb-pad" cx="0" cy="40" r="3"/><circle class="pcb-pad" cx="160" cy="100" r="3"/><circle class="pcb-pad" cx="30" cy="160" r="3"/>' +
      '</pattern></defs><rect width="100%" height="100%" fill="url(#pcb-pattern)"/></svg></div>');
  }

  // ----- Year -----
  var yr = document.getElementById('yr');
  if (yr) yr.textContent = new Date().getFullYear();

  // ----- Mobile menu -----
  var burger = document.getElementById('burger'), menu = document.getElementById('menu');
  if (burger && menu){
    burger.addEventListener('click', function(){
      var open = menu.classList.toggle('open');
      burger.classList.toggle('on', open);
      burger.setAttribute('aria-expanded', open);
    });
    menu.querySelectorAll('a').forEach(function(a){
      a.addEventListener('click', function(){
        menu.classList.remove('open'); burger.classList.remove('on'); burger.setAttribute('aria-expanded','false');
      });
    });
  }

  // ----- Reveal on scroll -----
  var rv = document.querySelectorAll('.rv');
  if (rv.length && 'IntersectionObserver' in window){
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } });
    }, {threshold:.12, rootMargin:'0px 0px -6% 0px'});
    rv.forEach(function(el){ io.observe(el); });
  } else {
    rv.forEach(function(el){ el.classList.add('in'); });
  }
})();
