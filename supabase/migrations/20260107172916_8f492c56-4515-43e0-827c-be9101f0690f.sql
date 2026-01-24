
-- Criar função auxiliar que verifica se usuário tem acesso a alguma loja de uma conta
CREATE OR REPLACE FUNCTION public.user_has_access_to_account_stores(p_account_id uuid, p_junction_table text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Admin has access to all
  IF get_user_role() = 'admin' THEN
    RETURN TRUE;
  END IF;
  
  -- Check if user has access to any store linked to this account
  IF p_junction_table = 'cash_account_stores' THEN
    RETURN EXISTS (
      SELECT 1 FROM cash_account_stores cas
      JOIN user_stores us ON cas.store_id = us.store_id
      WHERE cas.account_id = p_account_id AND us.user_id = auth.uid()
    );
  ELSIF p_junction_table = 'current_account_stores' THEN
    RETURN EXISTS (
      SELECT 1 FROM current_account_stores cas
      JOIN user_stores us ON cas.store_id = us.store_id
      WHERE cas.account_id = p_account_id AND us.user_id = auth.uid()
    );
  ELSIF p_junction_table = 'card_account_stores' THEN
    RETURN EXISTS (
      SELECT 1 FROM card_account_stores cas
      JOIN user_stores us ON cas.store_id = us.store_id
      WHERE cas.account_id = p_account_id AND us.user_id = auth.uid()
    );
  END IF;
  
  RETURN FALSE;
END;
$$;

-- Drop existing SELECT policies
DROP POLICY IF EXISTS "Users can view cash accounts for their store" ON cash_accounts;
DROP POLICY IF EXISTS "Users can view current accounts for their store" ON current_accounts;
DROP POLICY IF EXISTS "Users can view card accounts for their store" ON card_accounts;

-- Create new SELECT policies that check ALL user stores
CREATE POLICY "Users can view cash accounts for their stores"
ON cash_accounts FOR SELECT
USING (
  user_has_permission('financeiro', 'read') AND (
    get_user_role() = 'admin' OR
    EXISTS (
      SELECT 1 FROM cash_account_stores cas
      JOIN user_stores us ON cas.store_id = us.store_id
      WHERE cas.account_id = cash_accounts.id AND us.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can view current accounts for their stores"
ON current_accounts FOR SELECT
USING (
  user_has_permission('financeiro', 'read') AND (
    get_user_role() = 'admin' OR
    EXISTS (
      SELECT 1 FROM current_account_stores cas
      JOIN user_stores us ON cas.store_id = us.store_id
      WHERE cas.account_id = current_accounts.id AND us.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can view card accounts for their stores"
ON card_accounts FOR SELECT
USING (
  user_has_permission('financeiro', 'read') AND (
    get_user_role() = 'admin' OR
    EXISTS (
      SELECT 1 FROM card_account_stores cas
      JOIN user_stores us ON cas.store_id = us.store_id
      WHERE cas.account_id = card_accounts.id AND us.user_id = auth.uid()
    )
  )
);
