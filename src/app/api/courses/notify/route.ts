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
    const { courseId, userId } = body as { courseId?: string; userId?: string };

    if (!courseId || !userId) {
      return NextResponse.json(
        { error: "Missing courseId or userId" },
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
      .select("id, title")
      .eq("id", courseId)
      .maybeSingle();

    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    // Fetch user profile
    const { data: user } = await adminSupabase
      .from("profiles")
      .select("full_name, user_id")
      .eq("user_id", userId)
      .maybeSingle();

    // Get user email from auth
    const { data: userAuth } = await adminSupabase.auth.admin.getUserById(userId);
    const userEmail = userAuth?.user?.email;

    const userName = user?.full_name ?? userEmail?.split("@")[0] ?? "Instructor";

    // Create in-app notification
    const { error: notifErr } = await adminSupabase.from("notifications").insert({
      user_id: userId,
      title: "Course created",
      body: `Your course "${course.title}" has been created successfully and is now live.`,
      type: "success",
      link: `/courses/${course.id}`,
    });

    if (notifErr) {
      console.error("[courses/notify] Failed to insert notification:", notifErr);
    } else {
      console.log("[courses/notify] Notification inserted successfully for user:", userId);
    }

    // Send email notification
    if (userEmail) {
      const { sendEmail, FROM_EMAIL } = await import("@/lib/email/resend");
      
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333;">Course Created Successfully!</h1>
          <p>Hi ${userName},</p>
          <p>Congratulations! Your course has been created and published:</p>
          <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h3 style="margin: 0 0 10px 0;">${course.title}</h3>
          </div>
          <p>Your course is now visible to students and available for purchase or exchange.</p>
          <a href="${process.env.NEXT_PUBLIC_SITE_URL}/courses/${course.id}" 
             style="display: inline-block; background: #0070f3; color: white; padding: 12px 24px; 
                    text-decoration: none; border-radius: 5px; margin: 20px 0;">
            View Your Course
          </a>
          <p style="color: #666; font-size: 14px;">
            You can manage your course from your dashboard.
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
          <p style="color: #999; font-size: 12px;">
            This is an automated email from LearnXchange. Please do not reply.
          </p>
        </div>
      `;

      const text = `
Course Created Successfully!

Hi ${userName},

Congratulations! Your course has been created and published:

${course.title}

Your course is now visible to students and available for purchase or exchange.

View your course: ${process.env.NEXT_PUBLIC_SITE_URL}/courses/${course.id}

You can manage your course from your dashboard.

---
This is an automated email from LearnXchange. Please do not reply.
      `;

      await sendEmail({
        to: userEmail,
        subject: `Course Created - ${course.title}`,
        html,
        text,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[courses/notify] Error:", err?.message || err);
    return NextResponse.json(
      { error: err?.message || "Failed to send notification" },
      { status: 500 }
    );
  }
}
