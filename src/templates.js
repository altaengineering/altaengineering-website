// Eingebaute Dokumentvorlagen. Pro Vorlage: Vorgaben fuers neue Dokument (Beschreibung, Schlagworte,
// Ueberpruefung, Lesepflicht) und die Gliederung der Startdatei (Word) mit Hinweisen und Tabellen.
// Eigene Vorlagen eines Kunden (tenant.templates) haben dieselbe Form, ihre Gliederung ist nur
// eine Liste von Ueberschriften mit Hinweis.

export const BUILTIN_TEMPLATES = [
  {
    id: "va",
    icon: "📘",
    name: "Verfahrensanweisung",
    description: "Regelt einen Prozess: Zweck, Geltungsbereich, Ablauf und Verantwortlichkeiten.",
    categoryHint: ["qualit", "qm", "prozess"],
    titlePrefix: "Verfahrensanweisung ",
    tags: ["Verfahrensanweisung", "Prozess"],
    reviewMonths: 12,
    readRequired: true,
    sections: [
      { h: "Zweck", hint: "Warum gibt es diese Anweisung? Ein bis zwei Sätze." },
      { h: "Geltungsbereich", hint: "Für wen, wo und für welche Tätigkeiten gilt sie?" },
      { h: "Begriffe und Abkürzungen", table: [["Begriff", "Bedeutung"], ["", ""], ["", ""]], widths: [2600, 6800] },
      { h: "Verantwortlichkeiten", table: [["Rolle", "Aufgabe"], ["", ""], ["", ""]], widths: [2600, 6800] },
      { h: "Ablauf", hint: "Schritt für Schritt, wer macht was womit.", table: [["Schritt", "Tätigkeit", "Verantwortlich", "Dokument"], ["1", "", "", ""], ["2", "", "", ""], ["3", "", "", ""]], widths: [900, 4200, 2000, 2300] },
      { h: "Mitgeltende Unterlagen", hint: "Andere Dokumente, auf die verwiesen wird." },
      { h: "Aufzeichnungen", hint: "Welche Nachweise entstehen und wie lange werden sie aufbewahrt?" },
    ],
  },
  {
    id: "aa",
    icon: "🛠️",
    name: "Arbeitsanweisung",
    description: "Beschreibt eine Tätigkeit am Arbeitsplatz Schritt für Schritt, inklusive Sicherheit und Kontrolle.",
    categoryHint: ["fertig", "engineering", "produkt", "betrieb"],
    titlePrefix: "Arbeitsanweisung ",
    tags: ["Arbeitsanweisung"],
    reviewMonths: 12,
    readRequired: true,
    sections: [
      { h: "Zweck und Geltungsbereich", hint: "Was wird beschrieben und für wen gilt es?" },
      { h: "Voraussetzungen und Arbeitsmittel", hint: "Benötigte Mittel, Werkzeuge, Schutzausrüstung, Qualifikation." },
      { h: "Ablauf", hint: "Nummerierte Schritte in der richtigen Reihenfolge.", table: [["Nr.", "Tätigkeit", "Hinweis"], ["1", "", ""], ["2", "", ""], ["3", "", ""]], widths: [800, 5600, 3000] },
      { h: "Arbeitssicherheit", hint: "Gefährdungen und Schutzmassnahmen." },
      { h: "Kontrolle", hint: "Woran erkennt man, dass die Arbeit richtig ausgeführt wurde?" },
      { h: "Mitgeltende Unterlagen", hint: "Zeichnungen, Prüfpläne, Formulare." },
    ],
  },
  {
    id: "pp",
    icon: "🔍",
    name: "Prüfprotokoll",
    description: "Formular für Prüfergebnisse mit Auftragsdaten, Prüfmerkmalen und Entscheid.",
    categoryHint: ["prüf", "pruef", "qualit", "qm"],
    titlePrefix: "Prüfprotokoll ",
    tags: ["Prüfung", "Formular"],
    reviewMonths: 24,
    readRequired: false,
    sections: [
      { h: "Auftragsdaten", table: [["Feld", "Eintrag"], ["Auftrag / Projekt", ""], ["Zeichnungsnummer, Index", ""], ["Prüfer, Datum", ""]], widths: [3400, 6000] },
      { h: "Prüfmerkmale", hint: "Pro Merkmal Soll, Ist und Beurteilung eintragen.", table: [["Nr.", "Merkmal", "Sollwert / Toleranz", "Ist", "i.O."], ["1", "", "", "", "☐"], ["2", "", "", "", "☐"], ["3", "", "", "", "☐"], ["4", "", "", "", "☐"]], widths: [700, 3000, 3000, 1700, 1000] },
      { h: "Ergebnis", hint: "☐ Freigabe     ☐ Nacharbeit erforderlich     ☐ Abweichungsmeldung erstellt" },
      { h: "Unterschrift", table: [["Geprüft durch", "Datum", "Unterschrift"], ["", "", ""]], widths: [3600, 2000, 3800] },
    ],
  },
  {
    id: "cl",
    icon: "☑️",
    name: "Checkliste / Formular",
    description: "Einfache Checkliste zum Abhaken mit Bemerkungen und Unterschrift.",
    categoryHint: ["qualit", "qm", "admin"],
    titlePrefix: "Checkliste ",
    tags: ["Checkliste", "Formular"],
    reviewMonths: 24,
    readRequired: false,
    sections: [
      { h: "Angaben", table: [["Feld", "Eintrag"], ["Datum", ""], ["Name", ""], ["Projekt / Auftrag", ""]], widths: [3400, 6000] },
      { h: "Checkliste", table: [["Nr.", "Prüfpunkt", "Erledigt", "Bemerkung"], ["1", "", "☐", ""], ["2", "", "☐", ""], ["3", "", "☐", ""], ["4", "", "☐", ""], ["5", "", "☐", ""]], widths: [700, 4800, 1200, 2700] },
      { h: "Bemerkungen", hint: "Auffälligkeiten, offene Punkte." },
      { h: "Unterschrift", table: [["Name", "Datum", "Unterschrift"], ["", "", ""]], widths: [3600, 2000, 3800] },
    ],
  },
  {
    id: "sp",
    icon: "📝",
    name: "Sitzungsprotokoll",
    description: "Teilnehmende, Traktanden, Beschlüsse und Massnahmen mit Termin und Verantwortlichen.",
    categoryHint: ["admin", "allgemein", "führung", "fuehrung"],
    titlePrefix: "Sitzungsprotokoll ",
    tags: ["Protokoll", "Sitzung"],
    reviewMonths: 0,
    readRequired: false,
    sections: [
      { h: "Sitzungsdaten", table: [["Feld", "Eintrag"], ["Datum, Zeit, Ort", ""], ["Leitung", ""], ["Protokoll", ""], ["Teilnehmende", ""]], widths: [3400, 6000] },
      { h: "Traktanden", hint: "Besprochene Themen in der Reihenfolge der Sitzung." },
      { h: "Beschlüsse und Massnahmen", table: [["Nr.", "Massnahme", "Verantwortlich", "Termin"], ["1", "", "", ""], ["2", "", "", ""], ["3", "", "", ""]], widths: [700, 5000, 2000, 1700] },
      { h: "Nächste Sitzung", hint: "Datum und vorgesehene Themen." },
    ],
  },
  {
    id: "sn",
    icon: "🎓",
    name: "Schulungsnachweis",
    description: "Hält fest, wer an welcher Schulung teilgenommen hat, mit Inhalt und Unterschrift.",
    categoryHint: ["personal", "hr", "qualit"],
    titlePrefix: "Schulungsnachweis ",
    tags: ["Schulung", "Nachweis"],
    reviewMonths: 0,
    readRequired: false,
    sections: [
      { h: "Schulung", table: [["Feld", "Eintrag"], ["Thema", ""], ["Datum, Dauer", ""], ["Referent/in", ""], ["Ort", ""]], widths: [3400, 6000] },
      { h: "Inhalt", hint: "Kurze Stichworte zu den vermittelten Inhalten." },
      { h: "Teilnehmende", table: [["Name", "Funktion", "Unterschrift"], ["", "", ""], ["", "", ""], ["", "", ""], ["", "", ""]], widths: [3400, 2800, 3200] },
      { h: "Wirksamkeit", hint: "Wie wird geprüft, ob die Schulung gewirkt hat? Datum der Kontrolle." },
    ],
  },
];

// Gliederung einer eigenen Vorlage ("Ueberschrift | Hinweis" pro Zeile) in Abschnitte umwandeln
export function sectionsFromOutline(outline) {
  return (Array.isArray(outline) ? outline : []).map((o) => ({ h: String(o.h || "").slice(0, 120), hint: String(o.hint || "").slice(0, 300) })).filter((s) => s.h);
}

export function findTemplate(tenant, id) {
  const b = BUILTIN_TEMPLATES.find((t) => t.id === id);
  if (b) return { ...b, builtin: true };
  const c = (tenant.templates || []).find((t) => t.id === id);
  if (c) return { ...c, icon: "⭐", builtin: false, sections: sectionsFromOutline(c.outline), titlePrefix: "" };
  return null;
}

// Kategorie passend zur Vorlage waehlen: erste Kategorie des Kunden, deren Name einen Hinweis enthaelt.
export function pickCategory(tenant, tpl) {
  if (tpl.category && tenant.categories.includes(tpl.category)) return tpl.category;
  const hints = (tpl.categoryHint || []).map((h) => h.toLowerCase());
  const hit = tenant.categories.find((c) => hints.some((h) => c.toLowerCase().includes(h)));
  return hit || tenant.categories[0];
}
