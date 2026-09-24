"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Bell, BellRing, CheckCheck, Trash2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Notification } from "@/lib/types";
import { Button, Empty, PageHeader, Spinner, useToast } from "@/components/ui";
import { NotifRow } from "@/components/notification-bell";
import { useCrm } from "@/components/crm-context";

export default function NotificationsPage() {
  const sb = supabaseBrowser();
  const router = useRouter();
  const toast = useToast();
  const { user } = useCrm();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");

  const load = useCallback(async () => {
    const { data } = await sb.from("notifications").select("*").order("created_at", { ascending: false }).limit(200);
    setItems(data ?? []); setLoading(false);
  }, [sb]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPerm(typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported"); }, []);
  useEffect(() => {
    if (!user) return;
    const ch = sb.channel("notif-page").on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => load()).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [sb, user, load]);

  const enable = async () => {
    const p = await Notification.requestPermission();
    setPerm(p);
    if (p === "granted") new Notification("Notifications activées", { body: "Vous serez alerté des nouveaux leads, relances et changements d'étape.", icon: "/icon-192.png" });
  };
  const markAll = async () => { await sb.from("notifications").update({ read: true }).eq("read", false); load(); };
  const clearRead = async () => { await sb.from("notifications").delete().eq("read", true); toast("Notifications lues supprimées"); load(); };
  const open = async (n: Notification) => {
    if (!n.read) await sb.from("notifications").update({ read: true }).eq("id", n.id);
    if (n.link) router.push(n.link); else load();
  };

  const list = onlyUnread ? items.filter((n) => !n.read) : items;
  const unread = items.filter((n) => !n.read).length;

  return (
    <>
      <PageHeader title="Notifications" subtitle={unread ? `${unread} non lue${unread > 1 ? "s" : ""}` : "Vous êtes à jour"}
        actions={<>
          <Button variant="outline" size="sm" className="h-9" onClick={markAll} disabled={!unread}><CheckCheck className="h-4 w-4" /> Tout lire</Button>
          <Button variant="ghost" size="sm" className="h-9" onClick={clearRead}><Trash2 className="h-4 w-4" /> Vider les lues</Button>
        </>} />

      {perm !== "granted" && perm !== "unsupported" && (
        <div className="card mb-4 flex flex-col gap-3 border-brand/30 bg-gradient-to-r from-brand/10 to-transparent p-4 sm:flex-row sm:items-center">
          <BellRing className="h-6 w-6 shrink-0 text-brand" />
          <div className="flex-1">
            <p className="text-sm font-medium">Activez les notifications du navigateur</p>
            <p className="text-xs text-muted">Recevez une alerte sur votre ordinateur / téléphone même quand l&apos;onglet est en arrière-plan.</p>
          </div>
          <Button size="sm" onClick={enable} disabled={perm === "denied"}>{perm === "denied" ? "Bloquées dans le navigateur" : "Activer"}</Button>
        </div>
      )}

      <div className="mb-3 inline-grid grid-cols-2 rounded-lg border border-line bg-panel p-1 text-sm">
        {[false, true].map((u) => (
          <button key={String(u)} onClick={() => setOnlyUnread(u)} className={clsx("rounded-md px-3 py-1.5", onlyUnread === u ? "bg-panel-2 font-medium" : "text-muted")}>{u ? "Non lues" : "Toutes"}</button>
        ))}
      </div>

      {loading ? <Spinner /> : list.length === 0 ? <div className="card"><Empty icon={Bell} title="Aucune notification" text="Les nouveaux leads, changements d'étape et rappels de relance apparaîtront ici." /></div> : (
        <div className="card overflow-hidden">{list.map((n) => <NotifRow key={n.id} n={n} onClick={() => open(n)} />)}</div>
      )}
    </>
  );
}
