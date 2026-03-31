-- Fix 403 Forbidden for payouts API
-- Add grants for payout_requests and seller_earnings tables

-- Allow authenticated users to request payouts and update status (for admin)
GRANT SELECT, INSERT, UPDATE ON public.payout_requests TO authenticated;
GRANT SELECT, UPDATE ON public.seller_earnings TO authenticated;

-- Ensure schema usage
GRANT USAGE ON SCHEMA public TO authenticated;

-- Grant execute on create_payout_request function if not already granted
GRANT EXECUTE ON FUNCTION public.create_payout_request() TO authenticated;
