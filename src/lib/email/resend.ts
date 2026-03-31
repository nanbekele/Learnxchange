import { Resend } from "resend";

const getResendApiKey = () => {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error("Missing RESEND_API_KEY environment variable");
  }
  return key;
};

export const resend = new Resend(getResendApiKey());

export const FROM_EMAIL = process.env.FROM_EMAIL || "onboarding@resend.dev";

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
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      react: options.react,
      attachments: options.attachments,
    });

    if (error) {
      console.error("Resend email error:", error);
      throw new Error(error.message);
    }

    return { success: true, id: data?.id };
  } catch (err: any) {
    console.error("Failed to send email:", err);
    throw err;
  }
};
