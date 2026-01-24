-- Re-enable RLS with proper explicit policies
ALTER TABLE current_accounts ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies on current_accounts
DROP POLICY IF EXISTS "Users can create current accounts with permissions" ON current_accounts;
DROP POLICY IF EXISTS "Users can view current accounts for their stores" ON current_accounts;
DROP POLICY IF EXISTS "Users can update current accounts for their store" ON current_accounts;
DROP POLICY IF EXISTS "Users can delete current accounts for their store" ON current_accounts;

-- Create simple, explicit policies with AS PERMISSIVE
CREATE POLICY "Authenticated users can insert current accounts"
ON current_accounts
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can select current accounts"
ON current_accounts
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can update current accounts"
ON current_accounts
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Authenticated users can delete current accounts"
ON current_accounts
AS PERMISSIVE
FOR DELETE
TO authenticated
USING (true);