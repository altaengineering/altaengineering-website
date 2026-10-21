// Fuehrt den Sicherheitscheck von der Kommandozeile aus: node scripts/check-domain.mjs beispiel.ch [weitere.ch]
import { normalizeDomain, runSecurityCheck } from "file:///L:/altaengineering-website/src/security-check.js";
for (const d of process.argv.slice(2)) {
  const r = await runSecurityCheck(normalizeDomain(d));
  console.log("\n=== " + r.domain + "  Note " + r.grade + "  " + r.score + "/100  (" + r.meta.durationMs + " ms)  " + JSON.stringify(r.counts));
  console.log(r.categories.map(c => `${c.title}: ${c.applicable ? c.score : "n/a"}`).join(" | "));
  for (const f of r.findings.filter(f => f.sev !== "ok")) console.log(`  [${f.sev}] ${f.title}`);
}
