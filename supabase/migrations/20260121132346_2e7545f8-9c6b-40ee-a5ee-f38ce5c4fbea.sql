-- Fix RLS policies for cash_accounts
ALTER TABLE cash_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create cash accounts with permissions" ON cash_accounts;
DROP POLICY IF EXISTS "Users can view cash accounts for their stores" ON cash_accounts;
DROP POLICY IF EXISTS "Users can update cash accounts for their store" ON cash_accounts;
DROP POLICY IF EXISTS "Users can delete cash accounts for their store" ON cash_accounts;
DROP POLICY IF EXISTS "Authenticated users can insert cash accounts" ON cash_accounts;
DROP POLICY IF EXISTS "Authenticated users can select cash accounts" ON cash_accounts;
DROP POLICY IF EXISTS "Authenticated users can update cash accounts" ON cash_accounts;
DROP POLICY IF EXISTS "Authenticated users can delete cash accounts" ON cash_accounts;

CREATE POLICY "Authenticated users can insert cash accounts"
ON cash_accounts
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can select cash accounts"
ON cash_accounts
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can update cash accounts"
ON cash_accounts
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Authenticated users can delete cash accounts"
ON cash_accounts
AS PERMISSIVE
FOR DELETE
TO authenticated
USING (true);

-- Fix RLS policies for card_accounts
ALTER TABLE card_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create card accounts with permissions" ON card_accounts;
DROP POLICY IF EXISTS "Users can view card accounts for their stores" ON card_accounts;
DROP POLICY IF EXISTS "Users can update card accounts for their store" ON card_accounts;
DROP POLICY IF EXISTS "Users can delete card accounts for their store" ON card_accounts;
DROP POLICY IF EXISTS "Authenticated users can insert card accounts" ON card_accounts;
DROP POLICY IF EXISTS "Authenticated users can select card accounts" ON card_accounts;
DROP POLICY IF EXISTS "Authenticated users can update card accounts" ON card_accounts;
DROP POLICY IF EXISTS "Authenticated users can delete card accounts" ON card_accounts;

CREATE POLICY "Authenticated users can insert card accounts"
ON card_accounts
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can select card accounts"
ON card_accounts
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can update card accounts"
ON card_accounts
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Authenticated users can delete card accounts"
ON card_accounts
AS PERMISSIVE
FOR DELETE
TO authenticated
USING (true);

-- Fix RLS policies for delivery_accounts
ALTER TABLE delivery_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create delivery accounts with permissions" ON delivery_accounts;
DROP POLICY IF EXISTS "Users can view delivery accounts for their stores" ON delivery_accounts;
DROP POLICY IF EXISTS "Users can update delivery accounts for their store" ON delivery_accounts;
DROP POLICY IF EXISTS "Users can delete delivery accounts for their store" ON delivery_accounts;
DROP POLICY IF EXISTS "Authenticated users can insert delivery accounts" ON delivery_accounts;
DROP POLICY IF EXISTS "Authenticated users can select delivery accounts" ON delivery_accounts;
DROP POLICY IF EXISTS "Authenticated users can update delivery accounts" ON delivery_accounts;
DROP POLICY IF EXISTS "Authenticated users can delete delivery accounts" ON delivery_accounts;

CREATE POLICY "Authenticated users can insert delivery accounts"
ON delivery_accounts
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can select delivery accounts"
ON delivery_accounts
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can update delivery accounts"
ON delivery_accounts
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Authenticated users can delete delivery accounts"
ON delivery_accounts
AS PERMISSIVE
FOR DELETE
TO authenticated
USING (true);