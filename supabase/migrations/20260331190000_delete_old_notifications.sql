-- Create function to delete old notifications (older than 2 months)
CREATE OR REPLACE FUNCTION public.delete_old_notifications()
RETURNS void AS $$
BEGIN
  DELETE FROM public.notifications
  WHERE created_at < NOW() - INTERVAL '2 months';
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to authenticated users (for cron job)
GRANT EXECUTE ON FUNCTION public.delete_old_notifications() TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_old_notifications() TO service_role;
