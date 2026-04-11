import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getPayoutService } from "@/lib/payout/payoutService";
import { chapaService } from "@/lib/chapa/chapaService";

const getRequiredEnv = (key: string) => {
  const v = process.env[key];
  if (!v) throw new Error(`Missing environment variable: ${key}`);
  return v;
};

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) {
      return NextResponse.json({ error: "Unauthorized: missing access token" }, { status: 401 });
    }

    const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
    const supabaseAnonKey = getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

    const authSupabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userRes, error: userErr } = await authSupabase.auth.getUser(token);
    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Unauthorized: invalid or expired access token" }, { status: 401 });
    }

    const user = userRes.user;

    const adminSupabase = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Get seller's default payment method
    const { data: paymentMethod } = await adminSupabase
      .from("user_payment_methods")
      .select("method, account_name, account_number")
      .eq("user_id", user.id)
      .eq("is_default", true)
      .single();

    // Validate that only Telebirr is accepted for payouts
    if (paymentMethod && paymentMethod.method !== "telebirr") {
      return NextResponse.json(
        { error: "Only Telebirr is supported for seller payouts. Please update your payout method in your profile." },
        { status: 400 }
      );
    }

    if (!paymentMethod || paymentMethod.method !== "telebirr") {
      return NextResponse.json(
        { error: "Please add a default Telebirr payout method in your profile before requesting withdrawal." },
        { status: 400 }
      );
    }

    // Calculate available earnings (pending and past available_at date)
    const { data: availableEarnings, error: earningsError } = await adminSupabase
      .from("seller_earnings")
      .select("id, amount")
      .eq("seller_id", user.id)
      .eq("status", "pending")
      .lte("available_at", new Date().toISOString());

    if (earningsError) {
      return NextResponse.json({ error: earningsError.message }, { status: 500 });
    }

    if (!availableEarnings || availableEarnings.length === 0) {
      return NextResponse.json(
        { error: "No available earnings to withdraw. Earnings become available after 3 days." },
        { status: 400 }
      );
    }

    const totalAmount = availableEarnings.reduce((sum, e) => sum + Number(e.amount), 0);

    if (totalAmount <= 0) {
      return NextResponse.json({ error: "No available earnings to withdraw" }, { status: 400 });
    }

    // Create payout request (requested -> paid after automatic processing)
    const nowIso = new Date().toISOString();

    const { data: payoutRequest, error: payoutError } = await adminSupabase
      .from("payout_requests")
      .insert({
        seller_id: user.id,
        amount: totalAmount,
        status: "requested",
        method: paymentMethod.method,
        account_name: paymentMethod.account_name,
        account_number: paymentMethod.account_number,
        requested_at: nowIso,
        admin_note: null,
      })
      .select("id")
      .single();

    if (payoutError || !payoutRequest) {
      return NextResponse.json(
        { error: payoutError?.message || "Failed to create payout request" },
        { status: 500 }
      );
    }

    // Update seller earnings to link to payout request and change status
    const earningIds = availableEarnings.map((e) => e.id);
    const { error: updateError } = await adminSupabase
      .from("seller_earnings")
      .update({
        status: "requested",
        payout_request_id: payoutRequest.id,
        updated_at: nowIso,
      })
      .in("id", earningIds);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Check platform balance before processing payout
    // Try to get real-time Chapa balance first, fall back to cached platform_balance
    let currentBalance: number;
    try {
      const chapaBalance = await chapaService.getBalance();
      currentBalance = chapaBalance.available; // Use available balance (not ledger)
      
      // Sync to database for consistency
      const now = new Date().toISOString();
      await adminSupabase.from("platform_balance").upsert({
        balance: chapaBalance.ledger,
        currency: chapaBalance.currency,
        last_updated: now,
        notes: `Auto-synced during payout check - Available: ${chapaBalance.available}`,
      }, { onConflict: "id" });
    } catch (chapaErr) {
      // Fall back to database balance if Chapa API fails
      console.warn("Failed to fetch Chapa balance, using cached:", chapaErr);
      const { data: platformBalance } = await adminSupabase
        .from("platform_balance")
        .select("balance")
        .order("last_updated", { ascending: false })
        .limit(1)
        .single();
      currentBalance = Number(platformBalance?.balance ?? 0);
    }
    
    if (currentBalance < totalAmount) {
      // Insufficient balance - mark for manual review
      await adminSupabase
        .from("payout_requests")
        .update({
          status: "manual_review",
          admin_note: `Insufficient platform balance: ETB ${currentBalance.toFixed(2)} available, ETB ${totalAmount.toFixed(2)} required`,
          updated_at: nowIso,
        })
        .eq("id", payoutRequest.id);

      await adminSupabase
        .from("seller_earnings")
        .update({ status: "manual_review", updated_at: nowIso })
        .eq("payout_request_id", payoutRequest.id);

      // Notify admins
      const { data: admins } = await adminSupabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");

      if (admins && admins.length > 0) {
        await Promise.all(
          admins.map((admin) =>
            adminSupabase.from("notifications").insert({
              user_id: admin.user_id,
              title: "Insufficient balance for payout",
              body: `Seller requested ETB ${totalAmount.toFixed(2)} but platform balance is only ETB ${currentBalance.toFixed(2)}.`,
              type: "error",
              link: "/admin",
            })
          )
        );
      }

      await adminSupabase.from("notifications").insert({
        user_id: user.id,
        title: "Payout pending",
        body: `Your withdrawal of ETB ${totalAmount.toFixed(2)} is pending due to insufficient platform funds.`,
        type: "warning",
        link: "/dashboard",
      });

      return NextResponse.json({
        success: false,
        error: "Insufficient platform balance",
        payoutRequestId: payoutRequest.id,
        amount: totalAmount,
        currentBalance,
        message: `Withdrawal request created but cannot be processed. Platform balance is insufficient (ETB ${currentBalance.toFixed(2)} available, ETB ${totalAmount.toFixed(2)} required).`,
      }, { status: 422 });
    }

    const payoutService = getPayoutService();
    const payoutRes = await payoutService.sendMoney(String(paymentMethod.account_number ?? "").trim(), totalAmount);

    if (payoutRes.ok) {
      const paidAt = new Date().toISOString();

      const { error: updReqErr } = await adminSupabase
        .from("payout_requests")
        .update({
          status: "paid",
          paid_at: paidAt,
          admin_note: payoutRes.reference ? `Auto payout ref: ${payoutRes.reference}` : null,
          updated_at: paidAt,
        })
        .eq("id", payoutRequest.id)
        .eq("status", "requested");

      if (updReqErr) {
        return NextResponse.json({ error: updReqErr.message }, { status: 500 });
      }

      const { error: updEarnErr } = await adminSupabase
        .from("seller_earnings")
        .update({ status: "paid", updated_at: paidAt })
        .eq("payout_request_id", payoutRequest.id)
        .eq("status", "requested");

      if (updEarnErr) {
        return NextResponse.json({ error: updEarnErr.message }, { status: 500 });
      }

      await adminSupabase.from("notifications").insert({
        user_id: user.id,
        title: "Payout completed",
        body: `ETB ${totalAmount.toFixed(2)} has been sent to your Telebirr account.`,
        type: "success",
        link: "/dashboard",
      });

      return NextResponse.json({
        success: true,
        payoutRequestId: payoutRequest.id,
        amount: totalAmount,
        autoProcess: true,
        message: `Payout completed. ETB ${totalAmount.toFixed(2)} sent to your Telebirr account.`,
      });
    }

    // Keep as 'requested' for cron retry; record reason.
    await adminSupabase
      .from("payout_requests")
      .update({ admin_note: payoutRes.message ?? "Auto payout failed", updated_at: nowIso })
      .eq("id", payoutRequest.id)
      .eq("status", "requested");

    await adminSupabase.from("notifications").insert({
      user_id: user.id,
      title: "Payout processing",
      body: `Your withdrawal request was created for ETB ${totalAmount.toFixed(2)}, but automatic payout failed. We'll retry shortly.`,
      type: "warning",
      link: "/dashboard",
    });

    return NextResponse.json({
      success: true,
      payoutRequestId: payoutRequest.id,
      amount: totalAmount,
      autoProcess: true,
      message: `Withdrawal request created for ETB ${totalAmount.toFixed(2)}. Automatic payout will retry shortly.`,
    });
  } catch (err: any) {
    console.error("Payout request error:", err);
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
  }
}
