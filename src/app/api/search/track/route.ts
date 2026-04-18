import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const runtime = "nodejs";

const getRequiredEnv = (key: string) => {
  const v = process.env[key];
  if (!v) throw new Error(`Missing environment variable: ${key}`);
  return v;
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
    const { query, category, availability } = (await req.json()) as {
      query?: string;
      category?: string;
      availability?: string;
    };

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
    const supabaseAnonKey = getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

    const authSupabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let userId: string | null = null;
    try {
      const { data, error } = await authSupabase.auth.getUser(token);
      if (!error && data?.user?.id) userId = data.user.id;
    } catch {
      userId = null;
    }

    if (!userId) {
      const decoded = decodeJwtPayload(token);
      const sub = String(decoded?.sub ?? "");
      if (sub) userId = sub;
    }

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const q = String(query ?? "").trim();
    const c = String(category ?? "").trim();
    const a = String(availability ?? "").trim();

    if (!q && (!c || c === "all") && (!a || a === "all")) {
      return NextResponse.json({ success: true });
    }

    const userSupabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    await userSupabase.from("user_search_events" as any).insert({
      user_id: userId,
      query: q || null,
      category: c || null,
      availability: a || null,
    } as any);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}
