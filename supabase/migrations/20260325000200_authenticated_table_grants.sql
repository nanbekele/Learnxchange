GRANT USAGE ON SCHEMA public TO authenticated;

-- profiles: AuthContext upsert requires INSERT/UPDATE
GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated;

-- user-scoped tables (RLS already restricts rows)
GRANT SELECT, INSERT ON TABLE public.transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.exchanges TO authenticated;

-- payouts/earnings (seller reads own rows, sellers create payout requests)
GRANT SELECT ON TABLE public.seller_earnings TO authenticated;
GRANT SELECT, INSERT ON TABLE public.payout_requests TO authenticated;
