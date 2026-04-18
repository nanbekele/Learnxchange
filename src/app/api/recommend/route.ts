import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { avgEmbeddings, generateEmbedding384, toPgVector } from "@/lib/embeddings";

export const runtime = "nodejs";

const getRequiredEnv = (key: string) => {
  const v = process.env[key];
  if (!v) throw new Error(`Missing environment variable: ${key}`);
  return v;
};

const parsePgVector = (v: unknown): number[] | null => {
  if (Array.isArray(v)) {
    const out = v.map((x: any) => Number(x)).filter((n) => Number.isFinite(n));
    return out.length ? out : null;
  }
  if (typeof v === "string") {
    const trimmed = v.trim();
    const raw = trimmed.startsWith("[") && trimmed.endsWith("]") ? trimmed.slice(1, -1) : trimmed;
    if (!raw) return null;
    const out = raw
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n));
    return out.length ? out : null;
  }
  return null;
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

const fetchPopularDirect = async (
  adminSupabase: ReturnType<typeof createClient<Database>>,
  matchCount: number,
  excludeCourseIds: string[],
) => {
  let q = adminSupabase
    .from("courses")
    .select("id, title, price, thumbnail_url, category, availability")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(Math.max(matchCount, 1));

  if (excludeCourseIds.length > 0) {
    q = q.not("id", "in", `(${excludeCourseIds.join(",")})`);
  }

  const { data } = await q;
  return data ?? [];
};

export async function POST(req: Request) {
  try {
    const { user_id } = (await req.json()) as { user_id?: string };
    if (!user_id) {
      return NextResponse.json({ error: "Missing user_id" }, { status: 400 });
    }

    const debugEnabled = req.headers.get("x-recommend-debug") === "1";

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

    let authUserId: string | null = null;
    try {
      const { data, error } = await authSupabase.auth.getUser(token);
      if (!error && data?.user?.id) authUserId = data.user.id;
    } catch {
      authUserId = null;
    }

    if (!authUserId) {
      const decoded = decodeJwtPayload(token);
      const sub = String(decoded?.sub ?? "");
      if (sub) authUserId = sub;
    }

    if (!authUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (String(authUserId) !== String(user_id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const adminSupabase = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: purchasedRows } = await adminSupabase
      .from("transactions")
      .select("course_id")
      .eq("buyer_id", user_id)
      .eq("status", "completed");

    const purchasedCourseIds = Array.from(
      new Set((purchasedRows ?? []).map((r: any) => String(r.course_id)).filter(Boolean)),
    );

    const vectors: number[][] = [];
    if (purchasedCourseIds.length > 0) {
      const { data: purchasedCourses } = await adminSupabase
        .from("courses")
        .select("id, embedding")
        .in("id", purchasedCourseIds);

      for (const c of purchasedCourses ?? []) {
        const emb = parsePgVector((c as any)?.embedding);
        if (emb) vectors.push(emb);
      }
    }

    const { data: searchEvents } = await adminSupabase
      .from("user_search_events" as any)
      .select("query, category, availability, created_at")
      .eq("user_id", user_id)
      .order("created_at", { ascending: false })
      .limit(5);

    const interestText = (searchEvents ?? [])
      .map((e: any) => {
        const q = String(e?.query ?? "").trim();
        const c = String(e?.category ?? "").trim();
        const a = String(e?.availability ?? "").trim();
        const parts = [q ? `Search: ${q}` : "", c && c !== "all" ? `Category: ${c}` : "", a && a !== "all" ? `Availability: ${a}` : ""]
          .filter(Boolean)
          .join(". ");
        return parts;
      })
      .filter(Boolean)
      .join("\n");

    if (interestText) {
      try {
        const interestEmbedding = await generateEmbedding384(interestText);
        vectors.push(interestEmbedding);
      } catch {
        // ignore
      }
    }

    const userEmbedding = avgEmbeddings(vectors);
    if (!userEmbedding) {
      const { data: popular, error: popularErr } = await adminSupabase.rpc("popular_courses" as any, {
        match_count: 5,
        exclude_course_ids: purchasedCourseIds,
      });

      if (!popularErr && Array.isArray(popular) && popular.length > 0) {
        return NextResponse.json({
          courses: popular,
          ...(debugEnabled
            ? {
                debug: {
                  strategy: "popular_courses_rpc",
                  purchasedCourseIdsCount: purchasedCourseIds.length,
                  searchEventsCount: (searchEvents ?? []).length,
                  interestText,
                  vectorsCount: vectors.length,
                },
              }
            : {}),
        });
      }

      const direct = await fetchPopularDirect(adminSupabase, 5, purchasedCourseIds);
      return NextResponse.json({
        courses: direct,
        ...(debugEnabled
          ? {
              debug: {
                strategy: "direct_courses_query_fallback",
                purchasedCourseIdsCount: purchasedCourseIds.length,
                searchEventsCount: (searchEvents ?? []).length,
                interestText,
                vectorsCount: vectors.length,
              },
            }
          : {}),
      });
    }

    const { data: recs, error: recErr } = await adminSupabase.rpc("recommend_courses" as any, {
      query_embedding: toPgVector(userEmbedding),
      match_count: 5,
      exclude_course_ids: purchasedCourseIds,
    });

    if (!recErr && Array.isArray(recs) && recs.length > 0) {
      return NextResponse.json({
        courses: recs,
        ...(debugEnabled
          ? {
              debug: {
                strategy: "recommend_courses_rpc",
                purchasedCourseIdsCount: purchasedCourseIds.length,
                searchEventsCount: (searchEvents ?? []).length,
                interestText,
                vectorsCount: vectors.length,
              },
            }
          : {}),
      });
    }

    {
      const { data: popular, error: popularErr } = await adminSupabase.rpc("popular_courses" as any, {
        match_count: 5,
        exclude_course_ids: purchasedCourseIds,
      });

      if (!popularErr && Array.isArray(popular) && popular.length > 0) {
        return NextResponse.json({
          courses: popular,
          ...(debugEnabled
            ? {
                debug: {
                  strategy: "popular_courses_rpc_after_recommend_empty",
                  purchasedCourseIdsCount: purchasedCourseIds.length,
                  searchEventsCount: (searchEvents ?? []).length,
                  interestText,
                  vectorsCount: vectors.length,
                },
              }
            : {}),
        });
      }

      const direct = await fetchPopularDirect(adminSupabase, 5, purchasedCourseIds);
      return NextResponse.json({
        courses: direct,
        ...(debugEnabled
          ? {
              debug: {
                strategy: "direct_courses_query_fallback_after_recommend",
                purchasedCourseIdsCount: purchasedCourseIds.length,
                searchEventsCount: (searchEvents ?? []).length,
                interestText,
                vectorsCount: vectors.length,
              },
            }
          : {}),
      });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}
