import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PLATFORM_OWNER_EMAIL } from "@/lib/platform";

export function useAdmin() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    const normalizedEmail = (user.email ?? "").trim().toLowerCase();
    if (normalizedEmail && normalizedEmail === PLATFORM_OWNER_EMAIL.trim().toLowerCase()) {
      setIsAdmin(true);
      setLoading(false);
      return;
    }

    const check = async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (error) {
        // If the table doesn't exist (or is not exposed), treat as non-admin without spamming the console.
        setIsAdmin(false);
        setLoading(false);
        return;
      }
      setIsAdmin(!!data);
      setLoading(false);
    };
    check();
  }, [user]);

  return { isAdmin, loading };
}
