# -*- coding: utf-8 -*-
# Regenerate: python tools/build_job_pdfs.py  (run from anywhere -- output paths
# are resolved relative to this file). Requires: pip install reportlab
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfgen import canvas as canvas_mod

ACCENT = HexColor("#215d92")
ACCENT_DARK = HexColor("#184a78")
TEXT = HexColor("#1b2531")
MUTED = HexColor("#586573")
LINE = HexColor("#e4e8ed")
WHITE = HexColor("#ffffff")

PAGE_W, PAGE_H = A4
MARGIN = 16 * mm

styles = {
    "kicker": ParagraphStyle("kicker", fontName="Helvetica-Bold", fontSize=9.5,
                              textColor=ACCENT, leading=12),
    "h1": ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=20,
                          textColor=TEXT, leading=24, spaceBefore=4, spaceAfter=10),
    "body": ParagraphStyle("body", fontName="Helvetica", fontSize=10.2,
                            textColor=MUTED, leading=15),
    "h2": ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=12.5,
                          textColor=TEXT, leading=15, spaceAfter=4),
    "cta": ParagraphStyle("cta", fontName="Helvetica", fontSize=10.2,
                           textColor=TEXT, leading=15),
}


def header_footer(c: canvas_mod.Canvas, doc):
    c.saveState()
    header_h = 40 * mm
    c.setFillColor(ACCENT_DARK)
    c.rect(0, PAGE_H - header_h, PAGE_W, header_h, stroke=0, fill=1)
    c.setFillColor(HexColor("#12324f"))
    c.rect(0, PAGE_H - 3, PAGE_W, 3, stroke=0, fill=1)

    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 20)
    c.drawString(MARGIN, PAGE_H - 17 * mm, "Alta Engineering AG")
    c.setFillColor(HexColor("#bcd4ec"))
    c.setFont("Helvetica", 10)
    c.drawString(MARGIN, PAGE_H - 24 * mm, "Stellenausschreibung · Weggis am Vierwaldstättersee")

    footer_h = 24 * mm
    c.setFillColor(TEXT)
    c.rect(0, 0, PAGE_W, footer_h, stroke=0, fill=1)
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 10.5)
    c.drawString(MARGIN, footer_h - 8 * mm, "Alta Engineering AG")
    c.setFont("Helvetica", 8.8)
    c.drawString(MARGIN, footer_h - 13 * mm, "Röhrlistrasse 3 · 6353 Weggis · +41 41 390 10 50 · info@alta-engineering.ch")
    right_x = PAGE_W - MARGIN
    c.setFont("Helvetica-Bold", 9.2)
    c.drawRightString(right_x, footer_h - 8 * mm, "www.alta-engineering.ch/jobs.html")
    c.restoreState()


INTRO = ("Wir sind ein junges, ambitioniertes Team von 14 Mitarbeitenden am Vierwaldstättersee. "
         "Wer präzise arbeitet und Verantwortung übernimmt, findet bei uns abwechslungsreiche "
         "Aufgaben und kurze Wege.")

JOBS = [
    {
        "file": "job-konstrukteur-efz.pdf",
        "tag": "Vollzeit / Teilzeit",
        "title": "Konstrukteur/in EFZ",
        "desc": ("Sie konstruieren fertigungsreif und arbeiten sich rasch in verschiedene "
                  "CAD-Systeme ein. Sorgfalt und Termintreue sind für Sie selbstverständlich."),
    },
    {
        "file": "job-techniker-hf-maschinenbau.pdf",
        "tag": "Vollzeit",
        "title": "Techniker/in HF Maschinenbau",
        "desc": ("Sie übernehmen Entwicklungs- und Konstruktionsaufgaben, denken "
                  "lösungsorientiert und behalten Kosten und Machbarkeit im Blick."),
    },
    {
        "file": "job-praktikum-lehre.pdf",
        "tag": "Praktikum / Lehre",
        "title": "Praktikant/in & Lernende",
        "desc": ("Sie stehen am Anfang und wollen im echten Projektalltag lernen. Wir begleiten "
                  "Sie und geben früh Verantwortung."),
    },
]


def build_job(job):
    doc = SimpleDocTemplate(
        os.path.join(os.path.dirname(__file__), "..", job["file"]), pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=48 * mm, bottomMargin=30 * mm,
    )
    story = [
        Paragraph(job["tag"].upper(), styles["kicker"]),
        Paragraph(job["title"], styles["h1"]),
        Paragraph(job["desc"], styles["body"]),
        Spacer(1, 14),
        Paragraph("Über uns", styles["h2"]),
        HRFlowable(width="100%", thickness=0.6, color=LINE, spaceAfter=8),
        Paragraph(INTRO, styles["body"]),
        Spacer(1, 14),
        Paragraph("Auch als Initiativbewerbung", styles["h2"]),
        HRFlowable(width="100%", thickness=0.6, color=LINE, spaceAfter=8),
        Paragraph("Passt gerade keine ausgeschriebene Stelle, aber Sie möchten trotzdem bei uns "
                  "einsteigen? Wir freuen uns auch über Initiativbewerbungen.", styles["body"]),
        Spacer(1, 16),
        Paragraph("<b>Jetzt bewerben:</b> info@alta-engineering.ch", styles["cta"]),
    ]
    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)


if __name__ == "__main__":
    for j in JOBS:
        build_job(j)
    print("done")
