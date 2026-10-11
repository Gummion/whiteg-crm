// GÉNÉRÉ depuis White-g/src/lib/qualification/schema.ts — ne pas modifier à la main.
// Libellés (FR) des codes de réponse de la pré-qualification et de la fiche de commande.
export const QUAL_OPTIONS: Record<string, Record<string, string>> = {
  "project_type": {
    "catalogue": "Marque blanche d'un produit de notre catalogue",
    "sur_mesure": "Formule sur-mesure puis production",
    "reformulation": "Reformuler un produit que je vends déjà",
    "pack_lancement": "Pack lancement clé en main",
    "lot_pilote": "Lot pilote avant industrialisation",
    "ne_sait_pas": "Je ne sais pas encore, aidez-moi"
  },
  "maturity": {
    "idee": "Une idée",
    "etude": "Étude en cours",
    "pret": "Prêt à produire",
    "marche": "Déjà sur le marché"
  },
  "category": {
    "complement": "Complément alimentaire",
    "cosmetique": "Cosmétique",
    "agro": "Agroalimentaire",
    "mixte": "Mixte / borderline"
  },
  "format": {
    "gummies": "Gummies",
    "gelule": "Gélule",
    "comprime": "Comprimé",
    "stick_poudre": "Stick poudre",
    "stick_liquide": "Stick liquide",
    "sirop": "Sirop",
    "ampoule": "Ampoule buvable",
    "sachet_effervescent": "Sachet effervescent",
    "poudre_pot": "Poudre en pot",
    "spray_buccal": "Spray buccal",
    "creme": "Crème / pommade",
    "serum": "Sérum",
    "huile_lotion": "Huile / lotion",
    "roll_on": "Roll-on",
    "savon": "Savon",
    "boisson": "Boisson prête à boire",
    "autre": "Autre format",
    "ne_sait_pas": "Je ne sais pas"
  },
  "qty_band": {
    "lt1k": "Moins de 1 000 unités",
    "1k_5k": "1 000 – 5 000",
    "5k_20k": "5 000 – 20 000",
    "20k_100k": "20 000 – 100 000",
    "gt100k": "Plus de 100 000",
    "nsp": "Je ne sais pas encore"
  },
  "recurrence": {
    "one_shot": "Une seule fois",
    "a_la_demande": "À la demande",
    "trimestrielle": "Chaque trimestre",
    "mensuelle": "Chaque mois",
    "nsp": "Je ne sais pas encore"
  },
  "budget": {
    "lt300k": "Moins de 300 000 DA",
    "300k_1m": "300 000 – 1 000 000 DA",
    "1m_5m": "1 – 5 millions DA",
    "5m_20m": "5 – 20 millions DA",
    "gt20m": "Plus de 20 millions DA",
    "a_discuter": "À discuter selon la proposition"
  },
  "launch": {
    "lt3m": "Dans moins de 3 mois",
    "3_6m": "Dans 3 à 6 mois",
    "6_12m": "Dans 6 à 12 mois",
    "gt12m": "Dans plus d'un an",
    "aucune": "Pas encore de date"
  },
  "entity": {
    "sarl_eurl_spa": "Société (SARL, EURL, SPA…)",
    "startup": "Startup",
    "auto_entrepreneur": "Auto-entrepreneur",
    "particulier": "Particulier",
    "autre": "Autre structure"
  },
  "decision_maker": {
    "oui": "Oui",
    "non": "Non"
  },
  "trilemma": {
    "prix": "Le prix le plus bas",
    "delai": "Être sur le marché vite",
    "qualite": "Le meilleur produit possible"
  },
  "rd_ok": {
    "oui": "Oui, c'est normal",
    "a_discuter": "À discuter",
    "non": "Non"
  },
  "source": {
    "recommandation": "Recommandation",
    "reseaux_sociaux": "Réseaux sociaux",
    "site_web": "Site web",
    "moteur_recherche": "Moteur de recherche",
    "salon": "Salon / événement",
    "presse": "Presse / article",
    "whatsapp": "WhatsApp",
    "autre": "Autre"
  },
  "sub_complement": {
    "vitamine": "Vitamine / minéral",
    "plante": "Plante / phyto",
    "acide_amine": "Acide aminé / protéine",
    "probiotique": "Probiotique",
    "omega": "Oméga / lipide",
    "energie": "Énergie / sport",
    "sommeil": "Sommeil / stress",
    "digestion": "Digestion",
    "immunite": "Immunité",
    "articulation": "Articulation",
    "peau": "Peau / cheveux / ongles",
    "minceur": "Minceur / satiété",
    "vitalite": "Sexualité / vitalité",
    "pediatrique": "Pédiatrique",
    "senior": "Senior",
    "grossesse": "Grossesse / allaitement"
  },
  "sub_cosmetique": {
    "visage": "Soin visage",
    "corps": "Soin corps",
    "capillaire": "Capillaire",
    "solaire": "Solaire",
    "hygiene": "Hygiène",
    "parfum": "Parfum",
    "bebe": "Bébé",
    "homme": "Homme",
    "anti_age": "Anti-âge",
    "acne": "Acné / peau à problèmes",
    "naturel": "Naturel / bio",
    "makeup": "Make-up"
  },
  "sub_agro": {
    "boisson": "Boisson fonctionnelle",
    "snack": "Snack / barre",
    "miel": "Miel / sirop",
    "poudre": "Poudre instantanée",
    "confiserie": "Confiserie fonctionnelle",
    "epicerie": "Épicerie sèche",
    "infantile": "Produit infantile",
    "halal": "Halal certifié"
  },
  "e_power": {
    "entree": "Entrée de gamme",
    "milieu": "Milieu de gamme",
    "premium": "Premium",
    "luxe": "Luxe"
  },
  "channels": {
    "pharmacie": "Pharmacie",
    "parapharmacie": "Parapharmacie",
    "gms": "GMS / supermarché",
    "ecommerce": "E-commerce",
    "salle_sport": "Salle de sport",
    "spa": "Esthéticienne / spa",
    "clinique": "Clinique / cabinet",
    "export": "Export",
    "vente_directe": "Vente directe / réseau",
    "pharmacie_hosp": "Pharmacie hospitalière",
    "boutique": "Boutique propre",
    "autre": "Autre"
  },
  "formula_level": {
    "complete": "J'ai déjà la formule complète",
    "actifs": "J'ai une idée des actifs et des dosages",
    "aucune": "Aucune idée — White G propose"
  },
  "exclusions": {
    "gelatine_porcine": "Gélatine porcine",
    "alcool": "Alcool",
    "ogm": "OGM",
    "gluten": "Gluten",
    "lactose": "Lactose",
    "sucre": "Sucre ajouté",
    "colorants": "Colorants artificiels",
    "conservateurs": "Conservateurs",
    "nano": "Nanoparticules",
    "allergenes": "Allergènes",
    "parfum_synthese": "Parfum de synthèse",
    "animal": "Origine animale"
  },
  "primary_pack": {
    "pilulier": "Pilulier PEHD",
    "blister": "Blister alu/PVC",
    "sachet": "Sachet individuel",
    "flacon_verre": "Flacon verre",
    "flacon_pet": "Flacon PET",
    "tube_alu": "Tube alu",
    "tube_plastique": "Tube plastique",
    "pot": "Pot verre / plastique",
    "stick": "Stick individuel",
    "ampoule": "Ampoule",
    "airless": "Pompe airless",
    "spray": "Spray"
  },
  "has_references": {
    "oui": "Oui, j'en ai en tête",
    "liens": "Oui, je peux donner des liens ou photos",
    "non": "Non, je veux me différencier",
    "nsp": "Je ne sais pas, éclairez-moi"
  },
  "copy_stance": {
    "distinct": "Non, je veux un produit clairement distinct",
    "si_legal": "Oui, si c'est légal (formule non protégée)",
    "copie_exacte": "Oui, je veux une copie exacte"
  },
  "trademark": {
    "deposee": "Marque déposée (INAPI)",
    "en_cours": "Dépôt en cours",
    "non_deposee": "Pas encore déposée",
    "aucune": "Pas de marque"
  },
  "design_mode": {
    "fourni": "Je fournis le design fini",
    "maquette": "Je fournis une maquette, White G finalise",
    "white_g": "White G conçoit entièrement le design",
    "cocreation": "Co-création avec un graphiste recommandé"
  },
  "label_langs": {
    "arabe": "Arabe",
    "francais": "Français",
    "anglais": "Anglais",
    "autre": "Autre"
  },
  "label_mentions": {
    "dluo": "DLUO / DLC",
    "lot": "Numéro de lot",
    "ean": "Code-barres EAN",
    "qr": "QR code traçabilité"
  },
  "eco": {
    "recyclable": "Recyclable",
    "verre": "Verre",
    "plastique_recycle": "Plastique recyclé",
    "carton_fsc": "Carton FSC",
    "sans_suremballage": "Sans suremballage",
    "refill": "Refill / recharge",
    "bioplastique": "Bioplastique",
    "indifferent": "Indifférent"
  },
  "markets": {
    "algerie": "Algérie",
    "tunisie": "Tunisie",
    "maroc": "Maroc",
    "libye": "Libye",
    "afrique": "Afrique francophone",
    "golfe": "Moyen-Orient / Golfe",
    "europe": "Europe",
    "amerique": "Amérique du Nord"
  },
  "regulatory": {
    "en_cours": "Dossier d'homologation en cours",
    "besoin_aide": "Pas de dossier, j'ai besoin d'aide",
    "homologue": "Produit déjà homologué",
    "non_soumis": "Pas soumis à homologation (à confirmer)"
  },
  "certifications": {
    "halal": "Halal",
    "bio": "Bio",
    "iso22000": "ISO 22000",
    "gmp": "GMP",
    "vegan": "Vegan",
    "sans_gluten": "Sans gluten",
    "cruelty_free": "Cruelty-free",
    "casher": "Casher"
  },
  "flexibility": {
    "oui": "Oui",
    "non": "Non",
    "selon": "Selon les conditions"
  },
  "funding": {
    "fonds_propres": "Fonds propres",
    "investisseur": "Investisseur",
    "subvention": "Subvention (ANADE…)",
    "credit": "Crédit bancaire",
    "autre": "Autre"
  },
  "attachments": {
    "formule": "Formule détaillée",
    "references": "Photos / liens des produits de référence",
    "logo": "Logo et charte graphique",
    "maquette": "Maquette packaging / étiquette",
    "reglementaire": "Dossier réglementaire existant",
    "etude": "Étude de marché / cahier des charges",
    "devis_concurrents": "Devis concurrents (confidentiel)"
  },
  "origin": {
    "synthese": "Synthèse",
    "naturel": "Naturel",
    "bio": "Bio certifié",
    "halal": "Halal",
    "vegan": "Vegan",
    "indifferent": "Indifférent"
  },
  "axes": {
    "formule": "Formule / actifs",
    "format": "Format galénique",
    "sensoriel": "Goût · texture · sensoriel",
    "packaging": "Packaging · design",
    "promesse": "Promesse marketing",
    "prix": "Prix de vente final"
  },
  "e_sex": {
    "homme": "Homme",
    "femme": "Femme",
    "les_deux": "Les deux"
  },
  "taste_profile": {
    "sucre": "Sucré",
    "acidule": "Acidulé",
    "amer": "Amer",
    "neutre": "Neutre"
  },
  "aroma_type": {
    "naturel": "Naturels",
    "identique_nature": "Identiques nature",
    "synthetique": "Synthétiques"
  }
};
