import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { sendEmail, FROM_EMAIL } from "@/lib/email/resend";

// Debug: log on module load
console.log("[contact-reply] Module loaded. FROM_EMAIL:", FROM_EMAIL);

// Admin email fallback - must match the hardcoded email in has_role function
const PLATFORM_OWNER_EMAIL = process.env.PLATFORM_OWNER_EMAIL || "nanbekele3@gmail.com";

const getRequiredEnv = (key: string) => {
  const v = process.env[key];
  if (!v) throw new Error(`Missing environment variable: ${key}`);
  return v;
};

const fetchWithLongerTimeout: typeof fetch = async (input, init) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const isSupabaseNetworkError = (err: any) => {
  const code = String(err?.code ?? "");
  const msg = String(err?.message ?? "");
  const name = String(err?.name ?? "");
  return (
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    code === "ENOTFOUND" ||
    code === "ECONNREFUSED" ||
    name === "AuthRetryableFetchError" ||
    msg.toLowerCase().includes("fetch failed") ||
    msg.toLowerCase().includes("connect timeout")
  );
};

async function getUserWithRetry(authSupabase: ReturnType<typeof createClient<Database>>, token: string) {
  const maxAttempts = 3;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await authSupabase.auth.getUser(token);
      return res;
    } catch (err: any) {
      if (i === maxAttempts - 1) throw err;
      if (!isSupabaseNetworkError(err)) throw err;
      await sleep(750 * (i + 1));
    }
  }
  return { data: { user: null }, error: { message: "Failed to verify user" } } as any;
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";

    if (!token) {
      return NextResponse.json({ error: "Unauthorized - no token" }, { status: 401 });
    }

    console.log("[contact-reply] auth header present:", !!authHeader, "token length:", token.length);

    let body: { messageId?: string; replyText?: string };
    try {
      body = (await req.json()) as { messageId?: string; replyText?: string };
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const messageId = String(body.messageId ?? "").trim();
    const replyText = String(body.replyText ?? "").trim();

    if (!messageId || !replyText) {
      return NextResponse.json({ error: "Missing messageId or replyText" }, { status: 400 });
    }

    const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
    const supabaseAnonKey = getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

    const authSupabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fetchWithLongerTimeout },
    });

    let userRes: any;
    let userErr: any;
    try {
      const r = await getUserWithRetry(authSupabase, token);
      userRes = r.data;
      userErr = r.error;
    } catch (err: any) {
      console.error("[contact-reply] auth.getUser exception:", err?.message ?? err);
      if (isSupabaseNetworkError(err)) {
        return NextResponse.json(
          { error: "Supabase is unreachable. Please try again.", details: err?.message ?? String(err) },
          { status: 503 },
        );
      }
      return NextResponse.json(
        { error: "Failed to validate session", details: err?.message ?? String(err) },
        { status: 500 },
      );
    }

    if (userErr || !userRes?.user) {
      console.error("[contact-reply] auth.getUser failed:", {
        message: userErr?.message,
        status: userErr?.status,
        name: userErr?.name,
      });

      // Supabase can fail to validate sessions due to transient network issues.
      // Return 503 so the UI can retry and we don't confuse it with an auth problem.
      if (isSupabaseNetworkError(userErr)) {
        return NextResponse.json(
          {
            error: "Supabase is unreachable. Please try again.",
            details: userErr?.message ?? "fetch failed",
          },
          { status: 503 },
        );
      }

      return NextResponse.json(
        {
          error: "Unauthorized - invalid token",
          details: userErr?.message ?? "Unknown auth error",
        },
        { status: 401 },
      );
    }

    const adminSupabase = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fetchWithLongerTimeout },
    });

    // Check email first (faster, no DB call) to avoid has_role timeout issues
    const userEmail = userRes.user.email?.toLowerCase().trim();
    const isAdminByEmail = userEmail === PLATFORM_OWNER_EMAIL.toLowerCase().trim();

    let isAdmin = false;
    let roleErr: any = null;

    // Only call has_role if email doesn't match (to avoid unnecessary DB timeout)
    if (!isAdminByEmail) {
      const roleResult = await adminSupabase.rpc("has_role", {
        _user_id: userRes.user.id,
        _role: "admin",
      });
      isAdmin = !!roleResult.data;
      roleErr = roleResult.error;

      if (roleErr) {
        console.error("[contact-reply] has_role error:", roleErr);
      }
    }

    if (!isAdmin && !isAdminByEmail) {
      return NextResponse.json({ error: "Forbidden - not admin" }, { status: 403 });
    }

    const { data: messageRow, error: msgErr } = await adminSupabase
      .from("contact_messages")
      .select("id, email, name, subject")
      .eq("id", messageId)
      .single();

    if (msgErr || !messageRow) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const safeSubject = String(messageRow.subject || "Contact message");
    const to = String(messageRow.email || "").trim();
    if (!to) {
      return NextResponse.json({ error: "User email is missing" }, { status: 400 });
    }

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
        <h2 style="margin: 0 0 12px 0;">Reply from LearnXchange Support</h2>
        <p style="margin: 0 0 16px 0; color: #333;">Hi ${String(messageRow.name || "there")},</p>
        <p style="margin: 0 0 8px 0; color: #666;">Regarding: <strong>${safeSubject}</strong></p>
        <div style="background: #f5f5f5; padding: 14px; border-radius: 8px; white-space: pre-wrap; color: #111;">${replyText.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
        <p style="margin: 16px 0 0 0; color: #999; font-size: 12px;">This email was sent from LearnXchange. Please do not share sensitive information.</p>
      </div>
    `;

    const text = `Reply from LearnXchange Support\n\nHi ${String(messageRow.name || "there")},\n\nRegarding: ${safeSubject}\n\n${replyText}\n`;

    try {
      await sendEmail({
        to,
        subject: `Re: ${safeSubject}`,
        html,
        text,
      });
    } catch (err: any) {
      const msg = String(err?.message ?? "Failed to send email");
      console.error("[contact-reply] Email send error:", msg);
      return NextResponse.json(
        {
          error: "Failed to send email",
          details: msg,
        },
        { status: 502 },
      );
    }

    const now = new Date().toISOString();
    const { error: updErr } = await adminSupabase
      .from("contact_messages")
      .update({
        admin_reply: replyText,
        status: "replied",
        replied_at: now,
        replied_by: userRes.user.id,
      })
      .eq("id", messageId);

    if (updErr) {
      console.error("[contact-reply] Failed to save reply after sending email:", updErr);
      return NextResponse.json({ error: updErr.message ?? "Failed to save reply" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: 500 });
  }
}
