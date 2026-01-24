-- Fix accounts_payable_installments policies
DROP POLICY IF EXISTS "Users can manage installments for their store" ON accounts_payable_installments;
DROP POLICY IF EXISTS "Users can view installments for their store" ON accounts_payable_installments;

CREATE POLICY "Users can view installments for accessible stores"
ON accounts_payable_installments
FOR SELECT
USING (
  user_has_permission('contas_pagar', 'read') 
  AND EXISTS (
    SELECT 1 FROM accounts_payable ap
    WHERE ap.id = accounts_payable_installments.account_payable_id
    AND (get_user_role() = 'admin' OR user_has_access_to_store(ap.store_id))
  )
);

CREATE POLICY "Users can insert installments for accessible stores"
ON accounts_payable_installments
FOR INSERT
WITH CHECK (
  user_has_permission('contas_pagar', 'write') 
  AND EXISTS (
    SELECT 1 FROM accounts_payable ap
    WHERE ap.id = accounts_payable_installments.account_payable_id
    AND (get_user_role() = 'admin' OR user_has_access_to_store(ap.store_id))
  )
);

CREATE POLICY "Users can update installments for accessible stores"
ON accounts_payable_installments
FOR UPDATE
USING (
  user_has_permission('contas_pagar', 'write') 
  AND EXISTS (
    SELECT 1 FROM accounts_payable ap
    WHERE ap.id = accounts_payable_installments.account_payable_id
    AND (get_user_role() = 'admin' OR user_has_access_to_store(ap.store_id))
  )
);

CREATE POLICY "Users can delete installments for accessible stores"
ON accounts_payable_installments
FOR DELETE
USING (
  user_has_permission('contas_pagar', 'write') 
  AND EXISTS (
    SELECT 1 FROM accounts_payable ap
    WHERE ap.id = accounts_payable_installments.account_payable_id
    AND (get_user_role() = 'admin' OR user_has_access_to_store(ap.store_id))
  )
);

-- Fix accounts_payable_payments policies
DROP POLICY IF EXISTS "Users can manage payments for their store" ON accounts_payable_payments;
DROP POLICY IF EXISTS "Users can view payments for their store" ON accounts_payable_payments;

CREATE POLICY "Users can view payments for accessible stores"
ON accounts_payable_payments
FOR SELECT
USING (
  user_has_permission('contas_pagar', 'read') 
  AND EXISTS (
    SELECT 1 FROM accounts_payable ap
    WHERE ap.id = accounts_payable_payments.account_payable_id
    AND (get_user_role() = 'admin' OR user_has_access_to_store(ap.store_id))
  )
);

CREATE POLICY "Users can insert payments for accessible stores"
ON accounts_payable_payments
FOR INSERT
WITH CHECK (
  user_has_permission('contas_pagar', 'write') 
  AND EXISTS (
    SELECT 1 FROM accounts_payable ap
    WHERE ap.id = accounts_payable_payments.account_payable_id
    AND (get_user_role() = 'admin' OR user_has_access_to_store(ap.store_id))
  )
);

CREATE POLICY "Users can update payments for accessible stores"
ON accounts_payable_payments
FOR UPDATE
USING (
  user_has_permission('contas_pagar', 'write') 
  AND EXISTS (
    SELECT 1 FROM accounts_payable ap
    WHERE ap.id = accounts_payable_payments.account_payable_id
    AND (get_user_role() = 'admin' OR user_has_access_to_store(ap.store_id))
  )
);

CREATE POLICY "Users can delete payments for accessible stores"
ON accounts_payable_payments
FOR DELETE
USING (
  user_has_permission('contas_pagar', 'write') 
  AND EXISTS (
    SELECT 1 FROM accounts_payable ap
    WHERE ap.id = accounts_payable_payments.account_payable_id
    AND (get_user_role() = 'admin' OR user_has_access_to_store(ap.store_id))
  )
);

-- Fix financial_transactions policies
DROP POLICY IF EXISTS "Users can delete transactions for their store" ON financial_transactions;
DROP POLICY IF EXISTS "Users can create transactions for their store" ON financial_transactions;
DROP POLICY IF EXISTS "Users can view transactions for their store" ON financial_transactions;

CREATE POLICY "Users can view transactions for accessible stores"
ON financial_transactions
FOR SELECT
USING (
  user_has_permission('financeiro', 'read') 
  AND (get_user_role() = 'admin' OR user_has_access_to_store(store_id))
);

CREATE POLICY "Users can insert transactions for accessible stores"
ON financial_transactions
FOR INSERT
WITH CHECK (
  user_has_permission('financeiro', 'write') 
  AND (get_user_role() = 'admin' OR user_has_access_to_store(store_id))
  AND created_by = auth.uid()
);

CREATE POLICY "Users can update transactions for accessible stores"
ON financial_transactions
FOR UPDATE
USING (
  user_has_permission('financeiro', 'write') 
  AND (get_user_role() = 'admin' OR user_has_access_to_store(store_id))
);

CREATE POLICY "Users can delete transactions for accessible stores"
ON financial_transactions
FOR DELETE
USING (
  user_has_permission('financeiro', 'write') 
  AND (get_user_role() = 'admin' OR user_has_access_to_store(store_id))
);