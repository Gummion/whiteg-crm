/** Minimal, defensive Gemini client (server only). Never throws raw errors to the UI. */

export class AiError extends Error {
  constructor(public code: "not_configured" | "timeout" | "quota" | "blocked" | "upstream" | "empty", message: string) { super(message); }
}

const KEY = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || process.env.gemini || process.env.GEMINI;
const MODEL = () => process.env.GEMINI_MODEL || "gemini-flash-latest";
const FALLBACK_MODEL = "gemini-2.5-flash";

export const aiConfigured = () => !!KEY();

type GenOpts = { system: string; prompt: string; temperature?: number; maxTokens?: number; timeoutMs?: number };

async function call(model: string, o: GenOpts) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), o.timeoutMs ?? 40_000);
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

export async function generate(o: GenOpts): Promise<string> {
  if (!KEY()) throw new AiError("not_configured", "IA non configurée : ajoutez la variable GEMINI_API_KEY sur Vercel.");
  let model = MODEL();
  for (let attempt = 0; attempt < 3; attempt++) {
    const { status, body } = await call(model, o);
    if (status === 200) {
      const cand = body?.candidates?.[0];
      const text: string = (cand?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("").trim();
      if (text) return text;
      if (body?.promptFeedback?.blockReason || cand?.finishReason === "SAFETY") throw new AiError("blocked", "La demande a été bloquée par le filtre de l'IA. Reformulez.");
      throw new AiError("empty", "L'IA n'a rien renvoyé. Réessayez.");
    }
    if (status === 404 && model !== FALLBACK_MODEL) { model = FALLBACK_MODEL; continue; }
    if (status === 400 && /API key/i.test(JSON.stringify(body))) throw new AiError("not_configured", "Clé IA invalide : vérifiez GEMINI_API_KEY sur Vercel.");
    if (status === 401 || status === 403) throw new AiError("not_configured", "Clé IA refusée : vérifiez GEMINI_API_KEY et l'accès à l'API Gemini.");
    if ((status === 429 || status >= 500) && attempt < 2) { await new Promise((r) => setTimeout(r, 1200 * (attempt + 1))); continue; }
    if (status === 429) throw new AiError("quota", "Quota IA atteint pour le moment. Réessayez dans une minute.");
    console.error("gemini", status, JSON.stringify(body).slice(0, 400));
    throw new AiError("upstream", `Service IA indisponible (${status}).`);
  }
  throw new AiError("upstream", "Service IA indisponible.");
}
