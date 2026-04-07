-- Ensure PostgREST can access platform_balance and user_sessions
-- RLS policies control row access; GRANTs control whether the API can run the query at all.

-- platform_balance: allow authenticated users to read
GRANT SELECT ON TABLE public.platform_balance TO authenticated;

-- user_sessions: allow authenticated users to insert/select their own sessions (RLS still enforced)
GRANT SELECT, INSERT ON TABLE public.user_sessions TO authenticated;
