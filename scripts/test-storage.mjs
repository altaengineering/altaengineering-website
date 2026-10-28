// Prueft die Speicheruebersicht (src/storage.js) ohne Netzwerk, mit nachgebauter Dateiliste und KV.
// Aufruf: node scripts/test-storage.mjs
import assert from "node:assert/strict";
import { computeStorage, refreshStorage, describe, level, checkStorageAlert, quotaBytes } from "../src/storage.js";

const GB = 1024 * 1024 * 1024;
const kv = () => {
  const m = new Map();
  return { get: async (k) => m.get(k) ?? null, put: async (k, v) => void m.set(k, v), _m: m };
};
const env = (extra = {}) => ({ REQUESTS: kv(), STORAGE_QUOTA_GB: "10", ...extra });
const files = [
  { key: "a@kunde.ch/plan.pdf", size: 2 * GB, uploaded: "2026-10-01T10:00:00Z" },
  { key: "a@kunde.ch/modell.step", size: 1 * GB, uploaded: "2026-10-05T10:00:00Z" },
  { key: "b@kunde.ch/zeichnung.dwg", size: 4 * GB, uploaded: "2026-09-01T10:00:00Z" },
  { key: "_dms/abc/v1__handbuch.pdf", size: 0.5 * GB, uploaded: "2026-10-02T10:00:00Z" },
  { key: "_backups/kv-2026-10-20.json.gz", size: 1024, uploaded: "2026-10-20T02:30:00Z" },
  { key: "a@kunde.ch/", size: 0, uploaded: "2026-10-01T10:00:00Z" },
];
let calls = 0;
const deps = { listObjects: async () => { calls++; return { objects: files, prefixes: [], truncated: false }; } };

// Berechnung
const s = await computeStorage(env(), deps);
assert.equal(s.total, 7.5 * GB + 1024);
assert.equal(s.objectCount, 5);
assert.equal(s.areas.customers.size, 7 * GB);
assert.equal(s.areas.dms.size, 0.5 * GB);
assert.equal(s.areas.backups.count, 1);
assert.equal(s.folderCount, 2);
assert.equal(s.folders[0].name, "b@kunde.ch");
assert.equal(s.folders[1].count, 2);
assert.equal(s.folders[1].lastUploaded, "2026-10-05T10:00:00Z");

// Planungsgrenze und Stufen
assert.equal(quotaBytes({ STORAGE_QUOTA_GB: "10" }), 10 * GB);
assert.equal(quotaBytes({}), 100 * GB);
assert.equal(quotaBytes({ STORAGE_QUOTA_GB: "abc" }), 100 * GB);
assert.equal(level(7.9 * GB, 10 * GB), 0);
assert.equal(level(8 * GB, 10 * GB), 1);
assert.equal(level(9.5 * GB, 10 * GB), 2);
assert.equal(level(10 * GB, 10 * GB), 3);
const d = describe(env(), s);
assert.equal(d.percent, 75);
assert.equal(d.level, 0);
assert.ok(Math.abs(d.free - (10 * GB - s.total)) < 1);

// Zwischenspeicher: ohne force wird wiederverwendet, mit force erst nach 30 Sekunden neu berechnet
const e = env();
calls = 0;
await refreshStorage(e, deps);
await refreshStorage(e, deps);
assert.equal(calls, 1, "zweiter Aufruf kommt aus dem Zwischenspeicher");
await refreshStorage(e, deps, { force: true });
assert.equal(calls, 1, "force innerhalb von 30 Sekunden rechnet nicht neu");
const old = JSON.parse(await e.REQUESTS.get("stat:storage"));
old.computedAt = new Date(Date.now() - 60_000).toISOString();
await e.REQUESTS.put("stat:storage", JSON.stringify(old));
await refreshStorage(e, deps, { force: true });
assert.equal(calls, 2, "force nach einer Minute rechnet neu");

// Warnungen: nur beim Ansteigen, wieder frei nach dem Absinken
const sent = [];
const ctx = { sendMail: async (_e, m) => { sent.push(m.subject); return true; }, adminEmails: ["x@y.ch"], logActivity: async () => {} };
const ea = env();
let r = await checkStorageAlert(ea, { total: 5 * GB }, ctx);
assert.deepEqual([r.level, r.sent, sent.length], [0, false, 0]);
r = await checkStorageAlert(ea, { total: 8.2 * GB }, ctx);
assert.deepEqual([r.level, r.sent], [1, true]);
r = await checkStorageAlert(ea, { total: 8.4 * GB }, ctx);
assert.equal(r.sent, false, "gleiche Stufe meldet nicht noch einmal");
r = await checkStorageAlert(ea, { total: 9.7 * GB }, ctx);
assert.deepEqual([r.level, r.sent], [2, true]);
r = await checkStorageAlert(ea, { total: 10.5 * GB }, ctx);
assert.deepEqual([r.level, r.sent], [3, true]);
r = await checkStorageAlert(ea, { total: 4 * GB }, ctx);
assert.deepEqual([r.level, r.sent], [0, false]);
r = await checkStorageAlert(ea, { total: 8.5 * GB }, ctx);
assert.equal(r.sent, true, "nach dem Absinken warnt es wieder");
assert.equal(sent.length, 4);
assert.match(sent[0], /80 Prozent/);

console.log("Speicheruebersicht: alle Pruefungen bestanden");
