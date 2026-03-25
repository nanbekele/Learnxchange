-- Allow pending/failed statuses for transactions (Chapa flow)

-- No schema change required if status is text.
-- This migration is intentionally left as a marker to document the change in meaning:
-- - pending: payment initialized
-- - completed: payment verified
-- - failed: verification failed
