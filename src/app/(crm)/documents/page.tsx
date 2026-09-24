"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { FileText, Plus, Search } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Doc } from "@/lib/documents/config";
import { DOC_KINDS, DOC_STATUS, KIND_ORDER, PHASES } from "@/lib/documents/config";
import { money } from "@/lib/documents/money";
import { useOnChange } from "@/lib/events";
import { Button, Empty, PageHeader, Spinner } from "@/components/ui";
import { DocRow } from "@/components/documents/doc-list";
import { NewDocumentModal } from "@/components/documents/new-document";

export default function DocumentsPage() {
  const sb = supabaseBrowser();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<string>("all");
  const [kind, setKind] = useState("all");
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const { data } = await sb.from("documents").select("*, clients(id,company_name), deals(id,title)").order("created_at", { ascending: false }).limit(500);
    setDocs((data as Doc[]) ?? []);
    setLoading(false);
  }, [sb]);
  useEffect(() => { load(); }, [load]);
  useOnChange(load);

  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return docs
      .filter((d) => phase === "all" || DOC_KINDS[d.kind].phase === phase)
      .filter((d) => kind === "all" || d.kind === kind)
      .filter((d) => status === "all" || d.status === status)
      .filter((d) => !n || [d.number, d.clients?.company_name, d.data?.object, d.title].some((v) => v?.toLowerCase().includes(n)));
  }, [docs, phase, kind, status, q]);

  const invoices = docs.filter((d) => d.kind === "facture" && !["brouillon", "annule"].includes(d.status));
  const billed = invoices.reduce((a, d) => a + Number(d.total_ttc), 0);
  const cashed = invoices.reduce((a, d) => a + Number(d.amount_paid), 0);
  const pendingQuotes = docs.filter((d) => d.kind === "devis" && d.status === "emis");

  return (
    <>
      <PageHeader title="Documents" subtitle="Devis, contrats, rapports, factures — générés en PDF aux couleurs White G"
        actions={<Button size="sm" className="h-9" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Nouveau document</Button>} />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Facturé (TTC)" value={money(billed) + " DA"} />
        <Stat label="Encaissé" value={money(cashed) + " DA"} />
        <Stat label="Reste à encaisser" value={money(billed - cashed) + " DA"} warn={billed - cashed > 0} />
        <Stat label="Devis en attente" value={`${pendingQuotes.length} · ${money(pendingQuotes.reduce((a, d) => a + Number(d.total_ttc), 0))} DA`} />
      </div>

      <div className="-mx-3 mb-3 flex gap-1.5 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0">
        {[{ key: "all", label: "Tous" }, ...PHASES.map((p) => ({ key: p.key, label: p.label }))].map((p) => (
          <button key={p.key} onClick={() => { setPhase(p.key); setKind("all"); }}
            className={clsx("shrink-0 rounded-full border px-3 py-1.5 text-xs", phase === p.key ? "border-brand bg-brand-soft text-brand" : "border-line text-muted hover:text-fg")}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:flex">
        <div className="relative col-span-2 sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input className="input pl-9" placeholder="N°, client, objet…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input sm:w-56" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="all">Tous types</option>
          {KIND_ORDER.filter((k) => phase === "all" || DOC_KINDS[k].phase === phase).map((k) => <option key={k} value={k}>{DOC_KINDS[k].label}</option>)}
        </select>
        <select className="input sm:w-48" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">Tous statuts</option>
          {Object.entries(DOC_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {loading ? <Spinner /> : list.length === 0 ? (
        <div className="card"><Empty icon={FileText} title={docs.length ? "Aucun résultat" : "Aucun document pour l'instant"}
          text="Créez un devis, un contrat ou une facture : il est pré-rempli avec les données du client et du projet."
          action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Nouveau document</Button>} /></div>
      ) : (
        <div className="card divide-y divide-line/60 overflow-hidden">{list.map((d) => <DocRow key={d.id} d={d} showClient />)}</div>
      )}
      <NewDocumentModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="card p-3.5">
      <p className="text-xs text-muted">{label}</p>
      <p className={clsx("mt-1 truncate text-base font-semibold tabular-nums sm:text-lg", warn && "text-brand")}>{value}</p>
    </div>
  );
}
