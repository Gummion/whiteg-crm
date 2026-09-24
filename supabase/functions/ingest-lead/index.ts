// Receives leads from another Supabase project (e.g. dzwhiteg.com quote form) and pushes them into the CRM.
// Auth: header `x-webhook-secret` must match the secret stored in the CRM database (private.integration_settings).
// Accepts either a Supabase Database Webhook payload ({ type, table, record }) or a plain JSON object.
// Déjà déployée sur le projet whiteg-crm (verify_jwt = false, authentification par secret).
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// Flexible field mapping: first non-empty key wins
const pick = (r: Record<string, unknown>, ...keys: string[]) => {
  for (const k of keys) {
    const v = r[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return undefined;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const secret = req.headers.get("x-webhook-secret") ?? "";
  const { data: ok } = await sb.rpc("check_webhook_secret", { s: secret });
  if (!ok) return json({ error: "unauthorized" }, 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
  if (body.type && body.type !== "INSERT") return json({ skipped: body.type });
  const r = (body.record ?? body) as Record<string, unknown>;

  const cat = pick(r, "category", "categorie", "offer", "offre")?.toUpperCase().charAt(0);
  const payload = {
    external_source: pick(r, "external_source") ?? (body.table ? `dzwhiteg:${body.table}` : "dzwhiteg"),
    external_id: pick(r, "id", "external_id", "uuid"),
    company_name: pick(r, "company_name", "company", "entreprise", "societe", "raison_sociale"),
    full_name: pick(r, "full_name", "name", "nom", "nom_complet", "contact_name"),
    phone: pick(r, "phone", "telephone", "tel", "whatsapp", "mobile"),
    email: pick(r, "email", "mail"),
    wilaya: pick(r, "wilaya", "region"),
    city: pick(r, "city", "ville"),
    sector: pick(r, "sector", "secteur")?.toLowerCase(),
    category: cat && "ABCDEFG".includes(cat) ? cat : undefined,
    product_format: pick(r, "product_format", "format"),
    request_title: pick(r, "request_title", "title", "titre", "subject", "objet", "service", "offer_name") ?? "Demande de devis (site web)",
    budget: pick(r, "budget", "amount", "montant"),
    message: pick(r, "message", "description", "details", "brief", "notes"),
  };
  const sectors = ["nutraceutique", "cosmetique", "agroalimentaire", "pharmaceutique", "distribution", "institution", "autre"];
  if (payload.sector && !sectors.includes(payload.sector)) payload.sector = undefined;
  if (payload.budget && isNaN(Number(payload.budget))) payload.budget = undefined;

  const { data, error } = await sb.rpc("ingest_external_lead", { p: payload });
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, client_id: data });
});
