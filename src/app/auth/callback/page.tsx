"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

/** Landing page for the email-confirmation link: finishes the sign-in in the browser. */
export default function AuthCallback() {
  const router = useRouter();
  const [msg, setMsg] = useState("Connexion en cours…");
  useEffect(() => {
    const sb = supabaseBrowser();
    const code = new URLSearchParams(window.location.search).get("code");
    (async () => {
      if (code) {
        const { error } = await sb.auth.exchangeCodeForSession(code);
        if (error) { setMsg("Lien expiré ou déjà utilisé. Connectez-vous avec votre email et mot de passe."); setTimeout(() => router.replace("/login"), 2500); return; }
      }
      const { data } = await sb.auth.getSession();
      router.replace(data.session ? "/" : "/login");
      router.refresh();
    })();
  }, [router]);
  return <div className="flex min-h-dvh items-center justify-center p-6 text-sm text-muted">{msg}</div>;
}
