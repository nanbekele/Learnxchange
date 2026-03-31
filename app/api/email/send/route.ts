import { NextResponse } from "next/server";
import { sendEmail, EmailOptions } from "@/lib/email/resend";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { to, subject, html, text, react } = body as EmailOptions;

    if (!to || !subject) {
      return NextResponse.json(
        { error: "Missing required fields: to, subject" },
        { status: 400 }
      );
    }

    if (!html && !text && !react) {
      return NextResponse.json(
        { error: "Missing content: provide html, text, or react" },
        { status: 400 }
      );
    }

    const result = await sendEmail({ to, subject, html, text, react });

    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error("Email API error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to send email" },
      { status: 500 }
    );
  }
}
