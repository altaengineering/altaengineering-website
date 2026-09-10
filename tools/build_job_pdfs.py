# -*- coding: utf-8 -*-
# Regenerate: python tools/build_job_pdfs.py  (run from anywhere -- output paths
# are resolved relative to this file). Requires: pip install reportlab
#
# Content for Konstrukteur/in EFZ and Techniker/in HF Maschinenbau is taken from
# Alta Engineering's own live postings on join.com (2026-09-09), not invented --
# see the URLs in JOBS below. Praktikant/in & Lernende has no external listing,
# so it stays close to the copy already on jobs.html.
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer,
                                 HRFlowable, ListFlowable, ListItem)
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfgen import canvas as canvas_mod
from reportlab.lib.utils import ImageReader

LOGO_PATH = os.path.join(os.path.dirname(__file__), "logo.png")

ACCENT = HexColor("#215d92")
ACCENT_DARK = HexColor("#184a78")
TEXT = HexColor("#1b2531")
MUTED = HexColor("#586573")
LINE = HexColor("#e4e8ed")
ALT_BG = HexColor("#f5f7f9")
WHITE = HexColor("#ffffff")

PAGE_W, PAGE_H = A4
MARGIN = 16 * mm

styles = {
    "kicker": ParagraphStyle("kicker", fontName="Helvetica-Bold", fontSize=9.5,
                              textColor=ACCENT, leading=12),
    "h1": ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=21,
                          textColor=TEXT, leading=25, spaceBefore=4, spaceAfter=8),
    "body": ParagraphStyle("body", fontName="Helvetica", fontSize=10.2,
                            textColor=MUTED, leading=15),
    "h2": ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=12.5,
                          textColor=TEXT, leading=15, spaceAfter=6),
    "li": ParagraphStyle("li", fontName="Helvetica", fontSize=10, textColor=MUTED,
                          leading=14.5),
    "cta": ParagraphStyle("cta", fontName="Helvetica", fontSize=10.6,
                           textColor=TEXT, leading=15),
}


def header_footer(c: canvas_mod.Canvas, doc):
    c.saveState()
    header_h = 40 * mm
    c.setFillColor(ACCENT_DARK)
    c.rect(0, PAGE_H - header_h, PAGE_W, header_h, stroke=0, fill=1)
    c.setFillColor(HexColor("#12324f"))
    c.rect(0, PAGE_H - 3, PAGE_W, 3, stroke=0, fill=1)

    logo_w = 36 * mm
    logo_h = logo_w * (153 / 410)
    c.drawImage(ImageReader(LOGO_PATH), MARGIN, PAGE_H - 7 * mm - logo_h,
                width=logo_w, height=logo_h, mask="auto")
    c.setFillColor(HexColor("#bcd4ec"))
    c.setFont("Helvetica", 10)
    c.drawString(MARGIN, PAGE_H - 30 * mm, "Stellenausschreibung · Weggis am Vierwaldstättersee")

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


INTRO = ("Wir sind ein ambitioniertes Team von 14 Mitarbeitenden am Vierwaldstättersee. Wer "
         "präzise arbeitet und Verantwortung übernimmt, findet bei uns abwechslungsreiche "
         "Aufgaben und kurze Wege.")

CAD_SYSTEMS = "Inventor, SolidWorks, Creo, Catia, HiCad, NX oder Tekla"

# Aufgaben/Profil/Wir bieten fuer die ersten beiden Stellen sind inhaltlich aus den
# Original-Inseraten auf join.com uebernommen (nicht erfunden):
#   https://join.com/companies/alta-engineering/16670819-konstrukteur-in-efz
#   https://join.com/companies/alta-engineering/16682408-maschinen-techniker-in-hf
BENEFITS_STANDARD = [
    "Umfassende Einarbeitung und ein spannendes, vielseitiges Tätigkeitsgebiet",
    "Moderne CAD-Systeme",
    "Gleitende Arbeitszeit",
    "Langfristige Perspektiven in einem modernen, inhabergeführten Unternehmen",
]

PROFILE_STANDARD = [
    "Ausbildung und Erfahrung in Konstruktion und Berechnung von Bauteilen für "
    "Maschinenbau, Anlagenbau, Metallbau und Stahlbau",
    f"Sicherer Umgang mit CAD-Systemen wie {CAD_SYSTEMS}",
    "Genauigkeit und technische Begeisterung",
    "Loyalität und Teamfähigkeit",
]

JOBS = [
    {
        "file": "job-konstrukteur-efz.pdf",
        "tag": "Angestellte/r · Vollzeit",
        "title": "Konstrukteur/in EFZ",
        "intro": ("Sie konstruieren fertigungsreif und arbeiten sich rasch in verschiedene "
                   "CAD-Systeme ein. Sorgfalt und Termintreue sind für Sie selbstverständlich."),
        "aufgaben": [
            "Entwicklung und Konstruktion von Metall- und Kunststoffteilen in "
            "Zusammenarbeit mit dem Kunden",
            "Bearbeitung sowohl komplexer als auch routinemässiger Konstruktionsaufgaben",
        ],
        "profil": PROFILE_STANDARD,
        "bieten": BENEFITS_STANDARD,
        "source_note": "Quelle: aktuelles Stelleninserat auf join.com",
    },
    {
        "file": "job-techniker-hf-maschinenbau.pdf",
        "tag": "Angestellte/r · Vollzeit",
        "title": "Techniker/in HF Maschinenbau",
        "intro": ("Sie übernehmen Entwicklungs- und Konstruktionsaufgaben, denken "
                   "lösungsorientiert und behalten Kosten und Machbarkeit im Blick."),
        "aufgaben": [
            "Entwicklung und Konstruktion von Metall- und Kunststoffteilen in "
            "Zusammenarbeit mit dem Kunden",
            "Ausführung von komplexen Projekten",
        ],
        "profil": PROFILE_STANDARD,
        "bieten": BENEFITS_STANDARD,
        "source_note": "Quelle: aktuelles Stelleninserat auf join.com",
    },
    {
        "file": "job-praktikum-lehre.pdf",
        "tag": "Praktikum / Lehre",
        "title": "Praktikant/in & Lernende",
        "intro": ("Sie stehen am Anfang und wollen im echten Projektalltag lernen. Wir "
                   "begleiten Sie und geben früh Verantwortung."),
        "aufgaben": [
            "Mitarbeit in laufenden Konstruktions- und Entwicklungsprojekten",
            "Schrittweise Übernahme eigener Teilaufgaben unter Begleitung erfahrener "
            "Kolleginnen und Kollegen",
        ],
        "profil": [
            "Interesse an Technik, Konstruktion und CAD",
            "Sorgfältige, zuverlässige Arbeitsweise",
            "Freude daran, im echten Projektalltag zu lernen",
        ],
        "bieten": [
            "Persönliche Begleitung durch erfahrene Fachleute",
            "Früh eigene Verantwortung statt reiner Zuschauer-Rolle",
            "Einblick in ein breites Spektrum an CAD-Systemen und Projekten",
        ],
        "source_note": None,
    },
]


def bullets(items):
    return ListFlowable(
        [ListItem(Paragraph(t, styles["li"]), spaceAfter=4) for t in items],
        bulletType="bullet", start="circle", bulletFontSize=5, leftIndent=12,
        bulletColor=ACCENT,
    )


def build_job(job):
    doc = SimpleDocTemplate(
        os.path.join(os.path.dirname(__file__), "..", job["file"]), pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=48 * mm, bottomMargin=30 * mm,
        title="Alta Engineering AG - " + job["title"],
        author="Alta Engineering AG",
    )
    story = [
        Paragraph(job["tag"].upper(), styles["kicker"]),
        Paragraph(job["title"], styles["h1"]),
        Paragraph(job["intro"], styles["body"]),
        Spacer(1, 16),

        Paragraph("Ihre Aufgaben", styles["h2"]),
        HRFlowable(width="100%", thickness=0.6, color=LINE, spaceAfter=8),
        bullets(job["aufgaben"]),
        Spacer(1, 14),

        Paragraph("Ihr Profil", styles["h2"]),
        HRFlowable(width="100%", thickness=0.6, color=LINE, spaceAfter=8),
        bullets(job["profil"]),
        Spacer(1, 14),

        Paragraph("Wir bieten", styles["h2"]),
        HRFlowable(width="100%", thickness=0.6, color=LINE, spaceAfter=8),
        bullets(job["bieten"]),
        Spacer(1, 14),

        Paragraph("Über Alta Engineering AG", styles["h2"]),
        HRFlowable(width="100%", thickness=0.6, color=LINE, spaceAfter=8),
        Paragraph(INTRO, styles["body"]),
        Spacer(1, 16),

        Paragraph("<b>Jetzt bewerben:</b> info@alta-engineering.ch. Auch als "
                  "Initiativbewerbung, wenn Sie an einer anderen Stelle interessiert sind.",
                  styles["cta"]),
    ]
    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)


if __name__ == "__main__":
    for j in JOBS:
        build_job(j)
    print("done")
