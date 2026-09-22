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

### 1.2 SEO-Überarbeitung (Session 2026-09-21)

Anlass: Michael meldete, die Seite werde "sehr schlecht" gefunden. Vorher schon vorhanden und in
Ordnung: pro Seite eindeutiger `<title>` und `<meta name="description">`, `robots.txt`,
`sitemap.xml`, ein JSON-LD `ProfessionalService`-Schema auf `index.html`. Gefunden und behoben:

- **Bilder massiv überdimensioniert:** Alle JPGs im Repo waren Rohformat-Auflösungen direkt aus
  Kamera/Stockfoto (bis 7952×5304px, `weggis.jpg` allein 6.8MB), angezeigt aber nur in Karten/
  Hero-Ausschnitten von ein paar hundert Pixeln Breite (`.gallery`, `.area-media`, `.phero-media`,
  siehe `style.css`). Das kostet Ladezeit und damit Core-Web-Vitals-Punkte, ein reales
  Google-Rankingsignal, besonders auf Mobile. Alle 15 JPGs mit einem PowerShell-Skript
  (`System.Drawing`, kein ImageMagick/PIL auf diesem Rechner verfügbar) auf max. 1920px lange Kante
  reduziert und als JPEG Qualität 80 neu komprimiert, macht ca. 26.8MB zu 4.4MB (minus 84%), visuell
  keine sichtbare Qualitätseinbusse (stichprobenartig verglichen). PNGs (Logo, Favicons) waren
  bereits klein genug, nicht angefasst.
- **Open Graph / Twitter-Card / Canonical fehlten komplett** (auf allen 10 Seiten, `og:`- und
  `canonical`-Vorkommen vorher 0). Ergänzt: `<link rel="canonical">`, `og:type`, `og:site_name`,
  `og:locale`, `og:title`, `og:description`, `og:url`, `og:image` sowie die passenden
  `twitter:*`-Pendants, pro Seite mit eigenem Titel/Beschreibung (aus dem bestehenden
  `<title>`/`<meta description>` übernommen) und einem inhaltlich passenden, bereits auf der Seite
  verwendeten Bild als Vorschaubild. Ohne das zeigen Links in Social Media/Messengern keine
  Vorschau, und Suchmaschinen sehen keine explizite kanonische URL.
- **`sitemap.xml`** um `<lastmod>2026-09-21</lastmod>` pro URL ergänzt (vorher nur `loc`+`priority`).
- **Kaputte alte, noch von Google indexierte URL gefunden:** `site:alta-engineering.ch`-Suche zeigt
  neben der Startseite nur `https://www.alta-engineering.ch/CAD-Support/` (Grossschreibung,
  Trailing-Slash, offensichtlich Rest einer alten Website-Struktur vor dieser statischen Seite).
  Diese URL antwortet nach dem www→apex-Redirect mit **404**, kein Trailing-Slash-Pfad wurde je auf
  die neuen `*.html`-Dateien umgeleitet. GitHub Pages kann keine serverseitigen 301-Redirects (kein
  `_redirects`, keine `.htaccess`), deshalb Redirect-Stub-Seiten angelegt: `CAD-Support/index.html`,
  `Firma/index.html`, `Konstruktion/index.html`, `Entwicklung-Design/index.html`,
  `Management-Systeme/index.html`, `Projektleitung/index.html`, `Berechnung/index.html`,
  `Jobs/index.html`, `Kontakt/index.html`, jede mit `rel="canonical"` **und**
  `<meta http-equiv="refresh" content="0; ...">` auf die echte, neue `*.html`-Seite (von Google
  offiziell wie ein dauerhafter Redirect behandelt, funktioniert ohne Serverkonfiguration). Alle acht
  weiteren Pfade wurden nur vorsorglich angelegt (liefern lokal ebenfalls 404, es ist plausibel,
  dass sie aus derselben alten Struktur stammen), nicht einzeln in Googles Index bestätigt.
- **Nicht geprüft/nicht möglich von hier aus:** der tatsächliche Google-Index-Status (wie viele
  Seiten indexiert sind, ob der Sitemap eingereicht ist, Crawling-Fehler) lässt sich nur über die
  Google Search Console einsehen, die ein Google-Konto-Login braucht, das diese Session nicht hat.
  **Empfehlung an Michael:** falls noch nicht vorhanden, Search Console für `alta-engineering.ch`
  einrichten (Property-Verifizierung z.B. per DNS-TXT-Record bei Server Town), `sitemap.xml`
  einreichen, und nach ein paar Tagen den Coverage-Report prüfen, das ist die einzige verlässliche
  Quelle dafür, ob und wie die echten Seiten indexiert werden.

### 1.3 Flyer-Button auf Mobile behoben (2026-09-21)

Gemeldeter Bug: "Flyer auf Mobile komisch". Ursache: `.flyer-btn` zeigt seinen Tooltip
("Firmenflyer (PDF)") über `:hover`/`:focus-visible`. Touch-Geräte kennen keinen echten
Hover-Zustand, das erste Antippen löst ihn trotzdem aus, der Tooltip blieb dann entweder
unsichtbar oder hängen, je nach Browser. Fix: die `:hover`-Variante der Regel in
`@media (hover: hover)` verpackt, `:focus-visible` bleibt ungated (Tastatur-Fokus hat dieses
Problem nicht). Verifiziert über `matchMedia('(hover: hover)')`, das bei emulierten
Touch-Geräten korrekt `false` liefert, entsprechend bleibt der Tooltip dort standardmässig
verborgen, auf Desktop mit echter Maus unverändert sichtbar bei Hover.

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

### 2.5 E-Mail-Benachrichtigungen und ZIP-Download (Session 2026-09-21)

Zwei lange offene Punkte von Michaels Auftragsliste umgesetzt:

- **E-Mail bei neuer Zugangsanfrage und neuem Upload:** neue Funktion `sendMail(env, {...})` in
  `src/index.js`, direkter `fetch` an die Resend-REST-API (kein npm-Paket, um das schlanke
  Worker-Bundle nicht unnötig zu vergrössern), optional/best-effort wie im Zeiterfassungstool: ohne
  `RESEND_API_KEY` nur eine Konsolen-Warnung, nie ein Fehler, der die eigentliche Aktion blockiert.
  `/api/request-access` schickt jetzt bei einer neuen Anfrage eine Mail an `ADMIN_EMAILS`.
  Für Uploads gibt es keinen Server-seitigen Hook, der Worker sieht die Datei-Bytes nie (Upload
  läuft direkt Browser → B2 über die presigned URL). Deshalb neuer Endpunkt `POST
  /api/upload-done`, den `public/index.html` nach einem erfolgreich abgeschlossenen `xhr.onload`
  aufruft (fire-and-forget, ein Fehler hier darf den erfolgreichen Upload nicht als fehlgeschlagen
  anzeigen). **Offener Punkt: `RESEND_API_KEY` muss noch per `npx wrangler secret put
  RESEND_API_KEY` gesetzt werden**, siehe `wrangler.toml`, sonst bleibt es bei der
  Konsolen-Warnung, keine Mail wird verschickt.
- **"Ganzen Ordner als ZIP herunterladen":** neuer Endpunkt `GET /api/download-zip?folder=...`,
  lädt alle Dateien des Ordners einzeln aus B2 und packt sie synchron mit `fflate.zipSync`
  zusammen (neue Abhängigkeit, pure JS, kein Node-`nodejs_compat`-Flag nötig, anders als z.B.
  `archiver`). Bewusst keine Streaming-Lösung, für die üblichen Projektabgaben dieser Firma
  unproblematisch, bei sehr grossen Ordnern (nahe am 128MB-Speicherlimit des Workers) wäre das
  aber ein Thema. Button "Ordner als ZIP herunterladen" oben im Datei-Panel, nur sichtbar, wenn
  der Ordner nicht leer ist. Gleiche Berechtigung wie `/api/list`: eigener Ordner, Admins jeder.
- **Lokal verifiziert** (`npx wrangler dev`, Miniflare, ohne echte B2-/Resend-Zugangsdaten):
  `/api/request-access` löst den Mail-Pfad korrekt aus (Konsolen-Warnung ohne Secret bestätigt),
  `/api/upload-done` und `/api/download-zip` lehnen nicht eingeloggte Anfragen mit 401 ab, letzterer
  zusätzlich fremde Ordner für Nicht-Admins mit 403, `fflate.zipSync` separat mit einer Testdatei
  auf gültige ZIP-Magic-Bytes geprüft. **Kein echter Upload/Download getestet**, dafür fehlen hier
  die B2-Zugangsdaten.
- **Deployment ist ein separater manueller Schritt**, anders als bei der Website (GitHub Pages) oder
  dem Zeiterfassungstool (Vercel) gibt es hier kein Auto-Deploy bei `git push`. Nach dem Setzen von
  `RESEND_API_KEY` (siehe oben) noch `npx wrangler deploy` ausführen, das braucht einen
  angemeldeten `wrangler login` oder `CLOUDFLARE_API_TOKEN`, den diese Session nicht hat.

### 2.6 QM-Handbuch als Kundenportal-Seite, nur für Mitarbeitende (Session 2026-09-22/23)

Auslöser: Stefan möchte das ISO-9001-Handbuch der Firma (Word-Datei, von Michael als
`Handbuch-Alta-2025.docx` bereitgestellt) als durchsuchbare Webseite statt PDF, mit
Vorlage-/Nachweisdokumenten als Links direkt an der Stelle im Prozess, wo sie gebraucht werden
(Vorbild/Positionierung: Qairo von Aquilys, siehe Stefans Nachricht, **kein** Konkurrenzprodukt
dazu, nur eine einfache Webseite pro Kunde). Ursprünglich als eigene Seite auf der öffentlichen
Website (`alta-engineering.ch/qm-handbuch.html`) gebaut, auf Hinweis von Michael aber verworfen:
eine unauthentifizierte, öffentlich erreichbare Seite mit internem Firmen-Know-how "wird nur
geklaut". Stattdessen jetzt Teil des Kundenportals (`public/_qm-handbuch-inner.html`), das ohnehin
per Cloudflare Access login-geschützt ist.

- **Neue Route `GET /qm-handbuch`** in `src/index.js`, prüft `Cf-Access-Authenticated-User-Email`
  gegen `isMitarbeiterEmail()` (nicht nur `isAdminEmail()`, das Handbuch soll laut eigenem Text
  "für alle Mitarbeitenden... verbindlich" sein, nicht nur für die zwei Admins). Bei Erfolg wird
  `public/_qm-handbuch-inner.html` ausgeliefert, sonst 403.
- **`run_worker_first = true` in `wrangler.toml` war zwingend nötig**, sonst liefert Cloudflare
  jede Anfrage, deren Pfad exakt auf eine Datei unter `public/` passt, immer direkt aus, noch
  bevor der Worker-Code überhaupt läuft, der Mitarbeitenden-Check für `_qm-handbuch-inner.html`
  lief dadurch ins Leere (Datei kam trotzdem durch). Lokal mit `wrangler dev` reproduziert (vor
  dem Fix: direkter Aufruf von `/_qm-handbuch-inner.html` bzw. `/_qm-handbuch-inner` lieferte den
  vollen Seiteninhalt, egal welcher Header gesetzt war) und nach dem Fix verifiziert (404 in
  beiden Fällen, `/qm-handbuch` selbst weiterhin korrekt 403/403/200 für kein Header/Kunden-Mail/
  Mitarbeiter-Mail). Zusätzliche Regressionstests nach der Umstellung: `/`, `/favicon.ico`,
  `/api/me`, `/request-access.html`, `POST /api/request-access` verhalten sich unverändert.
- **Datei bewusst mit führendem Unterstrich benannt** (`_qm-handbuch-inner.html` statt
  `qm-handbuch.html`), damit sie nicht zufällig unter einer naheliegenden URL erraten wird, dazu
  zusätzlich ein expliziter 404-Block für den rohen Dateinamen (siehe oben), auch wenn
  `run_worker_first` das eigentlich schon verhindert, doppelt abgesichert.
- **Link im Portal-Dashboard** (`public/index.html`): "📘 QM-Handbuch" in der Kopfzeile, nur
  sichtbar wenn `me.isMitarbeiter` (per `/api/me`), analog zu den anderen rollenabhängigen Panels.
- **Kein eigenes CSS aus `style.css` der Hauptwebsite verwendet**, das Kundenportal ist bereits
  komplett selbstständig mit eigenem inline `<style>`-Block (eigene Design-Tokens, IBM Plex Mono
  für Zahlen/Codes), die Handbuch-Seite folgt demselben Muster statt eine Abhängigkeit auf die
  Website einzuführen.
- **Inhalt:** alle 10 Kapitel plus Änderungsjournal 1:1 aus dem Word übernommen (inkl. Tabellen),
  mit `pandoc` nicht möglich (auf diesem Rechner nicht installiert), stattdessen `python-docx`
  (per `pip install python-docx`) und ein kleines Skript, das Absätze und Tabellen in
  Dokumentreihenfolge ausliest. Zwei echte Content-Probleme im Original gefunden und **bewusst
  nicht stillschweigend korrigiert**, sondern als Hinweisbox oben auf der Seite markiert: Kapitel
  4.2 enthält noch einen stehengebliebenen Verweis auf "Hirt Umwelttechnik AG" (Copy-Paste-Rest
  aus einer fremden Vorlage), und an mehreren Stellen (Kap. 4.1, Kap. 8.1) stehen noch
  `??`-Platzhalter im Originaltext.
- **Vorlage-/Nachweisdokumente:** die im Handbuch referenzierten Dokumente (Personalstammblatt,
  Checkliste Mitarbeiter Eintritt/Austritt, Formular Mitarbeitergespräch, Merkblatt AS/GS usw.)
  sind an ihrer jeweiligen Stelle als `📎`-Chip markiert, aber noch **nicht** verlinkt, die realen
  Dateien liegen dieser Session nicht vor. Ein echtes ausgefülltes Beispiel (Michaels eigenes
  Personalstammblatt, `L:\mitarbeiterstammblatt kumi.xlsx`) existiert lokal, wurde aber **bewusst
  nicht hochgeladen**: es enthält echte Personendaten (Adresse, Geburtsdatum, AHV-Nummer, IBAN).
  Für ein Nachweisdokument-Beispiel bräuchte es entweder eine anonymisierte Fassung oder man
  verlinkt vorerst nur die leere Vorlage.

### 2.7 Lokale Entwicklung

```
npm install
npx wrangler dev
```

Braucht die oben genannten Vars/Secrets, sonst schlagen B2- und Access-Aufrufe fehl (die
Datei-Listing-/Upload-Endpunkte brauchen B2, `/api/access-requests/approve` braucht `CF_API_TOKEN`).

Deploy: `npx wrangler deploy` (braucht `wrangler login` oder `CLOUDFLARE_API_TOKEN` env var mit
Berechtigung für Workers-Deployment in diesem Account).
