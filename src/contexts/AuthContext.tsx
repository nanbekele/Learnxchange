import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const ensureProfile = async (nextUser: User) => {
    const fullName = (nextUser.user_metadata as any)?.full_name ?? "";
    const email = nextUser.email ?? "";

    await supabase
      .from("profiles")
      .upsert(
        {
          user_id: nextUser.id,
          full_name: fullName,
          email,
        },
        { onConflict: "user_id" },
      );
  };

  const recordLogin = async (userId: string) => {
    try {
      // Update last_login in profiles
      await supabase
        .from("profiles")
        .update({ last_login: new Date().toISOString() })
        .eq("user_id", userId);
      
      // Record session - silently fail if not allowed
      await supabase.from("user_sessions").insert({
        user_id: userId,
        is_active: true,
      });
    } catch {
      // Silently fail - login tracking is not critical
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      if (session?.user) {
        ensureProfile(session.user).catch(() => {});
        // Record login on initial sign in
        if (event === "SIGNED_IN") {
          recordLogin(session.user.id).catch(() => {});
        }
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      if (session?.user) {
        ensureProfile(session.user).catch(() => {});
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
