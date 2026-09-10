import { AwsClient } from "aws4fetch";
import { XMLParser } from "fast-xml-parser";

// Alta Engineering Kundenportal — Cloudflare Worker
//
// Auth: Cloudflare Access sitzt vor diesem Worker (Zero Trust Application).
// Jede Anfrage traegt bei erfolgreichem Access-Login den Header
// "Cf-Access-Authenticated-User-Email" mit der E-Mail der eingeloggten Person.
// Dieser Worker vertraut diesem Header vollstaendig (Access verifiziert ihn
// bereits per JWT, bevor die Anfrage hier ankommt).
//
// Storage: Dateien liegen NICHT in Cloudflare R2, sondern in Backblaze B2
// (S3-kompatible API), angesprochen via aws4fetch (AWS SigV4-Signierung).
// Jede Person hat einen eigenen "Ordner" im Bucket, benannt nach ihrer
// (kleingeschriebenen) E-Mail-Adresse. Admins sehen/verwalten alle Ordner.
//
// Zugriffsanfragen (neue Kund:innen, die noch keinen Access-Zugang haben)
// werden in der KV-Namespace REQUESTS gespeichert und muessen von einem
// Admin manuell freigegeben werden — das haengt die E-Mail-Adresse dann per
// Cloudflare-API automatisch in die Access-Policy ein.

const ADMIN_EMAILS = [
  "s.herger@alta-engineering.ch",
  "m.kueng@alta-engineering.ch",
];

function isAdminEmail(email) {
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

function folderFor(email) {
  return email.trim().toLowerCase();
}

function b2Client(env) {
  return new AwsClient({
    accessKeyId: env.B2_KEY_ID,
    secretAccessKey: env.B2_APPLICATION_KEY,
    service: "s3",
    region: env.B2_REGION,
  });
}

function bucketUrl(env) {
  return `https://${env.B2_BUCKET_NAME}.${env.B2_ENDPOINT}`;
}

const xml = new XMLParser({ ignoreAttributes: false });

async function listObjects(env, prefix, delimiter) {
  const client = b2Client(env);
  const url = new URL(bucketUrl(env) + "/");
  url.searchParams.set("list-type", "2");
  if (prefix) url.searchParams.set("prefix", prefix);
  if (delimiter) url.searchParams.set("delimiter", delimiter);

  const res = await client.fetch(url.toString());
  if (!res.ok) {
    throw new Error("B2-Liste fehlgeschlagen: " + res.status + " " + (await res.text()));
  }

  const body = xml.parse(await res.text());
  const result = body.ListBucketResult || {};

  let contents = result.Contents || [];
  if (!Array.isArray(contents)) contents = [contents];

  let commonPrefixes = result.CommonPrefixes || [];
  if (!Array.isArray(commonPrefixes)) commonPrefixes = [commonPrefixes];

  return {
    objects: contents
      .filter((c) => c && c.Key)
      .map((c) => ({ key: c.Key, size: Number(c.Size || 0), uploaded: c.LastModified })),
    prefixes: commonPrefixes.filter((p) => p && p.Prefix).map((p) => p.Prefix),
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function cfApi(env, path, options = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.CF_API_TOKEN}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error("Cloudflare-API-Fehler: " + JSON.stringify(data.errors || data));
  }
  return data.result;
}

function appMatchesHostname(app, hostname) {
  const target = hostname.toLowerCase();
  if (app.domain && app.domain.toLowerCase() === target) {
    return true;
  }
  if (Array.isArray(app.destinations)) {
    return app.destinations.some((d) => ((d && d.uri) || "").toLowerCase() === target);
  }
  return false;
}

async function findAccessPolicy(env) {
  const apps = await cfApi(env, `/accounts/${env.CF_ACCOUNT_ID}/access/apps`);
  const app = apps.find((a) => appMatchesHostname(a, env.PORTAL_HOSTNAME));
  if (!app) throw new Error("Access-Applikation fuer " + env.PORTAL_HOSTNAME + " nicht gefunden.");

  const policies = await cfApi(env, `/accounts/${env.CF_ACCOUNT_ID}/access/apps/${app.id}/policies`);
  const policy = policies.find((p) => p.decision === "allow") || policies[0];
  if (!policy) throw new Error("Keine Policy in der Access-Applikation gefunden.");

  return { appId: app.id, policy };
}

async function addEmailToAccessPolicy(env, email) {
  const { appId, policy } = await findAccessPolicy(env);
  const include = Array.isArray(policy.include) ? policy.include.slice() : [];
  const already = include.some(
    (i) => i.email && i.email.email && i.email.email.toLowerCase() === email.toLowerCase()
  );
  if (!already) include.push({ email: { email } });

  const body = JSON.stringify({
    name: policy.name,
    decision: policy.decision,
    include,
    exclude: policy.exclude || [],
    require: policy.require || [],
  });

  const path = policy.reusable
    ? `/accounts/${env.CF_ACCOUNT_ID}/access/policies/${policy.id}`
    : `/accounts/${env.CF_ACCOUNT_ID}/access/apps/${appId}/policies/${policy.id}`;

  await cfApi(env, path, { method: "PUT", body });
}

function shareIsUsable(share) {
  if (!share || share.revoked) return false;
  if (share.expiresAt && new Date(share.expiresAt).getTime() < Date.now()) return false;
  return true;
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  const units = ["KB", "MB", "GB", "TB"];
  let val = bytes;
  let i = -1;
  do {
    val /= 1024;
    i++;
  } while (val >= 1024 && i < units.length - 1);
  return val.toFixed(1) + " " + units[i];
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Oeffentliche Freigabe-Seite (/share/<id>): liefert public/share.html aus,
    // egal welche ID im Pfad steht -- die Seite selbst laedt die Details per
    // /api/share-info. Muss wie /request-access in der Cloudflare-Access-Policy
    // als Bypass markiert sein, sonst kommen Empfaenger ohne Access-Login nicht
    // durch Access selbst.
    if (url.pathname.startsWith("/share/") && request.method === "GET") {
      // Die "saubere" URL /share (ohne .html) anfordern, nicht /share.html direkt --
      // sonst leitet Cloudflares Asset-Routing mit 307 auf /share um, statt den
      // Seiteninhalt zurueckzugeben (gleiches Verhalten wie bei /request-access).
      return env.ASSETS.fetch(new Request(new URL("/share", request.url), request));
    }

    // Alles ausser /api/* wird als statische Datei aus ./public ausgeliefert
    // (siehe [assets] in wrangler.toml) — inkl. portal.html, Login-Seite etc.
    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    // --- Oeffentliche Endpunkte fuer Freigabe-Links (kein Access-Login) ---
    // Ebenfalls Bypass-Policy in Cloudflare Access noetig (siehe oben).

    if (url.pathname === "/api/share-info" && request.method === "GET") {
      const id = url.searchParams.get("id") || "";
      const raw = id && (await env.SHARES.get("share:" + id));
      const share = raw && JSON.parse(raw);
      if (!share) return json({ error: "Link nicht gefunden." }, 404);
      if (!shareIsUsable(share)) {
        return json({ error: "Dieser Link ist abgelaufen oder wurde zurueckgezogen." }, 410);
      }
      return json({
        label: share.label || "",
        expiresAt: share.expiresAt,
        files: share.files.map((f) => ({ ...f, sizeLabel: formatSize(f.size) })),
      });
    }

    if (url.pathname === "/api/share-download" && request.method === "GET") {
      const id = url.searchParams.get("id") || "";
      const key = url.searchParams.get("file") || "";
      const raw = id && (await env.SHARES.get("share:" + id));
      const share = raw && JSON.parse(raw);
      if (!share) return json({ error: "Link nicht gefunden." }, 404);
      if (!shareIsUsable(share)) {
        return json({ error: "Dieser Link ist abgelaufen oder wurde zurueckgezogen." }, 410);
      }
      if (!share.files.some((f) => f.key === key)) {
        return json({ error: "Diese Datei ist in diesem Link nicht freigegeben." }, 403);
      }
      const client = b2Client(env);
      const objectUrl = bucketUrl(env) + "/" + key.split("/").map(encodeURIComponent).join("/");
      const upstream = await client.fetch(objectUrl);
      if (!upstream.ok) return json({ error: "Datei nicht gefunden." }, 404);

      share.downloadCount = (share.downloadCount || 0) + 1;
      share.lastDownloadAt = new Date().toISOString();
      await env.SHARES.put("share:" + id, JSON.stringify(share));

      const headers = new Headers(upstream.headers);
      const filename = key.split("/").pop();
      headers.set("Content-Disposition", `attachment; filename="${filename}"`);
      return new Response(upstream.body, { headers });
    }

    // Oeffentlicher Endpunkt: Zugriff anfragen (fuer Leute, die noch keinen
    // Cloudflare-Access-Zugang haben). Kein Auth-Check, daher eigenes CORS +
    // Honeypot-Feld ("website") gegen simple Bots.
    if (url.pathname === "/api/request-access") {
      const corsHeaders = {
        "Access-Control-Allow-Origin": env.MAIN_SITE_ORIGIN || "*",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      };

      if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
      }
      if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Methode nicht erlaubt." }), {
          status: 405,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const body = await request.json().catch(() => ({}));
      const reqEmail = (body.email || "").trim().toLowerCase();
      const name = (body.name || "").trim().slice(0, 200);
      const company = (body.company || "").trim().slice(0, 200);
      const message = (body.message || "").trim().slice(0, 1000);
      const honeypot = (body.website || "").trim();

      const respond = (data, status) =>
        new Response(JSON.stringify(data), {
          status,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });

      if (honeypot) {
        // Bot hat das versteckte Feld ausgefuellt -> stillschweigend "erfolgreich" tun.
        return respond({ ok: true }, 200);
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reqEmail)) {
        return respond({ error: "Ungueltige E-Mail-Adresse." }, 400);
      }

      const id = crypto.randomUUID();
      const record = {
        id,
        email: reqEmail,
        name,
        company,
        message,
        submittedAt: new Date().toISOString(),
        status: "pending",
      };
      await env.REQUESTS.put("req:" + id, JSON.stringify(record));
      return respond({ ok: true }, 200);
    }

    // Ab hier: alle Endpunkte verlangen einen eingeloggten Cloudflare-Access-User.
    const email = request.headers.get("Cf-Access-Authenticated-User-Email");
    if (!email) {
      return json({ error: "Nicht eingeloggt." }, 401);
    }
    const admin = isAdminEmail(email);
    const ownFolder = folderFor(email);

    if (url.pathname === "/api/me" && request.method === "GET") {
      return json({ email, isAdmin: admin, folder: ownFolder });
    }

    // --- Admin: offene Zugriffsanfragen verwalten ---

    if (url.pathname === "/api/access-requests" && request.method === "GET") {
      if (!admin) return json({ error: "Keine Berechtigung." }, 403);
      const list = await env.REQUESTS.list({ prefix: "req:" });
      const items = [];
      for (const k of list.keys) {
        const raw = await env.REQUESTS.get(k.name);
        if (raw) items.push(JSON.parse(raw));
      }
      const pending = items
        .filter((r) => r.status === "pending")
        .sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));
      return json({ requests: pending });
    }

    if (url.pathname === "/api/access-requests/approve" && request.method === "POST") {
      if (!admin) return json({ error: "Keine Berechtigung." }, 403);
      const body = await request.json().catch(() => ({}));
      const raw = await env.REQUESTS.get("req:" + body.id);
      if (!raw) return json({ error: "Anfrage nicht gefunden." }, 404);
      const record = JSON.parse(raw);
      await addEmailToAccessPolicy(env, record.email);
      record.status = "approved";
      await env.REQUESTS.put("req:" + record.id, JSON.stringify(record));
      return json({ ok: true });
    }

    if (url.pathname === "/api/access-requests/deny" && request.method === "POST") {
      if (!admin) return json({ error: "Keine Berechtigung." }, 403);
      const body = await request.json().catch(() => ({}));
      const raw = await env.REQUESTS.get("req:" + body.id);
      if (!raw) return json({ error: "Anfrage nicht gefunden." }, 404);
      const record = JSON.parse(raw);
      record.status = "denied";
      await env.REQUESTS.put("req:" + record.id, JSON.stringify(record));
      return json({ ok: true });
    }

    // --- Dateiverwaltung (B2) ---

    if (url.pathname === "/api/folders" && request.method === "GET") {
      if (!admin) return json({ error: "Keine Berechtigung." }, 403);
      const listed = await listObjects(env, "", "/");
      const folders = listed.prefixes.map((p) => p.replace(/\/$/, "")).sort();
      return json({ folders });
    }

    if (url.pathname === "/api/list" && request.method === "GET") {
      let folder = url.searchParams.get("folder") || ownFolder;
      if (!admin) folder = ownFolder;
      const prefix = folder + "/";
      const listed = await listObjects(env, prefix, null);
      const files = listed.objects
        .filter((o) => o.key !== prefix)
        .map((o) => ({
          key: o.key,
          name: o.key.slice(prefix.length),
          size: o.size,
          sizeLabel: formatSize(o.size),
          uploaded: o.uploaded,
        }))
        .sort((a, b) => new Date(b.uploaded) - new Date(a.uploaded));
      return json({ folder, files });
    }

    if (url.pathname === "/api/upload-url" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const filename = (body.filename || "").trim();
      if (!filename) return json({ error: "Kein Dateiname uebergeben." }, 400);
      if (filename.includes("/")) {
        return json({ error: "Dateiname darf kein '/' enthalten." }, 400);
      }
      const folder = admin && body.folder ? folderFor(body.folder) : ownFolder;
      const key = `${folder}/${filename}`;

      const client = b2Client(env);
      const objectUrl = new URL(bucketUrl(env) + "/" + key.split("/").map(encodeURIComponent).join("/"));
      objectUrl.searchParams.set("X-Amz-Expires", "3600");
      const signed = await client.sign(new Request(objectUrl, { method: "PUT" }), {
        aws: { signQuery: true },
      });
      return json({ uploadUrl: signed.url, key, folder });
    }

    if (url.pathname === "/api/download" && request.method === "GET") {
      const key = url.searchParams.get("key") || "";
      if (!admin && !key.startsWith(ownFolder + "/")) {
        return json({ error: "Keine Berechtigung fuer diese Datei." }, 403);
      }
      const client = b2Client(env);
      const objectUrl = bucketUrl(env) + "/" + key.split("/").map(encodeURIComponent).join("/");
      const upstream = await client.fetch(objectUrl);
      if (!upstream.ok) return json({ error: "Datei nicht gefunden." }, 404);
      const headers = new Headers(upstream.headers);
      const filename = key.split("/").pop();
      headers.set("Content-Disposition", `attachment; filename="${filename}"`);
      return new Response(upstream.body, { headers });
    }

    if (url.pathname === "/api/delete" && request.method === "DELETE") {
      const key = url.searchParams.get("key") || "";
      if (!admin && !key.startsWith(ownFolder + "/")) {
        return json({ error: "Keine Berechtigung fuer diese Datei." }, 403);
      }
      const client = b2Client(env);
      const objectUrl = bucketUrl(env) + "/" + key.split("/").map(encodeURIComponent).join("/");
      const upstream = await client.fetch(objectUrl, { method: "DELETE" });
      if (!upstream.ok && upstream.status !== 404) {
        return json({ error: "Loeschen fehlgeschlagen." }, 502);
      }
      return json({ ok: true });
    }

    // --- Admin: Freigabe-Links fuer Personen ohne Access-Zugang ---

    if (url.pathname === "/api/shares" && request.method === "GET") {
      if (!admin) return json({ error: "Keine Berechtigung." }, 403);
      const list = await env.SHARES.list({ prefix: "share:" });
      const items = [];
      for (const k of list.keys) {
        const raw = await env.SHARES.get(k.name);
        if (raw) items.push(JSON.parse(raw));
      }
      items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return json({ shares: items });
    }

    if (url.pathname === "/api/share" && request.method === "POST") {
      if (!admin) return json({ error: "Keine Berechtigung." }, 403);
      const body = await request.json().catch(() => ({}));
      const fileKeys = Array.isArray(body.fileKeys) ? body.fileKeys.filter(Boolean) : [];
      if (fileKeys.length === 0) {
        return json({ error: "Keine Dateien ausgewaehlt." }, 400);
      }
      const label = (body.label || "").trim().slice(0, 200);
      const expiresAt = (body.expiresAt || "").trim();
      if (!expiresAt || Number.isNaN(new Date(expiresAt).getTime())) {
        return json({ error: "Kein gueltiges Ablaufdatum." }, 400);
      }
      if (new Date(expiresAt).getTime() <= Date.now()) {
        return json({ error: "Das Ablaufdatum muss in der Zukunft liegen." }, 400);
      }

      // Dateigroessen fuer die Anzeige auf der Freigabe-Seite nachschlagen.
      const files = [];
      for (const key of fileKeys) {
        const folder = key.split("/")[0] + "/";
        const listed = await listObjects(env, folder, null);
        const found = listed.objects.find((o) => o.key === key);
        if (found) files.push({ key: found.key, name: found.key.slice(folder.length), size: found.size });
      }
      if (files.length === 0) {
        return json({ error: "Keine der ausgewaehlten Dateien wurde gefunden." }, 404);
      }

      const id = crypto.randomUUID();
      const share = {
        id,
        createdBy: email,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(expiresAt).toISOString(),
        label,
        files,
        revoked: false,
        downloadCount: 0,
      };
      await env.SHARES.put("share:" + id, JSON.stringify(share));
      const shareUrl = new URL("/share/" + id, url).toString();
      return json({ ok: true, id, url: shareUrl });
    }

    if (url.pathname === "/api/share-revoke" && request.method === "POST") {
      if (!admin) return json({ error: "Keine Berechtigung." }, 403);
      const body = await request.json().catch(() => ({}));
      const raw = body.id && (await env.SHARES.get("share:" + body.id));
      if (!raw) return json({ error: "Link nicht gefunden." }, 404);
      const share = JSON.parse(raw);
      share.revoked = true;
      await env.SHARES.put("share:" + share.id, JSON.stringify(share));
      return json({ ok: true });
    }

    return json({ error: "Unbekannter Endpunkt." }, 404);
  },
};
