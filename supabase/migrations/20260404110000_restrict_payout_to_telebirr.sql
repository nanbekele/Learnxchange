-- Migration: Restrict user_payment_methods to Telebirr only
-- Date: 2026-04-04

-- First, add a check constraint to ensure only 'telebirr' method is allowed
ALTER TABLE user_payment_methods
  DROP CONSTRAINT IF EXISTS chk_telebirr_only;

ALTER TABLE user_payment_methods
  ADD CONSTRAINT chk_telebirr_only
  CHECK (method = 'telebirr');

-- Clean up any existing non-Telebirr payment methods
DELETE FROM user_payment_methods
WHERE method != 'telebirr';

-- Add a comment on the table explaining the restriction
COMMENT ON TABLE user_payment_methods IS 'Seller payout methods - Telebirr only';

-- Update the enum type if it exists (PostgreSQL custom types)
-- Note: This assumes the column uses a text type or enum.
-- If using a custom enum type, you may need to recreate it.

-- Verify the cleanup
SELECT method, COUNT(*) as count
FROM user_payment_methods
GROUP BY method;
