#!/usr/bin/env node
// Lokaler Test-Proxy fuer das Kundenportal.
//
// Im Betrieb setzt Cloudflare Access den Header "Cf-Access-Authenticated-User-Email". Lokal gibt es
// Access nicht, der Worker wuerde jede Anfrage mit "Nicht eingeloggt" (401) abweisen. Dieser Proxy
// sitzt zwischen Browser und "wrangler dev" und setzt den Header fest auf eine E-Mail-Adresse deiner Wahl.
//
//   Terminal 1:  npx wrangler dev --local --port 8788
//   Terminal 2:  node scripts/dev-access-proxy.mjs 8788 8790 m.kueng@alta-engineering.ch
//   Browser:     http://localhost:8790/        (nicht 8788!)
//
// Mit einer Admin-Adresse (siehe ADMIN_EMAILS in src/index.js) siehst du die Admin-Bereiche, mit einer
// anderen Adresse die Sicht einer normalen Person. NIE gegen ein Live-System betreiben.

import http from "node:http";

const [target = "8788", port = "8790", email = "m.kueng@alta-engineering.ch"] = process.argv.slice(2);

http
  .createServer((req, res) => {
    const headers = { ...req.headers, "cf-access-authenticated-user-email": email, host: "localhost:" + target };
    const upstream = http.request({ host: "127.0.0.1", port: target, path: req.url, method: req.method, headers }, (r) => {
      res.writeHead(r.statusCode, r.headers);
      r.pipe(res);
    });
    upstream.on("error", (e) => {
      res.writeHead(502);
      res.end(String(e));
    });
    req.pipe(upstream);
  })
  .listen(Number(port), () => console.log(`Proxy auf Port ${port} -> ${target}, angemeldet als ${email}`));
