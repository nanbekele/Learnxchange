import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const getRequiredEnv = (key: string) => {
  const v = process.env[key];
  if (!v) throw new Error(`Missing environment variable: ${key}`);
  return v;
};

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
    const supabaseAnonKey = getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

    const authSupabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Verify user is admin
    const { data: userRes, error: userErr } = await authSupabase.auth.getUser(token);
    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: roleData } = await authSupabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userRes.user.id)
      .eq("role", "admin")
      .single();

    if (!roleData) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    // Get platform balance
    const { data: balance, error } = await authSupabase
      .from("platform_balance")
      .select("*")
      .order("last_updated", { ascending: false })
      .limit(1)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get pending payout total (requested but not paid)
    const { data: pendingPayouts } = await authSupabase
      .from("payout_requests")
      .select("amount")
      .eq("status", "requested");

    const pendingAmount = (pendingPayouts || []).reduce((sum, p) => sum + Number(p.amount), 0);

    return NextResponse.json({
      balance: Number(balance?.balance ?? 0),
      currency: balance?.currency || "ETB",
      lastUpdated: balance?.last_updated,
      pendingPayouts: pendingAmount,
      availableAfterPayouts: Math.max(0, Number(balance?.balance ?? 0) - pendingAmount),
    });
  } catch (err: any) {
    console.error("Platform balance error:", err);
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
  }
}
