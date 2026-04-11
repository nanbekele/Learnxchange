import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { chapaService } from "@/lib/chapa/chapaService";

const getRequiredEnv = (key: string) => {
  const v = process.env[key];
  if (!v) throw new Error(`Missing environment variable: ${key}`);
  return v;
};

/**
 * POST /api/admin/sync-chapa-balance
 * Syncs Chapa balance to platform_balance table
 * Can be called manually by admin or via cron job
 */
export async function POST(req: Request) {
  try {
    const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
    const supabaseAnonKey = getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

    const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    
    // Check authorization for manual sync
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    const cronSecret = req.headers.get("x-cron-secret");
    const isCron = cronSecret && cronSecret === process.env.CRON_SECRET;
    
    let userId: string | null = null;
    
    if (!isCron) {
      // For manual sync, verify admin
      if (!token) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
      if (userErr || !userRes?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      
      userId = userRes.user.id;

      // Check if user is admin
      const { data: userRole } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .single();

      if (!userRole) {
        return NextResponse.json({ error: "Forbidden - Admin only" }, { status: 403 });
      }
    }

    // Fetch balance from Chapa
    const chapaBalance = await chapaService.getBalance();

    // Update platform_balance in database
    const { data: existingBalance, error: fetchError } = await supabase
      .from("platform_balance")
      .select("id")
      .order("last_updated", { ascending: false })
      .limit(1)
      .single();

    if (fetchError && fetchError.code !== "PGRST116") {
      console.error("Error fetching platform balance:", fetchError);
    }

    const now = new Date().toISOString();
    const notes = `Synced from Chapa - Available: ${chapaBalance.available} ${chapaBalance.currency}`;

    let result;
    if (existingBalance?.id) {
      // Update existing record
      result = await supabase
        .from("platform_balance")
        .update({
          balance: chapaBalance.ledger,
          currency: chapaBalance.currency,
          last_updated: now,
          updated_by: isCron ? null : userId,
          notes,
        })
        .eq("id", existingBalance.id);
    } else {
      // Create new record
      result = await supabase.from("platform_balance").insert({
        balance: chapaBalance.ledger,
        currency: chapaBalance.currency,
        last_updated: now,
        updated_by: isCron ? null : userId,
        notes,
      });
    }

    if (result.error) {
      throw result.error;
    }

    return NextResponse.json({
      success: true,
      balance: chapaBalance.ledger,
      available: chapaBalance.available,
      currency: chapaBalance.currency,
      syncedAt: now,
      source: isCron ? "cron" : "manual",
    });
  } catch (err: any) {
    console.error("Chapa balance sync error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to sync Chapa balance" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/sync-chapa-balance
 * Returns current Chapa balance without updating database
 */
export async function GET(req: Request) {
  try {
    const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
    const supabaseAnonKey = getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

    const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin
    const { data: userRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userRes.user.id)
      .eq("role", "admin")
      .single();

    if (!userRole) {
      return NextResponse.json({ error: "Forbidden - Admin only" }, { status: 403 });
    }

    const chapaBalance = await chapaService.getBalance();

    // Get local platform balance for comparison
    const { data: localBalance } = await supabase
      .from("platform_balance")
      .select("balance, last_updated")
      .order("last_updated", { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json({
      chapa: {
        ledger: chapaBalance.ledger,
        available: chapaBalance.available,
        currency: chapaBalance.currency,
      },
      local: localBalance || { balance: 0, last_updated: null },
      difference: chapaBalance.ledger - (localBalance?.balance || 0),
    });
  } catch (err: any) {
    console.error("Chapa balance fetch error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch Chapa balance" },
      { status: 500 }
    );
  }
}
