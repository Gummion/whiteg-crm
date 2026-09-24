import type { DealStage } from "../constants";

export type DocKind =
  | "proposition" | "devis" | "proforma" | "bon_commande" | "contrat" | "nda"
  | "cahier_charges" | "ordre_mission" | "compte_rendu" | "rapport_final" | "facture" | "etat_compte";

export type DocPhase = "commercial" | "client" | "projet" | "cloture";

export type DocStatus = "brouillon" | "emis" | "accepte" | "refuse" | "partiel" | "paye" | "annule";

export type DocLine = { label: string; description?: string; qty: number; unit?: string; price: number; discount?: number };
export type DocSection = { title: string; body: string };
export type DocInfo = { label: string; value: string };
export type DocAction = { action: string; owner?: string; due?: string };

export type DocData = {
  object?: string;
  intro?: string;
  lines?: DocLine[];
  discount_global?: number;
  tva_rate?: number;
  timbre?: number;
  conditions?: { payment?: string; validity_days?: number; delay?: string; delivery?: string; notes?: string };
  sections?: DocSection[];
  articles?: DocSection[];
  info?: DocInfo[];
  participants?: string;
  actions?: DocAction[];
  client_ref?: string;
  payment_method?: string;
  period?: { from?: string; to?: string };
  signatures?: boolean;
};

export type Doc = {
  id: string;
  kind: DocKind;
  number: string;
  title: string | null;
  client_id: string;
  deal_id: string | null;
  source_id: string | null;
  status: DocStatus;
  issue_date: string;
  due_date: string | null;
  data: DocData;
  total_ht: number;
  total_tva: number;
  total_ttc: number;
  amount_paid: number;
  created_at: string;
  updated_at: string;
  clients?: { id: string; company_name: string } | null;
  deals?: { id: string; title: string } | null;
};

export type Company = {
  legal_name: string; trade_name: string; tagline: string | null;
  address: string | null; city: string | null; wilaya: string | null;
  phone: string | null; email: string | null; website: string | null;
  rc: string | null; nif: string | null; nis: string | null; ai: string | null; capital: string | null;
  bank_name: string | null; rib: string | null;
  tva_rate: number; quote_validity_days: number; payment_terms: string | null;
  signatory_name: string | null; signatory_title: string | null; jurisdiction: string | null;
};

type KindMeta = {
  label: string;
  short: string;
  pdfTitle: string;
  phase: DocPhase;
  /** has priced lines + totals */
  priced: boolean;
  /** editor blocks to show */
  blocks: ("lines" | "conditions" | "sections" | "articles" | "info" | "actions" | "participants" | "statement")[];
  /** status choices that make sense */
  statuses: DocStatus[];
  /** deal stages where this document is the natural next step */
  suggestAt: DealStage[];
  description: string;
};

export const DOC_KINDS: Record<DocKind, KindMeta> = {
  proposition: {
    label: "Proposition commerciale", short: "Proposition", pdfTitle: "Proposition commerciale", phase: "commercial", priced: true,
    blocks: ["sections", "lines", "conditions"], statuses: ["brouillon", "emis", "accepte", "refuse", "annule"],
    suggestAt: ["nouveau", "brief"], description: "Présente le contexte, l'approche, les livrables et l'investissement.",
  },
  devis: {
    label: "Devis", short: "Devis", pdfTitle: "Devis", phase: "commercial", priced: true,
    blocks: ["lines", "conditions"], statuses: ["brouillon", "emis", "accepte", "refuse", "annule"],
    suggestAt: ["brief", "devis_envoye", "negociation"], description: "Chiffrage détaillé à faire signer « bon pour accord ».",
  },
  proforma: {
    label: "Facture proforma", short: "Proforma", pdfTitle: "Facture proforma", phase: "client", priced: true,
    blocks: ["lines", "conditions"], statuses: ["brouillon", "emis", "accepte", "annule"],
    suggestAt: ["negociation", "acompte_recu"], description: "Permet au client de régler l'acompte (100 % avant démarrage).",
  },
  bon_commande: {
    label: "Bon de commande", short: "Commande", pdfTitle: "Bon de commande", phase: "client", priced: true,
    blocks: ["lines", "conditions"], statuses: ["brouillon", "emis", "accepte", "annule"],
    suggestAt: ["negociation", "acompte_recu"], description: "Formalise la commande ferme du client.",
  },
  contrat: {
    label: "Contrat de prestation", short: "Contrat", pdfTitle: "Contrat de prestation de services", phase: "client", priced: false,
    blocks: ["articles"], statuses: ["brouillon", "emis", "accepte", "annule"],
    suggestAt: ["negociation", "acompte_recu"], description: "Cadre juridique de la mission : objet, obligations, prix, PI, confidentialité.",
  },
  nda: {
    label: "Accord de confidentialité (NDA)", short: "NDA", pdfTitle: "Accord de confidentialité", phase: "commercial", priced: false,
    blocks: ["articles"], statuses: ["brouillon", "emis", "accepte", "annule"],
    suggestAt: ["nouveau", "brief"], description: "Protège les formules et informations échangées dès le premier brief.",
  },
  cahier_charges: {
    label: "Cahier des charges", short: "CDC", pdfTitle: "Cahier des charges", phase: "projet", priced: false,
    blocks: ["info", "sections"], statuses: ["brouillon", "emis", "accepte", "annule"],
    suggestAt: ["brief", "acompte_recu"], description: "Besoin client : produit, format, spécifications, réglementaire, quantités.",
  },
  ordre_mission: {
    label: "Ordre de mission", short: "Mission", pdfTitle: "Ordre de mission", phase: "projet", priced: false,
    blocks: ["info", "sections"], statuses: ["brouillon", "emis", "annule"],
    suggestAt: ["acompte_recu", "en_cours"], description: "Lance officiellement la mission : intervenants, lieu, dates, objectifs.",
  },
  compte_rendu: {
    label: "Compte rendu de réunion", short: "CR", pdfTitle: "Compte rendu de réunion", phase: "projet", priced: false,
    blocks: ["info", "participants", "sections", "actions"], statuses: ["brouillon", "emis", "annule"],
    suggestAt: ["brief", "en_cours"], description: "Participants, points discutés, décisions et plan d'actions.",
  },
  rapport_final: {
    label: "Rapport final de prestation", short: "Rapport", pdfTitle: "Rapport final de prestation", phase: "projet", priced: false,
    blocks: ["info", "sections"], statuses: ["brouillon", "emis", "accepte", "annule"],
    suggestAt: ["en_cours", "livre"], description: "Synthèse, travaux réalisés, résultats et recommandations.",
  },
  facture: {
    label: "Facture", short: "Facture", pdfTitle: "Facture", phase: "cloture", priced: true,
    blocks: ["lines", "conditions"], statuses: ["brouillon", "emis", "partiel", "paye", "annule"],
    suggestAt: ["acompte_recu", "en_cours", "livre"], description: "Facture définitive avec mentions légales et suivi des règlements.",
  },
  etat_compte: {
    label: "État de compte client", short: "Relevé", pdfTitle: "État de compte", phase: "cloture", priced: false,
    blocks: ["statement"], statuses: ["brouillon", "emis"],
    suggestAt: ["livre"], description: "Relevé des factures et règlements, solde restant dû.",
  },
};

export const KIND_ORDER: DocKind[] = [
  "nda", "proposition", "devis", "proforma", "bon_commande", "contrat",
  "cahier_charges", "ordre_mission", "compte_rendu", "rapport_final", "facture", "etat_compte",
];

export const PHASES: { key: DocPhase; label: string; hint: string; kinds: DocKind[] }[] = [
  { key: "commercial", label: "Prospect", hint: "Opportunité → proposition → devis", kinds: ["nda", "proposition", "devis"] },
  { key: "client", label: "Client", hint: "Commande → contrat → proforma → acompte", kinds: ["bon_commande", "contrat", "proforma"] },
  { key: "projet", label: "Projet", hint: "Cahier des charges → mission → comptes rendus → livrables", kinds: ["cahier_charges", "ordre_mission", "compte_rendu", "rapport_final"] },
  { key: "cloture", label: "Clôture", hint: "Facture → paiement → état de compte", kinds: ["facture", "etat_compte"] },
];

export const DOC_STATUS: Record<DocStatus, { label: string; color: string }> = {
  brouillon: { label: "Brouillon", color: "#a1a1aa" },
  emis: { label: "Émis / envoyé", color: "#60a5fa" },
  accepte: { label: "Accepté / signé", color: "#34d399" },
  refuse: { label: "Refusé", color: "#f87171" },
  partiel: { label: "Payé partiellement", color: "#facc15" },
  paye: { label: "Payé", color: "#34d399" },
  annule: { label: "Annulé", color: "#71717a" },
};

export const PAYMENT_METHODS = [
  { value: "virement", label: "Virement bancaire" },
  { value: "cheque", label: "Chèque" },
  { value: "versement", label: "Versement / CCP" },
  { value: "especes", label: "Espèces" },
  { value: "autre", label: "Autre" },
];

/** Which documents can be generated from another one (keeps lines, client, deal). */
export const CONVERSIONS: Partial<Record<DocKind, DocKind[]>> = {
  proposition: ["devis"],
  devis: ["proforma", "bon_commande", "facture", "contrat"],
  proforma: ["facture"],
  bon_commande: ["facture", "proforma"],
  cahier_charges: ["devis", "ordre_mission"],
};

export function computeTotals(d: DocData) {
  const lines = d.lines ?? [];
  const gross = lines.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.price) || 0) * (1 - (Number(l.discount) || 0) / 100), 0);
  const discount = gross * ((Number(d.discount_global) || 0) / 100);
  const ht = round2(gross - discount);
  const tva = round2(ht * ((d.tva_rate ?? 19) / 100));
  const timbre = round2(Number(d.timbre) || 0);
  const ttc = round2(ht + tva + timbre);
  return { gross: round2(gross), discount: round2(discount), ht, tva, timbre, ttc };
}
export const lineTotal = (l: DocLine) => round2((Number(l.qty) || 0) * (Number(l.price) || 0) * (1 - (Number(l.discount) || 0) / 100));
const round2 = (n: number) => Math.round(n * 100) / 100;
