-- Remover a política problemática
DROP POLICY IF EXISTS "Users can manage job functions for their store" ON public.job_functions;

-- Criar política corrigida para INSERT
CREATE POLICY "Users can insert job functions for their store"
ON public.job_functions
FOR INSERT
TO authenticated
WITH CHECK (
  public.get_user_role() = 'admin' 
  OR store_id = public.get_user_store_id()
  OR public.user_has_access_to_store(store_id)
);

-- Criar política corrigida para UPDATE
CREATE POLICY "Users can update job functions for their store"
ON public.job_functions
FOR UPDATE
TO authenticated
USING (
  public.get_user_role() = 'admin' 
  OR store_id = public.get_user_store_id()
  OR public.user_has_access_to_store(store_id)
)
WITH CHECK (
  public.get_user_role() = 'admin' 
  OR store_id = public.get_user_store_id()
  OR public.user_has_access_to_store(store_id)
);

-- Criar política corrigida para DELETE
CREATE POLICY "Users can delete job functions for their store"
ON public.job_functions
FOR DELETE
TO authenticated
USING (
  public.get_user_role() = 'admin' 
  OR store_id = public.get_user_store_id()
  OR public.user_has_access_to_store(store_id)
);