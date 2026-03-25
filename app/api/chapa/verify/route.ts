import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const getRequiredEnv = (key: string) => {
  const v = process.env[key];
  if (!v) throw new Error(`Missing environment variable: ${key}`);
  return v;
};

const addDaysIso = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
};

export async function POST(req: Request) {
  try {
    const { txRef, transactionId } = (await req.json()) as { txRef?: string; transactionId?: string };
    if (!txRef || !transactionId) {
      return NextResponse.json({ error: "Missing txRef or transactionId" }, { status: 400 });
    }

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
    const supabaseAnonKey = getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const chapaSecretKey = getRequiredEnv("CHAPA_SECRET_KEY");

    const authSupabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userRes, error: userErr } = await authSupabase.auth.getUser(token);
    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = userRes.user;

    const adminSupabase = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: tx, error: txErr } = await adminSupabase
      .from("transactions")
      .select("id, buyer_id, seller_id, seller_amount, status, commission_amount, tx_ref")
      .eq("id", transactionId)
      .single();

    if (txErr || !tx) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    if (tx.buyer_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (tx.tx_ref && tx.tx_ref !== txRef) {
      return NextResponse.json({ error: "tx_ref does not match transaction" }, { status: 400 });
    }

    if (tx.status === "completed") {
      return NextResponse.json({ ok: true, status: "completed" });
    }

    const chapaRes = await fetch(`https://api.chapa.co/v1/transaction/verify/${encodeURIComponent(txRef)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${chapaSecretKey}`,
      },
    });

    const chapaJson = await chapaRes.json().catch(() => null);
    if (!chapaRes.ok) {
      return NextResponse.json({ error: chapaJson?.message ?? "Chapa verification failed" }, { status: 502 });
    }

    const status = String(chapaJson?.data?.status ?? "").toLowerCase();
    if (status !== "success") {
      // Don't cancel immediately: Chapa may still be processing while the user is redirected back.
      // Only cancel when Chapa explicitly reports a terminal failure.
      if (status === "failed" || status === "cancelled") {
        await adminSupabase.from("transactions").update({ status: "cancelled" }).eq("id", tx.id);
        return NextResponse.json({ ok: false, status: "cancelled" }, { status: 400 });
      }
      return NextResponse.json({ ok: false, status }, { status: 202 });
    }

    const { error: updErr } = await adminSupabase.from("transactions").update({ status: "completed" }).eq("id", tx.id);
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    if (tx.seller_id && Number(tx.seller_amount ?? 0) > 0) {
      await adminSupabase.from("seller_earnings").upsert(
        {
          seller_id: tx.seller_id,
          transaction_id: tx.id,
          amount: Number(tx.seller_amount),
          status: "pending",
          available_at: addDaysIso(7),
        },
        { onConflict: "transaction_id" },
      );
    }

    if (Number(tx.commission_amount ?? 0) > 0) {
      const { data: existingCommission } = await adminSupabase
        .from("commissions")
        .select("id")
        .eq("transaction_id", tx.id)
        .limit(1);
      if ((existingCommission ?? []).length === 0) {
        await adminSupabase.from("commissions").insert({
          transaction_id: tx.id,
          amount: Number(tx.commission_amount),
          rate: 0,
        });
      }
    }

    return NextResponse.json({ ok: true, status: "completed" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: 500 });
  }
}
