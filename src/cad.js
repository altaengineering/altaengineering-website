// CAD-Viewer (/viewer): Kommentare am Modell und Freigaben.
//
// Das Modell selbst wird im Browser gelesen und dargestellt (public/viewer.js), der Worker sieht die
// Datei nur beim normalen Download. Hier liegen ausschliesslich die Anmerkungen und Freigaben. Sie
// stehen in der KV-Namespace DMS (wird taeglich gesichert, siehe backup.js) unter "cad:<hash des
// Dateischluessels>". Jeder Eintrag hat den Dateischluessel im Klartext, damit eine Sicherung ohne
// Hilfstabelle lesbar bleibt.
//
// Zugriff: wie beim Download, also Admins auf alle Dateien, alle anderen nur auf den eigenen Ordner.
//
// Freigabe: Sie gilt fuer genau die Fassung der Datei, die zum Zeitpunkt der Freigabe im Speicher lag.
// Dafuer speichert der Worker den ETag und die SHA-256-Pruefsumme der Datei. Wird die Datei danach
// ersetzt, zeigt der Viewer "Datei seit Freigabe geaendert".

const MAX_NOTES = 200;
const MAX_TEXT = 1000;
const MAX_APPROVALS = 50;

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function validVec(v) {
  return Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 1e9);
}

async function loadDoc(env, key) {
  const id = "cad:" + (await sha256Hex(key)).slice(0, 32);
  const raw = await env.DMS.get(id);
  const doc = raw ? JSON.parse(raw) : { key, notes: [], approvals: [] };
  return { id, doc };
}

// ETag der aktuellen Datei im Speicher, null wenn nicht lesbar.
async function currentEtag(env, key, { b2Client, bucketUrl }) {
  try {
    const res = await b2Client(env).fetch(bucketUrl(env) + "/" + key.split("/").map(encodeURIComponent).join("/"), { method: "HEAD" });
    if (!res.ok) return null;
    return (res.headers.get("etag") || "").replace(/"/g, "") || null;
  } catch {
    return null;
  }
}

// SHA-256 der Datei als Datenstrom, ohne sie im Arbeitsspeicher zu halten.
async function fileHash(env, key, { b2Client, bucketUrl }) {
  try {
    const res = await b2Client(env).fetch(bucketUrl(env) + "/" + key.split("/").map(encodeURIComponent).join("/"));
    if (!res.ok || !res.body) return { etag: null, sha256: null };
    const etag = (res.headers.get("etag") || "").replace(/"/g, "") || null;
    if (typeof crypto.DigestStream !== "function") {
      res.body.cancel().catch(() => {});
      return { etag, sha256: null };
    }
    const ds = new crypto.DigestStream("SHA-256");
    await res.body.pipeTo(ds);
    const digest = new Uint8Array(await ds.digest);
    return { etag, sha256: [...digest].map((b) => b.toString(16).padStart(2, "0")).join("") };
  } catch {
    return { etag: null, sha256: null };
  }
}

export async function handleCad({ request, url, env, admin, email, ownFolder, json, isSafeKey, b2Client, bucketUrl, logActivity }) {
  if (!url.pathname.startsWith("/api/cad/")) return null;

  const keyOf = (v) => (typeof v === "string" ? v : "");
  const allowed = (key) => isSafeKey(key) && (admin || key.startsWith(ownFolder + "/"));
  const author = (e) => e.toLowerCase();

  // Zustand laden
  if (url.pathname === "/api/cad/state" && request.method === "GET") {
    const key = keyOf(url.searchParams.get("key"));
    if (!allowed(key)) return json({ error: "Keine Berechtigung fuer diese Datei." }, 403);
    const { doc } = await loadDoc(env, key);
    const etag = await currentEtag(env, key, { b2Client, bucketUrl });
    const last = doc.approvals[doc.approvals.length - 1] || null;
    return json({
      notes: doc.notes,
      approvals: doc.approvals,
      etag,
      approval: last
        ? { ...last, current: Boolean(last.etag && etag && last.etag === etag), unknown: !last.etag || !etag }
        : null,
      me: { email, isAdmin: admin },
    });
  }

  if (url.pathname === "/api/cad/note" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const key = keyOf(body.key);
    if (!allowed(key)) return json({ error: "Keine Berechtigung fuer diese Datei." }, 403);
    const text = String(body.text || "").trim().slice(0, MAX_TEXT);
    if (text.length < 2) return json({ error: "Bitte einen Kommentar eingeben." }, 400);
    if (!validVec(body.point)) return json({ error: "Ungueltiger Punkt." }, 400);
    const view = body.view && validVec(body.view.pos) && validVec(body.view.target) ? { pos: body.view.pos, target: body.view.target } : null;
    const { id, doc } = await loadDoc(env, key);
    if (doc.notes.length >= MAX_NOTES) return json({ error: "Zu viele Kommentare an dieser Datei." }, 400);
    const note = {
      id: crypto.randomUUID(),
      author: author(email),
      text,
      point: body.point,
      view,
      createdAt: new Date().toISOString(),
      status: "offen",
    };
    doc.notes.push(note);
    await env.DMS.put(id, JSON.stringify(doc));
    await logActivity(env, { email, action: "CAD-Kommentar", detail: key });
    return json({ ok: true, note });
  }

  if (url.pathname === "/api/cad/note-status" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const key = keyOf(body.key);
    if (!allowed(key)) return json({ error: "Keine Berechtigung fuer diese Datei." }, 403);
    if (body.status !== "offen" && body.status !== "erledigt") return json({ error: "Ungueltiger Status." }, 400);
    const { id, doc } = await loadDoc(env, key);
    const note = doc.notes.find((n) => n.id === body.id);
    if (!note) return json({ error: "Kommentar nicht gefunden." }, 404);
    note.status = body.status;
    note.statusBy = author(email);
    note.statusAt = new Date().toISOString();
    await env.DMS.put(id, JSON.stringify(doc));
    return json({ ok: true, note });
  }

  if (url.pathname === "/api/cad/note" && request.method === "DELETE") {
    const key = keyOf(url.searchParams.get("key"));
    if (!allowed(key)) return json({ error: "Keine Berechtigung fuer diese Datei." }, 403);
    const noteId = url.searchParams.get("id") || "";
    const { id, doc } = await loadDoc(env, key);
    const note = doc.notes.find((n) => n.id === noteId);
    if (!note) return json({ error: "Kommentar nicht gefunden." }, 404);
    if (!admin && note.author !== author(email)) return json({ error: "Nur die Verfasserin oder der Verfasser darf den Kommentar loeschen." }, 403);
    doc.notes = doc.notes.filter((n) => n.id !== noteId);
    await env.DMS.put(id, JSON.stringify(doc));
    return json({ ok: true });
  }

  if (url.pathname === "/api/cad/approve" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const key = keyOf(body.key);
    if (!allowed(key)) return json({ error: "Keine Berechtigung fuer diese Datei." }, 403);
    const { id, doc } = await loadDoc(env, key);
    if (doc.approvals.length >= MAX_APPROVALS) return json({ error: "Zu viele Freigaben an dieser Datei." }, 400);
    const { etag, sha256 } = await fileHash(env, key, { b2Client, bucketUrl });
    const approval = {
      id: crypto.randomUUID(),
      by: author(email),
      at: new Date().toISOString(),
      comment: String(body.comment || "").trim().slice(0, 500),
      etag,
      sha256,
    };
    doc.approvals.push(approval);
    await env.DMS.put(id, JSON.stringify(doc));
    await logActivity(env, { email, action: "CAD-Freigabe", detail: key });
    return json({ ok: true, approval: { ...approval, current: Boolean(etag), unknown: !etag } });
  }

  return json({ error: "Unbekannter Endpunkt." }, 404);
}
