// Minimaler PDF-Erzeuger fuer Berichte (Text, Linien, Flaechen, Tabellen mit Umbruch und Seitenwechsel).
// Standardschriften Helvetica und Helvetica-Bold (WinAnsi, deutsche Umlaute), keine Einbettung noetig.
// Absichtlich klein gehalten: genau so viel, wie der Auditbericht braucht.

import { zlibSync } from "fflate";

// Zeichenbreiten (1/1000 em) fuer ASCII 32 bis 126
const W_REG = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const W_BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];

const SPECIAL = { "€": 0x80, "…": 0x85, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "✔": 0x76, "☐": 0x6f };

// Unicode-Zeichen in ein WinAnsi-Byte umwandeln (Unbekanntes wird zu "?")
function toByte(ch) {
  const c = ch.charCodeAt(0);
  if (c >= 32 && c <= 126) return c;
  if (c >= 0xa0 && c <= 0xff) return c;
  if (SPECIAL[ch] != null) return SPECIAL[ch];
  return 63;
}

function widthOf(str, size, bold) {
  const t = bold ? W_BOLD : W_REG;
  let w = 0;
  for (const ch of str) {
    const b = toByte(ch);
    w += b >= 32 && b <= 126 ? t[b - 32] : b === 0x95 ? 350 : 556;
  }
  return (w * size) / 1000;
}

function pdfString(str) {
  let out = "(";
  for (const ch of str) {
    const b = toByte(ch);
    if (b === 40 || b === 41 || b === 92) out += "\\" + String.fromCharCode(b);
    else if (b < 32 || b > 126) out += "\\" + b.toString(8).padStart(3, "0");
    else out += String.fromCharCode(b);
  }
  return out + ")";
}

function rgb(hex) {
  const h = (hex || "#000000").replace("#", "");
  return [0, 2, 4].map((i) => (parseInt(h.slice(i, i + 2), 16) / 255).toFixed(3)).join(" ");
}

// Text in Zeilen umbrechen (Woerter, lange Woerter werden hart getrennt)
export function wrap(str, maxW, size, bold) {
  const lines = [];
  for (const para of String(str == null ? "" : str).split(/\n/)) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const cand = line ? line + " " + word : word;
      if (widthOf(cand, size, bold) <= maxW) line = cand;
      else {
        if (line) lines.push(line);
        let w = word;
        while (widthOf(w, size, bold) > maxW && w.length > 1) {
          let n = w.length;
          while (n > 1 && widthOf(w.slice(0, n), size, bold) > maxW) n--;
          lines.push(w.slice(0, n));
          w = w.slice(n);
        }
        line = w;
      }
    }
    lines.push(line);
  }
  return lines;
}

export class Pdf {
  constructor(opts) {
    opts = opts || {};
    this.w = opts.landscape ? 841.89 : 595.28;
    this.h = opts.landscape ? 595.28 : 841.89;
    this.margin = opts.margin || 30;
    this.title = opts.title || "Bericht";
    this.onPage = opts.onPage || null; // (pdf, pageNo) beim Anlegen jeder Seite
    this.pages = [];
    this.cur = null;
    this.addPage();
  }
  addPage() {
    this.cur = [];
    this.pages.push(this.cur);
    this.y = this.h - this.margin; // aktuelle Schreibhoehe von oben nach unten
    if (this.onPage) this.onPage(this, this.pages.length);
  }
  get contentW() { return this.w - this.margin * 2; }
  ensure(h) { if (this.y - h < this.margin + 18) this.addPage(); }
  rect(x, y, w, h, fill) { this.cur.push(`${rgb(fill)} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`); }
  line(x1, y1, x2, y2, color, width) { this.cur.push(`${rgb(color || "#c9d3df")} RG ${width || 0.6} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`); }
  text(x, y, str, o) {
    o = o || {};
    const size = o.size || 10;
    let tx = x;
    if (o.align === "right") tx = x - widthOf(str, size, o.bold);
    else if (o.align === "center") tx = x - widthOf(str, size, o.bold) / 2;
    this.cur.push(`BT /${o.bold ? "F2" : "F1"} ${size} Tf ${rgb(o.color)} rg ${tx.toFixed(2)} ${y.toFixed(2)} Td ${pdfString(str)} Tj ET`);
  }
  // Absatz mit Umbruch an der aktuellen Schreibhoehe
  paragraph(str, o) {
    o = o || {};
    const size = o.size || 10, lead = o.lead || size * 1.4;
    for (const l of wrap(str, o.width || this.contentW, size, o.bold)) {
      this.ensure(lead);
      this.y -= lead;
      this.text(this.margin, this.y, l, o);
    }
    this.y -= o.after == null ? 4 : o.after;
  }
  heading(str, o) {
    o = o || {};
    this.ensure(78);
    this.y -= o.before == null ? 12 : o.before;
    this.y -= 15;
    this.text(this.margin, this.y, str, { size: o.size || 13, bold: true, color: "#1f4e8c" });
    this.y -= 5;
    this.line(this.margin, this.y, this.w - this.margin, this.y, "#1f4e8c", 0.8);
    this.y -= 4;
  }
  // cols: [{w, label}] (Summe w = contentW), rows: Array von Zellen (String oder {t, color, bold})
  table(cols, rows, o) {
    o = o || {};
    const size = o.size || 8.5, lead = size * 1.35, padX = 4, padY = 3;
    const drawHead = (first) => {
      this.ensure(lead + padY * 2 + (first ? 44 : 6));
      const h = lead + padY * 2;
      this.rect(this.margin, this.y - h, this.contentW, h, "#1f4e8c");
      let x = this.margin;
      cols.forEach((c) => { this.text(x + padX, this.y - padY - size, c.label, { size, bold: true, color: "#ffffff" }); x += c.w; });
      this.y -= h;
    };
    drawHead(true);
    rows.forEach((r, ri) => {
      const cells = r.map((c) => (typeof c === "object" && c ? c : { t: c }));
      const wrapped = cells.map((c, i) => wrap(c.t == null ? "" : String(c.t), cols[i].w - padX * 2, size, c.bold));
      const nLines = Math.max(...wrapped.map((w) => w.length), 1);
      const h = nLines * lead + padY * 2;
      if (this.y - h < this.margin + 18) { this.addPage(); drawHead(); }
      if (ri % 2 === 0) this.rect(this.margin, this.y - h, this.contentW, h, "#eef3f9");
      let x = this.margin;
      cells.forEach((c, i) => {
        wrapped[i].forEach((l, li) => this.text(x + padX, this.y - padY - size - li * lead + 1, l, { size, bold: c.bold, color: c.color || "#191b1f" }));
        x += cols[i].w;
      });
      this.line(this.margin, this.y - h, this.w - this.margin, this.y - h, "#d8dde3", 0.4);
      this.y -= h;
    });
    this.y -= 6;
  }

  build() {
    const enc = (s) => { const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) & 255; return a; };
    const parts = [];
    const offsets = [];
    let pos = 0;
    const push = (u8) => { parts.push(u8); pos += u8.length; };
    const obj = (n, body) => { offsets[n] = pos; push(enc(`${n} 0 obj\n`)); push(typeof body === "string" ? enc(body) : body); push(enc("\nendobj\n")); };

    push(enc("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n"));
    const nPages = this.pages.length;
    const pageObj = (i) => 5 + i * 2, contentObj = (i) => 6 + i * 2;
    obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
    obj(2, `<< /Type /Pages /Kids [${this.pages.map((_, i) => pageObj(i) + " 0 R").join(" ")}] /Count ${nPages} >>`);
    obj(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    obj(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    this.pages.forEach((ops, i) => {
      obj(pageObj(i), `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.w.toFixed(2)} ${this.h.toFixed(2)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObj(i)} 0 R >>`);
      const comp = zlibSync(enc(ops.join("\n")));
      const head = enc(`<< /Length ${comp.length} /Filter /FlateDecode >>\nstream\n`);
      const body = new Uint8Array(head.length + comp.length + 10);
      body.set(head, 0); body.set(comp, head.length); body.set(enc("\nendstream"), head.length + comp.length);
      obj(contentObj(i), body);
    });
    const total = 5 + nPages * 2;
    const xrefPos = pos;
    let xref = `xref\n0 ${total}\n0000000000 65535 f \n`;
    for (let n = 1; n < total; n++) xref += String(offsets[n]).padStart(10, "0") + " 00000 n \n";
    push(enc(xref));
    push(enc(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`));
    const out = new Uint8Array(pos);
    let p = 0;
    parts.forEach((u) => { out.set(u, p); p += u.length; });
    return out;
  }
}
