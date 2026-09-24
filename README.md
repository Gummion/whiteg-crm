# White G CRM

Mini-CRM interne pour **White G by GUMMION** : suivi des clients B2B (nutraceutique, cosmétique, agroalimentaire…), des demandes de devis et des projets de formulation / production, du brief à la livraison.

**Stack :** Next.js 15 (App Router) · Tailwind CSS 4 · Supabase (Postgres, Auth, Realtime, pg_cron, Edge Functions).
Responsive : barre latérale sur ordinateur, navigation en bas sur mobile, installable comme une application (PWA).

---

## 1. Démarrer en local

```bash
npm install
cp .env.example .env.local     # les clés du projet Supabase "whiteg-crm" sont déjà dedans
npm run dev                    # http://localhost:3000
```

**Premier compte = administrateur.** Allez sur `/login` → « Créer un compte ». Confirmez l'email reçu, puis connectez-vous.
Ensuite, seules les personnes invitées depuis *Paramètres → Équipe* peuvent rejoindre : un inconnu qui crée un compte ne voit aucune donnée.

> Astuce : pour ne pas attendre l'email de confirmation, désactivez-la dans Supabase → Authentication → Sign In / Providers → Email → « Confirm email » (à réactiver ensuite si vous le souhaitez).

## 2. Mettre en ligne (Vercel, gratuit)

1. Poussez ce dossier sur un dépôt GitHub.
2. Sur vercel.com → *Add New Project* → importez le dépôt.
3. Ajoutez les 2 variables de `.env.example` dans *Environment Variables*.
4. Déployez. Puis, dans Supabase → Authentication → URL Configuration, mettez l'URL Vercel dans **Site URL** (et ajoutez `https://votre-url/auth/callback` aux Redirect URLs).

## 3. Ce que fait le CRM

| Écran | Rôle |
|---|---|
| **Tableau de bord** | Pipeline ouvert & pondéré, chiffre signé, acomptes, clients actifs, relances en retard, pipeline par étape, CA par offre (A→G), sources d'acquisition, clients à recontacter (> 21 j), activité récente |
| **Clients** | Recherche, filtres statut / secteur, tri, export CSV (Excel), fiche complète : contacts, opportunités, tâches, historique, boutons Appeler / WhatsApp / Email |
| **Pipeline** | Kanban par étape (glisser-déposer sur ordinateur, sélecteur sur mobile), filtre par catégorie d'offre, mis à jour en temps réel entre collègues |
| **Tâches & relances** | Groupées : en retard / aujourd'hui / demain / semaine ; mes tâches ou équipe ; raccourcis de date |
| **Notifications** | Cloche temps réel + notifications navigateur |
| **Paramètres** | Profil, équipe & invitations, activation des alertes, état de l'interconnexion |

**Étapes du pipeline** (calquées sur votre process : brief → devis 2 h → acompte 100 % → livraison) :
Nouveau → Brief reçu → Devis envoyé → Négociation → Acompte reçu → En production → Livré / Perdu.

**Automatismes côté base :**
- Chaque changement d'étape est tracé dans l'historique et notifié à l'équipe.
- « Acompte reçu » coche l'acompte payé ; le client passe automatiquement en statut *Client*.
- Chaque appel / WhatsApp / visite enregistré met à jour la date de dernier contact.
- Toutes les 10 min (pg_cron) : rappel 1 h avant chaque échéance de tâche + alerte quand la date de relance d'un client est atteinte.

## 4. Documents PDF

12 modèles, générés en vrais PDF vectoriels (texte sélectionnable/copiable, polices intégrées, sauts de page propres, en-tête et pied répétés, numérotation « Page x / y ») :

| Phase | Documents |
|---|---|
| Prospect | Accord de confidentialité (NDA), Proposition commerciale, Devis |
| Client | Bon de commande, Contrat de prestation, Facture proforma |
| Projet | Cahier des charges, Ordre de mission, Compte rendu de réunion, Rapport final |
| Clôture | Facture, État de compte client |

- **Dossier projet** (clic sur une carte du pipeline) : parcours Prospect → Client → Projet → Clôture, document suggéré selon l'étape, paiements, historique.
- **Numérotation automatique** par type et par année (DEV-2026-0001, FAC-2026-0001…).
- **Conversions** : proposition → devis → proforma / bon de commande / facture / contrat (les lignes suivent).
- **Paiements** : un paiement met à jour la facture (partielle / payée) et passe le projet en « Acompte reçu ».
- **Mentions légales** : RC, NIF, NIS, AI, RIB, montant en toutes lettres, TVA, droit de timbre — à compléter dans *Paramètres → Société*.
- Filigrane « BROUILLON » tant que le document n'est pas émis.

Les contrats et NDA sont des modèles de départ : faites-les valider par un juriste.

## 5. Interconnexion avec la base Supabase du site dzwhiteg.com

Le CRM est déjà prêt côté réception : la fonction **`ingest-lead`** est déployée et testée.
Chaque demande reçue crée (sans doublon) un client *Lead qualifié* + son contact + une opportunité à l'étape *Brief reçu*, et notifie toute l'équipe.

À faire une fois, dans la base **du site** : exécuter `supabase/interconnexion/site-vers-crm.sql` en remplaçant le nom de table et `VOTRE_SECRET`.
Le secret n'est pas dans ce dépôt ; pour le retrouver, exécutez dans le SQL Editor **du CRM** :
```sql
select value from private.integration_settings where key = 'webhook_secret';
```
La fonction reconnaît automatiquement les noms de colonnes courants (`nom`, `entreprise`, `telephone`, `wilaya`, `categorie`, `message`…).

## 6. Structure

```
src/app/(crm)/          pages du CRM (dashboard, clients, pipeline, tâches, notifications, paramètres)
src/app/login           connexion / création de compte
src/components/         shell responsive, formulaires, cloche de notifications, UI
src/lib/                client Supabase, constantes métier (offres A→G, wilayas, étapes), formats
src/lib/documents/      moteur PDF (react-pdf), modèles, montant en lettres, numérotation
src/middleware.ts       protection des pages (redirection vers /login)
supabase/functions/     code de la fonction ingest-lead (déjà déployée)
supabase/interconnexion script à exécuter côté site
```

Sécurité : RLS activée sur toutes les tables, accès réservé aux membres de l'équipe, fonctions internes non exposées (advisors Supabase : 0 alerte).
