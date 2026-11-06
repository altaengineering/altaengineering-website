// Oeffentliche 3D-Ansicht fuer Freigabe-Links (kein Login).
//
//   GET /share/<id>/3d?file=<key>   liefert den CAD-Viewer fuer eine Datei dieses Links
//   GET /share/<id>/a/<pfad>        liefert die Dateien, die der Viewer dazu braucht
//
// Die Pfade liegen bewusst unter /share/, denn dafuer besteht in Cloudflare Access schon eine
// Ausnahme ohne Login (siehe PROJEKTSTAND.md). Der Viewer selbst (/viewer) bleibt hinter dem Login.
// Die Seiten und Skripte verweisen auf absolute Pfade (/vendor/..., /viewer.js); sie werden hier
// auf den Freigabe-Pfad umgeschrieben. Das Modell kommt ueber /api/share-download, das pro Datei
// prueft, ob sie zum Link gehoert und der Link noch gilt.

const VIEW_EXT = /\.(step|stp|iges|igs|stl|obj)$/i;
const ID_RE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const VIEW_ROUTE = new RegExp("^/share/(" + ID_RE + ")/3d/?$", "i");
const ASSET_ROUTE = new RegExp("^/share/(" + ID_RE + ")/a/(.+)$", "i");
// Nur diese Dateien des Viewers werden oeffentlich ausgeliefert.
const ASSET_ALLOWED = /^(viewer\.css|viewer\.js|fonts\.css|favicon\.ico|favicon-32x32\.png|fonts\/[A-Za-z0-9._-]+|vendor\/(three|occt)\/[A-Za-z0-9._-]+)$/;
const REWRITE = /(["'(])\/(vendor\/|viewer\.js|viewer\.css|fonts\.css|fonts\/|favicon)/g;

export function isShareViewPath(pathname) {
  return VIEW_ROUTE.test(pathname) || ASSET_ROUTE.test(pathname);
}

export function isViewable(name) {
  return VIEW_EXT.test(name || "");
}

// Umschreiben der absoluten Pfade auf den Freigabe-Pfad
export function rewriteAssetPaths(text, id) {
  return text.replace(REWRITE, (m, q, p) => q + "/share/" + id + "/a/" + p);
}

// Bringt die Freigabedaten sicher in eine Inline-Skript-Zeile
export function shareBootstrap(id, file) {
  const json = JSON.stringify({ id, file }).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
  return "<script>window.__SHARE__=" + json + ";</script>";
}

const NO_INDEX = { "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };

function plain(status, message) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", ...NO_INDEX } });
}

// shareIsUsable: Funktion aus index.js (Link nicht zurueckgezogen oder abgelaufen)
export async function handleShareView(request, env, shareIsUsable) {
  const url = new URL(request.url);
  if (request.method !== "GET" && request.method !== "HEAD") return plain(405, "Nicht erlaubt.");

  const asset = url.pathname.match(ASSET_ROUTE);
  if (asset) {
    const id = asset[1].toLowerCase();
    let path;
    try { path = decodeURIComponent(asset[2]); } catch (e) { return plain(404, "Nicht gefunden."); }
    if (path.includes("..") || !ASSET_ALLOWED.test(path)) return plain(404, "Nicht gefunden.");
    const upstream = await env.ASSETS.fetch(new Request(new URL("/" + path, request.url), { method: "GET" }));
    if (!upstream.ok) return plain(404, "Nicht gefunden.");
    const headers = new Headers(upstream.headers);
    headers.set("Cache-Control", "public, max-age=3600");
    for (const [k, v] of Object.entries(NO_INDEX)) headers.set(k, v);
    if (/\.(js|css)$/.test(path)) {
      const body = rewriteAssetPaths(await upstream.text(), id);
      headers.delete("Content-Length");
      headers.delete("ETag");
      return new Response(body, { status: 200, headers });
    }
    return new Response(upstream.body, { status: 200, headers });
  }

  const view = url.pathname.match(VIEW_ROUTE);
  if (!view) return plain(404, "Nicht gefunden.");
  const id = view[1].toLowerCase();
  const file = url.searchParams.get("file") || "";
  const raw = await env.SHARES.get("share:" + id);
  const share = raw && JSON.parse(raw);
  if (!share) return plain(404, "Link nicht gefunden.");
  if (!shareIsUsable(share)) return plain(410, "Dieser Link ist abgelaufen oder wurde zurueckgezogen.");
  if (!share.files.some((f) => f.key === file) || !isViewable(file)) {
    return plain(403, "Diese Datei ist in diesem Link nicht freigegeben oder nicht als 3D-Modell darstellbar.");
  }
  // "/viewer" (ohne .html) anfordern, sonst antwortet das Asset-Routing mit einem Redirect
  const page = await env.ASSETS.fetch(new Request(new URL("/viewer", request.url), { method: "GET" }));
  if (!page.ok) return plain(502, "Der Viewer ist nicht verfuegbar.");
  let html = rewriteAssetPaths(await page.text(), id);
  html = html.replace("<script type=\"importmap\">", shareBootstrap(id, file) + "<script type=\"importmap\">");
  const headers = new Headers({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...NO_INDEX });
  return new Response(html, { status: 200, headers });
}
