// Gemeinsame Grundlagen der Dokumentenlenkung: Rollen, Rechte, Kunden (Tenants) und Zugriff.
//
// Modell: Jeder Kunde ("Tenant") hat Mitglieder mit einer Rolle. Wer sich anmeldet, sieht nur die
// Kunden, bei denen er Mitglied ist. Alta-Admins (Plattform-Admins) sehen und verwalten alle Kunden.
// Das Login selbst laeuft ueber Cloudflare Access (E-Mail-Code); ein neu eingeladenes Mitglied wird
// dafuer in die Access-Policy eingetragen (siehe members in dms.js).

export const ROLES = {
  admin: { label: "Administrator", short: "Admin", text: "Verwaltet Benutzer, Kategorien und Einstellungen. Darf alles." },
  freigeber: { label: "Freigeber", short: "Freigabe", text: "Darf Dokumente erstellen, prüfen und freigeben sowie das Handbuch veröffentlichen." },
  pruefer: { label: "Prüfer", short: "Prüfung", text: "Darf Dokumente erstellen und prüfen. Freigeben nicht." },
  ersteller: { label: "Ersteller", short: "Erstellen", text: "Darf Dokumente anlegen, bearbeiten und zur Prüfung einreichen." },
  leser: { label: "Leser", short: "Lesen", text: "Darf freigegebene Dokumente lesen und «gelesen» bestätigen." },
};
export const ROLE_ORDER = ["admin", "freigeber", "pruefer", "ersteller", "leser"];

// Wer darf was.
export const CAN = {
  write: ["admin", "freigeber", "pruefer", "ersteller"],
  review: ["admin", "freigeber", "pruefer"],
  approve: ["admin", "freigeber"],
  publish: ["admin", "freigeber"],
  manage: ["admin"],
};

export function can(role, what) {
  return !!role && (CAN[what] || []).includes(role);
}

export function normEmail(v) {
  const s = String(v || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s.slice(0, 200) : "";
}

export function cleanName(v, email) {
  const s = String(v || "").trim().slice(0, 80);
  if (s) return s;
  const local = String(email || "").split("@")[0];
  return local
    .split(/[._-]/)
    .filter(Boolean)
    .map((p) => (p.length === 1 ? p.toUpperCase() + "." : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}

// ---------- Kunden ----------

export async function loadTenant(env, id) {
  const raw = id && (await env.DMS.get("tenant:" + id));
  if (!raw) return null;
  const t = JSON.parse(raw);
  t.members = t.members || [];
  t.defaultReviewMonths = t.defaultReviewMonths == null ? 12 : t.defaultReviewMonths;
  return t;
}

export async function saveTenant(env, tenant) {
  await env.DMS.put("tenant:" + tenant.id, JSON.stringify(tenant));
}

export async function listTenants(env) {
  const list = await env.DMS.list({ prefix: "tenant:" });
  const items = [];
  for (const k of list.keys) {
    const raw = await env.DMS.get(k.name);
    if (!raw) continue;
    const t = JSON.parse(raw);
    t.members = t.members || [];
    t.defaultReviewMonths = t.defaultReviewMonths == null ? 12 : t.defaultReviewMonths;
    items.push(t);
  }
  items.sort((a, b) => a.name.localeCompare(b.name, "de"));
  return items;
}

export function memberRole(tenant, email) {
  const m = (tenant.members || []).find((x) => x.email === String(email).toLowerCase());
  return m ? m.role : null;
}

// Kunden, auf die diese Person zugreifen darf, mit ihrer Rolle.
export async function tenantsFor(env, admin, email) {
  const all = await listTenants(env);
  if (admin) return all.map((t) => ({ tenant: t, role: "admin", platform: true }));
  return all
    .map((t) => ({ tenant: t, role: memberRole(t, email), platform: false }))
    .filter((x) => x.role);
}

// Liefert {tenant, role, platform} fuer die gewuenschte Kunden-ID oder null.
export async function resolveAccess(env, admin, email, requestedTenantId) {
  if (admin) {
    const t = requestedTenantId ? await loadTenant(env, requestedTenantId) : (await listTenants(env))[0];
    return t ? { tenant: t, role: "admin", platform: true } : null;
  }
  const mine = await tenantsFor(env, false, email);
  if (!mine.length) return null;
  if (requestedTenantId) return mine.find((x) => x.tenant.id === requestedTenantId) || null;
  return mine[0];
}

export function fallbackPrefix(category) {
  const letters = String(category || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();
  return (letters.slice(0, 3) || "DOK").padEnd(3, "X");
}

export function publicTenant(t) {
  return {
    id: t.id,
    name: t.name,
    categories: t.categories,
    // Wirksame Kuerzel: gespeicherte, sonst aus dem Namen abgeleitete (so wie die Nummern vergeben werden).
    categoryPrefixes: Object.fromEntries((t.categories || []).map((n) => [n, (t.categoryPrefixes || {})[n] || fallbackPrefix(n)])),
    vierAugen: !!t.vierAugen,
    defaultReviewMonths: t.defaultReviewMonths,
    members: (t.members || []).map((m) => ({ email: m.email, name: m.name, role: m.role })),
    groups: (t.groups || []).map((g) => ({ id: g.id, name: g.name, members: g.members || [] })),
  };
}
