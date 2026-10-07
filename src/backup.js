import { gzipSync } from "fflate";

// Sicherung aller KV-Namespaces (REQUESTS, SHARES, DMS, ACTIVITY) als eine JSON-Datei, gzip-komprimiert.
//
// Warum es das gibt: Die Daten der Dokumentenlenkung (Benutzer, Dokumente, Handbuecher), die
// Freigabe-Links und die Zugangsanfragen liegen ausschliesslich in Cloudflare KV. Ohne diese Sicherung
// gaebe es keine zweite Kopie. Die Sicherung landet im selben Backblaze-Bucket wie die Kundendateien,
// unter dem Praefix "_backups/" (fuehrender Unterstrich: taucht nicht als Kundenordner auf).
//
// Ablauf: Der Cron-Trigger in wrangler.toml ruft taeglich scheduled() in index.js auf, das ruft
// runBackup(). Dieselbe Funktion steht Admins ueber /api/admin/backup/run zur Verfuegung.

export const BACKUP_PREFIX = "_backups/";
export const BACKUP_KEEP = 30;
// Grenze fuer Zugriffe pro Aufruf: Cloudflare begrenzt die Anzahl interner Operationen pro Anfrage.
// Wird die Grenze erreicht, steht "truncated": true in der Sicherung und im Antwortobjekt.
const MAX_KEYS = 900;

const NAMESPACES = ["REQUESTS", "SHARES", "DMS", "ACTIVITY"];

async function listAllKeys(ns, budget) {
  const names = [];
  let cursor;
  for (;;) {
    const page = await ns.list({ cursor, limit: 1000 });
    for (const k of page.keys) {
      if (names.length >= budget) return { names, truncated: true };
      names.push(k.name);
    }
    if (page.list_complete) return { names, truncated: false };
    cursor = page.cursor;
  }
}

// Liest alle Eintraege aller Namespaces. Werte bleiben unveraendert als Text (sie sind selbst JSON).
export async function collectKv(env) {
  const out = { format: "alta-kv-backup", version: 1, createdAt: new Date().toISOString(), truncated: false, namespaces: {} };
  let budget = MAX_KEYS;
  for (const name of NAMESPACES) {
    const ns = env[name];
    if (!ns) continue;
    const { names, truncated } = await listAllKeys(ns, budget);
    if (truncated) out.truncated = true;
    budget -= names.length;
    const entries = [];
    for (let i = 0; i < names.length; i += 20) {
      const chunk = names.slice(i, i + 20);
      const values = await Promise.all(chunk.map((k) => ns.get(k)));
      chunk.forEach((k, j) => { if (values[j] != null) entries.push({ key: k, value: values[j] }); });
    }
    out.namespaces[name] = { count: entries.length, entries };
  }
  return out;
}

export function gzipJson(obj) {
  return gzipSync(new TextEncoder().encode(JSON.stringify(obj)));
}

function stamp(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
}

// deps: { b2Client, bucketUrl, listObjects } aus index.js, damit hier keine B2-Logik doppelt steht.
export async function runBackup(env, deps) {
  const data = await collectKv(env);
  const gz = gzipJson(data);
  const key = `${BACKUP_PREFIX}kv-${stamp(new Date())}.json.gz`;
  const client = deps.b2Client(env);
  const objectUrl = new URL(deps.bucketUrl(env) + "/" + key.split("/").map(encodeURIComponent).join("/"));
  objectUrl.searchParams.set("X-Amz-Expires", "600");
  // Gleiches Verfahren wie beim Browser-Upload (vorsignierte URL), das auf B2 erprobt ist.
  const signed = await client.sign(new Request(objectUrl, { method: "PUT" }), { aws: { signQuery: true } });
  const res = await fetch(signed.url, { method: "PUT", body: gz, headers: { "Content-Type": "application/gzip" } });
  if (!res.ok) throw new Error("Sicherung konnte nicht nach B2 geschrieben werden: " + res.status + " " + (await res.text()).slice(0, 300));

  // Aufbewahrung: nur die neuesten BACKUP_KEEP Dateien behalten.
  let removed = 0;
  const listed = await deps.listObjects(env, BACKUP_PREFIX, null);
  const old = listed.objects.filter((o) => o.key !== BACKUP_PREFIX).sort((a, b) => b.key.localeCompare(a.key)).slice(BACKUP_KEEP);
  for (const o of old) {
    const r = await client.fetch(deps.bucketUrl(env) + "/" + o.key.split("/").map(encodeURIComponent).join("/"), { method: "DELETE" });
    if (r.ok || r.status === 404) removed++;
  }

  const counts = {};
  for (const [n, v] of Object.entries(data.namespaces)) counts[n] = v.count;
  return { key, size: gz.length, counts, truncated: data.truncated, removed };
}

export async function listBackups(env, deps) {
  const listed = await deps.listObjects(env, BACKUP_PREFIX, null);
  return listed.objects
    .filter((o) => o.key !== BACKUP_PREFIX)
    .map((o) => ({ key: o.key, name: o.key.slice(BACKUP_PREFIX.length), size: o.size, uploaded: o.uploaded }))
    .sort((a, b) => b.name.localeCompare(a.name));
}
