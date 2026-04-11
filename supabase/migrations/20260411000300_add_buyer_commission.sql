-- Add buyer commission column to transactions table
-- This allows charging commission from both buyer and seller

ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS buyer_commission_amount numeric(12,2) DEFAULT 0;

-- Add comment explaining the columns
COMMENT ON COLUMN public.transactions.commission_amount IS 'Commission paid by the seller (deducted from their earnings)';
COMMENT ON COLUMN public.transactions.buyer_commission_amount IS 'Commission paid by the buyer (added to payment amount)';

-- Update existing transactions to have 0 buyer commission (backward compatibility)
UPDATE public.transactions 
SET buyer_commission_amount = 0 
WHERE buyer_commission_amount IS NULL;

-- Update platform balance trigger to include both commissions
CREATE OR REPLACE FUNCTION update_platform_balance_on_sale()
RETURNS TRIGGER AS $$
DECLARE
  total_commission numeric(12,2);
BEGIN
  -- Only process completed transactions that haven't been processed yet
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    -- Calculate total commission from both buyer and seller
    total_commission := COALESCE(NEW.commission_amount, 0) + COALESCE(NEW.buyer_commission_amount, 0);
    
    -- Update platform balance with total commission
    UPDATE platform_balance
    SET balance = balance + total_commission,
        last_updated = now()
    WHERE id = (SELECT id FROM platform_balance ORDER BY last_updated DESC LIMIT 1);
    
    -- If no platform balance record exists, create one
    IF NOT FOUND THEN
      INSERT INTO platform_balance (balance, last_updated)
      VALUES (total_commission, now());
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Make sure the trigger is properly set
DROP TRIGGER IF EXISTS update_platform_balance_trigger ON transactions;
CREATE TRIGGER update_platform_balance_trigger
  AFTER UPDATE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_platform_balance_on_sale();
