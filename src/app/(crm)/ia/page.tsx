"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Send, Copy, Trash2, Loader2, BarChart3, TrendingUp, PhoneCall, Layers, Wallet, XCircle, CalendarRange, KeyRound } from "lucide-react";
import { aiAnalyse, aiStatus } from "@/lib/ai-client";
import { Markdown } from "@/components/ai/markdown";
import { Button, PageHeader, useToast } from "@/components/ui";
import { fmtAgo } from "@/lib/format";

type Item = { id: string; q: string; text?: string; error?: string; at: string; volumes?: Record<string, number> };

const PRESETS = [
  { icon: BarChart3, label: "Analyse complète", q: "Fais une analyse complète de l'activité commerciale et financière, avec les priorités de la semaine." },
  { icon: CalendarRange, label: "Rapport du mois", q: "Rédige le rapport mensuel : mois en cours comparé au mois précédent et à la moyenne des 12 derniers mois (encaissements, opportunités, nouveaux clients, factures)." },
  { icon: TrendingUp, label: "Pipeline & prévision", q: "Analyse la santé du pipeline et donne une prévision de chiffre d'affaires à 3 mois (scénarios prudent / probable / optimiste) en t'appuyant sur le montant pondéré et le taux de conversion." },
  { icon: PhoneCall, label: "Qui relancer ?", q: "Liste les opportunités et clients à relancer en priorité cette semaine, avec pour chacun la raison et l'action conseillée." },
  { icon: Layers, label: "Par offre & format", q: "Analyse la performance par catégorie d'offre (A à G) et par format de produit : où se concentre la valeur, où investir." },
  { icon: Wallet, label: "Recouvrement", q: "Fais le point sur la facturation et le recouvrement : encaissé, reste à encaisser, factures échues, clients à risque, actions." },
  { icon: XCircle, label: "Analyse des pertes", q: "Analyse les affaires perdues et les devis refusés : causes, tendances et actions correctives." },
];

const STORE = "whiteg-ai-history";

export default function AiPage() {
  const toast = useToast();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    aiStatus().then(setConfigured);
    try { const raw = localStorage.getItem(STORE); if (raw) setItems(JSON.parse(raw)); } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem(STORE, JSON.stringify(items.filter((i) => i.text).slice(0, 12))); } catch { /* ignore */ }
  }, [items]);

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    const id = crypto.randomUUID();
    setItems((l) => [{ id, q: text, at: new Date().toISOString() }, ...l]);
    setQ("");
    setBusy(true);
    try {
      const r = await aiAnalyse(text);
      setItems((l) => l.map((i) => (i.id === id ? { ...i, text: r.text, volumes: r.volumes } : i)));
    } catch (e) {
      setItems((l) => l.map((i) => (i.id === id ? { ...i, error: (e as Error).message } : i)));
      if ((e as { code?: string }).code === "not_configured") setConfigured(false);
    } finally {
      setBusy(false);
    }
  };

  const copy = async (t: string) => {
    try { await navigator.clipboard.writeText(t); toast("Copié"); } catch { toast("Copie impossible", "err"); }
  };

  return (
    <>
      <PageHeader title="Assistant IA" subtitle="Analyses statistiques et rapports rédigés à partir de vos données CRM" />

      {configured === false && (
        <div className="card mb-4 flex gap-3 border-brand/30 bg-gradient-to-r from-brand/10 to-transparent p-4">
          <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
          <div className="text-sm">
            <p className="font-medium">L&apos;IA n&apos;est pas encore branchée</p>
            <p className="mt-1 text-muted">Dans Vercel → projet <b className="text-fg">whiteg-crm</b> → Settings → Environment Variables, ajoutez <code className="rounded bg-panel-2 px-1">GEMINI_API_KEY</code> (votre clé Google AI Studio, cochée « Sensitive »), puis redéployez. Le reste du CRM fonctionne normalement sans elle.</p>
          </div>
        </div>
      )}

      <div className="card mb-4 p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button key={p.label} type="button" disabled={busy} onClick={() => ask(p.q)}
              className="flex items-center gap-1.5 rounded-full border border-line bg-panel-2/60 px-3 py-1.5 text-xs text-muted transition hover:border-brand hover:text-fg disabled:opacity-50">
              <p.icon className="h-3.5 w-3.5 text-brand" /> {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <textarea ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} rows={2}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ask(q); } }}
            placeholder="Posez votre question : « Quel secteur rapporte le plus ? », « Compare ce trimestre au précédent », « Rédige un point pour la réunion de lundi »…"
            className="input min-h-[3.25rem] flex-1 resize-y text-sm" />
          <Button onClick={() => ask(q)} disabled={busy || !q.trim()} className="h-[3.25rem] px-4" aria-label="Analyser">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}<span className="hidden sm:inline">Analyser</span>
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-faint">Les chiffres sont calculés par le CRM (exacts) ; l&apos;IA les commente et rédige. Vérifiez toujours avant de diffuser.</p>
      </div>

      {items.length === 0 ? (
        <div className="card flex flex-col items-center p-10 text-center">
          <Sparkles className="mb-3 h-8 w-8 text-brand" />
          <p className="font-medium">Choisissez une analyse ou posez une question</p>
          <p className="mt-1 max-w-md text-sm text-muted">L&apos;assistant lit vos clients, opportunités, documents, paiements et tâches pour produire des analyses chiffrées et des recommandations.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((it) => (
            <article key={it.id} className="card p-4 sm:p-5">
              <div className="mb-3 flex items-start gap-2 border-b border-line pb-3">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <p className="flex-1 text-sm font-medium">{it.q}</p>
                <span className="shrink-0 text-[11px] text-faint">{fmtAgo(it.at)}</span>
              </div>
              {it.text ? (
                <>
                  <Markdown text={it.text} />
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                    <Button size="sm" variant="outline" onClick={() => copy(it.text!)}><Copy className="h-3.5 w-3.5" /> Copier</Button>
                    <Button size="sm" variant="ghost" onClick={() => setItems((l) => l.filter((x) => x.id !== it.id))}><Trash2 className="h-3.5 w-3.5" /> Retirer</Button>
                    {it.volumes && <span className="ml-auto text-[11px] text-faint">{it.volumes.clients} clients · {it.volumes.opportunites} opportunités · {it.volumes.documents} documents analysés</span>}
                  </div>
                </>
              ) : it.error ? (
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="text-red-400">{it.error}</span>
                  <Button size="sm" variant="outline" onClick={() => { setItems((l) => l.filter((x) => x.id !== it.id)); ask(it.q); }}>Réessayer</Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin text-brand" /> Analyse des données en cours… (10 à 30 s)</div>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
