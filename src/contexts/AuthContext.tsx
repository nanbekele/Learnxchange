import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
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

  const inactivityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSigningOutRef = useRef(false);

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!session?.user) return;

    const INACTIVITY_MS = 2 * 60 * 1000;

    const clearTimer = () => {
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current);
        inactivityTimeoutRef.current = null;
      }
    };

    const schedule = () => {
      clearTimer();
      inactivityTimeoutRef.current = setTimeout(async () => {
        if (isSigningOutRef.current) return;
        isSigningOutRef.current = true;

        try {
          localStorage.setItem("learnxchange_session_expired", "1");
        } catch {
          // ignore
        }

        try {
          await supabase.auth.signOut();
        } finally {
          const path = window.location.pathname;
          if (!path.startsWith("/login")) {
            window.location.assign("/login");
          }
          isSigningOutRef.current = false;
        }
      }, INACTIVITY_MS);
    };

    const onActivity = () => schedule();

    schedule();

    window.addEventListener("mousemove", onActivity, { passive: true });
    window.addEventListener("mousedown", onActivity, { passive: true });
    window.addEventListener("keydown", onActivity);
    window.addEventListener("scroll", onActivity, { passive: true });
    window.addEventListener("touchstart", onActivity, { passive: true });

    return () => {
      clearTimer();
      window.removeEventListener("mousemove", onActivity);
      window.removeEventListener("mousedown", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("scroll", onActivity);
      window.removeEventListener("touchstart", onActivity);
    };
  }, [session?.user?.id]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
