"use client";

import { supabaseBrowser } from "./supabase/client";
import type { OfferCategory } from "./constants";

/* ---------- Website records (read-only) ---------- */
export type SiteLead = {
  id: string; reference: string; status: string;
  first_name: string; last_name: string; company_name: string; role_title: string;
  email: string; phone: string | null; category_slug: string | null; service_codes: string[];
  sector: string; company_size: string; budget_range: string; deadline_need: string; message: string;
  source: string | null; created_at: string;
};
export type SiteMessage = { id: string; name: string; email: string; subject: string | null; message: string; status: string | null; created_at: string };
export type SiteClient = { id: string; full_name: string; company_name: string; email: string | null; phone: string | null; missions_count: number; created_at: string };
export type Catalog = {
  categories: { code: string; slug: string; name: string }[];
  services: { code: string; name: string; category_slug: string | null; price_min: number | null; price_max: number | null; delay: string | null }[];
  offers: { code: string; name: string; category_code: string; category_slug: string | null; delay_label: string | null }[];
};
export type SourceTable = "leads" | "contact_messages" | "clients";

export class BridgeError extends Error {
  constructor(public code: "not_configured" | "unauthorized" | "site_error", message: string) { super(message); }
}

export async function fetchSite<T>(resource: SourceTable | "categories" | "services" | "offers"): Promise<T[]> {
  const { data } = await supabaseBrowser().auth.getSession();
  const res = await fetch(`/api/site?resource=${resource}`, { headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` }, cache: "no-store" });
  if (res.status === 503) throw new BridgeError("not_configured", "Clé de la base du site non configurée");
  if (res.status === 401) throw new BridgeError("unauthorized", "Accès refusé");
  if (!res.ok) throw new BridgeError("site_error", (await res.json().catch(() => ({}))).detail ?? `Erreur ${res.status}`);
  return res.json();
}

export async function fetchCatalog(): Promise<Catalog> {
  const [categories, services, offers] = await Promise.all([
    fetchSite<Catalog["categories"][number]>("categories").catch(() => []),
    fetchSite<Catalog["services"][number]>("services").catch(() => []),
    fetchSite<Catalog["offers"][number]>("offers").catch(() => []),
  ]);
  return { categories, services, offers };
}

/* ---------- Conversion helpers (suggestions only — the human validates) ---------- */
export function guessSector(s?: string | null) {
  const t = (s ?? "").toLowerCase();
  if (/nutra|compl[ée]ment|vitamin|gumm/.test(t)) return "nutraceutique";
  if (/cosm|beaut|soin/.test(t)) return "cosmetique";
  if (/agro|aliment|food|boisson/.test(t)) return "agroalimentaire";
  if (/pharma|m[ée]dic|sant/.test(t)) return "pharmaceutique";
  if (/distrib|commerce|import|export|grossiste/.test(t)) return "distribution";
  if (/public|institution|minist|[ée]tat|administration/.test(t)) return "institution";
  return "autre";
}

export function serviceName(code: string, cat: Catalog) {
  return cat.services.find((s) => s.code === code)?.name ?? cat.offers.find((o) => o.code === code)?.name ?? code;
}

export function guessCategory(lead: Pick<SiteLead, "category_slug" | "service_codes">, cat: Catalog): OfferCategory {
  const bySlug = (slug?: string | null) => cat.categories.find((c) => c.slug === slug)?.code;
  const fromLead = bySlug(lead.category_slug);
  if (fromLead) return fromLead as OfferCategory;
  for (const code of lead.service_codes ?? []) {
    const svc = cat.services.find((s) => s.code === code);
    const c = bySlug(svc?.category_slug) ?? cat.offers.find((o) => o.code === code)?.category_code;
    if (c) return c as OfferCategory;
    if (/^[A-G]/i.test(code)) return code[0].toUpperCase() as OfferCategory;
  }
  return "B";
}

/** "500 000 – 1 000 000 DA", "1M-2M", "< 300k" … → lower bound in DA (or 0) */
export function parseBudget(s?: string | null) {
  if (!s) return 0;
  const m = s.toLowerCase().replace(/\s| | /g, "").match(/(\d+(?:[.,]\d+)?)(k|m|million)?/);
  if (!m) return 0;
  let n = parseFloat(m[1].replace(",", "."));
  if (m[2] === "k") n *= 1_000;
  if (m[2] === "m" || m[2] === "million") n *= 1_000_000;
  return Math.round(n);
}

export function guessFormat(text: string) {
  const t = text.toLowerCase();
  for (const [re, f] of [[/stick/, "Sticks"], [/g[ée]lule|capsul/, "Gélules"], [/gumm/, "Gummies"], [/liquid|sirop|ampoule/, "Liquides"], [/poudre/, "Poudres"], [/comprim/, "Comprimés"], [/cosm|cr[èe]me|s[ée]rum/, "Cosmétique"]] as const) {
    if (re.test(t)) return f;
  }
  return "";
}
