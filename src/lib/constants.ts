export type Option<T extends string = string> = { value: T; label: string; color?: string };

export const DEAL_STAGES = [
  { value: "nouveau", label: "Contact reçu", color: "#71717a", prob: 5 },
  { value: "fiche_envoyee", label: "Fiche envoyée", color: "#94a3b8", prob: 10 },
  { value: "brief", label: "Fiche reçue", color: "#60a5fa", prob: 20 },
  { value: "cadrage", label: "Cadrage validé", color: "#22d3ee", prob: 35 },
  { value: "rd_en_cours", label: "R&D en cours", color: "#2dd4bf", prob: 50 },
  { value: "formule_livree", label: "Formule livrée", color: "#818cf8", prob: 60 },
  { value: "devis_envoye", label: "Devis final envoyé", color: "#a78bfa", prob: 65 },
  { value: "negociation", label: "Négociation", color: "#f472b6", prob: 75 },
  { value: "acompte_recu", label: "Acompte reçu", color: "#ED9C35", prob: 90 },
  { value: "en_cours", label: "En production", color: "#facc15", prob: 95 },
  { value: "livre", label: "Livré", color: "#34d399", prob: 100 },
  { value: "perdu", label: "Perdu", color: "#f87171", prob: 0 },
] as const;
export type DealStage = (typeof DEAL_STAGES)[number]["value"];
export const OPEN_STAGES: DealStage[] = ["nouveau", "fiche_envoyee", "brief", "cadrage", "rd_en_cours", "formule_livree", "devis_envoye", "negociation"];
export const ACTIVE_STAGES: DealStage[] = ["acompte_recu", "en_cours"];

export const OFFER_CATEGORIES = [
  { value: "A", label: "Audit & Conseil QHSE", short: "Audit QHSE" },
  { value: "B", label: "Formulation & R&D", short: "Formulation" },
  { value: "C", label: "Formation & Coaching", short: "Formation" },
  { value: "D", label: "Production & Façonnage", short: "Production" },
  { value: "E", label: "Digital & Contenu", short: "Digital" },
  { value: "F", label: "Packages hybrides", short: "Package" },
  { value: "G", label: "International & Institutionnel", short: "International" },
] as const;
export type OfferCategory = (typeof OFFER_CATEGORIES)[number]["value"];

export const PRODUCT_FORMATS = ["Sticks", "Gélules", "Gummies", "Liquides", "Poudres", "Comprimés", "Cosmétique", "Autre"];

export const CLIENT_STATUSES = [
  { value: "prospect", label: "Prospect", color: "#71717a" },
  { value: "lead", label: "Lead qualifié", color: "#60a5fa" },
  { value: "client", label: "Client", color: "#34d399" },
  { value: "inactif", label: "Inactif", color: "#a1a1aa" },
  { value: "perdu", label: "Perdu", color: "#f87171" },
] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number]["value"];

export const SECTORS = [
  { value: "nutraceutique", label: "Nutraceutique" },
  { value: "cosmetique", label: "Cosmétique" },
  { value: "agroalimentaire", label: "Agroalimentaire" },
  { value: "pharmaceutique", label: "Pharmaceutique" },
  { value: "distribution", label: "Distribution" },
  { value: "institution", label: "Institution / Public" },
  { value: "autre", label: "Autre" },
] as const;

export const SOURCES = [
  { value: "site_web", label: "Site web" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "telephone", label: "Téléphone" },
  { value: "email", label: "Email" },
  { value: "salon", label: "Salon / Événement" },
  { value: "recommandation", label: "Recommandation" },
  { value: "reseaux_sociaux", label: "Réseaux sociaux" },
  { value: "appel_offres", label: "Appel d'offres" },
  { value: "autre", label: "Autre" },
] as const;

export const ACTIVITY_TYPES = [
  { value: "appel", label: "Appel" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "reunion", label: "Réunion" },
  { value: "visite", label: "Visite site" },
  { value: "devis", label: "Devis" },
  { value: "paiement", label: "Paiement" },
  { value: "note", label: "Note" },
] as const;

export const PRIORITIES = [
  { value: "basse", label: "Basse", color: "#71717a" },
  { value: "normale", label: "Normale", color: "#60a5fa" },
  { value: "haute", label: "Haute", color: "#ED9C35" },
  { value: "urgente", label: "Urgente", color: "#f87171" },
] as const;

export const WILAYAS = [
  "01 Adrar", "02 Chlef", "03 Laghouat", "04 Oum El Bouaghi", "05 Batna", "06 Béjaïa", "07 Biskra", "08 Béchar",
  "09 Blida", "10 Bouira", "11 Tamanrasset", "12 Tébessa", "13 Tlemcen", "14 Tiaret", "15 Tizi Ouzou", "16 Alger",
  "17 Djelfa", "18 Jijel", "19 Sétif", "20 Saïda", "21 Skikda", "22 Sidi Bel Abbès", "23 Annaba", "24 Guelma",
  "25 Constantine", "26 Médéa", "27 Mostaganem", "28 M'Sila", "29 Mascara", "30 Ouargla", "31 Oran", "32 El Bayadh",
  "33 Illizi", "34 Bordj Bou Arréridj", "35 Boumerdès", "36 El Tarf", "37 Tindouf", "38 Tissemsilt", "39 El Oued",
  "40 Khenchela", "41 Souk Ahras", "42 Tipaza", "43 Mila", "44 Aïn Defla", "45 Naâma", "46 Aïn Témouchent",
  "47 Ghardaïa", "48 Relizane", "49 Timimoun", "50 Bordj Badji Mokhtar", "51 Ouled Djellal", "52 Béni Abbès",
  "53 In Salah", "54 In Guezzam", "55 Touggourt", "56 Djanet", "57 El M'Ghair", "58 El Meniaa",
  "International",
];

export function labelOf<T extends { value: string; label: string }>(list: readonly T[], v: string | null | undefined) {
  return list.find((o) => o.value === v)?.label ?? v ?? "—";
}
export function colorOf<T extends { value: string; color?: string }>(list: readonly T[], v: string | null | undefined) {
  return list.find((o) => o.value === v)?.color ?? "#71717a";
}
