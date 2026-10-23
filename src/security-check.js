// Oeffentlicher Sicherheitscheck fuer Websites (/sicherheitscheck.html -> POST /api/security-check).
//
// Der Check ist bewusst PASSIV: Er ruft nur ab, was jeder Browser auch abruft (die Startseite, einmal
// http:// fuer die Weiterleitung, /.well-known/security.txt) und fragt oeffentliche DNS-Eintraege ab. Er
// probiert keine Dateipfade durch, sendet keine Angriffsmuster und prueft keine Zugangsdaten. Fuer die
// ausfuehrliche Pruefung (TLS-Versionen, Anwendungslogik, Zugriffsrechte) braucht es einen Auftrag,
// dafuer verweist die Seite auf das Kontaktformular.
//
// Aufbau: normalizeDomain() prueft die Eingabe, runSecurityCheck() sammelt Daten (Startseite, DNS) und
// uebergibt sie an die Einzelpruefungen. Jede Pruefung liefert Befunde {id, cat, sev, title, detail, fix}.
// Aus den Befunden berechnet scoreFindings() die Note. Die Pruefungen sind reine Funktionen der
// gesammelten Daten, damit sie sich ohne Netzwerk testen lassen (scripts/test-security-check.mjs).

const UA = "AltaEngineering-Sicherheitscheck/1.0 (+https://alta-engineering.ch/sicherheitscheck.html)";
const TIMEOUT_MS = 7000;
const MAX_BODY = 400_000;

export const CATEGORIES = [
  { id: "transport", title: "Verschlüsselung", weight: 25 },
  { id: "browser", title: "Schutz im Browser", weight: 20 },
  { id: "mail", title: "E-Mail-Schutz", weight: 20 },
  { id: "privacy", title: "Datenschutz und Drittanbieter", weight: 15 },
  { id: "dns", title: "Namensdienst (DNS)", weight: 10 },
  { id: "disclosure", title: "Offengelegte Informationen", weight: 10 },
];
const CATEGORY_EN = { transport: "Encryption", browser: "Protection in the browser", mail: "Email protection", privacy: "Privacy and third parties", dns: "Name service (DNS)", disclosure: "Disclosed information" };
const LIMITATIONS = {
  de: [
    "Geprüft werden nur öffentlich abrufbare Informationen der Startseite und des Namensdienstes.",
    "TLS-Versionen, Verschlüsselungsverfahren, Anwendungslogik, Zugriffsrechte und Software-Schwachstellen werden nicht getestet.",
    "Automatische Befunde ersetzen keine Beratung und keine rechtliche Prüfung.",
  ],
  en: [
    "Only publicly available information from the home page and the name service is checked.",
    "TLS versions, cipher suites, application logic, access rights and software vulnerabilities are not tested.",
    "Automatic findings do not replace advice or a legal review.",
  ],
};

// Sprache der Ausgabe: Deutsch (Standard) oder Englisch. Das Feld en wird in beiden Faellen entfernt.
function localize(f, lang) {
  const { en, ...rest } = f;
  if (lang !== "en" || !en) return rest;
  const out = { ...rest, title: en.title || rest.title, detail: en.detail != null ? en.detail : rest.detail };
  if (rest.fix) out.fix = en.fix || rest.fix;
  if (rest.snippet) out.snippet = en.snippet || rest.snippet;
  return out;
}

const PENALTY = { high: 25, medium: 12, low: 4, info: 0, ok: 0 };

const BLOCKED_SUFFIXES = [".local", ".localhost", ".internal", ".lan", ".home", ".corp", ".intranet", ".onion", ".arpa", ".test", ".invalid"];

// Eingabe wie "https://www.beispiel.ch/seite" oder "Beispiel.ch" -> { webHost, mailDomain } oder null.
// Lehnt IP-Adressen, Ports, Zugangsdaten in der Adresse und interne Namen ab, damit der Check nicht als
// Umweg zu fremden Netzen missbraucht werden kann.
export function normalizeDomain(input) {
  let d = String(input || "").trim().toLowerCase();
  if (!d || d.length > 300) return null;
  d = d.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  d = d.split(/[\/?#]/)[0].replace(/\.$/, "");
  if (!d || /[\s@:\[\]\\]/.test(d)) return null;
  let host;
  try {
    host = new URL("http://" + d).hostname;
  } catch {
    return null;
  }
  if (host.length > 253) return null;
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(host)) return null;
  const tld = host.split(".").pop();
  if (!/^[a-z]{2,}$/.test(tld) && !tld.startsWith("xn--")) return null;
  if (BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) return null;
  return { webHost: host, mailDomain: host.replace(/^www\./, "") };
}

// Befund mit deutschem Text und englischer Fassung (en: { title, detail, fix, snippet }). runSecurityCheck waehlt die Sprache.
const F = (id, cat, sev, title, detail, ...rest) => {
  const last = rest[rest.length - 1];
  const en = last && typeof last === "object" && "title" in last ? rest.pop() : null;
  const [fix, snippet] = rest;
  return { id, cat, sev, title, detail, ...(fix ? { fix } : {}), ...(snippet ? { snippet } : {}), ...(en ? { en } : {}) };
};

// ---------------------------------------------------------------------------
// Daten sammeln
// ---------------------------------------------------------------------------

function withTimeout() {
  return AbortSignal.timeout(TIMEOUT_MS);
}

async function readLimited(res, limit) {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (total < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  const all = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    all.set(c, off);
    off += c.length;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(all);
}

function shortError(e) {
  const m = String((e && e.message) || e || "unbekannter Fehler");
  if (/timed? ?out|abort/i.test(m)) return "Zeitüberschreitung";
  return m.replace(/\s+/g, " ").slice(0, 140);
}

async function fetchHome(host) {
  const out = { http: null, https: null, httpsError: null };
  const [httpRes, httpsRes] = await Promise.allSettled([
    fetch(`http://${host}/`, { redirect: "manual", signal: withTimeout(), headers: { "User-Agent": UA } }),
    fetch(`https://${host}/`, { redirect: "follow", signal: withTimeout(), headers: { "User-Agent": UA, Accept: "text/html,*/*;q=0.5" } }),
  ]);
  if (httpRes.status === "fulfilled") {
    const r = httpRes.value;
    out.http = { status: r.status, location: r.headers.get("location") || "" };
    r.body && r.body.cancel().catch(() => {});
  } else {
    out.http = { error: shortError(httpRes.reason) };
  }
  if (httpsRes.status === "fulfilled") {
    const r = httpsRes.value;
    out.https = {
      status: r.status,
      url: r.url,
      redirected: r.redirected,
      headers: r.headers,
      cookies: typeof r.headers.getSetCookie === "function" ? r.headers.getSetCookie() : [],
      contentType: r.headers.get("content-type") || "",
      body: /html|text|xml|^$/i.test(r.headers.get("content-type") || "") ? await readLimited(r, MAX_BODY) : "",
    };
  } else {
    out.httpsError = shortError(httpsRes.reason);
  }
  return out;
}

async function fetchSecurityTxt(host) {
  try {
    const r = await fetch(`https://${host}/.well-known/security.txt`, { redirect: "follow", signal: withTimeout(), headers: { "User-Agent": UA } });
    const text = r.ok ? await readLimited(r, 20_000) : "";
    return { status: r.status, valid: r.ok && /^\s*contact\s*:/im.test(text), text: text.slice(0, 2000) };
  } catch (e) {
    return { error: shortError(e) };
  }
}

async function doh(name, type, dnssec = false) {
  const u = new URL("https://cloudflare-dns.com/dns-query");
  u.searchParams.set("name", name);
  u.searchParams.set("type", type);
  if (dnssec) u.searchParams.set("do", "1");
  const r = await fetch(u.toString(), { headers: { Accept: "application/dns-json" }, signal: withTimeout() });
  if (!r.ok) throw new Error("DNS-Abfrage " + r.status);
  return r.json();
}

// TXT-Antworten kommen als "abc" "def" (mehrere Teilstuecke). Zusammensetzen wie ein Resolver.
function txtValues(res) {
  return ((res && res.Answer) || [])
    .filter((a) => a.type === 16)
    .map((a) => {
      const parts = [...String(a.data).matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
      return (parts.length ? parts.join("") : String(a.data)).replace(/\\(.)/g, "$1");
    });
}

const DKIM_SELECTORS = ["default", "google", "selector1", "selector2", "k1", "s1", "s2", "dkim", "mail", "smtp", "mandrill", "mxvault"];

async function fetchDns(mailDomain) {
  const safe = (p) => p.catch((e) => ({ error: shortError(e) }));
  const [a, aaaa, ns, caa, mx, txt, dmarc, mtasts, ...dkim] = await Promise.all([
    safe(doh(mailDomain, "A", true)),
    safe(doh(mailDomain, "AAAA")),
    safe(doh(mailDomain, "NS")),
    safe(doh(mailDomain, "CAA")),
    safe(doh(mailDomain, "MX")),
    safe(doh(mailDomain, "TXT")),
    safe(doh("_dmarc." + mailDomain, "TXT")),
    safe(doh("_mta-sts." + mailDomain, "TXT")),
    ...DKIM_SELECTORS.map((s) => safe(doh(`${s}._domainkey.${mailDomain}`, "TXT"))),
  ]);
  const dkimFound = DKIM_SELECTORS.filter((s, i) => txtValues(dkim[i]).some((v) => /v=DKIM1|k=rsa|p=/i.test(v)));
  return { a, aaaa, ns, caa, mx, txt, dmarc, mtasts, dkimFound };
}

// ---------------------------------------------------------------------------
// Pruefungen (reine Funktionen)
// ---------------------------------------------------------------------------

function checkTransport(home) {
  const out = [];
  if (home.httpsError) {
    out.push(
      F("https-down", "transport", "high", "Die Seite ist über HTTPS nicht erreichbar",
        `Der Abruf von https:// ist fehlgeschlagen (${home.httpsError}). Häufige Ursachen: abgelaufenes oder falsch ausgestelltes Zertifikat, Server nicht erreichbar oder Verbindung blockiert.`,
        "Zertifikat und Server prüfen. Kostenlose Zertifikate gibt es bei Let's Encrypt, viele Hoster richten sie mit einem Klick ein.",
        { title: "The site is not reachable via HTTPS", detail: `Retrieving https:// failed (${home.httpsError === "Zeitüberschreitung" ? "timeout" : home.httpsError}). Common causes: an expired or incorrectly issued certificate, an unreachable server or a blocked connection.`, fix: "Check certificate and server. Free certificates are available from Let's Encrypt, many hosts set them up with one click." })
    );
    return out;
  }
  out.push(F("https-ok", "transport", "ok", "HTTPS funktioniert", "Die Seite lädt verschlüsselt und das Zertifikat wird vom Browser akzeptiert.",
        { title: "HTTPS works", detail: "The site loads encrypted and the browser accepts the certificate." }));

  const h = home.http;
  if (h && h.error) {
    out.push(F("http-closed", "transport", "ok", "Unverschlüsselter Zugang ist geschlossen", "Port 80 antwortet nicht, die Seite ist nur über HTTPS erreichbar.",
        { title: "Unencrypted access is closed", detail: "Port 80 does not respond, the site is only reachable via HTTPS." }));
  } else if (h && [301, 302, 303, 307, 308].includes(h.status) && /^https:\/\//i.test(h.location)) {
    out.push(F("http-redirect", "transport", "ok", "http:// leitet auf https:// um", `Weiterleitung mit Status ${h.status}.`,
        { title: "http:// redirects to https://", detail: `Redirect with status ${h.status}.` }));
  } else if (h && h.status >= 200 && h.status < 300) {
    out.push(
      F("http-open", "transport", "medium", "Die Seite ist auch unverschlüsselt erreichbar",
        "Unter http:// wird der Inhalt ausgeliefert, statt auf https:// umzuleiten. Wer einen alten Link oder eine Tippvariante nutzt, übermittelt Daten im Klartext.",
        "Auf dem Server eine dauerhafte Weiterleitung (301) von http:// auf https:// einrichten.",
        "# nginx\nserver { listen 80; return 301 https://$host$request_uri; }",
        { title: "The site is also reachable unencrypted", detail: "Under http:// the content is delivered instead of redirecting to https://. Anyone using an old link or a typo variant transmits data in plain text.", fix: "Set up a permanent redirect (301) from http:// to https:// on the server." })
    );
  } else if (h) {
    out.push(F("http-redirect-weak", "transport", "low", "Weiterleitung auf HTTPS nicht sauber", `Die Antwort auf http:// hat Status ${h.status} ohne klare Weiterleitung auf https://.`, "Eine dauerhafte Weiterleitung (301) auf die https://-Adresse einrichten.",
        { title: "Redirect to HTTPS is not clean", detail: `The response on http:// has status ${h.status} without a clear redirect to https://.`, fix: "Set up a permanent redirect (301) to the https:// address." }));
  }

  const hsts = home.https.headers.get("strict-transport-security");
  if (!hsts) {
    out.push(
      F("hsts-missing", "transport", "medium", "HSTS fehlt",
        "Ohne den Header Strict-Transport-Security kann ein Angreifer im selben Netz (z. B. öffentliches WLAN) den ersten Aufruf auf eine unverschlüsselte Verbindung herunterstufen.",
        "Header setzen, sobald HTTPS überall sauber läuft. Mit einem kurzen Wert starten und später verlängern.",
        "Strict-Transport-Security: max-age=31536000; includeSubDomains",
        { title: "HSTS missing", detail: "Without the Strict-Transport-Security header, an attacker on the same network (for example public Wi-Fi) can downgrade the first visit to an unencrypted connection.", fix: "Set the header once HTTPS works cleanly everywhere. Start with a short value and extend it later." })
    );
  } else {
    const age = Number((/max-age=(\d+)/i.exec(hsts) || [])[1] || 0);
    if (age < 15552000) {
      out.push(F("hsts-short", "transport", "low", "HSTS ist zu kurz eingestellt", `max-age beträgt ${age} Sekunden. Empfohlen sind mindestens 6 Monate (15552000), besser 1 Jahr.`, "max-age auf mindestens 31536000 erhöhen.", "Strict-Transport-Security: max-age=31536000; includeSubDomains",
        { title: "HSTS is set too short", detail: `max-age is ${age} seconds. At least 6 months (15552000) is recommended, 1 year is better.`, fix: "Increase max-age to at least 31536000." }));
    } else {
      out.push(F("hsts-ok", "transport", "ok", "HSTS ist aktiv", `max-age ${age} Sekunden${/includesubdomains/i.test(hsts) ? ", gilt auch für Subdomains" : ""}${/preload/i.test(hsts) ? ", mit Preload" : ""}.`,
        { title: "HSTS is active", detail: `max-age ${age} seconds${/includesubdomains/i.test(hsts) ? ", also applies to subdomains" : ""}${/preload/i.test(hsts) ? ", with preload" : ""}.` }));
    }
  }
  return out;
}

function parseCsp(csp) {
  const dirs = {};
  for (const part of csp.split(";")) {
    const bits = part.trim().split(/\s+/);
    if (bits[0]) dirs[bits[0].toLowerCase()] = bits.slice(1);
  }
  return dirs;
}

// CSP aus einem Meta-Tag (<meta http-equiv="Content-Security-Policy" content="...">). Browser setzen sie durch,
// ausser frame-ancestors, report-uri und sandbox: die wirken nur im HTTP-Header.
function metaCsp(body) {
  for (const m of (body || "").matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/http-equiv\s*=\s*["']?content-security-policy["'\s>]/i.test(tag)) continue;
    const c = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    if (c) return (c[1] ?? c[2]).replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").trim() || null;
  }
  return null;
}

function checkHeaders(home) {
  const out = [];
  if (home.httpsError) return out;
  const h = home.https.headers;

  const cspHeader = h.get("content-security-policy");
  const cspMeta = cspHeader ? null : metaCsp(home.https.body);
  const csp = cspHeader || cspMeta;
  if (!csp) {
    out.push(
      F("csp-missing", "browser", "medium", "Content-Security-Policy fehlt",
        "Eine CSP legt fest, welche Skripte und Inhalte die Seite laden darf. Ohne sie kann eingeschleuster Code (Cross-Site-Scripting) ungehindert Daten abgreifen oder die Seite verändern.",
        "Eine Richtlinie definieren, die nur eigene Quellen erlaubt, und schrittweise um nötige Drittquellen erweitern. Zuerst im Testmodus (Content-Security-Policy-Report-Only) beobachten.",
        "Content-Security-Policy: default-src 'self'; img-src 'self' data:; frame-ancestors 'self'",
        { title: "Content Security Policy missing", detail: "A CSP defines which scripts and content the page may load. Without it, injected code (cross-site scripting) can freely steal data or alter the page.", fix: "Define a policy that only allows your own sources and extend it step by step with the third-party sources you need. Watch it in test mode first (Content-Security-Policy-Report-Only)." })
    );
  } else {
    const d = parseCsp(csp);
    const script = d["script-src"] || d["default-src"] || [];
    const weak = script.filter((v) => /^'unsafe-inline'$|^'unsafe-eval'$|^\*$|^https?:$|^data:$/.test(v));
    if (!d["script-src"] && !d["default-src"]) {
      out.push(F("csp-noscript", "browser", "low", "CSP schützt Skripte nicht", "Die Richtlinie enthält weder script-src noch default-src, Skripte sind dadurch nicht eingeschränkt.", "default-src 'self' oder ein eigenes script-src ergänzen.",
        { title: "CSP does not protect scripts", detail: "The policy contains neither script-src nor default-src, so scripts are not restricted.", fix: "Add default-src 'self' or a dedicated script-src." }));
    } else if (weak.length) {
      out.push(F("csp-weak", "browser", "low", "CSP ist aufgeweicht", `Die Skript-Regel erlaubt ${weak.join(", ")}. Damit verliert die Richtlinie einen grossen Teil ihrer Schutzwirkung gegen eingeschleusten Code.`, "Inline-Skripte durch Dateien oder Nonces ersetzen und unsafe-inline entfernen.",
        { title: "CSP is weakened", detail: `The script rule allows ${weak.join(", ")}. The policy thus loses much of its protection against injected code.`, fix: "Replace inline scripts with files or nonces and remove unsafe-inline." }));
    } else {
      out.push(cspMeta
        ? F("csp-ok", "browser", "ok", "Content-Security-Policy ist gesetzt (Meta-Tag)", "Skripte sind auf definierte Quellen eingeschränkt. Die Richtlinie steht als Meta-Tag im HTML. Der Schutz vor Einbettung (frame-ancestors) wirkt nur als HTTP-Header.",
        { title: "Content Security Policy is set (meta tag)", detail: "Scripts are restricted to defined sources. The policy is set as a meta tag in the HTML. Protection against embedding (frame-ancestors) only works as an HTTP header." })
        : F("csp-ok", "browser", "ok", "Content-Security-Policy ist gesetzt", "Skripte sind auf definierte Quellen eingeschränkt.",
        { title: "Content Security Policy is set", detail: "Scripts are restricted to defined sources." }));
    }
  }

  const xfo = h.get("x-frame-options");
  // frame-ancestors wirkt nur im Header, im Meta-Tag ignorieren Browser die Anweisung
  const frameAncestors = cspHeader && /frame-ancestors/i.test(cspHeader);
  if (!xfo && !frameAncestors) {
    out.push(
      F("clickjacking", "browser", "low", "Schutz vor Einbettung (Clickjacking) fehlt",
        "Die Seite darf von fremden Seiten in einem unsichtbaren Rahmen eingebettet werden. Besucher können so zu Klicks verleitet werden, die sie nicht beabsichtigen.",
        "Einbettung verbieten, falls sie nicht gebraucht wird.",
        "X-Frame-Options: SAMEORIGIN\n# oder in der CSP: frame-ancestors 'self'",
        { title: "Protection against embedding (clickjacking) missing", detail: "Other sites may embed this page in an invisible frame. Visitors can be tricked into clicks they did not intend.", fix: "Prohibit embedding if it is not needed.", snippet: "X-Frame-Options: SAMEORIGIN\n# or in the CSP: frame-ancestors 'self'" })
    );
  } else {
    out.push(F("clickjacking-ok", "browser", "ok", "Schutz vor Einbettung ist aktiv", xfo ? `X-Frame-Options: ${xfo}` : "frame-ancestors in der CSP",
        { title: "Protection against embedding is active", detail: xfo ? `X-Frame-Options: ${xfo}` : "frame-ancestors in the CSP" }));
  }

  if (!/nosniff/i.test(h.get("x-content-type-options") || "")) {
    out.push(F("nosniff", "browser", "low", "X-Content-Type-Options fehlt", "Ohne diesen Header darf der Browser Dateitypen erraten und dabei Inhalte als Skript ausführen, die als Bild oder Text gedacht waren.", "Header setzen.", "X-Content-Type-Options: nosniff",
        { title: "X-Content-Type-Options missing", detail: "Without this header the browser may guess file types and run content as a script that was meant as an image or text.", fix: "Set the header." }));
  } else {
    out.push(F("nosniff-ok", "browser", "ok", "X-Content-Type-Options ist gesetzt", "nosniff verhindert das Erraten von Dateitypen.",
        { title: "X-Content-Type-Options is set", detail: "nosniff prevents the guessing of file types." }));
  }

  if (!h.get("referrer-policy") && !/name=["']referrer["']/i.test(home.https.body || "")) {
    out.push(F("referrer", "browser", "low", "Referrer-Policy fehlt", "Beim Klick auf externe Links geben Browser die vollständige Adresse der aktuellen Seite weiter. Darin können interne Pfade oder Kennungen stehen.", "Weitergabe auf die Domain beschränken.", "Referrer-Policy: strict-origin-when-cross-origin",
        { title: "Referrer-Policy missing", detail: "When following external links, browsers pass on the full address of the current page. It may contain internal paths or identifiers.", fix: "Limit what is passed on to the domain." }));
  } else {
    out.push(F("referrer-ok", "browser", "ok", "Referrer-Policy ist gesetzt", h.get("referrer-policy") || "über Meta-Tag",
        { title: "Referrer-Policy is set", detail: h.get("referrer-policy") || "via meta tag" }));
  }

  if (!h.get("permissions-policy")) {
    out.push(F("permissions", "browser", "info", "Permissions-Policy fehlt", "Damit lässt sich festlegen, welche Browserfunktionen (Kamera, Mikrofon, Standort) die Seite und eingebettete Inhalte nutzen dürfen. Kein Mangel, aber eine einfache Härtung.", "Nicht benötigte Funktionen sperren.", "Permissions-Policy: camera=(), microphone=(), geolocation=()",
        { title: "Permissions-Policy missing", detail: "It defines which browser features (camera, microphone, location) the site and embedded content may use. Not a defect, but a simple hardening.", fix: "Block features that are not needed." }));
  }

  const acao = h.get("access-control-allow-origin");
  if (acao === "*" && /true/i.test(h.get("access-control-allow-credentials") || "")) {
    out.push(F("cors", "browser", "high", "CORS erlaubt alle Herkunftsseiten mit Anmeldedaten", "Access-Control-Allow-Origin: * zusammen mit Allow-Credentials: true ist eine gefährliche Fehlkonfiguration.", "Nur bekannte Herkunftsseiten ausdrücklich freigeben.",
        { title: "CORS allows all origins with credentials", detail: "Access-Control-Allow-Origin: * together with Allow-Credentials: true is a dangerous misconfiguration.", fix: "Explicitly allow only known origins." }));
  }

  // Cookies
  const cookies = home.https.cookies.map(parseCookie);
  if (cookies.length) {
    const noSecure = cookies.filter((c) => !c.secure);
    const sessionNoHttpOnly = cookies.filter((c) => !c.httpOnly && /sess|sid|auth|token|login|jwt|csrf/i.test(c.name));
    if (noSecure.length) {
      out.push(F("cookie-secure", "browser", "low", "Cookies ohne Secure-Flag", `${noSecure.map((c) => c.name).join(", ")}: Diese Cookies dürfen auch über unverschlüsselte Verbindungen gesendet werden.`, "Beim Setzen das Attribut Secure ergänzen.",
        { title: "Cookies without Secure flag", detail: `${noSecure.map((c) => c.name).join(", ")}: these cookies may also be sent over unencrypted connections.`, fix: "Add the Secure attribute when setting them." }));
    }
    if (sessionNoHttpOnly.length) {
      out.push(F("cookie-httponly", "browser", "medium", "Sitzungs-Cookie ohne HttpOnly", `${sessionNoHttpOnly.map((c) => c.name).join(", ")}: Skripte auf der Seite können dieses Cookie lesen. Bei einer Sicherheitslücke (XSS) lässt sich damit die Sitzung stehlen.`, "Beim Setzen das Attribut HttpOnly ergänzen.",
        { title: "Session cookie without HttpOnly", detail: `${sessionNoHttpOnly.map((c) => c.name).join(", ")}: scripts on the page can read this cookie. With a vulnerability (XSS), the session can be stolen.`, fix: "Add the HttpOnly attribute when setting it." }));
    }
    if (!noSecure.length && !sessionNoHttpOnly.length) {
      out.push(F("cookie-ok", "browser", "ok", "Cookie-Attribute sind in Ordnung", `${cookies.length} Cookie${cookies.length === 1 ? "" : "s"} beim ersten Aufruf, mit Secure bzw. HttpOnly wo nötig.`,
        { title: "Cookie attributes are fine", detail: `${cookies.length} cookie${cookies.length === 1 ? "" : "s"} on the first visit, with Secure or HttpOnly where needed.` }));
    }
  }
  return out;
}

function parseCookie(line) {
  const parts = String(line).split(";").map((s) => s.trim());
  const [name] = parts[0].split("=");
  const attrs = parts.slice(1).map((p) => p.toLowerCase());
  return { name, secure: attrs.includes("secure"), httpOnly: attrs.includes("httponly"), sameSite: (attrs.find((a) => a.startsWith("samesite=")) || "").split("=")[1] || "" };
}

function checkDisclosure(home, securityTxt) {
  const out = [];
  if (home.httpsError) return out;
  const h = home.https.headers;
  const leaks = [];
  const server = h.get("server");
  if (server && /\d+\.\d+/.test(server)) leaks.push(`Server: ${server}`);
  for (const name of ["x-powered-by", "x-aspnet-version", "x-aspnetmvc-version", "x-generator"]) {
    const v = h.get(name);
    if (v) leaks.push(`${name}: ${v}`);
  }
  const gen = /<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i.exec(home.https.body || "");
  if (gen && /\d+\.\d+/.test(gen[1])) leaks.push(`Generator: ${gen[1]}`);
  if (leaks.length) {
    out.push(F("version-leak", "disclosure", "low", "Software und Versionen werden verraten", `Die Antwort nennt: ${leaks.join("; ")}. Wer die Version kennt, sucht gezielt nach bekannten Schwachstellen.`, "Versionsangaben im Server und im CMS ausblenden und die Software aktuell halten.", "# nginx\nserver_tokens off;\n# Apache\nServerTokens Prod\n# PHP\nexpose_php = Off",
        { title: "Software and versions are disclosed", detail: `The response names: ${leaks.join("; ")}. Anyone who knows the version looks specifically for known vulnerabilities.`, fix: "Hide version details in the server and CMS and keep the software up to date." }));
  } else {
    out.push(F("version-ok", "disclosure", "ok", "Keine Versionsangaben in den Antwortköpfen", "Server und Framework verraten keine Versionsnummern.",
        { title: "No version information in response headers", detail: "Server and framework do not reveal version numbers." }));
  }
  if (securityTxt && securityTxt.valid) {
    out.push(F("securitytxt-ok", "disclosure", "ok", "security.txt vorhanden", "Sicherheitsforschende finden eine Kontaktadresse für Meldungen (RFC 9116).",
        { title: "security.txt present", detail: "Security researchers find a contact address for reports (RFC 9116)." }));
  } else {
    out.push(F("securitytxt", "disclosure", "info", "Keine security.txt gefunden", "Mit einer kleinen Datei unter /.well-known/security.txt erfahren Sie von entdeckten Schwachstellen, bevor sie jemand ausnutzt.", "Datei mit Kontaktadresse und Ablaufdatum anlegen.", "Contact: mailto:sicherheit@ihre-firma.ch\nExpires: 2027-12-31T23:59:00.000Z\nPreferred-Languages: de, en",
        { title: "No security.txt found", detail: "With a small file at /.well-known/security.txt you learn about discovered vulnerabilities before someone exploits them.", fix: "Create the file with a contact address and expiry date.", snippet: "Contact: mailto:security@your-company.ch\nExpires: 2027-12-31T23:59:00.000Z\nPreferred-Languages: de, en" }));
  }
  return out;
}

const KNOWN_THIRD_PARTIES = [
  { re: /(^|\.)(googletagmanager|google-analytics|analytics\.google)\.com$/, name: "Google Analytics / Tag Manager", track: true },
  { re: /(^|\.)(fonts\.googleapis|fonts\.gstatic)\.com$/, name: "Google Fonts (extern geladen)", fonts: true },
  { re: /(^|\.)(connect\.facebook\.net|facebook\.com)$/, name: "Meta (Facebook) Pixel / Plugins", track: true },
  { re: /(^|\.)(hotjar\.com|hotjar\.io)$/, name: "Hotjar", track: true },
  { re: /(^|\.)clarity\.ms$/, name: "Microsoft Clarity", track: true },
  { re: /(^|\.)(doubleclick\.net|googlesyndication\.com|googleadservices\.com)$/, name: "Google Ads", track: true },
  { re: /(^|\.)(snap\.licdn\.com|px\.ads\.linkedin\.com)$/, name: "LinkedIn Insight", track: true },
  { re: /(^|\.)(maps\.googleapis\.com|maps\.gstatic\.com)$/, name: "Google Maps", maps: true },
  { re: /(^|\.)(youtube\.com|youtu\.be|ytimg\.com)$/, name: "YouTube (Einbettung)", embed: true },
  { re: /(^|\.)(recaptcha\.net)$/, name: "reCAPTCHA", embed: true },
  { re: /(^|\.)(platform\.twitter\.com|twimg\.com)$/, name: "X (Twitter) Einbettung", embed: true },
];

const CDN_HOSTS = /(^|\.)(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|code\.jquery\.com|ajax\.googleapis\.com|stackpath\.bootstrapcdn\.com|maxcdn\.bootstrapcdn\.com)$/;

function attr(tag, name) {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return m ? (m[2] ?? m[3] ?? m[4] ?? "") : null;
}

function checkPage(home, mailDomain) {
  const out = [];
  if (home.httpsError) return out;
  const body = home.https.body || "";
  const base = home.https.url;
  const sameSite = (host) => host === mailDomain || host.endsWith("." + mailDomain);

  const visibleText = body.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/gi, " ").replace(/\s+/g, " ").trim();
  const scriptCount = (body.match(/<script/gi) || []).length;
  const spa = body.length > 0 && visibleText.length < 150 && (scriptCount >= 2 || /id=["']?(root|app|__next|__nuxt|q-app)["']?[\s>]/i.test(body));

  const resources = [];
  const tagRe = /<(script|link|img|iframe|form|source|video|audio|embed|object)\b[^>]*>/gi;
  let m;
  while ((m = tagRe.exec(body))) {
    const tag = m[0];
    const kind = m[1].toLowerCase();
    const raw = kind === "form" ? attr(tag, "action") : kind === "link" ? attr(tag, "href") : attr(tag, "src") || (kind === "object" ? attr(tag, "data") : null);
    if (!raw || /^(data:|mailto:|tel:|javascript:|#)/i.test(raw)) continue;
    let u;
    try {
      u = new URL(raw, base);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(u.protocol)) continue;
    const rel = (attr(tag, "rel") || "").toLowerCase();
    if (kind === "link" && !/stylesheet|preload|modulepreload/.test(rel)) continue;
    resources.push({ kind, url: u, integrity: attr(tag, "integrity"), rel });
  }

  // Gemischte Inhalte: http://-Ressourcen auf einer https://-Seite
  const mixed = resources.filter((r) => r.url.protocol === "http:" && r.kind !== "form");
  const mixedActive = mixed.filter((r) => ["script", "link", "iframe", "object", "embed"].includes(r.kind));
  if (mixedActive.length) {
    out.push(F("mixed-active", "transport", "medium", "Unverschlüsselte Skripte oder Stile auf einer verschlüsselten Seite", `${mixedActive.length} Ressource${mixedActive.length === 1 ? "" : "n"} werden über http:// geladen, z. B. ${mixedActive[0].url.host}. Browser blockieren sie meist, die Seite funktioniert dann nicht richtig. Wo nicht, kann ein Angreifer sie austauschen.`, "Alle Ressourcen über https:// einbinden.",
        { title: "Unencrypted scripts or styles on an encrypted page", detail: `${mixedActive.length} resource${mixedActive.length === 1 ? " is" : "s are"} loaded via http://, for example ${mixedActive[0].url.host}. Browsers usually block them and the page then does not work properly. Where they do not, an attacker can replace them.`, fix: "Load all resources via https://." }));
  } else if (mixed.length) {
    out.push(F("mixed-passive", "transport", "low", "Unverschlüsselte Bilder oder Medien", `${mixed.length} Datei${mixed.length === 1 ? "" : "en"} werden über http:// geladen, z. B. von ${mixed[0].url.host}. Browser zeigen dafür eine Warnung.`, "Alle Ressourcen über https:// einbinden.",
        { title: "Unencrypted images or media", detail: `${mixed.length} file${mixed.length === 1 ? " is" : "s are"} loaded via http://, for example from ${mixed[0].url.host}. Browsers show a warning for this.`, fix: "Load all resources via https://." }));
  }
  const badForms = resources.filter((r) => r.kind === "form" && r.url.protocol === "http:");
  if (badForms.length) {
    out.push(F("form-http", "transport", "high", "Formular sendet unverschlüsselt", "Mindestens ein Formular schickt seine Eingaben über http:// ab. Passwörter und persönliche Daten wären im Klartext lesbar.", "Die Formular-Adresse auf https:// umstellen.",
        { title: "Form sends unencrypted", detail: "At least one form submits its input via http://. Passwords and personal data would be readable in plain text.", fix: "Change the form address to https://." }));
  }

  // Fremdanbieter
  const thirdHosts = new Map();
  for (const r of resources) {
    if (r.url.protocol !== "https:" && r.url.protocol !== "http:") continue;
    const host = r.url.hostname;
    if (sameSite(host)) continue;
    if (r.kind === "form") continue;
    thirdHosts.set(host, (thirdHosts.get(host) || 0) + 1);
  }
  const found = new Map();
  for (const host of thirdHosts.keys()) {
    const k = KNOWN_THIRD_PARTIES.find((t) => t.re.test(host));
    if (k) found.set(k.name, k);
  }
  const trackers = [...found.values()].filter((k) => k.track);
  const fonts = [...found.values()].filter((k) => k.fonts);
  const embeds = [...found.values()].filter((k) => k.embed || k.maps);

  if (trackers.length) {
    out.push(F("trackers", "privacy", "medium", "Tracking-Dienste eingebunden", `Gefunden: ${trackers.map((t) => t.name).join(", ")}. Besucherdaten (u. a. IP-Adresse) gehen dabei an Anbieter im Ausland. Ob die Einwilligung korrekt eingeholt wird, lässt sich von aussen nicht prüfen.`, "Datenschutzerklärung und Einwilligung (Cookie-Banner mit echter Wahl) prüfen. Wo möglich auf datensparsame Statistik ohne Cookies wechseln.",
        { title: "Tracking services embedded", detail: `Found: ${trackers.map((t) => t.name).join(", ")}. Visitor data (including the IP address) goes to providers abroad. Whether consent is obtained correctly cannot be checked from outside.`, fix: "Check the privacy policy and consent (cookie banner with a real choice). Where possible, switch to privacy-friendly statistics without cookies." }));
  } else if (!spa) {
    out.push(F("trackers-none", "privacy", "ok", "Keine bekannten Tracking-Dienste auf der Startseite", "Beim Seitenaufruf werden keine bekannten Analyse- oder Werbedienste nachgeladen.",
        { title: "No known tracking services on the home page", detail: "No known analytics or advertising services are loaded when the page is opened." }));
  }
  if (fonts.length) {
    out.push(F("fonts", "privacy", "low", "Schriften werden bei Google geladen", "Jeder Seitenaufruf übermittelt die IP-Adresse der Besucher an Google. Das lässt sich vermeiden und ist in der Datenschutzerklärung zu nennen.", "Schriftdateien herunterladen und vom eigenen Server ausliefern.",
        { title: "Fonts are loaded from Google", detail: "Every page view transmits the visitors' IP address to Google. This can be avoided and must be mentioned in the privacy policy.", fix: "Download the font files and serve them from your own server." }));
  }
  if (embeds.length) {
    out.push(F("embeds", "privacy", "info", "Eingebettete Fremdinhalte", `Gefunden: ${embeds.map((t) => t.name).join(", ")}. Solche Einbettungen laden schon beim Öffnen der Seite Daten vom Anbieter.`, "Inhalte erst nach Klick laden (Zwei-Klick-Lösung) und in der Datenschutzerklärung nennen.",
        { title: "Embedded third-party content", detail: `Found: ${embeds.map((t) => t.name).join(", ")}. Such embeds load data from the provider as soon as the page opens.`, fix: "Load content only after a click (two-click solution) and mention it in the privacy policy." }));
  }

  // Fremde Skripte ohne Integritaetspruefung (nur bei oeffentlichen Bibliotheks-CDNs sinnvoll)
  const noSri = resources.filter((r) => (r.kind === "script" || (r.kind === "link" && r.rel.includes("stylesheet"))) && CDN_HOSTS.test(r.url.hostname) && !r.integrity);
  if (noSri.length) {
    out.push(F("sri", "browser", "low", "Bibliotheken von Fremd-CDNs ohne Integritätsprüfung", `${noSri.length} Datei${noSri.length === 1 ? "" : "en"} von ${[...new Set(noSri.map((r) => r.url.host))].join(", ")} werden ohne integrity-Attribut geladen. Wird das CDN kompromittiert, läuft fremder Code auf Ihrer Seite.`, "Attribut integrity mit Prüfsumme und crossorigin ergänzen, oder die Bibliothek selbst ausliefern.", '<script src="https://cdn.example/lib.js" integrity="sha384-..." crossorigin="anonymous"></script>',
        { title: "Libraries from third-party CDNs without integrity check", detail: `${noSri.length} file${noSri.length === 1 ? "" : "s"} from ${[...new Set(noSri.map((r) => r.url.host))].join(", ")} ${noSri.length === 1 ? "is" : "are"} loaded without an integrity attribute. If the CDN is compromised, foreign code runs on your site.`, fix: "Add the integrity attribute with a checksum and crossorigin, or serve the library yourself." }));
  }

  if (!spa && body.length > 0) {
    if (!/href=["'][^"']*(datenschutz|privacy|datenschutzerklaerung|confidentialite)[^"']*["']/i.test(body)) {
      out.push(F("privacy-link", "privacy", "low", "Keine Datenschutzerklärung verlinkt gefunden", "Auf der Startseite wurde kein Link zu einer Datenschutzerklärung erkannt. Das revidierte Schweizer Datenschutzgesetz verlangt, dass Besucher über die Bearbeitung ihrer Daten informiert werden. Hinweis: Die Erkennung ist einfach und kann bei ungewöhnlichen Link-Namen danebenliegen.", "Datenschutzerklärung erstellen und im Fusszeilenbereich jeder Seite verlinken.",
        { title: "No linked privacy policy found", detail: "No link to a privacy policy was detected on the home page. The revised Swiss Data Protection Act requires that visitors are informed about the processing of their data. Note: the detection is simple and may miss unusual link names.", fix: "Create a privacy policy and link it in the footer of every page." }));
    } else {
      out.push(F("privacy-link-ok", "privacy", "ok", "Datenschutzerklärung ist verlinkt", "Auf der Startseite ist ein Link zur Datenschutzerklärung vorhanden.",
        { title: "Privacy policy is linked", detail: "The home page links to the privacy policy." }));
    }
  }
  if (spa) {
    out.push(F("spa", "privacy", "info", "Inhalte werden per JavaScript geladen", "Die Startseite enthält kaum Text im Quelltext. Deshalb konnte die Analyse von Fremdanbietern und Verlinkungen nur eingeschränkt erfolgen.", "Die ausführliche Prüfung deckt auch solche Seiten im Browser ab.",
        { title: "Content is loaded via JavaScript", detail: "The home page contains hardly any text in the source code. The analysis of third parties and links was therefore limited.", fix: "The detailed review also covers such pages in the browser." }));
  }
  return out;
}

function parseSpf(records) {
  const spf = records.filter((v) => /^v=spf1\b/i.test(v.trim()));
  return spf;
}

function checkMail(dns, mailDomain) {
  const out = [];
  const mxAns = ((dns.mx && dns.mx.Answer) || []).filter((a) => a.type === 15);
  const nullMx = mxAns.length === 1 && /^\d+\s+\.?$/.test(String(mxAns[0].data).trim());
  const hasMx = mxAns.length > 0 && !nullMx;
  if (dns.mx && dns.mx.error) {
    out.push(F("mail-error", "mail", "info", "E-Mail-Einträge konnten nicht abgefragt werden", dns.mx.error,
        { title: "Email records could not be queried", detail: `The query failed (${dns.mx.error === "Zeitüberschreitung" ? "timeout" : dns.mx.error}).` }));
    return { findings: out, applicable: false };
  }
  const spfRecords = parseSpf(txtValues(dns.txt));
  const dmarcRecords = txtValues(dns.dmarc).filter((v) => /^v=DMARC1/i.test(v.trim()));

  if (!hasMx) {
    // Domain ohne eigene Mail: Schutz gegen Missbrauch als Absender trotzdem sinnvoll
    out.push(F("mail-nomx", "mail", "info", "Domain nimmt keine E-Mails an", "Es gibt keinen Mail-Server-Eintrag (MX). Damit niemand die Domain als gefälschten Absender missbraucht, sollte trotzdem ein SPF-Eintrag 'v=spf1 -all' und eine DMARC-Richtlinie bestehen.", null, `${mailDomain}.  TXT  "v=spf1 -all"\n_dmarc.${mailDomain}.  TXT  "v=DMARC1; p=reject;"`,
        { title: "Domain does not accept email", detail: "There is no mail server record (MX). So that nobody misuses the domain as a forged sender, an SPF record 'v=spf1 -all' and a DMARC policy should still exist." }));
    if (!spfRecords.length || !dmarcRecords.length) return { findings: out, applicable: false };
  }

  // SPF
  if (!spfRecords.length) {
    out.push(F("spf-missing", "mail", "medium", "SPF fehlt", "Ohne SPF-Eintrag kann jeder E-Mails mit Ihrer Domain als Absender verschicken, ohne dass Empfänger es erkennen. Ihre echten Mails landen zudem eher im Spam.", "TXT-Eintrag mit den erlaubten Versandservern anlegen. Die Angaben liefert Ihr Mail-Anbieter.", `${mailDomain}.  TXT  "v=spf1 include:_spf.ihr-anbieter.ch -all"`,
        { title: "SPF missing", detail: "Without an SPF record anyone can send emails with your domain as the sender without recipients noticing. Your genuine emails are also more likely to end up in spam.", fix: "Create a TXT record with the permitted sending servers. Your email provider supplies the details.", snippet: `${mailDomain}.  TXT  "v=spf1 include:_spf.your-provider.ch -all"` }));
  } else if (spfRecords.length > 1) {
    out.push(F("spf-multi", "mail", "medium", "Mehrere SPF-Einträge", "Es darf nur einen SPF-Eintrag geben. Mehrere führen dazu, dass Empfänger keinen davon gelten lassen.", "Die Einträge zu einem einzigen zusammenführen.",
        { title: "Several SPF records", detail: "There may only be one SPF record. Several of them lead recipients to accept none of them.", fix: "Merge the records into a single one." }));
  } else {
    const spf = spfRecords[0].trim();
    const all = (/\s([+\-~?]?)all\s*$/i.exec(spf) || [])[1];
    const lookups = (spf.match(/\b(include:|a\b|mx\b|ptr\b|exists:|redirect=)/gi) || []).length;
    if (all === "+" || all === "") {
      out.push(F("spf-open", "mail", "high", "SPF erlaubt jeden Absender", `Der Eintrag endet auf 'all' ohne Einschränkung (${spf.slice(-30)}). Damit ist der Schutz wirkungslos.`, "Mit -all (streng) oder ~all abschliessen.", "v=spf1 include:... -all",
        { title: "SPF allows any sender", detail: `The record ends with 'all' without restriction (${spf.slice(-30)}). The protection is therefore ineffective.`, fix: "End it with -all (strict) or ~all." }));
    } else if (all === "?") {
      out.push(F("spf-neutral", "mail", "medium", "SPF ist neutral eingestellt", "Mit ?all treffen Empfänger keine Entscheidung. Gefälschte Mails werden nicht abgewiesen.", "Auf ~all oder -all umstellen.",
        { title: "SPF is set to neutral", detail: "With ?all recipients make no decision. Forged emails are not rejected.", fix: "Change to ~all or -all." }));
    } else if (!all) {
      out.push(F("spf-noall", "mail", "low", "SPF ohne abschliessende Regel", "Dem Eintrag fehlt ein abschliessendes -all oder ~all.", "Mit -all abschliessen.",
        { title: "SPF without a final rule", detail: "The record lacks a final -all or ~all.", fix: "End it with -all." }));
    } else if (lookups > 10) {
      out.push(F("spf-lookups", "mail", "low", "SPF hat womöglich zu viele Abfragen", `Der Eintrag enthält etwa ${lookups} Verweise. Erlaubt sind höchstens 10 DNS-Abfragen, sonst wird der Eintrag ungültig.`, "Überflüssige include-Verweise entfernen.",
        { title: "SPF may have too many lookups", detail: `The record contains about ${lookups} references. At most 10 DNS lookups are allowed, otherwise the record becomes invalid.`, fix: "Remove unnecessary include references." }));
    } else {
      out.push(F("spf-ok", "mail", "ok", "SPF ist eingerichtet", all === "-" ? "Streng mit -all: nicht aufgeführte Absender werden abgelehnt." : "Mit ~all: nicht aufgeführte Absender gelten als verdächtig.",
        { title: "SPF is set up", detail: all === "-" ? "Strict with -all: senders not listed are rejected." : "With ~all: senders not listed are treated as suspicious." }));
    }
  }

  // DMARC
  if (!dmarcRecords.length) {
    out.push(F("dmarc-missing", "mail", "medium", "DMARC fehlt", "DMARC sagt Empfängern, was mit gefälschten Mails Ihrer Domain geschehen soll, und liefert Ihnen Berichte darüber. Grosse Anbieter verlangen es zunehmend für zuverlässige Zustellung.", "Zuerst im Beobachtungsmodus starten, nach einigen Wochen auf quarantine oder reject erhöhen.", `_dmarc.${mailDomain}.  TXT  "v=DMARC1; p=none; rua=mailto:dmarc@${mailDomain}"`,
        { title: "DMARC missing", detail: "DMARC tells recipients what to do with forged emails from your domain and sends you reports about them. Large providers increasingly require it for reliable delivery.", fix: "Start in monitoring mode, then raise it to quarantine or reject after a few weeks." }));
  } else {
    const d = dmarcRecords[0];
    const p = ((/\bp=([a-z]+)/i.exec(d) || [])[1] || "").toLowerCase();
    if (p === "none") {
      out.push(F("dmarc-none", "mail", "low", "DMARC beobachtet nur", "Mit p=none werden gefälschte Mails weiterhin zugestellt. Das ist als Startpunkt in Ordnung, schützt aber noch nicht.", "Berichte auswerten und dann auf p=quarantine oder p=reject erhöhen.", `_dmarc.${mailDomain}.  TXT  "v=DMARC1; p=quarantine; rua=mailto:dmarc@${mailDomain}"`,
        { title: "DMARC only monitors", detail: "With p=none forged emails are still delivered. That is fine as a starting point but does not protect yet.", fix: "Evaluate the reports and then raise it to p=quarantine or p=reject." }));
    } else if (p === "quarantine" || p === "reject") {
      out.push(F("dmarc-ok", "mail", "ok", "DMARC schützt aktiv", `Richtlinie p=${p}${/\brua=/i.test(d) ? ", Berichte werden empfangen" : ""}.`,
        { title: "DMARC protects actively", detail: `Policy p=${p}${/\brua=/i.test(d) ? ", reports are received" : ""}.` }));
      if (!/\brua=/i.test(d)) out.push(F("dmarc-rua", "mail", "info", "DMARC ohne Berichtsadresse", "Ohne rua= erfahren Sie nicht, wer Ihre Domain als Absender verwendet.", "Berichtsadresse ergänzen.",
        { title: "DMARC without report address", detail: "Without rua= you do not learn who uses your domain as a sender.", fix: "Add a report address." }));
    } else {
      out.push(F("dmarc-invalid", "mail", "low", "DMARC-Eintrag unvollständig", "Im Eintrag fehlt eine gültige Richtlinie (p=).", "p=none, p=quarantine oder p=reject setzen.",
        { title: "DMARC record incomplete", detail: "The record lacks a valid policy (p=).", fix: "Set p=none, p=quarantine or p=reject." }));
    }
  }

  // DKIM (nur Hinweis: Selektoren sind frei waehlbar, fehlender Treffer ist kein Mangel)
  if (hasMx) {
    if (dns.dkimFound.length) {
      out.push(F("dkim-ok", "mail", "ok", "DKIM-Schlüssel gefunden", `Signaturschlüssel unter dem Selektor ${dns.dkimFound.join(", ")}.`,
        { title: "DKIM key found", detail: `Signing key under the selector ${dns.dkimFound.join(", ")}.` }));
    } else {
      out.push(F("dkim", "mail", "info", "DKIM nicht auffindbar", "Unter den gängigen Selektoren (default, google, selector1 …) wurde kein Schlüssel gefunden. Selektoren sind frei wählbar, das ist darum kein sicherer Mangel. Prüfen Sie, dass Ihr Mail-Anbieter ausgehende Mails signiert.", "Im Mail-Anbieter DKIM aktivieren und den angezeigten Schlüssel im DNS hinterlegen.",
        { title: "DKIM not found", detail: "No key was found under the common selectors (default, google, selector1 …). Selectors can be chosen freely, so this is not a certain defect. Check that your email provider signs outgoing emails.", fix: "Activate DKIM at your email provider and publish the key shown in the DNS." }));
    }
    const mta = txtValues(dns.mtasts).some((v) => /^v=STSv1/i.test(v.trim()));
    if (mta) out.push(F("mtasts-ok", "mail", "ok", "MTA-STS ist aktiv", "Eingehende Mails werden nur verschlüsselt zugestellt.",
        { title: "MTA-STS is active", detail: "Incoming emails are only delivered encrypted." }));
    else out.push(F("mtasts", "mail", "info", "MTA-STS nicht eingerichtet", "MTA-STS zwingt andere Mail-Server, Mails an Sie verschlüsselt zuzustellen. Eine sinnvolle Ergänzung, aber kein Muss.", "Optional einrichten.",
        { title: "MTA-STS not set up", detail: "MTA-STS forces other mail servers to deliver emails to you encrypted. A useful addition, but not a must.", fix: "Set it up if you like." }));
  }
  return { findings: out, applicable: true };
}

function checkDns(dns) {
  const out = [];
  if (dns.a && dns.a.error) {
    out.push(F("dns-error", "dns", "info", "DNS konnte nicht abgefragt werden", dns.a.error,
        { title: "DNS could not be queried", detail: `The query failed (${dns.a.error === "Zeitüberschreitung" ? "timeout" : dns.a.error}).` }));
    return out;
  }
  // DNSSEC: Cloudflare liefert AD=true, wenn die Antwort validiert ist
  if (dns.a && dns.a.AD === true) {
    out.push(F("dnssec-ok", "dns", "ok", "DNSSEC ist aktiv", "Die Antworten des Namensdienstes sind signiert und verifiziert.",
        { title: "DNSSEC is active", detail: "The name service responses are signed and verified." }));
  } else {
    out.push(F("dnssec", "dns", "low", "DNSSEC nicht aktiv", "Ohne DNSSEC lassen sich DNS-Antworten theoretisch fälschen und Besucher auf falsche Server lenken. Viele Schweizer Registrare und Hoster bieten es mit einem Klick an.", "Bei Registrar oder DNS-Anbieter DNSSEC aktivieren.",
        { title: "DNSSEC not active", detail: "Without DNSSEC, DNS answers could in theory be forged and visitors sent to the wrong servers. Many Swiss registrars and hosts offer it with one click.", fix: "Activate DNSSEC at your registrar or DNS provider." }));
  }
  const caa = ((dns.caa && dns.caa.Answer) || []).some((a) => a.type === 257);
  if (caa) out.push(F("caa-ok", "dns", "ok", "CAA-Einträge vorhanden", "Nur ausdrücklich erlaubte Stellen dürfen Zertifikate für die Domain ausstellen.",
        { title: "CAA records present", detail: "Only explicitly permitted authorities may issue certificates for the domain." }));
  else out.push(F("caa", "dns", "info", "Keine CAA-Einträge", "Mit CAA legen Sie fest, welche Zertifizierungsstellen Zertifikate für Ihre Domain ausstellen dürfen. Kleine, wirksame Absicherung.", "CAA-Eintrag für Ihre Zertifizierungsstelle ergänzen.", `ihre-domain.ch.  CAA  0 issue "letsencrypt.org"`,
        { title: "No CAA records", detail: "With CAA you define which certificate authorities may issue certificates for your domain. A small, effective safeguard.", fix: "Add a CAA record for your certificate authority.", snippet: `your-domain.ch.  CAA  0 issue "letsencrypt.org"` }));
  const nsCount = ((dns.ns && dns.ns.Answer) || []).filter((a) => a.type === 2).length;
  if (nsCount === 1) out.push(F("ns-single", "dns", "low", "Nur ein Nameserver", "Fällt dieser aus, ist die Domain samt Website und E-Mail nicht erreichbar.", "Mindestens zwei Nameserver an getrennten Standorten verwenden.",
        { title: "Only one name server", detail: "If it fails, the domain including website and email is unreachable.", fix: "Use at least two name servers in separate locations." }));
  const v6 = ((dns.aaaa && dns.aaaa.Answer) || []).some((a) => a.type === 28);
  out.push(F("ipv6", "dns", v6 ? "ok" : "info", v6 ? "IPv6 ist verfügbar" : "Kein IPv6", v6 ? "Die Domain ist über IPv4 und IPv6 erreichbar." : "Die Domain ist nur über IPv4 erreichbar. Kein Sicherheitsmangel, aber zunehmend Standard.",
        { title: v6 ? "IPv6 is available" : "No IPv6", detail: v6 ? "The domain is reachable via IPv4 and IPv6." : "The domain is only reachable via IPv4. Not a security defect, but increasingly standard." }));
  return out;
}

// ---------------------------------------------------------------------------
// Bewertung
// ---------------------------------------------------------------------------

export function gradeFor(score, hasHigh) {
  let g = score >= 92 ? "A" : score >= 80 ? "B" : score >= 65 ? "C" : score >= 50 ? "D" : score >= 35 ? "E" : "F";
  // Ein schwerer Befund verhindert eine gute Note, auch wenn der Rest stimmt.
  if (hasHigh && (g === "A" || g === "B")) g = "C";
  return g;
}

export function scoreFindings(findings, { mailApplicable = true } = {}) {
  const cats = CATEGORIES.map((c) => {
    const own = findings.filter((f) => f.cat === c.id);
    const penalty = own.reduce((s, f) => s + (PENALTY[f.sev] || 0), 0);
    const active = own.some((f) => f.sev !== "info") || own.length > 0;
    const applicable = c.id === "mail" ? mailApplicable && own.length > 0 : active;
    return { id: c.id, title: c.title, weight: c.weight, score: Math.max(0, 100 - penalty), applicable, count: own.length };
  });
  const used = cats.filter((c) => c.applicable);
  const totalWeight = used.reduce((s, c) => s + c.weight, 0) || 1;
  const score = Math.round(used.reduce((s, c) => s + c.score * c.weight, 0) / totalWeight);
  const hasHigh = findings.some((f) => f.sev === "high");
  return { score, grade: gradeFor(score, hasHigh), categories: cats };
}

export async function runSecurityCheck({ webHost, mailDomain }, { lang = "de" } = {}) {
  const started = Date.now();
  const [home, securityTxt, dns] = await Promise.all([fetchHome(webHost), fetchSecurityTxt(webHost), fetchDns(mailDomain)]);

  const mail = checkMail(dns, mailDomain);
  const findings = [
    ...checkTransport(home),
    ...checkHeaders(home),
    ...checkPage(home, mailDomain),
    ...mail.findings,
    ...checkDns(dns),
    ...checkDisclosure(home, securityTxt),
  ];
  const { score, grade, categories } = scoreFindings(findings, { mailApplicable: mail.applicable });

  const counts = { high: 0, medium: 0, low: 0, info: 0, ok: 0 };
  for (const f of findings) counts[f.sev]++;

  return {
    domain: webHost,
    checkedAt: new Date().toISOString(),
    score,
    grade,
    categories: lang === "en" ? categories.map((c) => ({ ...c, title: CATEGORY_EN[c.id] || c.title })) : categories,
    counts,
    findings: findings.map((f) => localize(f, lang)),
    meta: {
      finalUrl: home.https ? home.https.url : null,
      status: home.https ? home.https.status : null,
      durationMs: Date.now() - started,
      limitations: LIMITATIONS[lang === "en" ? "en" : "de"],
    },
  };
}

// Fuer Tests ohne Netzwerk
export const _internals = { checkTransport, checkHeaders, checkPage, checkMail, checkDns, checkDisclosure, txtValues };
