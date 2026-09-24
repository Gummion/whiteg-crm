// White G CRM — watches the website database (read-only, through the CRM's Vercel bridge)
// and raises an urgent notification for each new quote request / contact message.
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const BRIDGE = Deno.env.get("CRM_BRIDGE_URL") ?? "https://whiteg-crm.vercel.app/api/site";
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

async function readSite(resource: "leads" | "contact_messages") {
  const nonce = crypto.randomUUID() + crypto.randomUUID();
  const { error } = await db.from("bridge_nonces").insert({ nonce });
  if (error) throw new Error("nonce: " + error.message);
  const res = await fetch(`${BRIDGE}?resource=${resource}`, { headers: { "x-bridge-nonce": nonce }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`${resource}: HTTP ${res.status}`);
  return (await res.json()) as Record<string, unknown>[];
}

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");

Deno.serve(async () => {
  try {
    // simple rate limit: one real run per 60 s
    const { data: last } = await db.from("site_seen").select("seen_at").eq("source_table", "_run").maybeSingle();
    if (last && Date.now() - new Date(last.seen_at).getTime() < 55_000) return json({ skipped: "rate_limited" });
    await db.from("site_seen").upsert({ source_table: "_run", external_id: "_run", seen_at: new Date().toISOString() });

    const out: Record<string, number> = {};
    let firstRun = false;

    for (const table of ["leads", "contact_messages"] as const) {
      const { count: known } = await db.from("site_seen").select("external_id", { count: "exact", head: true }).eq("source_table", table);
      const tableFirstRun = !known;
      firstRun ||= tableFirstRun;
      const rows = await readSite(table);
      const ids = rows.map((r) => String(r.id));
      const { data: seen } = await db.from("site_seen").select("external_id").eq("source_table", table).in("external_id", ids.length ? ids : ["-"]);
      const seenSet = new Set((seen ?? []).map((x: { external_id: string }) => x.external_id));
      const fresh = rows.filter((r) => !seenSet.has(String(r.id)));
      if (fresh.length) await db.from("site_seen").upsert(fresh.map((r) => ({ source_table: table, external_id: String(r.id) })), { ignoreDuplicates: true });
      out[table] = fresh.length;
      if (tableFirstRun) continue; // first run: remember existing records without alerting

      const recent = fresh.filter((r) => Date.now() - new Date(String(r.created_at)).getTime() < 3 * 86400_000).slice(0, 10);
      for (const r of recent) {
        if (table === "leads") {
          const who = [s(r.first_name), s(r.last_name)].filter(Boolean).join(" ");
          const company = s(r.company_name) || who || "Nouveau prospect";
          const extra = [who && who !== company ? who : "", s(r.budget_range) && "Budget " + s(r.budget_range), s(r.deadline_need) && "Délai " + s(r.deadline_need)].filter(Boolean).join(" · ");
          await db.rpc("notify_members", { p_kind: "lead", p_title: "🔥 Demande de devis : " + company, p_body: extra || s(r.message).slice(0, 120), p_link: "/inbox" });
        } else {
          await db.rpc("notify_members", { p_kind: "lead", p_title: "✉️ Message du site : " + (s(r.name) || s(r.email)), p_body: (s(r.subject) ? s(r.subject) + " — " : "") + s(r.message).slice(0, 110), p_link: "/inbox?tab=contact_messages" });
        }
      }
    }
    return json({ ok: true, firstRun, fresh: out });
  } catch (e) {
    console.error("site-watch", (e as Error).message);
    return json({ error: (e as Error).message }, 500);
  }
});
