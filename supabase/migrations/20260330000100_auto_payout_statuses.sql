ALTER TABLE public.payout_requests
  DROP CONSTRAINT IF EXISTS payout_requests_status_check;

ALTER TABLE public.payout_requests
  ADD CONSTRAINT payout_requests_status_check
  CHECK (status IN ('requested', 'processing', 'paid', 'failed', 'rejected'));

ALTER TABLE public.payout_requests
  ADD COLUMN IF NOT EXISTS payout_provider TEXT NOT NULL DEFAULT 'mock',
  ADD COLUMN IF NOT EXISTS payout_reference TEXT,
  ADD COLUMN IF NOT EXISTS payout_error TEXT;

CREATE INDEX IF NOT EXISTS payout_requests_status_requested_at_idx
  ON public.payout_requests (status, requested_at);
