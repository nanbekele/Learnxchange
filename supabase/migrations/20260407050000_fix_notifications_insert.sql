-- Allow authenticated users to insert their own notifications
-- (Some client-side flows create notifications directly)

-- Ensure table grants exist
GRANT SELECT, UPDATE, INSERT ON public.notifications TO authenticated;

-- Recreate insert policy (it may have been dropped by previous RLS fixes)
DROP POLICY IF EXISTS "Users can insert own notifications" ON public.notifications;

CREATE POLICY "Users can insert own notifications" ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
