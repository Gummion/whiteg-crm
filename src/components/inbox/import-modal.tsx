"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { supabaseBrowser } from "@/lib/supabase/client";
import { OFFER_CATEGORIES, PRODUCT_FORMATS, SECTORS, WILAYAS } from "@/lib/constants";
import type { Catalog, SiteClient, SiteLead, SiteMessage, SourceTable } from "@/lib/site-bridge";
import { guessCategory, guessFormat, guessSector, parseBudget, serviceName } from "@/lib/site-bridge";
import { emitChange } from "@/lib/events";
import { Button, Field, Modal, useToast } from "../ui";
import { useCrm } from "../crm-context";

export type InboxItem =
  | { table: "leads"; row: SiteLead }
  | { table: "contact_messages"; row: SiteMessage }
  | { table: "clients"; row: SiteClient };

export type Match = { id: string; company_name: string; reason: string };

type Draft = {
  mode: "new" | "existing";
  existingId: string;
  client: { company_name: string; sector: string; wilaya: string; city: string; phone: string; email: string; notes: string };
  contact: { enabled: boolean; full_name: string; job_title: string; phone: string; email: string };
  deal: { enabled: boolean; title: string; category: string; product_format: string; amount: string; quote_ref: string; notes: string };
  activity: { subject: string; body: string };
};

function buildDraft(item: InboxItem, cat: Catalog, matches: Match[]): Draft {
  const base: Draft = {
    mode: matches.length ? "existing" : "new",
    existingId: matches[0]?.id ?? "",
    client: { company_name: "", sector: "autre", wilaya: "", city: "", phone: "", email: "", notes: "" },
    contact: { enabled: true, full_name: "", job_title: "", phone: "", email: "" },
    deal: { enabled: false, title: "", category: "B", product_format: "", amount: "", quote_ref: "", notes: "" },
    activity: { subject: "", body: "" },
  };
  if (item.table === "leads") {
    const l = item.row;
    const services = (l.service_codes ?? []).map((c) => serviceName(c, cat));
    const full = `${l.first_name} ${l.last_name}`.trim();
    const details = [
      l.company_size && `Taille : ${l.company_size}`,
      l.budget_range && `Budget : ${l.budget_range}`,
      l.deadline_need && `Délai souhaité : ${l.deadline_need}`,
      services.length ? `Services : ${services.join(", ")}` : "",
    ].filter(Boolean).join("\n");
    return {
      ...base,
      client: { ...base.client, company_name: l.company_name || full, sector: guessSector(l.sector), phone: l.phone ?? "", email: l.email, notes: `Secteur déclaré : ${l.sector}\n${details}` },
      contact: { enabled: true, full_name: full, job_title: l.role_title ?? "", phone: l.phone ?? "", email: l.email },
      deal: {
        enabled: true,
        title: services.length ? services.join(" + ") : `Demande de devis ${l.reference}`,
        category: guessCategory(l, cat),
        product_format: guessFormat(`${l.message} ${services.join(" ")}`),
        amount: String(parseBudget(l.budget_range) || ""),
        quote_ref: l.reference,
        notes: `${details}\n\nMessage :\n${l.message}`,
      },
      activity: { subject: `Demande de devis site ${l.reference}`, body: l.message },
    };
  }
  if (item.table === "contact_messages") {
    const m = item.row;
    return {
      ...base,
      client: { ...base.client, company_name: m.name, email: m.email, notes: "" },
      contact: { enabled: true, full_name: m.name, job_title: "", phone: "", email: m.email },
      activity: { subject: m.subject ? `Message site : ${m.subject}` : "Message via le formulaire de contact", body: m.message },
    };
  }
  const c = item.row;
  return {
    ...base,
    client: { ...base.client, company_name: c.company_name || c.full_name, phone: c.phone ?? "", email: c.email ?? "" },
    contact: { enabled: true, full_name: c.full_name, job_title: "", phone: c.phone ?? "", email: c.email ?? "" },
    activity: { subject: "Client importé depuis le site", body: c.missions_count ? `${c.missions_count} mission(s) côté site.` : "" },
  };
}

export function ImportModal({ item, open, onClose, catalog, matches, onDone }: {
  item: InboxItem | null; open: boolean; onClose: () => void; catalog: Catalog; matches: Match[]; onDone: () => void;
}) {
  const sb = supabaseBrowser();
  const toast = useToast();
  const { user } = useCrm();
  const [d, setD] = useState<Draft | null>(null);
  const [allClients, setAllClients] = useState<{ id: string; company_name: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !item) return;
    setD(buildDraft(item, catalog, matches));
    sb.from("clients").select("id,company_name").order("company_name").then(({ data }) => setAllClients(data ?? []));
  }, [open, item, catalog, matches, sb]);

  if (!item || !d) return null;
  const set = <K extends keyof Draft>(k: K, patch: Partial<Draft[K]>) => setD((x) => (x ? { ...x, [k]: { ...(x[k] as object), ...patch } } : x));

  const save = async () => {
    if (d.mode === "new" && !d.client.company_name.trim()) return toast("Nom du client obligatoire", "err");
    if (d.mode === "existing" && !d.existingId) return toast("Choisissez le client existant", "err");
    setSaving(true);
    try {
      let clientId = d.existingId;
      if (d.mode === "new") {
        const { data, error } = await sb.from("clients").insert({
          company_name: d.client.company_name.trim(), sector: d.client.sector, status: "lead", source: "site_web",
          wilaya: d.client.wilaya || null, city: d.client.city || null, phone: d.client.phone || null, email: d.client.email || null,
          notes: d.client.notes || null, owner_id: user?.id, external_source: `site:${item.table}`, external_id: item.row.id,
        }).select("id").single();
        if (error) throw error;
        clientId = data.id;
      }
      if (d.contact.enabled && d.contact.full_name.trim()) {
        const exists = d.mode === "existing" && d.contact.email
          ? (await sb.from("contacts").select("id").eq("client_id", clientId).ilike("email", d.contact.email).maybeSingle()).data
          : null;
        if (!exists) {
          const { error } = await sb.from("contacts").insert({
            client_id: clientId, full_name: d.contact.full_name.trim(), job_title: d.contact.job_title || null,
            phone: d.contact.phone || null, whatsapp: d.contact.phone || null, email: d.contact.email || null, is_primary: d.mode === "new",
          });
          if (error) throw error;
        }
      }
      let dealId: string | null = null;
      if (d.deal.enabled && d.deal.title.trim()) {
        const { data, error } = await sb.from("deals").insert({
          client_id: clientId, title: d.deal.title.trim(), category: d.deal.category, product_format: d.deal.product_format || null,
          stage: "brief", probability: 20, amount: Number(d.deal.amount || 0), quote_ref: d.deal.quote_ref || null, notes: d.deal.notes || null, owner_id: user?.id,
        }).select("id").single();
        if (error) throw error;
        dealId = data.id;
      }
      if (d.activity.subject.trim()) {
        await sb.from("activities").insert({ client_id: clientId, deal_id: dealId, type: "email", subject: d.activity.subject, body: d.activity.body || null, occurred_at: item.row.created_at });
      }
      const { error: le } = await sb.from("inbox_links").upsert({
        source_table: item.table, external_id: item.row.id, status: d.mode === "new" ? "imported" : "linked", client_id: clientId, deal_id: dealId,
      }, { onConflict: "source_table,external_id" });
      if (le) throw le;
      toast(d.mode === "new" ? "Client créé dans le CRM" : "Rattaché au client existant");
      emitChange(); onDone(); onClose();
    } catch (e) {
      toast((e as Error).message, "err");
    }
    setSaving(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="Vérifier et importer dans le CRM" wide
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={save} loading={saving}>{d.mode === "new" ? "Créer dans le CRM" : "Ajouter au client"}</Button></>}>
      <p className="mb-4 rounded-lg bg-brand-soft px-3 py-2 text-xs text-brand">Champs pré-remplis depuis le site — vérifiez et corrigez avant de valider. Rien n&apos;est modifié dans la base du site.</p>

      {/* Client */}
      <div className="mb-3 grid grid-cols-2 rounded-lg bg-panel-2 p-1 text-sm">
        {(["new", "existing"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setD({ ...d, mode: m })}
            className={clsx("rounded-md py-1.5", d.mode === m ? "bg-panel font-medium shadow" : "text-muted")}>
            {m === "new" ? "Nouveau client" : `Client existant${matches.length ? ` (${matches.length} trouvé${matches.length > 1 ? "s" : ""})` : ""}`}
          </button>
        ))}
      </div>
      {d.mode === "existing" ? (
        <Field label="Rattacher à">
          <select className="input" value={d.existingId} onChange={(e) => setD({ ...d, existingId: e.target.value })}>
            <option value="">Choisir…</option>
            {matches.length > 0 && <optgroup label="Correspondances probables">{matches.map((m) => <option key={m.id} value={m.id}>{m.company_name} — {m.reason}</option>)}</optgroup>}
            <optgroup label="Tous les clients">{allClients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}</optgroup>
          </select>
        </Field>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Entreprise *" className="sm:col-span-2"><input className="input" value={d.client.company_name} onChange={(e) => set("client", { company_name: e.target.value })} /></Field>
          <Field label="Secteur"><select className="input" value={d.client.sector} onChange={(e) => set("client", { sector: e.target.value })}>{SECTORS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></Field>
          <Field label="Wilaya"><select className="input" value={d.client.wilaya} onChange={(e) => set("client", { wilaya: e.target.value })}><option value="">—</option>{WILAYAS.map((w) => <option key={w}>{w}</option>)}</select></Field>
          <Field label="Téléphone"><input className="input" value={d.client.phone} onChange={(e) => set("client", { phone: e.target.value })} /></Field>
          <Field label="Email"><input className="input" value={d.client.email} onChange={(e) => set("client", { email: e.target.value })} /></Field>
          <Field label="Notes" className="sm:col-span-2"><textarea className="input min-h-16 text-sm" value={d.client.notes} onChange={(e) => set("client", { notes: e.target.value })} /></Field>
        </div>
      )}

      {/* Contact */}
      <Section title="Contact" enabled={d.contact.enabled} onToggle={(v) => set("contact", { enabled: v })}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nom complet"><input className="input" value={d.contact.full_name} onChange={(e) => set("contact", { full_name: e.target.value })} /></Field>
          <Field label="Fonction"><input className="input" value={d.contact.job_title} onChange={(e) => set("contact", { job_title: e.target.value })} /></Field>
          <Field label="Téléphone / WhatsApp"><input className="input" value={d.contact.phone} onChange={(e) => set("contact", { phone: e.target.value })} /></Field>
          <Field label="Email"><input className="input" value={d.contact.email} onChange={(e) => set("contact", { email: e.target.value })} /></Field>
        </div>
      </Section>

      {/* Deal */}
      <Section title="Opportunité (étape « Brief reçu »)" enabled={d.deal.enabled} onToggle={(v) => set("deal", { enabled: v })}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Intitulé" className="sm:col-span-2"><input className="input" value={d.deal.title} onChange={(e) => set("deal", { title: e.target.value })} /></Field>
          <Field label="Catégorie d'offre"><select className="input" value={d.deal.category} onChange={(e) => set("deal", { category: e.target.value })}>{OFFER_CATEGORIES.map((o) => <option key={o.value} value={o.value}>{o.value} · {o.label}</option>)}</select></Field>
          <Field label="Format produit"><select className="input" value={d.deal.product_format} onChange={(e) => set("deal", { product_format: e.target.value })}><option value="">—</option>{PRODUCT_FORMATS.map((p) => <option key={p}>{p}</option>)}</select></Field>
          <Field label="Montant estimé (DA)"><input className="input" type="number" value={d.deal.amount} onChange={(e) => set("deal", { amount: e.target.value })} /></Field>
          <Field label="Référence"><input className="input" value={d.deal.quote_ref} onChange={(e) => set("deal", { quote_ref: e.target.value })} /></Field>
          <Field label="Notes" className="sm:col-span-2"><textarea className="input min-h-20 text-sm" value={d.deal.notes} onChange={(e) => set("deal", { notes: e.target.value })} /></Field>
        </div>
      </Section>

      {/* Activity */}
      <div className="mt-4 border-t border-line pt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Ajouté à l&apos;historique</p>
        <Field label="Résumé"><input className="input" value={d.activity.subject} onChange={(e) => set("activity", { subject: e.target.value })} /></Field>
        {d.activity.body && <p className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg bg-panel-2 p-2.5 text-xs text-muted">{d.activity.body}</p>}
      </div>
    </Modal>
  );
}

function Section({ title, enabled, onToggle, children }: { title: string; enabled: boolean; onToggle: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <div className="mt-4 border-t border-line pt-4">
      <label className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
        <input type="checkbox" className="accent-[#ED9C35]" checked={enabled} onChange={(e) => onToggle(e.target.checked)} /> {title}
      </label>
      {enabled && children}
    </div>
  );
}

export type { SourceTable };
