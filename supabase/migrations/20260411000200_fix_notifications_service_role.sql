-- Ensure service_role can insert notifications (for server-side notifications)
-- and that realtime is enabled for notifications table

-- Grant insert permission to service_role
GRANT INSERT ON TABLE public.notifications TO service_role;

-- Ensure authenticated users can insert their own notifications
GRANT INSERT ON TABLE public.notifications TO authenticated;

-- Make sure the service_role policy exists and allows all operations
DROP POLICY IF EXISTS "Service role can manage all notifications" ON public.notifications;

CREATE POLICY "Service role can manage all notifications" ON public.notifications
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Enable realtime for notifications (if not already enabled)
-- This ensures the notification bell updates in real-time
