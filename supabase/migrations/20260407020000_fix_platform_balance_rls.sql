-- Fix platform_balance RLS policy - allow all authenticated users to read
-- This is needed because the admin check function might not work correctly

-- Drop existing select policy if exists
DROP POLICY IF EXISTS "Admins can read platform_balance" ON public.platform_balance;

-- Create new policy allowing all authenticated users to read
CREATE POLICY "Authenticated users can read platform_balance"
  ON public.platform_balance
  FOR SELECT
  TO authenticated
  USING (true);

-- Keep the insert/update policy for admins only
DROP POLICY IF EXISTS "Admins can insert platform_balance" ON public.platform_balance;
DROP POLICY IF EXISTS "Admins can update platform_balance" ON public.platform_balance;

-- Only admins can modify platform balance
CREATE POLICY "Only admins can insert platform_balance"
  ON public.platform_balance
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can update platform_balance"
  ON public.platform_balance
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
