"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { isPast, isToday, isTomorrow, isThisWeek } from "date-fns";
import { Plus, Circle, CheckCircle2, ListTodo, Pencil, Trash2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { PRIORITIES, colorOf, labelOf } from "@/lib/constants";
import type { Task } from "@/lib/types";
import { dueLabel } from "@/lib/format";
import { emitChange, useOnChange } from "@/lib/events";
import { Badge, Button, Empty, PageHeader, Spinner, useToast } from "@/components/ui";
import { TaskForm } from "@/components/forms";
import { memberName, useCrm } from "@/components/crm-context";

const GROUPS = [
  { key: "late", label: "En retard", test: (d: Date) => isPast(d) && !isToday(d) },
  { key: "today", label: "Aujourd'hui", test: (d: Date) => isToday(d) },
  { key: "tomorrow", label: "Demain", test: (d: Date) => isTomorrow(d) },
  { key: "week", label: "Cette semaine", test: (d: Date) => isThisWeek(d, { weekStartsOn: 6 }) },
  { key: "later", label: "Plus tard", test: () => true },
];

export default function TasksPage() {
  const sb = supabaseBrowser();
  const toast = useToast();
  const { user, members } = useCrm();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<"mine" | "all" | "done">("mine");
  const [edit, setEdit] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    let q = sb.from("tasks").select("*, clients(id,company_name)");
    q = scope === "done" ? q.eq("done", true).order("done_at", { ascending: false }).limit(100) : q.eq("done", false).order("due_at", { ascending: true, nullsFirst: false });
    const { data } = await q;
    setTasks(data ?? []);
    setLoading(false);
  }, [sb, scope]);
  useEffect(() => { load(); }, [load]);
  useOnChange(load);

  const visible = useMemo(
    () => (scope === "mine" ? tasks.filter((t) => !t.assignee_id || t.assignee_id === user?.id) : tasks),
    [tasks, scope, user?.id]
  );

  const grouped = useMemo(() => {
    if (scope === "done") return [{ key: "done", label: "Terminées", items: visible }];
    const used = new Set<string>();
    const out = GROUPS.map((g) => {
      const items = visible.filter((t) => t.due_at && !used.has(t.id) && g.test(new Date(t.due_at)));
      items.forEach((t) => used.add(t.id));
      return { key: g.key, label: g.label, items };
    });
    out.push({ key: "none", label: "Sans échéance", items: visible.filter((t) => !t.due_at) });
    return out.filter((g) => g.items.length);
  }, [visible, scope]);

  const toggle = async (t: Task) => {
    setTasks((l) => l.filter((x) => x.id !== t.id));
    const { error } = await sb.from("tasks").update({ done: !t.done }).eq("id", t.id);
    if (error) return toast(error.message, "err");
    toast(t.done ? "Tâche rouverte" : "Tâche terminée");
    emitChange();
  };
  const remove = async (t: Task) => {
    if (!confirm("Supprimer cette tâche ?")) return;
    await sb.from("tasks").delete().eq("id", t.id); emitChange();
  };

  return (
    <>
      <PageHeader title="Tâches & relances" subtitle="Rappels automatiques : une notification est envoyée 1 h avant chaque échéance."
        actions={<Button size="sm" className="h-9" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Nouvelle tâche</Button>} />

      <div className="mb-4 inline-grid grid-cols-3 rounded-lg border border-line bg-panel p-1 text-sm">
        {([["mine", "Mes tâches"], ["all", "Équipe"], ["done", "Terminées"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => { setLoading(true); setScope(k); }} className={clsx("rounded-md px-3 py-1.5 transition", scope === k ? "bg-panel-2 font-medium text-fg" : "text-muted")}>{l}</button>
        ))}
      </div>

      {loading ? <Spinner /> : grouped.length === 0 ? (
        <div className="card"><Empty icon={ListTodo} title={scope === "done" ? "Rien de terminé pour l'instant" : "Aucune tâche en attente"} text="Planifiez vos relances clients pour ne jamais laisser un devis sans réponse." action={scope !== "done" && <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Planifier une relance</Button>} /></div>
      ) : (
        <div className="space-y-5">
          {grouped.map((g) => (
            <section key={g.key}>
              <h2 className={clsx("mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide", g.key === "late" ? "text-red-400" : g.key === "today" ? "text-brand" : "text-muted")}>
                {g.label}<span className="rounded-full bg-panel-2 px-1.5 text-[10px] text-faint">{g.items.length}</span>
              </h2>
              <ul className="card divide-y divide-line/60">
                {g.items.map((t) => {
                  const dl = dueLabel(t.due_at);
                  return (
                    <li key={t.id} className="group flex items-start gap-3 px-3 py-3 sm:px-4">
                      <button onClick={() => toggle(t)} className="mt-0.5 text-faint hover:text-brand" aria-label="Basculer">
                        {t.done ? <CheckCircle2 className="h-5 w-5 text-emerald-400" /> : <Circle className="h-5 w-5" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className={clsx("text-sm", t.done && "text-faint line-through")}>{t.title}</p>
                        {t.description && <p className="mt-0.5 line-clamp-2 text-xs text-faint">{t.description}</p>}
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                          <span className={clsx(!t.done && dl.tone === "danger" && "text-red-400", !t.done && dl.tone === "warn" && "text-brand", (t.done || dl.tone === "muted" || dl.tone === "info") && "text-faint")}>{dl.text}</span>
                          {t.clients && <Link href={`/clients/${t.clients.id}`} className="text-muted hover:text-brand">{t.clients.company_name}</Link>}
                          {t.priority !== "normale" && <Badge color={colorOf(PRIORITIES, t.priority)}>{labelOf(PRIORITIES, t.priority)}</Badge>}
                          {scope !== "mine" && <span className="text-faint">{memberName(members, t.assignee_id)}</span>}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-0.5 sm:opacity-0 sm:group-hover:opacity-100">
                        <button onClick={() => setEdit(t)} className="rounded p-1.5 text-faint hover:bg-panel-2 hover:text-fg"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => remove(t)} className="rounded p-1.5 text-faint hover:bg-panel-2 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
      <TaskForm open={!!edit || creating} task={edit} onClose={() => { setEdit(null); setCreating(false); }} />
    </>
  );
}
