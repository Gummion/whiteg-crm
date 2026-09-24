"use client";

import { Logo } from "@/components/logo";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok?: boolean } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setMsg(null);
    const sb = supabaseBrowser();
    if (mode === "login") {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) { setMsg({ t: error.message === "Invalid login credentials" ? "Email ou mot de passe incorrect." : error.message }); setLoading(false); return; }
      router.replace("/"); router.refresh();
    } else {
      const { data, error } = await sb.auth.signUp({
        email, password,
        options: { data: { full_name: name }, emailRedirectTo: window.location.origin },
      });
      setLoading(false);
      if (error) return setMsg({ t: error.message });
      if (data.session) { router.replace("/"); router.refresh(); }
      else setMsg({ t: "Compte créé. Vérifiez votre boîte mail pour confirmer, puis connectez-vous.", ok: true });
    }
  };

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden p-4">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[40rem] -translate-x-1/2 rounded-full bg-brand/10 blur-3xl" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <Logo size={30} />
          <p className="mt-3 text-sm text-muted">CRM · Suivi clients & projets</p>
        </div>
        <form onSubmit={submit} className="card space-y-4 p-6">
          <div className="grid grid-cols-2 rounded-lg bg-panel-2 p-1 text-sm">
            {(["login", "signup"] as const).map((m) => (
              <button key={m} type="button" onClick={() => { setMode(m); setMsg(null); }}
                className={"rounded-md py-1.5 transition " + (mode === m ? "bg-panel font-medium text-fg shadow" : "text-muted")}>
                {m === "login" ? "Connexion" : "Créer un compte"}
              </button>
            ))}
          </div>
          {mode === "signup" && (
            <label className="block"><span className="label">Nom complet</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></label>
          )}
          <label className="block"><span className="label">Email</span>
            <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label className="block"><span className="label">Mot de passe</span>
            <input className="input" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          {msg && <p className={"rounded-lg px-3 py-2 text-sm " + (msg.ok ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300")}>{msg.t}</p>}
          <button disabled={loading} className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-brand text-sm font-semibold text-black transition hover:bg-brand-600 disabled:opacity-60">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "login" ? "Se connecter" : "Créer mon compte"}
          </button>
          {mode === "signup" && <p className="text-center text-xs text-faint">Le premier compte créé devient administrateur.</p>}
        </form>
      </div>
    </div>
  );
}
