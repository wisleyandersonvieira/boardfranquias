
-- Drop existing SELECT policy for delivery_accounts
DROP POLICY IF EXISTS "Users can view delivery accounts for their store" ON delivery_accounts;

-- Create new SELECT policy that checks ALL user stores
CREATE POLICY "Users can view delivery accounts for their stores"
ON delivery_accounts FOR SELECT
USING (
  user_has_permission('financeiro', 'read') AND (
    get_user_role() = 'admin' OR
    EXISTS (
      SELECT 1 FROM delivery_account_stores das
      JOIN user_stores us ON das.store_id = us.store_id
      WHERE das.account_id = delivery_accounts.id AND us.user_id = auth.uid()
    )
  )
);
