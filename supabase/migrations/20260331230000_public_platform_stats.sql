-- Create a function to get public platform stats
-- This uses security definer to bypass RLS and return public counts
CREATE OR REPLACE FUNCTION public.get_platform_stats()
RETURNS TABLE (
  users bigint,
  courses bigint,
  exchanges bigint,
  sold bigint,
  bought bigint
) 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM public.profiles) as users,
    (SELECT COUNT(*) FROM public.courses WHERE status = 'active') as courses,
    (SELECT COUNT(*) FROM public.exchanges) as exchanges,
    (SELECT COUNT(*) FROM public.transactions WHERE status = 'completed') as sold,
    (SELECT COUNT(*) FROM public.transactions WHERE status = 'completed') as bought;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to all roles (public access)
GRANT EXECUTE ON FUNCTION public.get_platform_stats() TO anon;
GRANT EXECUTE ON FUNCTION public.get_platform_stats() TO authenticated;
