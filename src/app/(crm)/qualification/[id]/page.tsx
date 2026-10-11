"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { AlertTriangle, ArrowLeft, Briefcase, Check, ClipboardCheck, Copy, Mail, MessageCircle, Phone, User, X, Archive, ArchiveRestore, FlaskConical, FileText, Send } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { emitChange, useOnChange } from "@/lib/events";
import { fmtDA, fmtDate, fmtDateTime, waLink } from "@/lib/format";
import { useCrm, memberName } from "@/components/crm-context";
import {
  CALL_GRID, FICHE_SECTIONS, GRADE_COLOR, PHASES, SCORE_AXES, SEVERITY_COLOR, opt, phaseOf, who,
  type QualEvent, type QualRequest, type QualSettings,
} from "@/lib/qualification";
import { Badge, Button, Empty, Field, Modal, Spinner, useToast } from "@/components/ui";

const EVENT_LABEL: Record<string, string> = {
  created: "Demande reçue depuis le site", fiche_auto_invited: "Fiche envoyée automatiquement", fiche_invited: "Lien de fiche généré",
  fiche_opened: "Le client a ouvert sa fiche", fiche_submitted: "Fiche de commande envoyée", decision: "Décision de cadrage",
  rd_paid: "Frais d'étude R&D encaissés", sample_round: "Nouvelle série d'échantillons", formula_delivered: "Formule livrée",
  final_quote_sent: "Devis final envoyé", archived: "Dossier archivé", unarchived: "Dossier réactivé",
};

export default function QualDossier({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const sb = supabaseBrowser();
  const toast = useToast();
  const { members } = useCrm();
  const [r, setR] = useState<QualRequest | null>(null);
  const [events, setEvents] = useState<QualEvent[]>([]);
  const [settings, setSettings] = useState<QualSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      sb.from("qual_requests").select("*").eq("id", id).maybeSingle(),
      sb.from("qual_events").select("*").eq("request_id", id).order("created_at", { ascending: false }),
      sb.from("qual_settings").select("*").eq("id", 1).maybeSingle(),
    ]);
    setR(a.data as QualRequest | null); setEvents((b.data as QualEvent[]) ?? []); setSettings(c.data as QualSettings | null);
    setLoading(false);
  }, [sb, id]);
  useEffect(() => { load(); }, [load]);
  useOnChange(load);

  const rpc = async (key: string, fn: string, args: Record<string, unknown>, ok: string) => {
    setBusy(key);
    const { data, error } = await sb.rpc(fn, args);
    setBusy("");
    if (error) { toast(error.message, "err"); return null; }
    toast(ok); emitChange(); await load();
    return data ?? true;
  };

  if (loading) return <Spinner />;
  if (!r) return <Empty icon={ClipboardCheck} title="Dossier introuvable" action={<Link href="/qualification"><Button variant="outline">Retour</Button></Link>} />;

  const phase = phaseOf(r);
  const ph = PHASES[phase];
  const m = { ...r.prequal, ...r.fiche } as Record<string, unknown>;
  const ficheUrl = r.fiche_token && settings ? `${settings.site_url.replace(/\/$/, "")}/fiche/${r.fiche_token}` : null;
  const phone = r.whatsapp || r.phone;

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/qualification" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="h-4 w-4" />Qualification</Link>

      <div className="card mb-4 flex flex-wrap items-start gap-4 p-4 sm:p-5">
        <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-xl font-bold text-black" style={{ background: GRADE_COLOR[r.grade] }}>
          <span className="text-2xl leading-none">{r.grade}</span><span className="text-xs opacity-70">{r.score}/100</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold">{who(r)}</h1>
            <Badge color={ph.color}>{ph.label}</Badge>
          </div>
          <p className="mt-0.5 text-sm text-muted">{r.reference} · {r.first_name} {r.last_name}{r.role_title ? ` (${r.role_title})` : ""} · reçu le {fmtDateTime(r.created_at)}</p>
          <p className="mt-2 text-sm"><span className="text-faint">Prochaine action : </span>{ph.next}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={waLink(phone)} target="_blank" rel="noreferrer"><Button variant="outline" size="sm"><MessageCircle className="h-4 w-4" />WhatsApp</Button></a>
          <a href={`tel:${r.phone}`}><Button variant="outline" size="sm"><Phone className="h-4 w-4" />Appeler</Button></a>
          <a href={`mailto:${r.email}?subject=${encodeURIComponent("Votre projet " + r.reference + " — White G")}`}><Button variant="outline" size="sm"><Mail className="h-4 w-4" />Email</Button></a>
          {r.client_id && <Link href={`/clients/${r.client_id}`}><Button variant="outline" size="sm"><User className="h-4 w-4" />Client</Button></Link>}
          {r.deal_id && <Link href={`/pipeline/${r.deal_id}`}><Button variant="outline" size="sm"><Briefcase className="h-4 w-4" />Projet & documents</Button></Link>}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-4">
          <NextStep r={r} phase={phase} ficheUrl={ficheUrl} settings={settings} busy={busy} rpc={rpc} />
          <Answers r={r} m={m} />
        </div>

        <aside className="space-y-4">
          <div className="card p-4">
            <h3 className="mb-3 text-sm font-semibold">Score détaillé</h3>
            {SCORE_AXES.map((a) => {
              const v = Number(r.score_detail[a.key] ?? 0);
              return (
                <div key={a.key} className="mb-2.5">
                  <div className="mb-1 flex justify-between text-xs"><span className="text-muted">{a.label}</span><span>{v}/{a.max}</span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-panel-2"><div className="h-full rounded-full bg-brand" style={{ width: `${(v / a.max) * 100}%` }} /></div>
                </div>
              );
            })}
            {!!r.score_detail.penalites && <p className="mt-2 text-xs text-red-400">Pénalités : −{r.score_detail.penalites}</p>}
            <p className="mt-2 text-xs text-faint">Priorité {r.priority} = score {r.score}{r.score_detail.urgence ? ` ${r.score_detail.urgence > 0 ? "+" : "−"} ${Math.abs(r.score_detail.urgence)} urgence` : ""}{r.fiche_submitted_at ? " + 5 fiche remplie" : ""}</p>
          </div>

          <div className="card p-4">
            <h3 className="mb-3 text-sm font-semibold">Alertes</h3>
            {r.red_flags.length ? r.red_flags.map((f) => (
              <p key={f.code} className="mb-2 flex gap-2 text-sm" style={{ color: SEVERITY_COLOR[f.severity] }}>
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{f.label}
              </p>
            )) : <p className="text-sm text-muted">Aucune alerte.</p>}
          </div>

          <div className="card p-4 text-sm">
            <h3 className="mb-3 font-semibold">Contact</h3>
            <dl className="space-y-1.5">
              <div><dt className="text-xs text-faint">Email</dt><dd className="break-all">{r.email}</dd></div>
              <div><dt className="text-xs text-faint">Téléphone</dt><dd>{r.phone}{r.whatsapp ? ` · WhatsApp ${r.whatsapp}` : ""}</dd></div>
              {r.wilaya && <div><dt className="text-xs text-faint">Wilaya</dt><dd>{r.wilaya}</dd></div>}
              <div><dt className="text-xs text-faint">Langue du formulaire</dt><dd>{r.lang === "ar" ? "Arabe" : "Français"}</dd></div>
              {r.est_value_dzd ? <div><dt className="text-xs text-faint">Budget déclaré (milieu de tranche)</dt><dd>{fmtDA(r.est_value_dzd)}</dd></div> : null}
            </dl>
          </div>

          <div className="card p-4">
            <h3 className="mb-3 text-sm font-semibold">Historique</h3>
            <ol className="space-y-2.5">
              {events.map((e) => (
                <li key={e.id} className="text-sm">
                  <p>{EVENT_LABEL[e.kind] ?? e.kind}{e.kind === "decision" ? ` : ${String(e.detail.decision).replace("no_go", "No-Go").replace("go", "Go").replace("en_attente", "en attente")}` : ""}
                    {e.kind === "rd_paid" ? ` : ${fmtDA(Number(e.detail.amount))}` : ""}{e.kind === "sample_round" ? ` n° ${e.detail.round}` : ""}</p>
                  {e.kind === "decision" && e.detail.reason ? <p className="text-xs text-muted">{String(e.detail.reason)}</p> : null}
                  <p className="text-xs text-faint">{fmtDateTime(e.created_at)}{e.actor_id ? ` · ${memberName(members, e.actor_id)}` : ""}</p>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
}

type Rpc = (key: string, fn: string, args: Record<string, unknown>, ok: string) => Promise<unknown>;

function NextStep({ r, phase, ficheUrl, settings, busy, rpc }: { r: QualRequest; phase: ReturnType<typeof phaseOf>; ficheUrl: string | null; settings: QualSettings | null; busy: string; rpc: Rpc }) {
  const toast = useToast();
  const [grid, setGrid] = useState<Record<string, boolean>>((r.call_grid?.checks as Record<string, boolean>) ?? {});
  const [notes, setNotes] = useState<string>((r.call_grid?.notes as string) ?? "");
  const [noGo, setNoGo] = useState(false);
  const [reason, setReason] = useState("");
  const [rdOpen, setRdOpen] = useState(false);
  const [rd, setRd] = useState({ amount: String(settings?.rd_fee_dzd ?? ""), date: new Date().toISOString().slice(0, 10), method: "virement", nda: "" });
  const custom = ["sur_mesure", "reformulation", "pack_lancement"].includes(String({ ...r.prequal, ...r.fiche }.project_type ?? ""));

  const invite = async () => {
    const url = await rpc("invite", "qual_invite", { p_id: r.id }, "Lien de fiche prêt");
    if (typeof url === "string") { await navigator.clipboard.writeText(url).catch(() => null); toast("Lien copié", "info"); }
  };
  const waMessage = (url: string) => {
    const fr = `Bonjour ${r.first_name}, merci pour votre demande ${r.reference} chez White G. Pour préparer notre appel, merci de remplir votre fiche de commande (20 à 30 min, enregistrement automatique) : ${url}`;
    const ar = `مرحبًا ${r.first_name}، شكرًا على طلبكم ${r.reference} لدى White G. لتحضير مكالمتنا، يرجى ملء استمارة الطلب (20 إلى 30 دقيقة، حفظ تلقائي): ${url}`;
    return `${waLink(r.whatsapp || r.phone)}?text=${encodeURIComponent(r.lang === "ar" ? ar : fr)}`;
  };
  const decide = (decision: "go" | "no_go") =>
    rpc("decide", "qual_decide", { p_id: r.id, p_decision: decision, p_reason: decision === "no_go" ? reason : notes || null, p_grid: { checks: grid, notes } },
      decision === "go" ? "Go : cadrage validé" : "No-Go enregistré").then(() => setNoGo(false));
  const checked = CALL_GRID.filter((c) => grid[c.key]).length;

  return (
    <div className="card p-4 sm:p-5">
      <h2 className="mb-1 text-base font-semibold">Étape suivante</h2>
      <p className="mb-4 text-sm text-muted">{PHASES[phase].next}</p>

      {ficheUrl && !r.fiche_submitted_at && !["no_go", "archive"].includes(phase) && (
        <div className="mb-4 rounded-lg border border-line bg-panel-2 p-3">
          <p className="mb-2 text-xs text-muted">Lien personnel de la fiche · {r.fiche_opened_at ? `ouverte le ${fmtDateTime(r.fiche_opened_at)}` : "pas encore ouverte"} · remplie à {r.fiche_progress} % · expire le {fmtDate(r.fiche_expires_at)}</p>
          <div className="flex flex-wrap gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-bg px-2 py-1.5 text-xs">{ficheUrl}</code>
            <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(ficheUrl).then(() => toast("Lien copié", "info"))}><Copy className="h-4 w-4" />Copier</Button>
            <a href={waMessage(ficheUrl)} target="_blank" rel="noreferrer"><Button size="sm"><Send className="h-4 w-4" />Envoyer par WhatsApp</Button></a>
          </div>
        </div>
      )}

      {phase === "a_trier" && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={invite} loading={busy === "invite"}><Send className="h-4 w-4" />Inviter à la fiche de commande</Button>
          <Button variant="outline" onClick={() => rpc("archive", "qual_archive", { p_id: r.id, p_archived: true }, "Dossier archivé")} loading={busy === "archive"}><Archive className="h-4 w-4" />Archiver</Button>
        </div>
      )}

      {r.decision === "en_attente" && !r.archived && (phase === "fiche_recue" || phase === "fiche_envoyee" || phase === "fiche_ouverte" || phase === "a_trier") && (
        <div className={clsx(phase !== "fiche_recue" && "mt-4 border-t border-line pt-4")}>
          <h3 className="mb-1 text-sm font-semibold">Appel de cadrage (30 min){phase !== "fiche_recue" && <span className="font-normal text-faint"> — possible avant la fiche si vous avez déjà eu le client</span>}</h3>
          <p className="mb-3 text-xs text-muted">Cochez ce qui est validé pendant l’appel. {checked}/{CALL_GRID.length} critères.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {CALL_GRID.map((c) => (
              <label key={c.key} className={clsx("flex cursor-pointer gap-2.5 rounded-lg border p-2.5 text-sm", grid[c.key] ? "border-brand/50 bg-brand-soft" : "border-line")}>
                <input type="checkbox" className="mt-0.5 accent-[#ed9c35]" checked={!!grid[c.key]} onChange={(e) => setGrid((g) => ({ ...g, [c.key]: e.target.checked }))} />
                <span><span className="font-medium">{c.label}</span><span className="block text-xs text-muted">{c.help}</span></span>
              </label>
            ))}
          </div>
          <Field label="Notes de l'appel" className="mt-3"><textarea className="input min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => decide("go")} loading={busy === "decide"}><Check className="h-4 w-4" />Go — on engage la R&D</Button>
            <Button variant="danger" onClick={() => setNoGo(true)}><X className="h-4 w-4" />No-Go</Button>
            {phase !== "a_trier" && <Button variant="ghost" onClick={() => rpc("archive", "qual_archive", { p_id: r.id, p_archived: true }, "Dossier archivé")}><Archive className="h-4 w-4" />Archiver</Button>}
          </div>
        </div>
      )}

      {phase === "go" && (
        <div className="space-y-3">
          {custom ? (
            <p className="text-sm">Envoyez la <b>facture proforma de l’étude R&D</b> depuis « Projet & documents », puis enregistrez le paiement ici : le projet passe en « R&D en cours » sans être confondu avec un acompte de production.</p>
          ) : (
            <p className="text-sm">Projet sans développement de formule : vous pouvez enregistrer des frais d’étude s’il y en a, ou passer directement au devis final.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setRdOpen(true)}><FlaskConical className="h-4 w-4" />Enregistrer les frais d’étude R&D</Button>
            {r.deal_id && <Link href={`/pipeline/${r.deal_id}`}><Button variant="outline"><FileText className="h-4 w-4" />Créer la proforma</Button></Link>}
            {!custom && <Button variant="outline" onClick={() => rpc("quote", "qual_final_quote", { p_id: r.id }, "Devis final marqué comme envoyé")} loading={busy === "quote"}>Devis final envoyé</Button>}
          </div>
        </div>
      )}

      {phase === "rd" && (
        <div className="space-y-3">
          <p className="text-sm">Étude payée le {fmtDate(r.rd_fee_paid_on)} ({fmtDA(r.rd_fee_dzd)}) · crédit sur la production jusqu’au <b>{fmtDate(r.rd_credit_until)}</b>{r.nda_signed_on ? ` · NDA signé le ${fmtDate(r.nda_signed_on)}` : ""}.</p>
          <p className="text-sm text-muted">Séries d’échantillons : {r.samples_round} / {settings?.rd_samples_included ?? 3} incluses.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => rpc("sample", "qual_formula", { p_id: r.id, p_delivered: false, p_note: null }, "Série d'échantillons enregistrée")} loading={busy === "sample"}>+ Série d’échantillons envoyée</Button>
            <Button onClick={() => rpc("formula", "qual_formula", { p_id: r.id, p_delivered: true, p_note: null }, "Formule livrée")} loading={busy === "formula"}><Check className="h-4 w-4" />Formule validée et livrée</Button>
          </div>
        </div>
      )}

      {phase === "formule" && (
        <div className="flex flex-wrap gap-2">
          {r.deal_id && <Link href={`/pipeline/${r.deal_id}`}><Button variant="outline"><FileText className="h-4 w-4" />Créer le devis final</Button></Link>}
          <Button onClick={() => rpc("quote", "qual_final_quote", { p_id: r.id }, "Devis final marqué comme envoyé")} loading={busy === "quote"}><Send className="h-4 w-4" />Devis final envoyé</Button>
        </div>
      )}

      {phase === "devis_final" && r.deal_id && (
        <div className="space-y-2 text-sm">
          <p>Devis final envoyé le {fmtDate(r.final_quote_sent_at)}. La suite (négociation, acompte, production) se suit dans le pipeline.{r.rd_credit_until ? ` Pensez à déduire l'étude R&D (${fmtDA(r.rd_fee_dzd)}) si la commande arrive avant le ${fmtDate(r.rd_credit_until)}.` : ""}</p>
          <Link href={`/pipeline/${r.deal_id}`}><Button variant="outline"><Briefcase className="h-4 w-4" />Ouvrir le projet</Button></Link>
        </div>
      )}

      {(phase === "no_go" || phase === "archive") && (
        <div className="space-y-2 text-sm">
          {r.decision_reason && <p><span className="text-faint">Raison : </span>{r.decision_reason}</p>}
          {phase === "archive" && <Button variant="outline" onClick={() => rpc("archive", "qual_archive", { p_id: r.id, p_archived: false }, "Dossier réactivé")}><ArchiveRestore className="h-4 w-4" />Réactiver</Button>}
        </div>
      )}

      <Modal open={noGo} onClose={() => setNoGo(false)} title="No-Go : clore le dossier"
        footer={<><Button variant="ghost" onClick={() => setNoGo(false)}>Annuler</Button><Button variant="danger" disabled={!reason.trim()} loading={busy === "decide"} onClick={() => decide("no_go")}>Confirmer le No-Go</Button></>}>
        <p className="mb-3 text-sm text-muted">L’opportunité passera en « Perdu » avec cette raison. Elle sert à affiner vos critères de sélection.</p>
        <Field label="Raison"><textarea className="input min-h-24" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. : budget insuffisant pour le volume, cherche seulement un prix…" /></Field>
      </Modal>

      <Modal open={rdOpen} onClose={() => setRdOpen(false)} title="Frais d'étude R&D encaissés"
        footer={<><Button variant="ghost" onClick={() => setRdOpen(false)}>Annuler</Button>
          <Button loading={busy === "rd"} onClick={async () => {
            const ok = await rpc("rd", "qual_record_rd", { p_id: r.id, p_amount: Number(rd.amount || 0), p_paid_on: rd.date, p_method: rd.method, p_nda_on: rd.nda || null }, "Étude R&D engagée");
            if (ok) setRdOpen(false);
          }}>Enregistrer</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Montant encaissé (DA)"><input className="input" inputMode="numeric" value={rd.amount} onChange={(e) => setRd({ ...rd, amount: e.target.value.replace(/[^\d]/g, "") })} placeholder="0 = étude offerte" /></Field>
          <Field label="Date du paiement"><input type="date" className="input" value={rd.date} onChange={(e) => setRd({ ...rd, date: e.target.value })} /></Field>
          <Field label="Mode de paiement"><select className="input" value={rd.method} onChange={(e) => setRd({ ...rd, method: e.target.value })}>
            {[["virement", "Virement"], ["versement", "Versement"], ["cheque", "Chèque"], ["especes", "Espèces"], ["autre", "Autre"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></Field>
          <Field label="NDA signé le (facultatif)"><input type="date" className="input" value={rd.nda} onChange={(e) => setRd({ ...rd, nda: e.target.value })} /></Field>
        </div>
        <p className="mt-3 text-xs text-muted">Le paiement est ajouté au projet avec la mention « déductible de la première production commandée avant le … » ({settings?.rd_credit_months ?? 6} mois).</p>
      </Modal>
    </div>
  );
}

function Answers({ r, m }: { r: QualRequest; m: Record<string, unknown> }) {
  const actives = (m.actives as { name: string; dose: string; origin: string; form: string }[] | undefined) ?? [];
  const refs = (m.references as { brand: string; country: string; link: string; price: string; axes: Record<string, number>; better: string }[] | undefined) ?? [];
  const val = (key: string, list?: string) => {
    const v = m[key];
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)) return null;
    if (typeof v === "boolean") return v ? "Oui" : null;
    if (/_date$/.test(key) && typeof v === "string") return fmtDate(v);
    if (/qty|_days|units_per_box/.test(key) && /^\d+$/.test(String(v))) return Number(v).toLocaleString("fr-FR");
    return list ? opt(list, v) : String(v);
  };
  return (
    <div className="card p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">Réponses du client</h2>
        <p className="text-xs text-muted">{r.fiche_submitted_at ? `Fiche envoyée le ${fmtDateTime(r.fiche_submitted_at)} · ${r.fiche_progress} %` : r.fiche_saved_at ? `Brouillon de fiche enregistré le ${fmtDateTime(r.fiche_saved_at)}` : "Formulaire de contact uniquement"}</p>
      </div>
      <div className="space-y-5">
        {FICHE_SECTIONS.map((s) => {
          const rows = s.rows.map(([k, label, list]) => [label, val(k, list)] as const).filter(([, v]) => v);
          const extra = (s.id === "F" && actives.length) || (s.id === "H" && refs.length);
          if (!rows.length && !extra) return null;
          return (
            <section key={s.id}>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><span className="flex h-5 w-5 items-center justify-center rounded bg-brand-soft text-[11px] text-brand">{s.id}</span>{s.title}</h3>
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                {rows.map(([label, v]) => (
                  <div key={label} className={clsx(String(v).length > 60 && "sm:col-span-2")}>
                    <dt className="text-xs text-faint">{label}</dt><dd className="whitespace-pre-wrap">{v}</dd>
                  </div>
                ))}
              </dl>
              {s.id === "F" && actives.length > 0 && (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs text-faint"><tr><th className="py-1 pr-3 font-normal">Actif</th><th className="pr-3 font-normal">Dosage</th><th className="pr-3 font-normal">Origine</th><th className="font-normal">Forme</th></tr></thead>
                    <tbody>{actives.map((a, i) => <tr key={i} className="border-t border-line"><td className="py-1.5 pr-3">{a.name}</td><td className="pr-3">{a.dose}</td><td className="pr-3">{opt("origin", a.origin)}</td><td>{a.form}</td></tr>)}</tbody>
                  </table>
                </div>
              )}
              {s.id === "H" && refs.map((x, i) => (
                <div key={i} className="mt-3 rounded-lg border border-line p-3 text-sm">
                  <p className="font-medium">Référence {i + 1} : {x.brand || "—"}{x.country ? ` · ${x.country}` : ""}{x.price ? ` · ${x.price}` : ""}</p>
                  {x.link && <a href={/^https?:\/\//.test(x.link) ? x.link : `https://${x.link}`} target="_blank" rel="noreferrer" className="break-all text-xs text-brand">{x.link}</a>}
                  <div className="mt-2 grid gap-1 sm:grid-cols-2">
                    {Object.entries(x.axes ?? {}).map(([k, n]) => (
                      <div key={k} className="flex items-center gap-2 text-xs"><span className="w-36 text-muted">{opt("axes", k)}</span>
                        <div className="h-1.5 flex-1 rounded-full bg-panel-2"><div className="h-full rounded-full bg-brand" style={{ width: `${n * 10}%` }} /></div><span className="w-6 text-right">{n}</span></div>
                    ))}
                  </div>
                  {x.better && <p className="mt-2 text-xs"><span className="text-faint">Veut être meilleur sur : </span>{x.better}</p>}
                </div>
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
