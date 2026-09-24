import { NextResponse } from "next/server";
import { crmMember } from "@/lib/server-auth";
import { AiError, aiConfigured, generate } from "@/lib/ai/gemini";
import { buildSnapshot } from "@/lib/ai/snapshot";
import { DOC_KINDS, type DocKind } from "@/lib/documents/config";
import { DEAL_STAGES, OFFER_CATEGORIES, SECTORS, labelOf } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const COMPANY_CONTEXT = `WHITE G by GUMMION (EURL GUMMION, Algérie, dzwhiteg.com) est un partenaire B2B en formulation, production et conseil QHSE :
nutraceutique (compléments alimentaires, gummies, gélules, sticks, poudres, liquides), cosmétique et agroalimentaire.
Offres : A Audit & conseil QHSE · B Formulation & R&D · C Formation & coaching · D Production & façonnage · E Digital & contenu · F Packages hybrides · G International & institutionnel.
Processus commercial : brief → devis → acompte (100 %) → production → livraison. Monnaie : dinar algérien (DA).`;

/* ---- simple per-user rate limit (per server instance) ---- */
const hits = new Map<string, number[]>();
function limited(uid: string, max = 12, windowMs = 60_000) {
  const now = Date.now();
  const l = (hits.get(uid) ?? []).filter((t) => now - t < windowMs);
  l.push(now); hits.set(uid, l);
  return l.length > max;
}

const clip = (s: unknown, n: number) => String(s ?? "").slice(0, n);

export async function GET(req: Request) {
  const m = await crmMember(req);
  if (!m) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ configured: aiConfigured() });
}

export async function POST(req: Request) {
  const m = await crmMember(req);
  if (!m) return NextResponse.json({ error: "Accès refusé" }, { status: 401 });
  if (!aiConfigured()) return NextResponse.json({ error: "IA non configurée : ajoutez la variable GEMINI_API_KEY sur Vercel.", code: "not_configured" }, { status: 503 });
  if (limited(m.user.id)) return NextResponse.json({ error: "Trop de demandes d'un coup — patientez une minute.", code: "rate" }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  try {
    if (body.task === "analyse") {
      const question = clip(body.question, 2000).trim() || "Fais une analyse complète de l'activité commerciale.";
      const snap = await buildSnapshot(m.sb);
      const text = await generate({
        system: `${COMPANY_CONTEXT}
Tu es l'analyste commercial et financier de WHITE G. Tu reçois un instantané statistique EXACT du CRM (déjà calculé) au format JSON.
Règles :
- Réponds en français, de façon professionnelle, claire et concrète.
- Utilise UNIQUEMENT les chiffres fournis. N'invente jamais de chiffre, de client ou de tendance. Si une donnée manque, dis-le.
- Tu peux calculer des ratios simples à partir des chiffres fournis en montrant le calcul.
- Formate en Markdown : titres ##, listes, **gras** pour les chiffres clés, tableaux Markdown quand c'est utile.
- Structure par défaut : ## Synthèse (3-4 lignes) · ## Chiffres clés · ## Analyse · ## Points d'attention · ## Recommandations actionnables (priorisées).
- Adapte la structure si la question demande autre chose (rapport, prévision, liste de clients à relancer…).
- Montants en DA avec séparateur de milliers (ex : 1 250 000 DA).`,
        prompt: `Question : ${question}\n\nDonnées du CRM (JSON) :\n${JSON.stringify(snap)}`,
        temperature: 0.3,
        maxTokens: 6000,
      });
      return NextResponse.json({ text, volumes: snap.volumes });
    }

    if (body.task === "write") {
      const docId = clip(body.docId, 64);
      const { data: doc } = await m.sb.from("documents")
        .select("kind, number, title, status, issue_date, data, total_ht, total_ttc, clients(company_name, sector, wilaya, city), deals(title, category, product_format, stage, amount, notes, expected_close, delivery_date)")
        .eq("id", docId).maybeSingle();
      if (!doc) return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
      const kind = doc.kind as DocKind;
      const client = (Array.isArray(doc.clients) ? doc.clients[0] : doc.clients) as Record<string, unknown> | null;
      const deal = (Array.isArray(doc.deals) ? doc.deals[0] : doc.deals) as Record<string, unknown> | null;
      const data = (doc.data ?? {}) as Record<string, unknown>;
      const others = ((data.sections ?? data.articles ?? []) as { title: string; body: string }[])
        .map((s) => `- ${s.title}: ${clip(s.body, 300)}`).join("\n");
      const lines = ((data.lines ?? []) as { label: string; qty: number; unit?: string; price: number }[])
        .map((l) => `- ${l.label} (${l.qty} ${l.unit ?? ""} × ${l.price} DA)`).join("\n");

      const ACTIONS: Record<string, string> = {
        rediger: "Rédige ce passage.",
        ameliorer: "Améliore ce texte : plus clair, plus professionnel et convaincant, même sens.",
        raccourcir: "Raccourcis ce texte d'environ 40 % sans perdre d'information importante.",
        developper: "Développe ce texte avec plus de détails concrets et pertinents.",
        corriger: "Corrige uniquement l'orthographe, la grammaire et la ponctuation. Ne change pas le fond.",
      };
      const action = ACTIONS[String(body.action)] ?? ACTIONS.rediger;
      const text = await generate({
        system: `${COMPANY_CONTEXT}
Tu es le rédacteur des documents commerciaux et techniques de WHITE G.
Règles :
- Français professionnel, ton expert et rassurant, phrases courtes.
- Renvoie UNIQUEMENT le texte final du passage demandé, sans titre, sans introduction du type « Voici », sans guillemets.
- Mise en forme autorisée seulement : « - » en début de ligne pour une puce, « 1. » pour une liste numérotée, **gras** avec parcimonie. Pas de titres Markdown, pas de tableaux.
- N'invente ni prix, ni date, ni chiffre, ni référence réglementaire précise qui ne figure pas dans le contexte. Si une information manque, écris [à compléter].
- Reste cohérent avec les autres sections du document.`,
        prompt: `Document : ${DOC_KINDS[kind]?.label ?? kind} n° ${doc.number}${data.object ? ` — objet : ${clip(data.object, 200)}` : ""}
Client : ${client ? `${client.company_name} (${labelOf(SECTORS, String(client.sector))}${client.wilaya ? ", " + client.wilaya : ""})` : "—"}
${deal ? `Projet : ${deal.title} · ${labelOf(OFFER_CATEGORIES, String(deal.category))}${deal.product_format ? " · format " + deal.product_format : ""} · étape ${labelOf(DEAL_STAGES, String(deal.stage))}${deal.amount ? ` · ${deal.amount} DA` : ""}${deal.notes ? `\nNotes du projet : ${clip(deal.notes, 800)}` : ""}` : ""}
${lines ? `Prestations chiffrées :\n${lines}` : ""}
${others ? `Autres sections du document :\n${clip(others, 2500)}` : ""}

Passage à produire : ${clip(body.field, 200)}
${body.current ? `Texte actuel :\n${clip(body.current, 4000)}` : "(vide)"}
${body.instruction ? `Consigne de l'utilisateur : ${clip(body.instruction, 600)}` : ""}
Tâche : ${action}`,
        temperature: body.action === "corriger" ? 0.1 : 0.6,
        maxTokens: 2048,
      });
      return NextResponse.json({ text: text.replace(/^```[a-z]*\n?|```$/g, "").trim() });
    }

    return NextResponse.json({ error: "Tâche inconnue" }, { status: 400 });
  } catch (e) {
    if (e instanceof AiError) {
      const status = e.code === "not_configured" ? 503 : e.code === "quota" ? 429 : e.code === "timeout" ? 504 : 502;
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    console.error("ai route", e);
    return NextResponse.json({ error: "Erreur interne de l'assistant IA." }, { status: 500 });
  }
}
