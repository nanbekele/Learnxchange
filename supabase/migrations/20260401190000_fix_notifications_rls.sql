-- Fix notifications RLS policies - simplify to avoid has_role issues

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can insert own notifications" ON public.notifications;

-- Create simplified policies without has_role (admins can use service role if needed)
CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Allow service role to manage all notifications (for server-side operations)
CREATE POLICY "Service role can manage all notifications" ON public.notifications
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Grant table permissions
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
