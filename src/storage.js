// Speicheruebersicht des Portals (Anzeige "wie viel Platz ist noch frei") und Warnstufen.
//
// Backblaze B2 hat keine feste Groesse: der Bucket waechst mit jeder Datei und wird nach Verbrauch
// abgerechnet. "Noch frei" bezieht sich darum auf eine Planungsgrenze, die wir selbst festlegen.
// Ein Admin stellt sie im Portal ein (Bereich "Speicherplatz", gespeichert in der KV REQUESTS unter
// "cfg:storage-quota-gb"). Ist dort nichts eingestellt, gilt STORAGE_QUOTA_GB aus wrangler.toml.
// Sie verhindert nichts, Uploads gehen auch darueber hinaus weiter. Sie bestimmt nur die Anzeige und
// die Warnungen: ab 80 Prozent, ab 95 Prozent oder weniger als 10 GB frei, und bei 100 Prozent.
//
// Die Zahlen berechnet der Worker aus einer vollstaendigen Auflistung des Buckets (eine Abfrage pro
// 1000 Dateien) und legt sie als einen Eintrag in der KV REQUESTS ab ("stat:storage"). Die taegliche
// Sicherung aktualisiert ihn, im Portal kann ein Admin ihn neu berechnen lassen.

export const STORAGE_KEY = "stat:storage";
const ALERT_KEY = "stat:storage-alert";
export const QUOTA_KEY = "cfg:storage-quota-gb";
const GB = 1024 * 1024 * 1024;
const DEFAULT_QUOTA_GB = 100;
const MAX_QUOTA_GB = 100000;
export const LOW_FREE_BYTES = 10 * GB; // Warnung, sobald weniger als 10 GB frei sind
const MAX_FOLDERS_KEPT = 2000;
const SHOW_FOLDERS = 60;
const MIN_REFRESH_MS = 30 * 1000;
const DEFAULT_MAX_AGE_MS = 6 * 60 * 60 * 1000;

// Planungsgrenze aus wrangler.toml (Rueckfallwert, wenn im Portal nichts eingestellt ist)
export function quotaBytes(env) {
  const gb = Number(env.STORAGE_QUOTA_GB);
  return (Number.isFinite(gb) && gb > 0 ? gb : DEFAULT_QUOTA_GB) * GB;
}

// Gueltige Planungsgrenze: zuerst die Einstellung aus dem Portal, sonst wrangler.toml
export async function getQuota(env) {
  const raw = await env.REQUESTS.get(QUOTA_KEY);
  const gb = Number(raw);
  if (raw && Number.isFinite(gb) && gb > 0) return { bytes: gb * GB, gb, source: "portal" };
  const bytes = quotaBytes(env);
  return { bytes, gb: Math.round(bytes / GB), source: "wrangler" };
}

// Eingabe aus dem Portal pruefen: ganze Gigabyte zwischen 1 und 100000, sonst null
export function parseQuotaGb(value) {
  const gb = Number(String(value ?? "").trim().replace(",", "."));
  if (!Number.isFinite(gb) || gb < 1 || gb > MAX_QUOTA_GB) return null;
  return Math.round(gb);
}

export async function setQuota(env, gb) {
  await env.REQUESTS.put(QUOTA_KEY, String(gb));
}

function area(key) {
  if (key.startsWith("_dms/")) return "dms";
  if (key.startsWith("_backups/")) return "backups";
  return "customers";
}

// deps: { listObjects } aus index.js
export async function computeStorage(env, deps) {
  const listed = await deps.listObjects(env, "", null, { maxPages: 150 });
  const areas = { customers: { size: 0, count: 0 }, dms: { size: 0, count: 0 }, backups: { size: 0, count: 0 } };
  const folders = new Map();
  let total = 0;
  let count = 0;
  for (const o of listed.objects) {
    if (o.key.endsWith("/")) continue;
    const a = area(o.key);
    areas[a].size += o.size || 0;
    areas[a].count += 1;
    total += o.size || 0;
    count += 1;
    if (a === "customers") {
      const name = o.key.split("/")[0];
      const f = folders.get(name) || { name, size: 0, count: 0, lastUploaded: "" };
      f.size += o.size || 0;
      f.count += 1;
      if (o.uploaded && o.uploaded > f.lastUploaded) f.lastUploaded = o.uploaded;
      folders.set(name, f);
    }
  }
  const all = [...folders.values()];
  return {
    total,
    objectCount: count,
    areas,
    folderCount: all.length,
    folders: all.sort((a, b) => b.size - a.size).slice(0, MAX_FOLDERS_KEPT),
    truncated: Boolean(listed.truncated),
    computedAt: new Date().toISOString(),
  };
}

// 0 in Ordnung, 1 ab 80 Prozent, 2 ab 95 Prozent oder weniger als 10 GB frei, 3 Grenze erreicht
export function level(total, quota) {
  const p = total / quota;
  if (p >= 1) return 3;
  if (p >= 0.95 || quota - total < LOW_FREE_BYTES) return 2;
  return p >= 0.8 ? 1 : 0;
}

export async function loadStorage(env) {
  const raw = await env.REQUESTS.get(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

// Berechnet neu und speichert. Ohne force wird ein frischer Eintrag (unter 30 s) wiederverwendet.
export async function refreshStorage(env, deps, { force = false, maxAgeMs = DEFAULT_MAX_AGE_MS } = {}) {
  const cached = await loadStorage(env);
  const age = cached ? Date.now() - new Date(cached.computedAt).getTime() : Infinity;
  // Ohne force gilt ein Eintrag bis zu sechs Stunden. Mit force wird neu berechnet, ausser er ist juenger
  // als 30 Sekunden (schuetzt vor Dauerklicken und doppelten Abfragen).
  if (cached && age < (force ? MIN_REFRESH_MS : maxAgeMs)) return cached;
  const fresh = await computeStorage(env, deps);
  await env.REQUESTS.put(STORAGE_KEY, JSON.stringify(fresh));
  return fresh;
}

// q: Ergebnis von getQuota(env); ohne q gilt wrangler.toml
export function describe(env, s, q = null) {
  const quota = q ? q.bytes : quotaBytes(env);
  return {
    quota,
    quotaGb: Math.round(quota / GB),
    quotaSource: q ? q.source : "wrangler",
    lowFree: LOW_FREE_BYTES,
    used: s.total,
    free: Math.max(0, quota - s.total),
    percent: Math.round((s.total / quota) * 1000) / 10,
    level: level(s.total, quota),
    areas: s.areas,
    objectCount: s.objectCount,
    folderCount: s.folderCount,
    folders: s.folders.slice(0, SHOW_FOLDERS),
    truncated: s.truncated,
    computedAt: s.computedAt,
  };
}

const NAMES = ["", "zu ueber 80 Prozent belegt", "fast voll", "Planungsgrenze erreicht"];

// Warnt per Mail, wenn eine hoehere Stufe erreicht wird als beim letzten Mal. Faellt der Verbrauch
// wieder unter 80 Prozent, wird die Stufe zurueckgesetzt, damit spaetere Warnungen wieder kommen.
export async function checkStorageAlert(env, summary, { sendMail, adminEmails, logActivity }) {
  const quota = (await getQuota(env)).bytes;
  const lvl = level(summary.total, quota);
  const prevRaw = await env.REQUESTS.get(ALERT_KEY);
  const prev = prevRaw ? JSON.parse(prevRaw) : { level: 0 };
  if (lvl === prev.level) return { level: lvl, sent: false };
  await env.REQUESTS.put(ALERT_KEY, JSON.stringify({ level: lvl, at: new Date().toISOString() }));
  if (lvl <= prev.level) return { level: lvl, sent: false };
  const gb = (b) => (b / GB).toFixed(1).replace(".", ",");
  const free = Math.max(0, quota - summary.total);
  const sent = await sendMail(env, {
    to: adminEmails,
    subject: `Kundenportal: Speicher ${NAMES[lvl]}, noch ${gb(free)} GB frei`,
    text:
      `Der Dateispeicher des Kundenportals ist zu ${Math.round((summary.total / quota) * 100)} Prozent belegt ` +
      `(${gb(summary.total)} GB von ${gb(quota)} GB Planungsgrenze, noch ${gb(free)} GB frei).\n\n` +
      `Es geht nichts verloren, Uploads funktionieren weiter. Die Dateien liegen bei Backblaze, der Speicher waechst dort ` +
      `automatisch mit. So stocken Sie auf:\n\n` +
      `1. Bei Backblaze (https://secure.backblaze.com) unter "Caps & Alerts" pruefen, dass die Kostengrenze hoch genug ist, ` +
      `und unter "Billing", dass das Zahlungsmittel gueltig ist.\n` +
      `2. Im Kundenportal unter "Verwaltung", Bereich "Speicherplatz", die Planungsgrenze hoeher setzen und speichern.\n\n` +
      `Kosten: rund 7 US-Dollar pro Terabyte und Monat.`,
  });
  await logActivity(env, { email: "system", action: "Speicherwarnung: " + NAMES[lvl], detail: `${gb(free)} GB frei` });
  return { level: lvl, sent };
}
