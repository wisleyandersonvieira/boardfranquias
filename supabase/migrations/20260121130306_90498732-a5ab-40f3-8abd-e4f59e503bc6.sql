-- Temporarily simplify the INSERT policy to debug
-- This will allow any authenticated user to insert
DROP POLICY IF EXISTS "Users can create current accounts with permissions" ON current_accounts;

CREATE POLICY "Users can create current accounts with permissions"
ON current_accounts FOR INSERT
TO authenticated
WITH CHECK (true);