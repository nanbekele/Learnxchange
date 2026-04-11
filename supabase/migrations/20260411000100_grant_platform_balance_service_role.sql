-- Allow service_role (used by Next.js API routes) to update platform_balance via triggers

GRANT SELECT, INSERT, UPDATE ON TABLE public.platform_balance TO service_role;

-- Ensure service_role can pass RLS when trigger updates platform_balance
DROP POLICY IF EXISTS "Service role can update platform balance" ON public.platform_balance;
CREATE POLICY "Service role can update platform balance"
  ON public.platform_balance
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
