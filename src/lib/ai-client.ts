"use client";

import { supabaseBrowser } from "./supabase/client";

export class AiClientError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

async function post<T>(payload: unknown, timeoutMs = 65_000): Promise<T> {
  const { data } = await supabaseBrowser().auth.getSession();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch("/api/ai", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
      body: JSON.stringify(payload),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new AiClientError(j.code ?? String(res.status), j.error ?? `Erreur ${res.status}`);
    return j as T;
  } catch (e) {
    if (e instanceof AiClientError) throw e;
    if ((e as Error).name === "AbortError") throw new AiClientError("timeout", "L'IA ne répond pas — réessayez.");
    throw new AiClientError("network", "Connexion impossible avec l'assistant IA.");
  } finally {
    clearTimeout(t);
  }
}

export const aiAnalyse = (question: string) => post<{ text: string; volumes: Record<string, number> }>({ task: "analyse", question });

export type WriteAction = "rediger" | "ameliorer" | "raccourcir" | "developper" | "corriger";
export const aiWrite = (p: { docId: string; field: string; current?: string; instruction?: string; action: WriteAction }) =>
  post<{ text: string }>({ task: "write", ...p });

export async function aiStatus(): Promise<boolean | null> {
  try {
    const { data } = await supabaseBrowser().auth.getSession();
    const res = await fetch("/api/ai", { headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` } });
    if (!res.ok) return null;
    return (await res.json()).configured === true;
  } catch { return null; }
}
