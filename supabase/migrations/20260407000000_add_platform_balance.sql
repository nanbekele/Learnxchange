-- Create platform balance tracking table
CREATE TABLE IF NOT EXISTS platform_balance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'ETB',
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT
);

-- Insert initial balance record (platform starts with 0 balance)
INSERT INTO platform_balance (balance, currency, notes)
SELECT 0, 'ETB', 'Initial platform balance'
WHERE NOT EXISTS (SELECT 1 FROM platform_balance);

-- Create function to update platform balance when transaction completes
CREATE OR REPLACE FUNCTION update_platform_balance_on_sale()
RETURNS TRIGGER AS $$
BEGIN
  -- When a transaction is completed, add seller_amount to platform balance
  -- (buyer paid full amount, platform keeps commission, pays seller later)
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    UPDATE platform_balance
    SET balance = balance + NEW.seller_amount,
        last_updated = now()
    WHERE id = (SELECT id FROM platform_balance ORDER BY last_updated DESC LIMIT 1);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS update_platform_balance_trigger ON transactions;

-- Create trigger
CREATE TRIGGER update_platform_balance_trigger
  AFTER UPDATE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_platform_balance_on_sale();

-- Create function to deduct from platform balance when payout is made
CREATE OR REPLACE FUNCTION deduct_platform_balance_on_payout()
RETURNS TRIGGER AS $$
BEGIN
  -- When a payout request is marked as paid, deduct from platform balance
  IF NEW.status = 'paid' AND OLD.status != 'paid' THEN
    UPDATE platform_balance
    SET balance = balance - NEW.amount,
        last_updated = now()
    WHERE id = (SELECT id FROM platform_balance ORDER BY last_updated DESC LIMIT 1);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists  
DROP TRIGGER IF EXISTS deduct_platform_balance_trigger ON payout_requests;

-- Create trigger
CREATE TRIGGER deduct_platform_balance_trigger
  AFTER UPDATE ON payout_requests
  FOR EACH ROW
  EXECUTE FUNCTION deduct_platform_balance_on_payout();

-- Enable RLS
ALTER TABLE platform_balance ENABLE ROW LEVEL SECURITY;

-- Allow admins to read platform balance
CREATE POLICY "Admins can read platform balance"
  ON platform_balance
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

-- Allow service role to update balance
CREATE POLICY "Service role can update platform balance"
  ON platform_balance
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
