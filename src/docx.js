// Erzeugt eine einfache, gueltige Word-Datei (.docx) aus einer Vorlage: Kopf mit Firma, Dokumentnummer,
// Version und Verantwortlichen, danach die Gliederung der Vorlage mit Hinweisen und Tabellen.
// Eine .docx ist ein ZIP mit ein paar XML-Teilen, gebaut mit fflate (im Worker bereits vorhanden).

import { zipSync, strToU8 } from "fflate";

function x(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function run(text, o) {
  o = o || {};
  const pr = (o.b ? "<w:b/>" : "") + (o.i ? "<w:i/>" : "") + (o.color ? `<w:color w:val="${o.color}"/>` : "") + (o.sz ? `<w:sz w:val="${o.sz}"/>` : "");
  return `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ""}<w:t xml:space="preserve">${x(text)}</w:t></w:r>`;
}
function para(text, o) {
  o = o || {};
  const ppr = (o.style ? `<w:pStyle w:val="${o.style}"/>` : "") + (o.after != null ? `<w:spacing w:after="${o.after}"/>` : "");
  return `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ""}${text === "" ? "" : run(text, o)}</w:p>`;
}
function cell(text, w, o) {
  o = o || {};
  const shade = o.head ? '<w:shd w:val="clear" w:color="auto" w:fill="1F4E8C"/>' : o.alt ? '<w:shd w:val="clear" w:color="auto" w:fill="EEF3F9"/>' : "";
  return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${shade}</w:tcPr>${para(text, { b: o.head || o.b, color: o.head ? "FFFFFF" : null, after: 40 })}</w:tc>`;
}
// rows: Array von Arrays (erste Zeile = Kopf), widths in Twips (Summe ca. 9400 fuer A4 mit 2 cm Rand)
function table(rows, widths, headRow) {
  const total = widths.reduce((a, b) => a + b, 0);
  let t = `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="${total}" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>`;
  rows.forEach((r, ri) => {
    t += "<w:tr>" + r.map((c, ci) => cell(c, widths[ci], { head: headRow && ri === 0, alt: !headRow ? false : ri % 2 === 0, b: !headRow && ci === 0 })).join("") + "</w:tr>";
  });
  return t + "</w:tbl>" + para("", { after: 120 });
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="de-CH"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="80"/></w:pPr><w:rPr><w:b/><w:color w:val="1F4E8C"/><w:sz w:val="40"/><w:szCs w:val="40"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="80"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="1F4E8C"/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>
<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="C9D3DF"/><w:left w:val="single" w:sz="4" w:space="0" w:color="C9D3DF"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="C9D3DF"/><w:right w:val="single" w:sz="4" w:space="0" w:color="C9D3DF"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="C9D3DF"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="C9D3DF"/></w:tblBorders><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`;

/**
 * @param {{firma:string,title:string,docNumber:string,version:number,owner:string,category:string,description?:string,sections:Array<{h:string,hint?:string,table?:string[][],widths?:number[]}>}} d
 * @returns {Uint8Array}
 */
export function buildDocx(d) {
  let body = para(d.title, { style: "Title" });
  if (d.description) body += para(d.description, { color: "62676F", after: 160 });
  body += table(
    [
      ["Firma", d.firma, "Dokumentnummer", d.docNumber],
      ["Kategorie", d.category, "Version", "v" + (d.version || 1) + " (Entwurf)"],
      ["Verantwortlich", d.owner, "Gültig ab", "noch nicht freigegeben"],
    ],
    [1700, 3000, 2000, 2700],
    false,
  );
  (d.sections || []).forEach((s, i) => {
    body += para(`${i + 1}. ${s.h}`, { style: "Heading1" });
    if (s.hint) body += para(s.hint, { i: true, color: "62676F" });
    if (s.table) {
      const n = s.table[0].length;
      const widths = s.widths && s.widths.length === n ? s.widths : new Array(n).fill(Math.floor(9400 / n));
      body += table(s.table, widths, true);
    } else body += para("");
  });
  body += para(`Erstellt aus der Vorlage «${d.templateName || "Dokument"}» am ${new Date().toISOString().slice(0, 10).split("-").reverse().join(".")}. Hinweise in kursiver Schrift beim Ausfüllen löschen.`, { i: true, color: "898781", sz: 16 });

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;

  return zipSync({
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`),
    "word/_rels/document.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "word/styles.xml": strToU8(STYLES),
    "word/document.xml": strToU8(document),
  });
}
