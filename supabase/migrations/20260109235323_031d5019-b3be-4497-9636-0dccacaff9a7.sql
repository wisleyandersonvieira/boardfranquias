-- Remover políticas existentes
DROP POLICY IF EXISTS "Users can view job function obligations for their store" ON public.job_function_obligations;
DROP POLICY IF EXISTS "Users can manage job function obligations for their store" ON public.job_function_obligations;

-- Criar política para SELECT
CREATE POLICY "Users can view job function obligations"
ON public.job_function_obligations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM job_functions jf
    WHERE jf.id = job_function_obligations.job_function_id
    AND (
      public.get_user_role() = 'admin'
      OR jf.store_id = public.get_user_store_id()
      OR public.user_has_access_to_store(jf.store_id)
    )
  )
);

-- Criar política para INSERT
CREATE POLICY "Users can insert job function obligations"
ON public.job_function_obligations
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM job_functions jf
    WHERE jf.id = job_function_obligations.job_function_id
    AND (
      public.get_user_role() = 'admin'
      OR jf.store_id = public.get_user_store_id()
      OR public.user_has_access_to_store(jf.store_id)
    )
  )
);

-- Criar política para UPDATE
CREATE POLICY "Users can update job function obligations"
ON public.job_function_obligations
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM job_functions jf
    WHERE jf.id = job_function_obligations.job_function_id
    AND (
      public.get_user_role() = 'admin'
      OR jf.store_id = public.get_user_store_id()
      OR public.user_has_access_to_store(jf.store_id)
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM job_functions jf
    WHERE jf.id = job_function_obligations.job_function_id
    AND (
      public.get_user_role() = 'admin'
      OR jf.store_id = public.get_user_store_id()
      OR public.user_has_access_to_store(jf.store_id)
    )
  )
);

-- Criar política para DELETE
CREATE POLICY "Users can delete job function obligations"
ON public.job_function_obligations
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM job_functions jf
    WHERE jf.id = job_function_obligations.job_function_id
    AND (
      public.get_user_role() = 'admin'
      OR jf.store_id = public.get_user_store_id()
      OR public.user_has_access_to_store(jf.store_id)
    )
  )
);