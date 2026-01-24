-- Drop existing policies for current_accounts
DROP POLICY IF EXISTS "Users can create current accounts with permissions" ON current_accounts;
DROP POLICY IF EXISTS "Users can view current accounts for their stores" ON current_accounts;
DROP POLICY IF EXISTS "Users can update current accounts for their store" ON current_accounts;
DROP POLICY IF EXISTS "Users can delete current accounts for their store" ON current_accounts;

-- Drop existing policies for current_account_stores
DROP POLICY IF EXISTS "Admins can manage account store associations" ON current_account_stores;
DROP POLICY IF EXISTS "Users can view account store associations" ON current_account_stores;

-- Recreate policies for current_accounts with correct module 'cadastros'
CREATE POLICY "Users can view current accounts for their stores"
ON current_accounts FOR SELECT
USING (
  user_has_permission('cadastros', 'read') AND (
    get_user_role() = 'admin' OR
    EXISTS (
      SELECT 1 FROM current_account_stores cas
      JOIN user_stores us ON cas.store_id = us.store_id
      WHERE cas.account_id = current_accounts.id AND us.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can create current accounts with permissions"
ON current_accounts FOR INSERT
WITH CHECK (user_has_permission('cadastros', 'write'));

CREATE POLICY "Users can update current accounts for their store"
ON current_accounts FOR UPDATE
USING (
  user_has_permission('cadastros', 'write') AND (
    get_user_role() = 'admin' OR
    EXISTS (
      SELECT 1 FROM current_account_stores cas
      WHERE cas.account_id = current_accounts.id AND cas.store_id = get_user_store_id()
    )
  )
);

CREATE POLICY "Users can delete current accounts for their store"
ON current_accounts FOR DELETE
USING (
  user_has_permission('cadastros', 'write') AND (
    get_user_role() = 'admin' OR
    EXISTS (
      SELECT 1 FROM current_account_stores cas
      WHERE cas.account_id = current_accounts.id AND cas.store_id = get_user_store_id()
    )
  )
);

-- Recreate policies for current_account_stores
-- Allow users with cadastros write permission to manage associations (not just admins)
CREATE POLICY "Users can view account store associations"
ON current_account_stores FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Users can insert account store associations"
ON current_account_stores FOR INSERT
WITH CHECK (user_has_permission('cadastros', 'write'));

CREATE POLICY "Users can update account store associations"
ON current_account_stores FOR UPDATE
USING (user_has_permission('cadastros', 'write'));

CREATE POLICY "Users can delete account store associations"
ON current_account_stores FOR DELETE
USING (user_has_permission('cadastros', 'write'));