-- Add rejection reason column to exchanges table
ALTER TABLE public.exchanges 
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Add comment explaining the column
COMMENT ON COLUMN public.exchanges.rejection_reason IS 
'The reason provided by the owner when rejecting an exchange request. Used to notify the requester politely.';
