import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const getRequiredEnv = (key: string) => {
  const v = process.env[key];
  if (!v) throw new Error(`Missing environment variable: ${key}`);
  return v;
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { courseId, raterId, score, comment } = body as {
      courseId?: string;
      raterId?: string;
      score?: number;
      comment?: string;
    };

    if (!courseId || !raterId || !score) {
      return NextResponse.json(
        { error: "Missing courseId, raterId, or score" },
        { status: 400 }
      );
    }

    const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
    const supabaseServiceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

    const adminSupabase = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Fetch course details
    const { data: course } = await adminSupabase
      .from("courses")
      .select("id, title, user_id")
      .eq("id", courseId)
      .maybeSingle();

    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    // Don't notify if user rated their own course
    if (course.user_id === raterId) {
      return NextResponse.json({ success: true, skipped: true });
    }

    // Fetch rater profile
    const { data: rater } = await adminSupabase
      .from("profiles")
      .select("full_name, user_id")
      .eq("user_id", raterId)
      .maybeSingle();

    // Get rater email from auth
    const { data: raterAuth } = await adminSupabase.auth.admin.getUserById(raterId);
    const raterName = rater?.full_name ?? raterAuth?.user?.email?.split("@")[0] ?? "A student";

    // Fetch course owner details
    const { data: owner } = await adminSupabase
      .from("profiles")
      .select("full_name, user_id")
      .eq("user_id", course.user_id)
      .maybeSingle();

    const { data: ownerAuth } = await adminSupabase.auth.admin.getUserById(course.user_id);
    const ownerEmail = ownerAuth?.user?.email;
    const ownerName = owner?.full_name ?? ownerEmail?.split("@")[0] ?? "Instructor";

    // Create in-app notification for course owner
    const { error: notifErr } = await adminSupabase.from("notifications").insert({
      user_id: course.user_id,
      title: "New course rating",
      body: `${raterName} rated your course "${course.title}" ${score}/5 stars${comment ? `: "${comment.slice(0, 50)}${comment.length > 50 ? "..." : ""}"` : ""}`,
      type: "info",
      link: `/courses/${course.id}`,
    });

    if (notifErr) {
      console.error("[ratings/notify] Failed to insert notification:", notifErr);
    } else {
      console.log("[ratings/notify] Notification inserted for course owner:", course.user_id);
    }

    // Send email notification
    if (ownerEmail) {
      const { sendEmail } = await import("@/lib/email/resend");

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333;">New Course Rating!</h1>
          <p>Hi ${ownerName},</p>
          <p><strong>${raterName}</strong> just rated your course:</p>
          <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h3 style="margin: 0 0 10px 0;">${course.title}</h3>
            <p style="font-size: 24px; margin: 10px 0;">${"★".repeat(score)}${"☆".repeat(5 - score)} <span style="font-size: 18px;">${score}/5 stars</span></p>
            ${comment ? `<p style="margin: 10px 0; font-style: italic;">"${comment}"</p>` : ""}
          </div>
          <p>Keep up the great work! Student feedback helps improve your course.</p>
          <a href="${process.env.NEXT_PUBLIC_SITE_URL}/courses/${course.id}" 
             style="display: inline-block; background: #0070f3; color: white; padding: 12px 24px; 
                    text-decoration: none; border-radius: 5px; margin: 20px 0;">
            View Your Course
          </a>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
          <p style="color: #999; font-size: 12px;">
            This is an automated email from LearnXchange. Please do not reply.
          </p>
        </div>
      `;

      const text = `
New Course Rating!

Hi ${ownerName},

${raterName} just rated your course:

${course.title}

Rating: ${"★".repeat(score)}${"☆".repeat(5 - score)} ${score}/5 stars
${comment ? `Comment: "${comment}"` : ""}

Keep up the great work! Student feedback helps improve your course.

View your course: ${process.env.NEXT_PUBLIC_SITE_URL}/courses/${course.id}

---
This is an automated email from LearnXchange. Please do not reply.
      `;

      await sendEmail({
        to: ownerEmail,
        subject: `New Rating - ${course.title}`,
        html,
        text,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[ratings/notify] Error:", err?.message || err);
    return NextResponse.json(
      { error: err?.message || "Failed to send notification" },
      { status: 500 }
    );
  }
}
