// Eigenstaendige, lesbare HTML-Seite fuer ein veroeffentlichtes Handbuch (fuer Freigabe-Links
// /handbook/<id>, die ohne Login funktionieren). Hell/Dunkel nach System, druckbar, mit
// Inhaltsverzeichnis und Aenderungsjournal. Kapitelinhalt wird vor der Ausgabe nochmals bereinigt.

import { sanitizeHtml } from "./handbook.js";

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function day(iso) {
  const p = String(iso || "").slice(0, 10).split("-");
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : "";
}

export function renderHandbookPage(pub, revisions) {
  const toc = pub.chapters.map((c, i) => `<a href="#kap-${esc(c.id)}">${i + 1}. ${esc(c.title)}</a>`).join("");
  const body = pub.chapters
    .map((c, i) => `<section id="kap-${esc(c.id)}"><h2>${i + 1}. ${esc(c.title)}</h2><div class="prose">${sanitizeHtml(c.html)}</div></section>`)
    .join("");
  const journal = (revisions || []).length
    ? `<section id="journal"><h2>Änderungsjournal</h2><table><thead><tr><th>Version</th><th>Datum</th><th>Änderung</th></tr></thead><tbody>${(revisions || [])
        .slice()
        .reverse()
        .map((r) => `<tr><td>v${esc(r.version)}</td><td>${esc(day(r.at))}</td><td>${esc(r.note)}</td></tr>`)
        .join("")}</tbody></table></section>`
    : "";
  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(pub.title)}</title>
<style>
:root{color-scheme:light dark;--bg:#f4f5f7;--s:#fff;--t:#191b1f;--m:#62676f;--b:#d8dde3;--a:#1f4e8c}
@media(prefers-color-scheme:dark){:root{--bg:#0a1626;--s:#171a21;--t:#eceef1;--m:#9aa1ab;--b:#2b3038;--a:#5b9bf0}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--t);font:16px/1.65 "Helvetica Neue",Helvetica,Arial,sans-serif}
header{background:#101b2d;color:#fff;padding:14px 22px;display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;align-items:center}
header b{font-size:1.05rem}header span{font-size:.85rem;opacity:.8}
.wrap{max-width:1180px;margin:0 auto;padding:24px 20px 60px;display:grid;grid-template-columns:250px minmax(0,1fr);gap:24px;align-items:start}
nav{position:sticky;top:16px;background:var(--s);border:1px solid var(--b);border-radius:12px;padding:8px}
nav a{display:block;padding:6px 10px;border-radius:7px;color:var(--m);text-decoration:none;font-size:.9rem}nav a:hover{color:var(--t);background:rgba(91,155,240,.12)}
main{background:var(--s);border:1px solid var(--b);border-radius:12px;padding:26px 34px 34px;min-width:0}
h1{margin:0 0 4px;font-size:1.8rem;letter-spacing:-.02em}.meta{color:var(--m);font-size:.9rem;margin-bottom:22px}
section{padding:18px 0;border-top:1px solid var(--b);scroll-margin-top:16px}section:first-of-type{border-top:0}
h2{font-size:1.3rem;margin:0}.prose{margin-top:8px;overflow-wrap:anywhere}.prose h3{font-size:1.08rem;margin:18px 0 4px}.prose h4{margin:14px 0 2px}
.prose ul,.prose ol{margin:8px 0 8px 22px}.prose a{color:var(--a)}table{border-collapse:collapse;width:100%;margin:12px 0;font-size:.92rem}
th,td{border:1px solid var(--b);padding:7px 10px;text-align:left;vertical-align:top}th{background:rgba(127,127,127,.1)}
blockquote{border-left:4px solid var(--a);margin:12px 0;padding:2px 14px;color:var(--m)}code{background:rgba(127,127,127,.15);padding:1px 5px;border-radius:4px}
@media(max-width:900px){.wrap{grid-template-columns:1fr}nav{position:static}main{padding:18px}}
@media print{header,nav{display:none}.wrap{display:block;padding:0}main{border:0;padding:0}body{background:#fff;color:#000}section{break-inside:avoid-page}}
</style></head><body>
<header><b>${esc(pub.title)}</b><span>Version ${esc(pub.version)} · veröffentlicht am ${esc(day(pub.publishedAt))}</span></header>
<div class="wrap"><nav aria-label="Inhaltsverzeichnis">${toc}${journal ? '<a href="#journal">Änderungsjournal</a>' : ""}</nav>
<main><h1>${esc(pub.title)}</h1><div class="meta">Version ${esc(pub.version)}, veröffentlicht am ${esc(day(pub.publishedAt))}</div>${body}${journal}</main></div></body></html>`;
}
