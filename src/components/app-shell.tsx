"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  LayoutDashboard, Inbox, Users, KanbanSquare, ListTodo, FileText, Bell, Settings, Plus, Search, LogOut, UserPlus, Briefcase, AlarmClock, ShieldAlert, Sparkles,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { CrmProvider, useCrm } from "./crm-context";
import { NotificationBell } from "./notification-bell";
import { ClientForm, DealForm, TaskForm } from "./forms";
import { Avatar, Button, Spinner, ToastProvider } from "./ui";
import { GMark, Logo } from "./logo";
import { registerSW, syncPush } from "@/lib/push";

const NAV = [
  { href: "/", label: "Tableau de bord", short: "Accueil", icon: LayoutDashboard },
  { href: "/clients", label: "Clients", short: "Clients", icon: Users },
  { href: "/pipeline", label: "Pipeline", short: "Pipeline", icon: KanbanSquare },
  { href: "/inbox", label: "Réception site", short: "Réception", icon: Inbox },
  { href: "/documents", label: "Documents", short: "Docs", icon: FileText },
  { href: "/ia", label: "Assistant IA", short: "IA", icon: Sparkles },
  { href: "/taches", label: "Tâches & relances", short: "Tâches", icon: ListTodo },
  { href: "/notifications", label: "Notifications", short: "Alertes", icon: Bell },
  { href: "/parametres", label: "Paramètres", short: "Réglages", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <CrmProvider>
        <Shell>{children}</Shell>
      </CrmProvider>
    </ToastProvider>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { user, me, loading } = useCrm();
  const [quick, setQuick] = useState(false);
  const [modal, setModal] = useState<null | "client" | "deal" | "task">(null);
  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); searchRef.current?.focus(); }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

  useEffect(() => {
    if (!me) return;
    registerSW().then(() => syncPush());
  }, [me]);

  const logout = async () => { await supabaseBrowser().auth.signOut(); router.replace("/login"); router.refresh(); };
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  if (loading || !user) return <Spinner className="min-h-dvh" />;
  if (!me) return <NotMember email={user.email ?? ""} onLogout={logout} />;

  const openModal = (m: "client" | "deal" | "task") => { setQuick(false); setModal(m); };

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-panel lg:flex">
        <div className="flex h-16 items-center gap-3 border-b border-line px-5">
          <Logo size={17} />
          <span className="rounded bg-brand-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand">CRM</span>
        </div>
        <nav className="flex-1 space-y-0.5 p-3">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href}
              className={clsx("flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
                isActive(n.href) ? "bg-brand-soft font-medium text-brand" : "text-muted hover:bg-panel-2 hover:text-fg")}>
              <n.icon className="h-[18px] w-[18px]" /> {n.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-line p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <Avatar name={me?.full_name || me?.email || "?"} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{me?.full_name || "Moi"}</p>
              <p className="truncate text-xs text-faint">{me?.email}</p>
            </div>
            <button onClick={logout} className="rounded-md p-1.5 text-faint hover:bg-panel-2 hover:text-fg" title="Déconnexion"><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
      </aside>

      {/* Top bar */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-bg/85 px-3 backdrop-blur-md sm:px-5 lg:h-16">
        <Link href="/" className="flex shrink-0 items-center lg:hidden">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-black text-white ring-1 ring-line"><GMark size={20} /></span>
        </Link>
        <form className="relative min-w-0 flex-1 max-w-md"
          onSubmit={(e) => { e.preventDefault(); router.push("/clients?q=" + encodeURIComponent(q)); searchRef.current?.blur(); }}>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un client…"
            className="h-9 w-full rounded-lg border border-line bg-panel pl-9 pr-12 text-sm outline-none placeholder:text-faint focus:border-brand" />
          <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-line px-1.5 text-[10px] text-faint sm:block">Ctrl K</kbd>
        </form>
        <div className="ml-auto flex items-center gap-1">
          <div className="relative">
            <Button size="sm" onClick={() => setQuick((v) => !v)} className="h-9 px-3" aria-label="Créer">
              <Plus className="h-4 w-4" /><span className="hidden sm:inline">Créer</span>
            </Button>
            {quick && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setQuick(false)} />
                <div className="anim-fade absolute right-0 top-11 z-50 w-56 overflow-hidden rounded-xl border border-line bg-panel p-1 shadow-2xl">
                  <QuickItem icon={UserPlus} label="Nouveau client" onClick={() => openModal("client")} />
                  <QuickItem icon={Briefcase} label="Nouvelle opportunité" onClick={() => openModal("deal")} />
                  <QuickItem icon={AlarmClock} label="Nouvelle tâche / relance" onClick={() => openModal("task")} />
                </div>
              </>
            )}
          </div>
          <Link href="/ia" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-panel-2 hover:text-brand lg:hidden" aria-label="Assistant IA"><Sparkles className="h-5 w-5" /></Link>
          <NotificationBell />
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-3 pb-28 pt-5 sm:px-5 lg:px-8 lg:pb-10 lg:pt-7">{children}</main>

      {/* Bottom nav mobile */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 grid grid-cols-7 border-t border-line bg-panel/95 backdrop-blur-md lg:hidden">
        {NAV.filter((n) => n.href !== "/notifications" && n.href !== "/ia").map((n) => (
          <Link key={n.href} href={n.href} className={clsx("flex min-w-0 flex-col items-center gap-0.5 py-2 text-[10px]", isActive(n.href) ? "text-brand" : "text-faint")}>
            <n.icon className="h-5 w-5" /> {n.short}
          </Link>
        ))}
      </nav>

      <ClientForm open={modal === "client"} onClose={() => setModal(null)} onSaved={(id) => router.push("/clients/" + id)} />
      <DealForm open={modal === "deal"} onClose={() => setModal(null)} />
      <TaskForm open={modal === "task"} onClose={() => setModal(null)} />
    </div>
  );
}

function QuickItem({ icon: Icon, label, onClick }: { icon: React.ElementType; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-panel-2">
      <Icon className="h-4 w-4 text-brand" /> {label}
    </button>
  );
}

function NotMember({ email, onLogout }: { email: string; onLogout: () => void }) {
  const { refreshMembers } = useCrm();
  useEffect(() => {
    // if an admin invited this email after the account was created, join now
    supabaseBrowser().rpc("claim_invite").then(({ data }: { data: boolean | null }) => { if (data) refreshMembers(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="card max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-400"><ShieldAlert className="h-6 w-6" /></div>
        <h1 className="text-lg font-semibold">Accès en attente</h1>
        <p className="mt-2 text-sm text-muted">
          Le compte <b className="text-fg">{email}</b> n&apos;est pas encore membre de l&apos;équipe. Demandez à l&apos;administrateur de vous inviter depuis <i>Paramètres → Équipe</i>, puis reconnectez-vous.
        </p>
        <Button variant="outline" className="mt-6" onClick={onLogout}>Se déconnecter</Button>
      </div>
    </div>
  );
}
