"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Search, Users, Phone, MessageCircle, ChevronRight, Download } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { CLIENT_STATUSES, SECTORS, colorOf, labelOf } from "@/lib/constants";
import type { Client } from "@/lib/types";
import { fmtAgo, fmtCompactDA, waLink } from "@/lib/format";
import { useOnChange } from "@/lib/events";
import { Avatar, Badge, Button, Empty, PageHeader, Spinner } from "@/components/ui";
import { ClientForm } from "@/components/forms";

type Row = Client & { deals: { amount: number; stage: string }[] };

export default function ClientsPage() {
  return <Suspense fallback={<Spinner />}><ClientsInner /></Suspense>;
}

function ClientsInner() {
  const sb = supabaseBrowser();
  const router = useRouter();
  const params = useSearchParams();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(params.get("q") ?? "");
  const [status, setStatus] = useState("all");
  const [sector, setSector] = useState("all");
  const [sort, setSort] = useState<"recent" | "name" | "value" | "contact">("recent");
  const [open, setOpen] = useState(false);

  useEffect(() => { setQ(params.get("q") ?? ""); }, [params]);

  const load = useCallback(async () => {
    const { data } = await sb.from("clients").select("*, deals(amount,stage)").order("created_at", { ascending: false });
    setRows((data as Row[]) ?? []);
    setLoading(false);
  }, [sb]);
  useEffect(() => { load(); }, [load]);
  useOnChange(load);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    rows.forEach((r) => (c[r.status] = (c[r.status] ?? 0) + 1));
    return c;
  }, [rows]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const value = (r: Row) => r.deals.filter((d) => d.stage !== "perdu").reduce((a, d) => a + Number(d.amount), 0);
    return rows
      .filter((r) => status === "all" || r.status === status)
      .filter((r) => sector === "all" || r.sector === sector)
      .filter((r) => !needle || [r.company_name, r.city, r.wilaya, r.phone, r.email, ...(r.tags ?? [])].some((v) => v?.toLowerCase().includes(needle)))
      .map((r) => ({ ...r, value: value(r) }))
      .sort((a, b) =>
        sort === "name" ? a.company_name.localeCompare(b.company_name)
        : sort === "value" ? b.value - a.value
        : sort === "contact" ? (a.last_contact_at ?? "").localeCompare(b.last_contact_at ?? "")
        : b.created_at.localeCompare(a.created_at));
  }, [rows, q, status, sector, sort]);

  const exportCsv = () => {
    const head = ["Entreprise", "Statut", "Secteur", "Wilaya", "Ville", "Téléphone", "Email", "Valeur (DA)", "Dernier contact", "Créé le"];
    const lines = list.map((r) => [r.company_name, labelOf(CLIENT_STATUSES, r.status), labelOf(SECTORS, r.sector), r.wilaya, r.city, r.phone, r.email, r.value, r.last_contact_at?.slice(0, 10), r.created_at.slice(0, 10)]
      .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";"));
    const blob = new Blob(["﻿" + [head.join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "clients-whiteg.csv"; a.click();
  };

  return (
    <>
      <PageHeader title="Clients" subtitle={`${rows.length} fiche${rows.length > 1 ? "s" : ""} au total`}
        actions={<>
          <Button variant="outline" size="sm" onClick={exportCsv} className="h-9"><Download className="h-4 w-4" /><span className="hidden sm:inline">Export CSV</span></Button>
          <Button size="sm" className="h-9" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Nouveau client</Button>
        </>} />

      {/* status tabs */}
      <div className="-mx-3 mb-3 flex gap-1.5 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0">
        {[{ value: "all", label: "Tous", color: "#a1a1aa" }, ...CLIENT_STATUSES].map((s) => (
          <button key={s.value} onClick={() => setStatus(s.value)}
            className={"flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition " + (status === s.value ? "border-brand bg-brand-soft text-brand" : "border-line text-muted hover:text-fg")}>
            {s.label}<span className="rounded-full bg-panel-2 px-1.5 text-[10px] text-faint">{counts[s.value] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:flex">
        <div className="relative col-span-2 sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input className="input pl-9" placeholder="Nom, ville, tag, téléphone…" value={q}
            onChange={(e) => { setQ(e.target.value); router.replace("/clients" + (e.target.value ? "?q=" + encodeURIComponent(e.target.value) : "")); }} />
        </div>
        <select className="input sm:w-48" value={sector} onChange={(e) => setSector(e.target.value)}>
          <option value="all">Tous secteurs</option>{SECTORS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select className="input sm:w-48" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          <option value="recent">Plus récents</option><option value="name">Nom A → Z</option>
          <option value="value">Valeur décroissante</option><option value="contact">Contact le plus ancien</option>
        </select>
      </div>

      {loading ? <Spinner /> : list.length === 0 ? (
        <div className="card"><Empty icon={Users} title={rows.length ? "Aucun résultat" : "Aucun client pour l'instant"}
          text={rows.length ? "Modifiez la recherche ou les filtres." : "Ajoutez votre premier client ou connectez plus tard la base de votre site pour importer les demandes de devis."}
          action={!rows.length && <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Ajouter un client</Button>} /></div>
      ) : (
        <>
          {/* desktop table */}
          <div className="card hidden overflow-hidden md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-panel-2/50 text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Entreprise</th>
                  <th className="px-4 py-2.5 font-medium">Statut</th>
                  <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Secteur</th>
                  <th className="px-4 py-2.5 font-medium">Localisation</th>
                  <th className="px-4 py-2.5 text-right font-medium">Valeur</th>
                  <th className="hidden px-4 py-2.5 font-medium xl:table-cell">Dernier contact</th>
                  <th className="w-24 px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} onClick={() => router.push(`/clients/${r.id}`)} className="cursor-pointer border-b border-line/60 last:border-0 hover:bg-panel-2/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={r.company_name} />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{r.company_name}</p>
                          {r.tags?.length > 0 && <p className="truncate text-xs text-faint">{r.tags.map((t) => "#" + t).join(" ")}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><Badge color={colorOf(CLIENT_STATUSES, r.status)}>{labelOf(CLIENT_STATUSES, r.status)}</Badge></td>
                    <td className="hidden px-4 py-3 text-muted lg:table-cell">{labelOf(SECTORS, r.sector)}</td>
                    <td className="px-4 py-3 text-muted">{[r.city, r.wilaya?.replace(/^\d+ /, "")].filter(Boolean).join(", ") || "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.value ? fmtCompactDA(r.value) : <span className="text-faint">—</span>}</td>
                    <td className="hidden px-4 py-3 text-muted xl:table-cell">{fmtAgo(r.last_contact_at)}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        {r.phone && <a href={`tel:${r.phone}`} className="rounded-md p-1.5 text-faint hover:bg-panel-2 hover:text-fg" title="Appeler"><Phone className="h-4 w-4" /></a>}
                        {r.phone && <a href={waLink(r.phone)} target="_blank" rel="noreferrer" className="rounded-md p-1.5 text-faint hover:bg-panel-2 hover:text-emerald-400" title="WhatsApp"><MessageCircle className="h-4 w-4" /></a>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* mobile cards */}
          <ul className="space-y-2 md:hidden">
            {list.map((r) => (
              <li key={r.id}>
                <Link href={`/clients/${r.id}`} className="card flex items-center gap-3 p-3 active:bg-panel-2">
                  <Avatar name={r.company_name} className="h-10 w-10" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{r.company_name}</p>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-faint">
                      <Badge color={colorOf(CLIENT_STATUSES, r.status)}>{labelOf(CLIENT_STATUSES, r.status)}</Badge>
                      <span className="truncate">{r.wilaya?.replace(/^\d+ /, "") ?? labelOf(SECTORS, r.sector)}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    {r.value > 0 && <p className="text-sm font-medium tabular-nums">{fmtCompactDA(r.value)}</p>}
                    <ChevronRight className="ml-auto h-4 w-4 text-faint" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      <ClientForm open={open} onClose={() => setOpen(false)} onSaved={(id) => router.push(`/clients/${id}`)} />
    </>
  );
}
