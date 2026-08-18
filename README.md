Website alta-engineering.ch bearbeiten
Eine Schritt-für-Schritt-Anleitung für GitHub Pages, HTML-Änderungen und die Domain-Einstellungen (DNS)
1. Überblick: Wie die Website aufgebaut ist
Bevor es an die einzelnen Schritte geht, kurz das grosse Bild. Die Alta Engineering Website besteht aus drei Teilen, die zusammenspielen müssen. 
Teil
Was es ist
Wo es liegt
Die Dateien der Website
HTML-, CSS- und Bilddateien, die den Inhalt und das Design ergeben
GitHub, Repository «altaengineering-website»
Der Server / Hosting
Der Dienst, der diese Dateien im Internet verfügbar macht
GitHub Pages (kostenloser Hosting-Dienst von GitHub)
Die Adresse (Domain)
Der Name, den man in den Browser eingibt
alta-engineering.ch, registriert und verwaltet bei Server Town


Die Website liegt technisch auf GitHub unter der Adresse altaengineering.github.io/altaengineering-website. Damit man stattdessen einfach alta-engineering.ch eingeben kann, ist bei Server Town eine Weiterleitung (DNS) eingerichtet, die den Browser zu GitHub schickt. Mehr dazu in Kapitel 6.
Hinweis: Du musst nichts an der Domain/DNS verändern, wenn du nur Texte oder Bilder auf der Website anpassen willst. Kapitel 2 bis 5 reichen dafür komplett aus. Die Domain/DNS-Themen in Kapitel 6–8 sind nur relevant, wenn sich die Adresse ändert, die Seite plötzlich nicht mehr erreichbar ist, oder das Sicherheitsschloss (https) fehlt.
2. Zugang einrichten (einmalig)
Um etwas an der Website zu ändern, brauchst du Zugriff auf das GitHub-Konto bzw. die Organisation «altaengineering» und Schreibrechte im Repository «altaengineering-website».
Falls noch kein eigener GitHub-Account existiert: auf github.com registrieren (kostenlos, nur E-Mail-Adresse nötig).
Von der Person, die aktuell Zugriff hat (z.B. Stefan oder Michael), als Mitglied/Collaborator zum Repository «altaengineering-website» hinzufügen lassen. Das geht unter: Repository → Settings → Collaborators and teams → Add people.
Einladung per E-Mail annehmen. Danach ist das Repository unter github.com im eigenen Konto unter «Your repositories» sichtbar.
Hinweis: Zwei-Faktor-Authentifizierung (2FA) ist bei GitHub für Organisationen häufig Pflicht. Am einfachsten mit einer Authenticator-App wie Google Authenticator oder Microsoft Authenticator auf dem Handy einrichten, wenn GitHub danach fragt.
3. Kleine Änderungen direkt im Browser (kein Tool nötig)
Für kleine Anpassungen – einen Satz ändern, einen Preis korrigieren, eine Telefonnummer aktualisieren – muss nichts installiert werden. GitHub hat einen eingebauten Editor direkt im Browser.
3.1 So findest und änderst du eine Datei
Auf github.com einloggen und zum Repository «altaengineering-website» navigieren.
Die gewünschte Datei anklicken, z.B. index.html für die Startseite.
Oben rechts auf das Stift-Symbol («Edit this file») klicken.
Im Text die gewünschte Stelle suchen (Browser-Suche mit Strg+F hilft, wenn die Datei lang ist) und den Text direkt ändern.
Ganz unten auf der Seite: bei «Commit changes» einen kurzen, verständlichen Kommentar eintragen, z.B. «Telefonnummer aktualisiert».
«Commit directly to the main branch» auswählen und auf «Commit changes» klicken.
Fertig. Nach ein bis zwei Minuten ist die Änderung live auf alta-engineering.ch sichtbar (siehe Kapitel 5 zum genauen Ablauf im Hintergrund).
Hinweis: HTML ist eine Auszeichnungssprache: Der sichtbare Text steht zwischen spitzen Klammern wie <p>Das ist ein Satz.</p>. Du kannst normalen Text zwischen solchen Tags gefahrlos ändern. Nicht anfassen solltest du die Tags selbst (alles in < > ) sowie Attribute wie class="..." oder href="..." – diese steuern Design und Links und sollten nur verändert werden, wenn du weißt, was sie bewirken.
3.2 Ein Bild austauschen
Im Repository in den passenden Bilder-Ordner navigieren (häufig «images» oder «assets»).
Oben rechts «Add file» → «Upload files» wählen.
Das neue Bild per Drag-and-Drop hochladen. Am einfachsten: exakt denselben Dateinamen verwenden wie das alte Bild (z.B. team.jpg durch eine neue team.jpg ersetzen) – dann muss man nichts im HTML-Code anpassen, weil die Website weiterhin auf denselben Namen verweist.
Unten Commit-Kommentar eintragen und «Commit changes» klicken. GitHub fragt, ob die bestehende Datei ersetzt werden soll – bestätigen.
Hinweis: Bilder möglichst vorher verkleinern (max. ca. 1500–2000 Pixel breite Seite, als JPG mit mittlerer Qualität oder als WebP). Ein Tool dafür: squoosh.app – im Browser, ohne Installation, Bild reinziehen und komprimiert wieder herunterladen. Grosse, unkomprimierte Bilder machen die Website langsam.
4. Empfehlenswerte Tools für grössere Änderungen
Sobald mehrere Stellen gleichzeitig geändert werden sollen, ein neuer Abschnitt dazukommt oder das Layout angepasst werden soll, lohnt sich ein richtiges Editor-Werkzeug statt des einfachen Browser-Editors aus Kapitel 3. Hier die drei sinnvollsten Optionen, sortiert nach Aufwand:
Tool
Installation
Für wen geeignet
github.dev (Taste «.» im Repo)
Keine – läuft im Browser
Etwas grössere Text-änderungen, mehrere Dateien gleichzeitig, ohne etwas zu installieren
Visual Studio Code + GitHub Desktop
Beide kostenlos installieren
Regelmässige, umfangreichere Arbeit an der Website, Vorschau vor der Veröffentlichung
GitHub Browser-Editor (Stift-Symbol)
Keine
Einzelne kleine Text-/Bildkorrekturen (siehe Kapitel 3)

4.1 github.dev – der einfachste Einstieg (empfohlen als nächster Schritt)
Das ist ein vollwertiger Code-Editor, der direkt im Browser läuft – keine Installation, nichts zu konfigurieren.
Im Repository «altaengineering-website» auf github.com die Taste Punkt «.» auf der Tastatur drücken (nicht klicken, einfach drücken, während man auf der Repo-Seite ist).
Es öffnet sich eine Oberfläche mit Dateibaum links und Editor rechts – sieht aus wie eine richtige Programmier-Umgebung, ist aber einfach zu bedienen.
Datei links anklicken, Text rechts direkt bearbeiten wie in einem Textprogramm.
Links am Rand auf das Quellcode-Verwaltungs-Symbol (drei verbundene Punkte) klicken, einen Commit-Kommentar eingeben und auf den Häkchen-Button («Commit & Push») klicken.
Hinweis: github.dev zeigt Syntax farbig an und markiert Tippfehler in HTML-Tags, was Fehler deutlich unwahrscheinlicher macht als im einfachen Browser-Editor. Ein guter Mittelweg zwischen «sehr einfach» und «volle Kontrolle».
4.2 Visual Studio Code + GitHub Desktop (für regelmässige Arbeit)
Wenn die Website über längere Zeit immer wieder gepflegt werden soll, lohnt sich eine lokale Installation. Der Vorteil: Änderungen können vor der Veröffentlichung im eigenen Browser angeschaut werden, bevor sie live gehen.
Visual Studio Code installieren: code.visualstudio.com (kostenlos, für Windows und Mac). Das ist der eigentliche Editor.
GitHub Desktop installieren: desktop.github.com (kostenlos). Das ist die grafische Oberfläche, mit der Änderungen zu GitHub hochgeladen werden, ohne die Kommandozeile zu benutzen.
In GitHub Desktop mit dem GitHub-Konto einloggen, dann «Clone a repository» wählen und «altaengineering-website» auswählen. Damit liegt eine Kopie der Website auf dem eigenen PC.
In GitHub Desktop den Ordner mit «Open in Visual Studio Code» öffnen (oder den Ordner manuell in VS Code öffnen).
In VS Code die gewünschte HTML-Datei anpassen. Empfehlenswerte Erweiterung dazu: «Live Server» (im Erweiterungen-Symbol links suchen und installieren). Rechtsklick auf die HTML-Datei → «Open with Live Server» – die Seite öffnet sich im Browser und aktualisiert sich automatisch bei jeder Änderung, bevor irgendetwas veröffentlicht wird.
Wenn alles passt: zurück zu GitHub Desktop wechseln. Dort werden alle geänderten Dateien angezeigt. Unten links einen kurzen Kommentar eintragen und auf «Commit to main» klicken.
Danach oben auf «Push origin» klicken – das lädt die Änderungen zu GitHub hoch, und die Website aktualisiert sich automatisch (siehe Kapitel 5).
Hinweis: Dieser Weg braucht einmalig etwas Einrichtungszeit, spart danach aber viel Nerven: man sieht Änderungen sofort in echt, bevor sie öffentlich sind, und kann nichts «kaputt hochladen» ohne es vorher gesehen zu haben.
4.3 Was sich nicht lohnt
Klassische «Website-Baukasten»-Programme wie Wix oder Squarespace: passen nicht zusammen mit der bestehenden HTML-Seite auf GitHub, würden eine komplett neue Website bedeuten.
Reine Text-Editoren wie Notepad oder TextEdit: funktionieren technisch, zeigen aber keine Fehler an und machen es leicht, versehentlich ein HTML-Tag zu beschädigen. Kein guter erster Schritt.
5. Der Ablauf im Hintergrund: Von der Änderung bis live
Gut zu wissen, damit klar ist, was nach dem Speichern passiert:
Jede gespeicherte Änderung (egal ob per Browser-Editor, github.dev oder GitHub Desktop) heißt bei GitHub «Commit» – eine Art gespeicherter Schnappschuss mit Kommentar.
Sobald ein Commit auf dem Hauptzweig «main» landet, startet GitHub Pages automatisch einen Bauvorgang («Build») und veröffentlicht die neue Version.
Das dauert normalerweise 30 Sekunden bis 2 Minuten. Den Status sieht man im Repository unter dem Reiter «Actions»: ein gelber Punkt bedeutet «läuft noch», ein grüner Haken «erfolgreich veröffentlicht».
Danach die Seite im Browser neu laden – am besten mit Strg+Shift+R (bzw. Cmd+Shift+R auf Mac), damit keine alte, zwischengespeicherte Version angezeigt wird.
Hinweis: Es gibt keinen separaten «Veröffentlichen»-Knopf. Sobald etwas auf main committet wird, geht es automatisch live. Wer vor der Veröffentlichung testen will, nutzt entweder Live Server lokal (Kapitel 4.2) oder ändert zuerst auf einem separaten Branch – für den Alltag reicht Live Server locker aus.
6. Domain und DNS verständlich erklärt
Dieses Kapitel brauchst du nur, wenn sich an der Adresse selbst etwas ändern soll, oder wenn die Seite plötzlich nicht erreichbar ist. Für den normalen Alltag (Texte, Bilder ändern) ist das nicht nötig.
6.1 Was ist eine Domain und was ist DNS
Eine Domain (hier: alta-engineering.ch) ist letztlich nur ein leicht merkbarer Name für eine technische Adresse im Internet, eine sogenannte IP-Adresse (z.B. 185.199.108.153). Niemand will sich Zahlenkombinationen merken, deshalb gibt es das Domain Name System, kurz DNS – eine Art öffentliches Telefonbuch des Internets.
Wenn jemand alta-engineering.ch in den Browser eingibt, fragt der Browser im Hintergrund: «Welche IP-Adresse gehört zu diesem Namen?» Die Antwort darauf liegt in den sogenannten DNS-Einträgen (Records), die bei Server Town verwaltet werden, weil dort die Domain registriert ist.
6.2 Die drei relevanten Eintragstypen
Eintragstyp
Wofür er da ist
Bei alta-engineering.ch
A-Record
Verweist einen Domainnamen auf eine IPv4-Adresse (die klassische, kurze Art von Internet-Adresse)
Vier A-Records für @ (also die nackte Domain), zeigen auf die vier IP-Adressen von GitHub Pages
AAAA-Record
Dasselbe wie A-Record, aber für IPv6 (die neuere, längere Art von Internet-Adresse)
Wird für GitHub Pages nicht gebraucht. Falls einer existiert, sollte er entfernt werden – sonst kann es zu Konflikten beim SSL-Zertifikat kommen
CNAME-Record
Verweist einen Domain-Teil (z.B. www) nicht auf eine IP-Adresse, sondern auf einen anderen Namen, der seinerseits aufgelöst wird
www zeigt per CNAME auf altaengineering.github.io

Die aktuell bei Server Town für alta-engineering.ch hinterlegten GitHub-Pages-Einträge:
Typ: A       Name: @      Wert: 185.199.108.153
Typ: A       Name: @      Wert: 185.199.109.153
Typ: A       Name: @      Wert: 185.199.110.153
Typ: A       Name: @      Wert: 185.199.111.153
Typ: CNAME   Name: www    Wert: altaengineering.github.io
Hinweis: Das @-Zeichen steht für die «nackte» Domain ohne www, also alta-engineering.ch selbst. Diese vier IP-Adressen gehören fest zu GitHub Pages und sind für alle GitHub-Pages-Websites weltweit identisch – sie sind nicht spezifisch für Alta Engineering.
6.3 Die zweite Hälfte: die CNAME-Datei im Repository
Damit GitHub weiße, dass alta-engineering.ch tatsächlich zu diesem Repository gehören soll (und nicht irgendjemand anderes diese Adresse für sein eigenes GitHub-Pages-Projekt missbraucht), muss die Domain zusätzlich auf der GitHub-Seite selbst eingetragen sein:
Im Repository «altaengineering-website» zu Settings → Pages navigieren.
Unter «Custom domain» steht alta-engineering.ch.
GitHub legt dadurch automatisch eine Datei namens CNAME im Hauptverzeichnis des Repositorys an, die genau diesen Domainnamen enthält. Diese Datei nicht löschen – ohne sie funktioniert die Zuordnung nicht mehr.
Hinweis: Verwirrend, aber wichtig: «CNAME» ist hier gleich zweimal im Spiel – einmal als DNS-Eintragstyp bei Server Town (Kapitel 6.2) und einmal als Datei im GitHub-Repository (dieses Kapitel). Beide müssen stimmen, sind aber zwei unterschiedliche Orte.
6.4 Das Sicherheitsschloss (HTTPS / SSL-Zertifikat)
Sobald DNS-Einträge und Custom-Domain-Einstellung korrekt und stabil sind, stellt GitHub automatisch – über den kostenlosen Dienst Let's Encrypt – ein Sicherheitszertifikat aus. Das erkennt man am Schloss-Symbol vor der Adresse im Browser. Das kann bis zu 24 Stunden dauern und läuft ohne weiteres Zutun.
Hinweis: Wichtig: Eine Custom Domain in den GitHub-Einstellungen nicht mehrfach hintereinander entfernen und wieder eintragen, wenn das Zertifikat nicht sofort erscheint. Let's Encrypt hat ein Limit, wie oft pro Woche für dieselbe Domain ein Zertifikat angefordert werden darf. Bei wiederholtem Entfernen/Eintragen kann man dieses Limit erreichen – dann muss man schlicht ein paar Tage warten. Am besten einmal eintragen und dann in Ruhe abwarten.
6.5 Änderungen an DNS-Einträgen bei Server Town vornehmen
Im Server Town Kundenportal einloggen.
Zum Bereich «DNS-Verwaltung» bzw. «DNS-Einstellungen» der Domain alta-engineering.ch navigieren.
Bestehenden Eintrag anklicken/bearbeiten statt einen neuen daneben anzulegen, wenn ein Eintrag desselben Typs für denselben Namen (@ oder www) bereits existiert – doppelte Einträge führen zu Fehlermeldungen oder dazu, dass die Seite abwechselnd erreichbar und nicht erreichbar ist.
Alle anderen Einträge (MX, SPF, DKIM, DMARC, SRV, NS) unberührt lassen – diese steuern den E-Mail-Verkehr der Firma und haben mit der Website nichts zu tun.
Speichern. Änderungen können bis zu 24 Stunden brauchen, bis sie überall auf der Welt sichtbar sind («DNS-Propagation») – meistens geht es aber innert Minuten bis wenigen Stunden.
7. Häufige Probleme und Lösungen
Symptom
Wahrscheinliche Ursache
Lösung
Seite lädt gar nicht / «kann Server nicht finden»
DNS-Einträge fehlen, sind falsch, oder Propagation läuft noch
A- und CNAME-Records bei Server Town gemäss Kapitel 6.2 prüfen, ein paar Stunden warten
Seite lädt, aber kein Schloss-Symbol / «nicht sicher»
SSL-Zertifikat noch nicht ausgestellt
Bis zu 24h warten, Custom-Domain-Feld in GitHub Settings → Pages nicht mehrfach neu eintragen
Fehlermeldung beim Eintragen des CNAME bei Server Town
Es existiert bereits ein CNAME- oder A-Eintrag mit demselben Namen
Bestehenden Eintrag bearbeiten/löschen statt einen zweiten anzulegen
Eigene Änderung erscheint nicht auf der Live-Seite
Commit ist noch nicht fertig gebaut, oder Browser zeigt alte Version aus dem Cache
Unter «Actions» im Repo Status prüfen (grüner Haken?), Seite mit Strg+Shift+R neu laden
Bild wird nicht angezeigt
Dateiname im HTML-Code stimmt nicht exakt mit dem hochgeladenen Dateinamen überein (Gross-/Kleinschreibung zählt)
Dateinamen im Code und im Ordner exakt vergleichen






8. Kurz-Spickzettel
Kleine Text-/Bildkorrektur → Datei auf github.com öffnen → Stift-Symbol → ändern → Commit changes.
Mehrere Änderungen auf einmal, kein Aufwand mit Installation → Punkt-Taste «.» im Repo drücken → github.dev → ändern → committen.
Regelmässige, grössere Arbeit mit Vorschau → VS Code + GitHub Desktop, mit Live-Server-Erweiterung testen, dann committen und pushen.
Nach jeder Änderung: unter «Actions» im Repo den grünen Haken abwarten, dann Seite mit Strg+Shift+R neu laden.
Domain/DNS nur bei Server Town anfassen, wenn sich die Adresse selbst ändern soll – für normale Inhalte nie nötig.
Bei DNS-Änderungen: immer bestehende Einträge bearbeiten statt doppelt anlegen, und E-Mail-bezogene Einträge (MX, SPF, DKIM, DMARC) nie anfassen.

Erstellt für die interne Verwendung rund um alta-engineering.ch.
