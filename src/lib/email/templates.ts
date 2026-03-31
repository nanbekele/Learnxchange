import { sendEmail, FROM_EMAIL } from "@/lib/email/resend";

interface PurchaseEmailParams {
  to: string;
  buyerName: string;
  courseName: string;
  courseId: string;
  amount: number;
}

export const sendPurchaseConfirmationEmail = async (params: PurchaseEmailParams) => {
  const { to, buyerName, courseName, courseId, amount } = params;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #333;">Purchase Confirmation</h1>
      <p>Hi ${buyerName},</p>
      <p>Thank you for your purchase! You have successfully bought:</p>
      <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <h3 style="margin: 0 0 10px 0;">${courseName}</h3>
        <p style="margin: 0; color: #666;">Amount: ETB ${amount.toFixed(2)}</p>
      </div>
      <p>You can access your course materials by clicking the button below:</p>
      <a href="${process.env.NEXT_PUBLIC_SITE_URL}/courses/${courseId}" 
         style="display: inline-block; background: #0070f3; color: white; padding: 12px 24px; 
                text-decoration: none; border-radius: 5px; margin: 20px 0;">
        Access Course
      </a>
      <p style="color: #666; font-size: 14px;">
        If you have any questions, please contact our support team.
      </p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
      <p style="color: #999; font-size: 12px;">
        This is an automated email from LearnXchange. Please do not reply.
      </p>
    </div>
  `;

  const text = `
Purchase Confirmation

Hi ${buyerName},

Thank you for your purchase! You have successfully bought:

Course: ${courseName}
Amount: ETB ${amount.toFixed(2)}

Access your course: ${process.env.NEXT_PUBLIC_SITE_URL}/courses/${courseId}

If you have any questions, please contact our support team.

---
This is an automated email from LearnXchange. Please do not reply.
  `;

  return await sendEmail({
    to,
    subject: `Purchase Confirmation - ${courseName}`,
    html,
    text,
  });
};

interface SaleEmailParams {
  to: string;
  sellerName: string;
  courseName: string;
  buyerName: string;
  amount: number;
  commission: number;
  netAmount: number;
}

export const sendSaleNotificationEmail = async (params: SaleEmailParams) => {
  const { to, sellerName, courseName, buyerName, amount, commission, netAmount } = params;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #333;">New Sale!</h1>
      <p>Hi ${sellerName},</p>
      <p>Great news! Your course has been purchased:</p>
      <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <h3 style="margin: 0 0 10px 0;">${courseName}</h3>
        <p style="margin: 5px 0;">Buyer: ${buyerName}</p>
        <p style="margin: 5px 0;">Sale Amount: ETB ${amount.toFixed(2)}</p>
        <p style="margin: 5px 0;">Platform Fee (10%): ETB ${commission.toFixed(2)}</p>
        <p style="margin: 5px 0; font-weight: bold;">Your Earnings: ETB ${netAmount.toFixed(2)}</p>
      </div>
      <p>Your earnings have been added to your seller balance. You can request a payout from your dashboard.</p>
      <a href="${process.env.NEXT_PUBLIC_SITE_URL}/dashboard" 
         style="display: inline-block; background: #0070f3; color: white; padding: 12px 24px; 
                text-decoration: none; border-radius: 5px; margin: 20px 0;">
        Go to Dashboard
      </a>
      <p style="color: #666; font-size: 14px;">
        Keep up the great work!
      </p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
      <p style="color: #999; font-size: 12px;">
        This is an automated email from LearnXchange. Please do not reply.
      </p>
    </div>
  `;

  const text = `
New Sale!

Hi ${sellerName},

Great news! Your course has been purchased:

Course: ${courseName}
Buyer: ${buyerName}
Sale Amount: ETB ${amount.toFixed(2)}
Platform Fee (10%): ETB ${commission.toFixed(2)}
Your Earnings: ETB ${netAmount.toFixed(2)}

Your earnings have been added to your seller balance. You can request a payout from your dashboard.

Go to Dashboard: ${process.env.NEXT_PUBLIC_SITE_URL}/dashboard

Keep up the great work!

---
This is an automated email from LearnXchange. Please do not reply.
  `;

  return await sendEmail({
    to,
    subject: `New Sale - ${courseName}`,
    html,
    text,
  });
};

interface PayoutEmailParams {
  to: string;
  sellerName: string;
  amount: number;
  method: string;
  status: "requested" | "processing" | "paid" | "failed";
}

export const sendPayoutStatusEmail = async (params: PayoutEmailParams) => {
  const { to, sellerName, amount, method, status } = params;

  const statusMessages = {
    requested: {
      subject: "Payout Request Received",
      title: "Payout Request Received",
      message: `We have received your payout request for ETB ${amount.toFixed(2)}. We are processing it now and will notify you once it's complete.`,
    },
    processing: {
      subject: "Payout Processing",
      title: "Payout is Being Processed",
      message: `Your payout of ETB ${amount.toFixed(2)} is currently being processed via ${method}. You will receive another email once the transfer is complete.`,
    },
    paid: {
      subject: "Payout Completed",
      title: "Payout Completed!",
      message: `Your payout of ETB ${amount.toFixed(2)} has been successfully sent to your ${method} account.`,
    },
    failed: {
      subject: "Payout Failed",
      title: "Payout Could Not Be Processed",
      message: `We were unable to process your payout of ETB ${amount.toFixed(2)}. Please check your payment method details and try again, or contact support for assistance.`,
    },
  };

  const { subject, title, message } = statusMessages[status];

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #333;">${title}</h1>
      <p>Hi ${sellerName},</p>
      <p>${message}</p>
      <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p style="margin: 5px 0;"><strong>Amount:</strong> ETB ${amount.toFixed(2)}</p>
        <p style="margin: 5px 0;"><strong>Method:</strong> ${method}</p>
        <p style="margin: 5px 0;"><strong>Status:</strong> ${status.charAt(0).toUpperCase() + status.slice(1)}</p>
      </div>
      <a href="${process.env.NEXT_PUBLIC_SITE_URL}/dashboard" 
         style="display: inline-block; background: #0070f3; color: white; padding: 12px 24px; 
                text-decoration: none; border-radius: 5px; margin: 20px 0;">
        View Dashboard
      </a>
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
      <p style="color: #999; font-size: 12px;">
        This is an automated email from LearnXchange. Please do not reply.
      </p>
    </div>
  `;

  const text = `
${title}

Hi ${sellerName},

${message}

Amount: ETB ${amount.toFixed(2)}
Method: ${method}
Status: ${status.charAt(0).toUpperCase() + status.slice(1)}

View Dashboard: ${process.env.NEXT_PUBLIC_SITE_URL}/dashboard

---
This is an automated email from LearnXchange. Please do not reply.
  `;

  return await sendEmail({
    to,
    subject,
    html,
    text,
  });
};

interface ExchangeEmailParams {
  to: string;
  userName: string;
  action: "requested" | "accepted" | "rejected";
  requestedCourseName: string;
  offeredCourseName: string;
  otherUserName: string;
}

export const sendExchangeNotificationEmail = async (params: ExchangeEmailParams) => {
  const { to, userName, action, requestedCourseName, offeredCourseName, otherUserName } = params;

  const actionMessages = {
    requested: {
      subject: `New Exchange Request from ${otherUserName}`,
      title: "New Exchange Request",
      message: `${otherUserName} wants to exchange their "${offeredCourseName}" for your "${requestedCourseName}".`,
      cta: "Review Request",
      ctaLink: "/transactions",
    },
    accepted: {
      subject: "Your Exchange Request Was Accepted!",
      title: "Exchange Accepted!",
      message: `${otherUserName} has accepted your exchange offer. You can now access their "${offeredCourseName}" course.`,
      cta: "Access Course",
      ctaLink: "/transactions",
    },
    rejected: {
      subject: "Your Exchange Request Was Rejected",
      title: "Exchange Rejected",
      message: `${otherUserName} has declined your exchange offer for "${requestedCourseName}".`,
      cta: "Browse Courses",
      ctaLink: "/courses",
    },
  };

  const { subject, title, message, cta, ctaLink } = actionMessages[action];

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #333;">${title}</h1>
      <p>Hi ${userName},</p>
      <p>${message}</p>
      <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p style="margin: 5px 0;"><strong>Your Course:</strong> ${requestedCourseName}</p>
        <p style="margin: 5px 0;"><strong>Their Course:</strong> ${offeredCourseName}</p>
      </div>
      <a href="${process.env.NEXT_PUBLIC_SITE_URL}${ctaLink}" 
         style="display: inline-block; background: #0070f3; color: white; padding: 12px 24px; 
                text-decoration: none; border-radius: 5px; margin: 20px 0;">
        ${cta}
      </a>
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
      <p style="color: #999; font-size: 12px;">
        This is an automated email from LearnXchange. Please do not reply.
      </p>
    </div>
  `;

  const text = `
${title}

Hi ${userName},

${message}

Your Course: ${requestedCourseName}
Their Course: ${offeredCourseName}

${cta}: ${process.env.NEXT_PUBLIC_SITE_URL}${ctaLink}

---
This is an automated email from LearnXchange. Please do not reply.
  `;

  return await sendEmail({
    to,
    subject,
    html,
    text,
  });
};
