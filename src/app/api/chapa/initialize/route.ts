import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import dns from "node:dns";

// Helps on some Windows / ISP networks where IPv6/DNS causes undici(fetch) to fail
dns.setDefaultResultOrder("ipv4first");

const getRequiredEnv = (key: string) => {
  const v = process.env[key];
  if (!v) throw new Error(`Missing environment variable: ${key}`);
  return v;
};

const sanitizeChapaText = (value: string) => {
  // Chapa validation: only letters, numbers, hyphens, underscores, spaces, and dots.
  return value
    .replace(/[^a-zA-Z0-9._\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const getBaseUrlFromRequest = (req: Request) => {
  const envUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  const forwardedProto = (req.headers.get("x-forwarded-proto") ?? "").split(",")[0].trim();
  const forwardedHost = (req.headers.get("x-forwarded-host") ?? "").split(",")[0].trim();
  const host = (req.headers.get("host") ?? "").trim();
  const proto = forwardedProto || "http";
  const finalHost = forwardedHost || host;

  if (finalHost) return `${proto}://${finalHost}`.replace(/\/$/, "");
  if (envUrl) return envUrl.replace(/\/$/, "");
  return "http://localhost:3000";
};

const decodeJwtPayload = (jwt: string) => {
  try {
    const parts = jwt.split(".");
    if (parts.length < 2) return null;
    const payload = parts[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    const json = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json) as Record<string, any>;
  } catch {
    return null;
  }
};

export async function POST(req: Request) {
  try {
    const { courseId, returnPath } = (await req.json()) as { courseId?: string; returnPath?: string };
    if (!courseId) {
      return NextResponse.json({ error: "Missing courseId" }, { status: 400 });
    }

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) {
      return NextResponse.json({ error: "Unauthorized: missing access token" }, { status: 401 });
    }

    const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
    const supabaseAnonKey = getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const chapaSecretKey = getRequiredEnv("CHAPA_SECRET_KEY");

    const authSupabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let user: { id: string; email?: string | null; user_metadata?: any } | null = null;
    try {
      const { data: userRes, error: userErr } = await authSupabase.auth.getUser(token);
      if (!userErr && userRes?.user) {
        user = userRes.user as any;
      }
    } catch {
      user = null;
    }

    if (!user) {
      const decoded = decodeJwtPayload(token);
      const sub = String(decoded?.sub ?? "");
      const emailClaim = String(decoded?.email ?? decoded?.user_email ?? "");
      if (!sub) {
        return NextResponse.json({ error: "Unauthorized: invalid or expired access token" }, { status: 401 });
      }
      user = { id: sub, email: emailClaim || null, user_metadata: decoded?.user_metadata ?? decoded ?? {} };
    }
    const email = (user.email ?? "").trim();
    if (!email) {
      return NextResponse.json({ error: "User email is missing" }, { status: 400 });
    }

    const adminSupabase = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: course, error: courseErr } = await adminSupabase
      .from("courses")
      .select("id, title, price, user_id, status")
      .eq("id", courseId)
      .single();

    console.log("Course lookup:", { courseId, found: !!course, error: courseErr?.message });

    if (courseErr) {
      const msg = String(courseErr.message ?? "");
      // If the service role is missing GRANTs, Supabase will return permission errors.
      // Those should be treated as server misconfiguration (500), not a 404.
      if (msg.toLowerCase().includes("permission denied") || msg.toLowerCase().includes("schema")) {
        console.error("Course lookup permission/config error:", courseErr);
        return NextResponse.json(
          {
            error: "Server is missing database privileges to read courses",
            debug: msg,
          },
          { status: 500 },
        );
      }

      // If .single() errors because there are no rows, treat as true 404.
      console.error("Course lookup error:", courseErr);
      return NextResponse.json({ error: "Course not found", debug: msg }, { status: 404 });
    }

    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    if (course.status !== "active") {
      return NextResponse.json({ error: "Course is not available" }, { status: 400 });
    }

    if (course.user_id === user.id) {
      return NextResponse.json({ error: "You can't buy your own course" }, { status: 400 });
    }

    const { data: rateRow } = await adminSupabase
      .from("platform_settings")
      .select("value")
      .eq("key", "commission_rate")
      .single();

    const rate = rateRow?.value ? Number.parseFloat(rateRow.value) : 2;
    const coursePrice = Number(course.price ?? 0);
    if (!Number.isFinite(coursePrice) || coursePrice <= 0) {
      return NextResponse.json({ error: "Invalid course price" }, { status: 400 });
    }

    // Commission from both buyer and seller
    const sellerCommission = +(coursePrice * (rate / 100)).toFixed(2);
    const buyerCommission = +(coursePrice * (rate / 100)).toFixed(2);
    const totalCommission = +(sellerCommission + buyerCommission).toFixed(2);
    
    // Buyer pays course price + their commission
    const totalAmount = +(coursePrice + buyerCommission).toFixed(2);
    // Seller receives course price minus their commission
    const sellerAmount = +(coursePrice - sellerCommission).toFixed(2);

    const txRef = `learnxchange_${Date.now()}_${course.id.slice(0, 8)}`;

    const { data: txData, error: txErr } = await adminSupabase
      .from("transactions")
      .insert({
        course_id: course.id,
        buyer_id: user.id,
        seller_id: course.user_id,
        amount: totalAmount,
        commission_amount: sellerCommission,
        buyer_commission_amount: buyerCommission,
        seller_amount: sellerAmount,
        status: "pending",
      })
      .select("id")
      .single();

    if (txErr || !txData) {
      return NextResponse.json({ error: txErr?.message ?? "Failed to create transaction" }, { status: 500 });
    }

    const siteUrl = getBaseUrlFromRequest(req);
    const callbackUrl = `${siteUrl}/api/chapa/webhook`;
    // User redirect after payment. This page verifies via /api/chapa/verify and shows a success/failure UI.
    const returnUrl = `${siteUrl}/payment-success?tx_ref=${encodeURIComponent(txRef)}&transaction_id=${encodeURIComponent(txData.id)}`;

    const customizationTitle = sanitizeChapaText("LearnXchange") || "LearnXchange";
    const customizationDescription =
      sanitizeChapaText(`Purchase ${course.title}`) || sanitizeChapaText(course.title) || "Course purchase";

    const { data: prof } = await adminSupabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", user.id)
      .maybeSingle();
    const rawName = String(prof?.full_name ?? user.user_metadata?.full_name ?? "").trim();
    const derivedName = rawName || email.split("@")[0] || "Buyer";
    const nameParts = derivedName.split(/\s+/).filter(Boolean);
    const firstName = sanitizeChapaText(nameParts[0] ?? "Buyer") || "Buyer";
    const lastName = sanitizeChapaText(nameParts.slice(1).join(" ") || "User") || "User";

    await adminSupabase.from("transactions").update({ tx_ref: txRef }).eq("id", txData.id);

    let chapaRes: Response;
    try {
      chapaRes = await fetch("https://api.chapa.co/v1/transaction/initialize", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${chapaSecretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: totalAmount,
          currency: "ETB",
          email,
          first_name: firstName,
          last_name: lastName,
          tx_ref: txRef,
          callback_url: callbackUrl,
          return_url: returnUrl,
          customization: {
            title: customizationTitle,
            description: customizationDescription,
          },
        }),
        // Avoid hanging requests; surface a clear error instead.
        signal: AbortSignal.timeout(45000),
      });
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      console.error("Chapa initialize network error:", e);

      await adminSupabase.from("transactions").update({ status: "cancelled" }).eq("id", txData.id);

      return NextResponse.json(
        {
          error:
            msg.includes("timeout") || msg.includes("UND_ERR_CONNECT_TIMEOUT")
              ? "Could not reach Chapa (network timeout). Check your internet/firewall and try again."
              : `Could not reach Chapa: ${msg}`,
        },
        { status: 502 },
      );
    }

    const chapaJson = await chapaRes.json().catch(() => null);
    if (!chapaRes.ok) {
      console.error("Chapa initialize failed:", chapaRes.status, chapaJson);
      const errMsg =
        typeof chapaJson?.message === "string"
          ? chapaJson.message
          : chapaJson
            ? JSON.stringify(chapaJson)
            : "Chapa initialization failed";

      await adminSupabase.from("transactions").update({ status: "cancelled" }).eq("id", txData.id);

      return NextResponse.json({ error: errMsg }, { status: 502 });
    }

    const checkoutUrl = chapaJson?.data?.checkout_url as string | undefined;
    if (!checkoutUrl) {
      return NextResponse.json({ error: "Missing checkout_url from Chapa" }, { status: 502 });
    }

    return NextResponse.json({ checkoutUrl, txRef, transactionId: txData.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: 500 });
  }
}
