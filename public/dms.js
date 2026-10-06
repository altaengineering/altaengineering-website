/* Dokumentenlenkung: Oberflaeche (Dokumente, Handbuch, Benutzer, Einstellungen, Kunden). */
(function () {
  'use strict';

  var STATUS_LABEL = { entwurf: 'Entwurf', in_pruefung: 'In Prüfung', geprueft: 'Geprüft', freigegeben: 'Freigegeben', archiviert: 'Archiviert' };
  var ROLE_LABEL = { admin: 'Administrator', freigeber: 'Freigeber', pruefer: 'Prüfer', ersteller: 'Ersteller', leser: 'Leser' };
  var ROLE_TEXT = {
    admin: 'Verwaltet Benutzer, Kategorien und Einstellungen. Darf alles.',
    freigeber: 'Erstellt, prüft und gibt frei. Veröffentlicht das Handbuch.',
    pruefer: 'Erstellt und prüft Dokumente. Freigeben nicht.',
    ersteller: 'Legt Dokumente an, bearbeitet und reicht ein.',
    leser: 'Liest freigegebene Dokumente und bestätigt «gelesen».'
  };
  var CAN = {
    write: ['admin', 'freigeber', 'pruefer', 'ersteller'],
    review: ['admin', 'freigeber', 'pruefer'],
    approve: ['admin', 'freigeber'],
    publish: ['admin', 'freigeber'],
    manage: ['admin']
  };
  var VIEWS = [
    { id: 'alle', label: 'Alle' },
    { id: 'aufgaben', label: 'Meine Aufgaben' },
    { id: 'pruefung', label: 'In Prüfung' },
    { id: 'faellig', label: 'Überprüfung fällig' },
    { id: 'archiv', label: 'Archiv' }
  ];

  var S = {
    email: '', me: '', platform: false, tenants: [], tenantId: null, tenant: null, role: null,
    docs: [], docsLoaded: false, view: 'alle', openDocId: null, drawerTab: 'uebersicht',
    hb: null, hbDraft: true, hbEditing: null, route: 'dokumente', previewVersion: null
  };

  // ---------- Helfer ----------

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(id) { return document.getElementById(id); }
  function can(what) { return CAN[what].indexOf(S.role) >= 0; }
  function todayIso() { return new Date().toISOString().slice(0, 10); }
  function fmtDateTime(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + d.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
  }
  function fmtDay(iso) {
    if (!iso) return '–';
    var p = String(iso).slice(0, 10).split('-');
    return p[2] + '.' + p[1] + '.' + p[0];
  }
  function daysUntil(iso) {
    if (!iso) return null;
    return Math.round((new Date(String(iso).slice(0, 10) + 'T00:00:00Z') - new Date(todayIso() + 'T00:00:00Z')) / 86400000);
  }
  function formatSize(b) {
    if (!b) return '0 B';
    var u = ['B', 'KB', 'MB', 'GB'], i = 0;
    while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
    return b.toFixed(i === 0 ? 0 : 1) + ' ' + u[i];
  }
  function api(path, opts) {
    return fetch(path, opts).then(function (r) {
      if (!r.ok) return r.json().catch(function () { return {}; }).then(function (e) { var er = new Error(e.error || ('Fehler ' + r.status)); er.data = e; er.status = r.status; throw er; });
      return r.json();
    });
  }
  function send(method, path, body) {
    return api(path, { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }
  function nameFromMail(mail) {
    if (!mail) return '–';
    var m = memberOf(mail);
    if (m && m.name) return m.name;
    return String(mail).split('@')[0].split(/[._-]/).filter(Boolean).map(function (p) { var u = p.charAt(0).toUpperCase() + p.slice(1); return p.length === 1 ? u + '.' : u; }).join(' ');
  }
  function memberOf(mail) {
    var l = String(mail || '').toLowerCase();
    return S.tenant && S.tenant.members ? S.tenant.members.filter(function (m) { return m.email === l; })[0] : null;
  }
  function initials(name) {
    var p = String(name || '?').trim().split(/\s+/);
    return ((p[0] || '?').charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase();
  }
  function who(mail) { return mail ? '<span title="' + esc(mail) + '">' + esc(nameFromMail(mail)) + '</span>' : '–'; }
  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 4200);
  }
  function fail(e) { alert(e && e.message ? e.message : String(e)); }
  function findDoc(id) { return S.docs.filter(function (d) { return d.id === id; })[0]; }
  function uploaderOf(doc) { var v = doc.versions[doc.versions.length - 1]; return ((v && v.uploadedBy) || doc.createdBy || '').toLowerCase(); }
  function vier() { return !!(S.tenant && S.tenant.vierAugen); }
  function roleChip(r) { return '<span class="chip role-' + r + '">' + esc(ROLE_LABEL[r] || r) + '</span>'; }

  // ---------- Dialoge ----------

  function askForm(opts) {
    return new Promise(function (resolve) {
      var bg = document.createElement('div');
      bg.className = 'modal-bg';
      var html = '<div class="modal' + (opts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true"><h3>' + esc(opts.title) + '</h3>' + (opts.sub ? '<div class="m-sub">' + opts.sub + '</div>' : '') + '<div class="m-body">';
      opts.fields.forEach(function (f) {
        var id = 'mf_' + f.name;
        if (f.type === 'checkbox') {
          html += '<label class="check"><input type="checkbox" id="' + id + '"' + (f.value ? ' checked' : '') + '><span>' + esc(f.label) + (f.hint ? '<span class="hint" style="display:block">' + esc(f.hint) + '</span>' : '') + '</span></label>';
          return;
        }
        if (f.type === 'checks') {
          html += '<div class="field"><label class="lbl">' + esc(f.label) + '</label><div class="checks">' + f.options.map(function (o) { return '<label class="check"><input type="checkbox" data-ck="' + esc(f.name) + '" value="' + esc(o.value) + '"' + ((f.value || []).indexOf(o.value) >= 0 ? ' checked' : '') + '><span>' + esc(o.label) + '</span></label>'; }).join('') + '</div>' + (f.hint ? '<div class="hint">' + esc(f.hint) + '</div>' : '') + '</div>';
          return;
        }
        html += '<div class="field"><label class="lbl" for="' + id + '">' + esc(f.label) + '</label>';
        if (f.type === 'textarea') html += '<textarea id="' + id + '" placeholder="' + esc(f.placeholder || '') + '" rows="' + (f.rows || 3) + '">' + esc(f.value || '') + '</textarea>';
        else if (f.type === 'select') html += '<select id="' + id + '">' + f.options.map(function (o) { var ov = typeof o === 'string' ? o : o.value, ol = typeof o === 'string' ? o : o.label; return '<option value="' + esc(ov) + '"' + (ov === f.value ? ' selected' : '') + '>' + esc(ol) + '</option>'; }).join('') + '</select>';
        else if (f.type === 'file') html += '<input type="file" id="' + id + '">';
        else html += '<input type="' + (f.type || 'text') + '" id="' + id + '" value="' + esc(f.value == null ? '' : f.value) + '" placeholder="' + esc(f.placeholder || '') + '"' + (f.type === 'number' ? ' min="0"' : '') + '>';
        if (f.hint) html += '<div class="hint">' + esc(f.hint) + '</div>';
        html += '</div>';
      });
      html += '</div><div class="m-foot"><button class="btn" data-m="cancel">Abbrechen</button><button class="btn primary" data-m="ok">' + esc(opts.ok || 'OK') + '</button></div></div>';
      bg.innerHTML = html;
      document.body.appendChild(bg);
      var first = bg.querySelector('input:not([type=checkbox]),textarea,select');
      if (first) setTimeout(function () { first.focus(); }, 30);
      function close(val) { bg.remove(); resolve(val); }
      bg.addEventListener('mousedown', function (e) { if (e.target === bg) close(null); });
      bg.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(null); });
      bg.querySelector('[data-m=cancel]').addEventListener('click', function () { close(null); });
      bg.querySelector('[data-m=ok]').addEventListener('click', function () {
        var out = {};
        for (var i = 0; i < opts.fields.length; i++) {
          var f = opts.fields[i], el = bg.querySelector('#mf_' + f.name);
          if (f.type === 'checks') { out[f.name] = Array.prototype.slice.call(bg.querySelectorAll('[data-ck="' + f.name + '"]:checked')).map(function (e) { return e.value; }); continue; }
          if (f.type === 'checkbox') out[f.name] = el.checked;
          else if (f.type === 'file') out[f.name] = el.files[0] || null;
          else out[f.name] = el.value.trim();
          if (f.required && !out[f.name]) { alert('Bitte ausfüllen: ' + f.label); el.focus(); return; }
        }
        close(out);
      });
    });
  }

  function infoDialog(title, bodyHtml, okLabel) {
    return new Promise(function (resolve) {
      var bg = document.createElement('div');
      bg.className = 'modal-bg';
      bg.innerHTML = '<div class="modal" role="dialog"><h3>' + esc(title) + '</h3><div class="m-body">' + bodyHtml + '</div><div class="m-foot"><button class="btn primary" data-m="ok">' + esc(okLabel || 'OK') + '</button></div></div>';
      document.body.appendChild(bg);
      function close() { bg.remove(); resolve(); }
      bg.addEventListener('mousedown', function (e) { if (e.target === bg) close(); });
      bg.querySelector('[data-m=ok]').addEventListener('click', close);
    });
  }

  // ---------- Start ----------

  function boot() {
    api('/api/me').then(function (me) {
      S.email = me.email;
      S.me = String(me.email || '').toLowerCase();
      S.platform = !!me.isAdmin;
      S.tenants = me.dmsTenants || [];
      var name = nameFromMail(S.email);
      $('meAv').textContent = initials(name);
      $('meName').textContent = name;
      $('mePill').hidden = false;
      $('portalLink').hidden = !(S.platform || me.isMitarbeiter);
      var saved = null;
      try { saved = localStorage.getItem('dmsTenantId'); } catch (e) { /* egal */ }
      var pick = S.tenants.filter(function (t) { return t.id === saved; })[0] || S.tenants[0];
      S.tenantId = pick ? pick.id : null;
      populateSwitcher();
      window.addEventListener('hashchange', route);
      if (!S.tenantId) { S.role = S.platform ? 'admin' : null; renderNav(); route(); return; }
      return loadDocs().then(route);
    }).catch(function (e) {
      $('page').innerHTML = '<div class="notice err">Fehler beim Laden: ' + esc(e.message) + '</div>';
    });
  }

  function populateSwitcher() {
    var sel = $('tenantSwitcher');
    sel.hidden = S.tenants.length < 2;
    sel.innerHTML = S.tenants.map(function (t) { return '<option value="' + esc(t.id) + '"' + (t.id === S.tenantId ? ' selected' : '') + '>' + esc(t.name) + '</option>'; }).join('');
  }

  function switchTenant(id) {
    S.tenantId = id;
    try { localStorage.setItem('dmsTenantId', id); } catch (e) { /* egal */ }
    S.docsLoaded = false; S.hb = null; S.hbEditing = null; S.view = 'alle';
    closeDrawer();
    loadDocs().then(route);
  }

  function loadDocs() {
    if (!S.tenantId) return Promise.resolve();
    return api('/api/dms/documents?tenantId=' + encodeURIComponent(S.tenantId)).then(function (res) {
      S.docs = res.documents;
      S.tenant = res.tenant;
      S.role = res.role;
      S.docsLoaded = true;
      var t = S.tenants.filter(function (x) { return x.id === S.tenantId; })[0];
      if (t) { t.name = res.tenant.name; t.role = res.role; }
      $('brandTenant').textContent = res.tenant.name;
      populateSwitcher();
      renderNav();
    });
  }

  // ---------- Navigation ----------

  function navItems() {
    var items = [];
    if (S.tenantId) {
      items.push(['uebersicht', 'Übersicht', 0]);
      items.push(['dokumente', 'Dokumente', countTasks()]);
      items.push(['handbuch', 'QM-Handbuch', 0]);
      if (can('manage')) { items.push(['benutzer', 'Benutzer', 0]); items.push(['einstellungen', 'Einstellungen', 0]); }
    }
    if (S.platform) items.push(['kunden', 'Kunden', 0]);
    return items;
  }
  function renderNav() {
    $('nav').innerHTML = navItems().map(function (i) {
      return '<a href="#/' + i[0] + '" data-r="' + i[0] + '" class="' + (S.route === i[0] ? 'on' : '') + '">' + i[1] + (i[2] ? ' <span class="n">' + i[2] + '</span>' : '') + '</a>';
    }).join('');
  }
  function route() {
    var r = (location.hash || '').replace(/^#\/?/, '').split('/')[0] || 'uebersicht';
    var allowed = navItems().map(function (i) { return i[0]; });
    if (allowed.indexOf(r) < 0) r = allowed[0] || 'uebersicht';
    S.route = r;
    renderNav();
    closeDrawer();
    window.scrollTo(0, 0);
    if (!S.tenantId && r !== 'kunden') { renderNoAccess(); return; }
    if (r === 'uebersicht') window.DMSX.renderDashboard();
    else if (r === 'dokumente') renderDocuments();
    else if (r === 'handbuch') renderHandbook();
    else if (r === 'benutzer') renderUsers();
    else if (r === 'einstellungen') renderSettings();
    else if (r === 'kunden') renderCustomers();
  }

  function renderNoAccess() {
    $('page').innerHTML = '<div class="card"><div class="empty"><b>Noch kein Zugang</b>Du bist bei keinem Kunden als Benutzer eingetragen. Bitte wende dich an die Administratorin oder den Administrator deiner Firma, damit sie dich einladen.</div></div>';
  }

  // =====================================================================
  //  DOKUMENTE
  // =====================================================================

  // Wer muss ein Dokument mit Lesepflicht lesen? Die Mitglieder der gewaehlten Gruppen, sonst alle.
  function requiredReaders(doc) {
    var ids = doc.readGroups || [];
    var out = {};
    if (ids.length) {
      ((S.tenant && S.tenant.groups) || []).forEach(function (g) { if (ids.indexOf(g.id) >= 0) (g.members || []).forEach(function (m) { out[m] = 1; }); });
      return Object.keys(out);
    }
    return ((S.tenant && S.tenant.members) || []).map(function (m) { return m.email; });
  }
  function readersLabel(doc) {
    var ids = doc.readGroups || [];
    if (!ids.length) return 'alle Benutzer';
    return ids.map(function (id) { var g = ((S.tenant && S.tenant.groups) || []).filter(function (x) { return x.id === id; })[0]; return g ? g.name : '?'; }).join(', ');
  }
  function taskFor(doc) {
    var me = S.me;
    if (doc.status === 'archiviert') return null;
    var up = uploaderOf(doc);
    var selfBlock = vier() && up === me;
    if (doc.status === 'in_pruefung' && can('review') && (can('manage') || !doc.reviewer || doc.reviewer === me) && !selfBlock) return 'Prüfung offen';
    if (doc.status === 'geprueft' && can('approve') && (can('manage') || !doc.approver || doc.approver === me) && !selfBlock) return 'Freigabe offen';
    if (doc.releasedVersion && doc.owner === me) {
      var d = daysUntil(doc.nextReview);
      if (d !== null && d <= 30) return d < 0 ? 'Überprüfung überfällig' : 'Überprüfung bald fällig';
    }
    if (doc.readRequired && doc.releasedVersion && requiredReaders(doc).indexOf(me) >= 0) {
      var r = doc.reads && doc.reads[me];
      if (!r || r.version !== doc.releasedVersion) return 'Lesebestätigung offen';
    }
    if (doc.lock && doc.lock.by.toLowerCase() === me) return 'Von dir ausgecheckt';
    return null;
  }
  function countTasks() { return S.docs.filter(function (d) { return taskFor(d); }).length; }
  function reviewState(doc) {
    if (!doc.releasedVersion || !doc.nextReview || doc.status === 'archiviert') return null;
    var d = daysUntil(doc.nextReview);
    return d < 0 ? 'overdue' : (d <= 30 ? 'due' : 'ok');
  }
  function inView(d, view) {
    if (view === 'archiv') return d.status === 'archiviert';
    if (d.status === 'archiviert') return false;
    if (view === 'aufgaben') return !!taskFor(d);
    if (view === 'pruefung') return d.status === 'in_pruefung' || d.status === 'geprueft';
    if (view === 'faellig') { var s = reviewState(d); return s === 'due' || s === 'overdue'; }
    return true;
  }
  function statusChip(doc) {
    var h = '<span class="chip ' + doc.status + '">' + STATUS_LABEL[doc.status] + '</span>';
    if (doc.releasedVersion && doc.status !== 'freigegeben' && doc.status !== 'archiviert') h += '<span class="sub-status">gültig: v' + doc.releasedVersion + '</span>';
    return h;
  }
  function reviewCell(doc) {
    var s = reviewState(doc);
    if (!s) return '<span class="muted">–</span>';
    var d = daysUntil(doc.nextReview);
    if (s === 'overdue') return '<span class="chip overdue">überfällig seit ' + fmtDay(doc.nextReview) + '</span>';
    if (s === 'due') return '<span class="chip due">in ' + d + ' Tg · ' + fmtDay(doc.nextReview) + '</span>';
    return '<span class="mono muted">' + fmtDay(doc.nextReview) + '</span>';
  }

  var filt = { q: '', cat: '', status: '', owner: '', group: '' };

  function renderDocuments() {
    var active = S.docs.filter(function (d) { return d.status !== 'archiviert'; });
    var kpis = [
      { id: 'alle', n: active.length, l: 'Dokumente', cls: '' },
      { id: 'x1', n: active.filter(function (d) { return d.status === 'freigegeben'; }).length, l: 'Freigegeben', cls: 'pos', plain: true },
      { id: 'pruefung', n: S.docs.filter(function (d) { return inView(d, 'pruefung'); }).length, l: 'In Prüfung / Freigabe', cls: '' },
      { id: 'x2', n: active.filter(function (d) { return d.status === 'entwurf'; }).length, l: 'Entwürfe', cls: '', plain: true },
      { id: 'faellig', n: S.docs.filter(function (d) { return inView(d, 'faellig'); }).length, l: 'Überprüfung fällig', cls: 'warn' },
      { id: 'aufgaben', n: countTasks(), l: 'Meine Aufgaben', cls: countTasks() ? 'neg' : '' }
    ];
    var h = '<div class="page-head"><div><h1>Dokumente</h1><p>Alle gelenkten Dokumente von ' + esc(S.tenant.name) + ': Prüfung, Freigabe, Versionen und Wiedervorlage an einem Ort.</p></div>' +
      '<div class="row"><a class="btn" href="/api/dms/audit-report?tenantId=' + encodeURIComponent(S.tenantId) + '" title="PDF für Auditorinnen und Auditoren">📄 Auditbericht</a><a class="btn" href="/api/dms/export?tenantId=' + encodeURIComponent(S.tenantId) + '">⬇ Liste (CSV)</a>' +
      (can('write') ? '<button class="btn primary" id="newDocBtn">＋ Neues Dokument</button>' : '') + '</div></div>';
    h += '<div id="idxBanner"></div>';
    h += '<div class="kpis" id="kpis">' + kpis.map(function (k) {
      return '<button class="kpi ' + (k.cls || '') + (k.plain ? '' : ' click') + (S.view === k.id ? ' on' : '') + '"' + (k.plain ? '' : ' data-view="' + k.id + '"') + '><div class="l">' + k.l + '</div><div class="v">' + k.n + '</div></button>';
    }).join('') + '</div>';
    h += '<div class="card flush"><div style="padding:1rem 1.2rem .2rem"><div class="views" id="views"></div>' +
      '<div class="toolbar"><div class="grow"><input type="search" id="fq" placeholder="Suchen nach Nummer, Titel, Schlagwort, Verantwortlichen …" value="' + esc(filt.q) + '"></div>' +
      '<select id="fcat"></select><select id="fstatus"><option value="">Alle Status</option>' + ['entwurf', 'in_pruefung', 'geprueft', 'freigegeben'].map(function (s) { return '<option value="' + s + '"' + (filt.status === s ? ' selected' : '') + '>' + STATUS_LABEL[s] + '</option>'; }).join('') + '</select>' +
      '<select id="fowner"></select><select id="fgroup"><option value="">Keine Gruppierung</option><option value="category"' + (filt.group === 'category' ? ' selected' : '') + '>Nach Kategorie</option><option value="status"' + (filt.group === 'status' ? ' selected' : '') + '>Nach Status</option></select></div></div>' +
      '<div class="tbl-wrap"><table><thead><tr><th>Nr.</th><th>Titel</th><th>Status</th><th>Version</th><th>Verantwortlich</th><th>Überprüfung</th></tr></thead><tbody id="docRows"></tbody></table><div class="empty" id="docEmpty" hidden></div></div></div>';
    $('page').innerHTML = h;
    if (window.DMSX) window.DMSX.indexBanner($('idxBanner'));

    var nd = $('newDocBtn'); if (nd) nd.addEventListener('click', newDoc);
    $('kpis').querySelectorAll('[data-view]').forEach(function (b) { b.addEventListener('click', function () { S.view = b.getAttribute('data-view'); renderDocuments(); }); });
    $('views').innerHTML = VIEWS.map(function (v) {
      return '<button class="view-tab' + (S.view === v.id ? ' on' : '') + '" data-view="' + v.id + '">' + v.label + '<span class="cnt">' + S.docs.filter(function (d) { return inView(d, v.id); }).length + '</span></button>';
    }).join('');
    $('views').querySelectorAll('[data-view]').forEach(function (b) { b.addEventListener('click', function () { S.view = b.getAttribute('data-view'); renderDocuments(); }); });
    $('fcat').innerHTML = '<option value="">Alle Kategorien</option>' + S.tenant.categories.map(function (c) { return '<option value="' + esc(c) + '"' + (filt.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('');
    var owners = Array.from(new Set(S.docs.map(function (d) { return d.owner; }).filter(Boolean))).sort();
    $('fowner').innerHTML = '<option value="">Alle Verantwortlichen</option>' + owners.map(function (o) { return '<option value="' + esc(o) + '"' + (filt.owner === o ? ' selected' : '') + '>' + esc(nameFromMail(o)) + '</option>'; }).join('');
    $('fq').addEventListener('input', function () { filt.q = this.value; drawRows(); if (window.DMSX) window.DMSX.search(filt.q); });
    [['fcat', 'cat'], ['fstatus', 'status'], ['fowner', 'owner'], ['fgroup', 'group']].forEach(function (p) { $(p[0]).addEventListener('change', function () { filt[p[1]] = this.value; drawRows(); }); });
    drawRows();
  }

  function drawRows() {
    var rows = $('docRows'), empty = $('docEmpty');
    if (!rows) return;
    rows.innerHTML = '';
    var q = filt.q.trim().toLowerCase();
    var hits = (window.DMSX && q.length >= 3) ? window.DMSX.hits(q) : {};
    var list = S.docs.filter(function (d) {
      if (!inView(d, S.view)) return false;
      if (filt.cat && d.category !== filt.cat) return false;
      if (filt.status && d.status !== filt.status) return false;
      if (filt.owner && d.owner !== filt.owner) return false;
      if (q) {
        var hay = [d.docNumber, d.title, d.description, nameFromMail(d.owner), d.owner, d.category, (d.tags || []).join(' ')].join(' ').toLowerCase();
        var parts = q.split(/\s+/);
        var metaOk = true;
        for (var i = 0; i < parts.length; i++) if (hay.indexOf(parts[i]) < 0) metaOk = false;
        if (!metaOk && !hits[d.id]) return false;
      }
      return true;
    });
    var order = Object.keys(STATUS_LABEL);
    list.sort(function (a, b) {
      if (filt.group === 'category' && a.category !== b.category) return a.category.localeCompare(b.category, 'de');
      if (filt.group === 'status' && a.status !== b.status) return order.indexOf(a.status) - order.indexOf(b.status);
      return String(a.docNumber).localeCompare(String(b.docNumber), 'de');
    });
    if (!list.length) {
      empty.hidden = false;
      empty.innerHTML = S.docs.length ? '<b>Hier ist nichts</b>In dieser Ansicht gibt es keine Dokumente, oder die Suche passt auf keines.' : '<b>Noch keine Dokumente</b>' + (can('write') ? 'Mit «Neues Dokument» legst du das erste an.' : 'Sobald Dokumente angelegt sind, erscheinen sie hier.');
      return;
    }
    empty.hidden = true;
    var last = null;
    list.forEach(function (doc) {
      if (filt.group) {
        var g = filt.group === 'category' ? doc.category : STATUS_LABEL[doc.status];
        if (g !== last) { var gr = document.createElement('tr'); gr.className = 'group'; gr.innerHTML = '<td colspan="6">' + esc(g) + '</td>'; rows.appendChild(gr); last = g; }
      }
      var task = taskFor(doc);
      var tr = document.createElement('tr');
      tr.className = 'click' + (doc.status === 'archiviert' ? ' dim' : '');
      tr.innerHTML = '<td class="docnr">' + esc(doc.docNumber) + '</td>' +
        '<td><div class="t-main">' + esc(doc.title) + '</div><div class="t-sub">' + esc(doc.category) + (doc.lock ? ' · 🔒 ' + esc(nameFromMail(doc.lock.by)) : '') + '</div>' +
        (hits[doc.id] ? '<div class="snip">📄 Treffer im Dateiinhalt (v' + hits[doc.id].version + '): ' + window.DMSX.snippetHtml(hits[doc.id].snippet, q) + '</div>' : '') +
        ((doc.tags && doc.tags.length) ? '<div class="tags">' + doc.tags.map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('') + '</div>' : '') +
        (task ? '<div class="tags"><span class="chip task">' + esc(task) + '</span></div>' : '') + '</td>' +
        '<td>' + statusChip(doc) + '</td><td class="mono muted">' + (doc.currentVersion ? 'v' + doc.currentVersion : '–') + '</td><td>' + who(doc.owner) + '</td><td>' + reviewCell(doc) + '</td>';
      tr.addEventListener('click', function () { openDrawer(doc.id); });
      rows.appendChild(tr);
    });
  }

  // ----- Detail-Panel -----

  function openDrawer(id) {
    S.openDocId = id; S.drawerTab = 'uebersicht'; S.previewVersion = null;
    var d = findDoc(id); if (!d) return;
    if (!wideScreen() && d.versions.length) S.drawerTab = 'vorschau';
    renderDrawer(d);
    $('drawerBg').classList.add('open'); $('drawer').classList.add('open');
  }
  function closeDrawer() {
    S.openDocId = null;
    $('drawerBg').classList.remove('open'); $('drawer').classList.remove('open');
    var pv = $('preview'); if (pv) { pv.classList.remove('show'); pv.innerHTML = ''; }
  }
  function aBtn(label, act, cls, o) {
    o = o || {};
    return '<button class="btn sm ' + (cls || '') + '" data-act="' + act + '"' + (o.disabled ? ' disabled' : '') + (o.title ? ' title="' + esc(o.title) + '"' : '') + '>' + label + '</button>';
  }
  function actionsFor(doc) {
    var me = S.me, up = uploaderOf(doc), h = '', s = doc.status;
    var selfBlock = vier() && up === me;
    var mayReview = can('review') && (can('manage') || !doc.reviewer || doc.reviewer === me);
    var mayApprove = can('approve') && (can('manage') || !doc.approver || doc.approver === me);
    var lockedByOther = doc.lock && doc.lock.by.toLowerCase() !== me && !can('manage');
    var w = can('write');
    if (s === 'entwurf' && w) {
      h += aBtn('📤 ' + (doc.currentVersion ? 'Neue Version hochladen' : 'Datei hochladen'), 'upload', doc.currentVersion ? '' : 'primary', { disabled: lockedByOther, title: lockedByOther ? 'Ausgecheckt von ' + doc.lock.by : '' });
      if (doc.currentVersion) h += aBtn('➡ Zur Prüfung einreichen', 'einreichen', 'primary');
      if (doc.lock && (doc.lock.by.toLowerCase() === me || can('manage'))) h += aBtn('🔓 Einchecken', 'unlock');
      else if (!doc.lock) h += aBtn('🔒 Auschecken', 'lock', '', { title: 'Sperrt das Dokument für andere, solange du daran arbeitest.' });
    }
    if (s === 'in_pruefung') {
      h += aBtn('✔ Prüfung bestätigen', 'pruefen', 'ok', { disabled: !mayReview || selfBlock, title: selfBlock ? 'Vier-Augen-Prinzip: du hast diese Version hochgeladen.' : (!mayReview ? (can('review') ? 'Zuständig: ' + nameFromMail(doc.reviewer) : 'Dafür brauchst du die Rolle Prüfer oder höher.') : '') });
      h += aBtn('✖ Ablehnen', 'ablehnen', 'danger', { disabled: !mayReview });
      if (w) h += aBtn('↩ Zurückziehen', 'zurueckziehen');
    }
    if (s === 'geprueft') {
      h += aBtn('✔ Freigeben', 'freigeben', 'ok', { disabled: !mayApprove || selfBlock, title: selfBlock ? 'Vier-Augen-Prinzip: du hast diese Version hochgeladen.' : (!mayApprove ? (can('approve') ? 'Zuständig: ' + nameFromMail(doc.approver) : 'Dafür brauchst du die Rolle Freigeber oder höher.') : '') });
      h += aBtn('✖ Ablehnen', 'ablehnen', 'danger', { disabled: !mayApprove });
      if (w) h += aBtn('↩ Zurückziehen', 'zurueckziehen');
    }
    if (s === 'freigegeben') {
      if (w) h += aBtn('📤 Neue Version hochladen', 'upload');
      if (can('manage') || (w && doc.owner === me)) h += aBtn('✔ Überprüft, unverändert gültig', 'ueberprueft');
      if (doc.readRequired) {
        var r = doc.reads && doc.reads[me];
        if (!r || r.version !== doc.releasedVersion) h += aBtn('📖 Gelesen und verstanden', 'read', 'primary');
      }
    }
    if (s === 'archiviert' && w) h += aBtn('♻ Wiederherstellen', 'wiederherstellen');
    if (!doc.versions.length && doc.templateId) h += '<a class="btn sm primary" href="/api/dms/template-file?docId=' + doc.id + '">📄 Word-Startdatei herunterladen</a>';
    var v = doc.releasedVersion || doc.currentVersion;
    if (v) {
      h += '<a class="btn sm" href="/api/dms/download?docId=' + doc.id + '&version=' + v + '&inline=1" target="_blank" rel="noopener">👁 ' + (doc.releasedVersion ? 'Gültige Version ansehen' : 'Ansehen') + '</a>';
      h += '<a class="btn sm" href="/api/dms/download?docId=' + doc.id + '&version=' + v + '">⬇ Download</a>';
    }
    if (s !== 'archiviert' && (can('manage') || (w && (doc.owner === me || (doc.createdBy || '').toLowerCase() === me)))) h += aBtn('🗄 Archivieren', 'archivieren');
    if (can('manage')) h += aBtn('🗑 Löschen', 'delete', 'danger');
    return h;
  }
  function renderDrawer(doc) {
    var task = taskFor(doc);
    $('drawerHead').innerHTML = '<div><div class="docnr">' + esc(doc.docNumber) + ' · ' + esc(doc.category) + '</div><h3>' + esc(doc.title) + '</h3><div>' + statusChip(doc) + (doc.currentVersion ? ' <span class="chip">v' + doc.currentVersion + '</span>' : '') + (task ? ' <span class="chip task">' + esc(task) + '</span>' : '') + '</div></div><button class="x-btn" id="drawerX" aria-label="Schliessen">✕</button>';
    $('drawerX').addEventListener('click', closeDrawer);
    $('drawerActions').innerHTML = actionsFor(doc);
    var tabs = (wideScreen() || !doc.versions.length ? [] : [['vorschau', 'Vorschau']]).concat([['uebersicht', 'Übersicht'], ['versionen', 'Versionen (' + doc.versions.length + ')'], ['verlauf', 'Verlauf'], ['verknuepft', 'Verknüpft (' + (doc.related || []).length + ')']]);
    if (doc.readRequired || can('manage')) tabs.push(['lesen', 'Gelesen']);
    $('drawerTabs').innerHTML = tabs.map(function (t) { return '<button class="drawer-tab' + (S.drawerTab === t[0] ? ' on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>'; }).join('');
    $('drawerTabs').querySelectorAll('[data-tab]').forEach(function (b) { b.addEventListener('click', function () { S.drawerTab = b.getAttribute('data-tab'); renderDrawer(doc); }); });
    if (S.drawerTab === 'vorschau' && wideScreen()) S.drawerTab = 'uebersicht';
    var body = S.drawerTab === 'vorschau' ? tabVorschau(doc) : S.drawerTab === 'versionen' ? tabVersionen(doc) : S.drawerTab === 'verlauf' ? tabVerlauf(doc) : S.drawerTab === 'verknuepft' ? tabVerknuepft(doc) : S.drawerTab === 'lesen' ? tabLesen(doc) : tabUebersicht(doc);
    $('drawerBody').innerHTML = body;
    wireDrawer(doc);
    renderPreview(doc);
    var pi = $('pvInline'); if (pi) loadPreviewInto(pi, doc, previewTarget(doc));
  }
  // ----- Vorschau -----
  function wideScreen() { return window.innerWidth >= 1300; }
  function previewKind(filename) {
    var ext = String(filename || '').split('.').pop().toLowerCase();
    if (ext === 'pdf') return 'pdf';
    if (['png', 'jpg', 'jpeg', 'gif'].indexOf(ext) >= 0) return 'img';
    if (ext === 'txt') return 'txt';
    return 'none';
  }
  function previewTarget(doc) {
    if (!doc.versions.length) return null;
    var v = S.previewVersion || doc.releasedVersion || doc.currentVersion;
    var entry = doc.versions.filter(function (x) { return x.version === v; })[0] || doc.versions[doc.versions.length - 1];
    return entry;
  }
  // Datei als Blob laden: so lassen sich Fehler (Datei fehlt) freundlich anzeigen statt als rohe Meldung.
  var pvToken = 0;
  function loadPreviewInto(container, doc, entry) {
    var kind = previewKind(entry.filename);
    if (kind === 'none') return;
    var my = ++pvToken;
    var url = '/api/dms/download?docId=' + doc.id + '&version=' + entry.version + '&inline=1';
    container.innerHTML = '<div class="preview-load">Lade Vorschau …</div>';
    fetch(url).then(function (r) {
      if (!r.ok) return r.json().catch(function () { return {}; }).then(function (e) { throw new Error(e.error || ('Fehler ' + r.status)); });
      return r.blob();
    }).then(function (blob) {
      if (my !== pvToken) return;
      var u = URL.createObjectURL(blob);
      container.innerHTML = kind === 'img' ? '<img src="' + u + '" alt="' + esc(entry.filename) + '">' : '<iframe src="' + u + '" title="Vorschau ' + esc(entry.filename) + '"></iframe>';
    }).catch(function (e) {
      if (my !== pvToken) return;
      container.innerHTML = '<div class="preview-none"><div class="big">⚠️</div><b>Die Vorschau konnte nicht geladen werden</b>' + esc(e.message) + '<div style="margin-top:1rem"><a class="btn" href="/api/dms/download?docId=' + doc.id + '&version=' + entry.version + '">⬇ Herunterladen versuchen</a></div></div>';
    });
  }
  function previewBodyHtml(doc, entry) {
    var url = '/api/dms/download?docId=' + doc.id + '&version=' + entry.version;
    var kind = previewKind(entry.filename);
    if (kind !== 'none') return '<div class="preview-load">Lade Vorschau …</div>';
    return '<div class="preview-none"><div class="big">📄</div><b>Keine Vorschau für diesen Dateityp</b>Dateien wie Word, Excel oder CAD lassen sich nicht im Browser anzeigen. Lade die Datei herunter, um sie zu öffnen.<div style="margin-top:1rem"><a class="btn primary" href="' + url + '">⬇ Herunterladen</a></div></div>';
  }
  function renderPreview(doc) {
    var pv = $('preview');
    if (!pv) return;
    var entry = previewTarget(doc);
    if (!entry || !wideScreen()) { pv.classList.remove('show'); pv.innerHTML = ''; return; }
    var url = '/api/dms/download?docId=' + doc.id + '&version=' + entry.version;
    var vsel = doc.versions.length > 1 ? '<select id="pvVer" aria-label="Version">' + doc.versions.slice().reverse().map(function (v) { return '<option value="' + v.version + '"' + (v.version === entry.version ? ' selected' : '') + '>v' + v.version + (v.version === doc.releasedVersion ? ' (gültig)' : v.version === doc.currentVersion ? ' (aktuell)' : '') + '</option>'; }).join('') + '</select>' : '<span class="chip">v' + entry.version + '</span>';
    pv.innerHTML = '<div class="preview-head"><span class="fn" title="' + esc(entry.filename) + '">' + esc(entry.filename) + '</span>' + vsel +
      (previewKind(entry.filename) !== 'none' ? '<a class="btn sm" href="' + url + '&inline=1" target="_blank" rel="noopener">↗ Neuer Tab</a>' : '') + '<a class="btn sm" href="' + url + '">⬇ Download</a><button class="x-btn" id="pvClose" aria-label="Schliessen" title="Schliessen" style="width:32px;height:32px">✕</button></div>' +
      '<div class="preview-body">' + previewBodyHtml(doc, entry) + '</div>';
    pv.classList.add('show');
    $('pvClose').addEventListener('click', closeDrawer);
    loadPreviewInto(pv.querySelector('.preview-body'), doc, entry);
    var sel = $('pvVer');
    if (sel) sel.addEventListener('change', function () { S.previewVersion = Number(sel.value); renderPreview(doc); });
  }
  function tabVorschau(doc) {
    var entry = previewTarget(doc);
    if (!entry) return '<div class="empty">Noch keine Datei hochgeladen.</div>';
    return '<div class="row" style="margin-bottom:.7rem"><span class="t-main" style="flex:1;min-width:0">' + esc(entry.filename) + ' <span class="chip">v' + entry.version + '</span></span>' +
      (previewKind(entry.filename) !== 'none' ? '<a class="btn sm" href="/api/dms/download?docId=' + doc.id + '&version=' + entry.version + '&inline=1" target="_blank" rel="noopener">↗ Neuer Tab</a>' : '') + '</div><div class="preview-inline" id="pvInline">' + previewBodyHtml(doc, entry) + '</div>';
  }

  function mi(k, v, wide) { return '<div class="meta-item' + (wide ? ' wide' : '') + '"><div class="k">' + k + '</div><div class="v">' + v + '</div></div>'; }
  function tabUebersicht(doc) {
    var h = '';
    if (!doc.versions.length && doc.templateId) h += '<div class="notice">📄 Dieses Dokument wurde aus einer Vorlage angelegt. Lade oben die <b>Word-Startdatei</b> herunter, fülle sie aus und lade sie danach als erste Version hoch.</div>';
    if (doc.lock) h += '<div class="notice warn">🔒 Ausgecheckt von <b>' + esc(nameFromMail(doc.lock.by)) + '</b> seit ' + fmtDateTime(doc.lock.at) + '. Andere können keine neue Version hochladen.</div>';
    if (doc.status === 'in_pruefung') h += '<div class="notice">Wartet auf Prüfung' + (doc.reviewer ? ' durch <b>' + esc(nameFromMail(doc.reviewer)) + '</b>' : '') + '.</div>';
    if (doc.status === 'geprueft') h += '<div class="notice">Geprüft. Wartet auf Freigabe' + (doc.approver ? ' durch <b>' + esc(nameFromMail(doc.approver)) + '</b>' : '') + '.</div>';
    var rs = reviewState(doc);
    if (rs === 'overdue') h += '<div class="notice err">Die Überprüfung war am <b>' + fmtDay(doc.nextReview) + '</b> fällig.</div>';
    else if (rs === 'due') h += '<div class="notice warn">Überprüfung fällig am <b>' + fmtDay(doc.nextReview) + '</b>.</div>';
    h += '<div class="meta-grid">' + mi('Kategorie', esc(doc.category)) + mi('Status', STATUS_LABEL[doc.status]) +
      mi('Gültige Version', doc.releasedVersion ? 'v' + doc.releasedVersion : '–') + mi('Aktuelle Version', doc.currentVersion ? 'v' + doc.currentVersion : '–') +
      mi('Verantwortlich', who(doc.owner)) + mi('Gültig ab', fmtDay(doc.validFrom)) +
      mi('Prüfer:in', doc.reviewer ? who(doc.reviewer) : 'jede Person mit Prüfrecht') + mi('Freigeber:in', doc.approver ? who(doc.approver) : 'jede Person mit Freigaberecht') +
      mi('Nächste Überprüfung', doc.nextReview ? fmtDay(doc.nextReview) : '–') + mi('Intervall', doc.reviewIntervalMonths ? 'alle ' + doc.reviewIntervalMonths + ' Monate' : 'keine Wiedervorlage') +
      mi('Lesepflicht', doc.readRequired ? 'Ja, für ' + esc(readersLabel(doc)) : 'Nein') + mi('Angelegt', fmtDateTime(doc.createdAt) + '<br>' + esc(nameFromMail(doc.createdBy))) +
      mi('Beschreibung', doc.description ? esc(doc.description).replace(/\n/g, '<br>') : '–', true) +
      mi('Schlagworte', (doc.tags && doc.tags.length) ? '<div class="tags">' + doc.tags.map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('') + '</div>' : '–', true) + '</div>';
    if (doc.status !== 'archiviert' && can('write')) h += '<button class="btn sm" id="editMetaBtn">✎ Angaben bearbeiten</button>';
    return h;
  }
  function tabVersionen(doc) {
    if (!doc.versions.length) return '<div class="empty">Noch keine Version hochgeladen.</div>';
    return (doc.versions.length > 1 ? '<div class="row" style="margin-bottom:.8rem"><button class="btn" data-compare="1">⇄ Versionen vergleichen</button></div>' : '') + doc.versions.slice().reverse().map(function (v) {
      var valid = doc.releasedVersion === v.version, cur = doc.currentVersion === v.version;
      return '<div class="ver-item' + (valid ? ' valid' : '') + '"><div><div class="mono"><b>v' + v.version + '</b> · ' + esc(v.filename) + ' · ' + formatSize(v.size) + (valid ? ' <span class="chip freigegeben">gültig</span>' : '') + (cur && !valid ? ' <span class="chip">aktuell</span>' : '') + '</div>' +
        '<div class="t-sub">' + fmtDateTime(v.uploadedAt) + ' · ' + esc(nameFromMail(v.uploadedBy)) + (v.note ? ' · Änderung: ' + esc(v.note) : '') + '</div></div>' +
        '<div class="row"><a class="btn sm" href="/api/dms/download?docId=' + doc.id + '&version=' + v.version + '&inline=1" target="_blank" rel="noopener">👁</a><a class="btn sm" href="/api/dms/download?docId=' + doc.id + '&version=' + v.version + '">⬇</a></div></div>';
    }).join('');
  }
  function tabVerlauf(doc) {
    var h = '<div class="comment-box"><textarea id="commentText" placeholder="Kommentar zum Dokument …" rows="2"></textarea><button class="btn primary" id="commentBtn" style="align-self:flex-end">Senden</button></div><div class="timeline">';
    (doc.history || []).slice().reverse().forEach(function (e) {
      h += '<div class="tl-item ' + esc(e.type) + '"><div class="tl-dot"></div><div><div>' + esc(e.text || e.type) + '</div><div class="tl-meta">' + fmtDateTime(e.at) + ' · ' + esc(nameFromMail(e.by)) + '</div>' + (e.comment ? '<div class="tl-comment">' + esc(e.comment) + '</div>' : '') + '</div></div>';
    });
    return h + '</div>';
  }
  function tabVerknuepft(doc) {
    var rel = (doc.related || []).map(findDoc).filter(Boolean);
    var h = '<p class="muted" style="margin-bottom:.8rem">Verknüpfte Dokumente, zum Beispiel eine Arbeitsanweisung zu einer Verfahrensanweisung.</p>';
    h += rel.length ? rel.map(function (r) { return '<div class="rel-item" data-open="' + r.id + '"><div><span class="docnr">' + esc(r.docNumber) + '</span> ' + esc(r.title) + '</div>' + statusChip(r) + '</div>'; }).join('') : '<div class="empty" style="padding:.6rem 0">Keine Verknüpfungen.</div>';
    if (can('write')) {
      var others = S.docs.filter(function (d) { return d.id !== doc.id && (doc.related || []).indexOf(d.id) < 0; });
      h += '<div class="row" style="margin-top:1rem"><select id="relSelect" style="flex:1;min-width:200px;width:auto"><option value="">Dokument verknüpfen …</option>' + others.map(function (d) { return '<option value="' + d.id + '">' + esc(d.docNumber + ' ' + d.title) + '</option>'; }).join('') + '</select><button class="btn" id="relAdd">Verknüpfen</button>' + (rel.length ? '<button class="btn" id="relClear">Alle entfernen</button>' : '') + '</div>';
    }
    return h;
  }
  function tabLesen(doc) {
    if (!doc.releasedVersion) return '<div class="empty">Lesebestätigungen gibt es erst für freigegebene Dokumente.</div>';
    var reads = doc.reads || {};
    var keys = Object.keys(reads).filter(function (k) { return reads[k].version === doc.releasedVersion; });
    var req = requiredReaders(doc);
    var missing = (S.tenant.members || []).filter(function (m) { return req.indexOf(m.email) >= 0 && keys.indexOf(m.email) < 0; });
    var h = '<p class="muted" style="margin-bottom:.8rem">Bestätigungen für die gültige Version v' + doc.releasedVersion + (doc.readRequired ? '' : ' (die Lesepflicht ist für dieses Dokument nicht aktiviert)') + '.</p>';
    h += keys.length ? keys.map(function (k) { return '<div class="read-row"><span>' + who(k) + '</span><span class="muted">' + fmtDateTime(reads[k].at) + '</span></div>'; }).join('') : '<div class="empty" style="padding:.6rem 0">Noch niemand hat bestätigt.</div>';
    if (doc.readRequired && missing.length) h += '<h4 style="margin:1.2rem 0 .4rem">Noch offen (' + missing.length + ')</h4>' + missing.map(function (m) { return '<div class="read-row"><span>' + esc(m.name) + '</span><span class="muted">' + esc(ROLE_LABEL[m.role]) + '</span></div>'; }).join('');
    return h;
  }
  function afterChange() { return loadDocs().then(function () { if (S.route === 'dokumente') renderDocuments(); var d = S.openDocId && findDoc(S.openDocId); if (d) renderDrawer(d); else if (S.openDocId) closeDrawer(); }); }
  function wireDrawer(doc) {
    $('drawerActions').querySelectorAll('[data-act]').forEach(function (b) { b.addEventListener('click', function () { runAction(doc, b.getAttribute('data-act')); }); });
    var em = $('editMetaBtn'); if (em) em.addEventListener('click', function () { editMeta(doc); });
    var cmp = $('drawerBody').querySelector('[data-compare]'); if (cmp) cmp.addEventListener('click', function () { window.DMSX.compareVersions(doc); });
    var cb = $('commentBtn');
    if (cb) cb.addEventListener('click', function () { var t = $('commentText').value.trim(); if (t) send('POST', '/api/dms/comment', { docId: doc.id, text: t }).then(afterChange).catch(fail); });
    $('drawerBody').querySelectorAll('[data-open]').forEach(function (el) { el.addEventListener('click', function () { openDrawer(el.getAttribute('data-open')); }); });
    var ra = $('relAdd'); if (ra) ra.addEventListener('click', function () { var id = $('relSelect').value; if (id) send('PUT', '/api/dms/documents', { id: doc.id, related: (doc.related || []).concat([id]) }).then(afterChange).catch(fail); });
    var rc = $('relClear'); if (rc) rc.addEventListener('click', function () { send('PUT', '/api/dms/documents', { id: doc.id, related: [] }).then(afterChange).catch(fail); });
  }
  function runAction(doc, act) {
    function wf(action, comment) { return send('POST', '/api/dms/workflow', { docId: doc.id, action: action, comment: comment || '' }).then(afterChange).catch(fail); }
    var C = function (label, req) { return [{ name: 'c', label: label || 'Kommentar (optional)', type: 'textarea', required: !!req }]; };
    if (act === 'upload') return startUpload(doc);
    if (act === 'einreichen') return askForm({ title: 'Zur Prüfung einreichen', sub: 'Version v' + doc.currentVersion + ' geht an ' + (doc.reviewer ? esc(nameFromMail(doc.reviewer)) : 'die Personen mit Prüfrecht') + '.', fields: C('Hinweis an die Prüfung (optional)'), ok: 'Einreichen' }).then(function (v) { if (v) wf('einreichen', v.c); });
    if (act === 'pruefen') return askForm({ title: 'Prüfung bestätigen', sub: 'Der Inhalt von v' + doc.currentVersion + ' ist geprüft. Danach folgt die Freigabe.', fields: C(), ok: 'Geprüft' }).then(function (v) { if (v) wf('pruefen', v.c); });
    if (act === 'freigeben') return askForm({ title: 'Freigeben', sub: 'v' + doc.currentVersion + ' wird die gültige Version.' + (doc.reviewIntervalMonths ? ' Nächste Überprüfung in ' + doc.reviewIntervalMonths + ' Monaten.' : ''), fields: C(), ok: 'Freigeben' }).then(function (v) { if (v) wf('freigeben', v.c); });
    if (act === 'ablehnen') return askForm({ title: 'Ablehnen', sub: 'Das Dokument geht zurück in den Entwurf. Die Begründung ist Pflicht.', fields: C('Begründung', true), ok: 'Ablehnen' }).then(function (v) { if (v) wf('ablehnen', v.c); });
    if (act === 'zurueckziehen') return wf('zurueckziehen');
    if (act === 'ueberprueft') return askForm({ title: 'Überprüft', sub: 'Du bestätigst, dass das Dokument unverändert gültig ist. Die nächste Überprüfung wird neu geplant.', fields: C(), ok: 'Bestätigen' }).then(function (v) { if (v) wf('ueberprueft', v.c); });
    if (act === 'archivieren') { if (confirm('Dokument archivieren? Es bleibt mit allem Verlauf erhalten und lässt sich wiederherstellen.')) wf('archivieren'); return; }
    if (act === 'wiederherstellen') return wf('wiederherstellen');
    if (act === 'read') return send('POST', '/api/dms/read', { docId: doc.id }).then(afterChange).catch(fail);
    if (act === 'lock' || act === 'unlock') return send('POST', '/api/dms/lock', { docId: doc.id, lock: act === 'lock' }).then(afterChange).catch(fail);
    if (act === 'delete') {
      if (!confirm('Dieses Dokument inkl. aller Versionen und des Verlaufs unwiderruflich löschen? Besser: archivieren.')) return;
      api('/api/dms/documents?id=' + encodeURIComponent(doc.id), { method: 'DELETE' }).then(function () { closeDrawer(); return afterChange(); }).catch(fail);
    }
  }

  // ----- Neues Dokument / bearbeiten -----

  function peopleOptions(cap, emptyLabel) {
    var opts = [{ value: '', label: emptyLabel }];
    (S.tenant.members || []).filter(function (m) { return !cap || CAN[cap].indexOf(m.role) >= 0; }).forEach(function (m) { opts.push({ value: m.email, label: m.name + ' (' + ROLE_LABEL[m.role] + ')' }); });
    if (S.platform && !memberOf(S.me)) opts.push({ value: S.me, label: nameFromMail(S.me) + ' (Alta Engineering)' });
    return opts;
  }
  function docFields(doc) {
    var d = doc || {};
    var ownerOpts = peopleOptions('write', 'Ich selbst'); ownerOpts[0].value = S.me;
    var arr = [
      { name: 'title', label: 'Titel', value: d.title || '', required: true, placeholder: 'z.B. Verfahrensanweisung Wareneingang' },
      { name: 'category', label: 'Kategorie / Abteilung', type: 'select', options: S.tenant.categories, value: d.category || S.tenant.categories[0] },
      { name: 'description', label: 'Beschreibung (Zweck, Geltungsbereich)', type: 'textarea', value: d.description || '' },
      { name: 'tags', label: 'Schlagworte, kommagetrennt', value: (d.tags || []).join(', '), placeholder: 'z.B. Audit, ISO 9001, Einkauf' },
      { name: 'owner', label: 'Verantwortlich', type: 'select', options: ownerOpts, value: d.owner || S.me },
      { name: 'reviewer', label: 'Prüfung durch', type: 'select', options: peopleOptions('review', 'Jede Person mit Prüfrecht'), value: d.reviewer || '' },
      { name: 'approver', label: 'Freigabe durch', type: 'select', options: peopleOptions('approve', 'Jede Person mit Freigaberecht'), value: d.approver || '' },
      { name: 'reviewIntervalMonths', label: 'Überprüfung alle … Monate (0 = keine Wiedervorlage)', type: 'number', value: d.reviewIntervalMonths == null ? (S.tenant.defaultReviewMonths == null ? 12 : S.tenant.defaultReviewMonths) : d.reviewIntervalMonths },
      { name: 'readRequired', label: 'Lesepflicht', hint: 'Die Benutzer bestätigen «gelesen und verstanden».', type: 'checkbox', value: !!d.readRequired }
    ];
    var groups = (S.tenant.groups || []).map(function (g) { return { value: g.id, label: g.name + ' (' + g.members.length + ')' }; });
    if (groups.length) arr.push({ name: 'readGroups', label: 'Lesepflicht gilt für diese Gruppen', type: 'checks', options: groups, value: d.readGroups || [], hint: 'Keine Auswahl bedeutet: alle Benutzer.' });
    return arr;
  }
  function newDoc(prefill) {
    if (!prefill && window.DMSX && window.DMSX.chooseTemplate) { window.DMSX.chooseTemplate(function (p) { newDoc(p || {}); }); return; }
    askForm({ title: prefill && prefill.templateName ? 'Neues Dokument: ' + prefill.templateName : 'Neues Dokument', sub: prefill && prefill.templateId ? 'Nach dem Anlegen lädst du die <b>Word-Startdatei</b> herunter. Sie enthält schon Kopf und Gliederung.' : 'Die Dokumentnummer wird automatisch vergeben. Die Datei lädst du danach im Dokument hoch.', fields: docFields(prefill && Object.keys(prefill).length ? prefill : null), ok: 'Anlegen' }).then(function (v) {
      if (!v) return;
      v.tenantId = S.tenantId;
      if (prefill && prefill.templateId) v.templateId = prefill.templateId;
      send('POST', '/api/dms/documents', v).then(function (res) { return loadDocs().then(function () { renderDocuments(); openDrawer(res.document.id); }); }).catch(fail);
    });
  }
  function editMeta(doc) {
    askForm({ title: 'Angaben bearbeiten', fields: docFields(doc), ok: 'Speichern' }).then(function (v) {
      if (!v) return; v.id = doc.id;
      send('PUT', '/api/dms/documents', v).then(afterChange).catch(fail);
    });
  }
  function startUpload(doc) {
    var first = !doc.currentVersion;
    askForm({
      title: first ? 'Erste Version hochladen' : 'Neue Version hochladen',
      sub: first ? '' : 'Die neue Version ist zuerst ein Entwurf. Die bisher gültige Version bleibt gültig, bis die neue freigegeben ist.',
      fields: [{ name: 'file', label: 'Datei', type: 'file', required: true }, { name: 'note', label: first ? 'Bemerkung (optional)' : 'Änderungsgrund (Pflicht)', type: 'textarea', required: !first, placeholder: 'Was wurde geändert und warum?' }],
      ok: 'Hochladen'
    }).then(function (v) {
      if (!v || !v.file) return;
      var file = v.file;
      toast('Lädt hoch …');
      send('POST', '/api/dms/upload-url', { docId: doc.id, filename: file.name }).then(function (res) {
        var xhr = new XMLHttpRequest();
        xhr.open('PUT', res.uploadUrl);
        xhr.onload = function () {
          if (xhr.status >= 200 && xhr.status < 300) send('POST', '/api/dms/upload-done', { docId: doc.id, key: res.key, filename: res.filename, version: res.version, size: file.size, note: v.note }).then(function () { toast('Version ' + res.version + ' hochgeladen.'); if (window.DMSX) window.DMSX.indexFile(doc.id, res.version, file); return afterChange(); }).catch(fail);
          else alert('Upload fehlgeschlagen (' + xhr.status + ').');
        };
        xhr.onerror = function () { alert('Netzwerkfehler beim Upload.'); };
        xhr.send(file);
      }).catch(fail);
    });
  }

  // =====================================================================
  //  BENUTZER
  // =====================================================================

  function renderUsers() {
    $('page').innerHTML = '<div class="empty">Lade …</div>';
    api('/api/dms/members?tenantId=' + encodeURIComponent(S.tenantId)).then(function (res) {
      var members = res.members;
      var h = '<div class="page-head"><div><h1>Benutzer</h1><p>Wer bei ' + esc(S.tenant.name) + ' arbeiten darf und was die Person tun kann. Neue Personen bekommen per E-Mail eine Einladung und melden sich ohne Passwort mit einem Code an.</p></div>' +
        '<div class="row"><button class="btn primary" id="inviteBtn">＋ Personen einladen</button></div></div>';
      h += '<div class="roles-grid">' + ['admin', 'freigeber', 'pruefer', 'ersteller', 'leser'].map(function (r) {
        return '<div class="role-card"><b>' + roleChip(r) + '</b><p>' + esc(ROLE_TEXT[r]) + '</p><p class="mono" style="margin-top:.4rem">' + members.filter(function (m) { return m.role === r; }).length + ' Person(en)</p></div>';
      }).join('') + '</div>';
      h += '<div class="card flush"><div style="padding:1rem 1.2rem .4rem" class="row"><div style="flex:1;min-width:200px"><input type="search" id="uq" placeholder="Person suchen …"></div><span class="muted">' + members.length + ' Benutzer</span></div><div class="tbl-wrap"><table><thead><tr><th>Name</th><th>E-Mail</th><th>Rolle</th><th>Dabei seit</th><th></th></tr></thead><tbody id="uRows"></tbody></table><div class="empty" id="uEmpty" hidden></div></div></div>';
      h += '<div class="card"><h2>Wer darf was</h2><div class="sub">Die Rollen im Überblick.</div><div class="tbl-wrap"><table class="matrix"><thead><tr><th></th>' + ['admin', 'freigeber', 'pruefer', 'ersteller', 'leser'].map(function (r) { return '<th>' + esc(ROLE_LABEL[r]) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        [['Dokumente und Handbuch lesen, «gelesen» bestätigen', [1, 1, 1, 1, 1]], ['Dokumente anlegen, bearbeiten, einreichen, Handbuch bearbeiten', [1, 1, 1, 1, 0]], ['Dokumente prüfen', [1, 1, 1, 0, 0]], ['Dokumente freigeben, Handbuch veröffentlichen', [1, 1, 0, 0, 0]], ['Benutzer und Einstellungen verwalten, löschen', [1, 0, 0, 0, 0]]].map(function (row) {
          return '<tr><td>' + esc(row[0]) + '</td>' + row[1].map(function (x) { return '<td>' + (x ? '<span class="yes">✔</span>' : '<span class="no">–</span>') + '</td>'; }).join('') + '</tr>';
        }).join('') + '</tbody></table></div></div>';
      $('page').innerHTML = h;
      $('inviteBtn').addEventListener('click', invite);
      var draw = function () {
        var q = ($('uq').value || '').toLowerCase();
        var list = members.filter(function (m) { return !q || (m.name + ' ' + m.email).toLowerCase().indexOf(q) >= 0; });
        var rows = $('uRows'); rows.innerHTML = '';
        $('uEmpty').hidden = list.length > 0;
        $('uEmpty').innerHTML = members.length ? '<b>Niemand gefunden</b>' : '<b>Noch keine Benutzer</b>Mit «Personen einladen» geht es los.';
        list.forEach(function (m) {
          var self = m.email === S.me;
          var tr = document.createElement('tr');
          tr.innerHTML = '<td><div class="user-cell"><span class="av">' + esc(initials(m.name)) + '</span><div><div class="t-main">' + esc(m.name) + (self ? ' <span class="chip">du</span>' : '') + '</div></div></div></td>' +
            '<td class="mono">' + esc(m.email) + '</td>' +
            '<td><select data-role="' + esc(m.email) + '" style="width:auto;min-width:150px">' + ['admin', 'freigeber', 'pruefer', 'ersteller', 'leser'].map(function (r) { return '<option value="' + r + '"' + (m.role === r ? ' selected' : '') + '>' + esc(ROLE_LABEL[r]) + '</option>'; }).join('') + '</select></td>' +
            '<td class="muted">' + (m.addedAt ? fmtDay(m.addedAt) : '–') + '</td>' +
            '<td><div class="row" style="justify-content:flex-end"><button class="btn sm" data-rename="' + esc(m.email) + '">✎ Name</button><button class="btn sm danger" data-remove="' + esc(m.email) + '">Entfernen</button></div></td>';
          rows.appendChild(tr);
        });
        rows.querySelectorAll('[data-role]').forEach(function (sel) {
          sel.addEventListener('change', function () {
            var mail = sel.getAttribute('data-role');
            send('PUT', '/api/dms/members', { tenantId: S.tenantId, email: mail, role: sel.value }).then(function () { toast('Rolle geändert.'); return loadDocs().then(renderUsers); }).catch(function (e) { fail(e); renderUsers(); });
          });
        });
        rows.querySelectorAll('[data-rename]').forEach(function (b) {
          b.addEventListener('click', function () {
            var mail = b.getAttribute('data-rename'), m = members.filter(function (x) { return x.email === mail; })[0];
            askForm({ title: 'Name ändern', fields: [{ name: 'name', label: 'Name', value: m.name, required: true }], ok: 'Speichern' }).then(function (v) { if (v) send('PUT', '/api/dms/members', { tenantId: S.tenantId, email: mail, name: v.name }).then(function () { return loadDocs().then(renderUsers); }).catch(fail); });
          });
        });
        rows.querySelectorAll('[data-remove]').forEach(function (b) {
          b.addEventListener('click', function () {
            var mail = b.getAttribute('data-remove');
            if (!confirm(mail + ' wirklich entfernen? Die Person kann sich danach nicht mehr in dieser Dokumentenlenkung anmelden. Ihre bisherigen Einträge bleiben erhalten.')) return;
            api('/api/dms/members?tenantId=' + encodeURIComponent(S.tenantId) + '&email=' + encodeURIComponent(mail), { method: 'DELETE' }).then(function () { toast('Entfernt.'); return loadDocs().then(renderUsers); }).catch(fail);
          });
        });
      };
      $('uq').addEventListener('input', draw);
      draw();
      if (window.DMSX) window.DMSX.groupsCard(members);
    }).catch(function (e) { $('page').innerHTML = '<div class="notice err">' + esc(e.message) + '</div>'; });
  }

  function invite() {
    askForm({
      title: 'Personen einladen',
      sub: 'Trage eine oder mehrere E-Mail-Adressen ein (eine pro Zeile oder mit Komma getrennt). Die Personen melden sich mit ihrer E-Mail-Adresse an und erhalten dafür einen Code.',
      fields: [
        { name: 'emails', label: 'E-Mail-Adressen', type: 'textarea', rows: 4, required: true, placeholder: 'anna.muster@firma.ch\nbeat.beispiel@firma.ch' },
        { name: 'name', label: 'Name (nur bei einer einzelnen Person)', placeholder: 'z.B. Anna Muster' },
        { name: 'role', label: 'Rolle', type: 'select', options: [{ value: 'ersteller', label: 'Ersteller: ' + ROLE_TEXT.ersteller }, { value: 'leser', label: 'Leser: ' + ROLE_TEXT.leser }, { value: 'pruefer', label: 'Prüfer: ' + ROLE_TEXT.pruefer }, { value: 'freigeber', label: 'Freigeber: ' + ROLE_TEXT.freigeber }, { value: 'admin', label: 'Administrator: ' + ROLE_TEXT.admin }], value: 'ersteller', hint: 'Die Rolle lässt sich jederzeit in der Liste ändern.' },
        { name: 'invite', label: 'Einladung per E-Mail senden', type: 'checkbox', value: true }
      ],
      ok: 'Einladen'
    }).then(function (v) {
      if (!v) return;
      send('POST', '/api/dms/members', { tenantId: S.tenantId, emails: v.emails, name: v.name, role: v.role, invite: v.invite }).then(function (res) {
        var parts = [];
        if (res.added.length) parts.push(res.added.length + ' eingeladen');
        if (res.skipped.length) parts.push(res.skipped.length + ' übersprungen');
        toast(parts.join(', ') + '.');
        var body = '';
        if (res.added.length) body += '<p><b>Eingeladen:</b><br>' + res.added.map(esc).join('<br>') + '</p>';
        if (res.skipped.length) body += '<p><b>Übersprungen:</b><br>' + res.skipped.map(function (s) { return esc(s.email) + ' (' + esc(s.why) + ')'; }).join('<br>') + '</p>';
        if (res.accessErrors && res.accessErrors.length) body += '<div class="notice err">Bei ' + res.accessErrors.map(esc).join(', ') + ' hat die Login-Freigabe nicht geklappt. Bitte Alta Engineering informieren.</div>';
        if (res.added.length) body += '<div class="notice ok">So melden sich die Personen an: <b>' + esc(res.link) + '</b><br><span class="muted">Sie geben ihre E-Mail-Adresse ein und erhalten einen Code.</span></div>';
        return infoDialog('Fertig', body).then(function () { return loadDocs().then(renderUsers); });
      }).catch(fail);
    });
  }

  // =====================================================================
  //  EINSTELLUNGEN
  // =====================================================================

  function renderSettings() {
    var t = S.tenant;
    var counts = {};
    S.docs.forEach(function (d) { counts[d.category] = (counts[d.category] || 0) + 1; });
    var cats = t.categories.map(function (c) { return { was: c, name: c, prefix: (t.categoryPrefixes || {})[c] || '' }; });
    var h = '<div class="page-head"><div><h1>Einstellungen</h1><p>Kategorien, Nummernkreise und Regeln von ' + esc(t.name) + '.</p></div></div>';
    h += '<div class="card"><h2>Kategorien und Nummernkreise</h2><div class="sub">Jede Kategorie ist eine Abteilung oder ein Dokumenttyp. Das Kürzel bestimmt die Dokumentnummer, zum Beispiel <b>QM-001</b>.</div><div id="catRows"></div>' +
      '<div class="row" style="margin-top:.8rem"><button class="btn" id="catAdd">＋ Kategorie</button><button class="btn primary" id="catSave">Kategorien speichern</button></div></div>';
    h += '<div class="card"><h2>Regeln</h2><div class="sub">Wie streng soll die Freigabe sein?</div>' +
      '<label class="switch"><input type="checkbox" id="setVier"' + (t.vierAugen ? ' checked' : '') + '><span class="tr"></span><span><b>Vier-Augen-Prinzip</b><span class="d">Wer ein Dokument hochgeladen hat, darf es nicht selbst prüfen oder freigeben. Auch das Handbuch lässt sich nicht von der Person veröffentlichen, die alles allein geändert hat. Empfohlen für ISO 9001.</span></span></label>' +
      '<div class="field" style="margin-top:1.1rem;max-width:320px"><label class="lbl" for="setMonths">Standard-Überprüfung alle … Monate</label><input type="number" min="0" max="120" id="setMonths" value="' + esc(t.defaultReviewMonths == null ? 12 : t.defaultReviewMonths) + '"><div class="hint">Gilt für neue Dokumente. 0 = keine Wiedervorlage.</div></div>' +
      '<div class="row" style="margin-top:1rem"><button class="btn primary" id="rulesSave">Regeln speichern</button></div></div>';
    $('page').innerHTML = h;

    var drawCats = function () {
      $('catRows').innerHTML = cats.map(function (c, i) {
        var n = counts[c.was] || 0;
        return '<div class="row" style="margin-bottom:.5rem;flex-wrap:nowrap"><div style="flex:1;min-width:140px"><input type="text" data-cn="' + i + '" value="' + esc(c.name) + '" placeholder="Name"></div><div style="width:110px"><input type="text" data-cp="' + i + '" value="' + esc(c.prefix) + '" maxlength="5" placeholder="Kürzel" style="text-transform:uppercase"></div><span class="mono muted" style="width:92px">' + esc((c.prefix || '???') + '-001') + '</span><span class="muted" style="width:90px">' + n + ' Dok.</span><button class="btn sm danger" data-cd="' + i + '"' + (n ? ' disabled title="Enthält noch Dokumente"' : '') + '>Entfernen</button></div>';
      }).join('');
      $('catRows').querySelectorAll('[data-cn]').forEach(function (el) { el.addEventListener('input', function () { cats[+el.getAttribute('data-cn')].name = el.value; }); });
      $('catRows').querySelectorAll('[data-cp]').forEach(function (el) { el.addEventListener('input', function () { cats[+el.getAttribute('data-cp')].prefix = el.value.toUpperCase(); el.parentNode.parentNode.querySelector('.mono').textContent = (el.value.toUpperCase() || '???') + '-001'; }); });
      $('catRows').querySelectorAll('[data-cd]').forEach(function (el) { el.addEventListener('click', function () { cats.splice(+el.getAttribute('data-cd'), 1); drawCats(); }); });
    };
    drawCats();
    if (window.DMSX) window.DMSX.settingsExtras();
    $('catAdd').addEventListener('click', function () { cats.push({ was: '', name: '', prefix: '' }); drawCats(); var inp = $('catRows').querySelectorAll('[data-cn]'); inp[inp.length - 1].focus(); });
    $('catSave').addEventListener('click', function () {
      var payload = cats.filter(function (c) { return c.name.trim(); }).map(function (c) { return { name: c.name.trim(), prefix: c.prefix, was: c.was || c.name.trim() }; });
      send('POST', '/api/dms/settings', { tenantId: S.tenantId, categories: payload }).then(function () { toast('Kategorien gespeichert.'); return loadDocs().then(renderSettings); }).catch(fail);
    });
    $('rulesSave').addEventListener('click', function () {
      send('POST', '/api/dms/settings', { tenantId: S.tenantId, vierAugen: $('setVier').checked, defaultReviewMonths: Number($('setMonths').value) }).then(function () { toast('Regeln gespeichert.'); return loadDocs(); }).catch(fail);
    });
  }

  // =====================================================================
  //  KUNDEN (nur Alta-Admins)
  // =====================================================================

  function renderCustomers() {
    $('page').innerHTML = '<div class="empty">Lade …</div>';
    api('/api/dms/tenants').then(function (res) {
      var h = '<div class="page-head"><div><h1>Kunden</h1><p>Jeder Kunde hat seine eigene Dokumentenlenkung mit eigenen Benutzern, Kategorien und Handbuch, komplett getrennt von den anderen.</p></div><div class="row"><button class="btn primary" id="newCust">＋ Neuen Kunden anlegen</button></div></div>';
      h += '<div class="card flush"><div class="tbl-wrap"><table><thead><tr><th>Firma</th><th>Benutzer</th><th>Dokumente</th><th>Freigabe</th><th>Angelegt</th><th></th></tr></thead><tbody>' +
        (res.tenants.length ? res.tenants.map(function (t) {
          return '<tr><td><div class="t-main">' + esc(t.name) + '</div></td><td class="mono">' + t.memberCount + '</td><td class="mono">' + t.documentCount + '</td><td>' + (t.vierAugen ? '<span class="chip freigegeben">Vier-Augen</span>' : '<span class="muted">Standard</span>') + '</td><td class="muted">' + (t.createdAt ? fmtDay(t.createdAt) : '–') + '</td>' +
            '<td><div class="row" style="justify-content:flex-end"><button class="btn sm primary" data-open="' + esc(t.id) + '">Öffnen</button><button class="btn sm" data-ren="' + esc(t.id) + '">Umbenennen</button><button class="btn sm danger" data-del="' + esc(t.id) + '">Löschen</button></div></td></tr>';
        }).join('') : '<tr><td colspan="6"><div class="empty"><b>Noch kein Kunde</b>Lege den ersten Kunden an.</div></td></tr>') + '</tbody></table></div></div>';
      $('page').innerHTML = h;
      $('newCust').addEventListener('click', function () { newCustomer(res.tenants); });
      $('page').querySelectorAll('[data-open]').forEach(function (b) { b.addEventListener('click', function () { var id = b.getAttribute('data-open'); S.tenants = res.tenants.map(function (t) { return { id: t.id, name: t.name, role: 'admin' }; }); populateSwitcher(); switchTenant(id); location.hash = '#/dokumente'; }); });
      $('page').querySelectorAll('[data-ren]').forEach(function (b) { b.addEventListener('click', function () { var t = res.tenants.filter(function (x) { return x.id === b.getAttribute('data-ren'); })[0]; askForm({ title: 'Kunde umbenennen', fields: [{ name: 'name', label: 'Name der Firma', value: t.name, required: true }], ok: 'Speichern' }).then(function (v) { if (v) send('PUT', '/api/dms/tenants', { id: t.id, name: v.name }).then(function () { return refreshTenants().then(renderCustomers); }).catch(fail); }); }); });
      $('page').querySelectorAll('[data-del]').forEach(function (b) {
        b.addEventListener('click', function () {
          var t = res.tenants.filter(function (x) { return x.id === b.getAttribute('data-del'); })[0];
          askForm({ title: 'Kunde löschen', sub: 'Alle <b>' + t.documentCount + ' Dokumente</b>, das Handbuch und alle Benutzer von «' + esc(t.name) + '» werden <b>unwiderruflich gelöscht</b>.', fields: [{ name: 'c', label: 'Zur Bestätigung den Firmennamen eintippen', placeholder: t.name }], ok: 'Endgültig löschen' }).then(function (v) {
            if (!v) return;
            if (v.c !== t.name) { alert('Der Name stimmt nicht überein. Nichts wurde gelöscht.'); return; }
            api('/api/dms/tenants?id=' + encodeURIComponent(t.id), { method: 'DELETE' }).then(function () { toast('Kunde gelöscht.'); return refreshTenants().then(function () { if (S.tenantId === t.id) { S.tenantId = S.tenants[0] ? S.tenants[0].id : null; S.docs = []; S.tenant = null; return S.tenantId ? loadDocs() : null; } }).then(renderCustomers); }).catch(fail);
          });
        });
      });
    }).catch(function (e) { $('page').innerHTML = '<div class="notice err">' + esc(e.message) + '</div>'; });
  }
  function refreshTenants() {
    return api('/api/me').then(function (me) { S.tenants = me.dmsTenants || []; populateSwitcher(); renderNav(); });
  }
  function newCustomer(existing) {
    askForm({
      title: 'Neuen Kunden anlegen',
      sub: 'Lege die Firma und ihre erste Administratorin oder ihren ersten Administrator an. Diese Person lädt danach selbst die übrigen Mitarbeitenden ein.',
      fields: [
        { name: 'name', label: 'Name der Firma', required: true, placeholder: 'z.B. Muster Metallbau AG' },
        { name: 'adminEmail', label: 'E-Mail des ersten Administrators', type: 'email', required: true, placeholder: 'chef@muster-metallbau.ch' },
        { name: 'adminName', label: 'Name des Administrators', placeholder: 'z.B. Hans Muster' },
        { name: 'copy', label: 'Kategorien und Regeln', type: 'select', options: [{ value: '', label: 'Standard (Qualität, Engineering, Administration …)' }].concat(existing.map(function (t) { return { value: t.id, label: 'Wie bei ' + t.name }; })), value: '' },
        { name: 'hb', label: 'QM-Handbuch', type: 'select', options: [{ value: 'iso9001', label: 'Bewährte ISO-9001-Vorlage von Alta anlegen' }, { value: 'leer', label: 'Leeres Handbuch anlegen' }, { value: '', label: 'Später anlegen' }], value: 'iso9001' },
        { name: 'vier', label: 'Vier-Augen-Prinzip einschalten', type: 'checkbox', value: true }
      ],
      ok: 'Kunde anlegen'
    }).then(function (v) {
      if (!v) return;
      send('POST', '/api/dms/tenants', { name: v.name, adminEmail: v.adminEmail, adminName: v.adminName, copyFromTenantId: v.copy || undefined, vierAugen: v.vier }).then(function (res) {
        var after = v.hb ? send('POST', '/api/dms/handbook/init', { tenantId: res.tenant.id, template: v.hb }) : Promise.resolve();
        return after.then(refreshTenants).then(function () {
          var body = '<p><b>' + esc(res.tenant.name) + '</b> ist angelegt. ' + esc(v.adminEmail) + ' ist Administrator' + (v.adminName ? ' (' + esc(v.adminName) + ')' : '') + ' und hat eine Einladung per E-Mail bekommen.</p><div class="notice ok">Anmelden unter: <b>' + esc(location.origin + '/dms') + '</b><br><span class="muted">Mit der E-Mail-Adresse und einem Code, der per E-Mail kommt.</span></div>';
          if (res.warning) body += '<div class="notice err">' + esc(res.warning) + '</div>';
          return infoDialog('Kunde angelegt', body).then(renderCustomers);
        });
      }).catch(fail);
    });
  }

  // =====================================================================
  //  QM-HANDBUCH
  // =====================================================================

  function cleanPasted(html) {
    var allowed = { P: 1, H2: 1, H3: 1, H4: 1, UL: 1, OL: 1, LI: 1, STRONG: 1, B: 1, EM: 1, I: 1, U: 1, A: 1, BR: 1, TABLE: 1, THEAD: 1, TBODY: 1, TR: 1, TH: 1, TD: 1, BLOCKQUOTE: 1 };
    var doc = new DOMParser().parseFromString(html, 'text/html');
    function walk(node) {
      var out = '';
      node.childNodes.forEach(function (c) {
        if (c.nodeType === 3) { out += esc(c.nodeValue); return; }
        if (c.nodeType !== 1) return;
        var tag = c.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE') return;
        var inner = walk(c);
        if (tag === 'H1') tag = 'H2';
        if (!allowed[tag]) { out += (tag === 'DIV' ? '<p>' + inner + '</p>' : inner); return; }
        var t = tag.toLowerCase();
        if (t === 'a') { var hr = c.getAttribute('href') || ''; out += /^(https?:|mailto:)/i.test(hr) ? '<a href="' + esc(hr) + '">' + inner + '</a>' : inner; }
        else if (t === 'br') out += '<br>';
        else out += '<' + t + '>' + inner + '</' + t + '>';
      });
      return out;
    }
    return walk(doc.body);
  }

  function renderHandbook() {
    $('page').innerHTML = '<div class="empty">Lade …</div>';
    var draft = can('write') && S.hbDraft;
    api('/api/dms/handbook?tenantId=' + encodeURIComponent(S.tenantId) + (draft ? '&draft=1' : '')).then(function (hb) {
      S.hb = hb;
      drawHandbook();
    }).catch(function (e) { $('page').innerHTML = '<div class="notice err">' + esc(e.message) + '</div>'; });
  }

  function drawHandbook() {
    var hb = S.hb;
    if (!hb.exists) {
      var emp = '<div class="page-head"><div><h1>QM-Handbuch</h1><p>Das Managementhandbuch von ' + esc(S.tenant.name) + '.</p></div></div><div class="card"><div class="empty"><b>Das Handbuch ist noch nicht angelegt</b>';
      if (hb.canInit) emp += 'Starte mit der bewährten Vorlage von Alta Engineering (ISO 9001, 11 Kapitel mit Prozessen, Rollen und Nachweisen). Alles, was firmenspezifisch ist, steht in [eckigen Klammern] und wird von dir ausgefüllt. Oder beginne mit einem leeren Handbuch.<div class="row" style="justify-content:center;margin-top:1rem"><button class="btn primary" id="hbInit">Bewährte Vorlage anlegen (empfohlen)</button><button class="btn" id="hbInitLeer">Leer beginnen</button></div>';
      else emp += 'Eine Administratorin oder ein Administrator legt es an.';
      $('page').innerHTML = emp + '</div></div>';
      var a = $('hbInit'); if (a) a.addEventListener('click', function () { initHb('iso9001'); });
      var b = $('hbInitLeer'); if (b) b.addEventListener('click', function () { initHb('leer'); });
      return;
    }
    var canEdit = hb.canEdit, showingDraft = hb.showingDraft;
    var h = '<div class="page-head"><div><h1>' + esc(hb.title) + (canEdit && showingDraft ? ' <button class="btn sm ghost" id="hbRename" title="Titel ändern">✎</button>' : '') + '</h1><p>' +
      (hb.published ? 'Version <b>' + hb.version + '</b>, veröffentlicht am ' + fmtDay(hb.publishedAt) + ' von ' + esc(nameFromMail(hb.publishedBy)) + '.' : 'Noch nicht veröffentlicht. Nur Bearbeitende sehen diesen Entwurf.') + '</p></div>' +
      '<div class="row">' + (canEdit && hb.published ? '<div class="views" style="margin:0"><button class="view-tab' + (!showingDraft ? ' on' : '') + '" id="hbPub">Veröffentlicht</button><button class="view-tab' + (showingDraft ? ' on' : '') + '" id="hbDraftV">Entwurf' + (hb.dirty ? ' •' : '') + '</button></div>' : '') +
      '<button class="btn" id="hbJournal">📜 Änderungsjournal</button><button class="btn" id="hbPrint">🖨 Drucken / PDF</button>' + (canEdit && showingDraft ? '<button class="btn primary" id="hbAddEnd">＋ Kapitel</button>' : '') + '</div></div>';
    if (showingDraft && hb.dirty) {
      h += '<div class="notice warn hb-banner"><b>Entwurf mit Änderungen, die noch nicht veröffentlicht sind.</b> Zuletzt bearbeitet von ' + esc(nameFromMail(hb.updatedBy)) + ' am ' + fmtDateTime(hb.updatedAt) + '. Mitarbeitende sehen weiterhin die veröffentlichte Version.' +
        '<div class="row">' + (hb.canPublish ? '<button class="btn sm ok" id="hbPublish">Veröffentlichen …</button>' : '<span class="muted">Zum Veröffentlichen braucht es eine Person mit der Rolle Freigeber oder Administrator.</span>') + (hb.canPublish && hb.published ? '<button class="btn sm danger" id="hbDiscard">Änderungen verwerfen</button>' : '') + '</div></div>';
    }
    h += '<div class="hb"><nav class="hb-toc card" style="padding:.6rem" aria-label="Inhaltsverzeichnis">' + hb.chapters.map(function (c, i) { return '<a href="#kap-' + c.id + '" data-toc="' + c.id + '">' + (i + 1) + '. ' + esc(c.title) + '</a>'; }).join('') + '</nav>';
    h += '<div class="hb-body" id="hbBody">' + hb.chapters.map(function (c, i) { return chapterHtml(c, i, hb); }).join('') + '</div></div>';
    $('page').innerHTML = h;
    wireHandbook();
  }

  function chapterHtml(c, i, hb) {
    if (S.hbEditing === c.id) {
      return '<section class="hb-ch" id="kap-' + c.id + '"><input class="editor-title" type="text" id="edTitle" value="' + esc(c.title) + '"><div class="editor-wrap"><div class="editor-bar" id="edBar">' +
        '<select id="edFmt" title="Format"><option value="p">Absatz</option><option value="h3">Überschrift</option><option value="h4">Unterüberschrift</option><option value="blockquote">Zitat</option></select><span class="sep"></span>' +
        '<button data-cmd="bold" title="Fett"><b>B</b></button><button data-cmd="italic" title="Kursiv"><i>I</i></button><button data-cmd="underline" title="Unterstrichen"><u>U</u></button><span class="sep"></span>' +
        '<button data-cmd="insertUnorderedList" title="Aufzählung">• Liste</button><button data-cmd="insertOrderedList" title="Nummerierung">1. Liste</button><span class="sep"></span>' +
        '<button data-cmd="link" title="Link">🔗</button><button data-cmd="table" title="Tabelle einfügen">▦ Tabelle</button><span class="sep"></span><button data-cmd="undo" title="Rückgängig">↶</button><button data-cmd="redo" title="Wiederholen">↷</button><button data-cmd="removeFormat" title="Formatierung entfernen">Tx</button>' +
        '</div><div class="editor-area prose" id="edArea" contenteditable="true">' + c.html + '</div></div>' +
        '<div class="row" style="margin-top:.7rem"><button class="btn primary" id="edSave">Speichern</button><button class="btn" id="edCancel">Abbrechen</button><span class="muted">Änderungen werden erst nach dem Veröffentlichen für alle sichtbar.</span></div></section>';
    }
    var tools = (hb.canEdit && hb.showingDraft) ? '<div class="hb-ch-tools no-print"><button class="btn sm" data-ed="' + c.id + '">✎ Bearbeiten</button><button class="btn sm" data-up="' + c.id + '" title="Nach oben"' + (i === 0 ? ' disabled' : '') + '>↑</button><button class="btn sm" data-down="' + c.id + '" title="Nach unten"' + (i === hb.chapters.length - 1 ? ' disabled' : '') + '>↓</button><button class="btn sm" data-after="' + c.id + '" title="Kapitel danach einfügen">＋</button><button class="btn sm danger" data-del="' + c.id + '" title="Kapitel löschen">🗑</button></div>' : '';
    return '<section class="hb-ch" id="kap-' + c.id + '"><div class="hb-ch-head"><h2>' + (i + 1) + '. ' + esc(c.title) + '</h2>' + tools + '</div><div class="prose">' + c.html + '</div></section>';
  }

  function hbSave(path, method, body) { return send(method, path, Object.assign({ tenantId: S.tenantId }, body)); }
  function initHb(tpl) { send('POST', '/api/dms/handbook/init', { tenantId: S.tenantId, template: tpl }).then(function () { S.hbDraft = true; renderHandbook(); }).catch(fail); }

  function wireHandbook() {
    var hb = S.hb;
    var g = function (id) { return $(id); };
    if (g('hbPub')) g('hbPub').addEventListener('click', function () { S.hbDraft = false; S.hbEditing = null; renderHandbook(); });
    if (g('hbDraftV')) g('hbDraftV').addEventListener('click', function () { S.hbDraft = true; renderHandbook(); });
    g('hbPrint').addEventListener('click', function () { window.print(); });
    g('hbJournal').addEventListener('click', showJournal);
    if (g('hbRename')) g('hbRename').addEventListener('click', function () { askForm({ title: 'Titel des Handbuchs', fields: [{ name: 't', label: 'Titel', value: hb.title, required: true }], ok: 'Speichern' }).then(function (v) { if (v) hbSave('/api/dms/handbook/title', 'PUT', { title: v.t }).then(renderHandbook).catch(fail); }); });
    if (g('hbAddEnd')) g('hbAddEnd').addEventListener('click', function () { addChapter(hb.chapters.length ? hb.chapters[hb.chapters.length - 1].id : null); });
    if (g('hbPublish')) g('hbPublish').addEventListener('click', publishHb);
    if (g('hbDiscard')) g('hbDiscard').addEventListener('click', function () { if (confirm('Alle Änderungen seit der letzten Veröffentlichung verwerfen?')) hbSave('/api/dms/handbook/discard', 'POST', {}).then(function () { S.hbEditing = null; renderHandbook(); }).catch(fail); });
    $('page').querySelectorAll('[data-ed]').forEach(function (b) { b.addEventListener('click', function () { S.hbEditing = b.getAttribute('data-ed'); drawHandbook(); var a = $('edArea'); if (a) a.focus(); }); });
    $('page').querySelectorAll('[data-after]').forEach(function (b) { b.addEventListener('click', function () { addChapter(b.getAttribute('data-after')); }); });
    $('page').querySelectorAll('[data-up],[data-down]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-up') || b.getAttribute('data-down'), up = !!b.getAttribute('data-up');
        var ids = hb.chapters.map(function (c) { return c.id; }), i = ids.indexOf(id), j = up ? i - 1 : i + 1;
        if (j < 0 || j >= ids.length) return;
        ids.splice(j, 0, ids.splice(i, 1)[0]);
        hbSave('/api/dms/handbook/order', 'POST', { ids: ids }).then(renderHandbook).catch(fail);
      });
    });
    $('page').querySelectorAll('[data-del]').forEach(function (b) { b.addEventListener('click', function () { var c = hb.chapters.filter(function (x) { return x.id === b.getAttribute('data-del'); })[0]; if (confirm('Kapitel «' + c.title + '» löschen?')) api('/api/dms/handbook/chapter?tenantId=' + encodeURIComponent(S.tenantId) + '&id=' + encodeURIComponent(c.id), { method: 'DELETE' }).then(renderHandbook).catch(fail); }); });
    // Inhaltsverzeichnis hebt das aktuelle Kapitel hervor
    var tocs = $('page').querySelectorAll('[data-toc]');
    if ('IntersectionObserver' in window && tocs.length) {
      var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { tocs.forEach(function (a) { a.classList.toggle('on', a.getAttribute('data-toc') === e.target.id.slice(4)); }); } }); }, { rootMargin: '-20% 0px -70% 0px' });
      $('page').querySelectorAll('.hb-ch').forEach(function (s) { io.observe(s); });
    }
    if (S.hbEditing) wireEditor();
  }

  function wireEditor() {
    var area = $('edArea'), id = S.hbEditing;
    var ch = S.hb.chapters.filter(function (c) { return c.id === id; })[0];
    $('edBar').querySelectorAll('[data-cmd]').forEach(function (b) {
      b.addEventListener('mousedown', function (e) { e.preventDefault(); });
      b.addEventListener('click', function () {
        var cmd = b.getAttribute('data-cmd');
        area.focus();
        if (cmd === 'link') {
          var u = prompt('Adresse des Links (https://… oder mailto:…):', 'https://');
          if (u && /^(https?:\/\/|mailto:)/i.test(u)) document.execCommand('createLink', false, u);
        } else if (cmd === 'table') {
          var rows = Number(prompt('Wie viele Zeilen?', '3')) || 0, cols = Number(prompt('Wie viele Spalten?', '2')) || 0;
          if (rows < 1 || cols < 1) return;
          var t = '<table><thead><tr>' + new Array(cols + 1).join('<th>Titel</th>') + '</tr></thead><tbody>' + new Array(rows).join('<tr>' + new Array(cols + 1).join('<td>&nbsp;</td>') + '</tr>') + '</tbody></table><p><br></p>';
          document.execCommand('insertHTML', false, t);
        } else document.execCommand(cmd, false, null);
      });
    });
    $('edFmt').addEventListener('change', function () { area.focus(); document.execCommand('formatBlock', false, this.value === 'p' ? 'p' : this.value); this.value = 'p'; });
    area.addEventListener('paste', function (e) {
      e.preventDefault();
      var cd = e.clipboardData, html = cd.getData('text/html'), txt = cd.getData('text/plain');
      document.execCommand('insertHTML', false, html ? cleanPasted(html) : esc(txt).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>'));
    });
    $('edCancel').addEventListener('click', function () { S.hbEditing = null; drawHandbook(); });
    $('edSave').addEventListener('click', function () {
      var title = $('edTitle').value.trim();
      if (!title) { alert('Bitte einen Kapitel-Titel angeben.'); return; }
      hbSave('/api/dms/handbook/chapter', 'PUT', { id: id, title: title, html: area.innerHTML, baseUpdatedAt: ch.updatedAt }).then(function () { S.hbEditing = null; toast('Kapitel gespeichert (Entwurf).'); renderHandbook(); }).catch(function (e) {
        if (e.status === 409) { alert(e.message); S.hbEditing = null; renderHandbook(); } else fail(e);
      });
    });
  }

  function addChapter(afterId) {
    askForm({ title: 'Neues Kapitel', fields: [{ name: 't', label: 'Titel', required: true, placeholder: 'z.B. Arbeitssicherheit' }], ok: 'Anlegen' }).then(function (v) {
      if (!v) return;
      hbSave('/api/dms/handbook/chapter', 'PUT', { title: v.t, html: '<p>Hier schreiben …</p>', afterId: afterId }).then(function (res) { S.hbEditing = res.chapter.id; renderHandbook(); setTimeout(function () { var s = document.getElementById('kap-' + res.chapter.id); if (s) s.scrollIntoView({ block: 'center' }); }, 300); }).catch(fail);
    });
  }

  function publishHb() {
    var hb = S.hb;
    askForm({ title: 'Handbuch veröffentlichen', sub: 'Aus dem Entwurf wird <b>Version ' + (hb.version + 1) + '</b>. Ab dann sehen alle Mitarbeitenden diese Fassung.' + (hb.vierAugen ? '<br>Vier-Augen-Prinzip: Es muss jemand anderes als die bearbeitende Person veröffentlichen.' : ''), fields: [{ name: 'n', label: 'Was hat sich geändert? (kommt ins Änderungsjournal)', type: 'textarea', required: true, placeholder: 'z.B. Kapitel 5 (Führung) überarbeitet, neue Qualitätspolitik' }], ok: 'Veröffentlichen' }).then(function (v) {
      if (v) hbSave('/api/dms/handbook/publish', 'POST', { note: v.n }).then(function (r) { toast('Version ' + r.version + ' veröffentlicht.'); renderHandbook(); }).catch(fail);
    });
  }

  function showJournal() {
    var revs = (S.hb.revisions || []).slice().reverse();
    var bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = '<div class="modal wide"><h3>Änderungsjournal</h3><div class="m-sub">Jede veröffentlichte Version des Handbuchs mit Datum, Person und Änderung.</div><div class="m-body">' +
      (revs.length ? '<div class="tbl-wrap"><table style="min-width:0"><thead><tr><th>Version</th><th>Datum</th><th>Von</th><th>Änderung</th><th></th></tr></thead><tbody>' + revs.map(function (r) { return '<tr><td class="mono"><b>v' + r.version + '</b></td><td class="muted">' + fmtDay(r.at) + '</td><td>' + who(r.by) + '</td><td>' + esc(r.note) + '</td><td>' + (r.legacy ? '<span class="muted" title="Aus dem früheren Handbuch übernommen, kein Archivstand vorhanden">früher</span>' : '<button class="btn sm" data-rev="' + r.version + '">Ansehen</button> <button class="btn sm" data-diff="' + r.version + '">Änderungen</button>') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="empty">Noch keine Version veröffentlicht.</div>') +
      '</div><div class="m-foot"><button class="btn primary" data-m="ok">Schliessen</button></div></div>';
    document.body.appendChild(bg);
    bg.addEventListener('mousedown', function (e) { if (e.target === bg) bg.remove(); });
    bg.querySelector('[data-m=ok]').addEventListener('click', function () { bg.remove(); });
    bg.querySelectorAll('[data-diff]').forEach(function (b) { b.addEventListener('click', function () { window.DMSX.handbookDiff(Number(b.getAttribute('data-diff')), S.hb.revisions); }); });
    bg.querySelectorAll('[data-rev]').forEach(function (b) {
      b.addEventListener('click', function () {
        api('/api/dms/handbook/revision?tenantId=' + encodeURIComponent(S.tenantId) + '&version=' + b.getAttribute('data-rev')).then(function (res) {
          var r = res.revision;
          var v = document.createElement('div');
          v.className = 'modal-bg';
          v.innerHTML = '<div class="modal wide"><h3>' + esc(r.title) + ' · Version ' + r.version + '</h3><div class="m-sub">Veröffentlicht am ' + fmtDay(r.publishedAt) + ' von ' + esc(nameFromMail(r.publishedBy)) + '. Nur Ansicht.</div><div class="m-body">' + r.chapters.map(function (c, i) { return '<div><h2 style="font-size:1.15rem">' + (i + 1) + '. ' + esc(c.title) + '</h2><div class="prose">' + c.html + '</div></div>'; }).join('') + '</div><div class="m-foot"><button class="btn primary" data-m="ok">Schliessen</button></div></div>';
          document.body.appendChild(v);
          v.addEventListener('mousedown', function (e) { if (e.target === v) v.remove(); });
          v.querySelector('[data-m=ok]').addEventListener('click', function () { v.remove(); });
        }).catch(fail);
      });
    });
  }

  // =====================================================================
  //  RUNDGANG
  // =====================================================================

  var STEPS = [
    ['🗂️', 'Dokumentenlenkung', 'Hier liegen alle gelenkten Dokumente deiner Firma: Prüfung, Freigabe, Versionen und Überprüfungstermine an einem Ort.'],
    ['📋', 'Meine Aufgaben', 'Oben siehst du, was auf dich wartet: Prüfungen, Freigaben, fällige Überprüfungen und Lesebestätigungen. Ein Klick auf eine Kachel filtert die Liste.'],
    ['✅', 'Freigabe-Ablauf', 'Entwurf, Prüfung, Freigabe. Ersteller, Prüfer und Freigeber sind getrennte Rollen. Mit Vier-Augen-Prinzip darf niemand sein eigenes Dokument freigeben. Eine Ablehnung braucht immer eine Begründung.'],
    ['📘', 'QM-Handbuch', 'Das Handbuch deiner Firma lässt sich direkt hier bearbeiten, Kapitel für Kapitel. Änderungen sind zuerst ein Entwurf. Erst «Veröffentlichen» macht sie für alle sichtbar und trägt sie ins Änderungsjournal ein.'],
    ['👥', 'Benutzer', 'Administratoren laden Personen per E-Mail ein und vergeben Rollen: Leser, Ersteller, Prüfer, Freigeber oder Administrator. Ein Passwort braucht niemand, die Anmeldung läuft mit einem Code per E-Mail.'],
    ['⚙️', 'Einstellungen', 'Kategorien mit Kürzeln (daraus entstehen Nummern wie QM-001), das Vier-Augen-Prinzip und das Standard-Überprüfungsintervall stellst du hier ein.']
    ['📊', 'Übersicht', 'Das Dashboard zeigt auf einen Blick: Freigaben pro Monat, wie lange eine Freigabe dauert, Dokumente pro Abteilung und welche Überprüfungen fällig sind. Jedes Diagramm gibt es auch als Tabelle.'],
    ['📄', 'Dokumentvorlagen', 'Ein neues Dokument startest du aus einer Vorlage, zum Beispiel Verfahrensanweisung oder Prüfprotokoll. Du bekommst eine Word-Startdatei mit Kopf und Gliederung. Eigene Vorlagen legt ein Administrator in den Einstellungen an.'],
    ['🔎', 'Suche im Dateiinhalt', 'Die Suche findet nicht nur Titel und Schlagworte, sondern auch Wörter im PDF. Neue Dateien werden beim Hochladen automatisch durchsuchbar gemacht.'],
    ['⇄', 'Versionen vergleichen', 'Im Reiter «Versionen» siehst du zwei Versionen nebeneinander und alle Änderungen im Text hervorgehoben. Auch beim Handbuch gibt es im Änderungsjournal die Ansicht «Änderungen».'],
    ['👥', 'Gruppen und Verteiler', 'Unter «Benutzer» legst du Gruppen an, zum Beispiel «Produktion». Bei einem Dokument mit Lesepflicht wählst du die Gruppen, die es lesen müssen. Nur sie bekommen die Aufgabe.'],
    ['🧾', 'Auditbericht', 'Mit einem Klick erzeugst du ein PDF für Auditoren: alle gültigen Dokumente mit Version, Freigabe und Überprüfungsdatum, offene Punkte, Lesebestätigungen und das Handbuch.'],
  ];
  function tour() {
    var i = 0;
    var bg = document.createElement('div');
    bg.className = 'modal-bg';
    document.body.appendChild(bg);
    function draw() {
      var s = STEPS[i];
      bg.innerHTML = '<div class="modal" style="text-align:center"><div style="font-size:2.4rem;padding-top:1.3rem">' + s[0] + '</div><h3>' + esc(s[1]) + '</h3><div class="m-sub" style="font-size:.95rem">' + esc(s[2]) + '</div><div class="m-foot" style="justify-content:space-between;margin-top:.6rem"><button class="btn" data-m="back"' + (i === 0 ? ' style="visibility:hidden"' : '') + '>Zurück</button><span class="muted" style="align-self:center">' + (i + 1) + ' / ' + STEPS.length + '</span><span><button class="btn ghost" data-m="skip">Überspringen</button> <button class="btn primary" data-m="next">' + (i === STEPS.length - 1 ? 'Fertig' : 'Weiter') + '</button></span></div></div>';
      bg.querySelector('[data-m=back]').addEventListener('click', function () { i--; draw(); });
      bg.querySelector('[data-m=skip]').addEventListener('click', function () { bg.remove(); });
      bg.querySelector('[data-m=next]').addEventListener('click', function () { if (i < STEPS.length - 1) { i++; draw(); } else bg.remove(); });
    }
    draw();
  }

  // ---------- Verdrahtung ----------

  $('drawerBg').addEventListener('click', closeDrawer);
  window.addEventListener('resize', function () { var d = S.openDocId && findDoc(S.openDocId); if (d) renderDrawer(d); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !document.querySelector('.modal-bg')) closeDrawer(); });
  $('tenantSwitcher').addEventListener('change', function () { switchTenant(this.value); });
  $('helpBtn').addEventListener('click', tour);
  $('themeBtn').addEventListener('click', function () {
    var root = document.documentElement;
    var cur = root.getAttribute('data-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    var next = cur === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) { /* egal */ }
  });
  window.__dms = {
    S: S, $: $, esc: esc, api: api, send: send, askForm: askForm, infoDialog: infoDialog, toast: toast, fail: fail,
    fmtDay: fmtDay, fmtDateTime: fmtDateTime, nameFromMail: nameFromMail, who: who, can: can, daysUntil: daysUntil,
    todayIso: todayIso, findDoc: findDoc, openDrawer: openDrawer, loadDocs: loadDocs, afterChange: afterChange,
    newDoc: newDoc, renderDocuments: renderDocuments, drawRows: drawRows, requiredReaders: requiredReaders,
    reviewState: reviewState, taskFor: taskFor, STATUS_LABEL: STATUS_LABEL, formatSize: formatSize, route: route, renderSettings: renderSettings, renderUsers: renderUsers
  };
  boot();
})();
