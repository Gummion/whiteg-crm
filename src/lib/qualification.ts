import { QUAL_OPTIONS } from "./qualification-options";

export type Flag = { code: string; severity: "high" | "medium" | "low"; label: string };
export type QualRequest = {
  id: string; reference: string;
  first_name: string; last_name: string; company_name: string | null; role_title: string | null;
  email: string; phone: string; whatsapp: string | null; wilaya: string | null; lang: string;
  prequal: Record<string, unknown>; fiche: Record<string, unknown>;
  fiche_token: string | null; fiche_sent_at: string | null; fiche_expires_at: string | null; fiche_opened_at: string | null;
  fiche_saved_at: string | null; fiche_submitted_at: string | null; fiche_progress: number;
  score: number; grade: "A" | "B" | "C" | "D"; priority: number; est_value_dzd: number | null;
  score_detail: { finance?: number; maturite?: number; volume?: number; adequation?: number; serieux?: number; penalites?: number; urgence?: number; qty_band?: string; launch?: string };
  red_flags: Flag[];
  client_id: string | null; contact_id: string | null; deal_id: string | null;
  decision: "en_attente" | "go" | "no_go"; decision_reason: string | null; decided_at: string | null; call_grid: Record<string, unknown>; call_at: string | null;
  rd_fee_dzd: number | null; rd_fee_paid_on: string | null; rd_credit_until: string | null; nda_signed_on: string | null;
  samples_round: number; formula_delivered_at: string | null; final_quote_sent_at: string | null;
  archived: boolean; source: string | null; created_at: string; updated_at: string;
};
export type QualEvent = { id: number; kind: string; detail: Record<string, unknown>; actor_id: string | null; created_at: string };
export type QualSettings = {
  rd_fee_dzd: number | null; rd_credit_months: number; rd_samples_included: number; inhouse_formats: string[];
  moq: Record<string, number>; unit_cost_dzd: Record<string, number>; grade_a: number; grade_b: number; grade_c: number;
  auto_invite_grades: string[]; site_url: string; fiche_valid_days: number; updated_at: string;
};

export const GRADE_COLOR: Record<string, string> = { A: "#34d399", B: "#60a5fa", C: "#facc15", D: "#f87171" };
export const SEVERITY_COLOR: Record<string, string> = { high: "#f87171", medium: "#fb923c", low: "#a1a1aa" };

export const opt = (list: string, v: unknown): string => {
  if (v === undefined || v === null || v === "") return "";
  if (Array.isArray(v)) return v.map((x) => QUAL_OPTIONS[list]?.[String(x)] ?? String(x)).join(" · ");
  return QUAL_OPTIONS[list]?.[String(v)] ?? String(v);
};

export const who = (q: Pick<QualRequest, "company_name" | "first_name" | "last_name">) => q.company_name || `${q.first_name} ${q.last_name}`;

/** Où en est le dossier — dérivé des dates, jamais saisi à la main */
export type Phase = "a_trier" | "fiche_envoyee" | "fiche_ouverte" | "fiche_recue" | "go" | "rd" | "formule" | "devis_final" | "no_go" | "archive";
export const PHASES: Record<Phase, { label: string; color: string; next: string }> = {
  a_trier: { label: "À trier", color: "#e4e4e7", next: "Inviter à la fiche de commande, ou archiver" },
  fiche_envoyee: { label: "Fiche envoyée", color: "#94a3b8", next: "Attendre la fiche — relancer par WhatsApp après 4 jours" },
  fiche_ouverte: { label: "Fiche en cours", color: "#cbd5e1", next: "Le client remplit sa fiche — relancer si elle stagne" },
  fiche_recue: { label: "Fiche reçue", color: "#60a5fa", next: "Faire l'appel de cadrage puis décider Go / No-Go" },
  go: { label: "Go — R&D à engager", color: "#22d3ee", next: "Envoyer la proforma de l'étude R&D et enregistrer le paiement" },
  rd: { label: "R&D en cours", color: "#2dd4bf", next: "Développer la formule, envoyer les échantillons" },
  formule: { label: "Formule livrée", color: "#818cf8", next: "Établir et envoyer le devis final de production" },
  devis_final: { label: "Devis final envoyé", color: "#a78bfa", next: "Suivre le devis dans le pipeline jusqu'à l'acompte" },
  no_go: { label: "No-Go", color: "#f87171", next: "Dossier clos" },
  archive: { label: "Archivé", color: "#71717a", next: "Dossier archivé" },
};
export function phaseOf(q: QualRequest): Phase {
  if (q.archived) return "archive";
  if (q.decision === "no_go") return "no_go";
  if (q.final_quote_sent_at) return "devis_final";
  if (q.formula_delivered_at) return "formule";
  if (q.rd_fee_paid_on) return "rd";
  if (q.decision === "go") return "go";
  if (q.fiche_submitted_at) return "fiche_recue";
  if (q.fiche_opened_at) return "fiche_ouverte";
  if (q.fiche_sent_at) return "fiche_envoyee";
  return "a_trier";
}

export const SCORE_AXES: { key: keyof QualRequest["score_detail"]; label: string; max: number }[] = [
  { key: "finance", label: "Capacité financière", max: 25 },
  { key: "maturite", label: "Maturité du projet", max: 20 },
  { key: "volume", label: "Volume & récurrence", max: 20 },
  { key: "adequation", label: "Adéquation White G", max: 20 },
  { key: "serieux", label: "Sérieux & engagement", max: 15 },
];

/** Grille de l'appel de cadrage (30 min) */
export const CALL_GRID: { key: string; label: string; help: string }[] = [
  { key: "decideur", label: "Décisionnaire confirmé", help: "Je parle à la personne qui signe, ou elle sera présente à la suite." },
  { key: "budget", label: "Budget confirmé et cohérent", help: "L'enveloppe annoncée couvre le volume et le format visés." },
  { key: "delai", label: "Calendrier réaliste", help: "La date de lancement laisse le temps à la R&D, aux échantillons et à la production." },
  { key: "faisable", label: "Produit faisable chez White G", help: "Format, actifs et volumes compatibles avec l'atelier ou un partenaire maîtrisé." },
  { key: "reglementaire", label: "Réglementaire maîtrisable", help: "Pas d'allégation interdite ; homologation possible dans les délais." },
  { key: "rd", label: "Accepte l'étude R&D payante", help: "Le principe et le montant de l'étude, déductible de la production, sont acceptés." },
  { key: "ethique", label: "Projet légal et éthique", help: "Pas de copie illicite, pas de promesse trompeuse." },
];

/** Sections de la fiche, pour l'affichage complet des réponses */
type Row = [key: string, label: string, list?: string];
export const FICHE_SECTIONS: { id: string; title: string; rows: Row[] }[] = [
  { id: "A", title: "Identité du demandeur", rows: [["entity", "Forme juridique", "entity"], ["company_name", "Raison sociale"], ["role_title", "Fonction"], ["rc_number", "RC"], ["nif", "NIF / NIS"], ["address", "Adresse"], ["wilaya", "Wilaya"], ["website", "Site / réseaux"], ["whatsapp", "WhatsApp"], ["decision_maker", "Décisionnaire", "decision_maker"], ["decision_maker_who", "Sinon, qui décide"]] },
  { id: "B", title: "Nature de la demande", rows: [["project_type", "Nature", "project_type"], ["maturity", "Maturité", "maturity"], ["current_producer", "Producteur actuel / raison du changement"]] },
  { id: "C", title: "Le projet en ses mots", rows: [["c_what", "Ce qu'il veut vendre"], ["c_who", "À qui"], ["c_problem", "Problème résolu / bénéfice"], ["c_pitch", "Pitch étiquette"], ["description", "Description (formulaire de contact)"]] },
  { id: "D", title: "Catégorie", rows: [["category", "Catégorie", "category"], ["sub_complement", "Axes compléments", "sub_complement"], ["sub_cosmetique", "Axes cosmétique", "sub_cosmetique"], ["sub_agro", "Axes agro", "sub_agro"], ["sub_other", "Autre"]] },
  { id: "E", title: "Cible & positionnement", rows: [["e_age", "Âge"], ["e_sex", "Sexe", "e_sex"], ["e_lifestyle", "Mode de vie"], ["e_target", "Objectif / pathologie"], ["e_power", "Pouvoir d'achat", "e_power"], ["channels", "Circuits", "channels"], ["promise", "Promesse"], ["feel_words", "Mots à ressentir"], ["avoid_words", "Mots à éviter"]] },
  { id: "F", title: "Formule & actifs", rows: [["formula_level", "Niveau de formule", "formula_level"], ["exclusions", "Exclusions", "exclusions"], ["exclusions_other", "Autres exclusions"], ["taste", "Goût"], ["taste_profile", "Profil", "taste_profile"], ["aroma_type", "Arômes", "aroma_type"], ["color", "Couleur"], ["texture", "Texture"], ["perfume", "Parfum"]] },
  { id: "G", title: "Format & spécifications", rows: [["format", "Format", "format"], ["format_other", "Autre format"], ["dosage_per_day", "Posologie"], ["cure_days", "Cure (jours)"], ["unit_size", "Taille unitaire"], ["units_per_box", "Unités / boîte"], ["shelf_life", "Conservation"], ["primary_pack", "Conditionnement", "primary_pack"], ["pack_notes", "Précisions"]] },
  { id: "H", title: "Benchmark", rows: [["has_references", "Références", "has_references"], ["copy_stance", "Copie à 95 %", "copy_stance"], ["copy_why", "Pourquoi"]] },
  { id: "I", title: "Packaging & branding", rows: [["trademark", "Marque", "trademark"], ["brand_name", "Nom de marque"], ["product_name", "Nom produit"], ["has_logo", "Logo existant"], ["has_charter", "Charte existante"], ["design_mode", "Design", "design_mode"], ["label_langs", "Langues", "label_langs"], ["label_mentions", "Mentions", "label_mentions"], ["visual_universe", "Univers visuel"], ["eco", "Éco-conception", "eco"]] },
  { id: "J", title: "Réglementaire & marchés", rows: [["markets", "Marchés", "markets"], ["markets_detail", "Détail marchés"], ["regulatory", "Statut", "regulatory"], ["regulatory_number", "N° dossier"], ["certifications", "Certifications", "certifications"], ["claims", "Allégations visées"]] },
  { id: "K", title: "Volumes, délais, budget", rows: [["first_batch_qty", "Premier lot (unités)"], ["qty_band", "Premier lot (tranche)", "qty_band"], ["recurrence", "Récurrence", "recurrence"], ["annual_qty", "Volume année 1"], ["qty_3y", "Volume à 3 ans"], ["delivery_date", "Réception souhaitée"], ["launch_date", "Mise en marché"], ["launch", "Lancement (tranche)", "launch"], ["flexibility", "Flexibilité", "flexibility"], ["budget", "Budget", "budget"], ["funding", "Financement", "funding"], ["trilemma", "Priorité absolue", "trilemma"], ["rd_ok", "Étude R&D payante", "rd_ok"]] },
  { id: "L", title: "Documents & validation", rows: [["attachments", "Documents annoncés", "attachments"], ["attachments_detail", "Précisions documents"], ["restatement", "Reformulation finale"], ["source", "Source", "source"], ["nda_wanted", "Veut un NDA"], ["confirm_accurate", "Confirme l'exactitude"], ["confirm_mandate", "Mandaté"], ["confirm_callback", "Accepte le rappel"]] },
];

export const FORMAT_OPTIONS = Object.entries(QUAL_OPTIONS.format).filter(([k]) => !["autre", "ne_sait_pas"].includes(k));
