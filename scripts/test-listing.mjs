// Prueft die seitenweise Auflistung des Speichers im Worker (listObjects, /api/folders, /api/storage,
// /api/list) gegen einen nachgebauten Backblaze-Speicher mit mehreren Seiten.
// Aufruf: node scripts/test-listing.mjs
import assert from "node:assert/strict";
import worker from "../src/index.js";

const GB = 1024 * 1024 * 1024;
const ADMIN = "m.kueng@alta-engineering.ch";

// 2500 Dateien: 1500 im Ordner kunde@x.ch (numerische Namen), 1000 im Ordner anderer@y.ch, dazu DMS und Sicherung
const objects = [];
for (let i = 0; i < 1500; i++) objects.push({ Key: `kunde@x.ch/${String(100000 + i)}`, Size: 1000, LastModified: "2026-10-01T10:00:00.000Z" });
for (let i = 0; i < 1000; i++) objects.push({ Key: `anderer@y.ch/f${i}.pdf`, Size: 2000, LastModified: "2026-10-02T10:00:00.000Z" });
objects.push({ Key: "_dms/doc1/v1__a.pdf", Size: 5000, LastModified: "2026-10-03T10:00:00.000Z" });
objects.push({ Key: "_backups/kv-2026-10-20.json.gz", Size: 300, LastModified: "2026-10-20T02:30:00.000Z" });
objects.sort((a, b) => a.Key.localeCompare(b.Key));

let listCalls = 0;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  if (url.searchParams.get("list-type") !== "2") return new Response("nicht erwartet", { status: 500 });
  listCalls++;
  const prefix = url.searchParams.get("prefix") || "";
  const token = url.searchParams.get("continuation-token");
  const pageSize = 1000;
  const matching = objects.filter((o) => o.Key.startsWith(prefix));
  const start = token ? Number(Buffer.from(token, "base64").toString()) : 0;
  const slice = matching.slice(start, start + pageSize);
  const more = start + pageSize < matching.length;
  const next = more ? Buffer.from(String(start + pageSize)).toString("base64") : "";
  const xml =
    `<?xml version="1.0"?><ListBucketResult><IsTruncated>${more}</IsTruncated>` +
    (more ? `<NextContinuationToken>${next}</NextContinuationToken>` : "") +
    slice.map((o) => `<Contents><Key>${o.Key}</Key><Size>${o.Size}</Size><LastModified>${o.LastModified}</LastModified></Contents>`).join("") +
    `</ListBucketResult>`;
  return new Response(xml, { headers: { "Content-Type": "application/xml" } });
};

const kv = () => {
  const m = new Map();
  return { get: async (k) => m.get(k) ?? null, put: async (k, v) => void m.set(k, v), delete: async (k) => void m.delete(k), list: async () => ({ keys: [], list_complete: true }) };
};
const env = {
  B2_KEY_ID: "x", B2_APPLICATION_KEY: "y", B2_REGION: "eu-central-003", B2_BUCKET_NAME: "b", B2_ENDPOINT: "s3.example.test",
  STORAGE_QUOTA_GB: "1", REQUESTS: kv(), SHARES: kv(), DMS: kv(), ACTIVITY: kv(),
};
const call = (path, email = ADMIN) => worker.fetch(new Request("https://portal.test" + path, { headers: { "Cf-Access-Authenticated-User-Email": email } }), env);

// Ordnerliste: mehr als 1000 Dateien, numerische Dateinamen bleiben Text
let r = await call("/api/folders");
assert.equal(r.status, 200);
let j = await r.json();
assert.deepEqual(j.folders.map((f) => f.name), ["anderer@y.ch", "kunde@x.ch"]);
assert.equal(j.folders.find((f) => f.name === "kunde@x.ch").fileCount, 1500, "alle 1500 Dateien gezaehlt");
assert.equal(j.folders.find((f) => f.name === "anderer@y.ch").size, 2000 * 1000);
assert.ok(listCalls <= 3, "hoechstens drei Listenabfragen statt eine pro Ordner, war " + listCalls);

// Dateiliste eines Ordners
r = await call("/api/list?folder=kunde@x.ch");
j = await r.json();
assert.equal(j.files.length, 1500, "Dateiliste zeigt auch Dateien nach Nr. 1000");

// Speicheruebersicht
r = await call("/api/storage?refresh=1");
j = await r.json();
assert.equal(j.used, 1500 * 1000 + 1000 * 2000 + 5000 + 300);
assert.equal(j.areas.dms.count, 1);
assert.equal(j.areas.backups.size, 300);
assert.equal(j.quota, 1 * GB);
assert.equal(j.level, 0);
assert.equal(j.folderCount, 2);

// Zugriff nur fuer Admins
r = await call("/api/storage", "kunde@x.ch");
assert.equal(r.status, 403);
r = await call("/api/folders", "kunde@x.ch");
assert.equal(r.status, 403);

console.log("Auflistung: alle Pruefungen bestanden");
