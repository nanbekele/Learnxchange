-- Fix 403 Forbidden on ratings and user_payment_methods tables
-- These tables have RLS policies but need GRANTs for authenticated role

-- Grant SELECT on ratings (viewable by everyone per RLS policy)
GRANT SELECT ON public.ratings TO anon;
GRANT SELECT ON public.ratings TO authenticated;

-- Grant INSERT on ratings (users can create ratings per RLS policy)
GRANT INSERT ON public.ratings TO authenticated;

-- Grant all necessary permissions on user_payment_methods
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_payment_methods TO authenticated;

-- Ensure schema usage is granted
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
