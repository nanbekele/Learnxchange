import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

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
    const { data: paymentMethod, error: pmError } = await adminSupabase
      .from("user_payment_methods")
      .select("method, account_name, account_number")
      .eq("user_id", user.id)
      .eq("is_default", true)
      .single();

    if (pmError || !paymentMethod) {
      return NextResponse.json(
        { error: "No default payment method found. Please add a payment method in your profile." },
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
        { error: "No available earnings to withdraw. Earnings become available after 7 days." },
        { status: 400 }
      );
    }

    const totalAmount = availableEarnings.reduce((sum, e) => sum + Number(e.amount), 0);

    if (totalAmount <= 0) {
      return NextResponse.json({ error: "No available earnings to withdraw" }, { status: 400 });
    }

    // Create payout request
    const { data: payoutRequest, error: payoutError } = await adminSupabase
      .from("payout_requests")
      .insert({
        seller_id: user.id,
        amount: totalAmount,
        status: "requested",
        method: paymentMethod.method,
        account_name: paymentMethod.account_name,
        account_number: paymentMethod.account_number,
        requested_at: new Date().toISOString(),
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
        updated_at: new Date().toISOString(),
      })
      .in("id", earningIds);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      payoutRequestId: payoutRequest.id,
      amount: totalAmount,
      message: `Withdrawal request created for ETB ${totalAmount.toFixed(2)}`,
    });
  } catch (err: any) {
    console.error("Payout request error:", err);
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
  }
}
