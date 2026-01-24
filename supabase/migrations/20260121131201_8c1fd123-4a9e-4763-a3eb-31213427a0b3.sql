-- Temporarily simplify current_account_stores INSERT policy too
DROP POLICY IF EXISTS "Users can insert account store associations" ON current_account_stores;

CREATE POLICY "Users can insert account store associations"
ON current_account_stores FOR INSERT
TO authenticated
WITH CHECK (true);