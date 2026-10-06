// QM-Handbuch pro Kunde, online editierbar.
//
// Zwei Staende pro Kunde: die Arbeitskopie ("hb:<tenantId>", wird bearbeitet) und die
// veroeffentlichte Fassung ("hbpub:<tenantId>", sehen alle Mitglieder). Beim Veroeffentlichen entsteht
// eine nummerierte Revision ("hbrev:<tenantId>:<n>"), das Aenderungsjournal steht in der Arbeitskopie.
// Der HTML-Inhalt der Kapitel wird beim Speichern serverseitig bereinigt (nur eine kleine Liste
// harmloser Tags, keine Skripte, keine Attribute ausser href).

import { can, resolveAccess } from "./dms-core.js";
import { ALTA_TEMPLATE } from "./handbook-template.js";

const ALLOWED_TAGS = new Set([
  "p", "h2", "h3", "h4", "ul", "ol", "li", "strong", "b", "em", "i", "u", "a", "br", "hr",
  "table", "thead", "tbody", "tr", "th", "td", "blockquote", "code", "pre", "sup", "sub", "span", "div",
]);
const MAX_CHAPTERS = 80;
const MAX_HTML = 250000;

function escText(s) {
  return s.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escAttr(s) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function sanitizeHtml(input) {
  let s = String(input || "").slice(0, MAX_HTML);
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<(script|style|iframe|object|embed|svg|math|form|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, "");
  s = s.replace(/<h1(\b[^>]*)>/gi, "<h2$1>").replace(/<\/h1\s*>/gi, "</h2>");
  let out = "";
  let last = 0;
  const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  let m;
  while ((m = re.exec(s))) {
    out += escText(s.slice(last, m.index));
    last = re.lastIndex;
    const tag = m[1].toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) continue;
    if (m[0][1] === "/") {
      out += "</" + tag + ">";
      continue;
    }
    let attrs = "";
    if (tag === "a") {
      const h = /href\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(m[2]);
      const u = h ? String(h[1] != null ? h[1] : h[2]).trim() : "";
      if (/^(https?:\/\/|mailto:|#)/i.test(u)) {
        attrs = ` href="${escAttr(u)}" rel="noopener noreferrer"` + (/^https?:/i.test(u) ? ' target="_blank"' : "");
      }
    } else if (tag === "td" || tag === "th") {
      for (const a of ["colspan", "rowspan"]) {
        const x = new RegExp(a + "\\s*=\\s*[\"']?(\\d{1,2})", "i").exec(m[2]);
        if (x) attrs += ` ${a}="${x[1]}"`;
      }
    }
    out += "<" + tag + attrs + ">";
  }
  out += escText(s.slice(last));
  return out;
}

function chapterId() {
  return "k" + crypto.randomUUID().slice(0, 8);
}

function cleanTitle(v, fallback) {
  return String(v || "").replace(/\s+/g, " ").trim().slice(0, 150) || fallback || "Ohne Titel";
}

// Vorlage: das bewaehrte ISO-9001-Handbuch der Alta Engineering AG mit neutralisierten Firmenangaben
// (siehe handbook-template.js). {{firma}} wird zum Firmennamen, Stellen in eckigen Klammern sind auszufuellen.
export function isoTemplate(firma) {
  const name = String(firma || "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[ch]));
  return ALTA_TEMPLATE.map((k) => ({ id: chapterId(), title: k.title, html: k.html.replace(/{{firma}}/g, name), updatedAt: new Date().toISOString(), updatedBy: "" }));
}

async function loadHb(env, tid) {
  const raw = await env.DMS.get("hb:" + tid);
  return raw ? JSON.parse(raw) : null;
}
async function saveHb(env, hb) {
  await env.DMS.put("hb:" + hb.tenantId, JSON.stringify(hb));
}
async function loadPub(env, tid) {
  const raw = await env.DMS.get("hbpub:" + tid);
  return raw ? JSON.parse(raw) : null;
}

function touch(hb, email) {
  hb.dirty = true;
  hb.updatedAt = new Date().toISOString();
  hb.updatedBy = email;
  hb.editors = Array.from(new Set([...(hb.editors || []), email.toLowerCase()]));
}

export async function handleHandbook(ctx) {
  const { request, url, env, admin, email, json, logActivity } = ctx;
  const path = url.pathname;
  if (!path.startsWith("/api/dms/handbook")) return null;
  const method = request.method;
  const me = email.toLowerCase();

  const body = method === "GET" || method === "DELETE" ? {} : await request.json().catch(() => ({}));
  const tid = (method === "GET" || method === "DELETE" ? url.searchParams.get("tenantId") : body.tenantId) || null;
  const access = await resolveAccess(env, admin, email, tid);
  if (!access) return json({ error: "Kein Zugriff." }, 403);
  const { tenant, role } = access;
  const canEdit = can(role, "write");
  const canPublish = can(role, "publish");

  // ----- Lesen -----
  if (path === "/api/dms/handbook" && method === "GET") {
    const hb = await loadHb(env, tenant.id);
    const pub = await loadPub(env, tenant.id);
    const wantDraft = url.searchParams.get("draft") === "1" && canEdit;
    if (!hb && !pub) return json({ exists: false, canEdit, canInit: can(role, "manage"), role });
    const source = wantDraft ? hb : pub || (canEdit ? hb : null);
    if (!source) return json({ exists: false, canEdit, canInit: can(role, "manage"), role });
    const showingDraft = source === hb;
    return json({
      exists: true,
      role,
      canEdit,
      canPublish,
      showingDraft,
      dirty: !!(hb && hb.dirty),
      published: !!pub,
      version: pub ? pub.version : 0,
      publishedAt: pub ? pub.publishedAt : null,
      publishedBy: pub ? pub.publishedBy : null,
      updatedAt: hb ? hb.updatedAt : null,
      updatedBy: hb ? hb.updatedBy : null,
      title: source.title,
      chapters: source.chapters,
      revisions: hb ? hb.revisions || [] : [],
      editors: canEdit && hb ? hb.editors || [] : undefined,
      vierAugen: !!tenant.vierAugen,
    });
  }

  if (path === "/api/dms/handbook/revision" && method === "GET") {
    const n = Number(url.searchParams.get("version"));
    const raw = await env.DMS.get(`hbrev:${tenant.id}:${n}`);
    if (!raw) return json({ error: "Revision nicht gefunden." }, 404);
    return json({ revision: JSON.parse(raw) });
  }

  // ----- Schreiben -----
  if (!canEdit) return json({ error: "Dafür fehlt dir die Berechtigung." }, 403);

  if (path === "/api/dms/handbook/init" && method === "POST") {
    if (!can(role, "manage")) return json({ error: "Nur Administratoren legen das Handbuch an." }, 403);
    if (await loadHb(env, tenant.id)) return json({ error: "Das Handbuch existiert bereits." }, 409);
    const chapters = body.template === "leer"
      ? [{ id: chapterId(), title: "Erstes Kapitel", html: "<p>Hier beginnt Ihr Handbuch.</p>", updatedAt: new Date().toISOString(), updatedBy: me }]
      : isoTemplate(tenant.name);
    chapters.forEach((c) => (c.updatedBy = me));
    const hb = {
      tenantId: tenant.id,
      title: "QM-Handbuch " + tenant.name,
      chapters,
      dirty: true,
      updatedAt: new Date().toISOString(),
      updatedBy: email,
      editors: [me],
      revisions: [],
    };
    await saveHb(env, hb);
    await logActivity(env, { email, action: "Handbuch angelegt", detail: tenant.name });
    return json({ ok: true });
  }

  const hb = await loadHb(env, tenant.id);
  if (!hb) return json({ error: "Das Handbuch ist noch nicht angelegt." }, 404);

  if (path === "/api/dms/handbook/title" && method === "PUT") {
    hb.title = cleanTitle(body.title, hb.title);
    touch(hb, email);
    await saveHb(env, hb);
    return json({ ok: true, title: hb.title });
  }

  if (path === "/api/dms/handbook/chapter" && method === "PUT") {
    const title = cleanTitle(body.title);
    const html = sanitizeHtml(body.html);
    let ch = body.id ? hb.chapters.find((c) => c.id === body.id) : null;
    if (body.id && !ch) return json({ error: "Kapitel nicht gefunden." }, 404);
    if (ch) {
      if (body.baseUpdatedAt && ch.updatedAt !== body.baseUpdatedAt) {
        return json({ error: `Das Kapitel wurde inzwischen von ${ch.updatedBy || "jemand anderem"} geändert. Bitte neu laden, damit nichts überschrieben wird.`, conflict: true, chapter: ch }, 409);
      }
      ch.title = title;
      ch.html = html;
    } else {
      if (hb.chapters.length >= MAX_CHAPTERS) return json({ error: "Zu viele Kapitel." }, 400);
      ch = { id: chapterId(), title, html };
      const idx = body.afterId ? hb.chapters.findIndex((c) => c.id === body.afterId) : -1;
      hb.chapters.splice(idx >= 0 ? idx + 1 : hb.chapters.length, 0, ch);
    }
    ch.updatedAt = new Date().toISOString();
    ch.updatedBy = email;
    touch(hb, email);
    await saveHb(env, hb);
    return json({ ok: true, chapter: ch });
  }

  if (path === "/api/dms/handbook/chapter" && method === "DELETE") {
    const id = url.searchParams.get("id");
    const idx = hb.chapters.findIndex((c) => c.id === id);
    if (idx < 0) return json({ error: "Kapitel nicht gefunden." }, 404);
    if (hb.chapters.length <= 1) return json({ error: "Das letzte Kapitel lässt sich nicht löschen." }, 400);
    hb.chapters.splice(idx, 1);
    touch(hb, email);
    await saveHb(env, hb);
    return json({ ok: true });
  }

  if (path === "/api/dms/handbook/order" && method === "POST") {
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
    const byId = new Map(hb.chapters.map((c) => [c.id, c]));
    if (ids.length !== hb.chapters.length || ids.some((i) => !byId.has(i))) return json({ error: "Ungültige Reihenfolge." }, 400);
    hb.chapters = ids.map((i) => byId.get(i));
    touch(hb, email);
    await saveHb(env, hb);
    return json({ ok: true });
  }

  if (path === "/api/dms/handbook/discard" && method === "POST") {
    if (!canPublish) return json({ error: "Nur Freigeber und Administratoren verwerfen Änderungen." }, 403);
    const pub = await loadPub(env, tenant.id);
    if (!pub) return json({ error: "Es gibt noch keine veröffentlichte Fassung." }, 400);
    hb.title = pub.title;
    hb.chapters = JSON.parse(JSON.stringify(pub.chapters));
    hb.dirty = false;
    hb.editors = [];
    hb.updatedAt = new Date().toISOString();
    hb.updatedBy = email;
    await saveHb(env, hb);
    return json({ ok: true });
  }

  if (path === "/api/dms/handbook/publish" && method === "POST") {
    if (!canPublish) return json({ error: "Nur Freigeber und Administratoren veröffentlichen das Handbuch." }, 403);
    const pub = await loadPub(env, tenant.id);
    if (pub && !hb.dirty) return json({ error: "Es gibt keine Änderungen zu veröffentlichen." }, 400);
    const note = String(body.note || "").trim().slice(0, 500);
    if (!note) return json({ error: "Bitte kurz angeben, was sich geändert hat (Änderungsjournal)." }, 400);
    if (tenant.vierAugen && !admin) {
      const others = (hb.editors || []).filter((e) => e !== me);
      if ((hb.editors || []).length && others.length === 0) {
        return json({ error: "Vier-Augen-Prinzip: Wer alle Änderungen selbst gemacht hat, darf sie nicht selbst veröffentlichen." }, 403);
      }
    }
    const version = (pub ? pub.version : 0) + 1;
    const snapshot = {
      tenantId: tenant.id,
      version,
      publishedAt: new Date().toISOString(),
      publishedBy: email,
      note,
      title: hb.title,
      chapters: JSON.parse(JSON.stringify(hb.chapters)),
    };
    await env.DMS.put("hbpub:" + tenant.id, JSON.stringify(snapshot));
    await env.DMS.put(`hbrev:${tenant.id}:${version}`, JSON.stringify(snapshot));
    hb.revisions = [...(hb.revisions || []), { version, at: snapshot.publishedAt, by: email, note, editors: hb.editors || [] }];
    hb.dirty = false;
    hb.editors = [];
    await saveHb(env, hb);
    await logActivity(env, { email, action: "Handbuch veröffentlicht", detail: `${tenant.name} v${version}: ${note}` });
    return json({ ok: true, version });
  }

  return json({ error: "Unbekannter Endpunkt." }, 404);
}
