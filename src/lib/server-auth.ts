import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

const CRM_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const CRM_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Verifies the bearer token belongs to a CRM team member. Returns a client acting AS that user (RLS applies). */
export async function crmMember(req: Request): Promise<{ user: User; sb: SupabaseClient } | null> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const sb = createClient(CRM_URL, CRM_ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: u } = await sb.auth.getUser(token);
  if (!u.user) return null;
  const { data } = await sb.from("crm_members").select("user_id").eq("user_id", u.user.id).maybeSingle();
  return data ? { user: u.user, sb } : null;
}

/** One-time nonce issued by the CRM's own background watcher (Supabase edge function). */
export async function validBridgeNonce(req: Request) {
  const nonce = req.headers.get("x-bridge-nonce");
  if (!nonce || nonce.length < 40 || nonce.length > 100) return false;
  const sb = createClient(CRM_URL, CRM_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data } = await sb.rpc("consume_bridge_nonce", { p_nonce: nonce });
  return data === true;
}
