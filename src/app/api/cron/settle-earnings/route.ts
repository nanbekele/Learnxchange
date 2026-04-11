import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const getRequiredEnv = (key: string) => {
  const v = process.env[key];
  if (!v) throw new Error(`Missing environment variable: ${key}`);
  return v;
};

const assertCronAuth = (req: Request) => {
  const expected = (process.env.CRON_SECRET ?? "").trim();
  if (!expected) throw new Error("Missing CRON_SECRET");

  const header = (req.headers.get("x-cron-secret") ?? "").trim();
  if (header !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
};

export async function POST(req: Request) {
  try {
    const authRes = assertCronAuth(req);
    if (authRes) return authRes;

    const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
    const supabaseServiceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

    const adminSupabase = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Your model uses available_at to determine availability.
    // This cron does a light normalization pass:
    // any earnings older than the holding period but still pending remain pending (they are now "available").
    // If you later add an explicit 'available' status, update it here.

    const nowIso = new Date().toISOString();

    const { data, error } = await adminSupabase
      .from("seller_earnings")
      .select("id")
      .eq("status", "pending")
      .lte("available_at", nowIso)
      .limit(1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // No-op currently; kept for future explicit status transitions.
    return NextResponse.json({ ok: true, pending_now_available: (data ?? []).length });
  } catch (err: any) {
    console.error("settle-earnings cron error:", err);
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: 500 });
  }
}
