-- Fix accounts_receivable RLS policies to use user_has_access_to_store
DROP POLICY IF EXISTS "Users can view accounts receivable for their store" ON public.accounts_receivable;
DROP POLICY IF EXISTS "Users can manage accounts receivable for their store" ON public.accounts_receivable;

CREATE POLICY "Users can view accounts receivable for their store" ON public.accounts_receivable
FOR SELECT USING (
  user_has_permission('contas_receber', 'read') AND 
  user_has_access_to_store(store_id)
);

CREATE POLICY "Users can manage accounts receivable for their store" ON public.accounts_receivable
FOR ALL USING (
  user_has_permission('contas_receber', 'write') AND 
  user_has_access_to_store(store_id)
);

-- Fix accounts_receivable_installments RLS policies
DROP POLICY IF EXISTS "Users can view installments for their store" ON public.accounts_receivable_installments;
DROP POLICY IF EXISTS "Users can manage installments for their store" ON public.accounts_receivable_installments;

CREATE POLICY "Users can view installments for their store" ON public.accounts_receivable_installments
FOR SELECT USING (
  user_has_permission('contas_receber', 'read') AND 
  EXISTS (
    SELECT 1 FROM accounts_receivable ar
    WHERE ar.id = accounts_receivable_installments.account_receivable_id
    AND user_has_access_to_store(ar.store_id)
  )
);

CREATE POLICY "Users can manage installments for their store" ON public.accounts_receivable_installments
FOR ALL USING (
  user_has_permission('contas_receber', 'write') AND 
  EXISTS (
    SELECT 1 FROM accounts_receivable ar
    WHERE ar.id = accounts_receivable_installments.account_receivable_id
    AND user_has_access_to_store(ar.store_id)
  )
);

-- Fix accounts_receivable_payments RLS policies
DROP POLICY IF EXISTS "Users can view receivable payments for their store" ON public.accounts_receivable_payments;
DROP POLICY IF EXISTS "Users can manage receivable payments for their store" ON public.accounts_receivable_payments;

CREATE POLICY "Users can view receivable payments for their store" ON public.accounts_receivable_payments
FOR SELECT USING (
  user_has_permission('contas_receber', 'read') AND 
  EXISTS (
    SELECT 1 FROM accounts_receivable ar
    WHERE ar.id = accounts_receivable_payments.account_receivable_id
    AND user_has_access_to_store(ar.store_id)
  )
);

CREATE POLICY "Users can manage receivable payments for their store" ON public.accounts_receivable_payments
FOR ALL USING (
  user_has_permission('contas_receber', 'write') AND 
  EXISTS (
    SELECT 1 FROM accounts_receivable ar
    WHERE ar.id = accounts_receivable_payments.account_receivable_id
    AND user_has_access_to_store(ar.store_id)
  )
);

-- Fix accounts_receivable_items RLS policies
DROP POLICY IF EXISTS "Users can view receivable items for their store" ON public.accounts_receivable_items;
DROP POLICY IF EXISTS "Users can manage receivable items for their store" ON public.accounts_receivable_items;

CREATE POLICY "Users can view receivable items for their store" ON public.accounts_receivable_items
FOR SELECT USING (
  user_has_permission('contas_receber', 'read') AND 
  user_has_access_to_store(store_id)
);

CREATE POLICY "Users can manage receivable items for their store" ON public.accounts_receivable_items
FOR ALL USING (
  user_has_permission('contas_receber', 'write') AND 
  user_has_access_to_store(store_id)
);