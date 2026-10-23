// Prueft die Auswertung des Sicherheitschecks ohne Netzwerk, mit erfundenen Antworten.
// Aufruf: node scripts/test-security-check.mjs
import assert from "node:assert/strict";
import { normalizeDomain, scoreFindings, gradeFor, _internals } from "../src/security-check.js";

const { checkTransport, checkHeaders, checkPage, checkMail, checkDns, checkDisclosure, txtValues } = _internals;
const ids = (list) => list.map((f) => f.id);
const home = (headers = {}, body = "", extra = {}) => ({
  http: { status: 301, location: "https://x.ch/" },
  https: { status: 200, url: "https://x.ch/", headers: new Headers(headers), cookies: [], body, ...extra },
  httpsError: null,
});

// Eingabe
assert.equal(normalizeDomain("https://www.Beispiel.ch/seite").webHost, "www.beispiel.ch");
assert.equal(normalizeDomain("https://www.Beispiel.ch/seite").mailDomain, "beispiel.ch");
for (const bad of ["", "10.0.0.1", "localhost", "intern.local", "a@b.ch", "x.ch:8080", "x", "foo..ch", "x.123"]) {
  assert.equal(normalizeDomain(bad), null, "sollte abgelehnt werden: " + bad);
}

// Transport
assert.ok(ids(checkTransport({ http: null, https: null, httpsError: "Zeitüberschreitung" })).includes("https-down"));
const t = checkTransport(home({ "strict-transport-security": "max-age=100" }));
assert.ok(ids(t).includes("hsts-short"));
assert.ok(ids(checkTransport(home())).includes("hsts-missing"));
assert.ok(ids(checkTransport(home({ "strict-transport-security": "max-age=31536000; includeSubDomains" }))).includes("hsts-ok"));
const open = home();
open.http = { status: 200, location: "" };
assert.ok(ids(checkTransport(open)).includes("http-open"));

// Header
const bare = ids(checkHeaders(home()));
for (const id of ["csp-missing", "clickjacking", "nosniff", "referrer", "permissions"]) assert.ok(bare.includes(id), id);
const good = ids(checkHeaders(home({ "content-security-policy": "default-src 'self'; frame-ancestors 'self'", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "permissions-policy": "camera=()" })));
assert.ok(good.includes("csp-ok") && good.includes("clickjacking-ok") && good.includes("nosniff-ok"));
assert.ok(ids(checkHeaders(home({ "content-security-policy": "script-src 'self' 'unsafe-inline'" }))).includes("csp-weak"));
// CSP als Meta-Tag zählt, frame-ancestors im Meta-Tag aber nicht (Browser ignorieren es dort)
const meta = ids(checkHeaders(home({}, `<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; frame-ancestors 'none'"></head>`)));
assert.ok(meta.includes("csp-ok") && !meta.includes("csp-missing") && meta.includes("clickjacking"));
assert.ok(ids(checkHeaders(home({}, `<meta content="script-src 'self' 'unsafe-inline'" http-equiv='content-security-policy'>`))).includes("csp-weak"));
assert.ok(ids(checkHeaders(home({}, `<meta name="description" content="Content-Security-Policy erklärt">`))).includes("csp-missing"));
const ck = ids(checkHeaders(home({}, "", { cookies: ["PHPSESSID=abc; path=/", "x=1; Secure; HttpOnly"] })));
assert.ok(ck.includes("cookie-secure") && ck.includes("cookie-httponly"));
assert.ok(ids(checkHeaders(home({ "access-control-allow-origin": "*", "access-control-allow-credentials": "true" }))).includes("cors"));

// Seite
const html = `<html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Inter">
<script src="https://www.googletagmanager.com/gtag/js?id=G-1"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3/jquery.min.js"></script>
<script src="http://x.ch/alt.js"></script></head><body>${"Text ".repeat(100)}
<form action="http://x.ch/login"><input type="password"></form></body></html>`;
const page = ids(checkPage(home({}, html), "x.ch"));
for (const id of ["trackers", "fonts", "sri", "mixed-active", "form-http", "privacy-link"]) assert.ok(page.includes(id), id);
const clean = ids(checkPage(home({}, `<html><body>${"Text ".repeat(100)}<a href="datenschutz.html">Datenschutz</a><script src="main.js"></script></body></html>`), "x.ch"));
assert.ok(clean.includes("trackers-none") && clean.includes("privacy-link-ok"));
assert.ok(ids(checkPage(home({}, "<html><body><div id=app></div><script src=app.js></script></body></html>"), "x.ch")).includes("spa"));

// Mail
const txt = (...vals) => ({ Answer: vals.map((v) => ({ type: 16, data: `"${v}"` })) });
const mx = { Answer: [{ type: 15, data: "10 mail.x.ch." }] };
const none = { Answer: [] };
let m = checkMail({ mx, txt: none, dmarc: none, mtasts: none, dkimFound: [] }, "x.ch");
assert.ok(ids(m.findings).includes("spf-missing") && ids(m.findings).includes("dmarc-missing"));
m = checkMail({ mx, txt: txt("v=spf1 include:a.ch -all"), dmarc: txt("v=DMARC1; p=reject; rua=mailto:d@x.ch"), mtasts: none, dkimFound: ["default"] }, "x.ch");
assert.ok(ids(m.findings).includes("spf-ok") && ids(m.findings).includes("dmarc-ok") && ids(m.findings).includes("dkim-ok"));
m = checkMail({ mx, txt: txt("v=spf1 +all"), dmarc: txt("v=DMARC1; p=none"), mtasts: none, dkimFound: [] }, "x.ch");
assert.ok(ids(m.findings).includes("spf-open") && ids(m.findings).includes("dmarc-none"));
m = checkMail({ mx: none, txt: none, dmarc: none, mtasts: none, dkimFound: [] }, "x.ch");
assert.equal(m.applicable, false);
assert.deepEqual(txtValues({ Answer: [{ type: 16, data: '"v=spf1 " "include:a.ch -all"' }] }), ["v=spf1 include:a.ch -all"]);

// DNS
assert.ok(ids(checkDns({ a: { AD: true }, caa: none, ns: { Answer: [{ type: 2 }, { type: 2 }] }, aaaa: none })).includes("dnssec-ok"));
assert.ok(ids(checkDns({ a: { AD: false }, caa: none, ns: { Answer: [{ type: 2 }] }, aaaa: none })).includes("ns-single"));

// Offenlegung
const leak = ids(checkDisclosure(home({ server: "Apache/2.4.41", "x-powered-by": "PHP/7.4.3" }), { valid: false }));
assert.ok(leak.includes("version-leak") && leak.includes("securitytxt"));

// Bewertung
const worst = scoreFindings([{ cat: "transport", sev: "high" }, { cat: "transport", sev: "high" }, { cat: "transport", sev: "high" }, { cat: "transport", sev: "high" }, { cat: "transport", sev: "high" }, { cat: "transport", sev: "high" }]);
assert.equal(worst.categories[0].score, 0);
assert.equal(gradeFor(95, true), "C");
assert.equal(gradeFor(95, false), "A");
assert.equal(gradeFor(20, false), "F");
console.log("Sicherheitscheck: alle Pruefungen bestanden");
