-- Drop existing policies for accounts_payable_items
DROP POLICY IF EXISTS "Users can manage payable items for their store" ON accounts_payable_items;
DROP POLICY IF EXISTS "Users can view payable items for their store" ON accounts_payable_items;

-- Create new policies that properly check user access to stores
CREATE POLICY "Users can view payable items for accessible stores"
ON accounts_payable_items
FOR SELECT
USING (
  user_has_permission('contas_pagar', 'read') 
  AND (
    get_user_role() = 'admin' 
    OR user_has_access_to_store(store_id)
  )
);

CREATE POLICY "Users can insert payable items for accessible stores"
ON accounts_payable_items
FOR INSERT
WITH CHECK (
  user_has_permission('contas_pagar', 'write') 
  AND (
    get_user_role() = 'admin' 
    OR user_has_access_to_store(store_id)
  )
);

CREATE POLICY "Users can update payable items for accessible stores"
ON accounts_payable_items
FOR UPDATE
USING (
  user_has_permission('contas_pagar', 'write') 
  AND (
    get_user_role() = 'admin' 
    OR user_has_access_to_store(store_id)
  )
);

CREATE POLICY "Users can delete payable items for accessible stores"
ON accounts_payable_items
FOR DELETE
USING (
  user_has_permission('contas_pagar', 'write') 
  AND (
    get_user_role() = 'admin' 
    OR user_has_access_to_store(store_id)
  )
);