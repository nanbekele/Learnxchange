-- Chapa integration hardening:
-- 1) Store chapa tx_ref on transactions
-- 2) Allow 'failed' status in transactions

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS tx_ref TEXT;

-- Best-effort: replace the status check constraint to include 'failed'
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.transactions'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%IN%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.transactions DROP CONSTRAINT %I', constraint_name);
  END IF;

  ALTER TABLE public.transactions
    ADD CONSTRAINT transactions_status_check
    CHECK (status IN ('pending', 'completed', 'cancelled', 'failed'));
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_tx_ref_unique ON public.transactions (tx_ref) WHERE tx_ref IS NOT NULL;
