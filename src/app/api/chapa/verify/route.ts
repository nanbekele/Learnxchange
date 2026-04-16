import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { sendPurchaseConfirmationEmail, sendSaleNotificationEmail } from "@/lib/email/templates";

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

    if (tx.seller_id && Number(tx.seller_amount ?? 0) > 0) {
      step = "upsert_seller_earnings";
      await adminSupabase.from("seller_earnings").upsert(
        {
          seller_id: tx.seller_id,
          transaction_id: transactionId,
          amount: Number(tx.seller_amount),
          status: "pending",
          available_at: addDaysIso(3),
        },
        { onConflict: "transaction_id" },
      );
    }

    const totalCommission = Number(tx.commission_amount ?? 0) + Number(tx.buyer_commission_amount ?? 0);
    if (totalCommission > 0) {
      step = "insert_commission";
      const { data: existingCommission } = await adminSupabase
        .from("commissions")
        .select("id")
        .eq("transaction_id", transactionId)
        .limit(1);
      if ((existingCommission ?? []).length === 0) {
        const rate = Number(tx.amount ?? 0) > 0
          ? +((totalCommission / Number(tx.amount)) * 100).toFixed(2)
          : 0;
        await adminSupabase.from("commissions").insert({
          transaction_id: transactionId,
          amount: totalCommission,
          rate,
        });
      }
    }

    // Check if seller has payout method set up
    step = "check_seller_payout_method";
    let sellerHasPayoutMethod = false;
    let sellerPaymentMethod: { method: string; account_name: string; account_number: string } | null = null;
    if (tx.seller_id) {
      const { data: sellerPayoutMethod } = await adminSupabase
        .from("user_payment_methods")
        .select("method, account_name, account_number")
        .eq("user_id", tx.seller_id)
        .eq("is_default", true)
        .maybeSingle();
      sellerHasPayoutMethod = !!(sellerPayoutMethod && sellerPayoutMethod.account_number);
      sellerPaymentMethod = sellerPayoutMethod;
    }

    // Send notifications to buyer and seller
    step = "insert_notifications";
    await Promise.all([
      // Buyer notification
      adminSupabase.from("notifications").insert({
        user_id: tx.buyer_id,
        title: "Purchase completed",
        body: `Your purchase was successful. You paid ETB ${Number(tx.amount ?? 0).toFixed(2)} (includes ETB ${Number(tx.buyer_commission_amount ?? 0).toFixed(2)} platform fee). You can now access your course.`,
        type: "success",
        link: "/my-learning",
      }),
      // Seller notification
      tx.seller_id && adminSupabase.from("notifications").insert({
        user_id: tx.seller_id,
        title: "Course sold",
        body: `You earned ETB ${Number(tx.seller_amount ?? 0).toFixed(2)} from a new sale (ETB ${Number(tx.commission_amount ?? 0).toFixed(2)} platform fee deducted). Earnings will be available for withdrawal in 3 days.`,
        type: "success",
        link: "/dashboard",
      }),
      // Seller notification: payout method not set up
      tx.seller_id && !sellerHasPayoutMethod && adminSupabase.from("notifications").insert({
        user_id: tx.seller_id,
        title: "Action required: Set up payout method",
        body: `You made a sale but haven't set up your Telebirr withdrawal account. Please add your payout method in your profile to receive ETB ${Number(tx.seller_amount ?? 0).toFixed(2)}.`,
        type: "warning",
        link: "/profile",
      }),
    ]);

    // Notify admins if seller has no payout method
    if (tx.seller_id && !sellerHasPayoutMethod) {
      step = "notify_admins_no_payout";
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

    // Send email notifications
    step = "send_emails";
    try {
      // Fetch course details
      const { data: course } = await adminSupabase
        .from("courses")
        .select("id, title")
        .eq("id", tx.course_id ?? "")
        .maybeSingle();

      // Fetch buyer details
      const { data: buyer } = await adminSupabase
        .from("profiles")
        .select("full_name, user_id")
        .eq("user_id", tx.buyer_id ?? "")
        .maybeSingle();

      // Fetch seller details
      const { data: seller } = await adminSupabase
        .from("profiles")
        .select("full_name, user_id")
        .eq("user_id", tx.seller_id ?? "")
        .maybeSingle();

      // Get buyer email from auth
      const { data: buyerAuth } = await adminSupabase.auth.admin.getUserById(tx.buyer_id ?? "");
      const buyerEmail = buyerAuth?.user?.email;

      // Get seller email from auth
      const { data: sellerAuth } = await adminSupabase.auth.admin.getUserById(tx.seller_id ?? "");
      const sellerEmail = sellerAuth?.user?.email;

      const courseTitle = course?.title ?? "Course";
      const buyerName = buyer?.full_name ?? buyerEmail?.split("@")[0] ?? "Student";
      const sellerName = seller?.full_name ?? sellerEmail?.split("@")[0] ?? "Instructor";

      // Send purchase confirmation to buyer
      if (buyerEmail && course) {
        await sendPurchaseConfirmationEmail({
          to: buyerEmail,
          buyerName,
          courseName: courseTitle,
          courseId: course.id,
          amount: Number(tx.amount ?? 0),
        });
      }

      // Send sale notification to seller
      if (sellerEmail && tx.seller_id) {
        await sendSaleNotificationEmail({
          to: sellerEmail,
          sellerName,
          courseName: courseTitle,
          buyerName,
          amount: Number(tx.amount ?? 0),
          commission: Number(tx.commission_amount ?? 0),
          netAmount: Number(tx.seller_amount ?? 0),
        });
      }

      // Send payout setup reminder to seller if no method set up
      if (sellerEmail && tx.seller_id && !sellerHasPayoutMethod) {
        const { sendEmail } = await import("@/lib/email/resend");
        await sendEmail({
          to: sellerEmail,
          subject: "Action Required: Set Up Your Telebirr Withdrawal Account",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h1 style="color: #333;">Set Up Your Payout Method</h1>
              <p>Hi ${sellerName},</p>
              <p>Congratulations! You made a sale:</p>
              <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>Course:</strong> ${courseTitle}</p>
                <p style="margin: 5px 0;"><strong>Earnings:</strong> ETB ${Number(tx.seller_amount ?? 0).toFixed(2)}</p>
              </div>
              <p style="color: #d97706; background: #fef3c7; padding: 12px; border-radius: 5px;">
                <strong>Important:</strong> You haven't set up your Telebirr withdrawal account yet. 
                Please add your payout method in your profile to receive your earnings.
              </p>
              <a href="${process.env.NEXT_PUBLIC_SITE_URL}/profile" 
                 style="display: inline-block; background: #0070f3; color: white; padding: 12px 24px; 
                        text-decoration: none; border-radius: 5px; margin: 20px 0;">
                Set Up Payout Method
              </a>
              <p style="color: #666; font-size: 14px; margin-top: 20px;">
                Your earnings will be available for withdrawal in 3 days. Once you set up your Telebirr account, you can request a payout from your dashboard.
              </p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
              <p style="color: #999; font-size: 12px;">
                This is an automated email from LearnXchange. Please do not reply.
              </p>
            </div>
          `,
          text: `Set Up Your Payout Method\n\nHi ${sellerName},\n\nCongratulations! You made a sale:\n\nCourse: ${courseTitle}\nEarnings: ETB ${Number(tx.seller_amount ?? 0).toFixed(2)}\n\nIMPORTANT: You haven't set up your Telebirr withdrawal account yet. Please add your payout method in your profile to receive your earnings.\n\nSet Up Payout Method: ${process.env.NEXT_PUBLIC_SITE_URL}/profile\n\nYour earnings will be available for withdrawal in 3 days. Once you set up your Telebirr account, you can request a payout from your dashboard.\n\n---\nThis is an automated email from LearnXchange.`,
        });
      }
    } catch (emailErr: any) {
      // Log but don't fail the transaction if email fails
      console.error("[verify] Email sending failed:", emailErr?.message || emailErr);
    }

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
