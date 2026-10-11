"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { FORMAT_OPTIONS, type QualSettings } from "@/lib/qualification";
import { Button, Field, useToast } from "@/components/ui";

type Form = {
  rd_fee_dzd: string; rd_credit_months: string; rd_samples_included: string; inhouse_formats: string[];
  moq: Record<string, string>; unit_cost_dzd: Record<string, string>; grade_a: string; grade_b: string; grade_c: string;
  auto_invite_grades: string[]; site_url: string; fiche_valid_days: string;
};
const toStrMap = (o: Record<string, number> | undefined) => Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [k, String(v)]));
const toNumMap = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).filter(([, v]) => /^\d+$/.test(v.trim())).map(([k, v]) => [k, Number(v)]));

export function QualificationSettings({ isAdmin }: { isAdmin: boolean }) {
  const sb = supabaseBrowser();
  const toast = useToast();
  const [f, setF] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    sb.from("qual_settings").select("*").eq("id", 1).maybeSingle().then(({ data }: { data: QualSettings | null }) => {
      if (!data) return;
      setF({
        rd_fee_dzd: data.rd_fee_dzd == null ? "" : String(data.rd_fee_dzd), rd_credit_months: String(data.rd_credit_months), rd_samples_included: String(data.rd_samples_included),
        inhouse_formats: data.inhouse_formats, moq: toStrMap(data.moq), unit_cost_dzd: toStrMap(data.unit_cost_dzd),
        grade_a: String(data.grade_a), grade_b: String(data.grade_b), grade_c: String(data.grade_c),
        auto_invite_grades: data.auto_invite_grades, site_url: data.site_url, fiche_valid_days: String(data.fiche_valid_days),
      });
    });
  }, [sb]);

  if (!f) return null;
  const n = (v: string) => Number(v.replace(/[^\d]/g, ""));
  const save = async () => {
    const a = n(f.grade_a), b = n(f.grade_b), c = n(f.grade_c);
    if (!(a > b && b > c && c > 0 && a <= 100)) return toast("Seuils invalides : il faut 100 ≥ A > B > C > 0", "err");
    if (!/^https?:\/\/\S+$/.test(f.site_url.trim())) return toast("Adresse du site invalide", "err");
    setSaving(true);
    const { error } = await sb.from("qual_settings").update({
      rd_fee_dzd: f.rd_fee_dzd.trim() ? n(f.rd_fee_dzd) : null, rd_credit_months: n(f.rd_credit_months), rd_samples_included: n(f.rd_samples_included),
      inhouse_formats: f.inhouse_formats, moq: toNumMap(f.moq), unit_cost_dzd: toNumMap(f.unit_cost_dzd),
      grade_a: a, grade_b: b, grade_c: c, auto_invite_grades: f.auto_invite_grades, site_url: f.site_url.trim(), fiche_valid_days: n(f.fiche_valid_days),
    }).eq("id", 1);
    setSaving(false);
    if (error) return toast(error.message, "err");
    toast("Réglages enregistrés — tous les dossiers ouverts ont été recalculés");
  };
  const toggle = (k: "inhouse_formats" | "auto_invite_grades", v: string) =>
    setF({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] });

  return (
    <section className="card p-5">
      <h2 className="font-semibold">Qualification des demandes</h2>
      <p className="mb-4 mt-1 text-sm text-muted">Ces règles calculent la note A–D de chaque demande. Un champ vide désactive le contrôle correspondant.{!isAdmin && " Seul un administrateur peut les modifier."}</p>
      <fieldset disabled={!isAdmin} className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Frais d'étude R&D (DA)"><input className="input" inputMode="numeric" value={f.rd_fee_dzd} onChange={(e) => setF({ ...f, rd_fee_dzd: e.target.value })} placeholder="Non affiché au client si vide" /></Field>
          <Field label="Déductible pendant (mois)"><input className="input" inputMode="numeric" value={f.rd_credit_months} onChange={(e) => setF({ ...f, rd_credit_months: e.target.value })} /></Field>
          <Field label="Séries d'échantillons incluses"><input className="input" inputMode="numeric" value={f.rd_samples_included} onChange={(e) => setF({ ...f, rd_samples_included: e.target.value })} /></Field>
        </div>

        <div>
          <p className="label">Seuils des notes (score sur 100)</p>
          <div className="grid grid-cols-3 gap-3">
            {(["grade_a", "grade_b", "grade_c"] as const).map((k) => (
              <Field key={k} label={`${k.slice(-1).toUpperCase()} à partir de`}><input className="input" inputMode="numeric" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>
            ))}
          </div>
        </div>

        <div>
          <p className="label">Notes qui reçoivent la fiche de commande automatiquement</p>
          <div className="flex gap-2">{["A", "B", "C"].map((g) => (
            <label key={g} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
              <input type="checkbox" className="accent-[#ed9c35]" checked={f.auto_invite_grades.includes(g)} onChange={() => toggle("auto_invite_grades", g)} />{g}
            </label>
          ))}</div>
          <p className="mt-1 text-xs text-faint">Les autres arrivent « à trier » : vous décidez de les inviter ou non.</p>
        </div>

        <div>
          <p className="label">Formats produits dans votre atelier, quantité minimale et coût unitaire indicatif</p>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-sm">
              <thead className="bg-panel-2 text-left text-xs text-muted"><tr><th className="px-3 py-2 font-medium">Format</th><th className="px-3 py-2 font-medium">Atelier</th><th className="px-3 py-2 font-medium">Minimum (unités)</th><th className="px-3 py-2 font-medium">Coût unitaire (DA)</th></tr></thead>
              <tbody>
                {FORMAT_OPTIONS.map(([code, label]) => (
                  <tr key={code} className="border-t border-line">
                    <td className="px-3 py-1.5">{label}</td>
                    <td className="px-3 py-1.5"><input type="checkbox" className="accent-[#ed9c35]" checked={f.inhouse_formats.includes(code)} onChange={() => toggle("inhouse_formats", code)} /></td>
                    <td className="px-3 py-1.5"><input className="input h-8 w-28" inputMode="numeric" value={f.moq[code] ?? ""} onChange={(e) => setF({ ...f, moq: { ...f.moq, [code]: e.target.value.replace(/[^\d]/g, "") } })} /></td>
                    <td className="px-3 py-1.5"><input className="input h-8 w-28" inputMode="numeric" value={f.unit_cost_dzd[code] ?? ""} onChange={(e) => setF({ ...f, unit_cost_dzd: { ...f.unit_cost_dzd, [code]: e.target.value.replace(/[^\d]/g, "") } })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-xs text-faint">Minimum renseigné : un premier lot plus petit déclenche l’alerte « sous le minimum » et plafonne la note à C. Coût renseigné : un budget trop faible pour le volume déclenche une alerte.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Adresse du site (liens de fiche)"><input className="input" value={f.site_url} onChange={(e) => setF({ ...f, site_url: e.target.value })} /></Field>
          <Field label="Validité d'un lien de fiche (jours)"><input className="input" inputMode="numeric" value={f.fiche_valid_days} onChange={(e) => setF({ ...f, fiche_valid_days: e.target.value })} /></Field>
        </div>
      </fieldset>
      {isAdmin && <div className="mt-4 flex justify-end"><Button onClick={save} loading={saving}>Enregistrer</Button></div>}
    </section>
  );
}
