// White G — réception publique des formulaires du site dzwhiteg.com
// Actions : prequal (formulaire de contact), fiche_get, fiche_save, fiche_submit.
// Sécurité : aucune clé côté navigateur ; toutes les réponses sont filtrées (liste blanche
// de champs et de valeurs), tronquées, puis transmises aux fonctions SQL wg_* (clé service).
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const ALLOWED_ORIGINS = ["https://www.dzwhiteg.com", "https://dzwhiteg.com", "http://localhost:3000", "http://localhost:3001"];
function cors(origin: string | null) {
  const ok = !!origin && (ALLOWED_ORIGINS.includes(origin) || /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin));
  return {
    "Access-Control-Allow-Origin": ok ? origin! : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/* ---------- Valeurs autorisées (identiques à src/lib/qualification/schema.ts du site) ---------- */
const E = {
  project_type: ["catalogue", "sur_mesure", "reformulation", "pack_lancement", "lot_pilote", "ne_sait_pas"],
  maturity: ["idee", "etude", "pret", "marche"],
  category: ["complement", "cosmetique", "agro", "mixte"],
  format: ["gummies", "gelule", "comprime", "stick_poudre", "stick_liquide", "sirop", "ampoule", "sachet_effervescent", "poudre_pot", "spray_buccal", "creme", "serum", "huile_lotion", "roll_on", "savon", "boisson", "autre", "ne_sait_pas"],
  qty_band: ["lt1k", "1k_5k", "5k_20k", "20k_100k", "gt100k", "nsp"],
  recurrence: ["one_shot", "a_la_demande", "trimestrielle", "mensuelle", "nsp"],
  budget: ["lt300k", "300k_1m", "1m_5m", "5m_20m", "gt20m", "a_discuter"],
  launch: ["lt3m", "3_6m", "6_12m", "gt12m", "aucune"],
  entity: ["sarl_eurl_spa", "startup", "auto_entrepreneur", "particulier", "autre"],
  decision_maker: ["oui", "non"],
  trilemma: ["prix", "delai", "qualite"],
  rd_ok: ["oui", "a_discuter", "non"],
  source: ["recommandation", "reseaux_sociaux", "site_web", "moteur_recherche", "salon", "presse", "whatsapp", "autre"],
  e_sex: ["homme", "femme", "les_deux"],
  e_power: ["entree", "milieu", "premium", "luxe"],
  formula_level: ["complete", "actifs", "aucune"],
  taste_profile: ["sucre", "acidule", "amer", "neutre"],
  aroma_type: ["naturel", "identique_nature", "synthetique"],
  has_references: ["oui", "liens", "non", "nsp"],
  copy_stance: ["distinct", "si_legal", "copie_exacte"],
  trademark: ["deposee", "en_cours", "non_deposee", "aucune"],
  design_mode: ["fourni", "maquette", "white_g", "cocreation"],
  regulatory: ["en_cours", "besoin_aide", "homologue", "non_soumis"],
  flexibility: ["oui", "non", "selon"],
  funding: ["fonds_propres", "investisseur", "subvention", "credit", "autre"],
};
const M = {
  sub_complement: ["vitamine", "plante", "acide_amine", "probiotique", "omega", "energie", "sommeil", "digestion", "immunite", "articulation", "peau", "minceur", "vitalite", "pediatrique", "senior", "grossesse"],
  sub_cosmetique: ["visage", "corps", "capillaire", "solaire", "hygiene", "parfum", "bebe", "homme", "anti_age", "acne", "naturel", "makeup"],
  sub_agro: ["boisson", "snack", "miel", "poudre", "confiserie", "epicerie", "infantile", "halal"],
  channels: ["pharmacie", "parapharmacie", "gms", "ecommerce", "salle_sport", "spa", "clinique", "export", "vente_directe", "pharmacie_hosp", "boutique", "autre"],
  exclusions: ["gelatine_porcine", "alcool", "ogm", "gluten", "lactose", "sucre", "colorants", "conservateurs", "nano", "allergenes", "parfum_synthese", "animal"],
  primary_pack: ["pilulier", "blister", "sachet", "flacon_verre", "flacon_pet", "tube_alu", "tube_plastique", "pot", "stick", "ampoule", "airless", "spray"],
  label_langs: ["arabe", "francais", "anglais", "autre"],
  label_mentions: ["dluo", "lot", "ean", "qr"],
  eco: ["recyclable", "verre", "plastique_recycle", "carton_fsc", "sans_suremballage", "refill", "bioplastique", "indifferent"],
  markets: ["algerie", "tunisie", "maroc", "libye", "afrique", "golfe", "europe", "amerique"],
  certifications: ["halal", "bio", "iso22000", "gmp", "vegan", "sans_gluten", "cruelty_free", "casher"],
  attachments: ["formule", "references", "logo", "maquette", "reglementaire", "etude", "devis_concurrents"],
};
const ORIGINS = ["synthese", "naturel", "bio", "halal", "vegan", "indifferent"];
const AXES = ["formule", "format", "sensoriel", "packaging", "promesse", "prix"];

const STR = ["company_name", "rc_number", "nif", "wilaya", "website", "role_title", "whatsapp", "decision_maker_who", "sub_other", "e_age", "e_lifestyle", "e_target",
  "feel_words", "avoid_words", "taste", "color", "texture", "perfume", "format_other", "dosage_per_day", "unit_size", "shelf_life", "brand_name", "product_name", "regulatory_number"];
const TEXT = ["address", "current_producer", "c_what", "c_who", "c_problem", "c_pitch", "promise", "exclusions_other", "pack_notes", "copy_why", "visual_universe",
  "markets_detail", "claims", "attachments_detail", "restatement"];
const INT = ["cure_days", "units_per_box", "first_batch_qty", "annual_qty", "qty_3y"];
const DATE = ["delivery_date", "launch_date"];
const BOOL = ["has_logo", "has_charter", "nda_wanted", "confirm_accurate", "confirm_mandate", "confirm_callback"];

const s = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\u0000/g, "").trim().slice(0, max) : "");
const enumOk = (k: keyof typeof E, v: unknown) => (typeof v === "string" && E[k].includes(v) ? v : undefined);

function cleanFiche(raw: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of STR) { const v = s(raw[k], 200); if (v) out[k] = v; }
  for (const k of TEXT) { const v = s(raw[k], 3000); if (v) out[k] = v; }
  for (const k of INT) { const v = s(String(raw[k] ?? ""), 12).replace(/[\s. ]/g, ""); if (/^\d{1,9}$/.test(v)) out[k] = v; }
  for (const k of DATE) { const v = s(raw[k], 10); if (/^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v))) out[k] = v; }
  for (const k of BOOL) if (raw[k] === true) out[k] = true;
  for (const k of Object.keys(E) as (keyof typeof E)[]) { const v = enumOk(k, raw[k]); if (v) out[k] = v; }
  for (const [k, allowed] of Object.entries(M)) {
    const v = Array.isArray(raw[k]) ? [...new Set((raw[k] as unknown[]).filter((x) => typeof x === "string" && allowed.includes(x)))] : [];
    if (v.length) out[k] = v;
  }
  if (Array.isArray(raw.actives)) {
    const a = (raw.actives as Record<string, unknown>[]).slice(0, 20).map((x) => ({
      name: s(x?.name, 120), dose: s(x?.dose, 80), origin: ORIGINS.includes(String(x?.origin)) ? String(x?.origin) : "", form: s(x?.form, 80),
    })).filter((x) => x.name);
    if (a.length) out.actives = a;
  }
  if (Array.isArray(raw.references)) {
    const r = (raw.references as Record<string, unknown>[]).slice(0, 3).map((x) => {
      const axesIn = (x?.axes ?? {}) as Record<string, unknown>;
      const axes: Record<string, number> = {};
      for (const a of AXES) { const n = Number(axesIn[a]); if (Number.isInteger(n) && n >= 0 && n <= 10) axes[a] = n; }
      return { brand: s(x?.brand, 160), country: s(x?.country, 120), link: s(x?.link, 300), price: s(x?.price, 60), axes, better: s(x?.better, 1500) };
    }).filter((x) => x.brand || x.link);
    if (r.length) out.references = r;
  }
  return out;
}

type Fail = { error: string; field?: string };
function cleanPrequal(raw: Record<string, unknown>): { contact: Record<string, string>; answers: Record<string, string> } | Fail {
  const c = (raw.contact ?? {}) as Record<string, unknown>;
  const a = (raw.answers ?? {}) as Record<string, unknown>;
  const contact = {
    first_name: s(c.first_name, 80), last_name: s(c.last_name, 80), company_name: s(c.company_name, 160), role_title: s(c.role_title, 120),
    email: s(c.email, 200).toLowerCase(), phone: s(c.phone, 30), whatsapp: s(c.whatsapp, 30), wilaya: s(c.wilaya, 60),
  };
  if (!contact.first_name) return { error: "invalid", field: "first_name" };
  if (!contact.last_name) return { error: "invalid", field: "last_name" };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(contact.email)) return { error: "invalid", field: "email" };
  if (contact.phone.replace(/\D/g, "").length < 9) return { error: "invalid", field: "phone" };

  const answers: Record<string, string> = {};
  const required: (keyof typeof E)[] = ["project_type", "maturity", "category", "format", "qty_band", "recurrence", "budget", "launch", "entity", "decision_maker", "trilemma"];
  for (const k of required) {
    const v = enumOk(k, a[k]);
    if (!v) return { error: "invalid", field: k };
    answers[k] = v;
  }
  const custom = ["sur_mesure", "reformulation", "pack_lancement"].includes(answers.project_type);
  const rd = enumOk("rd_ok", a.rd_ok);
  if (custom && !rd) return { error: "invalid", field: "rd_ok" };
  if (rd) answers.rd_ok = rd;
  const src = enumOk("source", a.source);
  if (src) answers.source = src;
  const description = s(a.description, 2000);
  if (description.length < 20) return { error: "invalid", field: "description" };
  answers.description = description;
  if (answers.entity !== "particulier" && !contact.company_name) return { error: "invalid", field: "company_name" };
  if (a.consent !== true) return { error: "invalid", field: "consent" };
  return { contact, answers };
}

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function progressOf(f: Record<string, unknown>) {
  const keys = ["company_name", "rc_number", "c_what", "c_who", "c_problem", "c_pitch", "category", "promise", "channels", "formula_level", "exclusions",
    "format", "dosage_per_day", "units_per_box", "primary_pack", "has_references", "copy_stance", "trademark", "design_mode", "label_langs",
    "markets", "regulatory", "claims", "first_batch_qty", "recurrence", "annual_qty", "launch_date", "budget", "funding", "trilemma", "restatement"];
  return Math.round((keys.filter((k) => f[k] !== undefined).length / keys.length) * 100);
}

Deno.serve(async (req) => {
  const h = cors(req.headers.get("origin"));
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...h, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > 200_000) return json({ error: "too_large" }, 413);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }

  try {
    const action = String(body.action ?? "");
    if (action === "prequal") {
      if (s(body.website_url, 10)) return json({ ok: true, reference: "WG-0000", next: "review" }); // pot de miel anti-robot
      const clean = cleanPrequal(body);
      if ("error" in clean) return json(clean, 422);
      const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "inconnu";
      const ipHash = await sha256("wg-intake::" + ip);
      const lang = ["fr", "ar"].includes(String(body.lang)) ? String(body.lang) : "fr";
      const { data, error } = await db.rpc("wg_intake_prequal", { p: { lang, ...clean }, p_ip_hash: ipHash, p_ua: s(req.headers.get("user-agent"), 300) });
      if (error) throw error;
      return json(data, (data as Fail)?.error ? 429 : 200);
    }

    const token = s(body.token, 64);
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return json({ error: "not_found" }, 404);

    if (action === "fiche_get") {
      const { data, error } = await db.rpc("wg_fiche_get", { p_token: token });
      if (error) throw error;
      return json(data, (data as Fail)?.error ? 404 : 200);
    }

    if (action === "fiche_save" || action === "fiche_submit") {
      const answers = cleanFiche((body.answers ?? {}) as Record<string, unknown>);
      const submit = action === "fiche_submit";
      if (submit) {
        const missing = ["c_what", "format", "first_batch_qty", "budget", "trilemma"].filter((k) => answers[k] === undefined);
        if (missing.length) return json({ error: "missing", fields: missing }, 422);
      }
      const { data, error } = await db.rpc("wg_fiche_save", { p_token: token, p_answers: answers, p_progress: progressOf(answers), p_submit: submit });
      if (error) throw error;
      const err = (data as Fail)?.error;
      return json(data, err ? (err === "not_found" ? 404 : 409) : 200);
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    console.error("wg-intake", (e as Error).message);
    return json({ error: "server" }, 500);
  }
});
