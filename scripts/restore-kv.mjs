#!/usr/bin/env node
// Stellt KV-Daten aus einer Sicherung (alta-kv-*.json.gz oder kv-*.json.gz) wieder her.
//
// Benutzung (im Ordner des Repos, nach "npm install" und "npx wrangler login"):
//
//   node scripts/restore-kv.mjs <sicherung.json.gz>                  zeigt Inhalt, schreibt nichts
//   node scripts/restore-kv.mjs <sicherung.json.gz> --write <ordner>  schreibt je Namespace eine Datei fuer "wrangler kv bulk put"
//   node scripts/restore-kv.mjs <sicherung.json.gz> --write <ordner> --run [--local]
//                                                                     fuehrt zusaetzlich die wrangler-Befehle aus
//
// Ohne --local wird in die echten (entfernten) Namespaces geschrieben. Bestehende Schluessel mit
// gleichem Namen werden ueberschrieben, andere bleiben unberuehrt. Vor einer Wiederherstellung auf dem
// Live-System zuerst eine frische Sicherung ziehen (Portal, Bereich "Sicherung") und mit --local testen.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--") && args.indexOf(a) === 0);
if (!file) {
  console.error("Aufruf: node scripts/restore-kv.mjs <sicherung.json.gz> [--write <ordner>] [--run] [--local]");
  process.exit(1);
}
const outDirIdx = args.indexOf("--write");
const outDir = outDirIdx >= 0 ? args[outDirIdx + 1] : null;
const run = args.includes("--run");
const local = args.includes("--local");

const raw = readFileSync(file);
let text;
try { text = gunzipSync(raw).toString("utf8"); } catch { text = raw.toString("utf8"); }
const data = JSON.parse(text);
if (data.format !== "alta-kv-backup") {
  console.error("Das ist keine Sicherungsdatei dieses Systems (format fehlt oder falsch).");
  process.exit(1);
}

console.log("Sicherung vom", data.createdAt, data.truncated ? "(UNVOLLSTAENDIG, Grenze erreicht)" : "");
for (const [name, ns] of Object.entries(data.namespaces)) console.log("  " + name.padEnd(10), ns.count, "Eintraege");

if (!outDir) {
  console.log("\nNichts geschrieben. Mit --write <ordner> werden die Dateien fuer wrangler erzeugt.");
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });
const cmds = [];
for (const [name, ns] of Object.entries(data.namespaces)) {
  if (!ns.entries.length) continue;
  const f = join(outDir, name + ".bulk.json");
  writeFileSync(f, JSON.stringify(ns.entries.map((e) => ({ key: e.key, value: e.value }))));
  cmds.push(["wrangler", "kv", "bulk", "put", f, "--binding=" + name, local ? "--local" : "--remote"]);
}
console.log("\nBefehle:");
for (const c of cmds) console.log("  npx " + c.join(" "));

if (run) {
  for (const c of cmds) {
    console.log("\n> npx " + c.join(" "));
    const r = spawnSync("npx", c, { stdio: "inherit", shell: true });
    if (r.status !== 0) { console.error("Abbruch bei", c[4]); process.exit(r.status || 1); }
  }
  console.log("\nFertig.");
} else {
  console.log("\nNicht ausgefuehrt. Zum Ausfuehren --run anhaengen.");
}
