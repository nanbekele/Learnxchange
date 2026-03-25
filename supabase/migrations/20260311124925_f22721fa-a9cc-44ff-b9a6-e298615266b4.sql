
CREATE TABLE public.user_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  method text NOT NULL DEFAULT 'telebirr',
  account_name text NOT NULL DEFAULT '',
  account_number text NOT NULL DEFAULT '',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.user_payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own payment methods" ON public.user_payment_methods
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can insert own payment methods" ON public.user_payment_methods
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own payment methods" ON public.user_payment_methods
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can delete own payment methods" ON public.user_payment_methods
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Admins can view all payment methods" ON public.user_payment_methods
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
