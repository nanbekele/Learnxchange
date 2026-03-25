-- Treat one platform owner email as admin for all RLS policies relying on public.has_role
-- This complements user_roles rows, and is useful for "Admin by Email" setups.

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
    OR (
      _role = 'admin'
      AND EXISTS (
        SELECT 1
        FROM auth.users u
        WHERE u.id = _user_id
          AND lower(coalesce(u.email, '')) = lower('nanbekele3@gmail.com')
      )
    )
  )
$$;
