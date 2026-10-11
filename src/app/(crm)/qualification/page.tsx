"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { AlertTriangle, ClipboardCheck, Search, MessageCircle } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useOnChange } from "@/lib/events";
import { fmtAgo, fmtCompactDA, waLink } from "@/lib/format";
import { GRADE_COLOR, PHASES, SEVERITY_COLOR, opt, phaseOf, who, type Phase, type QualRequest } from "@/lib/qualification";
import { Badge, Empty, PageHeader, Spinner } from "@/components/ui";

const TABS: { key: string; label: string; phases: Phase[] }[] = [
  { key: "todo", label: "À traiter", phases: ["a_trier", "fiche_recue"] },
  { key: "fiche", label: "Fiches en cours", phases: ["fiche_envoyee", "fiche_ouverte"] },
  { key: "go", label: "Projets Go", phases: ["go", "rd", "formule", "devis_final"] },
  { key: "out", label: "Écartés", phases: ["no_go", "archive"] },
  { key: "all", label: "Tout", phases: [] },
];

export default function QualificationPage() {
  const sb = supabaseBrowser();
  const [rows, setRows] = useState<QualRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("todo");
  const [grades, setGrades] = useState<string[]>([]);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    const { data } = await sb.from("qual_requests").select("*").order("priority", { ascending: false }).order("created_at", { ascending: false }).limit(500);
    setRows((data as QualRequest[]) ?? []);
    setLoading(false);
  }, [sb]);
  useEffect(() => { load(); }, [load]);
  useOnChange(load);
  useEffect(() => {
    const ch = sb.channel("qual-list").on("postgres_changes", { event: "*", schema: "public", table: "qual_requests" }, () => load()).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [sb, load]);

  const withPhase = useMemo(() => rows.map((r) => ({ r, phase: phaseOf(r) })), [rows]);
  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.key, withPhase.filter((x) => !t.phases.length || t.phases.includes(x.phase)).length])), [withPhase]);
  const shown = useMemo(() => {
    const t = TABS.find((x) => x.key === tab)!;
    const s = q.trim().toLowerCase();
    return withPhase.filter(({ r, phase }) =>
      (!t.phases.length || t.phases.includes(phase)) &&
      (!grades.length || grades.includes(r.grade)) &&
      (!s || [r.reference, r.company_name, r.first_name, r.last_name, r.email, r.phone].some((v) => v?.toLowerCase().includes(s))));
  }, [withPhase, tab, grades, q]);

  const toSort = withPhase.filter((x) => x.phase === "a_trier").length;
  const toCall = withPhase.filter((x) => x.phase === "fiche_recue").length;
  const sent = rows.filter((r) => r.fiche_sent_at).length;
  const submitted = rows.filter((r) => r.fiche_submitted_at).length;

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader title="Qualification" subtitle="Toutes les demandes du site, triées par priorité : note, urgence et engagement." />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "À trier", value: toSort, hint: "Demandes B/C/D sans fiche" },
          { label: "Appels de cadrage à faire", value: toCall, hint: "Fiches reçues sans décision" },
          { label: "Fiches remplies", value: sent ? `${Math.round((submitted / sent) * 100)} %` : "—", hint: `${submitted} sur ${sent} envoyées` },
          { label: "Dossiers note A", value: rows.filter((r) => r.grade === "A" && !r.archived && r.decision !== "no_go").length, hint: "Ouverts" },
        ].map((k) => (
          <div key={k.label} className="card p-4">
            <p className="text-xs text-muted">{k.label}</p>
            <p className="mt-1 text-2xl font-semibold">{k.value}</p>
            <p className="mt-0.5 text-[11px] text-faint">{k.hint}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 overflow-x-auto rounded-lg border border-line bg-panel p-1">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={clsx("whitespace-nowrap rounded-md px-3 py-1.5 text-sm", tab === t.key ? "bg-panel-2 font-medium text-fg" : "text-muted hover:text-fg")}>
              {t.label} <span className="text-faint">{counts[t.key]}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {["A", "B", "C", "D"].map((g) => (
            <button key={g} onClick={() => setGrades((l) => l.includes(g) ? l.filter((x) => x !== g) : [...l, g])}
              className={clsx("h-8 w-8 rounded-md border text-sm font-bold", grades.includes(g) ? "border-transparent text-black" : "border-line text-muted")}
              style={grades.includes(g) ? { background: GRADE_COLOR[g] } : undefined}>{g}</button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input className="input pl-9" placeholder="Référence, nom, email…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {!shown.length ? (
        <div className="card"><Empty icon={ClipboardCheck} title="Aucune demande ici" text="Les nouvelles demandes du formulaire du site arrivent automatiquement, déjà notées." /></div>
      ) : (
        <div className="space-y-2">
          {shown.map(({ r, phase }) => {
            const ph = PHASES[phase];
            const m = { ...r.prequal, ...r.fiche } as Record<string, unknown>;
            return (
              <div key={r.id} className="card flex items-stretch gap-3 p-3 transition hover:border-line-2 sm:gap-4 sm:p-4">
                <Link href={`/qualification/${r.id}`} className="flex flex-1 items-start gap-3 sm:gap-4 min-w-0">
                  <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg font-bold text-black" style={{ background: GRADE_COLOR[r.grade] }}>
                    <span className="text-lg leading-none">{r.grade}</span>
                    <span className="text-[10px] font-semibold leading-none opacity-70">{r.score}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium">{who(r)}</p>
                      <Badge color={ph.color}>{ph.label}</Badge>
                      {r.fiche_sent_at && !r.fiche_submitted_at && <span className="text-[11px] text-faint">fiche {r.fiche_progress} %</span>}
                    </div>
                    <p className="mt-0.5 truncate text-sm text-muted">
                      {[opt("project_type", m.project_type), opt("format", m.format), opt("qty_band", r.score_detail.qty_band), opt("budget", m.budget)].filter(Boolean).join(" · ")}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-faint">
                      <span>{r.reference}</span>
                      <span>{fmtAgo(r.created_at)}</span>
                      {r.score_detail.launch && <span>Lancement : {opt("launch", r.score_detail.launch)}</span>}
                      {r.est_value_dzd ? <span>≈ {fmtCompactDA(r.est_value_dzd)}</span> : null}
                      {r.red_flags.slice(0, 2).map((f) => (
                        <span key={f.code} className="inline-flex items-center gap-1" style={{ color: SEVERITY_COLOR[f.severity] }}>
                          <AlertTriangle className="h-3 w-3" />{f.label}
                        </span>
                      ))}
                      {r.red_flags.length > 2 && <span>+{r.red_flags.length - 2} alerte(s)</span>}
                    </div>
                  </div>
                </Link>
                <a href={waLink(r.whatsapp || r.phone)} target="_blank" rel="noreferrer" title="WhatsApp"
                  className="hidden shrink-0 items-center self-center rounded-lg border border-line p-2 text-muted hover:text-fg sm:flex">
                  <MessageCircle className="h-4 w-4" />
                </a>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
