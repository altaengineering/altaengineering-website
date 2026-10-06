// Dokumentenlenkung / DMS (/dms, /api/dms/*), Produktversion (2026-10-06).
//
// Vorbild: Wivio (WBI) und M-Files. Pro Kunde ("Tenant"): Mitglieder mit Rollen (Administrator,
// Freigeber, Pruefer, Ersteller, Leser), Kategorien mit Dokumentnummern, Freigabe-Workflow mit
// optionalem Vier-Augen-Prinzip, Wiedervorlage, Verlauf, Lesebestaetigung, Check-out, verknuepfte
// Dokumente, Archiv, CSV-Export und ein online editierbares QM-Handbuch (siehe handbook.js).
//
// Metadaten liegen in der KV-Namespace DMS ("tenant:<id>", "doc:<id>", Handbuch "hb*:"), die Dateien
// in B2 unter "_dms/<tenantId>/<docId>/vN__<name>" (Upload direkt vom Browser per presigned URL).
// Login ueber Cloudflare Access: eingeladene Mitglieder werden in die Access-Policy eingetragen.

import {
  ROLES, ROLE_ORDER, can, normEmail, cleanName, loadTenant, saveTenant, listTenants, tenantsFor,
  resolveAccess, publicTenant, memberRole, fallbackPrefix,
} from "./dms-core.js";
import { handleHandbook } from "./handbook.js";

export { listTenants, tenantsFor };

export const DMS_STATUSES = ["entwurf", "in_pruefung", "geprueft", "freigegeben", "archiviert"];
export const DMS_STATUS_LABEL = {
  entwurf: "Entwurf",
  in_pruefung: "In Prüfung",
  geprueft: "Geprüft",
  freigegeben: "Freigegeben",
  archiviert: "Archiviert",
};
export const DMS_DEFAULT_CATEGORIES = [
  { name: "Qualitätsmanagement", prefix: "QM" },
  { name: "Engineering", prefix: "ENG" },
  { name: "Administration", prefix: "ADM" },
  { name: "Finanzen", prefix: "FIN" },
  { name: "Vertrieb", prefix: "VER" },
  { name: "Personal", prefix: "HR" },
  { name: "Allgemein", prefix: "ALL" },
];
const DEFAULT_REVIEW_MONTHS = 12;
const HISTORY_LIMIT = 400;
const SCHEMA = 2;
const MAX_MEMBERS = 300;

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

function cleanPrefix(v, category) {
  const p = String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
  return p || fallbackPrefix(category);
}

function prefixFor(tenant, category) {
  return (tenant.categoryPrefixes && tenant.categoryPrefixes[category]) || fallbackPrefix(category);
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
  const map = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", txt: "text/plain; charset=utf-8" };
  return map[ext] || null;
}

function parseList(v) {
  return (Array.isArray(v) ? v : String(v || "").split(/[\s,;]+/)).map((x) => String(x).trim()).filter(Boolean);
}

// ---------- Dokumente: Speicher ----------

async function loadDoc(env, id) {
  const raw = id && (await env.DMS.get("doc:" + id));
  return raw ? JSON.parse(raw) : null;
}

async function saveDoc(env, doc) {
  await env.DMS.put("doc:" + doc.id, JSON.stringify(doc));
}

// Hebt aeltere Dokumente (Version 1) auf den aktuellen Stand: Nummer, Verlauf, gueltige Version.
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
      doc.history.push({ at: v.uploadedAt, by: v.uploadedBy, type: "version", version: v.version, text: `Version ${v.version} hochgeladen (${v.filename})` });
    }
  }
  if (doc.status === "freigegeben") {
    doc.releasedVersion = doc.currentVersion;
    const since = (doc.updatedAt || doc.createdAt || new Date().toISOString()).slice(0, 10);
    doc.validFrom = doc.validFrom || since;
    doc.nextReview = doc.nextReview || (doc.reviewIntervalMonths > 0 ? addMonthsIso(since, doc.reviewIntervalMonths) : null);
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
  let dirty = false;
  for (const k of list.keys) {
    const raw = await env.DMS.get(k.name);
    if (!raw) continue;
    const d = JSON.parse(raw);
    if (d.tenantId !== tenant.id) continue;
    if (upgradeDoc(d, tenant)) {
      dirty = true;
      await saveDoc(env, d);
    }
    items.push(d);
  }
  if (dirty) await saveTenant(env, tenant);
  return items;
}

async function docWithAccess(env, admin, email, docId) {
  const doc = await loadDoc(env, docId);
  if (!doc) return { error: ["Dokument nicht gefunden.", 404] };
  const access = await resolveAccess(env, admin, email, doc.tenantId);
  if (!access || access.tenant.id !== doc.tenantId) return { error: ["Keine Berechtigung.", 403] };
  if (upgradeDoc(doc, access.tenant)) {
    await saveDoc(env, doc);
    await saveTenant(env, access.tenant);
  }
  return { doc, tenant: access.tenant, role: access.role };
}

function objectUrlFor(bucketUrl, env, key) {
  return bucketUrl(env) + "/" + key.split("/").map(encodeURIComponent).join("/");
}

// ---------- Mail ----------

function portalLink(env, path) {
  return "https://" + (env.PORTAL_HOSTNAME || "alta-kundenportal.alta-engineering.workers.dev") + (path || "/dms");
}

async function notify(ctx, tenant, doc, to, subject, line) {
  const empfaenger = (Array.isArray(to) ? to : [to]).map(normEmail).filter(Boolean).filter((m) => m !== ctx.email.toLowerCase());
  if (!empfaenger.length) return;
  try {
    await ctx.sendMail(ctx.env, {
      to: empfaenger,
      subject: `${subject}: ${doc.docNumber} ${doc.title}`,
      text: `${line}\n\nKunde: ${tenant.name}\nDokument: ${doc.docNumber} ${doc.title}\n\nZur Dokumentenlenkung: ${portalLink(ctx.env)}\n`,
    });
  } catch (e) {
    console.error("DMS-Mail fehlgeschlagen:", e);
  }
}

// Darf diese Person als Pruefer/Freigeber/Verantwortliche eingetragen werden?
function validAssignee(ctx, tenant, email, cap) {
  if (!email) return true;
  if (ctx.isAdminEmail(email)) return true;
  const role = memberRole(tenant, email);
  return !!role && (cap ? can(role, cap) : true);
}

// ---------- Endpunkte ----------

export async function handleDms(ctx) {
  const { request, url, env, admin, email, json, b2Client, bucketUrl, logActivity } = ctx;
  const path = url.pathname;
  if (!path.startsWith("/api/dms/")) return null;
  const method = request.method;
  const me = email.toLowerCase();

  const hbResponse = await handleHandbook(ctx);
  if (hbResponse) return hbResponse;

  // ===== Kunden (nur Alta-Admins) =====

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
    return json({
      tenants: tenants.map((t) => ({ ...publicTenant(t), documentCount: counts[t.id] || 0, memberCount: t.members.length, createdAt: t.createdAt })),
    });
  }

  if (path === "/api/dms/tenants" && method === "POST") {
    if (!admin) return json({ error: "Keine Berechtigung." }, 403);
    const body = await request.json().catch(() => ({}));
    const name = String(body.name || "").trim().slice(0, 200);
    if (!name) return json({ error: "Bitte den Namen der Firma angeben." }, 400);
    const adminEmail = normEmail(body.adminEmail);
    if (body.adminEmail && !adminEmail) return json({ error: "Die E-Mail-Adresse des Administrators ist ungültig." }, 400);

    let cats = DMS_DEFAULT_CATEGORIES.map((c) => ({ ...c }));
    let vierAugen = !!body.vierAugen;
    if (body.copyFromTenantId) {
      const vorlage = await loadTenant(env, body.copyFromTenantId);
      if (vorlage) {
        cats = vorlage.categories.map((n) => ({ name: n, prefix: (vorlage.categoryPrefixes || {})[n] || fallbackPrefix(n) }));
        if (body.vierAugen === undefined) vierAugen = !!vorlage.vierAugen;
      }
    }
    const tenant = {
      id: crypto.randomUUID(),
      name,
      domains: [],
      categories: cats.map((c) => c.name),
      categoryPrefixes: Object.fromEntries(cats.map((c) => [c.name, c.prefix])),
      counters: {},
      vierAugen,
      defaultReviewMonths: DEFAULT_REVIEW_MONTHS,
      members: [],
      createdAt: new Date().toISOString(),
      createdBy: email,
    };
    let accessWarning = "";
    if (adminEmail) {
      tenant.members.push({ email: adminEmail, name: cleanName(body.adminName, adminEmail), role: "admin", addedAt: tenant.createdAt, addedBy: email });
      try {
        await ctx.addAccess(env, adminEmail);
      } catch (e) {
        accessWarning = "Der Kunde ist angelegt, aber die Login-Freigabe für " + adminEmail + " hat nicht geklappt. Bitte im Cloudflare-Access-Dashboard nachtragen.";
        console.error("Access-Eintrag fehlgeschlagen:", e);
      }
      await ctx.sendMail(env, {
        to: [adminEmail],
        subject: "Ihre Dokumentenlenkung ist bereit",
        text: `Guten Tag\n\nFür ${name} wurde die Dokumentenlenkung eingerichtet. Sie sind als Administrator eingetragen und können Dokumente, Handbuch und Benutzer verwalten.\n\nAnmelden: ${portalLink(env)}\n(Sie erhalten beim Anmelden einen Code per E-Mail.)\n\nFreundliche Grüsse\nAlta Engineering AG\n`,
      }).catch(() => {});
    }
    await env.DMS.put("tenant:" + tenant.id, JSON.stringify(tenant));
    await logActivity(env, { email, action: "DMS-Kunde angelegt", detail: name });
    return json({ ok: true, tenant: publicTenant(tenant), warning: accessWarning || undefined });
  }

  if (path === "/api/dms/tenants" && method === "PUT") {
    if (!admin) return json({ error: "Keine Berechtigung." }, 403);
    const body = await request.json().catch(() => ({}));
    const tenant = await loadTenant(env, body.id);
    if (!tenant) return json({ error: "Kunde nicht gefunden." }, 404);
    const name = String(body.name || "").trim().slice(0, 200);
    if (name) tenant.name = name;
    await saveTenant(env, tenant);
    await logActivity(env, { email, action: "DMS-Kunde bearbeitet", detail: tenant.name });
    return json({ ok: true, tenant: publicTenant(tenant) });
  }

  if (path === "/api/dms/tenants" && method === "DELETE") {
    if (!admin) return json({ error: "Keine Berechtigung." }, 403);
    const tenant = await loadTenant(env, url.searchParams.get("id"));
    if (!tenant) return json({ error: "Kunde nicht gefunden." }, 404);
    const docList = await env.DMS.list({ prefix: "doc:" });
    let client = null;
    for (const k of docList.keys) {
      const raw = await env.DMS.get(k.name);
      if (!raw) continue;
      const d = JSON.parse(raw);
      if (d.tenantId !== tenant.id) continue;
      if (d.versions.length > 0) {
        if (!client) client = b2Client(env);
        for (const v of d.versions) await client.fetch(objectUrlFor(bucketUrl, env, v.key), { method: "DELETE" }).catch(() => {});
      }
      await env.DMS.delete(k.name);
    }
    for (const prefix of ["hbrev:" + tenant.id + ":"]) {
      const l = await env.DMS.list({ prefix });
      for (const k of l.keys) await env.DMS.delete(k.name);
    }
    await env.DMS.delete("hb:" + tenant.id);
    await env.DMS.delete("hbpub:" + tenant.id);
    await env.DMS.delete("tenant:" + tenant.id);
    await logActivity(env, { email, action: "DMS-Kunde geloescht", detail: tenant.name });
    return json({ ok: true });
  }

  // ===== Ab hier: Zugriff ueber Mitgliedschaft =====

  const requestedTenant = method === "GET" || method === "DELETE" ? url.searchParams.get("tenantId") : null;

  // ----- Benutzer -----

  if (path === "/api/dms/members" && method === "GET") {
    const access = await resolveAccess(env, admin, email, requestedTenant);
    if (!access) return json({ error: "Kein Zugriff." }, 403);
    const t = access.tenant;
    return json({
      role: access.role,
      canManage: can(access.role, "manage"),
      members: t.members.map((m) => ({ email: m.email, name: m.name, role: m.role, addedAt: m.addedAt })),
      roles: ROLE_ORDER.map((r) => ({ id: r, ...ROLES[r] })),
    });
  }

  if (path === "/api/dms/members" && (method === "POST" || method === "PUT" || method === "DELETE")) {
    const body = method === "DELETE" ? {} : await request.json().catch(() => ({}));
    const access = await resolveAccess(env, admin, email, method === "DELETE" ? requestedTenant : body.tenantId);
    if (!access) return json({ error: "Kein Zugriff." }, 403);
    if (!can(access.role, "manage")) return json({ error: "Nur Administratoren verwalten Benutzer." }, 403);
    const t = access.tenant;

    const adminCount = () => t.members.filter((m) => m.role === "admin").length;

    if (method === "POST") {
      const role = ROLE_ORDER.includes(body.role) ? body.role : "ersteller";
      const emails = parseList(body.emails || body.email);
      if (!emails.length) return json({ error: "Bitte mindestens eine E-Mail-Adresse angeben." }, 400);
      const added = [];
      const skipped = [];
      const accessErrors = [];
      for (const raw of emails) {
        const mail = normEmail(raw);
        if (!mail) { skipped.push({ email: raw, why: "keine gültige E-Mail-Adresse" }); continue; }
        if (memberRole(t, mail)) { skipped.push({ email: mail, why: "ist schon dabei" }); continue; }
        if (t.members.length >= MAX_MEMBERS) { skipped.push({ email: mail, why: "Benutzerlimit erreicht" }); continue; }
        t.members.push({ email: mail, name: cleanName(emails.length === 1 ? body.name : "", mail), role, addedAt: new Date().toISOString(), addedBy: email });
        added.push(mail);
        try {
          await ctx.addAccess(env, mail);
        } catch (e) {
          accessErrors.push(mail);
          console.error("Access-Eintrag fehlgeschlagen:", e);
        }
      }
      if (added.length) {
        await saveTenant(env, t);
        await logActivity(env, { email, action: "DMS-Benutzer eingeladen", detail: `${t.name}: ${added.join(", ")} (${ROLES[role].label})` });
        if (body.invite !== false) {
          await ctx.sendMail(env, {
            to: added,
            subject: `Einladung zur Dokumentenlenkung von ${t.name}`,
            text: `Guten Tag\n\n${cleanName("", email)} hat Sie zur Dokumentenlenkung von ${t.name} eingeladen (Rolle: ${ROLES[role].label}).\n\nAnmelden: ${portalLink(env)}\nSie erhalten beim Anmelden einen Code per E-Mail, ein Passwort brauchen Sie nicht.\n`,
          }).catch(() => {});
        }
      }
      return json({ ok: true, added, skipped, accessErrors, link: portalLink(env) });
    }

    const mail = normEmail(method === "DELETE" ? url.searchParams.get("email") : body.email);
    const m = t.members.find((x) => x.email === mail);
    if (!m) return json({ error: "Person nicht gefunden." }, 404);

    if (method === "PUT") {
      if (body.role != null) {
        if (!ROLE_ORDER.includes(body.role)) return json({ error: "Ungültige Rolle." }, 400);
        if (m.role === "admin" && body.role !== "admin" && adminCount() <= 1) return json({ error: "Es muss mindestens eine Administrator-Person bleiben." }, 400);
        m.role = body.role;
      }
      if (body.name != null) m.name = cleanName(body.name, m.email);
      await saveTenant(env, t);
      await logActivity(env, { email, action: "DMS-Benutzer geaendert", detail: `${t.name}: ${m.email} (${ROLES[m.role].label})` });
      return json({ ok: true });
    }

    if (m.role === "admin" && adminCount() <= 1) return json({ error: "Die letzte Administrator-Person lässt sich nicht entfernen." }, 400);
    t.members = t.members.filter((x) => x.email !== mail);
    await saveTenant(env, t);
    await logActivity(env, { email, action: "DMS-Benutzer entfernt", detail: `${t.name}: ${mail}` });
    return json({ ok: true });
  }

  // ----- Einstellungen des Kunden (Kategorien, Vier-Augen, Intervall) -----

  if (path === "/api/dms/settings" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    const access = await resolveAccess(env, admin, email, body.tenantId);
    if (!access) return json({ error: "Kein Zugriff." }, 403);
    if (!can(access.role, "manage")) return json({ error: "Nur Administratoren ändern die Einstellungen." }, 403);
    const t = access.tenant;
    const docs = await loadTenantDocs(env, t);

    if (Array.isArray(body.categories)) {
      const seen = new Set();
      const cats = [];
      for (const c of body.categories) {
        const nm = String(c && c.name != null ? c.name : c).trim().slice(0, 60);
        if (!nm || seen.has(nm.toLowerCase())) continue;
        seen.add(nm.toLowerCase());
        cats.push({ name: nm, prefix: cleanPrefix(c && c.prefix, nm), was: c && c.was ? String(c.was) : nm });
      }
      if (!cats.length) return json({ error: "Mindestens eine Kategorie ist nötig." }, 400);
      // Umbenennen: Dokumente der alten Kategorie folgen. Entfernen nur ohne Dokumente.
      const keepOld = new Set(cats.map((c) => c.was));
      for (const old of t.categories) {
        if (!keepOld.has(old)) {
          const n = docs.filter((d) => d.category === old).length;
          if (n) return json({ error: `Die Kategorie «${old}» enthält noch ${n} Dokument${n === 1 ? "" : "e"}. Verschiebe sie zuerst in eine andere Kategorie.` }, 400);
        }
      }
      for (const c of cats) {
        if (c.was !== c.name) {
          for (const d of docs) {
            if (d.category === c.was) {
              d.category = c.name;
              await saveDoc(env, d);
            }
          }
        }
      }
      const oldPrefixes = t.categoryPrefixes || {};
      t.categories = cats.map((c) => c.name);
      t.categoryPrefixes = Object.fromEntries(cats.map((c) => [c.name, c.prefix || oldPrefixes[c.was] || fallbackPrefix(c.name)]));
    }
    if (body.vierAugen != null) t.vierAugen = !!body.vierAugen;
    if (body.defaultReviewMonths != null) t.defaultReviewMonths = normMonths(body.defaultReviewMonths, t.defaultReviewMonths);
    await saveTenant(env, t);
    await logActivity(env, { email, action: "DMS-Einstellungen geaendert", detail: t.name });
    return json({ ok: true, tenant: publicTenant(t) });
  }

  // ===== Dokumente =====

  if (path === "/api/dms/documents" && method === "GET") {
    const access = await resolveAccess(env, admin, email, requestedTenant);
    if (!access) return json({ error: "Kein Kunde zugeordnet." }, 403);
    const items = await loadTenantDocs(env, access.tenant);
    items.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    return json({ documents: items, tenant: publicTenant(access.tenant), role: access.role, me });
  }

  if (path === "/api/dms/documents" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    const access = await resolveAccess(env, admin, email, body.tenantId);
    if (!access) return json({ error: "Kein Kunde zugeordnet." }, 403);
    if (!can(access.role, "write")) return json({ error: "Dafür fehlt dir die Berechtigung (Rolle Ersteller oder höher)." }, 403);
    const tenant = access.tenant;
    const title = String(body.title || "").trim().slice(0, 200);
    if (!title) return json({ error: "Bitte einen Titel angeben." }, 400);
    const category = String(body.category || "").trim().slice(0, 80);
    if (!category || !tenant.categories.includes(category)) return json({ error: "Bitte eine Kategorie wählen." }, 400);
    const reviewer = normEmail(body.reviewer);
    const approver = normEmail(body.approver);
    const owner = normEmail(body.owner) || me;
    if (!validAssignee(ctx, tenant, reviewer, "review")) return json({ error: "Die Prüfperson muss ein Mitglied mit Prüfrecht sein." }, 400);
    if (!validAssignee(ctx, tenant, approver, "approve")) return json({ error: "Die Freigabeperson muss ein Mitglied mit Freigaberecht sein." }, 400);
    if (!validAssignee(ctx, tenant, owner, null)) return json({ error: "Die verantwortliche Person muss ein Mitglied sein." }, 400);
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
      owner,
      reviewer,
      approver,
      reviewIntervalMonths: normMonths(body.reviewIntervalMonths, tenant.defaultReviewMonths),
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
    await saveTenant(env, tenant);
    await logActivity(env, { email, action: "DMS-Dokument angelegt", detail: `${doc.docNumber} ${title} (${tenant.name})` });
    return json({ ok: true, document: doc });
  }

  if (path === "/api/dms/documents" && method === "PUT") {
    const body = await request.json().catch(() => ({}));
    const found = await docWithAccess(env, admin, email, body.id);
    if (found.error) return json({ error: found.error[0] }, found.error[1]);
    const { doc, tenant, role } = found;
    if (!can(role, "write")) return json({ error: "Dafür fehlt dir die Berechtigung." }, 403);
    if (doc.status === "archiviert") return json({ error: "Archivierte Dokumente lassen sich nicht bearbeiten." }, 400);
    const changes = [];
    if (body.title != null) {
      const t = String(body.title).trim().slice(0, 200);
      if (!t) return json({ error: "Der Titel darf nicht leer sein." }, 400);
      if (t !== doc.title) changes.push("Titel");
      doc.title = t;
    }
    if (body.category != null) {
      const c = String(body.category).trim().slice(0, 80);
      if (c && c !== doc.category) {
        if (!tenant.categories.includes(c)) return json({ error: "Unbekannte Kategorie." }, 400);
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
    for (const [field, label, cap] of [["owner", "Verantwortliche:r", null], ["reviewer", "Prüfer:in", "review"], ["approver", "Freigeber:in", "approve"]]) {
      if (body[field] != null) {
        const v = normEmail(body[field]);
        if (v !== doc[field]) {
          if (!validAssignee(ctx, tenant, v, cap)) return json({ error: `${label}: diese Person hat dafür keine Berechtigung.` }, 400);
          changes.push(label);
        }
        doc[field] = v;
      }
    }
    if (body.reviewIntervalMonths != null) {
      const m = normMonths(body.reviewIntervalMonths, doc.reviewIntervalMonths);
      if (m !== doc.reviewIntervalMonths) {
        doc.reviewIntervalMonths = m;
        changes.push("Überprüfungsintervall");
        if (doc.releasedVersion && doc.validFrom) doc.nextReview = m > 0 ? addMonthsIso(doc.validFrom, m) : null;
      }
    }
    if (body.readRequired != null) {
      const v = !!body.readRequired;
      if (v !== doc.readRequired) changes.push("Lesepflicht");
      doc.readRequired = v;
    }
    if (Array.isArray(body.related)) {
      const valid = [];
      for (const rid of body.related.map(String).filter((x) => x !== doc.id)) {
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
    return json({ ok: true, document: doc });
  }

  if (path === "/api/dms/documents" && method === "DELETE") {
    const found = await docWithAccess(env, admin, email, url.searchParams.get("id"));
    if (found.error) return json({ error: found.error[0] }, found.error[1]);
    const { doc, role } = found;
    if (!can(role, "manage")) return json({ error: "Nur Administratoren löschen Dokumente. Alternative: archivieren." }, 403);
    if (doc.versions.length > 0) {
      const client = b2Client(env);
      for (const v of doc.versions) await client.fetch(objectUrlFor(bucketUrl, env, v.key), { method: "DELETE" }).catch(() => {});
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
    const { doc, role } = found;
    if (!can(role, "write")) return json({ error: "Dafür fehlt dir die Berechtigung." }, 403);
    if (doc.status === "archiviert") return json({ error: "Archivierte Dokumente nehmen keine neuen Versionen an." }, 400);
    if (doc.status === "in_pruefung" || doc.status === "geprueft") {
      return json({ error: "Das Dokument ist in Prüfung oder Freigabe. Erst ablehnen oder freigeben, dann neue Version." }, 409);
    }
    if (doc.lock && doc.lock.by.toLowerCase() !== me && !can(role, "manage")) {
      return json({ error: `Das Dokument ist von ${doc.lock.by} ausgecheckt.` }, 409);
    }
    const filename = String(body.filename || "").trim();
    if (!filename) return json({ error: "Kein Dateiname übergeben." }, 400);
    if (filename.includes("/")) return json({ error: "Der Dateiname darf kein «/» enthalten." }, 400);
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
    const { doc, role } = found;
    if (!can(role, "write")) return json({ error: "Dafür fehlt dir die Berechtigung." }, 403);
    const version = Number(body.version) || doc.currentVersion + 1;
    const filename = String(body.filename || "").trim();
    const key = String(body.key || "").trim();
    if (!filename || !key) return json({ error: "Unvollständige Angaben." }, 400);
    if (!key.startsWith(`_dms/${doc.tenantId}/${doc.id}/`)) return json({ error: "Ungültiger Ablageort." }, 400);
    const note = String(body.note || "").trim().slice(0, 500);
    if (doc.currentVersion > 0 && !note) return json({ error: "Bitte den Änderungsgrund angeben." }, 400);
    doc.versions.push({ version, key, filename, size: Number(body.size) || 0, uploadedAt: new Date().toISOString(), uploadedBy: email, note });
    doc.currentVersion = version;
    // Eine neue Version ist noch nicht geprueft. Die bisher freigegebene Version bleibt als
    // "gueltige Version" abrufbar (releasedVersion), bis die neue freigegeben ist.
    doc.status = "entwurf";
    doc.lock = null;
    doc.updatedAt = new Date().toISOString();
    doc.updatedBy = email;
    pushHistory(doc, histEntry(email, "version", { version, text: `Version ${version} hochgeladen (${filename})`, comment: note || undefined }));
    await saveDoc(env, doc);
    await logActivity(env, { email, action: "DMS-Version hochgeladen", detail: `${doc.docNumber} ${doc.title} (v${version})` });
    return json({ ok: true, document: doc });
  }

  // ----- Freigabe-Workflow -----

  if (path === "/api/dms/workflow" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    const found = await docWithAccess(env, admin, email, body.docId);
    if (found.error) return json({ error: found.error[0] }, found.error[1]);
    const { doc, tenant, role } = found;
    const action = String(body.action || "");
    const comment = String(body.comment || "").trim().slice(0, 1000);
    const uploader = (doc.versions[doc.versions.length - 1]?.uploadedBy || doc.createdBy || "").toLowerCase();
    const vier = !!tenant.vierAugen;
    const from = doc.status;
    const fail = (msg, code = 400) => json({ error: msg }, code);
    const isAdminRole = can(role, "manage");

    const mayReview = () => can(role, "review") && (isAdminRole || !doc.reviewer || doc.reviewer === me);
    const mayApprove = () => can(role, "approve") && (isAdminRole || !doc.approver || doc.approver === me);

    if (action === "einreichen") {
      if (!can(role, "write")) return fail("Dafür fehlt dir die Berechtigung.", 403);
      if (from !== "entwurf") return fail("Nur Entwürfe lassen sich zur Prüfung einreichen.");
      if (doc.currentVersion === 0) return fail("Zuerst eine Datei hochladen.");
      doc.status = "in_pruefung";
      doc.submittedBy = me;
      pushHistory(doc, histEntry(email, "status", { from, to: doc.status, version: doc.currentVersion, text: "Zur Prüfung eingereicht", comment: comment || undefined }));
      const pruefer = doc.reviewer ? [doc.reviewer] : tenant.members.filter((m) => can(m.role, "review")).map((m) => m.email);
      await notify(ctx, tenant, doc, pruefer, "Prüfung angefragt", `${email} hat Version ${doc.currentVersion} zur Prüfung eingereicht.`);
    } else if (action === "pruefen") {
      if (from !== "in_pruefung") return fail("Das Dokument ist nicht in Prüfung.");
      if (!mayReview()) return fail(doc.reviewer && can(role, "review") ? `Nur ${doc.reviewer} darf dieses Dokument prüfen.` : "Dafür fehlt dir die Berechtigung (Rolle Prüfer oder höher).", 403);
      if (vier && me === uploader) return fail("Vier-Augen-Prinzip: Wer die Version hochgeladen hat, darf sie nicht selbst prüfen.", 403);
      doc.status = "geprueft";
      doc.reviewedBy = me;
      pushHistory(doc, histEntry(email, "status", { from, to: doc.status, version: doc.currentVersion, text: "Geprüft", comment: comment || undefined }));
      const freigeber = doc.approver ? [doc.approver] : tenant.members.filter((m) => can(m.role, "approve")).map((m) => m.email);
      await notify(ctx, tenant, doc, freigeber, "Freigabe angefragt", `${email} hat Version ${doc.currentVersion} geprüft. Sie wartet auf Freigabe.`);
    } else if (action === "freigeben") {
      if (from !== "geprueft") return fail("Freigeben geht erst nach der Prüfung.");
      if (!mayApprove()) return fail(doc.approver && can(role, "approve") ? `Nur ${doc.approver} darf dieses Dokument freigeben.` : "Dafür fehlt dir die Berechtigung (Rolle Freigeber oder höher).", 403);
      if (vier && me === uploader) return fail("Vier-Augen-Prinzip: Wer die Version hochgeladen hat, darf sie nicht selbst freigeben.", 403);
      doc.status = "freigegeben";
      doc.releasedVersion = doc.currentVersion;
      doc.validFrom = todayIso();
      doc.nextReview = doc.reviewIntervalMonths > 0 ? addMonthsIso(doc.validFrom, doc.reviewIntervalMonths) : null;
      doc.reads = {};
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
      if (!can(role, "write")) return fail("Dafür fehlt dir die Berechtigung.", 403);
      if (from !== "in_pruefung" && from !== "geprueft") return fail("Nichts zurückzuziehen.");
      doc.status = "entwurf";
      pushHistory(doc, histEntry(email, "status", { from, to: doc.status, version: doc.currentVersion, text: "Zurückgezogen, wieder Entwurf", comment: comment || undefined }));
    } else if (action === "ueberprueft") {
      if (!doc.releasedVersion) return fail("Nur freigegebene Dokumente werden überprüft.");
      if (!(isAdminRole || (can(role, "write") && doc.owner === me))) return fail("Nur die verantwortliche Person oder ein Administrator bestätigt die Überprüfung.", 403);
      doc.nextReview = doc.reviewIntervalMonths > 0 ? addMonthsIso(todayIso(), doc.reviewIntervalMonths) : null;
      pushHistory(doc, histEntry(email, "pruefung", { text: "Überprüft, unverändert gültig", comment: comment || undefined }));
    } else if (action === "archivieren") {
      if (from === "archiviert") return fail("Bereits archiviert.");
      if (!(isAdminRole || (can(role, "write") && (doc.owner === me || (doc.createdBy || "").toLowerCase() === me)))) return fail("Nur Verantwortliche, Ersteller:in oder Administratoren dürfen archivieren.", 403);
      doc.status = "archiviert";
      doc.lock = null;
      pushHistory(doc, histEntry(email, "status", { from, to: doc.status, text: "Archiviert", comment: comment || undefined }));
    } else if (action === "wiederherstellen") {
      if (!can(role, "write")) return fail("Dafür fehlt dir die Berechtigung.", 403);
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

  // ----- Kommentar, Lesebestaetigung, Check-out -----

  if (path === "/api/dms/comment" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    const found = await docWithAccess(env, admin, email, body.docId);
    if (found.error) return json({ error: found.error[0] }, found.error[1]);
    const { doc } = found;
    const text = String(body.text || "").trim().slice(0, 1000);
    if (!text) return json({ error: "Der Kommentar ist leer." }, 400);
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
    const { doc, role } = found;
    if (!can(role, "write")) return json({ error: "Dafür fehlt dir die Berechtigung." }, 403);
    if (body.lock) {
      if (doc.lock && doc.lock.by.toLowerCase() !== me) return json({ error: `Bereits ausgecheckt von ${doc.lock.by}.` }, 409);
      if (doc.status !== "entwurf") return json({ error: "Auschecken geht nur bei Entwürfen." }, 400);
      doc.lock = { by: email, at: new Date().toISOString() };
      pushHistory(doc, histEntry(email, "auscheck", { text: "Zum Bearbeiten ausgecheckt" }));
    } else {
      if (!doc.lock) return json({ ok: true, document: doc });
      if (doc.lock.by.toLowerCase() !== me && !can(role, "manage")) return json({ error: "Nur die auscheckende Person oder ein Administrator kann einchecken." }, 403);
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
    if (!upstream.ok) return json({ error: "Die Datei wurde nicht gefunden." }, 404);
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
    const access = await resolveAccess(env, admin, email, requestedTenant);
    if (!access) return json({ error: "Kein Kunde zugeordnet." }, 403);
    const tenant = access.tenant;
    const docs = (await loadTenantDocs(env, tenant)).sort((a, b) => a.docNumber.localeCompare(b.docNumber, "de"));
    const esc = (v) => {
      const s = v == null ? "" : String(v);
      return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const rows = [
      ["Nr", "Titel", "Kategorie", "Status", "Gültige Version", "Aktuelle Version", "Verantwortlich", "Prüfer", "Freigeber", "Gültig ab", "Nächste Überprüfung", "Schlagworte", "Zuletzt geändert"],
      ...docs.map((d) => [
        d.docNumber, d.title, d.category, DMS_STATUS_LABEL[d.status] || d.status,
        d.releasedVersion ? "v" + d.releasedVersion : "", d.currentVersion ? "v" + d.currentVersion : "",
        d.owner, d.reviewer, d.approver, d.validFrom || "", d.nextReview || "", (d.tags || []).join(", "), (d.updatedAt || "").slice(0, 10),
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
