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

console.log("[email] SMTP config:", {
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  user: SMTP_USER,
  from: FROM_EMAIL,
});

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
    servername: SMTP_HOST,
  },
  // Avoid hanging forever on networks that block SMTP ports
  connectionTimeout: 20_000,
  greetingTimeout: 20_000,
  socketTimeout: 25_000,
  // For port 587 (STARTTLS), this helps on some networks
  requireTLS: !SMTP_SECURE,
});

const isSmtpNetworkError = (err: any) => {
  const code = String(err?.code ?? "");
  const msg = String(err?.message ?? "").toLowerCase();
  return (
    code === "ETIMEDOUT" ||
    code === "ESOCKET" ||
    code === "ECONNECTION" ||
    msg.includes("etimedout") ||
    msg.includes("timeout") ||
    msg.includes("connect")
  );
};

const sendWithGmailStartTlsFallback = async (mailOptions: nodemailer.SendMailOptions) => {
  // Only retry for Gmail, and only when the configured port is NOT already 587.
  const isGmail = SMTP_HOST === "smtp.gmail.com";
  if (!isGmail || SMTP_PORT === 587) {
    return transporter.sendMail(mailOptions);
  }

  try {
    return await transporter.sendMail(mailOptions);
  } catch (err: any) {
    if (!isSmtpNetworkError(err)) throw err;

    console.warn("[email] Primary SMTP send failed; retrying with Gmail STARTTLS (587)", {
      primaryPort: SMTP_PORT,
      primarySecure: SMTP_SECURE,
      error: err?.message ?? err,
    });

    const fallback = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
      tls: {
        rejectUnauthorized: false,
        servername: "smtp.gmail.com",
      },
      connectionTimeout: 20_000,
      greetingTimeout: 20_000,
      socketTimeout: 25_000,
      requireTLS: true,
    });

    await fallback.verify();
    return fallback.sendMail(mailOptions);
  }
};

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

    const info = await sendWithGmailStartTlsFallback({
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
