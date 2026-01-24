-- Corrigir políticas de employee_obligation_completions
DROP POLICY IF EXISTS "Users can manage obligation completions for their store" ON public.employee_obligation_completions;
DROP POLICY IF EXISTS "Users can view obligation completions for their store" ON public.employee_obligation_completions;

-- Criar política para SELECT
CREATE POLICY "Users can view obligation completions"
ON public.employee_obligation_completions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = employee_obligation_completions.employee_id
    AND (
      public.get_user_role() = 'admin'
      OR e.store_id = public.get_user_store_id()
      OR public.user_has_access_to_store(e.store_id)
    )
  )
);

-- Criar política para INSERT
CREATE POLICY "Users can insert obligation completions"
ON public.employee_obligation_completions
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = employee_obligation_completions.employee_id
    AND (
      public.get_user_role() = 'admin'
      OR e.store_id = public.get_user_store_id()
      OR public.user_has_access_to_store(e.store_id)
    )
  )
);

-- Criar política para UPDATE
CREATE POLICY "Users can update obligation completions"
ON public.employee_obligation_completions
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = employee_obligation_completions.employee_id
    AND (
      public.get_user_role() = 'admin'
      OR e.store_id = public.get_user_store_id()
      OR public.user_has_access_to_store(e.store_id)
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = employee_obligation_completions.employee_id
    AND (
      public.get_user_role() = 'admin'
      OR e.store_id = public.get_user_store_id()
      OR public.user_has_access_to_store(e.store_id)
    )
  )
);

-- Criar política para DELETE
CREATE POLICY "Users can delete obligation completions"
ON public.employee_obligation_completions
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = employee_obligation_completions.employee_id
    AND (
      public.get_user_role() = 'admin'
      OR e.store_id = public.get_user_store_id()
      OR public.user_has_access_to_store(e.store_id)
    )
  )
);