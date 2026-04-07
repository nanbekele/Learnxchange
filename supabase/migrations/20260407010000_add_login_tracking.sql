-- Add last_login tracking to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE;

-- Create user_sessions table for detailed login history
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ip_address TEXT,
  user_agent TEXT,
  logged_in_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  logged_out_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true
);

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- Users can see their own sessions
CREATE POLICY "Users can view own sessions" ON public.user_sessions 
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own sessions (for login tracking)
CREATE POLICY "Users can insert own sessions" ON public.user_sessions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Function to update last_login on profile
create or replace function public.update_last_login()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Update profiles last_login
  update public.profiles 
  set last_login = now(), updated_at = now()
  where user_id = new.user_id;
  
  return new;
end;
$$;

-- Trigger to update last_login when a new session is created
create or replace trigger on_session_created
  after insert on public.user_sessions
  for each row execute function public.update_last_login();
