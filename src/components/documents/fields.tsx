"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { DocAction, DocInfo, DocLine, DocSection } from "@/lib/documents/config";
import { lineTotal } from "@/lib/documents/config";
import { money } from "@/lib/documents/money";
import { AiWrite } from "@/components/ai/ai-write";

function move<T>(list: T[], i: number, d: -1 | 1) {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const c = [...list];
  [c[i], c[j]] = [c[j], c[i]];
  return c;
}

function RowTools({ i, n, onMove, onRemove }: { i: number; n: number; onMove: (d: -1 | 1) => void; onRemove: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <button type="button" disabled={i === 0} onClick={() => onMove(-1)} className="rounded p-1 text-faint hover:bg-panel-2 hover:text-fg disabled:opacity-30" aria-label="Monter"><ArrowUp className="h-3.5 w-3.5" /></button>
      <button type="button" disabled={i === n - 1} onClick={() => onMove(1)} className="rounded p-1 text-faint hover:bg-panel-2 hover:text-fg disabled:opacity-30" aria-label="Descendre"><ArrowDown className="h-3.5 w-3.5" /></button>
      <button type="button" onClick={onRemove} className="rounded p-1 text-faint hover:bg-panel-2 hover:text-red-400" aria-label="Supprimer"><Trash2 className="h-3.5 w-3.5" /></button>
    </div>
  );
}

export function Block({ title, hint, children, action }: { title: string; hint?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="card p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {hint && <p className="text-xs text-faint">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line-2 py-2 text-xs text-muted hover:border-brand hover:text-brand">
      <Plus className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

/* ---------------- Lines ---------------- */
export function LinesEditor({ lines, onChange }: { lines: DocLine[]; onChange: (l: DocLine[]) => void }) {
  const set = (i: number, patch: Partial<DocLine>) => onChange(lines.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  return (
    <div className="space-y-2">
      {lines.map((l, i) => (
        <div key={i} className="rounded-lg border border-line bg-panel-2/40 p-2.5">
          <div className="flex items-start gap-2">
            <span className="mt-2 w-5 shrink-0 text-center text-[11px] text-faint">{i + 1}</span>
            <div className="min-w-0 flex-1 space-y-1.5">
              <input className="input font-medium" placeholder="Désignation (ex : Formulation R&D — 3 itérations)" value={l.label} onChange={(e) => set(i, { label: e.target.value })} />
              <input className="input text-xs" placeholder="Description (optionnel)" value={l.description ?? ""} onChange={(e) => set(i, { description: e.target.value })} />
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-[4.5rem_6rem_minmax(7rem,1fr)_4.5rem]">
                <label className="block"><span className="label">Qté</span><input className="input px-2" type="number" inputMode="decimal" min={0} step="any" value={l.qty} onChange={(e) => set(i, { qty: Number(e.target.value) })} /></label>
                <label className="block"><span className="label">Unité</span><input className="input px-2" list="units" value={l.unit ?? ""} onChange={(e) => set(i, { unit: e.target.value })} /></label>
                <label className="block"><span className="label">P.U. HT (DA)</span><input className="input px-2" type="number" inputMode="decimal" min={0} step="any" value={l.price} onChange={(e) => set(i, { price: Number(e.target.value) })} /></label>
                <label className="block"><span className="label">Remise %</span><input className="input px-2" type="number" inputMode="decimal" min={0} max={100} value={l.discount ?? 0} onChange={(e) => set(i, { discount: Number(e.target.value) })} /></label>
              </div>
              <p className="text-right text-xs text-muted">Total HT : <b className="text-sm tabular-nums text-fg">{money(lineTotal(l))} DA</b></p>
            </div>
            <RowTools i={i} n={lines.length} onMove={(d) => onChange(move(lines, i, d))} onRemove={() => onChange(lines.filter((_, k) => k !== i))} />
          </div>
        </div>
      ))}
      <datalist id="units">{["forfait", "jour", "heure", "unité", "lot", "kg", "boîte", "session", "mois"].map((u) => <option key={u} value={u} />)}</datalist>
      <AddButton onClick={() => onChange([...lines, { label: "", description: "", qty: 1, unit: "forfait", price: 0 }])} label="Ajouter une ligne" />
    </div>
  );
}

/* ---------------- Sections / Articles ---------------- */
export function SectionsEditor({ items, onChange, kind, docId }: { items: DocSection[]; onChange: (s: DocSection[]) => void; kind: "section" | "article"; docId?: string }) {
  const set = (i: number, patch: Partial<DocSection>) => onChange(items.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  return (
    <div className="space-y-2">
      {items.map((s, i) => (
        <div key={i} className="rounded-lg border border-line bg-panel-2/40 p-2.5">
          <div className="mb-1.5 flex items-center gap-2">
            {kind === "article" && <span className="shrink-0 text-xs font-semibold text-brand">Art. {i + 1}</span>}
            <input className="input font-medium" placeholder="Titre" value={s.title} onChange={(e) => set(i, { title: e.target.value })} />
            <RowTools i={i} n={items.length} onMove={(d) => onChange(move(items, i, d))} onRemove={() => onChange(items.filter((_, k) => k !== i))} />
          </div>
          {docId && (
            <div className="mb-1 flex justify-end">
              <AiWrite docId={docId} field={`${kind === "article" ? `Article ${i + 1}` : "Section"} « ${s.title || "sans titre"} »`} value={s.body} onChange={(body) => set(i, { body })} />
            </div>
          )}
          <textarea className="input min-h-24 text-sm leading-relaxed" value={s.body} onChange={(e) => set(i, { body: e.target.value })}
            placeholder="Texte… (« - » en début de ligne = puce, « 1. » = liste numérotée, **gras**)" />
        </div>
      ))}
      <AddButton onClick={() => onChange([...items, { title: "", body: "" }])} label={kind === "article" ? "Ajouter un article" : "Ajouter une section"} />
    </div>
  );
}

/* ---------------- Info (key / value) ---------------- */
export function InfoEditor({ items, onChange }: { items: DocInfo[]; onChange: (s: DocInfo[]) => void }) {
  const set = (i: number, patch: Partial<DocInfo>) => onChange(items.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  return (
    <div className="space-y-1.5">
      {items.map((s, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input className="input w-36 shrink-0 text-xs sm:w-44" value={s.label} onChange={(e) => set(i, { label: e.target.value })} placeholder="Libellé" />
          <input className="input" value={s.value} onChange={(e) => set(i, { value: e.target.value })} placeholder="Valeur" />
          <RowTools i={i} n={items.length} onMove={(d) => onChange(move(items, i, d))} onRemove={() => onChange(items.filter((_, k) => k !== i))} />
        </div>
      ))}
      <AddButton onClick={() => onChange([...items, { label: "", value: "" }])} label="Ajouter une ligne" />
    </div>
  );
}

/* ---------------- Actions ---------------- */
export function ActionsEditor({ items, onChange }: { items: DocAction[]; onChange: (s: DocAction[]) => void }) {
  const set = (i: number, patch: Partial<DocAction>) => onChange(items.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  return (
    <div className="space-y-2">
      {items.map((a, i) => (
        <div key={i} className="flex items-start gap-1.5 rounded-lg border border-line bg-panel-2/40 p-2">
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-1.5 sm:grid-cols-[1fr_9rem_9rem]">
            <input className="input" value={a.action} onChange={(e) => set(i, { action: e.target.value })} placeholder="Action" />
            <input className="input" value={a.owner ?? ""} onChange={(e) => set(i, { owner: e.target.value })} placeholder="Responsable" />
            <input className="input" type="date" value={a.due ?? ""} onChange={(e) => set(i, { due: e.target.value })} />
          </div>
          <RowTools i={i} n={items.length} onMove={(d) => onChange(move(items, i, d))} onRemove={() => onChange(items.filter((_, k) => k !== i))} />
        </div>
      ))}
      <AddButton onClick={() => onChange([...items, { action: "", owner: "", due: "" }])} label="Ajouter une action" />
    </div>
  );
}
