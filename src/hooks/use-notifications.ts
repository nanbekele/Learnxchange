import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";

export type Notification = Tables<"notifications">;

export function useNotifications() {
  const { user, session, loading: authLoading } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchNotifications = useCallback(async (retryCount = 0) => {
    if (!user || !session || authLoading) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (!error && data) {
        setNotifications(data);
        setUnreadCount(data.filter((n) => !n.is_read).length);
      } else if (error) {
        // Silently handle errors - don't spam console
        if (process.env.NODE_ENV !== "production") {
          console.warn("[useNotifications] fetch error:", error.message);
        }
        // Retry up to 2 times for network errors
        if (retryCount < 2 && error.message?.includes("fetch")) {
          setTimeout(() => fetchNotifications(retryCount + 1), 1000 * (retryCount + 1));
          return;
        }
      }
    } catch (err: any) {
      // Handle auth errors gracefully
      if (err?.message?.includes("refresh token") || err?.message?.includes("JWT")) {
        console.warn("[useNotifications] Auth session invalid, skipping fetch");
        setLoading(false);
        return;
      }
      // Silently handle other errors
      if (retryCount < 2) {
        setTimeout(() => fetchNotifications(retryCount + 1), 1000 * (retryCount + 1));
        return;
      }
    }
    setLoading(false);
  }, [user, session, authLoading]);

  const markAsRead = useCallback(async (id: string) => {
    if (!user || !session) return;
    try {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", id)
        .eq("user_id", user.id);

      if (!error) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      }
    } catch (err) {
      console.warn("[useNotifications] markAsRead failed:", err);
    }
  }, [user, session]);

  const markAllAsRead = useCallback(async () => {
    if (!user || !session) return;
    try {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("is_read", false)
        .eq("user_id", user.id);

      if (!error) {
        setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
        setUnreadCount(0);
      }
    } catch (err) {
      console.warn("[useNotifications] markAllAsRead failed:", err);
    }
  }, [user, session]);

  useEffect(() => {
    // Wait for auth to be ready before fetching
    if (authLoading || !session) return;
    
    fetchNotifications();

    if (!user) return;

    // Unsubscribe any existing channel first
    if (channelRef.current) {
      channelRef.current.unsubscribe().catch(() => {});
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const newNotif = payload.new as Notification;
          setNotifications((prev) => [newNotif, ...prev]);
          if (!newNotif.is_read) {
            setUnreadCount((c) => c + 1);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channelRef.current = channel;
        }
      });

    return () => {
      // During dev fast-refresh, the socket may be in "connecting" state.
      // Using unsubscribe is safer than removeChannel and avoids noisy warnings.
      channel.unsubscribe().catch(() => {});
      if (channelRef.current === channel) {
        channelRef.current = null;
      }
    };
  }, [fetchNotifications, user, session, authLoading]);

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    refetch: fetchNotifications,
  };
}
