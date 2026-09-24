"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Bell, CheckCheck, Briefcase, UserPlus, AlarmClock, Trophy, XCircle, ListTodo, Inbox, Sun } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Notification } from "@/lib/types";
import { fmtAgo } from "@/lib/format";
import { getPushState, setBadge } from "@/lib/push";
import { useCrm } from "./crm-context";
import { useToast } from "./ui";

export const KIND_ICON: Record<string, { icon: React.ElementType; color: string }> = {
  deal: { icon: Briefcase, color: "#a78bfa" },
  client: { icon: UserPlus, color: "#60a5fa" },
  lead: { icon: Inbox, color: "#ED9C35" },
  reminder: { icon: AlarmClock, color: "#f87171" },
  followup: { icon: AlarmClock, color: "#ED9C35" },
  won: { icon: Trophy, color: "#34d399" },
  lost: { icon: XCircle, color: "#f87171" },
  task: { icon: ListTodo, color: "#60a5fa" },
  info: { icon: Bell, color: "#a1a1aa" },
  digest: { icon: Sun, color: "#ED9C35" },
};

export function NotificationBell() {
  const sb = supabaseBrowser();
  const { user } = useCrm();
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unread = items.filter((n) => !n.read).length;
  const pushOn = useRef(false);
  useEffect(() => { getPushState().then((st) => { pushOn.current = st === "on"; }); }, []);

  useEffect(() => {
    if (!user) return;
    sb.from("notifications").select("*").order("created_at", { ascending: false }).limit(30)
      .then(({ data }: { data: Notification[] | null }) => setItems(data ?? []));

    const ch = sb
      .channel("notif-" + user.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload: { new: Notification }) => {
          const n = payload.new;
          setItems((l) => [n, ...l].slice(0, 50));
          toast(n.title, "info");
          // when push is active on this device the service worker already shows it — avoid duplicates
          if (!pushOn.current && typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            try {
              const bn = new Notification(n.title, { body: n.body ?? undefined, icon: "/icon-192.png", tag: n.id });
              bn.onclick = () => { window.focus(); if (n.link) router.push(n.link); };
            } catch { /* some mobile browsers require a service worker */ }
          }
        })
      .subscribe();
    return () => { sb.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    document.title = unread > 0 ? `(${unread}) White G CRM` : "White G CRM";
    setBadge(unread);
  }, [unread]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const markAll = async () => {
    setItems((l) => l.map((n) => ({ ...n, read: true })));
    await sb.from("notifications").update({ read: true }).eq("read", false);
  };
  const openItem = async (n: Notification) => {
    setOpen(false);
    if (!n.read) {
      setItems((l) => l.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      await sb.from("notifications").update({ read: true }).eq("id", n.id);
    }
    if (n.link) router.push(n.link);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-panel-2 hover:text-fg"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-black">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="anim-fade fixed inset-x-2 top-14 z-50 max-h-[75dvh] overflow-hidden rounded-xl border border-line bg-panel shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-96">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 && (
              <button onClick={markAll} className="flex items-center gap-1 text-xs text-brand hover:underline">
                <CheckCheck className="h-3.5 w-3.5" /> Tout marquer lu
              </button>
            )}
          </div>
          <div className="max-h-[60dvh] overflow-y-auto">
            {items.length === 0 && <p className="px-4 py-10 text-center text-sm text-muted">Aucune notification</p>}
            {items.map((n) => <NotifRow key={n.id} n={n} onClick={() => openItem(n)} />)}
          </div>
          <button
            onClick={() => { setOpen(false); router.push("/notifications"); }}
            className="block w-full border-t border-line py-2.5 text-center text-xs text-muted hover:text-fg"
          >
            Voir tout
          </button>
        </div>
      )}
    </div>
  );
}

export function NotifRow({ n, onClick }: { n: Notification; onClick: () => void }) {
  const k = KIND_ICON[n.kind] ?? KIND_ICON.info;
  const Icon = k.icon;
  return (
    <button onClick={onClick} className={clsx("flex w-full gap-3 border-b border-line/60 px-4 py-3 text-left hover:bg-panel-2", !n.read && "bg-brand/[.04]")}>
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: k.color + "1f", color: k.color }}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className={clsx("truncate text-sm", !n.read ? "font-medium text-fg" : "text-muted")}>{n.title}</p>
        {n.body && <p className="truncate text-xs text-faint">{n.body}</p>}
        <p className="mt-0.5 text-[11px] text-faint">{fmtAgo(n.created_at)}</p>
      </div>
      {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand" />}
    </button>
  );
}
