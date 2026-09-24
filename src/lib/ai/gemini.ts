/** Minimal, defensive Gemini client (server only). Never throws raw errors to the UI. */

export class AiError extends Error {
  constructor(public code: "not_configured" | "timeout" | "quota" | "blocked" | "upstream" | "empty", message: string) { super(message); }
}

const KEY = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || process.env.gemini || process.env.GEMINI;
const MODEL = () => process.env.GEMINI_MODEL || "gemini-flash-latest";

export const aiConfigured = () => !!KEY();

type GenOpts = { system: string; prompt: string; temperature?: number; maxTokens?: number; timeoutMs?: number };

async function call(model: string, o: GenOpts) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), o.timeoutMs ?? 30_000);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": KEY()! },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: o.system }] },
        contents: [{ role: "user", parts: [{ text: o.prompt }] }],
        generationConfig: { temperature: o.temperature ?? 0.4, maxOutputTokens: o.maxTokens ?? 4096 },
      }),
    });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new AiError("timeout", "L'IA a mis trop de temps à répondre. Réessayez avec une demande plus courte.");
    throw new AiError("upstream", "Impossible de joindre le service IA.");
  } finally {
    clearTimeout(t);
  }
}

function googleMessage(body: unknown) {
  const m = (body as { error?: { message?: string } })?.error?.message ?? "";
  return m.replace(/\s+/g, " ").replace(/ For more information.*$/i, "").slice(0, 300);
}
function retryDelayMs(body: unknown) {
  const details = (body as { error?: { details?: { retryDelay?: string }[] } })?.error?.details ?? [];
  const d = details.find((x) => x.retryDelay)?.retryDelay;
  return d ? Math.ceil(parseFloat(d) * 1000) : 0;
}

/** Tries several models: if one has no quota (free tier = 0, daily limit reached…) the next one is used. */
export async function generate(o: GenOpts): Promise<string> {
  if (!KEY()) throw new AiError("not_configured", "IA non configurée : ajoutez la variable GEMINI_API_KEY sur Vercel.");
  const models = [...new Set([MODEL(), "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-2.0-flash-lite"])];
  let lastQuota = "";
  let lastError = "";
  const tried: string[] = [];
  const started = Date.now();
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const remaining = 52_000 - (Date.now() - started);
      if (remaining < 5_000) break;
      const { status, body } = await call(model, { ...o, timeoutMs: Math.min(o.timeoutMs ?? 30_000, remaining) });
      if (status === 200) {
        const cand = body?.candidates?.[0];
        const text: string = (cand?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("").trim();
        if (text) return text;
        if (body?.promptFeedback?.blockReason || cand?.finishReason === "SAFETY") throw new AiError("blocked", "La demande a été bloquée par le filtre de l'IA. Reformulez.");
        lastError = "réponse vide";
        break;
      }
      const msg = googleMessage(body);
      tried.push(`${model.replace("gemini-", "")} ${status}`);
      console.error("gemini", model, status, msg);
      if (status === 400 && /API key/i.test(msg)) throw new AiError("not_configured", "Clé IA invalide : vérifiez GEMINI_API_KEY sur Vercel.");
      if (status === 401 || status === 403) throw new AiError("not_configured", `Clé IA refusée (${status}) : ${msg || "vérifiez GEMINI_API_KEY et que l'API Gemini est activée"}`);
      if (status === 429) {
        if (!lastQuota || /limit|quota_metric|free/i.test(msg)) lastQuota = `${model} : ${msg}`;
        const wait = retryDelayMs(body);
        // short per-minute limit on this model → wait once; otherwise (daily / zero quota) → next model
        if (attempt === 0 && wait > 0 && wait <= 6000 && !/limit: 0|per ?day|PerDay/i.test(msg)) { await new Promise((r) => setTimeout(r, wait)); continue; }
        break;
      }
      if (status === 404 || status === 400) { lastError = `${model} : ${msg}`; break; }
      if (status >= 500 && attempt === 0) { await new Promise((r) => setTimeout(r, 1200)); continue; }
      lastError = `${model} (${status}) : ${msg}`;
      break;
    }
  }
  const summary = tried.length ? ` [essais : ${tried.join(", ")}]` : "";
  if (lastQuota) throw new AiError("quota", `Google refuse les requêtes de cette clé (quota à 0 ou épuisé)${summary}. Message Google — ${lastQuota}`);
  throw new AiError("upstream", `Service IA indisponible${summary}. ${lastError}`.trim());
}
