import type { SupabaseClient } from "@supabase/supabase-js";
import { CLIENT_STATUSES, DEAL_STAGES, OPEN_STAGES, OFFER_CATEGORIES, SECTORS, SOURCES, labelOf } from "../constants";

/**
 * Builds an exact, pre-computed statistical snapshot of the CRM (read with the user's own rights).
 * The AI only comments these numbers — it never computes them itself, so figures stay reliable.
 */
type Row = Record<string, unknown>;
const num = (v: unknown) => Number(v ?? 0) || 0;
const r0 = (n: number) => Math.round(n);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const month = (d: unknown) => String(d ?? "").slice(0, 7);
const days = (d: unknown) => (d ? Math.floor((Date.now() - new Date(String(d)).getTime()) / 86400_000) : null);

function group<T extends Row>(rows: T[], key: (r: T) => string, val: (r: T) => number = () => 1) {
  const m: Record<string, { n: number; total: number }> = {};
  for (const r of rows) { const k = key(r) || "—"; (m[k] ??= { n: 0, total: 0 }); m[k].n++; m[k].total += val(r); }
  return Object.entries(m).map(([k, v]) => ({ key: k, count: v.n, total: r0(v.total) })).sort((a, b) => b.total - a.total || b.count - a.count);
}

async function all(sb: SupabaseClient, table: string, select: string) {
  const { data, error } = await sb.from(table).select(select).limit(5000);
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data ?? []) as unknown as Row[];
}

export async function buildSnapshot(sb: SupabaseClient) {
  const [clients, deals, docs, payments, tasks, activities] = await Promise.all([
    all(sb, "clients", "id, company_name, sector, status, source, wilaya, created_at, last_contact_at, next_followup_at"),
    all(sb, "deals", "id, client_id, title, category, product_format, stage, amount, deposit_amount, deposit_paid, probability, created_at, updated_at, stage_changed_at, expected_close, lost_reason"),
    all(sb, "documents", "kind, status, total_ttc, amount_paid, issue_date, due_date, client_id"),
    all(sb, "payments", "amount, paid_at, client_id, method"),
    all(sb, "tasks", "done, due_at, priority, created_at, done_at"),
    all(sb, "activities", "type, occurred_at"),
  ]);

  const cname = new Map(clients.map((c) => [c.id as string, c.company_name as string]));
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const stageLabel = (s: unknown) => labelOf(DEAL_STAGES, String(s));

  const open = deals.filter((d) => (OPEN_STAGES as readonly string[]).includes(String(d.stage)));
  const active = deals.filter((d) => ["acompte_recu", "en_cours"].includes(String(d.stage)));
  const won = deals.filter((d) => ["acompte_recu", "en_cours", "livre"].includes(String(d.stage)));
  const lost = deals.filter((d) => d.stage === "perdu");
  const weighted = open.reduce((s, d) => s + num(d.amount) * (num(d.probability) || (DEAL_STAGES.find((x) => x.value === d.stage)?.prob ?? 0)) / 100, 0);

  const invoices = docs.filter((d) => d.kind === "facture" && d.status !== "annule" && d.status !== "brouillon");
  const invoiced = invoices.reduce((s, d) => s + num(d.total_ttc), 0);
  const collected = payments.reduce((s, p) => s + num(p.amount), 0);
  const overdue = invoices.filter((d) => (d.status === "emis" || d.status === "partiel") && d.due_date && String(d.due_date) < today);
  const quotes = docs.filter((d) => d.kind === "devis" || d.kind === "proposition");
  const quotesDecided = quotes.filter((d) => d.status === "accepte" || d.status === "refuse");

  // last 12 months revenue (payments) + new deals
  const months: string[] = [];
  for (let i = 11; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push(d.toISOString().slice(0, 7)); }
  const byMonth = months.map((m) => ({
    mois: m,
    encaisse_DA: r0(payments.filter((p) => month(p.paid_at) === m).reduce((s, p) => s + num(p.amount), 0)),
    nouvelles_opportunites: deals.filter((d) => month(d.created_at) === m).length,
    valeur_nouvelles_opportunites_DA: r0(deals.filter((d) => month(d.created_at) === m).reduce((s, d) => s + num(d.amount), 0)),
    nouveaux_clients: clients.filter((c) => month(c.created_at) === m).length,
    factures_emises_DA: r0(invoices.filter((d) => month(d.issue_date) === m).reduce((s, d) => s + num(d.total_ttc), 0)),
  }));

  const revenueByClient = group(payments, (p) => cname.get(p.client_id as string) ?? "—", (p) => num(p.amount)).slice(0, 10);
  const stale = open
    .map((d) => ({ titre: d.title, client: cname.get(d.client_id as string), etape: stageLabel(d.stage), montant_DA: r0(num(d.amount)), jours_sans_mouvement: days(d.stage_changed_at ?? d.updated_at) }))
    .filter((d) => (d.jours_sans_mouvement ?? 0) >= 7)
    .sort((a, b) => (b.jours_sans_mouvement ?? 0) - (a.jours_sans_mouvement ?? 0))
    .slice(0, 12);

  return {
    date_du_jour: today,
    devise: "DA (dinar algérien)",
    volumes: { clients: clients.length, opportunites: deals.length, documents: docs.length, paiements: payments.length, taches: tasks.length, interactions: activities.length },
    clients: {
      par_statut: group(clients, (c) => labelOf(CLIENT_STATUSES, String(c.status))).map(({ key, count }) => ({ statut: key, nombre: count })),
      par_secteur: group(clients, (c) => labelOf(SECTORS, String(c.sector))).map(({ key, count }) => ({ secteur: key, nombre: count })),
      par_source: group(clients, (c) => labelOf(SOURCES, String(c.source))).map(({ key, count }) => ({ source: key, nombre: count })),
      par_wilaya_top10: group(clients, (c) => String(c.wilaya ?? "")).slice(0, 10).map(({ key, count }) => ({ wilaya: key, nombre: count })),
      relances_en_retard: clients.filter((c) => c.next_followup_at && String(c.next_followup_at).slice(0, 10) <= today).length,
      sans_contact_depuis_30j: clients.filter((c) => (days(c.last_contact_at ?? c.created_at) ?? 0) > 30).length,
    },
    pipeline: {
      par_etape: DEAL_STAGES.map((s) => {
        const l = deals.filter((d) => d.stage === s.value);
        return { etape: s.label, nombre: l.length, montant_DA: r0(l.reduce((a, d) => a + num(d.amount), 0)) };
      }),
      ouvert: { nombre: open.length, montant_DA: r0(open.reduce((s, d) => s + num(d.amount), 0)), montant_pondere_DA: r0(weighted) },
      en_production: { nombre: active.length, montant_DA: r0(active.reduce((s, d) => s + num(d.amount), 0)) },
      taux_de_conversion_pct: pct(won.length, won.length + lost.length),
      panier_moyen_gagne_DA: won.length ? r0(won.reduce((s, d) => s + num(d.amount), 0) / won.length) : 0,
      par_categorie: group(deals, (d) => labelOf(OFFER_CATEGORIES, String(d.category)), (d) => num(d.amount)).map(({ key, count, total }) => ({ categorie: key, nombre: count, montant_DA: total })),
      par_format: group(deals, (d) => String(d.product_format ?? ""), (d) => num(d.amount)).map(({ key, count, total }) => ({ format: key, nombre: count, montant_DA: total })),
      raisons_de_perte: group(lost, (d) => String(d.lost_reason ?? "non renseignée")).map(({ key, count }) => ({ raison: key, nombre: count })),
      opportunites_bloquees_7j_plus: stale,
    },
    finances: {
      facture_TTC_DA: r0(invoiced),
      encaisse_DA: r0(collected),
      reste_a_encaisser_DA: r0(invoices.reduce((s, d) => s + Math.max(0, num(d.total_ttc) - num(d.amount_paid)), 0)),
      factures_echues: { nombre: overdue.length, montant_DA: r0(overdue.reduce((s, d) => s + num(d.total_ttc) - num(d.amount_paid), 0)) },
      devis_emis: quotes.filter((d) => d.status !== "brouillon").length,
      taux_acceptation_devis_pct: pct(quotesDecided.filter((d) => d.status === "accepte").length, quotesDecided.length),
      top10_clients_par_encaissement: revenueByClient.map(({ key, total, count }) => ({ client: key, encaisse_DA: total, paiements: count })),
      paiements_par_mode: group(payments, (p) => String(p.method ?? "—"), (p) => num(p.amount)).map(({ key, total }) => ({ mode: key, montant_DA: total })),
    },
    activite: {
      taches_ouvertes: tasks.filter((t) => !t.done).length,
      taches_en_retard: tasks.filter((t) => !t.done && t.due_at && String(t.due_at) < now.toISOString()).length,
      taches_terminees_30j: tasks.filter((t) => t.done && (days(t.done_at) ?? 999) <= 30).length,
      interactions_30j_par_type: group(activities.filter((a) => (days(a.occurred_at) ?? 999) <= 30), (a) => String(a.type)).map(({ key, count }) => ({ type: key, nombre: count })),
    },
    evolution_12_mois: byMonth,
  };
}
