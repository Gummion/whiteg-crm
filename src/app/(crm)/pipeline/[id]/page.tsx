"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { ArrowLeft, Briefcase, Check, Pencil, Plus, Wallet, FileText, Loader2, StickyNote, Trash2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { DEAL_STAGES, OFFER_CATEGORIES, type DealStage, labelOf } from "@/lib/constants";
import type { Activity, Deal } from "@/lib/types";
import type { Doc, DocKind } from "@/lib/documents/config";
import { DOC_KINDS, PAYMENT_METHODS, PHASES } from "@/lib/documents/config";
import { createDocument } from "@/lib/documents/data";
import { money } from "@/lib/documents/money";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { emitChange, useOnChange } from "@/lib/events";
import { ACT_ICON } from "@/components/icons";
import { DealForm } from "@/components/forms";
import { DocStatusBadge } from "@/components/documents/doc-list";
import { PaymentForm } from "@/components/documents/payment-form";
import { Button, Empty, Spinner, useToast } from "@/components/ui";

type Payment = { id: string; amount: number; paid_at: string; method: string; reference: string | null; documents: { number: string } | null };

const PHASE_OF_STAGE: Record<DealStage, number> = { nouveau: 0, brief: 0, devis_envoye: 0, negociation: 1, acompte_recu: 2, en_cours: 2, livre: 3, perdu: 0 };

export default function DealDossier({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const sb = supabaseBrowser();
  const router = useRouter();
  const toast = useToast();
  const [deal, setDeal] = useState<(Deal & { clients: { id: string; company_name: string } }) | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [acts, setActs] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState(false);
  const [pay, setPay] = useState(false);
  const [creating, setCreating] = useState<DocKind | null>(null);

  const load = useCallback(async () => {
    const [a, b, c, d] = await Promise.all([
      sb.from("deals").select("*, clients(id,company_name)").eq("id", id).maybeSingle(),
      sb.from("documents").select("*").eq("deal_id", id).order("created_at"),
      sb.from("payments").select("id,amount,paid_at,method,reference,documents(number)").eq("deal_id", id).order("paid_at"),
      sb.from("activities").select("*").eq("deal_id", id).order("occurred_at", { ascending: false }).limit(30),
    ]);
    setDeal(a.data); setDocs((b.data as Doc[]) ?? []); setPayments((c.data as unknown as Payment[]) ?? []); setActs(d.data ?? []);
    setLoading(false);
  }, [sb, id]);
  useEffect(() => { load(); }, [load]);
  useOnChange(load);

  if (loading) return <Spinner />;
  if (!deal) return <Empty icon={Briefcase} title="Projet introuvable" action={<Link href="/pipeline"><Button variant="outline">Retour</Button></Link>} />;

  const current = PHASE_OF_STAGE[deal.stage];
  const suggested = new Set(Object.entries(DOC_KINDS).filter(([, m]) => m.suggestAt.includes(deal.stage)).map(([k]) => k));
  const invoiced = docs.filter((d) => d.kind === "facture" && !["brouillon", "annule"].includes(d.status)).reduce((a, d) => a + Number(d.total_ttc), 0);
  const paid = payments.reduce((a, p) => a + Number(p.amount), 0);
  const stage = DEAL_STAGES.find((s) => s.value === deal.stage)!;

  const setStage = async (s: DealStage) => {
    const prob = DEAL_STAGES.find((x) => x.value === s)?.prob ?? deal.probability;
    setDeal({ ...deal, stage: s, probability: prob });
    const { error } = await sb.from("deals").update({ stage: s, probability: prob }).eq("id", deal.id);
    if (error) toast(error.message, "err"); else { toast("Étape : " + labelOf(DEAL_STAGES, s)); emitChange(); }
  };
  const create = async (k: DocKind) => {
    setCreating(k);
    try {
      // prefer converting from the latest priced commercial doc so lines follow the workflow
      const source = DOC_KINDS[k].priced ? [...docs].reverse().find((d) => ["devis", "proposition", "bon_commande", "proforma"].includes(d.kind) && d.kind !== k && d.status !== "annule") ?? null : null;
      const nid = await createDocument(k, { clientId: deal.client_id, dealId: deal.id, source });
      router.push("/documents/" + nid);
    } catch (e) { toast((e as Error).message, "err"); setCreating(null); }
  };
  const delPayment = async (p: Payment) => {
    if (!confirm(`Supprimer le paiement de ${money(p.amount)} DA ?`)) return;
    await sb.from("payments").delete().eq("id", p.id); emitChange();
  };

  return (
    <>
      <Link href="/pipeline" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="h-4 w-4" /> Pipeline</Link>

      <div className="card mb-4 p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand">Dossier projet · {deal.category} {OFFER_CATEGORIES.find((c) => c.value === deal.category)?.short}</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">{deal.title}</h1>
            <p className="mt-1 text-sm text-muted">
              <Link href={`/clients/${deal.client_id}`} className="hover:text-brand">{deal.clients?.company_name}</Link>
              {deal.product_format && ` · ${deal.product_format}`}{deal.quote_ref && ` · ${deal.quote_ref}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={deal.stage} onChange={(e) => setStage(e.target.value as DealStage)}
              className="h-9 rounded-lg border border-line bg-panel-2 px-3 text-sm outline-none focus:border-brand" style={{ color: stage.color }}>
              {DEAL_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <Button variant="outline" size="sm" className="h-9" onClick={() => setPay(true)}><Wallet className="h-4 w-4" /> Paiement</Button>
            <Button variant="outline" size="sm" className="h-9" onClick={() => setEdit(true)}><Pencil className="h-4 w-4" /> Modifier</Button>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 sm:grid-cols-4">
          <Stat label="Montant du projet (HT)" value={money(deal.amount) + " DA"} />
          <Stat label="Facturé TTC" value={money(invoiced) + " DA"} />
          <Stat label="Encaissé" value={money(paid) + " DA"} good={paid > 0} />
          <Stat label="Livraison prévue" value={deal.delivery_date ? fmtDate(deal.delivery_date) : deal.expected_close ? "clôture " + fmtDate(deal.expected_close) : "—"} />
        </div>
      </div>

      {/* Workflow */}
      <h2 className="mb-2 text-sm font-semibold">Parcours documentaire</h2>
      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {PHASES.map((p, i) => (
          <section key={p.key} className={clsx("card flex flex-col p-3.5", i === current && deal.stage !== "perdu" && "border-brand/50 ring-1 ring-brand/20")}>
            <div className="mb-3 flex items-center gap-2">
              <span className={clsx("flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                i < current ? "bg-emerald-500/15 text-emerald-400" : i === current ? "bg-brand text-black" : "bg-panel-2 text-faint")}>
                {i < current ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{p.label}</p>
                <p className="truncate text-[11px] text-faint">{p.hint}</p>
              </div>
            </div>
            <ul className="flex-1 space-y-1.5">
              {p.kinds.map((k) => {
                const existing = docs.filter((d) => d.kind === k);
                const isNext = suggested.has(k) && existing.length === 0;
                return (
                  <li key={k} className={clsx("rounded-lg border px-2.5 py-2", isNext ? "border-brand/40 bg-brand/5" : "border-line")}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
                        {isNext && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" title="Étape suggérée" />}
                        <span className="truncate">{DOC_KINDS[k].label}</span>
                      </span>
                      <button onClick={() => create(k)} disabled={!!creating}
                        className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted hover:bg-panel-2 hover:text-brand disabled:opacity-50">
                        {creating === k ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}{existing.length ? "Autre" : "Créer"}
                      </button>
                    </div>
                    {existing.map((d) => (
                      <Link key={d.id} href={`/documents/${d.id}`} className="mt-1.5 flex items-center justify-between gap-2 rounded-md bg-panel-2/70 px-2 py-1.5 hover:bg-panel-2">
                        <span className="flex min-w-0 items-center gap-1.5 text-xs"><FileText className="h-3.5 w-3.5 shrink-0 text-brand" /><span className="truncate">{d.number}</span></span>
                        <DocStatusBadge status={d.status} />
                      </Link>
                    ))}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="card p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Paiements</h2>
            <Button size="sm" variant="ghost" onClick={() => setPay(true)}><Plus className="h-4 w-4" /> Ajouter</Button>
          </div>
          {payments.length === 0 ? <p className="py-4 text-center text-sm text-faint">Aucun paiement enregistré. Le premier paiement passe le projet en « Acompte reçu ».</p> : (
            <ul className="divide-y divide-line/60">
              {payments.map((p) => (
                <li key={p.id} className="group flex items-center justify-between gap-2 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium tabular-nums">{money(p.amount)} DA</p>
                    <p className="truncate text-xs text-faint">{fmtDate(p.paid_at)} · {PAYMENT_METHODS.find((m) => m.value === p.method)?.label}{p.reference ? " · " + p.reference : ""}{p.documents ? " · " + p.documents.number : ""}</p>
                  </div>
                  <button onClick={() => delPayment(p)} className="rounded p-1.5 text-faint opacity-0 hover:text-red-400 group-hover:opacity-100"><Trash2 className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-4 sm:p-5">
          <h2 className="mb-3 font-semibold">Historique du projet</h2>
          {acts.length === 0 ? <p className="py-4 text-center text-sm text-faint">Aucun événement</p> : (
            <ul className="space-y-2.5">
              {acts.map((a) => {
                const Icon = ACT_ICON[a.type] ?? StickyNote;
                return (
                  <li key={a.id} className="flex gap-2.5">
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-panel-2 text-muted"><Icon className="h-3 w-3" /></div>
                    <div className="min-w-0"><p className="text-sm">{a.subject}</p><p className="text-xs text-faint">{fmtDateTime(a.occurred_at)}</p></div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <DealForm open={edit} onClose={() => { setEdit(false); load(); }} deal={deal} />
      <PaymentForm open={pay} onClose={() => { setPay(false); load(); }} clientId={deal.client_id} dealId={deal.id}
        defaultAmount={Math.max(0, invoiced - paid) || undefined} />
    </>
  );
}

function Stat({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div>
      <p className="text-xs text-faint">{label}</p>
      <p className={clsx("mt-0.5 truncate text-sm font-semibold tabular-nums", good && "text-emerald-400")}>{value}</p>
    </div>
  );
}
