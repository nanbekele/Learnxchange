import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { buildCourseEmbeddingText, generateEmbedding384, toPgVector } from "@/lib/embeddings";

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
    const { courseId } = (await req.json()) as { courseId?: string };
    if (!courseId) {
      return NextResponse.json({ error: "Missing courseId" }, { status: 400 });
    }

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
    const supabaseAnonKey = getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

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

    const adminSupabase = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: course, error: courseErr } = await adminSupabase
      .from("courses")
      .select("id, user_id, title, description")
      .eq("id", courseId)
      .maybeSingle();

    if (courseErr) {
      return NextResponse.json({ error: courseErr.message }, { status: 500 });
    }

    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    if (String(course.user_id) !== String(userId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const text = buildCourseEmbeddingText({
      title: course.title,
      description: course.description,
      tags: null,
    });

    const embedding = await generateEmbedding384(text);

    const { error: updateErr } = await adminSupabase
      .from("courses")
      .update(({ embedding: toPgVector(embedding) } as unknown) as any)
      .eq("id", course.id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: err?.message ?? "Server error",
        hint:
          "If you just added embeddings: run `npm install` (to install @xenova/transformers) and run the Supabase migration that adds courses.embedding + pgvector.",
      },
      { status: 500 },
    );
  }
}
