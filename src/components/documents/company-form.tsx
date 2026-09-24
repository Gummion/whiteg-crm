"use client";

import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Company } from "@/lib/documents/config";
import { loadCompany } from "@/lib/documents/data";
import { Button, Field, useToast } from "../ui";

const FIELDS: { k: keyof Company; label: string; span?: boolean; area?: boolean; type?: string }[] = [
  { k: "legal_name", label: "Raison sociale" },
  { k: "trade_name", label: "Nom commercial" },
  { k: "tagline", label: "Signature (sous le logo)", span: true },
  { k: "address", label: "Adresse", span: true },
  { k: "city", label: "Commune / ville" },
  { k: "wilaya", label: "Wilaya" },
  { k: "phone", label: "Téléphone" },
  { k: "email", label: "Email" },
  { k: "website", label: "Site web" },
  { k: "capital", label: "Capital social" },
  { k: "rc", label: "N° RC" },
  { k: "nif", label: "NIF" },
  { k: "nis", label: "NIS" },
  { k: "ai", label: "Article d'imposition (AI)" },
  { k: "bank_name", label: "Banque / agence" },
  { k: "rib", label: "RIB" },
  { k: "tva_rate", label: "TVA par défaut (%)", type: "number" },
  { k: "quote_validity_days", label: "Validité des devis (jours)", type: "number" },
  { k: "signatory_name", label: "Signataire (nom)" },
  { k: "signatory_title", label: "Qualité du signataire" },
  { k: "payment_terms", label: "Conditions de paiement par défaut", span: true, area: true },
  { k: "jurisdiction", label: "Juridiction compétente (contrats)", span: true },
];

export function CompanyForm({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const [co, setCo] = useState<Company | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { loadCompany().then(setCo); }, []);
  if (!co) return null;
  const missing = (["rc", "nif", "nis", "ai", "rib", "address"] as (keyof Company)[]).filter((k) => !co[k]);
  const save = async () => {
    setSaving(true);
    const { error } = await supabaseBrowser().from("company_settings").update({ ...co, updated_at: new Date().toISOString() }).eq("id", 1);
    setSaving(false);
    if (error) return toast(error.message, "err");
    toast("Informations société enregistrées — elles apparaissent sur tous les PDF");
  };
  return (
    <section className="card p-4 sm:p-5 lg:col-span-2">
      <h2 className="mb-1 flex items-center gap-2 font-semibold"><Building2 className="h-4 w-4 text-brand" /> Société (en-tête et mentions légales des PDF)</h2>
      <p className="mb-4 text-sm text-muted">Ces informations figurent sur tous les documents générés. Les mentions RC, NIF, NIS, AI et RIB sont obligatoires sur les factures.</p>
      {missing.length > 0 && <p className="mb-4 rounded-lg bg-brand-soft px-3 py-2 text-xs text-brand">À compléter : {missing.map((k) => FIELDS.find((f) => f.k === k)?.label).join(", ")}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {FIELDS.map((f) => (
          <Field key={f.k} label={f.label} className={f.span ? "sm:col-span-2" : ""}>
            {f.area
              ? <textarea className="input min-h-16" disabled={!canEdit} value={(co[f.k] as string) ?? ""} onChange={(e) => setCo({ ...co, [f.k]: e.target.value })} />
              : <input className="input" disabled={!canEdit} type={f.type ?? "text"} value={(co[f.k] as string | number) ?? ""}
                  onChange={(e) => setCo({ ...co, [f.k]: f.type === "number" ? Number(e.target.value) : e.target.value })} />}
          </Field>
        ))}
      </div>
      {canEdit ? <div className="mt-4 flex justify-end"><Button onClick={save} loading={saving}>Enregistrer</Button></div>
        : <p className="mt-3 text-xs text-faint">Seul un administrateur peut modifier ces informations.</p>}
    </section>
  );
}
