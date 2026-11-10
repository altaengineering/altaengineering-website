// Datenspur: eigene Daten rueckwaerts suchen (nur Admins).
//
//   POST /api/datenspur/suche  { q }                 Text (Zeichnungsnummer, Name, E-Mail, Telefon) in
//                                                     Dateinamen, Freigabe-Links, Website-Anfragen,
//                                                     Zugangsanfragen, Dokumentenlenkung, CAD-Kommentaren
//                                                     und dem Aktivitaetsprotokoll finden.
//   POST /api/datenspur/datei  { md5, size, name }   Eine aufgetauchte Datei der Quelle im Portal zuordnen:
//                                                     MD5 aus dem Browser gegen den ETag in Backblaze,
//                                                     dazu die Freigabe-Links, in denen sie steckte.
//
// Zweck: Herkunft eines Lecks finden ("woher stammt diese Zeichnung?") und Auskunft nach DSG
// ("welche Daten haben wir ueber diese Person?"). Es wird nur in den eigenen Daten des Portals
// gesucht, nichts im Internet. Jede Suche wird im Aktivitaetsprotokoll festgehalten.

const MAX_TREFFER = 200;
const MAX_LOG = 2000; // juengste Protokolleintraege, die durchsucht werden
const MAX_KV = 3000;

async function listKeys(ns, prefix, max = MAX_KV) {
  const names = [];
  let cursor;
  do {
    const page = await ns.list({ prefix, cursor, limit: 1000 });
    for (const k of page.keys) names.push(k.name);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor && names.length < max);
  return names.slice(0, max);
}

async function loadAll(ns, names) {
  const out = [];
  // in kleinen Gruppen parallel, damit die Anzahl gleichzeitiger KV-Abfragen begrenzt bleibt
  for (let i = 0; i < names.length; i += 25) {
    const part = await Promise.all(names.slice(i, i + 25).map((n) => ns.get(n)));
    part.forEach((raw, j) => {
      if (!raw) return;
      try { out.push({ name: names[i + j], value: JSON.parse(raw) }); } catch (e) { /* defekter Eintrag */ }
    });
  }
  return out;
}

export function normalize(text) {
  return String(text ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Telefonnummern ohne Leerzeichen, Punkte, Striche vergleichen; +41 und 0 gleich behandeln
export function phoneKey(text) {
  const digits = String(text ?? "").replace(/[^0-9+]/g, "");
  if (digits.length < 6) return null;
  return digits.replace(/^\+41/, "0").replace(/^0041/, "0");
}

export function makeMatcher(q) {
  const n = normalize(q).trim();
  const pk = /^[+0-9][0-9 ./-]{5,}$/.test(String(q).trim()) ? phoneKey(q) : null;
  return (value) => {
    const s = typeof value === "string" ? value : JSON.stringify(value);
    if (normalize(s).includes(n)) return true;
    if (pk) {
      const flat = String(s).replace(/[^0-9+]/g, "").replace(/\+41/g, "0").replace(/0041/g, "0");
      return flat.includes(pk);
    }
    return false;
  };
}

function shareActive(s) {
  return !s.revoked && !(s.expiresAt && new Date(s.expiresAt).getTime() < Date.now());
}

function shareInfo(s) {
  return {
    id: s.id, label: s.label || "", createdBy: s.createdBy || "", createdAt: s.createdAt, expiresAt: s.expiresAt,
    active: shareActive(s), revoked: Boolean(s.revoked), downloads: s.downloadCount || 0,
    lastDownloadAt: s.lastDownloadAt || null, files: (s.files || []).map((f) => f.name || f.key),
  };
}

function snippet(text, matchFn, q) {
  const s = String(text ?? "");
  if (!s) return "";
  const i = normalize(s).indexOf(normalize(q));
  if (i < 0) return s.slice(0, 140);
  return (i > 40 ? "…" : "") + s.slice(Math.max(0, i - 40), i + 100) + (s.length > i + 100 ? "…" : "");
}

async function loadDocsById(env) {
  const docs = await loadAll(env.DMS, await listKeys(env.DMS, "doc:"));
  const map = new Map();
  for (const d of docs) map.set(d.value.id, d.value);
  return map;
}

export async function handleDatenspur({ request, url, env, admin, email, json, listObjects, logActivity }) {
  if (!url.pathname.startsWith("/api/datenspur/")) return null;
  if (!admin) return json({ error: "Keine Berechtigung." }, 403);
  if (request.method !== "POST") return json({ error: "Nicht erlaubt." }, 405);
  const body = await request.json().catch(() => ({}));

  if (url.pathname === "/api/datenspur/suche") {
    const q = String(body.q || "").trim().slice(0, 200);
    if (q.length < 2) return json({ error: "Bitte mindestens zwei Zeichen eingeben." }, 400);
    const hit = makeMatcher(q);

    const [listed, shares, hshares, inqs, reqs, docs, cads, logNames] = await Promise.all([
      listObjects(env, "", null, { maxPages: 150 }),
      listKeys(env.SHARES, "share:").then((n) => loadAll(env.SHARES, n)),
      listKeys(env.SHARES, "hshare:").then((n) => loadAll(env.SHARES, n)),
      listKeys(env.REQUESTS, "inq:").then((n) => loadAll(env.REQUESTS, n)),
      listKeys(env.REQUESTS, "req:").then((n) => loadAll(env.REQUESTS, n)),
      env.DMS ? listKeys(env.DMS, "doc:").then((n) => loadAll(env.DMS, n)) : [],
      env.DMS ? listKeys(env.DMS, "cad:").then((n) => loadAll(env.DMS, n)) : [],
      listKeys(env.ACTIVITY, "log:", 100000),
    ]);
    const logs = await loadAll(env.ACTIVITY, logNames.slice(-MAX_LOG));

    const result = {
      q,
      dateien: listed.objects
        .filter((o) => !o.key.endsWith("/") && hit(o.key))
        .slice(0, MAX_TREFFER)
        .map((o) => ({ key: o.key, ordner: o.key.split("/")[0], name: o.key.split("/").pop(), size: o.size, uploaded: o.uploaded })),
      freigaben: shares.map((x) => x.value).filter((s) => hit([s.label, s.createdBy, (s.files || []).map((f) => f.key)])).map(shareInfo),
      handbuchLinks: hshares.map((x) => x.value).filter((s) => hit([s.label, s.createdBy])).map((s) => ({
        id: s.id, label: s.label || "", createdBy: s.createdBy || "", createdAt: s.createdAt, expiresAt: s.expiresAt, active: shareActive(s), views: s.viewCount || 0,
      })),
      anfragen: inqs.map((x) => x.value).filter((i) => hit(i)).map((i) => ({
        id: i.id, am: i.submittedAt, name: i.name, email: i.email, firma: i.company || "", telefon: i.phone || "",
        thema: i.topic || "", status: i.status, auszug: snippet(i.message, hit, q),
      })),
      zugangsanfragen: reqs.map((x) => x.value).filter((r) => hit(r)).map((r) => ({
        id: r.id, am: r.submittedAt, name: r.name, email: r.email, firma: r.company || "", status: r.status, auszug: snippet(r.message, hit, q),
      })),
      dokumente: docs.map((x) => x.value).filter((d) => hit([d.title, d.docNumber, d.createdBy, (d.versions || []).map((v) => [v.filename, v.uploadedBy, v.note])])).slice(0, MAX_TREFFER).map((d) => ({
        id: d.id, tenantId: d.tenantId, titel: d.title, nummer: d.docNumber || "", status: d.status || "", versionen: (d.versions || []).length,
      })),
      cadKommentare: cads.map((x) => x.value).flatMap((c) => [
        ...(c.notes || []).filter((n) => hit([n.text, n.author])).map((n) => ({ datei: c.key, art: "Kommentar", wer: n.author, am: n.at || n.createdAt, text: snippet(n.text, hit, q) })),
        ...(c.approvals || []).filter((a) => hit([a.by, a.comment])).map((a) => ({ datei: c.key, art: "Freigabe", wer: a.by, am: a.at, text: a.comment || "" })),
      ]).filter((x) => x).slice(0, MAX_TREFFER),
      protokoll: logs.map((x) => x.value).filter((l) => hit(l)).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, MAX_TREFFER),
      umfang: {
        dateien: listed.objects.length, dateienVollstaendig: !listed.truncated, freigaben: shares.length + hshares.length,
        anfragen: inqs.length + reqs.length, dokumente: docs.length, protokoll: logs.length, protokollGesamt: logNames.length,
      },
    };
    await logActivity(env, { email, action: "Datenspur: Suche", detail: q });
    return json(result);
  }

  if (url.pathname === "/api/datenspur/datei") {
    const md5 = String(body.md5 || "").toLowerCase();
    const size = Number(body.size);
    const name = String(body.name || "").slice(0, 200);
    if (!/^[0-9a-f]{32}$/.test(md5)) return json({ error: "Ungültiger Fingerabdruck." }, 400);

    const [listed, shares, logNames] = await Promise.all([
      listObjects(env, "", null, { maxPages: 150 }),
      listKeys(env.SHARES, "share:").then((n) => loadAll(env.SHARES, n)),
      listKeys(env.ACTIVITY, "log:", 100000),
    ]);
    const files = listed.objects.filter((o) => !o.key.endsWith("/"));
    const exakt = files.filter((o) => (o.etag || "").toLowerCase() === md5);
    const gleicheGroesse = Number.isFinite(size) && size > 0
      ? files.filter((o) => o.size === size && !exakt.includes(o)).slice(0, 20)
      : [];
    const keys = new Set(exakt.map((o) => o.key));
    const namen = new Set([name, ...exakt.map((o) => o.key.split("/").pop())].filter(Boolean).map((n) => n.replace(/^v\d+__/, "")));

    const freigaben = shares.map((x) => x.value).filter((s) => (s.files || []).some((f) => keys.has(f.key))).map(shareInfo);
    const logs = await loadAll(env.ACTIVITY, logNames.slice(-MAX_LOG));
    const protokoll = logs.map((x) => x.value)
      .filter((l) => [...namen].some((n) => n && String(l.detail || "").includes(n)))
      .sort((a, b) => String(b.at).localeCompare(String(a.at)))
      .slice(0, MAX_TREFFER);

    // Dateien der Dokumentenlenkung (_dms/<tenant>/<docId>/...) mit Titel und Nummer anreichern
    let docsById = null;
    const beschreibe = async (o) => {
      const teile = o.key.split("/");
      const info = { key: o.key, ordner: teile[0], name: teile[teile.length - 1], size: o.size, uploaded: o.uploaded };
      if (teile[0] === "_dms" && env.DMS) {
        docsById = docsById || (await loadDocsById(env));
        const d = docsById.get(teile[2]);
        if (d) info.dokument = { id: d.id, tenantId: d.tenantId, titel: d.title, nummer: d.docNumber || "" };
      }
      return info;
    };
    const result = {
      md5,
      exakt: await Promise.all(exakt.map(beschreibe)),
      gleicheGroesse: await Promise.all(gleicheGroesse.map(beschreibe)),
      freigaben,
      protokoll,
      umfang: { dateien: files.length, dateienVollstaendig: !listed.truncated, mitFingerabdruck: files.filter((o) => o.etag).length },
    };
    await logActivity(env, { email, action: "Datenspur: Datei geprüft", detail: name + " (" + (exakt.length ? exakt.length + " Treffer" : "kein Treffer") + ")" });
    return json(result);
  }

  return json({ error: "Nicht gefunden." }, 404);
}
