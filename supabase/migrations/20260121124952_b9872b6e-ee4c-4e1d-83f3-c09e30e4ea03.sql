-- =====================
-- CASH ACCOUNTS
-- =====================
DROP POLICY IF EXISTS "Users can create cash accounts with permissions" ON cash_accounts;
DROP POLICY IF EXISTS "Users can view cash accounts for their stores" ON cash_accounts;
DROP POLICY IF EXISTS "Users can update cash accounts for their store" ON cash_accounts;
DROP POLICY IF EXISTS "Users can delete cash accounts for their store" ON cash_accounts;

DROP POLICY IF EXISTS "Admins can manage cash account store associations" ON cash_account_stores;
DROP POLICY IF EXISTS "Users can view cash account store associations" ON cash_account_stores;

CREATE POLICY "Users can view cash accounts for their stores"
ON cash_accounts FOR SELECT
USING (
  user_has_permission('cadastros', 'read') AND (
    get_user_role() = 'admin' OR
    EXISTS (
      SELECT 1 FROM cash_account_stores cas
      JOIN user_stores us ON cas.store_id = us.store_id
      WHERE cas.account_id = cash_accounts.id AND us.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can create cash accounts with permissions"
ON cash_accounts FOR INSERT
WITH CHECK (user_has_permission('cadastros', 'write'));

CREATE POLICY "Users can update cash accounts for their store"
ON cash_accounts FOR UPDATE
USING (
  user_has_permission('cadastros', 'write') AND (
    get_user_role() = 'admin' OR
    EXISTS (
      SELECT 1 FROM cash_account_stores cas
      WHERE cas.account_id = cash_accounts.id AND cas.store_id = get_user_store_id()
    )
  )
);

CREATE POLICY "Users can delete cash accounts for their store"
ON cash_accounts FOR DELETE
USING (
  user_has_permission('cadastros', 'write') AND (
    get_user_role() = 'admin' OR
    EXISTS (
      SELECT 1 FROM cash_account_stores cas
      WHERE cas.account_id = cash_accounts.id AND cas.store_id = get_user_store_id()
    )
  )
);

CREATE POLICY "Users can view cash account store associations"
ON cash_account_stores FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Users can insert cash account store associations"
ON cash_account_stores FOR INSERT
WITH CHECK (user_has_permission('cadastros', 'write'));

CREATE POLICY "Users can update cash account store associations"
ON cash_account_stores FOR UPDATE
USING (user_has_permission('cadastros', 'write'));

CREATE POLICY "Users can delete cash account store associations"
ON cash_account_stores FOR DELETE
USING (user_has_permission('cadastros', 'write'));

-- =====================
-- CARD ACCOUNTS
-- =====================
DROP POLICY IF EXISTS "Users can create card accounts with permissions" ON card_accounts;
DROP POLICY IF EXISTS "Users can view card accounts for their stores" ON card_accounts;
DROP POLICY IF EXISTS "Users can update card accounts for their store" ON card_accounts;
DROP POLICY IF EXISTS "Users can delete card accounts for their store" ON card_accounts;

DROP POLICY IF EXISTS "Admins can manage card account store associations" ON card_account_stores;
DROP POLICY IF EXISTS "Users can view card account store associations" ON card_account_stores;

CREATE POLICY "Users can view card accounts for their stores"
ON card_accounts FOR SELECT
USING (
  user_has_permission('cadastros', 'read') AND (
    get_user_role() = 'admin' OR
    EXISTS (
      SELECT 1 FROM card_account_stores cas
      JOIN user_stores us ON cas.store_id = us.store_id
      WHERE cas.account_id = card_accounts.id AND us.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can create card accounts with permissions"
ON card_accounts FOR INSERT
WITH CHECK (user_has_permission('cadastros', 'write'));

CREATE POLICY "Users can update card accounts for their store"
ON card_accounts FOR UPDATE
USING (
  user_has_permission('cadastros', 'write') AND (
    get_user_role() = 'admin' OR
    EXISTS (
      SELECT 1 FROM card_account_stores cas
      WHERE cas.account_id = card_accounts.id AND cas.store_id = get_user_store_id()
    )
  )
);

CREATE POLICY "Users can delete card accounts for their store"
ON card_accounts FOR DELETE
USING (
  user_has_permission('cadastros', 'write') AND (
    get_user_role() = 'admin' OR
    EXISTS (
      SELECT 1 FROM card_account_stores cas
      WHERE cas.account_id = card_accounts.id AND cas.store_id = get_user_store_id()
    )
  )
);

CREATE POLICY "Users can view card account store associations"
ON card_account_stores FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Users can insert card account store associations"
ON card_account_stores FOR INSERT
WITH CHECK (user_has_permission('cadastros', 'write'));

CREATE POLICY "Users can update card account store associations"
ON card_account_stores FOR UPDATE
USING (user_has_permission('cadastros', 'write'));

CREATE POLICY "Users can delete card account store associations"
ON card_account_stores FOR DELETE
USING (user_has_permission('cadastros', 'write'));

-- =====================
-- DELIVERY ACCOUNTS
-- =====================
DROP POLICY IF EXISTS "Users can create delivery accounts with permissions" ON delivery_accounts;
DROP POLICY IF EXISTS "Users can view delivery accounts for their stores" ON delivery_accounts;
DROP POLICY IF EXISTS "Users can update delivery accounts for their store" ON delivery_accounts;
DROP POLICY IF EXISTS "Users can delete delivery accounts for their store" ON delivery_accounts;

DROP POLICY IF EXISTS "Admins can manage delivery account store associations" ON delivery_account_stores;
DROP POLICY IF EXISTS "Users can view delivery account store associations" ON delivery_account_stores;

CREATE POLICY "Users can view delivery accounts for their stores"
ON delivery_accounts FOR SELECT
USING (
  user_has_permission('cadastros', 'read') AND (
    get_user_role() = 'admin' OR
    EXISTS (
      SELECT 1 FROM delivery_account_stores das
      JOIN user_stores us ON das.store_id = us.store_id
      WHERE das.account_id = delivery_accounts.id AND us.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can create delivery accounts with permissions"
ON delivery_accounts FOR INSERT
WITH CHECK (user_has_permission('cadastros', 'write'));

CREATE POLICY "Users can update delivery accounts for their store"
ON delivery_accounts FOR UPDATE
USING (
  user_has_permission('cadastros', 'write') AND (
    get_user_role() = 'admin' OR
    EXISTS (
      SELECT 1 FROM delivery_account_stores das
      WHERE das.account_id = delivery_accounts.id AND das.store_id = get_user_store_id()
    )
  )
);

CREATE POLICY "Users can delete delivery accounts for their store"
ON delivery_accounts FOR DELETE
USING (
  user_has_permission('cadastros', 'write') AND (
    get_user_role() = 'admin' OR
    EXISTS (
      SELECT 1 FROM delivery_account_stores das
      WHERE das.account_id = delivery_accounts.id AND das.store_id = get_user_store_id()
    )
  )
);

CREATE POLICY "Users can view delivery account store associations"
ON delivery_account_stores FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Users can insert delivery account store associations"
ON delivery_account_stores FOR INSERT
WITH CHECK (user_has_permission('cadastros', 'write'));

CREATE POLICY "Users can update delivery account store associations"
ON delivery_account_stores FOR UPDATE
USING (user_has_permission('cadastros', 'write'));

CREATE POLICY "Users can delete delivery account store associations"
ON delivery_account_stores FOR DELETE
USING (user_has_permission('cadastros', 'write'));