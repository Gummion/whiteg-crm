"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { ArrowLeft, Download, Eye, Loader2, Check, Copy, Trash2, Wallet, ChevronDown, FileText, RefreshCw } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Company, Doc, DocData, DocKind } from "@/lib/documents/config";
import { CONVERSIONS, DOC_KINDS, DOC_STATUS, computeTotals } from "@/lib/documents/config";
import { createDocument, loadCompany, loadPdfInput, pdfFileName, renderPdfBlob } from "@/lib/documents/data";
import { money } from "@/lib/documents/money";
import { amountInWords } from "@/lib/documents/words";
import { emitChange } from "@/lib/events";
import { ActionsEditor, Block, InfoEditor, LinesEditor, SectionsEditor } from "@/components/documents/fields";
import { PaymentForm } from "@/components/documents/payment-form";
import { AiWrite } from "@/components/ai/ai-write";
import { Button, Empty, Field, Spinner, useToast } from "@/components/ui";

export default function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const sb = supabaseBrowser();
  const router = useRouter();
  const toast = useToast();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [menu, setMenu] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const dirty = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const renderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const renderSeq = useRef(0);

  const load = useCallback(async () => {
    const [{ data }, co] = await Promise.all([
      sb.from("documents").select("*, clients(id,company_name), deals(id,title)").eq("id", id).maybeSingle(),
      loadCompany(),
    ]);
    setDoc(data as Doc | null);
    setCompany(co);
    setLoading(false);
  }, [sb, id]);
  useEffect(() => { load(); }, [load]);

  /* ---------- preview ---------- */
  const renderPreview = useCallback(async (d: Doc) => {
    if (!company) return;
    const seq = ++renderSeq.current;
    setRendering(true);
    try {
      const input = await loadPdfInput(d, company);
      const blob = await renderPdfBlob(input);
      if (seq !== renderSeq.current) return;
      setPdfUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(blob); });
    } catch (e) {
      console.error(e);
      toast("Aperçu impossible : " + (e as Error).message, "err");
    } finally {
      if (seq === renderSeq.current) setRendering(false);
    }
  }, [company, toast]);

  useEffect(() => {
    if (!doc || !company) return;
    // live preview only on large screens (on phones the « Aperçu » button renders on demand)
    if (!window.matchMedia("(min-width: 1024px)").matches) return;
    if (renderTimer.current) clearTimeout(renderTimer.current);
    renderTimer.current = setTimeout(() => renderPreview(doc), 700);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.data, doc?.status, doc?.issue_date, doc?.due_date, doc?.amount_paid, company]);

  /* ---------- autosave ---------- */
  const save = useCallback(async (d: Doc) => {
    setSaveState("saving");
    const t = computeTotals(d.data);
    const { error } = await sb.from("documents").update({
      data: d.data, status: d.status, issue_date: d.issue_date, due_date: d.due_date, title: d.title,
      total_ht: DOC_KINDS[d.kind].priced ? t.ht : 0, total_tva: DOC_KINDS[d.kind].priced ? t.tva : 0, total_ttc: DOC_KINDS[d.kind].priced ? t.ttc : 0,
    }).eq("id", d.id);
    if (error) { setSaveState("idle"); toast(error.message, "err"); return; }
    dirty.current = false;
    setSaveState("saved");
    emitChange();
  }, [sb, toast]);

  const mutate = (fn: (d: Doc) => Doc) => {
    setDoc((d) => {
      if (!d) return d;
      const n = fn(d);
      dirty.current = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => save(n), 900);
      return n;
    });
  };
  const update = (patch: Partial<Doc>) => mutate((d) => ({ ...d, ...patch }));
  const setData = (patch: Partial<DocData>) => mutate((d) => ({ ...d, data: { ...d.data, ...patch } }));

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty.current) { e.preventDefault(); } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const totals = useMemo(() => (doc ? computeTotals(doc.data) : null), [doc]);

  if (loading) return <Spinner />;
  if (!doc || !company) return <Empty icon={FileText} title="Document introuvable" action={<Link href="/documents"><Button variant="outline">Retour</Button></Link>} />;

  const meta = DOC_KINDS[doc.kind];
  const d = doc.data;

  const download = async () => {
    const input = await loadPdfInput(doc, company);
    const blob = await renderPdfBlob(input);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = pdfFileName(doc, input.client.company_name);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    if (doc.status === "brouillon") toast("Astuce : passez le statut à « Émis » pour retirer le filigrane BROUILLON", "info");
  };
  const openPreview = async () => {
    const w = window.open("", "_blank");
    const input = await loadPdfInput(doc, company);
    const blob = await renderPdfBlob(input);
    const url = URL.createObjectURL(blob);
    if (w) w.location.href = url; else window.location.href = url;
  };
  const convert = async (kind: DocKind) => {
    setMenu(false);
    if (dirty.current) await save(doc);
    try {
      const nid = await createDocument(kind, { clientId: doc.client_id, dealId: doc.deal_id, source: doc });
      toast(`${DOC_KINDS[kind].label} créé(e) à partir de ${doc.number}`);
      router.push("/documents/" + nid);
    } catch (e) { toast((e as Error).message, "err"); }
  };
  const duplicate = async () => {
    setMenu(false);
    const { data: row, error } = await sb.from("documents").insert({
      kind: doc.kind, client_id: doc.client_id, deal_id: doc.deal_id, title: doc.title, data: doc.data,
      total_ht: doc.total_ht, total_tva: doc.total_tva, total_ttc: doc.total_ttc, due_date: doc.due_date,
    }).select("id").single();
    if (error) return toast(error.message, "err");
    toast("Copie créée"); router.push("/documents/" + row.id);
  };
  const remove = async () => {
    setMenu(false);
    if (!confirm(`Supprimer définitivement ${doc.number} ?`)) return;
    const { error } = await sb.from("documents").delete().eq("id", doc.id);
    if (error) return toast(error.message, "err");
    toast("Document supprimé"); emitChange(); router.replace("/documents");
  };

  return (
    <>
      <Link href={doc.deal_id ? `/pipeline/${doc.deal_id}` : `/clients/${doc.client_id}`} className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> {doc.deals?.title ?? doc.clients?.company_name ?? "Retour"}
      </Link>

      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand">{meta.label}</p>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
            {doc.number}
            <span className="flex items-center gap-1 text-xs font-normal text-faint">
              {saveState === "saving" ? <><Loader2 className="h-3 w-3 animate-spin" /> Enregistrement…</> : saveState === "saved" ? <><Check className="h-3 w-3 text-emerald-400" /> Enregistré</> : null}
            </span>
          </h1>
          <p className="truncate text-sm text-muted">
            <Link href={`/clients/${doc.client_id}`} className="hover:text-brand">{doc.clients?.company_name}</Link>
            {meta.priced && totals ? <> · <b className="text-fg">{money(totals.ttc)} DA TTC</b></> : null}
            {doc.kind === "facture" && Number(doc.amount_paid) > 0 ? <> · réglé {money(doc.amount_paid)} DA</> : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={doc.status} onChange={(e) => update({ status: e.target.value as Doc["status"] })}
            className="h-9 rounded-lg border border-line bg-panel px-3 text-sm outline-none focus:border-brand" style={{ color: DOC_STATUS[doc.status].color }}>
            {meta.statuses.map((s) => <option key={s} value={s}>{DOC_STATUS[s].label}</option>)}
          </select>
          {doc.kind === "facture" && (
            <Button variant="outline" size="sm" className="h-9" onClick={() => setPayOpen(true)}><Wallet className="h-4 w-4" /> Paiement</Button>
          )}
          <Button variant="outline" size="sm" className="h-9 lg:hidden" onClick={openPreview}><Eye className="h-4 w-4" /> Aperçu</Button>
          <Button size="sm" className="h-9" onClick={download}><Download className="h-4 w-4" /> PDF</Button>
          <div className="relative">
            <Button variant="outline" size="sm" className="h-9" onClick={() => setMenu((m) => !m)}>Plus <ChevronDown className="h-3.5 w-3.5" /></Button>
            {menu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
                <div className="anim-fade absolute right-0 top-11 z-50 w-64 overflow-hidden rounded-xl border border-line bg-panel p-1 shadow-2xl">
                  {(CONVERSIONS[doc.kind] ?? []).map((k) => (
                    <button key={k} onClick={() => convert(k)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-panel-2">
                      <RefreshCw className="h-4 w-4 text-brand" /> Générer : {DOC_KINDS[k].label}
                    </button>
                  ))}
                  <button onClick={duplicate} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-panel-2"><Copy className="h-4 w-4 text-muted" /> Dupliquer</button>
                  <button onClick={remove} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-red-400 hover:bg-panel-2"><Trash2 className="h-4 w-4" /> Supprimer</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ---------------- Form ---------------- */}
        <div className="space-y-4">
          <Block title="En-tête">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Objet" className="sm:col-span-2"><input className="input" value={d.object ?? ""} onChange={(e) => setData({ object: e.target.value })} /></Field>
              <Field label="Date d'émission"><input className="input" type="date" value={doc.issue_date} onChange={(e) => update({ issue_date: e.target.value })} /></Field>
              {doc.kind === "facture" && <Field label="Échéance"><input className="input" type="date" value={doc.due_date ?? ""} onChange={(e) => update({ due_date: e.target.value || null })} /></Field>}
              {doc.kind === "bon_commande" && <Field label="Référence commande client"><input className="input" value={d.client_ref ?? ""} onChange={(e) => setData({ client_ref: e.target.value })} /></Field>}
              {doc.kind === "facture" && <Field label="Mode de règlement"><input className="input" list="paymodes" value={d.payment_method ?? ""} onChange={(e) => setData({ payment_method: e.target.value })} /><datalist id="paymodes">{["Virement bancaire", "Chèque", "Versement CCP", "Espèces"].map((m) => <option key={m} value={m} />)}</datalist></Field>}
              {doc.kind === "etat_compte" && <>
                <Field label="Période du"><input className="input" type="date" value={d.period?.from ?? ""} onChange={(e) => setData({ period: { ...d.period, from: e.target.value } })} /></Field>
                <Field label="au"><input className="input" type="date" value={d.period?.to ?? ""} onChange={(e) => setData({ period: { ...d.period, to: e.target.value } })} /></Field>
              </>}
            </div>
            {(d.intro !== undefined || doc.kind === "proposition" || doc.kind === "contrat" || doc.kind === "nda") && (
              <Field label={doc.kind === "contrat" || doc.kind === "nda" ? "Préambule / parties" : "Introduction"} className="mt-3">
                <div className="mb-1 flex justify-end"><AiWrite docId={doc.id} field={doc.kind === "contrat" || doc.kind === "nda" ? "Préambule" : "Introduction"} value={d.intro ?? ""} onChange={(intro) => setData({ intro })} /></div>
                <textarea className="input min-h-28 text-sm leading-relaxed" value={d.intro ?? ""} onChange={(e) => setData({ intro: e.target.value })} />
              </Field>
            )}
          </Block>

          {meta.blocks.includes("info") && (
            <Block title="Informations" hint="Tableau récapitulatif en tête de document"><InfoEditor items={d.info ?? []} onChange={(info) => setData({ info })} /></Block>
          )}
          {meta.blocks.includes("participants") && (
            <Block title="Participants"><textarea className="input min-h-20 text-sm" value={d.participants ?? ""} onChange={(e) => setData({ participants: e.target.value })} /></Block>
          )}
          {meta.blocks.includes("sections") && (
            <Block title="Contenu" hint="Sections du document"><SectionsEditor kind="section" docId={doc.id} items={d.sections ?? []} onChange={(sections) => setData({ sections })} /></Block>
          )}
          {meta.blocks.includes("articles") && (
            <Block title="Articles" hint="Modèle à adapter — faites valider vos contrats types par un juriste"><SectionsEditor kind="article" docId={doc.id} items={d.articles ?? []} onChange={(articles) => setData({ articles })} /></Block>
          )}
          {meta.blocks.includes("actions") && (
            <Block title="Plan d'actions"><ActionsEditor items={d.actions ?? []} onChange={(actions) => setData({ actions })} /></Block>
          )}

          {meta.blocks.includes("lines") && (
            <>
              <Block title={doc.kind === "proposition" ? "Investissement" : "Lignes"}>
                <LinesEditor lines={d.lines ?? []} onChange={(lines) => setData({ lines })} />
              </Block>
              <Block title="Totaux">
                <div className="grid grid-cols-3 gap-2">
                  <Field label="TVA">
                    <select className="input" value={d.tva_rate ?? 19} onChange={(e) => setData({ tva_rate: Number(e.target.value) })}>
                      <option value={19}>19 %</option><option value={9}>9 %</option><option value={0}>0 % (exonéré)</option>
                    </select>
                  </Field>
                  <Field label="Remise globale %"><input className="input" type="number" min={0} max={100} value={d.discount_global ?? 0} onChange={(e) => setData({ discount_global: Number(e.target.value) })} /></Field>
                  <Field label="Droit de timbre (DA)"><input className="input" type="number" min={0} value={d.timbre ?? 0} onChange={(e) => setData({ timbre: Number(e.target.value) })} /></Field>
                </div>
                {totals && (
                  <dl className="mt-3 space-y-1 rounded-lg bg-panel-2 p-3 text-sm">
                    <div className="flex justify-between"><dt className="text-muted">Total HT</dt><dd className="tabular-nums">{money(totals.ht)}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted">TVA {d.tva_rate ?? 19} %</dt><dd className="tabular-nums">{money(totals.tva)}</dd></div>
                    {totals.timbre > 0 && <div className="flex justify-between"><dt className="text-muted">Timbre</dt><dd className="tabular-nums">{money(totals.timbre)}</dd></div>}
                    <div className="flex justify-between border-t border-line pt-1 font-semibold"><dt>Total TTC</dt><dd className="tabular-nums text-brand">{money(totals.ttc)} DA</dd></div>
                    <p className="pt-1 text-xs text-faint">{amountInWords(totals.ttc)}</p>
                  </dl>
                )}
              </Block>
            </>
          )}

          {meta.blocks.includes("conditions") && (
            <Block title="Conditions">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Conditions de paiement" className="sm:col-span-2"><textarea className="input min-h-16 text-sm" value={d.conditions?.payment ?? ""} onChange={(e) => setData({ conditions: { ...d.conditions, payment: e.target.value } })} /></Field>
                {doc.kind === "bon_commande"
                  ? <Field label="Livraison" className="sm:col-span-2"><textarea className="input min-h-16 text-sm" value={d.conditions?.delivery ?? ""} onChange={(e) => setData({ conditions: { ...d.conditions, delivery: e.target.value } })} /></Field>
                  : doc.kind !== "facture" && <Field label="Délais d'exécution" className="sm:col-span-2"><textarea className="input min-h-16 text-sm" value={d.conditions?.delay ?? ""} onChange={(e) => setData({ conditions: { ...d.conditions, delay: e.target.value } })} /></Field>}
                {(doc.kind === "devis" || doc.kind === "proposition" || doc.kind === "proforma") && (
                  <Field label="Validité (jours)"><input className="input" type="number" min={1} value={d.conditions?.validity_days ?? 30} onChange={(e) => setData({ conditions: { ...d.conditions, validity_days: Number(e.target.value) } })} /></Field>
                )}
                <Field label="Remarques" className="sm:col-span-2"><div className="mb-1 flex justify-end"><AiWrite docId={doc.id} field="Remarques / conditions particulières" value={d.conditions?.notes ?? ""} onChange={(notes) => setData({ conditions: { ...d.conditions, notes } })} /></div><textarea className="input min-h-16 text-sm" value={d.conditions?.notes ?? ""} onChange={(e) => setData({ conditions: { ...d.conditions, notes: e.target.value } })} /></Field>
              </div>
            </Block>
          )}

          {meta.blocks.includes("statement") && (
            <Block title="Contenu automatique" hint="Le relevé reprend les factures émises et les paiements enregistrés sur la période.">
              <p className="text-sm text-muted">Enregistrez les paiements depuis les factures ou le dossier projet : ils apparaissent ici automatiquement.</p>
            </Block>
          )}

          <label className="flex items-center gap-2 px-1 text-sm text-muted">
            <input type="checkbox" className="accent-[#ED9C35]" checked={!!d.signatures} onChange={(e) => setData({ signatures: e.target.checked })} /> Afficher le bloc signatures
          </label>
        </div>

        {/* ---------------- Preview ---------------- */}
        <div className="hidden lg:block">
          <div className="sticky top-20">
            <div className="mb-2 flex items-center justify-between text-xs text-faint">
              <span>Aperçu PDF (A4)</span>
              {rendering && <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> mise à jour…</span>}
            </div>
            <div className={clsx("overflow-hidden rounded-xl border border-line bg-white transition", rendering && "opacity-80")} style={{ height: "calc(100dvh - 150px)" }}>
              {pdfUrl ? <iframe key={pdfUrl} src={pdfUrl + "#toolbar=0&navpanes=0&view=FitH"} className="h-full w-full" title="Aperçu" /> : <Spinner className="h-full bg-panel" />}
            </div>
          </div>
        </div>
      </div>

      {doc.kind === "facture" && (
        <PaymentForm open={payOpen} onClose={() => { setPayOpen(false); load(); }} clientId={doc.client_id} dealId={doc.deal_id}
          invoiceId={doc.id} defaultAmount={Math.max(0, Number(totals?.ttc ?? 0) - Number(doc.amount_paid || 0))} />
      )}
    </>
  );
}
