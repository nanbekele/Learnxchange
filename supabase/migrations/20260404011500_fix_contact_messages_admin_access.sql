-- Allow admins to view/update contact messages (compatible with Admin-by-Email via public.has_role)

-- Drop policies if they exist (from prior attempts)
DROP POLICY IF EXISTS "Admins can view all contact messages" ON public.contact_messages;
DROP POLICY IF EXISTS "Admins can update contact messages" ON public.contact_messages;

-- Create policies using public.has_role to support admin role + admin-by-email override
CREATE POLICY "Admins can view all contact messages" ON public.contact_messages
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update contact messages" ON public.contact_messages
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Ensure authenticated can read the table (RLS still applies)
GRANT SELECT ON public.contact_messages TO authenticated;
