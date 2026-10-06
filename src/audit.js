// Auditbericht der Dokumentenlenkung als PDF: gueltige Dokumente mit Version, Freigabe und
// Ueberpruefungsdatum, offene Punkte, Lesebestaetigungen, Handbuch. Fuer Auditorinnen und Auditoren.

import { Pdf } from "./pdf.js";

function dmy(iso) {
  const p = String(iso || "").slice(0, 10).split("-");
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : "";
}
function daysUntil(iso) {
  if (!iso) return null;
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime();
  return Math.round((new Date(String(iso).slice(0, 10) + "T00:00:00Z").getTime() - today) / 86400000);
}
const STATUS = { entwurf: "Entwurf", in_pruefung: "In Prüfung", geprueft: "Geprüft, wartet auf Freigabe", freigegeben: "Freigegeben", archiviert: "Archiviert" };

export function buildAuditReport({ tenant, docs, handbook, by }) {
  const nameOf = (mail) => {
    if (!mail) return "-";
    const m = (tenant.members || []).find((x) => x.email === String(mail).toLowerCase());
    if (m && m.name) return m.name;
    return String(mail).split("@")[0].split(/[._-]/).filter(Boolean).map((p) => (p.length === 1 ? p.toUpperCase() + "." : p[0].toUpperCase() + p.slice(1))).join(" ");
  };
  const now = new Date();
  const stand = now.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Zurich" }) + " " + now.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich" });

  const pdf = new Pdf({
    landscape: true,
    title: "Auditbericht " + tenant.name,
    onPage: (p, n) => {
      p.rect(0, p.h - 26, p.w, 26, "#1f4e8c");
      p.text(p.margin, p.h - 17, tenant.name, { size: 10.5, bold: true, color: "#ffffff" });
      p.text(p.w - p.margin, p.h - 17, "Auditbericht Dokumentenlenkung", { size: 9, color: "#ffffff", align: "right" });
      p.line(p.margin, 24, p.w - p.margin, 24, "#c9d3df", 0.5);
      p.text(p.margin, 13, `Stand ${stand} · erstellt von ${nameOf(by)}`, { size: 7.5, color: "#62676f" });
      p.text(p.w - p.margin, 13, "Seite " + n, { size: 7.5, color: "#62676f", align: "right" });
      p.y = p.h - 44;
    },
  });

  const active = docs.filter((d) => d.status !== "archiviert");
  const valid = active.filter((d) => d.releasedVersion).sort((a, b) => String(a.docNumber).localeCompare(String(b.docNumber), "de"));
  const overdue = valid.filter((d) => d.nextReview && daysUntil(d.nextReview) < 0);
  const soon = valid.filter((d) => d.nextReview && daysUntil(d.nextReview) >= 0 && daysUntil(d.nextReview) <= 30);
  const open = active.filter((d) => ["entwurf", "in_pruefung", "geprueft"].includes(d.status));

  pdf.y -= 8;
  pdf.text(pdf.margin, pdf.y - 18, "Auditbericht Dokumentenlenkung", { size: 22, bold: true, color: "#1f4e8c" });
  pdf.y -= 26;
  pdf.paragraph(`${tenant.name} · Stand ${stand}`, { size: 10.5, color: "#62676f", after: 8 });

  // Kennzahlen als Kacheln
  const tiles = [
    ["Gültige Dokumente", valid.length, "#1f4e8c"],
    ["Überprüfung überfällig", overdue.length, overdue.length ? "#c62828" : "#1a7f37"],
    ["Überprüfung in 30 Tagen", soon.length, soon.length ? "#a8710a" : "#1a7f37"],
    ["In Arbeit oder Prüfung", open.length, "#1f4e8c"],
    ["Archiviert", docs.length - active.length, "#62676f"],
  ];
  const tw = (pdf.contentW - (tiles.length - 1) * 8) / tiles.length;
  pdf.ensure(54);
  tiles.forEach((t, i) => {
    const x = pdf.margin + i * (tw + 8);
    pdf.rect(x, pdf.y - 46, tw, 46, "#eef3f9");
    pdf.rect(x, pdf.y - 46, 3, 46, t[2]);
    pdf.text(x + 10, pdf.y - 20, String(t[1]), { size: 20, bold: true, color: t[2] });
    pdf.text(x + 10, pdf.y - 36, t[0], { size: 8, color: "#62676f" });
  });
  pdf.y -= 52;

  // Gueltige Dokumente
  pdf.heading("1. Gültige Dokumente");
  const freigabeDurch = (d) => {
    const e = [...(d.history || [])].reverse().find((h) => h.type === "status" && h.to === "freigegeben" && (h.version == null || h.version === d.releasedVersion));
    return e ? { by: nameOf(e.by), at: e.at } : { by: "-", at: d.validFrom };
  };
  const cols = [
    { w: 52, label: "Nr." }, { w: 205, label: "Titel" }, { w: 105, label: "Kategorie" }, { w: 42, label: "Version" },
    { w: 68, label: "Freigegeben" }, { w: 108, label: "Freigegeben durch" }, { w: 108, label: "Verantwortlich" }, { w: 70, label: "Überprüfung" },
  ];
  const scale = pdf.contentW / cols.reduce((a, c) => a + c.w, 0);
  cols.forEach((c) => (c.w *= scale));
  if (valid.length) {
    pdf.table(cols, valid.map((d) => {
      const f = freigabeDurch(d);
      const du = d.nextReview ? daysUntil(d.nextReview) : null;
      const rev = d.nextReview ? { t: (du < 0 ? "überfällig " : "") + dmy(d.nextReview), color: du < 0 ? "#c62828" : du <= 30 ? "#a8710a" : "#191b1f", bold: du < 0 } : { t: "keine" };
      return [{ t: d.docNumber, bold: true, color: "#1f4e8c" }, d.title, d.category, "v" + d.releasedVersion + (d.currentVersion !== d.releasedVersion ? ` (neu: v${d.currentVersion})` : ""), dmy(f.at || d.validFrom), f.by, nameOf(d.owner), rev];
    }));
  } else pdf.paragraph("Es gibt noch keine freigegebenen Dokumente.", { color: "#62676f" });

  // Offene Punkte
  pdf.heading("2. Offene Punkte");
  const items = [];
  overdue.forEach((d) => items.push([d.docNumber, d.title, "Überprüfung überfällig seit " + dmy(d.nextReview), nameOf(d.owner)]));
  open.forEach((d) => items.push([d.docNumber, d.title, STATUS[d.status] + (d.currentVersion ? ` (v${d.currentVersion})` : ""), nameOf(d.status === "in_pruefung" ? d.reviewer : d.status === "geprueft" ? d.approver : d.owner) || "-"]));
  if (items.length) {
    pdf.table([{ w: pdf.contentW * 0.1, label: "Nr." }, { w: pdf.contentW * 0.38, label: "Titel" }, { w: pdf.contentW * 0.34, label: "Offener Punkt" }, { w: pdf.contentW * 0.18, label: "Zuständig" }], items.map((r) => [{ t: r[0], bold: true, color: "#1f4e8c" }, r[1], r[2], r[3]]));
  } else pdf.paragraph("Keine offenen Punkte. Alle gültigen Dokumente sind aktuell überprüft.", { color: "#1a7f37" });

  // Lesebestaetigungen
  const reading = valid.filter((d) => d.readRequired);
  if (reading.length) {
    pdf.heading("3. Lesebestätigungen");
    const groups = tenant.groups || [];
    pdf.table([{ w: pdf.contentW * 0.1, label: "Nr." }, { w: pdf.contentW * 0.4, label: "Titel" }, { w: pdf.contentW * 0.22, label: "Lesepflicht für" }, { w: pdf.contentW * 0.14, label: "Bestätigt" }, { w: pdf.contentW * 0.14, label: "Offen" }],
      reading.map((d) => {
        const gids = d.readGroups || [];
        const people = new Set();
        if (gids.length) gids.forEach((g) => (groups.find((x) => x.id === g)?.members || []).forEach((m) => people.add(m)));
        else (tenant.members || []).forEach((m) => people.add(m.email));
        const done = [...people].filter((p) => d.reads && d.reads[p] && d.reads[p].version === d.releasedVersion).length;
        return [{ t: d.docNumber, bold: true, color: "#1f4e8c" }, d.title, gids.length ? gids.map((g) => groups.find((x) => x.id === g)?.name || "?").join(", ") : "Alle", `${done} von ${people.size}`, { t: String(people.size - done), color: people.size - done ? "#a8710a" : "#1a7f37", bold: true }];
      }));
  }

  // Handbuch
  pdf.heading((reading.length ? "4" : "3") + ". QM-Handbuch");
  if (handbook && handbook.published) {
    pdf.paragraph(`${handbook.title}: Version ${handbook.version}, veröffentlicht am ${dmy(handbook.publishedAt)} von ${nameOf(handbook.publishedBy)}. ${handbook.chapters} Kapitel.`);
    const revs = (handbook.revisions || []).slice(-6).reverse();
    if (revs.length) pdf.table([{ w: 60, label: "Version" }, { w: 80, label: "Datum" }, { w: 150, label: "Von" }, { w: pdf.contentW - 290, label: "Änderung" }], revs.map((r) => ["v" + r.version, dmy(r.at), nameOf(r.by), r.note]));
  } else pdf.paragraph("Das Handbuch ist noch nicht veröffentlicht.", { color: "#62676f" });

  // Unterschrift
  pdf.ensure(70);
  pdf.y -= 18;
  pdf.line(pdf.margin, pdf.y - 24, pdf.margin + 260, pdf.y - 24, "#62676f", 0.6);
  pdf.line(pdf.margin + 300, pdf.y - 24, pdf.margin + 420, pdf.y - 24, "#62676f", 0.6);
  pdf.text(pdf.margin, pdf.y - 36, "Geprüft durch (Auditor/in)", { size: 8, color: "#62676f" });
  pdf.text(pdf.margin + 300, pdf.y - 36, "Datum", { size: 8, color: "#62676f" });
  return pdf.build();
}
