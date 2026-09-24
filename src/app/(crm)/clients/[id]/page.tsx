"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import {
  ArrowLeft, Phone, MessageCircle, Mail, Pencil, Trash2, Plus, Globe, MapPin, Building2, Hash, CalendarClock, Star, Circle, CheckCircle2, StickyNote, UserRound,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { CLIENT_STATUSES, DEAL_STAGES, OFFER_CATEGORIES, SECTORS, SOURCES, colorOf, labelOf, ACTIVITY_TYPES } from "@/lib/constants";
import type { Activity, Client, Contact, Deal, Task } from "@/lib/types";
import { dueLabel, fmtAgo, fmtCompactDA, fmtDA, fmtDate, fmtDateTime, waLink } from "@/lib/format";
import { emitChange, useOnChange } from "@/lib/events";
import { ACT_ICON } from "@/components/icons";
import { Avatar, Badge, Button, Empty, Spinner, useToast } from "@/components/ui";
import { ActivityForm, ClientForm, ContactForm, DealForm, TaskForm } from "@/components/forms";
import type { Doc } from "@/lib/documents/config";
import { createDocument } from "@/lib/documents/data";
import { DocRow } from "@/components/documents/doc-list";
import { NewDocumentModal } from "@/components/documents/new-document";
import { PaymentForm } from "@/components/documents/payment-form";
import { memberName, useCrm } from "@/components/crm-context";

export default function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const sb = supabaseBrowser();
  const router = useRouter();
  const toast = useToast();
  const { members } = useCrm();
  const [c, setC] = useState<Client | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [acts, setActs] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<null | "edit" | "contact" | "deal" | "task" | "activity">(null);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [editDeal, setEditDeal] = useState<Deal | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [docOpen, setDocOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [balance, setBalance] = useState<{ billed: number; paid: number }>({ billed: 0, paid: 0 });

  const load = useCallback(async () => {
    const [a, b, d, t, x, ...rest] = await Promise.all([
      sb.from("clients").select("*").eq("id", id).maybeSingle(),
      sb.from("contacts").select("*").eq("client_id", id).order("is_primary", { ascending: false }),
      sb.from("deals").select("*").eq("client_id", id).order("created_at", { ascending: false }),
      sb.from("tasks").select("*").eq("client_id", id).order("done").order("due_at", { nullsFirst: false }),
      sb.from("activities").select("*").eq("client_id", id).order("occurred_at", { ascending: false }).limit(100),
      sb.from("documents").select("*").eq("client_id", id).order("created_at", { ascending: false }),
      sb.from("payments").select("amount").eq("client_id", id),
    ]);
    const dd = (rest[0].data as Doc[]) ?? [];
    setDocs(dd);
    setBalance({
      billed: dd.filter((x) => x.kind === "facture" && !["brouillon", "annule"].includes(x.status)).reduce((a2, x) => a2 + Number(x.total_ttc), 0),
      paid: ((rest[1].data as { amount: number }[]) ?? []).reduce((a2, x) => a2 + Number(x.amount), 0),
    });
    setC(a.data); setContacts(b.data ?? []); setDeals(d.data ?? []); setTasks(t.data ?? []); setActs(x.data ?? []);
    setLoading(false);
  }, [sb, id]);
  useEffect(() => { load(); }, [load]);
  useOnChange(load);

  if (loading) return <Spinner />;
  if (!c) return <Empty icon={Building2} title="Client introuvable" action={<Link href="/clients"><Button variant="outline">Retour</Button></Link>} />;

  const setStatus = async (status: string) => {
    setC({ ...c, status: status as Client["status"] });
    await sb.from("clients").update({ status }).eq("id", c.id);
    toast("Statut mis à jour");
  };
  const remove = async () => {
    if (!confirm(`Supprimer définitivement ${c.company_name} et tout son historique ?`)) return;
    const { error } = await sb.from("clients").delete().eq("id", c.id);
    if (error) return toast(error.message, "err");
    toast("Client supprimé"); router.replace("/clients");
  };
  const toggleTask = async (t: Task) => {
    setTasks((l) => l.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
    await sb.from("tasks").update({ done: !t.done }).eq("id", t.id);
    emitChange();
  };
  const delContact = async (ct: Contact) => {
    if (!confirm(`Supprimer ${ct.full_name} ?`)) return;
    await sb.from("contacts").delete().eq("id", ct.id); emitChange();
  };

  const primary = contacts.find((x) => x.is_primary) ?? contacts[0];
  const phone = c.phone || primary?.phone;
  const wa = primary?.whatsapp || phone;
  const email = c.email || primary?.email;
  const lifetime = deals.filter((d) => ["acompte_recu", "en_cours", "livre"].includes(d.stage)).reduce((a, d) => a + Number(d.amount), 0);
  const open = deals.filter((d) => ["nouveau", "brief", "devis_envoye", "negociation"].includes(d.stage)).reduce((a, d) => a + Number(d.amount), 0);
  const openTasks = tasks.filter((t) => !t.done);

  return (
    <>
      <Link href="/clients" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="h-4 w-4" /> Clients</Link>

      {/* Header */}
      <div className="card mb-4 p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <Avatar name={c.company_name} className="h-14 w-14 text-base" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{c.company_name}</h1>
              {c.external_source && <Badge color="#ED9C35">via {c.external_source}</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted">
              {labelOf(SECTORS, c.sector)} · {labelOf(SOURCES, c.source)}{c.wilaya && ` · ${c.wilaya.replace(/^\d+ /, "")}`}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select value={c.status} onChange={(e) => setStatus(e.target.value)}
                className="h-8 rounded-full border border-line bg-panel-2 px-3 text-xs outline-none focus:border-brand" style={{ color: colorOf(CLIENT_STATUSES, c.status) }}>
                {CLIENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              {c.tags?.map((t) => <span key={t} className="rounded-full bg-panel-2 px-2 py-1 text-xs text-muted">#{t}</span>)}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:justify-end">
            {phone && <a href={`tel:${phone}`}><Button variant="outline" size="sm" className="h-9 w-full"><Phone className="h-4 w-4" /><span>Appeler</span></Button></a>}
            {wa && <a href={waLink(wa)} target="_blank" rel="noreferrer"><Button variant="outline" size="sm" className="h-9 w-full"><MessageCircle className="h-4 w-4 text-emerald-400" /><span>WhatsApp</span></Button></a>}
            {email && <a href={`mailto:${email}`}><Button variant="outline" size="sm" className="h-9 w-full"><Mail className="h-4 w-4" /><span>Email</span></Button></a>}
            <Button variant="outline" size="sm" className="h-9" onClick={() => setModal("edit")}><Pencil className="h-4 w-4" /><span>Modifier</span></Button>
            <Button variant="danger" size="sm" className="h-9" onClick={remove}><Trash2 className="h-4 w-4" /><span className="sm:hidden">Supprimer</span></Button>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 sm:grid-cols-4">
          <Stat label="Chiffre signé" value={fmtCompactDA(lifetime)} />
          <Stat label="En négociation" value={fmtCompactDA(open)} />
          <Stat label="Dernier contact" value={fmtAgo(c.last_contact_at)} />
          <Stat label="Prochaine relance" value={c.next_followup_at ? fmtDateTime(c.next_followup_at) : "—"} warn={!!c.next_followup_at && new Date(c.next_followup_at) < new Date()} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-4">
          <Section title="Coordonnées">
            <dl className="space-y-2.5 text-sm">
              <Info icon={Phone} v={c.phone} href={c.phone ? `tel:${c.phone}` : undefined} />
              <Info icon={Mail} v={c.email} href={c.email ? `mailto:${c.email}` : undefined} />
              <Info icon={Globe} v={c.website} href={c.website ?? undefined} />
              <Info icon={MapPin} v={[c.address, c.city, c.wilaya].filter(Boolean).join(", ")} />
              <Info icon={Hash} v={[c.rc_number && "RC " + c.rc_number, c.nif && "NIF " + c.nif].filter(Boolean).join(" · ")} />
              <Info icon={CalendarClock} v={"Fiche créée le " + fmtDate(c.created_at)} />
            </dl>
            {c.notes && <p className="mt-4 whitespace-pre-wrap rounded-lg bg-panel-2 p-3 text-sm text-muted">{c.notes}</p>}
          </Section>

          <Section title="Contacts" action={<Button size="sm" variant="ghost" onClick={() => { setEditContact(null); setModal("contact"); }}><Plus className="h-4 w-4" /> Ajouter</Button>}>
            {contacts.length === 0 ? <p className="py-3 text-center text-sm text-faint">Aucun contact</p> : (
              <ul className="-mx-2 space-y-1">
                {contacts.map((ct) => (
                  <li key={ct.id} className="group flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-panel-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-panel-2 text-muted"><UserRound className="h-4 w-4" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-sm font-medium">{ct.full_name}{ct.is_primary && <Star className="h-3 w-3 fill-brand text-brand" />}</p>
                      <p className="truncate text-xs text-faint">{[ct.job_title, ct.phone, ct.email].filter(Boolean).join(" · ")}</p>
                    </div>
                    <div className="flex shrink-0 gap-0.5">
                      {ct.phone && <a href={`tel:${ct.phone}`} className="rounded p-1.5 text-faint hover:text-fg"><Phone className="h-3.5 w-3.5" /></a>}
                      {(ct.whatsapp || ct.phone) && <a href={waLink((ct.whatsapp || ct.phone)!)} target="_blank" rel="noreferrer" className="rounded p-1.5 text-faint hover:text-emerald-400"><MessageCircle className="h-3.5 w-3.5" /></a>}
                      <button onClick={() => { setEditContact(ct); setModal("contact"); }} className="rounded p-1.5 text-faint hover:text-fg"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => delContact(ct)} className="rounded p-1.5 text-faint hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        {/* Right column */}
        <div className="space-y-4 lg:col-span-2">
          <Section title={`Opportunités & projets (${deals.length})`} action={<Button size="sm" variant="ghost" onClick={() => { setEditDeal(null); setModal("deal"); }}><Plus className="h-4 w-4" /> Nouvelle</Button>}>
            {deals.length === 0 ? <p className="py-3 text-center text-sm text-faint">Aucune opportunité — créez-en une dès réception d&apos;un brief.</p> : (
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {deals.map((d) => (
                  <li key={d.id}>
                    <button onClick={() => router.push(`/pipeline/${d.id}`)} className="w-full rounded-lg border border-line p-3 text-left transition hover:border-line-2 hover:bg-panel-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-2 text-sm font-medium">{d.title}</p>
                        <span className="shrink-0 rounded bg-panel-2 px-1.5 py-0.5 text-[10px] font-bold text-muted" title={labelOf(OFFER_CATEGORIES, d.category)}>{d.category}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <Badge color={colorOf(DEAL_STAGES, d.stage)}>{labelOf(DEAL_STAGES, d.stage)}</Badge>
                        <span className="text-sm font-semibold tabular-nums">{fmtDA(d.amount)}</span>
                      </div>
                      <p className="mt-1.5 text-xs text-faint">{[d.product_format, d.quote_ref, d.expected_close && "clôture " + fmtDate(d.expected_close)].filter(Boolean).join(" · ") || "—"}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={`Tâches (${openTasks.length} en cours)`} action={<Button size="sm" variant="ghost" onClick={() => setModal("task")}><Plus className="h-4 w-4" /> Tâche</Button>}>
            {tasks.length === 0 ? <p className="py-3 text-center text-sm text-faint">Aucune tâche</p> : (
              <ul className="-mx-2">
                {tasks.slice(0, 8).map((t) => {
                  const dl = dueLabel(t.due_at);
                  return (
                    <li key={t.id} className="flex items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-panel-2">
                      <button onClick={() => toggleTask(t)} className="mt-0.5 text-faint hover:text-brand">{t.done ? <CheckCircle2 className="h-[18px] w-[18px] text-emerald-400" /> : <Circle className="h-[18px] w-[18px]" />}</button>
                      <div className="min-w-0 flex-1">
                        <p className={clsx("text-sm", t.done && "text-faint line-through")}>{t.title}</p>
                        <p className="text-xs text-faint"><span className={clsx(!t.done && dl.tone === "danger" && "text-red-400", !t.done && dl.tone === "warn" && "text-brand")}>{dl.text}</span> · {memberName(members, t.assignee_id)}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          <Section title={`Documents (${docs.length})`} action={
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setPayOpen(true)}>Paiement</Button>
              <Button size="sm" variant="ghost" onClick={async () => { const nid = await createDocument("etat_compte", { clientId: c.id }); router.push("/documents/" + nid); }}>État de compte</Button>
              <Button size="sm" variant="ghost" onClick={() => setDocOpen(true)}><Plus className="h-4 w-4" /> Document</Button>
            </div>}>
            {(balance.billed > 0 || balance.paid > 0) && (
              <div className="mb-3 grid grid-cols-3 gap-2 rounded-lg bg-panel-2 p-3 text-center">
                <div><p className="text-[11px] text-faint">Facturé</p><p className="text-sm font-semibold tabular-nums">{fmtCompactDA(balance.billed)}</p></div>
                <div><p className="text-[11px] text-faint">Encaissé</p><p className="text-sm font-semibold tabular-nums text-emerald-400">{fmtCompactDA(balance.paid)}</p></div>
                <div><p className="text-[11px] text-faint">Solde dû</p><p className={clsx("text-sm font-semibold tabular-nums", balance.billed - balance.paid > 0 ? "text-brand" : "")}>{fmtCompactDA(balance.billed - balance.paid)}</p></div>
              </div>
            )}
            {docs.length === 0 ? <p className="py-3 text-center text-sm text-faint">Aucun document — créez une proposition, un devis ou un NDA.</p> : (
              <div className="-mx-4 divide-y divide-line/60 border-y border-line/60 sm:-mx-5">{docs.slice(0, 12).map((d) => <DocRow key={d.id} d={d} />)}</div>
            )}
          </Section>

          <Section title="Historique" action={<Button size="sm" onClick={() => setModal("activity")}><Plus className="h-4 w-4" /> Interaction</Button>}>
            {acts.length === 0 ? <Empty icon={StickyNote} title="Aucune interaction" text="Notez chaque appel, message WhatsApp, visite ou réunion pour garder l'historique complet." /> : (
              <ol className="relative ml-3 border-l border-line">
                {acts.map((a) => {
                  const Icon = ACT_ICON[a.type] ?? StickyNote;
                  return (
                    <li key={a.id} className="mb-4 ml-5 last:mb-0">
                      <span className="absolute -left-3.5 flex h-7 w-7 items-center justify-center rounded-full border border-line bg-panel text-muted"><Icon className="h-3.5 w-3.5" /></span>
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <p className="text-sm font-medium">{a.subject}</p>
                        <time className="text-xs text-faint">{fmtDateTime(a.occurred_at)}</time>
                      </div>
                      <p className="text-xs text-faint">{labelOf(ACTIVITY_TYPES, a.type)}{a.author_id && " · " + memberName(members, a.author_id)}</p>
                      {a.body && <p className="mt-1.5 whitespace-pre-wrap rounded-lg bg-panel-2 p-2.5 text-sm text-muted">{a.body}</p>}
                    </li>
                  );
                })}
              </ol>
            )}
          </Section>
        </div>
      </div>

      <ClientForm open={modal === "edit"} onClose={() => setModal(null)} client={c} />
      <ContactForm open={modal === "contact"} onClose={() => setModal(null)} clientId={c.id} contact={editContact} />
      <DealForm open={modal === "deal"} onClose={() => setModal(null)} clientId={c.id} deal={editDeal} />
      <TaskForm open={modal === "task"} onClose={() => setModal(null)} clientId={c.id} />
      <ActivityForm open={modal === "activity"} onClose={() => setModal(null)} clientId={c.id} deals={deals} />
      <NewDocumentModal open={docOpen} onClose={() => setDocOpen(false)} clientId={c.id} />
      <PaymentForm open={payOpen} onClose={() => setPayOpen(false)} clientId={c.id} defaultAmount={Math.max(0, balance.billed - balance.paid) || undefined} />
    </>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>{action}
      </div>
      {children}
    </section>
  );
}
function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <p className="text-xs text-faint">{label}</p>
      <p className={clsx("mt-0.5 truncate text-sm font-semibold tabular-nums", warn && "text-brand")}>{value}</p>
    </div>
  );
}
function Info({ icon: Icon, v, href }: { icon: React.ElementType; v?: string | null; href?: string }) {
  if (!v) return null;
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-faint" />
      {href ? <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="break-all text-fg hover:text-brand">{v}</a> : <span className="text-muted">{v}</span>}
    </div>
  );
}
