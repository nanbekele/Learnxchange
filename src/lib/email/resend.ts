import nodemailer from "nodemailer";
import type React from "react";

const getRequiredEnv = (key: string) => {
  const v = process.env[key];
  if (!v) throw new Error(`Missing environment variable: ${key}`);
  return v;
};

const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE ?? "false").toLowerCase() === "true";
const SMTP_USER = getRequiredEnv("SMTP_USER");
const SMTP_PASS = getRequiredEnv("SMTP_PASS");

export const FROM_EMAIL = process.env.FROM_EMAIL || SMTP_USER;

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

let verified = false;
const verifyTransporter = async () => {
  if (verified) return;
  try {
    await transporter.verify();
    verified = true;
    console.log("[email] SMTP transporter verified successfully");
  } catch (err: any) {
    console.error("[email] SMTP verification failed:", err?.message || err);
    throw err;
  }
};

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  react?: React.ReactElement;
  attachments?: Array<{
    filename: string;
    content: string | Buffer;
  }>;
}

export const sendEmail = async (options: EmailOptions) => {
  try {
    if (options.react) {
      throw new Error("React email templates are not supported with SMTP. Provide html or text.");
    }

    await verifyTransporter();

    const to = Array.isArray(options.to) ? options.to.join(",") : options.to;

    console.log("[email] Sending email to:", to, "subject:", options.subject);

    const info = await transporter.sendMail({
      from: FROM_EMAIL,
      to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      attachments: options.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
      })),
    });

    console.log("[email] Email sent successfully:", info.messageId);
    return { success: true, id: info.messageId };
  } catch (err: any) {
    console.error("[email] Failed to send email:", err?.message || err);
    throw err;
  }
};
