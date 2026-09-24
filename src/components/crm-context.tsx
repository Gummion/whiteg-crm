"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Member } from "@/lib/types";

type Ctx = { user: User | null; me: Member | null; members: Member[]; loading: boolean; refreshMembers: () => Promise<void> };
const CrmCtx = createContext<Ctx>({ user: null, me: null, members: [], loading: true, refreshMembers: async () => {} });
export const useCrm = () => useContext(CrmCtx);

export function CrmProvider({ children }: { children: React.ReactNode }) {
  const sb = supabaseBrowser();
  const [user, setUser] = useState<User | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshMembers = async () => {
    const { data } = await sb.from("crm_members").select("user_id,email,full_name,role").order("created_at");
    setMembers((data as Member[]) ?? []);
  };

  useEffect(() => {
    (async () => {
      // email-confirmation links can land on any page with ?code=… : finish the sign-in here
      const code = new URLSearchParams(window.location.search).get("code");
      if (code) {
        await sb.auth.exchangeCodeForSession(code).catch(() => null);
        window.history.replaceState(null, "", window.location.pathname);
      }
      const { data } = await sb.auth.getUser();
      if (!data.user) {
        // no valid session (expired / stale cookie): clean up and go to the login page
        await sb.auth.signOut({ scope: "local" }).catch(() => null);
        window.location.replace("/login");
        return;
      }
      setUser(data.user);
      await refreshMembers();
      setLoading(false);
    })();
    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (event === "SIGNED_OUT") window.location.replace("/login");
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const me = members.find((m) => m.user_id === user?.id) ?? null;
  return <CrmCtx.Provider value={{ user, me, members, loading, refreshMembers }}>{children}</CrmCtx.Provider>;
}

export function memberName(members: Member[], id: string | null | undefined) {
  if (!id) return "Non assigné";
  const m = members.find((x) => x.user_id === id);
  return m?.full_name || m?.email || "—";
}
