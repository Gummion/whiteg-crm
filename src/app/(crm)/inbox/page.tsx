"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Inbox, RefreshCw, Mail, FileText, Users, Check, EyeOff, Undo2, Plug, ShieldCheck, AlertTriangle, Search } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { BridgeError, fetchCatalog, fetchSite, serviceName, type Catalog, type SiteClient, type SiteLead, type SiteMessage, type SourceTable } from "@/lib/site-bridge";
import { fmtAgo, fmtDateTime } from "@/lib/format";
import { useOnChange } from "@/lib/events";
import { Badge, Button, Empty, PageHeader, Spinner, useToast } from "@/components/ui";
import { ImportModal, type InboxItem, type Match } from "@/components/inbox/import-modal";

type Link_ = { source_table: SourceTable; external_id: string; status: "imported" | "linked" | "ignored"; client_id: string | null; handled_at: string };
type CrmIndex = { clients: { id: string; company_name: string; email: string | null }[]; contacts: { client_id: string; email: string | null }[] };

const TABS: { key: SourceTable; label: string; icon: React.ElementType }[] = [
  { key: "leads", label: "Demandes de devis", icon: FileText },
  { key: "contact_messages", label: "Messages de contact", icon: Mail },
  { key: "clients", label: "Clients du site", icon: Users },
];

const norm = (s?: string | null) => (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\b(sarl|eurl|spa|snc|sas|ets|etablissements?)\b/g, "").replace(/[^a-z0-9]/g, "");

export default function InboxPage() {
  const sb = supabaseBrowser();
  const toast = useToast();
  const [tab, setTab] = useState<SourceTable>("leads");
  const [filter, setFilter] = useState<"todo" | "done" | "ignored" | "all">("todo");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Record<SourceTable, (SiteLead | SiteMessage | SiteClient)[]>>({ leads: [], contact_messages: [], clients: [] });
  const [catalog, setCatalog] = useState<Catalog>({ categories: [], services: [], offers: [] });
  const [links, setLinks] = useState<Link_[]>([]);
  const [crm, setCrm] = useState<CrmIndex>({ clients: [], contacts: [] });
  const [state, setState] = useState<"loading" | "ok" | "not_configured" | "error">("loading");
  const [error, setError] = useState("");
  const [current, setCurrent] = useState<InboxItem | null>(null);

  const loadCrm = useCallback(async () => {
    const [l, c, k] = await Promise.all([
      sb.from("inbox_links").select("source_table,external_id,status,client_id,handled_at"),
      sb.from("clients").select("id,company_name,email"),
      sb.from("contacts").select("client_id,email"),
    ]);
    setLinks((l.data as Link_[]) ?? []);
    setCrm({ clients: c.data ?? [], contacts: k.data ?? [] });
  }, [sb]);

  const load = useCallback(async () => {
    setState((s) => (s === "ok" ? s : "loading"));
    try {
      const [leads, messages, clients, cat] = await Promise.all([
        fetchSite<SiteLead>("leads"), fetchSite<SiteMessage>("contact_messages"), fetchSite<SiteClient>("clients").catch(() => []), fetchCatalog(),
      ]);
      setRows({ leads, contact_messages: messages, clients });
      setCatalog(cat);
      await loadCrm();
      setState("ok");
    } catch (e) {
      if (e instanceof BridgeError && e.code === "not_configured") setState("not_configured");
      else { setState("error"); setError((e as Error).message); }
    }
  }, [loadCrm]);
  useEffect(() => { load(); }, [load]);
  useOnChange(loadCrm);

  const linkOf = useCallback((t: SourceTable, id: string) => links.find((l) => l.source_table === t && l.external_id === id), [links]);

  const matchesFor = useCallback((item: InboxItem): Match[] => {
    const email = ("email" in item.row ? item.row.email : null)?.toLowerCase();
    const company = norm("company_name" in item.row ? item.row.company_name : (item.row as SiteMessage).name);
    const out = new Map<string, Match>();
    if (email) {
      crm.clients.filter((c) => c.email?.toLowerCase() === email).forEach((c) => out.set(c.id, { id: c.id, company_name: c.company_name, reason: "même email" }));
      crm.contacts.filter((c) => c.email?.toLowerCase() === email).forEach((ct) => {
        const c = crm.clients.find((x) => x.id === ct.client_id);
        if (c && !out.has(c.id)) out.set(c.id, { id: c.id, company_name: c.company_name, reason: "email d'un contact" });
      });
    }
    if (company.length >= 3) crm.clients.filter((c) => norm(c.company_name) === company).forEach((c) => { if (!out.has(c.id)) out.set(c.id, { id: c.id, company_name: c.company_name, reason: "même nom" }); });
    return [...out.values()];
  }, [crm]);

  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return rows[tab]
      .map((row) => ({ table: tab, row } as InboxItem))
      .filter((it) => {
        const l = linkOf(tab, it.row.id);
        if (filter === "todo") return !l;
        if (filter === "done") return l && l.status !== "ignored";
        if (filter === "ignored") return l?.status === "ignored";
        return true;
      })
      .filter((it) => !n || JSON.stringify(it.row).toLowerCase().includes(n));
  }, [rows, tab, filter, q, linkOf]);

  const todoCount = (t: SourceTable) => rows[t].filter((r) => !linkOf(t, r.id)).length;

  const ignore = async (it: InboxItem) => {
    const { error } = await sb.from("inbox_links").upsert({ source_table: it.table, external_id: it.row.id, status: "ignored" }, { onConflict: "source_table,external_id" });
    if (error) return toast(error.message, "err");
    toast("Ignoré — vous pourrez le rétablir à tout moment"); loadCrm();
  };
  const restore = async (it: InboxItem) => {
    await sb.from("inbox_links").delete().eq("source_table", it.table).eq("external_id", it.row.id);
    loadCrm();
  };

  if (state === "loading") return <Spinner />;

  return (
    <>
      <PageHeader title="Boîte de réception" subtitle="Demandes arrivées sur le site — à vérifier avant d'entrer dans le CRM"
        actions={state === "ok" && <Button variant="outline" size="sm" className="h-9" onClick={load}><RefreshCw className="h-4 w-4" /> Actualiser</Button>} />

      {state === "not_configured" && <SetupCard />}
      {state === "error" && (
        <div className="card flex items-start gap-3 border-red-500/30 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
          <div><p className="font-medium">Impossible de lire la base du site</p><p className="text-muted">{error}</p><Button size="sm" variant="outline" className="mt-3" onClick={load}>Réessayer</Button></div>
        </div>
      )}

      {state === "ok" && (
        <>
          <p className="mb-4 flex items-center gap-2 text-xs text-faint"><ShieldCheck className="h-4 w-4 text-emerald-400" /> Lecture seule : le CRM ne modifie jamais la base du site. Chaque import est validé par vous.</p>

          <div className="-mx-3 mb-3 flex gap-1.5 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={clsx("flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm", tab === t.key ? "border-brand bg-brand-soft text-brand" : "border-line text-muted hover:text-fg")}>
                <t.icon className="h-4 w-4" /> {t.label}
                {todoCount(t.key) > 0 && <span className="rounded-full bg-brand px-1.5 text-[10px] font-bold text-black">{todoCount(t.key)}</span>}
              </button>
            ))}
          </div>

          <div className="mb-4 flex flex-col gap-2 sm:flex-row">
            <div className="inline-grid grid-cols-4 rounded-lg border border-line bg-panel p-1 text-xs sm:text-sm">
              {([["todo", "À traiter"], ["done", "Importés"], ["ignored", "Ignorés"], ["all", "Tous"]] as const).map(([k, l]) => (
                <button key={k} onClick={() => setFilter(k)} className={clsx("rounded-md px-2.5 py-1.5", filter === k ? "bg-panel-2 font-medium" : "text-muted")}>{l}</button>
              ))}
            </div>
            <div className="relative sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
              <input className="input pl-9" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>

          {list.length === 0 ? (
            <div className="card"><Empty icon={Inbox} title={filter === "todo" ? "Rien à traiter" : "Aucun élément"} text={filter === "todo" ? "Toutes les demandes du site ont été traitées." : undefined} /></div>
          ) : (
            <ul className="space-y-2">
              {list.map((it) => {
                const l = linkOf(it.table, it.row.id);
                const m = !l ? matchesFor(it) : [];
                return <Row key={it.row.id} it={it} link={l} matches={m} catalog={catalog}
                  onImport={() => setCurrent(it)} onIgnore={() => ignore(it)} onRestore={() => restore(it)} />;
              })}
            </ul>
          )}
        </>
      )}

      <ImportModal open={!!current} item={current} onClose={() => setCurrent(null)} catalog={catalog}
        matches={current ? matchesFor(current) : []} onDone={loadCrm} />
    </>
  );
}

function Row({ it, link, matches, catalog, onImport, onIgnore, onRestore }: {
  it: InboxItem; link?: Link_; matches: Match[]; catalog: Catalog; onImport: () => void; onIgnore: () => void; onRestore: () => void;
}) {
  let title = "", sub = "", body = "", chips: string[] = [], ref = "";
  if (it.table === "leads") {
    const r = it.row;
    title = r.company_name; sub = `${r.first_name} ${r.last_name} · ${r.role_title} · ${r.email}${r.phone ? " · " + r.phone : ""}`;
    body = r.message; ref = r.reference;
    chips = [...(r.service_codes ?? []).map((c) => serviceName(c, catalog)), r.budget_range, r.deadline_need, r.company_size].filter(Boolean);
  } else if (it.table === "contact_messages") {
    const r = it.row;
    title = r.subject || "Message de contact"; sub = `${r.name} · ${r.email}`; body = r.message;
  } else {
    const r = it.row;
    title = r.company_name; sub = [r.full_name, r.email, r.phone].filter(Boolean).join(" · ");
    chips = r.missions_count ? [`${r.missions_count} mission(s)`] : [];
  }
  return (
    <li className={clsx("card p-4", link?.status === "ignored" && "opacity-60")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{title}</p>
            {ref && <span className="rounded bg-panel-2 px-1.5 py-0.5 text-[11px] text-muted">{ref}</span>}
            {link?.status === "imported" && <Badge color="#34d399">Importé</Badge>}
            {link?.status === "linked" && <Badge color="#60a5fa">Rattaché</Badge>}
            {link?.status === "ignored" && <Badge>Ignoré</Badge>}
            {!link && matches.length > 0 && <Badge color="#ED9C35">Existe peut-être : {matches[0].company_name}</Badge>}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted">{sub}</p>
          {chips.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{chips.map((c, i) => <span key={i} className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">{c}</span>)}</div>}
          {body && <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-muted">{body}</p>}
          <p className="mt-2 text-[11px] text-faint" title={fmtDateTime(it.row.created_at)}>Reçu {fmtAgo(it.row.created_at)}</p>
        </div>
        <div className="flex shrink-0 gap-2 sm:flex-col">
          {!link && <Button size="sm" onClick={onImport}><Check className="h-4 w-4" /> Vérifier & importer</Button>}
          {!link && <Button size="sm" variant="ghost" onClick={onIgnore}><EyeOff className="h-4 w-4" /> Ignorer</Button>}
          {link?.client_id && <Link href={`/clients/${link.client_id}`}><Button size="sm" variant="outline">Voir le client</Button></Link>}
          {link && <Button size="sm" variant="ghost" onClick={onRestore}><Undo2 className="h-4 w-4" /> {link.status === "ignored" ? "Rétablir" : "Remettre à traiter"}</Button>}
        </div>
      </div>
    </li>
  );
}

function SetupCard() {
  return (
    <div className="card max-w-2xl p-5">
      <div className="mb-3 flex items-center gap-2"><Plug className="h-5 w-5 text-brand" /><h2 className="font-semibold">Dernière étape : autoriser la lecture de la base du site</h2></div>
      <p className="text-sm text-muted">Les demandes du site sont protégées : il faut une clé serveur, qui reste sur Vercel et n&apos;est jamais envoyée au navigateur. Le CRM l&apos;utilise uniquement en <b className="text-fg">lecture</b>.</p>
      <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm">
        <li>Dans le Supabase du <b>site</b> : <i>Project Settings → API Keys → Secret keys</i> → créez une clé nommée « crm-lecture » et copiez-la.</li>
        <li>Sur Vercel, projet <b>whiteg-crm</b> : <i>Settings → Environment Variables</i> → ajoutez <code className="rounded bg-panel-2 px-1">SITE_SUPABASE_SECRET_KEY</code> avec cette clé (Production + Preview), cochez « Sensitive ».</li>
        <li>Redéployez (<i>Deployments → ⋯ → Redeploy</i>), puis rechargez cette page.</li>
      </ol>
    </div>
  );
}
