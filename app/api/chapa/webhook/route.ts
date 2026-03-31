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

export async function GET(req: Request) {
  // Some Chapa integrations call callback_url via GET with query params like `trx_ref`.
  // In production this endpoint should be reachable publicly (not localhost) to avoid browser loopback/CORS blocks.
  try {
    const url = new URL(req.url);
    const txRef = String(url.searchParams.get("tx_ref") ?? url.searchParams.get("trx_ref") ?? "").trim();
    if (!txRef) return NextResponse.json({ ok: true });

    const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
    const supabaseServiceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const chapaSecretKey = getRequiredEnv("CHAPA_SECRET_KEY");

    const adminSupabase = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: tx } = await adminSupabase
      .from("transactions")
      .select("id, status, commission_amount, amount, seller_id, seller_amount")
      .eq("tx_ref", txRef)
      .single();

    if (!tx || tx.status === "completed") return NextResponse.json({ ok: true });

    const chapaRes = await fetch(`https://api.chapa.co/v1/transaction/verify/${encodeURIComponent(txRef)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${chapaSecretKey}` },
    });

    const chapaJson = await chapaRes.json().catch(() => null);
    if (!chapaRes.ok) return NextResponse.json({ ok: true });

    const status = String(chapaJson?.data?.status ?? "").toLowerCase();
    if (status !== "success") return NextResponse.json({ ok: true });

    await adminSupabase.from("transactions").update({ status: "completed" }).eq("id", tx.id);

    if (tx.seller_id && Number(tx.seller_amount ?? 0) > 0) {
      await adminSupabase.from("seller_earnings").upsert(
        {
          seller_id: tx.seller_id,
          transaction_id: tx.id,
          amount: Number(tx.seller_amount),
          status: "pending",
          available_at: addDaysIso(3),
        },
        { onConflict: "transaction_id" },
      );
    }

    const { data: existingCommission } = await adminSupabase
      .from("commissions")
      .select("id")
      .eq("transaction_id", tx.id)
      .limit(1);

    if ((existingCommission ?? []).length === 0 && Number(tx.commission_amount ?? 0) > 0) {
      const rate = Number(tx.amount ?? 0) > 0
        ? +((Number(tx.commission_amount) / Number(tx.amount)) * 100).toFixed(2)
        : 0;
      await adminSupabase.from("commissions").insert({
        transaction_id: tx.id,
        amount: Number(tx.commission_amount),
        rate,
      });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}

export async function POST(req: Request) {
  try {
    const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
    const supabaseServiceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const chapaSecretKey = getRequiredEnv("CHAPA_SECRET_KEY");

    const adminSupabase = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const payload = await req.json().catch(() => ({} as any));

    // Chapa sends different payload shapes depending on config.
    const txRef = String(payload?.tx_ref ?? payload?.data?.tx_ref ?? payload?.trx_ref ?? "").trim();
    if (!txRef) {
      return NextResponse.json({ ok: true });
    }

    const { data: tx } = await adminSupabase
      .from("transactions")
      .select("id, status, commission_amount, amount, seller_id, seller_amount")
      .eq("tx_ref", txRef)
      .single();

    if (!tx) {
      return NextResponse.json({ ok: true });
    }

    if (tx.status === "completed") {
      return NextResponse.json({ ok: true });
    }

    const chapaRes = await fetch(`https://api.chapa.co/v1/transaction/verify/${encodeURIComponent(txRef)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${chapaSecretKey}` },
    });

    const chapaJson = await chapaRes.json().catch(() => null);
    if (!chapaRes.ok) {
      return NextResponse.json({ ok: true });
    }

    const status = String(chapaJson?.data?.status ?? "").toLowerCase();

    if (status === "success") {
      await adminSupabase.from("transactions").update({ status: "completed" }).eq("id", tx.id);

      if (tx.seller_id && Number(tx.seller_amount ?? 0) > 0) {
        await adminSupabase.from("seller_earnings").upsert(
          {
            seller_id: tx.seller_id,
            transaction_id: tx.id,
            amount: Number(tx.seller_amount),
            status: "pending",
            available_at: addDaysIso(3),
          },
          { onConflict: "transaction_id" },
        );
      }

      const { data: existingCommission } = await adminSupabase
        .from("commissions")
        .select("id")
        .eq("transaction_id", tx.id)
        .limit(1);

      if ((existingCommission ?? []).length === 0 && Number(tx.commission_amount ?? 0) > 0) {
        const rate = Number(tx.amount ?? 0) > 0
          ? +((Number(tx.commission_amount) / Number(tx.amount)) * 100).toFixed(2)
          : 0;
        await adminSupabase.from("commissions").insert({
          transaction_id: tx.id,
          amount: Number(tx.commission_amount),
          rate,
        });
      }

      return NextResponse.json({ ok: true });
    }

    await adminSupabase.from("transactions").update({ status: "failed" }).eq("id", tx.id);
    return NextResponse.json({ ok: true });
  } catch {
    // Webhooks should be resilient and return 200 to avoid repeated retries.
    return NextResponse.json({ ok: true });
  }
}
