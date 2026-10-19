"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { BarChart3, ArrowUpRight, ArrowDownRight, Info } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Empty, PageHeader, Spinner, useToast } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { GRADE_COLOR } from "@/lib/qualification";

/* ---------- Types renvoyés par site_stats() ---------- */
type Row = { key: string; sessions?: number; visitors?: number; views?: number; n?: number; conversions?: number; avg_engaged?: number; bounce?: number; country?: string };
type Stats = {
  period: { from: string; to: string; days: number };
  kpi: { visitors: number; sessions: number; pageviews: number; new_visitors: number; avg_engaged: number | null; bounce_rate: number | null; conversions: number };
  previous: { visitors: number; sessions: number; pageviews: number; conversions: number };
  daily: { day: string; visitors: number; sessions: number; pageviews: number }[];
  hours: { h: number; sessions: number }[];
  channels: Row[]; campaigns: { src: string; medium: string; campaign: string | null; sessions: number; conversions: number }[];
  referrers: Row[]; in_app: Row[]; inapp_redirects: number; countries: Row[]; cities: Row[];
  devices: Row[]; os: Row[]; browsers: Row[]; langs: Row[]; pages: Row[]; landings: Row[]; clicks: Row[];
  funnel: { step: string; n: number }[];
  requests_by_channel: { key: string; n: number; a: number; b: number; c: number; d: number }[];
  recent: { id: string; started_at: string; channel: string; in_app: string | null; utm_campaign: string | null; landing_path: string; device: string; os: string; browser: string; country: string | null; city: string | null; pageviews: number; engaged_seconds: number; is_new_visitor: boolean; converted: boolean }[];
};

/* ---------- Libellés ---------- */
const CHANNEL: Record<string, string> = {
  direct: "Accès direct", instagram: "Instagram", facebook: "Facebook", meta_ads: "Publicité Meta", threads: "Threads", google: "Google (recherche)",
  google_ads: "Publicité Google", moteur: "Autres moteurs", whatsapp: "WhatsApp", tiktok: "TikTok", tiktok_ads: "Publicité TikTok", linkedin: "LinkedIn",
  youtube: "YouTube", x: "X / Twitter", telegram: "Telegram", snapchat: "Snapchat", email: "E-mail", hors_ligne: "QR code / hors ligne",
  campagne: "Autre campagne (UTM)", autre_site: "Autre site web", "non suivi": "Non suivi (avant le traceur)",
};
const CLICK: Record<string, string> = {
  whatsapp: "WhatsApp", telephone: "Appel téléphonique", email: "E-mail", whatsapp_barre_mobile: "WhatsApp (barre mobile)",
  devis_barre_mobile: "Devis (barre mobile)", offres_barre_mobile: "Offres (barre mobile)", devis_accueil_haut: "Devis (haut de l'accueil)", devis_accueil_bas: "Devis (bas de l'accueil)",
};
const INAPP: Record<string, string> = { navigateur: "Navigateur normal", instagram: "Dans Instagram", facebook: "Dans Facebook", messenger: "Dans Messenger", tiktok: "Dans TikTok", threads: "Dans Threads", snapchat: "Dans Snapchat", linkedin: "Dans LinkedIn" };
const COUNTRY: Record<string, string> = { DZ: "Algérie", FR: "France", TN: "Tunisie", MA: "Maroc", LY: "Libye", BE: "Belgique", CA: "Canada", US: "États-Unis", DE: "Allemagne", ES: "Espagne", IT: "Italie", GB: "Royaume-Uni", AE: "Émirats", SA: "Arabie saoudite", QA: "Qatar", TR: "Turquie", CH: "Suisse", NL: "Pays-Bas", "??": "Inconnu" };
const LANG: Record<string, string> = { fr: "Français", ar: "Arabe", en: "Anglais", es: "Espagnol", de: "Allemand", it: "Italien", tr: "Turc" };
const label = (map: Record<string, string>, k: string) => map[k] ?? (k.startsWith("devis_offre_") ? `Devis depuis l'offre ${k.slice(12)}` : k);

const fmtN = (n: number | null | undefined) => new Intl.NumberFormat("fr-FR").format(Number(n ?? 0));
const fmtDur = (s: number | null | undefined) => { const v = Math.round(Number(s ?? 0)); return v < 60 ? `${v} s` : `${Math.floor(v / 60)} min ${String(v % 60).padStart(2, "0")}`; };
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

const PERIODS = [
  { key: "7", label: "7 jours", days: 7 }, { key: "30", label: "30 jours", days: 30 },
  { key: "90", label: "3 mois", days: 90 }, { key: "365", label: "12 mois", days: 365 },
];

export default function StatsPage() {
  const sb = supabaseBrowser();
  const toast = useToast();
  const [period, setPeriod] = useState("30");
  const [data, setData] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    const days = PERIODS.find((p) => p.key === period)!.days;
    const to = new Date(); const from = new Date(); from.setDate(to.getDate() - days + 1);
    const { data, error } = await sb.rpc("site_stats", { p_from: iso(from), p_to: iso(to) });
    setLoading(false);
    if (error) { setErr(error.message); return; }
    setData(data as Stats);
  }, [sb, period]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 120_000); return () => clearInterval(t); }, [load]);

  return (
    <div>
      <PageHeader title="Statistiques du site" subtitle="dzwhiteg.com — visites, provenance, comportement et demandes. Mise à jour toutes les 2 minutes."
        actions={<div className="flex gap-1 rounded-lg border border-line bg-panel p-1">
          {PERIODS.map((p) => (
            <button key={p.key} onClick={() => setPeriod(p.key)} className={clsx("rounded-md px-3 py-1.5 text-sm", period === p.key ? "bg-panel-2 font-medium text-fg" : "text-muted hover:text-fg")}>{p.label}</button>
          ))}
        </div>} />

      {loading && !data ? <Spinner /> : err ? (
        <div className="card"><Empty icon={BarChart3} title="Statistiques indisponibles" text={/site_stats|function|schema cache/i.test(err) ? "Le module de statistiques n'est pas encore installé dans la base (fichier SQL 04_analytics à exécuter)." : err}
          action={<button className="text-sm text-brand" onClick={() => { load(); toast("Nouvel essai…", "info"); }}>Réessayer</button>} /></div>
      ) : data && <Dashboard d={data} />}
    </div>
  );
}

function Dashboard({ d }: { d: Stats }) {
  const k = d.kpi, p = d.previous;
  const convRate = pct(k.conversions, k.sessions);
  const inAppTotal = d.in_app.filter((x) => x.key !== "navigateur").reduce((a, x) => a + (x.sessions ?? 0), 0);
  const noData = !k.sessions;

  return (
    <div className="space-y-4">
      {noData && (
        <div className="card flex gap-3 p-4 text-sm text-muted"><Info className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          Aucune visite enregistrée sur cette période. Le comptage commence à la mise en ligne du traceur : les chiffres apparaîtront dès les premières visites.</div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Kpi label="Visiteurs" value={fmtN(k.visitors)} now={k.visitors} prev={p.visitors} hint={`dont ${fmtN(k.new_visitors)} nouveaux visiteurs`} />
        <Kpi label="Visites" value={fmtN(k.sessions)} now={k.sessions} prev={p.sessions} hint="Une visite = une session (30 min d'inactivité max)" />
        <Kpi label="Pages vues" value={fmtN(k.pageviews)} now={k.pageviews} prev={p.pageviews} hint={k.sessions ? `${(k.pageviews / k.sessions).toFixed(1).replace(".", ",")} pages par visite` : "—"} />
        <Kpi label="Temps moyen" value={fmtDur(k.avg_engaged)} hint="Temps réellement passé sur l'onglet, par visite" />
        <Kpi label="Rebond" value={`${k.bounce_rate ?? 0} %`} hint="Visites d'une seule page, moins de 10 s" />
        <Kpi label="Demandes de devis" value={fmtN(k.conversions)} now={k.conversions} prev={p.conversions} hint={`${convRate} % des visites`} accent />
      </div>

      <Card title="Visiteurs par jour" sub="Survolez une colonne pour le détail."><DailyChart rows={d.daily} /></Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="D'où viennent les visiteurs" sub="Canal d'arrivée de chaque visite, avec le nombre de demandes de devis qu'il a généré.">
          <BarList rows={d.channels.map((r) => ({ name: label(CHANNEL, r.key), value: r.sessions ?? 0, extra: `${r.conversions ? `${r.conversions} devis · ` : ""}${fmtDur(r.avg_engaged)}` }))} empty="Aucune visite" />
        </Card>
        <Card title="Entonnoir de la demande de devis" sub="Combien de visiteurs passent chaque étape, jusqu'à la fiche de commande.">
          <Funnel steps={d.funnel} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Demandes reçues par source" sub="Qualité des demandes (note A à D) selon leur provenance.">
          {d.requests_by_channel.length ? (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-faint"><tr><th className="pb-2 font-normal">Source</th><th className="pb-2 text-right font-normal">Demandes</th>{["A", "B", "C", "D"].map((g) => <th key={g} className="pb-2 text-right font-normal">{g}</th>)}</tr></thead>
              <tbody>{d.requests_by_channel.map((r) => (
                <tr key={r.key} className="border-t border-line">
                  <td className="py-1.5">{label(CHANNEL, r.key)}</td><td className="text-right font-medium">{r.n}</td>
                  {(["a", "b", "c", "d"] as const).map((g) => <td key={g} className="text-right"><span className="inline-flex items-center gap-1">{r[g] ? <span className="h-2 w-2 rounded-full" style={{ background: GRADE_COLOR[g.toUpperCase()] }} /> : null}{r[g] || "·"}</span></td>)}
                </tr>))}</tbody>
            </table>
          ) : <p className="text-sm text-muted">Aucune demande sur la période.</p>}
        </Card>
        <Card title="Campagnes (liens UTM)" sub="Visites venues de liens marqués utm_source / utm_campaign — publicités, bio Instagram, QR codes…">
          {d.campaigns.length ? (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-faint"><tr><th className="pb-2 font-normal">Campagne</th><th className="pb-2 font-normal">Source · support</th><th className="pb-2 text-right font-normal">Visites</th><th className="pb-2 text-right font-normal">Devis</th></tr></thead>
              <tbody>{d.campaigns.map((r, i) => (
                <tr key={i} className="border-t border-line"><td className="py-1.5">{r.campaign ?? "—"}</td><td className="text-muted">{r.src} · {r.medium}</td><td className="text-right">{fmtN(r.sessions)}</td><td className="text-right">{r.conversions || "·"}</td></tr>))}</tbody>
            </table>
          ) : <p className="text-sm text-muted">Aucun lien de campagne utilisé. Voir le conseil en bas de page pour marquer vos liens Instagram et publicités.</p>}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Navigateur Instagram / Facebook" sub={`${pct(inAppTotal, k.sessions)} % des visites ont commencé dans une application · ${fmtN(d.inapp_redirects)} renvois vers le navigateur normal.`}>
          <BarList rows={d.in_app.map((r) => ({ name: label(INAPP, r.key), value: r.sessions ?? 0 }))} />
        </Card>
        <Card title="Pays"><BarList rows={d.countries.map((r) => ({ name: label(COUNTRY, r.key), value: r.sessions ?? 0 }))} /></Card>
        <Card title="Villes" sub="Approximatif (selon l'opérateur internet)."><BarList rows={d.cities.map((r) => ({ name: `${r.key}${r.country && r.country !== "DZ" ? ` (${r.country})` : ""}`, value: r.sessions ?? 0 }))} /></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Pages les plus vues"><BarList rows={d.pages.map((r) => ({ name: r.key, value: r.views ?? 0, extra: `${fmtN(r.sessions)} visites` }))} mono /></Card>
        <Card title="Pages d'arrivée" sub="Première page vue · % de visiteurs repartis sans rien faire."><BarList rows={d.landings.map((r) => ({ name: r.key ?? "—", value: r.sessions ?? 0, extra: `rebond ${r.bounce ?? 0} %` }))} mono /></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Clics de contact et boutons" sub="WhatsApp, téléphone, e-mail et boutons « Devis »."><BarList rows={d.clicks.map((r) => ({ name: label(CLICK, r.key), value: r.n ?? 0, extra: `${fmtN(r.sessions)} visites` }))} empty="Aucun clic" /></Card>
        <Card title="Heures de visite" sub="Heure d'Alger — pour savoir quand publier et quand répondre vite."><HoursChart rows={d.hours} /></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <Card title="Appareils"><BarList rows={d.devices.map((r) => ({ name: r.key, value: r.sessions ?? 0 }))} /></Card>
        <Card title="Systèmes"><BarList rows={d.os.map((r) => ({ name: r.key, value: r.sessions ?? 0 }))} /></Card>
        <Card title="Navigateurs"><BarList rows={d.browsers.map((r) => ({ name: r.key, value: r.sessions ?? 0 }))} /></Card>
        <Card title="Langue du téléphone"><BarList rows={d.langs.map((r) => ({ name: label(LANG, r.key), value: r.sessions ?? 0 }))} /></Card>
      </div>

      <Card title="Sites qui envoient des visiteurs"><BarList rows={d.referrers.map((r) => ({ name: r.key, value: r.sessions ?? 0 }))} empty="Aucun site référent" mono /></Card>

      <Card title="Dernières visites">
        {d.recent.length ? (
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs text-faint"><tr>{["Quand", "Source", "Arrivée", "Appareil", "Lieu", "Pages", "Temps", ""].map((h) => <th key={h} className="px-1 pb-2 font-normal">{h}</th>)}</tr></thead>
              <tbody>{d.recent.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="whitespace-nowrap px-1 py-1.5">{fmtDateTime(r.started_at)}{r.is_new_visitor ? <span className="ml-1 text-[10px] text-brand">nouveau</span> : null}</td>
                  <td className="px-1">{label(CHANNEL, r.channel)}{r.utm_campaign ? <span className="text-faint"> · {r.utm_campaign}</span> : null}{r.in_app ? <span className="text-faint"> · {label(INAPP, r.in_app)}</span> : null}</td>
                  <td className="px-1 font-mono text-xs">{r.landing_path}</td>
                  <td className="px-1 text-muted">{r.device} · {r.os}</td>
                  <td className="px-1 text-muted">{[r.city, r.country].filter(Boolean).join(", ") || "—"}</td>
                  <td className="px-1 text-right">{r.pageviews}</td>
                  <td className="whitespace-nowrap px-1 text-right">{fmtDur(r.engaged_seconds)}</td>
                  <td className="px-1 text-right">{r.converted ? <span className="rounded bg-brand-soft px-1.5 py-0.5 text-[11px] text-brand">devis</span> : null}</td>
                </tr>))}</tbody>
            </table>
          </div>
        ) : <p className="text-sm text-muted">Aucune visite.</p>}
      </Card>

      <div className="card p-4 text-sm text-muted">
        <p className="mb-1 font-medium text-fg">Conseil : marquez vos liens pour savoir exactement ce qui marche</p>
        <p>Dans la bio Instagram, les publicités Meta et les QR codes, utilisez des liens comme
          <code className="mx-1 rounded bg-panel-2 px-1.5 py-0.5 text-xs text-fg">https://www.dzwhiteg.com/?utm_source=instagram&amp;utm_medium=bio&amp;utm_campaign=gummies_oct</code>.
          Pour une publicité, mettez <code className="rounded bg-panel-2 px-1 text-xs text-fg">utm_medium=paid</code> : elle apparaîtra dans « Publicité Meta » avec son nom de campagne et le nombre de devis qu&apos;elle a apportés.</p>
        <p className="mt-2">Confidentialité : aucune adresse IP ni donnée personnelle n&apos;est enregistrée ; la ville est approximative. Les données de plus de 13 mois sont supprimées automatiquement.</p>
      </div>
    </div>
  );
}

/* ---------- Pièces ---------- */
function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {sub && <p className="mt-0.5 text-xs text-faint">{sub}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Kpi({ label, value, hint, now, prev, accent }: { label: string; value: string; hint?: string; now?: number; prev?: number; accent?: boolean }) {
  const delta = now !== undefined && prev !== undefined && prev > 0 ? Math.round(((now - prev) / prev) * 100) : null;
  return (
    <div className={clsx("card p-4", accent && "border-brand/40")}>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-faint">
        {delta !== null && (
          <span className={clsx("inline-flex items-center gap-0.5 font-medium", delta >= 0 ? "text-emerald-400" : "text-red-400")}>
            {delta >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}{delta >= 0 ? "+" : ""}{delta} %
          </span>
        )}
        {delta !== null && <span>vs période précédente</span>}
      </div>
      {hint && <p className="mt-1 text-[11px] leading-snug text-faint">{hint}</p>}
    </div>
  );
}

function BarList({ rows, empty = "Aucune donnée", mono }: { rows: { name: string; value: number; extra?: string }[]; empty?: string; mono?: boolean }) {
  if (!rows.length || rows.every((r) => !r.value)) return <p className="text-sm text-muted">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  const total = rows.reduce((a, r) => a + r.value, 0);
  return (
    <ul className="space-y-1.5" role="list">
      {rows.map((r, i) => (
        <li key={i} className="group" title={`${r.name} : ${fmtN(r.value)} (${pct(r.value, total)} %)${r.extra ? " · " + r.extra : ""}`}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className={clsx("min-w-0 truncate", mono && "font-mono text-xs")}>{r.name}</span>
            <span className="shrink-0 tabular-nums"><span className="font-medium">{fmtN(r.value)}</span><span className="ml-1.5 text-xs text-faint">{pct(r.value, total)} %</span></span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-panel-2"><div className="h-full rounded-full bg-brand transition-all group-hover:opacity-80" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} /></div>
            {r.extra && <span className="w-28 shrink-0 truncate text-right text-[11px] text-faint">{r.extra}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}

function Funnel({ steps }: { steps: { step: string; n: number }[] }) {
  const top = Math.max(steps[0]?.n ?? 0, 1);
  return (
    <ol className="space-y-2">
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].n : null;
        return (
          <li key={s.step}>
            <div className="flex items-baseline justify-between text-sm">
              <span>{i + 1}. {s.step}</span>
              <span className="tabular-nums"><span className="font-medium">{fmtN(s.n)}</span>{prev !== null && <span className="ml-1.5 text-xs text-faint">{pct(s.n, prev)} % de l&apos;étape précédente</span>}</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-panel-2"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(1.5, (s.n / top) * 100)}%`, opacity: 1 - i * 0.09 }} /></div>
          </li>
        );
      })}
    </ol>
  );
}

function DailyChart({ rows }: { rows: Stats["daily"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = useMemo(() => Math.max(...rows.map((r) => r.visitors), 1), [rows]);
  const ticks = useMemo(() => { const step = Math.max(1, Math.ceil(max / 4)); return [0, step, step * 2, step * 3, step * 4].filter((t) => t <= Math.max(max, step * 4)); }, [max]);
  const top = ticks[ticks.length - 1] || 1;
  const H = 160;
  const every = Math.ceil(rows.length / 8);
  const h = hover !== null ? rows[hover] : null;
  return (
    <div className="relative">
      <div className="flex">
        <div className="relative mr-2 w-8 shrink-0 text-right text-[10px] text-faint" style={{ height: H }}>
          {ticks.map((t) => <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: H - (t / top) * H }}>{fmtN(t)}</span>)}
        </div>
        <div className="relative flex-1" style={{ height: H }} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => <div key={t} className="absolute inset-x-0 border-t border-line" style={{ top: H - (t / top) * H }} />)}
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {rows.map((r, i) => (
              <div key={r.day} className="relative flex h-full flex-1 items-end justify-center" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${r.day} : ${r.visitors} visiteurs`}>
                <div className={clsx("w-full max-w-[24px] rounded-t-[4px] bg-brand transition-opacity", hover !== null && hover !== i && "opacity-40")} style={{ height: r.visitors ? Math.max(2, (r.visitors / top) * H) : 0 }} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="ml-10 mt-1 flex gap-[2px] text-[10px] text-faint">
        {rows.map((r, i) => <span key={r.day} className="flex-1 truncate text-center">{i % every === 0 ? new Date(r.day + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : ""}</span>)}
      </div>
      {h && (
        <div className="pointer-events-none absolute right-2 top-0 rounded-lg border border-line-2 bg-panel-2 px-3 py-2 text-xs shadow-xl">
          <p className="font-medium">{new Date(h.day + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</p>
          <p className="mt-1"><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-brand" />{fmtN(h.visitors)} visiteurs</p>
          <p className="text-muted">{fmtN(h.sessions)} visites · {fmtN(h.pageviews)} pages vues</p>
        </div>
      )}
    </div>
  );
}

function HoursChart({ rows }: { rows: Stats["hours"] }) {
  const max = Math.max(...rows.map((r) => r.sessions), 1);
  if (rows.every((r) => !r.sessions)) return <p className="text-sm text-muted">Aucune visite</p>;
  return (
    <div>
      <div className="flex h-28 items-end gap-[2px]">
        {rows.map((r) => (
          <div key={r.h} className="flex h-full flex-1 items-end" title={`${r.h} h – ${r.h + 1} h : ${r.sessions} visites`}>
            <div className="w-full rounded-t-[3px] bg-brand" style={{ height: r.sessions ? Math.max(2, (r.sessions / max) * 112) : 0 }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-faint">{[0, 6, 12, 18, 23].map((h) => <span key={h}>{h} h</span>)}</div>
    </div>
  );
}
