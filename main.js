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
