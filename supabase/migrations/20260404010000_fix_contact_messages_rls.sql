-- Fix contact_messages RLS policies - simplify to avoid has_role issues

-- Drop existing policies
DROP POLICY IF EXISTS "Authenticated can create contact messages" ON public.contact_messages;
DROP POLICY IF EXISTS "Admins can view contact messages" ON public.contact_messages;
DROP POLICY IF EXISTS "Admins can update contact messages" ON public.contact_messages;
DROP POLICY IF EXISTS "Users can create contact messages" ON public.contact_messages;
DROP POLICY IF EXISTS "Users can view own contact messages" ON public.contact_messages;
DROP POLICY IF EXISTS "Service role can manage all contact messages" ON public.contact_messages;
DROP POLICY IF EXISTS "Anon can create contact messages" ON public.contact_messages;

-- Allow authenticated users to create their own messages
CREATE POLICY "Users can create contact messages" ON public.contact_messages
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Allow users to view their own messages
CREATE POLICY "Users can view own contact messages" ON public.contact_messages
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Allow admins to view all messages (using exists check on user_roles)
CREATE POLICY "Admins can view all contact messages" ON public.contact_messages
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- Allow admins to update all messages (for replies)
CREATE POLICY "Admins can update contact messages" ON public.contact_messages
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- Allow service role to manage all messages (for admin operations)
CREATE POLICY "Service role can manage all contact messages" ON public.contact_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Allow anon to create messages (for non-logged in users if needed)
CREATE POLICY "Anon can create contact messages" ON public.contact_messages
  FOR INSERT TO anon
  WITH CHECK (true);

-- Grant table permissions
GRANT SELECT, INSERT ON public.contact_messages TO authenticated;
GRANT INSERT ON public.contact_messages TO anon;
GRANT ALL ON public.contact_messages TO service_role;
