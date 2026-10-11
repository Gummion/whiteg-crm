"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Mail, Shield, Trash2, UserPlus, Plug } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Avatar, Badge, Button, Field, PageHeader, useToast } from "@/components/ui";
import { useCrm } from "@/components/crm-context";
import { CompanyForm } from "@/components/documents/company-form";
import { NotificationSettings } from "@/components/notification-settings";
import { QualificationSettings } from "@/components/qualification-settings";

type Invite = { email: string; role: string; created_at: string };

export default function SettingsPage() {
  const sb = supabaseBrowser();
  const router = useRouter();
  const toast = useToast();
  const { me, members, refreshMembers } = useCrm();
  const isAdmin = me?.role === "admin";
  const [name, setName] = useState(me?.full_name ?? "");
  const [invites, setInvites] = useState<Invite[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("member");
  const [external, setExternal] = useState<number | null>(null);

  const loadInvites = useCallback(async () => {
    if (!isAdmin) return;
    const { data } = await sb.from("crm_invites").select("*").order("created_at");
    setInvites(data ?? []);
  }, [sb, isAdmin]);
  useEffect(() => { loadInvites(); }, [loadInvites]);
  useEffect(() => { setName(me?.full_name ?? ""); }, [me?.full_name]);
  useEffect(() => {
    sb.from("clients").select("id", { count: "exact", head: true }).not("external_source", "is", null)
      .then(({ count }: { count: number | null }) => setExternal(count ?? 0));
  }, [sb]);

  const saveName = async () => {
    const { error } = await sb.from("crm_members").update({ full_name: name }).eq("user_id", me!.user_id);
    if (error) return toast(error.message, "err");
    toast("Profil mis à jour"); refreshMembers();
  };
  const invite = async () => {
    if (!/^\S+@\S+\.\S+$/.test(newEmail)) return toast("Email invalide", "err");
    const { error } = await sb.from("crm_invites").upsert({ email: newEmail.toLowerCase().trim(), role: newRole });
    if (error) return toast(error.message, "err");
    toast("Invitation enregistrée — la personne peut créer son compte avec cet email");
    setNewEmail(""); loadInvites();
  };
  const cancelInvite = async (email: string) => { await sb.from("crm_invites").delete().eq("email", email); loadInvites(); };
  const setRole = async (uid: string, role: string) => {
    const { error } = await sb.from("crm_members").update({ role }).eq("user_id", uid);
    if (error) return toast(error.message, "err");
    refreshMembers();
  };
  const removeMember = async (uid: string, label: string) => {
    if (!confirm(`Retirer ${label} de l'équipe ?`)) return;
    const { error } = await sb.from("crm_members").delete().eq("user_id", uid);
    if (error) return toast(error.message, "err");
    refreshMembers();
  };
  const logout = async () => { await sb.auth.signOut(); router.replace("/login"); router.refresh(); };

  return (
    <>
      <PageHeader title="Paramètres" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="card p-4 sm:p-5">
          <h2 className="mb-4 font-semibold">Mon profil</h2>
          <div className="mb-4 flex items-center gap-3">
            <Avatar name={me?.full_name || me?.email || "?"} className="h-12 w-12" />
            <div>
              <p className="font-medium">{me?.full_name || "—"}</p>
              <p className="text-sm text-muted">{me?.email}</p>
            </div>
            <Badge color={isAdmin ? "#ED9C35" : "#60a5fa"} className="ml-auto">{isAdmin ? "Admin" : "Membre"}</Badge>
          </div>
          <div className="flex gap-2">
            <Field label="Nom affiché" className="flex-1"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Button className="mt-5" variant="outline" onClick={saveName}>Enregistrer</Button>
          </div>
          <Button variant="danger" className="mt-5 w-full" onClick={logout}><LogOut className="h-4 w-4" /> Se déconnecter</Button>
        </section>

        <CompanyForm canEdit={isAdmin} />

        <NotificationSettings />

        <div className="lg:col-span-2"><QualificationSettings isAdmin={isAdmin} /></div>

        <section className="card p-4 sm:p-5 lg:col-span-2">
          <h2 className="mb-4 flex items-center gap-2 font-semibold"><Shield className="h-4 w-4 text-brand" /> Équipe ({members.length})</h2>
          <ul className="divide-y divide-line/60">
            {members.map((m) => (
              <li key={m.user_id} className="flex flex-wrap items-center gap-3 py-3">
                <Avatar name={m.full_name || m.email} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.full_name || m.email}{m.user_id === me?.user_id && <span className="text-faint"> (vous)</span>}</p>
                  <p className="truncate text-xs text-faint">{m.email}</p>
                </div>
                {isAdmin && m.user_id !== me?.user_id ? (
                  <div className="flex items-center gap-1">
                    <select className="h-8 rounded-lg border border-line bg-panel-2 px-2 text-xs" value={m.role} onChange={(e) => setRole(m.user_id, e.target.value)}>
                      <option value="member">Membre</option><option value="admin">Admin</option>
                    </select>
                    <button onClick={() => removeMember(m.user_id, m.full_name || m.email)} className="rounded p-1.5 text-faint hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ) : <Badge color={m.role === "admin" ? "#ED9C35" : "#60a5fa"}>{m.role === "admin" ? "Admin" : "Membre"}</Badge>}
              </li>
            ))}
          </ul>
          {isAdmin && (
            <div className="mt-4 border-t border-line pt-4">
              <p className="mb-2 text-sm font-medium">Inviter un collaborateur</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input className="input flex-1" type="email" placeholder="email@exemple.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                <select className="input sm:w-36" value={newRole} onChange={(e) => setNewRole(e.target.value)}><option value="member">Membre</option><option value="admin">Admin</option></select>
                <Button onClick={invite}><UserPlus className="h-4 w-4" /> Inviter</Button>
              </div>
              <p className="mt-2 text-xs text-faint">La personne crée ensuite son compte sur la page de connexion avec cet email : elle rejoint automatiquement l&apos;équipe. Personne d&apos;autre ne peut accéder aux données.</p>
              {invites.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {invites.map((i) => (
                    <li key={i.email} className="flex items-center gap-2 rounded-lg bg-panel-2 px-3 py-2 text-sm">
                      <Mail className="h-4 w-4 text-faint" /><span className="flex-1 truncate">{i.email}</span>
                      <Badge>{i.role === "admin" ? "Admin" : "Membre"} · en attente</Badge>
                      <button onClick={() => cancelInvite(i.email)} className="p-1 text-faint hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        <section className="card p-4 sm:p-5 lg:col-span-2">
          <h2 className="mb-1 flex items-center gap-2 font-semibold"><Plug className="h-4 w-4 text-brand" /> Interconnexion site dzwhiteg.com</h2>
          <p className="text-sm text-muted">
            Le CRM lit en <b className="text-fg">lecture seule</b> les demandes de devis, messages et clients de la base du site (autre compte Supabase). Rien n&apos;est importé automatiquement : chaque demande arrive dans la <a href="/inbox" className="text-brand hover:underline">Boîte de réception</a>, pré-remplie, et vous validez avant création.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <Badge color={external ? "#34d399" : "#71717a"}>{external ? "Utilisé" : "Prêt"}</Badge>
            <span className="text-faint">{external ?? 0} fiche(s) importée(s) depuis une source externe</span>
          </div>
        </section>
      </div>
    </>
  );
}
