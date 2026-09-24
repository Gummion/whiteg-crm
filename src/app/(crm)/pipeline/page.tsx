"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { Plus, KanbanSquare, CalendarDays, CheckCircle2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { DEAL_STAGES, OFFER_CATEGORIES, type DealStage, labelOf } from "@/lib/constants";
import type { Deal } from "@/lib/types";
import { fmtAgo, fmtCompactDA, fmtDA, fmtDate } from "@/lib/format";
import { useOnChange } from "@/lib/events";
import { Button, Empty, PageHeader, Spinner, useToast } from "@/components/ui";
import { DealForm } from "@/components/forms";

export default function PipelinePage() {
  return <Suspense fallback={<Spinner />}><Pipeline /></Suspense>;
}

function Pipeline() {
  const sb = supabaseBrowser();
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState("all");
  const [showClosed, setShowClosed] = useState(true);
  const [edit, setEdit] = useState<Deal | null>(null);
  const [creating, setCreating] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [mobileStage, setMobileStage] = useState<DealStage>("nouveau");

  const load = useCallback(async () => {
    const { data } = await sb.from("deals").select("*, clients(id,company_name)").order("updated_at", { ascending: false });
    setDeals(data ?? []);
    setLoading(false);
  }, [sb]);
  useEffect(() => { load(); }, [load]);
  useOnChange(load);

  // realtime: see teammates' moves live
  useEffect(() => {
    const ch = sb.channel("deals-board").on("postgres_changes", { event: "*", schema: "public", table: "deals" }, () => load()).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [sb, load]);

  // deep-link ?deal=<id> (from notifications) → open the project file
  useEffect(() => {
    const id = params.get("deal");
    if (id) router.replace("/pipeline/" + id);
  }, [params, router]);

  const stages = DEAL_STAGES.filter((s) => showClosed || !["livre", "perdu"].includes(s.value));
  const filtered = useMemo(() => deals.filter((d) => cat === "all" || d.category === cat), [deals, cat]);
  const byStage = (s: string) => filtered.filter((d) => d.stage === s);

  const move = async (id: string, stage: DealStage) => {
    const d = deals.find((x) => x.id === id);
    if (!d || d.stage === stage) return;
    const prob = DEAL_STAGES.find((s) => s.value === stage)?.prob ?? d.probability;
    setDeals((l) => l.map((x) => (x.id === id ? { ...x, stage, probability: prob } : x)));
    const { error } = await sb.from("deals").update({ stage, probability: prob }).eq("id", id);
    if (error) { toast(error.message, "err"); load(); return; }
    toast(`${d.title} → ${labelOf(DEAL_STAGES, stage)}`);
  };

  const totalOpen = filtered.filter((d) => !["livre", "perdu"].includes(d.stage)).reduce((a, d) => a + Number(d.amount), 0);

  return (
    <>
      <PageHeader title="Pipeline" subtitle={`${fmtDA(totalOpen)} en cours · glissez les cartes pour changer d'étape`}
        actions={<Button size="sm" className="h-9" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Opportunité</Button>} />

      <div className="-mx-3 mb-4 flex items-center gap-1.5 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0">
        <Chip active={cat === "all"} onClick={() => setCat("all")}>Toutes offres</Chip>
        {OFFER_CATEGORIES.map((c) => <Chip key={c.value} active={cat === c.value} onClick={() => setCat(c.value)} title={c.label}><b>{c.value}</b> {c.short}</Chip>)}
        <label className="ml-auto hidden shrink-0 items-center gap-2 pl-3 text-xs text-muted md:flex">
          <input type="checkbox" className="accent-[#ED9C35]" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Afficher livrés / perdus
        </label>
      </div>

      {loading ? <Spinner /> : deals.length === 0 ? (
        <div className="card"><Empty icon={KanbanSquare} title="Pipeline vide" text="Créez une opportunité à chaque nouveau brief ou demande de devis pour suivre son avancement jusqu'à la livraison."
          action={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Créer une opportunité</Button>} /></div>
      ) : (
        <>
          {/* Desktop / tablet board */}
          <div className="-mx-3 hidden gap-3 overflow-x-auto px-3 pb-4 md:flex sm:-mx-5 sm:px-5 lg:-mx-8 lg:px-8">
            {stages.map((s) => {
              const items = byStage(s.value);
              const sum = items.reduce((a, d) => a + Number(d.amount), 0);
              return (
                <div key={s.value}
                  onDragOver={(e) => { e.preventDefault(); setOver(s.value); }}
                  onDragLeave={() => setOver((o) => (o === s.value ? null : o))}
                  onDrop={(e) => { e.preventDefault(); setOver(null); if (dragId) move(dragId, s.value); setDragId(null); }}
                  className={clsx("flex w-72 shrink-0 flex-col rounded-xl border bg-panel/60 transition", over === s.value ? "border-brand bg-brand/5" : "border-line")}>
                  <div className="border-b border-line px-3 py-2.5">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm font-medium"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.label}</span>
                      <span className="rounded-full bg-panel-2 px-2 text-xs text-muted">{items.length}</span>
                    </div>
                    <p className="mt-0.5 text-xs tabular-nums text-faint">{fmtCompactDA(sum)}</p>
                  </div>
                  <div className="flex min-h-40 flex-1 flex-col gap-2 overflow-y-auto p-2" style={{ maxHeight: "calc(100dvh - 300px)" }}>
                    {items.map((d) => (
                      <DealCard key={d.id} d={d} dragging={dragId === d.id}
                        onDragStart={() => setDragId(d.id)} onDragEnd={() => { setDragId(null); setOver(null); }}
                        onClick={() => router.push(`/pipeline/${d.id}`)} />
                    ))}
                    {items.length === 0 && <p className="py-6 text-center text-xs text-faint">Déposez ici</p>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mobile: stage selector + list */}
          <div className="md:hidden">
            <div className="-mx-3 mb-3 flex gap-1.5 overflow-x-auto px-3 pb-1">
              {DEAL_STAGES.map((s) => (
                <button key={s.value} onClick={() => setMobileStage(s.value)}
                  className={clsx("flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs", mobileStage === s.value ? "border-brand bg-brand-soft text-fg" : "border-line text-muted")}>
                  <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.label}
                  <span className="text-faint">{byStage(s.value).length}</span>
                </button>
              ))}
            </div>
            <div className="space-y-2">
              {byStage(mobileStage).length === 0 && <p className="card py-10 text-center text-sm text-faint">Aucune opportunité à cette étape</p>}
              {byStage(mobileStage).map((d) => (
                <div key={d.id} className="card p-3">
                  <button onClick={() => router.push(`/pipeline/${d.id}`)} className="w-full text-left"><DealBody d={d} /></button>
                  <select value={d.stage} onChange={(e) => move(d.id, e.target.value as DealStage)}
                    className="mt-3 h-9 w-full rounded-lg border border-line bg-panel-2 px-2 text-xs outline-none">
                    {DEAL_STAGES.map((s) => <option key={s.value} value={s.value}>Déplacer vers : {s.label}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <DealForm open={!!edit || creating} deal={edit} onClose={() => { setEdit(null); setCreating(false); }} />
    </>
  );
}

function Chip({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button title={title} onClick={onClick}
      className={clsx("shrink-0 rounded-full border px-3 py-1.5 text-xs transition", active ? "border-brand bg-brand-soft text-brand" : "border-line text-muted hover:text-fg")}>
      {children}
    </button>
  );
}

function DealCard({ d, onClick, onDragStart, onDragEnd, dragging }: { d: Deal; onClick: () => void; onDragStart: () => void; onDragEnd: () => void; dragging: boolean }) {
  return (
    <div draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; onDragStart(); }} onDragEnd={onDragEnd} onClick={onClick}
      className={clsx("cursor-grab rounded-lg border border-line bg-panel p-3 shadow-sm transition hover:border-line-2 active:cursor-grabbing", dragging && "opacity-40")}>
      <DealBody d={d} />
    </div>
  );
}

function DealBody({ d }: { d: Deal }) {
  const late = d.expected_close && new Date(d.expected_close) < new Date() && !["livre", "perdu"].includes(d.stage);
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-sm font-medium leading-snug">{d.title}</p>
        <span className="shrink-0 rounded bg-panel-2 px-1.5 py-0.5 text-[10px] font-bold text-muted">{d.category}</span>
      </div>
      {d.clients && <Link href={`/clients/${d.clients.id}`} onClick={(e) => e.stopPropagation()} className="mt-1 block truncate text-xs text-muted hover:text-brand">{d.clients.company_name}</Link>}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold tabular-nums">{fmtCompactDA(d.amount)}</span>
        <span className="flex items-center gap-2 text-[11px] text-faint">
          {d.deposit_paid && <span className="flex items-center gap-0.5 text-emerald-400" title="Acompte payé"><CheckCircle2 className="h-3 w-3" /> Payé</span>}
          {d.expected_close ? <span className={clsx("flex items-center gap-1", late && "text-red-400")}><CalendarDays className="h-3 w-3" />{fmtDate(d.expected_close).replace(/ \d{4}$/, "")}</span> : <span>{fmtAgo(d.stage_changed_at)}</span>}
        </span>
      </div>
      {d.product_format && <p className="mt-1.5 text-[11px] text-faint">{d.product_format} · {d.probability} %</p>}
    </>
  );
}
