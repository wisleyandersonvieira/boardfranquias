-- Atualizar políticas de cash_control_expenses para usar user_has_access_to_store
DROP POLICY IF EXISTS "Users can view expenses for their store" ON public.cash_control_expenses;
CREATE POLICY "Users can view expenses for their store" ON public.cash_control_expenses
FOR SELECT USING (
  user_has_permission('caixa'::text, 'read'::permission_type) 
  AND user_has_access_to_store(store_id)
);

DROP POLICY IF EXISTS "Users can manage expenses for their store" ON public.cash_control_expenses;
CREATE POLICY "Users can manage expenses for their store" ON public.cash_control_expenses
FOR ALL USING (
  user_has_permission('caixa'::text, 'write'::permission_type) 
  AND user_has_access_to_store(store_id)
);