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
  let step = "start";
  try {
    step = "parse_body";
    const body = (await req.json()) as { txRef?: string; transactionId?: string };
    const txRef = String(body?.txRef ?? "").trim();
    const transactionId = String(body?.transactionId ?? "").trim();
    if (!txRef || !transactionId) {
      return NextResponse.json({ error: "Missing txRef or transactionId" }, { status: 400 });
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      transactionId,
    );
    if (!isUuid) {
      return NextResponse.json({ error: "Invalid transactionId format", transactionId }, { status: 400 });
    }

    step = "read_auth";

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";

    console.log("/api/chapa/verify request:", {
      txRef,
      transactionId,
      hasToken: Boolean(token),
    });

    step = "read_env";
    const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
    const supabaseAnonKey = getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const chapaSecretKey = getRequiredEnv("CHAPA_SECRET_KEY");

    const patchTransactionStatus = async (status: "completed" | "cancelled") => {
      const url = new URL(`${supabaseUrl}/rest/v1/transactions`);
      url.searchParams.set("id", `eq.${transactionId}`);

      const res = await fetch(url.toString(), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseServiceRoleKey}`,
          apikey: supabaseServiceRoleKey,
          Prefer: "return=representation",
        },
        body: JSON.stringify({ status }),
      });

      const raw = await res.text();
      if (!res.ok) {
        console.error("patchTransactionStatus failed", {
          url: url.toString(),
          statusCode: res.status,
          raw,
        });
        throw new Error(raw || `PATCH failed with status ${res.status}`);
      }

      // If PostgREST updated zero rows, it returns [] when using representation.
      try {
        const json = raw ? JSON.parse(raw) : null;
        if (Array.isArray(json) && json.length === 0) {
          throw new Error("No rows updated (id not found)");
        }
      } catch (e) {
        // If JSON parse fails, we still consider it success because status code was 2xx.
      }
    };

    step = "create_admin_client";
    const adminSupabase = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // If the buyer is redirected back but their session token is missing/expired, we still allow
    // verification *only* when both transaction id and tx_ref match.
    // If a token exists, we also validate the caller can access the transaction under RLS.
    let tx:
      | {
          id: string;
          buyer_id: string | null;
          seller_id: string | null;
          course_id: string | null;
          amount: number | null;
          seller_amount: number | null;
          status: string | null;
          commission_amount: number | null;
          buyer_commission_amount: number | null;
          tx_ref: string | null;
        }
      | null = null;

    if (token) {
      step = "fetch_tx_user_scoped";
      // Avoid auth.getUser() here (it can be slow/time out in dev if network is flaky).
      // Instead, use a user-scoped client and rely on RLS to ensure the caller can access this transaction.
      const userSupabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      });

      const { data: userTx, error: txErr } = await userSupabase
        .from("transactions")
        .select("id, buyer_id, seller_id, course_id, amount, seller_amount, status, commission_amount, buyer_commission_amount, tx_ref")
        .eq("id", transactionId)
        .single();

      if (!txErr && userTx) {
        tx = userTx as typeof tx;
      }
    }

    if (!tx) {
      step = "fetch_tx_admin";
      const { data: adminTx, error: adminTxErr } = await adminSupabase
        .from("transactions")
        .select("id, buyer_id, seller_id, course_id, amount, seller_amount, status, commission_amount, buyer_commission_amount, tx_ref")
        .eq("id", transactionId)
        .single();

      if (adminTxErr || !adminTx) {
        return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
      }
      tx = adminTx as typeof tx;
    }

    if (tx.tx_ref && tx.tx_ref !== txRef) {
      return NextResponse.json({ error: "tx_ref does not match transaction" }, { status: 400 });
    }

    if (tx.status === "completed") {
      return NextResponse.json({ ok: true, status: "completed" });
    }

    let chapaRes: Response;
    try {
      step = "chapa_verify_fetch";
      chapaRes = await fetch(`https://api.chapa.co/v1/transaction/verify/${encodeURIComponent(txRef)}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${chapaSecretKey}`,
        },
        // Chapa sometimes takes time right after redirect; don't hang the API.
        signal: AbortSignal.timeout(20000),
      });
    } catch (e) {
      // Network error / timeout: treat as pending so the UI retries.
      return NextResponse.json({ ok: false, status: "pending" }, { status: 202 });
    }

    const chapaJson = await chapaRes.json().catch(() => null);
    if (!chapaRes.ok) {
      return NextResponse.json({ error: chapaJson?.message ?? "Chapa verification failed" }, { status: 502 });
    }

    const status = String(chapaJson?.data?.status ?? "").toLowerCase();
    if (status !== "success") {
      // Don't cancel immediately: Chapa may still be processing while the user is redirected back.
      // Only cancel when Chapa explicitly reports a terminal failure.
      if (status === "failed" || status === "cancelled") {
        step = "mark_cancelled";
        try {
          await patchTransactionStatus("cancelled");
        } catch (e: any) {
          return NextResponse.json({ error: e?.message ?? "Failed to cancel", step }, { status: 500 });
        }
        return NextResponse.json({ ok: false, status: "cancelled" }, { status: 400 });
      }
      return NextResponse.json({ ok: false, status }, { status: 202 });
    }

    step = "mark_completed";

    try {
      await patchTransactionStatus("completed");
    } catch (e: any) {
      console.error("/api/chapa/verify mark_completed failed:", { transactionId, txRef, updErr: e?.message ?? e });
      return NextResponse.json({ error: e?.message ?? "Failed to mark completed", step }, { status: 500 });
    }

    // Keep this endpoint fast: once the transaction is marked completed, the user can proceed.
    // All side-effects (earnings, commissions, notifications, emails) should be handled by the webhook.
    return NextResponse.json({ ok: true, status: "completed" });
  } catch (err: any) {
    console.error("/api/chapa/verify error:", { step, err });
    return NextResponse.json(
      {
        error: err?.message ?? "Server error",
        step,
      },
      { status: 500 },
    );
  }
}
