"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { PAYMENT_METHODS } from "@/lib/documents/config";
import { money } from "@/lib/documents/money";
import { emitChange } from "@/lib/events";
import { Button, Field, Modal, useToast } from "../ui";

type Inv = { id: string; number: string; total_ttc: number; amount_paid: number };

export function PaymentForm({ open, onClose, clientId, dealId, invoiceId, defaultAmount }: {
  open: boolean; onClose: () => void; clientId: string; dealId?: string | null; invoiceId?: string | null; defaultAmount?: number;
}) {
  const sb = supabaseBrowser();
  const toast = useToast();
  const [invoices, setInvoices] = useState<Inv[]>([]);
  const [f, setF] = useState({ amount: "", paid_at: "", method: "virement", reference: "", document_id: "", notes: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setF({ amount: defaultAmount ? String(defaultAmount) : "", paid_at: new Date().toISOString().slice(0, 10), method: "virement", reference: "", document_id: invoiceId ?? "", notes: "" });
    sb.from("documents").select("id,number,total_ttc,amount_paid").eq("client_id", clientId).in("kind", ["facture", "proforma"]).neq("status", "annule").order("issue_date", { ascending: false })
      .then(({ data }) => setInvoices((data as Inv[]) ?? []));
  }, [open, clientId, invoiceId, defaultAmount, sb]);

  const save = async () => {
    const amount = Number(f.amount);
    if (!(amount > 0)) return toast("Montant invalide", "err");
    setSaving(true);
    const { error } = await sb.from("payments").insert({
      client_id: clientId, deal_id: dealId ?? null, document_id: f.document_id || null, amount, paid_at: f.paid_at,
      method: f.method, reference: f.reference || null, notes: f.notes || null,
    });
    setSaving(false);
    if (error) return toast(error.message, "err");
    toast("Paiement enregistré"); emitChange(); onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Enregistrer un paiement"
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={save} loading={saving}>Enregistrer</Button></>}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Montant (DA) *"><input className="input" type="number" inputMode="decimal" min={0} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} autoFocus /></Field>
        <Field label="Date"><input className="input" type="date" value={f.paid_at} onChange={(e) => setF({ ...f, paid_at: e.target.value })} /></Field>
        <Field label="Mode"><select className="input" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>{PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></Field>
        <Field label="Référence (n° chèque, virement…)"><input className="input" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
        <Field label="Facture / proforma réglée" className="sm:col-span-2">
          <select className="input" value={f.document_id} onChange={(e) => setF({ ...f, document_id: e.target.value })}>
            <option value="">Acompte non rattaché</option>
            {invoices.map((i) => <option key={i.id} value={i.id}>{i.number} — {money(i.total_ttc)} DA (réglé {money(i.amount_paid)})</option>)}
          </select>
        </Field>
        <Field label="Notes" className="sm:col-span-2"><input className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
      <p className="mt-3 text-xs text-faint">Le statut de la facture et l&apos;étape du projet (« Acompte reçu ») sont mis à jour automatiquement.</p>
    </Modal>
  );
}
