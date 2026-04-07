-- Fix user_sessions RLS - add missing INSERT policy
-- Users need to insert their own session records on login

DROP POLICY IF EXISTS "Users can insert own sessions" ON public.user_sessions;

CREATE POLICY "Users can insert own sessions" ON public.user_sessions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
