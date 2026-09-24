"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { supabaseBrowser } from "@/lib/supabase/client";
import { DOC_KINDS, PHASES, type DocKind } from "@/lib/documents/config";
import { createDocument } from "@/lib/documents/data";
import { Button, Field, Modal, useToast } from "../ui";

type Opt = { id: string; company_name: string };
type DealOpt = { id: string; title: string; client_id: string };

export function NewDocumentModal({ open, onClose, clientId, dealId, kind: initialKind }: {
  open: boolean; onClose: () => void; clientId?: string; dealId?: string | null; kind?: DocKind;
}) {
  const sb = supabaseBrowser();
  const router = useRouter();
  const toast = useToast();
  const [clients, setClients] = useState<Opt[]>([]);
  const [deals, setDeals] = useState<DealOpt[]>([]);
  const [kind, setKind] = useState<DocKind>(initialKind ?? "devis");
  const [client, setClient] = useState(clientId ?? "");
  const [deal, setDeal] = useState(dealId ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKind(initialKind ?? "devis"); setClient(clientId ?? ""); setDeal(dealId ?? "");
    sb.from("clients").select("id,company_name").order("company_name").then(({ data }) => setClients((data as Opt[]) ?? []));
    sb.from("deals").select("id,title,client_id").order("created_at", { ascending: false }).then(({ data }) => setDeals((data as DealOpt[]) ?? []));
  }, [open, clientId, dealId, initialKind, sb]);

  const create = async () => {
    if (!client) return toast("Choisissez un client", "err");
    setBusy(true);
    try {
      const id = await createDocument(kind, { clientId: client, dealId: deal || null });
      onClose();
      router.push("/documents/" + id);
    } catch (e) { toast((e as Error).message, "err"); }
    setBusy(false);
  };

  const clientDeals = deals.filter((d) => d.client_id === client);

  return (
    <Modal open={open} onClose={onClose} title="Nouveau document" wide
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={create} loading={busy}>Créer et éditer</Button></>}>
      <div className="space-y-4">
        {PHASES.map((p) => (
          <div key={p.key}>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{p.label} <span className="font-normal normal-case text-faint">· {p.hint}</span></p>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {p.kinds.map((k) => (
                <button key={k} type="button" onClick={() => setKind(k)}
                  className={clsx("rounded-lg border p-2.5 text-left transition", kind === k ? "border-brand bg-brand-soft" : "border-line hover:border-line-2")}>
                  <p className={clsx("text-sm font-medium", kind === k && "text-brand")}>{DOC_KINDS[k].label}</p>
                  <p className="text-xs text-faint">{DOC_KINDS[k].description}</p>
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="grid grid-cols-1 gap-3 border-t border-line pt-4 sm:grid-cols-2">
          <Field label="Client *">
            <select className="input" value={client} onChange={(e) => { setClient(e.target.value); setDeal(""); }} disabled={!!clientId}>
              <option value="">Sélectionner…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
            </select>
          </Field>
          <Field label="Projet / opportunité (recommandé)">
            <select className="input" value={deal} onChange={(e) => setDeal(e.target.value)} disabled={!client || !!dealId}>
              <option value="">Aucun</option>
              {clientDeals.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
            </select>
          </Field>
        </div>
        <p className="text-xs text-faint">Le document est pré-rempli avec les informations du client, du projet et de votre société (Paramètres → Société). Tout reste modifiable.</p>
      </div>
    </Modal>
  );
}
