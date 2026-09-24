import { OFFER_CATEGORIES } from "../constants";
import type { Company, DocData, DocKind } from "./config";

export type TemplateCtx = {
  company: Company;
  client: { company_name: string; address?: string | null; city?: string | null; wilaya?: string | null; rc_number?: string | null; nif?: string | null };
  contact?: { full_name: string; job_title?: string | null } | null;
  deal?: { title: string; amount: number; category: string; product_format?: string | null; delivery_date?: string | null } | null;
};

const fmt = (n: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(n).replace(/ | /g, " ");

export function defaultTitle(kind: DocKind, ctx: TemplateCtx) {
  return ctx.deal?.title ?? ctx.client.company_name;
}

export function defaultData(kind: DocKind, ctx: TemplateCtx): DocData {
  const { company: co, client: cl, deal } = ctx;
  const cat = OFFER_CATEGORIES.find((c) => c.value === deal?.category);
  const project = deal?.title ?? "la prestation";
  const line = deal
    ? [{ label: deal.title, description: [cat?.label, deal.product_format].filter(Boolean).join(" · "), qty: 1, unit: "forfait", price: Number(deal.amount) || 0 }]
    : [{ label: "", description: "", qty: 1, unit: "forfait", price: 0 }];
  const conditions = {
    payment: co.payment_terms ?? "100 % à la commande, avant démarrage des travaux.",
    validity_days: co.quote_validity_days ?? 30,
    delay: "À convenir à réception de l'acompte et des éléments du brief.",
  };
  const clientParty = `${cl.company_name}${cl.address ? ", " + cl.address : ""}${cl.wilaya ? ", " + cl.wilaya.replace(/^\d+ /, "") : ""}${cl.rc_number ? ", RC n° " + cl.rc_number : ""}${cl.nif ? ", NIF " + cl.nif : ""}${ctx.contact ? `, représentée par ${ctx.contact.full_name}${ctx.contact.job_title ? " en sa qualité de " + ctx.contact.job_title : ""}` : ""}, ci-après « le Client »`;
  const coParty = `${co.legal_name} (${co.trade_name})${co.address ? ", " + co.address : ""}${co.city ? ", " + co.city : ""}${co.rc ? ", RC n° " + co.rc : ""}${co.nif ? ", NIF " + co.nif : ""}${co.signatory_name ? `, représentée par ${co.signatory_name} en sa qualité de ${co.signatory_title ?? "Gérant"}` : ""}, ci-après « le Prestataire »`;

  switch (kind) {
    case "proposition":
      return {
        object: `Proposition d'accompagnement — ${project}`,
        intro: `Suite à nos échanges, nous avons le plaisir de vous présenter notre proposition pour ${project}. ${co.trade_name} vous accompagne de la formulation à la production, avec une exigence QHSE à chaque étape.`,
        sections: [
          { title: "Contexte et besoin", body: `Décrivez ici le contexte de ${cl.company_name}, le produit visé et les enjeux (marché, délais, réglementation).` },
          { title: "Objectifs", body: "- Objectif 1\n- Objectif 2\n- Objectif 3" },
          { title: "Notre approche", body: "1. Analyse du brief et revue réglementaire\n2. Formulation et essais laboratoire\n3. Lot pilote et validation\n4. Transfert industriel et documentation" },
          { title: "Livrables", body: "- Dossier de formulation\n- Rapport d'essais\n- Fiche technique produit\n- Rapport final" },
          { title: "Planning prévisionnel", body: "Durée estimée : 3 à 5 semaines à compter de la réception de l'acompte." },
        ],
        lines: line, tva_rate: co.tva_rate, conditions, signatures: true,
      };
    case "devis":
      return { object: `Devis — ${project}`, lines: line, tva_rate: co.tva_rate, conditions, signatures: true };
    case "proforma":
      return { object: `Facture proforma — ${project}`, lines: line, tva_rate: co.tva_rate, conditions: { ...conditions, delay: undefined }, signatures: false };
    case "bon_commande":
      return {
        object: `Commande — ${project}`, lines: line, tva_rate: co.tva_rate, client_ref: "",
        conditions: { payment: conditions.payment, delivery: deal?.delivery_date ? `Livraison prévue le ${deal.delivery_date.split("-").reverse().join("/")}` : "Délai de livraison à confirmer à réception de l'acompte.", delay: conditions.delay },
        signatures: true,
      };
    case "facture":
      return { object: `Facture — ${project}`, lines: line, tva_rate: co.tva_rate, payment_method: "Virement bancaire", conditions: { payment: "Paiement à réception de facture." }, signatures: false };
    case "contrat":
      return {
        object: `Contrat de prestation — ${project}`,
        intro: `Entre les soussignés :\n\n${coParty},\n\nd'une part,\n\net\n\n${clientParty},\n\nd'autre part.\n\nIl a été convenu et arrêté ce qui suit :`,
        articles: [
          { title: "Objet", body: `Le présent contrat a pour objet de définir les conditions dans lesquelles le Prestataire réalise pour le Client la prestation suivante : ${project}${cat ? ` (${cat.label})` : ""}, telle que décrite dans le devis et le cahier des charges annexés, qui font partie intégrante du présent contrat.` },
          { title: "Documents contractuels", body: "Le contrat est constitué, par ordre de priorité décroissante : du présent contrat, du cahier des charges, du devis accepté et de ses éventuels avenants." },
          { title: "Obligations du Prestataire", body: "Le Prestataire s'engage à exécuter la prestation avec diligence, selon les règles de l'art et les bonnes pratiques de fabrication et d'hygiène applicables, et à informer le Client de toute difficulté susceptible d'affecter les délais ou les résultats. Le Prestataire est tenu d'une obligation de moyens." },
          { title: "Obligations du Client", body: "Le Client s'engage à fournir en temps utile toutes les informations, matières premières, articles de conditionnement et validations nécessaires, et à désigner un interlocuteur habilité à prendre les décisions." },
          { title: "Prix et modalités de paiement", body: `En contrepartie de la prestation, le Client verse au Prestataire le montant hors taxes de ${fmt(Number(deal?.amount) || 0)} DA, majoré de la TVA au taux en vigueur. ${co.payment_terms ?? "Le paiement intégral intervient avant le démarrage des travaux."} Tout retard de paiement suspend l'exécution de la prestation.` },
          { title: "Délais", body: "Les délais d'exécution courent à compter de la réception de l'acompte et de l'ensemble des éléments nécessaires. Ils sont prorogés de plein droit en cas de retard imputable au Client ou de force majeure." },
          { title: "Réception", body: "À l'issue de la prestation, les livrables sont remis au Client qui dispose de huit (8) jours ouvrés pour formuler par écrit ses réserves motivées. À défaut, la prestation est réputée acceptée sans réserve." },
          { title: "Propriété intellectuelle", body: "Les formules, résultats et livrables spécifiquement développés pour le Client lui sont cédés à compter du paiement intégral du prix. Le Prestataire conserve la propriété de son savoir-faire, de ses méthodes et de ses outils préexistants." },
          { title: "Confidentialité", body: "Chaque partie s'engage à garder strictement confidentielles les informations techniques, commerciales et financières communiquées par l'autre partie, pendant la durée du contrat et cinq (5) ans après son terme." },
          { title: "Responsabilité", body: "La responsabilité du Prestataire, toutes causes confondues, est limitée au montant effectivement perçu au titre du présent contrat. Le Client demeure seul responsable de la mise sur le marché de ses produits et des déclarations réglementaires qui lui incombent." },
          { title: "Force majeure", body: "Aucune partie ne pourra être tenue responsable d'un manquement résultant d'un cas de force majeure. La partie empêchée en informe l'autre sans délai." },
          { title: "Résiliation", body: "En cas de manquement grave d'une partie non réparé dans les quinze (15) jours suivant une mise en demeure, l'autre partie peut résilier le contrat de plein droit. Les travaux réalisés à la date de résiliation restent dus." },
          { title: "Droit applicable et litiges", body: `Le présent contrat est régi par le droit algérien. Les parties recherchent en priorité une solution amiable ; à défaut, tout litige est porté devant le ${co.jurisdiction ?? "tribunal compétent"}.` },
        ],
        signatures: true,
      };
    case "nda":
      return {
        object: "Accord de confidentialité réciproque",
        intro: `Entre les soussignés :\n\n${coParty},\n\net\n\n${clientParty},\n\nci-après ensemble « les Parties ».\n\nLes Parties envisagent d'échanger des informations dans le cadre de ${deal ? "du projet « " + project + " »" : "l'étude d'un projet de formulation, de production ou de conseil"}. Elles conviennent de ce qui suit :`,
        articles: [
          { title: "Informations confidentielles", body: "Sont confidentielles toutes les informations, quel qu'en soit le support, communiquées par une Partie à l'autre : formules, compositions, procédés, fournisseurs, prix, données de marché, résultats d'essais, plans et documents techniques, ainsi que l'existence même des discussions." },
          { title: "Exclusions", body: "Ne sont pas confidentielles les informations tombées dans le domaine public sans faute de la Partie réceptrice, déjà connues d'elle de manière documentée, reçues légitimement d'un tiers, ou dont la divulgation est exigée par la loi ou une autorité." },
          { title: "Engagements", body: "La Partie réceptrice s'engage à : utiliser les informations uniquement pour l'étude du projet ; ne les communiquer qu'aux membres de son personnel ayant besoin d'en connaître, tenus à la même obligation ; ne pas les copier au-delà du nécessaire ; n'effectuer aucune analyse ou rétro-ingénierie des échantillons reçus." },
          { title: "Propriété", body: "Les informations restent la propriété de la Partie qui les communique. Aucun droit de propriété intellectuelle ni licence n'est concédé par le présent accord." },
          { title: "Restitution", body: "À première demande ou à la fin des discussions, la Partie réceptrice restitue ou détruit les informations reçues et leurs copies, et en atteste par écrit." },
          { title: "Durée", body: "Le présent accord prend effet à sa signature. Les obligations de confidentialité subsistent pendant cinq (5) ans après la fin des relations entre les Parties." },
          { title: "Droit applicable", body: `Le présent accord est régi par le droit algérien. Tout litige relève du ${co.jurisdiction ?? "tribunal compétent"}.` },
        ],
        signatures: true,
      };
    case "cahier_charges":
      return {
        object: `Cahier des charges — ${project}`,
        info: [
          { label: "Client", value: cl.company_name },
          { label: "Projet", value: project },
          { label: "Offre", value: cat ? `${cat.value} · ${cat.label}` : "" },
          { label: "Forme / format", value: deal?.product_format ?? "" },
        ],
        sections: [
          { title: "Contexte et objectif", body: "Présentation du projet, positionnement et objectif commercial." },
          { title: "Description du produit", body: "- Forme galénique :\n- Dosage / portion :\n- Goût, couleur, texture :\n- Public cible :" },
          { title: "Composition et spécifications", body: "- Actifs et teneurs visés :\n- Ingrédients à exclure (allergènes, sucre, gélatine animale…) :\n- Spécifications physico-chimiques et microbiologiques :" },
          { title: "Exigences réglementaires", body: "- Réglementation applicable :\n- Allégations souhaitées :\n- Étiquetage :" },
          { title: "Conditionnement et quantités", body: "- Conditionnement primaire / secondaire :\n- Quantité du premier lot :\n- Prévisions annuelles :" },
          { title: "Délais et budget", body: "- Date de lancement souhaitée :\n- Budget indicatif :" },
          { title: "Critères de validation", body: "Définir les critères d'acceptation des échantillons et du lot pilote." },
        ],
        signatures: true,
      };
    case "ordre_mission":
      return {
        object: `Ordre de mission — ${project}`,
        info: [
          { label: "Client", value: cl.company_name },
          { label: "Mission", value: project },
          { label: "Lieu", value: [cl.city, cl.wilaya?.replace(/^\d+ /, "")].filter(Boolean).join(", ") },
          { label: "Dates", value: "Du … au …" },
          { label: "Intervenant(s)", value: co.signatory_name ?? "" },
          { label: "Référence", value: "" },
        ],
        sections: [
          { title: "Objectifs de la mission", body: "- \n- " },
          { title: "Déroulé prévu", body: "Jour 1 : \nJour 2 : " },
          { title: "Moyens et logistique", body: "Transport, hébergement, matériel, accès au site, EPI." },
          { title: "Livrables attendus", body: "- Compte rendu de mission\n- Rapport" },
        ],
        signatures: true,
      };
    case "compte_rendu":
      return {
        object: `Réunion — ${project}`,
        info: [
          { label: "Date", value: new Date().toLocaleDateString("fr-FR") },
          { label: "Lieu / support", value: "" },
          { label: "Rédigé par", value: co.signatory_name ?? co.trade_name },
        ],
        participants: `${cl.company_name} : ${ctx.contact?.full_name ?? "…"}\n${co.trade_name} : ${co.signatory_name ?? "…"}`,
        sections: [
          { title: "Ordre du jour", body: "1. \n2. " },
          { title: "Points discutés", body: "" },
          { title: "Décisions", body: "- " },
        ],
        actions: [{ action: "", owner: "", due: "" }],
        signatures: false,
      };
    case "rapport_final":
      return {
        object: `Rapport final — ${project}`,
        info: [
          { label: "Client", value: cl.company_name },
          { label: "Prestation", value: project },
          { label: "Période", value: "" },
          { label: "Version", value: "1.0" },
        ],
        sections: [
          { title: "Synthèse", body: "Résumé en quelques lignes des résultats et de la conclusion." },
          { title: "Rappel de la demande", body: "" },
          { title: "Travaux réalisés", body: "" },
          { title: "Résultats", body: "" },
          { title: "Recommandations", body: "- " },
          { title: "Conclusion", body: "" },
        ],
        signatures: true,
      };
    case "etat_compte": {
      const y = new Date().getFullYear();
      return { object: "Relevé des factures et règlements", period: { from: `${y}-01-01`, to: new Date().toISOString().slice(0, 10) }, signatures: false };
    }
  }
}
