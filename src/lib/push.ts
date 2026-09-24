"use client";

import { supabaseBrowser } from "./supabase/client";

const FN = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/push`;

export type PushState = "unsupported" | "ios-browser" | "denied" | "off" | "on";

function b64uToBytes(s: string) {
  const p = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(p);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64u(buf: ArrayBuffer | null) {
  if (!buf) return "";
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function isIos() {
  return typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
}
export function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Registers the service worker (safe to call on every app start). */
export async function registerSW() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (e) {
    console.warn("SW registration failed", e);
    return null;
  }
}

export async function getPushState(): Promise<PushState> {
  if (typeof window === "undefined") return "unsupported";
  if (isIos() && !isStandalone()) return "ios-browser";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    return sub && Notification.permission === "granted" ? "on" : "off";
  } catch {
    return "off";
  }
}

async function saveSubscription(sub: PushSubscription) {
  const j = sub.toJSON();
  const row = {
    endpoint: sub.endpoint,
    p256dh: j.keys?.p256dh ?? bytesToB64u(sub.getKey("p256dh")),
    auth: j.keys?.auth ?? bytesToB64u(sub.getKey("auth")),
    user_agent: navigator.userAgent.slice(0, 200),
  };
  const { error } = await supabaseBrowser().from("push_subscriptions").upsert(row, { onConflict: "endpoint" });
  if (error) throw new Error(error.message);
}

/** Asks permission, subscribes this device and stores it. Must be called from a user gesture (tap). */
export async function enablePush() {
  const state = await getPushState();
  if (state === "ios-browser") throw new Error("Sur iPhone, ouvrez d'abord le CRM depuis l'icône de l'écran d'accueil.");
  if (state === "unsupported") throw new Error("Ce navigateur ne supporte pas les notifications push.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Autorisation refusée. Activez les notifications pour ce site dans les réglages du téléphone.");
  const reg = (await registerSW()) ?? (await navigator.serviceWorker.ready);
  await navigator.serviceWorker.ready;
  const res = await fetch(FN, { method: "GET" });
  if (!res.ok) throw new Error("Service de notifications indisponible, réessayez.");
  const { publicKey } = await res.json();
  let sub = await reg.pushManager.getSubscription();
  if (sub) {
    // re-subscribe if the server key changed
    const cur = bytesToB64u(sub.options.applicationServerKey);
    if (cur && cur !== publicKey) { await sub.unsubscribe(); sub = null; }
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(publicKey) });
  await saveSubscription(sub);
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await supabaseBrowser().from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe();
}

/** Keeps the stored subscription in sync (endpoints can rotate). Silent, never throws. */
export async function syncPush() {
  try {
    if ((await getPushState()) !== "on") return;
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await saveSubscription(sub);
  } catch { /* ignore */ }
}

export async function sendTestPush() {
  const { data } = await supabaseBrowser().auth.getSession();
  const res = await fetch(FN, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: JSON.stringify({ test: true }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? "Échec du test");
  return j as { ok: number; devices: number; errors?: number[] };
}

export function setBadge(n: number) {
  try {
    const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (n > 0) nav.setAppBadge?.(n).catch(() => {});
    else nav.clearAppBadge?.().catch(() => {});
  } catch { /* ignore */ }
}
