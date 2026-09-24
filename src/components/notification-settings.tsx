"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { BellRing, Smartphone, Send, Moon, Flame, Scale, Leaf, Sun } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { disablePush, enablePush, getPushState, isIos, sendTestPush, type PushState } from "@/lib/push";
import { Badge, Button, useToast } from "./ui";

type Prefs = { mode: "agressif" | "modere" | "calme"; quiet_start: number; quiet_end: number; muted_kinds: string[]; digest: boolean };
const DEFAULTS: Prefs = { mode: "modere", quiet_start: 22, quiet_end: 7, muted_kinds: [], digest: true };

const MODES = [
  { k: "agressif", label: "Agressif", icon: Flame, color: "#f87171", desc: "Tout est envoyé sur le téléphone, même la nuit pour l'urgent et l'important. Pas de regroupement." },
  { k: "modere", label: "Modéré", icon: Scale, color: "#ED9C35", desc: "Recommandé. Urgent + important + normal. La nuit : seulement l'urgent. Les rafales sont regroupées." },
  { k: "calme", label: "Calme", icon: Leaf, color: "#34d399", desc: "Seulement l'urgent (nouvelles demandes de devis, tâches en retard). Le reste reste dans le CRM." },
] as const;

const KINDS: { k: string; label: string; level: string }[] = [
  { k: "lead", label: "Demandes de devis & messages du site", level: "Urgent" },
  { k: "reminder", label: "Rappels de tâches (retard = urgent)", level: "Important" },
  { k: "followup", label: "Relances clients & devis sans réponse", level: "Important" },
  { k: "task", label: "Tâche assignée", level: "Important" },
  { k: "won", label: "Paiements & affaires gagnées", level: "Important" },
  { k: "deal", label: "Opportunités & changements d'étape", level: "Normal" },
  { k: "client", label: "Nouveau client créé", level: "Normal" },
  { k: "lost", label: "Affaires perdues / devis refusés", level: "Normal" },
];

const hours = Array.from({ length: 24 }, (_, h) => h);

export function NotificationSettings() {
  const sb = supabaseBrowser();
  const toast = useToast();
  const [state, setState] = useState<PushState | "loading">("loading");
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getPushState().then(setState);
    sb.from("notification_prefs").select("mode, quiet_start, quiet_end, muted_kinds, digest").maybeSingle()
      .then(({ data }: { data: Prefs | null }) => data && setPrefs({ ...DEFAULTS, ...data }));
  }, [sb]);

  const save = async (patch: Partial<Prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    const { data: u } = await sb.auth.getUser();
    const { error } = await sb.from("notification_prefs").upsert({ user_id: u.user?.id, ...next, updated_at: new Date().toISOString() });
    if (error) toast(error.message, "err");
  };

  const enable = async () => {
    setBusy(true);
    try { await enablePush(); setState("on"); toast("Notifications activées sur cet appareil"); await sendTestPush().catch(() => {}); }
    catch (e) { toast((e as Error).message, "err"); setState(await getPushState()); }
    finally { setBusy(false); }
  };
  const disable = async () => {
    setBusy(true);
    try { await disablePush(); setState("off"); toast("Notifications désactivées sur cet appareil"); }
    catch (e) { toast((e as Error).message, "err"); }
    finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true);
    try {
      const r = await sendTestPush();
      if (r.devices === 0) toast("Aucun appareil enregistré — activez d'abord", "err");
      else if (r.ok === 0) toast("L'envoi a échoué — désactivez puis réactivez", "err");
      else toast(`Test envoyé à ${r.ok} appareil(s)`);
    } catch (e) { toast((e as Error).message, "err"); }
    finally { setBusy(false); }
  };

  return (
    <section className="card p-4 sm:p-5 lg:col-span-2">
      <h2 className="mb-1 flex items-center gap-2 font-semibold"><BellRing className="h-4 w-4 text-brand" /> Notifications intelligentes</h2>
      <p className="mb-4 text-sm text-muted">Alertes poussées sur votre téléphone même quand l&apos;application est fermée. Chaque alerte a un niveau (urgent, important, normal) et le CRM décide quand vous déranger.</p>

      {/* Device */}
      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-line bg-panel-2/60 p-3 sm:flex-row sm:items-center">
        <Smartphone className="hidden h-5 w-5 shrink-0 text-brand sm:block" />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-medium">Cet appareil</p>
          <p className="text-xs text-faint">
            {state === "on" && "Les alertes arrivent sur cet appareil."}
            {state === "off" && "Pas encore activé sur cet appareil. Activez sur chaque téléphone / ordinateur."}
            {state === "denied" && "Bloqué : autorisez les notifications pour ce site dans les réglages du navigateur / téléphone, puis revenez ici."}
            {state === "ios-browser" && "Sur iPhone : touchez Partager → « Sur l'écran d'accueil », puis ouvrez le CRM depuis cette icône pour activer."}
            {state === "unsupported" && "Ce navigateur ne gère pas les notifications push."}
            {state === "loading" && "Vérification…"}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {state === "on" ? (
            <>
              <Badge color="#34d399">Activées</Badge>
              <Button size="sm" variant="outline" onClick={test} loading={busy}><Send className="h-3.5 w-3.5" /> Tester</Button>
              <Button size="sm" variant="ghost" onClick={disable} disabled={busy}>Désactiver</Button>
            </>
          ) : state === "off" || state === "denied" ? (
            <Button size="sm" onClick={enable} loading={busy}>Activer sur cet appareil</Button>
          ) : state === "ios-browser" ? <Badge>{isIos() ? "iPhone" : "—"}</Badge> : null}
        </div>
      </div>

      {/* Mode */}
      <p className="label mb-2">Intensité</p>
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {MODES.map((m) => (
          <button key={m.k} type="button" onClick={() => save({ mode: m.k })}
            className={clsx("rounded-xl border p-3 text-left transition", prefs.mode === m.k ? "border-brand bg-brand-soft" : "border-line hover:border-line-2")}>
            <span className="flex items-center gap-2 text-sm font-semibold"><m.icon className="h-4 w-4" style={{ color: m.color }} /> {m.label}</span>
            <span className="mt-1 block text-xs leading-relaxed text-muted">{m.desc}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="rounded-xl border border-line p-3">
            <p className="mb-2 flex items-center gap-2 text-sm font-medium"><Moon className="h-4 w-4 text-faint" /> Heures calmes (heure d&apos;Alger)</p>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted">de</span>
              <select className="input h-9 w-24" value={prefs.quiet_start} onChange={(e) => save({ quiet_start: Number(e.target.value) })}>{hours.map((h) => <option key={h} value={h}>{h}h</option>)}</select>
              <span className="text-muted">à</span>
              <select className="input h-9 w-24" value={prefs.quiet_end} onChange={(e) => save({ quiet_end: Number(e.target.value) })}>{hours.map((h) => <option key={h} value={h}>{h}h</option>)}</select>
            </div>
            <p className="mt-2 text-xs text-faint">Pendant ces heures, seules les alertes autorisées par l&apos;intensité choisie sonnent. Tout reste visible dans le CRM.</p>
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3">
            <input type="checkbox" className="mt-1 accent-[#ED9C35]" checked={prefs.digest} onChange={(e) => save({ digest: e.target.checked })} />
            <span className="text-sm"><span className="flex items-center gap-2 font-medium"><Sun className="h-4 w-4 text-brand" /> Résumé du matin (8h)</span>
              <span className="text-xs text-muted">Tâches du jour et en retard, relances, devis sans réponse, factures échues, demandes du site.</span></span>
          </label>
        </div>
        <div className="rounded-xl border border-line p-3">
          <p className="mb-2 text-sm font-medium">Types d&apos;alertes sur le téléphone</p>
          <ul className="space-y-1.5">
            {KINDS.map((k) => {
              const on = !prefs.muted_kinds.includes(k.k);
              return (
                <li key={k.k}>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input type="checkbox" className="accent-[#ED9C35]" checked={on}
                      onChange={() => save({ muted_kinds: on ? [...prefs.muted_kinds, k.k] : prefs.muted_kinds.filter((x) => x !== k.k) })} />
                    <span className="flex-1">{k.label}</span>
                    <span className={clsx("text-[10px] font-semibold uppercase", k.level === "Urgent" ? "text-red-400" : k.level === "Important" ? "text-brand" : "text-faint")}>{k.level}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
