// Oberflaeche des Sicherheitschecks (sicherheitscheck.html). Die Pruefung selbst laeuft im Worker
// (src/security-check.js, Endpunkt POST /api/security-check). Alle Texte aus der Antwort werden mit
// textContent eingesetzt, nie als HTML, denn sie enthalten Angaben der geprueften Seite.
(function () {
  var host = location.hostname;
  var API = (host === 'localhost' || host === '127.0.0.1')
    ? 'http://' + host + ':8788/api/request-access/security-check'
    : 'https://alta-kundenportal.alta-engineering.workers.dev/api/request-access/security-check';

  var form = document.getElementById('scForm');
  if (!form) return;
  var $ = function (id) { return document.getElementById(id); };
  var input = $('scDomain'), errBox = $('scErr'), goBtn = $('scGo');
  var progress = $('scProgress'), steps = $('scSteps'), result = $('scResult');
  var lastData = null;

  var STEPS = [
    'Verbindung und Zertifikat prüfen',
    'Sicherheits-Header der Startseite lesen',
    'E-Mail-Absicherung (SPF, DMARC, DKIM) abfragen',
    'Fremdanbieter und Datenschutz-Hinweise suchen',
    'Namensdienst (DNSSEC, CAA) prüfen',
    'Note berechnen'
  ];
  var SEV = { high: 'Hoch', medium: 'Mittel', low: 'Niedrig', info: 'Info', ok: 'In Ordnung' };
  var SEV_ORDER = { high: 0, medium: 1, low: 2, info: 3, ok: 4 };

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function setError(msg) { errBox.textContent = msg || ''; errBox.style.display = msg ? 'block' : 'none'; }

  async function animateSteps(donePromise) {
    clear(steps);
    var items = STEPS.map(function (t) { var li = el('li', '', t); steps.appendChild(li); return li; });
    for (var i = 0; i < items.length; i++) {
      items[i].className = 'run';
      // Bis die Antwort da ist, hoechstens bis zum vorletzten Schritt laufen lassen.
      await sleep(i === items.length - 1 ? 250 : 420);
      if (i === items.length - 2) await donePromise.catch(function () {});
      items[i].className = 'done';
    }
  }

  async function run(domain) {
    setError('');
    goBtn.disabled = true;
    result.hidden = true;
    progress.hidden = false;
    var body = { domain: domain, website: $('scWebsite').value };
    var fetched = fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, json: j }; }); });
    var minimum = sleep(2600);
    try {
      await Promise.all([animateSteps(fetched), minimum]);
      var res = await fetched;
      if (!res.ok) throw new Error((res.json && res.json.error) || 'Die Prüfung ist fehlgeschlagen.');
      lastData = res.json;
      render(res.json);
      progress.hidden = true;
      result.hidden = false;
      result.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      progress.hidden = true;
      setError(e && e.message && !/Failed to fetch|NetworkError|Load failed/i.test(e.message) ? e.message : 'Der Dienst ist gerade nicht erreichbar. Bitte versuchen Sie es in einer Minute erneut.');
    } finally {
      goBtn.disabled = false;
    }
  }

  function gradeColor(g) {
    return g === 'A' || g === 'B' ? 'ok' : g === 'C' ? 'low' : g === 'D' ? 'medium' : 'high';
  }

  var VERDICT = {
    A: ['Sehr gut abgesichert', 'Die wichtigsten Schutzmassnahmen sind vorhanden. Es bleiben höchstens Feinheiten.'],
    B: ['Solide Basis, einzelne Lücken', 'Das Wesentliche stimmt. Mit wenigen Anpassungen erreichen Sie die Bestnote.'],
    C: ['Durchschnittlich, mit klarem Handlungsbedarf', 'Es fehlen mehrere Standard-Schutzmassnahmen. Die meisten lassen sich in einem Nachmittag nachrüsten.'],
    D: ['Deutliche Schwächen', 'Mehrere wichtige Schutzmassnahmen fehlen. Angreifer hätten leichtes Spiel mit Standardmethoden.'],
    E: ['Erhebliche Schwächen', 'Die Seite ist in zentralen Punkten ungeschützt. Wir empfehlen, zeitnah zu handeln.'],
    F: ['Kritisch', 'Grundlegende Schutzmassnahmen fehlen oder sind fehlerhaft. Bitte dringend handeln.']
  };

  function render(d) {
    $('scDomainOut').textContent = d.domain;
    var g = d.grade;
    $('scGrade').textContent = g;
    $('scRing').setAttribute('data-tone', gradeColor(g));
    $('scVerdict').textContent = VERDICT[g][0];
    $('scSummary').textContent = VERDICT[g][1] + ' Punktzahl: ' + d.score + ' von 100. Geprüft am ' + new Date(d.checkedAt).toLocaleString('de-CH', { dateStyle: 'medium', timeStyle: 'short' }) + '.';

    // Ring
    var fg = $('scRingFg');
    var C = 2 * Math.PI * 52;
    fg.style.strokeDasharray = C.toFixed(1);
    fg.style.strokeDashoffset = C.toFixed(1);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { fg.style.strokeDashoffset = (C * (1 - d.score / 100)).toFixed(1); });
    });
    // Falls requestAnimationFrame nicht laeuft (Hintergrund-Tab), Endwert trotzdem setzen
    setTimeout(function () { fg.style.strokeDashoffset = (C * (1 - d.score / 100)).toFixed(1); }, 120);

    var counts = $('scCounts');
    clear(counts);
    ['high', 'medium', 'low', 'info', 'ok'].forEach(function (k) {
      if (!d.counts[k]) return;
      var chip = el('span', 'sc-chip sev-' + k);
      chip.appendChild(el('b', '', String(d.counts[k])));
      chip.appendChild(document.createTextNode(' ' + SEV[k]));
      counts.appendChild(chip);
    });

    // Kategorien
    var cats = $('scCats');
    clear(cats);
    d.categories.forEach(function (c) {
      var card = el('div', 'sc-cat' + (c.applicable ? '' : ' na'));
      card.appendChild(el('div', 'sc-cat-t', c.title));
      var bar = el('div', 'sc-bar');
      var fill = el('span', 'sc-fill tone-' + (c.score >= 90 ? 'ok' : c.score >= 70 ? 'low' : c.score >= 50 ? 'medium' : 'high'));
      fill.style.width = c.applicable ? c.score + '%' : '0%';
      bar.appendChild(fill);
      card.appendChild(bar);
      card.appendChild(el('div', 'sc-cat-v', c.applicable ? c.score + ' / 100' : 'nicht zutreffend'));
      cats.appendChild(card);
    });

    renderList();

    var lim = $('scLimits');
    clear(lim);
    lim.appendChild(el('h4', '', 'Was dieser Check nicht leistet'));
    var ul = el('ul');
    (d.meta.limitations || []).forEach(function (t) { ul.appendChild(el('li', '', t)); });
    lim.appendChild(ul);

    var msg = 'Wir haben den Sicherheitscheck für ' + d.domain + ' durchgeführt (Note ' + g + ', ' + d.score + ' von 100) und möchten das Ergebnis besprechen.';
    $('scContact').href = 'kontakt.html?thema=pentesting&nachricht=' + encodeURIComponent(msg);
  }

  var catTitle = {};
  function renderList() {
    if (!lastData) return;
    var showAll = $('scAll').checked;
    var list = $('scList');
    clear(list);
    lastData.categories.forEach(function (c) { catTitle[c.id] = c.title; });
    var items = lastData.findings.slice().sort(function (a, b) { return SEV_ORDER[a.sev] - SEV_ORDER[b.sev]; });
    var shown = 0;
    items.forEach(function (f, idx) {
      if (!showAll && f.sev === 'ok') return;
      shown++;
      var det = el('details', 'sc-f sev-' + f.sev);
      if (idx === 0 && f.sev !== 'ok' && f.sev !== 'info') det.open = true;
      var sum = el('summary');
      sum.appendChild(el('span', 'sc-badge', SEV[f.sev]));
      sum.appendChild(el('span', 'sc-f-title', f.title));
      sum.appendChild(el('span', 'sc-f-cat', catTitle[f.cat] || ''));
      det.appendChild(sum);
      var body = el('div', 'sc-f-body');
      body.appendChild(el('p', '', f.detail));
      if (f.fix) {
        var fix = el('p', 'sc-fix');
        fix.appendChild(el('b', '', 'So beheben Sie es: '));
        fix.appendChild(document.createTextNode(f.fix));
        body.appendChild(fix);
      }
      if (f.snippet) {
        var wrap = el('div', 'sc-code');
        wrap.appendChild(el('pre', '', f.snippet));
        var cp = el('button', 'sc-copy', 'Kopieren');
        cp.type = 'button';
        cp.addEventListener('click', function () {
          if (navigator.clipboard) navigator.clipboard.writeText(f.snippet).then(function () { cp.textContent = 'Kopiert'; setTimeout(function () { cp.textContent = 'Kopieren'; }, 1500); });
        });
        wrap.appendChild(cp);
        body.appendChild(wrap);
      }
      det.appendChild(body);
      list.appendChild(det);
    });
    if (!shown) list.appendChild(el('p', 'sc-empty', 'Keine offenen Punkte. Alle geprüften Massnahmen sind in Ordnung.'));
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var v = input.value.trim();
    if (!v) { setError('Bitte geben Sie eine Domain ein, zum Beispiel ihre-firma.ch.'); return; }
    run(v);
  });
  $('scAll').addEventListener('change', renderList);
  $('scPrint').addEventListener('click', function () { window.print(); });
  $('scAgain').addEventListener('click', function () {
    result.hidden = true;
    input.value = '';
    input.focus();
    window.scrollTo({ top: form.offsetTop - 80, behavior: 'smooth' });
  });

  // Beim Drucken alle Befunde aufklappen
  var wasOpen = [];
  window.addEventListener('beforeprint', function () {
    wasOpen = [];
    document.querySelectorAll('.sc-f').forEach(function (d) { wasOpen.push(d.open); d.open = true; });
  });
  window.addEventListener('afterprint', function () {
    document.querySelectorAll('.sc-f').forEach(function (d, i) { d.open = !!wasOpen[i]; });
  });

  // Direktlink: sicherheitscheck.html?d=beispiel.ch startet die Pruefung sofort
  try {
    var q = new URLSearchParams(location.search).get('d');
    if (q) { input.value = q.slice(0, 253); run(q); }
  } catch (e) {}
})();
