 
CREATE TABLE IF NOT EXISTS public.seller_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'requested', 'paid')),
  available_at TIMESTAMPTZ NOT NULL,
  payout_request_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (transaction_id)
);

ALTER TABLE public.seller_earnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers can view own earnings" ON public.seller_earnings
  FOR SELECT TO authenticated USING (seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage earnings" ON public.seller_earnings
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS seller_earnings_seller_status_available_idx
  ON public.seller_earnings (seller_id, status, available_at);

CREATE TRIGGER update_seller_earnings_updated_at
  BEFORE UPDATE ON public.seller_earnings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.payout_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'paid', 'rejected')),
  method TEXT NOT NULL DEFAULT 'telebirr',
  account_name TEXT NOT NULL DEFAULT '',
  account_number TEXT NOT NULL DEFAULT '',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers can view own payout requests" ON public.payout_requests
  FOR SELECT TO authenticated USING (seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Sellers can create payout requests" ON public.payout_requests
  FOR INSERT TO authenticated WITH CHECK (seller_id = auth.uid());

CREATE POLICY "Admins can manage payout requests" ON public.payout_requests
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_payout_requests_updated_at
  BEFORE UPDATE ON public.payout_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.seller_earnings
  ADD CONSTRAINT seller_earnings_payout_request_id_fkey
  FOREIGN KEY (payout_request_id) REFERENCES public.payout_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS payout_requests_seller_status_requested_at_idx
  ON public.payout_requests (seller_id, status, requested_at);

CREATE OR REPLACE FUNCTION public.create_payout_request()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seller_id UUID;
  v_method TEXT;
  v_account_name TEXT;
  v_account_number TEXT;
  v_amount NUMERIC(10,2);
  v_request_id UUID;
BEGIN
  v_seller_id := auth.uid();
  IF v_seller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT upm.method, upm.account_name, upm.account_number
  INTO v_method, v_account_name, v_account_number
  FROM public.user_payment_methods upm
  WHERE upm.user_id = v_seller_id AND upm.is_default = true
  LIMIT 1;

  IF COALESCE(v_account_number, '') = '' THEN
    RAISE EXCEPTION 'Missing default payout method';
  END IF;

  SELECT COALESCE(SUM(se.amount), 0)
  INTO v_amount
  FROM public.seller_earnings se
  WHERE se.seller_id = v_seller_id
    AND se.status = 'pending'
    AND se.available_at <= now();

  IF COALESCE(v_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'No available earnings to withdraw';
  END IF;

  INSERT INTO public.payout_requests (seller_id, amount, status, method, account_name, account_number)
  VALUES (v_seller_id, v_amount, 'requested', COALESCE(v_method, 'telebirr'), COALESCE(v_account_name, ''), COALESCE(v_account_number, ''))
  RETURNING id INTO v_request_id;

  UPDATE public.seller_earnings se
  SET status = 'requested', payout_request_id = v_request_id
  WHERE se.seller_id = v_seller_id
    AND se.status = 'pending'
    AND se.available_at <= now();

  RETURN v_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_payout_request() TO authenticated;
