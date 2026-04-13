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
    const { exchangeId, requestedCourseId, offeredCourseId, requesterId, ownerId, action, rejectionReason } = body as {
      exchangeId?: string;
      requestedCourseId?: string;
      offeredCourseId?: string;
      requesterId?: string;
      ownerId?: string;
      action?: "requested" | "accepted" | "rejected";
      rejectionReason?: string;
    };

    if (!exchangeId || !requestedCourseId || !requesterId || !ownerId || !action) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
    const supabaseServiceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

    const adminSupabase = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Fetch course details
    const [{ data: requestedCourse }, { data: offeredCourse }] = await Promise.all([
      adminSupabase.from("courses").select("id, title, user_id").eq("id", requestedCourseId).maybeSingle(),
      offeredCourseId ? adminSupabase.from("courses").select("id, title").eq("id", offeredCourseId).maybeSingle() : { data: null },
    ]);

    if (!requestedCourse) {
      return NextResponse.json({ error: "Requested course not found" }, { status: 404 });
    }

    // Fetch requester profile
    const { data: requester } = await adminSupabase
      .from("profiles")
      .select("full_name, user_id")
      .eq("user_id", requesterId)
      .maybeSingle();

    const { data: requesterAuth } = await adminSupabase.auth.admin.getUserById(requesterId);
    const requesterName = requester?.full_name ?? requesterAuth?.user?.email?.split("@")[0] ?? "A student";

    // Fetch owner profile
    const { data: owner } = await adminSupabase
      .from("profiles")
      .select("full_name, user_id")
      .eq("user_id", ownerId)
      .maybeSingle();

    const { data: ownerAuth } = await adminSupabase.auth.admin.getUserById(ownerId);
    const ownerEmail = ownerAuth?.user?.email;
    const ownerName = owner?.full_name ?? ownerEmail?.split("@")[0] ?? "Instructor";

    if (action === "requested") {
      // Notify owner that someone wants to exchange
      const { error: notifErr } = await adminSupabase.from("notifications").insert({
        user_id: ownerId,
        title: "New exchange request",
        body: `${requesterName} wants to exchange ${offeredCourse ? `"${offeredCourse.title}"` : "their course"} for your "${requestedCourse.title}"`,
        type: "warning",
        link: `/transactions`,
      });

      if (notifErr) {
        console.error("[exchanges/notify] Failed to insert notification:", notifErr);
      } else {
        console.log("[exchanges/notify] Notification inserted for owner:", ownerId);
      }

      // Send email to owner
      if (ownerEmail) {
        const { sendEmail } = await import("@/lib/email/resend");

        const html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #333;">New Exchange Request!</h1>
            <p>Hi ${ownerName},</p>
            <p><strong>${requesterName}</strong> wants to exchange courses with you:</p>
            <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p style="margin: 5px 0;"><strong>They want:</strong> ${requestedCourse.title}</p>
              ${offeredCourse ? `<p style="margin: 5px 0;"><strong>They offer:</strong> ${offeredCourse.title}</p>` : ""}
            </div>
            <p>Please review this request and accept or reject it.</p>
            <a href="${process.env.NEXT_PUBLIC_SITE_URL}/transactions" 
               style="display: inline-block; background: #0070f3; color: white; padding: 12px 24px; 
                      text-decoration: none; border-radius: 5px; margin: 20px 0;">
              Review Exchange Request
            </a>
            <p style="color: #666; font-size: 14px;">
              You can manage all your exchange requests from the Transactions page.
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
            <p style="color: #999; font-size: 12px;">
              This is an automated email from LearnXchange. Please do not reply.
            </p>
          </div>
        `;

        const text = `
New Exchange Request!

Hi ${ownerName},

${requesterName} wants to exchange courses with you:

They want: ${requestedCourse.title}
${offeredCourse ? `They offer: ${offeredCourse.title}` : ""}

Please review this request and accept or reject it.

Review Exchange Request: ${process.env.NEXT_PUBLIC_SITE_URL}/transactions

You can manage all your exchange requests from the Transactions page.

---
This is an automated email from LearnXchange. Please do not reply.
        `;

        await sendEmail({
          to: ownerEmail,
          subject: `New Exchange Request - ${requestedCourse.title}`,
          html,
          text,
        });
      }
    } else if (action === "accepted") {
      // Notify requester that their exchange was accepted
      const { data: requesterEmail } = await adminSupabase.auth.admin.getUserById(requesterId);
      
      const { error: notifErr } = await adminSupabase.from("notifications").insert({
        user_id: requesterId,
        title: "Exchange accepted!",
        body: `${ownerName} accepted your exchange request for "${requestedCourse.title}". You now have access to the course.`,
        type: "success",
        link: `/my-learning`,
      });

      if (notifErr) {
        console.error("[exchanges/notify] Failed to insert notification:", notifErr);
      }

      if (requesterEmail?.user?.email) {
        const { sendEmail } = await import("@/lib/email/resend");

        await sendEmail({
          to: requesterEmail.user.email,
          subject: `Exchange Accepted - ${requestedCourse.title}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h1 style="color: #333;">Exchange Accepted!</h1>
              <p>Hi ${requesterName},</p>
              <p><strong>${ownerName}</strong> accepted your exchange request!</p>
              <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p>You now have access to: <strong>${requestedCourse.title}</strong></p>
              </div>
              <a href="${process.env.NEXT_PUBLIC_SITE_URL}/my-learning" 
                 style="display: inline-block; background: #0070f3; color: white; padding: 12px 24px; 
                        text-decoration: none; border-radius: 5px; margin: 20px 0;">
                Go to My Learning
              </a>
            </div>
          `,
          text: `Exchange Accepted!\n\nHi ${requesterName},\n\n${ownerName} accepted your exchange request!\n\nYou now have access to: ${requestedCourse.title}\n\nGo to My Learning: ${process.env.NEXT_PUBLIC_SITE_URL}/my-learning`,
        });
      }
    } else if (action === "rejected") {
      // Notify requester that their exchange was rejected
      const { data: requesterEmail } = await adminSupabase.auth.admin.getUserById(requesterId);

      // Build notification body with rejection reason if provided
      const reasonText = rejectionReason ? `\n\nReason: ${rejectionReason}` : "";
      const notifBody = `${ownerName} declined your exchange request for "${requestedCourse.title}".${reasonText}`;

      const { error: notifErr } = await adminSupabase.from("notifications").insert({
        user_id: requesterId,
        title: "Exchange declined",
        body: notifBody,
        type: "info",
        link: `/courses`,
      });

      if (notifErr) {
        console.error("[exchanges/notify] Failed to insert notification:", notifErr);
      }

      if (requesterEmail?.user?.email) {
        const { sendEmail } = await import("@/lib/email/resend");

        const reasonHtml = rejectionReason
          ? `<p style="background: #f5f5f5; padding: 12px; border-radius: 5px; margin: 15px 0;"><strong>Reason:</strong> ${rejectionReason}</p>`
          : "";

        await sendEmail({
          to: requesterEmail.user.email,
          subject: `Exchange Declined - ${requestedCourse.title}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h1 style="color: #666;">Exchange Declined</h1>
              <p>Hi ${requesterName},</p>
              <p><strong>${ownerName}</strong> declined your exchange request for "${requestedCourse.title}".</p>
              ${reasonHtml}
              <p>Don't worry! You can browse other courses available for exchange.</p>
              <a href="${process.env.NEXT_PUBLIC_SITE_URL}/courses"
                 style="display: inline-block; background: #0070f3; color: white; padding: 12px 24px;
                        text-decoration: none; border-radius: 5px; margin: 20px 0;">
                Browse Courses
              </a>
            </div>
          `,
          text: `Exchange Declined\n\nHi ${requesterName},\n\n${ownerName} declined your exchange request for "${requestedCourse.title}".${reasonText ? reasonText.replace(/\n/g, "\n") : ""}\n\nDon't worry! You can browse other courses available for exchange.\n\nBrowse Courses: ${process.env.NEXT_PUBLIC_SITE_URL}/courses`,
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[exchanges/notify] Error:", err?.message || err);
    return NextResponse.json(
      { error: err?.message || "Failed to send notification" },
      { status: 500 }
    );
  }
}
