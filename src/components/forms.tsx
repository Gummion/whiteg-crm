"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  ACTIVITY_TYPES, CLIENT_STATUSES, DEAL_STAGES, OFFER_CATEGORIES, PRIORITIES, PRODUCT_FORMATS, SECTORS, SOURCES, WILAYAS,
} from "@/lib/constants";
import type { Client, Contact, Deal, Task } from "@/lib/types";
import { fromLocalInput, toLocalInput } from "@/lib/format";
import { emitChange } from "@/lib/events";
import { Button, Field, Modal, useToast } from "./ui";
import { useCrm } from "./crm-context";

type Opt = { id: string; company_name: string };

function useClientOptions(enabled: boolean) {
  const [opts, setOpts] = useState<Opt[]>([]);
  useEffect(() => {
    if (!enabled) return;
    supabaseBrowser().from("clients").select("id,company_name").order("company_name")
      .then(({ data }: { data: Opt[] | null }) => setOpts(data ?? []));
  }, [enabled]);
  return opts;
}

const clean = <T extends Record<string, unknown>>(o: T) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === "" ? null : v])) as T;

/* =================== CLIENT =================== */
export function ClientForm({ open, onClose, client, onSaved }: { open: boolean; onClose: () => void; client?: Client | null; onSaved?: (id: string) => void }) {
  const sb = supabaseBrowser();
  const toast = useToast();
  const { user } = useCrm();
  const empty = {
    company_name: "", sector: "nutraceutique", status: "prospect", source: "site_web", wilaya: "", city: "", address: "",
    phone: "", email: "", website: "", rc_number: "", nif: "", notes: "", tags: "", next_followup_at: "",
  };
  const [f, setF] = useState(empty);
  const [contact, setContact] = useState({ full_name: "", job_title: "", phone: "", email: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (client) {
      setF({
        company_name: client.company_name, sector: client.sector, status: client.status, source: client.source,
        wilaya: client.wilaya ?? "", city: client.city ?? "", address: client.address ?? "", phone: client.phone ?? "",
        email: client.email ?? "", website: client.website ?? "", rc_number: client.rc_number ?? "", nif: client.nif ?? "",
        notes: client.notes ?? "", tags: (client.tags ?? []).join(", "), next_followup_at: toLocalInput(client.next_followup_at),
      });
    } else {
      setF(empty);
      setContact({ full_name: "", job_title: "", phone: "", email: "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, client]);

  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  const save = async () => {
    if (!f.company_name.trim()) return toast("Le nom est obligatoire", "err");
    setSaving(true);
    const payload = clean({
      ...f,
      tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean),
      next_followup_at: fromLocalInput(f.next_followup_at),
    });
    let id = client?.id;
    if (client) {
      const { error } = await sb.from("clients").update(payload).eq("id", client.id);
      if (error) { setSaving(false); return toast(error.message, "err"); }
    } else {
      const { data, error } = await sb.from("clients").insert({ ...payload, owner_id: user?.id }).select("id").single();
      if (error) { setSaving(false); return toast(error.message, "err"); }
      id = data.id;
      if (contact.full_name.trim()) {
        await sb.from("contacts").insert(clean({ ...contact, whatsapp: contact.phone, client_id: id, is_primary: true }));
      }
    }
    setSaving(false);
    toast(client ? "Client mis à jour" : "Client créé");
    emitChange();
    onClose();
    if (id) onSaved?.(id);
  };

  return (
    <Modal open={open} onClose={onClose} title={client ? "Modifier le client" : "Nouveau client"} wide
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={save} loading={saving}>Enregistrer</Button></>}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Entreprise / Raison sociale *" className="sm:col-span-2">
          <input className="input" value={f.company_name} onChange={set("company_name")} placeholder="Ex : Laboratoire Nutri-Santé SARL" autoFocus />
        </Field>
        <Field label="Secteur"><select className="input" value={f.sector} onChange={set("sector")}>{SECTORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Field>
        <Field label="Statut"><select className="input" value={f.status} onChange={set("status")}>{CLIENT_STATUSES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Field>
        <Field label="Source"><select className="input" value={f.source} onChange={set("source")}>{SOURCES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Field>
        <Field label="Wilaya"><select className="input" value={f.wilaya} onChange={set("wilaya")}><option value="">—</option>{WILAYAS.map((w) => <option key={w} value={w}>{w}</option>)}</select></Field>
        <Field label="Téléphone"><input className="input" type="tel" value={f.phone} onChange={set("phone")} placeholder="0550 00 00 00" /></Field>
        <Field label="Email"><input className="input" type="email" value={f.email} onChange={set("email")} /></Field>
        <Field label="Ville"><input className="input" value={f.city} onChange={set("city")} /></Field>
        <Field label="Site web"><input className="input" value={f.website} onChange={set("website")} placeholder="https://" /></Field>
        <Field label="N° RC"><input className="input" value={f.rc_number} onChange={set("rc_number")} /></Field>
        <Field label="NIF"><input className="input" value={f.nif} onChange={set("nif")} /></Field>
        <Field label="Prochaine relance"><input className="input" type="datetime-local" value={f.next_followup_at} onChange={set("next_followup_at")} /></Field>
        <Field label="Tags (séparés par des virgules)"><input className="input" value={f.tags} onChange={set("tags")} placeholder="gummies, VIP, export" /></Field>
        <Field label="Notes" className="sm:col-span-2"><textarea className="input min-h-20" value={f.notes} onChange={set("notes")} /></Field>
      </div>
      {!client && (
        <div className="mt-5 rounded-xl border border-line bg-panel-2/50 p-3">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Contact principal (optionnel)</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nom complet"><input className="input" value={contact.full_name} onChange={(e) => setContact({ ...contact, full_name: e.target.value })} /></Field>
            <Field label="Fonction"><input className="input" value={contact.job_title} onChange={(e) => setContact({ ...contact, job_title: e.target.value })} placeholder="Gérant, Resp. qualité…" /></Field>
            <Field label="Téléphone / WhatsApp"><input className="input" type="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></Field>
            <Field label="Email"><input className="input" type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} /></Field>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* =================== CONTACT =================== */
export function ContactForm({ open, onClose, clientId, contact }: { open: boolean; onClose: () => void; clientId: string; contact?: Contact | null }) {
  const sb = supabaseBrowser();
  const toast = useToast();
  const empty = { full_name: "", job_title: "", phone: "", whatsapp: "", email: "", is_primary: false, notes: "" };
  const [f, setF] = useState(empty);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setF(contact ? { full_name: contact.full_name, job_title: contact.job_title ?? "", phone: contact.phone ?? "", whatsapp: contact.whatsapp ?? "", email: contact.email ?? "", is_primary: contact.is_primary, notes: contact.notes ?? "" } : empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contact]);
  const save = async () => {
    if (!f.full_name.trim()) return toast("Nom obligatoire", "err");
    setSaving(true);
    const payload = clean({ ...f, whatsapp: f.whatsapp || f.phone, client_id: clientId });
    const { error } = contact ? await sb.from("contacts").update(payload).eq("id", contact.id) : await sb.from("contacts").insert(payload);
    setSaving(false);
    if (error) return toast(error.message, "err");
    toast("Contact enregistré"); emitChange(); onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title={contact ? "Modifier le contact" : "Nouveau contact"}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={save} loading={saving}>Enregistrer</Button></>}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Nom complet *" className="sm:col-span-2"><input className="input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} autoFocus /></Field>
        <Field label="Fonction"><input className="input" value={f.job_title} onChange={(e) => setF({ ...f, job_title: e.target.value })} /></Field>
        <Field label="Email"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Téléphone"><input className="input" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="WhatsApp (si différent)"><input className="input" type="tel" value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" className="accent-[#ED9C35]" checked={f.is_primary} onChange={(e) => setF({ ...f, is_primary: e.target.checked })} /> Contact principal
        </label>
      </div>
    </Modal>
  );
}

/* =================== DEAL =================== */
export function DealForm({ open, onClose, deal, clientId, onSaved }: { open: boolean; onClose: () => void; deal?: Deal | null; clientId?: string; onSaved?: () => void }) {
  const sb = supabaseBrowser();
  const toast = useToast();
  const { user } = useCrm();
  const opts = useClientOptions(open && !clientId);
  const empty = {
    client_id: clientId ?? "", title: "", category: "B", product_format: "", stage: "nouveau", amount: "", deposit_amount: "",
    probability: "10", quote_ref: "", expected_close: "", delivery_date: "", notes: "", lost_reason: "",
  };
  const [f, setF] = useState(empty);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setF(deal ? {
      client_id: deal.client_id, title: deal.title, category: deal.category, product_format: deal.product_format ?? "", stage: deal.stage,
      amount: String(deal.amount ?? ""), deposit_amount: String(deal.deposit_amount ?? ""), probability: String(deal.probability),
      quote_ref: deal.quote_ref ?? "", expected_close: deal.expected_close ?? "", delivery_date: deal.delivery_date ?? "",
      notes: deal.notes ?? "", lost_reason: deal.lost_reason ?? "",
    } : { ...empty, client_id: clientId ?? "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, deal, clientId]);
  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const v = e.target.value;
    setF((s) => {
      const n = { ...s, [k]: v };
      if (k === "stage") n.probability = String(DEAL_STAGES.find((x) => x.value === v)?.prob ?? s.probability);
      return n;
    });
  };
  const save = async () => {
    if (!f.client_id) return toast("Choisissez un client", "err");
    if (!f.title.trim()) return toast("Titre obligatoire", "err");
    setSaving(true);
    const payload = clean({ ...f, amount: Number(f.amount || 0), deposit_amount: Number(f.deposit_amount || 0), probability: Number(f.probability || 0) });
    const { error } = deal
      ? await sb.from("deals").update(payload).eq("id", deal.id)
      : await sb.from("deals").insert({ ...payload, owner_id: user?.id });
    setSaving(false);
    if (error) return toast(error.message, "err");
    toast(deal ? "Opportunité mise à jour" : "Opportunité créée"); emitChange(); onSaved?.(); onClose();
  };
  const remove = async () => {
    if (!deal || !confirm("Supprimer cette opportunité ?")) return;
    const { error } = await sb.from("deals").delete().eq("id", deal.id);
    if (error) return toast(error.message, "err");
    toast("Opportunité supprimée"); emitChange(); onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title={deal ? "Modifier l'opportunité" : "Nouvelle opportunité"} wide
      footer={<>
        {deal && <Button variant="danger" className="mr-auto" onClick={remove}>Supprimer</Button>}
        <Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={save} loading={saving}>Enregistrer</Button>
      </>}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {!clientId && (
          <Field label="Client *" className="sm:col-span-2">
            <select className="input" value={f.client_id} onChange={set("client_id")} disabled={!!deal}>
              <option value="">Sélectionner…</option>
              {opts.map((o) => <option key={o.id} value={o.id}>{o.company_name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Intitulé du projet *" className="sm:col-span-2"><input className="input" value={f.title} onChange={set("title")} placeholder="Ex : Formulation gummies vitamine D — 20 000 u." autoFocus /></Field>
        <Field label="Catégorie d'offre"><select className="input" value={f.category} onChange={set("category")}>{OFFER_CATEGORIES.map((o) => <option key={o.value} value={o.value}>{o.value} · {o.label}</option>)}</select></Field>
        <Field label="Format produit"><select className="input" value={f.product_format} onChange={set("product_format")}><option value="">—</option>{PRODUCT_FORMATS.map((p) => <option key={p}>{p}</option>)}</select></Field>
        <Field label="Étape"><select className="input" value={f.stage} onChange={set("stage")}>{DEAL_STAGES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Field>
        <Field label="Probabilité (%)"><input className="input" type="number" min={0} max={100} value={f.probability} onChange={set("probability")} /></Field>
        <Field label="Montant du devis (DA)"><input className="input" type="number" inputMode="numeric" value={f.amount} onChange={set("amount")} placeholder="0" /></Field>
        <Field label="Acompte (DA)"><input className="input" type="number" inputMode="numeric" value={f.deposit_amount} onChange={set("deposit_amount")} placeholder="100 % avant démarrage" /></Field>
        <Field label="Réf. devis"><input className="input" value={f.quote_ref} onChange={set("quote_ref")} placeholder="WG-2026-001" /></Field>
        <Field label="Clôture prévue"><input className="input" type="date" value={f.expected_close} onChange={set("expected_close")} /></Field>
        <Field label="Livraison prévue"><input className="input" type="date" value={f.delivery_date} onChange={set("delivery_date")} /></Field>
        {f.stage === "perdu" && <Field label="Raison de la perte"><input className="input" value={f.lost_reason} onChange={set("lost_reason")} placeholder="Prix, délai, concurrent…" /></Field>}
        <Field label="Notes" className="sm:col-span-2"><textarea className="input min-h-20" value={f.notes} onChange={set("notes")} /></Field>
      </div>
    </Modal>
  );
}

/* =================== TASK =================== */
export function TaskForm({ open, onClose, task, clientId, dealId }: { open: boolean; onClose: () => void; task?: Task | null; clientId?: string; dealId?: string }) {
  const sb = supabaseBrowser();
  const toast = useToast();
  const { user, members } = useCrm();
  const opts = useClientOptions(open && !clientId);
  const tomorrow9 = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return toLocalInput(d.toISOString()); };
  const empty = { title: "", description: "", client_id: clientId ?? "", due_at: "", priority: "normale", assignee_id: user?.id ?? "" };
  const [f, setF] = useState(empty);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setF(task ? {
      title: task.title, description: task.description ?? "", client_id: task.client_id ?? "", due_at: toLocalInput(task.due_at),
      priority: task.priority, assignee_id: task.assignee_id ?? "",
    } : { ...empty, client_id: clientId ?? "", due_at: tomorrow9(), assignee_id: user?.id ?? "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task, clientId]);
  const save = async () => {
    if (!f.title.trim()) return toast("Titre obligatoire", "err");
    setSaving(true);
    const payload = clean({ ...f, due_at: fromLocalInput(f.due_at), deal_id: task?.deal_id ?? dealId ?? null, ...(task && task.due_at !== fromLocalInput(f.due_at) ? { reminded_at: null } : {}) });
    const { error } = task ? await sb.from("tasks").update(payload).eq("id", task.id) : await sb.from("tasks").insert(payload);
    setSaving(false);
    if (error) return toast(error.message, "err");
    toast(task ? "Tâche mise à jour" : "Tâche créée"); emitChange(); onClose();
  };
  const quick = (days: number, h = 9) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(h, 0, 0, 0); setF((s) => ({ ...s, due_at: toLocalInput(d.toISOString()) })); };
  return (
    <Modal open={open} onClose={onClose} title={task ? "Modifier la tâche" : "Nouvelle tâche / relance"}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={save} loading={saving}>Enregistrer</Button></>}>
      <div className="grid grid-cols-1 gap-3">
        <Field label="Quoi faire ? *"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Relancer pour validation du devis" autoFocus /></Field>
        {!clientId && (
          <Field label="Client lié">
            <select className="input" value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })}>
              <option value="">Aucun</option>{opts.map((o) => <option key={o.id} value={o.id}>{o.company_name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Échéance">
          <input className="input" type="datetime-local" value={f.due_at} onChange={(e) => setF({ ...f, due_at: e.target.value })} />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[["Aujourd'hui 17h", 0, 17], ["Demain", 1, 9], ["Dans 3 j", 3, 9], ["Dans 1 sem.", 7, 9]].map(([l, d, h]) => (
              <button key={l as string} type="button" onClick={() => quick(d as number, h as number)} className="rounded-md border border-line px-2 py-1 text-xs text-muted hover:border-brand hover:text-brand">{l}</button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Priorité"><select className="input" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>{PRIORITIES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Field>
          <Field label="Assigné à"><select className="input" value={f.assignee_id} onChange={(e) => setF({ ...f, assignee_id: e.target.value })}><option value="">Toute l&apos;équipe</option>{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email}</option>)}</select></Field>
        </div>
        <Field label="Détails"><textarea className="input min-h-16" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

/* =================== ACTIVITY =================== */
export function ActivityForm({ open, onClose, clientId, deals = [] }: { open: boolean; onClose: () => void; clientId: string; deals?: Pick<Deal, "id" | "title">[] }) {
  const sb = supabaseBrowser();
  const toast = useToast();
  const { user } = useCrm();
  const empty = { type: "appel", subject: "", body: "", occurred_at: "", deal_id: "", followup: "" };
  const [f, setF] = useState(empty);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setF({ ...empty, occurred_at: toLocalInput(new Date().toISOString()) }); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const save = async () => {
    const subject = f.subject.trim() || ACTIVITY_TYPES.find((t) => t.value === f.type)?.label || "Note";
    setSaving(true);
    const { error } = await sb.from("activities").insert(clean({
      client_id: clientId, deal_id: f.deal_id, type: f.type, subject, body: f.body, occurred_at: fromLocalInput(f.occurred_at) ?? new Date().toISOString(),
    }));
    if (!error && f.followup) {
      await sb.from("tasks").insert({ title: "Relance : " + subject, client_id: clientId, deal_id: f.deal_id || null, due_at: fromLocalInput(f.followup), assignee_id: user?.id, priority: "normale" });
    }
    setSaving(false);
    if (error) return toast(error.message, "err");
    toast("Activité enregistrée"); emitChange(); onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="Enregistrer une interaction"
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={save} loading={saving}>Enregistrer</Button></>}>
      <div className="grid grid-cols-1 gap-3">
        <div className="flex flex-wrap gap-1.5">
          {ACTIVITY_TYPES.map((t) => (
            <button key={t.value} type="button" onClick={() => setF({ ...f, type: t.value })}
              className={"rounded-lg border px-3 py-1.5 text-xs " + (f.type === t.value ? "border-brand bg-brand-soft text-brand" : "border-line text-muted hover:text-fg")}>
              {t.label}
            </button>
          ))}
        </div>
        <Field label="Résumé"><input className="input" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} placeholder="Ex : Appel — intéressé par gummies magnésium" /></Field>
        <Field label="Détails / compte-rendu"><textarea className="input min-h-24" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Date"><input className="input" type="datetime-local" value={f.occurred_at} onChange={(e) => setF({ ...f, occurred_at: e.target.value })} /></Field>
          {deals.length > 0 && (
            <Field label="Opportunité liée"><select className="input" value={f.deal_id} onChange={(e) => setF({ ...f, deal_id: e.target.value })}><option value="">Aucune</option>{deals.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select></Field>
          )}
        </div>
        <Field label="Planifier une relance (optionnel)"><input className="input" type="datetime-local" value={f.followup} onChange={(e) => setF({ ...f, followup: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
