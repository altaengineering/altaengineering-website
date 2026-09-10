# Alta Engineering — Website & Kundenportal — Projekt-Referenz

**Status (Stand 2026-09-10):** Beide Teile sind live und aktiv in Weiterentwicklung. Dieses Repo
enthält *zwei* getrennt deployte Dinge nebeneinander:

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

### 1.1 Grössere Überarbeitung (Sessions 2026-09-09/10)

- **6. Arbeitsbereich „Berechnung"** ergänzt (`berechnung.html`), Inhalt an den echten
  join.com-Stelleninseraten orientiert ("Konstruktion und Berechnung von Bauteilen für den
  Maschinenbau, Anlagenbau, Metallbau und Stahlbau"). Alle Arbeitsbereich-Seiten
  (Konstruktion/Entwicklung+Design/CAD-Support) wurden inhaltlich ausgebaut (waren zu dünn).
- **Logo ergänzt** (`logo.png`) — es gibt keine separate Logo-Datei der Firma, das ist aus
  `favicon-512x512.png` zugeschnitten (grün/blau ALTA-ENGINEERING-Badge). Im Header aller Seiten.
- **Bildregel:** auf Wunsch des Kunden zeigen **keine** Bilder mehr Personen (auch keine Hände).
  Alle entsprechenden Fotos wurden durch personenfreie Motive ersetzt (Unsplash/Pexels, freie
  Lizenz). Auch möglichst wenig Bild-Duplikate zwischen Seiten (jede Seite/Karte ein eigenes Foto,
  wo möglich).
- **Homepage-Hero** ist jetzt ein Full-Bleed-Hintergrundbild mit Verlaufsoverlay statt eines
  2-spaltigen Grids (Bugfix: drei überzählige `</div>` sorgten vorher dafür, dass das Bild als
  eigener Block unter dem Text statt daneben landete — statt reparieren gleich neu gestaltet).
- **Mobile-Menü-Bug:** `header` hat `backdrop-filter`, was `header` zur "containing block" für
  `position:fixed`-Kinder macht. Das Ausklapp-Menü nutzte einen festen `inset:114px`-Wert, der als
  viewport-relativ gedacht war, aber wegen `backdrop-filter` header-relativ ausgewertet wurde →
  sichtbare Lücke mit durchscheinendem Hero-Bild. Fix: `top:100%` statt fixem Pixelwert.
- **Firmenflyer** (`alta-engineering-flyer.pdf`) und **Job-Inserate** (`job-*.pdf`) werden mit
  reportlab generiert, Skripte in `tools/build_flyer.py` und `tools/build_job_pdfs.py` (Regenerieren:
  `python tools/build_flyer.py`, braucht `pip install reportlab`). Flyer-Link ist ein kompakter
  Icon-Button in der Hauptnav (mit CSS-Tooltip beim Hover), nicht mehr ein Text-Button im Menü.
  Job-PDFs enthalten für Konstrukteur/in EFZ und Techniker/in HF echte Inhalte von den aktuellen
  join.com-Inseraten, nicht erfunden.
- **Stilregel (wichtig, gilt für jeden Fliesstext, den Claude für dieses Projekt schreibt):** **keine
  Gedankenstriche ("—")** als Stilmittel — Michael hat das explizit untersagt. Stattdessen Punkt,
  Komma oder Doppelpunkt. Echte Bindestriche in zusammengesetzten Wörtern (z.B. „CAD-Support",
  „Termin-, Kosten- und Qualitätsverantwortung") sind davon nicht betroffen, das ist korrekte
  Rechtschreibung. Diese Regel ist auch in Claudes persistentem Memory hinterlegt.

## 2. Kundenportal (Cloudflare Worker)

### 2.1 Architektur

```
Browser
  → Cloudflare Access (Login-Gate, prüft E-Mail gegen Access-Policy)
    → Cloudflare Worker (src/index.js)
        - GET /                       → public/index.html  (Datei-Upload/-Verwaltung/Freigaben)
        - GET /request-access         → public/request-access.html (öffentlich, kein Login nötig)
        - POST /api/request-access    → öffentlich, schreibt in KV-Namespace REQUESTS
        - GET /share/<id>             → public/share.html (öffentlich, kein Login nötig)
        - GET /api/share-info         → öffentlich, liest KV-Namespace SHARES
        - GET /api/share-download     → öffentlich, streamt eine Datei aus B2
        - POST /api/share, GET /api/shares, POST /api/share-revoke
                                       → verlangen Login (Freigabe-Links verwalten)
        - /api/*  (alles andere)      → verlangt Cf-Access-Authenticated-User-Email Header
        - Dateien                     → Backblaze B2 (S3-kompatibel), via aws4fetch signiert
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

### 2.3 Nachtrag (2026-09-08, zweite Session): Offene Punkte aus 2.2 erledigt

Eine Folge-Session mit lokalem Git-Push-Zugriff und einem bereits per `wrangler login`
authentifizierten Cloudflare-Account (`m.kueng@alta-engineering.ch`) hat die oben offenen Punkte
abgeglichen und korrigiert, statt sie zu rekonstruieren:

- **KV-Namespace-ID**: existierte bereits (`npx wrangler kv namespace list`) —
  `b53e83d645ec4b80bbc3a996b7e82e25` — jetzt in `wrangler.toml` eingetragen, kein Platzhalter mehr.
- **B2-Variablen und `PORTAL_HOSTNAME`/`MAIN_SITE_ORIGIN`**: aus der laufenden Deployment-Konfiguration
  ausgelesen (`npx wrangler versions view <id> --name alta-kundenportal` zeigt alle nicht-geheimen
  Bindings des zuletzt deployten Workers) und in `wrangler.toml` übernommen: `B2_REGION =
  "eu-central-003"`, `B2_BUCKET_NAME = "alta-kundenportal"`, `B2_ENDPOINT =
  "s3.eu-central-003.backblazeb2.com"`.
- **`CF_ACCOUNT_ID`**: liegt auf dem live Worker bereits als **Secret**, nicht als Var — deshalb
  bewusst *nicht* in `[vars]` eingetragen (sonst zwei Bindings mit demselben Namen beim nächsten
  Deploy). `npx wrangler whoami` bestätigt dieselbe Account-ID (`85793a67c632f0040b6bba4b57abad78`),
  falls sie mal neu gesetzt werden muss.
- **Secrets** (`B2_KEY_ID`, `B2_APPLICATION_KEY`, `CF_API_TOKEN`, `CF_ACCOUNT_ID`): alle vier waren
  laut `npx wrangler secret list --name alta-kundenportal` bereits gesetzt — nicht angetastet, keine
  neuen Werte abgefragt.
- **`public/request-access.html`**: die Rekonstruktion aus 2.2 wich strukturell deutlich vom Original
  ab (anderes Layout, andere Feld-Reihenfolge/IDs). Ersetzt durch einen direkten `curl`-Abzug von
  `GET /request-access` der Live-Instanz (öffentlicher, nicht hinter Access liegender Endpoint) —
  jetzt 1:1 identisch mit Produktion.
- **`package.json`**: `wrangler` steht dort noch auf `^3.90.0`, während Deploys/diese Session
  `wrangler@4.129.1` (via `npx wrangler`) genutzt haben — funktioniert (lokales `wrangler dev` lief
  fehlerfrei, nur mit Versions-Warnung), aber bei Gelegenheit lohnt sich `npm install --save-dev
  wrangler@4`.
- **Push**: erfolgreich, dieser lokale Klon hatte Schreibzugriff auf
  `github.com/altaengineering/altaengineering-website`.

Lokal mit `npx wrangler dev` gegengecheckt: Worker startet ohne Fehler, `GET /` und
`GET /request-access` liefern beide `200`.

### 2.4 Freigabe-Links (Session 2026-09-10): Dateien an Personen ohne Zugang teilen

Neues Feature, gewünscht für Projektabgaben: **jede eingeloggte Person** (nicht nur Admins) kann
eigene Dateien per Link an jemanden ohne Cloudflare-Access-Zugang freigeben — nur Download, kein
Upload, Ablaufdatum pro Link frei wählbar. Admins können wie überall sonst auch Dateien aus fremden
Ordnern freigeben.

- Neue KV-Namespace `SHARES` (`7b37acfe34d242adbced9f3d7c474a52`, in `wrangler.toml` eingetragen).
- `POST /api/share` (Login nötig) erstellt einen Link für ausgewählte Dateien + Ablaufdatum;
  Nicht-Admins nur für Dateien im eigenen Ordner (`fileKeys` muss mit `ownFolder + "/"` beginnen).
  `GET /api/shares` listet die eigenen (Admins: alle) aktiven Links. `POST /api/share-revoke` zieht
  einen Link vorzeitig zurück (Nicht-Admins nur eigene).
- `GET /share/<id>` und `GET /api/share-info`, `GET /api/share-download` sind **öffentlich**, kein
  Access-Login nötig (wie `/request-access`) — prüfen aber pro Anfrage Ablaufdatum/Revoke-Status
  und ob die angeforderte Datei wirklich Teil dieses Links ist. `/share/<id>` liefert
  `public/share.html` aus (eigene, schlanke Seite mit Downloadbuttons für die freigegebenen Dateien).
- **Cloudflare-Access-Bypass** für die drei öffentlichen Pfade ist bereits eingerichtet (Stand
  2026-09-10, live verifiziert): in der bestehenden App **„kundenportal oeffentlich"** (Policy
  „Jeder") wurden drei zusätzliche Destinations ergänzt: `.../share`, `.../api/share-info`,
  `.../api/share-download`. **Bewusst nicht** `api/share` (ohne Suffix) als Pfad verwendet, das
  hätte sonst auch die login-pflichtigen `/api/share`, `/api/shares`, `/api/share-revoke`
  mit-öffentlich gemacht.
- **Stolperfalle beim Bauen:** `env.ASSETS.fetch()` mit einer Anfrage für `/share.html` direkt
  liefert nicht den Seiteninhalt, sondern einen 307-Redirect auf die "saubere" URL `/share` (gleiches
  Verhalten wie Cloudflares automatisches Redirect von `foo.html` auf `/foo`). Der Worker-Code fragt
  deshalb bewusst `/share` (ohne `.html`) bei `env.ASSETS.fetch()` an, nicht `/share.html`.
- UI: `public/index.html` hat pro Datei einen "Freigeben"-Button (fragt Gültigkeitsdauer + Label per
  `prompt()` ab, kopiert den fertigen Link in die Zwischenablage) und ein Panel "Freigabe-Links" zum
  Einsehen/Zurückziehen bestehender Links.

### 2.5 Lokale Entwicklung

```
npm install
npx wrangler dev
```

Braucht die oben genannten Vars/Secrets, sonst schlagen B2- und Access-Aufrufe fehl (die
Datei-Listing-/Upload-Endpunkte brauchen B2, `/api/access-requests/approve` braucht `CF_API_TOKEN`).

Deploy: `npx wrangler deploy` (braucht `wrangler login` oder `CLOUDFLARE_API_TOKEN` env var mit
Berechtigung für Workers-Deployment in diesem Account).
