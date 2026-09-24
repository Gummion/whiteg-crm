// White G CRM — smart Web Push sender (no external dependency, RFC 8291 + RFC 8292).
// Called by a database trigger (pg_net) for every new notification, and by the app for tests.
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const CONTACT = "mailto:contact@dzwhiteg.com";
const db = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

/* ---------------- base64url / bytes ---------------- */
const enc = new TextEncoder();
function b64u(bytes: Uint8Array) {
  let s = ""; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64u(s: string) {
  const p = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(p); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function concat(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
async function hmac(key: Uint8Array, data: Uint8Array) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

/* ---------------- VAPID keys (generated once, stored server-side only) ---------------- */
type Keys = { publicKey: string; privateKey: CryptoKey };
let cached: Keys | null = null;
async function vapid(): Promise<Keys> {
  if (cached) return cached;
  let { data } = await db.from("push_keys").select("public_key, private_jwk").eq("id", 1).maybeSingle();
  if (!data) {
    const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
    const pub = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
    const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
    await db.from("push_keys").upsert({ id: 1, public_key: b64u(pub), private_jwk: jwk }, { onConflict: "id", ignoreDuplicates: true });
    ({ data } = await db.from("push_keys").select("public_key, private_jwk").eq("id", 1).single());
  }
  const privateKey = await crypto.subtle.importKey("jwk", data!.private_jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  cached = { publicKey: data!.public_key, privateKey };
  return cached;
}
async function vapidHeader(endpoint: string) {
  const k = await vapid();
  const aud = new URL(endpoint).origin;
  const head = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: CONTACT })));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, k.privateKey, enc.encode(`${head}.${body}`)));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${k.publicKey}`;
}

/* ---------------- RFC 8291 aes128gcm payload encryption ---------------- */
async function encrypt(payload: Uint8Array, p256dh: string, authSecret: string) {
  const uaPublic = unb64u(p256dh);
  const auth = unb64u(authSecret);
  const as = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, as.privateKey, 256));
  const prkKey = await hmac(auth, shared);
  const ikm = await hmac(prkKey, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic, new Uint8Array([1])));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(payload, new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]); // 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

type Sub = { id: string; endpoint: string; p256dh: string; auth: string; fail_count: number };
async function sendOne(sub: Sub, message: unknown, opts: { urgency: string; ttl: number; topic?: string }) {
  const body = await encrypt(enc.encode(JSON.stringify(message)), sub.p256dh, sub.auth);
  const headers: Record<string, string> = {
    "Content-Encoding": "aes128gcm",
    "Content-Type": "application/octet-stream",
    TTL: String(opts.ttl),
    Urgency: opts.urgency,
    Authorization: await vapidHeader(sub.endpoint),
  };
  if (opts.topic) headers.Topic = opts.topic.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32);
  const res = await fetch(sub.endpoint, { method: "POST", headers, body });
  return res.status;
}

/* ---------------- smart policy ---------------- */
type Prefs = { mode: "agressif" | "modere" | "calme"; quiet_start: number; quiet_end: number; muted_kinds: string[]; digest: boolean };
const DEFAULT_PREFS: Prefs = { mode: "modere", quiet_start: 22, quiet_end: 7, muted_kinds: [], digest: true };
const RANK: Record<string, number> = { urgent: 3, high: 2, normal: 1, low: 0 };

function algiersHour() { return (new Date().getUTCHours() + 1) % 24; } // Africa/Algiers = UTC+1, no DST
function inQuiet(p: Prefs) {
  const h = algiersHour();
  if (p.quiet_start === p.quiet_end) return false;
  return p.quiet_start < p.quiet_end ? h >= p.quiet_start && h < p.quiet_end : h >= p.quiet_start || h < p.quiet_end;
}
function decide(n: { kind: string; priority: string }, p: Prefs): string | null {
  if (n.kind === "test") return null;
  if (p.muted_kinds.includes(n.kind)) return "muted";
  if (n.kind === "digest") return p.digest ? null : "digest_off";
  const r = RANK[n.priority] ?? 1;
  const quiet = inQuiet(p);
  if (p.mode === "calme") return r >= 3 ? null : "mode_calme";
  if (p.mode === "modere") { if (r < 1) return "low"; if (quiet && r < 3) return "quiet_hours"; return null; }
  // agressif
  if (quiet && r < 2) return "quiet_hours";
  return null;
}

async function deliver(n: { id: string; user_id: string; kind: string; title: string; body: string | null; link: string | null; priority: string }) {
  const { data: prefRow } = await db.from("notification_prefs").select("*").eq("user_id", n.user_id).maybeSingle();
  const prefs: Prefs = { ...DEFAULT_PREFS, ...(prefRow ?? {}) };
  const skip = decide(n, prefs);
  if (skip) { await db.from("notifications").update({ push_status: "skip:" + skip }).eq("id", n.id); return { skipped: skip }; }

  const { data: subs } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth, fail_count").eq("user_id", n.user_id);
  if (!subs?.length) { await db.from("notifications").update({ push_status: "no_device" }).eq("id", n.id); return { skipped: "no_device" }; }

  // burst control: many alerts in a short time are grouped into one (except in aggressive mode)
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count: recent } = await db.from("notifications").select("id", { count: "exact", head: true })
    .eq("user_id", n.user_id).eq("push_status", "sent").gte("pushed_at", since);
  const { count: unread } = await db.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", n.user_id).eq("read", false);
  const burst = prefs.mode !== "agressif" && (recent ?? 0) >= 4 && n.priority !== "urgent";

  const urgent = n.priority === "urgent";
  const message = burst
    ? { title: `${(recent ?? 0) + 1} nouvelles alertes`, body: `Dernière : ${n.title}`, tag: "whiteg-burst", url: "/notifications", priority: n.priority, badge: unread ?? 0, renotify: false }
    : {
        title: n.title,
        body: n.body ?? "",
        tag: urgent ? "whiteg-" + n.id : "whiteg-" + n.kind,
        url: n.link || "/notifications",
        priority: n.priority,
        badge: unread ?? 0,
        renotify: true,
        requireInteraction: urgent,
      };
  const opts = { urgency: urgent ? "high" : n.priority === "high" ? "high" : "normal", ttl: urgent ? 86400 : 6 * 3600, topic: burst ? "burst" : undefined };

  let ok = 0, gone = 0, failed = 0;
  await Promise.all(subs.map(async (s: Sub) => {
    try {
      const status = await sendOne(s, message, opts);
      if (status >= 200 && status < 300) { ok++; await db.from("push_subscriptions").update({ last_ok_at: new Date().toISOString(), fail_count: 0 }).eq("id", s.id); }
      else if (status === 404 || status === 410) { gone++; await db.from("push_subscriptions").delete().eq("id", s.id); }
      else { failed++; console.warn("push status", status, new URL(s.endpoint).host); await db.from("push_subscriptions").update({ fail_count: s.fail_count + 1 }).eq("id", s.id); }
    } catch (e) { failed++; console.error("push error", (e as Error).message); }
  }));
  const status = ok ? (burst ? "sent" : "sent") : gone && !failed ? "no_device" : "error";
  await db.from("notifications").update({ push_status: status }).eq("id", n.id);
  return { ok, gone, failed, burst };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (req.method === "GET") return json({ publicKey: (await vapid()).publicKey });
    const body = await req.json().catch(() => ({}));

    // test from the app: authenticated member sends a test alert to their own devices
    if (body.test) {
      const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
      const userClient = createClient(SB_URL, SB_ANON, { auth: { persistSession: false } });
      const { data: u } = await userClient.auth.getUser(token);
      if (!u?.user) return json({ error: "unauthorized" }, 401);
      const { data: m } = await db.from("crm_members").select("user_id").eq("user_id", u.user.id).maybeSingle();
      if (!m) return json({ error: "unauthorized" }, 401);
      const { data: subs } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth, fail_count").eq("user_id", u.user.id);
      if (!subs?.length) return json({ ok: 0, devices: 0 });
      let ok = 0; const errors: number[] = [];
      for (const s of subs as Sub[]) {
        try {
          const st = await sendOne(s, { title: "Notifications actives ✅", body: "White G CRM peut vous alerter sur cet appareil.", tag: "whiteg-test", url: "/parametres", priority: "high", renotify: true }, { urgency: "high", ttl: 600 });
          if (st >= 200 && st < 300) ok++; else { errors.push(st); if (st === 404 || st === 410) await db.from("push_subscriptions").delete().eq("id", s.id); }
        } catch (e) { errors.push(0); console.error(e); }
      }
      return json({ ok, devices: subs.length, errors });
    }

    // from the database trigger: { id } of a fresh notification — idempotent
    if (typeof body.id !== "string") return json({ error: "bad_request" }, 400);
    const fresh = new Date(Date.now() - 15 * 60_000).toISOString();
    const { data: n } = await db.from("notifications").update({ pushed_at: new Date().toISOString(), push_status: "processing" })
      .eq("id", body.id).is("pushed_at", null).gte("created_at", fresh)
      .select("id, user_id, kind, title, body, link, priority").maybeSingle();
    if (!n) return json({ skipped: "already_handled" });
    return json(await deliver(n));
  } catch (e) {
    console.error("push fatal", (e as Error).message);
    return json({ error: "internal" }, 500);
  }
});
