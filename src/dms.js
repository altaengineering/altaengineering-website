// Dokumentenlenkung / DMS (/dms, /api/dms/*), Version 2 (2026-10-06).
//
// Vorbild: Wivio (WBI) und M-Files. Gegenueber der ersten Version (nur Titel, Kategorie, Status und
// Dateiversionen) neu: Freigabe-Workflow mit Rollen (Ersteller, Pruefer, Freigeber) und optionalem
// Vier-Augen-Prinzip, Ablehnung nur mit Kommentar, Dokumentnummern, Verantwortliche, Wiedervorlage
// (naechste Ueberpruefung), lueckenloser Verlauf (Audit-Trail) mit Kommentaren, Lesebestaetigung,
// Check-out/Bearbeitungssperre, verknuepfte Dokumente, Schlagworte, Archiv, gueltige Version bleibt
// abrufbar waehrend eine neue Version bearbeitet wird, Aenderungsgrund pro Version, CSV-Export.
//
// Mandantenfaehig wie bisher: jeder Kunde ("Tenant") hat eigene Kategorien und Dokumente. Metadaten
// liegen in der KV-Namespace DMS ("tenant:<id>", "doc:<id>"), die Dateien in B2 unter
// "_dms/<tenantId>/<docId>/vN__<name>" (Upload direkt vom Browser per presigned URL).

export const DMS_STATUSES = ["entwurf", "in_pruefung", "geprueft", "freigegeben", "archiviert"];
export const DMS_STATUS_LABEL = {
  entwurf: "Entwurf",
  in_pruefung: "In Prüfung",
  geprueft: "Geprüft",
  freigegeben: "Freigegeben",
  archiviert: "Archiviert",
};
export const DMS_DEFAULT_CATEGORIES = [
  "Engineering",
  "Qualitätsmanagement",
  "Administration",
  "Finanzen",
  "Vertrieb",
  "Allgemein",
];
const DEFAULT_PREFIXES = {
  Engineering: "ENG",
  "Qualitätsmanagement": "QM",
  Administration: "ADM",
  Finanzen: "FIN",
  Vertrieb: "VER",
  Allgemein: "ALL",
};
const DEFAULT_REVIEW_MONTHS = 12;
const HISTORY_LIMIT = 400;
const SCHEMA = 2;

// ---------- kleine Helfer ----------

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addMonthsIso(dateStr, months) {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

function normEmail(v) {
  const s = String(v || "").trim().toLowerCase();
  return s.includes("@") ? s.slice(0, 200) : "";
}

function normTags(v) {
  const arr = Array.isArray(v) ? v : String(v || "").split(",");
  const out = [];
  for (const t of arr) {
    const s = String(t).trim().slice(0, 30);
    if (s && !out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s);
    if (out.length >= 12) break;
  }
  return out;
}

function normMonths(v, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 120) return fallback;
  return Math.round(n);
}

function fallbackPrefix(category) {
  const letters = String(category || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();
  return (letters.slice(0, 3) || "DOK").padEnd(3, "X");
}

function prefixFor(tenant, category) {
  return (tenant.categoryPrefixes && tenant.categoryPrefixes[category]) || DEFAULT_PREFIXES[category] || fallbackPrefix(category);
}

function nextDocNumber(tenant, category) {
  const prefix = prefixFor(tenant, category);
  tenant.counters = tenant.counters || {};
  const n = (tenant.counters[prefix] || 0) + 1;
  tenant.counters[prefix] = n;
  return prefix + "-" + String(n).padStart(3, "0");
}

function histEntry(by, type, extra) {
  return { at: new Date().toISOString(), by, type, ...extra };
}

function pushHistory(doc, entry) {
  doc.history = doc.history || [];
  doc.history.push(entry);
  if (doc.history.length > HISTORY_LIMIT) doc.history = doc.history.slice(-HISTORY_LIMIT);
}

function contentTypeFor(filename) {
  const ext = String(filename).split(".").pop().toLowerCase();
  const map = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    txt: "text/plain; charset=utf-8",
  };
  return map[ext] || null;
}

// ---------- Speicher ----------

export async function loadTenant(env, id) {
  const raw = id && (await env.DMS.get("tenant:" + id));
  return raw ? JSON.parse(raw) : null;
}

export async function listTenants(env) {
  const list = await env.DMS.list({ prefix: "tenant:" });
  const items = [];
  for (const k of list.keys) {
    const raw = await env.DMS.get(k.name);
    if (raw) items.push(JSON.parse(raw));
  }
  items.sort((a, b) => a.name.localeCompare(b.name, "de"));
  return items;
}

// Ordnet eine eingeloggte, nicht-admin E-Mail ihrem Tenant zu, ueber die Domain nach dem "@".
export async function resolveTenantForEmail(env, mail) {
  const domain = mail.split("@")[1]?.toLowerCase();
  if (!domain) return null;
  const tenants = await listTenants(env);
  return tenants.find((t) => (t.domains || []).some((d) => d.toLowerCase() === domain)) || null;
}

async function loadDoc(env, id) {
  const raw = id && (await env.DMS.get("doc:" + id));
  return raw ? JSON.parse(raw) : null;
}

async function saveDoc(env, doc) {
  await env.DMS.put("doc:" + doc.id, JSON.stringify(doc));
}

async function saveTenant(env, tenant) {
  await env.DMS.put("tenant:" + tenant.id, JSON.stringify(tenant));
}

// Hebt aeltere Dokumente (Version 1: nur Titel/Kategorie/Status/Versionen) auf den neuen Stand:
// Dokumentnummer, Verlauf aus den vorhandenen Versionen, gueltige Version, Wiedervorlage.
// Gibt true zurueck, wenn das Dokument veraendert wurde (dann speichern).
function upgradeDoc(doc, tenant) {
  if (doc.schema === SCHEMA) return false;
  doc.tags = doc.tags || [];
  doc.description = doc.description || "";
  doc.owner = doc.owner || doc.createdBy || "";
  doc.reviewer = doc.reviewer || "";
  doc.approver = doc.approver || "";
  doc.related = doc.related || [];
  doc.reads = doc.reads || {};
  doc.lock = doc.lock || null;
  doc.readRequired = !!doc.readRequired;
  doc.reviewIntervalMonths = doc.reviewIntervalMonths == null ? DEFAULT_REVIEW_MONTHS : doc.reviewIntervalMonths;
  if (!doc.docNumber) doc.docNumber = nextDocNumber(tenant, doc.category);
  if (!doc.history || !doc.history.length) {
    doc.history = [{ at: doc.createdAt, by: doc.createdBy, type: "angelegt", text: "Dokument angelegt" }];
    for (const v of doc.versions || []) {
      doc.history.push({
        at: v.uploadedAt,
        by: v.uploadedBy,
        type: "version",
        version: v.version,
        text: `Version ${v.version} hochgeladen (${v.filename})`,
      });
    }
  }
  if (doc.status === "freigegeben") {
    doc.releasedVersion = doc.currentVersion;
    const since = (doc.updatedAt || doc.createdAt || new Date().toISOString()).slice(0, 10);
    doc.validFrom = doc.validFrom || since;
    doc.nextReview =
      doc.nextReview || (doc.reviewIntervalMonths > 0 ? addMonthsIso(since, doc.reviewIntervalMonths) : null);
  } else {
    doc.releasedVersion = doc.releasedVersion || null;
    doc.validFrom = doc.validFrom || null;
    doc.nextReview = doc.nextReview || null;
  }
  doc.schema = SCHEMA;
  return true;
}

async function loadTenantDocs(env, tenant) {
  const list = await env.DMS.list({ prefix: "doc:" });
  const items = [];
  let tenantDirty = false;
  for (const k of list.keys) {
    const raw = await env.DMS.get(k.name);
    if (!raw) continue;
    const d = JSON.parse(raw);
    if (d.tenantId !== tenant.id) continue;
    if (upgradeDoc(d, tenant)) {
      tenantDirty = true;
      await saveDoc(env, d);
    }
    items.push(d);
  }
  if (tenantDirty) await saveTenant(env, tenant);
  return items;
}

// ---------- Zugriff ----------

// Admins duerfen jeden Tenant ansteuern, Kunden-Nutzer:innen sind auf den per E-Mail-Domain
// aufgeloesten Tenant beschraenkt, ein fremder tenantId-Parameter von ihnen wird nie vertraut.
async function resolveAccessibleTenant(env, admin, email, requestedTenantId) {
  if (admin) {
    if (requestedTenantId) return loadTenant(env, requestedTenantId);
    const all = await listTenants(env);
    return all[0] || null;
  }
  return resolveTenantForEmail(env, email);
}

async function docWithAccess(env, admin, email, docId) {
  const doc = await loadDoc(env, docId);
  if (!doc) return { error: ["Dokument nicht gefunden.", 404] };
  const tenant = await resolveAccessibleTenant(env, admin, email, doc.tenantId);
  if (!tenant || tenant.id !== doc.tenantId) return { error: ["Keine Berechtigung.", 403] };
  if (upgradeDoc(doc, tenant)) {
    await saveDoc(env, doc);
    await saveTenant(env, tenant);
  }
  return { doc, tenant };
}

function objectUrlFor(bucketUrl, env, key) {
  return bucketUrl(env) + "/" + key.split("/").map(encodeURIComponent).join("/");
}

// ---------- Mail ----------

async function notify(ctx, tenant, doc, to, subject, line) {
  const empfaenger = (Array.isArray(to) ? to : [to]).map(normEmail).filter(Boolean).filter((m) => m !== ctx.email.toLowerCase());
  if (!empfaenger.length) return;
  const link = "https://" + (ctx.env.PORTAL_HOSTNAME || "alta-kundenportal.alta-engineering.workers.dev") + "/dms";
  try {
    await ctx.sendMail(ctx.env, {
      to: empfaenger,
      subject: `${subject}: ${doc.docNumber} ${doc.title}`,
      text: `${line}\n\nKunde: ${tenant.name}\nDokument: ${doc.docNumber} ${doc.title}\n\nZur Dokumentenlenkung: ${link}\n`,
    });
  } catch (e) {
    console.error("DMS-Mail fehlgeschlagen:", e);
  }
}

// ---------- Endpunkte ----------

export async function handleDms(ctx) {
  const { request, url, env, admin, email, json, b2Client, bucketUrl, logActivity } = ctx;
  const path = url.pathname;
  if (!path.startsWith("/api/dms/")) return null;
  const method = request.method;
  const me = email.toLowerCase();

  // ----- Kunden (Tenants), nur Admins -----

  if (path === "/api/dms/tenants" && method === "GET") {
    if (!admin) return json({ error: "Keine Berechtigung." }, 403);
    const tenants = await listTenants(env);
    const docList = await env.DMS.list({ prefix: "doc:" });
    const counts = {};
    for (const k of docList.keys) {
      const raw = await env.DMS.get(k.name);
      if (!raw) continue;
      const d = JSON.parse(raw);
      counts[d.tenantId] = (counts[d.tenantId] || 0) + 1;
    }
    return json({ tenants: tenants.map((t) => ({ ...t, documentCount: counts[t.id] || 0 })) });
  }

  if (path === "/api/dms/tenants" && method === "POST") {
    if (!admin) return json({ error: "Keine Berechtigung." }, 403);
    const body = await request.json().catch(() => ({}));
    const name = (body.name || "").trim().slice(0, 200);
    if (!name) return json({ error: "Kein Name angegeben." }, 400);
    const domains = Array.isArray(body.domains)
      ? body.domains.map((d) => String(d).trim().toLowerCase()).filter(Boolean)
      : String(body.domains || "").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);

    let categories = Array.isArray(body.categories) ? body.categories.map((c) => String(c).trim()).filter(Boolean) : [];
    let categoryPrefixes = {};
    let vierAugen = !!body.vierAugen;
    if (categories.length === 0 && body.copyFromTenantId) {
      const vorlage = await loadTenant(env, body.copyFromTenantId);
      if (vorlage) {
        categories = [...vorlage.categories];
        categoryPrefixes = { ...(vorlage.categoryPrefixes || {}) };
        if (body.vierAugen === undefined) vierAugen = !!vorlage.vierAugen;
      }
    }
    if (categories.length === 0) categories = [...DMS_DEFAULT_CATEGORIES];

    const id = crypto.randomUUID();
    const tenant = {
      id,
      name,
      domains,
      categories,
      categoryPrefixes,
      counters: {},
      vierAugen,
      createdAt: new Date().toISOString(),
      createdBy: email,
    };
    await saveTenant(env, tenant);
    await logActivity(env, { email, action: "DMS-Kunde angelegt", detail: name });
    return json({ ok: true, tenant });
  }

  if (path === "/api/dms/tenants" && method === "PUT") {
    if (!admin) return json({ error: "Keine Berechtigung." }, 403);
    const body = await request.json().catch(() => ({}));
    const tenant = await loadTenant(env, body.id);
    if (!tenant) return json({ error: "Kunde nicht gefunden." }, 404);
    if (body.name != null) tenant.name = String(body.name).trim().slice(0, 200) || tenant.name;
    if (body.domains != null) {
      tenant.domains = Array.isArray(body.domains)
        ? body.domains.map((d) => String(d).trim().toLowerCase()).filter(Boolean)
        : String(body.domains).split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
    }
    if (body.categories != null) {
      tenant.categories = Array.isArray(body.categories)
        ? body.categories.map((c) => String(c).trim()).filter(Boolean)
        : String(body.categories).split(",").map((c) => c.trim()).filter(Boolean);
    }
    if (body.vierAugen != null) tenant.vierAugen = !!body.vierAugen;
    if (body.categoryPrefixes && typeof body.categoryPrefixes === "object") {
      tenant.categoryPrefixes = {};
      for (const [k, v] of Object.entries(body.categoryPrefixes)) {
        const p = String(v).trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
        if (p) tenant.categoryPrefixes[k] = p;
      }
    }
    await saveTenant(env, tenant);
    await logActivity(env, { email, action: "DMS-Kunde bearbeitet", detail: tenant.name });
    return json({ ok: true, tenant });
  }

  if (path === "/api/dms/tenants" && method === "DELETE") {
    if (!admin) return json({ error: "Keine Berechtigung." }, 403);
    const tenant = await loadTenant(env, url.searchParams.get("id"));
    if (!tenant) return json({ error: "Kunde nicht gefunden." }, 404);

    // Cascade: alle Dokumente dieses Tenants inkl. B2-Dateien mitloeschen. b2Client() erst bauen,
    // wenn tatsaechlich eine Version zu loeschen ist (sonst scheitert das Loeschen eines leeren
    // Kunden lokal ohne B2-Secrets unnoetig).
    const docList = await env.DMS.list({ prefix: "doc:" });
    let client = null;
    for (const k of docList.keys) {
      const raw = await env.DMS.get(k.name);
      if (!raw) continue;
      const d = JSON.parse(raw);
      if (d.tenantId !== tenant.id) continue;
      if (d.versions.length > 0) {
        if (!client) client = b2Client(env);
        for (const v of d.versions) {
          await client.fetch(objectUrlFor(bucketUrl, env, v.key), { method: "DELETE" }).catch(() => {});
        }
      }
      await env.DMS.delete(k.name);
    }
    await env.DMS.delete("tenant:" + tenant.id);
    await logActivity(env, { email, action: "DMS-Kunde geloescht", detail: tenant.name });
    return json({ ok: true });
  }

  // ----- Dokumente -----

  if (path === "/api/dms/documents" && method === "GET") {
    const tenant = await resolveAccessibleTenant(env, admin, email, url.searchParams.get("tenantId"));
    if (!tenant) return json({ error: "Kein Kunde zugeordnet." }, 403);
    const items = await loadTenantDocs(env, tenant);
    items.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    return json({ documents: items, tenant, me });
  }

  if (path === "/api/dms/documents" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    const tenant = await resolveAccessibleTenant(env, admin, email, body.tenantId);
    if (!tenant) return json({ error: "Kein Kunde zugeordnet." }, 403);
    const title = (body.title || "").trim().slice(0, 200);
    if (!title) return json({ error: "Kein Titel angegeben." }, 400);
    const category = (body.category || "").trim().slice(0, 80) || tenant.categories[0] || "Allgemein";
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const doc = {
      id,
      tenantId: tenant.id,
      docNumber: nextDocNumber(tenant, category),
      title,
      category,
      description: String(body.description || "").trim().slice(0, 2000),
      tags: normTags(body.tags),
      status: "entwurf",
      currentVersion: 0,
      releasedVersion: null,
      versions: [],
      owner: normEmail(body.owner) || me,
      reviewer: normEmail(body.reviewer),
      approver: normEmail(body.approver),
      reviewIntervalMonths: normMonths(body.reviewIntervalMonths, DEFAULT_REVIEW_MONTHS),
      validFrom: null,
      nextReview: null,
      readRequired: !!body.readRequired,
      reads: {},
      related: [],
      lock: null,
      history: [],
      createdAt: now,
      createdBy: email,
      updatedAt: now,
      updatedBy: email,
      schema: SCHEMA,
    };
    pushHistory(doc, histEntry(email, "angelegt", { text: "Dokument angelegt" }));
    await saveDoc(env, doc);
    await saveTenant(env, tenant); // Zaehler der Dokumentnummern
    await logActivity(env, { email, action: "DMS-Dokument angelegt", detail: `${doc.docNumber} ${title} (${tenant.name})` });
    return json({ ok: true, document: doc });
  }

  if (path === "/api/dms/documents" && method === "PUT") {
    const body = await request.json().catch(() => ({}));
    const found = await docWithAccess(env, admin, email, body.id);
    if (found.error) return json({ error: found.error[0] }, found.error[1]);
    const { doc, tenant } = found;
    if (doc.status === "archiviert") return json({ error: "Archivierte Dokumente lassen sich nicht bearbeiten." }, 400);
    const changes = [];
    if (body.title != null) {
      const t = String(body.title).trim().slice(0, 200);
      if (!t) return json({ error: "Titel darf nicht leer sein." }, 400);
      if (t !== doc.title) changes.push("Titel");
      doc.title = t;
    }
    if (body.category != null) {
      const c = String(body.category).trim().slice(0, 80);
      if (c && c !== doc.category) {
        doc.category = c;
        changes.push("Kategorie");
      }
    }
    if (body.description != null) {
      const v = String(body.description).trim().slice(0, 2000);
      if (v !== doc.description) changes.push("Beschreibung");
      doc.description = v;
    }
    if (body.tags != null) {
      doc.tags = normTags(body.tags);
      changes.push("Schlagworte");
    }
    for (const [field, label] of [["owner", "Verantwortliche:r"], ["reviewer", "Prüfer:in"], ["approver", "Freigeber:in"]]) {
      if (body[field] != null) {
        const v = normEmail(body[field]);
        if (v !== doc[field]) changes.push(label);
        doc[field] = v;
      }
    }
    if (body.reviewIntervalMonths != null) {
      const m = normMonths(body.reviewIntervalMonths, doc.reviewIntervalMonths);
      if (m !== doc.reviewIntervalMonths) {
        doc.reviewIntervalMonths = m;
        changes.push("Überprüfungsintervall");
        if (doc.status === "freigegeben" && doc.validFrom) {
          doc.nextReview = m > 0 ? addMonthsIso(doc.validFrom, m) : null;
        }
      }
    }
    if (body.readRequired != null) {
      const v = !!body.readRequired;
      if (v !== doc.readRequired) changes.push("Lesepflicht");
      doc.readRequired = v;
    }
    if (body.related != null && Array.isArray(body.related)) {
      const ids = body.related.map(String).filter((x) => x !== doc.id);
      const valid = [];
      for (const rid of ids) {
        const r = await loadDoc(env, rid);
        if (r && r.tenantId === doc.tenantId) valid.push(rid);
      }
      doc.related = valid.slice(0, 30);
      changes.push("Verknüpfungen");
    }
    if (changes.length) {
      doc.updatedAt = new Date().toISOString();
      doc.updatedBy = email;
      pushHistory(doc, histEntry(email, "metadaten", { text: "Geändert: " + changes.join(", ") }));
      await saveDoc(env, doc);
    }
    return json({ ok: true, document: doc, tenant: undefined });
  }

  if (path === "/api/dms/documents" && method === "DELETE") {
    const found = await docWithAccess(env, admin, email, url.searchParams.get("id"));
    if (found.error) return json({ error: found.error[0] }, found.error[1]);
    const { doc } = found;
    if (!admin && doc.createdBy.toLowerCase() !== me) {
      return json({ error: "Nur Ersteller:in oder Admin dürfen löschen. Alternative: archivieren." }, 403);
    }
    if (doc.versions.length > 0) {
      const client = b2Client(env);
      for (const v of doc.versions) {
        await client.fetch(objectUrlFor(bucketUrl, env, v.key), { method: "DELETE" }).catch(() => {});
      }
    }
    await env.DMS.delete("doc:" + doc.id);
    await logActivity(env, { email, action: "DMS-Dokument geloescht", detail: `${doc.docNumber} ${doc.title}` });
    return json({ ok: true });
  }

  // ----- Versionen (Upload direkt vom Browser nach B2) -----

  if (path === "/api/dms/upload-url" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    const found = await docWithAccess(env, admin, email, body.docId);
    if (found.error) return json({ error: found.error[0] }, found.error[1]);
    const { doc } = found;
    if (doc.status === "archiviert") return json({ error: "Archivierte Dokumente nehmen keine neuen Versionen an." }, 400);
    if (doc.status === "in_pruefung" || doc.status === "geprueft") {
      return json({ error: "Das Dokument ist in Prüfung/Freigabe. Erst ablehnen oder freigeben, dann neue Version." }, 409);
    }
    if (doc.lock && doc.lock.by.toLowerCase() !== me && !admin) {
      return json({ error: `Dokument ist von ${doc.lock.by} ausgecheckt.` }, 409);
    }
    const filename = (body.filename || "").trim();
    if (!filename) return json({ error: "Kein Dateiname uebergeben." }, 400);
    if (filename.includes("/")) return json({ error: "Dateiname darf kein '/' enthalten." }, 400);
    const nextVersion = doc.currentVersion + 1;
    const key = `_dms/${doc.tenantId}/${doc.id}/v${nextVersion}__${filename}`;
    const client = b2Client(env);
    const objectUrl = new URL(objectUrlFor(bucketUrl, env, key));
    objectUrl.searchParams.set("X-Amz-Expires", "3600");
    const signed = await client.sign(new Request(objectUrl, { method: "PUT" }), { aws: { signQuery: true } });
    return json({ uploadUrl: signed.url, key, version: nextVersion, filename });
  }

  if (path === "/api/dms/upload-done" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    const found = await docWithAccess(env, admin, email, body.docId);
    if (found.error) return json({ error: found.error[0] }, found.error[1]);
    const { doc } = found;
    const version = Number(body.version) || doc.currentVersion + 1;
    const filename = (body.filename || "").trim();
    const key = (body.key || "").trim();
    if (!filename || !key) return json({ error: "Unvollstaendige Angaben." }, 400);
    const note = String(body.note || "").trim().slice(0, 500);
    if (doc.currentVersion > 0 && !note) return json({ error: "Bitte den Änderungsgrund angeben." }, 400);

    doc.versions.push({
      version,
      key,
      filename,
      size: Number(body.size) || 0,
      uploadedAt: new Date().toISOString(),
      uploadedBy: email,
      note,
    });
    doc.currentVersion = version;
    // Eine neue Version ist noch nicht geprueft. Die bisher freigegebene Version bleibt als
    // "gueltige Version" abrufbar (releasedVersion), bis die neue freigegeben ist.
    doc.status = "entwurf";
    doc.lock = null;
    doc.updatedAt = new Date().toISOString();
    doc.updatedBy = email;
    pushHistory(
      doc,
      histEntry(email, "version", {
        version,
        text: `Version ${version} hochgeladen (${filename})`,
        comment: note || undefined,
      }),
    );
    await saveDoc(env, doc);
    await logActivity(env, { email, action: "DMS-Version hochgeladen", detail: `${doc.docNumber} ${doc.title} (v${version})` });
    return json({ ok: true, document: doc });
  }

  // ----- Freigabe-Workflow -----

  if (path === "/api/dms/workflow" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    const found = await docWithAccess(env, admin, email, body.docId);
    if (found.error) return json({ error: found.error[0] }, found.error[1]);
    const { doc, tenant } = found;
    const action = String(body.action || "");
    const comment = String(body.comment || "").trim().slice(0, 1000);
    const uploader = (doc.versions[doc.versions.length - 1]?.uploadedBy || doc.createdBy || "").toLowerCase();
    const vier = !!tenant.vierAugen;
    const from = doc.status;
    const fail = (msg, code = 400) => json({ error: msg }, code);

    const mayReview = () => admin || !doc.reviewer || doc.reviewer === me;
    const mayApprove = () => admin || !doc.approver || doc.approver === me;

    if (action === "einreichen") {
      if (from !== "entwurf") return fail("Nur Entwürfe lassen sich zur Prüfung einreichen.");
      if (doc.currentVersion === 0) return fail("Zuerst eine Datei hochladen.");
      doc.status = "in_pruefung";
      doc.submittedBy = me;
      pushHistory(doc, histEntry(email, "status", { from, to: doc.status, version: doc.currentVersion, text: "Zur Prüfung eingereicht", comment: comment || undefined }));
      await notify(ctx, tenant, doc, doc.reviewer || doc.approver || [], "Prüfung angefragt", `${email} hat Version ${doc.currentVersion} zur Prüfung eingereicht.`);
    } else if (action === "pruefen") {
      if (from !== "in_pruefung") return fail("Das Dokument ist nicht in Prüfung.");
      if (!mayReview()) return fail(`Nur ${doc.reviewer} darf dieses Dokument prüfen.`, 403);
      if (vier && me === uploader) return fail("Vier-Augen-Prinzip: Wer die Version hochgeladen hat, darf sie nicht selbst prüfen.", 403);
      doc.status = "geprueft";
      doc.reviewedBy = me;
      pushHistory(doc, histEntry(email, "status", { from, to: doc.status, version: doc.currentVersion, text: "Geprüft", comment: comment || undefined }));
      await notify(ctx, tenant, doc, doc.approver || [], "Freigabe angefragt", `${email} hat Version ${doc.currentVersion} geprüft. Sie wartet auf Freigabe.`);
    } else if (action === "freigeben") {
      if (from !== "geprueft") return fail("Freigeben geht erst nach der Prüfung.");
      if (!mayApprove()) return fail(`Nur ${doc.approver} darf dieses Dokument freigeben.`, 403);
      if (vier && me === uploader) return fail("Vier-Augen-Prinzip: Wer die Version hochgeladen hat, darf sie nicht selbst freigeben.", 403);
      doc.status = "freigegeben";
      doc.releasedVersion = doc.currentVersion;
      doc.validFrom = todayIso();
      doc.nextReview = doc.reviewIntervalMonths > 0 ? addMonthsIso(doc.validFrom, doc.reviewIntervalMonths) : null;
      doc.reads = {}; // Lesebestaetigungen gelten pro Version
      pushHistory(doc, histEntry(email, "status", { from, to: doc.status, version: doc.currentVersion, text: `Version ${doc.currentVersion} freigegeben`, comment: comment || undefined }));
      await notify(ctx, tenant, doc, [doc.owner, uploader], "Dokument freigegeben", `${email} hat Version ${doc.currentVersion} freigegeben.`);
    } else if (action === "ablehnen") {
      if (from !== "in_pruefung" && from !== "geprueft") return fail("Es gibt nichts abzulehnen.");
      if (!comment) return fail("Bitte eine Begründung für die Ablehnung angeben.");
      if (from === "in_pruefung" ? !mayReview() : !mayApprove()) return fail("Dafür bist du nicht zuständig.", 403);
      doc.status = "entwurf";
      pushHistory(doc, histEntry(email, "status", { from, to: doc.status, version: doc.currentVersion, text: "Abgelehnt, zurück in Entwurf", comment }));
      await notify(ctx, tenant, doc, [uploader, doc.owner], "Dokument abgelehnt", `${email} hat Version ${doc.currentVersion} abgelehnt: ${comment}`);
    } else if (action === "zurueckziehen") {
      if (from !== "in_pruefung" && from !== "geprueft") return fail("Nichts zurückzuziehen.");
      doc.status = "entwurf";
      pushHistory(doc, histEntry(email, "status", { from, to: doc.status, version: doc.currentVersion, text: "Zurückgezogen, wieder Entwurf", comment: comment || undefined }));
    } else if (action === "ueberprueft") {
      if (doc.status !== "freigegeben" && !doc.releasedVersion) return fail("Nur freigegebene Dokumente werden überprüft.");
      if (!(admin || doc.owner === me)) return fail("Nur die verantwortliche Person oder ein Admin bestätigt die Überprüfung.", 403);
      doc.nextReview = doc.reviewIntervalMonths > 0 ? addMonthsIso(todayIso(), doc.reviewIntervalMonths) : null;
      pushHistory(doc, histEntry(email, "pruefung", { text: "Überprüft, unverändert gültig", comment: comment || undefined }));
    } else if (action === "archivieren") {
      if (from === "archiviert") return fail("Bereits archiviert.");
      if (!(admin || doc.owner === me || doc.createdBy.toLowerCase() === me)) return fail("Nur Verantwortliche, Ersteller:in oder Admin dürfen archivieren.", 403);
      doc.status = "archiviert";
      doc.lock = null;
      pushHistory(doc, histEntry(email, "status", { from, to: doc.status, text: "Archiviert", comment: comment || undefined }));
    } else if (action === "wiederherstellen") {
      if (from !== "archiviert") return fail("Das Dokument ist nicht archiviert.");
      doc.status = doc.releasedVersion && doc.releasedVersion === doc.currentVersion ? "freigegeben" : "entwurf";
      pushHistory(doc, histEntry(email, "status", { from, to: doc.status, text: "Aus dem Archiv wiederhergestellt" }));
    } else {
      return fail("Unbekannte Aktion.");
    }

    doc.updatedAt = new Date().toISOString();
    doc.updatedBy = email;
    await saveDoc(env, doc);
    await logActivity(env, { email, action: "DMS-Workflow: " + action, detail: `${doc.docNumber} ${doc.title}: ${DMS_STATUS_LABEL[from]} -> ${DMS_STATUS_LABEL[doc.status]}` });
    return json({ ok: true, document: doc });
  }

  // Kompatibilitaet: alter Endpunkt (direkter Statuswechsel) ist ersetzt durch /api/dms/workflow.
  if (path === "/api/dms/status" && method === "POST") {
    return json({ error: "Dieser Endpunkt wurde durch /api/dms/workflow ersetzt." }, 410);
  }

  // ----- Kommentar, Lesebestaetigung, Check-out -----

  if (path === "/api/dms/comment" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    const found = await docWithAccess(env, admin, email, body.docId);
    if (found.error) return json({ error: found.error[0] }, found.error[1]);
    const { doc } = found;
    const text = String(body.text || "").trim().slice(0, 1000);
    if (!text) return json({ error: "Leerer Kommentar." }, 400);
    pushHistory(doc, histEntry(email, "kommentar", { text }));
    await saveDoc(env, doc);
    return json({ ok: true, document: doc });
  }

  if (path === "/api/dms/read" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    const found = await docWithAccess(env, admin, email, body.docId);
    if (found.error) return json({ error: found.error[0] }, found.error[1]);
    const { doc } = found;
    if (!doc.releasedVersion) return json({ error: "Nur freigegebene Dokumente lassen sich als gelesen bestätigen." }, 400);
    doc.reads = doc.reads || {};
    doc.reads[me] = { version: doc.releasedVersion, at: new Date().toISOString() };
    pushHistory(doc, histEntry(email, "gelesen", { version: doc.releasedVersion, text: `Version ${doc.releasedVersion} gelesen und verstanden` }));
    await saveDoc(env, doc);
    return json({ ok: true, document: doc });
  }

  if (path === "/api/dms/lock" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    const found = await docWithAccess(env, admin, email, body.docId);
    if (found.error) return json({ error: found.error[0] }, found.error[1]);
    const { doc } = found;
    if (body.lock) {
      if (doc.lock && doc.lock.by.toLowerCase() !== me) return json({ error: `Bereits ausgecheckt von ${doc.lock.by}.` }, 409);
      if (doc.status !== "entwurf") return json({ error: "Auschecken geht nur bei Entwürfen." }, 400);
      doc.lock = { by: email, at: new Date().toISOString() };
      pushHistory(doc, histEntry(email, "auscheck", { text: "Zum Bearbeiten ausgecheckt" }));
    } else {
      if (!doc.lock) return json({ ok: true, document: doc });
      if (doc.lock.by.toLowerCase() !== me && !admin) return json({ error: "Nur die auscheckende Person oder ein Admin kann einchecken." }, 403);
      doc.lock = null;
      pushHistory(doc, histEntry(email, "auscheck", { text: "Wieder eingecheckt" }));
    }
    await saveDoc(env, doc);
    return json({ ok: true, document: doc });
  }

  // ----- Download / Ansehen -----

  if (path === "/api/dms/download" && method === "GET") {
    const found = await docWithAccess(env, admin, email, url.searchParams.get("docId"));
    if (found.error) return json({ error: found.error[0] }, found.error[1]);
    const { doc } = found;
    const wanted = url.searchParams.get("version");
    const version = wanted === "current" ? doc.currentVersion : Number(wanted) || doc.releasedVersion || doc.currentVersion;
    const entry = doc.versions.find((v) => v.version === version);
    if (!entry) return json({ error: "Version nicht gefunden." }, 404);
    const client = b2Client(env);
    const upstream = await client.fetch(objectUrlFor(bucketUrl, env, entry.key));
    if (!upstream.ok) return json({ error: "Datei nicht gefunden." }, 404);
    const headers = new Headers(upstream.headers);
    const inline = url.searchParams.get("inline") === "1";
    const ct = contentTypeFor(entry.filename);
    if (inline && ct) {
      headers.set("Content-Type", ct);
      headers.set("Content-Disposition", `inline; filename="${entry.filename}"`);
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Content-Security-Policy", "sandbox");
    } else {
      headers.set("Content-Disposition", `attachment; filename="${entry.filename}"`);
    }
    return new Response(upstream.body, { headers });
  }

  // ----- Export: Dokumentenliste als CSV (Excel, Semikolon) -----

  if (path === "/api/dms/export" && method === "GET") {
    const tenant = await resolveAccessibleTenant(env, admin, email, url.searchParams.get("tenantId"));
    if (!tenant) return json({ error: "Kein Kunde zugeordnet." }, 403);
    const docs = (await loadTenantDocs(env, tenant)).sort((a, b) => a.docNumber.localeCompare(b.docNumber, "de"));
    const esc = (v) => {
      const s = v == null ? "" : String(v);
      return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const rows = [
      ["Nr", "Titel", "Kategorie", "Status", "Gültige Version", "Aktuelle Version", "Verantwortlich", "Prüfer", "Freigeber", "Gültig ab", "Nächste Überprüfung", "Schlagworte", "Zuletzt geändert"],
      ...docs.map((d) => [
        d.docNumber,
        d.title,
        d.category,
        DMS_STATUS_LABEL[d.status] || d.status,
        d.releasedVersion ? "v" + d.releasedVersion : "",
        d.currentVersion ? "v" + d.currentVersion : "",
        d.owner,
        d.reviewer,
        d.approver,
        d.validFrom || "",
        d.nextReview || "",
        (d.tags || []).join(", "),
        (d.updatedAt || "").slice(0, 10),
      ]),
    ];
    const csv = "﻿" + rows.map((r) => r.map(esc).join(";")).join("\r\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="Dokumentenliste-${tenant.name.replace(/[^A-Za-z0-9]+/g, "_")}-${todayIso()}.csv"`,
      },
    });
  }

  return json({ error: "Unbekannter Endpunkt." }, 404);
}
