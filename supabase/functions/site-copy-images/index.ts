// One-off : copie les photos publiques des offres de l'ancienne base du site
// (projet ncolrjuftmjygnwvvpna, bucket public offer-images) vers le bucket site-offer-images de whiteg-crm.
// Sécurité : n'accepte que des adresses de l'ancien bucket public, et exige un jeton à usage unique
// déposé au préalable dans la table bridge_nonces (moins de 10 minutes).
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const SRC = "https://ncolrjuftmjygnwvvpna.supabase.co/storage/v1/object/public/offer-images/";
const BUCKET = "site-offer-images";
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let body: { nonce?: string; items?: { src: string; path: string }[] };
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const nonce = String(body.nonce ?? "");
  if (nonce.length < 40) return json({ error: "unauthorized" }, 401);
  const { data: row } = await db.from("bridge_nonces").select("nonce,created_at").eq("nonce", nonce).maybeSingle();
  if (!row || Date.now() - new Date(row.created_at).getTime() > 10 * 60_000) return json({ error: "unauthorized" }, 401);
  await db.from("bridge_nonces").delete().eq("nonce", nonce);

  const items = (body.items ?? []).slice(0, 100);
  const out: { path: string; ok: boolean; bytes?: number; error?: string }[] = [];
  for (const it of items) {
    const path = String(it.path ?? "");
    if (!String(it.src).startsWith(SRC) || it.src !== SRC + path || path.includes("..") || !/^[\w./-]+$/.test(path)) {
      out.push({ path, ok: false, error: "refused" }); continue;
    }
    try {
      const res = await fetch(it.src, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) { out.push({ path, ok: false, error: `source ${res.status}` }); continue; }
      const type = res.headers.get("content-type") ?? "image/png";
      const buf = new Uint8Array(await res.arrayBuffer());
      const { error } = await db.storage.from(BUCKET).upload(path, buf, { contentType: type, upsert: true, cacheControl: "31536000" });
      out.push(error ? { path, ok: false, error: error.message } : { path, ok: true, bytes: buf.length });
    } catch (e) {
      out.push({ path, ok: false, error: (e as Error).message });
    }
  }
  return json({ copied: out.filter((x) => x.ok).length, total: items.length, results: out });
});
