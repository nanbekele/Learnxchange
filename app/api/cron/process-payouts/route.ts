import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/integrations/supabase/types";
import { getPayoutService } from "@/lib/payout/payoutService";

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

type PayoutRequestRow = Tables<"payout_requests">;

const asPhone = (row: PayoutRequestRow) => {
  // For Telebirr (and many mobile money rails), the "account_number" is the phone.
  return String((row as any).account_number ?? "").trim();
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

    const payoutService = getPayoutService();

    // Batch size: keep small to avoid timeouts.
    const batchSize = Number.parseInt((process.env.PAYOUT_BATCH_SIZE ?? "10").trim(), 10);
    const limit = Number.isFinite(batchSize) && batchSize > 0 ? batchSize : 10;

    const { data: requests, error: reqErr } = await adminSupabase
      .from("payout_requests")
      .select("*")
      .eq("status", "requested")
      .order("requested_at", { ascending: true })
      .limit(limit);

    if (reqErr) {
      return NextResponse.json({ error: reqErr.message }, { status: 500 });
    }

    const nowIso = new Date().toISOString();

    let processed = 0;
    let paid = 0;
    let failed = 0;
    const results: Array<{ id: string; ok: boolean; message?: string }> = [];

    for (const row of requests ?? []) {
      processed += 1;

      // Skip non-Telebirr payouts
      if (row.method && row.method !== "telebirr") {
        await adminSupabase
          .from("payout_requests")
          .update({
            admin_note: "Only Telebirr is supported for payouts. Please update your payment method.",
            updated_at: nowIso,
          })
          .eq("id", row.id)
          .eq("status", "requested");

        await adminSupabase.from("notifications").insert({
          user_id: row.seller_id,
          title: "Payout method not supported",
          body: `Only Telebirr is supported for payouts. Please update your payout method in your profile.`,
          type: "warning",
          link: "/profile",
        });

        results.push({ id: row.id, ok: false, message: "Only Telebirr supported" });
        continue;
      }

      const phone = asPhone(row);
      const amount = Number((row as any).amount ?? 0);

      const payoutRes = await payoutService.sendMoney(phone, amount);

      if (payoutRes.ok) {
        paid += 1;

        // Idempotency: only mark paid if it's still requested.
        const { error: updReqErr } = await adminSupabase
          .from("payout_requests")
          .update({
            status: "paid",
            paid_at: nowIso,
            admin_note: payoutRes.reference ? `Auto payout ref: ${payoutRes.reference}` : null,
            updated_at: nowIso,
          })
          .eq("id", row.id)
          .eq("status", "requested");

        if (!updReqErr) {
          await adminSupabase
            .from("seller_earnings")
            .update({ status: "paid", updated_at: nowIso })
            .eq("payout_request_id", row.id)
            .eq("status", "requested");

          // Notify seller that payout was successful
          await adminSupabase.from("notifications").insert({
            user_id: row.seller_id,
            title: "Payout completed",
            body: `ETB ${amount.toFixed(2)} has been sent to your Telebirr account.`,
            type: "success",
            link: "/dashboard",
          });
        }

        results.push({ id: row.id, ok: true, message: payoutRes.message });
      } else {
        failed += 1;

        // Keep it as 'requested' so it can be retried; record error in admin_note.
        await adminSupabase
          .from("payout_requests")
          .update({
            admin_note: payoutRes.message ?? "Auto payout failed",
            updated_at: nowIso,
          })
          .eq("id", row.id)
          .eq("status", "requested");

        // Notify seller that payout failed
        await adminSupabase.from("notifications").insert({
          user_id: row.seller_id,
          title: "Payout failed",
          body: `We couldn't process your payout of ETB ${amount.toFixed(2)}. Please ensure your Telebirr number is correct and try again.`,
          type: "error",
          link: "/profile",
        });

        results.push({ id: row.id, ok: false, message: payoutRes.message });
      }
    }

    return NextResponse.json({ ok: true, processed, paid, failed, results });
  } catch (err: any) {
    console.error("process-payouts cron error:", err);
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: 500 });
  }
}
