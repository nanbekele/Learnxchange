-- Ensure service_role can access Chapa-related tables when used from Next.js API routes

GRANT USAGE ON SCHEMA public TO service_role;

GRANT SELECT ON public.courses TO service_role;
GRANT SELECT ON public.platform_settings TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.transactions TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.seller_earnings TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.commissions TO service_role;

-- Optional: payout admin routes may also use service_role
GRANT SELECT, INSERT, UPDATE ON public.payout_requests TO service_role;
GRANT SELECT ON public.user_payment_methods TO service_role;
