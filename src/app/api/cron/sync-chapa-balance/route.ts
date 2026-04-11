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
 * GET /api/cron/sync-chapa-balance
 * Cron job to sync Chapa balance to platform_balance
 * Should be called every 5-15 minutes
 */
export async function GET(req: Request) {
  try {
    // Verify cron secret
    const cronSecret = req.headers.get("x-cron-secret");
    if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
    const supabaseAnonKey = getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

    const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Fetch balance from Chapa
    const chapaBalance = await chapaService.getBalance();

    // Get existing balance record
    const { data: existingBalance, error: fetchError } = await supabase
      .from("platform_balance")
      .select("id, balance")
      .order("last_updated", { ascending: false })
      .limit(1)
      .single();

    if (fetchError && fetchError.code !== "PGRST116") {
      console.error("Error fetching platform balance:", fetchError);
    }

    const now = new Date().toISOString();
    const previousBalance = existingBalance?.balance || 0;
    const change = chapaBalance.ledger - previousBalance;
    
    const notes = `Auto-sync from Chapa cron - Available: ${chapaBalance.available} ${chapaBalance.currency} - Change: ${change >= 0 ? "+" : ""}${change.toFixed(2)}`;

    let result;
    if (existingBalance?.id) {
      // Update existing record
      result = await supabase
        .from("platform_balance")
        .update({
          balance: chapaBalance.ledger,
          currency: chapaBalance.currency,
          last_updated: now,
          notes,
        })
        .eq("id", existingBalance.id);
    } else {
      // Create new record
      result = await supabase.from("platform_balance").insert({
        balance: chapaBalance.ledger,
        currency: chapaBalance.currency,
        last_updated: now,
        notes,
      });
    }

    if (result.error) {
      throw result.error;
    }

    // If balance dropped significantly, notify admins
    if (change < -10000) {
      // Balance dropped by more than 10,000 ETB
      const { data: admins } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");

      if (admins && admins.length > 0) {
        await Promise.all(
          admins.map((admin) =>
            supabase.from("notifications").insert({
              user_id: admin.user_id,
              title: "Platform balance decreased significantly",
              body: `Balance changed by ${change.toFixed(2)} ETB. Current: ${chapaBalance.ledger.toFixed(2)} ETB`,
              type: "warning",
              link: "/admin",
            })
          )
        );
      }
    }

    return NextResponse.json({
      success: true,
      balance: chapaBalance.ledger,
      available: chapaBalance.available,
      currency: chapaBalance.currency,
      change,
      syncedAt: now,
    });
  } catch (err: any) {
    console.error("Chapa balance cron sync error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to sync Chapa balance" },
      { status: 500 }
    );
  }
}
