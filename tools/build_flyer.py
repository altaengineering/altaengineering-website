# -*- coding: utf-8 -*-
# Regenerate: python tools/build_flyer.py  (run from the repo root, or anywhere --
# output path is resolved relative to this file). Requires: pip install reportlab
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                 TableStyle, HRFlowable)
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.pdfgen import canvas as canvas_mod
from reportlab.lib.utils import ImageReader

LOGO_PATH = os.path.join(os.path.dirname(__file__), "logo.png")

# Brand palette (from style.css :root)
ACCENT = HexColor("#215d92")
ACCENT_DARK = HexColor("#184a78")
TEXT = HexColor("#1b2531")
MUTED = HexColor("#586573")
ALT_BG = HexColor("#f5f7f9")
LINE = HexColor("#e4e8ed")
WHITE = HexColor("#ffffff")

PAGE_W, PAGE_H = A4
MARGIN = 16 * mm

styles = {
    "kicker": ParagraphStyle("kicker", fontName="Helvetica-Bold", fontSize=9,
                              textColor=ACCENT, leading=11, spaceAfter=2,
                              tracking=1),
    "h1": ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=25,
                          textColor=WHITE, leading=28),
    "h1sub": ParagraphStyle("h1sub", fontName="Helvetica", fontSize=11.5,
                             textColor=WHITE, leading=15),
    "h2": ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=13.5,
                          textColor=TEXT, leading=16, spaceAfter=4),
    "body": ParagraphStyle("body", fontName="Helvetica", fontSize=9.6,
                            textColor=MUTED, leading=13.4),
    "svc_title": ParagraphStyle("svc_title", fontName="Helvetica-Bold",
                                 fontSize=10.6, textColor=TEXT, leading=13,
                                 spaceAfter=2),
    "svc_body": ParagraphStyle("svc_body", fontName="Helvetica", fontSize=8.6,
                                textColor=MUTED, leading=11.6),
    "statnum": ParagraphStyle("statnum", fontName="Helvetica-Bold",
                               fontSize=20, textColor=ACCENT, leading=22,
                               alignment=TA_CENTER),
    "statlabel": ParagraphStyle("statlabel", fontName="Helvetica",
                                 fontSize=8.2, textColor=MUTED, leading=10,
                                 alignment=TA_CENTER),
    "normcode": ParagraphStyle("normcode", fontName="Helvetica-Bold",
                                fontSize=8.6, textColor=ACCENT, leading=11),
    "footer": ParagraphStyle("footer", fontName="Helvetica", fontSize=9,
                              textColor=WHITE, leading=13),
    "footerb": ParagraphStyle("footerb", fontName="Helvetica-Bold",
                               fontSize=10.5, textColor=WHITE, leading=13),
}

SERVICES = [
    ("Konstruktion",
     "Vom Konzept bis zur fertigungsreifen Zeichnung: effiziente Ausführung Ihrer Projekte."),
    ("Entwicklung + Design",
     "Funktionale, herstellbare und wirtschaftliche Entwicklung von Produkten und Maschinen."),
    ("CAD-Support",
     "Entlastung in Ihrem CAD-System, vor Ort oder remote, bei Auftragsspitzen."),
    ("Management-Systeme",
     "Aufbau und Aufrechterhaltung nach ISO 9001, 14001, 45001 und EN 1090."),
    ("Projektleitung",
     "Termin-, Kosten- und Qualitätsverantwortung als Schnittstelle zu Konstruktion und Fertigung."),
    ("Berechnung",
     "Festigkeits- und Tragfähigkeitsnachweise für Bauteile im Maschinen-, Anlagen- und Stahlbau."),
]

STATS = [("60+", "Kunden"), ("4", "Normen"), ("8", "CAD-Systeme"), ("14", "Mitarbeitende")]

NORMS = [
    ("ISO 9001:2015", "Qualitätsmanagement"),
    ("ISO 14001:2015", "Umweltmanagement"),
    ("ISO 45001:2018", "Arbeitssicherheit"),
    ("EN 1090", "Stahl- und Aluminiumbau"),
]

WHY = [
    ("Zuverlässig und speditiv", "Termintreue Ausführung, sauber dokumentiert."),
    ("Flexibel und belastbar", "Vor Ort bei Ihnen oder in unserem Büro."),
    ("Breite CAD-Kompetenz", "Vertraut mit 8 CAD-Systemen."),
    ("Normgerecht", "Erfahrung mit ISO 9001, 14001, 45001 und EN 1090."),
]


def header_footer(c: canvas_mod.Canvas, doc):
    c.saveState()

    # ---- Header band ----
    header_h = 46 * mm
    c.setFillColor(ACCENT_DARK)
    c.rect(0, PAGE_H - header_h, PAGE_W, header_h, stroke=0, fill=1)
    # subtle darker accent strip at the very top
    c.setFillColor(HexColor("#12324f"))
    c.rect(0, PAGE_H - 3, PAGE_W, 3, stroke=0, fill=1)

    logo_w = 40 * mm
    logo_h = logo_w * (153 / 410)
    c.drawImage(ImageReader(LOGO_PATH), MARGIN, PAGE_H - 7 * mm - logo_h,
                width=logo_w, height=logo_h, mask="auto")
    c.setFillColor(WHITE)
    c.setFont("Helvetica", 11)
    c.drawString(MARGIN, PAGE_H - 27 * mm, "Konstruktion · Entwicklung · CAD-Support · Projektleitung")
    c.setFillColor(HexColor("#bcd4ec"))
    c.setFont("Helvetica", 9.5)
    c.drawString(MARGIN, PAGE_H - 33 * mm, "INGENIEURBÜRO · WEGGIS AM VIERWALDSTÄTTERSEE")

    # ---- Footer band ----
    footer_h = 26 * mm
    c.setFillColor(TEXT)
    c.rect(0, 0, PAGE_W, footer_h, stroke=0, fill=1)
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(MARGIN, footer_h - 8 * mm, "Alta Engineering AG")
    c.setFont("Helvetica", 9)
    c.drawString(MARGIN, footer_h - 13.5 * mm, "Röhrlistrasse 3 · 6353 Weggis")
    c.drawString(MARGIN, footer_h - 18.5 * mm, "+41 41 390 10 50 · info@alta-engineering.ch")

    right_x = PAGE_W - MARGIN
    c.setFont("Helvetica-Bold", 9.5)
    c.drawRightString(right_x, footer_h - 13.5 * mm, "www.alta-engineering.ch")
    c.setFont("Helvetica", 8.6)
    c.setFillColor(HexColor("#b7c0ca"))
    c.drawRightString(right_x, footer_h - 18.5 * mm, "Kundenportal: alta-kundenportal.alta-engineering.workers.dev")

    c.restoreState()


def build():
    doc = SimpleDocTemplate(
        os.path.join(os.path.dirname(__file__), "..", "alta-engineering-flyer.pdf"),
        pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=52 * mm, bottomMargin=32 * mm,
        title="Alta Engineering AG - Firmenflyer",
        author="Alta Engineering AG",
    )

    story = []

    story.append(Paragraph("IHR PARTNER FÜR KONSTRUKTION UND ENTWICKLUNG", styles["kicker"]))
    story.append(Spacer(1, 3))
    intro = ("Alta Engineering AG ist ein Ingenieurbüro in Weggis am Vierwaldstättersee. "
             "Ein leistungsfähiges Team von 14 Mitarbeitenden übernimmt Ihre Konstruktions- "
             "und Entwicklungsaufgaben, vollständig oder als Ergänzung Ihrer eigenen Kapazitäten. "
             "Unsere erfahrenen Fachleute unterstützen Sie vor Ort oder erledigen Ihre Arbeiten in "
             "unserem Büro: flexibel, belastbar und vertraut mit acht CAD-Systemen. Zufriedene und "
             "erfolgreiche Kunden sind die Basis unseres Erfolgs.")
    story.append(Paragraph(intro, styles["body"]))
    story.append(Spacer(1, 12))

    # ---- Kennzahlen row ----
    stat_cells = []
    for n, l in STATS:
        cell = [Paragraph(n, styles["statnum"]), Paragraph(l, styles["statlabel"])]
        stat_cells.append(cell)
    stat_table = Table([stat_cells], colWidths=[(PAGE_W - 2 * MARGIN) / 4.0] * 4)
    stat_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("BACKGROUND", (0, 0), (-1, -1), ALT_BG),
        ("BOX", (0, 0), (-1, -1), 0.6, LINE),
        ("LINEAFTER", (0, 0), (-2, 0), 0.6, LINE),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(stat_table)
    story.append(Spacer(1, 10))

    # ---- Warum Alta Engineering ----
    story.append(Paragraph("Warum Alta Engineering", styles["h2"]))
    story.append(HRFlowable(width="100%", thickness=0.6, color=LINE, spaceAfter=8))

    def why_cell(title, body):
        return [Paragraph("&#10003;&nbsp; " + title, styles["svc_title"]),
                Paragraph(body, styles["svc_body"])]

    why_row1 = [why_cell(*WHY[0]), why_cell(*WHY[1])]
    why_row2 = [why_cell(*WHY[2]), why_cell(*WHY[3])]
    why_col_w = (PAGE_W - 2 * MARGIN) / 2.0
    why_table = Table([why_row1, why_row2], colWidths=[why_col_w] * 2)
    why_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
        ("BACKGROUND", (0, 0), (-1, -1), ALT_BG),
        ("BOX", (0, 0), (-1, -1), 0.6, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.6, LINE),
    ]))
    story.append(why_table)
    story.append(Spacer(1, 10))

    # ---- Arbeitsbereiche ----
    story.append(Paragraph("Wie wir Sie unterstützen", styles["h2"]))
    story.append(HRFlowable(width="100%", thickness=0.6, color=LINE, spaceAfter=8))

    def svc_cell(title, body):
        return [Paragraph(title, styles["svc_title"]), Paragraph(body, styles["svc_body"])]

    row1 = [svc_cell(t, b) for t, b in SERVICES[:3]]
    row2 = [svc_cell(t, b) for t, b in SERVICES[3:6]]
    col_w = (PAGE_W - 2 * MARGIN - 2 * 6) / 3.0
    svc_table = Table([row1, row2], colWidths=[col_w] * 3)
    svc_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
        ("BACKGROUND", (0, 0), (-1, -1), ALT_BG),
        ("BOX", (0, 0), (-1, -1), 0.6, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.6, LINE),
    ]))
    story.append(svc_table)
    story.append(Spacer(1, 10))

    # ---- Normen ----
    story.append(Paragraph("Normen und Zertifizierung", styles["h2"]))
    story.append(HRFlowable(width="100%", thickness=0.6, color=LINE, spaceAfter=8))
    norm_row = []
    for code, label in NORMS:
        norm_row.append([Paragraph(code, styles["normcode"]), Paragraph(label, styles["svc_body"])])
    norm_table = Table([norm_row], colWidths=[(PAGE_W - 2 * MARGIN) / 4.0] * 4)
    norm_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
        ("BACKGROUND", (0, 0), (-1, -1), ALT_BG),
        ("BOX", (0, 0), (-1, -1), 0.6, LINE),
        ("LINEAFTER", (0, 0), (-2, 0), 0.6, LINE),
    ]))
    story.append(norm_table)
    story.append(Spacer(1, 10))

    cta = ("<b>Reden wir über Ihr Projekt.</b> Erzählen Sie uns von Ihrer Aufgabe. "
           "Wir melden uns kurzfristig mit einer ehrlichen Einschätzung. "
           "Kontakt: +41 41 390 10 50 · info@alta-engineering.ch")
    story.append(Paragraph(cta, ParagraphStyle("cta", parent=styles["body"], textColor=TEXT, fontSize=10.2)))

    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)


if __name__ == "__main__":
    build()
    print("done")
