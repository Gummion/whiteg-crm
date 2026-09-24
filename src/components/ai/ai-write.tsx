"use client";

import { useState } from "react";
import clsx from "clsx";
import { Sparkles, Loader2, Undo2, Wand2, Scissors, Expand, SpellCheck, PenLine } from "lucide-react";
import { aiWrite, type WriteAction } from "@/lib/ai-client";
import { useToast } from "../ui";

const ACTIONS: { k: WriteAction; label: string; icon: React.ElementType; needsText?: boolean }[] = [
  { k: "rediger", label: "Rédiger", icon: PenLine },
  { k: "ameliorer", label: "Améliorer", icon: Wand2, needsText: true },
  { k: "developper", label: "Développer", icon: Expand, needsText: true },
  { k: "raccourcir", label: "Raccourcir", icon: Scissors, needsText: true },
  { k: "corriger", label: "Corriger", icon: SpellCheck, needsText: true },
];

/** « ✨ IA » button for any document text field. The result replaces the text, with a one-click undo. */
export function AiWrite({ docId, field, value, onChange, className }: { docId?: string; field: string; value: string; onChange: (v: string) => void; className?: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<WriteAction | null>(null);
  const [instruction, setInstruction] = useState("");
  const [previous, setPrevious] = useState<string | null>(null);
  if (!docId) return null;

  const run = async (action: WriteAction) => {
    setBusy(action);
    try {
      const { text } = await aiWrite({ docId, field, current: value, instruction: instruction.trim() || undefined, action });
      setPrevious(value);
      onChange(text);
      setOpen(false);
      toast("Texte généré — vérifiez-le avant d'émettre le document", "info");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={clsx("relative inline-flex items-center gap-1", className)}>
      {previous !== null && (
        <button type="button" onClick={() => { onChange(previous); setPrevious(null); }} title="Annuler le texte IA"
          className="flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] text-faint hover:bg-panel-2 hover:text-fg"><Undo2 className="h-3.5 w-3.5" /> Annuler</button>
      )}
      <button type="button" onClick={() => setOpen((o) => !o)} disabled={!!busy}
        className="flex h-7 items-center gap-1 rounded-md border border-brand/30 bg-brand-soft px-2 text-[11px] font-medium text-brand hover:border-brand disabled:opacity-60">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} IA
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => !busy && setOpen(false)} />
          <div className="anim-fade absolute right-0 top-8 z-50 w-72 rounded-xl border border-line bg-panel p-2 shadow-2xl">
            <p className="px-1 pb-1.5 text-[11px] text-faint">Assistant de rédaction · {field}</p>
            <textarea className="input mb-2 min-h-14 text-xs" placeholder="Consigne (optionnel) : ex. insister sur la conformité, ton plus formel…"
              value={instruction} onChange={(e) => setInstruction(e.target.value)} />
            <div className="grid grid-cols-2 gap-1">
              {ACTIONS.filter((a) => !a.needsText || value.trim()).map((a) => (
                <button key={a.k} type="button" disabled={!!busy} onClick={() => run(a.k)}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-panel-2 disabled:opacity-50">
                  {busy === a.k ? <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" /> : <a.icon className="h-3.5 w-3.5 text-brand" />} {a.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
