// Test der oeffentlichen 3D-Ansicht fuer Freigabe-Links (src/share-view.js), ohne Netz und ohne B2.
// Aufruf: node scripts/test-share-view.mjs
import { readFileSync } from "node:fs";
import { handleShareView, isShareViewPath, rewriteAssetPaths, shareBootstrap } from "../src/share-view.js";

let fail = 0;
function ok(cond, msg) { if (!cond) { fail++; console.error("FEHLER:", msg); } else console.log("ok:", msg); }

const ID = "11111111-2222-3333-4444-555555555555";
const KEY = "kunde@beispiel.ch/Flansch.step";
const publicDir = new URL("../public/", import.meta.url);
const disk = (p) => readFileSync(new URL(p.replace(/^\//, ""), publicDir));

const shares = {
  ["share:" + ID]: JSON.stringify({ id: ID, files: [{ key: KEY, name: "Flansch.step" }, { key: "kunde@beispiel.ch/Plan.pdf", name: "Plan.pdf" }], revoked: false, expiresAt: new Date(Date.now() + 86400000).toISOString() }),
};
const usable = (s) => !s.revoked && new Date(s.expiresAt).getTime() > Date.now();
const env = {
  SHARES: { get: async (k) => shares[k] || null },
  ASSETS: {
    fetch: async (req) => {
      const p = new URL(req.url).pathname;
      const map = { "/viewer": "viewer.html" };
      const f = map[p] || p.replace(/^\//, "");
      try { return new Response(disk(f), { headers: { "Content-Type": "application/octet-stream" } }); } catch (e) { return new Response("no", { status: 404 }); }
    },
  },
};
const get = (path) => handleShareView(new Request("https://portal.example" + path), env, usable);

ok(isShareViewPath("/share/" + ID + "/3d"), "Route /3d erkannt");
ok(isShareViewPath("/share/" + ID + "/a/viewer.js"), "Route /a/ erkannt");
ok(!isShareViewPath("/share/" + ID), "normale Freigabeseite bleibt unberuehrt");
ok(!isShareViewPath("/share/abc/3d"), "ungueltige ID wird nicht behandelt");

let r = await get("/share/" + ID + "/3d?file=" + encodeURIComponent(KEY));
let html = await r.text();
ok(r.status === 200, "3D-Seite fuer 3D-Datei: 200");
ok(html.includes("window.__SHARE__="), "Freigabedaten eingebettet");
ok(html.includes('"/share/' + ID + '/a/viewer.js"'), "viewer.js auf Freigabepfad umgeschrieben");
ok(html.includes('"/share/' + ID + '/a/vendor/three/three.module.min.js"'), "Importmap umgeschrieben");
ok(!/(["'(])\/(vendor\/|viewer\.js|viewer\.css|fonts)/.test(html), "keine absoluten Viewer-Pfade mehr in der Seite");
ok(r.headers.get("X-Robots-Tag").includes("noindex"), "noindex gesetzt");

r = await get("/share/" + ID + "/3d?file=" + encodeURIComponent("kunde@beispiel.ch/Plan.pdf"));
ok(r.status === 403, "PDF ist nicht als 3D darstellbar: 403");
r = await get("/share/" + ID + "/3d?file=" + encodeURIComponent("anderer@kunde.ch/Geheim.step"));
ok(r.status === 403, "fremde Datei: 403");
shares["share:" + ID] = JSON.stringify({ ...JSON.parse(shares["share:" + ID]), revoked: true });
r = await get("/share/" + ID + "/3d?file=" + encodeURIComponent(KEY));
ok(r.status === 410, "zurueckgezogener Link: 410");
r = await get("/share/00000000-0000-0000-0000-000000000000/3d?file=x.step");
ok(r.status === 404, "unbekannter Link: 404");

const js = await (await get("/share/" + ID + "/a/viewer.js")).text();
ok(js.includes("'/share/" + ID + "/a/vendor/three/OrbitControls.js'"), "Importe in viewer.js umgeschrieben");
ok(js.includes("'/share/" + ID + "/a/vendor/occt/occt-import-js.wasm'"), "WASM-Pfad umgeschrieben");
ok(!js.includes("'/vendor/"), "viewer.js ohne absolute Vendor-Pfade");
const css = await (await get("/share/" + ID + "/a/fonts.css")).text();
ok(css.includes('url("/share/' + ID + '/a/fonts/'), "Schriftpfade in fonts.css umgeschrieben");
r = await get("/share/" + ID + "/a/vendor/occt/occt-import-js.wasm");
ok(r.status === 200, "WASM wird ausgeliefert");
r = await get("/share/" + ID + "/a/index.html");
ok(r.status === 404, "nicht freigegebene Datei: 404");
r = await get("/share/" + ID + "/a/vendor/three/..%2F..%2Fportal.html");
ok(r.status === 404, "Pfad nach oben: 404");
r = await get("/share/" + ID + "/a/vendor/../portal.html");
ok(r.status === 404, "Pfad mit ..: 404");

ok(!shareBootstrap(ID, '</script><b>').includes("</script><b>"), "Skript-Einbettung escaped </script>");
ok(rewriteAssetPaths('href="/favicon.ico"', ID).includes("/a/favicon.ico"), "Favicon umgeschrieben");

console.log(fail ? fail + " Fehler" : "alle Tests bestanden");
process.exit(fail ? 1 : 0);
