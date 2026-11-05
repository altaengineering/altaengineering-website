// Prueft, dass Kontaktanfragen gespeichert werden und die Benachrichtigung an die richtigen Adressen geht.
// Aufruf: node scripts/test-notify.mjs
import assert from "node:assert/strict";
import worker from "../src/index.js";

const kv = () => {
  const m = new Map();
  return { get: async (k) => m.get(k) ?? null, put: async (k, v) => void m.set(k, v), delete: async (k) => void m.delete(k), list: async () => ({ keys: [...m.keys()].map((name) => ({ name })), list_complete: true }), _m: m };
};
let mails = [];
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith("https://api.resend.com/emails")) {
    mails.push(JSON.parse(init.body));
    return new Response("{}", { status: 200 });
  }
  return new Response("unerwartet", { status: 500 });
};
const post = (env, body) =>
  worker.fetch(new Request("https://portal.test/api/request-access", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://alta-engineering.ch" }, body: JSON.stringify(body) }), env);
const base = { type: "kontakt", name: "Stefan Test", email: "s@example.ch", message: "Dies ist ein Test der Kontaktanfrage.", consent: true };

// Ohne Schluessel: gespeichert, aber keine Mail, Antwort sagt notified false
let env = { REQUESTS: kv(), PORTAL_HOSTNAME: "portal.test", MAIN_SITE_ORIGIN: "https://alta-engineering.ch" };
let r = await post(env, base);
let j = await r.json();
assert.equal(r.status, 200);
assert.equal(j.notified, false);
assert.equal(mails.length, 0);
assert.ok([...env.REQUESTS._m.keys()].some((k) => k.startsWith("inq:")), "Anfrage ist gespeichert");

// Mit Schluessel, ohne NOTIFY_EMAILS: an die Administratoren
mails = [];
env = { ...env, REQUESTS: kv(), RESEND_API_KEY: "re_test" };
j = await (await post(env, base)).json();
assert.equal(j.notified, true);
assert.deepEqual(mails[0].to.sort(), ["m.kueng@alta-engineering.ch", "s.herger@alta-engineering.ch"]);

// Mit NOTIFY_EMAILS: nur an diese Adressen
mails = [];
env = { ...env, REQUESTS: kv(), NOTIFY_EMAILS: " info@alta-engineering.ch , s.herger@alta-engineering.ch " };
j = await (await post(env, base)).json();
assert.equal(j.notified, true);
assert.deepEqual(mails[0].to, ["info@alta-engineering.ch", "s.herger@alta-engineering.ch"]);
assert.match(mails[0].subject, /Website-Anfrage/);

// Fehlende Zustimmung wird abgewiesen
r = await post(env, { ...base, consent: false });
assert.equal(r.status, 400);
console.log("Benachrichtigung: alle Pruefungen bestanden");
