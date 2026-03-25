import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

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

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
    const supabaseServiceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

    const adminSupabase = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fetchWithLongerTimeout },
    });

    const { data: userRes, error: userErr } = await adminSupabase.auth.getUser(token);
    if (userErr || !userRes?.user) {
      return NextResponse.json(
        { error: "Unauthorized", details: userErr?.message ?? "Invalid or expired token" },
        { status: 401 }
      );
    }

    const { data: isAdmin, error: roleErr } = await adminSupabase.rpc("has_role", {
      _user_id: userRes.user.id,
      _role: "admin",
    });

    if (roleErr) {
      const msg = roleErr.message ?? "Role check failed";
      const missingRbac =
        msg.toLowerCase().includes("user_roles") ||
        msg.toLowerCase().includes("has_role") ||
        msg.toLowerCase().includes("does not exist") ||
        msg.toLowerCase().includes("42p01");

      if (missingRbac) {
        return NextResponse.json(
          {
            error: "RBAC tables/functions are missing in this Supabase project",
            details: msg,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({ error: msg }, { status: 500 });
    }

    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json()) as { email?: string; password?: string; fullName?: string };
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const fullName = String(body.fullName ?? "Admin").trim() || "Admin";

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    const { data: created, error: createErr } = await adminSupabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (createErr || !created.user) {
      return NextResponse.json({ error: createErr?.message ?? "Failed to create user" }, { status: 500 });
    }

    const { error: upsertErr } = await adminSupabase
      .from("user_roles")
      .upsert({ user_id: created.user.id, role: "admin" }, { onConflict: "user_id,role" });

    if (upsertErr) {
      const msg = upsertErr.message ?? "Failed to assign admin role";
      const missing = msg.toLowerCase().includes("user_roles") || msg.toLowerCase().includes("does not exist");
      if (missing) {
        return NextResponse.json(
          {
            error: "RBAC table user_roles is missing in this Supabase project",
            details: msg,
          },
          { status: 500 }
        );
      }
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    return NextResponse.json({ ok: true, userId: created.user.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: 500 });
  }
}
