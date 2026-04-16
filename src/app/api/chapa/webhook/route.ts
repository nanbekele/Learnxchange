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

const jsonpOk = (callback: string | null) => {
  if (!callback) return null;
  const safe = callback.replace(/[^a-zA-Z0-9_$\.]/g, "");
  if (!safe) return null;
  return new Response(`${safe}(${JSON.stringify({ ok: true })});`, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
    },
    status: 200,
  });
};

const patchTransactionStatusById = async (args: {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  transactionId: string;
  status: "completed" | "cancelled" | "failed";
}) => {
  const url = new URL(`${args.supabaseUrl}/rest/v1/transactions`);
  url.searchParams.set("id", `eq.${args.transactionId}`);

  const res = await fetch(url.toString(), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.supabaseServiceRoleKey}`,
      apikey: args.supabaseServiceRoleKey,
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ status: args.status }),
  });

  if (!res.ok) {
    const raw = await res.text();
    throw new Error(raw || `PATCH failed with status ${res.status}`);
  }
};

export async function GET(req: Request) {
  // Some Chapa integrations call callback_url via GET with query params like `trx_ref`.
  // In production this endpoint should be reachable publicly (not localhost) to avoid browser loopback/CORS blocks.
  try {
    const url = new URL(req.url);
    const callback = url.searchParams.get("callback");
    const txRef = String(url.searchParams.get("tx_ref") ?? url.searchParams.get("trx_ref") ?? "").trim();
    if (!txRef) return jsonpOk(callback) ?? NextResponse.json({ ok: true });

    const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
    const supabaseServiceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const chapaSecretKey = getRequiredEnv("CHAPA_SECRET_KEY");

    const adminSupabase = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: tx } = await adminSupabase
      .from("transactions")
      .select("id, status, commission_amount, buyer_commission_amount, amount, seller_id, seller_amount, buyer_id")
      .eq("tx_ref", txRef)
      .single();

    if (!tx || tx.status === "completed") return jsonpOk(callback) ?? NextResponse.json({ ok: true });

    const chapaRes = await fetch(`https://api.chapa.co/v1/transaction/verify/${encodeURIComponent(txRef)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${chapaSecretKey}` },
    });

    const chapaJson = await chapaRes.json().catch(() => null);
    if (!chapaRes.ok) return jsonpOk(callback) ?? NextResponse.json({ ok: true });

    const status = String(chapaJson?.data?.status ?? "").toLowerCase();
    if (status !== "success") return jsonpOk(callback) ?? NextResponse.json({ ok: true });

    await patchTransactionStatusById({
      supabaseUrl,
      supabaseServiceRoleKey,
      transactionId: tx.id,
      status: "completed",
    });

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

    const totalCommission = Number(tx.commission_amount ?? 0) + Number(tx.buyer_commission_amount ?? 0);
    if ((existingCommission ?? []).length === 0 && totalCommission > 0) {
      const rate = Number(tx.amount ?? 0) > 0
        ? +((totalCommission / Number(tx.amount)) * 100).toFixed(2)
        : 0;
      await adminSupabase.from("commissions").insert({
        transaction_id: tx.id,
        amount: totalCommission,
        rate,
      });
    }

    // Check if seller has payout method set up
    let sellerHasPayoutMethod = false;
    if (tx.seller_id) {
      const { data: sellerPayoutMethod } = await adminSupabase
        .from("user_payment_methods")
        .select("method, account_name, account_number")
        .eq("user_id", tx.seller_id)
        .eq("is_default", true)
        .maybeSingle();
      sellerHasPayoutMethod = !!(sellerPayoutMethod && sellerPayoutMethod.account_number);
    }

    // Send notifications
    await Promise.all([
      // Buyer notification
      adminSupabase.from("notifications").insert({
        user_id: tx.buyer_id,
        title: "Purchase completed",
        body: `Your purchase was successful. You paid ETB ${Number(tx.amount ?? 0).toFixed(2)}. You can now access your course.`,
        type: "success",
        link: "/my-learning",
      }),
      // Seller notification
      tx.seller_id && adminSupabase.from("notifications").insert({
        user_id: tx.seller_id,
        title: "Course sold",
        body: `You earned ETB ${Number(tx.seller_amount ?? 0).toFixed(2)} from a new sale. Earnings will be available for withdrawal in 3 days.`,
        type: "success",
        link: "/dashboard",
      }),
      // Seller warning: no payout method
      tx.seller_id && !sellerHasPayoutMethod && adminSupabase.from("notifications").insert({
        user_id: tx.seller_id,
        title: "Action required: Set up payout method",
        body: `You made a sale but haven't set up your Telebirr withdrawal account. Please add your payout method in your profile.`,
        type: "warning",
        link: "/profile",
      }),
    ]);

    // Notify admins if seller has no payout method
    if (tx.seller_id && !sellerHasPayoutMethod) {
      const { data: admins } = await adminSupabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");

      if (admins && admins.length > 0) {
        await Promise.all(
          admins.map((admin) =>
            adminSupabase.from("notifications").insert({
              user_id: admin.user_id,
              title: "Seller needs payout setup",
              body: `A course was sold but the seller hasn't set up their Telebirr account. Seller ID: ${tx.seller_id}, Earnings: ETB ${Number(tx.seller_amount ?? 0).toFixed(2)}.`,
              type: "warning",
              link: "/admin",
            })
          )
        );
      }
    }

    return jsonpOk(callback) ?? NextResponse.json({ ok: true });
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
      .select("id, status, commission_amount, buyer_commission_amount, amount, seller_id, seller_amount, buyer_id")
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
      await patchTransactionStatusById({
        supabaseUrl,
        supabaseServiceRoleKey,
        transactionId: tx.id,
        status: "completed",
      });

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

      const totalCommission = Number(tx.commission_amount ?? 0) + Number(tx.buyer_commission_amount ?? 0);
      if ((existingCommission ?? []).length === 0 && totalCommission > 0) {
        const rate = Number(tx.amount ?? 0) > 0
          ? +((totalCommission / Number(tx.amount)) * 100).toFixed(2)
          : 0;
        await adminSupabase.from("commissions").insert({
          transaction_id: tx.id,
          amount: totalCommission,
          rate,
        });
      }

      // Check if seller has payout method set up
      let sellerHasPayoutMethod = false;
      if (tx.seller_id) {
        const { data: sellerPayoutMethod } = await adminSupabase
          .from("user_payment_methods")
          .select("method, account_name, account_number")
          .eq("user_id", tx.seller_id)
          .eq("is_default", true)
          .maybeSingle();
        sellerHasPayoutMethod = !!(sellerPayoutMethod && sellerPayoutMethod.account_number);
      }

      // Send notifications
      await Promise.all([
        // Buyer notification
        adminSupabase.from("notifications").insert({
          user_id: tx.buyer_id,
          title: "Purchase completed",
          body: `Your purchase was successful. You paid ETB ${Number(tx.amount ?? 0).toFixed(2)}. You can now access your course.`,
          type: "success",
          link: "/my-learning",
        }),
        // Seller notification
        tx.seller_id && adminSupabase.from("notifications").insert({
          user_id: tx.seller_id,
          title: "Course sold",
          body: `You earned ETB ${Number(tx.seller_amount ?? 0).toFixed(2)} from a new sale. Earnings will be available for withdrawal in 3 days.`,
          type: "success",
          link: "/dashboard",
        }),
        // Seller warning: no payout method
        tx.seller_id && !sellerHasPayoutMethod && adminSupabase.from("notifications").insert({
          user_id: tx.seller_id,
          title: "Action required: Set up payout method",
          body: `You made a sale but haven't set up your Telebirr withdrawal account. Please add your payout method in your profile.`,
          type: "warning",
          link: "/profile",
        }),
      ]);

      // Notify admins if seller has no payout method
      if (tx.seller_id && !sellerHasPayoutMethod) {
        const { data: admins } = await adminSupabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin");

        if (admins && admins.length > 0) {
          await Promise.all(
            admins.map((admin) =>
              adminSupabase.from("notifications").insert({
                user_id: admin.user_id,
                title: "Seller needs payout setup",
                body: `A course was sold but the seller hasn't set up their Telebirr account. Seller ID: ${tx.seller_id}, Earnings: ETB ${Number(tx.seller_amount ?? 0).toFixed(2)}.`,
                type: "warning",
                link: "/admin",
              })
            )
          );
        }
      }

      return NextResponse.json({ ok: true });
    }

    await patchTransactionStatusById({
      supabaseUrl,
      supabaseServiceRoleKey,
      transactionId: tx.id,
      status: "failed",
    });
    return NextResponse.json({ ok: true });
  } catch {
    // Webhooks should be resilient and return 200 to avoid repeated retries.
    return NextResponse.json({ ok: true });
  }
}
