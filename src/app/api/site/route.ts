import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * READ-ONLY bridge to the website's Supabase (another account).
 * - Only GET requests are ever sent to the website database: nothing is written, updated or deleted there.
 * - The website secret key lives only on the server (Vercel env var SITE_SUPABASE_SECRET_KEY), never in the browser.
 * - Only authenticated CRM team members can call this route.
 */
export const dynamic = "force-dynamic";

const SITE_URL = process.env.SITE_SUPABASE_URL ?? "https://ncolrjuftmjygnwvvpna.supabase.co";
// accepts either variable name set on Vercel
const SITE_KEY = process.env.SITE_SUPABASE_SECRET_KEY || process.env.crmlecture || process.env.CRMLECTURE;

const RESOURCES: Record<string, { table: string; select: string; order?: string; limit?: number }> = {
  leads: { table: "leads", select: "*", order: "created_at.desc", limit: 300 },
  contact_messages: { table: "contact_messages", select: "*", order: "created_at.desc", limit: 300 },
  clients: { table: "clients", select: "*", order: "created_at.desc", limit: 300 },
  categories: { table: "offer_categories", select: "code,slug,name" },
  services: { table: "dynamic_services", select: "code,name,category_slug,price_min,price_max,delay" },
  offers: { table: "offers", select: "code,name,category_code,category_slug,delay_label" },
};

async function isCrmMember(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const crm = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: u } = await crm.auth.getUser(token);
  if (!u.user) return false;
  const { data } = await crm.from("crm_members").select("user_id").eq("user_id", u.user.id).maybeSingle();
  return !!data;
}

export async function GET(req: NextRequest) {
  if (!(await isCrmMember(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!SITE_KEY) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const name = req.nextUrl.searchParams.get("resource") ?? "leads";
  const r = RESOURCES[name];
  if (!r) return NextResponse.json({ error: "unknown resource" }, { status: 400 });

  const url = new URL(`/rest/v1/${r.table}`, SITE_URL);
  url.searchParams.set("select", r.select);
  if (r.order) url.searchParams.set("order", r.order);
  if (r.limit) url.searchParams.set("limit", String(r.limit));

  const res = await fetch(url, {
    method: "GET", // read-only, always
    headers: { apikey: SITE_KEY, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return NextResponse.json({ error: `site ${res.status}`, detail: (await res.text()).slice(0, 300) }, { status: 502 });
  return NextResponse.json(await res.json(), { headers: { "Cache-Control": "no-store" } });
}
