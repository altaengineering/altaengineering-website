// Prueft die Datenspur (src/datenspur.js) ohne Netz, mit nachgebauter KV und Dateiliste.
// Aufruf: node scripts/test-datenspur.mjs
import { handleDatenspur, makeMatcher, phoneKey } from "../src/datenspur.js";

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.error("FEHLER:", m); } else console.log("ok:", m); };

function kv(entries) {
  const m = new Map(Object.entries(entries).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    get: async (k) => m.get(k) ?? null,
    put: async (k, v) => void m.set(k, v),
    list: async ({ prefix }) => ({ keys: [...m.keys()].filter((k) => k.startsWith(prefix)).sort().map((name) => ({ name })), list_complete: true }),
    _m: m,
  };
}
const future = new Date(Date.now() + 86400000).toISOString();
const env = {
  SHARES: kv({
    "share:s1": { id: "s1", label: "Abgabe Flansch", createdBy: "stefan@x.ch", files: [{ key: "kunde@a.ch/ZN-4711_Flansch.pdf", name: "ZN-4711_Flansch.pdf" }], expiresAt: future, revoked: false, downloadCount: 3 },
    "share:s2": { id: "s2", label: "Alt", files: [{ key: "kunde@b.ch/andere.pdf" }], expiresAt: future, revoked: true },
  }),
  REQUESTS: kv({
    "inq:i1": { id: "i1", name: "Hans Muster", email: "hans@muster.ch", phone: "+41 79 123 45 67", topic: "Offerte", message: "Bitte Offerte für Zeichnung ZN-4711", submittedAt: "2026-11-01" },
    "req:r1": { id: "r1", name: "Eva", email: "eva@firma.ch", message: "Zugang bitte", submittedAt: "2026-11-02", status: "pending" },
  }),
  DMS: kv({
    "doc:d1": { id: "d1", tenantId: "t1", title: "Prüfanweisung Flansch", docNumber: "PA-0042", versions: [{ filename: "pa.pdf" }] },
    "cad:c1": { key: "kunde@a.ch/modell.step", notes: [{ text: "Bohrung ZN-4711 prüfen", author: "hans@muster.ch" }], approvals: [] },
  }),
  ACTIVITY: kv({
    "log:2026-11-03T10:00:00Z:a": { email: "kunde@a.ch", action: "Download", detail: "ZN-4711_Flansch.pdf", at: "2026-11-03T10:00:00Z" },
    "log:2026-11-04T10:00:00Z:b": { email: "stefan@x.ch", action: "Upload", detail: "anderes.pdf", at: "2026-11-04T10:00:00Z" },
  }),
};
const objects = [
  { key: "kunde@a.ch/ZN-4711_Flansch.pdf", size: 1000, uploaded: "2026-10-01", etag: "0123456789abcdef0123456789abcdef" },
  { key: "kunde@b.ch/andere.pdf", size: 1000, uploaded: "2026-10-02", etag: "ffffffffffffffffffffffffffffffff" },
  { key: "_dms/t1/d1/v1__pa.pdf", size: 50, uploaded: "2026-10-03", etag: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
];
const logs = [];
const ctx = (path, body, admin = true) => ({
  request: new Request("https://x" + path, { method: "POST", body: JSON.stringify(body) }),
  url: new URL("https://x" + path), env, admin, email: "stefan@x.ch",
  json: (d, s = 200) => ({ status: s, data: d }),
  listObjects: async () => ({ objects, truncated: false }),
  logActivity: async (_e, l) => logs.push(l),
});

ok(phoneKey("+41 79 123 45 67") === "0791234567", "Telefonnummer normalisiert");
ok(makeMatcher("079 123 45 67")({ phone: "+41 79 123 45 67" }), "Telefon in anderer Schreibweise gefunden");
ok(makeMatcher("pruf")("Prüfanweisung"), "Umlaute egal");

let r = await handleDatenspur(ctx("/api/datenspur/suche", { q: "ZN-4711" }));
ok(r.status === 200, "Suche: 200");
ok(r.data.dateien.length === 1 && r.data.dateien[0].ordner === "kunde@a.ch", "Suche: Datei gefunden");
ok(r.data.freigaben.length === 1 && r.data.freigaben[0].downloads === 3 && r.data.freigaben[0].active, "Suche: Freigabe-Link mit Downloads");
ok(r.data.anfragen.length === 1, "Suche: Website-Anfrage gefunden");
ok(r.data.cadKommentare.length === 1, "Suche: CAD-Kommentar gefunden");
ok(r.data.protokoll.length === 1, "Suche: Protokolleintrag gefunden");
ok(logs.at(-1).action === "Datenspur: Suche", "Suche wird protokolliert");

r = await handleDatenspur(ctx("/api/datenspur/suche", { q: "hans@muster.ch" }));
ok(r.data.anfragen.length === 1 && r.data.cadKommentare.length === 1, "Suche nach E-Mail (DSG-Auskunft)");
r = await handleDatenspur(ctx("/api/datenspur/suche", { q: "PA-0042" }));
ok(r.data.dokumente.length === 1 && r.data.dokumente[0].titel === "Prüfanweisung Flansch", "Suche: Dokumentnummer in der Dokumentenlenkung");
r = await handleDatenspur(ctx("/api/datenspur/suche", { q: "x" }));
ok(r.status === 400, "Zu kurze Suche abgelehnt");
r = await handleDatenspur(ctx("/api/datenspur/suche", { q: "ZN" }, false));
ok(r.status === 403, "Nur Admins");

r = await handleDatenspur(ctx("/api/datenspur/datei", { md5: "0123456789ABCDEF0123456789ABCDEF", size: 1000, name: "irgendwas.pdf" }));
ok(r.data.exakt.length === 1 && r.data.exakt[0].key === "kunde@a.ch/ZN-4711_Flansch.pdf", "Datei: exakter Treffer per MD5");
ok(r.data.freigaben.length === 1 && r.data.freigaben[0].id === "s1", "Datei: Freigabe-Link, in dem sie steckte");
ok(r.data.protokoll.length === 1, "Datei: Downloads im Protokoll");
ok(r.data.gleicheGroesse.length === 1, "Datei: gleiche Groesse als Hinweis");
r = await handleDatenspur(ctx("/api/datenspur/datei", { md5: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", size: 50 }));
ok(r.data.exakt[0].dokument && r.data.exakt[0].dokument.nummer === "PA-0042", "Datei aus der Dokumentenlenkung mit Nummer");
r = await handleDatenspur(ctx("/api/datenspur/datei", { md5: "kein-md5" }));
ok(r.status === 400, "Ungueltiger Fingerabdruck abgelehnt");

console.log(fail ? fail + " Fehler" : "Datenspur: alle Pruefungen bestanden");
process.exit(fail ? 1 : 0);
