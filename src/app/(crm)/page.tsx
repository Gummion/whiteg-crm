"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { subDays, isPast, isToday } from "date-fns";
import {
  TrendingUp, Wallet, Users, AlarmClock, ArrowRight, CheckCircle2, Circle, StickyNote, Target,
} from "lucide-react";
import { ACT_ICON } from "@/components/icons";
import clsx from "clsx";
import { supabaseBrowser } from "@/lib/supabase/client";
import { DEAL_STAGES, OFFER_CATEGORIES, OPEN_STAGES, SOURCES } from "@/lib/constants";
import type { Activity, Client, Deal, Task } from "@/lib/types";
import { dueLabel, fmtAgo, fmtCompactDA, fmtDA } from "@/lib/format";
import { useOnChange } from "@/lib/events";
import { Empty, PageHeader, Spinner } from "@/components/ui";
import { useCrm } from "@/components/crm-context";


const WON = ["acompte_recu", "en_cours", "livre"];

export default function Dashboard() {
  const sb = supabaseBrowser();
  const { me } = useCrm();
  const [loading, setLoading] = useState(true);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [acts, setActs] = useState<Activity[]>([]);

  const load = useCallback(async () => {
    const [d, c, t, a] = await Promise.all([
      sb.from("deals").select("*, clients(id,company_name)"),
      sb.from("clients").select("*"),
      sb.from("tasks").select("*, clients(id,company_name)").eq("done", false).order("due_at", { ascending: true, nullsFirst: false }).limit(50),
      sb.from("activities").select("*, clients(id,company_name)").order("occurred_at", { ascending: false }).limit(12),
    ]);
    setDeals(d.data ?? []); setClients(c.data ?? []); setTasks(t.data ?? []); setActs(a.data ?? []);
    setLoading(false);
  }, [sb]);
  useEffect(() => { load(); }, [load]);
  useOnChange(load);

  const k = useMemo(() => {
    const open = deals.filter((d) => OPEN_STAGES.includes(d.stage));
    const won = deals.filter((d) => WON.includes(d.stage));
    const closed = deals.filter((d) => d.stage === "livre" || d.stage === "perdu");
    const since = subDays(new Date(), 30);
    const overdue = tasks.filter((t) => t.due_at && isPast(new Date(t.due_at)));
    const today = tasks.filter((t) => t.due_at && isToday(new Date(t.due_at)));
    const byStage = DEAL_STAGES.map((s) => {
      const ds = deals.filter((d) => d.stage === s.value);
      return { ...s, count: ds.length, amount: ds.reduce((a, d) => a + Number(d.amount), 0) };
    });
    const byCat = OFFER_CATEGORIES.map((c) => ({
      ...c, amount: won.filter((d) => d.category === c.value).reduce((a, d) => a + Number(d.amount), 0),
      count: deals.filter((d) => d.category === c.value).length,
    }));
    const bySource = SOURCES.map((s) => ({ ...s, count: clients.filter((c) => c.source === s.value).length })).filter((s) => s.count > 0).sort((a, b) => b.count - a.count);
    const stale = clients
      .filter((c) => (c.status === "lead" || c.status === "client") && (!c.last_contact_at || new Date(c.last_contact_at) < subDays(new Date(), 21)))
      .sort((a, b) => (a.last_contact_at ?? "").localeCompare(b.last_contact_at ?? ""))
      .slice(0, 6);
    return {
      pipeline: open.reduce((a, d) => a + Number(d.amount), 0),
      weighted: open.reduce((a, d) => a + Number(d.amount) * d.probability / 100, 0),
      openCount: open.length,
      signed: won.reduce((a, d) => a + Number(d.amount), 0),
      wonCount: won.length,
      deposits: deals.filter((d) => d.deposit_paid).reduce((a, d) => a + Number(d.deposit_amount || d.amount), 0),
      clients: clients.filter((c) => c.status === "client").length,
      newLeads: clients.filter((c) => new Date(c.created_at) > since).length,
      overdue, today,
      winRate: closed.length ? Math.round((closed.filter((d) => d.stage === "livre").length / closed.length) * 100) : null,
      byStage, byCat, bySource, stale,
    };
  }, [deals, clients, tasks]);

  const toggleTask = async (t: Task) => {
    setTasks((l) => l.filter((x) => x.id !== t.id));
    await sb.from("tasks").update({ done: true }).eq("id", t.id);
  };

  if (loading) return <Spinner />;

  const hour = new Date().getHours();
  const hello = hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";
  const maxStage = Math.max(1, ...k.byStage.map((s) => s.amount));
  const maxCat = Math.max(1, ...k.byCat.map((s) => s.amount));
  const maxSrc = Math.max(1, ...k.bySource.map((s) => s.count));
  const upcoming = tasks.slice(0, 7);

  return (
    <>
      <PageHeader title={`${hello}${me?.full_name ? ", " + me.full_name.split(" ")[0] : ""}`}
        subtitle="Voici l'état de votre activité White G aujourd'hui."
        actions={<Link href="/statistiques" className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-2 bg-panel px-3 text-sm hover:bg-panel-2">Statistiques du site →</Link>} />

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={TrendingUp} label="Pipeline ouvert" value={fmtCompactDA(k.pipeline)} hint={`${k.openCount} opportunité${k.openCount > 1 ? "s" : ""} · pondéré ${fmtCompactDA(k.weighted)}`} href="/pipeline" />
        <Kpi icon={Wallet} label="Chiffre signé" value={fmtCompactDA(k.signed)} hint={`${k.wonCount} projet${k.wonCount > 1 ? "s" : ""} · acomptes ${fmtCompactDA(k.deposits)}`} accent />
        <Kpi icon={Users} label="Clients actifs" value={String(k.clients)} hint={`+${k.newLeads} nouveau${k.newLeads > 1 ? "x" : ""} contact${k.newLeads > 1 ? "s" : ""} (30 j)`} href="/clients" />
        <Kpi icon={AlarmClock} label="Relances" value={String(k.overdue.length + k.today.length)}
          hint={k.overdue.length ? `${k.overdue.length} en retard` : "Rien en retard"} danger={k.overdue.length > 0} href="/taches" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Pipeline par étape */}
        <section className="card p-4 sm:p-5 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Pipeline par étape</h2>
              <p className="text-xs text-muted">Montant des devis (DA) à chaque étape</p>
            </div>
            <Link href="/pipeline" className="flex items-center gap-1 text-xs text-brand hover:underline">Ouvrir <ArrowRight className="h-3.5 w-3.5" /></Link>
          </div>
          <div className="space-y-2.5">
            {k.byStage.map((s) => (
              <div key={s.value} className="group grid grid-cols-[7.5rem_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[9rem_1fr_auto]" title={`${s.label} : ${s.count} · ${fmtDA(s.amount)}`}>
                <span className="flex items-center gap-2 truncate text-muted"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />{s.label}</span>
                <div className="h-6 overflow-hidden rounded-md bg-panel-2">
                  <div className="h-full rounded-r-[4px] bg-brand/80 transition-all group-hover:bg-brand" style={{ width: `${Math.max(s.amount ? 2 : 0, (s.amount / maxStage) * 100)}%` }} />
                </div>
                <span className="w-24 text-right tabular-nums text-xs"><b className="text-fg">{fmtCompactDA(s.amount)}</b> <span className="text-faint">· {s.count}</span></span>
              </div>
            ))}
          </div>
          {k.winRate !== null && (
            <p className="mt-4 flex items-center gap-2 border-t border-line pt-3 text-xs text-muted">
              <Target className="h-4 w-4 text-brand" /> Taux de réussite (livré vs perdu) : <b className="text-fg">{k.winRate} %</b>
            </p>
          )}
        </section>

        {/* Tâches */}
        <section className="card flex flex-col p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">À faire</h2>
            <Link href="/taches" className="flex items-center gap-1 text-xs text-brand hover:underline">Tout voir <ArrowRight className="h-3.5 w-3.5" /></Link>
          </div>
          {upcoming.length === 0 ? (
            <Empty icon={CheckCircle2} title="Tout est à jour" text="Aucune tâche en attente." />
          ) : (
            <ul className="-mx-2 space-y-0.5">
              {upcoming.map((t) => {
                const d = dueLabel(t.due_at);
                return (
                  <li key={t.id} className="flex items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-panel-2">
                    <button onClick={() => toggleTask(t)} className="mt-0.5 text-faint hover:text-brand" aria-label="Terminer"><Circle className="h-[18px] w-[18px]" /></button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{t.title}</p>
                      <p className="truncate text-xs">
                        <span className={clsx(d.tone === "danger" && "text-red-400", d.tone === "warn" && "text-brand", d.tone === "info" && "text-sky-400", d.tone === "muted" && "text-faint")}>{d.text}</span>
                        {t.clients && <Link href={`/clients/${t.clients.id}`} className="text-faint hover:text-fg"> · {t.clients.company_name}</Link>}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* CA par catégorie */}
        <section className="card p-4 sm:p-5">
          <h2 className="font-semibold">Chiffre signé par offre</h2>
          <p className="mb-4 text-xs text-muted">Catégories A → G du catalogue White G</p>
          <div className="space-y-2">
            {k.byCat.map((c) => (
              <div key={c.value} className="text-sm" title={`${c.label} : ${fmtDA(c.amount)} · ${c.count} opportunité(s)`}>
                <div className="mb-1 flex justify-between gap-2 text-xs">
                  <span className="truncate text-muted"><b className="mr-1 text-fg">{c.value}</b>{c.short}</span>
                  <span className="tabular-nums text-fg">{fmtCompactDA(c.amount)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-panel-2"><div className="h-full rounded-full bg-brand" style={{ width: `${(c.amount / maxCat) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </section>

        {/* Sources */}
        <section className="card p-4 sm:p-5">
          <h2 className="font-semibold">D&apos;où viennent vos clients</h2>
          <p className="mb-4 text-xs text-muted">Nombre de fiches par source d&apos;acquisition</p>
          {k.bySource.length === 0 ? <p className="py-6 text-center text-sm text-faint">Pas encore de données</p> : (
            <div className="space-y-2">
              {k.bySource.map((s) => (
                <div key={s.value} className="grid grid-cols-[7rem_1fr_2rem] items-center gap-2 text-xs" title={`${s.label} : ${s.count}`}>
                  <span className="truncate text-muted">{s.label}</span>
                  <div className="h-4 overflow-hidden rounded bg-panel-2"><div className="h-full rounded-r-[4px] bg-sky-400/70" style={{ width: `${(s.count / maxSrc) * 100}%` }} /></div>
                  <span className="text-right tabular-nums text-fg">{s.count}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* À relancer */}
        <section className="card p-4 sm:p-5">
          <h2 className="font-semibold">Clients à recontacter</h2>
          <p className="mb-3 text-xs text-muted">Leads & clients sans contact depuis 21 jours</p>
          {k.stale.length === 0 ? <p className="py-6 text-center text-sm text-faint">Tout le monde a été contacté récemment</p> : (
            <ul className="-mx-2">
              {k.stale.map((c) => (
                <li key={c.id}>
                  <Link href={`/clients/${c.id}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 hover:bg-panel-2">
                    <span className="truncate text-sm">{c.company_name}</span>
                    <span className="shrink-0 text-xs text-faint">{c.last_contact_at ? fmtAgo(c.last_contact_at) : "jamais contacté"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Activité récente */}
        <section className="card p-4 sm:p-5 xl:col-span-3">
          <h2 className="mb-3 font-semibold">Activité récente</h2>
          {acts.length === 0 ? <p className="py-6 text-center text-sm text-faint">Aucune activité pour l&apos;instant</p> : (
            <ul className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
              {acts.map((a) => {
                const Icon = ACT_ICON[a.type] ?? StickyNote;
                return (
                  <li key={a.id} className="flex gap-3 border-b border-line/60 py-2.5">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-panel-2 text-muted"><Icon className="h-3.5 w-3.5" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{a.subject}</p>
                      <p className="truncate text-xs text-faint">
                        {a.clients && <Link className="hover:text-fg" href={`/clients/${a.clients.id}`}>{a.clients.company_name}</Link>} · {fmtAgo(a.occurred_at)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function Kpi({ icon: Icon, label, value, hint, href, accent, danger }: { icon: React.ElementType; label: string; value: string; hint: string; href?: string; accent?: boolean; danger?: boolean }) {
  const body = (
    <div className={clsx("card h-full p-4 transition", href && "hover:border-line-2", accent && "border-brand/30 bg-gradient-to-br from-brand/10 to-transparent")}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted">{label}</span>
        <Icon className={clsx("h-4 w-4", danger ? "text-red-400" : "text-brand")} />
      </div>
      <p className="mt-2 text-xl font-semibold tabular-nums tracking-tight sm:text-2xl">{value}</p>
      <p className={clsx("mt-1 truncate text-[11px] sm:text-xs", danger ? "text-red-400" : "text-faint")}>{hint}</p>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

