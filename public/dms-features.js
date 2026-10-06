/* Dokumentenlenkung: Zusatzfunktionen (Dashboard, Vorlagen, Gruppen, Inhaltssuche, Versionsvergleich).
   Wird vor dms.js geladen und nutzt dessen Hilfsfunktionen ueber window.__dms (erst zur Laufzeit). */
(function () {
  'use strict';
  var X = window.DMSX = {};
  function D() { return window.__dms; }
  function esc(v) { return D().esc(v); }
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  // =====================================================================
  //  Tooltip (ein Element fuer alle Diagramme, Inhalt per textContent)
  // =====================================================================

  var tip = null;
  function ensureTip() {
    if (tip) return tip;
    tip = el('div', 'vtip'); tip.hidden = true; document.body.appendChild(tip);
    return tip;
  }
  function showTip(ev, title, rows) {
    var t = ensureTip();
    t.innerHTML = '';
    t.appendChild(el('div', 'vt-title', title));
    rows.forEach(function (r) {
      var line = el('div', 'vt-row');
      if (r.color) { var k = el('span', 'vt-key'); k.style.background = r.color; line.appendChild(k); }
      line.appendChild(el('span', 'vt-val', r.value));
      if (r.label) line.appendChild(el('span', 'vt-lbl', r.label));
      t.appendChild(line);
    });
    t.hidden = false;
    var x = ev.clientX + 14, y = ev.clientY + 14;
    var w = t.offsetWidth, h = t.offsetHeight;
    if (x + w > window.innerWidth - 8) x = ev.clientX - w - 14;
    if (y + h > window.innerHeight - 8) y = ev.clientY - h - 14;
    t.style.left = Math.max(6, x) + 'px'; t.style.top = Math.max(6, y) + 'px';
  }
  function hideTip() { if (tip) tip.hidden = true; }
  document.addEventListener('pointerdown', hideTip);
  window.addEventListener('hashchange', hideTip);
  window.addEventListener('scroll', hideTip, true);
  // data-tip="<index>" an Marken, tips = Array von {title, rows}
  function wireTips(root, tips) {
    root.querySelectorAll('[data-tip]').forEach(function (n) {
      var t = tips[Number(n.getAttribute('data-tip'))];
      if (!t) return;
      n.addEventListener('pointermove', function (e) { showTip(e, t.title, t.rows); });
      n.addEventListener('pointerleave', hideTip);
      n.addEventListener('focus', function () { var r = n.getBoundingClientRect(); showTip({ clientX: r.left + r.width / 2, clientY: r.top }, t.title, t.rows); });
      n.addEventListener('blur', hideTip);
    });
  }

  // =====================================================================
  //  Dashboard
  // =====================================================================

  var MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

  function niceMax(v) {
    if (v <= 4) return 4;
    var pow = Math.pow(10, Math.floor(Math.log10(v)));
    var n = v / pow;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
  }

  function monthKeys(n) {
    var out = [], d = new Date();
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    for (var i = n - 1; i >= 0; i--) {
      var x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
      out.push({ key: x.getUTCFullYear() + '-' + String(x.getUTCMonth() + 1).padStart(2, '0'), label: MONTHS[x.getUTCMonth()], year: x.getUTCFullYear(), month: x.getUTCMonth() });
    }
    return out;
  }

  // Alle Freigaben mit Durchlaufzeit (Einreichen bis Freigabe) aus dem Verlauf
  function collectReleases(docs) {
    var out = [];
    docs.forEach(function (d) {
      var hist = d.history || [];
      hist.forEach(function (e, i) {
        if (e.type !== 'status' || e.to !== 'freigegeben') return;
        var submit = null;
        for (var j = i - 1; j >= 0; j--) {
          var h = hist[j];
          if (h.type === 'status' && h.to === 'in_pruefung' && (e.version == null || h.version === e.version)) { submit = h; break; }
        }
        var days = submit ? Math.max(0, (new Date(e.at) - new Date(submit.at)) / 86400000) : null;
        out.push({ doc: d, at: e.at, days: days, version: e.version });
      });
    });
    return out;
  }

  function columnChart(items, o) {
    var W = 640, H = 230, L = 34, R = 10, T = 14, B = 28, pw = W - L - R, ph = H - T - B;
    var max = niceMax(Math.max.apply(null, items.map(function (i) { return i.value; }).concat([1])));
    var slot = pw / items.length, bw = Math.min(24, slot - 10);
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="vsvg" role="img" aria-label="' + esc(o.label) + '">';
    for (var g = 0; g <= 4; g++) {
      var gy = T + ph - (ph * g) / 4;
      s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + gy + '" y2="' + gy + '" class="vgrid"/>';
      s += '<text x="' + (L - 6) + '" y="' + (gy + 3.5) + '" class="vaxis" text-anchor="end">' + Math.round((max * g) / 4) + '</text>';
    }
    var lastNon = -1, maxI = 0;
    items.forEach(function (it, i) { if (it.value > 0) lastNon = i; if (it.value > items[maxI].value) maxI = i; });
    items.forEach(function (it, i) {
      var cx = L + slot * i + slot / 2, bh = max ? (ph * it.value) / max : 0, x = cx - bw / 2, y = T + ph - bh, r = Math.min(4, bh);
      if (it.value > 0) s += '<path d="M' + x + ',' + (T + ph) + ' V' + (y + r) + ' a' + r + ',' + r + ' 0 0 1 ' + r + ',-' + r + ' H' + (x + bw - r) + ' a' + r + ',' + r + ' 0 0 1 ' + r + ',' + r + ' V' + (T + ph) + ' Z" class="vbar" fill="var(--v1)"/>';
      s += '<text x="' + cx + '" y="' + (H - 9) + '" class="vaxis" text-anchor="middle">' + esc(it.label) + '</text>';
      if (it.sub) s += '<text x="' + cx + '" y="' + (H - 0) + '" class="vaxis sub" text-anchor="middle"></text>';
      if (it.value > 0 && (i === maxI || i === lastNon)) s += '<text x="' + cx + '" y="' + (y - 5) + '" class="vval" text-anchor="middle">' + it.value + '</text>';
      s += '<rect x="' + (cx - slot / 2) + '" y="' + T + '" width="' + slot + '" height="' + ph + '" fill="transparent" class="vhit" tabindex="0" data-tip="' + i + '" aria-label="' + esc(it.label + ': ' + it.value) + '"/>';
    });
    s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + (T + ph) + '" y2="' + (T + ph) + '" class="vbase"/></svg>';
    return s;
  }

  // Horizontale Balken: rows = [{label, segs:[{value,color,name}], total}]
  function hbars(rows, o) {
    var W = 640, LBL = 150, R = 56, rowH = 34, bh = 20, H = rows.length * rowH + 8, pw = W - LBL - R;
    var max = niceMax(Math.max.apply(null, rows.map(function (r) { return r.total; }).concat([1])));
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="vsvg" role="img" aria-label="' + esc(o.label) + '">';
    var tipIdx = 0;
    rows.forEach(function (r, ri) {
      var y = ri * rowH + 6, x = LBL, lbl = r.label.length > 22 ? r.label.slice(0, 21) + '…' : r.label;
      s += '<text x="' + (LBL - 10) + '" y="' + (y + bh / 2 + 4) + '" class="vaxis lbl" text-anchor="end">' + esc(lbl) + '</text>';
      var segs = r.segs.filter(function (g) { return g.value > 0; });
      segs.forEach(function (g, gi) {
        var w = (pw * g.value) / max, last = gi === segs.length - 1, gap = gi > 0 ? 2 : 0;
        var sx = x + gap, sw = Math.max(0, w - gap), rr = last ? Math.min(4, sw) : 0;
        var d = rr ? 'M' + sx + ',' + y + ' H' + (sx + sw - rr) + ' a' + rr + ',' + rr + ' 0 0 1 ' + rr + ',' + rr + ' V' + (y + bh - rr) + ' a' + rr + ',' + rr + ' 0 0 1 -' + rr + ',' + rr + ' H' + sx + ' Z' : 'M' + sx + ',' + y + ' H' + (sx + sw) + ' V' + (y + bh) + ' H' + sx + ' Z';
        s += '<path d="' + d + '" fill="' + g.color + '" class="vbar"/>';
        if (sw >= 24) s += '<text x="' + (sx + sw / 2) + '" y="' + (y + bh / 2 + 4) + '" class="vin" text-anchor="middle" fill="' + (g.ink || '#ffffff') + '">' + g.value + '</text>';
        s += '<rect x="' + sx + '" y="' + (y - 4) + '" width="' + Math.max(sw, 6) + '" height="' + (bh + 8) + '" fill="transparent" class="vhit" tabindex="0" data-tip="' + (g.tip != null ? g.tip : '') + '" aria-label="' + esc(r.label + ', ' + g.name + ': ' + g.text) + '"/>';
        x += w;
      });
      s += '<text x="' + (x + 8) + '" y="' + (y + bh / 2 + 4) + '" class="vval">' + esc(r.endLabel != null ? r.endLabel : String(r.total)) + '</text>';
    });
    return s + '</svg>';
  }

  function legend(items) {
    return '<div class="vlegend">' + items.map(function (i) { return '<span><i style="background:' + i.color + '"></i>' + esc(i.name) + '</span>'; }).join('') + '</div>';
  }

  function chartCard(id, title, sub, bodyHtml, tableHtml, extra) {
    return '<div class="card chart" id="ch_' + id + '"><div class="chart-head"><div><h2>' + esc(title) + '</h2><div class="sub">' + esc(sub) + '</div></div>' + (tableHtml ? '<button class="btn sm ghost" data-table="' + id + '">Tabelle</button>' : '') + '</div>' + (extra || '') +
      '<div class="chart-body">' + bodyHtml + '</div>' + (tableHtml ? '<div class="chart-table" hidden>' + tableHtml + '</div>' : '') + '</div>';
  }
  function tbl(head, rows) {
    return '<table style="min-width:0"><thead><tr>' + head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
  }

  X.renderDashboard = function () {
    hideTip();
    var d = D(), S = d.S, docs = S.docs, can = d.can;
    var active = docs.filter(function (x) { return x.status !== 'archiviert'; });
    var valid = active.filter(function (x) { return x.releasedVersion; });
    var overdue = valid.filter(function (x) { return d.reviewState(x) === 'overdue'; });
    var due = valid.filter(function (x) { return d.reviewState(x) === 'due'; });
    var okc = valid.length - overdue.length - due.length;
    var tasks = docs.filter(function (x) { return d.taskFor(x); }).length;
    var releases = collectReleases(docs);
    var withDays = releases.filter(function (r) { return r.days != null; });
    var avgDays = withDays.length ? withDays.reduce(function (a, r) { return a + r.days; }, 0) / withDays.length : null;

    // Lesebestaetigungen gesamt
    var need = 0, done = 0;
    valid.filter(function (x) { return x.readRequired; }).forEach(function (x) {
      var req = d.requiredReaders(x);
      need += req.length;
      done += req.filter(function (m) { return x.reads && x.reads[m] && x.reads[m].version === x.releasedVersion; }).length;
    });

    var h = '<div class="page-head"><div><h1>Übersicht</h1><p>Der Stand der Dokumentenlenkung von ' + esc(S.tenant.name) + ' auf einen Blick.</p></div><div class="row"><a class="btn" href="/api/dms/audit-report?tenantId=' + encodeURIComponent(S.tenantId) + '">Auditbericht (PDF)</a>' + (can('write') ? '<button class="btn primary" id="dbNew">+ Neues Dokument</button>' : '') + '</div></div>';
    h += '<div class="kpis">' +
      kpi('Gültige Dokumente', valid.length, '', 'dokumente') +
      kpi('Überprüfung überfällig', overdue.length, overdue.length ? 'neg' : 'pos', 'faellig') +
      kpi('Meine Aufgaben', tasks, tasks ? 'warn' : 'pos', 'aufgaben') +
      kpi('Ø Durchlauf bis Freigabe', avgDays == null ? '–' : (avgDays < 1 ? '< 1 Tag' : avgDays.toFixed(1).replace(/\.0$/, '') + ' Tage'), '', null) +
      kpi('Lesebestätigungen', need ? Math.round((done / need) * 100) + ' %' : '–', need && done < need ? 'warn' : '', null) + '</div>';

    // 1) Freigaben pro Monat
    var months = monthKeys(12);
    var perMonth = {};
    releases.forEach(function (r) { var k = String(r.at).slice(0, 7); (perMonth[k] = perMonth[k] || []).push(r); });
    var colItems = months.map(function (m) { return { label: m.label + (m.month === 0 || m === months[0] ? ' ' + String(m.year).slice(2) : ''), value: (perMonth[m.key] || []).length, key: m.key }; });
    var tips1 = colItems.map(function (it, i) {
      var list = (perMonth[months[i].key] || []);
      return { title: months[i].label + ' ' + months[i].year, rows: [{ value: String(it.value), label: it.value === 1 ? 'Freigabe' : 'Freigaben' }].concat(list.slice(0, 5).map(function (r) { return { value: r.doc.docNumber, label: r.doc.title }; })) };
    });
    var total12 = colItems.reduce(function (a, i) { return a + i.value; }, 0);
    var c1 = chartCard('frei', 'Freigaben pro Monat', total12 ? total12 + ' Freigaben in den letzten 12 Monaten' : 'Noch keine Freigaben in den letzten 12 Monaten', columnChart(colItems, { label: 'Freigaben pro Monat' }), tbl(['Monat', 'Freigaben'], colItems.map(function (i, k) { return [months[k].label + ' ' + months[k].year, i.value]; })));

    // 2) Dokumente pro Abteilung, nach Status
    var cats = S.tenant.categories.slice();
    var rowsC = cats.map(function (c) {
      var inCat = active.filter(function (x) { return x.category === c; });
      return { label: c, f: inCat.filter(function (x) { return x.status === 'freigegeben'; }).length, p: inCat.filter(function (x) { return x.status === 'in_pruefung' || x.status === 'geprueft'; }).length, e: inCat.filter(function (x) { return x.status === 'entwurf'; }).length, n: inCat.length };
    }).filter(function (r) { return r.n > 0; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 8);
    var tips2 = [];
    var rows2 = rowsC.map(function (r) {
      var mk = function (name, value, color, ink) { tips2.push({ title: r.label, rows: [{ value: String(value), label: name, color: color }] }); return { value: value, color: color, ink: ink, name: name, text: String(value), tip: tips2.length - 1 }; };
      return { label: r.label, total: r.n, segs: [mk('Freigegeben', r.f, 'var(--v1)', 'var(--v1i)'), mk('In Prüfung', r.p, 'var(--v2)', 'var(--v2i)'), mk('Entwurf', r.e, 'var(--v3)', 'var(--v3i)')] };
    });
    var c2 = chartCard('abt', 'Dokumente pro Abteilung', 'Nach Status, ohne archivierte', rowsC.length ? hbars(rows2, { label: 'Dokumente pro Abteilung' }) : '<div class="empty">Noch keine Dokumente.</div>', tbl(['Abteilung', 'Freigegeben', 'In Prüfung', 'Entwurf'], rowsC.map(function (r) { return [r.label, r.f, r.p, r.e]; })), legend([{ name: 'Freigegeben', color: 'var(--v1)' }, { name: 'In Prüfung', color: 'var(--v2)' }, { name: 'Entwurf', color: 'var(--v3)' }]));

    // 3) Durchlaufzeit pro Abteilung
    var byCat = {};
    withDays.forEach(function (r) { var c = r.doc.category; (byCat[c] = byCat[c] || []).push(r); });
    var rowsD = Object.keys(byCat).map(function (c) { var a = byCat[c]; return { label: c, avg: a.reduce(function (s, r) { return s + r.days; }, 0) / a.length, n: a.length }; }).sort(function (a, b) { return b.avg - a.avg; }).slice(0, 8);
    var tips3 = [];
    var rows3 = rowsD.map(function (r) {
      var txt = r.avg < 1 ? 'unter 1 Tag' : r.avg.toFixed(1).replace(/\.0$/, '') + ' Tage';
      tips3.push({ title: r.label, rows: [{ value: txt, label: 'Ø bis zur Freigabe', color: 'var(--v1)' }, { value: String(r.n), label: r.n === 1 ? 'Freigabe' : 'Freigaben' }] });
      return { label: r.label, total: Math.max(r.avg, 0.05), endLabel: txt, segs: [{ value: Math.max(r.avg, 0.05), color: 'var(--v1)', name: 'Durchlaufzeit', text: txt, tip: tips3.length - 1 }] };
    });
    var c3 = chartCard('dur', 'Durchlaufzeit bis zur Freigabe', 'Ø Tage vom Einreichen bis zur Freigabe, pro Abteilung', rowsD.length ? hbars(rows3, { label: 'Durchlaufzeit' }) : '<div class="empty">Sobald Dokumente eingereicht und freigegeben wurden, erscheint hier die Durchlaufzeit.</div>', tbl(['Abteilung', 'Ø Tage', 'Freigaben'], rowsD.map(function (r) { return [r.label, r.avg.toFixed(1), r.n]; })));

    // 4) Aktualitaet der Ueberpruefungen
    var seg = [{ n: okc, name: 'Aktuell', icon: '✔', color: '#2e8b6a' }, { n: due.length, name: 'In 30 Tagen fällig', icon: '', color: '#c79a2e' }, { n: overdue.length, name: 'Überfällig', icon: '✖', color: '#b94a48' }];
    var tot = Math.max(valid.length, 1), tips4 = [];
    var bar = '<svg viewBox="0 0 640 30" class="vsvg" role="img" aria-label="Aktualität der Überprüfungen">';
    var bx = 0;
    seg.filter(function (g) { return g.n > 0; }).forEach(function (g, i, arr) {
      var w = (640 * g.n) / tot, gap = i > 0 ? 2 : 0;
      tips4.push({ title: g.name, rows: [{ value: String(g.n), label: g.n === 1 ? 'Dokument' : 'Dokumente', color: g.color }] });
      bar += '<rect x="' + (bx + gap) + '" y="4" width="' + Math.max(0, w - gap) + '" height="22" rx="' + (i === arr.length - 1 || i === 0 ? 4 : 0) + '" fill="' + g.color + '" class="vbar vhit" tabindex="0" data-tip="' + (tips4.length - 1) + '" aria-label="' + esc(g.name + ': ' + g.n) + '"/>';
      bx += w;
    });
    bar += '</svg>';
    var urgent = valid.filter(function (x) { return x.nextReview; }).sort(function (a, b) { return String(a.nextReview).localeCompare(String(b.nextReview)); }).filter(function (x) { return d.daysUntil(x.nextReview) <= 60; }).slice(0, 6);
    var legendHtml = '<div class="vlegend big">' + seg.map(function (g) { return '<span><b style="color:' + (g.color === '#fab219' ? 'var(--warn)' : g.color) + '">' + g.icon + '</b> ' + esc(g.name) + ' <strong>' + g.n + '</strong></span>'; }).join('') + '</div>';
    var list = urgent.length ? '<div class="urgent">' + urgent.map(function (x) { var du = d.daysUntil(x.nextReview); return '<button class="u-row" data-open="' + x.id + '"><span class="docnr">' + esc(x.docNumber) + '</span><span class="u-t">' + esc(x.title) + '</span><span class="chip ' + (du < 0 ? 'overdue' : 'due') + '">' + (du < 0 ? 'überfällig seit ' : 'fällig am ') + d.fmtDay(x.nextReview) + '</span></button>'; }).join('') + '</div>' : '<div class="muted" style="margin-top:.8rem">Keine Überprüfung in den nächsten 60 Tagen fällig.</div>';
    var c4 = chartCard('akt', 'Aktualität der Überprüfungen', valid.length ? 'Alle ' + valid.length + ' gültigen Dokumente' : 'Noch keine gültigen Dokumente', valid.length ? bar + legendHtml + list : '<div class="empty">Sobald Dokumente freigegeben sind, siehst du hier, ob ihre Überprüfung aktuell ist.</div>', tbl(['Status', 'Dokumente'], seg.map(function (g) { return [g.name, g.n]; })));

    $('page').innerHTML = h + '<div class="dash"><div class="chart-grid">' + c1 + c2 + c3 + c4 + '</div></div>';

    var tipSets = { frei: tips1, abt: tips2, dur: tips3, akt: tips4 };
    Object.keys(tipSets).forEach(function (k) { var c = $('ch_' + k); if (c) wireTips(c, tipSets[k]); });
    $('page').querySelectorAll('[data-table]').forEach(function (b) {
      b.addEventListener('click', function () {
        var card = $('ch_' + b.getAttribute('data-table')), t = card.querySelector('.chart-table'), body = card.querySelector('.chart-body');
        var show = t.hidden; t.hidden = !show; body.hidden = show; b.textContent = show ? 'Diagramm' : 'Tabelle';
      });
    });
    $('page').querySelectorAll('[data-open]').forEach(function (b) { b.addEventListener('click', function () { location.hash = '#/dokumente'; setTimeout(function () { d.openDrawer(b.getAttribute('data-open')); }, 80); }); });
    $('page').querySelectorAll('[data-go]').forEach(function (b) { b.addEventListener('click', function () { location.hash = '#/dokumente'; }); });
    var nb = $('dbNew'); if (nb) nb.addEventListener('click', function () { d.newDoc(); });
  };
  function kpi(label, value, cls, go) {
    return '<button class="kpi ' + (cls || '') + (go ? ' click' : '') + '"' + (go ? ' data-go="' + go + '"' : '') + '><div class="l">' + esc(label) + '</div><div class="v">' + esc(value) + '</div></button>';
  }

  // =====================================================================
  //  Dokumentvorlagen
  // =====================================================================

  X.chooseTemplate = function (cb) {
    var d = D(), S = d.S;
    d.api('/api/dms/templates?tenantId=' + encodeURIComponent(S.tenantId)).then(function (res) {
      var bg = el('div', 'modal-bg');
      var cards = [{ id: '', name: 'Leeres Dokument', description: 'Ohne Vorlage starten und die Datei später hochladen.', sections: 0 }].concat(res.templates);
      bg.innerHTML = '<div class="modal wide"><h3>Neues Dokument</h3><div class="m-sub">Wähle eine Vorlage. Du bekommst eine Word-Startdatei mit Kopf und Gliederung, die du nur noch ausfüllst.</div><div class="m-body"><div class="tpl-grid">' +
        cards.map(function (t, i) { return '<button class="tpl-card" data-i="' + i + '"><span class="tpl-ic"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg></span><span class="tpl-nm">' + esc(t.name) + (t.builtin === false ? ' <span class="chip">eigene</span>' : '') + '</span><span class="tpl-ds">' + esc(t.description) + '</span>' + (t.sections ? '<span class="tpl-meta">' + t.sections + ' Abschnitte</span>' : '') + '</button>'; }).join('') +
        '</div></div><div class="m-foot"><button class="btn" data-m="cancel">Abbrechen</button></div></div>';
      document.body.appendChild(bg);
      function close() { bg.remove(); }
      bg.addEventListener('mousedown', function (e) { if (e.target === bg) close(); });
      bg.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
      bg.querySelector('[data-m=cancel]').addEventListener('click', close);
      bg.querySelectorAll('.tpl-card').forEach(function (b) {
        b.addEventListener('click', function () {
          var t = cards[Number(b.getAttribute('data-i'))];
          close();
          if (!t.id) { cb({}); return; }
          cb({ title: t.titlePrefix || '', category: t.category || undefined, description: t.description, tags: t.tags || [], reviewIntervalMonths: t.reviewMonths, readRequired: t.readRequired, templateId: t.id, templateName: t.name });
        });
      });
      var first = bg.querySelector('.tpl-card'); if (first) first.focus();
    }).catch(d.fail);
  };

  function settingsCard(html) { var c = el('div', 'card'); c.innerHTML = html; $('page').appendChild(c); return c; }

  X.settingsExtras = function () {
    var d = D(), S = d.S;
    d.api('/api/dms/templates?tenantId=' + encodeURIComponent(S.tenantId)).then(function (res) {
      var custom = res.templates.filter(function (t) { return !t.builtin; });
      var built = res.templates.filter(function (t) { return t.builtin; });
      var c = settingsCard('<h2>Dokumentvorlagen</h2><div class="sub">Mit Vorlagen starten neue Dokumente schneller. Die eingebauten Vorlagen stehen allen zur Verfügung, eigene Vorlagen legst du hier an.</div>' +
        '<div class="tpl-list">' + built.map(function (t) { return '<span class="chip" title="' + esc(t.description) + '">' + esc(t.icon + ' ' + t.name) + '</span>'; }).join('') + '</div>' +
        '<h4 style="margin:1.1rem 0 .5rem">Eigene Vorlagen</h4>' +
        (custom.length ? custom.map(function (t) { return '<div class="row" style="margin-bottom:.5rem;justify-content:space-between"><div><b>' + esc(t.name) + '</b> <span class="muted">· ' + t.sections + ' Abschnitte' + (t.category ? ' · ' + esc(t.category) : '') + '</span><div class="t-sub">' + esc(t.description) + '</div></div><div class="row"><button class="btn sm" data-tedit="' + esc(t.id) + '">Bearbeiten</button><button class="btn sm danger" data-tdel="' + esc(t.id) + '">Löschen</button></div></div>'; }).join('') : '<div class="muted" style="margin-bottom:.6rem">Noch keine eigene Vorlage.</div>') +
        '<div class="row" style="margin-top:.8rem"><button class="btn" id="tplNew">+ Eigene Vorlage</button></div>');
      c.querySelector('#tplNew').addEventListener('click', function () { editTemplate(null, custom); });
      c.querySelectorAll('[data-tedit]').forEach(function (b) { b.addEventListener('click', function () { editTemplate(custom.filter(function (t) { return t.id === b.getAttribute('data-tedit'); })[0], custom); }); });
      c.querySelectorAll('[data-tdel]').forEach(function (b) { b.addEventListener('click', function () { if (confirm('Vorlage löschen? Bereits angelegte Dokumente bleiben erhalten.')) d.api('/api/dms/templates?tenantId=' + encodeURIComponent(S.tenantId) + '&id=' + encodeURIComponent(b.getAttribute('data-tdel')), { method: 'DELETE' }).then(function () { d.renderSettings(); }).catch(d.fail); }); });
      indexCard();
    }).catch(function () { indexCard(); });
  };

  function editTemplate(t, custom) {
    var d = D(), S = d.S;
    d.askForm({
      title: t ? 'Vorlage bearbeiten' : 'Eigene Vorlage',
      sub: 'Die Gliederung wird zur Startdatei (Word): eine Zeile pro Abschnitt, optional mit Hinweis nach einem senkrechten Strich.',
      fields: [
        { name: 'name', label: 'Name der Vorlage', value: t ? t.name : '', required: true, placeholder: 'z.B. Lieferantenbewertung' },
        { name: 'description', label: 'Beschreibung', value: t ? t.description : '', placeholder: 'Wofür ist die Vorlage gedacht?' },
        { name: 'category', label: 'Passende Kategorie (optional)', type: 'select', options: [{ value: '', label: 'Keine Vorgabe' }].concat(S.tenant.categories), value: t ? t.category : '' },
        { name: 'tags', label: 'Schlagworte, kommagetrennt', value: t ? (t.tags || []).join(', ') : '' },
        { name: 'reviewMonths', label: 'Überprüfung alle … Monate', type: 'number', value: t ? t.reviewMonths : (S.tenant.defaultReviewMonths == null ? 12 : S.tenant.defaultReviewMonths) },
        { name: 'readRequired', label: 'Lesepflicht vorschlagen', type: 'checkbox', value: t ? !!t.readRequired : false },
        { name: 'outline', label: 'Gliederung', type: 'textarea', rows: 7, required: true, value: t ? (t.outline || []).map(function (o) { return o.h + (o.hint ? ' | ' + o.hint : ''); }).join('\n') : 'Zweck | Warum gibt es dieses Dokument?\nGeltungsbereich\nAblauf\nMitgeltende Unterlagen' }
      ],
      ok: 'Speichern'
    }).then(function (v) {
      if (!v) return;
      d.send('POST', '/api/dms/templates', { tenantId: S.tenantId, id: t ? t.id : undefined, name: v.name, description: v.description, category: v.category, tags: v.tags, reviewMonths: v.reviewMonths, readRequired: v.readRequired, outline: v.outline }).then(function () { d.toast('Vorlage gespeichert.'); d.renderSettings(); }).catch(d.fail);
    });
  }

  // =====================================================================
  //  Gruppen und Verteiler
  // =====================================================================

  X.groupsCard = function (members) {
    var d = D(), S = d.S, groups = S.tenant.groups || [];
    var c = settingsCard('<h2>Gruppen</h2><div class="sub">Fasse Personen zusammen, zum Beispiel «Produktion» oder «Geschäftsleitung». Bei einem Dokument mit Lesepflicht wählst du dann die Gruppen, die es lesen müssen.</div>' +
      (groups.length ? groups.map(function (g) {
        var names = g.members.map(function (m) { var x = members.filter(function (y) { return y.email === m; })[0]; return x ? x.name : m; });
        return '<div class="grp"><div style="flex:1;min-width:0"><b>' + esc(g.name) + '</b> <span class="muted">· ' + g.members.length + ' Person' + (g.members.length === 1 ? '' : 'en') + '</span><div class="t-sub">' + (names.length ? esc(names.slice(0, 8).join(', ') + (names.length > 8 ? ' …' : '')) : 'noch niemand') + '</div></div><div class="row"><button class="btn sm" data-gedit="' + esc(g.id) + '">Bearbeiten</button><button class="btn sm danger" data-gdel="' + esc(g.id) + '">Löschen</button></div></div>';
      }).join('') : '<div class="muted" style="margin-bottom:.6rem">Noch keine Gruppe.</div>') +
      '<div class="row" style="margin-top:.8rem"><button class="btn" id="grpNew">+ Gruppe</button></div>');
    c.querySelector('#grpNew').addEventListener('click', function () { editGroup(null, members); });
    c.querySelectorAll('[data-gedit]').forEach(function (b) { b.addEventListener('click', function () { editGroup(groups.filter(function (g) { return g.id === b.getAttribute('data-gedit'); })[0], members); }); });
    c.querySelectorAll('[data-gdel]').forEach(function (b) { b.addEventListener('click', function () { if (confirm('Gruppe löschen? Dokumente mit Lesepflicht für diese Gruppe gelten danach für alle Benutzer, sofern keine andere Gruppe gewählt ist.')) d.send('POST', '/api/dms/groups', { tenantId: S.tenantId, action: 'delete', id: b.getAttribute('data-gdel') }).then(function () { return d.loadDocs().then(d.renderUsers); }).catch(d.fail); }); });
  };

  function editGroup(g, members) {
    var d = D(), S = d.S;
    d.askForm({
      title: g ? 'Gruppe bearbeiten' : 'Neue Gruppe',
      fields: [
        { name: 'name', label: 'Name der Gruppe', value: g ? g.name : '', required: true, placeholder: 'z.B. Produktion' },
        { name: 'members', label: 'Mitglieder', type: 'checks', options: members.map(function (m) { return { value: m.email, label: m.name + ' (' + m.email + ')' }; }), value: g ? g.members : [] }
      ],
      ok: 'Speichern'
    }).then(function (v) {
      if (!v) return;
      d.send('POST', '/api/dms/groups', { tenantId: S.tenantId, action: 'save', id: g ? g.id : undefined, name: v.name, members: v.members }).then(function () { d.toast('Gruppe gespeichert.'); return d.loadDocs().then(d.renderUsers); }).catch(d.fail);
    });
  }

  // =====================================================================
  //  Suche im Dateiinhalt (pdf.js im Browser liest den Text)
  // =====================================================================

  var pdfjsP = null;
  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (pdfjsP) return pdfjsP;
    pdfjsP = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload = function () { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; res(window.pdfjsLib); };
      s.onerror = function () { pdfjsP = null; rej(new Error('Die PDF-Bibliothek konnte nicht geladen werden.')); };
      document.head.appendChild(s);
    });
    return pdfjsP;
  }
  function extOf(name) { return String(name || '').split('.').pop().toLowerCase(); }
  function canExtract(name) { var e = extOf(name); return e === 'pdf' || e === 'txt'; }
  function extractText(blob, name) {
    var e = extOf(name);
    if (e === 'txt') return blob.text();
    if (e !== 'pdf') return Promise.resolve(null);
    return loadPdfJs().then(function (lib) {
      return blob.arrayBuffer().then(function (buf) { return lib.getDocument({ data: buf }).promise; });
    }).then(function (pdf) {
      var n = Math.min(pdf.numPages, 80), out = [], chain = Promise.resolve();
      for (var i = 1; i <= n; i++) {
        (function (p) { chain = chain.then(function () { return pdf.getPage(p); }).then(function (pg) { return pg.getTextContent(); }).then(function (tc) { out.push(tc.items.map(function (it) { return it.str; }).join(' ')); }); })(i);
      }
      return chain.then(function () { return out.join('\n'); });
    });
  }
  X.extractText = extractText;

  var hitMap = {}, hitQ = '', timer = null;
  X.search = function (q) {
    var d = D();
    q = String(q || '').trim().toLowerCase();
    if (q.length < 3) { hitMap = {}; hitQ = ''; return; }
    clearTimeout(timer);
    timer = setTimeout(function () {
      d.api('/api/dms/search?tenantId=' + encodeURIComponent(d.S.tenantId) + '&q=' + encodeURIComponent(q)).then(function (res) {
        var cur = ($('fq') && $('fq').value || '').trim().toLowerCase();
        if (cur !== q) return;
        hitMap = {}; (res.hits || []).forEach(function (h) { hitMap[h.docId] = h; });
        hitQ = q;
        d.drawRows();
      }).catch(function () { /* Suche im Inhalt ist ein Zusatz */ });
    }, 280);
  };
  X.hits = function (q) { return hitQ === q ? hitMap : {}; };
  X.snippetHtml = function (snippet, q) {
    var out = esc(snippet);
    q.split(/\s+/).filter(Boolean).forEach(function (t) {
      var re = new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
      out = out.replace(re, '<mark>$1</mark>');
    });
    return out;
  };

  X.indexFile = function (docId, version, file) {
    var d = D();
    if (!canExtract(file.name)) return;
    extractText(file, file.name).then(function (text) {
      if (text) return d.send('POST', '/api/dms/index', { docId: docId, version: version, text: text });
    }).catch(function () { /* stilles Zusatzfeature */ });
  };

  // Versionen, die durchsuchbar sein sollten, aber noch nicht im Index sind
  function missingTargets() {
    var d = D(), out = [];
    d.S.docs.forEach(function (doc) {
      var vers = [];
      [doc.releasedVersion, doc.currentVersion].forEach(function (v) { if (v && vers.indexOf(v) < 0) vers.push(v); });
      vers.forEach(function (v) {
        var entry = doc.versions.filter(function (x) { return x.version === v; })[0];
        if (entry && canExtract(entry.filename) && (doc.indexed || []).indexOf(v) < 0) out.push({ doc: doc, version: v, entry: entry });
      });
    });
    return out;
  }
  function searchableCounts() {
    var d = D(), total = 0, done = 0;
    d.S.docs.forEach(function (doc) {
      var vers = [];
      [doc.releasedVersion, doc.currentVersion].forEach(function (v) { if (v && vers.indexOf(v) < 0) vers.push(v); });
      vers.forEach(function (v) { var e = doc.versions.filter(function (x) { return x.version === v; })[0]; if (e && canExtract(e.filename)) { total++; if ((doc.indexed || []).indexOf(v) >= 0) done++; } });
    });
    return { total: total, done: done };
  }

  var indexing = false;
  X.indexAll = function () {
    var d = D();
    if (indexing) return Promise.resolve();
    var todo = missingTargets();
    if (!todo.length) { d.toast('Alle Dateien sind schon durchsuchbar.'); return Promise.resolve(); }
    indexing = true;
    var i = 0, ok = 0;
    function next() {
      if (i >= todo.length) { indexing = false; d.toast(ok + ' von ' + todo.length + ' Dateien durchsuchbar gemacht.'); return d.loadDocs().then(function () { if (d.S.route === 'dokumente') d.renderDocuments(); else if (d.S.route === 'einstellungen') d.renderSettings(); }); }
      var t = todo[i++];
      d.toast('Suchindex: ' + i + ' von ' + todo.length + ' …');
      return fetch('/api/dms/download?docId=' + t.doc.id + '&version=' + t.version + '&inline=1').then(function (r) { if (!r.ok) throw new Error('nicht geladen'); return r.blob(); })
        .then(function (b) { return extractText(b, t.entry.filename); })
        .then(function (text) { if (text) return d.send('POST', '/api/dms/index', { docId: t.doc.id, version: t.version, text: text }).then(function () { ok++; }); })
        .catch(function () { /* naechste Datei */ })
        .then(next);
    }
    return next();
  };

  X.indexBanner = function (host) {
    var d = D();
    if (!host || !d.can('write')) return;
    var c = searchableCounts();
    if (!c.total || c.done >= c.total) return;
    host.innerHTML = '<div class="notice"><b>Suche im Dateiinhalt:</b> ' + c.done + ' von ' + c.total + ' Dateien sind durchsuchbar. <button class="btn sm" id="idxRun" style="margin-left:.5rem">Jetzt aktualisieren</button></div>';
    $('idxRun').addEventListener('click', function () { X.indexAll(); });
  };

  function indexCard() {
    var d = D();
    var c = searchableCounts();
    var card = settingsCard('<h2>Suche im Dateiinhalt</h2><div class="sub">Die Suche findet auch Wörter im Inhalt von PDF- und Textdateien. Neue Dateien werden beim Hochladen automatisch durchsuchbar. Hier kannst du bestehende Dateien nachziehen.</div>' +
      '<div class="row"><span><b>' + c.done + ' von ' + c.total + '</b> Dateien sind durchsuchbar.</span>' + (c.done < c.total && d.can('write') ? '<button class="btn" id="idxRun2">Suchindex aktualisieren</button>' : '') + '</div>' +
      '<div class="hint">Word- und Excel-Dateien lassen sich im Browser nicht auslesen. Dafür sind Titel, Beschreibung und Schlagworte durchsuchbar.</div>');
    var b = card.querySelector('#idxRun2'); if (b) b.addEventListener('click', function () { X.indexAll(); });
  }

  // =====================================================================
  //  Versionsvergleich
  // =====================================================================

  function sentences(t) {
    return String(t || '').replace(/[ \t\r\f]+/g, ' ').split(/\n+/).reduce(function (acc, line) {
      line.trim().split(/(?<=[.!?;:])\s+(?=[A-ZÄÖÜ0-9•\-(«"])/).forEach(function (s) { s = s.trim(); if (s) acc.push(s); });
      return acc;
    }, []);
  }
  // LCS-Diff ueber Arrays von Strings
  function lcsDiff(a, b) {
    var n = a.length, m = b.length;
    if (n * m > 6000000) return null;
    var dp = new Array(n + 1);
    for (var i = 0; i <= n; i++) dp[i] = new Uint16Array(m + 1);
    for (i = n - 1; i >= 0; i--) for (var j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    var ops = []; i = 0; var jj = 0;
    while (i < n && jj < m) {
      if (a[i] === b[jj]) { ops.push({ t: 'eq', a: a[i] }); i++; jj++; }
      else if (dp[i + 1][jj] >= dp[i][jj + 1]) { ops.push({ t: 'del', a: a[i++] }); }
      else { ops.push({ t: 'add', b: b[jj++] }); }
    }
    while (i < n) ops.push({ t: 'del', a: a[i++] });
    while (jj < m) ops.push({ t: 'add', b: b[jj++] });
    return ops;
  }
  function wordDiffHtml(a, b) {
    var ta = a.split(/(\s+)/), tb = b.split(/(\s+)/);
    var ops = lcsDiff(ta, tb);
    if (!ops) return { l: esc(a), r: esc(b) };
    var l = '', r = '';
    ops.forEach(function (o) {
      if (o.t === 'eq') { l += esc(o.a); r += esc(o.a); }
      else if (o.t === 'del') l += '<del>' + esc(o.a) + '</del>';
      else r += '<ins>' + esc(o.b) + '</ins>';
    });
    return { l: l, r: r };
  }
  // Ergebnis: {html, added, removed, changed}
  function diffText(textA, textB) {
    var a = sentences(textA), b = sentences(textB);
    var ops = lcsDiff(a, b);
    if (!ops) return { html: '<div class="notice warn">Die Dokumente sind für einen Textvergleich zu umfangreich.</div>', added: 0, removed: 0, changed: 0 };
    var out = [], added = 0, removed = 0, changed = 0, i = 0;
    while (i < ops.length) {
      if (ops[i].t === 'eq') { var j = i; while (j < ops.length && ops[j].t === 'eq') j++; out.push({ t: 'eq', lines: ops.slice(i, j).map(function (o) { return o.a; }) }); i = j; continue; }
      var dels = [], adds = [];
      while (i < ops.length && ops[i].t !== 'eq') { if (ops[i].t === 'del') dels.push(ops[i].a); else adds.push(ops[i].b); i++; }
      var pairs = Math.min(dels.length, adds.length);
      for (var p = 0; p < pairs; p++) { changed++; out.push({ t: 'mod', a: dels[p], b: adds[p] }); }
      for (var q = pairs; q < dels.length; q++) { removed++; out.push({ t: 'del', a: dels[q] }); }
      for (var r = pairs; r < adds.length; r++) { added++; out.push({ t: 'add', b: adds[r] }); }
    }
    var html = '';
    out.forEach(function (o, k) {
      if (o.t === 'eq') {
        var n = o.lines.length;
        if (n <= 2) html += o.lines.map(function (l) { return '<div class="df eq">' + esc(l) + '</div>'; }).join('');
        else {
          var first = k > 0 ? '<div class="df eq">' + esc(o.lines[0]) + '</div>' : '';
          var last = k < out.length - 1 ? '<div class="df eq">' + esc(o.lines[n - 1]) + '</div>' : '';
          html += first + '<div class="df skip">' + (n - (first ? 1 : 0) - (last ? 1 : 0)) + ' unveränderte Abschnitte</div>' + last;
        }
      } else if (o.t === 'del') html += '<div class="df del"><span class="df-m">−</span><del>' + esc(o.a) + '</del></div>';
      else if (o.t === 'add') html += '<div class="df add"><span class="df-m">+</span><ins>' + esc(o.b) + '</ins></div>';
      else { var w = wordDiffHtml(o.a, o.b); html += '<div class="df mod"><span class="df-m">±</span><div>' + w.l + '</div></div><div class="df mod2"><span class="df-m"></span><div>' + w.r + '</div></div>'; }
    });
    return { html: html || '', added: added, removed: removed, changed: changed };
  }
  X.diffText = diffText;
  function summary(r) {
    if (!r.added && !r.removed && !r.changed) return '<div class="notice ok">Im Text gibt es keinen Unterschied.</div>';
    return '<div class="notice"><b>' + (r.added + r.removed + r.changed) + ' Änderungen:</b> ' + r.added + ' neu, ' + r.removed + ' entfernt, ' + r.changed + ' geändert.</div>';
  }

  function blobFor(doc, version) {
    return fetch('/api/dms/download?docId=' + doc.id + '&version=' + version + '&inline=1').then(function (r) {
      if (!r.ok) return r.json().catch(function () { return {}; }).then(function (e) { throw new Error(e.error || ('Fehler ' + r.status)); });
      return r.blob();
    });
  }
  function previewNode(blob, filename) {
    var e = extOf(filename), u = URL.createObjectURL(blob);
    if (e === 'pdf' || e === 'txt') return '<iframe src="' + u + '" title="' + esc(filename) + '"></iframe>';
    if (['png', 'jpg', 'jpeg', 'gif'].indexOf(e) >= 0) return '<img src="' + u + '" alt="' + esc(filename) + '">';
    return '<div class="preview-none"><b>Keine Vorschau für diesen Dateityp</b></div>';
  }

  X.compareVersions = function (doc) {
    var d = D();
    var vs = doc.versions.map(function (v) { return v.version; });
    var b = doc.currentVersion, a = doc.releasedVersion && doc.releasedVersion !== b ? doc.releasedVersion : (vs.length > 1 ? vs[vs.length - 2] : vs[0]);
    var bg = el('div', 'modal-bg');
    var opt = function (sel) { return vs.slice().reverse().map(function (v) { var e = doc.versions.filter(function (x) { return x.version === v; })[0]; return '<option value="' + v + '"' + (v === sel ? ' selected' : '') + '>v' + v + (v === doc.releasedVersion ? ' (gültig)' : v === doc.currentVersion ? ' (aktuell)' : '') + ' · ' + esc(e.filename) + '</option>'; }).join(''); };
    bg.innerHTML = '<div class="modal xwide"><h3>Versionen vergleichen · ' + esc(doc.docNumber) + '</h3><div class="m-body"><div class="cmp-head"><label class="lbl">Ältere Version<select id="cmpA">' + opt(a) + '</select></label><span class="cmp-arrow">→</span><label class="lbl">Neuere Version<select id="cmpB">' + opt(b) + '</select></label>' +
      '<div class="views" style="margin:0 0 0 auto"><button class="view-tab on" data-mode="diff">Änderungen</button><button class="view-tab" data-mode="side">Nebeneinander</button></div></div><div id="cmpBody" class="cmp-body"><div class="preview-load">Lade …</div></div></div><div class="m-foot"><button class="btn primary" data-m="ok">Schliessen</button></div></div>';
    document.body.appendChild(bg);
    var mode = 'diff';
    var cache = {};
    function get(v) { if (!cache[v]) cache[v] = blobFor(doc, v); return cache[v]; }
    function fileOf(v) { return doc.versions.filter(function (x) { return x.version === v; })[0]; }
    function render() {
      var va = Number($('cmpA').value), vb = Number($('cmpB').value), body = $('cmpBody');
      if (va === vb) { body.innerHTML = '<div class="notice warn">Bitte zwei verschiedene Versionen wählen.</div>'; return; }
      body.innerHTML = '<div class="preview-load">Lade …</div>';
      Promise.all([get(va), get(vb)]).then(function (bl) {
        if (mode === 'side') {
          body.innerHTML = '<div class="cmp-side"><div><div class="cmp-cap">v' + va + ' · ' + esc(fileOf(va).filename) + '</div><div class="cmp-pane">' + previewNode(bl[0], fileOf(va).filename) + '</div></div><div><div class="cmp-cap">v' + vb + ' · ' + esc(fileOf(vb).filename) + '</div><div class="cmp-pane">' + previewNode(bl[1], fileOf(vb).filename) + '</div></div></div>';
          return;
        }
        if (!canExtract(fileOf(va).filename) || !canExtract(fileOf(vb).filename)) { body.innerHTML = '<div class="notice warn">Für diesen Dateityp ist kein Textvergleich möglich (nur PDF und Text). Nutze die Ansicht «Nebeneinander» oder lade die Dateien herunter.</div>'; return; }
        return Promise.all([extractText(bl[0], fileOf(va).filename), extractText(bl[1], fileOf(vb).filename)]).then(function (tx) {
          var r = diffText(tx[0] || '', tx[1] || '');
          body.innerHTML = summary(r) + '<div class="dfs">' + r.html + '</div>';
        });
      }).catch(function (e) { body.innerHTML = '<div class="notice err">' + esc(e.message) + '</div>'; });
    }
    $('cmpA').addEventListener('change', render); $('cmpB').addEventListener('change', render);
    bg.querySelectorAll('[data-mode]').forEach(function (btn) { btn.addEventListener('click', function () { mode = btn.getAttribute('data-mode'); bg.querySelectorAll('[data-mode]').forEach(function (x) { x.classList.toggle('on', x === btn); }); render(); }); });
    bg.addEventListener('mousedown', function (e) { if (e.target === bg) bg.remove(); });
    bg.querySelector('[data-m=ok]').addEventListener('click', function () { bg.remove(); });
    render();
  };

  // Handbuch: Aenderungen zwischen einer Version und der davor
  function htmlToText(html) {
    var s = String(html || '').replace(/<\/(p|li|h[1-6]|tr|div|blockquote)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<\/t[dh]>/gi, ' ');
    return new DOMParser().parseFromString(s, 'text/html').body.textContent || '';
  }
  X.handbookDiff = function (version, revisions) {
    var d = D(), S = d.S;
    var prev = (revisions || []).filter(function (r) { return r.version < version && !r.legacy; }).map(function (r) { return r.version; }).sort(function (a, b) { return b - a; })[0];
    if (!prev) { d.toast('Zu dieser Version gibt es keine ältere Fassung zum Vergleich.'); return; }
    var get = function (v) { return d.api('/api/dms/handbook/revision?tenantId=' + encodeURIComponent(S.tenantId) + '&version=' + v).then(function (r) { return r.revision; }); };
    Promise.all([get(prev), get(version)]).then(function (rv) {
      var A = rv[0], B = rv[1], html = '', changedChapters = 0;
      var byA = {}; A.chapters.forEach(function (c) { byA[c.id] = c; });
      var seen = {};
      B.chapters.forEach(function (c, i) {
        seen[c.id] = 1;
        var o = byA[c.id];
        if (!o) { changedChapters++; html += '<h4>' + (i + 1) + '. ' + esc(c.title) + ' <span class="chip freigegeben">neues Kapitel</span></h4><div class="dfs">' + sentences(htmlToText(c.html)).map(function (l) { return '<div class="df add"><span class="df-m">+</span><ins>' + esc(l) + '</ins></div>'; }).join('') + '</div>'; return; }
        var ta = htmlToText(o.html), tb = htmlToText(c.html);
        var titleChanged = o.title !== c.title;
        if (ta.trim() === tb.trim() && !titleChanged) return;
        changedChapters++;
        var r = diffText(ta, tb);
        html += '<h4>' + (i + 1) + '. ' + esc(c.title) + (titleChanged ? ' <span class="chip">umbenannt, vorher «' + esc(o.title) + '»</span>' : '') + '</h4>' + (r.html ? '<div class="dfs">' + r.html + '</div>' : '');
      });
      A.chapters.forEach(function (c) { if (!seen[c.id]) { changedChapters++; html += '<h4>' + esc(c.title) + ' <span class="chip overdue">Kapitel entfernt</span></h4>'; } });
      var bg = el('div', 'modal-bg');
      bg.innerHTML = '<div class="modal xwide"><h3>Änderungen: Version ' + prev + ' → ' + version + '</h3><div class="m-sub">' + esc(B.note || '') + '</div><div class="m-body">' + (changedChapters ? '<div class="notice"><b>' + changedChapters + ' Kapitel geändert.</b></div>' + html : '<div class="notice ok">Der Text ist gleich geblieben.</div>') + '</div><div class="m-foot"><button class="btn primary" data-m="ok">Schliessen</button></div></div>';
      document.body.appendChild(bg);
      bg.addEventListener('mousedown', function (e) { if (e.target === bg) bg.remove(); });
      bg.querySelector('[data-m=ok]').addEventListener('click', function () { bg.remove(); });
    }).catch(d.fail);
  };
})();
