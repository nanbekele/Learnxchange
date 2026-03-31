# Resend Email Setup

## 1. Get API Key
1. Sign up at https://resend.com (free tier: 3,000 emails/month)
2. Verify your domain or use `onboarding@resend.dev` for testing
3. Create an API key at https://resend.com/api-keys

## 2. Environment Variables
Add to `.env.local`:

```env
# Resend Email API
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
FROM_EMAIL=onboarding@resend.dev
# Or use your verified domain: noreply@yourdomain.com

# Site URL for email links
NEXT_PUBLIC_SITE_URL=http://localhost:3000
# Production: https://yourdomain.com
```

## 3. Email Templates Available

### Purchase Confirmation
```typescript
import { sendPurchaseConfirmationEmail } from "@/lib/email/templates";

await sendPurchaseConfirmationEmail({
  to: "buyer@email.com",
  buyerName: "John Doe",
  courseName: "React Mastery",
  courseId: "course-uuid",
  amount: 99.99,
});
```

### Sale Notification
```typescript
import { sendSaleNotificationEmail } from "@/lib/email/templates";

await sendSaleNotificationEmail({
  to: "seller@email.com",
  sellerName: "Jane Smith",
  courseName: "React Mastery",
  buyerName: "John Doe",
  amount: 99.99,
  commission: 9.99,
  netAmount: 90.00,
});
```

### Payout Status
```typescript
import { sendPayoutStatusEmail } from "@/lib/email/templates";

await sendPayoutStatusEmail({
  to: "seller@email.com",
  sellerName: "Jane Smith",
  amount: 500.00,
  method: "Telebirr",
  status: "paid", // "requested" | "processing" | "paid" | "failed"
});
```

### Exchange Notification
```typescript
import { sendExchangeNotificationEmail } from "@/lib/email/templates";

await sendExchangeNotificationEmail({
  to: "user@email.com",
  userName: "John Doe",
  action: "accepted", // "requested" | "accepted" | "rejected"
  requestedCourseName: "Course A",
  offeredCourseName: "Course B",
  otherUserName: "Jane Smith",
});
```

## 4. Send Custom Email via API

```bash
curl -X POST http://localhost:3000/api/email/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "user@email.com",
    "subject": "Hello",
    "html": "<h1>Hello World</h1>",
    "text": "Hello World"
  }'
```

## 5. Test Email
To send a test email, run:

```typescript
import { sendEmail } from "@/lib/email/resend";

await sendEmail({
  to: "your-email@example.com",
  subject: "Test from LearnXchange",
  html: "<h1>It works!</h1>",
  text: "It works!",
});
```

## Free Tier Limits
- 3,000 emails per month
- 100 emails per day
- No credit card required

## Next Steps
1. Add your RESEND_API_KEY to .env.local
2. Update FROM_EMAIL to your verified domain (optional)
3. Test sending an email
4. Integrate into your purchase/transaction flows
