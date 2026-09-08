# Alta Engineering — Website & Kundenportal — Projekt-Referenz

**Status (Stand 2026-09-08):** Beide Teile sind live. Dieses Repo enthält *zwei* getrennt deployte
Dinge nebeneinander:

| Teil | Was | Deployment | Domain |
|---|---|---|---|
| Website | Statische Marketing-Site (`index.html`, `firma.html`, `kontakt.html`, …) | GitHub Pages | `alta-engineering.ch` |
| Kundenportal | Cloudflare Worker (`src/index.js` + `public/`) | Cloudflare Workers | `alta-kundenportal.alta-engineering.workers.dev` |

GitHub: `https://github.com/altaengineering/altaengineering-website` (öffentliches Repo — daher
liegen keine Secrets hier, siehe „Secrets" unten).

## 1. Website (GitHub Pages)

Reines HTML/CSS/JS, kein Build-Schritt. Jede HTML-Datei im Repo-Root ist eine Seite
(`index.html`, `firma.html`, `konstruktion.html`, `management-systeme.html`, `entwicklung-design.html`,
`cad-support.html`, `jobs.html`, `kontakt.html`). `style.css` und `main.js` werden von allen Seiten
geteilt. `CNAME` hält die Custom Domain für GitHub Pages fest — **nicht löschen**.

Eine ausführliche Redaktions-Anleitung (github.dev, VS Code + GitHub Desktop, DNS bei Server Town,
Troubleshooting) liegt in `README.md` — die ist an den Nutzer (Michael) gerichtet, nicht an
Claude Code, aber technisch weiterhin korrekt und nützlich als Kontext.

DNS: `alta-engineering.ch` zeigt per 4× A-Record auf die vier GitHub-Pages-IPs, `www` per CNAME auf
`altaengineering.github.io`. Verwaltet bei Server Town (Registrar), siehe README Kapitel 6.

## 2. Kundenportal (Cloudflare Worker)

### 2.1 Architektur

```
Browser
  → Cloudflare Access (Login-Gate, prüft E-Mail gegen Access-Policy)
    → Cloudflare Worker (src/index.js)
        - GET /                    → public/index.html  (Datei-Upload/-Verwaltung)
        - GET /request-access      → public/request-access.html (öffentlich, kein Login nötig)
        - POST /api/request-access → öffentlich, schreibt in KV-Namespace REQUESTS
        - /api/*  (alles andere)   → verlangt Cf-Access-Authenticated-User-Email Header
        - Dateien                  → Backblaze B2 (S3-kompatibel), via aws4fetch signiert
```

**Auth-Modell:** Cloudflare Access sitzt vor dem gesamten Worker und prüft den Login (Google/GitHub/
Email-OTP, je nach Access-Policy-Konfiguration im Cloudflare-Dashboard). Bei erfolgreichem Login
reicht Access den Header `Cf-Access-Authenticated-User-Email` durch — der Worker vertraut diesem
Header vollständig, macht selbst **keine** JWT-Prüfung (Access übernimmt das davor). `/request-access`
und `POST /api/request-access` müssen in der Access-Policy als öffentlich (Bypass) markiert sein,
sonst kann niemand ohne bestehenden Zugang die Anfrage stellen.

**Admins:** hartcodiert in `src/index.js` (`ADMIN_EMAILS`): `s.herger@alta-engineering.ch`,
`m.kueng@alta-engineering.ch`. Admins sehen alle Kundenordner (`/api/folders`, `/api/list?folder=…`),
normale Nutzer:innen nur ihren eigenen (E-Mail-Adresse = Ordnername, kleingeschrieben).

**Storage:** **Backblaze B2**, nicht Cloudflare R2 — trotz des Bucket-Namens „alta-kundenportal“, der
historisch von einer ursprünglich geplanten R2-Lösung stammt. Zugriff via `aws4fetch` (AWS-SigV4-
Signierung, B2 ist S3-kompatibel). Upload läuft direkt vom Browser zu B2 über eine presigned URL
(`/api/upload-url` erzeugt sie, der Client lädt dann selbst per `PUT` hoch — der Worker sieht die
Datei-Bytes nie).

**Zugriffsanfragen:** `POST /api/request-access` (öffentlich, mit Honeypot-Feld `website` gegen
simple Bots) legt einen Eintrag in der KV-Namespace `REQUESTS` an. Admins sehen offene Anfragen unter
`/api/access-requests` und können sie freigeben (`/api/access-requests/approve` → trägt die E-Mail
automatisch per Cloudflare-API in die Access-Policy ein, `include: [{email: {...}}]`) oder ablehnen.

### 2.2 Was diese Session (2026-09-08) gefunden und repariert hat

Vor dieser Session fehlten im Repo mehrere Dinge, die für den Live-Betrieb nötig sind — vermutlich,
weil sie ursprünglich in einer anderen Claude-Code-Session direkt im Cloudflare-Dashboard bzw. lokal
gebaut, aber nie eingecheckt wurden:

- **`src/index.js` fehlte komplett**, obwohl `wrangler.toml` darauf zeigte. Wurde aus dem gebündelten
  Worker-Code rekonstruiert, den der Nutzer aus dem Cloudflare-Dashboard („Edit Code") kopiert hat
  (enthielt den gesamten gebündelten `node_modules`-Code von `aws4fetch` und `fast-xml-parser` —
  daraus wurde der eigentliche Anwendungscode ab dem `// src/index.js`-Kommentar extrahiert und als
  sauberer, unbundleter ES-Module-Quellcode neu geschrieben).
- **`public/` fehlte komplett.** `portal.html` lag stattdessen im Repo-Root (dort von GitHub Pages
  mitausgeliefert, aber dort funktionslos, da es relative `/api/*`-Aufrufe macht, die es auf
  `alta-engineering.ch` nicht gibt). Wurde nach `public/index.html` verschoben (das ist, was der
  Worker unter `/` ausliefert).
- **`public/request-access.html` fehlte ebenfalls** — verlinkt von der Hauptwebsite
  (`index.html`, `kontakt.html`) auf `.../request-access`, aber nie im Repo vorhanden. Wurde anhand
  des API-Vertrags (`POST /api/request-access` erwartet `email`, `name`, `company`, `message`,
  Honeypot `website`) und des Design-Systems von `public/index.html` neu gebaut. **Nicht gegen die
  echte Live-Seite verglichen** — beim nächsten Zugriff auf den Cloudflare-Zugang oder lokalen
  Rechner sollte kurz geprüft werden, ob Copy/Felder mit dem Original übereinstimmen, falls es das
  in dieser Form schon gab.
- **`wrangler.toml` war inkonsistent mit dem tatsächlichen Code:** deklarierte einen R2-Bucket-Binding
  (`BUCKET`), der im Code nirgends verwendet wird (Storage läuft über B2, siehe oben), und hatte
  **keine** KV-Namespace-Bindung für `REQUESTS`, obwohl der Code das zwingend braucht. Beides wurde
  korrigiert — R2-Binding entfernt, KV-Binding `REQUESTS` ergänzt (Platzhalter-ID, siehe „Offene
  Punkte"), fehlende Vars (`B2_REGION`, `B2_BUCKET_NAME`, `B2_ENDPOINT`, `CF_ACCOUNT_ID`,
  `PORTAL_HOSTNAME`, `MAIN_SITE_ORIGIN`) ergänzt bzw. mit bekannten Werten befüllt.
- **`package.json`** hatte `aws4fetch` als Dependency, aber nicht `fast-xml-parser` (wird für das
  Parsen der B2-XML-Listing-Antworten gebraucht) — ergänzt.

### 2.3 Offene Punkte

- **KV-Namespace-ID fehlt** in `wrangler.toml` (Platzhalter `HIER_KV_NAMESPACE_ID_EINTRAGEN`).
  Erzeugen mit `npx wrangler kv namespace create REQUESTS` (falls sie nicht schon existiert — dann
  reicht `npx wrangler kv namespace list`, um die ID der bestehenden zu finden) und eintragen.
- **B2-Variablen** (`B2_REGION`, `B2_BUCKET_NAME`, `B2_ENDPOINT`) und **`CF_ACCOUNT_ID`** sind mit
  Platzhaltern befüllt — echte Werte stehen im Backblaze-Dashboard (Buckets → Bucket auswählen) bzw.
  im Cloudflare-Dashboard (Account-ID unten rechts auf jeder Account-Seite).
- **Secrets** (`B2_KEY_ID`, `B2_APPLICATION_KEY`, `CF_API_TOKEN`) sind absichtlich nicht im Repo —
  müssen per `npx wrangler secret put <NAME>` gesetzt werden (einmalig, landen dann bei Cloudflare).
  `CF_API_TOKEN` braucht die Berechtigung „Access: Apps and Policies: Edit", sonst schlägt das
  Freigeben von Zugriffsanfragen fehl.
- **`public/request-access.html` ist eine Rekonstruktion**, siehe oben — bei Gelegenheit mit dem
  Original abgleichen, falls Abweichungen stören.
- **Push zu GitHub:** Diese Session hat das Repo nur lesend (öffentlicher HTTPS-Clone ohne
  Schreibrechte) geklont und konnte die hier beschriebenen Korrekturen daher **nicht selbst pushen**.
  Falls eine künftige Claude-Code-Session ebenfalls keinen Schreibzugriff hat: Dateien wie gewohnt
  bearbeiten, dann den Nutzer bitten, den Commit/Push selbst auszuführen (z.B. via github.dev oder
  GitHub Desktop, siehe `README.md` Kapitel 4) — oder, falls ein lokal geklontes Repo mit
  eingerichtetem Git-Auth verfügbar ist, darüber pushen.

### 2.4 Lokale Entwicklung

```
npm install
npx wrangler dev
```

Braucht die oben genannten Vars/Secrets, sonst schlagen B2- und Access-Aufrufe fehl (die
Datei-Listing-/Upload-Endpunkte brauchen B2, `/api/access-requests/approve` braucht `CF_API_TOKEN`).

Deploy: `npx wrangler deploy` (braucht `wrangler login` oder `CLOUDFLARE_API_TOKEN` env var mit
Berechtigung für Workers-Deployment in diesem Account).
