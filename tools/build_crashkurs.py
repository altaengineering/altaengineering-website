# -*- coding: utf-8 -*-
# Regenerate: python tools/build_crashkurs.py (von irgendwo, Pfad ist relativ zu
# dieser Datei). Benoetigt: pip install reportlab
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                 TableStyle, HRFlowable, PageBreak)
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.pdfgen import canvas as canvas_mod
from reportlab.lib.utils import ImageReader

LOGO_PATH = os.path.join(os.path.dirname(__file__), "logo.png")

# Brand palette (from style.css :root)
ACCENT = HexColor("#215d92")
ACCENT_DARK = HexColor("#184a78")
TEXT = HexColor("#1b2531")
MUTED = HexColor("#586573")
ALT_BG = HexColor("#f5f7f9")
CHIP_BG = HexColor("#eaf1f8")
LINE = HexColor("#e4e8ed")
WHITE = HexColor("#ffffff")

PAGE_W, PAGE_H = A4
MARGIN = 16 * mm
CONTENT_W = PAGE_W - 2 * MARGIN

styles = {
    "kicker": ParagraphStyle("kicker", fontName="Helvetica-Bold", fontSize=9,
                              textColor=ACCENT, leading=11, spaceAfter=2),
    "h1": ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=21,
                          textColor=WHITE, leading=24),
    "h1sub": ParagraphStyle("h1sub", fontName="Helvetica", fontSize=10.3,
                             textColor=WHITE, leading=14),
    "h2": ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=14.5,
                          textColor=TEXT, leading=17, spaceAfter=4),
    "h3": ParagraphStyle("h3", fontName="Helvetica-Bold", fontSize=10.4,
                          textColor=ACCENT_DARK, leading=13, spaceAfter=3, spaceBefore=10),
    "body": ParagraphStyle("body", fontName="Helvetica", fontSize=9.4,
                            textColor=MUTED, leading=13.2),
    "bodydark": ParagraphStyle("bodydark", fontName="Helvetica", fontSize=9.4,
                                textColor=TEXT, leading=13.4),
    "step": ParagraphStyle("step", fontName="Helvetica", fontSize=9.3,
                            textColor=TEXT, leading=12.8, spaceAfter=6),
    "stepnum": ParagraphStyle("stepnum", fontName="Helvetica-Bold", fontSize=9.3,
                               textColor=WHITE, leading=12.8, alignment=TA_CENTER),
    "ctitle": ParagraphStyle("ctitle", fontName="Helvetica-Bold", fontSize=9.8,
                              textColor=ACCENT_DARK, leading=12.5, spaceAfter=3),
    "url": ParagraphStyle("url", fontName="Helvetica-Bold", fontSize=11,
                           textColor=ACCENT, leading=14),
    "footer": ParagraphStyle("footer", fontName="Helvetica", fontSize=9,
                              textColor=WHITE, leading=13),
    "footerb": ParagraphStyle("footerb", fontName="Helvetica-Bold", fontSize=10.5,
                               textColor=WHITE, leading=13),
}


def steps_table(items):
    rows = []
    for i, text in enumerate(items, 1):
        rows.append([Paragraph(str(i), styles["stepnum"]), Paragraph(text, styles["step"])])
    t = Table(rows, colWidths=[7 * mm, CONTENT_W - 7 * mm - 3 * mm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (0, -1), ACCENT),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (0, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (0, -1), 3.5),
        ("LEFTPADDING", (1, 0), (1, -1), 8),
        ("TOPPADDING", (1, 0), (1, -1), 0),
        ("BOTTOMPADDING", (1, 0), (1, -1), 0),
        ("LEFTPADDING", (0, 0), (0, -1), 0),
        ("RIGHTPADDING", (0, 0), (0, -1), 0),
    ]))
    return t


def callout(title, body_html):
    content = [Paragraph(title, styles["ctitle"]), Paragraph(body_html, styles["bodydark"])]
    t = Table([["", content]], colWidths=[3 * mm, CONTENT_W - 3 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), ACCENT),
        ("BACKGROUND", (1, 0), (1, -1), CHIP_BG),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (1, 0), (1, -1), 11),
        ("RIGHTPADDING", (1, 0), (1, -1), 11),
        ("TOPPADDING", (1, 0), (1, -1), 9),
        ("BOTTOMPADDING", (1, 0), (1, -1), 9),
        ("TOPPADDING", (0, 0), (0, -1), 0),
        ("BOTTOMPADDING", (0, 0), (0, -1), 0),
        ("LEFTPADDING", (0, 0), (0, -1), 0),
        ("RIGHTPADDING", (0, 0), (0, -1), 0),
    ]))
    return t


def url_box(url_text):
    t = Table([[Paragraph(url_text, styles["url"])]], colWidths=[CONTENT_W])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), ALT_BG),
        ("BOX", (0, 0), (-1, -1), 0.6, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return t


def header_footer(c: canvas_mod.Canvas, doc):
    c.saveState()

    header_h = 40 * mm
    c.setFillColor(ACCENT_DARK)
    c.rect(0, PAGE_H - header_h, PAGE_W, header_h, stroke=0, fill=1)
    c.setFillColor(HexColor("#12324f"))
    c.rect(0, PAGE_H - 3, PAGE_W, 3, stroke=0, fill=1)

    logo_w = 34 * mm
    logo_h = logo_w * (153 / 410)
    c.drawImage(ImageReader(LOGO_PATH), MARGIN, PAGE_H - 7 * mm - logo_h,
                width=logo_w, height=logo_h, mask="auto")
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 15)
    c.drawString(MARGIN, PAGE_H - 24.5 * mm, "Crashkurs: Kundenportal & Zeiterfassung")
    c.setFillColor(HexColor("#bcd4ec"))
    c.setFont("Helvetica", 9.5)
    c.drawString(MARGIN, PAGE_H - 30 * mm, "Kurzanleitung für alle Mitarbeitenden der Alta Engineering AG")

    footer_h = 22 * mm
    c.setFillColor(TEXT)
    c.rect(0, 0, PAGE_W, footer_h, stroke=0, fill=1)
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 9.5)
    c.drawString(MARGIN, footer_h - 8 * mm, "Fragen? Stefan Herger oder Michael Küng")
    c.setFont("Helvetica", 8.6)
    c.setFillColor(HexColor("#b7c0ca"))
    c.drawString(MARGIN, footer_h - 13 * mm, "s.herger@alta-engineering.ch · m.kueng@alta-engineering.ch")

    right_x = PAGE_W - MARGIN
    c.setFont("Helvetica", 8.2)
    c.setFillColor(HexColor("#b7c0ca"))
    c.drawRightString(right_x, footer_h - 8 * mm, "Alta Engineering AG · Röhrlistrasse 3 · 6353 Weggis")
    c.drawRightString(right_x, footer_h - 13 * mm, "Seite %d" % doc.page)

    c.restoreState()


def build():
    doc = SimpleDocTemplate(
        os.path.join(os.path.dirname(__file__), "..", "crashkurs-kundenportal-zeiterfassung.pdf"),
        pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=48 * mm, bottomMargin=28 * mm,
    )

    story = []

    # ================= Teil 1: Kundenportal =================
    story.append(Paragraph("TEIL 1", styles["kicker"]))
    story.append(Paragraph("Kundenportal", styles["h2"]))
    story.append(Paragraph(
        "Unser sicherer Online-Ordner für Kundendateien: Zeichnungen, Pläne und Dokumente liegen "
        "dort statt als unsicherer E-Mail-Anhang. Jede Person sieht standardmässig nur ihren eigenen "
        "Ordner, Admins (Stefan, Michael) sehen alle Kundenordner.",
        styles["body"]))
    story.append(Spacer(1, 8))
    story.append(url_box("alta-kundenportal.alta-engineering.workers.dev"))
    story.append(Spacer(1, 10))

    story.append(Paragraph("Anmelden (kein separates Konto nötig)", styles["h3"]))
    story.append(steps_table([
        "Adresse oben im Browser öffnen.",
        "Deine Alta-Engineering-E-Mail-Adresse eingeben und auf „Send login code” klicken.",
        "Code aus der E-Mail eintippen, fertig. Es gibt kein Passwort zu merken, jeder Login läuft "
        "über einen neuen Code per E-Mail.",
        "Klappt die Anmeldung nicht (E-Mail wird nicht akzeptiert)? Dann ist der Zugang noch nicht "
        "freigeschaltet. Kurz bei Stefan oder Michael melden, sie schalten die Adresse frei.",
    ]))

    story.append(Paragraph("Datei hochladen", styles["h3"]))
    story.append(steps_table([
        "Datei per Drag &amp; Drop in das gestrichelte Feld ziehen, oder klicken und auswählen.",
        "Der Fortschrittsbalken zeigt den Upload live an. Alle Dateitypen sind erlaubt, auch grosse "
        "CAD-/Plandateien.",
    ]))

    story.append(Paragraph("Was bedeutet „Freigeben”?", styles["h3"]))
    story.append(callout(
        "Freigabe = Download-Link für Personen ohne Kundenportal-Zugang",
        "Für Projektabgaben an externe Kunden, die selbst keinen Zugang zum Kundenportal haben: eine "
        "Freigabe erzeugt einen Link zu genau der ausgewählten Datei. Wer den Link öffnet, kann die "
        "Datei nur herunterladen, sonst nichts sehen oder verändern. Der Link läuft automatisch nach "
        "der gewählten Anzahl Tage ab und kann jederzeit vorzeitig zurückgezogen werden."))
    story.append(Spacer(1, 6))
    story.append(steps_table([
        "Bei der gewünschten Datei in der Tabelle auf „Freigeben” klicken.",
        "Anzahl Tage eingeben, für die der Link gültig sein soll.",
        "Optional eine Bezeichnung eingeben, z.B. den Projektnamen.",
        "Der fertige Link wird automatisch in die Zwischenablage kopiert, direkt per E-Mail oder "
        "Teams an die Person weiterschicken.",
        "Unter „Freigabe-Links” siehst du alle eigenen aktiven Links inkl. Downloads-Zähler und "
        "kannst sie über „Zurückziehen” vorzeitig deaktivieren.",
    ]))

    story.append(PageBreak())

    # ================= Teil 2: Zeiterfassung =================
    story.append(Paragraph("TEIL 2", styles["kicker"]))
    story.append(Paragraph("Zeiterfassung", styles["h2"]))
    story.append(Paragraph(
        "Ersetzt die Excel-Zeiterfassung. Soll-Zeit, Ist-Zeit und Überstunden-Saldo werden automatisch "
        "berechnet, dazu die Ferienübersicht (Guthaben, bezogen, Übertrag) und ein Excel-Export im "
        "gewohnten Format.",
        styles["body"]))
    story.append(Spacer(1, 8))
    story.append(url_box("zeiterfassungstool-psi.vercel.app"))
    story.append(Spacer(1, 10))

    story.append(Paragraph("Anmelden", styles["h3"]))
    story.append(steps_table([
        "Adresse oben im Browser öffnen.",
        "Mit deiner persönlichen E-Mail-Adresse und dem Passwort aus deinen Zugangsdaten anmelden "
        "(separates Dokument, nicht dasselbe Passwort wie beim Kundenportal).",
        "Passwort vergessen oder verloren? Stefan oder Michael kontaktieren, sie können es als Admins "
        "zurücksetzen. Über „Passwort ändern” oben im Menü kannst du es jederzeit selbst ändern.",
    ]))

    story.append(Paragraph("Einen Arbeitstag erfassen", styles["h3"]))
    story.append(steps_table([
        "In der Tabelle „Tagesübersicht” auf die Zeile des gewünschten Tages klicken, das "
        "Eingabeformular für diesen Tag öffnet sich.",
        "Unter „Stempelzeiten” die Arbeitszeiten eintragen: Start 1 / Stop 1 für den Vormittag, "
        "Start 2 / Stop 2 für den Nachmittag. Bei Bedarf über „+ weitere Zeitblöcke” zusätzliche "
        "Blöcke ergänzen.",
        "Unter „Projekte” eintragen, woran gearbeitet wurde: Projektname plus Stunden. War man am "
        "gleichen Tag an zwei Projekten, beide Zeilen ausfüllen.",
        "Falls zutreffend, die passende Kategorie ausfüllen: „Krank” (ganzer Tag ankreuzen), "
        "„Reisezeit” in Stunden, „Ferien” (keine / halbtags / ganztags), Spesen, oder Stunden unter "
        "„CAD”, „Ausbildung” bzw. „Büro”.",
        "„Soll-Override” nur in echten Sonderfällen ausfüllen, im Normalfall leer lassen, die "
        "Soll-Zeit wird automatisch aus dem Pensum berechnet.",
        "Unten auf „Tag speichern” klicken. Fertig, der Tag erscheint sofort mit Ist-Zeit und "
        "Saldo in der Übersicht.",
    ]))

    story.append(Paragraph("Überblick behalten", styles["h3"]))
    story.append(callout(
        "Alles Wichtige steht oben auf der Seite",
        "„Stand Vormonat” und „Stand Ende Monat” zeigen den laufenden Überstunden-Saldo, „Ferien "
        "Guthaben”, „bezogen” und „Übertrag” die aktuelle Ferienlage. Mit den Pfeilen „← Monat” / "
        "„Monat →” zwischen den Monaten wechseln. Über „Excel-Export” lässt sich der komplette Monat "
        "jederzeit als Datei herunterladen."))

    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)


if __name__ == "__main__":
    build()
    print("done")
