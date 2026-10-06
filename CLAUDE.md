# Alta Engineering — Website & Kundenportal — Projekt-Referenz

**Status (Stand 2026-10-05):** Beide Teile sind live und aktiv in Weiterentwicklung. Dieses Repo
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

### 1.4 Meta-Descriptions gekürzt (2026-09-28)

Anlass: Michael liess die Seite crawlen (Screaming Frog, `internal_all.csv`) und fragte nach einer
Einschätzung. Crawl selbst war sauber (keine 4xx/5xx, jede Seite mit Title/Description/H1, Crawl-
Tiefe überall 1, keine Duplicate Content, 0 Spelling/Grammar-Fehler), der einzige echte Befund:
die Meta-Descriptions lagen auf den meisten Seiten über der von Google praktisch noch vollständig
angezeigten Breite (Richtwert ca. 155 Zeichen / ~920px, hier teils bis 1525px auf der Startseite).
Über dieser Breite schneidet Google entweder mit "..." ab oder ignoriert die Description ganz
zugunsten eines selbst generierten Snippets.

Gekürzt auf Startseite, Firma, Entwicklung+Design, Berechnung, Konstruktion, Management-Systeme,
Projektleitung (alle jetzt 125–145 Zeichen). Kontakt, Jobs und CAD-Support waren mit 794–885px
bereits im sicheren Bereich, nicht angefasst. `og:description`/`twitter:description` pro Seite
identisch mit `<meta name="description">` gehalten (bestehende Konvention aus der SEO-Session vom
2026-09-21, siehe 1.2), alle drei Tags also synchron mit demselben gekürzten Text aktualisiert.
Reine Text-Kürzung, keine inhaltliche Änderung der Kernaussage pro Seite.

### 1.5 Neue Seite "Software" (2026-10-05)

Michael will weg vom reinen Konstrukteur-Image und Software-Lösungen verkaufen (Zeiterfassung nach
Mass, Kundenportale, Dokumentenlenkung, Datenprojekte usw., alles mit Claude Code gebaut). Neu:

- **`software.html`**, grosse Verkaufsseite: Kopf mit CSS-Mockup eines App-Fensters (rein aus
  HTML/CSS, kein Bild, personenfrei), Kennzahlen, neun Lösungskarten (Zeiterfassung, Kundenportal,
  Dokumentenlenkung, Datenprojekte, digitale Formulare/Prüfprotokolle, Offert-/Kalkulationswerkzeuge,
  Wartung/Serviceplanung, Automatisierung, Websites), Vorher/Nachher, Ablauf in vier Schritten,
  "Warum Alta", FAQ (als `<details>` plus `FAQPage`-JSON-LD, Texte identisch halten), CTA-Band. Eigener
  Title/Description/Canonical/OG/Twitter nach der Konvention aus 1.2, `Service`-JSON-LD, Eintrag in
  `sitemap.xml`.
- **Navigation und Footer** aller zehn bestehenden Seiten: Eintrag "Software" (mit kleinem "Neu"-Hinweis,
  `.nav-new`) nach "Entwicklung+Design". **Startseite:** Banner (`.promo`) direkt unter dem Hero,
  Schema-Beschreibung um Software-Lösungen ergänzt.
- **Navigations-Überlauf behoben:** schon vor dieser Änderung hatte die Hauptnavigation (inkl.
  "Kundenportal") bei 1440px keinen Platz im 1180px-Container, mit "Software" lief sie sogar über den
  Bildschirmrand (Seite horizontal scrollbar). Jetzt: Kopfzeile hat einen eigenen breiteren Container
  (max 1440px), ab 1401px kompakter gesetzt (kleinere Schrift/Abstände), darunter Burger-Menü
  (Breakpoint von 1080 auf 1400px angehoben). Gemessen bei 1401, 1440, 1920 (kein Überlauf) und 375
  (Mobile).
- **Inhaltliche Annahmen, bitte Michael prüfen:** keine Preise genannt (nur "Fixpreis nach Gespräch");
  die Seite sagt, dass mit KI-gestützten Werkzeugen entwickelt wird; "Ihre Daten gehören Ihnen, Export
  jederzeit" und "Betrieb auf Wunsch gegen kleine monatliche Pauschale" sind Zusagen, die er so halten
  muss; Kennzahl "14 Mitarbeitende nutzen unsere Zeiterfassung täglich" entspricht den 14 Logins. Keine
  erfundenen Kundenreferenzen. Die Karten "Bei uns im Einsatz" (Zeiterfassung, Kundenportal,
  Dokumentenlenkung) stimmen mit dem Stand der echten Tools überein, die DMS-Beispieldaten für
  Fremdfirmen sind aber Demo (siehe 2.6.6/2.6.8).

### 1.6 Leiterplatten-Hintergrund und Software-Seite mit mehr Verkaufswirkung (2026-10-05)

- **Hintergrund wie im Zeiterfassungstool, ohne Gitter:** `main.js` setzt beim Laden ein
  `<div class="app-bg">` (fixierte Ebene, `z-index:-1`) mit SVG-Leiterbahnmuster ein, `style.css`
  (Block am Ende, "Leiterplatten-Hintergrund") hält die Farbverläufe (Akzentblau oben/rechts unten,
  Gold `--accent-2` links unten), langsames Atmen/Driften, `prefers-reduced-motion` aus. Damit er
  durchscheint, sind `.util/.phero/.sec-alt/.cta-band` jetzt halbtransparent (`color-mix` mit `--alt`).
  Neue Seiten brauchen nichts extra, solange sie `main.js` laden. Die Portalseiten (`public/*.html`)
  haben ihren eigenen Hintergrund inkl. Gitter, unverändert.
- **`software.html` überarbeitet:** Hero mit schwebenden Chips und Vertrauenszeile, Branchen-Laufband,
  Kennzahl mit Hochzählen, **Produkt-Tour mit vier Tabs** (Zeiterfassung mit Ferien-Zeilen, Kundenportal,
  Dokumentenlenkung, Auswertung mit SVG-Diagramm; Beispieldaten, neutrale Namen), neun Lösungskarten,
  animiertes Datenfluss-Diagramm (SVG), Vorher/Nachher, **ROI-Rechner** (Regler, 220 Arbeitstage,
  als Beispielrechnung gekennzeichnet), Vergleichstabelle Excel/Standardsoftware/Alta, Versprechen-Kacheln,
  Ablauf, Warum Alta, FAQ, grosses Abschluss-Band und auf Mobile eine feste Kontakt-Schaltfläche.
- **`software.js`** (nur diese Seite): Tabs mit ARIA/Pfeiltasten und Autoplay (pausiert bei Interaktion),
  Rechner, Hochzählen, Sticky-Button. CSS dazu mit Präfix `sw-` in `style.css`.


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

### 2.6 QM-Handbuch als Kundenportal-Seite (Session 2026-09-22/23, siehe 2.6.1 für den Nachtrag zum Zugriffsmodell)

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

**Freigabe-Links-Tabelle verrutscht bei langem Dateinamen als Bezeichnung (2026-09-23):**
Michael meldete das Layout in "Freigabe-Links" als verrutscht, per Screenshot: die
"Bezeichnung"-Spalte war auf wenige Pixel zusammengequetscht, der Text (ein langer, leerzeichen-
loser Dateiname als Bezeichnung, z.B. "crashkurskundenportalzeiterfassung.pdf") brach dadurch
buchstabenweise um. Ursache: `.fname` (Bezeichnung-Spalte) hatte `word-break: break-all`, kann
also beliebig umbrechen, waehrend die Nachbarspalte "Datei(en)" ueber `.meta` ein erzwungenes
`white-space: nowrap` hatte. Bei Tabellen mit automatischer Spaltenbreite (kein
`table-layout: fixed`) nimmt sich eine nicht-umbrechbare Spalte den Platz, den sie braucht, zu
Lasten der umbrechbaren Nachbarspalte, die dadurch auf eine Minimalbreite gequetscht wird. Fix:
neue Klasse `.meta-files` (wie `.meta`, aber ohne `nowrap`, mit `overflow-wrap: anywhere` statt
`.fname`s `word-break: break-all` fuer saubereres Umbrechen) fuer die "Datei(en)"-Zelle in
`loadShares()`. Lokal mit injizierten Testdaten (exakt Michaels beiden Freigabe-Links)
verifiziert: Spaltenbreiten vorher/nachher per `getBoundingClientRect()` geprueft, Bezeichnung
ging von einer Handvoll Pixel auf ca. 220px hoch, Text bricht jetzt auf 2 Zeilen statt
buchstabenweise.

### 2.6.1 Nachtrag: Zugriffsmodell geaendert, Freigabe-Links fuers Handbuch, Redesign (2026-09-23)

Michael fand die "alle Mitarbeitenden sehen das Handbuch"-Loesung aus 2.6 nicht passend ("dieses
Handbuch müssen nicht alle Mitarbeiter sehen können") und wollte statt einer neuen, eigenen
Website eine elegantere Loesung innerhalb des bestehenden Portals. Antwort: dasselbe Freigabe-Link-
Muster wiederverwenden, das fuer Datei-Downloads schon existiert (zeitlich begrenzt, jederzeit
zurueckziehbar, kein Access-Login noetig), nur fuers Handbuch statt fuer Dateien.

- **`/qm-handbuch` ist jetzt admin-only** (`isAdminEmail()` statt `isMitarbeiterEmail()`). Alle
  anderen (Mitarbeitende oder Kunden) bekommen stattdessen von Stefan oder Michael einen
  Freigabe-Link.
- **Neuer oeffentlicher Pfad `GET /handbook/<id>`** (kein Access-Login), analog zu `/share/<id>`:
  prueft einen Eintrag in derselben `SHARES`-KV, aber mit Prefix `hshare:` statt `share:` (kein
  neues Binding in `wrangler.toml` noetig), liefert bei gueltigem Link `_qm-handbuch-inner.html`
  aus, sonst 410 mit Klartext-Fehlermeldung. Erhoeht bei jedem Aufruf `viewCount`.
  **WICHTIG, noch offen:** genau wie `/share/*` und `/request-access` muss `/handbook/*` zusaetzlich
  als Bypass in der Cloudflare-Access-Policy eingetragen werden (Zero Trust Dashboard), sonst
  faengt Access den Aufruf ab, bevor der Worker-Code ihn ueberhaupt sieht. Das ist eine
  Sicherheitseinstellung im Cloudflare-Dashboard, die Claude nicht selbst vornimmt (siehe
  Sicherheitsregeln), das muss Michael oder Stefan einmalig nachtragen.
- **Neue admin-only Endpunkte** `GET /api/handbook-shares`, `POST /api/handbook-share`,
  `POST /api/handbook-share-revoke`, exakt analog zu den bestehenden `/api/share*`-Endpunkten fuer
  Dateien, nur ohne `fileKeys` (das Handbuch ist ein einziges, festes Dokument, keine Auswahl
  noetig) und mit `admin`-Check statt "eigene oder alle, falls Admin".
- **Neues Panel "📘 QM-Handbuch"** im Portal-Dashboard (nur fuer Admins sichtbar): grosser
  "QM-Handbuch öffnen"-Button, "Freigabe-Link erstellen"-Button (gleicher Prompt-Dialog-Flow wie
  bei Datei-Freigaben: Tage gueltig, optionale Bezeichnung), Tabelle bestehender Handbuch-Links
  mit Kopieren/Zurueckziehen.
- **Design-Nachbesserungen**, ebenfalls angefragt ("fehlt mir Logo und Design", "Pfeil zur Website
  ist verwirrend", "QM-Handbuch-Button deutlicher"):
  - Echtes Logo (`https://alta-engineering.ch/logo.png`, per absoluter URL eingebunden statt die
    Bilddatei im Kundenportal-Repo zu duplizieren) statt nur Text in der Kopfzeile.
  - "Zur Website"-Link hiess vorher nur "&larr; Zur Website" **ohne** `target="_blank"`, ein Klick
    hat also den ganzen Portal-Tab durch die Hauptwebsite ersetzt, das war vermutlich das
    "verwirrend". Jetzt "Hauptwebsite" mit explizitem Extern-Link-Icon und `target="_blank"`.
  - Das QM-Handbuch hat jetzt sowohl einen auffaelligen Button in der Kopfzeile als auch ein
    eigenes, farblich hervorgehobenes Panel im Dashboard (Klasse `.panel.accent`), statt nur ein
    kleiner Text-Link zu sein.
  - **Dabei aufgefallen: die Kopfzeile hatte ueberhaupt keinen Mobile-Breakpoint**, Marke plus drei
    Kopfzeilen-Aktionen liefen auf schmalen Bildschirmen rechts aus dem Bild. Neuer
    `@media (max-width: 640px)`-Block blendet die Textlabels der Nebenaktionen aus (nur Icons
    bleiben), verkleinert Logo/Marke/Abstaende, jetzt passt alles auf eine Zeile.
- **Lokal end-to-end verifiziert** (`wrangler dev`): admin-Zugriff auf `/qm-handbuch` (200),
  Mitarbeitenden-Zugriff jetzt korrekt 403, Freigabe-Link-Erstellung als Admin (200) und als
  Nicht-Admin (403), Aufruf des erzeugten Links ganz ohne Auth-Header (200, `viewCount` erhoeht
  sich), ungueltige/erfundene ID (410), Zurueckziehen und danach 410. Zusaetzlich alle bisherigen
  Endpunkte (`/`, `/favicon.ico`, `/api/me`, `/share/*`, `/api/request-access`) erneut auf
  Regressionen geprueft, alle unveraendert. Visuell im Browser bei Desktop- und Mobile-Breite
  gegengeprueft (Logo, neues Panel, Kopfzeile ohne Ueberlauf), Light- und Dark-Mode beide geprueft.

### 2.6.2 Nachtrag: Design zurueckhaltender, Ordner-Uebersicht, Aktivitaets-Log (2026-09-23)

Michael fand das Handbuch-Panel "zu krass betont" und den Rest der Seite "nicht redesignt", dazu
zwei neue Feature-Wuensche: eine Uebersicht ueber alle Kundenordner auf einmal (statt einzeln per
Dropdown), und eine Admin-Konsole, die zeigt "was gemacht wurde, wer hat's erledigt".

- **`.panel.accent` (Handbuch-Panel) deutlich zurueckgenommen**: kein eigener Farbverlauf-
  Hintergrund und kein dickerer Rahmen mehr, nur noch die Ecken-Akzente sind blau statt grau,
  genau wie jedes andere Panel auch, nur dezent hervorgehoben statt lauter zu wirken.
- **Stat-Zeile im Hero** (nur fuer Admins): Anzahl Kundenordner, offene Zugangsanfragen, aktive
  Freigaben (Datei- und Handbuch-Links zusammengezaehlt) auf einen Blick, fuellt den vorher leeren
  Bereich unter dem Begruessungstext mit echten, nuetzlichen Zahlen statt nur Dekoration.
- **"Ordner ansehen" von Dropdown zu Karten-Grid umgebaut**: `/api/folders` liefert jetzt
  `{ name, fileCount }` statt nur Namen (eine zusaetzliche B2-Anfrage pro Ordner, bei der
  ueberschaubaren Anzahl Kundenordner unproblematisch). Jeder Ordner ist eine eigene, anklickbare
  Karte mit Namen und Dateianzahl, alle gleichzeitig sichtbar statt einzeln aus einer Liste
  auswaehlbar.
- **Neues Aktivitaets-Log**: neue KV-Namespace `ACTIVITY` (`npx wrangler kv namespace create
  ACTIVITY`, danach in `wrangler.toml` eingetragen, das ist reine Infrastruktur, keine
  Sicherheitseinstellung, daher direkt selbst angelegt). Helper `logActivity(env, {email, action,
  detail})` schreibt Eintraege mit Key `log:<ISO-Zeitstempel>:<zufall>` (sortiert durch das
  Key-Format von selbst chronologisch beim Auflisten). Aufgerufen bei: Datei hochgeladen/geloescht,
  Freigabe-Link erstellt/zurueckgezogen (Dateien und Handbuch), Zugangsanfrage freigegeben/
  abgelehnt. Neuer admin-only Endpunkt `GET /api/activity` (letzte 100 Eintraege, neueste zuerst),
  neues Panel "Aktivität" mit Tabelle Zeit/Wer/Was/Details.
- **Dabei gefunden: keiner der Tabellen-Wrapper hatte `overflow-x`**, eine Tabelle mit mehreren
  Spalten (z.B. das neue Aktivitaets-Log) sprengte auf schmalen Bildschirmen nicht nur ihr eigenes
  Panel, sondern per fehlendem `overflow-x` auf dem Wrapper gleich die ganze Seite horizontal
  (`document.body.scrollWidth` > Viewportbreite, am eigentlichen Ziel-Viewport von 375px gemessen
  z.B. 538px). Neue gemeinsame Klasse `.table-wrap` (`overflow-x: auto`, `table` bekam zusaetzlich
  `min-width: 480px`) auf alle fuenf Tabellen-Wrapper angewendet (Dateien, Freigabe-Links,
  Handbuch-Freigaben, Zugangsanfragen, Aktivitaet). Verifiziert: `bodyScrollWidth` entspricht nach
  dem Fix wieder exakt der Viewportbreite bei 375px.
- Lokal end-to-end verifiziert: `/api/activity` mit und ohne Admin-Rechte, Log-Eintraege nach
  Erstellen/Zurueckziehen eines Handbuch-Freigabe-Links korrekt und chronologisch, alle bisherigen
  Endpunkte weiterhin unveraendert (Regressionstest). Visuell mit injizierten Testdaten geprueft
  (Stat-Zeile, Ordner-Karten, Aktivitaets-Tabelle, mobile Kopfzeile), da `/api/folders` echte
  B2-Zugangsdaten braucht, die dieser Session lokal nicht vorliegen.

### 2.6.3 Panel-Reihenfolge im Dashboard (2026-09-23)

Michael meldete, die Sortierung sei "dumm": oben die Ordner-Auswahl, dann eine Menge
unabhängiges Zeug, dann erst ganz unten die eigentlichen Daten (Dateien). `public/index.html`
zeigte vorher direkt nach "Ordner ansehen" die drei admin-only Verwaltungs-Panels (QM-Handbuch,
Zugangsanfragen, Aktivität), erst danach Upload und Dateiliste.

Neue Reihenfolge: Ordner ansehen → Datei hochladen → Dateiliste → Freigabe-Links (eigene) →
QM-Handbuch → Zugangsanfragen → Aktivität. Der Kern-Workflow (Ordner wählen, Datei sehen/hochladen,
freigeben) steht jetzt direkt zusammen, die drei unabhängigen Verwaltungs-Panels sind ans Ende
gerutscht. Reine DOM-Umsortierung (die vier `<div class="panel" id="...">`-Blöcke unverändert
verschoben), kein JS angefasst, `getElementById`-Aufrufe sind ohnehin reihenfolge-unabhängig.
Verifiziert über den statischen Vorschau-Server (`alta-website-preview` in `.claude/launch.json`,
liegt im anderen lokalen Checkout `L:\altaengineering-kundenportal-update` und zeigt auf dieses
Repo) mit per JS injizierten Testdaten (kein echter Worker/Backend lokal verfügbar, siehe 2.7):
neue Reihenfolge per `get_page_text` und Screenshot bestätigt, keine neuen Konsolenfehler
(der eine verbleibende 404 ist der erwartete `/api/me`-Aufruf gegen den reinen Static-Server, nicht
von dieser Änderung verursacht).

### 2.6.4 QM-Handbuch-Freigabe-Links verlangen noch Login (offen, 2026-09-23)

Michael meldete: Aufruf eines `/handbook/<id>`-Links verlangt noch einen Cloudflare-Access-Login,
obwohl das laut 2.6.1 ein öffentlicher, login-freier Pfad sein soll. Code-seitig ist das korrekt
implementiert (`src/index.js`, `/handbook/<id>` prüft nur den `SHARES`-KV-Eintrag, keinen
Access-Header). Die Ursache ist exakt der in 2.6.1 als offen markierte Punkt: **die Cloudflare-
Access-Policy braucht einen manuellen Bypass-Eintrag für `/handbook/*`**, sonst fängt Access den
Aufruf ab, bevor der Worker-Code ihn überhaupt sieht, genau wie es für `/share`, `/api/share-info`
und `/api/share-download` schon eingerichtet wurde (siehe 2.4). Das ist eine
Sicherheits-/Zugriffssteuerungs-Einstellung im Cloudflare Zero Trust Dashboard, kein Code-Fix, und
wird von Claude bewusst **nicht** selbst vorgenommen (siehe Sicherheitsregeln, "Modifying system or
security settings"). Michael oder Stefan müssen im Zero Trust Dashboard, in derselben Access-App
"kundenportal oeffentlich" (Policy "Jeder"), unter Destinations einen vierten Eintrag `.../handbook`
ergänzen, exakt nach demselben Muster wie die bestehenden drei.

### 2.6.5 Dokumentenlenkung / DMS, erster Bauschritt (2026-09-29)

Michael will ein eigenes DMS bauen statt eines Marktprodukts (siehe Business-Case-Artefakt
"Software als zweites Standbein"), reuses dafuer bewusst die bestehende Kundenportal-Infrastruktur
statt eines neuen Systems. Diese Session hat den ersten funktionsfaehigen Baustein gebaut, gedacht
als Demo fuer Stefan (Live-Schaltung siehe 2.6.6 direkt im Anschluss):

- **Neue Seite `/dms`** (`public/dms.html`), Design 1:1 vom Kundenportal uebernommen (gleiche
  CSS-Tokens, Panel-/Tabellen-/Badge-Stil aus `public/index.html` kopiert, nicht neu erfunden).
  Bewusst komplett admin-only (nur Stefan/Michael), anders als die normale Dateiverwaltung: das ist
  das interne QM-Tool, noch keine Kunden-/Mitarbeitenden-Freigabe wie beim Handbuch.
- **Backend** (`src/index.js`, neuer Abschnitt "Dokumentenlenkung / DMS"): Dokumente mit Titel,
  Kategorie, Status (Entwurf/Geprueft/Freigegeben) und vollem Versionsverlauf. Metadaten in neuer
  KV-Namespace `DMS` (`doc:<id>`), Dateien wie ueberall sonst in B2 unter `_dms/<id>/vN__<name>`
  (Underscore-Praefix, damit `/api/folders` das nicht als Kundenordner anzeigt, dort entsprechend
  gefiltert). Jede neue Version setzt den Status automatisch zurueck auf "Entwurf" (eine neue
  Version ist per Definition ungeprueft, selbst wenn der Vorgaenger freigegeben war).
- Endpunkte: `GET/POST/DELETE /api/dms/documents`, `POST /api/dms/upload-url`,
  `POST /api/dms/upload-done`, `POST /api/dms/status`, `GET /api/dms/download`. Alle admin-only.
- Suche/Filter (Titel-Text, Kategorie, Status) laeuft rein clientseitig über die schon geladene
  Dokumentliste, keine Volltextsuche in Dateiinhalten, das war so auch im Business-Case-Papier nicht
  versprochen.
- Link zur neuen Seite im Kundenportal-Header ergaenzt (`🗂️ Dokumentenlenkung`, admin-only,
  gleiches Muster wie der bestehende `📘 QM-Handbuch`-Link).
- Verifiziert visuell mit injizierten Testdaten über den lokalen Static-Server
  (`alta-website-preview`, siehe `.claude/launch.json`), da lokal kein echtes B2/Access-Backend zur
  Verfuegung steht, gleiches Vorgehen wie beim Panel-Reorder in 2.6.3.
- Bewusst NICHT gebaut in diesem ersten Schritt: eigene Freigabe-Links fuers DMS (wie
  `/handbook/<id>`), Volltextsuche, E-Mail-Benachrichtigungen bei Statuswechsel. Naechste
  ausbaufaehige Schritte, kein Blocker fuer eine erste Chef-Demo.

### 2.6.6 DMS live geschaltet, Bereichs-Auswahl, Beispieldaten (2026-09-29, direkt im Anschluss an 2.6.5)

Michael wollte das DMS direkt live sehen koennen fuer die Chef-Demo, nicht nur lokal. Umgesetzt:

- **KV-Namespace `DMS` erzeugt** (`npx wrangler kv namespace create DMS`, ID
  `d6c060376e6b41e0b42be7785c95c541`) und in `wrangler.toml` eingetragen. Anders als sonst in diesem
  Repo diesmal bewusst von Claude selbst ausgefuehrt, auf explizite Anweisung von Michael hin ("okay
  pushe es mal ... erledige das bitte"), inkl. `npx wrangler deploy`. Der Worker ist damit live unter
  `https://alta-kundenportal.alta-engineering.workers.dev` mit dem neuen Code.
- **Neue Bereichs-Auswahl unter `/`** (`public/index.html`, komplett neu geschrieben): fragt zuerst
  "Wohin möchtest du?" mit zwei Karten, Kundenportal (Dateien teilen) und Dokumentenlenkung. Das
  bisherige Kundenportal ist dafuer von `public/index.html` nach `public/portal.html` umgezogen
  (`/portal`), keine Worker-Routen-Aenderung noetig, das laeuft weiterhin ueber das normale
  Static-Asset-Ausliefern. Nicht-Admins sehen die Auswahl gar nicht: `/api/me` wird beim Laden
  geprueft, ohne Admin-Rechte leitet die Seite sofort per `location.replace('/portal')` weiter, weil
  das DMS fuer sie ohnehin nicht nutzbar ist (komplett admin-only, siehe 2.6.5). Folgelinks
  angepasst: `_qm-handbuch-inner.html` und `dms.html` verlinken "Zurück zum Portal" jetzt auf
  `/portal` statt auf `/` (das waere jetzt die Auswahl, nicht das Portal selbst).
- **Fünf Beispieldokumente** direkt in die neue KV-Namespace geschrieben (`npx wrangler kv key put
  --binding=DMS`, nicht ueber die API, siehe unten warum): QM-Handbuch (freigegeben, v6, 2 Versionen),
  Verfahrensanweisung Wareneingang (geprüft, v2, 2 Versionen), Nichtkonformitäten-Formular (Entwurf,
  v1), Prüfprotokoll Stahlbau EN 1090 (freigegeben, v3) und Schulungsnachweise & Kompetenzmatrix
  (Entwurf, v1), mit plausiblen Zeitstempeln/Bearbeiter:innen.
  **Wichtige Einschränkung:** das sind nur die Metadaten (Titel, Kategorie, Status, Versionshistorie),
  es liegen KEINE echten Dateien in B2 dahinter. Klick auf "Herunterladen" bei diesen fünf Dokumenten
  schlägt fehl (404), bis jemand tatsächlich eine Version darüber hochlädt. Grund: Claude kann sich
  nicht durch Cloudflare Access einloggen (das ist eine echte Login-Identität von Michael/Stefan),
  daher ging der Upload-Weg über die App selbst nicht, nur der direkte KV-Metadaten-Weg via wrangler.
  Sobald Michael oder Stefan einmal ueber "Version hochladen" eine echte Datei nachreicht, ist der
  Effekt sogar ein guter Demo-Moment: der Status springt live sichtbar zurück auf "Entwurf".

### 2.6.7 Hintergrund vom Zeiterfassungstool, Rundgang, einheitliche Kopfzeile (2026-09-29)

Drei Nachbesserungen an `public/index.html` (Auswahlseite), `public/portal.html` und
`public/dms.html`, alle drei identisch umgesetzt:

- **PCB-Leiterbahnen-Hintergrund**, 1:1 vom Zeiterfassungstool (`zft_check/src/app/layout.tsx` +
  `globals.css`) uebernommen: echtes SVG-`<pattern>` (400px-Kachel, Motiv nur in der linken oberen
  Ecke, sonst wie im Zeiterfassungstool zu dicht/"wie Tapete", siehe Lektion dort), themefaehig ueber
  `color-mix(in srgb, var(--accent) ...)`. Als `.app-bg`-Div direkt nach `<body>`, `position:fixed`,
  `z-index:-1`, `pointer-events:none`, malt oberhalb des body-Hintergrunds (das bestehende Punktraster
  bleibt sichtbar) aber unterhalb des Inhalts. `dms.html` nutzt dafuer den schon vorhandenen
  `--warn`-Farbton statt eines neuen Tokens, `index.html`/`portal.html` bekamen dafuer ein neues
  `--accent-2` (Gold, gleicher Wert wie `--warn` in dms.html), vorher nicht vorhanden.
- **Rundgang ("?"-Button oben rechts):** modales Schritt-fuer-Schritt-Overlay (`.tour-overlay`), pro
  Seite eigener Inhalt (Auswahlseite erklaert die Wahl, Kundenportal erklaert Upload/Freigabe-Links/
  QM-Handbuch/DMS, DMS erklaert Anlegen/Versionen/Status/Suche). Kein Element-Spotlight (kein
  Shepherd.js o.ae. eingebunden), bewusst ein einfaches Info-Modal mit Weiter/Zurueck/Überspringen,
  passend zum Rest des Repos ohne Build-Schritt/Fremdabhaengigkeiten.
- **Einheitliche Kopfzeile:** Michael meldete, das QM-Handbuch-Icon sei "mal da, mal nicht" oben in
  der Navigation. Ursache: `dms.html` und die (neue) Auswahlseite hatten dieses Link-Markup schlicht
  nie, nur `portal.html`. Jetzt zeigen alle drei Seiten dieselben drei admin-only Links (📁
  Kundenportal, 🗂️ Dokumentenlenkung, 📘 QM-Handbuch, IDs `navPortalLink`/`navDmsLink`/
  `navHandbuchLink`), sichtbar/unsichtbar ausschliesslich abhaengig vom `/api/me`-Adminstatus, nicht
  mehr davon, auf welcher der drei Seiten man gerade ist. Bewusst auch ein Selbst-Link in Kauf
  genommen (z.B. "Kundenportal" ist auch auf `/portal` selbst sichtbar) statt Spezialfaellen pro
  Seite, einfacher zu warten und garantiert wirklich "ueberall gleich".

### 2.6.8 DMS: Multi-Tenant (ein Kunde = eine eigene Dokumentenlenkung) (2026-10-01)

Feedback vom Chef nach der ersten Demo: das DMS soll kein internes Alta-only-Tool bleiben, sondern
die Grundlage fuer ein verkaufbares Produkt sein, das Alta fuer mehrere Kunden gleichzeitig betreibt
und zentral verwaltet ("ich will diese Software vertreiben koennen und managen"). Deshalb
grundlegend umgebaut, analog zum Mitarbeiter-Modell im Zeiterfassungstool, nur auf Firmenebene statt
Personenebene:

- **Tenants** (KV-Namespace DMS, `tenant:<id>`): `{id, name, domains[], categories[], createdAt,
  createdBy}`. Jedes DMS-Dokument (`doc:<id>`) hat jetzt ein `tenantId`-Feld, Dateien in B2 liegen
  unter `_dms/<tenantId>/<docId>/vN__<name>` (Tenant-Ebene ergaenzt, Rest wie bisher).
- **Zugriff:** Admins (Stefan/Michael) sehen alle Tenants und schalten oben per Dropdown zwischen
  ihnen um (Auswahl in `localStorage` gemerkt). Kunden-Nutzer:innen werden automatisch ihrem Tenant
  zugeordnet, und zwar über die Domain ihrer Login-E-Mail (`email.split('@')[1]` gegen
  `tenant.domains`) -- kein Pflegeaufwand pro Person, eine Domain reicht fuer die ganze Kundenfirma.
  Ohne passende Domain: "Kein Zugriff"-Seite mit Hinweis, sich zu melden.
  **Wichtige Grenze:** das regelt nur, welchem Tenant eine bereits eingeloggte Person zugeordnet
  wird, nicht OB sie sich einloggen darf -- echte neue Kunden-Logins muessen weiterhin manuell im
  Cloudflare-Access-Dashboard freigeschaltet werden (gleiche Grenze wie bei den Access-Bypass-Pfaden
  anderswo in dieser Datei, von Claude bewusst nicht selbst vorgenommen).
- **"Kunden verwalten"**-Panel (Button neben dem Umschalter): Tabelle aller Tenants mit
  Domain(s)/Kategorienzahl/Dokumentenzahl, Bearbeiten (per `prompt()`, gleiches leichtgewichtiges
  Muster wie bei den Freigabe-Links in `portal.html`, bewusst kein grosses Formular) und Loeschen
  (mit Bestaetigung, loescht kaskadierend alle Dokumente samt B2-Dateien). Neuer Kunde: Name,
  Domain(s), Kategorien entweder Standard-Satz oder von einem bestehenden Kunden kopiert.
- **Kategorien pro Tenant statt global**, auf Wunsch "je nach Abteilung" sinnvoll: Alta Engineering
  (Engineering, Qualitätsmanagement, Administration, Finanzen, Vertrieb, Allgemein, dazu "HR" weil
  Stefan das schon so benutzt hat), industrietaucher.ch (Tauchprotokolle & Einsätze, Sicherheit &
  Zertifikate, Ausrüstung, Projektberichte, Qualitätsmanagement), Polytrona AG (Fertigung,
  Elektronik-Entwicklung, Qualitätsmanagement, Prüfung & Test, Einkauf & Lieferanten) -- Branchen via
  Websuche grob recherchiert (industrietaucher.ch: Unterwasserinspektion/-instandhaltung; Polytrona:
  Elektronikfertigung/Leiterplatten/Transformatoren in Stansstad). "Neues Dokument" nutzt jetzt ein
  `<select>` mit den Kategorien des aktuell gewaehlten Tenants statt freiem Text + Datalist.
- **Drei Beispielkunden live angelegt** zum Herumspielen: Alta Engineering AG (die sechs
  bestehenden Dokumente dorthin migriert, **inklusive eines echten, von Stefan selbst schon
  angelegten Dokuments "Stammblatt"** mit echter hochgeladener Datei, nicht angetastet ausser dem
  neuen `tenantId`-Feld), industrietaucher.ch und Polytrona AG (je 3 neue Beispieldokumente,
  Metadaten-only wie beim ersten Seed, siehe 2.6.6 fuer die Einschraenkung dazu).
- Migration und Seed-Daten diesmal bewusst ueber Dateien + `--path` statt Inline-JSON an
  `wrangler kv key put` geschrieben: Inline-JSON mit Umlauten über die Git-Bash-Kommandozeile kam
  auf diesem Windows-Rechner korrupt an ("Qualit�tsmanagement" statt "Qualitätsmanagement"), über
  eine von Node mit explizitem UTF-8 geschriebene Datei kam es korrekt an. Beim naechsten Mal gleich
  so vorgehen, nicht nochmal per Inline-String mit Sonderzeichen.
- Backend-seitig lokal mit `wrangler dev` (lokal simulierte KV, nicht die echte) end-to-end
  getestet: Tenant anlegen/bearbeiten/loeschen, Dokument anlegen/auflisten, Status ohne Version
  (erwarteter Fehler), fremder Tenant darf nicht loeschen (403). Dabei einen echten Bug gefunden und
  behoben: Tenant-/Dokument-Loeschen baute immer einen B2-Client auf, auch wenn gar keine Version zu
  loeschen war, das crasht ohne B2-Secrets (lokal) unnoetig -- jetzt nur noch, wenn tatsaechlich eine
  Version existiert.
- Bewusst NICHT angefasst: das alte, separate `/qm-handbuch`-System mit echtem Handbuch-Inhalt in
  `_qm-handbuch-inner.html` lebt unveraendert weiter (Admin-Direktzugriff + Freigabe-Links), um
  keinen echten Inhalt zu riskieren. Das neue DMS deckt "QM-Handbuch" nur noch als Kategorie pro
  Tenant ab, eine echte Zusammenfuehrung beider Systeme ist ein spaeterer Schritt, kein Blocker hier.

### 2.6.9 DMS 2.0 nach dem Vorbild von Wivio (WBI) und M-Files (2026-10-06)

Michael fand das DMS "viel zu simpel", Orientierung an Wivio (WBI, siehe Softwaretest-Bericht) und
"onefiles" (vermutlich M-Files gemeint, bitte bei Gelegenheit bestätigen). Neu und komplett in
`src/dms.js` (statt inline in `src/index.js`, dort nur noch `handleDms(...)` plus Import von
`listTenants`/`resolveTenantForEmail`), Oberfläche neu in `public/dms.html`:

- **Freigabe-Workflow** `POST /api/dms/workflow` (Aktionen einreichen, pruefen, freigeben, ablehnen,
  zurueckziehen, ueberprueft, archivieren, wiederherstellen). Status: Entwurf, In Prüfung, Geprüft,
  Freigegeben, Archiviert. Rollen pro Dokument: Verantwortliche:r, Prüfer:in, Freigeber:in (leer = jede
  berechtigte Person, Alta-Admins dürfen immer). **Vier-Augen-Prinzip** pro Kunde (`tenant.vierAugen`,
  im Kundendialog): wer die aktuelle Version hochgeladen hat, darf sie nicht prüfen/freigeben.
  Ablehnen verlangt eine Begründung. Mail an die Zuständigen über `sendMail` (wirkt erst mit
  `RESEND_API_KEY`).
- **Dokumentnummern** automatisch (`ENG-001`, `QM-003`, Präfix pro Kategorie, Zähler im Tenant),
  Beschreibung, Schlagworte, Verantwortliche, **Wiedervorlage** (`reviewIntervalMonths`, `nextReview`,
  "Überprüft"-Aktion), **gültige Version** (`releasedVersion`) bleibt abrufbar, während eine neue
  Version Entwurf ist, **Änderungsgrund** Pflicht ab v2, **Verlauf/Audit-Trail** inkl. Kommentare
  (`doc.history`), **Lesebestätigung** (`/api/dms/read`, pro freigegebener Version), **Check-out**
  (`/api/dms/lock`), verknüpfte Dokumente, Archiv, Ansehen im Browser (`download?inline=1`),
  **CSV-Export** `GET /api/dms/export` (Excel, Semikolon).
- **UI:** Statistikkarten (klickbar), Ansichten (Alle, Meine Aufgaben, In Prüfung, Überprüfung fällig,
  Archiv), Suche über Nummer/Titel/Schlagwort/Beschreibung/Verantwortliche, Filter, Gruppierung,
  Detail-Panel rechts mit Reitern (Übersicht, Versionen, Verlauf, Verknüpft, Gelesen).
- **Migration:** Dokumente im alten Format (`schema` fehlt) werden beim ersten Lesen automatisch
  hochgestuft (Nummer, Verlauf aus den Versionen, gültige Version, Wiedervorlage 12 Monate nach
  letzter Änderung). Der alte Endpunkt `POST /api/dms/status` antwortet 410.
- **Lokal testen:** `npx wrangler dev --local --port 8788` plus kleiner Proxy, der den
  `Cf-Access-Authenticated-User-Email`-Header setzt (lokal gibt es Access nicht). Datei-Upload geht
  lokal nicht (kein B2), Versionen lassen sich per `upload-done` mit Fake-Key anlegen.
- **Noch nicht gebaut** (Ideen aus Wivio/M-Files): Dokumentvorlagen, Volltextsuche im Dateiinhalt,
  Gruppen für Benachrichtigungen, Rollenverwaltung pro Kunde statt freier E-Mail-Felder, Dashboard
  mit Diagrammen, Wiedervorlage-Erinnerungsmail per Cron.


### 2.7 Lokale Entwicklung

```
npm install
npx wrangler dev
```

Braucht die oben genannten Vars/Secrets, sonst schlagen B2- und Access-Aufrufe fehl (die
Datei-Listing-/Upload-Endpunkte brauchen B2, `/api/access-requests/approve` braucht `CF_API_TOKEN`).

Deploy: `npx wrangler deploy` (braucht `wrangler login` oder `CLOUDFLARE_API_TOKEN` env var mit
Berechtigung für Workers-Deployment in diesem Account).
