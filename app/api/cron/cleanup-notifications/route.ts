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

    // Delete notifications older than 2 months
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

    const { error, count } = await adminSupabase
      .from("notifications")
      .delete({ count: "exact" })
      .lt("created_at", twoMonthsAgo.toISOString());

    if (error) {
      console.error("Error deleting old notifications:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      message: `Deleted ${count ?? 0} notifications older than 2 months`,
      deletedCount: count ?? 0,
    });
  } catch (err: any) {
    console.error("cleanup-notifications cron error:", err);
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: 500 });
  }
}
