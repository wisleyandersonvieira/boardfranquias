-- Criar função para verificar se usuário tem acesso a uma loja específica
CREATE OR REPLACE FUNCTION public.user_has_access_to_store(p_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_stores
    WHERE user_id = auth.uid()
    AND store_id = p_store_id
  );
$$;

-- Atualizar políticas de accounts_payable
DROP POLICY IF EXISTS "Users can view accounts payable for their store" ON public.accounts_payable;
CREATE POLICY "Users can view accounts payable for their store" ON public.accounts_payable
FOR SELECT USING (
  user_has_permission('contas_pagar'::text, 'read'::permission_type) 
  AND user_has_access_to_store(store_id)
);

DROP POLICY IF EXISTS "Users can manage accounts payable for their store" ON public.accounts_payable;
CREATE POLICY "Users can manage accounts payable for their store" ON public.accounts_payable
FOR ALL USING (
  user_has_permission('contas_pagar'::text, 'write'::permission_type) 
  AND user_has_access_to_store(store_id)
);

-- Atualizar políticas de cash_control
DROP POLICY IF EXISTS "Users can view cash control for their store" ON public.cash_control;
CREATE POLICY "Users can view cash control for their store" ON public.cash_control
FOR SELECT USING (
  user_has_permission('caixa'::text, 'read'::permission_type) 
  AND user_has_access_to_store(store_id)
);

DROP POLICY IF EXISTS "Users can manage cash control for their store" ON public.cash_control;
CREATE POLICY "Users can manage cash control for their store" ON public.cash_control
FOR ALL USING (
  user_has_permission('caixa'::text, 'write'::permission_type) 
  AND user_has_access_to_store(store_id)
);

-- Atualizar políticas de employees
DROP POLICY IF EXISTS "Users can view employees for their store" ON public.employees;
CREATE POLICY "Users can view employees for their store" ON public.employees
FOR SELECT USING (
  user_has_access_to_store(store_id)
);

DROP POLICY IF EXISTS "Users can manage employees for their store" ON public.employees;
CREATE POLICY "Users can manage employees for their store" ON public.employees
FOR ALL USING (
  user_has_access_to_store(store_id)
);